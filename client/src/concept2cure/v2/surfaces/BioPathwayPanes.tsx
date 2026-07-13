import React, { useState, useMemo } from 'react';
import { I } from '../icons';
import {
  AUDIT_KIND_META,
  bioPathwayData,
  ppFmtTime,
  ppFmtDate,
  ppDaysUntil,
} from '../fixtures/pathway-panes-data';
import type {
  AuditEvent,
  CorrespondenceItem,
  ApprovalItem,
} from '../fixtures/pathway-panes-data';

/* ── PathwayTabBar ── */

interface TabDef {
  id: string;
  label: string;
  sub: string;
  count?: number;
  badge?: boolean;
}

interface TabCounts {
  audit: number;
  correspondence: number;
  corrOpen: number;
  approvals: number;
  apPending: number;
}

interface PathwayTabBarProps {
  tab: string;
  setTab: (id: string) => void;
  corrLabel: string;
  counts: TabCounts;
  workspaceSub?: string;
}

export function PathwayTabBar({ tab, setTab, corrLabel, counts, workspaceSub }: PathwayTabBarProps) {
  const tabs: TabDef[] = [
    { id: 'workspace',      label: 'Workspace',   sub: workspaceSub || 'Filing cockpit' },
    { id: 'correspondence', label: corrLabel || 'Correspondence', sub: 'Agency queries', count: counts.correspondence, badge: counts.corrOpen > 0 },
    { id: 'audit',          label: 'Audit trail', sub: '21 CFR Part 11', count: counts.audit },
    { id: 'approvals',      label: 'Approvals',   sub: 'Pending e-sign', count: counts.approvals, badge: counts.apPending > 0 },
  ];
  return (
    <div className="pwt-bar" role="tablist" aria-label="Pathway sub-tabs">
      {tabs.map(t => (
        <button key={t.id} role="tab" aria-selected={tab === t.id} className={`pwt-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
          <span className="pwt-label">{t.label}{typeof t.count === 'number' && <span className={`pwt-count ${t.badge ? 'badge' : ''}`}>{t.count}</span>}</span>
          <span className="pwt-sub">{t.sub}</span>
        </button>
      ))}
    </div>
  );
}

/* ── BioAuditDetail ── */

interface AuditDetailProps {
  e: AuditEvent;
  onOpenSection?: (s: { id: string; label: string }) => void;
}

export function BioAuditDetail({ e, onOpenSection }: AuditDetailProps) {
  const meta = AUDIT_KIND_META[e.kind] || { label: e.kind, tone: 'neutral' };
  return (
    <div className="audit-det">
      <div className="audit-det-hdr"><span className={`audit-chip tone-${meta.tone}`}>{meta.label}</span><span className="audit-det-id">{e.id}</span></div>
      <div className="audit-det-target">{e.target}</div>
      <dl className="audit-det-grid">
        <dt>When</dt><dd>{ppFmtTime(e.when, { full: true })}</dd>
        <dt>Actor</dt><dd>{e.actor}<span className="audit-role"> · {e.role}</span></dd>
        <dt>IP</dt><dd className="mono">{e.ip || '—'}</dd>
        {e.diff && <><dt>Diff</dt><dd className="mono">{e.diff}</dd></>}
        {e.file && <><dt>File</dt><dd>{e.file}</dd></>}
        {e.body && <><dt>Body</dt><dd className="audit-body">&ldquo;{e.body}&rdquo;</dd></>}
        {e.reason && <><dt>Reason</dt><dd>{e.reason}</dd></>}
        {e.signed && <><dt>Signature</dt><dd className="mono"><span className="aud-sig">{e.sig}</span> · 21 CFR Part 11</dd></>}
      </dl>
      <div className="audit-det-chain">
        <div className="audit-chain-label">{I.link || I.gitBranch} Hash chain</div>
        <div className="audit-chain-row"><span className="audit-chain-k">prev</span><span className="mono audit-chain-v">{e.prev}</span></div>
        <div className="audit-chain-row"><span className="audit-chain-k">this</span><span className="mono audit-chain-v">{e.hash}</span></div>
      </div>
      {e.target_id && onOpenSection && (
        <div className="audit-det-actions">
          <button className="audit-act primary" onClick={() => onOpenSection({ id: e.target_id!, label: e.target })}>{I.fileText} Open in dossier</button>
          <button className="audit-act">{I.download} Export this event</button>
        </div>
      )}
    </div>
  );
}

/* ── BioAuditTrailPane ── */

interface AuditKindFilter {
  id: string;
  label: string;
}

interface AuditTrailPaneProps {
  events: AuditEvent[];
  onOpenSection?: (s: { id: string; label: string }) => void;
}

export function BioAuditTrailPane({ events, onOpenSection }: AuditTrailPaneProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>(events[0]?.id);
  const [filterKind, setFilterKind] = useState('all');

  const KINDS: AuditKindFilter[] = [
    { id: 'all', label: 'All' }, { id: 'sign', label: 'E-sign' }, { id: 'review', label: 'Review' },
    { id: 'edit', label: 'Edits' }, { id: 'comment', label: 'Comments' }, { id: 'access', label: 'Access' },
  ];

  const filtered = useMemo(() => {
    if (filterKind === 'all') return events;
    return events.filter(e => {
      if (filterKind === 'edit') return ['section.edit', 'section.lock', 'section.unlock', 'attach'].includes(e.kind);
      if (filterKind === 'review') return ['review.start', 'review.complete'].includes(e.kind);
      if (filterKind === 'sign') return e.kind === 'sign';
      if (filterKind === 'comment') return e.kind === 'comment';
      if (filterKind === 'access') return ['access', 'export'].includes(e.kind);
      return true;
    });
  }, [events, filterKind]);

  const selected = events.find(e => e.id === selectedId) || filtered[0];

  const groups = useMemo(() => {
    const out: { day: string; items: AuditEvent[] }[] = [];
    let curDay: string | null = null;
    let curList: { day: string; items: AuditEvent[] } | null = null;
    for (const e of filtered) {
      const key = new Date(e.when).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      if (key !== curDay) { curDay = key; curList = { day: key, items: [] }; out.push(curList); }
      curList!.items.push(e);
    }
    return out;
  }, [filtered]);

  return (
    <div className="audit-pane">
      <div className="audit-bar">
        <div className="audit-bar-l">
          <span className="audit-integrity" title="Each row is hash-chained to its predecessor (SHA-256). Tampering with any prior event invalidates the chain.">
            {I.shieldCheck} Tamper-evident · SHA-256 · {events.length} events
          </span>
        </div>
        <div className="audit-bar-r">
          <div className="audit-filters">
            {KINDS.map(k => <button key={k.id} className={`audit-filter ${filterKind === k.id ? 'active' : ''}`} onClick={() => setFilterKind(k.id)}>{k.label}</button>)}
          </div>
          <button className="audit-export" title="Export signed audit log (PDF + JSON manifest)">{I.download} Signed export</button>
        </div>
      </div>
      <div className="audit-grid">
        <div className="audit-list">
          {groups.map(g => (
            <div key={g.day} className="audit-group">
              <div className="audit-day">{g.day}</div>
              {g.items.map(e => {
                const meta = AUDIT_KIND_META[e.kind] || { label: e.kind, tone: 'neutral' };
                return (
                  <button key={e.id} className={`audit-row ${selectedId === e.id ? 'sel' : ''}`} onClick={() => setSelectedId(e.id)}>
                    <span className="audit-time">{new Date(e.when).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                    <span className={`audit-chip tone-${meta.tone}`}>{meta.label}</span>
                    <span className="audit-actor"><span className="aa-name">{e.actor}</span><span className="aa-target">{e.target}</span></span>
                    {e.signed && <span className="audit-signed" title={`Signed · ${e.sig}`}>{I.lock}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && <div className="audit-empty">No events match this filter.</div>}
        </div>
        <div className="audit-detail">
          {selected ? <BioAuditDetail e={selected} onOpenSection={onOpenSection}/> : <div className="audit-empty">Select an event.</div>}
        </div>
      </div>
    </div>
  );
}

/* ── BioCorrDetail ── */

interface CorrDetailProps {
  c: CorrespondenceItem;
  onOpenSection?: (s: { id: string; label: string }) => void;
  onAskAna?: (q: string) => void;
}

function BioCorrDetail({ c, onOpenSection, onAskAna }: CorrDetailProps) {
  const days = ppDaysUntil(c.due);
  const overdue = days !== null && days < 0;
  return (
    <div className="corr-det">
      <div className="corr-det-hdr"><span className={`corr-kind k-${c.kind.toLowerCase().replace(/\s|&|·|\//g, '-')}`}>{c.kind}</span><span className={`corr-status s-${c.status}`}>{c.status === 'in_review' ? 'In review' : c.status}</span></div>
      <h3 className="corr-det-subj">{c.subject}</h3>
      <div className="corr-det-meta"><span>{c.from}</span><span>·</span><span>{c.channel}</span><span>·</span><span>Received {ppFmtTime(c.received, { full: true })}</span></div>
      {c.due && <div className={`corr-due-banner ${overdue ? 'err' : days !== null && days <= 3 ? 'warn' : ''}`}>{I.clock} Response due {ppFmtDate(c.due)} {days !== null && <span>({overdue ? `${-days} days late` : `${days} days`})</span>}</div>}
      <div className="corr-det-body">{c.summary}</div>
      {c.refs && c.refs.length > 0 && (
        <div className="corr-refs">
          <div className="corr-refs-label">References in dossier</div>
          <div className="corr-refs-list">
            {c.refs.map((r, i) => <button key={i} className="corr-ref" onClick={() => onOpenSection && onOpenSection({ id: r.section, label: r.label })}>{I.fileText} {r.label} {I.arrowRight || I.right}</button>)}
          </div>
        </div>
      )}
      {c.triage && (
        <div className="corr-triage">
          <div className="corr-refs-label">Triage</div>
          <dl className="audit-det-grid">
            <dt>AnA</dt><dd>{I.sparkles} {c.triage.ana}</dd>
            <dt>Owner</dt><dd>{c.triage.owner}</dd>
            <dt>Priority</dt><dd><span className={`reg-pill ${c.triage.priority === 'high' ? 'warn' : c.triage.priority === 'med' ? 'ai' : 'idle'}`}>{c.triage.priority}</span></dd>
            <dt>Tasks</dt><dd>{c.triage.tasks} open</dd>
          </dl>
        </div>
      )}
      <div className="audit-det-actions">
        <button className="audit-act primary" onClick={() => onAskAna && onAskAna(`Draft response to ${c.kind}: ${c.subject}`)}>{I.sparkles} Draft response with AnA</button>
        <button className="audit-act">{I.userPlus || I.plus} Assign</button>
        <button className="audit-act">{I.check} Mark closed</button>
      </div>
    </div>
  );
}

/* ── BioCorrespondencePane ── */

interface CorrespondencePaneProps {
  items: CorrespondenceItem[];
  corrLabel: string;
  onOpenSection?: (s: { id: string; label: string }) => void;
  onAskAna?: (q: string) => void;
}

export function BioCorrespondencePane({ items, corrLabel, onOpenSection, onAskAna }: CorrespondencePaneProps) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | undefined>(items[0]?.id);
  const filtered = useMemo(() => statusFilter === 'all' ? items : items.filter(i => i.status === statusFilter), [items, statusFilter]);
  const selected = items.find(i => i.id === selectedId) || filtered[0];
  const counts = { open: items.filter(i => i.status === 'open').length, review: items.filter(i => i.status === 'in_review').length, closed: items.filter(i => i.status === 'closed').length };
  return (
    <div className="corr-pane">
      <div className="corr-bar">
        <div className="corr-bar-l">
          <span className="corr-stat"><span className="cs-num err">{counts.open}</span> open<span className="cs-sep">·</span><span className="cs-num warn">{counts.review}</span> in review<span className="cs-sep">·</span><span className="cs-num">{counts.closed}</span> closed</span>
        </div>
        <div className="corr-bar-r">
          {[{ id: 'all', label: 'All' }, { id: 'open', label: 'Open' }, { id: 'in_review', label: 'In review' }, { id: 'closed', label: 'Closed' }].map(s => (
            <button key={s.id} className={`audit-filter ${statusFilter === s.id ? 'active' : ''}`} onClick={() => setStatusFilter(s.id)}>{s.label}</button>
          ))}
        </div>
      </div>
      <div className="corr-grid">
        <div className="corr-list">
          {filtered.map(c => {
            const days = ppDaysUntil(c.due);
            const overdue = days !== null && days < 0;
            return (
              <button key={c.id} className={`corr-row ${selectedId === c.id ? 'sel' : ''}`} onClick={() => setSelectedId(c.id)}>
                <div className="corr-row-top">
                  <span className={`corr-kind k-${c.kind.toLowerCase().replace(/\s|&|·|\//g, '-')}`}>{c.kind}</span>
                  {c.ai && <span className="corr-ai" title="AnA flagged">{I.sparkles} flagged</span>}
                  <span className="corr-spacer"/>
                  <span className={`corr-status s-${c.status}`}>{c.status === 'in_review' ? 'In review' : c.status}</span>
                </div>
                <div className="corr-subj">{c.subject}</div>
                <div className="corr-row-bot">
                  <span>{c.from}</span><span>·</span><span>{ppFmtTime(c.received)}</span>
                  {c.due && <><span>·</span><span className={`corr-due ${overdue ? 'err' : days !== null && days <= 3 ? 'warn' : ''}`}>Due {ppFmtDate(c.due)}{days !== null && (overdue ? ` · ${-days}d late` : ` · ${days}d`)}</span></>}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="audit-empty">No items.</div>}
        </div>
        <div className="corr-detail">{selected && <BioCorrDetail c={selected} onOpenSection={onOpenSection} onAskAna={onAskAna}/>}</div>
      </div>
    </div>
  );
}

/* ── BioApprovalCard ── */

interface ApprovalCardProps {
  a: ApprovalItem;
  mine: boolean;
  onOpenSection?: (s: { id: string; label: string }) => void;
}

function BioApprovalCard({ a, mine, onOpenSection }: ApprovalCardProps) {
  const [signing, setSigning] = useState(false);
  const [pwd, setPwd] = useState('');
  const [meaning, setMeaning] = useState(a.meaning || '');
  const [signed, setSigned] = useState(false);
  const days = a.due ? ppDaysUntil(a.due) : null;
  const overdue = days !== null && days < 0;

  if (signed) return (
    <div className="ap-card signed">
      <div className="ap-card-hdr"><span className="ap-stage-pill" data-stage={a.stage}>{a.stage}</span><span className="audit-signed">{I.lock} Signed just now</span></div>
      <div className="ap-card-target">{a.target}</div>
      <div className="ap-card-meta">Acknowledged: &ldquo;{meaning}&rdquo; · WP-{Math.floor(Math.random() * 9000 + 1000)}</div>
    </div>
  );

  return (
    <div className={`ap-card ${mine ? 'mine' : ''}`}>
      <div className="ap-card-hdr">
        <span className="ap-stage-pill" data-stage={a.stage}>{a.stage}</span><span className="ap-card-due-spacer"/>
        {a.due && <span className={`ap-card-due ${overdue ? 'err' : days !== null && days <= 2 ? 'warn' : ''}`}>Due {ppFmtDate(a.due)}{days !== null && (overdue ? ` · ${-days}d late` : ` · ${days}d`)}</span>}
      </div>
      <div className="ap-card-target">{a.target}</div>
      <div className="ap-card-meta">Requested by {a.requested_by} · {ppFmtTime(a.requested)} · Signer: <b>{a.signer}</b> ({a.role})</div>
      {mine && !signing && (
        <div className="ap-card-actions">
          <button className="ap-sign-btn" onClick={() => setSigning(true)}>{I.lock} E-sign</button>
          <button className="ap-decline-btn">Decline</button>
          {a.target_id && <button className="ap-review-btn" onClick={() => onOpenSection && onOpenSection({ id: a.target_id!, label: a.target })}>{I.fileText} Review in dossier</button>}
        </div>
      )}
      {!mine && (
        <div className="ap-card-actions">
          <button className="ap-review-btn">{I.bell} Remind {a.signer.split(' ')[0]}</button>
          {a.target_id && <button className="ap-review-btn" onClick={() => onOpenSection && onOpenSection({ id: a.target_id!, label: a.target })}>{I.fileText} View</button>}
        </div>
      )}
      {mine && signing && (
        <div className="ap-sign-form">
          <div className="ap-sign-attest"><span className="ap-sign-attest-label">Meaning of signature</span><input className="ap-sign-input" value={meaning} onChange={e => setMeaning(e.target.value)} placeholder="e.g. Reviewed and approved"/></div>
          <div className="ap-sign-creds">
            <input className="ap-sign-input" type="password" placeholder="Re-enter password" value={pwd} onChange={e => setPwd(e.target.value)}/>
            <button className="ap-sign-confirm" disabled={pwd.length < 6 || meaning.trim().length === 0} onClick={() => setSigned(true)}>{I.lock} Apply signature</button>
            <button className="ap-sign-cancel" onClick={() => { setSigning(false); setPwd(''); }}>Cancel</button>
          </div>
          <div className="ap-sign-foot">21 CFR §11.100(b) · By signing you certify the listed meaning. Time, IP, and a SHA-256 of this record are appended to the audit trail.</div>
        </div>
      )}
    </div>
  );
}

/* ── BioApprovalsPane ── */

interface ApprovalsPaneProps {
  approvals: ApprovalItem[];
  onOpenSection?: (s: { id: string; label: string }) => void;
  currentUser?: string;
}

export function BioApprovalsPane({ approvals, onOpenSection, currentUser = 'You' }: ApprovalsPaneProps) {
  const pending = approvals.filter(a => a.status === 'pending');
  const signed = approvals.filter(a => a.status === 'signed');
  return (
    <div className="ap-pane">
      <div className="ap-section">
        <div className="ap-sec-hdr">
          <div><div className="ap-sec-title">Pending your signature</div><div className="ap-sec-sub">{pending.filter(a => a.signer === currentUser).length} require your e-sign · {pending.length} total open</div></div>
          <span className="ap-cfr">21 CFR Part 11 · §11.50 · §11.70</span>
        </div>
        {pending.length === 0 && <div className="audit-empty">No pending approvals.</div>}
        {pending.map(a => <BioApprovalCard key={a.id} a={a} mine={a.signer === currentUser} onOpenSection={onOpenSection}/>)}
      </div>
      <div className="ap-section">
        <div className="ap-sec-hdr"><div><div className="ap-sec-title">Signed</div><div className="ap-sec-sub">{signed.length} completed approvals · audit trail</div></div></div>
        <div className="ap-signed">
          {signed.map(a => (
            <div key={a.id} className="ap-signed-row">
              <span className="ap-stage-pill" data-stage={a.stage}>{a.stage}</span>
              <div className="ap-signed-target"><div className="ap-signed-name">{a.target}</div><div className="ap-signed-meta">{a.signer} · {a.role} · {ppFmtTime(a.signed_at!, { full: true })}</div></div>
              <span className="audit-signed" title="Signed · Part 11">{I.lock}</span>
              {a.target_id && <button className="ap-link" onClick={() => onOpenSection && onOpenSection({ id: a.target_id!, label: a.target })}>{I.arrowRight || I.right}</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── BioPathwayShell ── */

interface PathwayShellProps {
  pathway: string;
  program?: { code?: string; app?: string } | null;
  workspaceSub?: string;
  onAsk?: (text: string) => void;
  onNav?: (id: string) => void;
  children?: React.ReactNode;
}

export function BioPathwayShell({ pathway, program, workspaceSub, onAsk, onNav, children }: PathwayShellProps) {
  const [tab, setTab] = useState('workspace');
  const data = useMemo(() => bioPathwayData(program), [program && program.code]);
  const ask = onAsk || (() => {});
  const openSection = () => { try { localStorage.setItem('c2c_open_surface', 'dossier'); } catch (_e) { /* noop */ } onNav && onNav('dossier'); };
  const counts: TabCounts = {
    audit: data.audit.length,
    correspondence: data.correspondence.length,
    corrOpen: data.correspondence.filter(c => c.status === 'open').length,
    approvals: data.approvals.filter(a => a.status === 'pending').length,
    apPending: data.approvals.filter(a => a.status === 'pending' && a.signer === 'You').length,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <PathwayTabBar tab={tab} setTab={setTab} corrLabel={data.corrLabel} counts={counts} workspaceSub={workspaceSub}/>
      <div style={{ flex: 1, minHeight: 0, overflowY: tab === 'workspace' ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'workspace' && <div style={{ minHeight: 0 }}>{children}</div>}
        {tab === 'correspondence' && <BioCorrespondencePane items={data.correspondence} corrLabel={data.corrLabel} onOpenSection={openSection} onAskAna={ask}/>}
        {tab === 'audit' && <BioAuditTrailPane events={data.audit} onOpenSection={openSection}/>}
        {tab === 'approvals' && <BioApprovalsPane approvals={data.approvals} onOpenSection={openSection}/>}
      </div>
    </div>
  );
}
