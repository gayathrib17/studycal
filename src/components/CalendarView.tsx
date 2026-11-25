import { useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { type EventReceiveArg, type EventResizeDoneArg } from '@fullcalendar/interaction';
import type {
  DateSelectArg,
  DatesSetArg,
  DayHeaderContentArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
} from '@fullcalendar/core';
import { Check, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { CALENDAR_DEFAULT_COLOR, useStore } from '../store';
import { expandCalendars } from '../lib/ics';
import { MINUTE_MS, atMinuteOfDay, parseHHMM } from '../lib/time';
import { tint } from '../lib/color';
import { snapMove, snapResize } from '../lib/snap';
import type { BusyEvent } from '../types';

type ViewName = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth';
const VIEWS: { name: ViewName; label: string }[] = [
  { name: 'timeGridDay', label: 'Day' },
  { name: 'timeGridWeek', label: 'Week' },
  { name: 'dayGridMonth', label: 'Month' },
];

interface Props {
  onOpenSession(id: string): void;
  onOpenEvent(id: string): void;
  onOpenBusy(event: BusyEvent): void;
  onCreate(start: Date, end: Date): void;
}

export function CalendarView({ onOpenSession, onOpenEvent, onOpenBusy, onCreate }: Props) {
  const tasks = useStore((s) => s.tasks);
  const sessions = useStore((s) => s.sessions);
  const userEvents = useStore((s) => s.events);
  const calendars = useStore((s) => s.calendars);
  const proposal = useStore((s) => s.proposal);
  const dayStart = useStore((s) => s.settings.dayStart);
  const calRef = useRef<FullCalendar>(null);
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const [title, setTitle] = useState('');
  const [view, setView] = useState<ViewName>(() => (window.innerWidth < 760 ? 'timeGridDay' : 'timeGridWeek'));

  const events = useMemo<EventInput[]>(() => {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const calColor = new Map(calendars.map((c) => [c.id, c.color ?? CALENDAR_DEFAULT_COLOR]));
    const out: EventInput[] = [];

    if (range) {
      for (const e of expandCalendars(calendars, range.start, range.end)) {
        const color = calColor.get(e.calendarId) ?? CALENDAR_DEFAULT_COLOR;
        out.push({
          id: `busy|${e.id}`,
          title: e.title,
          start: e.start,
          end: e.end,
          allDay: e.allDay,
          editable: false,
          backgroundColor: tint(color, 0.2),
          borderColor: color,
          textColor: '#3e4540',
          classNames: ['ev-busy'],
          extendedProps: { kind: 'busy', busy: e },
        });
      }
    }

    for (const ev of userEvents) {
      out.push({
        id: `event|${ev.id}`,
        title: ev.title,
        start: ev.start,
        end: ev.end,
        backgroundColor: tint(ev.color, ev.done ? 0.12 : 0.24),
        borderColor: ev.color,
        textColor: '#26302a',
        classNames: ev.done ? ['ev-user', 'ev-done'] : ['ev-user'],
        extendedProps: { kind: 'event', refId: ev.id, done: ev.done },
      });
    }

    // While previewing a re-plan, hide the sessions it would move so the preview isn't cluttered.
    const replaced = new Set(proposal?.replaces ?? []);
    for (const s of sessions) {
      const task = byId.get(s.taskId);
      if (!task || replaced.has(s.id)) continue;
      out.push({
        id: s.id,
        title: task.title,
        start: s.start,
        end: s.end,
        backgroundColor: tint(task.color, s.done ? 0.14 : 0.3),
        borderColor: task.color,
        textColor: '#26302a',
        classNames: s.done ? ['ev-session', 'ev-done'] : ['ev-session'],
        extendedProps: { kind: 'session', refId: s.id, done: s.done },
      });
    }

    for (const s of proposal?.sessions ?? []) {
      const task = byId.get(s.taskId);
      if (!task) continue;
      out.push({
        id: `proposal|${s.id}`,
        title: task.title,
        start: s.start,
        end: s.end,
        editable: false,
        backgroundColor: tint(task.color, 0.1),
        borderColor: task.color,
        textColor: '#26302a',
        classNames: ['ev-proposed'],
        extendedProps: { kind: 'proposal' },
      });
    }
    return out;
  }, [tasks, sessions, userEvents, calendars, proposal, range]);

  const { addSession, updateSessionTime, updateEvent, toggleSessionDone, toggleEventDone, startTimer } = useStore.getState();
  const api = () => calRef.current?.getApi();
  const startMinuteOfDay = () => {
    const m = parseHHMM(dayStart);
    return Number.isFinite(m) ? m : 540;
  };

  const onReceive = (info: EventReceiveArg) => {
    const taskId = info.event.extendedProps.taskId as string | undefined;
    const startRaw = info.event.start;
    const allDay = info.event.allDay;
    const minutes = Number(info.draggedEl.dataset.minutes) || 50;
    // The temporary event FullCalendar created is replaced by one rendered from the store.
    info.event.remove();
    if (!taskId || !startRaw) return;
    // Dropped on a whole day (month view): start at the beginning of the study day.
    const start = allDay ? atMinuteOfDay(startRaw, startMinuteOfDay()) : startRaw;
    addSession(taskId, start, new Date(start.getTime() + minutes * MINUTE_MS));
  };

  const onMoveOrResize = (info: EventDropArg | EventResizeDoneArg) => {
    const { event } = info;
    const { kind, refId } = event.extendedProps as { kind: string; refId?: string };
    if (!event.start || !event.end || !refId || (kind !== 'session' && kind !== 'event')) {
      info.revert();
      return;
    }
    // FullCalendar snaps how far you drag, not where you land, so a block that started at 1:40 could only
    // move to 7:55 or 8:10. Snap the result to the clock's quarter hours instead.
    const { start, end } = 'delta' in info ? snapMove(event.start, event.end) : snapResize(event.start, event.end);
    if (kind === 'session') updateSessionTime(refId, start, end);
    else updateEvent(refId, { start: start.toISOString(), end: end.toISOString() });
  };

  const onClick = (info: EventClickArg) => {
    const { kind, refId, busy } = info.event.extendedProps as { kind: string; refId?: string; busy?: BusyEvent };
    const action = (info.jsEvent.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (kind === 'busy' && busy) return onOpenBusy(busy);
    if (!refId) return;
    if (kind === 'session') {
      if (action === 'toggle') toggleSessionDone(refId);
      else if (action === 'start') startTimer(refId);
      else onOpenSession(refId);
    } else if (kind === 'event') {
      if (action === 'toggle') toggleEventDone(refId);
      else onOpenEvent(refId);
    }
  };

  const onSelect = (info: DateSelectArg) => {
    api()?.unselect();
    let { start, end } = info;
    if (info.allDay) {
      start = atMinuteOfDay(start, startMinuteOfDay());
      end = new Date(start.getTime() + 60 * MINUTE_MS);
    } else if (end.getTime() - start.getTime() <= 30 * MINUTE_MS) {
      // A single click selects one slot; give it a normal one-hour length like other calendars.
      end = new Date(start.getTime() + 60 * MINUTE_MS);
    }
    onCreate(start, end);
  };

  const onDatesSet = (arg: DatesSetArg) => {
    setTitle(arg.view.title);
    setRange((prev) =>
      prev && prev.start.getTime() === arg.start.getTime() && prev.end.getTime() === arg.end.getTime()
        ? prev
        : { start: arg.start, end: arg.end },
    );
  };

  const changeView = (v: ViewName) => {
    setView(v);
    api()?.changeView(v);
  };

  return (
    <div className="calendar">
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button onClick={() => api()?.today()}>Today</button>
          <button className="icon-btn" onClick={() => api()?.prev()} aria-label="Previous">
            <ChevronLeft size={18} />
          </button>
          <button className="icon-btn" onClick={() => api()?.next()} aria-label="Next">
            <ChevronRight size={18} />
          </button>
          <h2 className="cal-title">{title}</h2>
        </div>
        <div className="segmented" role="tablist" aria-label="Calendar view">
          {VIEWS.map((v) => (
            <button key={v.name} role="tab" aria-selected={view === v.name} className={view === v.name ? 'on' : ''} onClick={() => changeView(v.name)}>
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <div className="cal-body">
        <FullCalendar
          ref={calRef}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView={view}
          headerToolbar={false}
          firstDay={1}
          height="100%"
          nowIndicator
          editable
          droppable
          selectable
          selectMirror
          eventDurationEditable
          slotDuration="00:30:00"
          snapDuration="00:15:00"
          scrollTime={dayStart || '08:00'}
          allDaySlot
          // Sessions and events are timed blocks: don't let them be dropped into the all-day row.
          eventAllow={(dropInfo) => !dropInfo.allDay}
          events={events}
          eventReceive={onReceive}
          eventDrop={onMoveOrResize}
          eventResize={onMoveOrResize}
          eventClick={onClick}
          select={onSelect}
          datesSet={onDatesSet}
          eventContent={renderEvent}
          dayHeaderContent={renderDayHeader}
          slotLabelFormat={{ hour: 'numeric', meridiem: 'short' }}
          dayMaxEvents
        />
      </div>
    </div>
  );
}

function renderDayHeader(arg: DayHeaderContentArg) {
  // Month view headers are weekday names only.
  if (arg.view.type === 'dayGridMonth') return <span className="dh-weekday">{arg.text}</span>;
  return (
    <div className="dh">
      <span className="dh-weekday">{arg.date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
      <span className={arg.isToday ? 'dh-date today' : 'dh-date'}>{arg.date.getDate()}</span>
    </div>
  );
}

function renderEvent(arg: EventContentArg) {
  const { kind, done } = arg.event.extendedProps as { kind: string; done?: boolean };
  const checkable = kind === 'session' || kind === 'event';
  return (
    <div className="ev">
      {checkable && (
        <span
          data-action="toggle"
          className={done ? 'ev-check on' : 'ev-check'}
          role="checkbox"
          aria-checked={Boolean(done)}
          title={done ? 'Mark not done' : 'Tick off'}
        >
          {done && <Check size={10} strokeWidth={3} />}
        </span>
      )}
      <div className="ev-text">
        <span className="ev-title">{arg.event.title}</span>
        {arg.timeText && <span className="ev-time">{arg.timeText}</span>}
      </div>
      {kind === 'session' && !done && (
        <span data-action="start" className="ev-start" title="Start focus timer" role="button" aria-label="Start focus timer">
          <Play size={9} fill="currentColor" />
        </span>
      )}
    </div>
  );
}
