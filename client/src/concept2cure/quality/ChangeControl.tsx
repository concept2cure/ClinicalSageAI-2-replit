/**
 * ChangeControl — the change-control register, lifecycle flowchart, and the
 * links that tie every change to its deviations, CAPAs and validation records.
 *
 * The four things the Quality & Assurance brief asks for, on one surface:
 *   1. Train employees in how to raise change requests (the "How to raise a
 *      change" panel — AnA-first).
 *   2. Draft the change-control documents and forms we provide (the change
 *      forms gallery — the server library's change-control entries, each
 *      created as a controlled draft and opened in the controlled-text editor).
 *   3. Monitor the change-control log aligned to ICH Q10 / Annex 15 (the
 *      register + lifecycle flowchart).
 *   4. Link every change to deviations, CAPAs and validation documents (the
 *      per-change cross-reference panel).
 *
 * The log's controls write through the QMS routes (qmsWrites.ts): "Raise change
 * request" (POST /changes), "Advance" (POST /changes/:id/transition, with a
 * reason, over the moves the server lists for the row), "Link a record"
 * (POST /changes/:id/links). Until 2026-10-17 each handed AnA a sentence and
 * wrote nothing (audit 2026-10-17). AnA keeps the questions — the health
 * check, the per-change summary, the procedure explanation — and their buttons
 * say so.
 *
 * Approval is the exception, because it is an electronic signature and AnA
 * cannot sign: a chat turn cannot collect a password. A change under assessment
 * carries an Approve button that opens the shared EsignModal and posts to
 * POST /api/mdx/qms/changes/:id/approve. Until 2026-09-25 "Advance" asked AnA to
 * "capture the reason and e-signature", and the tool approved with segregation
 * of duties as its only check (security review 2026-09-24, DP-31; plan P1-28).
 *
 * @module client/src/concept2cure/quality/ChangeControl
 */

import * as React from 'react';
import { I } from '../v2/icons';
import { ChangeRecordDetail, ChangeRecordFacts, changeRecordRows } from './ChangeRecordDetail';
import { RegisterBody, RegisterTable } from './SopRegisterRow';
import { ChangeFlow } from './ChangeFlow';
import {
  CHANGE_FORM_TEMPLATE_KEYS,
  STATE_LABEL,
  STATE_TONE,
  CHANGE_TYPE_LABEL,
  CLASSIFICATION_LABEL,
  CLASSIFICATION_TONE,
  RISK_LABEL,
  ASSESSABLE_STATES,
  deriveStageCounts,
  isImplementationOverdue,
  formatDate,
  type ChangeState,
  /* The row type shares this component's name; the alias keeps both usable. */
  type ChangeControl as ChangeControlRow,
} from './changeData';
import { useChangeSummary } from './changeHooks';
import { EmptyState, ErrorState, readRefusalWords, type FailedRead } from '../v2/dataConnect';
import { C2CToast, useToast } from '../v2/toast';
import { EsignModal, esignSignerOf } from '../_shared/components/EsignModal';
import { useAuthUser } from '@/services/portal/authService';
import { postQmsApproval, verifyLearningReviewHash, type LearningReviewView } from './qmsApproval';
import { stableStringify } from '@shared/canonical-json';
import { C2CForm } from '../v2/C2CForm';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { useSopTemplates } from './hooks';
import { NewControlledDocumentForm } from './NewControlledDocumentForm';
import { ControlledDocumentWorkbench } from './ControlledDocumentWorkbench';
import { createQmsChange, transitionQmsChange, linkQmsChange, updateQmsChange } from './qmsWrites';
import { ChangeLinkForm } from './ChangeLinkForm';
import { shellProgramId, useShellProject, type ShellProject } from '../v2/shellProject';
import type { ChangeType, Classification, Relationship, RiskLevel } from './changeData';
import { apiRequest } from '@/lib/queryClient';
import { useAuthoringReadSession } from '../v2/editor/authoringCurrentRead';

export interface ChangeControlProps {
  /** Forward a prompt to the host's AnA conversation surface. */
  onAsk: (q: string) => void;
  /** Stage filter (owned by QualityApp — AnA's filter action drives the same value). */
  stage: ChangeState | 'all';
  /** Select a stage — the same setter the flowchart nodes and the clear-filter link share. */
  onStageChange: (s: ChangeState | 'all') => void;
  /** Expanded change row id, or null when none is open. */
  openId: number | null;
  /** Toggle a row's linked-records panel. */
  onOpenIdChange: (id: number | null) => void;
  /** The change register as QualityApp read it — the tenant's rows, or none. */
  changes: ChangeControlRow[];
  /** True while the register read is in flight. */
  loading: boolean;
  /** The register read's error, when it failed. A failed read is not an empty log. */
  error?: string | null;
  /** The log's failed read: a refusal is said as itself, with no retry (C4). */
  failure?: FailedRead;
  /** Re-run the register read. */
  onRetry?: () => void;
  onNavigate?: (target: string) => void;
  onEditorOpenChange?: (open: boolean) => void;
}

/** The change log's columns, in order (C8: D0's .reg-tbl, as the SOP register; the row's actions follow them). */
const CHANGE_COLUMNS = ['Number', 'Title', 'Type', 'Class', 'Status', 'Target', 'Links'] as const;
/** A D0 chip of the given tone; no tone is the neutral chip. */
const chip = (tone: string | null) => `rd-chip${tone ? ` tone-${tone}` : ''}`;


const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const optionsOf = <K extends string>(labels: Record<K, string>) =>
  (Object.keys(labels) as K[]).map((k) => ({ value: k, label: labels[k] }));
/** The moves a row may take here: the server's list, less approval (the signed route). */
const unsignedMovesOf = (c: ChangeControlRow): Exclude<ChangeState, 'approved'>[] =>
  (c.nextStates ?? []).filter((s): s is Exclude<ChangeState, 'approved'> => s !== 'approved');

/** The open project as the change form names it. */
const projectName = (p: ShellProject | null) => (p?.code && p.title ? `${p.code} · ${p.title}` : p?.title ?? 'The open project');

export function ChangeControl(props: ChangeControlProps) {
  const user = useAuthUser();
  return <ChangeControlSession key={`${user?.organizationId ?? ''}:${user?.id ?? ''}`} {...props} />;
}

function ChangeControlSession({
  onAsk,
  stage,
  onStageChange,
  openId,
  onOpenIdChange,
  changes,
  loading,
  error,
  failure,
  onRetry,
  onNavigate,
  onEditorOpenChange,
}: ChangeControlProps) {
  const sum = useChangeSummary();
  const user = useAuthUser(); // display, and who proposed a change; the server resolves the signer and refuses the proposer
  const meId = user?.id && /^\d+$/.test(String(user.id)) ? Number(user.id) : null;
  /* P-60: a change may be filed under the open project, which that project's
     Engineering screen reads; the server admits it before writing. */
  const shell = useShellProject();
  const openProgram = shellProgramId(shell);
  /** The change being approved, while the signature dialog is open. */
  const [approving, setApproving] = React.useState<ChangeControlRow | null>(null);
  const learningReview = approving?.learningReview ?? null;
  const [learningAccepted, setLearningAccepted] = React.useState(false);
  const [checkedLearning, setCheckedLearning] = React.useState<LearningReviewView | null>(null);
  React.useEffect(() => {
    let active = true; setLearningAccepted(false); setCheckedLearning(null);
    if (learningReview && !('unavailable' in learningReview)) void verifyLearningReviewHash(learningReview)
      .then(valid => { if (active && valid) setCheckedLearning(learningReview); }).catch(() => undefined);
    return () => { active = false; };
  }, [learningReview]);
  /* The approval signs the content the dialog shows, by its digest; a row that carries none is not signed. */
  const unreadContent = approving && !approving.contentDigest
    ? 'This change\'s content could not be read for signing. Reload the change log, then approve.' : null;
  const learningRefusal = unreadContent ?? (!learningReview ? null : 'unavailable' in learningReview || checkedLearning !== learningReview
    ? 'The exact aggregate artifact could not be verified. Reload this change before signing.'
    : !learningAccepted ? 'Review the exact artifact and explicitly confirm the no-client-content invariant before signing.' : null);
  /** The open write drawer, if any: raise, advance a row, or link to a row. */
  const [drawer, setDrawer] = React.useState<
    | { kind: 'raise' }
    | { kind: 'advance'; change: ChangeControlRow }
    | { kind: 'link'; change: ChangeControlRow }
    | { kind: 'assess'; change: ChangeControlRow }
    | { kind: 'document'; templateKey: string }
    | null
  >(null);
  /** The server's refusal of the open drawer's write, shown in the drawer. */
  const [refusal, setRefusal] = React.useState<string | null>(null);
  /** The last write's outcome, shown above the log. */
  /* A write's outcome is a toast (C3), not a line inside the log's table. */
  const [toast, fire] = useToast();
  /** The real bound editing copy created from the gallery. */
  const [editingId, setEditingId] = React.useState<number | null>(null);
  React.useEffect(() => {
    onEditorOpenChange?.(editingId !== null);
    return () => onEditorOpenChange?.(false);
  }, [editingId, onEditorOpenChange]);
  const writing = React.useRef(false);
  const tpl = useSopTemplates();
  const allTemplates = tpl.templates ?? [];
  const changeForms = allTemplates.filter((t) => CHANGE_FORM_TEMPLATE_KEYS.includes(t.key));
  const openDrawer = (d: NonNullable<typeof drawer>) => { setRefusal(null); setDrawer(d); };
  /** Run a drawer's write: close and report on success, keep the drawer and its
      values with the server's sentence on refusal. */
  const runWrite = async (write: () => Promise<string>, after?: () => void) => {
    if (writing.current) return;
    writing.current = true;
    setRefusal(null);
    try {
      const text = await write();
      setDrawer(null);
      fire(text);
      onRetry?.(); sum.refresh?.();
      after?.();
    } catch (err) {
      setRefusal(`Not recorded — ${errText(err)}`);
    } finally {
      writing.current = false;
    }
  };

  /* The register read lives in QualityApp, lifted because AnA's open-change
     action resolves free-text names against the same rows this log renders,
     and a handler can only read state its own component holds. */
  const summary = sum.summary;
  const counts = React.useMemo(() => deriveStageCounts(changes), [changes]);

  const visible = changes.filter((c) => stage === 'all' || c.status === stage);
  /* Until 2026-09-25 a failed read rendered "No changes at this stage." under
     a flowchart of zeroes, while the KPI strip above said the totals were
     unavailable (HS-1, docs/evidence/reviews/2026-09-24/lenses.md). A resolved
     list that is non-empty is live; an empty one with an error, or still
     loading, is unread and may not render a count. */
  const failed = changes.length === 0 && error != null;
  const unread = failed || (changes.length === 0 && loading);

  if (editingId !== null) return <ControlledDocumentWorkbench documentId={editingId}
    onBack={() => { setEditingId(null); onRetry?.(); sum.refresh?.(); }}
    onNavigate={onNavigate ?? (() => undefined)} />;

  return (
    <>
      {/* ── The change log (D7-B): one section. Its figures are one line, its stage filter
          one .seg ("All" is the clear), its one create "Raise change request". The tab's
          own title, "Ask AnA for a health check" (now the read-out starter, same asks,
          ranked by risk) and its four tiles went on 2026-11-06; the lifecycle's box of
          six count tiles and the separate "Change-control lifecycle" section on
          2026-11-10. An unread summary states no count: a row of zeroes would be a claim
          about the register, not an absence of information about it. ── */}
      <section className="pj-sec qms-sec" aria-labelledby="qcc-log-h">
        <div className="pj-sec-h">
          <h2 id="qcc-log-h">Change control log</h2>
          {/* An empty log is said once, by its empty state below: "none overdue" of nothing is only vacuously true
              (finding 112), and the figure line repeating "No changes in the log yet." said it twice (C3). */}
          {/* Nothing here while the log's own panel reports its failure: said once (review C4-1). */}
          {!(summary && summary.total === 0) && !failed && <span className="sec-sub" data-testid={summary === null ? 'change-summary-absent' : 'change-figures'}>
            {summary === null ? (sum.error ? (readRefusalWords(sum.failure, 'the change-log summary')?.message ?? 'The change-log totals could not be read.')
              : 'Change-log totals appear once the change register loads.') : <>
              {summary.open} open of {summary.total} in the log; {summary.awaitingApproval || 'none'} awaiting approval;{' '}
              {summary.inImplementation || 'none'} in implementation{summary.awaitingVerification ? ` (${summary.awaitingVerification} awaiting verification)` : ''};{' '}
              {summary.overdueImplementation ? <span data-tone="err">{summary.overdueImplementation} overdue</span> : 'none overdue'}.
            </>}
          </span>}
          <div className="pj-sec-acts">
            {/* a2f9264a5: a curator prepares reviewed learning from the open project (moved here from the retired head). */}
            <ReviewedLearningPreparation key={openProgram ?? 'no-project'} programId={openProgram}
              onCreated={id => { setEditingId(id); onRetry?.(); sum.refresh?.(); }} />
            <button type="button" className="btn primary small" onClick={() => openDrawer({ kind: 'raise' })}>
              Raise change request
            </button>
          </div>
        </div>
        {/* The stage filter, with counts, once the log has been read and holds changes: an unread log
            shows no zeroes, and an empty one has nothing to filter. */}
        {!unread && changes.length > 0 && <ChangeFlow counts={counts} activeStage={stage} onSelectStage={onStageChange} />}

        {failed && (
          <ErrorState
            title="The change log could not be read"
            message={error}
            retry={() => { onRetry?.(); sum.refresh?.(); }}
            read={failure}
            readWhat="the change log"
            testId="change-log-failed"
          />
        )}
        {unread && !failed && <EmptyState title="Loading the change log…" busy />}
        {!unread && visible.length === 0 && (
          <EmptyState title={changes.length === 0 ? 'No changes in the log yet.' : 'No changes at this stage.'} />
        )}
        {visible.length > 0 && (
          <RegisterTable columns={CHANGE_COLUMNS}>
            {visible.map((c) => {
              const overdue = isImplementationOverdue(c);
              const open = openId === c.id;
              const linkCount = c.links?.length ?? 0;
              const toggle = () => onOpenIdChange(open ? null : c.id);
              /* The row's one next step (C8): Approve while the change is under assessment, the signed route; otherwise
                 Advance, when the server lists a move. Everything else is behind More, with the same handlers. */
              const advance = unsignedMovesOf(c).length > 0 ? (
                <button key="advance" type="button" className="btn ghost small"
                  title="Move this change to its next lifecycle state, with a reason for the move"
                  onClick={() => openDrawer({ kind: 'advance', change: c })}>
                  Advance
                </button>
              ) : null;
              /* Approve is offered to anyone but the change's proposer, whose approval the server refuses (the two-person
                 rule, change-approval-signature.ts), as the SOP register offers it to anyone but a document's author. */
              const approvable = c.proposedBy == null || meId == null || c.proposedBy !== meId;
              const approve = c.status === 'under_assessment' && approvable ? (
                <button key="approve" type="button" className="btn ghost small"
                  title="Approve with your electronic signature (password and second factor). The person who proposed the change cannot approve it."
                  onClick={() => setApproving(c)}>
                  Approve
                </button>
              ) : null;
              const rest = [
                ...(approve && advance ? [advance] : []),
                ...(ASSESSABLE_STATES.includes(c.status) ? [
                  <button key="assess" type="button" className="btn ghost small"
                    title="Record the risk, impact assessment and implementation plan. They can be edited until the change is approved."
                    onClick={() => openDrawer({ kind: 'assess', change: c })}>
                    Edit assessment
                  </button>,
                ] : []),
                <button key="link" type="button" className="btn ghost small"
                  title="Link the deviation, CAPA or validation record this change touches"
                  onClick={() => openDrawer({ kind: 'link', change: c })}>
                  Link a record
                </button>,
                <button key="ask" type="button" className="btn ghost small" aria-label="Ask AnA about this change"
                  title="Ask AnA about this change"
                  onClick={() => onAsk(`Summarize change ${c.changeNumber} ${c.title}: its impact assessment, linked records, and what it needs next.`)}>
                  Ask AnA
                </button>,
              ];
              return (
                <RegisterBody key={c.id} name={c.changeNumber} className="qcc-change" status={c.status}
                  columns={CHANGE_COLUMNS.length} primary={approve ?? advance} rest={rest} cells={<>
                    <td>
                      <button type="button" className="qms-num mono" onClick={toggle} aria-expanded={open} title="Read the change: its assessment and linked records">
                        {c.changeNumber}
                      </button>
                    </td>
                    <td className="qms-title">{c.title}</td>
                    <td>{CHANGE_TYPE_LABEL[c.changeType] ?? c.changeType}</td>
                    <td><span className={chip(CLASSIFICATION_TONE[c.classification])}>{CLASSIFICATION_LABEL[c.classification]}</span></td>
                    <td><span className={chip(STATE_TONE[c.status])}>{STATE_LABEL[c.status]}</span></td>
                    <td>
                      {c.targetImplementationDate ? <>
                        {formatDate(c.targetImplementationDate)}
                        {overdue && <> <span className="rd-chip tone-err">Overdue</span></>}
                      </> : '—'}
                    </td>
                    <td>
                      <button type="button" className="qcc-linkcount" onClick={toggle} aria-expanded={open}
                        aria-label={`${linkCount} linked record${linkCount === 1 ? '' : 's'}`} title="Read the change: its assessment and linked records">
                        {I.link} {linkCount}
                      </button>
                    </td>
                  </>}
                  after={open && (
                    <tr className="qcc-detail-tr">
                      <td colSpan={CHANGE_COLUMNS.length + 1}>
                        <ChangeRecordDetail change={c} onAsk={onAsk} />
                      </td>
                    </tr>
                  )}
                />
              );
            })}
          </RegisterTable>
        )}
        {/* How a change is raised: the procedure's five steps, closed by default (D5 §WA.4.2 rule 8). Until
            2026-11-10 a boxed guidance panel beside the forms, with an orange "Explain the procedure" and a
            "Find the controlled procedure"; the explanation is the tab's third starter, and the SOP register,
            where the procedure is read and acknowledged, is the tab beside this one. */}
        <details className="pj-more">
          <summary>How a change is raised</summary>
          <ol className="qcc-steps">
            <li>Describe the change: current state and proposed state.</li>
            <li>Give the reason, and classify it minor, major or critical.</li>
            <li>Assess impact on product, process, validation and filings.</li>
            <li>Link the deviations, CAPAs and validation records it touches.</li>
            <li>Route for independent approval, implement, then verify.</li>
          </ol>
        </details>
      </section>

      <section className="pj-sec qms-sec" aria-labelledby="qcc-forms-h">
        <div className="pj-sec-h">
          <h2 id="qcc-forms-h">Change-control documents and forms</h2>
          <span className="sec-sub">Created as controlled drafts in the SOP register</span>
        </div>
        <div className="qcc-forms">
            {tpl.templates == null && (tpl.error
              ? <EmptyState tone="error" title="The Quality system library could not be read" hint={tpl.error}
                  retry={tpl.refresh} read={tpl.failure} readWhat="the Quality system library" />
              : <EmptyState title="Loading the Quality system library…" busy />)}
          {/* Each opens "New controlled document" with its template (D7-B: a quiet
              button per form, not a card per document type). */}
          {changeForms.map((f) => (
            <button
              key={f.key}
              type="button"
              className="btn ghost small"
              title={`${f.description} Created as a draft with its standard change-control sections.`}
              onClick={() => openDrawer({ kind: 'document', templateKey: f.key })}
            >
              {f.numberPrefix ? `${f.label} (${f.numberPrefix})` : f.label}
            </button>
          ))}
        </div>
      </section>
      <C2CToast msg={toast} />
      {drawer?.kind === 'raise' && (
        <C2CForm
          config={{
            eyebrow: 'Change control',
            title: 'Raise change request',
            sub: 'The change is recorded as proposed. Assessment, independent approval (your electronic signature is not enough — a second person signs), implementation and verification follow.',
            governed: 'Raising a change writes an audit entry under your name.',
            submitLabel: 'Raise change',
            ...(refusal ? { notice: refusal } : {}),
            fields: [
              { key: 'changeNumber', label: 'Change number', type: 'text', required: true, half: true, placeholder: 'CC-2026-001', desc: 'Unique in your organisation.' },
              { key: 'targetImplementationDate', label: 'Target implementation date', type: 'date', half: true },
              { key: 'title', label: 'Title', type: 'text', required: true },
              { key: 'changeType', label: 'What is changing', type: 'select', half: true, options: optionsOf(CHANGE_TYPE_LABEL) },
              { key: 'classification', label: 'Classification', type: 'seg', half: true, options: optionsOf(CLASSIFICATION_LABEL) },
              { key: 'description', label: 'Current state → proposed state', type: 'textarea', rows: 3 },
              { key: 'reason', label: 'Reason for the change', type: 'textarea', rows: 3, required: true },
              { key: 'riskLevel', label: 'Risk', type: 'seg', options: [{ value: '', label: 'Not set' }, ...optionsOf(RISK_LABEL)] },
              { key: 'impactAssessment', label: 'Impact assessment', type: 'textarea', rows: 3, desc: 'Product, process, validation and filings. It can be completed until the change is approved.' },
              { key: 'implementationPlan', label: 'Implementation plan', type: 'textarea', rows: 3 },
              ...(openProgram ? [{ key: 'programId', label: 'Project', type: 'seg' as const, options: [{ value: '', label: 'Organisation-wide' }, { value: openProgram, label: projectName(shell) }],
                desc: "A change filed under the open project is shown on that project's Engineering screen." }] : []),
            ],
          }}
          onCancel={() => setDrawer(null)}
          onSubmit={(v) => void runWrite(async () => {
            const row = await createQmsChange({
              changeNumber: v.changeNumber.trim(), title: v.title.trim(), reason: v.reason.trim(),
              description: v.description.trim() || undefined,
              changeType: (v.changeType || undefined) as ChangeType | undefined,
              classification: (v.classification || undefined) as Classification | undefined,
              targetImplementationDate: v.targetImplementationDate || undefined,
              riskLevel: (v.riskLevel || undefined) as RiskLevel | undefined,
              impactAssessment: v.impactAssessment.trim() || undefined,
              implementationPlan: v.implementationPlan.trim() || undefined,
              programId: v.programId || undefined,
            });
            return `${row.change_number} was raised as a proposed change.`;
          })}
        />
      )}
      {drawer?.kind === 'advance' && (() => {
        const c = drawer.change;
        const moves = unsignedMovesOf(c);
        return (
          <C2CForm
            config={{
              eyebrow: 'Change control',
              title: `Advance ${c.changeNumber}`,
              sub: `Currently ${STATE_LABEL[c.status]}. ${c.nextStates?.includes('approved') ? 'Approval is not a move here: it is the Approve button, which takes the approver’s electronic signature.' : ''}`,
              governed: 'The move and its reason are written to the audit trail under your name.',
              submitLabel: 'Record the move',
              ...(refusal ? { notice: refusal } : {}),
              fields: [
                { key: 'to', label: 'Move to', type: 'select', required: true, options: moves.map((m) => ({ value: m, label: STATE_LABEL[m] })) },
                { key: 'reason', label: 'Reason for this move', type: 'textarea', rows: 3, required: true, desc: `At least ${GOVERNED_REASON_MIN} characters, recorded verbatim.` },
                ...(moves.includes('closed')
                  ? [{ key: 'effectivenessReview', label: 'Effectiveness review (recorded when the change is closed)', type: 'textarea' as const, rows: 3 }]
                  : []),
              ],
            }}
            onCancel={() => setDrawer(null)}
            onSubmit={(v) => {
              const reason = v.reason.trim();
              if (reason.length < GOVERNED_REASON_MIN) {
                setRefusal(`Not recorded — a reason for the move of at least ${GOVERNED_REASON_MIN} characters is required.`);
                return;
              }
              const to = v.to as Exclude<ChangeState, 'approved'>;
              void runWrite(async () => {
                await transitionQmsChange(c.id, {
                  to, reason, ...(to === 'closed' && v.effectivenessReview?.trim() ? { effectivenessReview: v.effectivenessReview.trim() } : {}),
                });
                return `${c.changeNumber} moved to ${STATE_LABEL[to]}.`;
              });
            }}
          />
        );
      })()}
      {drawer?.kind === 'assess' && (() => {
        const c = drawer.change;
        return (
          <C2CForm
            config={{
              eyebrow: 'Change control',
              title: `Assess ${c.changeNumber}`,
              sub: `${c.title}. The assessment can be edited while the change is proposed or under assessment. From approval on, it is what the approval signed.`,
              governed: 'Saving writes an audit entry under your name.',
              submitLabel: 'Save assessment',
              ...(refusal ? { notice: refusal } : {}),
              fields: [
                { key: 'riskLevel', label: 'Risk', type: 'seg', options: [{ value: '', label: 'Not set' }, ...optionsOf(RISK_LABEL)], default: c.riskLevel ?? '' },
                { key: 'impactAssessment', label: 'Impact assessment', type: 'textarea', rows: 5, default: c.impactAssessment ?? '', desc: 'Product, process, validation and filings.' },
                { key: 'implementationPlan', label: 'Implementation plan', type: 'textarea', rows: 5, default: c.implementationPlan ?? '' },
                { key: 'targetImplementationDate', label: 'Target implementation date', type: 'date', default: c.targetImplementationDate?.slice(0, 10) ?? '' },
              ],
            }}
            onCancel={() => setDrawer(null)}
            onSubmit={(v) => void runWrite(async () => {
              await updateQmsChange(c.id, {
                riskLevel: (v.riskLevel || null) as RiskLevel | null,
                impactAssessment: v.impactAssessment.trim() || null,
                implementationPlan: v.implementationPlan.trim() || null,
                targetImplementationDate: v.targetImplementationDate || null,
              });
              return `The assessment of ${c.changeNumber} was saved.`;
            })}
          />
        );
      })()}
      {drawer?.kind === 'link' && (
        <ChangeLinkForm
          changeNumber={drawer.change.changeNumber}
          refusal={refusal}
          onCancel={() => setDrawer(null)}
          onSubmit={(v) => {
            const c = drawer.change;
            void runWrite(async () => {
              await linkQmsChange(c.id, { ...v, relationship: v.relationship as Relationship | undefined });
              return `${v.linkedRef} was linked to ${c.changeNumber}.`;
            });
          }}
        />
      )}
      {drawer?.kind === 'document' && (
        <NewControlledDocumentForm
          templates={allTemplates}
          initialKey={drawer.templateKey}
          onCancel={() => setDrawer(null)}
          onNavigate={onNavigate}
          onCreated={(id) => {
            setDrawer(null);
            onRetry?.(); sum.refresh?.();
            setEditingId(id);
          }}
        />
      )}
      {approving && (
        <EsignModal
          open
          action="Approve change"
          target={`${approving.changeNumber} ${approving.title}`}
          targetMeta="Approves the change for implementation. The person who proposed it cannot approve it."
          defaultMeaning="approval"
          meanings={['approval']}
          signer={esignSignerOf(user as Parameters<typeof esignSignerOf>[0])}
          commitRefusal={learningRefusal}
          /* C9: the approver reads what the signature binds, before signing (change-approval-signature.ts
             computeQmsChangeContentDigest), and the manifest records it after. Until 2026-11-10 the dialog showed only
             the number and title. */
          renderMeaningDetails={(_meaning, committing) => <>
            <div className="qcc-sign-record" data-testid="change-approval-record">
              <p className="qcc-sign-lead">What you approve</p>
              <ChangeRecordFacts change={approving} />
            </div>
            {learningReview && !('unavailable' in learningReview) && <LearningInvariantReview
              review={learningReview} accepted={learningAccepted} disabled={committing || checkedLearning !== learningReview} onChange={setLearningAccepted} />}
          </>}
          signedRows={[
            { label: 'Classification', value: CLASSIFICATION_LABEL[approving.classification] },
            ...changeRecordRows(approving),
            { label: 'Target implementation date', value: approving.targetImplementationDate ? formatDate(approving.targetImplementationDate) : 'Not recorded yet.' },
          ]}
          onClose={() => setApproving(null)}
          onSign={async (input) => {
            if (learningRefusal) throw new Error(learningRefusal);
            const review = learningReview && !('unavailable' in learningReview)
              ? { expectedArtifactSha256: learningReview.artifactSha256, invariantAccepted: true as const } : undefined;
            const manifest = await postQmsApproval({ kind: 'change', id: approving.id }, input, undefined, review, approving.contentDigest ?? undefined);
            onRetry?.(); sum.refresh?.();
            return manifest;
          }}
        />
      )}
    </>
  );
}

/** Prepares an unsigned public template in the existing controlled-document editor. */
function ReviewedLearningPreparation(props: { programId: string | null; onCreated: (id: number) => void }) {
  const owner = useAuthoringReadSession(useAuthUser());
  return <ReviewedLearningPreparationSession key={`${owner.actor}:${owner.key}`} {...props} owner={owner} />;
}
function preparedLearningId(response: Response, body: any): number {
  const id = body?.learningContribution?.documentId;
  if (!response.ok || body?.audited !== true || !Number.isSafeInteger(id) || id < 1) throw new Error('UNCONFIRMED');
  return id;
}
function ReviewedLearningPreparationSession({ programId, onCreated, owner }: { programId: string | null; onCreated: (id: number) => void;
  owner: ReturnType<typeof useAuthoringReadSession> }) {
  const [canCurate, setCanCurate] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const live = React.useRef(true);
  const writing = React.useRef(false);
  React.useEffect(() => {
    live.current = true;
    void (async () => {
      try {
        const response = await apiRequest('GET', '/api/ai-placement-policy'), body = await response.json().catch(() => null);
        if (live.current && owner.sameRevision()) setCanCurate(response.ok && body?.learningContribution?.canCurate === true);
      } catch { /* No preparation control without current curator standing. */ }
    })();
    return () => { live.current = false; };
  }, [owner]);
  if (!canCurate) return null;
  return <>
    <button type="button" className="btn ghost small" disabled={!programId} onClick={() => { setError(null); setOpen(true); }}>
      Prepare reviewed learning
    </button>
    {open && <C2CForm config={{ title: 'Prepare reviewed learning', sub: 'Only server-defined generic guidance and coarse cohort counts are prepared. Document review and the exact-artifact invariant signature are separate approvals.', notice: error ?? undefined,
      fields: [
        { key: 'classKey', label: 'Pattern class', type: 'select', required: true, options: [
          { value: 'source_identity_check', label: 'Current source identity' }, { value: 'cross_section_consistency', label: 'Cross-section consistency' }, { value: 'independent_review', label: 'Independent review' }] },
        { key: 'agency', label: 'Agency group', type: 'select', required: true, options: ['fda', 'ema', 'pmda', 'mhra', 'hc', 'swissmedic', 'other'] },
        { key: 'documentType', label: 'Document group', type: 'select', required: true, options: ['protocol', 'ib', 'cmc', 'labeling', 'cer', 'response_letter', 'meeting_minutes', 'section', 'briefing_package', 'other'] },
        { key: 'reasonForChange', label: 'Reason for preparing this candidate', type: 'textarea', required: true, min: 8 },
        { key: 'password', label: 'Current password', type: 'password', required: true },
        { key: 'totp', label: 'Authenticator code, if required', type: 'password' },
      ], submitLabel: 'Prepare unsigned candidate',
    }} onCancel={() => setOpen(false)} onSubmit={async values => {
      if (!programId || !owner.sameRevision()) { setOpen(false); return; }
      if (writing.current) return;
      writing.current = true;
      setError(null);
      try {
        const response = await apiRequest('PUT', '/api/ai-placement-policy', { action: 'learning_prepare', programId,
          classKey: values.classKey, agency: values.agency, documentType: values.documentType, reasonForChange: values.reasonForChange,
          reauth: { password: values.password, ...(values.totp ? { totp: values.totp } : {}) } });
        const body = await response.json().catch(() => null);
        if (!live.current || !owner.sameRevision()) return;
        const id = preparedLearningId(response, body);
        setOpen(false); onCreated(id);
      } catch {
        if (live.current && owner.sameRevision()) setError('The candidate could not be prepared. Re-read its status before retrying.');
      } finally { writing.current = false; }
    }} />}
  </>;
}

function LearningInvariantReview({ review, accepted, disabled, onChange }: {
  review: LearningReviewView; accepted: boolean; disabled: boolean; onChange(value: boolean): void;
}) {
  return <div><p>{review.instructions}</p><pre aria-label="Exact aggregate artifact">{stableStringify(review.artifact)}</pre>
    <p>SHA-256 {review.artifactSha256}</p><label><input type="checkbox" checked={accepted} disabled={disabled}
      onChange={event => onChange(event.target.checked)} />No client facts, identity or strategy are encoded in this shared artifact.</label></div>;
}
