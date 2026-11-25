import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, useStore } from './store';

const reset = () =>
  useStore.setState({ tasks: [], sessions: [], events: [], calendars: [], settings: DEFAULT_SETTINGS, toasts: [], proposal: null, timer: null });

const undoToast = (match: string) => {
  const t = useStore.getState().toasts.find((x) => x.message.includes(match));
  if (!t?.action) throw new Error(`no undo toast for ${match}`);
  return t.action.run;
};

const ev = (title: string, hour: number) => ({
  title,
  start: new Date(2026, 0, 5, hour).toISOString(),
  end: new Date(2026, 0, 5, hour + 1).toISOString(),
  color: '#000000',
});

describe('undo', () => {
  beforeEach(reset);

  it('undoing an older action does not wipe changes made after it', () => {
    const s = useStore.getState();
    s.addEvent(ev('Gym', 9));
    const gymId = useStore.getState().events[0].id;
    s.deleteEvent(gymId);
    const undoGym = undoToast('Gym');
    s.addEvent(ev('Call mum', 12)); // made after the delete
    undoGym();
    expect(useStore.getState().events.map((e) => e.title).sort()).toEqual(['Call mum', 'Gym']);
  });

  it('restores a deleted task at its old position with its sessions', () => {
    const s = useStore.getState();
    for (const title of ['A', 'B', 'C']) s.addTask({ title, planMode: 'hours', targetMinutes: 60, sessionMinutes: 50, color: '#000' });
    const b = useStore.getState().tasks[1];
    s.addSession(b.id, new Date(2026, 0, 5, 9), new Date(2026, 0, 5, 10));
    s.deleteTask(b.id);
    expect(useStore.getState().tasks.map((t) => t.title)).toEqual(['A', 'C']);
    expect(useStore.getState().sessions).toHaveLength(0);
    undoToast('"B"')();
    expect(useStore.getState().tasks.map((t) => t.title)).toEqual(['A', 'B', 'C']);
    expect(useStore.getState().sessions.map((x) => x.taskId)).toEqual([b.id]);
  });

  it('un-skips only the occurrence it skipped', () => {
    const s = useStore.getState();
    s.addCalendar({ name: 'Uni', icsText: 'BEGIN:VCALENDAR\nEND:VCALENDAR' });
    const cal = useStore.getState().calendars[0].id;
    s.hideOccurrence(cal, 'lec|1', 'Lecture');
    const undo1 = undoToast('Skipped');
    s.hideOccurrence(cal, 'lec|2', 'Lecture');
    undo1();
    expect(useStore.getState().calendars[0].hidden).toEqual(['lec|2']);
  });

  it('pressing undo twice does not duplicate', () => {
    const s = useStore.getState();
    s.addEvent(ev('Gym', 9));
    s.deleteEvent(useStore.getState().events[0].id);
    const undo = undoToast('Gym');
    undo();
    undo();
    expect(useStore.getState().events).toHaveLength(1);
  });
});

describe('backup', () => {
  beforeEach(reset);

  it('round-trips through export/import and rejects other files', () => {
    const s = useStore.getState();
    s.addTask({ title: 'A', planMode: 'hours', targetMinutes: 60, sessionMinutes: 50, color: '#000' });
    const json = s.exportData();
    reset();
    useStore.getState().importData(json);
    expect(useStore.getState().tasks.map((t) => t.title)).toEqual(['A']);
    expect(() => useStore.getState().importData('{"nope":true}')).toThrow(/not a studycal backup/);
    expect(() => useStore.getState().importData('not json')).toThrow(/not a studycal backup/);
  });
});

describe('planning proposals', () => {
  beforeEach(reset);

  const session = (id: string, hour: number, source: 'auto' | 'manual') => ({
    id,
    taskId: 't',
    start: new Date(2026, 0, 5, hour).toISOString(),
    end: new Date(2026, 0, 5, hour, 50).toISOString(),
    done: false,
    source,
  });

  it('accepting a re-plan swaps out only the sessions it replaces', () => {
    useStore.setState({ sessions: [session('old-auto', 9, 'auto'), session('mine', 11, 'manual')] });
    useStore.getState().setProposal({ sessions: [session('new-auto', 10, 'auto')], unplaced: [], replaces: ['old-auto'] });
    useStore.getState().acceptProposal();
    expect(useStore.getState().sessions.map((x) => x.id).sort()).toEqual(['mine', 'new-auto']);
  });

  it('changing settings drops a preview made with the old settings', () => {
    useStore.getState().setProposal({ sessions: [session('p', 9, 'auto')], unplaced: [], replaces: [] });
    useStore.getState().updateSettings({ dayStart: '10:00' });
    expect(useStore.getState().proposal).toBeNull();
    expect(useStore.getState().settings.dayStart).toBe('10:00');
  });
});

