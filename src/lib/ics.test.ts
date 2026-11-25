import { describe, expect, it } from 'vitest';
import { expandCalendars, parseIcs } from './ics';

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//test//EN',
  'BEGIN:VEVENT',
  'UID:lecture',
  'DTSTART:20260105T100000Z',
  'DTEND:20260105T110000Z',
  'RRULE:FREQ=WEEKLY;COUNT=4',
  'EXDATE:20260112T100000Z',
  'SUMMARY:Lecture',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:lecture',
  'RECURRENCE-ID:20260119T100000Z',
  'DTSTART:20260119T140000Z',
  'DTEND:20260119T150000Z',
  'SUMMARY:Lecture (moved)',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:single',
  'DTSTART:20260106T090000Z',
  'DTEND:20260106T093000Z',
  'SUMMARY:Dentist',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:cancelled',
  'DTSTART:20260107T090000Z',
  'DTEND:20260107T093000Z',
  'STATUS:CANCELLED',
  'SUMMARY:Cancelled',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:allday',
  'DTSTART;VALUE=DATE:20260108',
  'DTEND;VALUE=DATE:20260109',
  'SUMMARY:Holiday',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('parseIcs', () => {
  const cal = parseIcs(ICS);

  it('expands recurrences with EXDATE and moved occurrences, skips cancelled events', () => {
    const events = cal.expand(new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 1, 1)));
    const timed = events.filter((e) => !e.allDay).map((e) => [e.title, e.start.toISOString(), e.end.toISOString()]);
    expect(timed.sort((a, b) => a[1].localeCompare(b[1]))).toEqual([
      ['Lecture', '2026-01-05T10:00:00.000Z', '2026-01-05T11:00:00.000Z'],
      ['Dentist', '2026-01-06T09:00:00.000Z', '2026-01-06T09:30:00.000Z'],
      ['Lecture (moved)', '2026-01-19T14:00:00.000Z', '2026-01-19T15:00:00.000Z'],
      ['Lecture', '2026-01-26T10:00:00.000Z', '2026-01-26T11:00:00.000Z'],
    ]);
    const allDay = events.filter((e) => e.allDay);
    expect(allDay.map((e) => e.title)).toEqual(['Holiday']);
    expect(new Set(events.map((e) => e.key)).size).toBe(events.length);
  });

  it('only returns occurrences overlapping the range', () => {
    const events = cal.expand(new Date(Date.UTC(2026, 0, 19)), new Date(Date.UTC(2026, 0, 20)));
    expect(events.map((e) => e.title)).toEqual(['Lecture (moved)']);
  });

  it('applies VTIMEZONE offsets', () => {
    const tz = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VTIMEZONE',
      'TZID:Test/Plus2',
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0200',
      'END:STANDARD',
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      'UID:tz',
      'DTSTART;TZID=Test/Plus2:20260105T090000',
      'DTEND;TZID=Test/Plus2:20260105T100000',
      'SUMMARY:Class',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const [e] = parseIcs(tz).expand(new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 0, 10)));
    expect(e.start.toISOString()).toBe('2026-01-05T07:00:00.000Z');
  });

  it('rejects text that is not a calendar', () => {
    expect(() => parseIcs('hello')).toThrow();
  });

  it('marks recurring occurrences and gives each a stable key', () => {
    const events = cal.expand(new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 1, 1)));
    const lecture = events.filter((e) => e.uid === 'lecture');
    expect(lecture.every((e) => e.recurring)).toBe(true);
    expect(events.find((e) => e.uid === 'single')?.recurring).toBe(false);
    const again = cal.expand(new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 1, 1)));
    expect(again.map((e) => e.key)).toEqual(events.map((e) => e.key));
  });
});

describe('expandCalendars', () => {
  const range = [new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 1, 1))] as const;
  const lectures = (hidden?: string[], hiddenSeries?: string[]) =>
    expandCalendars([{ id: 'uni', icsText: ICS, hidden, hiddenSeries }], ...range).filter((e) => e.uid === 'lecture');

  it('skips just one occurrence', () => {
    const all = lectures();
    expect(all).toHaveLength(3);
    const skipped = lectures([all[0].key]);
    expect(skipped).toHaveLength(2);
    expect(skipped.map((e) => e.start.toISOString())).not.toContain(all[0].start.toISOString());
  });

  it('hides a whole series', () => {
    expect(lectures(undefined, ['lecture'])).toHaveLength(0);
  });

  it('tags events with their calendar and a globally unique id', () => {
    const events = expandCalendars([{ id: 'uni', icsText: ICS }], ...range);
    expect(events.every((e) => e.calendarId === 'uni' && e.id === `uni|${e.key}`)).toBe(true);
  });

  it('re-parses when a calendar is refreshed with new text', () => {
    const changed = ICS.replace('SUMMARY:Dentist', 'SUMMARY:Doctor');
    const before = expandCalendars([{ id: 'r', icsText: ICS }], ...range);
    const after = expandCalendars([{ id: 'r', icsText: changed }], ...range);
    expect(before.some((e) => e.title === 'Dentist')).toBe(true);
    expect(after.some((e) => e.title === 'Doctor')).toBe(true);
  });
});
