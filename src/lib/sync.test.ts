import { describe, expect, it } from 'vitest';
import { SyncEngine, SyncServerError, type RemoteState, type SyncBackend, type SyncData, type SyncMeta, type SyncStatus } from './sync';
import { DEFAULT_SETTINGS } from '../store';

const data = (...titles: string[]): SyncData => ({
  tasks: titles.map((t) => ({ id: t, title: t, color: '#000', planMode: 'hours', targetMinutes: 60, sessionMinutes: 50, done: false })),
  sessions: [],
  events: [],
  calendars: [],
  settings: DEFAULT_SETTINGS,
});
const titles = (d: SyncData | undefined) => d?.tasks.map((t) => t.title) ?? [];

/** In-memory cloud with the same version rules as the real table. */
class FakeCloud {
  row: RemoteState | null = null;
  down = false;
  refuse = false;
  backend(): SyncBackend {
    const guard = () => {
      if (this.refuse) throw new SyncServerError('permission denied');
      if (this.down) throw new Error('Failed to fetch');
    };
    return {
      load: async () => {
        guard();
        return this.row ? structuredClone(this.row) : null;
      },
      create: async (d) => {
        guard();
        if (this.row) return 'conflict';
        this.row = { data: structuredClone(d), version: 1 };
        return 1;
      },
      update: async (d, expected) => {
        guard();
        if (!this.row || this.row.version !== expected) return 'conflict';
        this.row = { data: structuredClone(d), version: expected + 1 };
        return expected + 1;
      },
    };
  }
}

/** One device: its own local data, sync metadata and status log. */
class Device {
  local: SyncData;
  meta: SyncMeta = {};
  statuses: SyncStatus[] = [];
  engine: SyncEngine;
  constructor(cloud: FakeCloud, userId: string, local: SyncData = data()) {
    this.local = local;
    this.engine = new SyncEngine(
      cloud.backend(),
      {
        getLocal: () => this.local,
        applyRemote: (d) => (this.local = structuredClone(d)),
        isLocalEmpty: () => this.local.tasks.length + this.local.sessions.length + this.local.events.length + this.local.calendars.length === 0,
        readMeta: () => this.meta,
        writeMeta: (m) => (this.meta = { ...m }),
        onStatus: (st) => this.statuses.push(st),
      },
      userId,
      0,
    );
  }
  get status() {
    return this.statuses[this.statuses.length - 1]?.kind;
  }
  async edit(...more: string[]) {
    this.local = data(...titles(this.local), ...more);
    this.engine.localChanged();
    await this.engine.flush();
  }
}

describe('SyncEngine: signing in', () => {
  it('uploads this device when the cloud is empty', async () => {
    const cloud = new FakeCloud();
    const phone = new Device(cloud, 'u1', data('Anatomy'));
    await phone.engine.start();
    expect(titles(cloud.row?.data)).toEqual(['Anatomy']);
    expect(phone.status).toBe('saved');
    expect(phone.meta).toEqual({ userId: 'u1', version: 1, dirty: false });
  });

  it('downloads the cloud copy onto an empty new device', async () => {
    const cloud = new FakeCloud();
    await new Device(cloud, 'u1', data('Anatomy')).engine.start();
    const laptop = new Device(cloud, 'u1');
    await laptop.engine.start();
    expect(titles(laptop.local)).toEqual(['Anatomy']);
  });

  it('asks which copy to keep when both the device and the cloud have data', async () => {
    const cloud = new FakeCloud();
    await new Device(cloud, 'u1', data('Cloud task')).engine.start();
    const laptop = new Device(cloud, 'u1', data('Laptop task'));
    await laptop.engine.start();
    expect(laptop.statuses.at(-1)).toEqual({ kind: 'choose', reason: 'first-sign-in' });
    expect(titles(laptop.local)).toEqual(['Laptop task']); // nothing overwritten yet
    expect(titles(cloud.row?.data)).toEqual(['Cloud task']);
  });

  it('keeps the cloud copy when chosen', async () => {
    const cloud = new FakeCloud();
    await new Device(cloud, 'u1', data('Cloud task')).engine.start();
    const laptop = new Device(cloud, 'u1', data('Laptop task'));
    await laptop.engine.start();
    laptop.engine.useCloud();
    expect(titles(laptop.local)).toEqual(['Cloud task']);
    expect(laptop.status).toBe('saved');
  });

  it("keeps this device's copy when chosen, and uploads it", async () => {
    const cloud = new FakeCloud();
    await new Device(cloud, 'u1', data('Cloud task')).engine.start();
    const laptop = new Device(cloud, 'u1', data('Laptop task'));
    await laptop.engine.start();
    await laptop.engine.useDevice();
    expect(titles(cloud.row?.data)).toEqual(['Laptop task']);
    expect(cloud.row?.version).toBe(2);
  });

  it("treats another person's leftover data on this device as needing a choice", async () => {
    const cloud = new FakeCloud();
    await new Device(cloud, 'bob', data("Bob's task")).engine.start();
    const shared = new Device(cloud, 'bob', data("Alice's task"));
    shared.meta = { userId: 'alice', version: 3, dirty: false };
    await shared.engine.start();
    expect(shared.status).toBe('choose');
  });

  it('picks up where it left off when nothing changed in the cloud', async () => {
    const cloud = new FakeCloud();
    const phone = new Device(cloud, 'u1', data('A'));
    await phone.engine.start();
    phone.engine.stop();
    const again = new Device(cloud, 'u1', phone.local);
    again.meta = phone.meta;
    await again.engine.start();
    expect(again.status).toBe('saved');
    expect(cloud.row?.version).toBe(1); // no needless upload
  });
});

describe('SyncEngine: editing', () => {
  it('saves local edits and bumps the version', async () => {
    const cloud = new FakeCloud();
    const phone = new Device(cloud, 'u1', data('A'));
    await phone.engine.start();
    await phone.edit('B');
    expect(titles(cloud.row?.data)).toEqual(['A', 'B']);
    expect(cloud.row?.version).toBe(2);
    expect(phone.meta.dirty).toBe(false);
  });

  it("pulls another device's newer save on refresh", async () => {
    const cloud = new FakeCloud();
    const phone = new Device(cloud, 'u1', data('A'));
    await phone.engine.start();
    const laptop = new Device(cloud, 'u1');
    await laptop.engine.start();
    await laptop.edit('From laptop');
    await phone.engine.refresh();
    expect(titles(phone.local)).toEqual(['A', 'From laptop']);
  });

  it('never overwrites a newer save from another device: it asks instead', async () => {
    const cloud = new FakeCloud();
    const phone = new Device(cloud, 'u1', data('A'));
    await phone.engine.start();
    const laptop = new Device(cloud, 'u1');
    await laptop.engine.start();
    await laptop.edit('From laptop');
    await phone.edit('From phone'); // phone hasn't seen the laptop's save
    expect(titles(cloud.row?.data)).toEqual(['A', 'From laptop']);
    expect(phone.statuses.at(-1)).toEqual({ kind: 'choose', reason: 'edited-elsewhere' });
  });

  it('keeps edits made offline and saves them once back online', async () => {
    const cloud = new FakeCloud();
    const phone = new Device(cloud, 'u1', data('A'));
    await phone.engine.start();
    cloud.down = true;
    await phone.edit('Offline edit');
    expect(phone.status).toBe('offline');
    expect(phone.meta.dirty).toBe(true);
    cloud.down = false;
    await phone.engine.refresh();
    expect(titles(cloud.row?.data)).toEqual(['A', 'Offline edit']);
    expect(phone.meta.dirty).toBe(false);
    phone.engine.stop();
  });

  it('reports a server refusal as an error, not as offline', async () => {
    const cloud = new FakeCloud();
    const phone = new Device(cloud, 'u1', data('A'));
    await phone.engine.start();
    cloud.refuse = true;
    await phone.edit('B');
    expect(phone.statuses.at(-1)).toEqual({ kind: 'error', message: 'permission denied' });
    phone.engine.stop();
  });

  it('does not save while waiting for the person to choose', async () => {
    const cloud = new FakeCloud();
    await new Device(cloud, 'u1', data('Cloud task')).engine.start();
    const laptop = new Device(cloud, 'u1', data('Laptop task'));
    await laptop.engine.start();
    await laptop.edit('More');
    expect(titles(cloud.row?.data)).toEqual(['Cloud task']);
  });

  it('ignores edits after stop (e.g. clearing the device on sign-out never reaches the cloud)', async () => {
    const cloud = new FakeCloud();
    const phone = new Device(cloud, 'u1', data('A', 'B'));
    await phone.engine.start();
    await phone.engine.flush();
    phone.engine.stop();
    phone.local = data();
    phone.engine.localChanged();
    await phone.engine.flush();
    expect(titles(cloud.row?.data)).toEqual(['A', 'B']);
  });
});

