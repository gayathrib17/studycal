import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Modal } from './Modal';
import { RhythmPicker } from './RhythmPicker';
import { useStore } from '../store';
import { parseHHMM } from '../lib/time';
import { downloadBackup } from '../lib/download';
import type { Settings } from '../types';

type NumericKey = {
  [K in keyof Settings]: Settings[K] extends number ? K : never;
}[keyof Settings];
type TimeKey = 'dayStart' | 'dayEnd' | 'lunchStart' | 'lunchEnd' | 'dinnerStart' | 'dinnerEnd';

const PLANNER_FIELDS: { key: NumericKey; label: string; unit: string; min: number; max: number }[] = [
  { key: 'maxStudyMinutesPerDay', label: 'Study on a normal day', unit: 'min', min: 15, max: 1440 },
  { key: 'gapMinutes', label: 'Gap between blocks', unit: 'min', min: 0, max: 120 },
  { key: 'maxSessionsPerTaskPerDay', label: 'Max sessions of one task a day', unit: '', min: 1, max: 20 },
  { key: 'planHorizonDays', label: 'Plan ahead', unit: 'days', min: 1, max: 90 },
];
const TIMER_FIELDS: { key: NumericKey; label: string; unit: string; min: number; max: number }[] = [
  { key: 'defaultSessionMinutes', label: 'Default session', unit: 'min', min: 5, max: 600 },
  { key: 'focusMinutes', label: 'Focus', unit: 'min', min: 1, max: 180 },
  { key: 'breakMinutes', label: 'Break', unit: 'min', min: 0, max: 60 },
];

function NumberField({ label, unit, value, min, max, onChange }: { label: string; unit: string; value: string; min: number; max: number; onChange(v: string): void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="input-unit">
        <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} />
        {unit && <em>{unit}</em>}
      </span>
    </label>
  );
}

export function SettingsDialog({ onClose, signedIn = false }: { onClose(): void; signedIn?: boolean }) {
  const settings = useStore((s) => s.settings);
  const { importData, updateSettings } = useStore.getState();
  const [draft, setDraft] = useState<Settings>(settings);
  const [nums, setNums] = useState<Record<string, string>>(() =>
    Object.fromEntries([...PLANNER_FIELDS, ...TIMER_FIELDS].map((f) => [f.key, String(settings[f.key])])),
  );
  const [error, setError] = useState<string | null>(null);
  const [dataMsg, setDataMsg] = useState<string | null>(null);
  const [permission, setPermission] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const fileRef = useRef<HTMLInputElement>(null);

  const time = (key: TimeKey, label: string) => (
    <label className="field">
      <span>{label}</span>
      <input type="time" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
    </label>
  );

  const save = () => {
    const pairs: [TimeKey, TimeKey, string, boolean][] = [
      ['dayStart', 'dayEnd', 'Study day', true],
      ['lunchStart', 'lunchEnd', 'Lunch', draft.lunchEnabled],
      ['dinnerStart', 'dinnerEnd', 'Dinner', draft.dinnerEnabled],
    ];
    for (const [a, b, label, check] of pairs) {
      const s = parseHHMM(draft[a]);
      const e = parseHHMM(draft[b]);
      if (check && (!Number.isFinite(s) || !Number.isFinite(e) || e <= s)) return setError(`${label}: the start must be before the end.`);
    }
    const patch: Settings = { ...draft };
    for (const f of [...PLANNER_FIELDS, ...TIMER_FIELDS]) {
      const v = Number(nums[f.key]);
      if (!Number.isInteger(v) || v < f.min || v > f.max) return setError(`${f.label}: enter a whole number ${f.min}–${f.max}.`);
      patch[f.key] = v;
    }
    updateSettings(patch);
    onClose();
  };

  const download = downloadBackup;

  const restore = async (file: File | undefined) => {
    setDataMsg(null);
    if (!file) return;
    try {
      importData(await file.text());
      onClose();
    } catch (e) {
      setDataMsg(e instanceof Error ? e.message : String(e));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Modal title="Settings" onClose={onClose} wide>
      <section className="settings-section">
        <h3>Study day</h3>
        <p className="muted small">Used by <b>Plan my week</b>. To move sessions it already planned, open Plan my week and keep “Rearrange” ticked.</p>
        <div className="settings-grid">
          {time('dayStart', 'Earliest start')}
          {time('dayEnd', 'Latest finish')}
        </div>
      </section>

      <section className="settings-section">
        <h3>Meals</h3>
        <div className="meal-row">
          <label className="check-row">
            <input type="checkbox" checked={draft.lunchEnabled} onChange={(e) => setDraft({ ...draft, lunchEnabled: e.target.checked })} /> Keep lunch free
          </label>
          {time('lunchStart', 'From')}
          {time('lunchEnd', 'To')}
        </div>
        <div className="meal-row">
          <label className="check-row">
            <input type="checkbox" checked={draft.dinnerEnabled} onChange={(e) => setDraft({ ...draft, dinnerEnabled: e.target.checked })} /> Keep dinner free
          </label>
          {time('dinnerStart', 'From')}
          {time('dinnerEnd', 'To')}
        </div>
      </section>

      <section className="settings-section">
        <h3>Weekly rhythm</h3>
        <RhythmPicker value={draft.dayLoad} onChange={(dayLoad) => setDraft({ ...draft, dayLoad })} />
      </section>

      <section className="settings-section">
        <h3>Planner</h3>
        <div className="settings-grid">
          {PLANNER_FIELDS.map((f) => (
            <NumberField key={f.key} label={f.label} unit={f.unit} min={f.min} max={f.max} value={nums[f.key]} onChange={(v) => setNums({ ...nums, [f.key]: v })} />
          ))}
        </div>
        <label className="check-row">
          <input type="checkbox" checked={draft.spreadEvenly} onChange={(e) => setDraft({ ...draft, spreadEvenly: e.target.checked })} />
          Spread work evenly across the days
        </label>
      </section>

      <section className="settings-section">
        <h3>Focus timer</h3>
        <div className="settings-grid three">
          {TIMER_FIELDS.map((f) => (
            <NumberField key={f.key} label={f.label} unit={f.unit} min={f.min} max={f.max} value={nums[f.key]} onChange={(v) => setNums({ ...nums, [f.key]: v })} />
          ))}
        </div>
        <label className="check-row">
          <input type="checkbox" checked={draft.remindersEnabled} onChange={(e) => setDraft({ ...draft, remindersEnabled: e.target.checked })} />
          Remind me when a session or event starts
        </label>
        {draft.remindersEnabled && permission === 'default' && (
          <button type="button" className="ghost" onClick={() => Notification.requestPermission().then(setPermission)}>
            Also allow desktop notifications
          </button>
        )}
        {draft.remindersEnabled && permission === 'denied' && (
          <p className="muted small">Desktop notifications are blocked in your browser, so reminders show inside the page.</p>
        )}
      </section>

      <section className="settings-section">
        <h3>Your data</h3>
        <p className="muted small">
          Your planner is stored in this browser{signedIn ? ' and synced to your account' : ' only'}. Download a backup to keep a copy safe
          {signedIn ? '' : ' or move it to another device (or sign in to sync)'}.
        </p>
        <div className="row">
          <button type="button" onClick={download}>
            <Download size={15} /> Download backup
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Restore backup
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => restore(e.target.files?.[0])} />
        </div>
        {dataMsg && <p className="error">{dataMsg}</p>}
      </section>

      {error && <p className="error">{error}</p>}
      <div className="dialog-actions">
        <span className="spacer" />
        <button className="ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="primary" onClick={save}>
          Save
        </button>
      </div>
    </Modal>
  );
}
