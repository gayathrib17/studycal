import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Coffee, Pause, Play, SkipForward, X } from 'lucide-react';
import { useStore } from '../store';
import { MINUTE_MS, formatClock } from '../lib/time';
import { beep, notify } from '../lib/alerts';
import { flowerKindFor } from '../lib/garden';
import { Flower } from './Flower';

export function PomodoroPanel() {
  const timer = useStore((s) => s.timer);
  const session = useStore((s) => s.sessions.find((x) => x.id === s.timer?.sessionId));
  const task = useStore((s) => s.tasks.find((t) => t.id === session?.taskId));
  const { pauseTimer, resumeTimer, advanceTimer, stopTimer, toggleSessionDone } = useStore.getState();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timer?.running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [timer?.running]);

  // Phase finished -> move to the next one and let the user know.
  useEffect(() => {
    if (!timer?.running || timer.endsAt === null || now < timer.endsAt) return;
    const next = timer.phases[timer.index + 1];
    advanceTimer();
    beep();
    notify(next ? (next.kind === 'break' ? 'Time for a break' : 'Back to focus') : 'Session complete', task?.title ?? '');
  }, [now, timer, task, advanceTimer]);

  if (!timer || !session || !task) return null;

  const phase = timer.phases[timer.index];
  const remaining = timer.finished ? 0 : timer.running && timer.endsAt ? Math.max(0, timer.endsAt - now) : timer.remainingMs;
  const phaseTotal = phase ? phase.minutes * MINUTE_MS : 1;
  const phaseProgress = timer.finished ? 1 : 1 - remaining / phaseTotal;

  // The flower grows with focus time across the whole session and blooms at the end.
  const focusTotal = timer.phases.filter((p) => p.kind === 'focus').reduce((s, p) => s + p.minutes, 0) * MINUTE_MS;
  const focusDone =
    timer.phases.slice(0, timer.index).filter((p) => p.kind === 'focus').reduce((s, p) => s + p.minutes, 0) * MINUTE_MS +
    (phase?.kind === 'focus' ? phaseTotal - remaining : 0);
  const growth = timer.finished ? 1 : Math.min(0.95, focusTotal ? focusDone / focusTotal : 0);

  const focusCount = timer.phases.filter((p) => p.kind === 'focus').length;
  const focusIndex = timer.phases.slice(0, timer.index + 1).filter((p) => p.kind === 'focus').length;
  const R = 46;
  const C = 2 * Math.PI * R;
  const mode = timer.finished ? 'finished' : phase.kind;

  return (
    <aside className={`focus-card ${mode}`} style={{ '--task-color': task.color } as CSSProperties} aria-live="polite">
      <div className="focus-head">
        <div>
          <span className="focus-mode">{timer.finished ? 'Done' : phase.kind === 'focus' ? `Focus ${focusIndex} of ${focusCount}` : 'Break'}</span>
          <span className="focus-task">{task.title}</span>
        </div>
        <button className="icon-btn" onClick={stopTimer} aria-label="Close timer">
          <X size={16} />
        </button>
      </div>
      <div className="focus-ring">
        <svg viewBox="0 0 110 110" aria-hidden>
          <circle cx="55" cy="55" r={R} className="ring-bg" />
          <circle
            cx="55"
            cy="55"
            r={R}
            className="ring-fg"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - phaseProgress)}
            transform="rotate(-90 55 55)"
          />
          <ellipse cx="55" cy="80" rx="20" ry="4" fill="#e3d8c0" />
          <g transform="translate(55 80) scale(1.05)">
            <Flower kind={flowerKindFor(task.id)} color={task.color} growth={growth} />
          </g>
        </svg>
      </div>
      <div className="focus-clock">{formatClock(remaining)}</div>
      {timer.finished ? (
        <div className="focus-actions">
          {session.done ? (
            <p className="muted small">Added to this week's garden.</p>
          ) : (
            <button
              className="primary"
              onClick={() => {
                toggleSessionDone(session.id);
                stopTimer();
              }}
            >
              <Check size={15} /> Tick off & plant it
            </button>
          )}
        </div>
      ) : (
        <div className="focus-actions">
          {timer.running ? (
            <button onClick={pauseTimer}>
              <Pause size={15} /> Pause
            </button>
          ) : (
            <button className="primary" onClick={resumeTimer}>
              <Play size={15} /> Resume
            </button>
          )}
          <button className="ghost" onClick={advanceTimer} title={phase.kind === 'focus' ? 'Skip to break' : 'Skip break'}>
            {phase.kind === 'focus' ? <Coffee size={15} /> : <SkipForward size={15} />} Skip
          </button>
        </div>
      )}
    </aside>
  );
}
