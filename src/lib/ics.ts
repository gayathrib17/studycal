import ICAL from 'ical.js';
import type { BusyEvent, ImportedCalendar } from '../types';

/** Safety cap so a never-ending RRULE can't hang the browser. */
const MAX_ITERATIONS = 20_000;

/** An occurrence as parsed, before it is tied to a calendar. */
export type ParsedOccurrence = Omit<BusyEvent, 'id' | 'calendarId'>;

export interface ParsedCalendar {
  eventCount: number;
  /** All occurrences overlapping [rangeStart, rangeEnd). */
  expand(rangeStart: Date, rangeEnd: Date): ParsedOccurrence[];
}

function isCancelled(component: any): boolean {
  const status = component.getFirstPropertyValue('status');
  return typeof status === 'string' && status.toUpperCase() === 'CANCELLED';
}

/**
 * Parse iCalendar text (as exported by Google Calendar, Outlook or Apple Calendar).
 * Recurring events (RRULE/RDATE/EXDATE) and moved/cancelled single occurrences
 * (RECURRENCE-ID) are handled by ical.js. Throws on text that is not iCalendar.
 */
export function parseIcs(text: string): ParsedCalendar {
  const root = new ICAL.Component(ICAL.parse(text));
  if (root.name !== 'vcalendar') throw new Error('Not an iCalendar (.ics) file.');

  // Time zones must be registered before event times are read.
  for (const vtz of root.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(vtz);
  }

  const masters = new Map<string, any>();
  const singles: any[] = [];
  const exceptions: any[] = [];
  for (const vevent of root.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(vevent);
    if (event.isRecurrenceException()) exceptions.push(event);
    else if (event.uid && !masters.has(event.uid)) masters.set(event.uid, event);
    else singles.push(event);
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master && master.isRecurring()) master.relateException(ex);
    else singles.push(ex);
  }
  const events = [...masters.values(), ...singles];

  return {
    eventCount: events.length,
    expand(rangeStart, rangeEnd) {
      const out: ParsedOccurrence[] = [];
      const startMs = rangeStart.getTime();
      const endMs = rangeEnd.getTime();

      const push = (master: any, item: any, start: any, end: any, recurrence: string) => {
        if (isCancelled(item.component)) return;
        const s: Date = start.toJSDate();
        let e: Date = end ? end.toJSDate() : s;
        const allDay = Boolean(start.isDate);
        if (allDay && e.getTime() <= s.getTime()) e = new Date(s.getTime() + 86_400_000);
        if (e.getTime() <= startMs || s.getTime() >= endMs) return;
        const uid: string = master.uid || 'no-uid';
        out.push({
          key: `${uid}|${recurrence}`,
          uid,
          title: item.summary || '(busy)',
          start: s,
          end: e,
          allDay,
          recurring: master.isRecurring(),
        });
      };

      for (const event of events) {
        if (isCancelled(event.component)) continue;
        if (!event.isRecurring()) {
          push(event, event, event.startDate, event.endDate, event.startDate.toString());
          continue;
        }
        const it = event.iterator();
        for (let i = 0, next = it.next(); next && i < MAX_ITERATIONS; i++, next = it.next()) {
          if (next.toJSDate().getTime() >= endMs) break;
          const details = event.getOccurrenceDetails(next);
          push(event, details.item, details.startDate, details.endDate, next.toString());
        }
      }
      return out;
    },
  };
}

const cache = new Map<string, { text: string; parsed: ParsedCalendar }>();

/** Parse once per imported calendar; re-parses if the calendar's text changed (refresh). */
export function getParsedCalendar(id: string, text: string): ParsedCalendar {
  const hit = cache.get(id);
  if (hit && hit.text === text) return hit.parsed;
  const parsed = parseIcs(text);
  cache.set(id, { text, parsed });
  return parsed;
}

/** Expand every calendar for a range, leaving out occurrences and series the user hid. */
export function expandCalendars(
  calendars: Pick<ImportedCalendar, 'id' | 'icsText' | 'hidden' | 'hiddenSeries'>[],
  rangeStart: Date,
  rangeEnd: Date,
): BusyEvent[] {
  return calendars.flatMap((c) => {
    const hidden = new Set(c.hidden ?? []);
    const hiddenSeries = new Set(c.hiddenSeries ?? []);
    try {
      return getParsedCalendar(c.id, c.icsText)
        .expand(rangeStart, rangeEnd)
        .filter((e) => !hidden.has(e.key) && !hiddenSeries.has(e.uid))
        .map((e) => ({ ...e, id: `${c.id}|${e.key}`, calendarId: c.id }));
    } catch {
      return [];
    }
  });
}
