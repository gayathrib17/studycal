import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CalEvent, ImportedCalendar, Session, Settings, Task, TaskInput, TimerState } from './types';
import { buildPomodoroPhases } from './lib/pomodoro';
import { MINUTE_MS, minutesBetween } from './lib/time';

/** Earthy, garden-like colours that stay readable on the cream background. */
export const PALETTE = ['#5b8c5a', '#d0775b', '#d9a441', '#5b84b1', '#cf7f95', '#3f9a92', '#a8694a', '#8a9a4b'];
export const EVENT_DEFAULT_COLOR = '#5b84b1';
export const CALENDAR_DEFAULT_COLOR = '#9aa1a8';

export const DEFAULT_SETTINGS: Settings = {
  dayStart: '09:00',
  dayEnd: '21:00',
  defaultSessionMinutes: 50,
  focusMinutes: 25,
  breakMinutes: 5,
  gapMinutes: 10,
  maxStudyMinutesPerDay: 300,
  maxSessionsPerTaskPerDay: 2,
  planHorizonDays: 14,
  //        Sun      Mon       Tue       Wed       Thu       Fri       Sat
  dayLoad: ['light', 'normal', 'normal', 'normal', 'normal', 'normal', 'light'],
  lunchEnabled: true,
  lunchStart: '12:30',
  lunchEnd: '13:30',
  dinnerEnabled: true,
  dinnerStart: '18:30',
  dinnerEnd: '19:30',
  spreadEvenly: true,
  remindersEnabled: true,
};

export const newId = () => crypto.randomUUID();

export function nextColor(tasks: Task[]): string {
  const used = new Set(tasks.filter((t) => !t.done).map((t) => t.color));
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[tasks.length % PALETTE.length];
}

export interface Toast {
  id: string;
  message: string;
  kind: 'info' | 'reminder';
  action?: { label: string; run: () => void };
}

type Data = Pick<State, 'tasks' | 'sessions' | 'events' | 'calendars' | 'settings'>;

interface State {
  tasks: Task[];
  sessions: Session[];
  events: CalEvent[];
  calendars: ImportedCalendar[];
  settings: Settings;
  /** Sessions suggested by "Plan my week", shown dashed until accepted. Not persisted. */
  /** `replaces` = ids of upcoming planner-placed sessions this plan re-arranges (removed on accept). */
  proposal: { sessions: Session[]; unplaced: { taskId: string; minutes: number }[]; replaces: string[] } | null;
  /** Running focus timer. Not persisted. */
  timer: TimerState | null;
  toasts: Toast[];

  addTask(input: TaskInput): void;
  updateTask(id: string, input: Partial<TaskInput>): void;
  deleteTask(id: string): void;
  toggleTaskDone(id: string): void;
  moveTask(dragId: string, overId: string): void;

  addSession(taskId: string, start: Date, end: Date): void;
  updateSessionTime(id: string, start: Date, end: Date): void;
  setSessionDuration(id: string, minutes: number): void;
  toggleSessionDone(id: string): void;
  deleteSession(id: string): void;
  markSessionReminded(id: string): void;

  addEvent(input: Omit<CalEvent, 'id' | 'done'>): void;
  updateEvent(id: string, patch: Partial<Omit<CalEvent, 'id'>>): void;
  deleteEvent(id: string): void;
  toggleEventDone(id: string): void;
  markEventReminded(id: string): void;

  addCalendar(input: { name: string; icsText: string; url?: string }): void;
  updateCalendar(id: string, patch: Partial<Omit<ImportedCalendar, 'id'>>): void;
  removeCalendar(id: string): void;
  hideOccurrence(calendarId: string, key: string, title: string): void;
  hideSeries(calendarId: string, uid: string, title: string): void;
  restoreHidden(calendarId: string): void;

  updateSettings(patch: Partial<Settings>): void;

  setProposal(p: State['proposal']): void;
  acceptProposal(): void;

  startTimer(sessionId: string): void;
  pauseTimer(): void;
  resumeTimer(): void;
  advanceTimer(): void;
  stopTimer(): void;

  pushToast(t: Omit<Toast, 'id'>): void;
  dismissToast(id: string): void;

  exportData(): string;
  importData(json: string): void;
}

function phaseState(timer: Omit<TimerState, 'endsAt' | 'remainingMs' | 'running' | 'finished'>, index: number): TimerState {
  if (index >= timer.phases.length) {
    return { ...timer, index, running: false, endsAt: null, remainingMs: 0, finished: true };
  }
  const ms = timer.phases[index].minutes * MINUTE_MS;
  return { ...timer, index, running: true, endsAt: Date.now() + ms, remainingMs: ms, finished: false };
}

const BACKUP_APP = 'studycal';

/** Put an item back at its old position, unless it is already there. */
function restoreAt<T extends { id: string }>(list: T[], item: T, index: number): T[] {
  if (list.some((x) => x.id === item.id)) return list;
  const next = [...list];
  next.splice(Math.min(index, next.length), 0, item);
  return next;
}

/** Re-add removed items that aren't present any more. */
function restoreAll<T extends { id: string }>(list: T[], items: T[]): T[] {
  const present = new Set(list.map((x) => x.id));
  return [...list, ...items.filter((x) => !present.has(x.id))];
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /**
       * Apply a destructive change and offer Undo. `undo` reverses only this change (re-adds what was
       * removed), so pressing Undo on an older toast never wipes edits made since.
       */
      const withUndo = (message: string, change: (s: State) => Partial<State>, undo: (s: State) => Partial<State>) => {
        set(change(get()));
        get().pushToast({ kind: 'info', message, action: { label: 'Undo', run: () => set((s) => ({ ...undo(s), proposal: null })) } });
      };
      const mapSession = (id: string, f: (x: Session) => Session) =>
        set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? f(x) : x)) }));
      const mapEvent = (id: string, f: (x: CalEvent) => CalEvent) =>
        set((s) => ({ events: s.events.map((x) => (x.id === id ? f(x) : x)) }));
      const mapCalendar = (id: string, f: (x: ImportedCalendar) => ImportedCalendar) =>
        set((s) => ({ calendars: s.calendars.map((x) => (x.id === id ? f(x) : x)), proposal: null }));

      return {
        tasks: [],
        sessions: [],
        events: [],
        calendars: [],
        settings: DEFAULT_SETTINGS,
        proposal: null,
        timer: null,
        toasts: [],

        addTask: (input) => set((s) => ({ tasks: [...s.tasks, { id: newId(), done: false, ...input }] })),
        updateTask: (id, input) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...input } : t)) })),
        deleteTask: (id) => {
          const { tasks, sessions } = get();
          const index = tasks.findIndex((t) => t.id === id);
          if (index < 0) return;
          const task = tasks[index];
          const removed = sessions.filter((x) => x.taskId === id);
          withUndo(
            `Deleted "${task.title}"`,
            (s) => ({
              tasks: s.tasks.filter((t) => t.id !== id),
              sessions: s.sessions.filter((x) => x.taskId !== id),
              proposal: null,
              timer: s.timer && removed.some((x) => x.id === s.timer!.sessionId) ? null : s.timer,
            }),
            (s) => ({ tasks: restoreAt(s.tasks, task, index), sessions: restoreAll(s.sessions, removed) }),
          );
        },
        toggleTaskDone: (id) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })),
        moveTask: (dragId, overId) =>
          set((s) => {
            if (dragId === overId) return s;
            const from = s.tasks.findIndex((t) => t.id === dragId);
            const to = s.tasks.findIndex((t) => t.id === overId);
            if (from < 0 || to < 0) return s;
            const tasks = [...s.tasks];
            const [moved] = tasks.splice(from, 1);
            tasks.splice(to, 0, moved);
            return { tasks };
          }),

        addSession: (taskId, start, end) =>
          set((s) => ({
            sessions: [
              ...s.sessions,
              { id: newId(), taskId, start: start.toISOString(), end: end.toISOString(), done: false, source: 'manual' },
            ],
          })),
        // Moving a session re-arms its reminder.
        updateSessionTime: (id, start, end) =>
          mapSession(id, (x) => ({ ...x, start: start.toISOString(), end: end.toISOString(), reminded: false })),
        setSessionDuration: (id, minutes) =>
          mapSession(id, (x) => ({ ...x, end: new Date(Date.parse(x.start) + minutes * MINUTE_MS).toISOString() })),
        toggleSessionDone: (id) => mapSession(id, (x) => ({ ...x, done: !x.done })),
        deleteSession: (id) => {
          const session = get().sessions.find((x) => x.id === id);
          if (!session) return;
          withUndo(
            'Session removed',
            (s) => ({ sessions: s.sessions.filter((x) => x.id !== id), timer: s.timer?.sessionId === id ? null : s.timer }),
            (s) => ({ sessions: restoreAll(s.sessions, [session]) }),
          );
        },
        markSessionReminded: (id) => mapSession(id, (x) => ({ ...x, reminded: true })),

        addEvent: (input) => set((s) => ({ events: [...s.events, { ...input, id: newId(), done: false }], proposal: null })),
        updateEvent: (id, patch) => {
          const timeChanged = patch.start !== undefined || patch.end !== undefined;
          mapEvent(id, (x) => ({ ...x, ...patch, ...(timeChanged ? { reminded: false } : {}) }));
        },
        deleteEvent: (id) => {
          const ev = get().events.find((e) => e.id === id);
          if (!ev) return;
          withUndo(
            `Deleted "${ev.title}"`,
            (s) => ({ events: s.events.filter((x) => x.id !== id), proposal: null }),
            (s) => ({ events: restoreAll(s.events, [ev]) }),
          );
        },
        toggleEventDone: (id) => mapEvent(id, (x) => ({ ...x, done: !x.done })),
        markEventReminded: (id) => mapEvent(id, (x) => ({ ...x, reminded: true })),

        addCalendar: ({ name, icsText, url }) =>
          set((s) => ({
            calendars: [
              ...s.calendars,
              { id: newId(), name, icsText, url, color: CALENDAR_DEFAULT_COLOR, hidden: [], hiddenSeries: [], importedAt: new Date().toISOString() },
            ],
            proposal: null,
          })),
        updateCalendar: (id, patch) => mapCalendar(id, (c) => ({ ...c, ...patch })),
        removeCalendar: (id) => {
          const index = get().calendars.findIndex((c) => c.id === id);
          if (index < 0) return;
          const cal = get().calendars[index];
          withUndo(
            `Removed "${cal.name}"`,
            (s) => ({ calendars: s.calendars.filter((c) => c.id !== id), proposal: null }),
            (s) => ({ calendars: restoreAt(s.calendars, cal, index) }),
          );
        },
        hideOccurrence: (calendarId, key, title) => {
          const edit = (f: (list: string[]) => string[]) => (s: State) => ({
            calendars: s.calendars.map((c) => (c.id === calendarId ? { ...c, hidden: f(c.hidden ?? []) } : c)),
            proposal: null,
          });
          withUndo(`Skipped "${title}" this time`, edit((l) => [...l, key]), edit((l) => l.filter((k) => k !== key)));
        },
        hideSeries: (calendarId, uid, title) => {
          const edit = (f: (list: string[]) => string[]) => (s: State) => ({
            calendars: s.calendars.map((c) => (c.id === calendarId ? { ...c, hiddenSeries: f(c.hiddenSeries ?? []) } : c)),
            proposal: null,
          });
          withUndo(`Hid every "${title}"`, edit((l) => [...l, uid]), edit((l) => l.filter((u) => u !== uid)));
        },
        restoreHidden: (calendarId) => mapCalendar(calendarId, (c) => ({ ...c, hidden: [], hiddenSeries: [] })),

        // A preview made with the old settings would be wrong now, so drop it.
        updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch }, proposal: null })),

        setProposal: (proposal) => set({ proposal }),
        acceptProposal: () =>
          set((s) => {
            if (!s.proposal) return s;
            const replaced = new Set(s.proposal.replaces);
            return { sessions: [...s.sessions.filter((x) => !replaced.has(x.id)), ...s.proposal.sessions], proposal: null };
          }),

        startTimer: (sessionId) => {
          const { sessions, settings } = get();
          const session = sessions.find((x) => x.id === sessionId);
          if (!session) return;
          const phases = buildPomodoroPhases(minutesBetween(session.start, session.end), settings.focusMinutes, settings.breakMinutes);
          set({ timer: phaseState({ sessionId, phases, index: 0 }, 0) });
        },
        pauseTimer: () =>
          set((s) =>
            s.timer?.running && s.timer.endsAt
              ? { timer: { ...s.timer, running: false, remainingMs: Math.max(0, s.timer.endsAt - Date.now()), endsAt: null } }
              : s,
          ),
        resumeTimer: () =>
          set((s) =>
            s.timer && !s.timer.running && !s.timer.finished
              ? { timer: { ...s.timer, running: true, endsAt: Date.now() + s.timer.remainingMs } }
              : s,
          ),
        advanceTimer: () => set((s) => (s.timer ? { timer: phaseState(s.timer, s.timer.index + 1) } : s)),
        stopTimer: () => set({ timer: null }),

        pushToast: (t) => set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id: newId() }] })),
        dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

        exportData: () => {
          const { tasks, sessions, events, calendars, settings } = get();
          return JSON.stringify(
            { app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), data: { tasks, sessions, events, calendars, settings } },
            null,
            2,
          );
        },
        importData: (json) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(json);
          } catch {
            throw new Error('That file is not a studycal backup.');
          }
          const p = parsed as { app?: string; data?: Record<string, unknown> };
          const d = p?.data;
          const isArr = (v: unknown) => Array.isArray(v);
          if (p?.app !== BACKUP_APP || !d || !isArr(d.tasks) || !isArr(d.sessions) || !isArr(d.calendars)) {
            throw new Error('That file is not a studycal backup.');
          }
          // Restoring replaces everything by design, so its Undo puts everything back as it was.
          const prev = get();
          const snapshot: Data = { tasks: prev.tasks, sessions: prev.sessions, events: prev.events, calendars: prev.calendars, settings: prev.settings };
          withUndo(
            'Backup restored',
            () => ({
              tasks: d.tasks as Task[],
              sessions: d.sessions as Session[],
              events: isArr(d.events) ? (d.events as CalEvent[]) : [],
              calendars: d.calendars as ImportedCalendar[],
              settings: { ...DEFAULT_SETTINGS, ...((d.settings as Partial<Settings>) ?? {}) },
              proposal: null,
              timer: null,
            }),
            () => ({ ...snapshot }),
          );
        },
      };
    },
    {
      name: 'studycal',
      version: 1,
      partialize: (s) => ({ tasks: s.tasks, sessions: s.sessions, events: s.events, calendars: s.calendars, settings: s.settings }),
      // Fill in fields added in later versions so older saved data keeps working.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        return {
          ...current,
          ...p,
          events: p.events ?? [],
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
        };
      },
    },
  ),
);
