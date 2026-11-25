import { describe, expect, it } from 'vitest';
import { taskProgress } from './progress';
import type { Session, Task } from '../types';

const session = (taskId: string, startHour: number, minutes: number, done = false): Session => {
  const start = new Date(2026, 0, 5, startHour);
  return { id: `${taskId}${startHour}`, taskId, start: start.toISOString(), end: new Date(start.getTime() + minutes * 60_000).toISOString(), done, source: 'manual' };
};

describe('taskProgress', () => {
  it('counts sessions in sessions mode', () => {
    const task: Task = { id: 't', title: 't', color: '', planMode: 'sessions', sessionCount: 3, sessionMinutes: 50, targetMinutes: 150, done: false };
    const p = taskProgress(task, [session('t', 9, 50, true), session('t', 11, 50), session('other', 12, 50)]);
    expect(p).toMatchObject({ unit: 'sessions', target: 3, scheduled: 2, done: 1, fullyScheduled: false, remainingSessions: 1, remainingMinutes: 50 });
    expect(p.label).toBe('2/3 sessions planned · 1 done');
  });

  it('counts minutes in hours mode and flags fully scheduled', () => {
    const task: Task = { id: 't', title: 't', color: '', planMode: 'hours', sessionMinutes: 50, targetMinutes: 90, done: false };
    expect(taskProgress(task, [session('t', 9, 50, true)])).toMatchObject({ scheduled: 50, done: 50, remainingMinutes: 40, fullyScheduled: false });
    const full = taskProgress(task, [session('t', 9, 50), session('t', 11, 40)]);
    expect(full.fullyScheduled).toBe(true);
    expect(full.label).toBe('1h 30m of 1h 30m planned · 0m done');
  });
});
