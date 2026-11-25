import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { DEFAULT_SETTINGS, useStore } from './store';
import { syncConfigured } from './config';
import { getSupabase, supabaseBackend } from './lib/syncBackend';
import { SyncEngine, type SyncData, type SyncMeta, type SyncStatus } from './lib/sync';

const META_KEY = 'studycal-sync';

const readMeta = (): SyncMeta => {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as SyncMeta;
  } catch {
    return {};
  }
};
const writeMeta = (m: SyncMeta) => localStorage.setItem(META_KEY, JSON.stringify(m));

const pickData = (): SyncData => {
  const { tasks, sessions, events, calendars, settings } = useStore.getState();
  return { tasks, sessions, events, calendars, settings };
};

/** Friendly messages for the auth errors people actually hit. */
function authMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Wrong email or password.';
  if (/already registered|already exists/i.test(message)) return 'There is already an account with this email. Sign in instead.';
  if (/password should be at least/i.test(message)) return 'Use a password of at least 8 characters.';
  if (/unable to validate email|invalid format|email address .* is invalid/i.test(message)) return 'That email address doesn’t look right.';
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Please wait a minute and try again.';
  if (/fetch|network/i.test(message)) return 'Can’t reach the server. Check your connection.';
  return message;
}

export interface SyncApi {
  configured: boolean;
  /** Undefined while the saved sign-in is being restored. */
  user: User | null | undefined;
  status: SyncStatus | null;
  signIn(email: string, password: string): Promise<string | null>;
  signUp(email: string, password: string): Promise<string | null>;
  signOut(removeFromDevice: boolean): Promise<void>;
  useCloud(): void;
  useDevice(): void;
}

/**
 * Sign-in plus cloud sync. While signed in, the planner is loaded from and saved to the person's own
 * row in Supabase; signed out, the app works exactly as before (browser only).
 */
export function useSync(): SyncApi {
  const sb = getSupabase();
  const [user, setUser] = useState<User | null | undefined>(sb ? undefined : null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);

  // Restore the saved sign-in and follow sign-in / sign-out.
  useEffect(() => {
    if (!sb) return;
    let alive = true;
    sb.auth.getSession().then(({ data }) => alive && setUser(data.session?.user ?? null));
    const { data } = sb.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [sb]);

  const userId = user?.id;
  useEffect(() => {
    if (!sb || !userId) {
      setStatus(null);
      return;
    }
    let applying = false;
    const engine = new SyncEngine(supabaseBackend(sb, userId), {
      getLocal: pickData,
      applyRemote: (d) => {
        applying = true;
        useStore.setState({
          tasks: d.tasks ?? [],
          sessions: d.sessions ?? [],
          events: d.events ?? [],
          calendars: d.calendars ?? [],
          settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) },
          proposal: null,
        });
        applying = false;
      },
      isLocalEmpty: () => {
        const s = useStore.getState();
        return s.tasks.length + s.sessions.length + s.events.length + s.calendars.length === 0;
      },
      readMeta,
      writeMeta,
      onStatus: setStatus,
    }, userId);
    engineRef.current = engine;

    const unsubscribe = useStore.subscribe((s, prev) => {
      if (applying) return;
      if (s.tasks !== prev.tasks || s.sessions !== prev.sessions || s.events !== prev.events || s.calendars !== prev.calendars || s.settings !== prev.settings) {
        engine.localChanged();
      }
    });
    const refresh = () => {
      if (document.visibilityState === 'visible') void engine.refresh();
    };
    const flush = () => void engine.flush();
    // Also check now and then, so a tab left open on another screen picks up changes on its own.
    const poll = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pagehide', flush);
    void engine.start();

    return () => {
      unsubscribe();
      window.clearInterval(poll);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pagehide', flush);
      void engine.flush().finally(() => engine.stop());
      engineRef.current = null;
    };
  }, [sb, userId]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!sb) return 'Sync is not available.';
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      return error ? authMessage(error.message) : null;
    },
    [sb],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!sb) return 'Sync is not available.';
      const { data, error } = await sb.auth.signUp({ email: email.trim(), password });
      if (error) return authMessage(error.message);
      // With "Confirm email" on, Supabase returns no session until the email link is clicked.
      if (!data.session) return 'Check your inbox to confirm your email, then sign in.';
      return null;
    },
    [sb],
  );

  const signOut = useCallback(
    async (removeFromDevice: boolean) => {
      if (!sb) return;
      // Save anything pending, then stop syncing BEFORE touching local data. Otherwise clearing this
      // device would look like "the person deleted everything" and be uploaded over their cloud copy.
      const engine = engineRef.current;
      engineRef.current = null;
      if (engine) {
        await engine.flush();
        engine.stop();
      }
      await sb.auth.signOut();
      if (removeFromDevice) {
        useStore.setState({ tasks: [], sessions: [], events: [], calendars: [], settings: DEFAULT_SETTINGS, proposal: null, timer: null });
        localStorage.removeItem(META_KEY);
      }
    },
    [sb],
  );

  return {
    configured: syncConfigured,
    user,
    status,
    signIn,
    signUp,
    signOut,
    useCloud: () => engineRef.current?.useCloud(),
    useDevice: () => void engineRef.current?.useDevice(),
  };
}
