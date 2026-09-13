'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { buttonClass, type ButtonVariant } from './ui';

/**
 * Every server-action form in this app submits through one of these.
 *
 * `useFormStatus` only reports the state of the form it is rendered inside, so
 * a shared submit button is the cheapest way to make sure no action in the app
 * can sit there looking like nothing happened. Without it people tap twice and
 * plan the same meal two evenings running.
 */
export function SubmitButton({ children, pendingLabel, variant = 'secondary', className = '', disabled }: {
  children: ReactNode;
  pendingLabel?: ReactNode;
  variant?: ButtonVariant;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className={`${buttonClass(variant)} ${className}`}>
      {pending ? pendingLabel ?? <><Spinner /> {children}</> : children}
    </button>
  );
}

/** For the small × / ✓ controls, where a label would not fit. */
export function IconSubmit({ children, label, className = '' }: {
  children: ReactNode; label: string; className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={label}
      title={label}
      disabled={pending}
      className={`inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg transition disabled:opacity-40 ${className}`}
    >
      {pending ? <Spinner /> : children}
    </button>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]"
    />
  );
}

/**
 * Two-step destructive action.
 *
 * A `confirm()` dialog would do, but it is trivially dismissed by a mistap on a
 * phone and reads as a browser artefact. This puts the real button one
 * deliberate step away and gives it back if you wait.
 */
export function ConfirmSubmit({ label, confirmLabel, question, className = '' }: {
  label: string; confirmLabel: string; question: string; className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function arm() {
    setArmed(true);
    // Disarm on its own, so a half-finished delete never lies in wait.
    timer.current = setTimeout(() => setArmed(false), 8000);
  }

  if (!armed) {
    return (
      <button type="button" onClick={arm} className={`${buttonClass('danger')} ${className}`}>
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{question}</span>
      <SubmitButton variant="danger" pendingLabel={<><Spinner /> Wird gelöscht…</>}>
        {confirmLabel}
      </SubmitButton>
      <button type="button" onClick={() => setArmed(false)} className={buttonClass('ghost')}>
        Abbrechen
      </button>
    </div>
  );
}

/**
 * A form that collapses behind a button until it is needed.
 *
 * The weekly plan had seven of these open at once, which put three controls per
 * day on screen before a single meal was planned.
 */
export function Disclosure({ label, children, className = '' }: {
  label: string; children: ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full cursor-pointer rounded-lg border border-dashed border-line py-2 text-xs text-muted transition hover:border-accent hover:text-accent ${className}`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className={className}>
      {children}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-1 w-full cursor-pointer py-1 text-xs text-muted hover:text-ink"
      >
        Abbrechen
      </button>
    </div>
  );
}

/** Printing is a first-class path for a recipe; the browser menu hides it. */
export function PrintButton({ className = '' }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={`${buttonClass('ghost')} ${className}`}>
      Drucken
    </button>
  );
}
