/* EditorPanes.tsx -- 5 editor dock-tab panes ported from Editor.jsx */
import React, { useState } from 'react';
import { I } from '../icons';
import { initials } from './EditorWidgets';
import type { AuditEntry, VersionEntry, ApprovalPath } from '../fixtures/editor-data-types';
import type { CanonicalFact, FactDriftData } from '../fixtures/editor-gov-data';

/* ── Prop interfaces ─────────────────────────────────────────────── */

interface TeamMember { name: string; role: string }

interface ReplyData {
  author?: string; createdBy?: string; when: string;
  ai?: boolean; body?: string; content?: string;
}

interface CommentItem {
  id: string; anchor?: string; author?: string; createdBy?: string;
  role?: string; when?: string; resolved?: boolean; isResolved?: boolean;
  status?: string; ai?: boolean; body?: string; content?: string;
  assignee?: string; taskId?: string; taskAction?: string;
  replies?: ReplyData[];
}

export interface CommentsPaneProps {
  comments: CommentItem[];
  onStatus: (id: string, status: string) => void;
  onAssign?: (id: string, name: string) => void;
  onReply?: (id: string, text: string) => void;
  onTask?: (comment: CommentItem, task: { assignee: string; action: string }) => void;
  team?: TeamMember[];
}

export interface SourcesPaneProps {
  onLink?: (claimId: string, sourceId: string) => void;
  section?: string;
}

export interface FactDriftPaneProps { section?: string }

export interface VersionsPaneProps {
  versions: readonly VersionEntry[];
  onSave?: () => void;
  audit?: readonly AuditEntry[];
}

interface SignatureInfo { signer?: string; meaning?: string; when?: string }

export interface GovernancePaneProps {
  locked: boolean;
  onLock: (locked: boolean) => void;
  onSign?: () => void;
  signed: boolean;
  sigInfo?: SignatureInfo;
  audit?: readonly AuditEntry[];
  approvalPath: ApprovalPath;
  setApprovalPath: (p: ApprovalPath) => void;
}

/* ── Internal types & constants ──────────────────────────────────── */

type CommentStatus = 'open' | 'resolved' | 'incorporated' | 'rejected';
interface StatusMeta { l: string; c: string }
const STAT: Record<CommentStatus, StatusMeta> = {
  open: { l: 'Open', c: 'warn' }, resolved: { l: 'Resolved', c: 'ok' },
  incorporated: { l: 'Incorporated', c: 'acc' }, rejected: { l: 'Rejected', c: 'idle' },
};

interface SourceSugg {
  id: string; ic: string; type: string;
  title: string; score: number; excerpt: string; cite: string;
}
interface Claim { id: string; text: string; type: string; verification: string; sugg: SourceSugg[] }

const AUDIT_ICON: Record<string, React.ReactNode> = {
  edit: I.penLine, ai: I.sparkles, comment: I.messageSquare, sign: I.lock, lock: I.lock,
};

const emptyMsg = (msg: string) => (
  <div className="rce-pane"><div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-400)', fontSize: 12 }}>{msg}</div></div>
);

/* ── 1. CommentsPane ─────────────────────────────────────────────── */

export function CommentsPane({ comments, onStatus, onAssign, onReply, onTask, team }: CommentsPaneProps): React.JSX.Element {
  const TEAM = team || [];
  const [reply, setReply] = useState<Record<string, string>>({});
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [taskWho, setTaskWho] = useState('');
  const [taskAct, setTaskAct] = useState('review');

  if (!comments.length) return emptyMsg('No comments on this section. Select text in the document to start a thread.');

  const stat = (c: CommentItem): CommentStatus =>
    (c.isResolved || c.resolved) ? 'resolved' : ((c.status as CommentStatus) || 'open');
  const sendReply = (id: string) => {
    const t = (reply[id] || '').trim(); if (!t) return;
    onReply && onReply(id, t); setReply(p => ({ ...p, [id]: '' }));
  };

  return (
    <div className="rce-pane">
      {comments.map(c => {
        const s = stat(c); const closed = s !== 'open';
        const replies = c.replies || []; const who = c.author || c.createdBy || 'You';
        return (
          <div key={c.id} className="rce-cmt" data-ai={c.ai || undefined} data-resolved={closed || undefined}>
            <div className="rce-cmt-top">
              <span className="rce-cmt-av">{c.ai ? '*' : initials(who)}</span>
              <span className="rce-cmt-who">{who}</span><span className="rce-cmt-role">{c.role}</span>
              <span className="rce-cmt-status" data-c={STAT[s].c}>{STAT[s].l}</span>
              <span className="rce-cmt-when">{c.when}</span>
            </div>
            {c.anchor && <span className="rce-cmt-anchor">{c.anchor}</span>}
            <div className="rce-cmt-body">{c.body || c.content}</div>
            {c.assignee && (
              <div className="rce-cmt-routed">
                <span className="rce-cmt-routed-ic">{I.arrowRight}</span>Routed to <b>{c.assignee}</b>
                {c.taskId && <span className="rce-cmt-taskchip">{I.checkSquare} task {'·'} {c.taskAction || 'review'}</span>}
              </div>
            )}
            {replies.map((r, i) => (
              <div key={i} className="rce-cmt-reply" data-ai={r.ai || undefined}>
                <div className="rce-cmt-top" style={{ marginBottom: 4 }}>
                  <span className="rce-cmt-av">{r.ai ? '*' : initials(r.author || r.createdBy || 'You')}</span>
                  <span className="rce-cmt-who" style={{ fontSize: 11 }}>{r.author || r.createdBy}</span>
                  <span className="rce-cmt-when">{r.when}</span>
                </div>
                <div className="rce-cmt-body" style={{ fontSize: 11.5 }}>{r.body || r.content}</div>
              </div>
            ))}
            <div className="rce-cmt-replybox">
              <input value={reply[c.id] || ''} placeholder="Reply... (@name to route)"
                onChange={e => setReply(p => ({ ...p, [c.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendReply(c.id); } }} />
              <button disabled={!(reply[c.id] || '').trim()} onClick={() => sendReply(c.id)}>{I.arrowUp}</button>
            </div>
            <div className="rce-cmt-actions">
              <label className="rce-cmt-route" title="Route this comment to a teammate">
                <span className="ico">{I.user}</span>
                <select value={c.assignee || ''} onChange={e => onAssign && onAssign(c.id, e.target.value)}>
                  <option value="">Route to...</option>
                  {TEAM.map(t => <option key={t.name} value={t.name}>{t.name} {'·'} {t.role}</option>)}
                </select>
              </label>
              <button className="btn ghost" style={{ height: 26, fontSize: 11 }}
                onClick={() => setOpenTask(openTask === c.id ? null : c.id)}>{I.checkSquare} Task</button>
              {closed
                ? <button className="btn ghost" style={{ height: 26, fontSize: 11 }} onClick={() => onStatus(c.id, 'open')}>{I.undo} Reopen</button>
                : <button className="btn ghost" style={{ height: 26, fontSize: 11 }} onClick={() => onStatus(c.id, 'resolved')}>{I.check} Resolve</button>}
            </div>
            {openTask === c.id && (
              <div className="rce-cmt-taskform">
                <select value={taskWho} onChange={e => setTaskWho(e.target.value)}>
                  <option value="">Assign to...</option>
                  {TEAM.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
                <select value={taskAct} onChange={e => setTaskAct(e.target.value)}>
                  <option value="review">Review</option><option value="comment">Comment</option>
                  <option value="approve">Approve</option><option value="revise">Revise</option>
                </select>
                <button className="rce-cmt-taskgo" disabled={!taskWho} onClick={() => {
                  onTask && onTask(c, { assignee: taskWho, action: taskAct }); setOpenTask(null); setTaskWho('');
                }}>Create task</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── 2. SourcesPane ──────────────────────────────────────────────── */

const CLAIMS: Claim[] = [
  { id: 'cl1', text: 'Population-PK analysis establishes exposure equivalence between formulations.',
    type: 'efficacy', verification: 'unverified', sugg: [
      { id: 's1', ic: 'vault', type: 'clinical_data', title: 'CSR-201 §7.4 Pop-PK', score: 91, excerpt: 'Exposure equivalence demonstrated (GMR 0.96–1.08).', cite: 'CSR-201 §7.4' },
      { id: 's2', ic: 'fileText', type: 'literature', title: 'FDA 2023 bridging guidance', score: 84, excerpt: 'Population-PK read-across acceptable when exposure margins are characterized.', cite: 'FDA 2023' },
      { id: 's3', ic: 'database', type: 'cmc_data', title: 'Bridging strategy memo v2', score: 67, excerpt: 'Formulation change limited to excipient; BE waiver rationale provided.', cite: 'MEMO-BR-2' },
    ] },
  { id: 'cl2', text: 'BX-204 demonstrated a statistically significant improvement in ORR vs historical control.',
    type: 'efficacy', verification: 'verified', sugg: [
      { id: 's4', ic: 'fileText', type: 'clinical_data', title: 'BX204-201 CSR §7.1 Primary Endpoint', score: 97, excerpt: 'ORR 68.3% (95% CI 58.9–76.8%) vs historical control 25%; p<0.0001.', cite: 'BX204-201 CSR §7.1' },
    ] },
  { id: 'cl3', text: 'The safety profile is manageable and consistent with the drug class.',
    type: 'safety', verification: 'unverified', sugg: [
      { id: 's5', ic: 'vault', type: 'safety', title: 'Integrated safety dataset v4', score: 88, excerpt: 'Most common AEs grade 1–2; DLTs in 4.7% of patients.', cite: 'ISD-v4 §3.2' },
      { id: 's6', ic: 'fileText', type: 'literature', title: 'Class safety review 2024', score: 72, excerpt: 'Consistent safety profile across seven mAb agents in DLBCL.', cite: 'Oncol Rev 2024' },
    ] },
];

export function SourcesPane({ onLink, section }: SourcesPaneProps): React.JSX.Element {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="rce-pane">
      {CLAIMS.map(cl => {
        const open = expanded === cl.id;
        return (
          <div key={cl.id} className="rce-src-claim" data-v={cl.verification}>
            <div className="rce-src-claim-top" onClick={() => setExpanded(open ? null : cl.id)} style={{ cursor: 'pointer' }}>
              <span className="rce-src-claim-ic">{open ? I.down : I.right}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="rce-src-claim-text">{cl.text}</div>
                <div className="rce-src-claim-meta">
                  <span data-t={cl.type}>{cl.type}</span>
                  <span data-v={cl.verification}>{cl.verification}</span>
                  <span>{cl.sugg.length} source{cl.sugg.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
            {open && <div className="rce-src-list">
              {cl.sugg.map(s => (
                <div key={s.id} className="rce-src-card">
                  <div className="rce-src-card-top">
                    <span className="rce-src-ic">{I[s.ic] || I.fileText}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="rce-src-title">{s.title}</div>
                      <div className="rce-src-type">{s.type.replace(/_/g, ' ')}</div>
                    </div>
                    <span className="rce-src-score" data-hi={s.score >= 85 || undefined}>{s.score}%</span>
                  </div>
                  <div className="rce-src-excerpt">{s.excerpt}</div>
                  <div className="rce-src-foot">
                    <span className="rce-src-cite">{s.cite}</span>
                    <button className="btn ghost" style={{ height: 24, fontSize: 11 }} onClick={() => onLink && onLink(cl.id, s.id)}>{I.link} Link</button>
                  </div>
                </div>
              ))}
            </div>}
          </div>
        );
      })}
    </div>
  );
}

/* ── 3. FactDriftPane ────────────────────────────────────────────── */

export function FactDriftPane({ section }: FactDriftPaneProps): React.JSX.Element {
  const data = (window as any).RCE_FACT_DRIFT as FactDriftData | undefined;
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!data) return emptyMsg('No fact-drift data available for this section.');

  const categorize = (f: CanonicalFact): string => {
    if (f.bindings.some(b => b.bindingStatus === 'broken')) return 'broken';
    if (f.bindings.some(b => b.bindingStatus === 'drifted')) return 'drifted';
    return 'clean';
  };
  const drifted = data.facts.filter(f => categorize(f) === 'drifted');
  const broken  = data.facts.filter(f => categorize(f) === 'broken');
  const clean   = data.facts.filter(f => categorize(f) === 'clean');
  const toggle = (id: string) => setExpanded(expanded === id ? null : id);

  const renderFact = (f: CanonicalFact, tone: string) => {
    const open = expanded === f.id;
    return (
      <div key={f.id} className="rce-fd-fact" data-tone={tone}>
        <div className="rce-fd-top" onClick={() => toggle(f.id)} style={{ cursor: 'pointer' }}>
          <span className="rce-fd-ic">{open ? I.down : I.right}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="rce-fd-label">{f.label}</div>
            <div className="rce-fd-val">{f.valueText}{f.unit ? ' ' + f.unit : ''}</div>
          </div>
          <span className="rce-fd-badge" data-tone={tone}>{tone}</span>
        </div>
        {open && <div className="rce-fd-detail">
          <div className="rce-fd-src">Established by: {f.establishedBy}</div>
          {f.bindings.map((b, i) => (
            <div key={i} className="rce-fd-binding" data-s={b.bindingStatus}>
              <span className="rce-fd-bs">{b.bindingStatus}</span>
              <span>{b.target}</span>
              {b.bindingStatus !== 'bound' && <span className="rce-fd-obs">observed: {b.observedValue}</span>}
            </div>
          ))}
          {f.drift.map((d, i) => (
            <div key={i} className="rce-fd-drift">
              <div className="rce-fd-drift-sev" data-sev={d.severity}>{d.severity}</div>
              <div>{d.detail}</div>
              <div className="rce-fd-drift-vals">{d.expectedValue} vs {d.observedValue}</div>
            </div>
          ))}
          {tone !== 'clean' && <div className="rce-fd-acts">
            <button className="btn ghost" style={{ height: 26, fontSize: 11 }}>{I.sparkles} Reconcile with AnA</button>
            <button className="btn ghost" style={{ height: 26, fontSize: 11 }}>{I.gitCompare} Compare sections</button>
          </div>}
        </div>}
      </div>
    );
  };

  return (
    <div className="rce-pane">
      <div className="rce-fd-summary">
        <span className="rce-fd-count" data-tone="drifted">{drifted.length} drifted</span>
        <span className="rce-fd-count" data-tone="broken">{broken.length} broken</span>
        <span className="rce-fd-count" data-tone="clean">{clean.length} clean</span>
      </div>
      {drifted.map(f => renderFact(f, 'drifted'))}
      {broken.map(f => renderFact(f, 'broken'))}
      {clean.map(f => renderFact(f, 'clean'))}
    </div>
  );
}

/* ── 4. VersionsPane ─────────────────────────────────────────────── */

export function VersionsPane({ versions, onSave, audit }: VersionsPaneProps): React.JSX.Element {
  const [tab, setTab] = useState<'versions' | 'lineage'>('versions');
  const [compare, setCompare] = useState<string | null>(null);
  return (
    <div className="rce-pane">
      <div className="rce-tab-bar">
        <button className={tab === 'versions' ? 'active' : ''} onClick={() => setTab('versions')}>{I.history} Versions</button>
        <button className={tab === 'lineage' ? 'active' : ''} onClick={() => setTab('lineage')}>{I.gitBranch} Edit lineage</button>
      </div>
      {tab === 'versions' && <div className="rce-ver-list">
        {versions.map((v, i) => (
          <div key={i} className="rce-ver-row" data-current={v.current || undefined}>
            <div className="rce-ver-dot" data-signed={!!v.sig || undefined} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="rce-ver-v">{v.v}</div>
              <div className="rce-ver-note">{v.note}</div>
              <div className="rce-ver-meta">
                {v.author} {'·'} {v.when} {'·'} <span className="mono">{v.diff}</span>
                {v.sig && <span className="rce-ver-sig">{I.lock} {v.sig}</span>}
              </div>
            </div>
            {!v.current && <button className="btn ghost" style={{ height: 24, fontSize: 11 }}
              onClick={() => setCompare(compare === v.v ? null : v.v)}>
              {I.gitCompare} {compare === v.v ? 'Hide' : 'Compare'}
            </button>}
          </div>
        ))}
        {compare && <div className="rce-ver-diff">
          <div className="rce-ver-diff-h">{I.gitCompare} Comparing {compare} to working draft</div>
          <div className="rce-ver-diff-body">Diff view would render here. Select sections to see inline changes.</div>
        </div>}
      </div>}
      {tab === 'lineage' && <div className="rce-ver-lineage">
        {(audit || []).length === 0 && <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-400)', fontSize: 12 }}>No edit lineage recorded yet.</div>}
        {(audit || []).map((a, i) => (
          <div key={i} className="rce-gov-audit">
            <div className="ic">{AUDIT_ICON[a.kind] || I.dot}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'var(--text-100)' }}>{a.detail}</div>
              <div style={{ color: 'var(--text-400)', fontSize: 11 }}>{a.actor} {'·'} {a.target} {'·'} {a.when}</div>
            </div>
          </div>
        ))}
      </div>}
    </div>
  );
}

/* ── 5. GovernancePane ───────────────────────────────────────────── */

const PATH_LABELS: Record<ApprovalPath, string> = {
  single_reviewer: 'Single reviewer', regulated_dual_review: 'Regulated dual review',
  qa_lock: 'QA lock', signoff_required: 'Sign-off required',
};
const PATHS: ApprovalPath[] = ['single_reviewer', 'regulated_dual_review', 'qa_lock', 'signoff_required'];

export function GovernancePane({
  locked, onLock, onSign, signed, sigInfo, audit, approvalPath, setApprovalPath,
}: GovernancePaneProps): React.JSX.Element {
  return (
    <div className="rce-pane">
      {/* Review workflow routing */}
      <div className="rce-gov-card">
        <h4><span className="ico">{I.workflow}</span> Review workflow</h4>
        <label className="rce-field">
          <span className="rce-field-l">Approval path</span>
          <select value={approvalPath} onChange={e => setApprovalPath(e.target.value as ApprovalPath)}>
            {PATHS.map(p => <option key={p} value={p}>{PATH_LABELS[p]}</option>)}
          </select>
        </label>
      </div>
      {/* Section freeze toggle */}
      <div className="rce-gov-card">
        <h4><span className="ico">{I.lock}</span> Section freeze</h4>
        <p>Locking prevents edits until an authorized user unlocks the section.</p>
        <button className={locked ? 'btn warn' : 'btn ghost'} style={{ height: 30, fontSize: 12 }} onClick={() => onLock(!locked)}>
          {locked ? <>{I.lock} Unlock section</> : <>{I.lock} Freeze section</>}
        </button>
      </div>
      {/* 21 CFR Part 11 e-signature card */}
      <div className="rce-gov-card">
        <h4><span className="ico">{I.shieldCheck}</span> 21 CFR Part 11 e-signature</h4>
        {signed ? (
          <div className="rce-gov-state">
            <span className="rce-gov-signed">{I.check} Signed</span>
            {sigInfo && <div style={{ fontSize: 11, color: 'var(--text-400)', marginTop: 4 }}>
              {sigInfo.signer && <span>{sigInfo.signer}</span>}
              {sigInfo.meaning && <span> {'·'} {sigInfo.meaning}</span>}
              {sigInfo.when && <span> {'·'} {sigInfo.when}</span>}
            </div>}
          </div>
        ) : (
          <div>
            <p>Apply a Part 11 compliant electronic signature to freeze and certify this section.</p>
            <button className="btn primary" style={{ height: 30, fontSize: 12 }} onClick={() => onSign && onSign()}>{I.lock} Sign section</button>
          </div>
        )}
      </div>
      {/* Audit trail */}
      <div className="rce-gov-card">
        <h4><span className="ico">{I.history}</span> Audit trail</h4>
        {(audit || []).length === 0 && <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-400)', fontSize: 12 }}>No audit entries recorded.</div>}
        {(audit || []).map((a, i) => (
          <div key={i} className="rce-gov-audit">
            <div className="ic">{AUDIT_ICON[a.kind] || I.dot}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'var(--text-100)' }}>{a.detail}</div>
              <div style={{ color: 'var(--text-400)', fontSize: 11 }}>
                {a.actor} {'·'} {a.target} {'·'} {a.when}
                <span className="rce-gov-11">via {a.ip}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
