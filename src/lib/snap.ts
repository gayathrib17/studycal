import { MINUTE_MS } from './time';

const QUARTER = 15 * MINUTE_MS;
const nearestQuarter = (d: Date) => new Date(Math.round(d.getTime() / QUARTER) * QUARTER);

/** Moved block: start on the nearest quarter hour, same length. */
export function snapMove(start: Date, end: Date): { start: Date; end: Date } {
  const snapped = nearestQuarter(start);
  return { start: snapped, end: new Date(snapped.getTime() + (end.getTime() - start.getTime())) };
}

/** Resized block: end on the nearest quarter hour, at least 15 minutes long. */
export function snapResize(start: Date, end: Date): { start: Date; end: Date } {
  const snapped = nearestQuarter(end);
  return { start, end: new Date(Math.max(snapped.getTime(), start.getTime() + QUARTER)) };
}
