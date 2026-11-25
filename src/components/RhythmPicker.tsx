import type { DayLoad } from '../types';

// Displayed Monday-first; values are stored by Date.getDay() index (0 = Sunday).
const DAYS: { index: number; label: string }[] = [
  { index: 1, label: 'Mon' },
  { index: 2, label: 'Tue' },
  { index: 3, label: 'Wed' },
  { index: 4, label: 'Thu' },
  { index: 5, label: 'Fri' },
  { index: 6, label: 'Sat' },
  { index: 0, label: 'Sun' },
];
const NEXT: Record<DayLoad, DayLoad> = { normal: 'light', light: 'off', off: 'normal' };
const LABEL: Record<DayLoad, string> = { normal: 'Normal', light: 'Light', off: 'Off' };

/** Seven chips; clicking one cycles Normal → Light → Off. */
export function RhythmPicker({ value, onChange }: { value: DayLoad[]; onChange(next: DayLoad[]): void }) {
  return (
    <div className="rhythm" role="group" aria-label="Weekly rhythm">
      {DAYS.map(({ index, label }) => {
        const load = value[index] ?? 'normal';
        return (
          <button
            type="button"
            key={index}
            className={`rhythm-day ${load}`}
            aria-label={`${label}: ${LABEL[load]}. Click to change.`}
            onClick={() => {
              const next = [...value];
              next[index] = NEXT[load];
              onChange(next);
            }}
          >
            <span className="rhythm-name">{label}</span>
            <span className="rhythm-bar" aria-hidden />
            <span className="rhythm-load">{LABEL[load]}</span>
          </button>
        );
      })}
    </div>
  );
}
