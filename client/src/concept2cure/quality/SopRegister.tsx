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
import { deriveReviewDue, coverageKpiOf } from './data';
import { useSopRegister, useSopTemplates, useReviewDue, useTrainingCompliance } from './hooks';
import { EsignModal, esignSignerOf } from '../_shared/components/EsignModal';
import { postQmsApproval } from './qmsApproval';
import { QmsRouteForm, QmsRoutePanel } from './QmsReviewRoute';
import { myTurn, qmsApprovalMeta, qmsRouteView } from './qmsReviewRoute';
import { approvalShare } from '../v2/reviewRoute/routeRound';
import { useAuthUser } from '@/services/portal/authService';
import { todayUtc, type QmsDoc } from './data';
import { PeriodicReviewPanel, RecordPeriodicReview, REVIEW_WINDOW_DAYS, useRecordPeriodicReview } from './PeriodicReview';
import { EmptyState, ErrorState } from '../v2/dataConnect';
import { C2CToast, useToast } from '../v2/toast';
import { ControlledDocumentSetup, ControlledDocumentReason } from './ControlledDocumentDialogs';
import { ControlledDocumentWorkbench } from './ControlledDocumentWorkbench';
import { fetchQmsControlledCopy, reviseQmsDocument } from './qmsDocuments';
import { downloadBlob } from '../v2/download';
import type { SopTemplate } from './data';
import { ControlledDocumentHistory } from './ControlledDocumentHistory';
import {useControlledDocumentTarget,ControlledDocumentTargetStatus} from './ControlledDocumentTarget';

import { PersonalTrainingReader } from './PersonalTrainingReader';
import { personalTrainingScope } from './qmsPersonalTraining';
import { TrainingCoverage, TrainingAssignmentsPanel, ApprovalTrainingReach } from './TrainingCoverage';
import { TrainingExpiry } from './TrainingExpiry';
import { SopRegisterRow, RegisterTable, REGISTER_COLUMNS, type RegisterRowActions } from './SopRegisterRow';
import { useQualityScope } from './registerContext';
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
  qmsIntent?:'read';
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
/** "8 controlled documents: 1 in force, 7 draft; none overdue for review." */
function registerSentence(total: number, inForce: number, inReview: number, draft: number, overdue: number | null): string {
  const parts = [
    inForce ? `${inForce} in force` : '',
    inReview ? `${inReview} in review` : '',
    draft ? `${draft} draft` : '',
  ].filter(Boolean);
  const head = `${total} controlled document${total === 1 ? '' : 's'}: ${parts.length ? parts.join(', ') : 'none in force'}`;
  if (overdue === null) return `${head}.`;
  return `${head}; ${overdue ? `${overdue} overdue for review` : 'none overdue for review'}.`;
}
/* Stable identities for an unread read, so memo deps do not churn. */
const NO_DOCS: QmsDoc[] = [];
const NO_REVIEW: ReturnType<typeof deriveReviewDue> = [];
const NO_TEMPLATES: NonNullable<ReturnType<typeof useSopTemplates>['templates']> = [];
const NO_TRAINING: NonNullable<ReturnType<typeof useTrainingCompliance>['rows']> = [];

export function SopRegister(props: SopRegisterProps) {
  const user = useAuthUser();
  return <SopRegisterSession key={`${user?.organizationId ?? ''}:${user?.id ?? ''}`} {...props} />;
}
function SopRegisterSession({ onAsk, filter, onFilterChange, onNavigate, onEditorOpenChange, qmsDocumentId, qmsIntent, qmsTargetRequest }: SopRegisterProps) {
  const reg = useSopRegister();
  /* An empty register scoped to the open project says the project has none (C14), not that none exist. */
  const scope = useQualityScope();
  const tpl = useSopTemplates();
  const rev = useReviewDue(REVIEW_WINDOW_DAYS);
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
  /* The review schedule as read, or none: a failed schedule read is not replaced by a derivation (C2). The
     register's own overdue count may still derive from the register when the schedule is unread. */
  /* In a project's scope the register is its documents, so the schedule (read for the whole organisation, the
     route has no project) is filtered to them: the SOP tab is the project's documents and their review (C14). */
  const scopedIds = React.useMemo(() => (scope.programId && reg.docs ? new Set(reg.docs.map((d) => d.id)) : null), [scope.programId, reg.docs]);
  /* Scoped, with the project's documents not yet read, the schedule is unread too: never the organisation's rows under
     the project's heading (Quality review, 2026-11-10). */
  const reviewRows = React.useMemo(() => (!scope.programId ? rev.rows : rev.rows && scopedIds ? rev.rows.filter((r) => scopedIds.has(r.id)) : null),
    [scope.programId, rev.rows, scopedIds]);
  const reviewDue = reviewRows ?? NO_REVIEW;
  /* The overdue count is the review schedule's; while that read is unread or failed the register says nothing about
     overdue (a derivation from the register left out a version in force under revision, review C2-1). */
  /* Live read-and-understood compliance (numerator = distinct current
     acknowledgments, denominator = org roster). */
  const trainComp = useTrainingCompliance();
  const training = trainComp.rows ?? NO_TRAINING;
  const user = useAuthUser(); // server resolves every signer and acknowledging actor
  const readerScope = `${user?.organizationId ?? ''}:${user?.id ?? ''}`;
  const [reading, setReading] = React.useState<{ documentId: number; scope: string; successor?: boolean } | null>(null);
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
  /** The last register action's outcome, in the server's words when it refused: a toast (C3), not a line in the table. */
  const [toast, fire] = useToast();
  /** The day an approval makes its version effective from (CAT2-19): today unless the approver chooses later. */
  const [effectiveFrom, setEffectiveFrom] = React.useState<string>(todayUtc());
  /** The controlled copy of the version in force (MR-12 Stage 8): issued, recorded and downloaded, or the server's reason. */
  const downloadControlledCopy = async (d: QmsDoc) => {
    try {
      const { blob, filename } = await fetchQmsControlledCopy(d.id);
      if (downloadBlob(filename, blob)) fire(`A controlled copy of ${d.docNumber} v${d.inForce?.version ?? d.version} was issued to you and recorded.`);
      else fire('The controlled copy was issued but this browser could not save it. Try again from another browser.', 'error');
    } catch (e) {
      fire(e instanceof Error ? e.message : 'The controlled copy could not be issued. Nothing was downloaded.', 'error');
    }
  };
  const [setup, setSetup] = React.useState<{ document?: QmsDoc; template?: SopTemplate; revision?: boolean } | null>(null);
  const [reviewing, setReviewing] = React.useState<QmsDoc | null>(null);
  /** The document whose training assignments are open (P-49). */
  const [assigning, setAssigning] = React.useState<QmsDoc | null>(null);
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
    // A training notice opens the reader, on the version approved for a later day when one waits (slice 4b).
    if(qmsIntent==='read'){target.clear();setReading({documentId:d.id,scope:readerScope,successor:true});return;}
    // A reviewer's or approver's notice opens the review route at their turn; the editor cannot sign. The route is
    // the register row's: the single-document read the notice resolves never carries it, so wait for the register.
    if(d.status==='in_review'){
      if(reg.docs==null&&!reg.error)return;
      const row=reg.docs?.find(x=>x.id===d.id);
      if(row&&myTurn(qmsRouteView(row),meId)){target.clear();setRoutePanel(row);return;}
    }
    // Anything else opens where its text lives, as every row's Open does.
    target.clear();openDocument(d);
  },[target.document,target.clear,editingId,qmsIntent,readerScope,meId,reg.docs,reg.error]);
  const targetStatus=<ControlledDocumentTargetStatus target={target} editing={editingId!==null} onRevise={d=>{target.clear();setSetup({document:d,revision:true});}} />;
  React.useEffect(() => { onEditorOpenChange?.(editingId !== null); }, [editingId, onEditorOpenChange]);
  /* Open a controlled document where its text lives. A document with an editing copy opens in the one editor. A
     legacy register entry has its text inline and no editing copy: a draft is set up (bound) first; past draft, its
     controlled text opens in the personal training reader, where that inline text is read. The editor has nothing to
     open for it and answered "no editing copy" with a Try again that could not help (C5, walked 2026-11-10). The
     reader keeps its own "Edit controlled text" for a governed writer of a document under review: that second edit
     path waits on a decision (the sweep's dialogs-3), and the reader's own drawer and title are C16. */
  const openDocument = (d: QmsDoc) => {
    if (d.authoringDocumentId) setEditingId(d.id);
    else if (d.status === 'draft') setSetup({ document: d });
    else openReader(d.id);
  };
  const openCreated = (id: number) => {
    setSetup(null);
    reg.refresh?.();
    setEditingId(id);
  };
  /* Each row's actions: the register's own handlers, unchanged (SopRegisterRow.tsx). */
  const rowActions: RegisterRowActions = {
    meId,
    canRead: (d) => personalTrainingScope(user, d.id) !== null,
    open: openDocument,
    read: openReader,
    assign: setAssigning,
    sendForReview: setReviewing,
    showRoute: setRoutePanel,
    approve: (d) => { setEffectiveFrom(todayUtc()); setApproving(d); },
    revise: (d) => (d.authoringDocumentId ? setRevising(d) : setSetup({ document: d, revision: true })),
    recordReview: recordReview.start,
    retire: setRetiring,
    controlledCopy: (d) => void downloadControlledCopy(d),
    history: setHistory,
    ask: onAsk,
  };
  const sent = (d: QmsDoc) => {
    fire(`${d.docNumber} was sent for review on its route. The people named are told when it is their turn.`);
    setReviewing(null);
    reg.refresh?.();
  };
  // In force includes an effective SOP whose next version is being drafted or reviewed.
  const effectiveCount = docs.filter((d) => d.status === 'effective' || d.inForce).length;
  const underReviewCount = docs.filter((d) => d.status === 'in_review').length;
  const draftCount = docs.filter((d) => d.status === 'draft').length;
  const overdueCount = reviewRows ? reviewRows.filter((r) => r.overdue).length : null;
  // The server's summary (P-49): the client computes no percentage.
  const coverage = coverageKpiOf(training, trainComp.summary ?? null);
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
  const reviewUnread = reviewRows == null;
  const reviewFailed = reviewUnread && rev.error != null;
  const trainUnread = trainComp.rows == null && training.length === 0;
  const trainFailed = trainUnread && trainComp.error != null;
  /* A register that was read and holds nothing. "None in review" and "Review
     overdue 0 — All current" were true of the empty set only vacuously, and
     read as a compliant register to a QA lead on a new tenant (launch sweep
     finding 112, the clause the HS-1 fix above left standing). */
  const registerEmpty = !regUnread && docs.length === 0;

  /* The register's figures, one sentence (D7-B; D5 §WA rule 7). The same
     reads the four tiles used, each with its unread arm: an unread register
     states no count, an empty one states nothing (one quiet line in the rows),
     and an overdue count is said only of documents that exist. */
  const figures = regUnread || registerEmpty ? null
    : registerSentence(docs.length, effectiveCount, underReviewCount, draftCount, overdueCount);
  /* Acknowledgement coverage: the server's average, or why there is none — never 0%. */
  const coverageFigure = trainUnread || training.length === 0 ? null
    : coverage.pct === null ? `${coverage.sub}.`
      : `Coverage ${coverage.pct}%: ${coverage.sub.charAt(0).toLowerCase()}${coverage.sub.slice(1)}.`;

  const visible = docs.filter((d) => filter === 'all' || d.status === filter);

  if (editingId !== null) return <>{targetStatus}<ControlledDocumentWorkbench documentId={editingId}
    onBack={() => { setEditingId(null); reg.refresh?.(); rev.refresh?.(); trainComp.refresh?.(); }}
    onNavigate={onNavigate ?? (() => undefined)}
    onReadText={() => { const id = editingId; if (id === null) return; setEditingId(null); openReader(id); }} /></>;

  return (
    <>
      {targetStatus}
      {/* ── The register (D7-B): one section, its figures one sentence, its one create.
          The workstream head, the four tiles and the nine document-type cards went
          on 2026-11-06: the figures are the sentence below, each with its unread arm,
          and the document types are the template field of "New controlled document"
          (RULE 4: a document type is data). ── */}
      <section className="pj-sec" aria-labelledby="qms-register-h">
        <div className="pj-sec-h">
          <h2 id="qms-register-h">Controlled documents</h2>
          <div className="pj-sec-acts">
            <div className="seg" role="group" aria-label="Status">
              {STATUS_FILTERS.map((f) => (
                <button key={f.id} type="button" className="seg-b" aria-pressed={filter === f.id} onClick={() => onFilterChange(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn primary small"
              disabled={templates.length === 0}
              title={templates.length === 0 ? (tpl.error ? 'The Quality system library could not be read' : 'Loading the Quality system library…') : undefined}
              onClick={() => setSetup({})}
            >
              New controlled document
            </button>
          </div>
        </div>
        {/* The register's sentence is the line under its head (C18a): inside it, it crowded the title and the actions. */}
        {figures && <p className="sec-sub" data-testid="qms-register-figures">{figures}</p>}

        {regFailed && (
          <ErrorState
            title="The controlled-document register could not be read"
            message={reg.error}
            retry={reg.refresh}
            read={reg.failure}
            readWhat="the controlled-document register"
            testId="sop-register-failed"
          />
        )}
        {/* The library a new document is built from: why "New controlled document" waits, said once (C4). */}
        {tpl.templates == null && tpl.error && (
          <EmptyState tone="error" title="The Quality system library could not be read" hint={tpl.error}
            retry={tpl.refresh} read={tpl.failure} readWhat="the Quality system library" testId="sop-templates-failed" />
        )}
        {regUnread && !regFailed && <EmptyState title="Loading the register…" busy />}
        {!regUnread && visible.length === 0 && (
          <EmptyState title={filter !== 'all' ? 'No documents with this status.'
            : scope.programId ? `No controlled document was authored in ${scope.projectName}.` : 'No controlled documents in the register yet.'}
            hint={filter === 'all' && scope.programId ? "The organisation's other controlled documents are under Show the whole organisation." : undefined} />
        )}
        {visible.length > 0 && (
          <RegisterTable columns={REGISTER_COLUMNS}>
            {visible.map((d) => <SopRegisterRow key={d.id} doc={d} actions={rowActions} />)}
          </RegisterTable>
        )}
      </section>

      {/* ── Periodic review, training, expiry: one column of quiet sections (C1). ── */}
      <PeriodicReviewPanel rows={reviewDue} unread={reviewUnread} failed={reviewFailed} error={rev.error} read={rev.failure}
        retry={() => { rev.refresh?.(); }} registerEmpty={registerEmpty} scopeName={scope.programId ? scope.projectName : null}
        canOpen={(id) => docs.some((x) => x.id === id) || (regUnread && canOpen(id))}
        onOpen={(id) => { const d = docs.find((x) => x.id === id); if (d) openDocument(d); else openReader(id); }} onRecord={recordReview.start} />

      <TrainingCoverage rows={training} unread={trainUnread} failed={trainFailed} error={trainComp.error} read={trainComp.failure}
        refresh={trainComp.refresh} figure={coverageFigure} organisationWide={scope.programId !== null}
        canOpen={canOpen} onOpen={openReader} />
      <TrainingExpiry assignment={trainComp.summary ? { assigned: trainComp.summary.assigned, noActiveAssignees: trainComp.summary.noActiveAssignees }
        : trainUnread && !trainFailed ? 'reading' : null} />
      <C2CToast msg={toast} />
      {history && <ControlledDocumentHistory document={history} onClose={() => setHistory(null)} />}
      {assigning && <TrainingAssignmentsPanel doc={assigning} onClose={() => { setAssigning(null); trainComp.refresh(); }} />}
      {setup && <ControlledDocumentSetup document={setup.document} template={setup.template} templates={templates} revision={setup.revision}
        onClose={() => setSetup(null)} onCreated={openCreated} onNavigate={onNavigate} />}
      {reviewing && <QmsRouteForm doc={reviewing} mode="send" onClose={() => setReviewing(null)} onSent={() => sent(reviewing)} />}
      {routePanel && <QmsRoutePanel doc={routePanel} view={qmsRouteView(docs.find((x) => x.id === routePanel.id) ?? routePanel)} meId={meId} admin={admin}
        signer={esignSignerOf(user as Parameters<typeof esignSignerOf>[0])} onClose={() => setRoutePanel(null)} onChanged={() => reg.refresh?.()}
        onApprove={() => { setEffectiveFrom(todayUtc()); setApproving(routePanel); setRoutePanel(null); }} />}
      {revising && <ControlledDocumentReason title="Create controlled revision" action="Create revision"
        description={`Create a new draft of ${revising.docNumber} ${revising.title} v${revising.version}. The previous controlled editing copy stays read-only and recorded signed versions remain in the history.`}
        onClose={() => setRevising(null)} onSubmit={async reason => {
          const row = await reviseQmsDocument(revising.id, reason);
          setRevising(null); reg.refresh?.(); setEditingId(row.id);
        }} />}
      {reading && reading.scope === readerScope && (
        <PersonalTrainingReader key={`${readerScope}:${reading.documentId}`} documentId={reading.documentId} startOnSuccessor={reading.successor} onClose={() => setReading(null)} onAcknowledged={() => { trainComp.refresh(); reg.refresh(); }} />
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
          targetMeta={qmsApprovalMeta(approving.version, approving.reviewRoute ? approvalShare(approving.reviewRoute, meId) : null)}
          defaultMeaning="approval"
          meanings={['approval']}
          signer={esignSignerOf(user as Parameters<typeof esignSignerOf>[0])}
          renderMeaningDetails={(_meaning, committing) => (<>
            <label className="qms-effective-date">
              Effective from (UTC day)
              <input type="date" value={effectiveFrom} min={todayUtc()} disabled={committing} required
                onChange={(e) => setEffectiveFrom(e.target.value)} aria-describedby="qms-effective-date-help" />
              <span id="qms-effective-date-help">Signed with the approval. A later day leaves the version in force until then.</span>
            </label>
            <ApprovalTrainingReach documentId={approving.id} effectiveFrom={effectiveFrom || todayUtc()} today={todayUtc()} />
          </>)}
          onClose={() => setApproving(null)}
          onSign={async (input) => {
            const manifest = await postQmsApproval({ kind: 'document', id: approving.id }, input, effectiveFrom || todayUtc());
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
          defaultMeaning="retirement"
          meanings={['retirement']}
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
