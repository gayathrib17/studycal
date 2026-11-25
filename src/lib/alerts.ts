let audio: AudioContext | null = null;

/** Short two-note chime. Silently does nothing if audio is unavailable. */
export function beep(): void {
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.18;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  } catch {
    /* ignore */
  }
}

/** Desktop notification if the user allowed them; otherwise nothing. */
export function notify(title: string, body: string): void {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, { body });
    } catch {
      /* some browsers only allow notifications from a service worker */
    }
  }
}
