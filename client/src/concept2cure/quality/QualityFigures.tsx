/**
 * Quality's figures: one quiet line of numbers under the work area's header, on every tab (P-122, 2026-11-10).
 *
 * The four KPI tiles (Effective documents, Under review, Review overdue, Acknowledgement coverage) went with the
 * work-area restyle (a65f886a7, 2026-11-06), and each register kept a sentence of its own. Nothing said the quality
 * system's state at a glance. These are not tiles (ONE_DESIGN_PLAN §2: no stat tiles as chrome): a line of text, the
 * register sentences' style, with a tone only where a figure is overdue or unapproved.
 *
 * Every number is one the server computes, from four reads that already exist:
 *   - GET /api/mdx/qms/readiness (server/routes/mdx-qms.ts): documents in force, nonconformances awaiting
 *     disposition, critical suppliers not approved, open internal audits and their major findings, lapsed
 *     acknowledgements. It had no caller from 4aa204390 until this line, and production refused it as dead
 *     (launch-scope-api.ts LAUNCH_EXCLUDED_API) until this change admitted it;
 *   - the review schedule (GET …/documents/review-due, the window the Periodic review section reads);
 *   - the change-control summary (GET …/changes/summary);
 *   - the CAPA, complaint and MDR queue (GET /api/capa-mdr/triage), whose overdue flags the server sets.
 * Left out, because no server read computes them: documents under review (readiness counts in force, under
 * revision, overdue and draft, and its "draft" is everything not in force), open deviations and management reviews.
 * A read that failed is named, with a retry, and none of its figures is shown, never as zero.
 *
 * @module client/src/concept2cure/quality/QualityFigures
 */
import * as React from 'react';
import { useFetchJson } from '../mdx/hooks/useFetchJson';
import { useReviewDue } from './hooks';
import { useChangeSummary } from './changeHooks';
import { useOnQualityWrite } from './registerContext';
import { REVIEW_WINDOW_DAYS } from './PeriodicReview';
import type { ChangeSummary } from './changeData';
import type { ReviewDueRow } from './data';

/** The four server reads the line is made of. */
export const QUALITY_FIGURE_READS = {
  readiness: '/api/mdx/qms/readiness',
  review: `/api/mdx/qms/documents/review-due?within=${REVIEW_WINDOW_DAYS}`,
  changes: '/api/mdx/qms/changes/summary',
  triage: '/api/capa-mdr/triage?open_only=true&limit=500',
} as const;
/** The triage route's cap on its merged queue (capaMdr.service.ts getTriageQueueTx): at it, every count is a floor. */
const TRIAGE_CAP = 500;
/** The review schedule's cap (mdx-qms.ts REVIEW_DUE_LIMIT). */
const REVIEW_CAP = 500;

type Tone = 'warn' | 'err';
/** One figure: its number and words, and a fact beside it the number does not say. */
export interface QualityFigure { text: string; tone?: Tone; detail?: { text: string; tone?: Tone } }

interface Block { available?: boolean }
interface Readiness {
  documents?: Block & { effective?: number };
  suppliers?: Block & { criticalUnapproved?: number };
  training?: Block & { expired?: number };
  audits?: Block & { open?: number; openMajorFindings?: number };
  nonconforming?: Block & { undispositioned?: number };
}
interface TriageItem { kind?: string; overdue?: boolean }

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const tone = (count: number, t: Tone): Tone | undefined => (count > 0 ? t : undefined);
const readinessOf = (body: unknown): Readiness | null => {
  const data = (body as { data?: unknown } | null)?.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as Readiness) : null;
};
const triageOf = (body: unknown): TriageItem[] | null => {
  const items = (body as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as TriageItem[]) : null;
};

/** What the line says, from what each read returned (null while unread or after a failure). Pure, for its test. */
export function qualityFiguresOf(reads: {
  readiness: unknown | null; review: ReviewDueRow[] | null; changes: ChangeSummary | null; triage: unknown | null;
}): { figures: QualityFigure[]; unreadBlocks: string[] } {
  const figures: QualityFigure[] = [];
  const unreadBlocks: string[] = [];
  const ready = reads.readiness === null ? null : readinessOf(reads.readiness);
  const block = <K extends keyof Readiness>(key: K, label: string): Readiness[K] | null => {
    const b = ready?.[key];
    if (!ready) return null;
    if (!b || b.available !== true) { unreadBlocks.push(label); return null; }
    return b;
  };
  const docs = block('documents', 'documents in force');
  if (docs) figures.push({ text: n(docs.effective ?? 0, 'document in force', 'documents in force') });
  if (reads.review) {
    const due = reads.review.length;
    const overdue = reads.review.filter((r) => r.overdue).length;
    const floor = due >= REVIEW_CAP ? '+' : '';
    figures.push({
      text: `${due}${floor} due for review within ${REVIEW_WINDOW_DAYS} days`,
      ...(overdue ? { detail: { text: `${overdue}${floor} overdue`, tone: 'err' as const } } : {}),
    });
  }
  if (reads.changes) {
    const late = reads.changes.overdueImplementation ?? 0;
    figures.push({
      text: n(reads.changes.open ?? 0, 'open change', 'open changes'),
      ...(late ? { detail: { text: `${late} past ${late === 1 ? 'its' : 'their'} implementation date`, tone: 'warn' as const } } : {}),
    });
  }
  const queue = reads.triage === null ? null : triageOf(reads.triage);
  /* At the triage cap the queue is a floor: each count says "+", and a zero is not said, since a record past the
     cap may be one. */
  const capped = !!queue && queue.length >= TRIAGE_CAP;
  const count = (kind: string, overdueOnly = false) => (queue ?? []).filter((i) => i.kind === kind && (!overdueOnly || i.overdue)).length;
  const say = (c: number, one: string, many: string) => (capped ? `${c}+ ${many}` : n(c, one, many));
  if (queue) {
    const capas = count('capa');
    const lateCapas = count('capa', true);
    if (!capped || capas) {
      figures.push({
        text: say(capas, 'open CAPA', 'open CAPAs'),
        ...(lateCapas ? { detail: { text: `${lateCapas}${capped ? '+' : ''} past target close`, tone: 'err' as const } } : {}),
      });
    }
  }
  const nc = block('nonconforming', 'nonconformances');
  if (nc) {
    const u = nc.undispositioned ?? 0;
    figures.push({ text: n(u, 'nonconformance awaiting disposition', 'nonconformances awaiting disposition'), tone: tone(u, 'warn') });
  }
  if (queue) {
    const complaints = count('complaint');
    if (!capped || complaints) figures.push({ text: say(complaints, 'open complaint', 'open complaints') });
    const lateMdr = count('mdr', true);
    if (!capped || lateMdr) figures.push({ text: say(lateMdr, 'MDR report overdue', 'MDR reports overdue'), tone: tone(lateMdr, 'err') });
  }
  const suppliers = block('suppliers', 'suppliers');
  if (suppliers) {
    const c = suppliers.criticalUnapproved ?? 0;
    figures.push({ text: n(c, 'critical supplier not approved', 'critical suppliers not approved'), tone: tone(c, 'err') });
  }
  const audits = block('audits', 'internal audits');
  if (audits) {
    const majors = audits.openMajorFindings ?? 0;
    figures.push({
      text: n(audits.open ?? 0, 'open internal audit', 'open internal audits'),
      ...(majors ? { detail: { text: n(majors, 'major finding', 'major findings'), tone: 'warn' as const } } : {}),
    });
  }
  const training = block('training', 'acknowledgements');
  if (training) {
    const lapsed = training.expired ?? 0;
    figures.push({ text: n(lapsed, 'lapsed acknowledgement', 'lapsed acknowledgements'), tone: tone(lapsed, 'warn') });
  }
  return { figures, unreadBlocks };
}

export function QualityFigures({ organisationWide }: {
  /** The registers are narrowed to the open project, so the line says its figures are the organisation's. */
  organisationWide: boolean;
}) {
  const readiness = useFetchJson<unknown>(QUALITY_FIGURE_READS.readiness);
  const review = useReviewDue(REVIEW_WINDOW_DAYS);
  const changes = useChangeSummary();
  const triage = useFetchJson<unknown>(QUALITY_FIGURE_READS.triage);
  /* The line is the server's numbers, so a confirmed Quality write re-reads them: after a complaint was recorded it
     still said "0 open complaints" beside a register saying "Open: 1" (walked 2026-11-11, w39). */
  useOnQualityWrite(() => { readiness.refresh(); review.refresh?.(); changes.refresh?.(); triage.refresh(); });

  /* A read with no usable body is a failure, never an empty figure. */
  const readinessFailed = !readiness.loading && (readiness.error != null || (readiness.data != null && readinessOf(readiness.data) === null));
  const triageFailed = !triage.loading && (triage.error != null || (triage.data != null && triageOf(triage.data) === null));
  const reviewFailed = !review.loading && review.rows == null && review.error != null;
  const changesFailed = !changes.loading && changes.summary == null && changes.error != null;

  const { figures, unreadBlocks } = qualityFiguresOf({
    readiness: readinessFailed || readiness.data == null ? null : readiness.data,
    review: review.rows ?? null,
    changes: changes.summary ?? null,
    triage: triageFailed || triage.data == null ? null : triage.data,
  });
  const unread = [
    ...(readinessFailed ? ['documents in force, nonconformances, suppliers, internal audits and acknowledgements'] : unreadBlocks),
    ...(reviewFailed ? ['the review schedule'] : []),
    ...(changesFailed ? ['change control'] : []),
    ...(triageFailed ? ['CAPA, complaints and MDR reports'] : []),
  ];
  const retry = () => {
    if (readinessFailed || unreadBlocks.length) readiness.refresh();
    if (reviewFailed) review.refresh?.();
    if (changesFailed) changes.refresh?.();
    if (triageFailed) triage.refresh();
  };

  if (figures.length === 0 && unread.length === 0) {
    return <p className="sec-sub qms-figures" data-testid="quality-figures">Reading the quality figures…</p>;
  }
  return (
    <>
      <p className="sec-sub qms-figures" data-testid="quality-figures">
        {organisationWide && figures.length > 0 && 'Organisation-wide · '}
        {figures.map((f, i) => (
          <React.Fragment key={f.text}>
            {i ? ' · ' : ''}
            {f.tone ? <span data-tone={f.tone}>{f.text}</span> : f.text}
            {f.detail && <> ({f.detail.tone ? <span data-tone={f.detail.tone}>{f.detail.text}</span> : f.detail.text})</>}
          </React.Fragment>
        ))}
      </p>
      {unread.length > 0 && (
        <p className="sec-sub qms-figures-unread">
          <span data-testid="quality-figures-unread">Not read: {unread.join('; ')}.</span>{' '}
          <button type="button" className="btn ghost small" onClick={retry}>Read the figures again</button>
        </p>
      )}
    </>
  );
}
