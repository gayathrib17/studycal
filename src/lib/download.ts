import { useStore } from '../store';

/** Save this device's planner as a JSON backup file. */
export function downloadBackup(): void {
  const blob = new Blob([useStore.getState().exportData()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `studycal-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
