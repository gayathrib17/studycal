import { describe, expect, it } from 'vitest';
import { snapMove, snapResize } from './snap';

const t = (h: number, m: number) => new Date(2026, 0, 5, h, m);
const hhmm = (d: Date) => d.toTimeString().slice(0, 5);

describe('snapMove', () => {
  it('lands an odd-time block on the nearest quarter hour and keeps its length', () => {
    // A 50 min block that started at 13:40, dragged by 6h15 (FullCalendar's step) → 19:55–20:45.
    const { start, end } = snapMove(t(19, 55), t(20, 45));
    expect([hhmm(start), hhmm(end)]).toEqual(['20:00', '20:50']);
  });
  it('rounds to the nearest, not always up', () => {
    expect(hhmm(snapMove(t(9, 7), t(10, 7)).start)).toBe('09:00');
    expect(hhmm(snapMove(t(9, 8), t(10, 8)).start)).toBe('09:15');
  });
  it('leaves blocks that are already on a quarter hour alone', () => {
    const { start, end } = snapMove(t(14, 30), t(15, 20));
    expect([hhmm(start), hhmm(end)]).toEqual(['14:30', '15:20']);
  });
});

describe('snapResize', () => {
  it('moves only the end to the nearest quarter hour', () => {
    const { start, end } = snapResize(t(13, 40), t(15, 25));
    expect([hhmm(start), hhmm(end)]).toEqual(['13:40', '15:30']);
  });
  it('never makes a block shorter than 15 minutes', () => {
    const { start, end } = snapResize(t(13, 40), t(13, 44));
    expect(end.getTime() - start.getTime()).toBe(15 * 60_000);
  });
});
