import { useState, type FormEvent } from 'react';
import { Link2, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Modal } from './Modal';
import { CALENDAR_DEFAULT_COLOR, PALETTE, useStore } from '../store';
import { parseIcs } from '../lib/ics';

/** localStorage is ~5 MB per site; keep imported calendars well under it. */
const MAX_BYTES = 2_000_000;

/** webcal:// is just https:// for calendar apps. */
export function normaliseCalendarUrl(raw: string): string | null {
  const v = raw.trim().replace(/^webcals?:\/\//i, 'https://');
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

async function fetchCalendar(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(
      "That calendar's server doesn't let websites read it directly. Open the link in a new tab to download the .ics file, then upload it here.",
    );
  }
  if (!res.ok) throw new Error(`The calendar server answered ${res.status}. Check the link is still valid.`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('That calendar is over 2 MB. Try exporting just your timetable.');
  return text;
}

function validate(text: string): number {
  const parsed = parseIcs(text);
  if (parsed.eventCount === 0) throw new Error('No events found in that calendar.');
  return parsed.eventCount;
}

export function ImportDialog({ onClose }: { onClose(): void }) {
  const calendars = useStore((s) => s.calendars);
  const { addCalendar, updateCalendar, removeCalendar, restoreHidden } = useStore.getState();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const report = (fn: () => Promise<void>, key: string) => async () => {
    setError(null);
    setMessage(null);
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onFile = (file: File | undefined) =>
    report(async () => {
      if (!file) return;
      if (file.size > MAX_BYTES) throw new Error('That file is over 2 MB. Export just your timetable calendar rather than your whole account.');
      const text = await file.text();
      let count: number;
      try {
        count = validate(text);
      } catch (e) {
        throw e instanceof Error && e.message.startsWith('No events') ? e : new Error('Could not read that file. Make sure it is an .ics calendar export.');
      }
      addCalendar({ name: file.name.replace(/\.ics$/i, ''), icsText: text });
      setMessage(`Imported ${count} event${count === 1 ? '' : 's'} from ${file.name}.`);
    }, 'file')();

  const onLink = (e: FormEvent) => {
    e.preventDefault();
    void report(async () => {
      const url = normaliseCalendarUrl(link);
      if (!url) throw new Error('That doesn’t look like a calendar link.');
      const text = await fetchCalendar(url);
      const count = validate(text);
      addCalendar({ name: new URL(url).hostname.replace(/^www\./, ''), icsText: text, url });
      setLink('');
      setMessage(`Subscribed: ${count} events imported. Use Refresh to pull changes.`);
    }, 'link')();
  };

  const refresh = (id: string, url: string) =>
    report(async () => {
      const text = await fetchCalendar(url);
      validate(text);
      updateCalendar(id, { icsText: text, importedAt: new Date().toISOString() });
      setMessage('Calendar refreshed.');
    }, id)();

  return (
    <Modal title="Calendars" onClose={onClose} wide>
      <p className="lede">Bring in your uni timetable or personal calendar. The planner works around it, and you can skip any single lecture.</p>

      <div className="import-grid">
        <label className="dropzone">
          <Upload size={20} />
          <b>Upload an .ics file</b>
          <small>Google, Outlook, Apple or your uni portal</small>
          <input type="file" accept=".ics,text/calendar" onChange={(e) => onFile(e.target.files?.[0])} disabled={busy !== null} />
        </label>
        <form className="link-form" onSubmit={onLink}>
          <span className="field-label">
            <Link2 size={15} /> Or paste a subscription link
          </span>
          <input placeholder="webcal://… or https://….ics" value={link} onChange={(e) => setLink(e.target.value)} aria-label="Calendar link" />
          <button type="submit" disabled={!link.trim() || busy !== null}>
            {busy === 'link' ? 'Fetching…' : 'Subscribe'}
          </button>
        </form>
      </div>
      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}

      {calendars.length > 0 && (
        <>
          <h3>Your calendars</h3>
          <ul className="cal-list">
            {calendars.map((c) => {
              const hiddenCount = (c.hidden?.length ?? 0) + (c.hiddenSeries?.length ?? 0);
              return (
                <li key={c.id}>
                  <div className="cal-row">
                    <span className="cal-dot" style={{ background: c.color ?? CALENDAR_DEFAULT_COLOR }} />
                    <div className="cal-info">
                      <b>{c.name}</b>
                      <small>
                        {c.url ? 'Subscribed' : 'Uploaded'}
                        {c.importedAt ? ` · updated ${new Date(c.importedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}
                        {hiddenCount > 0 && (
                          <>
                            {' · '}
                            {hiddenCount} hidden{' '}
                            <button className="link-btn" onClick={() => restoreHidden(c.id)}>
                              Restore
                            </button>
                          </>
                        )}
                      </small>
                    </div>
                    {c.url && (
                      <button className="icon-btn" onClick={() => refresh(c.id, c.url!)} disabled={busy !== null} aria-label={`Refresh ${c.name}`} title="Refresh">
                        <RefreshCw size={16} className={busy === c.id ? 'spin' : ''} />
                      </button>
                    )}
                    <button className="icon-btn" onClick={() => removeCalendar(c.id)} aria-label={`Remove ${c.name}`} title="Remove">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="swatches small" role="radiogroup" aria-label={`Colour for ${c.name}`}>
                    {[CALENDAR_DEFAULT_COLOR, ...PALETTE].map((col) => (
                      <button
                        key={col}
                        role="radio"
                        aria-checked={(c.color ?? CALENDAR_DEFAULT_COLOR) === col}
                        aria-label={col}
                        className={(c.color ?? CALENDAR_DEFAULT_COLOR) === col ? 'swatch-btn on' : 'swatch-btn'}
                        style={{ background: col }}
                        onClick={() => updateCalendar(c.id, { color: col })}
                      />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <details className="help">
        <summary>Where do I find my calendar file?</summary>
        <ul className="small">
          <li>
            <b>Google Calendar:</b> Settings → your calendar → <i>Integrate calendar</i> → “Secret address in iCal format” (link), or Settings → Import &amp; export → Export (file).
          </li>
          <li>
            <b>Outlook:</b> Settings → Calendar → Shared calendars → Publish a calendar → ICS link.
          </li>
          <li>
            <b>Apple Calendar:</b> File → Export → Export….
          </li>
          <li>
            <b>Uni timetable:</b> look for “Subscribe”, “Export to calendar” or “iCal” in your timetable portal.
          </li>
        </ul>
      </details>
    </Modal>
  );
}
