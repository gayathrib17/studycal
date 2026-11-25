import { describe, expect, it } from 'vitest';
import { buildGarden, flowerKindFor, startOfWeek } from './garden';
import type { Session, Task } from '../types';

const task = (id: string, color = '#5b8c5a'): Task => ({ id, title: id, color, planMode: 'hours', targetMinutes: 600, sessionMinutes: 50, done: false });
const session = (id: string, taskId: string, day: number, minutes: number, done: boolean): Session => {
  const start = new Date(2026, 0, day, 10);
  return { id, taskId, start: start.toISOString(), end: new Date(start.getTime() + minutes * 60_000).toISOString(), done, source: 'manual' };
};

describe('startOfWeek', () => {
  it('returns Monday 00:00 for any day of that week', () => {
    for (const day of [5, 7, 11]) {
      const m = startOfWeek(new Date(2026, 0, day, 15));
      expect([m.getFullYear(), m.getMonth(), m.getDate(), m.getHours()]).toEqual([2026, 0, 5, 0]);
    }
  });
});

describe('buildGarden', () => {
  const tasks = [task('a', '#111111'), task('b', '#222222')];
  const sessions = [
    session('s1', 'a', 5, 50, true),
    session('s2', 'b', 6, 25, true),
    session('s3', 'a', 8, 90, false),
    session('s4', 'a', 12, 50, true), // next week
    session('s5', 'gone', 6, 50, true), // task deleted
  ];

  it('only includes this week, blooms finished sessions and sprouts planned ones', () => {
    const g = buildGarden(sessions, tasks, startOfWeek(new Date(2026, 0, 7)));
    expect(g.plants.map((p) => [p.id, p.stage, p.color])).toEqual([
      ['s1', 'bloom', '#111111'],
      ['s2', 'bloom', '#222222'],
      ['s3', 'sprout', '#111111'],
    ]);
    expect(g.minutesDone).toBe(75);
    expect([g.flowers, g.sprouts]).toEqual([2, 1]);
  });

  it('starts fresh each week', () => {
    const next = buildGarden(sessions, tasks, startOfWeek(new Date(2026, 0, 12)));
    expect(next.plants.map((p) => p.id)).toEqual(['s4']);
  });

  it('is deterministic, ordered left to right, sized by length and kept in bounds', () => {
    const a = buildGarden(sessions, tasks, startOfWeek(new Date(2026, 0, 7)));
    const b = buildGarden(sessions, tasks, startOfWeek(new Date(2026, 0, 7)));
    expect(a).toEqual(b);
    const xs = a.plants.map((p) => p.x);
    expect([...xs].sort((p, q) => p - q)).toEqual(xs);
    expect(xs.every((x) => x > 0 && x < 1)).toBe(true);
    const [s1, s2, s3] = a.plants;
    expect(s2.size).toBeLessThan(s1.size);
    expect(s3.size).toBeGreaterThan(s1.size);
  });

  it('gives each subject a consistent flower', () => {
    expect(flowerKindFor('a')).toBe(flowerKindFor('a'));
    const g = buildGarden(sessions, tasks, startOfWeek(new Date(2026, 0, 7)));
    expect(g.plants[0].kind).toBe(g.plants[2].kind);
  });

  it('always puts plants in one of the three rows (many ids)', () => {
    const many = Array.from({ length: 300 }, (_, i) => session(`id-${i}-${'x'.repeat(i % 7)}`, 'a', 5 + (i % 7), 50, true));
    const g = buildGarden(many, tasks, startOfWeek(new Date(2026, 0, 7)));
    expect(g.plants).toHaveLength(300);
    expect(g.plants.every((p) => p.row === 0 || p.row === 1 || p.row === 2)).toBe(true);
  });
});
