import { useState } from 'react';
import { Play, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { useStore } from '../store';
import { minutesBetween } from '../lib/time';

export function SessionDialog({ sessionId, onClose }: { sessionId: string; onClose(): void }) {
  const session = useStore((s) => s.sessions.find((x) => x.id === sessionId));
  const task = useStore((s) => s.tasks.find((t) => t.id === session?.taskId));
  const { setSessionDuration, toggleSessionDone, deleteSession, startTimer } = useStore.getState();
  const [minutes, setMinutes] = useState(() => (session ? String(minutesBetween(session.start, session.end)) : ''));
  const [error, setError] = useState<string | null>(null);

  if (!session || !task) return null;

  const start = new Date(session.start);
  const end = new Date(session.end);
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const when = `${start.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · ${t(start)} – ${t(end)}`;

  const saveDuration = () => {
    const m = Number(minutes);
    if (!Number.isInteger(m) || m < 5 || m > 600) return setError('Duration must be 5–600 minutes.');
    setError(null);
    setSessionDuration(session.id, m);
  };

  return (
    <Modal title={task.title} onClose={onClose}>
      <p className="lede">{when}</p>
      <label className="check-row">
        <input type="checkbox" checked={session.done} onChange={() => toggleSessionDone(session.id)} /> Session done
      </label>
      <div className="inline-field">
        <label className="field">
          <span>Length</span>
          <span className="input-unit">
            <input type="number" min="5" step="5" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            <em>min</em>
          </span>
        </label>
        <button onClick={saveDuration}>Update</button>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="muted small">Drag the block to move it, or drag its bottom edge to resize.</p>
      <div className="dialog-actions">
        <button
          className="ghost danger"
          onClick={() => {
            deleteSession(session.id);
            onClose();
          }}
        >
          <Trash2 size={15} /> Remove
        </button>
        <span className="spacer" />
        <button
          className="primary"
          onClick={() => {
            startTimer(session.id);
            onClose();
          }}
        >
          <Play size={14} fill="currentColor" /> Start focus
        </button>
      </div>
    </Modal>
  );
}
