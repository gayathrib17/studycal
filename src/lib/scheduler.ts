import type { DayLoad, Session, Settings, Task } from '../types';
import { taskProgress } from './progress';
import { MINUTE_MS, addDays, atMinuteOfDay, dayKey, parseHHMM, roundUpToStep, startOfDay } from './time';

export interface Interval {
  start: number;
  end: number;
}

export type PlanSettings = Pick<
  Settings,
  | 'dayStart'
  | 'dayEnd'
  | 'gapMinutes'
  | 'maxStudyMinutesPerDay'
  | 'maxSessionsPerTaskPerDay'
  | 'planHorizonDays'
  | 'dayLoad'
  | 'lunchEnabled'
  | 'lunchStart'
  | 'lunchEnd'
  | 'dinnerEnabled'
  | 'dinnerStart'
  | 'dinnerEnd'
  | 'spreadEvenly'
>;

export interface PlanInput {
  /** Tasks in priority order (index 0 = most important). Done tasks are ignored. */
  tasks: Task[];
  /** Study sessions already on the calendar; they count as busy and as progress. */
  sessions: Session[];
  /** Other timed busy blocks: imported timetable, the user's own events (all-day events excluded). */
  busy: Interval[];
  settings: PlanSettings;
  /** Nothing is scheduled before this moment. */
  from: Date;
  newId: () => string;
}

export interface PlanResult {
  sessions: Session[];
  /** Tasks that could not be fully placed within the horizon (or before their due date). */
  unplaced: { taskId: string; minutes: number }[];
}

/** Subtract busy intervals from a single window. Busy list need not be sorted. */
export function subtractIntervals(window: Interval, busy: Interval[]): Interval[] {
  const sorted = busy
    .filter((b) => b.end > window.start && b.start < window.end)
    .sort((a, b) => a.start - b.start);
  const free: Interval[] = [];
  let cursor = window.start;
  for (const b of sorted) {
    if (b.start > cursor) free.push({ start: cursor, end: Math.min(b.start, window.end) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) free.push({ start: cursor, end: window.end });
  return free;
}

/** Study minutes allowed on a day with the given load. */
export function dayCapacity(load: DayLoad | undefined, normalCap: number): number {
  if (load === 'off') return 0;
  if (load === 'light') return Math.floor(normalCap / 2);
  return normalCap;
}

interface Need {
  task: Task;
  minutes: number;
  count: number;
  /** Epoch ms of the start of the due date; sessions must end by then (Infinity = no due date). */
  deadline: number;
  /** 0 = top of the list. */
  rank: number;
  /** Priority weight 0–1 (1 = top task). 0 when there's only one task, since there's nothing to weigh against. */
  weight: number;
}

interface Day {
  date: Date;
  key: string;
  windowStart: number;
  windowEnd: number;
  cap: number;
  meals: Interval[];
}

/** How much sooner the top-priority task aims to finish than a bottom-priority one (0.35 = about a third). */
const PRIORITY_PULL = 0.35;
/** A task due within this many study days gets a boost so it claims the day first. */
const URGENT_DAYS = 2;
/** Planned sessions start on the quarter hour (9:00, 10:15…) so they're easy to read and move. */
const ALIGN_MINUTES = 15;
const alignUp = (ms: number) => roundUpToStep(new Date(ms), ALIGN_MINUTES).getTime();

/**
 * Deterministic planner. Free time = each day's study window (dayStart–dayEnd) minus busy blocks,
 * existing sessions and meal breaks, all padded by gapMinutes.
 *
 * Pass 1 — a balanced daily plan. Each morning, every task gets a quota for the day:
 *   sessions still needed ÷ study days it has left (before its due date, or before the end of the
 *   horizon). Tasks due soon therefore get bigger quotas automatically. Priority shortens the number of
 *   days a task aims to use (the top task aims to finish ~35% sooner), so it gets *more* time early on
 *   without taking over whole days. Without spreadEvenly every task aims to finish in the first half
 *   of its time. Within the day, each free slot goes to the task with the most of its quota left, plus
 *   a boost if it's due within two study days and a small priority bonus, minus a penalty if it was the
 *   previous block — so subjects alternate (A, B, A, B) instead of repeating.
 *
 * Pass 2 — leftovers. Anything the quotas didn't place (e.g. because of daily caps) is placed in the
 *   earliest free time, earliest due date first, still avoiding back-to-back repeats where possible.
 *
 * Pass 3 — deadlines win. If a task with a due date still isn't fully placed, the per-task daily
 *   limit is lifted for it (study-day caps, meals and the day window still apply).
 *
 * Sessions start on quarter hours. Whatever still doesn't fit is returned in `unplaced`.
 */
export function planSchedule(input: PlanInput): PlanResult {
  const { tasks, sessions, busy, settings, from, newId } = input;
  const gap = settings.gapMinutes * MINUTE_MS;
  const dayStartMin = parseHHMM(settings.dayStart);
  const dayEndMin = parseHHMM(settings.dayEnd);
  if (!Number.isFinite(dayStartMin) || !Number.isFinite(dayEndMin) || dayEndMin <= dayStartMin) {
    throw new Error('Study day start must be before study day end.');
  }
  const mealWindows: [number, number][] = [];
  for (const [on, s, e] of [
    [settings.lunchEnabled, settings.lunchStart, settings.lunchEnd],
    [settings.dinnerEnabled, settings.dinnerStart, settings.dinnerEnd],
  ] as const) {
    const sm = parseHHMM(s);
    const em = parseHHMM(e);
    if (on && Number.isFinite(sm) && Number.isFinite(em) && em > sm) mealWindows.push([sm, em]);
  }

  const need: Need[] = tasks
    .filter((t) => !t.done)
    .map((t) => {
      const p = taskProgress(t, sessions);
      const deadline = t.dueDate ? parseLocalDate(t.dueDate) : Infinity;
      return { task: t, minutes: p.remainingMinutes, count: p.remainingSessions, deadline, rank: 0, weight: 0 };
    })
    .filter((n) => !isComplete(n));
  need.forEach((n, i) => {
    n.rank = i;
    n.weight = need.length > 1 ? 1 - i / (need.length - 1) : 0;
  });

  const existing: Interval[] = sessions.map((s) => ({ start: Date.parse(s.start), end: Date.parse(s.end) }));
  const blocked: Interval[] = [...busy, ...existing].map((b) => ({ start: b.start - gap, end: b.end + gap }));

  // Study minutes and sessions-per-task already booked per day.
  const studied = new Map<string, number>();
  const perTask = new Map<string, number>(); // key: day|taskId
  for (const s of sessions) {
    const key = dayKey(new Date(s.start));
    studied.set(key, (studied.get(key) ?? 0) + (Date.parse(s.end) - Date.parse(s.start)) / MINUTE_MS);
    perTask.set(`${key}|${s.taskId}`, (perTask.get(`${key}|${s.taskId}`) ?? 0) + 1);
  }
  const countToday = (day: Day, n: Need) => perTask.get(`${day.key}|${n.task.id}`) ?? 0;

  const days: Day[] = [];
  for (let d = 0; d < settings.planHorizonDays; d++) {
    const date = addDays(startOfDay(from), d);
    const windowStart = Math.max(atMinuteOfDay(date, dayStartMin).getTime(), from.getTime());
    const windowEnd = atMinuteOfDay(date, dayEndMin).getTime();
    if (windowEnd <= windowStart) continue;
    days.push({
      date,
      key: dayKey(date),
      windowStart,
      windowEnd,
      cap: dayCapacity(settings.dayLoad?.[date.getDay()], settings.maxStudyMinutesPerDay),
      meals: mealWindows.map(([s, e]) => ({
        start: atMinuteOfDay(date, s).getTime() - gap,
        end: atMinuteOfDay(date, e).getTime() + gap,
      })),
    });
  }

  const planned: Session[] = [];
  /** Task of the most recent block placed on each day, to avoid back-to-back repeats. */
  const lastOnDay = new Map<string, string>();

  /**
   * Walk one day's free time. At each free moment, collect the tasks that fit (slot length, due date,
   * day cap, per-task limit unless lifted, and the pass's own rule) and let `choose` pick one.
   */
  const fillDay = (
    day: Day,
    allowed: (n: Need) => boolean,
    choose: (candidates: Need[], previous: string | undefined) => Need | undefined,
    liftTaskLimit: (n: Need) => boolean = () => false,
  ) => {
    if (day.cap <= 0) return;
    for (const free of subtractIntervals({ start: day.windowStart, end: day.windowEnd }, [...blocked, ...day.meals])) {
      let cursor = alignUp(free.start);
      for (;;) {
        if (need.length === 0) return;
        const done = studied.get(day.key) ?? 0;
        const candidates = need.filter((n) => {
          const len = sessionLength(n);
          const end = cursor + len * MINUTE_MS;
          return (
            len > 0 &&
            end <= free.end &&
            end <= n.deadline &&
            done + len <= day.cap &&
            (liftTaskLimit(n) || countToday(day, n) < settings.maxSessionsPerTaskPerDay) &&
            allowed(n)
          );
        });
        const pick = choose(candidates, lastOnDay.get(day.key));
        // Nothing fits at the start of this gap, so nothing fits later in it either.
        if (!pick) break;

        const len = sessionLength(pick);
        const end = cursor + len * MINUTE_MS;
        planned.push({
          id: newId(),
          taskId: pick.task.id,
          start: new Date(cursor).toISOString(),
          end: new Date(end).toISOString(),
          done: false,
          source: 'auto',
        });
        blocked.push({ start: cursor - gap, end: end + gap });
        pick.minutes -= len;
        pick.count -= 1;
        perTask.set(`${day.key}|${pick.task.id}`, countToday(day, pick) + 1);
        studied.set(day.key, done + len);
        lastOnDay.set(day.key, pick.task.id);
        if (isComplete(pick)) need.splice(need.indexOf(pick), 1);
        cursor = alignUp(end + gap);
      }
    }
  };

  // Pass 1: daily quotas, mixed through the day.
  days.forEach((day, i) => {
    if (day.cap <= 0 || need.length === 0) return;
    const quota = new Map<Need, { target: number; urgent: boolean; startCount: number }>();
    for (const n of need) {
      const daysLeft = days.slice(i).filter((d) => d.cap > 0 && d.date.getTime() < n.deadline).length;
      if (daysLeft === 0) continue;
      const base = settings.spreadEvenly ? daysLeft : Math.ceil(daysLeft / 2);
      const aimDays = Math.max(1, Math.ceil(base * (1 - PRIORITY_PULL * n.weight)));
      quota.set(n, {
        target: Math.ceil(sessionsLeft(n) / aimDays),
        urgent: n.deadline !== Infinity && daysLeft <= URGENT_DAYS,
        startCount: countToday(day, n),
      });
    }
    const placedToday = (n: Need) => countToday(day, n) - (quota.get(n)?.startCount ?? 0);
    const score = (n: Need, previous: string | undefined) => {
      const q = quota.get(n)!;
      return (
        (q.target - placedToday(n)) / q.target + // share of today's quota still to do
        (q.urgent ? 0.5 : 0) +
        0.25 * n.weight -
        (n.task.id === previous ? 1 : 0) // variety: avoid the same task back to back
      );
    };
    fillDay(
      day,
      (n) => quota.has(n) && placedToday(n) < quota.get(n)!.target,
      (candidates, previous) =>
        candidates.reduce<Need | undefined>((best, n) => {
          if (!best) return n;
          const diff = score(n, previous) - score(best, previous);
          return diff > 1e-9 || (Math.abs(diff) <= 1e-9 && n.rank < best.rank) ? n : best;
        }, undefined),
    );
  });

  // Pass 2 and 3: earliest due date first, then priority; prefer not to repeat the previous block.
  const byDeadline = (candidates: Need[], previous: string | undefined) => {
    const sorted = [...candidates].sort((a, b) => a.deadline - b.deadline || a.rank - b.rank);
    return sorted.find((n) => n.task.id !== previous) ?? sorted[0];
  };
  for (const day of days) fillDay(day, () => true, byDeadline);
  for (const day of days) {
    const hasDeadline = (n: Need) => n.deadline !== Infinity;
    fillDay(day, hasDeadline, byDeadline, hasDeadline);
  }

  planned.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return {
    sessions: planned,
    unplaced: need.map((n) => ({ taskId: n.task.id, minutes: Math.max(0, remainingMinutes(n)) })),
  };
}

function sessionsLeft(n: Need): number {
  return n.task.planMode === 'sessions' ? n.count : Math.ceil(n.minutes / n.task.sessionMinutes);
}

function isComplete(n: Need): boolean {
  return n.task.planMode === 'sessions' ? n.count <= 0 : n.minutes <= 0;
}

function remainingMinutes(n: Need): number {
  return n.task.planMode === 'sessions' ? n.count * n.task.sessionMinutes : n.minutes;
}

function sessionLength(n: Need): number {
  if (n.task.planMode === 'sessions') return n.task.sessionMinutes;
  return Math.min(n.task.sessionMinutes, n.minutes);
}

/** "2026-01-09" -> local midnight at the start of that day. */
export function parseLocalDate(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return Infinity;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}
