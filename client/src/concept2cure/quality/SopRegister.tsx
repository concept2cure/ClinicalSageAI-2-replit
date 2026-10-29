/**
 * SopRegister — the controlled-document register and SOP library surface.
 *
 * Document control over the live QMS backend (/api/mdx/qms/*): the register
 * catalog, the controlled lifecycle (draft → under review → effective →
 * superseded → retired), periodic-review tracking with overdue flags,
 * read-and-understood training, change control (revise / retire), and the
 * Quality system template gallery.
 *
 * Create, template, open, review and revision controls use the governed QMS
 * API. The bound editing copy opens in the canonical Authoring workbench.
 * AnA remains available for inspection guidance and document questions.
 *
 * Personal acknowledgements belong to the signed-in reader in the native
 * controlled-text dialog. AnA can explain a procedure but cannot attest.
 * Approval and retirement also use native controls, because each is an electronic
 * signature and AnA cannot sign: a chat turn cannot collect a password. The
 * row's Approve button opens the shared EsignModal, which posts to the signed
 * route (POST /api/mdx/qms/documents/:id/approve, VSR-001 F-3). Until 2026-09-24
 * this button was "Ask AnA to approve", its tooltip said "you still capture the
 * e-signature", and the tool it reached made the SOP effective with no
 * signature at all (new-code audit 2026-09-24, finding 1). The Retire button
 * opens the same dialog against POST /api/mdx/qms/documents/:id/retire
 * (P1-29 / DP-32, security review 2026-09-24): until 2026-09-26 it was a
 * reason-only confirm, and the route retired the document on the reason alone.
 *
 * Approve is offered on a document under review only, and a draft offers "Send
 * for review" — the existing edit route (PATCH status 'in_review'), not a
 * signature. Since RR4 (docs/design/REVIEW_ROUTING_2026-10-23.md §2.7) the send
 * names its review route — one QMS approver and any reviewers — in the route
 * form (QmsReviewRoute.tsx), and a document under review on a route shows its
 * round and is approved by its named approver; one already in review with no
 * route keeps today's Approve. Until 2026-10-08 a draft row offered Approve, its dialog said the
 * version "becomes effective when you sign", and nothing in the product routed
 * a draft to review (QA walk J8); the server now approves in_review only.
 *
 * @module client/src/concept2cure/quality/SopRegister
 */
import * as React from 'react';
import { I } from '../v2/icons';
import { registerRowMinWidth } from './registerGrid';
import {
  deriveReviewDue,
  DOC_TYPE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  formatDate,
  isReviewOverdue,
} from './data';
import { useSopRegister, useSopTemplates, useReviewDue, useTrainingCompliance } from './hooks';
import { EsignModal, esignSignerOf } from '../_shared/components/EsignModal';
import { postQmsApproval } from './qmsApproval';
import { QmsRouteForm, QmsRoutePanel } from './QmsReviewRoute';
import { myTurn, qmsRouteView } from './qmsReviewRoute';
import { routeHeadline } from '../v2/surfaces/VaultReviewRoute';
import { useAuthUser } from '@/services/portal/authService';
import { reviewRowOf, type QmsDoc } from './data';
import { PeriodicReviewPanel, RecordPeriodicReview, canRecordReview, lastReviewLine, useRecordPeriodicReview } from './PeriodicReview';
import { ErrorState } from '../v2/dataConnect';
import { ControlledDocumentSetup, ControlledDocumentReason } from './ControlledDocumentDialogs';
import { ControlledDocumentWorkbench } from './ControlledDocumentWorkbench';
import { reviseQmsDocument } from './qmsDocuments';
import type { SopTemplate } from './data';
import { ControlledDocumentHistory } from './ControlledDocumentHistory';
import {useControlledDocumentTarget,ControlledDocumentTargetStatus} from './ControlledDocumentTarget';

import { PersonalTrainingReader } from './PersonalTrainingReader';
import { personalTrainingScope } from './qmsPersonalTraining';
import { TrainingCoverage, DocumentReadButton } from './TrainingCoverage';
import { TrainingExpiry } from './TrainingExpiry';
export interface SopRegisterProps {
  /** Forward a prompt to the host's AnA conversation surface. */
  onAsk: (q: string) => void;
  /** Status chip applied to the register (owned by QualityApp — AnA's filter action drives the same value). */
  filter: StatusFilter;
  /** Apply a status chip — the same setter the chips and AnA share. */
  onFilterChange: (f: StatusFilter) => void;
  onNavigate?: (target: string) => void;
  /** The shell holds its other tabs while the canonical editor is open. */
  onEditorOpenChange?: (open: boolean) => void;
  qmsDocumentId?:string;
  qmsTargetRequest?:number;
}
export type StatusFilter = 'all' | 'effective' | 'in_review' | 'draft';
/** The register's status chips — exported so QualityApp can belt-validate a
    driven filter against the same set the pane renders. */
export const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'effective', label: 'Effective' },
  { id: 'in_review', label: 'Under review' },
  { id: 'draft', label: 'Draft' },
];
const GRID = '110px minmax(0, 1fr) 130px 64px 108px 100px 116px 150px';
/* Derived, never hand-kept — see registerGrid.ts. Below this the title track
   resolves to 0px and the row's last columns are clipped away. */
const ROW_MIN = registerRowMinWidth(GRID);
function Kpi({
  label,
  val,
  unit,
  sub,
  tone,
}: {
  label: string;
  val: string;
  unit?: string;
  sub: string;
  tone?: 'ok' | 'warn' | 'err';
}) {
  return (
    <div className="qms-kpi" data-tone={tone === 'ok' ? '' : tone || ''}>
      <div className="lbl">{label}</div>
      <div className="val">
        {val}
        {unit && <span className="unit">{unit}</span>}
      </div>
      <div className="sub">{sub}</div>
    </div>
  );
}
/* Stable identities for an unread read, so memo deps do not churn. */
const NO_DOCS: QmsDoc[] = [];
const NO_TEMPLATES: NonNullable<ReturnType<typeof useSopTemplates>['templates']> = [];
const NO_TRAINING: NonNullable<ReturnType<typeof useTrainingCompliance>['rows']> = [];

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

/** Approve on the row: a document in review with no route keeps today's Approve; on a route, only its named approver at their turn (RR4). */
function approvableBy(d: QmsDoc, meId: number | null): boolean {
  const view = qmsRouteView(d);
  if (view.kind === 'legacy') return true;
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

export function SopRegister(props: SopRegisterProps) {
  const user = useAuthUser();
  return <SopRegisterSession key={`${user?.organizationId ?? ''}:${user?.id ?? ''}`} {...props} />;
}
function SopRegisterSession({ onAsk, filter, onFilterChange, onNavigate, onEditorOpenChange, qmsDocumentId, qmsTargetRequest }: SopRegisterProps) {
  const reg = useSopRegister();
  const tpl = useSopTemplates();
  const rev = useReviewDue();
  /* Four raw `?? FIXTURE` fallbacks on a GxP document register, none of them
     gated by sample mode and none of them marked. They fired on an empty
     tenant, an expired token, a 500, or a fetch that had not started — and
     `data.ts` supplies rows asserting `status: 'effective'` with effective
     dates, plus training-completion counts ("SOP-820-100 CAPA, 47 of 47,
     2026-03-30"). A training record and an effective-SOP list are exactly the
     things an auditor asks to see, and nothing on screen said they were
     examples.
     `deriveReviewDue(docs)` stays a derivation rather than a fixture: it is
     computed from whatever `docs` resolved to, so it inherits that decision
     instead of making a second one. */
  /* The tenant's rows or none. The fallbacks above were first gated behind
     sample mode (2026-09-25) and then removed with it (2026-10-14), along with
     FIXTURE_DOCS, FIXTURE_TRAINING and SOP_TEMPLATES. */
  const docs = reg.docs ?? NO_DOCS;
  const templates = tpl.templates ?? NO_TEMPLATES;
  const reviewDue = rev.rows ?? deriveReviewDue(docs);
  /* Live read-and-understood compliance (numerator = distinct current
     acknowledgments, denominator = org roster). */
  const trainComp = useTrainingCompliance();
  const training = trainComp.rows ?? NO_TRAINING;
  const user = useAuthUser(); // server resolves every signer and acknowledging actor
  const readerScope = `${user?.organizationId ?? ''}:${user?.id ?? ''}`;
  const [reading, setReading] = React.useState<{ documentId: number; scope: string } | null>(null);
  React.useEffect(() => { setReading(null); }, [readerScope]);
  const openReader = (documentId: number) => setReading({ documentId, scope: readerScope });
  const canOpen = (documentId: number) => personalTrainingScope(user, documentId) !== null;
  /** The document being approved, while the signature dialog is open. */
  const [approving, setApproving] = React.useState<QmsDoc | null>(null);
  /** The document being retired, while its signature dialog is open. Retirement
      is the terminal transition of a controlled document and is signed like the
      approval: password, second factor, meaning and reason, re-verified by the
      server in the transaction that writes the signature. */
  const [retiring, setRetiring] = React.useState<QmsDoc | null>(null);
  /** The document whose review route is open in its sheet (RR4). */
  const [routePanel, setRoutePanel] = React.useState<QmsDoc | null>(null);
  const meId = user?.id && /^\d+$/.test(String(user.id)) ? Number(user.id) : null;
  const admin = ((user as { roles?: string[] } | null)?.roles ?? []).some((r) => String(r).toLowerCase() === 'admin');
  /** The last register action's outcome, in the server's words when it refused. */
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [setup, setSetup] = React.useState<{ document?: QmsDoc; template?: SopTemplate; revision?: boolean } | null>(null);
  const [reviewing, setReviewing] = React.useState<QmsDoc | null>(null);
  const [revising, setRevising] = React.useState<QmsDoc | null>(null);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [history, setHistory] = React.useState<QmsDoc | null>(null);
  /** The document whose periodic review is being recorded (PeriodicReview.tsx). */
  const recordReview = useRecordPeriodicReview();
  const target=useControlledDocumentTarget(qmsDocumentId,qmsTargetRequest);
  React.useEffect(()=>{
    const d=target.document;
    if(!d)return;
    if(editingId===d.id){target.clear();return;}
    if(editingId!==null)return; // Keep the canonical workbench's unsaved-leave decision in control.
    if(d.authoringDocumentId){target.clear();setEditingId(d.id);}
    else if(d.status==='draft'){target.clear();setSetup({document:d});}
  },[target.document,target.clear,editingId]);
  const targetStatus=<ControlledDocumentTargetStatus target={target} editing={editingId!==null} onRevise={d=>{target.clear();setSetup({document:d,revision:true});}} />;
  React.useEffect(() => { onEditorOpenChange?.(editingId !== null); }, [editingId, onEditorOpenChange]);
  const openDocument = (d: QmsDoc) => {
    if (d.status === 'draft' && !d.authoringDocumentId) setSetup({ document: d });
    else setEditingId(d.id);
  };
  const openCreated = (id: number) => {
    setSetup(null);
    reg.refresh?.();
    setEditingId(id);
  };
  const sent = (d: QmsDoc) => {
    setNotice({ tone: 'ok', text: `${d.docNumber} was sent for review on its route. The people named are told when it is their turn.` });
    setReviewing(null);
    reg.refresh?.();
  };
  // In force includes an effective SOP whose next version is being drafted or reviewed.
  const effectiveCount = docs.filter((d) => d.status === 'effective' || d.inForce).length;
  const underReviewCount = docs.filter((d) => d.status === 'in_review').length;
  const draftCount = docs.filter((d) => d.status === 'draft').length;
  const overdueCount = reviewDue.filter((r) => r.overdue).length;
  const trainedRows = training.filter((t) => t.of > 0 && t.eligible !== false);
  const trainingPct = trainedRows.length
    ? Math.round((trainedRows.reduce((s, t) => s + t.current / t.of, 0) / trainedRows.length) * 100)
    : 0;
  /* A read that has not answered is not an empty register. An unread register
     resolves to `[]` above, so until 2026-09-25 a 401, a 500 or a
     dropped connection rendered "Effective documents 0" and "Review overdue 0 —
     All current" in the ok tone, over "No documents due for review." The hooks
     computed the error; nothing here read it (HS-1,
     docs/evidence/reviews/2026-09-24/lenses.md). "Unread" is in flight or failed;
     neither may render a count. A resolved list that is non-empty came from
     live rows. */
  const regUnread = reg.docs == null && docs.length === 0;
  const regFailed = regUnread && reg.error != null;
  /* Review dates come from their own read, or are derived from the register;
     they are unknown only when both are. */
  const reviewUnread = rev.rows == null && regUnread;
  const reviewFailed = reviewUnread && regFailed;
  const trainUnread = trainComp.rows == null && training.length === 0;
  const trainFailed = trainUnread && trainComp.error != null;
  const unreadSub = (failed: boolean) => (failed ? 'Could not be read' : 'Loading…');
  /* A register that was read and holds nothing. "None in review" and "Review
     overdue 0 — All current" were true of the empty set only vacuously, and
     read as a compliant register to a QA lead on a new tenant (launch sweep
     finding 112, the clause the HS-1 fix above left standing). */
  const registerEmpty = !regUnread && docs.length === 0;
  const nothingToReview = registerEmpty && reviewDue.length === 0;

  const visible = docs.filter((d) => filter === 'all' || d.status === filter);

  if (editingId !== null) return <>{targetStatus}<ControlledDocumentWorkbench documentId={editingId}
    onBack={() => { setEditingId(null); reg.refresh?.(); rev.refresh?.(); trainComp.refresh?.(); }}
    onNavigate={onNavigate ?? (() => undefined)} onAsk={onAsk} /></>;

  return (
    <>
      {targetStatus}
      <div className="qms-head">
        <div>
          <div className="qms-eyebrow">Workstream</div>
          <h1 className="qms-h1">Quality system</h1>
          <div className="qms-sub">
            Your controlled-document register and SOP library. Build SOPs, work instructions, policies,
            forms, validation protocols and training curricula — then track each through draft, review,
            effective and retirement, with periodic review and read-and-understood training.
          </div>
        </div>
        <div className="qms-actions">
          <button
            className="qms-btn ghost"
            title="Sends this request to AnA; nothing in the register changes"
            onClick={() =>
              onAsk(
                'Run a QMS pre-inspection check — surface every controlled document overdue for periodic ' +
                  'review, every training gap, and anything not yet effective, ranked by inspection risk.',
              )
            }
          >
            {I.sparkles} Ask AnA for a pre-inspection check
          </button>
          <button
            className="qms-btn primary"
            disabled={templates.length === 0}
            title={templates.length === 0 ? (tpl.error ? 'The Quality system library could not be read' : 'Loading the Quality system library…') : undefined}
            onClick={() => setSetup({})}
          >
            {I.plus} New controlled document
          </button>
        </div>
      </div>

      <div className="qms-kpis">
        {regUnread ? (
          <>
            <Kpi label="Effective documents" val="—" sub={unreadSub(regFailed)} />
            <Kpi label="Under review" val="—" sub={unreadSub(regFailed)} />
          </>
        ) : (
          <>
            <Kpi label="Effective documents" val={String(effectiveCount)} sub={`${docs.length} in register`} />
            <Kpi
              label="Under review"
              val={String(underReviewCount)}
              sub={underReviewCount ? 'Awaiting approval' : registerEmpty ? 'Nothing in the register yet' : 'None in review'}
              tone={underReviewCount ? 'warn' : 'ok'}
            />
          </>
        )}
        {reviewUnread ? (
          <Kpi label="Review overdue" val="—" sub={unreadSub(reviewFailed)} />
        ) : nothingToReview ? (
          <Kpi label="Review overdue" val="—" sub="Nothing in the register to review" />
        ) : (
          <Kpi
            label="Review overdue"
            val={String(overdueCount)}
            sub={overdueCount ? 'Past next-review date' : 'All current'}
            tone={overdueCount ? 'err' : 'ok'}
          />
        )}
        {/* No trained rows is nothing assessed, not 0% compliance. */}
        {trainUnread || trainedRows.length === 0 ? (
          <Kpi
            label="Acknowledgement coverage"
            val="—"
            sub={trainUnread ? unreadSub(trainFailed) : training.length === 0 ? 'No training-controlled documents yet' : training.every((t) => t.eligible === false) ? 'Verified released text is unavailable' : 'No active roster members to assess'}
          />
        ) : (
          <Kpi
            label="Acknowledgement coverage"
            val={String(trainingPct)}
            unit="%"
            sub="Average verified-release coverage of active roster"
            tone={trainingPct >= 95 ? 'ok' : trainingPct >= 80 ? 'warn' : 'err'}
          />
        )}
      </div>

      {/* ── Template gallery ── */}
      <section className="qms-sec">
        <div className="qms-sec-head">
          <h2>Build from the Quality system library</h2>
          <span className="meta">{templates.length} document types · standard Purpose to Approval structure</span>
        </div>
        <div className="qms-tpl-grid">
          {templates.map((t) => (
            <button
              key={t.key}
              className="qms-tpl-card"
              title={Array.isArray(t.sections) && t.sections.length > 0
                ? `Create a new ${t.label} as a draft with its standard sections: ${t.sections.map((s) => s.label).join(', ')}`
                : `Create a new ${t.label} as a draft`}
              onClick={() => setSetup({ template: t })}
            >
              <div className="qms-tpl-top">
                <span className="qms-tpl-ico">{I.template}</span>
                <span className="qms-tpl-prefix mono">{t.numberPrefix}</span>
              </div>
              <div className="qms-tpl-label">{t.label}</div>
              <div className="qms-tpl-desc">{t.description}</div>
            </button>
          ))}
        </div>
      </section>

      {/* ── Register ── */}
      <section className="qms-sec">
        <div className="qms-sec-head">
          <h2>Controlled-document register</h2>
          {!regUnread && (
            <span className="meta">
              {effectiveCount} effective · {underReviewCount} under review · {draftCount} draft
            </span>
          )}
          <span className="spacer" />
          <div className="qms-seg" role="tablist">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                className="qms-chip"
                data-on={filter === f.id}
                aria-pressed={filter === f.id}
                style={filter === f.id ? { borderColor: 'var(--text-300)', color: 'var(--text-100)' } : undefined}
                onClick={() => onFilterChange(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="qms-table">
          <div className="qms-thead" style={{ gridTemplateColumns: GRID, minWidth: ROW_MIN }}>
            <div>Number</div>
            <div>Title</div>
            <div>Type</div>
            <div>Version</div>
            <div>Status</div>
            <div>Effective</div>
            <div>Next review</div>
            <div />
          </div>
          {notice && (
            <div
              className="qms-empty"
              role={notice.tone === 'err' ? 'alert' : 'status'}
              data-tone={notice.tone}
            >
              {notice.text}
            </div>
          )}
          {regFailed && (
            <ErrorState
              title="The controlled-document register could not be read"
              message={reg.error}
              retry={reg.refresh}
              testId="sop-register-failed"
            />
          )}
          {regUnread && !regFailed && (
            <div className="qms-empty" role="status">Loading the register…</div>
          )}
          {!regUnread && visible.length === 0 && (
            <div className="qms-empty">
              {filter === 'all' ? 'No controlled documents in the register yet.' : 'No documents with this status.'}
            </div>
          )}
          {visible.map((d) => {
            const overdue = isReviewOverdue(d.nextReviewDate);
            return (
              <div key={d.id} className="qms-row" style={{ gridTemplateColumns: GRID, minWidth: ROW_MIN }} data-status={d.status}>
                <button
                  className="qms-cell qms-num mono"
                  title="Open the controlled document"
                  onClick={() => openDocument(d)}
                >
                  {d.docNumber}
                </button>
                <div className="qms-cell qms-title" title={d.title}>{d.title}</div>
                <div className="qms-cell">
                  <span className="qms-tag">{DOC_TYPE_LABEL[d.docType] ?? d.docType}</span>
                </div>
                <div className="qms-cell mono">{d.version}</div>
                <div className="qms-cell" title={d.inForce ? `Version ${d.inForce.version} stays in force until version ${d.version} is approved.` : undefined}>
                  {d.inForce && (
                    <span className="qms-pill" data-tone="effective" data-testid="qms-in-force">v{d.inForce.version} in force</span>
                  )}{d.inForce ? ' ' : null}
                  <span className="qms-pill" data-tone={STATUS_TONE[d.status]}>
                    {STATUS_LABEL[d.status]}
                  </span>
                  <RouteLine doc={d} meId={meId} />
                </div>
                <div className="qms-cell">{formatDate(d.inForce?.effectiveDate ?? d.effectiveDate)}</div>
                <NextReviewCell doc={d} overdue={overdue} />
                <div className="qms-cell qms-rowacts">
                  <DocumentReadButton doc={d} disabled={!personalTrainingScope(user, d.id)} onOpen={openReader} />
                  {d.status === 'draft' && (
                    <button
                      className="qms-chip"
                      title="Send this draft for review, naming its QMS approver and any reviewers. Only a document under review can be approved."
                      onClick={() => setReviewing(d)}
                    >
                      {I.arrowRight} Send for review
                    </button>
                  )}
                  {d.status === 'in_review' && (
                    <button
                      className="qms-chip"
                      data-testid="qms-route-open"
                      title="Who is named on this document's review route, and what each has done"
                      onClick={() => setRoutePanel(d)}
                    >
                      {I.eye} Review route
                    </button>
                  )}
                  {d.status === 'in_review' && approvableBy(d, meId) && (
                    <button
                      className="qms-chip"
                      title="Approve with your electronic signature (password and second factor). The author cannot approve their own document."
                      onClick={() => setApproving(d)}
                    >
                      {I.check} Approve
                    </button>
                  )}
                  {['effective','in_review','superseded','retired'].includes(d.status) && (
                    <>
                      <button
                        className="qms-chip"
                        title="Open a controlled revision with a reason for change: a new draft needs independent review and approval"
                        onClick={() => d.authoringDocumentId ? setRevising(d) : setSetup({ document: d, revision: true })}
                      >
                        {I.history} Revise
                      </button>
                      {canRecordReview(reviewRowOf(d)) && <button
                        className="qms-chip"
                        aria-label={`Record review: ${d.docNumber} ${d.title}`}
                        title="Record a periodic review with your electronic signature. The document and its approval are not changed."
                        onClick={(event) => recordReview.start(reviewRowOf(d), event.currentTarget)}
                      >
                        {I.check} Record review
                      </button>}
                      {d.status === 'effective' && <button
                        className="qms-chip"
                        title="Retire with your electronic signature (password and second factor). Retirement is the terminal state; the document leaves use for everyone trained on it."
                        onClick={() => setRetiring(d)}
                      >
                        {I.archive} Retire
                      </button>}
                    </>
                  )}
                  <button
                    className="qms-chip ghost"
                    aria-label={`View version history of ${d.docNumber}`}
                    title="Read retained document versions" onClick={() => setHistory(d)}
                  >
                    {I.history} History
                  </button>
                  <button
                    className="qms-chip ghost"
                    title="Ask AnA about this document" aria-label="Ask AnA about this document"
                    onClick={() => onAsk(`Summarize ${d.docNumber} ${d.title} and tell me what it needs next.`)}
                  >
                    {I.sparkles}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Periodic review + training ── */}
      <div className="qms-grid2">
        <PeriodicReviewPanel rows={reviewDue} unread={reviewUnread} failed={reviewFailed} error={rev.error ?? reg.error}
          retry={() => { reg.refresh?.(); rev.refresh?.(); }} overdueCount={overdueCount}
          canOpen={canOpen} onOpen={openReader} onRecord={recordReview.start} />

        <TrainingCoverage rows={training} unread={trainUnread} failed={trainFailed} error={trainComp.error}
          refresh={trainComp.refresh}
          canOpen={canOpen} onOpen={openReader} />
        <TrainingExpiry />
      </div>
      {history && <ControlledDocumentHistory document={history} onClose={() => setHistory(null)} />}
      {setup && <ControlledDocumentSetup document={setup.document} template={setup.template} templates={templates} revision={setup.revision}
        onClose={() => setSetup(null)} onCreated={openCreated} onNavigate={onNavigate} />}
      {reviewing && <QmsRouteForm doc={reviewing} mode="send" onClose={() => setReviewing(null)} onSent={() => sent(reviewing)} />}
      {routePanel && <QmsRoutePanel doc={routePanel} view={qmsRouteView(docs.find((x) => x.id === routePanel.id) ?? routePanel)} meId={meId} admin={admin}
        signer={esignSignerOf(user as Parameters<typeof esignSignerOf>[0])} onClose={() => setRoutePanel(null)} onChanged={() => reg.refresh?.()}
        onApprove={() => { setApproving(routePanel); setRoutePanel(null); }} />}
      {revising && <ControlledDocumentReason title="Create controlled revision" action="Create revision"
        description={`Create a new draft of ${revising.docNumber} ${revising.title} v${revising.version}. The previous controlled editing copy stays read-only and recorded signed versions remain in the history.`}
        onClose={() => setRevising(null)} onSubmit={async reason => {
          const row = await reviseQmsDocument(revising.id, reason);
          setRevising(null); reg.refresh?.(); setEditingId(row.id);
        }} />}
      {reading && reading.scope === readerScope && (
        <PersonalTrainingReader key={`${readerScope}:${reading.documentId}`} documentId={reading.documentId} onClose={() => setReading(null)} onAcknowledged={() => { trainComp.refresh(); reg.refresh(); }} />
      )}
      {recordReview.row && (
        <RecordPeriodicReview row={recordReview.row} signer={esignSignerOf(user as Parameters<typeof esignSignerOf>[0])}
          onClose={recordReview.close} onRecorded={() => { recordReview.recorded(); reg.refresh?.(); rev.refresh?.(); }}
          onRefused={() => { reg.refresh?.(); rev.refresh?.(); }} />
      )}
      {approving && (
        <EsignModal
          open
          action="Approve controlled document"
          target={`${approving.docNumber} ${approving.title}`}
          targetMeta={`v${approving.version} becomes effective when you sign. The author cannot approve their own document.`}
          defaultMeaning="approval"
          meanings={['approval']}
          signer={esignSignerOf(user as Parameters<typeof esignSignerOf>[0])}
          onClose={() => setApproving(null)}
          onSign={async (input) => {
            const manifest = await postQmsApproval({ kind: 'document', id: approving.id }, input);
            reg.refresh?.();
            return manifest;
          }}
        />
      )}
      {retiring && (
        <EsignModal
          open
          action="Retire controlled document"
          target={`${retiring.docNumber} ${retiring.title} (v${retiring.version})`}
          targetMeta="Retirement is the terminal state: the document leaves use for everyone trained on it when you sign. It is an electronic signature."
          defaultMeaning="approval"
          meanings={['approval']}
          signer={esignSignerOf(user as Parameters<typeof esignSignerOf>[0])}
          onClose={() => setRetiring(null)}
          onSign={async (input) => {
            const manifest = await postQmsApproval({ kind: 'document-retire', id: retiring.id }, input);
            reg.refresh?.();
            return manifest;
          }}
        />
      )}
    </>
  );
}
