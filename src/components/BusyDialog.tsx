import { CalendarX2, EyeOff } from 'lucide-react';
import { Modal } from './Modal';
import { useStore } from '../store';
import type { BusyEvent } from '../types';

function when(e: BusyEvent): string {
  const day = e.start.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  if (e.allDay) return `${day} · all day`;
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${t(e.start)} – ${t(e.end)}`;
}

/** An imported timetable event: skip just this occurrence, or hide the whole series. */
export function BusyDialog({ event, onClose }: { event: BusyEvent; onClose(): void }) {
  const calendar = useStore((s) => s.calendars.find((c) => c.id === event.calendarId));
  const { hideOccurrence, hideSeries } = useStore.getState();

  return (
    <Modal title={event.title} onClose={onClose}>
      <p className="lede">{when(event)}</p>
      <p className="muted small">
        From <b>{calendar?.name ?? 'an imported calendar'}</b>
        {event.recurring ? ' · repeats' : ''}
      </p>
      <div className="choice-list">
        <button
          className="choice"
          onClick={() => {
            hideOccurrence(event.calendarId, event.key, event.title);
            onClose();
          }}
        >
          <CalendarX2 size={18} />
          <span>
            <b>{event.recurring ? 'Skip this one' : 'Hide this event'}</b>
            <small>{event.recurring ? 'Only this occurrence. Future ones stay.' : 'Frees up this time for planning.'}</small>
          </span>
        </button>
        {event.recurring && (
          <button
            className="choice"
            onClick={() => {
              hideSeries(event.calendarId, event.uid, event.title);
              onClose();
            }}
          >
            <EyeOff size={18} />
            <span>
              <b>Hide every “{event.title}”</b>
              <small>All past and future occurrences of this series.</small>
            </span>
          </button>
        )}
      </div>
      <p className="muted small">You can undo straight away, or restore hidden events later from Calendars.</p>
    </Modal>
  );
}
