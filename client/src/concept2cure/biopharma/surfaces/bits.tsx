/**
 * Shared biopharma surface primitives — StatusPill, ReadinessBar, ToneText,
 * AskAnaChip. Port of the shared bits in ui_kits/biopharma/surfaces.jsx.
 *
 * @module client/src/concept2cure/biopharma/surfaces/bits
 */

import * as React from 'react';
import { BioIcon } from '../icons';

const STATUS_CLASS: Record<string, string> = {
  approved: 'ok', complete: 'ok', drafted: 'draft',
  drafting: 'draft', review: 'review', queued: 'draft',
  submitted: 'review', closed: 'ok', open: 'warn',
  blocked: 'fail', active: 'review', evaluating: 'warn', monitoring: 'review',
  agreed: 'ok', 'in draft': 'draft', predicted: 'predicted',
  filed: 'review', enrolling: 'review', final: 'ok',
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const cls = STATUS_CLASS[status] ?? 'draft';
  return (
    <span className={`bp-pill bp-pill-${cls}`}>
      <span className="bp-dot" />
      {label ?? status}
    </span>
  );
}

export type Tone = 'ok' | 'warn' | 'err' | null | undefined;

export function ToneText({ tone, children }: { tone?: string | null; children: React.ReactNode }) {
  const cls = tone === 'err' ? 'tone-err' : tone === 'warn' ? 'tone-warn' : tone === 'ok' ? 'tone-ok' : '';
  return <span className={cls}>{children}</span>;
}

export function ReadinessBar({ pct, tone }: { pct: number; tone?: 'ok' | 'warn' | 'err' }) {
  const t = tone ?? (pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'err');
  return (
    <div className={`bp-readiness bp-readiness-${t}`}>
      <div className="bp-readiness-bar">
        <div className="bp-readiness-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="bp-readiness-pct">{pct}%</span>
    </div>
  );
}

export function AskAnaChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="bp-ask" type="button" onClick={onClick}>
      <span className="bp-ask-spark"><BioIcon name="sparkles" /></span>
      <span>{label}</span>
    </button>
  );
}

export function SamplePill() {
  return <span className="bp-pill bp-pill-draft">Sample data</span>;
}
