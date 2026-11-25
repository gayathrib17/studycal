import type { PomodoroPhase } from '../types';

/**
 * Split a session into focus/break phases that add up to the session length.
 * 50 min with 25/5 -> focus 25, break 5, focus 20. The session never ends on a break.
 */
export function buildPomodoroPhases(totalMinutes: number, focusMinutes: number, breakMinutes: number): PomodoroPhase[] {
  const phases: PomodoroPhase[] = [];
  const focus = Math.max(1, focusMinutes);
  const brk = Math.max(0, breakMinutes);
  let remaining = Math.max(1, Math.round(totalMinutes));
  while (remaining > 0) {
    let f = Math.min(focus, remaining);
    // A leftover too short to follow a break is folded into this focus block.
    if (remaining - f <= brk) f = remaining;
    phases.push({ kind: 'focus', minutes: f });
    remaining -= f;
    if (remaining > 0 && brk > 0) {
      phases.push({ kind: 'break', minutes: brk });
      remaining -= brk;
    }
  }
  return phases;
}
