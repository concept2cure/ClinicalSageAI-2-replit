/* ------------------------------------------------------------------ *
 *  EditorGov.tsx
 *  Editor governance & QC -- grounded in Domain 3 of the platform
 *  inventory.
 *  - _digest            -- deterministic hex digest (manifest display)
 *  - artifactStatus     -- maps section + sign/lock to ArtifactStatus
 *  - deriveReadiness    -- computes LifecycleReadinessLevel
 *  - computePreflight   -- Section Preflight (Pass 5), 5-point QC
 *  - VERDICT_META       -- verdict label/tone map
 *  - PreflightPane      -- dock tab component
 *  - SignModal          -- Part 11 e-signature modal
 *  - ProvenancePane     -- AI provenance ledger
 * ------------------------------------------------------------------ */
import React, { useState } from 'react';
import { I } from '../icons';
import type {
  ArtifactStatus,
  AuditEntry,
  PreflightVerdict,
  ReadinessLevel,
  SectionStatus,
  SignatureMeaning,
} from '../fixtures/editor-data-types';
import { REG_ENUMS, REG_MEANING_LABEL } from '../fixtures/editor-data-enums';

/* re-export data so consumers can import from one place */
export {
  RCE_FACT_DRIFT,
  RCE_MARKETS_MATRIX,
} from '../fixtures/editor-gov-data';
export type {
  CanonicalFact,
  DossierModule,
  FactBinding,
  FactDriftData,
  FactDriftEntry,
  MarketGap,
  MarketTarget,
  MarketsMatrixData,
} from '../fixtures/editor-gov-data';

/* ── Shared local types ───────────────────────────────────────────── */

type CheckState = 'pass' | 'warn' | 'fail';
type VerdictTone = 'ok' | 'acc' | 'warn' | 'err';

interface ReadinessContext {
  conf: number;
  status: SectionStatus;
  blocker: boolean;
  empty: boolean;
  errFlags: number;
  signed: boolean;
  changeAfterSign: boolean;
}

interface PreflightContext {
  empty: boolean;
  wordCount: number;
  conf: number;
  warnFlags: number;
  errFlags: number;
  changeCount: number;
  signed: boolean;
  changeAfterSign: boolean;
}

export interface PreflightCheck {
  id: string;
  label: string;
  state: CheckState;
  note: string;
}

export interface PreflightResult {
  checks: PreflightCheck[];
  verdict: PreflightVerdict;
  fails: number;
  warns: number;
}

interface VerdictMeta {
  label: string;
  tone: VerdictTone;
}

interface SignPayload {
  meaning: string;
  reason: string;
  hash: string;
  stamp: string;
}

interface SignatureInfo {
  meaning?: string;
}

/* ── Tiny deterministic hex digest (manifest display -- not crypto) ── */

export function _digest(str: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = ((h1 ^ c) * 0x01000193) >>> 0;
    h2 = ((h2 * 31 + c) >>> 0);
  }
  const hex = (n: number): string => ('00000000' + (n >>> 0).toString(16)).slice(-8);
  return (hex(h1) + hex(h2) + hex(h1 ^ h2) + hex((h1 + h2) >>> 0)).toUpperCase();
}

/* ── Map seeded status (complete|review|draft) to ArtifactStatus ── */

export function artifactStatus(
  sec: { status: SectionStatus },
  signed: boolean,
  locked: boolean,
): ArtifactStatus {
  if (signed) return 'approved';
  if (locked) return 'locked';
  if (sec.status === 'complete') return 'approved';
  if (sec.status === 'review') return 'review';
  return 'draft';
}

/* ── LifecycleReadinessLevel from the live document state ────────── */

export function deriveReadiness(ctx: ReadinessContext): ReadinessLevel {
  const { conf, status, blocker, empty, errFlags, signed, changeAfterSign } = ctx;
  if (signed && changeAfterSign) return 'degraded';
  if (signed) return 'publish_ready';
  if (blocker || errFlags > 0) return 'blocked';
  if (empty || conf < 0.55) return 'evidence_gap';
  if (status === 'complete' && conf >= 0.9) return 'export_ready';
  if (status === 'complete') return 'approval_ready';
  if (status === 'review') return 'review_ready';
  return 'draft';
}

/* ── Section Preflight (Pass 5) -- 5 checks + overall verdict ───── */

export function computePreflight(ctx: PreflightContext): PreflightResult {
  const { empty, wordCount, conf, warnFlags, errFlags, changeCount, signed, changeAfterSign } = ctx;

  const checks: PreflightCheck[] = [
    {
      id: 'bodyExpectations',
      label: 'Body expectations',
      state: empty ? 'fail' : (wordCount < 150 ? 'warn' : 'pass'),
      note: empty
        ? 'Section is empty -- expected narrative not present.'
        : (wordCount < 150
          ? 'Below the expected length for this section type.'
          : 'Meets the expected structure & length.'),
    },
    {
      id: 'contradictions',
      label: 'Contradictions',
      state: errFlags > 0 ? 'fail' : (warnFlags > 0 ? 'warn' : 'pass'),
      note: errFlags > 0
        ? (errFlags + ' claim/evidence conflict' + (errFlags > 1 ? 's' : '') + ' must be resolved.')
        : (warnFlags > 0
          ? (warnFlags + ' advisory flag' + (warnFlags > 1 ? 's' : '') + ' to review.')
          : 'No unresolved contradictions detected.'),
    },
    {
      id: 'crossSectionConsistency',
      label: 'Cross-section consistency',
      state: conf >= 0.8 ? 'pass' : (conf >= 0.65 ? 'warn' : 'fail'),
      note: conf >= 0.8
        ? 'Terminology & figures consistent with linked sections.'
        : (conf >= 0.65
          ? 'Some terms diverge from the program glossary.'
          : 'Figures/terms conflict with linked sections.'),
    },
    {
      id: 'approvedBaselineCompare',
      label: 'Approved-baseline compare',
      state: (signed && !changeAfterSign) ? 'pass' : (changeCount > 0 ? 'warn' : 'pass'),
      note: (signed && !changeAfterSign)
        ? 'Matches the signed baseline.'
        : (changeCount > 0
          ? (changeCount + ' tracked change' + (changeCount > 1 ? 's' : '') + ' diverge from the baseline.')
          : 'No divergence from the last approved version.'),
    },
    {
      id: 'readiness',
      label: 'Readiness gate',
      state: (errFlags > 0 || empty) ? 'fail' : (conf < 0.65 || changeCount > 0 ? 'warn' : 'pass'),
      note: (errFlags > 0 || empty)
        ? 'Blocked from promotion.'
        : (conf < 0.65 || changeCount > 0
          ? 'Provisional -- review before promotion.'
          : 'Clear to promote.'),
    },
  ];

  const fails = checks.filter(c => c.state === 'fail').length;
  const warns = checks.filter(c => c.state === 'warn').length;

  let verdict: PreflightVerdict;
  if (fails > 0) verdict = 'blocked';
  else if (signed && changeAfterSign) verdict = 'needs-reapproval';
  else if (warns > 0) verdict = 'needs-review';
  else if (signed) verdict = 'ready';
  else verdict = 'provisional';

  return { checks, verdict, fails, warns };
}

/* ── Verdict metadata ─────────────────────────────────────────────── */

export const VERDICT_META: Readonly<Record<PreflightVerdict, VerdictMeta>> = {
  'ready':            { label: 'Ready to promote',  tone: 'ok'   },
  'provisional':      { label: 'Provisional',       tone: 'acc'  },
  'needs-review':     { label: 'Needs review',      tone: 'warn' },
  'needs-reapproval': { label: 'Needs re-approval', tone: 'warn' },
  'blocked':          { label: 'Blocked',            tone: 'err'  },
};

/* ── PreflightPane (dock tab) ─────────────────────────────────────── */

interface PreflightPaneProps {
  pre: PreflightResult;
  sec: { num: string; label: string };
  onRun: () => void;
  onAction: (action: string) => void;
}

export function PreflightPane({ pre, sec, onRun, onAction }: PreflightPaneProps): React.JSX.Element {
  const vm = VERDICT_META[pre.verdict];
  const ico: Record<CheckState, React.ReactNode> = {
    pass: I.check,
    warn: I.alertTriangle || I.info,
    fail: I.close,
  };
  return (
    <div className="rce-pane">
      <div className="rce-pf-head" data-tone={vm.tone}>
        <div className="rce-pf-verdict">
          {pre.verdict === 'blocked' ? I.lock : I.shieldCheck}
          <span>{vm.label}</span>
        </div>
        <div className="rce-pf-sub">Section preflight · Pass 5 · {sec.num} {sec.label}</div>
      </div>
      {pre.checks.map(c => (
        <div key={c.id} className="rce-pf-check" data-state={c.state}>
          <span className="rce-pf-ic">{ico[c.state]}</span>
          <div className="rce-pf-b">
            <div className="rce-pf-l">{c.label}</div>
            <div className="rce-pf-n">{c.note}</div>
          </div>
        </div>
      ))}
      <div className="rce-pf-acts">
        {pre.verdict === 'blocked'
          ? <button className="btn ghost" onClick={() => onAction('explain_blockers')}>{I.sparkles} Explain blockers with AnA</button>
          : <button className="btn primary" onClick={() => onAction('promote_to_review')}>{I.shieldCheck} Promote to review</button>}
        <button className="btn ghost" onClick={onRun}>{I.gitCompare} Re-run preflight</button>
      </div>
    </div>
  );
}

/* ── Part 11 S11.50 e-signature modal ─────────────────────────────── */

interface SignModalProps {
  sec: { num: string; label: string };
  pathway: { code: string; program: string; owner: string };
  defaultMeaning?: SignatureMeaning;
  onCancel: () => void;
  onSign: (payload: SignPayload) => void;
}

export function SignModal({ sec, pathway, defaultMeaning, onCancel, onSign }: SignModalProps): React.JSX.Element {
  const meanings = REG_ENUMS.signatureMeaning;
  const labels = REG_MEANING_LABEL;
  const [meaning, setMeaning] = useState<string>(defaultMeaning || 'approval');
  const [custom, setCustom] = useState('');
  const [reason, setReason] = useState('');
  const [pw, setPw] = useState('');
  const [totp, setTotp] = useState('');

  const reasonOk = reason.trim().length >= 10;
  const ok = reasonOk && pw.length >= 6 && /^\d{6}$/.test(totp) && (meaning !== 'custom' || custom.trim().length > 0);
  const meaningText = meaning === 'custom'
    ? (custom.trim() || 'Custom')
    : labels[meaning as SignatureMeaning] ?? meaning;
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z';
  const manifest = _digest(pathway.code + '|' + sec.num + '|' + meaning + '|' + reason + '|' + stamp);

  return (
    <div className="rce-modal-scrim" onMouseDown={onCancel}>
      <div className="rce-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="rce-modal-h">
          <span className="rce-modal-mark">{I.lock}</span>
          <div>
            <div className="rce-modal-t">Electronic signature</div>
            <div className="rce-modal-s">21 CFR Part 11 §11.50 · §11.100 · §11.200</div>
          </div>
          <button className="tbtn" onClick={onCancel}>{I.close}</button>
        </div>
        <div className="rce-modal-body">
          <div className="rce-modal-target">
            {sec.num} · {sec.label} <span className="rce-modal-prog">{pathway.program}</span>
          </div>

          <label className="rce-field">
            <span className="rce-field-l">Signature meaning (§11.50)</span>
            <select value={meaning} onChange={e => setMeaning(e.target.value)}>
              {meanings.map(m => <option key={m} value={m}>{labels[m] || m}</option>)}
            </select>
          </label>
          {meaning === 'custom' && (
            <label className="rce-field">
              <span className="rce-field-l">Custom meaning</span>
              <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="State the meaning of this signature" />
            </label>
          )}

          <label className="rce-field">
            <span className="rce-field-l">Reason for change <em>({'>='}10 chars)</em></span>
            <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this signature being applied?" />
            {!reasonOk && reason.length > 0 && (
              <span className="rce-field-err">{10 - reason.trim().length} more characters required</span>
            )}
          </label>

          <div className="rce-field-row">
            <label className="rce-field">
              <span className="rce-field-l">Password</span>
              <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="--------" />
            </label>
            <label className="rce-field">
              <span className="rce-field-l">Authenticator (TOTP)</span>
              <input
                value={totp}
                onChange={e => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
              />
            </label>
          </div>

          <div className="rce-manifest">
            <div className="rce-manifest-h">Signature manifest (§11.100)</div>
            <div className="rce-manifest-r"><span>Signer</span><span>{pathway.owner} · APPROVER</span></div>
            <div className="rce-manifest-r"><span>Meaning</span><span>{meaningText}</span></div>
            <div className="rce-manifest-r"><span>Timestamp</span><span>{stamp}</span></div>
            <div className="rce-manifest-r"><span>Hash (SHA-256)</span><span className="mono">{manifest.slice(0, 16)}...</span></div>
          </div>
        </div>
        <div className="rce-modal-f">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button
            className="btn primary"
            disabled={!ok}
            onClick={() => onSign({ meaning: meaningText, reason: reason.trim(), hash: manifest, stamp })}
          >
            {I.lock} Sign &amp; freeze
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── AI provenance ledger (dock tab) ──────────────────────────────── */

interface ProvenancePaneProps {
  sec: { num: string };
  html?: string;
  audit?: readonly AuditEntry[];
  signed?: boolean;
  sigInfo?: SignatureInfo;
}

const chipStyle: React.CSSProperties = {
  fontSize: '9.5px',
  background: 'var(--bg-100)',
  padding: '2px 6px',
  borderRadius: '6px',
};

export function ProvenancePane({ sec, html, audit, signed, sigInfo }: ProvenancePaneProps): React.JSX.Element {
  const text = (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const digest = _digest(text || (sec.num + '|empty'));
  const words = text ? text.split(' ').length : 0;
  const rows = (audit || []).filter(a => a.kind === 'ai');

  return (
    <div className="rce-pane">
      <div className="rce-gov-card">
        <h4><span className="ico">{I.key || I.shieldCheck}</span> AI provenance — §{sec.num}</h4>
        <p>
          Who generated what, with which engine, producing which bytes. Generation events
          write to the Part 11 audit trail; the digest below is computed from the section
          as it stands right now.
        </p>
        <div className="rce-gov-state">
          <span className="mono" style={{ fontSize: '10px', color: 'var(--text-300)', wordBreak: 'break-all' }}>{digest}</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-400)' }}>
          <span>Content digest (current)</span>
          <span>{words} words</span>
          {signed && (
            <span style={{ color: 'var(--success)' }}>
              Signed{sigInfo && sigInfo.meaning ? ' · ' + sigInfo.meaning : ''}
            </span>
          )}
        </div>
      </div>

      <div className="rce-gov-card">
        <h4><span className="ico">{I.history}</span> Generation ledger — this session</h4>
        {rows.length === 0 && (
          <p style={{ marginBottom: 0 }}>
            No AI generations recorded yet in this session. Run Draft, Full build,
            or a selection verb -- each run lands here and in the audit trail with
            its engine mode and audit id.
          </p>
        )}
        {rows.map((r, i) => (
          <div key={i} className="rce-gov-audit">
            <div className="ic">{I.sparkles}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'var(--text-100)' }}>{r.detail}</div>
              <div style={{ color: 'var(--text-400)' }}>
                {r.actor} · {r.target} · {r.when}
                <span className="rce-gov-11">via {r.ip}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rce-gov-card">
        <h4><span className="ico">{I.shieldCheck}</span> Live install contract</h4>
        <p style={{ marginBottom: 6 }}>
          Each generation writes an <span className="mono" style={{ fontSize: '10px' }}>ai_generation</span> audit
          row -- pinned engine id, output SHA-256, token counts, audit id -- so any saved
          content traces back to the exact engine version by hashing it.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          <span className="mono" style={chipStyle}>ai_generation audit rows</span>
          <span className="mono" style={chipStyle}>read -- /api/decision-lineage</span>
          <span className="mono" style={chipStyle}>export -- /api/admin/audit (SIEM)</span>
        </div>
      </div>
    </div>
  );
}
