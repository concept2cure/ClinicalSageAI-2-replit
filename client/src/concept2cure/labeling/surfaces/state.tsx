// Shared loading / empty / error states + status chip for labeling surfaces.
// Status chips never rely on color alone (text + icon) — WCAG 2.2 AA.

import * as React from 'react';
import { LabelingIcon } from '../icons';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="lb-state" role="status">{label}</div>;
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="lb-state lb-state-err" role="alert">
      {message ?? 'Could not load this data. Try again.'}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="lb-state">{children}</div>;
}

export function NoProject() {
  return (
    <div className="lb-state">
      Select a project to load its labeling documents.
    </div>
  );
}

type Tone = 'ok' | 'warn' | 'err' | 'review' | 'dim';

const TONE_ICON: Record<Tone, string> = {
  ok: 'checkCircle',
  warn: 'warning',
  err: 'xCircle',
  review: 'alertCircle',
  dim: 'alertCircle',
};

/** Status chip — pairs a tone with a text label and a matching icon so the
 *  state is never conveyed by color alone. */
export function StatusChip({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`lb-chip lb-chip-${tone}`}>
      <LabelingIcon name={TONE_ICON[tone]} />
      {label}
    </span>
  );
}

/** Map a labeling document status to a chip tone. */
export function docStatusTone(status: string): Tone {
  const v = (status || '').toLowerCase();
  if (v === 'approved' || v === 'effective') return 'ok';
  if (v === 'review') return 'review';
  if (v === 'superseded') return 'dim';
  return 'dim'; // draft
}

/** Map a translation status to a chip tone. */
export function transStatusTone(status: string): Tone {
  const v = (status || '').toLowerCase();
  if (v === 'approved') return 'ok';
  if (v === 'review' || v === 'in_progress') return 'review';
  if (v === 'rejected') return 'err';
  return 'warn'; // pending
}
