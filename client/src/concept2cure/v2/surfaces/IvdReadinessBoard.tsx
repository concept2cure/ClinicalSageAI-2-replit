import React, { useState } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState, type DataState } from '../dataConnect';

/* ── The IVDR readiness board: the seven IVDR requirement families and the
   evidence filed against each, read from
     GET /api/ivd-completeness/completeness   (server/routes/ivd-completeness-routes.ts)

   One board, two mounts (D2, 2026-10-29; docs/design/DEVICE_FOLDS_2026-10-29.md
   F2): the readiness panel of device-diagnostics (mdx/surfaces/IvdSurface.tsx),
   for the open project, and the older IvdCompleteness screen until that screen
   folds into device-diagnostics. It was drawn inside IvdCompleteness.tsx and
   read the organization's records whichever project was open.

   With a project it asks for that project (`?program_id=`) and draws the
   answer only when the response says it covers that project. A refused read
   (404 project not found, 403, 503 check unavailable) and a failed one each
   say so; neither is an empty board. A family whose records could not be read
   is "Not read", and no overall figure is shown beside one.

   The IVDR requirement TAXONOMY (family id/label/annex-ref/blurb) comes from the
   backend; the board carries no seed. ── */

export type IvdItemStatus = 'complete' | 'review' | 'draft' | 'not_started';

export interface IvdItem {
  code: string;
  title: string;
  ref: string;
  status: IvdItemStatus;
  pct: number;
  flag?: string; // not populated by the backend today; kept null-safe at render
}

export interface IvdFamily {
  id: string;
  label: string;
  ref: string;
  blurb: string;
  /** Null when the family's records could not be read. */
  pct: number | null;
  items: IvdItem[];
}

export interface IvdReadinessData {
  scope: 'program' | 'organization';
  programId?: string;
  program: string | null;
  spine: string;
  standard: string;
  /** Null when any family could not be read. */
  overall: number | null;
  summary: { total: number; evidenced: number; inProgress: number; notStarted: number; unread: number; flags: number };
  families: IvdFamily[];
  /** Ids of the families whose records could not be read. */
  unread: string[];
  gsprSourced: boolean;
  perDocumentPresent: boolean;
}

const isReadiness = (value: unknown): value is IvdReadinessData => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.families) && Array.isArray(v.unread) && typeof v.scope === 'string' && !!v.summary;
};

/* Default-open the first four requirement families (canonical IVDR taxonomy
   order returned by the read-model: gspr, anal, clin, valid, per, desc, pmpf). */
const DEFAULT_OPEN_FAMILIES = ['gspr', 'anal', 'clin', 'valid'];

export interface IvdReadiness {
  /** The project the board is for, or null for the organization (the older screen with no project open). */
  programId: string | null;
  read: DataState<IvdReadinessData>;
  retry: () => void;
  open: string[];
  toggle: (id: string) => void;
}

/** Read the board. `enabled: false` idles the read (the older screen off its segment). */
export function useIvdReadiness(programId: string | null, enabled = true): IvdReadiness {
  const [epoch, setEpoch] = useState(0);
  const [open, setOpen] = useState<string[]>(DEFAULT_OPEN_FAMILIES);
  const path = !enabled ? null
    : programId ? `/api/ivd-completeness/completeness?program_id=${encodeURIComponent(programId)}`
      : '/api/ivd-completeness/completeness';
  const read = useLiveData<IvdReadinessData>(path, [path, epoch], isReadiness);
  return {
    programId, read, open,
    retry: () => setEpoch((n) => n + 1),
    toggle: (id) => setOpen((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.concat([id]))),
  };
}

export interface IvdTally {
  overall: number | null;
  done: IvdFamily[];
  inflight: IvdFamily[];
  missing: IvdFamily[];
  unread: IvdFamily[];
  flags: IvdItem[];
  items: number;
  blocker: string;
}

/* Counted over FAMILIES, the same unit as `overall`. A family holding nothing
   is a requirement not started; a family that could not be read is neither
   started nor not started, and is counted apart. A flag is raised against a
   piece of evidence, so flags stay item-level. */
export function ivdTally(d: IvdReadinessData): IvdTally {
  const unread = d.families.filter((f) => f.pct === null);
  const read = d.families.filter((f) => f.pct !== null);
  const missing = read.filter((f) => f.pct === 0);
  const inflight = read.filter((f) => (f.pct ?? 0) > 0 && (f.pct ?? 0) < 100);
  const done = read.filter((f) => (f.pct ?? 0) >= 100);
  const allItems = d.families.flatMap((f) => f.items ?? []);
  const blocker = unread.length
    ? `${unread.length} requirement famil${unread.length === 1 ? 'y' : 'ies'} could not be read (${unread.map((f) => f.label).join(', ')}), so the technical file's completeness is not computed.`
    : missing.length
      ? 'The gate to a CE certificate is the ' + (missing.find((m) => /PER|performance evaluation/i.test(m.label)) ? 'Performance Evaluation Report' : missing[0].label) + ' — ' + missing.length + ' requirement' + (missing.length === 1 ? '' : 's') + ' not yet started.'
      : inflight.length ? inflight.length + ' requirements are still in progress before the technical file is Notified-Body ready.' : 'Every IVDR requirement is evidenced.';
  return { overall: unread.length ? null : d.overall, done, inflight, missing, unread, flags: allItems.filter((i) => i.flag), items: allItems.length, blocker };
}

export type IvdReadinessView =
  | { kind: 'loading' }
  | { kind: 'refused' | 'failed' | 'unconfirmed'; message: string }
  | { kind: 'ready'; data: IvdReadinessData; tally: IvdTally };

/** What the board may draw from a read. Only a response that says it covers what was asked for is drawn. */
export function ivdReadinessView({ programId, read }: Pick<IvdReadiness, 'programId' | 'read'>): IvdReadinessView {
  if (read.loading) return { kind: 'loading' };
  if (read.error || !read.data) {
    if (read.status === 404 && programId) return { kind: 'refused', message: 'This project was not found in your organization, so its IVDR readiness was not read.' };
    if (read.status === 403) return { kind: 'refused', message: 'Your organization could not be confirmed, so the IVDR readiness was not read.' };
    if (read.status === 503) return { kind: 'refused', message: 'The project check or the IVD records were unavailable, so the IVDR readiness was not read. Retry shortly.' };
    return { kind: 'failed', message: 'The IVDR readiness could not be read. Nothing here is a finding about the technical file.' };
  }
  const d = read.data;
  const confirmed = programId
    ? d.scope === 'program' && (d.programId ?? '').toLowerCase() === programId.toLowerCase()
    : d.scope === 'organization';
  if (!confirmed) {
    return {
      kind: 'unconfirmed',
      message: programId
        ? 'The readiness read did not confirm it covers the open project, so it is not shown as this project\'s.'
        : 'The readiness read did not confirm it covers the organization, so it is not shown.',
    };
  }
  return { kind: 'ready', data: d, tally: ivdTally(d) };
}

function ivdTone(pct: number, status: string): string {
  if (status === 'complete' || status === 'approved' || pct >= 100) return 'done';
  if (status === 'not_started' || pct === 0) return 'missing';
  if (pct >= 60) return 'review';
  return 'draft';
}

const IVD_STLABEL: Record<string, string> = { done: 'Complete', review: 'In review', draft: 'Drafting', missing: 'Not started' };

const familyTone = (pct: number | null) =>
  pct === null || pct === 0 ? 'missing' : pct >= 100 ? 'done' : pct >= 60 ? 'review' : 'draft';

/* ════ The board ════ */

export function IvdReadinessBoard({ readiness, onAsk }: { readiness: IvdReadiness; onAsk?: (text: string) => void }) {
  const view = ivdReadinessView(readiness);
  if (view.kind === 'loading') {
    return <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading the IVDR readiness…</div>;
  }
  if (view.kind !== 'ready') {
    return (
      <EmptyState
        tone="error"
        icon={I.alertTriangle}
        title={view.kind === 'unconfirmed' ? 'The IVDR readiness is not confirmed' : 'The IVDR readiness was not read'}
        hint={view.message}
        retry={readiness.retry}
        testId="ivd-readiness-unread"
      />
    );
  }
  const subject = view.data.scope === 'program' ? 'this project' : 'this organization';
  if (view.tally.items === 0 && view.tally.unread.length === 0) {
    return (
      <EmptyState
        icon={I.fileText}
        title={`No IVDR technical-file records for ${subject} yet`}
        hint={`Record an Annex VIII classification, analytical or clinical performance studies, a GSPR checklist or a Performance Evaluation Report for ${subject}, and the IVDR requirement families (GSPR, analytical and clinical performance, scientific validity, PER, PMPF) will show their completeness here.`}
        testId="ivd-readiness-empty"
      />
    );
  }
  return <IvdFamilies data={view.data} tally={view.tally} subject={subject} readiness={readiness} onAsk={onAsk} />;
}

function IvdFamilies({ data, tally, subject, readiness, onAsk }: { data: IvdReadinessData; tally: IvdTally; subject: string; readiness: IvdReadiness; onAsk?: (text: string) => void }) {
  const { overall, done, inflight, missing, flags, blocker } = tally;
  const coverage = data.scope === 'program' ? 'This project\'s IVDR evidence coverage' : 'Organization-wide IVDR evidence coverage';
  return (
    <div data-testid="ivd-readiness-board">
      <div className="ivd-lead">
        <div className="ivd-lead-ic">{I.sparkles}</div>
        <div>
          <p className="ivd-lead-h">{overall === null ? `${coverage} is not computed.` : `${coverage}: ${overall}%.`} {blocker}</p>
          <p className="ivd-lead-b">These are IVDR requirements — General Safety &amp; Performance (Annex I), the Performance Evaluation Report (Annex XIII), analytical and clinical performance, scientific validity and post-market follow-up — not the 510(k)/device checklist. {done.length} of {data.families.length} evidenced — {inflight.length} in progress — {missing.length} not started{tally.unread.length ? ' — ' + tally.unread.length + ' not read' : ''}{flags.length ? ' — ' + flags.length + ' open flag' + (flags.length === 1 ? '' : 's') : ''}.</p>
        </div>
      </div>

      <div className="ivd-stats">
        <div className="ivd-stat"><span className="ivd-stat-n">{overall === null ? '—' : `${overall}%`}</span><span className="ivd-stat-l">{overall === null ? 'Completeness not computed' : 'Technical file complete'}</span></div>
        <div className="ivd-stat"><span className="ivd-stat-n">{done.length}<span className="ivd-stat-d">/{data.families.length}</span></span><span className="ivd-stat-l">Requirements evidenced</span></div>
        <div className="ivd-stat"><span className="ivd-stat-n ivd-warn">{missing.length}</span><span className="ivd-stat-l">Not yet started</span></div>
        {/* The fourth tile counted evidence flags, a field nothing stores, so it
            only ever read 0 (FUNCTION_PARITY.md: "Drop the flags tile"). It
            counts the families that could not be read. */}
        <div className="ivd-stat"><span className="ivd-stat-n">{tally.unread.length}</span><span className="ivd-stat-l">Not read</span></div>
      </div>

      <div className="ivd-families">
        {data.families.map((f) => (
          <IvdFamilyRow key={f.id} family={f} isOpen={readiness.open.includes(f.id)} onToggle={() => readiness.toggle(f.id)} onAsk={onAsk} />
        ))}
      </div>

      <p className="ivd-foot">Completeness is computed live from {subject}&apos;s IVDR records — Annex VIII classifications, analytical and clinical performance studies, the latest Performance Evaluation Report, and the GSPR checklist. Requirements with no recorded evidence show as not started, and requirements whose records could not be read show as not read; no owner, version or evidence flag is shown unless it is stored.</p>
    </div>
  );
}

function IvdFamilyRow({ family: f, isOpen, onToggle, onAsk }: { family: IvdFamily; isOpen: boolean; onToggle: () => void; onAsk?: (text: string) => void }) {
  const unread = f.pct === null;
  return (
    <div className={'ivd-fam tone-' + familyTone(f.pct)}>
      <button className="ivd-fam-head" onClick={onToggle} aria-expanded={isOpen}>
        <span className="ivd-fam-caret" data-open={isOpen}>{I.chevRight}</span>
        <span className="ivd-fam-main">
          <span className="ivd-fam-label">{f.label}</span>
          <span className="ivd-fam-ref">{f.ref}</span>
        </span>
        <span className="ivd-fam-bar"><span className="ivd-fam-fill" style={{ width: (f.pct ?? 0) + '%' }} /></span>
        <span className="ivd-fam-pct">{unread ? 'Not read' : f.pct + '%'}</span>
      </button>
      {isOpen && (
        <div className="ivd-items">
          <p className="ivd-fam-blurb">{f.blurb}</p>
          {f.items.map((it, i) => {
            const t = ivdTone(it.pct, it.status);
            return (
              <div key={i} className="ivd-item">
                <span className={'ivd-dot tone-' + t} />
                {it.code && <span className="mono ivd-item-code">{it.code}</span>}
                <span className="ivd-item-title">{it.title}{it.flag && <span className="ivd-item-flag">{I.alertTriangle} {it.flag}</span>}</span>
                <span className="ivd-item-ref">{it.ref}</span>
                <span className={'ivd-item-st tone-' + t}>{IVD_STLABEL[t]}</span>
                <span className="ivd-item-pct">{it.pct}%</span>
              </div>
            );
          })}
          {!f.items.length && (
            <div className="ivd-item ivd-item-empty">
              {unread ? 'The records for this requirement could not be read. It is not shown as started or not started.' : 'No evidence filed against this requirement yet.'}
            </div>
          )}
          {onAsk && (
            <div className="ivd-fam-act">
              <button className="ivd-btn" onClick={() => onAsk('Draft the ' + f.label + ' section for the IVDR technical file (' + f.ref + '), grounded on the linked performance evidence.')}>{I.sparkles} Ask AnA to build this requirement</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** What AnA can see of the board. A failed or unconfirmed read publishes the failure, never 0%. */
export function ivdReadinessContext(view: IvdReadinessView, open: string[]) {
  if (view.kind === 'loading') {
    return { summary: 'The IVDR technical-file completeness is still loading; nothing on screen is final yet.' };
  }
  if (view.kind !== 'ready') {
    return {
      summary: `The IVDR completeness read-model was not read (${view.message}), so this screen is showing no requirement coverage because of a failure, not because nothing is evidenced.`,
      availableActions: ['Retry the IVDR completeness read'],
    };
  }
  const { data, tally } = view;
  return {
    summary:
      `IVDR technical file for ${data.program || 'this IVD project'} (${data.spine}), ${data.scope === 'program' ? 'the open project' : 'organization-wide'}: ` +
      `${tally.overall === null ? 'completeness not computed' : `${tally.overall}% complete`} over ${data.families.length} IVDR requirement(s) — ${tally.done.length} evidenced, ` +
      `${tally.inflight.length} in progress, ${tally.missing.length} not started, ${tally.unread.length} not read, ${tally.flags.length} flagged. ${tally.blocker}`,
    facts: {
      scope: data.scope,
      programId: data.programId ?? null,
      program: data.program,
      spine: data.spine,
      standard: data.standard,
      overallPercent: tally.overall,
      summary: data.summary,
      families: data.families.map((f) => ({ id: f.id, label: f.label, ref: f.ref, percent: f.pct, requirements: (f.items ?? []).length })),
      notStarted: tally.missing.slice(0, 12).map((f) => ({ code: f.id, title: f.label, ref: f.ref })),
      inProgress: tally.inflight.slice(0, 12).map((f) => ({ code: f.id, title: f.label, ref: f.ref, percent: f.pct })),
      notRead: tally.unread.map((f) => ({ code: f.id, title: f.label, ref: f.ref })),
      expandedFamilies: open,
    },
    availableActions: [
      'Expand a requirement family to read its individual IVDR requirements',
      'Read which requirements are not started, in progress or evidenced',
    ],
  };
}
