import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Draggable } from '@fullcalendar/interaction';
import { Check, GripVertical, Pencil, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { taskProgress } from '../lib/progress';
import { parseLocalDate } from '../lib/scheduler';
import { startOfDay } from '../lib/time';
import type { Task } from '../types';

function dueLabel(due: string | undefined): { text: string; soon: boolean } | null {
  if (!due) return null;
  const ms = parseLocalDate(due);
  if (!Number.isFinite(ms)) return null;
  const days = Math.round((ms - startOfDay(new Date()).getTime()) / 86_400_000);
  if (days < 0) return { text: 'Overdue', soon: true };
  if (days === 0) return { text: 'Due today', soon: true };
  if (days === 1) return { text: 'Due tomorrow', soon: true };
  const date = new Date(ms);
  return {
    text: `Due ${days < 7 ? date.toLocaleDateString(undefined, { weekday: 'short' }) : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
    soon: days <= 3,
  };
}

/**
 * Two kinds of dragging live here and must not fight:
 *  - the card body (.cal-drag) is picked up by FullCalendar's Draggable (pointer events) to drop on the calendar;
 *  - the grip uses native HTML5 drag-and-drop to reorder priority.
 * They use different elements, so a drag always starts exactly one of them.
 */
export function TaskList({ onEdit }: { onEdit(task: Task): void }) {
  const tasks = useStore((s) => s.tasks);
  const sessions = useStore((s) => s.sessions);
  const { moveTask, toggleTaskDone, deleteTask } = useStore.getState();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Let FullCalendar accept task cards dropped onto the calendar. Data is read from the
  // card's data-* attributes at drag time, so it is always current.
  useEffect(() => {
    if (!containerRef.current) return;
    const draggable = new Draggable(containerRef.current, {
      itemSelector: '.cal-drag',
      eventData: (el) => ({
        title: el.dataset.title,
        duration: { minutes: Number(el.dataset.minutes) },
        backgroundColor: el.dataset.color,
        borderColor: el.dataset.color,
        create: true,
        extendedProps: { kind: 'incoming', taskId: el.dataset.taskId },
      }),
    });
    return () => draggable.destroy();
  }, []);

  const active = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  const card = (t: Task) => {
    const p = taskProgress(t, sessions);
    const pct = (v: number) => `${Math.min(100, p.target ? (v / p.target) * 100 : 0)}%`;
    const due = t.done ? null : dueLabel(t.dueDate);
    return (
      <li
        key={t.id}
        className={`task-card${p.fullyScheduled ? ' scheduled' : ''}${t.done ? ' done' : ''}${draggingId === t.id ? ' dragging' : ''}`}
        style={{ '--task-color': t.color } as CSSProperties}
        onDragOver={(e) => {
          if (!draggingId) return;
          e.preventDefault();
          if (draggingId !== t.id) moveTask(draggingId, t.id);
        }}
      >
        <button
          className={t.done ? 'task-check on' : 'task-check'}
          role="checkbox"
          aria-checked={t.done}
          aria-label={`Task "${t.title}" done`}
          title={t.done ? 'Mark as not done' : 'Mark the whole task done'}
          onClick={() => toggleTaskDone(t.id)}
        >
          <Check size={12} strokeWidth={3} />
        </button>
        <div
          className={t.done ? 'card-body' : 'card-body cal-drag'}
          title={t.done ? undefined : 'Drag onto the calendar to schedule a session'}
          data-task-id={t.id}
          data-title={t.title}
          data-minutes={t.planMode === 'hours' ? Math.min(t.sessionMinutes, p.remainingMinutes || t.sessionMinutes) : t.sessionMinutes}
          data-color={t.color}
        >
          <div className="card-top">
            <span className="card-title">{t.title}</span>
            {due && <span className={due.soon ? 'due soon' : 'due'}>{due.text}</span>}
          </div>
          {!t.done && (
            <>
              <div className="bar" aria-hidden>
                <span className="bar-scheduled" style={{ width: pct(p.scheduled) }} />
                <span className="bar-done" style={{ width: pct(p.done) }} />
              </div>
              <div className="meta">{p.label}</div>
            </>
          )}
        </div>
        <div className="card-actions">
          {!t.done && (
            <button className="icon-btn" onClick={() => onEdit(t)} aria-label={`Edit ${t.title}`} title="Edit">
              <Pencil size={14} />
            </button>
          )}
          <button className="icon-btn" onClick={() => deleteTask(t.id)} aria-label={`Delete ${t.title}`} title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
        {!t.done && (
          <span
            className="grip"
            draggable
            title="Drag to change priority"
            aria-label="Drag to change priority"
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', t.id);
              e.dataTransfer.effectAllowed = 'move';
              const li = e.currentTarget.parentElement;
              if (li) e.dataTransfer.setDragImage(li, 20, 20);
              setDraggingId(t.id);
            }}
            onDragEnd={() => setDraggingId(null)}
          >
            <GripVertical size={15} />
          </span>
        )}
      </li>
    );
  };

  return (
    <div className="task-list" ref={containerRef}>
      {active.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No tasks yet</p>
          <p className="muted small">Add what you need to study, then drag it onto a free slot, or let the planner do it.</p>
        </div>
      ) : (
        <ul>{active.map(card)}</ul>
      )}
      {done.length > 0 && (
        <details className="completed">
          <summary>Completed · {done.length}</summary>
          <ul>{done.map(card)}</ul>
        </details>
      )}
    </div>
  );
}
