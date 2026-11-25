import type { CalEvent, ImportedCalendar, Session, Settings, Task } from '../types';

/** Everything that is saved for a person (the same fields the browser persists). */
export interface SyncData {
  tasks: Task[];
  sessions: Session[];
  events: CalEvent[];
  calendars: ImportedCalendar[];
  settings: Settings;
}

export interface RemoteState {
  data: SyncData;
  version: number;
}

/** Storage for one signed-in person's planner. The Supabase version lives in `syncBackend.ts`. */
export interface SyncBackend {
  load(): Promise<RemoteState | null>;
  /** First save for this person. Returns the new version, or 'conflict' if a row already exists. */
  create(data: SyncData): Promise<number | 'conflict'>;
  /** Save only if the stored version is still `expected`. Returns the new version, or 'conflict'. */
  update(data: SyncData, expected: number): Promise<number | 'conflict'>;
}

/** What this device remembers about its last successful sync. */
export interface SyncMeta {
  userId?: string;
  version?: number;
  /** Local changes that haven't reached the cloud yet. */
  dirty?: boolean;
}

export type SyncStatus =
  | { kind: 'starting' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'offline' }
  /** Cloud and this device both have changes; the person must pick one. */
  | { kind: 'choose'; reason: 'first-sign-in' | 'edited-elsewhere' }
  | { kind: 'error'; message: string };

export interface SyncHooks {
  getLocal(): SyncData;
  /** Replace this device's data with the cloud copy. Must not call `localChanged`. */
  applyRemote(data: SyncData): void;
  isLocalEmpty(): boolean;
  readMeta(): SyncMeta;
  writeMeta(meta: SyncMeta): void;
  onStatus(status: SyncStatus): void;
}

const RETRY_MS = 15_000;
const SERVER_RETRY_MS = 60_000;

/**
 * Thrown by a backend when the server answered but refused (e.g. permissions, payload too large).
 * Anything else thrown is treated as "offline" and retried sooner.
 */
export class SyncServerError extends Error {}

/**
 * Keeps one person's planner in sync between this device and the cloud.
 *
 * - On sign-in it compares the cloud copy with this device's copy and the version it last synced:
 *   uploads if the cloud is empty, downloads if this device has nothing new, and asks (`choose`) when
 *   both sides have changes — nothing is ever overwritten silently.
 * - Local edits are saved after a short pause, using the version number as a guard so another device's
 *   newer save is never overwritten.
 * - `refresh()` (on tab focus / coming back online) pulls newer cloud data.
 */
export class SyncEngine {
  private version: number | null = null;
  private remote: RemoteState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> | null = null;
  /** Bumped on every local edit, so a save that raced with a newer edit doesn't clear `dirty`. */
  private changeCount = 0;
  private stopped = false;
  private choosing = false;

  constructor(
    private backend: SyncBackend,
    private hooks: SyncHooks,
    private userId: string,
    private debounceMs = 1500,
  ) {}

  async start(): Promise<void> {
    this.hooks.onStatus({ kind: 'starting' });
    let remote: RemoteState | null;
    try {
      remote = await this.backend.load();
    } catch (e) {
      return this.offline(e);
    }
    if (this.stopped) return;
    const meta = this.hooks.readMeta();
    const sameUser = meta.userId === this.userId;
    // Data on this device that belongs to someone else (or was never synced) counts as unsynced work.
    const localHasWork = !this.hooks.isLocalEmpty() && (!sameUser || meta.dirty === true || meta.version === undefined);

    if (!remote) {
      const created = await this.safe(() => this.backend.create(this.hooks.getLocal()));
      if (created === undefined) return;
      if (created === 'conflict') return this.start(); // another device created it first
      return this.markSynced(created);
    }
    this.remote = remote;
    if (sameUser && meta.version === remote.version) {
      this.version = remote.version;
      return meta.dirty ? this.save() : this.markSynced(remote.version);
    }
    if (!localHasWork || (sameUser && !meta.dirty)) return this.takeRemote(remote);
    this.ask(sameUser ? 'edited-elsewhere' : 'first-sign-in');
  }

  /** The person chose the cloud copy. */
  useCloud(): void {
    if (!this.remote) return;
    this.choosing = false;
    this.takeRemote(this.remote);
  }

  /** The person chose this device's copy: overwrite the cloud with it. */
  async useDevice(): Promise<void> {
    if (!this.remote) return;
    this.choosing = false;
    this.version = this.remote.version;
    this.hooks.writeMeta({ userId: this.userId, version: this.version, dirty: true });
    await this.save();
  }

  /** Call after every local edit. */
  localChanged(): void {
    if (this.stopped) return;
    this.changeCount++;
    this.hooks.writeMeta({ ...this.hooks.readMeta(), userId: this.userId, dirty: true });
    if (this.choosing || this.version === null) return;
    this.schedule(this.debounceMs);
  }

  /** Save any pending change right away (e.g. before the page closes). */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.saving) await this.saving;
    if (this.hooks.readMeta().dirty && this.version !== null && !this.choosing) await this.save();
  }

  /** Pull newer cloud data, e.g. when the tab regains focus. */
  async refresh(): Promise<void> {
    if (this.stopped || this.choosing) return;
    if (this.version === null) return this.start();
    let remote: RemoteState | null;
    try {
      remote = await this.backend.load();
    } catch (e) {
      return this.offline(e);
    }
    if (!remote || remote.version <= this.version) {
      if (this.hooks.readMeta().dirty) await this.save();
      return;
    }
    this.remote = remote;
    if (this.hooks.readMeta().dirty) this.ask('edited-elsewhere');
    else this.takeRemote(remote);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.save();
    }, ms);
  }

  private async save(): Promise<void> {
    if (this.stopped || this.version === null) return;
    if (this.saving) {
      await this.saving;
      if (this.hooks.readMeta().dirty) return this.save();
      return;
    }
    const startedAt = this.changeCount;
    const expected = this.version;
    this.hooks.onStatus({ kind: 'saving' });
    this.saving = (async () => {
      const result = await this.safe(() => this.backend.update(this.hooks.getLocal(), expected));
      if (result === undefined) return;
      if (result === 'conflict') {
        try {
          this.remote = await this.backend.load();
        } catch (e) {
          return this.offline(e);
        }
        if (this.remote) this.ask('edited-elsewhere');
        return;
      }
      this.version = result;
      const stillDirty = this.changeCount !== startedAt;
      this.hooks.writeMeta({ userId: this.userId, version: result, dirty: stillDirty });
      this.hooks.onStatus({ kind: 'saved', at: Date.now() });
      if (stillDirty) this.schedule(this.debounceMs);
    })();
    try {
      await this.saving;
    } finally {
      this.saving = null;
    }
  }

  private takeRemote(remote: RemoteState) {
    this.hooks.applyRemote(remote.data);
    this.version = remote.version;
    this.hooks.writeMeta({ userId: this.userId, version: remote.version, dirty: false });
    this.hooks.onStatus({ kind: 'saved', at: Date.now() });
  }

  private markSynced(version: number) {
    this.version = version;
    this.hooks.writeMeta({ userId: this.userId, version, dirty: false });
    this.hooks.onStatus({ kind: 'saved', at: Date.now() });
  }

  private ask(reason: 'first-sign-in' | 'edited-elsewhere') {
    this.choosing = true;
    this.hooks.onStatus({ kind: 'choose', reason });
  }

  private offline(error?: unknown) {
    const server = error instanceof SyncServerError;
    this.hooks.onStatus(server ? { kind: 'error', message: error.message } : { kind: 'offline' });
    if (!this.stopped) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(
        () => {
          this.timer = null;
          void (this.version === null ? this.start() : this.refresh());
        },
        server ? SERVER_RETRY_MS : RETRY_MS,
      );
    }
  }

  /** Run a backend call; failures switch to offline/error mode (with a retry) and return undefined. */
  private async safe<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (e) {
      this.offline(e);
      return undefined;
    }
  }
}
