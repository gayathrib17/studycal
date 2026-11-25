import type { Session, Task } from '../types';
import { MINUTE_MS, addDays, startOfDay } from './time';

export type FlowerKind = 'daisy' | 'tulip' | 'poppy' | 'bell';
const KINDS: FlowerKind[] = ['daisy', 'tulip', 'poppy', 'bell'];

export interface Plant {
  id: string;
  /** 0–1 horizontal position across the bed. */
  x: number;
  /** 0 = back row, 2 = front row. */
  row: 0 | 1 | 2;
  color: string;
  kind: FlowerKind;
  /** Finished sessions bloom; planned ones are sprouts. */
  stage: 'sprout' | 'bloom';
  /** Height multiplier from session length (25 min ≈ 0.75, 50 min = 1, 90+ min ≈ 1.3). */
  size: number;
}

export interface Garden {
  plants: Plant[];
  minutesDone: number;
  flowers: number;
  sprouts: number;
}

/** Small deterministic string hash (FNV-1a) so a session always grows in the same spot. */
export function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Monday 00:00 of the week containing `d` (local time). */
export function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}

/** Each subject gets a consistent flower species. */
export function flowerKindFor(taskId: string): FlowerKind {
  return KINDS[hash(taskId) % KINDS.length];
}

/**
 * Build the garden for the week starting `weekStart` (a Monday).
 * Plants are laid out left-to-right in the order the sessions happened, so the bed fills up
 * through the week; a hash adds natural jitter to position and row.
 */
export function buildGarden(sessions: Session[], tasks: Task[], weekStart: Date): Garden {
  const from = weekStart.getTime();
  const to = addDays(weekStart, 7).getTime();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const week = sessions
    .filter((s) => {
      const t = Date.parse(s.start);
      return t >= from && t < to && byId.has(s.taskId);
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  const n = week.length;
  let minutesDone = 0;
  const plants = week.map((s, i): Plant => {
    const h = hash(s.id);
    const minutes = (Date.parse(s.end) - Date.parse(s.start)) / MINUTE_MS;
    if (s.done) minutesDone += minutes;
    const slot = 1 / Math.max(n, 1);
    const jitter = ((h % 1000) / 1000 - 0.5) * slot * 0.6;
    return {
      id: s.id,
      x: Math.min(0.97, Math.max(0.03, slot * (i + 0.5) + jitter)),
      row: ((h >>> 10) % 3) as 0 | 1 | 2,
      color: byId.get(s.taskId)!.color,
      kind: flowerKindFor(s.taskId),
      stage: s.done ? 'bloom' : 'sprout',
      size: Math.min(1.3, Math.max(0.7, 0.45 + minutes / 90)),
    };
  });
  const flowers = plants.filter((p) => p.stage === 'bloom').length;
  return { plants, minutesDone, flowers, sprouts: plants.length - flowers };
}
