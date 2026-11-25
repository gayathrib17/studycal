import { useState, type FormEvent } from 'react';
import { Cloud, CloudAlert, CloudOff, CloudUpload, Download, LogOut, UserRound } from 'lucide-react';
import { downloadBackup } from '../lib/download';
import { Modal } from './Modal';
import type { SyncApi } from '../useSync';
import type { SyncStatus } from '../lib/sync';

function statusLabel(status: SyncStatus | null): { text: string; icon: typeof Cloud; tone: 'ok' | 'busy' | 'warn' } {
  switch (status?.kind) {
    case 'saving':
    case 'starting':
    case undefined:
      return { text: 'Syncing…', icon: CloudUpload, tone: 'busy' };
    case 'saved':
      return { text: 'Synced', icon: Cloud, tone: 'ok' };
    case 'offline':
      return { text: 'Offline', icon: CloudOff, tone: 'warn' };
    case 'choose':
      return { text: 'Needs you', icon: CloudAlert, tone: 'warn' };
    case 'error':
      return { text: 'Sync problem', icon: CloudAlert, tone: 'warn' };
  }
}

/** Top-bar button: "Sign in" when signed out, sync status when signed in. */
export function AccountButton({ sync, onOpen }: { sync: SyncApi; onOpen(): void }) {
  if (!sync.configured || sync.user === undefined) return null;
  if (!sync.user) {
    return (
      <button className="ghost" onClick={onOpen}>
        <UserRound size={16} /> <span className="hide-sm">Sign in</span>
      </button>
    );
  }
  const { text, icon: Icon, tone } = statusLabel(sync.status);
  return (
    <button className={`ghost sync-btn ${tone}`} onClick={onOpen} title={`Signed in as ${sync.user.email}`}>
      <Icon size={16} /> <span className="hide-sm">{text}</span>
    </button>
  );
}

export function AuthDialog({ sync, onClose }: { sync: SyncApi; onClose(): void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter your email address.');
    if (password.length < 8) return setError('Use a password of at least 8 characters.');
    setBusy(true);
    const problem = mode === 'in' ? await sync.signIn(email, password) : await sync.signUp(email, password);
    setBusy(false);
    if (problem) setError(problem);
    else onClose();
  };

  return (
    <Modal title={mode === 'in' ? 'Sign in' : 'Create an account'} onClose={onClose}>
      <p className="lede">Sign in to keep your planner in sync between your phone and laptop.</p>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {mode === 'up' && <p className="muted small">At least 8 characters. There’s no password reset yet, so keep it somewhere safe.</p>}
        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="link-btn" onClick={() => (setMode(mode === 'in' ? 'up' : 'in'), setError(null))}>
            {mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </button>
          <span className="spacer" />
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}
          </button>
        </div>
      </form>
      <p className="muted small">
        Your planner is stored in studycal’s database so it can follow you between devices. Other users can’t see it. Signing in is optional:
        without an account, everything stays in this browser only.
      </p>
    </Modal>
  );
}

export function AccountDialog({ sync, onClose }: { sync: SyncApi; onClose(): void }) {
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = sync.status;
  const { text } = statusLabel(status);
  const detail =
    status?.kind === 'saved'
      ? `Last synced ${new Date(status.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.`
      : status?.kind === 'offline'
        ? 'Changes are kept on this device and will sync when you’re back online.'
        : status?.kind === 'error'
          ? `The server refused the last save (${status.message}). It will try again shortly.`
          : '';

  return (
    <Modal title="Your account" onClose={onClose}>
      <p className="lede">{sync.user?.email}</p>
      <p className="muted">{status?.kind === 'saved' ? detail : `${text}. ${detail}`}</p>
      <label className="check-row">
        <input type="checkbox" checked={remove} onChange={(e) => setRemove(e.target.checked)} />
        Also remove my planner from this device (use this on a shared computer)
      </label>
      <div className="dialog-actions">
        <span className="spacer" />
        <button
          className="ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await sync.signOut(remove);
            onClose();
          }}
        >
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </Modal>
  );
}

/** Shown when both this device and the cloud have changes: never overwrite either silently. */
export function SyncChoiceDialog({ sync }: { sync: SyncApi }) {
  const status = sync.status;
  if (status?.kind !== 'choose') return null;
  const first = status.reason === 'first-sign-in';
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Choose which planner to keep">
        <header className="modal-header">
          <h2>Which planner do you want to keep?</h2>
        </header>
        <div className="modal-body">
          <p className="lede">
            {first
              ? 'Your account already has a planner saved, and this device has its own planner too.'
              : 'Your planner was changed on another device while this one also had unsaved changes.'}
          </p>
          <div className="choice-list">
            <button className="choice" onClick={sync.useCloud}>
              <Cloud size={18} />
              <span>
                <b>Use the one saved to my account</b>
                <small>Replaces what’s on this device.</small>
              </span>
            </button>
            <button className="choice" onClick={sync.useDevice}>
              <UserRound size={18} />
              <span>
                <b>Keep this device’s planner</b>
                <small>Replaces the one saved to your account.</small>
              </span>
            </button>
          </div>
          <p className="muted small">Not sure? Save a backup of this device’s planner first, then choose.</p>
          <div className="row">
            <button className="ghost" onClick={downloadBackup}>
              <Download size={15} /> Download backup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
