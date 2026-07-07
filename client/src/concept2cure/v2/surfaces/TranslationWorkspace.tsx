import React, { useState, useEffect, useMemo } from 'react';
import { I } from '../icons';
import {
  TXW_STATUS_META, TXW_METHODS, TXW_APPROVABLE_METHODS,
  STEPS, TXW_PROJECTS, TXW_SEGMENTS, TXW_GLOSSARY, TXW_QA, TXW_CATEGORIES,
  type TxwStatusKey, type SpanPart, type DntToken, type TxwSegment, type TxwQaFinding,
} from '../fixtures/translation-workspace-data';

/* TranslationWorkspace -- bilingual EN->JA regulatory translation surface.
   Renders inside the editor's right dock (sub-toggle: Sections | Segments | Glossary | QA). */

interface TxwSettings {
  enabled: boolean; requireBackTranslation: boolean; twoPersonRule: boolean;
  defaultEngine: string; targets: string[]; currentUser: number; autoOpenSegments: boolean;
}
interface SegmentCardProps {
  seg: TxwSegment; onAct: (segId: number, kind: string) => void;
  isActive: boolean; onSelect: (id: number) => void;
  onApprove: (seg: TxwSegment) => void; settings: TxwSettings;
}
interface SegmentsPanelProps { onOpenWide: () => void; onApprove: (seg: TxwSegment) => void; settings: TxwSettings; }
interface GovApproveModalProps { seg: TxwSegment | null; onCancel: () => void; onConfirm: (p: { meaning: string; reason: string }) => void; }
interface WideReviewModalProps { onClose: () => void; onApprove: (seg: TxwSegment) => void; settings: TxwSettings; }
interface TranslationWorkspaceProps { onTranslate?: () => void; }
interface QaPanelProps { onJump: (segId?: number) => void; }
interface QaGroupProps { items: (TxwQaFinding & { segmentId: number })[]; sev: string; label: string; onJump?: (segId: number) => void; }

function txStep(status: TxwStatusKey): string {
  for (const s of STEPS) if ((s.statuses as string[]).includes(status)) return s.id;
  return status === 'rejected' ? 'review' : 'draft';
}
function txStepIdx(stepId: string): number { return STEPS.findIndex(s => s.id === stepId); }

function renderSpan(spans: SpanPart[]): React.ReactNode {
  if (!Array.isArray(spans)) return (spans as unknown as string) || '';
  return spans.map((part, i) => {
    if (typeof part === 'string') return <React.Fragment key={i}>{part}</React.Fragment>;
    if (part && (part as DntToken).dnt) {
      const t = part as DntToken;
      return <span key={i} className="txw-dnt" data-cat={t.cat} title={(TXW_CATEGORIES[t.cat] || 'DNT') + ' -- do not translate'}>{t.dnt}</span>;
    }
    return null;
  });
}

function flattenSpans(spans: SpanPart[]): string {
  return (spans || []).map(p => typeof p === 'string' ? p : (p as DntToken).dnt).join('');
}

export function StatusPill({ status }: { status: TxwStatusKey }) {
  return <span className="txw-pill" data-s={status}>{(TXW_STATUS_META[status] || { short: status }).short}</span>;
}

export function Stepper({ status }: { status: TxwStatusKey }) {
  const active = txStep(status);
  const activeIdx = txStepIdx(active);
  const blocked = status === 'rejected';
  return (
    <div className="txw-step" role="progressbar" aria-label="Translation pipeline">
      {STEPS.map((s, i) => {
        let state = 'pending';
        if (status === 'approved') state = 'done';
        else if (i < activeIdx) state = 'done';
        else if (i === activeIdx) state = blocked ? 'blocked' : 'active';
        const last = i === STEPS.length - 1;
        return (
          <React.Fragment key={s.id}>
            <div className="txw-step-node" data-state={state}>
              <span className="txw-step-dot">{state === 'done' && (I?.check || null)}</span>
              <span className="txw-step-l">{s.label}</span>
            </div>
            {!last && <span className="txw-step-bar" data-done={i < activeIdx || status === 'approved' || undefined} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function SegmentCard({ seg, onAct, isActive, onSelect, onApprove, settings }: SegmentCardProps) {
  const qa = (TXW_QA[seg.id] || []);
  const qaErrs = qa.filter(f => f.severity === 'error').length;
  const approvable = TXW_APPROVABLE_METHODS.includes(seg.method);
  const hasBT = !!seg.backTranslationVerified;
  const samePersonReview = settings.twoPersonRule && seg.postEditor && seg.reviewer && seg.postEditor === seg.reviewer;
  const blockedReasons: string[] = [];
  if (!approvable) blockedReasons.push('Machine-only translation cannot be approved -- requires human post-edit.');
  if (settings.requireBackTranslation && !hasBT) blockedReasons.push('Back-translation evidence required before approval.');
  if (qaErrs > 0) blockedReasons.push(qaErrs + ' QA error' + (qaErrs === 1 ? '' : 's') + ' must be resolved.');
  if (samePersonReview) blockedReasons.push('Two-person rule -- reviewer must differ from post-editor.');
  const canDraft    = seg.status === 'pending';
  const canPostEdit = seg.status === 'mt_draft' || seg.status === 'in_progress';
  const canBT       = seg.status === 'in_progress';
  const canReview   = seg.status === 'back_translation' || (!settings.requireBackTranslation && seg.status === 'in_progress');
  const canApprove  = seg.status === 'review' && blockedReasons.length === 0;

  return (
    <div className="txw-seg" data-active={isActive || undefined} onClick={() => onSelect && onSelect(seg.id)}>
      <div className="txw-seg-h">
        <span className="txw-seg-k">{seg.segmentKey}</span>
        <span className="txw-seg-method" data-m={seg.method}>{TXW_METHODS[seg.method].label}</span>
        <span className="txw-seg-st"><StatusPill status={seg.status} /></span>
      </div>
      <div className="txw-text" data-lang={seg.targetLanguage.startsWith('en') ? 'en' : seg.targetLanguage.slice(0, 2)}>
        <div className="txw-text-l">Source <span className="txw-flag">EN</span></div>
        <div className="txw-text-body">{renderSpan(seg.source)}</div>
      </div>
      <div className="txw-text" data-lang="ja">
        <div className="txw-text-l">Target <span className="txw-flag">JA</span></div>
        <div className="txw-text-body">
          {(!seg.target || (Array.isArray(seg.target) && seg.target.every(p => typeof p === 'string' ? !p.trim() : false)))
            ? <span className="txw-text-empty">No target drafted yet.</span>
            : renderSpan(seg.target)}
        </div>
      </div>
      {hasBT && (
        <div className="txw-bt">
          <div className="txw-bt-l" data-ok="true">{I.shieldCheck}Back-translation verified</div>
          <div className="txw-bt-t">"{seg.backTranslationText}"</div>
        </div>
      )}
      {qa.length > 0 && (
        <div className="txw-qa">
          {qa.slice(0, 2).map((f, i) => (
            <div key={i} className="txw-qa-f" data-sev={f.severity}>
              {f.severity === 'error' ? I.alertTriangle : I.info}
              <span className="txw-qa-code">{f.checkId}</span>
              <span>{f.message}</span>
            </div>
          ))}
        </div>
      )}
      <Stepper status={seg.status} />
      {blockedReasons.length > 0 && seg.status === 'review' && (
        <div className="txw-block">
          {I.alertTriangle}
          <div><b>Cannot approve.</b> {blockedReasons.join(' ')}</div>
        </div>
      )}
      <div className="txw-acts" onClick={e => e.stopPropagation()}>
        {canDraft    && <button className="txw-act" onClick={() => onAct(seg.id, 'draft')}>{I.sparkles}Draft (MT)</button>}
        {canPostEdit && <button className="txw-act" onClick={() => onAct(seg.id, 'post_edit')}>{I.penLine || I.fileText}Post-edit</button>}
        {canBT       && <button className="txw-act" onClick={() => onAct(seg.id, 'back_translation')}>{I.gitCompare}Run back-translation</button>}
        {canReview   && <button className="txw-act" onClick={() => onAct(seg.id, 'submit_review')}>{I.arrowRight}Submit for review</button>}
        {seg.status === 'review' && (
          <button className="txw-act gov" disabled={!canApprove} aria-disabled={!canApprove}
            aria-describedby={!canApprove ? 'txw-block-' + seg.id : undefined}
            onClick={() => canApprove ? onApprove(seg) : null}>
            {I.shieldCheck}Approve &amp; sign
          </button>
        )}
        {seg.status === 'approved' && (
          <span style={{ fontSize: 10, color: 'var(--success)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {I.checkCircle || I.check} Approved · 21 CFR §11 signed
          </span>
        )}
      </div>
      {!canApprove && seg.status === 'review' && (
        <span id={'txw-block-' + seg.id} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>{blockedReasons.join(' ')}</span>
      )}
    </div>
  );
}

/* -- SegmentsPanel -- */
export function SegmentsPanel({ onOpenWide, onApprove, settings }: SegmentsPanelProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeId, setActiveId] = useState<number | null>(null);
  const segs = TXW_SEGMENTS;
  const prj = TXW_PROJECTS[0];
  const counts = segs.reduce<Record<string, number>>((m, s) => { m[s.status] = (m[s.status] || 0) + 1; return m; }, {});
  const filtered = statusFilter === 'all' ? segs : segs.filter(s => s.status === statusFilter);
  const approved = counts.approved || 0;
  const machine = segs.filter(s => s.method === 'machine' && s.status !== 'approved').length;
  const blocking = machine + (counts.rejected || 0) + Object.values(TXW_QA).flat().filter(f => f.severity === 'error').length;
  const submissionReady = approved === segs.length && segs.length > 0;
  const pct = segs.length ? Math.round((approved / segs.length) * 100) : 0;
  const filters: { id: string; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: segs.length }, { id: 'review', label: 'In review', count: counts.review || 0 },
    { id: 'in_progress', label: 'Editing', count: counts.in_progress || 0 }, { id: 'mt_draft', label: 'MT draft', count: counts.mt_draft || 0 },
    { id: 'pending', label: 'Pending', count: counts.pending || 0 }, { id: 'approved', label: 'Approved', count: counts.approved || 0 },
  ];

  const act = (segId: number, kind: string) => {
    /* Optimistic transitions -- production replaces with hook-based state. */
    for (let i = 0; i < TXW_SEGMENTS.length; i++) {
      const s = TXW_SEGMENTS[i];
      if (s.id !== segId) continue;
      if (kind === 'draft')            TXW_SEGMENTS[i] = { ...s, status: 'mt_draft', method: 'machine' };
      if (kind === 'post_edit')        TXW_SEGMENTS[i] = { ...s, status: 'in_progress', method: 'mt_postedited', postEditor: settings.currentUser || 7 };
      if (kind === 'back_translation') TXW_SEGMENTS[i] = { ...s, status: 'back_translation', backTranslationVerified: true, backTranslationText: s.backTranslationText || 'Back-translated draft pending QC review.' };
      if (kind === 'submit_review')    TXW_SEGMENTS[i] = { ...s, status: 'review' };
    }
    setActiveId(segId);
    setStatusFilter(f => f); /* Force rerender */
  };

  return (
    <div className="txw-body">
      {prj && (
        <div className="txw-prj">
          <div className="txw-prj-top">
            <span className="txw-prj-nm">{prj.name}</span>
            <span className="txw-prj-lang">EN → JA</span>
          </div>
          <div className="txw-prj-sub">{prj.submissionContext} · {segs.length} segments · {approved} approved</div>
          <div className="txw-ready" data-ready={submissionReady}>
            <span className="txw-ready-ico">{submissionReady ? I.shieldCheck : I.alertTriangle}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="txw-ready-l">{submissionReady ? 'Submission ready' : 'Not submission ready'}</div>
              <div className="txw-ready-m">
                {submissionReady
                  ? 'All segments approved with verified back-translation.'
                  : (blocking ? blocking + ' blocking item' + (blocking === 1 ? '' : 's') + ' -- machine-only, QA errors, or rejections.' : (segs.length - approved) + ' segment' + (segs.length - approved === 1 ? '' : 's') + ' not yet approved.')}
              </div>
              <div className="txw-ready-bar"><span style={{ width: pct + '%' }} /></div>
            </div>
          </div>
        </div>
      )}
      <div className="txw-filter">
        <span className="txw-filter-l">Status</span>
        {filters.map(f => (
          <button key={f.id} className="txw-chip" data-on={statusFilter === f.id || undefined}
            onClick={() => setStatusFilter(f.id)}>
            {f.label}<span className="txw-chip-ct">{f.count}</span>
          </button>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="txw-empty">No segments match this filter. Try "All" to see everything queued for translation.</div>
      )}
      {filtered.map(seg => (
        <SegmentCard key={seg.id} seg={seg} onAct={act} onApprove={onApprove}
          isActive={activeId === seg.id} onSelect={setActiveId} settings={settings} />
      ))}
    </div>
  );
}

export function GlossaryPanel() {
  const cats = TXW_CATEGORIES;
  const [q, setQ] = useState('');
  const [showDnt, setShowDnt] = useState<'all' | 'dnt' | 'pref'>('all');
  const all = TXW_GLOSSARY;
  const rows = all.filter(g => {
    if (showDnt === 'dnt' && !g.dnt) return false;
    if (showDnt === 'pref' && g.dnt) return false;
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return g.src.toLowerCase().includes(t) || (g.tgt || '').toLowerCase().includes(t) || (cats[g.cat] || '').toLowerCase().includes(t);
  });
  return (
    <div className="txw-body">
      <div className="txw-gloss-search">
        {I.search}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search source or target term..." />
        <button className="txw-gloss-add">{I.plus}Add</button>
      </div>
      <div className="txw-filter">
        <span className="txw-filter-l">Type</span>
        <button className="txw-chip" data-on={showDnt === 'all' || undefined} onClick={() => setShowDnt('all')}>All<span className="txw-chip-ct">{all.length}</span></button>
        <button className="txw-chip" data-on={showDnt === 'dnt' || undefined} onClick={() => setShowDnt('dnt')}>Do-not-translate<span className="txw-chip-ct">{all.filter(g => g.dnt).length}</span></button>
        <button className="txw-chip" data-on={showDnt === 'pref' || undefined} onClick={() => setShowDnt('pref')}>Preferred<span className="txw-chip-ct">{all.filter(g => !g.dnt).length}</span></button>
      </div>
      <div className="txw-gloss">
        {rows.length === 0 && <div className="txw-empty">No glossary entries match. Add a term to seed the DNT or preferred-translation registry.</div>}
        {rows.map(g => (
          <div key={g.id} className="txw-gloss-row">
            <div>
              <span className="txw-gloss-src">{g.src}</span>
              <span className="txw-gloss-arrow">→</span>
              <span className="txw-gloss-tgt" data-dnt={g.dnt || undefined}>{g.dnt ? '-- (do not translate)' : g.tgt}</span>
            </div>
            <div className="txw-gloss-meta">
              <span className="txw-gloss-cat">{cats[g.cat] || g.cat}</span>
              <span className="txw-gloss-scope" data-scope={g.scope}>{g.scope === 'org' ? 'Org-wide' : 'Project'}</span>
              {g.dnt && <span className="txw-dnt" data-cat={g.cat} style={{ fontSize: 9 }}>DNT</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function QaPanel({ onJump }: QaPanelProps) {
  const segs = TXW_SEGMENTS;
  const flat: (TxwQaFinding & { segmentId: number })[] = [];
  Object.keys(TXW_QA).forEach(sid => TXW_QA[Number(sid)].forEach(f => flat.push({ ...f, segmentId: Number(sid) })));
  const errs = flat.filter(f => f.severity === 'error');
  const warns = flat.filter(f => f.severity === 'warning');
  const infos = flat.filter(f => f.severity === 'info');
  const Group = ({ items, sev, label }: QaGroupProps) => items.length === 0 ? null : (
    <div style={{ padding: '4px 0' }}>
      <div className="txw-filter-l" style={{ padding: '0 14px', margin: '8px 0 6px' }}>{label} -- {items.length}</div>
      {items.map((f, i) => {
        const seg = segs.find(s => s.id === f.segmentId);
        return (
          <button key={sev + i} className="txw-qa-f" data-sev={sev}
            style={{ margin: '4px 12px', width: 'calc(100% - 24px)', textAlign: 'left' as const }}
            onClick={() => onJump && onJump(f.segmentId)}>
            {sev === 'error' ? I.alertTriangle : sev === 'warning' ? I.alertTriangle : I.info}
            <span className="txw-qa-code">{f.checkId}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontWeight: 600 }}>{seg ? seg.segmentKey : 'seg#' + f.segmentId}</b> -- {f.message}
            </span>
          </button>
        );
      })}
    </div>
  );
  return (
    <div className="txw-body">
      <div className="txw-prj" style={{ paddingBottom: 12 }}>
        <div className="txw-prj-top">
          <span className="txw-prj-nm">QA findings</span>
          <span className="txw-prj-lang">{flat.length} total</span>
        </div>
        <div className="txw-prj-sub">Errors block auto-advance and approval. Warnings require reviewer judgement.</div>
      </div>
      {flat.length === 0 && <div className="txw-empty">No findings yet. Run QA from the segment list or post-edit a draft.</div>}
      <Group items={errs}  sev="error"   label="Errors"   onJump={onJump} />
      <Group items={warns} sev="warning" label="Warnings" onJump={onJump} />
      <Group items={infos} sev="info"    label="Info"      onJump={onJump} />
    </div>
  );
}

export function GovApproveModal({ seg, onCancel, onConfirm }: GovApproveModalProps) {
  const meanings = (window as any).ESIGN_MEANINGS || ['APPROVER', 'VERIFIER', 'AUTHOR', 'REVIEWER'];
  const [meaning, setMeaning] = useState('APPROVER');
  const [pw, setPw] = useState('');
  const [totp, setTotp] = useState('');
  const [reason, setReason] = useState('');
  const canSign = pw && totp.length === 6 && reason.trim().length >= 12;
  if (!seg) return null;
  return (
    <div className="txw-gov-bd" onClick={onCancel}>
      <div className="txw-gov" onClick={e => e.stopPropagation()} role="dialog" aria-labelledby="txw-gov-t">
        <div className="txw-gov-h">{I.shieldCheck}<span id="txw-gov-t" className="txw-gov-h-t">Sign to approve translation</span></div>
        <div className="txw-gov-b">
          <div className="txw-gov-summ">
            Approving <b>segment {seg.segmentKey}</b> ({TXW_METHODS[seg.method].label}) for <b>{seg.targetLanguage}</b>. Your signature is recorded per <b>21 CFR §11.50</b> and is hash-bound into the audit trail.
          </div>
          <div className="txw-gov-field"><label htmlFor="m">Meaning of signature</label>
            <select id="m" value={meaning} onChange={e => setMeaning(e.target.value)}>{meanings.map((m: string) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}</select>
          </div>
          <div className="txw-gov-field"><label htmlFor="r">Reason for change <span style={{ color: 'var(--text-400)', fontWeight: 400 }}>(≥12 chars)</span></label>
            <textarea id="r" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Reviewed against ICH M4 §2.5 source; terminology aligns with PMDA glossary." />
          </div>
          <div className="txw-gov-field"><label htmlFor="pw">Password</label>
            <input id="pw" type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Re-enter your password" autoComplete="current-password" />
          </div>
          <div className="txw-gov-field"><label htmlFor="t">Authenticator code</label>
            <input id="t" inputMode="numeric" maxLength={6} value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g, ''))} placeholder="6-digit TOTP" />
          </div>
          <div className="txw-gov-manif">
            On sign -- segment status moves to <b>approved</b>, the back-translation lock is sealed, and the responseAssembly process picks it up for the package.
          </div>
        </div>
        <div className="txw-gov-f">
          <button onClick={onCancel}>Cancel</button>
          <button className="pri" disabled={!canSign} onClick={() => onConfirm({ meaning, reason })}>{I.shieldCheck} Sign &amp; approve</button>
        </div>
      </div>
    </div>
  );
}

export function WideReviewModal({ onClose, onApprove, settings }: WideReviewModalProps) {
  const segs = TXW_SEGMENTS;
  const [sel, setSel] = useState<number | null>(segs[0] ? segs[0].id : null);
  const seg = segs.find(s => s.id === sel) || segs[0];
  if (!seg) return null;
  const [draft, setDraft] = useState(flattenSpans(seg.target));
  useEffect(() => { setDraft(flattenSpans(seg.target)); }, [seg.id]);
  return (
    <div className="txw-wide-bd" onClick={onClose}>
      <div className="txw-wide-bx" onClick={e => e.stopPropagation()} role="dialog" aria-label="Bilingual review">
        <div className="txw-wide-h">
          <div>
            <div className="txw-wide-t">Bilingual review — {TXW_PROJECTS[0]?.name}</div>
            <div className="txw-wide-sub">EN → JA · 21 CFR Part 11 governed · {segs.length} segments</div>
          </div>
          <button className="txw-wide-close" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>
        <div className="txw-wide-body">
          <div className="txw-wide-list">
            {segs.map(s => (
              <button key={s.id} className="txw-wide-row" data-on={s.id === sel || undefined} onClick={() => setSel(s.id)}>
                <div className="txw-wide-row-top">
                  <span className="txw-seg-k">{s.segmentKey}</span>
                  <span className="txw-seg-method" data-m={s.method}>{TXW_METHODS[s.method].label}</span>
                  <span style={{ marginLeft: 'auto' }}><StatusPill status={s.status} /></span>
                </div>
                <div className="txw-wide-row-src">{flattenSpans(s.source).slice(0, 140)}</div>
              </button>
            ))}
          </div>
          <div className="txw-wide-detail">
            <div className="txw-wide-cols">
              <div className="txw-wide-col" data-lang="en">
                <div className="txw-wide-col-h">Source <span className="txw-flag">EN</span><span style={{ marginLeft: 'auto', color: 'var(--text-400)', fontWeight: 500 }}>{seg.segmentKey}</span></div>
                <div className="txw-wide-col-body">{renderSpan(seg.source)}</div>
              </div>
              <div className="txw-wide-col" data-lang="ja">
                <div className="txw-wide-col-h">Target <span className="txw-flag">JA</span>
                  <span style={{ marginLeft: 'auto' }}><StatusPill status={seg.status} /></span>
                </div>
                <div className="txw-wide-col-body">
                  <textarea value={draft} onChange={e => setDraft(e.target.value)} aria-label="Translated target text" lang="ja" />
                </div>
              </div>
            </div>
            <div className="txw-wide-foot">
              <div className="txw-wide-foot-step"><Stepper status={seg.status} /></div>
              <button className="txw-act">{I.gitCompare}Run back-translation</button>
              <button className="txw-act">{I.sparkles}AnA suggest</button>
              <button className="txw-act gov" disabled={seg.status !== 'review' || seg.method === 'machine'}
                onClick={() => onApprove(seg)}>
                {I.shieldCheck}Approve &amp; sign
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TranslationWorkspace({ onTranslate }: TranslationWorkspaceProps) {
  const [tab, setTab] = useState('segments');
  const [wide, setWide] = useState(false);
  const [gov, setGov] = useState<TxwSegment | null>(null);
  const settings = useMemo<TxwSettings>(() => {
    const a = (window as any).TXW_ADMIN || {};
    const u = (window as any).TXW_USER || {};
    return {
      enabled: a.enabled !== false, requireBackTranslation: a.requireBackTranslation !== false,
      twoPersonRule: a.twoPersonRule !== false, defaultEngine: a.defaultEngine || 'C2C-RIM-MT v2.4',
      targets: a.targets || ['ja-JP', 'zh-CN', 'de-DE', 'fr-FR'],
      currentUser: u.userId || 7, autoOpenSegments: u.autoOpenSegments !== false,
    };
  }, []);

  if (!settings.enabled) return (
    <div className="txw">
      <div className="txw-empty" style={{ padding: '40px 24px' }}>
        <div style={{ fontWeight: 600, color: 'var(--text-200)', marginBottom: 6 }}>Translation workspace is off</div>
        Enable it in Admin {'>'} Translation workspace to draft, post-edit, and certify translated regulatory content.
      </div>
    </div>
  );

  const tx = TXW_SEGMENTS;
  const counts = { segments: tx.length, gloss: TXW_GLOSSARY.length, qa: Object.values(TXW_QA).flat().length };
  const approve = (seg: TxwSegment) => setGov(seg);
  const finishApprove = ({ meaning, reason }: { meaning: string; reason: string }) => {
    if (!gov) return;
    for (let i = 0; i < TXW_SEGMENTS.length; i++) {
      const s = TXW_SEGMENTS[i];
      if (s.id === gov.id) {
        TXW_SEGMENTS[i] = { ...s, status: 'approved',
          reviewer: settings.currentUser === s.postEditor ? (s.reviewer || 12) : settings.currentUser,
          approvedBy: settings.currentUser, approvedAt: new Date().toISOString() };
      }
    }
    setGov(null);
    setTab('segments');
  };
  const TransPane = (window as any).TranslationPane;

  return (
    <div className="txw">
      <div className="txw-toggle">
        <div className="txw-toggle-grp" role="tablist" aria-label="Translation views">
          <button className="txw-toggle-b" role="tab" aria-selected={tab === 'sections'} data-on={tab === 'sections' || undefined} onClick={() => setTab('sections')}>Sections</button>
          <button className="txw-toggle-b" role="tab" aria-selected={tab === 'segments'} data-on={tab === 'segments' || undefined} onClick={() => setTab('segments')}>Segments<span className="txw-count">{counts.segments}</span></button>
          <button className="txw-toggle-b" role="tab" aria-selected={tab === 'gloss'} data-on={tab === 'gloss' || undefined} onClick={() => setTab('gloss')}>Glossary<span className="txw-count">{counts.gloss}</span></button>
          <button className="txw-toggle-b" role="tab" aria-selected={tab === 'qa'} data-on={tab === 'qa' || undefined} onClick={() => setTab('qa')}>QA<span className="txw-count">{counts.qa}</span></button>
        </div>
        {tab === 'segments' && (
          <button className="txw-wide" onClick={() => setWide(true)} title="Open bilingual review in a full-bleed editor">
            {I.maximize}Wide review
          </button>
        )}
      </div>
      {tab === 'sections' && TransPane && <TransPane onTranslate={onTranslate} />}
      {tab === 'segments' && <SegmentsPanel onOpenWide={() => setWide(true)} onApprove={approve} settings={settings} />}
      {tab === 'gloss'    && <GlossaryPanel />}
      {tab === 'qa'       && <QaPanel onJump={() => setTab('segments')} />}
      {wide && <WideReviewModal onClose={() => setWide(false)} onApprove={approve} settings={settings} />}
      {gov  && <GovApproveModal seg={gov} onCancel={() => setGov(null)} onConfirm={finishApprove} />}
    </div>
  );
}
