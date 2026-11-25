export const MINUTE_MS = 60_000;

function toMs(d: string | Date): number {
  return typeof d === 'string' ? Date.parse(d) : d.getTime();
}

export function minutesBetween(start: string | Date, end: string | Date): number {
  return Math.round((toMs(end) - toMs(start)) / MINUTE_MS);
}

/** 90 -> "1h 30m", 120 -> "2h", 25 -> "25m". */
export function formatMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

/** "08:30" -> 510. Invalid input returns NaN. */
export function parseHHMM(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** Local date at a given minute of the day (handles DST via the Date API). */
export function atMinuteOfDay(day: Date, minuteOfDay: number): Date {
  const r = startOfDay(day);
  r.setHours(0, minuteOfDay, 0, 0);
  return r;
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

/** Local calendar-day key, e.g. "2026-01-05". */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function roundUpToStep(d: Date, stepMinutes: number): Date {
  const step = stepMinutes * MINUTE_MS;
  return new Date(Math.ceil(d.getTime() / step) * step);
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
