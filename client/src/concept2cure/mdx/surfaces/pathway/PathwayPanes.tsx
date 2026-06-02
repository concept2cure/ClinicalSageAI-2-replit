/**
 * PathwayPanes — the pathway sub-tab bar shared by every pathway surface
 * (510k / PMA / CER), plus the DossierDrawer that routes any pane to the live
 * document section. Ported from `design-system/ui_kits/mdx/PathwayPanes.jsx`.
 *
 * Tabs: Workspace · Audit trail · Correspondence · Approvals · Files.
 * The host surface passes its existing content as `workspace`; the other tabs
 * render from PATHWAY_TABS_DATA + the in-memory dossier store. The drawer is a
 * preview surface — "Open in editor" hands off to the existing route.
 */

import * as React from 'react';
import { I } from '../../icons';
import { AUDIT_KIND_META, PATHWAY_TABS_DATA } from '../../data/pathwayTabs';
import { DossierStore, useSection } from '../../store/dossierStore';
import { FilesTreePane } from './FilesTreePane';
import { AnaDrafter } from '../../components/AnaDrafter';
import { usePathwayTabsData } from '../../hooks/usePathwayTabsData';
import { useDossierHydration } from '../../hooks/useDossier';
import type {
  Approval,
  AuditEvent,
  Correspondence,
  DossierAttachment,
  PathwayKey,
  SectionTarget,
} from '../../types';

type PaneTab = 'workspace' | 'audit' | 'correspondence' | 'approvals' | 'files';
type OpenSection = (t: SectionTarget) => void;
type OpenEditor = (id: string | number) => void;

interface PaneCounts {
  audit: number;
  correspondence: number;
  corrOpen: number;
  approvals: number;
  apPending: number;
}

/* ── Time formatters ─────────────────────────────────────────── */
function fmtTime(iso: string, opts: { full?: boolean } = {}): string {
  const d = new Date(iso);
  const now = Date.now();
  const ageH = (now - d.getTime()) / 3.6e6;
  if (opts.full || ageH > 24 * 14) {
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  if (ageH < 1) {
    const m = Math.max(1, Math.round(ageH * 60));
    return `${m}m ago`;
  }
  if (ageH < 24) return `${Math.round(ageH)}h ago`;
  const days = Math.round(ageH / 24);
  return `${days}d ago`;
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

function daysUntil(iso: string | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00Z');
  const today = new Date();
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/* ── PathwayTabBar ───────────────────────────────────────────── */
function PathwayTabBar({ tab, setTab, pathway, counts }: { tab: PaneTab; setTab: (t: PaneTab) => void; pathway: PathwayKey; counts: PaneCounts }) {
  const corrLabel = PATHWAY_TABS_DATA[pathway]?.corrLabel || 'Correspondence';
  const tabs: Array<{ id: PaneTab; label: string; sub: string; count?: number; badge?: boolean }> = [
    { id: 'workspace',      label: 'Workspace',   sub: pathway === 'k510' ? 'Predicate · SE · eSTAR' : pathway === 'pma' ? 'Phases · modules' : 'Signals · literature' },
    { id: 'audit',          label: 'Audit trail', sub: '21 CFR Part 11', count: counts.audit },
    { id: 'correspondence', label: corrLabel,     sub: 'Agency / NB queries', count: counts.correspondence, badge: counts.corrOpen > 0 },
    { id: 'approvals',      label: 'Approvals',   sub: 'Pending e-sign', count: counts.approvals, badge: counts.apPending > 0 },
    { id: 'files',          label: 'Files',       sub: 'Full filesystem' },
  ];
  return (
    <div className="pwt-bar" role="tablist" aria-label="Pathway sub-tabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          className={`pwt-btn ${tab === t.id ? 'active' : ''}`}
          onClick={() => setTab(t.id)}
        >
          <span className="pwt-label">{t.label}</span>
          {typeof t.count === 'number' && (
            <span className={`pwt-count ${t.badge ? 'badge' : ''}`}>{t.count}</span>
          )}
          <span className="pwt-sub">{t.sub}</span>
        </button>
      ))}
    </div>
  );
}

/* ── AuditTrailPane ──────────────────────────────────────────── */
function AuditTrailPane({ events, onOpenSection }: { pathway: PathwayKey; events: AuditEvent[]; onOpenSection: OpenSection }) {
  const [selectedId, setSelectedId] = React.useState<string | undefined>(events[0]?.id);
  const [filterKind, setFilterKind] = React.useState('all');

  const KINDS = [
    { id: 'all', label: 'All' },
    { id: 'sign', label: 'E-sign' },
    { id: 'review', label: 'Review' },
    { id: 'edit', label: 'Edits' },
    { id: 'comment', label: 'Comments' },
    { id: 'access', label: 'Access' },
  ];

  const filtered = React.useMemo(() => {
    if (filterKind === 'all') return events;
    return events.filter((e) => {
      if (filterKind === 'edit') return e.kind === 'section.edit' || e.kind === 'section.lock' || e.kind === 'section.unlock' || e.kind === 'attach';
      if (filterKind === 'review') return e.kind === 'review.start' || e.kind === 'review.complete';
      if (filterKind === 'sign') return e.kind === 'sign';
      if (filterKind === 'comment') return e.kind === 'comment';
      if (filterKind === 'access') return e.kind === 'access' || e.kind === 'export';
      return true;
    });
  }, [events, filterKind]);

  const selected = events.find((e) => e.id === selectedId) || filtered[0];

  const groups = React.useMemo(() => {
    const out: Array<{ day: string; items: AuditEvent[] }> = [];
    let curDay: string | null = null;
    let curList: { day: string; items: AuditEvent[] } | null = null;
    for (const e of filtered) {
      const d = new Date(e.when);
      const key = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      if (key !== curDay) {
        curDay = key;
        curList = { day: key, items: [] };
        out.push(curList);
      }
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
            {KINDS.map((k) => (
              <button key={k.id} className={`audit-filter ${filterKind === k.id ? 'active' : ''}`} onClick={() => setFilterKind(k.id)}>
                {k.label}
              </button>
            ))}
          </div>
          <button className="audit-export" title="Export signed audit log (PDF + JSON manifest)">
            {I.download} Signed export
          </button>
        </div>
      </div>

      <div className="audit-grid">
        <div className="audit-list">
          {groups.map((g) => (
            <div key={g.day} className="audit-group">
              <div className="audit-day">{g.day}</div>
              {g.items.map((e) => {
                const meta = AUDIT_KIND_META[e.kind] || { label: e.kind, tone: 'neutral' };
                return (
                  <button key={e.id} className={`audit-row ${selectedId === e.id ? 'sel' : ''}`} onClick={() => setSelectedId(e.id)}>
                    <span className="audit-time">{new Date(e.when).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                    <span className={`audit-chip tone-${meta.tone}`}>{meta.label}</span>
                    <span className="audit-actor">
                      <span className="aa-name">{e.actor}</span>
                      <span className="aa-target">{e.target}</span>
                    </span>
                    {e.signed && <span className="audit-signed" title={`Signed · ${e.sig}`}>{I.lock}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && <div className="audit-empty">No events match this filter.</div>}
        </div>

        <div className="audit-detail">
          {selected ? <AuditDetail e={selected} onOpenSection={onOpenSection} /> : <div className="audit-empty">Select an event to view detail.</div>}
        </div>
      </div>
    </div>
  );
}

function AuditDetail({ e, onOpenSection }: { e: AuditEvent; onOpenSection: OpenSection }) {
  const meta = AUDIT_KIND_META[e.kind] || { label: e.kind, tone: 'neutral' };
  return (
    <div className="audit-det">
      <div className="audit-det-hdr">
        <span className={`audit-chip tone-${meta.tone}`}>{meta.label}</span>
        <span className="audit-det-id">{e.id}</span>
      </div>
      <div className="audit-det-target">{e.target}</div>

      <dl className="audit-det-grid">
        <dt>When</dt>
        <dd>{fmtTime(e.when, { full: true })}</dd>
        <dt>Actor</dt>
        <dd>{e.actor}<span className="audit-role"> · {e.role}</span></dd>
        <dt>IP</dt>
        <dd className="mono">{e.ip || '—'}</dd>
        {e.diff && <><dt>Diff</dt><dd className="mono">{e.diff}</dd></>}
        {e.file && <><dt>File</dt><dd>{e.file}</dd></>}
        {e.body && <><dt>Body</dt><dd className="audit-body">&quot;{e.body}&quot;</dd></>}
        {e.reason && <><dt>Reason</dt><dd>{e.reason}</dd></>}
        {e.signed && <><dt>Signature</dt><dd className="mono"><span className="aud-sig">{e.sig}</span> · WP-21 CFR Part 11</dd></>}
      </dl>

      <div className="audit-det-chain">
        <div className="audit-chain-label">{I.link} Hash chain</div>
        <div className="audit-chain-row">
          <span className="audit-chain-k">prev</span>
          <span className="mono audit-chain-v">{e.prev}</span>
        </div>
        <div className="audit-chain-row">
          <span className="audit-chain-k">this</span>
          <span className="mono audit-chain-v">{e.hash}</span>
        </div>
      </div>

      {e.target_id && (
        <div className="audit-det-actions">
          <button className="audit-act primary" onClick={() => onOpenSection({ id: e.target_id!, label: e.target })}>
            {I.fileText} Open in dossier
          </button>
          <button className="audit-act">{I.download} Export this event</button>
        </div>
      )}
    </div>
  );
}

/* ── CorrespondencePane ──────────────────────────────────────── */
function CorrespondencePane({ pathway, items, onOpenSection, onAskAna, onDraftResponse }: {
  pathway: PathwayKey;
  items: Correspondence[];
  onOpenSection: OpenSection;
  onAskAna: (text: string) => void;
  onDraftResponse?: (c: Correspondence) => void;
}) {
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [selectedId, setSelectedId] = React.useState<string | undefined>(items[0]?.id);
  void pathway;

  const filtered = React.useMemo(() => {
    if (statusFilter === 'all') return items;
    return items.filter((i) => i.status === statusFilter);
  }, [items, statusFilter]);

  const selected = items.find((i) => i.id === selectedId) || filtered[0];

  const counts = {
    open: items.filter((i) => i.status === 'open').length,
    review: items.filter((i) => i.status === 'in_review').length,
    closed: items.filter((i) => i.status === 'closed').length,
  };

  return (
    <div className="corr-pane">
      <div className="corr-bar">
        <div className="corr-bar-l">
          <span className="corr-stat">
            <span className="cs-num err">{counts.open}</span> open
            <span className="cs-sep">·</span>
            <span className="cs-num warn">{counts.review}</span> in review
            <span className="cs-sep">·</span>
            <span className="cs-num">{counts.closed}</span> closed
          </span>
        </div>
        <div className="corr-bar-r">
          {[
            { id: 'all', label: 'All' },
            { id: 'open', label: 'Open' },
            { id: 'in_review', label: 'In review' },
            { id: 'closed', label: 'Closed' },
          ].map((s) => (
            <button key={s.id} className={`audit-filter ${statusFilter === s.id ? 'active' : ''}`} onClick={() => setStatusFilter(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="corr-grid">
        <div className="corr-list">
          {filtered.map((c) => {
            const days = daysUntil(c.due);
            const overdue = days !== null && days < 0;
            return (
              <button key={c.id} className={`corr-row ${selectedId === c.id ? 'sel' : ''}`} onClick={() => setSelectedId(c.id)}>
                <div className="corr-row-top">
                  <span className={`corr-kind k-${c.kind.toLowerCase().replace(/\s|&/g, '-')}`}>{c.kind}</span>
                  {c.ai && <span className="corr-ai" title="AnA flagged">{I.sparkles} flagged</span>}
                  <span className="corr-spacer" />
                  <span className={`corr-status s-${c.status}`}>{c.status === 'in_review' ? 'In review' : c.status}</span>
                </div>
                <div className="corr-subj">{c.subject}</div>
                <div className="corr-row-bot">
                  <span>{c.from}</span>
                  <span>·</span>
                  <span>{fmtTime(c.received)}</span>
                  {c.due && (
                    <>
                      <span>·</span>
                      <span className={`corr-due ${overdue ? 'err' : days !== null && days <= 3 ? 'warn' : ''}`}>
                        Due {fmtDate(c.due)}{days !== null && (overdue ? ` · ${-days}d late` : ` · ${days}d`)}
                      </span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="audit-empty">No items.</div>}
        </div>

        <div className="corr-detail">
          {selected && <CorrDetail c={selected} onOpenSection={onOpenSection} onAskAna={onAskAna} onDraftResponse={onDraftResponse} />}
        </div>
      </div>
    </div>
  );
}

function CorrDetail({ c, onOpenSection, onAskAna, onDraftResponse }: {
  c: Correspondence;
  onOpenSection: OpenSection;
  onAskAna: (text: string) => void;
  onDraftResponse?: (c: Correspondence) => void;
}) {
  const days = daysUntil(c.due);
  const overdue = days !== null && days < 0;
  return (
    <div className="corr-det">
      <div className="corr-det-hdr">
        <span className={`corr-kind k-${c.kind.toLowerCase().replace(/\s|&/g, '-')}`}>{c.kind}</span>
        <span className={`corr-status s-${c.status}`}>{c.status === 'in_review' ? 'In review' : c.status}</span>
      </div>
      <h3 className="corr-det-subj">{c.subject}</h3>
      <div className="corr-det-meta">
        <span>{c.from}</span>
        <span>·</span>
        <span>{c.channel}</span>
        <span>·</span>
        <span>Received {fmtTime(c.received, { full: true })}</span>
      </div>

      {c.due && (
        <div className={`corr-due-banner ${overdue ? 'err' : days !== null && days <= 3 ? 'warn' : ''}`}>
          {I.clock} Response due {fmtDate(c.due)} {days !== null && <span>({overdue ? `${-days} days late` : `${days} days`})</span>}
        </div>
      )}

      <div className="corr-det-body">{c.summary}</div>

      {c.refs && c.refs.length > 0 && (
        <div className="corr-refs">
          <div className="corr-refs-label">References in dossier</div>
          <div className="corr-refs-list">
            {c.refs.map((r, i) => (
              <button key={i} className="corr-ref" onClick={() => onOpenSection({ id: r.section, label: r.label })}>
                {I.fileText} {r.label} {I.arrowRight}
              </button>
            ))}
          </div>
        </div>
      )}

      {c.triage && (
        <div className="corr-triage">
          <div className="corr-refs-label">Triage</div>
          <dl className="audit-det-grid">
            <dt>AnA</dt>
            <dd>{I.sparkles} {c.triage.ana}</dd>
            <dt>Owner</dt>
            <dd>{c.triage.owner}</dd>
            <dt>Priority</dt>
            <dd><span className={`status-pill ${c.triage.priority === 'high' ? 'blocked' : c.triage.priority === 'med' ? 'warn' : 'idle'}`}>{c.triage.priority}</span></dd>
            <dt>Tasks</dt>
            <dd>{c.triage.tasks} open</dd>
          </dl>
        </div>
      )}

      <div className="audit-det-actions">
        <button className="audit-act primary" onClick={() => (onDraftResponse ? onDraftResponse(c) : onAskAna(`Draft response to ${c.kind}: ${c.subject}`))}>
          {I.sparkles} Draft response with AnA
        </button>
        <button className="audit-act">{I.userPlus} Assign</button>
        <button className="audit-act">{I.check} Mark closed</button>
      </div>
    </div>
  );
}

/* ── ApprovalsPane ───────────────────────────────────────────── */
function ApprovalsPane({ approvals, onOpenSection, currentUser = 'You' }: { approvals: Approval[]; onOpenSection: OpenSection; currentUser?: string }) {
  const pending = approvals.filter((a) => a.status === 'pending');
  const signed = approvals.filter((a) => a.status === 'signed');

  return (
    <div className="ap-pane">
      <div className="ap-section">
        <div className="ap-sec-hdr">
          <div>
            <div className="ap-sec-title">Pending your signature</div>
            <div className="ap-sec-sub">{pending.filter((a) => a.signer === currentUser).length} require your e-sign · {pending.length} total open</div>
          </div>
          <span className="ap-cfr">21 CFR Part 11 · §11.50 · §11.70</span>
        </div>

        {pending.length === 0 && <div className="audit-empty">No pending approvals.</div>}
        {pending.map((a) => (
          <ApprovalCard key={a.id} a={a} mine={a.signer === currentUser} onOpenSection={onOpenSection} />
        ))}
      </div>

      <div className="ap-section">
        <div className="ap-sec-hdr">
          <div>
            <div className="ap-sec-title">Signed</div>
            <div className="ap-sec-sub">{signed.length} completed approvals · audit trail</div>
          </div>
        </div>
        <div className="ap-signed">
          {signed.map((a) => (
            <div key={a.id} className="ap-signed-row">
              <span className="ap-stage-pill" data-stage={a.stage}>{a.stage}</span>
              <div className="ap-signed-target">
                <div className="ap-signed-name">{a.target}</div>
                <div className="ap-signed-meta">{a.signer} · {a.role} · {fmtTime(a.signed_at || a.requested, { full: true })}</div>
              </div>
              <span className="audit-signed" title="Signed · Part 11">{I.lock}</span>
              {a.target_id && (
                <button className="ap-link" onClick={() => onOpenSection({ id: a.target_id!, label: a.target })}>
                  {I.arrowRight}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ApprovalCard({ a, mine, onOpenSection }: { a: Approval; mine: boolean; onOpenSection: OpenSection }) {
  const [signing, setSigning] = React.useState(false);
  const [pwd, setPwd] = React.useState('');
  const [meaning, setMeaning] = React.useState(a.meaning || '');
  const [signed, setSigned] = React.useState(false);

  const days = daysUntil(a.due);
  const overdue = days !== null && days < 0;

  if (signed) {
    return (
      <div className="ap-card signed">
        <div className="ap-card-hdr">
          <span className="ap-stage-pill" data-stage={a.stage}>{a.stage}</span>
          <span className="audit-signed">{I.lock} Signed just now</span>
        </div>
        <div className="ap-card-target">{a.target}</div>
        <div className="ap-card-meta">Acknowledged: &quot;{meaning}&quot; · WP-{Math.floor(Math.random() * 9000 + 1000)}</div>
      </div>
    );
  }

  return (
    <div className={`ap-card ${mine ? 'mine' : ''}`}>
      <div className="ap-card-hdr">
        <span className="ap-stage-pill" data-stage={a.stage}>{a.stage}</span>
        <span className="ap-card-due-spacer" />
        {a.due && (
          <span className={`ap-card-due ${overdue ? 'err' : days !== null && days <= 2 ? 'warn' : ''}`}>
            Due {fmtDate(a.due)}{days !== null && (overdue ? ` · ${-days}d late` : ` · ${days}d`)}
          </span>
        )}
      </div>

      <div className="ap-card-target">{a.target}</div>
      <div className="ap-card-meta">
        Requested by {a.requested_by} · {fmtTime(a.requested)} · Signer: <b>{a.signer}</b> ({a.role})
      </div>

      {mine && !signing && (
        <div className="ap-card-actions">
          <button className="ap-sign-btn" onClick={() => setSigning(true)}>{I.lock} E-sign</button>
          <button className="ap-decline-btn">Decline</button>
          {a.target_id && (
            <button className="ap-review-btn" onClick={() => onOpenSection({ id: a.target_id!, label: a.target })}>
              {I.fileText} Review in dossier
            </button>
          )}
        </div>
      )}

      {!mine && (
        <div className="ap-card-actions">
          <button className="ap-review-btn">{I.bell} Remind {a.signer.split(' ')[0]}</button>
          {a.target_id && (
            <button className="ap-review-btn" onClick={() => onOpenSection({ id: a.target_id!, label: a.target })}>
              {I.fileText} View
            </button>
          )}
        </div>
      )}

      {mine && signing && (
        <div className="ap-sign-form">
          <div className="ap-sign-attest">
            <span className="ap-sign-attest-label">Meaning of signature</span>
            <input className="ap-sign-input" value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="e.g. Reviewed and approved" />
          </div>
          <div className="ap-sign-creds">
            <input className="ap-sign-input" type="password" placeholder="Re-enter password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
            <button className="ap-sign-confirm" disabled={pwd.length < 6 || meaning.trim().length === 0} onClick={() => setSigned(true)}>
              {I.lock} Apply signature
            </button>
            <button className="ap-sign-cancel" onClick={() => { setSigning(false); setPwd(''); }}>Cancel</button>
          </div>
          <div className="ap-sign-foot">
            21 CFR §11.100(b) · By signing you certify the listed meaning. Time, IP, and a SHA-256 of this record will be appended to the audit trail.
          </div>
        </div>
      )}
    </div>
  );
}

/* ── DossierDrawer ───────────────────────────────────────────── */
export interface DossierDrawerProps {
  open: boolean;
  target: SectionTarget | null;
  pathway: PathwayKey;
  onClose: () => void;
  onOpenEditor?: OpenEditor;
}

export function DossierDrawer({ open, target, pathway, onClose, onOpenEditor }: DossierDrawerProps) {
  const safeTarget: SectionTarget = target || { id: '', label: '' };
  const [tab, setTab] = React.useState<'document' | 'attachments' | 'activity'>('document');
  const [autosaveAt, setAutosaveAt] = React.useState<Date | null>(null);

  const { body, meta, attachments, folder } = useSection(pathway, safeTarget.id, safeTarget.label);

  const activity = React.useMemo(
    () => DossierStore.activityForSection(pathway, safeTarget.id),
    [pathway, safeTarget.id, body, attachments.length],
  );

  React.useEffect(() => { if (open) setTab('document'); }, [open, safeTarget.id]);

  if (!open || !target) return null;

  const onCommitBody = (next: string) => {
    if (next === body) return;
    DossierStore.writeSectionBody(pathway, safeTarget.id, safeTarget.label, next, { who: 'You', role: 'Reg Lead' });
    setAutosaveAt(new Date());
  };

  const onAttach = (files: FileList) => {
    if (!files || !files.length) return;
    Array.from(files).forEach((f) => {
      DossierStore.attachFile(pathway, safeTarget.id, safeTarget.label, {
        name: f.name, size: f.size, kind: DossierStore.guessKind(f.name),
      }, { who: 'You', role: 'Reg Lead' });
    });
    setAutosaveAt(new Date());
  };

  const labelByPathway = pathway === 'k510' ? '510(k) dossier' : pathway === 'pma' ? 'PMA dossier' : 'CER dossier';
  const status = meta.status || 'draft';
  const version = meta.version || 1;
  const lastEdited = meta.lastEdited || '';

  return (
    <>
      <div className="dd-scrim" onClick={onClose} />
      <aside className="dd-drawer" role="dialog" aria-label={`Dossier · ${safeTarget.label}`}>
        <div className="dd-hdr">
          <div className="dd-crumb">
            <span>{labelByPathway}</span>
            <span>{I.right}</span>
            <span className="dd-crumb-here">{safeTarget.label}</span>
          </div>
          <div className="dd-hdr-actions">
            <span className={`status-pill ${status}`}>{status}</span>
            <button className="dd-close" onClick={onClose} title="Close">{I.close}</button>
          </div>
        </div>

        {folder && (
          <div className="dd-path" title={folder}>
            <span className="mono">{folder}</span>
          </div>
        )}

        <div className="dd-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'document'} className="dd-tab" data-on={tab === 'document'} onClick={() => setTab('document')}>Document</button>
          <button role="tab" aria-selected={tab === 'attachments'} className="dd-tab" data-on={tab === 'attachments'} onClick={() => setTab('attachments')}>
            Attachments {attachments.length > 0 && <span className="dd-tab-count">{attachments.length}</span>}
          </button>
          <button role="tab" aria-selected={tab === 'activity'} className="dd-tab" data-on={tab === 'activity'} onClick={() => setTab('activity')}>
            Activity {activity.length > 0 && <span className="dd-tab-count">{activity.length}</span>}
          </button>
        </div>

        <div className="dd-body">
          {tab === 'document' && <DDDocumentTab body={body} onCommit={onCommitBody} autosaveAt={autosaveAt} />}
          {tab === 'attachments' && <DDAttachmentsTab attachments={attachments} onAttach={onAttach} />}
          {tab === 'activity' && <DDActivityTab events={activity} />}
        </div>

        <div className="dd-foot">
          <span className="dd-foot-meta">
            <span className="dd-foot-status">
              <span className={`dd-status-dot ${status}`} />
              {status}
            </span>
            {lastEdited && <><span>·</span><span>Last edited {fmtTime(lastEdited)}</span></>}
            <span>·</span>
            <span>v{version}</span>
          </span>
          <button className="dd-foot-edit" onClick={() => { onOpenEditor?.(safeTarget.id); onClose(); }}>
            {I.edit} Open in editor
          </button>
        </div>
      </aside>
    </>
  );
}

/* ── Drawer tabs ─────────────────────────────────────────────── */
function DDDocumentTab({ body, onCommit, autosaveAt }: { body: string; onCommit: (next: string) => void; autosaveAt: Date | null }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (ref.current && ref.current.innerText !== body) {
      ref.current.innerText = body;
      setDirty(false);
    }
  }, [body]);

  const onInput = (e: React.FormEvent<HTMLDivElement>) => {
    setDirty(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const next = e.currentTarget.innerText;
    debounceRef.current = setTimeout(() => {
      onCommit(next);
      setDirty(false);
    }, 600);
  };

  const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const next = e.currentTarget.innerText;
    if (next !== body) { onCommit(next); setDirty(false); }
  };

  return (
    <div className="dd-doc-wrap">
      <div className="dd-doc-status">
        {dirty
          ? <><span className="dd-doc-dot dirty" /> editing…</>
          : autosaveAt
            ? <><span className="dd-doc-dot saved" /> saved {fmtTime(autosaveAt.toISOString())}</>
            : <><span className="dd-doc-dot saved" /> saved</>}
        <span className="dd-doc-hint">edits sync to audit + activity</span>
      </div>
      <div
        ref={ref}
        className="dd-doc-edit"
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        onBlur={onBlur}
        spellCheck
      />
    </div>
  );
}

function kindIcon(kind: string | undefined): React.ReactNode {
  switch (kind) {
    case 'pdf': return I.fileText;
    case 'doc': return I.fileText;
    case 'xls':
    case 'csv': return I.barChart;
    case 'img': return I.image;
    case 'code': return I.code;
    default: return I.file;
  }
}

function DDAttachmentsTab({ attachments, onAttach }: { attachments: DossierAttachment[]; onAttach: (files: FileList) => void }) {
  const [over, setOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer?.files) onAttach(e.dataTransfer.files);
  };

  return (
    <div className="dd-att-wrap">
      <div
        className="dd-att-drop"
        data-over={over}
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        {I.paperclip}
        <span>Drop files or click to attach</span>
        <span className="dd-att-drop-sub">PDF · DOCX · XLSX · CSV · PNG · JSON</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files) onAttach(e.target.files); e.target.value = ''; }}
        />
      </div>
      {attachments.length === 0 ? (
        <div className="dd-att-empty">No attachments yet.</div>
      ) : (
        <div className="dd-att-list">
          {attachments.map((f, i) => (
            <div key={i} className="dd-att-row" data-live={!!f.live}>
              <span className={`dd-att-ico kind-${f.kind || 'file'}`}>{kindIcon(f.kind)}</span>
              <div className="dd-att-meta">
                <div className="dd-att-name">{f.name}</div>
                <div className="dd-att-sub">
                  <span>{DossierStore.fmtSize(f.size) || ''}</span>
                  <span>·</span>
                  <span>{f.who}</span>
                  <span>·</span>
                  <span>{fmtTime(f.when)}</span>
                  {f.source && <><span>·</span><span className="mono">{f.source}</span></>}
                </div>
              </div>
              {f.live && <span className="dd-att-tag">new</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DDActivityTab({ events }: { events: AuditEvent[] }) {
  if (!events.length) {
    return <div className="dd-act-empty">No activity yet on this section. Edits, attachments, and signatures will appear here.</div>;
  }
  return (
    <div className="dd-act-list">
      {events.map((e) => {
        const meta = AUDIT_KIND_META[e.kind] || { label: e.kind, tone: 'neutral' };
        return (
          <div key={e.id} className="dd-act-row" data-live={!!e.live}>
            <span className={`audit-chip tone-${meta.tone}`}>{meta.label}</span>
            <div className="dd-act-meta">
              <div className="dd-act-line">
                <span className="dd-act-actor">{e.actor}</span>
                {e.diff && <span className="dd-act-diff mono">{e.diff}</span>}
                {e.file && <span className="dd-act-file">{e.file}</span>}
                {e.signature && <span className="dd-act-sig mono">{e.signature}</span>}
              </div>
              <div className="dd-act-sub">{fmtTime(e.when)}{e.role && <> · {e.role}</>}</div>
            </div>
            {e.live && <span className="dd-act-tag">new</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ── Wrapper: the tab bar + active pane + drawer ─────────────── */
export interface PathwayPanesProps {
  pathway: PathwayKey;
  /** The host surface's existing content, rendered as the Workspace tab. */
  workspace: React.ReactNode;
  onAskAna: (text: string) => void;
  onOpenEditor?: OpenEditor;
  /** Canonical project id — anchors live audit + scopes correspondence. When
   *  absent, the panes fall back to the kit fixtures. */
  programId?: string | null;
}

export function PathwayPanes({ pathway, workspace, onAskAna, onOpenEditor, programId }: PathwayPanesProps) {
  const [tab, setTab] = React.useState<PaneTab>('workspace');
  const [drawerTarget, setDrawerTarget] = React.useState<SectionTarget | null>(null);
  const [drafterCorr, setDrafterCorr] = React.useState<Correspondence | null>(null);
  // Live backend data (audit / correspondence / approvals) with kit-fixture fallback.
  const data = usePathwayTabsData(pathway, programId);
  // Async-seed the dossier store (Files tree + drawer) from the real backend.
  const dossier = useDossierHydration(pathway, programId);

  const counts: PaneCounts = {
    audit: data.audit.length,
    correspondence: data.correspondence.length,
    corrOpen: data.correspondence.filter((c) => c.status === 'open').length,
    approvals: data.approvals.length,
    apPending: data.approvals.filter((a) => a.status === 'pending').length,
  };

  const openSection: OpenSection = (t) => setDrawerTarget(t);

  /* The drafter takes over the surface area while active. */
  if (drafterCorr) {
    return (
      <AnaDrafter
        correspondence={drafterCorr}
        pathway={pathway}
        onClose={() => setDrafterCorr(null)}
        onOpenSection={(t) => { setDrafterCorr(null); setDrawerTarget(t); }}
      />
    );
  }

  return (
    <>
      <PathwayTabBar tab={tab} setTab={setTab} pathway={pathway} counts={counts} />
      <div className="pwt-pane">
        {tab === 'workspace' && workspace}
        {tab === 'audit' && <AuditTrailPane pathway={pathway} events={data.audit} onOpenSection={openSection} />}
        {tab === 'correspondence' && (
          <CorrespondencePane pathway={pathway} items={data.correspondence} onOpenSection={openSection} onAskAna={onAskAna} onDraftResponse={(c) => setDrafterCorr(c)} />
        )}
        {tab === 'approvals' && <ApprovalsPane approvals={data.approvals} onOpenSection={openSection} />}
        {tab === 'files' && (
          <FilesTreePane
            key={`ftp-${pathway}-${dossier.version}`}
            pathway={pathway}
            onOpenSection={openSection}
          />
        )}
      </div>
      <DossierDrawer
        open={!!drawerTarget}
        target={drawerTarget}
        pathway={pathway}
        onClose={() => setDrawerTarget(null)}
        onOpenEditor={onOpenEditor}
      />
    </>
  );
}
