import { useEffect } from 'react';
import { useStore } from './store';
import { beep, notify } from './lib/alerts';
import { MINUTE_MS } from './lib/time';

/** Something that started less than this long ago still gets a reminder (e.g. tab just opened). */
const GRACE_MS = 10 * MINUTE_MS;

const due = (start: string, now: number) => {
  const t = Date.parse(start);
  return t <= now && t >= now - GRACE_MS;
};

/**
 * Checks every 20 s for study sessions and events that have just started and shows a reminder toast.
 * Works only while the page is open (background push needs a service worker + server; see README).
 */
export function useReminders() {
  useEffect(() => {
    const check = () => {
      const { sessions, events, tasks, settings, timer, markSessionReminded, markEventReminded, pushToast, startTimer } = useStore.getState();
      if (!settings.remindersEnabled) return;
      const now = Date.now();
      for (const s of sessions) {
        if (s.done || s.reminded || !due(s.start, now)) continue;
        markSessionReminded(s.id);
        if (timer?.sessionId === s.id) continue;
        const title = tasks.find((t) => t.id === s.taskId)?.title ?? 'Study session';
        pushToast({ kind: 'reminder', message: `Time to start ${title}`, action: { label: 'Start', run: () => startTimer(s.id) } });
        beep();
        notify('Time to study', title);
      }
      for (const e of events) {
        if (e.done || e.reminded || !due(e.start, now)) continue;
        markEventReminded(e.id);
        pushToast({ kind: 'reminder', message: `Now: ${e.title}` });
        beep();
        notify('Starting now', e.title);
      }
    };
    check();
    const id = window.setInterval(check, 20_000);
    return () => window.clearInterval(id);
  }, []);
}
