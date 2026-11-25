/** How the user described the size of a task. */
export type PlanMode = 'hours' | 'sessions';

export interface Task {
  id: string;
  title: string;
  color: string;
  planMode: PlanMode;
  /** Total amount of study the task needs, in minutes. */
  targetMinutes: number;
  /** Length of one session created when the task is dragged onto the calendar. */
  sessionMinutes: number;
  /** Number of sessions wanted ('sessions' mode only). */
  sessionCount?: number;
  /** Optional local due date "YYYY-MM-DD". The planner finishes the day before. */
  dueDate?: string;
  done: boolean;
}

export type TaskInput = Pick<Task, 'title' | 'planMode' | 'targetMinutes' | 'sessionMinutes' | 'color'> & {
  sessionCount?: number;
  dueDate?: string;
};

/** One block of study for a task, placed on the calendar. */
export interface Session {
  id: string;
  taskId: string;
  /** ISO timestamps. */
  start: string;
  end: string;
  done: boolean;
  /** 'auto' = created by "Plan for me", 'manual' = dragged by the user. */
  source: 'manual' | 'auto';
  reminded?: boolean;
}

/** A one-off event or reminder the user created by clicking the calendar. Counts as busy time. */
export interface CalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  color: string;
  done: boolean;
  reminded?: boolean;
}

/** A calendar the user imported from an .ics file or link (Google / Outlook / Apple / uni timetable). */
export interface ImportedCalendar {
  id: string;
  name: string;
  icsText: string;
  /** Subscription link it was fetched from, if any (enables Refresh). */
  url?: string;
  color?: string;
  /** Occurrence keys ("uid|recurrence") the user skipped. */
  hidden?: string[];
  /** Event UIDs whose whole series the user hid. */
  hiddenSeries?: string[];
  importedAt?: string;
}

/** A concrete occurrence of an imported event (recurrences already expanded). */
export interface BusyEvent {
  /** Unique id across all calendars: "calendarId|uid|recurrence". */
  id: string;
  /** Occurrence key within its calendar: "uid|recurrence". */
  key: string;
  uid: string;
  calendarId: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  recurring: boolean;
}

/** How much study a weekday should get. */
export type DayLoad = 'off' | 'light' | 'normal';

export interface Settings {
  /** Earliest time the planner may schedule study, "HH:MM". */
  dayStart: string;
  /** Latest time study may end, "HH:MM". */
  dayEnd: string;
  defaultSessionMinutes: number;
  focusMinutes: number;
  breakMinutes: number;
  /** Breathing room the planner leaves around classes and other sessions. */
  gapMinutes: number;
  /** Study cap on a "normal" day. "Light" days get half. */
  maxStudyMinutesPerDay: number;
  maxSessionsPerTaskPerDay: number;
  planHorizonDays: number;
  /** Indexed like Date.getDay(): 0 = Sunday … 6 = Saturday. */
  dayLoad: DayLoad[];
  lunchEnabled: boolean;
  lunchStart: string;
  lunchEnd: string;
  dinnerEnabled: boolean;
  dinnerStart: string;
  dinnerEnd: string;
  /** Spread work evenly over the horizon instead of filling the earliest days first. */
  spreadEvenly: boolean;
  remindersEnabled: boolean;
  /** The first-visit tour was finished or skipped (syncs with the account, so it shows once per person). */
  tutorialDone: boolean;
}

export interface PomodoroPhase {
  kind: 'focus' | 'break';
  minutes: number;
}

export interface TimerState {
  sessionId: string;
  phases: PomodoroPhase[];
  index: number;
  running: boolean;
  /** Epoch ms when the current phase ends (only while running). */
  endsAt: number | null;
  /** Ms left in the current phase (authoritative while paused). */
  remainingMs: number;
  finished: boolean;
}
