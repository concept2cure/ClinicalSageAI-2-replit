// Shared loading / empty / error states + chips for risk surfaces.
// Status and band chips never rely on color alone — every chip pairs a tone
// with a text label and a matching icon, and risk scores carry their numeric
// value — WCAG 2.2 AA (color is never the only signal).

import * as React from 'react';
import { RiskIcon } from '../icons';
import { type RiskBand, RISK_BAND_LABEL } from '../data/nav';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="risk-state" role="status">{label}</div>;
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="risk-state risk-state-err" role="alert">
      {message ?? 'Could not load this data. Try again.'}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="risk-state">{children}</div>;
}

export function NoProject() {
  return (
    <div className="risk-state">
      Select a project to load its risk file.
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
    <span className={`risk-chip risk-chip-${tone}`}>
      <RiskIcon name={TONE_ICON[tone]} />
      {label}
    </span>
  );
}

/** Map a risk-item status to a chip tone. */
export function itemStatusTone(status: string): Tone {
  const v = (status || '').toLowerCase();
  if (v === 'verified' || v === 'closed') return 'ok';
  if (v === 'accepted') return 'review';
  if (v === 'mitigating') return 'warn';
  return 'dim'; // open
}

/** Map a control status to a chip tone. */
export function controlStatusTone(status: string): Tone {
  const v = (status || '').toLowerCase();
  if (v === 'verified' || v === 'effective') return 'ok';
  if (v === 'implemented') return 'review';
  return 'warn'; // proposed
}

/** Acceptability-band pill. The band word (Acceptable / ALARP / Unacceptable)
 *  carries the meaning so it never depends on color alone. */
export function BandPill({ band }: { band: RiskBand }) {
  return <span className={`risk-band risk-band-${band}`}>{RISK_BAND_LABEL[band]}</span>;
}

/** A severity × probability score chip. Renders the numeric product and the
 *  factors so the score is legible without color (color is decorative only). */
export function ScoreChip({ severity, probability, band }: { severity: number; probability: number; band: RiskBand }) {
  return (
    <span className={`risk-score risk-score-${band}`} title={`Severity ${severity} × probability ${probability}`}>
      {severity}×{probability}
      <span className="risk-score-eq"> = {severity * probability}</span>
    </span>
  );
}
