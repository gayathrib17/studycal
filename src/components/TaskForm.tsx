import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import type { PlanMode, Task, TaskInput } from '../types';
import { PALETTE } from '../store';

interface Props {
  initial?: Task;
  defaultColor: string;
  defaultSessionMinutes: number;
  submitLabel: string;
  onSubmit(input: TaskInput): void;
  onCancel?(): void;
  /** Compact form shows details only once the user starts typing. */
  compact?: boolean;
}

function toNumber(value: string): number {
  return value.trim() === '' ? NaN : Number(value);
}

export function TaskForm({ initial, defaultColor, defaultSessionMinutes, submitLabel, onSubmit, onCancel, compact }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [mode, setMode] = useState<PlanMode>(initial?.planMode ?? 'hours');
  const [hours, setHours] = useState(initial?.planMode === 'hours' ? String(initial.targetMinutes / 60) : '');
  const [sessionMinutes, setSessionMinutes] = useState(String(initial?.sessionMinutes ?? defaultSessionMinutes));
  const [count, setCount] = useState(initial?.planMode === 'sessions' ? String(initial.sessionCount ?? '') : '');
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [color, setColor] = useState(initial?.color ?? defaultColor);
  const [error, setError] = useState<string | null>(null);
  const expanded = !compact || title.length > 0 || error !== null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = title.trim();
    const len = toNumber(sessionMinutes);
    if (!name) return setError('Give the task a name.');
    if (!Number.isInteger(len) || len < 5 || len > 600) return setError('Session length must be 5–600 minutes.');
    const common = { title: name, sessionMinutes: len, color, dueDate: dueDate || undefined };

    if (mode === 'hours') {
      const h = toNumber(hours);
      if (!Number.isFinite(h) || h <= 0 || h > 1000) return setError('Enter the total hours (e.g. 20 or 1.5).');
      onSubmit({ ...common, planMode: 'hours', targetMinutes: Math.round(h * 60), sessionCount: undefined });
    } else {
      const n = toNumber(count);
      if (!Number.isInteger(n) || n < 1 || n > 500) return setError('Enter a whole number of sessions (1–500).');
      onSubmit({ ...common, planMode: 'sessions', sessionCount: n, targetMinutes: n * len });
    }
    setError(null);
    if (!initial) {
      setTitle('');
      setHours('');
      setCount('');
      setDueDate('');
    }
  };

  return (
    <form className="task-form" onSubmit={submit}>
      <div className="title-row">
        <input
          className="title-input"
          placeholder="Add a task, e.g. MLT Learn Content"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Task name"
        />
        {compact && (
          <button type="submit" className="primary icon-only" aria-label="Add task" title="Add task">
            <Plus size={18} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="form-details">
          <div className="segmented" role="radiogroup" aria-label="How big is this task?">
            <button type="button" role="radio" aria-checked={mode === 'hours'} className={mode === 'hours' ? 'on' : ''} onClick={() => setMode('hours')}>
              Total hours
            </button>
            <button type="button" role="radio" aria-checked={mode === 'sessions'} className={mode === 'sessions' ? 'on' : ''} onClick={() => setMode('sessions')}>
              Sessions
            </button>
          </div>

          <div className="field-pair">
            {mode === 'hours' ? (
              <label className="field">
                <span>Total time</span>
                <span className="input-unit">
                  <input type="number" min="0.25" step="0.25" placeholder="20" value={hours} onChange={(e) => setHours(e.target.value)} />
                  <em>hours</em>
                </span>
              </label>
            ) : (
              <label className="field">
                <span>Sessions</span>
                <span className="input-unit">
                  <input type="number" min="1" step="1" placeholder="9" value={count} onChange={(e) => setCount(e.target.value)} />
                  <em>×</em>
                </span>
              </label>
            )}
            <label className="field">
              <span>Each session</span>
              <span className="input-unit">
                <input type="number" min="5" step="5" value={sessionMinutes} onChange={(e) => setSessionMinutes(e.target.value)} />
                <em>min</em>
              </span>
            </label>
          </div>

          <div className="field-pair">
            <label className="field">
              <span>Due (optional)</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <div className="field">
              <span>Colour</span>
              <div className="swatches" role="radiogroup" aria-label="Task colour">
                {PALETTE.map((c) => (
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
          </div>

          {error && <p className="error">{error}</p>}
          {(!compact || onCancel) && (
            <div className="dialog-actions">
              <span className="spacer" />
              {onCancel && (
                <button type="button" className="ghost" onClick={onCancel}>
                  Cancel
                </button>
              )}
              <button type="submit" className="primary">
                {submitLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
