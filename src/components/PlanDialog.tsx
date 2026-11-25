import { useState } from 'react';
import { Modal } from './Modal';
import { RhythmPicker } from './RhythmPicker';
import { newId, useStore } from '../store';
import { planSchedule } from '../lib/scheduler';
import { expandCalendars } from '../lib/ics';
import { addDays, formatMinutes, roundUpToStep } from '../lib/time';

export function PlanDialog({ onClose }: { onClose(): void }) {
  const settings = useStore((s) => s.settings);
  const activeCount = useStore((s) => s.tasks.filter((t) => !t.done).length);
  const sessions = useStore((s) => s.sessions);
  const { updateSettings } = useStore.getState();
  const [error, setError] = useState<string | null>(null);
  // Upcoming, unfinished sessions the planner placed earlier. Re-planning may move these;
  // sessions the user placed by hand and finished ones always stay put.
  const [now] = useState(() => Date.now());
  const movable = sessions.filter((x) => x.source === 'auto' && !x.done && Date.parse(x.start) >= now);
  const [rearrange, setRearrange] = useState(true);

  const run = () => {
    const { tasks, calendars, events, setProposal } = useStore.getState();
    const from = roundUpToStep(new Date(), 15);
    const replaces = rearrange ? movable.map((x) => x.id) : [];
    const replacing = new Set(replaces);
    const keep = useStore.getState().sessions.filter((x) => !replacing.has(x.id));
    const busy = [
      ...expandCalendars(calendars, from, addDays(from, settings.planHorizonDays + 1))
        .filter((e) => !e.allDay)
        .map((e) => ({ start: e.start.getTime(), end: e.end.getTime() })),
      ...events.map((e) => ({ start: Date.parse(e.start), end: Date.parse(e.end) })),
    ];
    try {
      const result = planSchedule({ tasks, sessions: keep, busy, settings, from, newId });
      setProposal({ ...result, replaces });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal title="Plan my week" onClose={onClose} wide>
      <p className="lede">
        Fills free time over the next {settings.planHorizonDays} days, between {settings.dayStart} and {settings.dayEnd}, around your classes
        and events. Each day mixes your subjects, tasks due soon get more of the day, and tasks higher in your list get a bit more time early
        on. You'll see a preview before anything changes.
      </p>

      <h3>Weekly rhythm</h3>
      <p className="muted small">
        Normal days allow up to {formatMinutes(settings.maxStudyMinutesPerDay)} of study, light days half that, and off days none.
      </p>
      <RhythmPicker value={settings.dayLoad} onChange={(dayLoad) => updateSettings({ dayLoad })} />

      <h3>Breaks</h3>
      <div className="toggles">
        <label className="check-row">
          <input type="checkbox" checked={settings.lunchEnabled} onChange={(e) => updateSettings({ lunchEnabled: e.target.checked })} />
          Lunch {settings.lunchStart}–{settings.lunchEnd}
        </label>
        <label className="check-row">
          <input type="checkbox" checked={settings.dinnerEnabled} onChange={(e) => updateSettings({ dinnerEnabled: e.target.checked })} />
          Dinner {settings.dinnerStart}–{settings.dinnerEnd}
        </label>
        <label className="check-row">
          <input type="checkbox" checked={settings.spreadEvenly} onChange={(e) => updateSettings({ spreadEvenly: e.target.checked })} />
          Spread work evenly instead of getting ahead early
        </label>
      </div>
      <p className="muted small">
        Also: {settings.gapMinutes} min between blocks and at most {settings.maxSessionsPerTaskPerDay} sessions of one task a day, unless a due
        date needs more. Tasks with a due date finish the day before. You can change these in Settings.
      </p>

      {movable.length > 0 && (
        <label className="check-row">
          <input type="checkbox" checked={rearrange} onChange={(e) => setRearrange(e.target.checked)} />
          Rearrange the {movable.length} upcoming session{movable.length === 1 ? '' : 's'} I planned earlier, using these settings
        </label>
      )}
      {movable.length > 0 && !rearrange && (
        <p className="muted small">Those sessions stay where they are. Only the remaining time gets planned.</p>
      )}

      {error && <p className="error">{error}</p>}
      <div className="dialog-actions">
        <span className="spacer" />
        <button className="ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="primary" onClick={run} disabled={activeCount === 0}>
          {activeCount === 0 ? 'Add a task first' : 'Preview plan'}
        </button>
      </div>
    </Modal>
  );
}
