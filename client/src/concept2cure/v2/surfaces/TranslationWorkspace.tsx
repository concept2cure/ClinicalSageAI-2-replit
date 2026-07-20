import React, { useState, useEffect, useRef, useMemo } from 'react';
import { I } from '../icons';
import { ESIGN_MEANINGS } from '../registryModel';
import { TranslationPane } from './EditorTranslate';
import { useLiveRows, useLiveData, EmptyState } from '../dataConnect';
import {
  TXW_STATUS_META, TXW_METHODS, STEPS, TXW_CATEGORIES,
  type TxwStatusKey,
} from '../fixtures/translation-workspace-data';
import {
  isApprovableMethod,
  type TranslationProject, type TranslationSegment, type GlossaryTerm,
  type TranslationMethod,
} from '@shared/types/translation';

/* TranslationWorkspace -- bilingual EN->target regulatory translation surface.
   Renders inside the editor's right dock (sub-toggle: Sections | Segments | Glossary | QA).

   Re-anchored to the live /api/translation platform (server/routes/translation.routes.ts,
   Drizzle-backed, tenant-scoped). The surface renders REAL persisted data, an honest
   empty state, or an honest error state — never a fixture. The canonical status/method/
   step/category config (TXW_*) and the e-sign meaning catalog stay; the seed DATA
   (TXW_PROJECTS / TXW_SEGMENTS / TXW_GLOSSARY / TXW_QA) and the DNT-span renderer are gone.

   NOTE ON SHAPE: the backend stores plain source/target TEXT (DNT identifiers are masked at
   translate time and restored inline as text), not the rich DNT-span arrays the retired
   fixture modeled. Text is rendered directly — no span/chip structure is fabricated. */

/** Project + its ordered segments — the GET /api/translation/projects/:id detail shape
    (mirrors TranslationProjectDetail in the translation service). */
interface TranslationProjectDetail extends TranslationProject {
  segments: TranslationSegment[];
}

/* useLiveData/useLiveRows synthesize a fresh []/null every render while loading or on a
   failed load; feed the optimistic segment store a STABLE empty seed in those states so
   the re-seed effect doesn't thrash into a render loop. */
const EMPTY_SEGMENTS: TranslationSegment[] = [];

interface TxwSettings {
  enabled: boolean; requireBackTranslation: boolean; twoPersonRule: boolean;
  defaultEngine: string; targets: string[]; currentUser: number; autoOpenSegments: boolean;
}
interface SegmentCardProps {
  seg: TranslationSegment; onAct: (segId: number, kind: string) => void;
  isActive: boolean; onSelect: (id: number) => void;
  onApprove: (seg: TranslationSegment) => void; settings: TxwSettings;
}
interface SegmentsPanelProps {
  project: TranslationProject | null; segments: TranslationSegment[];
  loading: boolean; error?: string;
  onAct: (segId: number, kind: string) => void;
  onApprove: (seg: TranslationSegment) => void; settings: TxwSettings;
}
interface GlossaryPanelProps { rows: GlossaryTerm[]; loading: boolean; error?: string; }
interface GovApproveModalProps { seg: TranslationSegment | null; onCancel: () => void; onConfirm: (p: { meaning: string; reason: string }) => void; }
interface WideReviewModalProps {
  project: TranslationProject | null; segments: TranslationSegment[];
  onClose: () => void; onApprove: (seg: TranslationSegment) => void; settings: TxwSettings;
}
interface TranslationWorkspaceProps { onTranslate?: () => void; }
interface QaPanelProps { onJump: (segId?: number) => void; }

function txStep(status: TxwStatusKey): string {
  for (const s of STEPS) if ((s.statuses as string[]).includes(status)) return s.id;
  return status === 'rejected' ? 'review' : 'draft';
}
function txStepIdx(stepId: string): number { return STEPS.findIndex(s => s.id === stepId); }

/** Real segments carry `method: TranslationMethod | null` (null for an untranslated
    'pending' segment) — label it null-safe, never crash on TXW_METHODS[null]. */
function methodLabel(m: TranslationMethod | null): string {
  return m ? TXW_METHODS[m].label : 'Not started';
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

/* Optimistic segment store seeded from the live project detail. Re-seeds when the live
   list resolves (seed identity changes once the backend responds); user actions before
   that resolve are optimistic-only (see `act` — MOCK ACTION, not persisted). Mirrors the
   optimistic-row precedent in Nonclinical.tsx. */
function useSegmentStore(
  seed: TranslationSegment[],
): readonly [TranslationSegment[], (id: number, fn: (s: TranslationSegment) => TranslationSegment) => void] {
  const [rows, setRows] = useState<TranslationSegment[]>(() => seed.map(s => ({ ...s })));
  const seedRef = useRef(seed);
  useEffect(() => {
    if (seed !== seedRef.current) {
      seedRef.current = seed;
      setRows(seed.map(s => ({ ...s })));
    }
  }, [seed]);
  const update = (id: number, fn: (s: TranslationSegment) => TranslationSegment) =>
    setRows(rs => rs.map(s => (s.id === id ? fn(s) : s)));
  return [rows, update] as const;
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
  const bt = seg.provenance.backTranslation;
  const hasBT = bt?.verified === true;
  const approvable = isApprovableMethod(seg.method);
  const samePersonReview = settings.twoPersonRule
    && seg.provenance.postEditedBy != null && seg.provenance.reviewedBy != null
    && seg.provenance.postEditedBy === seg.provenance.reviewedBy;
  const blockedReasons: string[] = [];
  if (!approvable) blockedReasons.push('Machine-only translation cannot be approved -- requires human post-edit.');
  if (settings.requireBackTranslation && !hasBT) blockedReasons.push('Back-translation evidence required before approval.');
  if (samePersonReview) blockedReasons.push('Two-person rule -- reviewer must differ from post-editor.');
  const canDraft    = seg.status === 'pending';
  const canPostEdit = seg.status === 'mt_draft' || seg.status === 'in_progress';
  const canBT       = seg.status === 'in_progress';
  const canReview   = seg.status === 'back_translation' || (!settings.requireBackTranslation && seg.status === 'in_progress');
  const canApprove  = seg.status === 'review' && blockedReasons.length === 0;
  const approvedOn  = fmtDate(seg.provenance.approvedAt);

  return (
    <div className="txw-seg" data-active={isActive || undefined} onClick={() => onSelect && onSelect(seg.id)}>
      <div className="txw-seg-h">
        <span className="txw-seg-k">#{seg.ordinal}</span>
        <span className="txw-seg-method" data-m={seg.method ?? undefined}>{methodLabel(seg.method)}</span>
        <span className="txw-seg-st"><StatusPill status={seg.status} /></span>
      </div>
      <div className="txw-text" data-lang={seg.sourceLang}>
        <div className="txw-text-l">Source <span className="txw-flag">{seg.sourceLang.toUpperCase()}</span></div>
        <div className="txw-text-body">{seg.sourceText}</div>
      </div>
      <div className="txw-text" data-lang={seg.targetLang}>
        <div className="txw-text-l">Target <span className="txw-flag">{seg.targetLang.toUpperCase()}</span></div>
        <div className="txw-text-body">
          {!seg.targetText.trim()
            ? <span className="txw-text-empty">No target drafted yet.</span>
            : seg.targetText}
        </div>
      </div>
      {hasBT && bt && (
        <div className="txw-bt">
          <div className="txw-bt-l" data-ok="true">{I.shieldCheck}Back-translation verified</div>
          {bt.backText ? <div className="txw-bt-t">"{bt.backText}"</div> : null}
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
            {I.checkCircle || I.check} Approved{approvedOn ? ' · ' + approvedOn : ''}
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
export function SegmentsPanel({ project, segments, loading, error, onAct, onApprove, settings }: SegmentsPanelProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeId, setActiveId] = useState<number | null>(null);

  if (loading) {
    return <div className="txw-body"><div className="scaf-note" style={{ padding: '18px 10px' }}>Loading translation project…</div></div>;
  }
  if (error) {
    return (
      <div className="txw-body">
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the translation workspace"
          hint="The governed translation project didn't respond. These are the organization's EN → target regulatory segments — sign in and retry, or check the service is reachable."
        />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="txw-body">
        <EmptyState
          icon={I.fileText}
          title="No translation project yet"
          hint="Create a translation project from a source document/section to draft, post-edit, back-translate, and certify translated regulatory content."
        />
      </div>
    );
  }

  const segs = segments;
  const counts = segs.reduce<Record<string, number>>((m, s) => { m[s.status] = (m[s.status] || 0) + 1; return m; }, {});
  const filtered = statusFilter === 'all' ? segs : segs.filter(s => s.status === statusFilter);
  const approved = counts.approved || 0;
  const machine = segs.filter(s => s.method === 'machine' && s.status !== 'approved').length;
  // No QA read endpoint yet (see QaPanel) — blocking counts machine-only drafts + rejections.
  const blocking = machine + (counts.rejected || 0);
  const submissionReady = approved === segs.length && segs.length > 0;
  const pct = segs.length ? Math.round((approved / segs.length) * 100) : 0;
  const langPair = project.sourceLang.toUpperCase() + ' → ' + project.targetLang.toUpperCase();
  const filters: { id: string; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: segs.length }, { id: 'review', label: 'In review', count: counts.review || 0 },
    { id: 'in_progress', label: 'Editing', count: counts.in_progress || 0 }, { id: 'mt_draft', label: 'MT draft', count: counts.mt_draft || 0 },
    { id: 'pending', label: 'Pending', count: counts.pending || 0 }, { id: 'approved', label: 'Approved', count: counts.approved || 0 },
  ];

  return (
    <div className="txw-body">
      <div className="txw-prj">
        <div className="txw-prj-top">
          <span className="txw-prj-nm">{project.name}</span>
          <span className="txw-prj-lang">{langPair}</span>
        </div>
        <div className="txw-prj-sub">{project.sourceSectionCode ? project.sourceSectionCode + ' · ' : ''}{segs.length} segments · {approved} approved</div>
        <div className="txw-ready" data-ready={submissionReady}>
          <span className="txw-ready-ico">{submissionReady ? I.shieldCheck : I.alertTriangle}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="txw-ready-l">{submissionReady ? 'Submission ready' : 'Not submission ready'}</div>
            <div className="txw-ready-m">
              {submissionReady
                ? 'All segments approved with verified back-translation.'
                : (blocking ? blocking + ' blocking item' + (blocking === 1 ? '' : 's') + ' -- machine-only or rejected.' : (segs.length - approved) + ' segment' + (segs.length - approved === 1 ? '' : 's') + ' not yet approved.')}
            </div>
            <div className="txw-ready-bar"><span style={{ width: pct + '%' }} /></div>
          </div>
        </div>
      </div>
      {segs.length === 0 ? (
        <EmptyState
          icon={I.fileText}
          title="No segments in this project yet"
          hint="Seed the project with source segments to begin drafting, post-editing, and back-translation."
        />
      ) : (
        <>
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
            <SegmentCard key={seg.id} seg={seg} onAct={onAct} onApprove={onApprove}
              isActive={activeId === seg.id} onSelect={setActiveId} settings={settings} />
          ))}
        </>
      )}
    </div>
  );
}

export function GlossaryPanel({ rows, loading, error }: GlossaryPanelProps) {
  const cats = TXW_CATEGORIES;
  const [q, setQ] = useState('');
  const [showDnt, setShowDnt] = useState<'all' | 'dnt' | 'pref'>('all');

  if (loading) {
    return <div className="txw-body"><div className="scaf-note" style={{ padding: '18px 10px' }}>Loading glossary…</div></div>;
  }
  if (error) {
    return (
      <div className="txw-body">
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the glossary"
          hint="The tenant do-not-translate / preferred-term registry didn't respond — sign in and retry, or check the service is reachable."
        />
      </div>
    );
  }

  const all = rows;
  const filteredRows = all.filter(g => {
    if (showDnt === 'dnt' && !g.doNotTranslate) return false;
    if (showDnt === 'pref' && g.doNotTranslate) return false;
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return g.sourceTerm.toLowerCase().includes(t) || (g.targetTerm || '').toLowerCase().includes(t) || (cats[g.category] || '').toLowerCase().includes(t);
  });
  return (
    <div className="txw-body">
      <div className="txw-gloss-search">
        {I.search}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search source or target term..." />
        {/* MOCK ACTION: dead affordance — POST /api/translation/glossary exists but is not
            wired here (flagged for the actions pass; no false claim is made). */}
        <button className="txw-gloss-add">{I.plus}Add</button>
      </div>
      <div className="txw-filter">
        <span className="txw-filter-l">Type</span>
        <button className="txw-chip" data-on={showDnt === 'all' || undefined} onClick={() => setShowDnt('all')}>All<span className="txw-chip-ct">{all.length}</span></button>
        <button className="txw-chip" data-on={showDnt === 'dnt' || undefined} onClick={() => setShowDnt('dnt')}>Do-not-translate<span className="txw-chip-ct">{all.filter(g => g.doNotTranslate).length}</span></button>
        <button className="txw-chip" data-on={showDnt === 'pref' || undefined} onClick={() => setShowDnt('pref')}>Preferred<span className="txw-chip-ct">{all.filter(g => !g.doNotTranslate).length}</span></button>
      </div>
      <div className="txw-gloss">
        {all.length === 0 ? (
          <EmptyState
            icon={I.fileText}
            title="No glossary terms yet"
            hint="Add a do-not-translate identifier (agency name, citation, code) or a preferred translation to seed the tenant registry."
          />
        ) : filteredRows.length === 0 ? (
          <div className="txw-empty">No glossary entries match. Adjust the search or type filter.</div>
        ) : (
          filteredRows.map(g => (
            <div key={g.id} className="txw-gloss-row">
              <div>
                <span className="txw-gloss-src">{g.sourceTerm}</span>
                <span className="txw-gloss-arrow">→</span>
                <span className="txw-gloss-tgt" data-dnt={g.doNotTranslate || undefined}>{g.doNotTranslate ? '-- (do not translate)' : (g.targetTerm || '—')}</span>
              </div>
              <div className="txw-gloss-meta">
                <span className="txw-gloss-cat">{cats[g.category] || g.category}</span>
                {g.doNotTranslate && <span className="txw-dnt" data-cat={g.category} style={{ fontSize: 9 }}>DNT</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* QA findings have no read endpoint. BACKEND GAP: server/services/translation/qa/* runs
   numeric/terminology/empty-target checks during the workflow, but nothing exposes
   per-segment findings over a GET route the surface can call. The TXW_QA fixture was
   removed rather than presented as content — an honest empty stands in until a QA read
   endpoint exists. (Do not restore a fixture here.) */
export function QaPanel(_props: QaPanelProps) {
  return (
    <div className="txw-body">
      <div className="txw-prj" style={{ paddingBottom: 12 }}>
        <div className="txw-prj-top">
          <span className="txw-prj-nm">QA findings</span>
        </div>
        <div className="txw-prj-sub">Automated QA (numeric, terminology, empty-target) runs per segment during the workflow.</div>
      </div>
      <EmptyState
        icon={I.info}
        title="No QA findings available yet"
        hint="Per-segment QA findings aren't exposed by a read endpoint yet. Once the translation QA service is wired to a GET route, error / warning / info findings will appear here."
      />
    </div>
  );
}

export function GovApproveModal({ seg, onCancel, onConfirm }: GovApproveModalProps) {
  const meanings = ESIGN_MEANINGS;
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
          {/* Softened copy: this preview does NOT yet call POST /api/translation/segments/:id/approve,
              so it must not claim that a 21 CFR §11 signature or audit entry was recorded. */}
          <div className="txw-gov-summ">
            Approving <b>segment #{seg.ordinal}</b> ({methodLabel(seg.method)}) for <b>{seg.targetLang.toUpperCase()}</b>. A governed e-signature (21 CFR §11.50) is required to record an approval; this preview does not yet write a signature or audit entry.
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
            When wired to the governed approve endpoint, signing moves the segment to <b>approved</b> and seals the back-translation lock. This preview updates the working view only -- nothing is persisted yet.
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

export function WideReviewModal({ project, segments, onClose, onApprove, settings }: WideReviewModalProps) {
  const segs = segments;
  const [sel, setSel] = useState<number | null>(segs[0] ? segs[0].id : null);
  const seg = segs.find(s => s.id === sel) || segs[0];
  const [draft, setDraft] = useState(seg ? seg.targetText : '');
  useEffect(() => { setDraft(seg ? seg.targetText : ''); }, [seg?.id]);
  if (!seg) return null;
  const langPair = project ? project.sourceLang.toUpperCase() + ' → ' + project.targetLang.toUpperCase() : '';
  return (
    <div className="txw-wide-bd" onClick={onClose}>
      <div className="txw-wide-bx" onClick={e => e.stopPropagation()} role="dialog" aria-label="Bilingual review">
        <div className="txw-wide-h">
          <div>
            <div className="txw-wide-t">Bilingual review — {project?.name ?? 'Translation project'}</div>
            <div className="txw-wide-sub">{langPair ? langPair + ' · ' : ''}21 CFR Part 11 governed · {segs.length} segments</div>
          </div>
          <button className="txw-wide-close" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>
        <div className="txw-wide-body">
          <div className="txw-wide-list">
            {segs.map(s => (
              <button key={s.id} className="txw-wide-row" data-on={s.id === sel || undefined} onClick={() => setSel(s.id)}>
                <div className="txw-wide-row-top">
                  <span className="txw-seg-k">#{s.ordinal}</span>
                  <span className="txw-seg-method" data-m={s.method ?? undefined}>{methodLabel(s.method)}</span>
                  <span style={{ marginLeft: 'auto' }}><StatusPill status={s.status} /></span>
                </div>
                <div className="txw-wide-row-src">{s.sourceText.slice(0, 140)}</div>
              </button>
            ))}
          </div>
          <div className="txw-wide-detail">
            <div className="txw-wide-cols">
              <div className="txw-wide-col" data-lang={seg.sourceLang}>
                <div className="txw-wide-col-h">Source <span className="txw-flag">{seg.sourceLang.toUpperCase()}</span><span style={{ marginLeft: 'auto', color: 'var(--text-400)', fontWeight: 500 }}>#{seg.ordinal}</span></div>
                <div className="txw-wide-col-body">{seg.sourceText}</div>
              </div>
              <div className="txw-wide-col" data-lang={seg.targetLang}>
                <div className="txw-wide-col-h">Target <span className="txw-flag">{seg.targetLang.toUpperCase()}</span>
                  <span style={{ marginLeft: 'auto' }}><StatusPill status={seg.status} /></span>
                </div>
                <div className="txw-wide-col-body">
                  <textarea value={draft} onChange={e => setDraft(e.target.value)} aria-label="Translated target text" lang={seg.targetLang} />
                </div>
              </div>
            </div>
            <div className="txw-wide-foot">
              <div className="txw-wide-foot-step"><Stepper status={seg.status} /></div>
              {/* MOCK ACTIONS: these two are dead affordances — back-translation
                  (POST /segments/:id/back-translation) and AnA-suggest have real/planned
                  endpoints but are not wired here (flagged for the actions pass). */}
              <button className="txw-act">{I.gitCompare}Run back-translation</button>
              <button className="txw-act">{I.sparkles}AnA suggest</button>
              <button className="txw-act gov" disabled={seg.status !== 'review' || !isApprovableMethod(seg.method)}
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
  const [gov, setGov] = useState<TranslationSegment | null>(null);
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

  // ── Live data (Drizzle-backed /api/translation platform) ──
  // Projects list → first project → its detail (project + ordered segments). Glossary is
  // independent. useLiveData/useLiveRows unwrap the { data } / { data, meta } envelope and
  // return honest empty / honest error — never a fixture.
  const projectsState = useLiveRows<TranslationProject>('/api/translation/projects');
  const project = projectsState.rows[0] ?? null;
  const detailState = useLiveData<TranslationProjectDetail>(
    project ? '/api/translation/projects/' + project.id : null,
  );
  const glossaryState = useLiveRows<GlossaryTerm>('/api/translation/glossary');

  // Stable empty seed while loading/erroring (see EMPTY_SEGMENTS) so the optimistic store
  // doesn't thrash; once the detail resolves, its segments become the seed.
  const seedSegments =
    detailState.loading || detailState.error || !detailState.data ? EMPTY_SEGMENTS : detailState.data.segments;
  const [segments, updateSegment] = useSegmentStore(seedSegments);

  const segLoading = projectsState.loading || detailState.loading;
  const segError = projectsState.error || detailState.error;

  if (!settings.enabled) return (
    <div className="txw">
      <div className="txw-empty" style={{ padding: '40px 24px' }}>
        <div style={{ fontWeight: 600, color: 'var(--text-200)', marginBottom: 6 }}>Translation workspace is off</div>
        Enable it in Admin {'>'} Translation workspace to draft, post-edit, and certify translated regulatory content.
      </div>
    </div>
  );

  const counts = { segments: segments.length, gloss: glossaryState.rows.length };
  const approve = (seg: TranslationSegment) => setGov(seg);
  const now = () => new Date().toISOString();

  /* MOCK ACTION -- optimistic, LOCAL-ONLY workflow transitions. Real endpoints exist
     (POST /api/translation/projects/:id/segments/draft, /segments/:id/post-edit,
     /segments/:id/back-translation) but are NOT called here — flagged for the actions
     pass. Nothing is persisted; this updates the working view only. */
  const act = (segId: number, kind: string) => {
    updateSegment(segId, (s) => {
      if (kind === 'draft') return { ...s, status: 'mt_draft', method: 'machine' };
      if (kind === 'post_edit') return {
        ...s, status: 'in_progress', method: 'mt_postedited',
        provenance: { ...s.provenance, postEditedBy: settings.currentUser, postEditedAt: now() },
      };
      if (kind === 'back_translation') return {
        ...s, status: 'back_translation',
        provenance: {
          ...s.provenance,
          backTranslation: {
            targetLang: s.targetLang,
            backText: s.provenance.backTranslation?.backText ?? '',
            engine: s.provenance.engine ?? 'preview',
            similarity: s.provenance.backTranslation?.similarity ?? 0,
            verified: true,
            performedAt: now(),
          },
        },
      };
      if (kind === 'submit_review') return { ...s, status: 'review' };
      return s;
    });
  };

  /* MOCK ACTION -- optimistic, LOCAL-ONLY approval. The real terminal approval is
     POST /api/translation/segments/:id/approve (guarded: method_not_approvable /
     back_translation_required); it is NOT called here. Flagged for the actions pass. */
  const finishApprove = (_p: { meaning: string; reason: string }) => {
    if (!gov) return;
    updateSegment(gov.id, (s) => ({
      ...s, status: 'approved',
      provenance: {
        ...s.provenance,
        reviewedBy: settings.currentUser === s.provenance.postEditedBy ? (s.provenance.reviewedBy ?? settings.currentUser) : settings.currentUser,
        approvedBy: settings.currentUser,
        approvedAt: now(),
      },
    }));
    setGov(null);
    setTab('segments');
  };

  return (
    <div className="txw">
      <div className="txw-toggle">
        <div className="txw-toggle-grp" role="tablist" aria-label="Translation views">
          <button className="txw-toggle-b" role="tab" aria-selected={tab === 'sections'} data-on={tab === 'sections' || undefined} onClick={() => setTab('sections')}>Sections</button>
          <button className="txw-toggle-b" role="tab" aria-selected={tab === 'segments'} data-on={tab === 'segments' || undefined} onClick={() => setTab('segments')}>Segments<span className="txw-count">{counts.segments}</span></button>
          <button className="txw-toggle-b" role="tab" aria-selected={tab === 'gloss'} data-on={tab === 'gloss' || undefined} onClick={() => setTab('gloss')}>Glossary<span className="txw-count">{counts.gloss}</span></button>
          <button className="txw-toggle-b" role="tab" aria-selected={tab === 'qa'} data-on={tab === 'qa' || undefined} onClick={() => setTab('qa')}>QA</button>
        </div>
        {tab === 'segments' && (
          <button className="txw-wide" onClick={() => setWide(true)} title="Open bilingual review in a full-bleed editor">
            {I.maximize}Wide review
          </button>
        )}
      </div>
      {tab === 'sections' && <TranslationPane onTranslate={onTranslate} />}
      {tab === 'segments' && <SegmentsPanel project={project} segments={segments} loading={segLoading} error={segError} onAct={act} onApprove={approve} settings={settings} />}
      {tab === 'gloss'    && <GlossaryPanel rows={glossaryState.rows} loading={glossaryState.loading} error={glossaryState.error} />}
      {tab === 'qa'       && <QaPanel onJump={() => setTab('segments')} />}
      {wide && <WideReviewModal project={project} segments={segments} onClose={() => setWide(false)} onApprove={approve} settings={settings} />}
      {gov  && <GovApproveModal seg={gov} onCancel={() => setGov(null)} onConfirm={finishApprove} />}
    </div>
  );
}
