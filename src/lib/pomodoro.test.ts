import { describe, expect, it } from 'vitest';
import { buildPomodoroPhases } from './pomodoro';

const short = (total: number, f = 25, b = 5) => buildPomodoroPhases(total, f, b).map((p) => `${p.kind[0]}${p.minutes}`).join(' ');

describe('buildPomodoroPhases', () => {
  it('splits a session into focus/break blocks summing to its length', () => {
    expect(short(50)).toBe('f25 b5 f20');
    expect(short(25)).toBe('f25');
    expect(short(90)).toBe('f25 b5 f25 b5 f30');
  });

  it('never ends on a break; a leftover too short to follow a break joins the last focus', () => {
    expect(short(30)).toBe('f30');
    expect(short(29)).toBe('f29');
    expect(short(120)).toBe('f25 b5 f25 b5 f25 b5 f30');
  });

  it('always sums to the session length', () => {
    for (let t = 5; t <= 240; t += 5) {
      const phases = buildPomodoroPhases(t, 25, 5);
      expect(phases.reduce((s, p) => s + p.minutes, 0)).toBe(t);
      expect(phases[phases.length - 1].kind).toBe('focus');
    }
  });
});
