/* global React, I, AUDIT_KIND_META, PATHWAY_TABS_DATA */
/* PathwayPanes.jsx — the three new pathway sub-tabs that all pathway surfaces
   share, plus the DossierDrawer that lets any of them route to the live
   document section.

   Components in order:
     PathwayTabBar        — sub-nav switcher (Workspace · Audit · Correspondence · Approvals)
     AuditTrailPane       — two-pane: events list + detail with hash chain + signed export
     CorrespondencePane   — letters/queries triage list + detail (refs link to dossier)
     ApprovalsPane        — pending + signed approvals; inline e-sign block
     DossierDrawer        — right-side drawer that renders a section preview
                            anchored to a target section id; opened from any pane

   The drawer is purely a preview surface. The "Open in editor" button hands
   off to the existing onOpenEditor route — i.e. the drawer never duplicates
   the editor, it acts as the bridge into it. */

const { useState: useStateP, useMemo: useMemoP } = React;

/* ─────────────────────────────────────────────────────────────
   Time formatter — relative for <24h, full for >24h.
   ───────────────────────────────────────────────────────────── */
function fmtTime(iso, opts = {}) {
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

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00Z');
  const today = new Date();
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/* ─────────────────────────────────────────────────────────────
   PathwayTabBar
   ───────────────────────────────────────────────────────────── */
function PathwayTabBar({ tab, setTab, pathway, counts }) {
  const corrLabel = PATHWAY_TABS_DATA[pathway]?.corrLabel || 'Correspondence';
  const tabs = [
    { id: 'workspace',     label: 'Workspace',        sub: pathway === 'k510' ? 'Predicate · SE · eSTAR' : pathway === 'pma' ? 'Phases · modules' : 'Signals · literature' },
    { id: 'audit',         label: 'Audit trail',      sub: '21 CFR Part 11', count: counts.audit },
    { id: 'correspondence',label: corrLabel,          sub: 'Agency / NB queries', count: counts.correspondence, badge: counts.corrOpen > 0 },
    { id: 'approvals',     label: 'Approvals',        sub: 'Pending e-sign',  count: counts.approvals, badge: counts.apPending > 0 },
    { id: 'files',         label: 'Files',            sub: 'Full filesystem' },
  ];
  return (
    <div className="pwt-bar" role="tablist" aria-label="Pathway sub-tabs">
      {tabs.map(t => (
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

/* ─────────────────────────────────────────────────────────────
   AuditTrailPane — two-pane: events list + detail.
   ───────────────────────────────────────────────────────────── */
function AuditTrailPane({ events, onOpenSection }) {
  const [selectedId, setSelectedId] = useStateP(events[0]?.id);
  const [filterKind, setFilterKind] = useStateP('all');

  const KINDS = [
    { id: 'all',     label: 'All' },
    { id: 'sign',    label: 'E-sign' },
    { id: 'review',  label: 'Review' },
    { id: 'edit',    label: 'Edits' },
    { id: 'comment', label: 'Comments' },
    { id: 'access',  label: 'Access' },
  ];

  const filtered = useMemoP(() => {
    if (filterKind === 'all') return events;
    return events.filter(e => {
      if (filterKind === 'edit')   return e.kind === 'section.edit' || e.kind === 'section.lock' || e.kind === 'section.unlock' || e.kind === 'attach';
      if (filterKind === 'review') return e.kind === 'review.start' || e.kind === 'review.complete';
      if (filterKind === 'sign')   return e.kind === 'sign';
      if (filterKind === 'comment')return e.kind === 'comment';
      if (filterKind === 'access') return e.kind === 'access' || e.kind === 'export';
      return true;
    });
  }, [events, filterKind]);

  const selected = events.find(e => e.id === selectedId) || filtered[0];

  /* Group by day */
  const groups = useMemoP(() => {
    const out = [];
    let curDay = null;
    let curList = null;
    for (const e of filtered) {
      const d = new Date(e.when);
      const key = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      if (key !== curDay) {
        curDay = key;
        curList = { day: key, items: [] };
        out.push(curList);
      }
      curList.items.push(e);
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
            {KINDS.map(k => (
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
          {groups.map(g => (
            <div key={g.day} className="audit-group">
              <div className="audit-day">{g.day}</div>
              {g.items.map(e => {
                const meta = AUDIT_KIND_META[e.kind] || { label: e.kind, tone: 'neutral' };
                return (
                  <button
                    key={e.id}
                    className={`audit-row ${selectedId === e.id ? 'sel' : ''}`}
                    onClick={() => setSelectedId(e.id)}
                  >
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
          {filtered.length === 0 && (
            <div className="audit-empty">No events match this filter.</div>
          )}
        </div>

        <div className="audit-detail">
          {selected ? <AuditDetail e={selected} onOpenSection={onOpenSection}/> : <div className="audit-empty">Select an event to view detail.</div>}
        </div>
      </div>
    </div>
  );
}

function AuditDetail({ e, onOpenSection }) {
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
        {e.body && <><dt>Body</dt><dd className="audit-body">"{e.body}"</dd></>}
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

      {e.target_id && onOpenSection && (
        <div className="audit-det-actions">
          <button className="audit-act primary" onClick={() => onOpenSection({ id: e.target_id, label: e.target })}>
            {I.fileText} Open in dossier
          </button>
          <button className="audit-act">{I.download} Export this event</button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   CorrespondencePane — agency / NB letters list + detail.
   ───────────────────────────────────────────────────────────── */
function CorrespondencePane({ pathway, items, onOpenSection, onAskAna, onDraftResponse }) {
  const [statusFilter, setStatusFilter] = useStateP('all');
  const [selectedId, setSelectedId] = useStateP(items[0]?.id);

  const filtered = useMemoP(() => {
    if (statusFilter === 'all') return items;
    return items.filter(i => i.status === statusFilter);
  }, [items, statusFilter]);

  const selected = items.find(i => i.id === selectedId) || filtered[0];

  const counts = {
    open:      items.filter(i => i.status === 'open').length,
    review:    items.filter(i => i.status === 'in_review').length,
    closed:    items.filter(i => i.status === 'closed').length,
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
            { id: 'all',       label: 'All' },
            { id: 'open',      label: 'Open' },
            { id: 'in_review', label: 'In review' },
            { id: 'closed',    label: 'Closed' },
          ].map(s => (
            <button key={s.id} className={`audit-filter ${statusFilter === s.id ? 'active' : ''}`} onClick={() => setStatusFilter(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="corr-grid">
        <div className="corr-list">
          {filtered.map(c => {
            const days = daysUntil(c.due);
            const overdue = days !== null && days < 0;
            return (
              <button key={c.id} className={`corr-row ${selectedId === c.id ? 'sel' : ''}`} onClick={() => setSelectedId(c.id)}>
                <div className="corr-row-top">
                  <span className={`corr-kind k-${c.kind.toLowerCase().replace(/\s|&/g, '-')}`}>{c.kind}</span>
                  {c.ai && <span className="corr-ai" title="AnA flagged">{I.sparkles} flagged</span>}
                  <span className="corr-spacer"/>
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
          {selected && <CorrDetail c={selected} onOpenSection={onOpenSection} onAskAna={onAskAna} onDraftResponse={onDraftResponse}/>}
        </div>
      </div>
    </div>
  );
}

function CorrDetail({ c, onOpenSection, onAskAna, onDraftResponse }) {
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
        <div className={`corr-due-banner ${overdue ? 'err' : days <= 3 ? 'warn' : ''}`}>
          {I.clock} Response due {fmtDate(c.due)} {days !== null && <span>({overdue ? `${-days} days late` : `${days} days`})</span>}
        </div>
      )}

      <div className="corr-det-body">{c.summary}</div>

      {c.refs && c.refs.length > 0 && (
        <div className="corr-refs">
          <div className="corr-refs-label">References in dossier</div>
          <div className="corr-refs-list">
            {c.refs.map((r, i) => (
              <button key={i} className="corr-ref" onClick={() => onOpenSection && onOpenSection({ id: r.section, label: r.label })}>
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
        <button className="audit-act primary" onClick={() => onDraftResponse ? onDraftResponse(c) : (onAskAna && onAskAna(`Draft response to ${c.kind}: ${c.subject}`))}>
          {I.sparkles} Draft response with AnA
        </button>
        <button className="audit-act">{I.userPlus} Assign</button>
        <button className="audit-act">{I.check} Mark closed</button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ApprovalsPane — pending e-sign workflow + signed history.
   ───────────────────────────────────────────────────────────── */
function ApprovalsPane({ approvals, onOpenSection, currentUser = 'You' }) {
  const pending = approvals.filter(a => a.status === 'pending');
  const signed  = approvals.filter(a => a.status === 'signed');

  return (
    <div className="ap-pane">
      <div className="ap-section">
        <div className="ap-sec-hdr">
          <div>
            <div className="ap-sec-title">Pending your signature</div>
            <div className="ap-sec-sub">{pending.filter(a => a.signer === currentUser).length} require your e-sign · {pending.length} total open</div>
          </div>
          <span className="ap-cfr">21 CFR Part 11 · §11.50 · §11.70</span>
        </div>

        {pending.length === 0 && <div className="audit-empty">No pending approvals.</div>}

        {pending.map(a => (
          <ApprovalCard key={a.id} a={a} mine={a.signer === currentUser} onOpenSection={onOpenSection}/>
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
          {signed.map(a => (
            <div key={a.id} className="ap-signed-row">
              <span className="ap-stage-pill" data-stage={a.stage}>{a.stage}</span>
              <div className="ap-signed-target">
                <div className="ap-signed-name">{a.target}</div>
                <div className="ap-signed-meta">{a.signer} · {a.role} · {fmtTime(a.signed_at, { full: true })}</div>
              </div>
              <span className="audit-signed" title="Signed · Part 11">{I.lock}</span>
              {a.target_id && (
                <button className="ap-link" onClick={() => onOpenSection && onOpenSection({ id: a.target_id, label: a.target })}>
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

function ApprovalCard({ a, mine, onOpenSection }) {
  const [signing, setSigning] = useStateP(false);
  const [pwd, setPwd] = useStateP('');
  const [meaning, setMeaning] = useStateP(a.meaning || '');
  const [signed, setSigned] = useStateP(false);

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
        <div className="ap-card-meta">Acknowledged: "{meaning}" · WP-{Math.floor(Math.random() * 9000 + 1000)}</div>
      </div>
    );
  }

  return (
    <div className={`ap-card ${mine ? 'mine' : ''}`}>
      <div className="ap-card-hdr">
        <span className="ap-stage-pill" data-stage={a.stage}>{a.stage}</span>
        <span className="ap-card-due-spacer"/>
        {a.due && (
          <span className={`ap-card-due ${overdue ? 'err' : days <= 2 ? 'warn' : ''}`}>
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
            <button className="ap-review-btn" onClick={() => onOpenSection && onOpenSection({ id: a.target_id, label: a.target })}>
              {I.fileText} Review in dossier
            </button>
          )}
        </div>
      )}

      {!mine && (
        <div className="ap-card-actions">
          <button className="ap-review-btn">{I.bell} Remind {a.signer.split(' ')[0]}</button>
          {a.target_id && (
            <button className="ap-review-btn" onClick={() => onOpenSection && onOpenSection({ id: a.target_id, label: a.target })}>
              {I.fileText} View
            </button>
          )}
        </div>
      )}

      {mine && signing && (
        <div className="ap-sign-form">
          <div className="ap-sign-attest">
            <span className="ap-sign-attest-label">Meaning of signature</span>
            <input
              className="ap-sign-input"
              value={meaning}
              onChange={(e) => setMeaning(e.target.value)}
              placeholder="e.g. Reviewed and approved"
            />
          </div>
          <div className="ap-sign-creds">
            <input
              className="ap-sign-input"
              type="password"
              placeholder="Re-enter password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
            />
            <button
              className="ap-sign-confirm"
              disabled={pwd.length < 6 || meaning.trim().length === 0}
              onClick={() => setSigned(true)}
            >
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

/* ─────────────────────────────────────────────────────────────
   DossierDrawer — right-side preview of a dossier section.
   The drawer lets users keep their place in audit / correspondence
   / approvals while inspecting the live document.

   For 510(k), the section list is K510_ESTAR (already in scope).
   For PMA / CER, we synthesize a minimal preview from the target
   label since module/section bodies are owned by their editors.
   The "Open full editor" CTA hands off to the existing route.
   ───────────────────────────────────────────────────────────── */
function DossierDrawer({ open, target, pathway, onClose, onOpenEditor }) {
  /* Hooks must be called unconditionally — guard the body, not the hooks. */
  const safeTarget = target || { id: '', label: '' };
  const [tab, setTab] = React.useState('document');
  const [autosaveAt, setAutosaveAt] = React.useState(null);

  /* Live store binding — re-renders when body / meta / attachments change. */
  const { body, meta, attachments, folder } = (window.useSection
    ? window.useSection(pathway, safeTarget.id, safeTarget.label)
    : { body: '', meta: {}, attachments: [], folder: '' });

  const activity = React.useMemo(() => {
    if (!window.DossierStore) return [];
    return window.DossierStore.activityForSection(pathway, safeTarget.id);
  }, [pathway, safeTarget.id, body, attachments.length]);

  /* Reset to Document tab whenever a new target opens. */
  React.useEffect(() => { if (open) setTab('document'); }, [open, safeTarget.id]);

  if (!open || !target) return null;

  const onCommitBody = (next) => {
    if (!window.DossierStore || next === body) return;
    window.DossierStore.writeSectionBody(pathway, safeTarget.id, safeTarget.label, next, { who: 'You', role: 'Reg Lead' });
    setAutosaveAt(new Date());
  };

  const onAttach = (files) => {
    if (!window.DossierStore || !files || !files.length) return;
    Array.from(files).forEach((f) => {
      window.DossierStore.attachFile(pathway, safeTarget.id, safeTarget.label, {
        name: f.name, size: f.size, kind: window.DossierStore.guessKind(f.name),
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
      <div className="dd-scrim" onClick={onClose}/>
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
          <button role="tab" aria-selected={tab==='document'}    className="dd-tab" data-on={tab==='document'}    onClick={()=>setTab('document')}>Document</button>
          <button role="tab" aria-selected={tab==='attachments'} className="dd-tab" data-on={tab==='attachments'} onClick={()=>setTab('attachments')}>
            Attachments {attachments.length > 0 && <span className="dd-tab-count">{attachments.length}</span>}
          </button>
          <button role="tab" aria-selected={tab==='activity'}    className="dd-tab" data-on={tab==='activity'}    onClick={()=>setTab('activity')}>
            Activity {activity.length > 0 && <span className="dd-tab-count">{activity.length}</span>}
          </button>
        </div>

        <div className="dd-body">
          {tab === 'document'    && <DDDocumentTab    body={body} onCommit={onCommitBody} autosaveAt={autosaveAt}/>}
          {tab === 'attachments' && <DDAttachmentsTab attachments={attachments} onAttach={onAttach}/>}
          {tab === 'activity'    && <DDActivityTab    events={activity}/>}
        </div>

        <div className="dd-foot">
          <span className="dd-foot-meta">
            <span className="dd-foot-status">
              <span className={`dd-status-dot ${status}`}/>
              {status}
            </span>
            {lastEdited && <><span>·</span><span>Last edited {fmtTime(lastEdited)}</span></>}
            <span>·</span>
            <span>v{version}</span>
          </span>
          <button className="dd-foot-edit" onClick={() => { onOpenEditor && onOpenEditor(safeTarget.id); onClose && onClose(); }}>
            {I.edit} Open in editor
          </button>
        </div>
      </aside>
    </>
  );
}

/* ─────────────── Document tab — contentEditable markdown w/ autosave ─────────────── */

function DDDocumentTab({ body, onCommit, autosaveAt }) {
  const ref = React.useRef(null);
  const debounceRef = React.useRef(null);
  const [dirty, setDirty] = React.useState(false);

  /* Sync DOM when body changes upstream (different section, or external write). */
  React.useEffect(() => {
    if (ref.current && ref.current.innerText !== body) {
      ref.current.innerText = body;
      setDirty(false);
    }
  }, [body]);

  const onInput = (e) => {
    setDirty(true);
    clearTimeout(debounceRef.current);
    const next = e.target.innerText;
    debounceRef.current = setTimeout(() => {
      onCommit(next);
      setDirty(false);
    }, 600);
  };

  const onBlur = (e) => {
    clearTimeout(debounceRef.current);
    const next = e.target.innerText;
    if (next !== body) { onCommit(next); setDirty(false); }
  };

  return (
    <div className="dd-doc-wrap">
      <div className="dd-doc-status">
        {dirty
          ? <><span className="dd-doc-dot dirty"/> editing…</>
          : autosaveAt
            ? <><span className="dd-doc-dot saved"/> saved {fmtTime(autosaveAt.toISOString())}</>
            : <><span className="dd-doc-dot saved"/> saved</>
        }
        <span className="dd-doc-hint">edits sync to audit + activity</span>
      </div>
      <div
        ref={ref}
        className="dd-doc-edit"
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        onBlur={onBlur}
        spellCheck={true}
      />
    </div>
  );
}

/* ─────────────── Attachments tab — drop zone + file rows ─────────────── */

function DDAttachmentsTab({ attachments, onAttach }) {
  const [over, setOver] = React.useState(false);
  const inputRef = React.useRef(null);

  const onDrop = (e) => {
    e.preventDefault(); setOver(false);
    if (e.dataTransfer?.files) onAttach(e.dataTransfer.files);
  };

  return (
    <div className="dd-att-wrap">
      <div
        className="dd-att-drop"
        data-over={over}
        onDragEnter={(e)=>{e.preventDefault();setOver(true);}}
        onDragOver={(e)=>{e.preventDefault();setOver(true);}}
        onDragLeave={()=>setOver(false)}
        onDrop={onDrop}
        onClick={()=>inputRef.current?.click()}
      >
        {I.paperclip}
        <span>Drop files or click to attach</span>
        <span className="dd-att-drop-sub">PDF · DOCX · XLSX · CSV · PNG · JSON</span>
        <input ref={inputRef} type="file" multiple style={{display:'none'}}
               onChange={(e)=>{ if (e.target.files) onAttach(e.target.files); e.target.value=''; }}/>
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
                  <span>{window.DossierStore?.fmtSize(f.size) || ''}</span>
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

function kindIcon(kind) {
  switch (kind) {
    case 'pdf':  return I.fileText || I.file;
    case 'doc':  return I.fileText || I.file;
    case 'xls':
    case 'csv':  return I.barChart || I.file;
    case 'img':  return I.image || I.file;
    case 'code': return I.code || I.file;
    default:     return I.file;
  }
}

/* ─────────────── Activity tab — section-scoped audit slice ─────────────── */

function DDActivityTab({ events }) {
  if (!events.length) {
    return <div className="dd-act-empty">No activity yet on this section. Edits, attachments, and signatures will appear here.</div>;
  }
  return (
    <div className="dd-act-list">
      {events.map((e) => {
        const meta = (window.AUDIT_KIND_META || {})[e.kind] || { label: e.kind, tone: 'neutral' };
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

Object.assign(window, {
  PathwayTabBar,
  AuditTrailPane,
  CorrespondencePane,
  ApprovalsPane,
  DossierDrawer,
});
