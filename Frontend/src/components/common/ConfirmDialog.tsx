import React, { useEffect } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' renders a red confirm button for destructive actions (Block/Report). */
  tone?: 'brand' | 'danger';
  loading?: boolean;
  /** Disables the confirm button without hiding it (e.g. invalid report reason). */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Optional extra content between the message and the buttons (e.g. the report reason form). */
  children?: React.ReactNode;
}

/**
 * Reusable confirmation modal used by Block and Report on the profile view
 * (and any future destructive action). Overlay click and Escape cancel;
 * the dialog never closes itself on confirm — the caller decides once the
 * request settles (loading state is driven from the page).
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'brand',
  loading = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const confirmStyles =
    tone === 'danger'
      ? 'text-white bg-brand-error-text hover:brightness-110 shadow-lg shadow-brand-error-text/25'
      : 'text-white bg-gradient-to-br from-brand-start via-brand-mid to-brand-end shadow-lg shadow-brand-accent/25 hover:brightness-105';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={() => !loading && onCancel()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md bg-brand-surface rounded-3xl shadow-2xl p-6 sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-black text-brand-text mb-2">{title}</h2>

        {message && (
          <p className="text-sm text-brand-muted leading-relaxed mb-4">{message}</p>
        )}

        {children && <div className="mb-4">{children}</div>}

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="min-h-[44px] px-6 py-3 rounded-full font-bold text-sm tracking-wider uppercase text-brand-muted hover:text-brand-text hover:bg-brand-bg transition-all duration-200 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || confirmDisabled}
            className={`min-h-[44px] px-6 py-3 rounded-full font-bold text-sm tracking-wider uppercase transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${confirmStyles}`}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
