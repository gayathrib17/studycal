import { useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { useStore, type Toast } from '../store';

/** Undo toasts disappear on their own; reminders stay until dealt with. */
const INFO_MS = 7000;

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useStore((s) => s.dismissToast);
  useEffect(() => {
    if (toast.kind !== 'info') return;
    const id = window.setTimeout(() => dismiss(toast.id), INFO_MS);
    return () => window.clearTimeout(id);
  }, [toast, dismiss]);

  return (
    <div className={`toast ${toast.kind}`} role="status">
      {toast.kind === 'reminder' && <Bell size={16} />}
      <span className="toast-msg">{toast.message}</span>
      {toast.action && (
        <button
          className="toast-action"
          onClick={() => {
            toast.action!.run();
            dismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button className="icon-btn" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
        <X size={15} />
      </button>
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
