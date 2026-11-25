import type { Session, Task } from '../types';
import { formatMinutes, minutesBetween } from './time';

export interface TaskProgress {
  /** Unit the numbers below are in. */
  unit: 'sessions' | 'minutes';
  target: number;
  scheduled: number;
  done: number;
  fullyScheduled: boolean;
  /** Minutes still to place on the calendar. */
  remainingMinutes: number;
  /** Sessions still to place ('sessions' mode only, otherwise 0). */
  remainingSessions: number;
  label: string;
}

/**
 * Progress for one task. In 'sessions' mode progress counts sessions ("4/9 sessions"),
 * because that is how the user sized the task. In 'hours' mode it counts minutes.
 */
export function taskProgress(task: Task, sessions: Session[]): TaskProgress {
  const own = sessions.filter((s) => s.taskId === task.id);
  const scheduledMinutes = own.reduce((sum, s) => sum + minutesBetween(s.start, s.end), 0);
  const doneMinutes = own.filter((s) => s.done).reduce((sum, s) => sum + minutesBetween(s.start, s.end), 0);

  if (task.planMode === 'sessions') {
    const target = task.sessionCount ?? Math.max(1, Math.round(task.targetMinutes / task.sessionMinutes));
    const scheduled = own.length;
    const done = own.filter((s) => s.done).length;
    const remainingSessions = Math.max(0, target - scheduled);
    return {
      unit: 'sessions',
      target,
      scheduled,
      done,
      fullyScheduled: scheduled >= target,
      remainingSessions,
      remainingMinutes: remainingSessions * task.sessionMinutes,
      label: `${scheduled}/${target} sessions planned · ${done} done`,
    };
  }

  const target = task.targetMinutes;
  return {
    unit: 'minutes',
    target,
    scheduled: scheduledMinutes,
    done: doneMinutes,
    fullyScheduled: scheduledMinutes >= target,
    remainingSessions: 0,
    remainingMinutes: Math.max(0, target - scheduledMinutes),
    label: `${formatMinutes(scheduledMinutes)} of ${formatMinutes(target)} planned · ${formatMinutes(doneMinutes)} done`,
  };
}
