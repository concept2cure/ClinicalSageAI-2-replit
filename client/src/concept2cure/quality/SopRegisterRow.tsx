/**
 * One row of the controlled-document register (split out of SopRegister.tsx, D7-B item 6).
 *
 * Until 2026-11-06 every action a document offered was stacked in the row's last cell (Open document, Training,
 * Review route, Approve, Revise, Record review, Retire, Controlled copy, History, Ask AnA): rows were 192px tall
 * and read as a control wall. A row now shows its one next step and "More", which reveals the rest in the row
 * itself, the same buttons with the same names and the same handlers, so nothing a person could do is gone and
 * there is no new menu component. The next step follows the document's state:
 *   - a draft: Send for review
 *   - under review: Approve, for the person whose turn it is; otherwise Review route
 *   - effective: Read and acknowledge
 *   - superseded or retired: History
 *
 * @module client/src/concept2cure/quality/SopRegisterRow
 */
import * as React from 'react';
import { I } from '../v2/icons';
import { registerRowMinWidth } from './registerGrid';
import { DOC_TYPE_LABEL, STATUS_LABEL, STATUS_TONE, formatDate, isReviewOverdue, reviewRowOf, todayUtc, type QmsDoc, type ReviewDueRow } from './data';
import { canRecordReview, lastReviewLine } from './PeriodicReview';
import { myTurn, qmsRouteView } from './qmsReviewRoute';
import { routeHeadline } from '../v2/reviewRoute/routeRound';
import { RegisterSignatureLine } from './RegisterSignatureLine';
import { QMS_TRAINABLE_DOCUMENT_TYPES } from '@shared/qms/training';

/* Number · Title · Type · Version · Status · Effective · Next review · next step and More. The fixed tracks
   (776px) leave the title its 160px floor inside the 1038px table a 1440 window gives the page, so a row fits
   without scrolling there; the last track holds the longest next step, "Read and acknowledge", and "More". */
export const GRID = '100px minmax(0, 1fr) 100px 52px 120px 96px 104px 204px';
/* Derived, never hand-kept — see registerGrid.ts. Below this the title track
   resolves to 0px and the row's last columns are clipped away. */
export const ROW_MIN = registerRowMinWidth(GRID);

/** What a row can do; each handler is the register's own, unchanged. */
export interface RegisterRowActions {
  meId: number | null;
  /** The signed-in person may open their personal reader for this document. */
  canRead: (doc: QmsDoc) => boolean;
  open: (doc: QmsDoc) => void;
  read: (documentId: number) => void;
  assign: (doc: QmsDoc) => void;
  sendForReview: (doc: QmsDoc) => void;
  showRoute: (doc: QmsDoc) => void;
  approve: (doc: QmsDoc) => void;
  revise: (doc: QmsDoc) => void;
  recordReview: (row: ReviewDueRow, trigger: HTMLElement) => void;
  retire: (doc: QmsDoc) => void;
  controlledCopy: (doc: QmsDoc) => void;
  history: (doc: QmsDoc) => void;
  ask: (prompt: string) => void;
}

/**
 * The register's Next review: when the version in force is next due. After a
 * signed periodic review that is the reviewer's date, not the one the approval
 * signed, so the cell says which review set it (PeriodicReview.tsx).
 */
function NextReviewCell({ doc: d, overdue }: { doc: QmsDoc; overdue: boolean }) {
  const review = d.lastReview;
  const title = review
    ? `${lastReviewLine(review)} The date its approval signed: ${d.signedReviewDate ? formatDate(d.signedReviewDate) : 'none'}.`
    : undefined;
  return (
    <div className="qms-cell" title={title}>
      {d.nextReviewDate ? (
        <span className={overdue ? 'qms-overdue' : undefined}>
          {formatDate(d.nextReviewDate)}
          {overdue && <> {I.flag}</>}
        </span>
      ) : (
        '—'
      )}
      {review && (
        <span className="qms-review-by" data-testid="qms-register-last-review">
          {review.outcome === 'current' ? 'Reviewed' : 'Revision required,'} {formatDate(review.reviewedAt)}
        </span>
      )}
    </div>
  );
}

/**
 * Approve on the row: a document in review with no route keeps today's Approve, for anyone but its author (the server
 * refuses the author's approval, so offering it to them was a button that could only be refused); on a route, only its
 * named approver at their turn (RR4).
 */
export function approvableBy(d: QmsDoc, meId: number | null): boolean {
  const view = qmsRouteView(d);
  if (view.kind === 'legacy') return d.authorId == null || meId == null || d.authorId !== meId;
  return myTurn(view, meId)?.role === 'approver';
}

/** The route's round in one line under the status, so the register shows where each document stands (RR4). */
function RouteLine({ doc, meId }: { doc: QmsDoc; meId: number | null }) {
  const view = qmsRouteView(doc);
  if (view.kind === 'unread') return <span className="qms-route-line" role="alert">Reviewers could not be read.</span>;
  if (view.kind === 'legacy') return <span className="qms-route-line">Not assigned to one person.</span>;
  if (view.kind === 'none' || (view.kind === 'closed' && doc.status !== 'draft')) return null;
  return <span className="qms-route-line" data-testid="qms-route-line">{routeHeadline(view.round, meId)}</span>;
}

type ActionKey = 'read' | 'training' | 'send' | 'route' | 'approve' | 'revise' | 'review' | 'retire' | 'copy' | 'history' | 'ask';

/** The document's one next step, by its state (module header). */
export function nextStepOf(d: QmsDoc, meId: number | null): ActionKey {
  if (d.status === 'draft') return 'send';
  if (d.status === 'in_review') return approvableBy(d, meId) ? 'approve' : 'route';
  if (d.status === 'effective') return 'read';
  return 'history';
}

/** Every action the document offers, in the order the register has always shown them. */
function actionsOf(d: QmsDoc, act: RegisterRowActions): { key: ActionKey; node: React.ReactNode }[] {
  const out: { key: ActionKey; node: React.ReactNode }[] = [];
  const btn = (key: ActionKey, label: string, onClick: (e: React.MouseEvent<HTMLButtonElement>) => void, extra: Record<string, string | boolean | undefined> = {}) =>
    out.push({ key, node: <button key={key} type="button" className="btn ghost small" onClick={onClick} {...extra}>{label}</button> });
  btn('read', d.status === 'effective' ? 'Read and acknowledge' : 'Open document', () => act.read(d.id), {
    disabled: !act.canRead(d), title: 'Read this controlled revision and check your personal acknowledgement' });
  if (d.status !== 'retired' && (QMS_TRAINABLE_DOCUMENT_TYPES as readonly string[]).includes(d.docType)) {
    btn('training', 'Training', () => act.assign(d), { title: 'Who must read and acknowledge this document: job roles and named people' });
  }
  if (d.status === 'draft') {
    btn('send', 'Send for review', () => act.sendForReview(d), {
      title: 'Send this draft for review, naming its QMS approver and any reviewers. Only a document under review can be approved.' });
  }
  if (d.status === 'in_review') {
    btn('route', 'Review route', () => act.showRoute(d), {
      'data-testid': 'qms-route-open', title: "Who is named on this document's review route, and what each has done" });
    if (approvableBy(d, act.meId)) {
      btn('approve', 'Approve', () => act.approve(d), {
        title: 'Approve with your electronic signature (password and second factor). The author cannot approve their own document.' });
    }
  }
  if (['effective', 'in_review', 'superseded', 'retired'].includes(d.status)) {
    btn('revise', 'Revise', () => act.revise(d), {
      title: 'Open a controlled revision with a reason for change: a new draft needs independent review and approval' });
    if (canRecordReview(reviewRowOf(d))) {
      btn('review', 'Record review', (e) => act.recordReview(reviewRowOf(d), e.currentTarget), {
        'aria-label': `Record review: ${d.docNumber} ${d.title}`,
        title: 'Record a periodic review with your electronic signature. The document and its approval are not changed.' });
    }
    if (d.status === 'effective') {
      btn('retire', 'Retire', () => act.retire(d), {
        title: 'Retire with your electronic signature (password and second factor). Retirement is the terminal state; the document leaves use for everyone trained on it.' });
    }
  }
  if (d.status === 'effective' || d.inForce) {
    btn('copy', 'Controlled copy', () => act.controlledCopy(d), {
      'aria-label': `Download a controlled copy of ${d.docNumber}`,
      title: 'Download the version in force as a controlled copy: its approval signature and CONTROLLED COPY marking on every page. The issue is recorded.' });
  }
  btn('history', 'History', () => act.history(d), { 'aria-label': `View version history of ${d.docNumber}`, title: 'Read retained document versions' });
  btn('ask', 'Ask AnA', () => act.ask(`Summarize ${d.docNumber} ${d.title} and tell me what it needs next.`), {
    'aria-label': 'Ask AnA about this document', title: 'Ask AnA about this document' });
  return out;
}

/** One register row: the document's facts, its next step, and "More" for the rest. */
export function SopRegisterRow({ doc: d, actions: act }: { doc: QmsDoc; actions: RegisterRowActions }) {
  const [more, setMore] = React.useState(false);
  const moreId = React.useId();
  const all = actionsOf(d, act);
  const step = nextStepOf(d, act.meId);
  const primary = all.find((a) => a.key === step) ?? null;
  const rest = all.filter((a) => a !== primary);
  const overdue = isReviewOverdue(d.nextReviewDate);
  return (
    <div className="qms-row" style={{ gridTemplateColumns: GRID, minWidth: ROW_MIN }} data-status={d.status} data-more={more || undefined}>
      <button type="button" className="qms-cell qms-num mono" title="Open the controlled document" onClick={() => act.open(d)}>
        {d.docNumber}
      </button>
      <div className="qms-cell qms-title" title={d.title}>{d.title}<RegisterSignatureLine doc={d} /></div>
      <div className="qms-cell">
        <span className="qms-tag">{DOC_TYPE_LABEL[d.docType] ?? d.docType}</span>
      </div>
      <div className="qms-cell mono">{d.version}</div>
      <div className="qms-cell" title={d.inForce ? (d.status === 'effective'
        ? `Version ${d.inForce.version} stays in force until version ${d.version} is effective.`
        : `Version ${d.inForce.version} stays in force until version ${d.version} is approved.`) : undefined}>
        {d.inForce && (
          <span className="qms-pill" data-tone="effective" data-testid="qms-in-force">v{d.inForce.version} in force</span>
        )}{d.inForce ? ' ' : null}
        <span className="qms-pill" data-tone={STATUS_TONE[d.status]}>
          {STATUS_LABEL[d.status]}
        </span>
        <RouteLine doc={d} meId={act.meId} />
      </div>
      <div className="qms-cell">
        {formatDate(d.inForce?.effectiveDate ?? d.effectiveDate)}
        {d.status === 'effective' && d.effectiveDate && d.effectiveDate.slice(0, 10) > todayUtc() && (
          <span className="qms-route-line" data-testid="qms-pending-effective">v{d.version} from {d.effectiveDate.slice(0, 10)} (pending)</span>
        )}
      </div>
      <NextReviewCell doc={d} overdue={overdue} />
      <div className="qms-cell qms-rowacts">
        {primary?.node}
        <button type="button" className="btn ghost small" aria-expanded={more} aria-controls={moreId}
          aria-label={`More actions for ${d.docNumber}`} onClick={() => setMore((m) => !m)}>
          More
        </button>
      </div>
      {more && (
        <div className="qms-row-more" id={moreId} role="group" aria-label={`Actions for ${d.docNumber}`}>
          {rest.map((a) => a.node)}
        </div>
      )}
    </div>
  );
}
