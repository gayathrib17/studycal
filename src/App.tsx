import { useEffect, useState } from 'react';
import { CalendarDays, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import { nextColor, useStore } from './store';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
import { CalendarView } from './components/CalendarView';
import { SessionDialog } from './components/SessionDialog';
import { EventDialog, type EventDialogMode } from './components/EventDialog';
import { BusyDialog } from './components/BusyDialog';
import { ImportDialog } from './components/ImportDialog';
import { PlanDialog } from './components/PlanDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { PomodoroPanel } from './components/PomodoroPanel';
import { Garden } from './components/Garden';
import { Toasts } from './components/Toasts';
import { Logo } from './components/Logo';
import { Modal } from './components/Modal';
import { useReminders } from './useReminders';
import { formatMinutes } from './lib/time';
import type { BusyEvent, Task } from './types';

type Dialog =
  | { kind: 'import' }
  | { kind: 'plan' }
  | { kind: 'settings' }
  | { kind: 'session'; id: string }
  | { kind: 'event'; mode: EventDialogMode }
  | { kind: 'busy'; event: BusyEvent }
  | { kind: 'editTask'; task: Task }
  | null;

export default function App() {
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const proposal = useStore((s) => s.proposal);
  const { addTask, updateTask, acceptProposal, setProposal } = useStore.getState();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  useReminders();

  // Leaving with an unaccepted plan would silently lose it.
  useEffect(() => {
    if (!proposal) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [proposal]);

  const taskTitle = (id: string) => tasks.find((t) => t.id === id)?.title ?? 'task';
  const activeCount = tasks.filter((t) => !t.done).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span className="wordmark">studycal</span>
        </div>
        <nav className="top-actions">
          <button className="ghost" onClick={() => setDialog({ kind: 'import' })}>
            <CalendarDays size={16} /> <span className="hide-sm">Calendars</span>
          </button>
          <button className="primary" onClick={() => setDialog({ kind: 'plan' })}>
            <Sparkles size={16} /> <span>Plan my week</span>
          </button>
          <button className="icon-btn" onClick={() => setDialog({ kind: 'settings' })} aria-label="Settings" title="Settings">
            <SettingsIcon size={18} />
          </button>
        </nav>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <Garden />
          <section className="tasks">
            <h2 className="section-title">
              Tasks {activeCount > 0 && <span className="count">{activeCount}</span>}
            </h2>
            <TaskForm
              key={tasks.length}
              compact
              defaultColor={nextColor(tasks)}
              defaultSessionMinutes={settings.defaultSessionMinutes}
              submitLabel="Add task"
              onSubmit={addTask}
            />
            <TaskList onEdit={(task) => setDialog({ kind: 'editTask', task })} />
            {activeCount > 0 && <p className="hint">Drag a task onto the calendar to book a session. Drag the handle to reorder by priority.</p>}
          </section>
        </aside>

        <section className="calendar-pane">
          {proposal && (
            <div className="proposal-bar" role="status">
              <div>
                <b>
                  {proposal.sessions.length} session{proposal.sessions.length === 1 ? '' : 's'} suggested
                </b>
                <span className="muted">
                  {' '}
                  · shown dashed on the calendar
                  {proposal.replaces.length > 0 && ` · replaces ${proposal.replaces.length} earlier planned`}
                </span>
                {proposal.unplaced.length > 0 && (
                  <div className="muted small">
                    Didn't fit:{' '}
                    {proposal.unplaced.map((u) => `${taskTitle(u.taskId)} (${formatMinutes(u.minutes)})`).join(', ')}. Try more days, a later finish, or
                    lighter limits in Settings.
                  </div>
                )}
              </div>
              <div className="row">
                <button className="ghost" onClick={() => setProposal(null)}>
                  Discard
                </button>
                <button className="primary" onClick={acceptProposal} disabled={proposal.sessions.length === 0}>
                  Add to calendar
                </button>
              </div>
            </div>
          )}
          <CalendarView
            onOpenSession={(id) => setDialog({ kind: 'session', id })}
            onOpenEvent={(id) => setDialog({ kind: 'event', mode: { kind: 'edit', id } })}
            onOpenBusy={(event) => setDialog({ kind: 'busy', event })}
            onCreate={(start, end) => setDialog({ kind: 'event', mode: { kind: 'new', start, end } })}
          />
        </section>
      </main>

      <PomodoroPanel />
      <Toasts />

      {dialog?.kind === 'session' && <SessionDialog sessionId={dialog.id} onClose={close} />}
      {dialog?.kind === 'event' && <EventDialog mode={dialog.mode} onClose={close} />}
      {dialog?.kind === 'busy' && <BusyDialog event={dialog.event} onClose={close} />}
      {dialog?.kind === 'import' && <ImportDialog onClose={close} />}
      {dialog?.kind === 'plan' && <PlanDialog onClose={close} />}
      {dialog?.kind === 'settings' && <SettingsDialog onClose={close} />}
      {dialog?.kind === 'editTask' && (
        <Modal title="Edit task" onClose={close}>
          <TaskForm
            initial={dialog.task}
            defaultColor={dialog.task.color}
            defaultSessionMinutes={settings.defaultSessionMinutes}
            submitLabel="Save"
            onSubmit={(input) => {
              updateTask(dialog.task.id, input);
              close();
            }}
            onCancel={close}
          />
        </Modal>
      )}
    </div>
  );
}
