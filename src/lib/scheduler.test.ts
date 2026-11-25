import { describe, expect, it } from 'vitest';
import { planSchedule, subtractIntervals, type PlanInput } from './scheduler';
import type { DayLoad, Session, Task } from '../types';

// 5 Jan 2026 is a Monday. All dates are local time, so tests pass in any time zone.
const at = (day: number, h: number, m = 0) => new Date(2026, 0, day, h, m);
const ms = (d: Date) => d.getTime();
const MIN = 60_000;

const settings: PlanInput['settings'] = {
  dayStart: '09:00',
  dayEnd: '12:00',
  gapMinutes: 10,
  maxStudyMinutesPerDay: 300,
  maxSessionsPerTaskPerDay: 2,
  planHorizonDays: 7,
  dayLoad: ['normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal'] as DayLoad[],
  lunchEnabled: false,
  lunchStart: '12:30',
  lunchEnd: '13:30',
  dinnerEnabled: false,
  dinnerStart: '18:30',
  dinnerEnd: '19:30',
  spreadEvenly: false,
};
let n = 0;
const newId = () => `p${n++}`;

const sessionsTask = (id: string, count: number, minutes = 50, extra: Partial<Task> = {}): Task => ({
  id, title: id, color: '#000', planMode: 'sessions', sessionCount: count, sessionMinutes: minutes, targetMinutes: count * minutes, done: false, ...extra,
});
const hoursTask = (id: string, totalMinutes: number, sessionMinutes = 50, extra: Partial<Task> = {}): Task => ({
  id, title: id, color: '#000', planMode: 'hours', sessionMinutes, targetMinutes: totalMinutes, done: false, ...extra,
});

const plan = (tasks: Task[], s: Partial<PlanInput['settings']> = {}, extra: Partial<PlanInput> = {}) =>
  planSchedule({ tasks, sessions: [], busy: [], settings: { ...settings, ...s }, from: at(5, 8), newId, ...extra });

const date = (x: Session) => new Date(x.start).getDate();
const hhmm = (iso: string) => new Date(iso).toTimeString().slice(0, 5);
const minutesOf = (list: Session[], taskId?: string) =>
  list.filter((x) => !taskId || x.taskId === taskId).reduce((sum, x) => sum + (Date.parse(x.end) - Date.parse(x.start)) / MIN, 0);
const byDay = (list: Session[]) => {
  const out: Record<number, string[]> = {};
  for (const x of list) (out[date(x)] ??= []).push(x.taskId);
  return out;
};
const overlaps = (a: number, b: number, c: number, d: number) => a < d && c < b;

describe('subtractIntervals', () => {
  it('returns gaps between busy blocks, clipped to the window', () => {
    expect(subtractIntervals({ start: 0, end: 100 }, [{ start: 50, end: 60 }, { start: -10, end: 10 }, { start: 90, end: 200 }])).toEqual([
      { start: 10, end: 50 },
      { start: 60, end: 90 },
    ]);
  });
  it('handles overlapping busy blocks', () => {
    expect(subtractIntervals({ start: 0, end: 100 }, [{ start: 20, end: 50 }, { start: 30, end: 40 }])).toEqual([
      { start: 0, end: 20 },
      { start: 50, end: 100 },
    ]);
  });
});

describe('planSchedule: variety and priority', () => {
  it('mixes two tasks due at the same time through each day instead of doing one first', () => {
    // Both due Wednesday 7th → only Mon 5th and Tue 6th are available.
    const due = { dueDate: '2026-01-07' };
    const s = { dayEnd: '17:00', maxSessionsPerTaskPerDay: 4 };
    const even = plan([sessionsTask('A', 4, 50, due), sessionsTask('B', 4, 50, due)], { ...s, spreadEvenly: true });
    expect(byDay(even.sessions)[5]).toEqual(['A', 'B', 'A', 'B']);
    expect(byDay(even.sessions)[6]).toEqual(['A', 'B', 'A', 'B']);
    expect(even.unplaced).toEqual([]);
    // "Get ahead" fills Monday up to the 5 h cap, still alternating.
    const ahead = plan([sessionsTask('A', 4, 50, due), sessionsTask('B', 4, 50, due)], { ...s, spreadEvenly: false });
    expect(byDay(ahead.sessions)[5]).toEqual(['A', 'B', 'A', 'B', 'A', 'B']);
    expect(ahead.unplaced).toEqual([]);
  });

  it('never puts the same task back to back when another task could go there', () => {
    const result = plan([hoursTask('A', 600), hoursTask('B', 300), hoursTask('C', 150)], { dayEnd: '18:00', maxSessionsPerTaskPerDay: 5, spreadEvenly: true });
    for (const tasks of Object.values(byDay(result.sessions))) {
      for (let i = 1; i < tasks.length; i++) {
        if (tasks[i] === tasks[i - 1]) {
          // Allowed only when that task is the only one left with time to place that day.
          expect(new Set(tasks.slice(i)).size).toBe(1);
        }
      }
    }
  });

  it('gives the top task more time early on, so it finishes sooner, without starving the others', () => {
    const result = plan([sessionsTask('Top', 6), sessionsTask('Bottom', 6)], { spreadEvenly: true });
    const last = (id: string) => Math.max(...result.sessions.filter((x) => x.taskId === id).map((x) => Date.parse(x.start)));
    expect(last('Top')).toBeLessThan(last('Bottom'));
    expect(result.sessions.filter((x) => date(x) === 5).map((x) => x.taskId)).toContain('Bottom'); // not starved on day 1
    expect(result.unplaced).toEqual([]);
  });
});

describe('planSchedule: deadlines', () => {
  it('meets every due date when there is room, giving urgent tasks the early days', () => {
    const result = plan(
      [hoursTask('Later', 300, 50, { dueDate: '2026-01-12' }), hoursTask('Soon', 200, 50, { dueDate: '2026-01-07' })],
      { dayEnd: '17:00', maxSessionsPerTaskPerDay: 4 },
    );
    expect(result.unplaced).toEqual([]);
    for (const x of result.sessions) {
      const due = x.taskId === 'Soon' ? at(7, 0) : at(12, 0);
      expect(Date.parse(x.end)).toBeLessThanOrEqual(ms(due));
    }
    expect(minutesOf(result.sessions, 'Soon')).toBe(200);
  });

  it('lifts the per-task daily limit when a deadline needs it', () => {
    // 6 sessions due Wed; Mon + Tue with a limit of 2/day would only fit 4.
    const result = plan([sessionsTask('A', 6, 50, { dueDate: '2026-01-07' })]);
    expect(result.sessions).toHaveLength(6);
    expect(result.sessions.every((x) => Date.parse(x.end) <= ms(at(7, 0)))).toBe(true);
    expect(result.unplaced).toEqual([]);
  });

  it('reports what genuinely cannot fit before the due date', () => {
    // 09:00–12:00 holds 3 × 50 min (with 10 min gaps, on quarter hours) → 6 over two days.
    const result = plan([sessionsTask('A', 10, 50, { dueDate: '2026-01-07' })]);
    expect(result.sessions).toHaveLength(6);
    expect(result.unplaced).toEqual([{ taskId: 'A', minutes: 200 }]);
  });
});

describe('planSchedule: calm days', () => {
  it('respects busy blocks, gaps, the study window and other sessions, starting on quarter hours', () => {
    const existing: Session = { id: 'e', taskId: 'A', start: at(5, 9).toISOString(), end: at(5, 9, 50).toISOString(), done: false, source: 'manual' };
    const busy = [{ start: ms(at(5, 10)), end: ms(at(5, 10, 30)) }];
    const result = plan([sessionsTask('A', 4), hoursTask('B', 200)], { spreadEvenly: true }, { busy, sessions: [existing] });
    const gap = settings.gapMinutes * MIN;
    const all = [...result.sessions, existing].map((x) => [Date.parse(x.start), Date.parse(x.end)] as const);
    for (const x of result.sessions) {
      const [s, e] = [Date.parse(x.start), Date.parse(x.end)];
      expect(new Date(s).getMinutes() % 15).toBe(0);
      expect(new Date(s).getHours()).toBeGreaterThanOrEqual(9);
      expect(e).toBeLessThanOrEqual(ms(new Date(new Date(s).setHours(12, 0, 0, 0))));
      expect(overlaps(s, e, busy[0].start - gap, busy[0].end + gap)).toBe(false);
    }
    expect(all.some(([a, b], i) => all.some(([c, d], j) => i !== j && overlaps(a - gap, b + gap, c, d)))).toBe(false);
    expect(result.sessions.filter((x) => x.taskId === 'A')).toHaveLength(3); // 4 wanted, 1 already booked
  });

  it('keeps lunch free', () => {
    const result = plan([hoursTask('B', 100)], { dayStart: '11:00', dayEnd: '15:00', gapMinutes: 0, lunchEnabled: true, maxSessionsPerTaskPerDay: 5, planHorizonDays: 1 });
    // 11:50–12:40 would run into lunch (12:30–13:30), so the second session waits until after lunch.
    expect(result.sessions.map((x) => [hhmm(x.start), hhmm(x.end)])).toEqual([
      ['11:00', '11:50'],
      ['13:30', '14:20'],
    ]);
  });

  it('skips Off days and halves Light days', () => {
    const dayLoad = [...settings.dayLoad];
    dayLoad[1] = 'off'; // Monday
    dayLoad[2] = 'light'; // Tuesday: 150 min
    const result = plan([hoursTask('B', 600)], { dayLoad, gapMinutes: 0, maxSessionsPerTaskPerDay: 9, dayEnd: '18:00', planHorizonDays: 2 });
    expect(result.sessions.filter((x) => date(x) === 5)).toHaveLength(0);
    expect(minutesOf(result.sessions.filter((x) => date(x) === 6))).toBe(150);
  });

  it('respects the daily study cap', () => {
    const result = plan([hoursTask('B', 120)], { maxStudyMinutesPerDay: 60, maxSessionsPerTaskPerDay: 5 });
    for (const d of [5, 6, 7, 8, 9, 10, 11]) expect(minutesOf(result.sessions.filter((x) => date(x) === d))).toBeLessThanOrEqual(60);
    expect(minutesOf(result.sessions)).toBe(120);
  });

  it('spreads work evenly when asked, and front-loads when not', () => {
    const s = { gapMinutes: 0, maxSessionsPerTaskPerDay: 5, planHorizonDays: 4 };
    const spread = plan([hoursTask('B', 200)], { ...s, spreadEvenly: true });
    expect(spread.sessions.map(date)).toEqual([5, 6, 7, 8]);
    const ahead = plan([hoursTask('B', 200)], { ...s, spreadEvenly: false });
    expect(ahead.sessions.filter((x) => date(x) === 5).length).toBeGreaterThan(1);
    expect(Math.max(...ahead.sessions.map(date))).toBeLessThan(8);
  });

  it('never schedules in the past, before the start time, or for done tasks', () => {
    const result = plan(
      [hoursTask('Done', 300, 50, { done: true }), hoursTask('A', 1200)],
      { dayStart: '10:00', dayEnd: '18:00', maxSessionsPerTaskPerDay: 9, spreadEvenly: true },
      { from: at(5, 13, 7) },
    );
    expect(result.sessions.every((x) => x.taskId === 'A')).toBe(true);
    expect(Date.parse(result.sessions[0].start)).toBe(ms(at(5, 13, 15))); // next quarter hour after 13:07
    expect(result.sessions.every((x) => new Date(x.start).getHours() >= 10)).toBe(true);
  });

  it('rejects an invalid study day', () => {
    expect(() => plan([sessionsTask('A', 1)], { dayEnd: '08:00' })).toThrow();
  });
});
