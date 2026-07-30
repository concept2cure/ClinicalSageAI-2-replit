/**
 * Protocol / research-admin governance primitives (kit app/protocol-gov.jsx).
 *
 * Cross-cutting governance UI shared by the protocol-development and
 * research-admin surfaces: status badges, regulatory citation chips,
 * findings lists, the completeness/finalize gate, and the audit-trail
 * panel — "build once and reuse" per
 * RESEARCH_ADMIN_UI_REQUIREMENTS_2026-06-29.md. Every mutating action
 * across the suite is meant to route through a governed confirmation per
 * 21 CFR Part 11; that confirmation now delegates to the canonical
 * GovernedActionModal rather than reimplementing a bespoke dialog.
 *
 * ProtocolDev.tsx still reads `(window as any).PG` — this module keeps
 * that bridge live alongside the named exports until it imports directly.
 */
import React from 'react';
import { I } from '../icons';
import { EsignModal } from '../../_shared/components/EsignModal';

export interface Finding {
  sev?: string;
  severity?: string;
  text?: string;
  message?: string;
}

export interface AuditEntry {
  actor: string;
  action: string;
  when: string;
  audit: string;
  hash?: string;
}

export const SEV_TONE: Record<string, string> = {
  critical: 'err', blocking: 'err', major: 'warn', minor: 'ai', warning: 'warn',
  info: 'idle', error: 'err', success: 'ok',
};

export const STATUS_TONE: Record<string, string> = {
  complete: 'ok', approved: 'ok', current: 'ok', done: 'ok', final: 'ok', closed: 'idle', completed: 'ok',
  draft: 'idle', not_started: 'idle', planned: 'idle', pending: 'idle', scheduled: 'ai', upcoming: 'idle',
  in_review: 'ai', under_review: 'ai', voting: 'ai', in_progress: 'ai', mitigating: 'ai', submitted: 'ai',
  modifications_required: 'warn', expiring: 'warn', due_30: 'warn', deferred: 'warn', open: 'warn',
  expired: 'err', disapproved: 'err', missing: 'err', blocked: 'err', capa: 'warn',
};

export function labelize(s: unknown): string {
  return String(s == null ? '' : s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** `I.<name>` are React elements (1em glyphs), not functions — render directly inside a sized span. */
export function Ic({ n, s = 15 }: { n: string; s?: number }) {
  const el = I[n] || I.fileText;
  if (!el) return null;
  return (
    <span
      className="pg-ic"
      style={{ fontSize: s + 'px', width: s, height: s, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
    >
      {el}
    </span>
  );
}

/** Status pill — maps the many CHECK-constrained enums to earthy tones. */
export function StatusBadge({ status, label, tone }: { status?: string; label?: string; tone?: string }) {
  const t = tone || (status ? STATUS_TONE[status] : undefined) || 'idle';
  return <span className="pg-badge" data-tone={t}>{label || labelize(status)}</span>;
}

/** Regulatory citation chip — renders the basis/citation strings the logic returns. */
export function Citation({ basis, children }: { basis?: string; children?: React.ReactNode }) {
  return (
    <span className="pg-cite" title={basis || ''}>
      <Ic n="scale" s={11} />
      <span>{children || basis}</span>
    </span>
  );
}

/** Findings list (critical / major / minor / warning / info). */
export function FindingsList({ findings, dense }: { findings?: Finding[]; dense?: boolean }) {
  if (!findings || !findings.length) return <div className="pg-empty">No findings.</div>;
  return (
    <ul className={'pg-findings' + (dense ? ' dense' : '')}>
      {findings.map((f, i) => (
        <li key={i} data-sev={f.sev || f.severity}>
          <span className="pg-find-dot" data-tone={SEV_TONE[f.sev || f.severity || ''] || 'idle'} />
          <span className="pg-find-sev">{labelize(f.sev || f.severity)}</span>
          <span className="pg-find-msg">{f.text || f.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** Completeness / finalize gate — renders findings + the readyTo* boolean. */
export function CompletenessGate({
  pct, complete, total, findings, readyLabel, ready, onAction, actionLabel,
}: {
  pct?: number; complete?: number; total?: number; findings?: Finding[];
  readyLabel?: string; ready?: boolean; onAction?: () => void; actionLabel?: string;
}) {
  const crit = (findings || []).filter((f) => ['critical', 'blocking'].includes(f.sev || f.severity || '')).length;
  return (
    <div className="pg-gate">
      <div className="pg-gate-head">
        <div className="pg-gate-ring" data-ready={!!ready}>
          <span className="pg-gate-pct">{(pct == null ? 0 : pct) + '%'}</span>
        </div>
        <div className="pg-gate-meta">
          <div className="pg-gate-title">{readyLabel || 'Completeness'}</div>
          {total != null && <div className="pg-gate-sub">{complete} of {total} required sections complete</div>}
          <div className="pg-gate-status" data-ready={!!ready}>
            {ready ? (
              <>
                <Ic n="checkCircle" s={13} /> Ready to finalize
              </>
            ) : (
              <>
                <Ic n="alertTriangle" s={13} /> {crit} blocker{crit === 1 ? '' : 's'}
              </>
            )}
          </div>
        </div>
      </div>
      <div className="pg-gate-bar"><div className="pg-gate-fill" data-ready={!!ready} style={{ width: (pct || 0) + '%' }} /></div>
      <FindingsList findings={findings} dense />
      {onAction && (
        <button className="pg-btn primary block" disabled={!ready} onClick={onAction}>
          <Ic n="fileCheck" s={14} />
          {actionLabel || 'Finalize'}
        </button>
      )}
    </div>
  );
}

/** Audit trail panel (right pane). */
export function AuditTrail({ entries }: { entries?: AuditEntry[] }) {
  const list = entries && entries.length ? entries : [
    { actor: 'AnA', action: 'Drafted §2.3 rationale', when: '2m ago', audit: 'AUD-7743', hash: 'sha256:1f9c…' },
    { actor: 'J. Chen', action: 'Updated endpoint timing', when: '18m ago', audit: 'AUD-7740', hash: 'sha256:0b22…' },
  ];
  return (
    <div className="pg-audit">
      {list.map((e, i) => (
        <div key={i} className="pg-audit-row">
          <div className="pg-audit-dot" />
          <div className="pg-audit-body">
            <div className="pg-audit-line"><b>{e.actor}</b> {e.action}</div>
            <div className="pg-audit-meta">
              <span>{e.when}</span>
              <span className="pg-audit-id">{e.audit}</span>
              {e.hash && <span className="pg-mono">{e.hash}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* toast (audit-id confirmation) — vanilla DOM, called imperatively outside
   React's render cycle (e.g. from GovernedActionDialog's onConfirm). */
let toastHost: HTMLDivElement | null = null;
export function toast(msg: string, audit?: string): void {
  if (typeof document === 'undefined') return;
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'pg-toast-host';
    document.body.appendChild(toastHost);
  }
  const el = document.createElement('div');
  el.className = 'pg-toast';
  const ic = document.createElement('span');
  ic.className = 'pg-toast-ic';
  ic.textContent = '✓';
  el.appendChild(ic);
  const label = document.createElement('span');
  label.textContent = msg + (audit ? ' · ' : '');
  el.appendChild(label);
  if (audit) {
    const idEl = document.createElement('span');
    idEl.className = 'pg-mono';
    idEl.textContent = audit;
    el.appendChild(idEl);
  }
  toastHost.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 240);
  }, 3200);
}

/**
 * `nextAudit()` used to live here:
 *
 *     let auditSeq = 9100;
 *     export function nextAudit(): string { return 'AUD-' + auditSeq++; }
 *
 * A client-side counter that minted Part 11 audit identifiers out of thin air.
 * GovernedActionDialog called it on every confirm and toasted
 * "<Action> recorded · AUD-9100" — behind a dialog whose stated basis is
 * "21 CFR Part 11 e-signature", while its caller's onConfirm was a literal
 * no-op. Nothing was recorded and the identifier referred to nothing.
 *
 * A fabricated audit id is worse than no audit id: it is the artefact an
 * inspector would ask to trace, and it would trace to nothing. Real audit
 * identifiers are minted server-side by recordGovernedAction, which writes a
 * hash-chained audit_logs row and returns its id.
 *
 * `audit` is therefore optional on the result: a caller that genuinely persists
 * supplies the real id it got back from the server; a caller that does not
 * supplies nothing, and the dialog claims nothing.
 */
export interface GovernedActionResult {
  reason: string;
  signed: boolean;
  /** Server-issued audit id. Absent when the action was not persisted. */
  audit?: string;
}

export interface GovernedActionDialogProps {
  open: boolean;
  title?: string;
  intent?: string;
  basis?: string;
  esign?: boolean;
  onClose: () => void;
  onConfirm?: (result: GovernedActionResult) => void;
}

/** Governed action dialog — delegates to the shared, 21 CFR Part 11-compliant
    EsignModal (§11.50 meaning + reason-for-change with 8-char floor, §11.100
    identity, §11.200 password re-auth). The prior wrapper delegated to a
    decorative in-repo modal with fabricated hash-chain visuals and 1-char
    reason acceptance; that modal is retired.

    It still does not toast "<Action> recorded" on confirm — announcing a
    governed action is the caller's business, because only the caller knows
    whether it persisted and only the caller has the server-issued audit id
    to name. `onConfirm` now fires AFTER re-auth succeeds, i.e. it can be
    trusted as a real intent signal. */
export function GovernedActionDialog({ open, title, onClose, onConfirm }: GovernedActionDialogProps) {
  return (
    <EsignModal
      open={open}
      action={title || 'Confirm action'}
      target={title || 'Governed action'}
      onClose={onClose}
      onSign={async ({ meaning, reason }) => {
        onConfirm?.({ reason, signed: !!meaning });
        return { meaning, reason, signedAt: new Date().toISOString() };
      }}
    />
  );
}

/** Tiny reusable button used across the protocol / research-admin surfaces. */
export function Btn({
  icon, children, onClick, variant = 'ghost', disabled, block, title,
}: {
  icon?: string; children?: React.ReactNode; onClick?: () => void;
  variant?: string; disabled?: boolean; block?: boolean; title?: string;
}) {
  return (
    <button className={'pg-btn ' + variant + (block ? ' block' : '')} onClick={onClick} disabled={disabled} title={title}>
      {icon && <Ic n={icon} s={14} />}
      {children}
    </button>
  );
}

/* Legacy window bridge — ProtocolDev.tsx reads `(window as any).PG` until it
   imports this module directly; keep both live in sync. */
if (typeof window !== 'undefined') {
  (window as any).PG = {
    Ic, StatusBadge, Citation, FindingsList, CompletenessGate, AuditTrail,
    GovernedActionDialog, Btn, toast, labelize, SEV_TONE, STATUS_TONE,
  };
}
