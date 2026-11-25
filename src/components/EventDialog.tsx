import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { EVENT_DEFAULT_COLOR, PALETTE, useStore } from '../store';
import { dayKey } from '../lib/time';
import { parseLocalDate } from '../lib/scheduler';

export type EventDialogMode = { kind: 'new'; start: Date; end: Date } | { kind: 'edit'; id: string };

const toTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function combine(date: string, time: string): Date | null {
  const day = parseLocalDate(date);
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!Number.isFinite(day) || !m) return null;
  const d = new Date(day);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

/** Add a quick event / reminder by clicking the calendar, or book a study session for a task there. */
export function EventDialog({ mode, onClose }: { mode: EventDialogMode; onClose(): void }) {
  const existing = useStore((s) => (mode.kind === 'edit' ? s.events.find((e) => e.id === mode.id) : undefined));
  // Select the stable array; filtering inside the selector would return a new array every render.
  const allTasks = useStore((s) => s.tasks);
  const tasks = allTasks.filter((t) => !t.done);
  const { addEvent, updateEvent, deleteEvent, toggleEventDone, addSession } = useStore.getState();

  const initialStart = mode.kind === 'new' ? mode.start : new Date(existing?.start ?? Date.now());
  const initialEnd = mode.kind === 'new' ? mode.end : new Date(existing?.end ?? Date.now());
  const [type, setType] = useState<'event' | 'study'>('event');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? '');
  const [date, setDate] = useState(dayKey(initialStart));
  const [startTime, setStartTime] = useState(toTime(initialStart));
  const [endTime, setEndTime] = useState(toTime(initialEnd));
  const [color, setColor] = useState(existing?.color ?? EVENT_DEFAULT_COLOR);
  const [error, setError] = useState<string | null>(null);

  if (mode.kind === 'edit' && !existing) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const start = combine(date, startTime);
    let end = combine(date, endTime);
    if (!start || !end) return setError('Pick a date and times.');
    // An end time at or before the start (e.g. 23:00–00:30) runs past midnight.
    if (end <= start) end = new Date(end.getTime() + 86_400_000);
    if (end.getTime() - start.getTime() > 86_400_000) return setError('Events can be at most 24 hours.');

    if (type === 'study') {
      if (!taskId) return setError('Add a task first, or create a plain event.');
      addSession(taskId, start, end);
    } else {
      const name = title.trim();
      if (!name) return setError('Give it a name.');
      const fields = { title: name, start: start.toISOString(), end: end.toISOString(), color };
      if (mode.kind === 'edit') updateEvent(mode.id, fields);
      else addEvent(fields);
    }
    onClose();
  };

  return (
    <Modal title={mode.kind === 'edit' ? 'Edit event' : 'New'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {mode.kind === 'new' && (
          <div className="segmented" role="radiogroup" aria-label="What are you adding?">
            <button type="button" role="radio" aria-checked={type === 'event'} className={type === 'event' ? 'on' : ''} onClick={() => setType('event')}>
              Event or reminder
            </button>
            <button type="button" role="radio" aria-checked={type === 'study'} className={type === 'study' ? 'on' : ''} onClick={() => setType('study')}>
              Study session
            </button>
          </div>
        )}

        {type === 'event' ? (
          <input
            className="title-input"
            autoFocus
            placeholder="e.g. Gym, Call mum, Hand in form"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Event name"
          />
        ) : tasks.length ? (
          <label className="field">
            <span>Task</span>
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="muted">You don't have any tasks yet. Add one in the list on the left.</p>
        )}

        <div className="time-row">
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>From</span>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
        </div>

        {type === 'event' && (
          <div className="field">
            <span>Colour</span>
            <div className="swatches" role="radiogroup" aria-label="Colour">
              {[EVENT_DEFAULT_COLOR, ...PALETTE.filter((c) => c !== EVENT_DEFAULT_COLOR)].map((c) => (
                <button
                  type="button"
                  key={c}
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c}
                  className={color === c ? 'swatch-btn on' : 'swatch-btn'}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        )}

        {mode.kind === 'edit' && existing && (
          <label className="check-row">
            <input type="checkbox" checked={existing.done} onChange={() => toggleEventDone(existing.id)} /> Done
          </label>
        )}

        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          {mode.kind === 'edit' && (
            <button
              type="button"
              className="ghost danger"
              onClick={() => {
                deleteEvent(mode.id);
                onClose();
              }}
            >
              <Trash2 size={15} /> Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {mode.kind === 'edit' ? 'Save' : type === 'study' ? 'Add session' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
