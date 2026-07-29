// Shared loading / empty / error states + status pills, ACK-chain, and finding
// chips for the submission gateway surfaces.
//
// A11y (WCAG 2.2 AA): transmittal status, ACK levels, and finding severity never
// rely on color alone. Each pairs a tone with a text label and (for status /
// findings) a matching icon. ACK cells carry an aria-label spelling out the
// level + state. Loading uses role=status; errors use role=alert.

import * as React from 'react';
import { SubmissionIcon } from '../icons';
import { statusLabel, type AckState } from '../data/nav';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="sub-state" role="status">{label}</div>;
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="sub-state sub-state-err" role="alert">
      {message ?? 'Could not load this data. Try again.'}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="sub-state">{children}</div>;
}

export type Tone = 'ok' | 'warn' | 'err' | 'info' | 'dim';

const TONE_ICON: Record<Tone, string> = {
  ok: 'checkCircle',
  warn: 'clock',
  err: 'xCircle',
  info: 'alertCircle',
  dim: 'clock',
};

/** Map a raw transmittal status to a chip tone. */
export function statusTone(status: string): Tone {
  const v = (status || '').toLowerCase();
  if (v === 'completed' || v === 'ack3_received' || v === 'validation_passed') return 'ok';
  if (v === 'rejected' || v === 'validation_failed') return 'err';
  if (v === 'review_started') return 'ok';
  if (v === 'pending') return 'dim';
  return 'warn'; // in_transit / received / ack1 / ack2 / response_required
}

/** Status pill — pairs a tone with a text label and a matching icon so the
 *  state is never conveyed by color alone. */
export function StatusPill({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <span className={`sub-pill sub-pill-${tone}`}>
      <SubmissionIcon name={TONE_ICON[tone]} size={12} />
      {statusLabel(status)}
    </span>
  );
}

const ACK_TEXT: Record<AckState, string> = {
  received: 'received',
  pending: 'pending',
  failed: 'failed',
  na: 'not applicable',
};

/** ACK 1/2/3 lights — the regulatory transmit-receipt chain. Each cell carries
 *  an aria-label spelling out the level and state, and a glyph (check / dash /
 *  cross) so the meaning never depends on color alone. */
export function AckChain({ ack }: { ack: { a1: AckState; a2: AckState; a3: AckState } }) {
  const cell = (level: string, v: AckState) => {
    const glyph = v === 'received' ? '✓' : v === 'failed' ? '✗' : v === 'na' ? '–' : '·';
    return (
      <span key={level} className={`sub-ack sub-ack-${v}`}
            aria-label={`ACK ${level}: ${ACK_TEXT[v]}`} title={`ACK ${level}: ${ACK_TEXT[v]}`}>
        <span aria-hidden="true">{level}</span>
        <span className="sub-ack-glyph" aria-hidden="true">{glyph}</span>
      </span>
    );
  };
  return (
    <span className="sub-ackchain" role="group" aria-label="Acknowledgement chain">
      {cell('1', ack.a1)}{cell('2', ack.a2)}{cell('3', ack.a3)}
    </span>
  );
}

/** Map a finding severity to a tone. */
export function findingTone(severity: string): Tone {
  const v = (severity || '').toLowerCase();
  if (v === 'error') return 'err';
  if (v === 'warning') return 'warn';
  return 'ok'; // info / ok / pass
}

const FINDING_ICON: Record<Tone, string> = {
  ok: 'checkCircle',
  warn: 'warning',
  err: 'warning',
  info: 'alertCircle',
  dim: 'alertCircle',
};

/** Finding severity icon — paired with the severity word so meaning never
 *  depends on color alone. */
export function FindingIcon({ severity }: { severity: string }) {
  const tone = findingTone(severity);
  return <span className={`sub-find sub-find-${tone}`}><SubmissionIcon name={FINDING_ICON[tone]} size={14} /></span>;
}

export function severityLabel(severity: string): string {
  const v = (severity || '').toLowerCase();
  if (v === 'error') return 'Error';
  if (v === 'warning') return 'Warning';
  if (v === 'info') return 'Info';
  return severity || 'Info';
}

/** Format a byte count for display, or em-dash when absent. */
export function formatBytes(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Format an ISO timestamp for display, or em-dash when absent. */
export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
