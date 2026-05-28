// Shared loading / empty / error states + status chip for CMC surfaces.
// Status chips never rely on color alone (text + icon).

import * as React from 'react';
import { CmcIcon } from '../icons';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="cmc-state" role="status">{label}</div>;
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="cmc-state cmc-state-err" role="alert">
      {message ?? 'Could not load this data. Try again.'}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="cmc-state">{children}</div>;
}

export function NoProject() {
  return (
    <div className="cmc-state">
      Select a project to load Module 3 data.
    </div>
  );
}

type Tone = 'ok' | 'warn' | 'err' | 'dim';

const TONE_ICON: Record<Tone, string> = {
  ok: 'checkCircle',
  warn: 'warning',
  err: 'xCircle',
  dim: 'alertCircle',
};

/** Status chip — pairs a tone with a text label and a matching icon so the
 *  state is never conveyed by color alone. */
export function StatusChip({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`cmc-chip cmc-chip-${tone}`}>
      <CmcIcon name={TONE_ICON[tone]} />
      {label}
    </span>
  );
}
