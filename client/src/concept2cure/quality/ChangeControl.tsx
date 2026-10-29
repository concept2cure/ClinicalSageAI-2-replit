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
import { registerRowMinWidth } from './registerGrid';
import { ChangeFlow } from './ChangeFlow';
import { Kpi } from './Kpi';
import {
  CHANGE_FORM_TEMPLATE_KEYS,
  STATE_LABEL,
  STATE_TONE,
  CHANGE_TYPE_LABEL,
  CLASSIFICATION_LABEL,
  CLASSIFICATION_TONE,
  LINK_TYPE_LABEL,
  LINK_TYPE_ICON,
  RELATIONSHIP_LABEL,
  deriveStageCounts,
  isImplementationOverdue,
  formatDate,
  type ChangeState,
  /* The row type shares this component's name; the alias keeps both usable. */
  type ChangeControl as ChangeControlRow,
} from './changeData';
import { useChangeSummary } from './changeHooks';
import { EmptyState, ErrorState } from '../v2/dataConnect';
import { EsignModal, esignSignerOf } from '../_shared/components/EsignModal';
import { useAuthUser } from '@/services/portal/authService';
import { postQmsApproval } from './qmsApproval';
import { C2CForm } from '../v2/C2CForm';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { useSopTemplates } from './hooks';
import { NewControlledDocumentForm } from './NewControlledDocumentForm';
import { ControlledDocumentWorkbench } from './ControlledDocumentWorkbench';
import { createQmsChange, transitionQmsChange, linkQmsChange } from './qmsWrites';
import type { ChangeType, Classification, LinkType, Relationship } from './changeData';

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
  /** Re-run the register read. */
  onRetry?: () => void;
  onNavigate?: (target: string) => void;
  onEditorOpenChange?: (open: boolean) => void;
}

const GRID = '112px minmax(0, 1fr) 118px 80px 128px 104px 62px 120px';
/* Derived, never hand-kept — see registerGrid.ts. Below this the title track
   resolves to 0px and the row's last columns are clipped away. */
const ROW_MIN = registerRowMinWidth(GRID);


const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const optionsOf = <K extends string>(labels: Record<K, string>) =>
  (Object.keys(labels) as K[]).map((k) => ({ value: k, label: labels[k] }));
/** The moves a row may take here: the server's list, less approval (the signed route). */
const unsignedMovesOf = (c: ChangeControlRow): Exclude<ChangeState, 'approved'>[] =>
  (c.nextStates ?? []).filter((s): s is Exclude<ChangeState, 'approved'> => s !== 'approved');

/** Icon element for a link type (from the shared `I` set). */
function linkIcon(iconKey: string): React.ReactNode {
  return (I as Record<string, React.ReactNode>)[iconKey] ?? I.link;
}

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
  onRetry,
  onNavigate,
  onEditorOpenChange,
}: ChangeControlProps) {
  const sum = useChangeSummary();
  const user = useAuthUser(); // display only; the server resolves the signer
  /** The change being approved, while the signature dialog is open. */
  const [approving, setApproving] = React.useState<ChangeControlRow | null>(null);
  /** The open write drawer, if any: raise, advance a row, or link to a row. */
  const [drawer, setDrawer] = React.useState<
    | { kind: 'raise' }
    | { kind: 'advance'; change: ChangeControlRow }
    | { kind: 'link'; change: ChangeControlRow }
    | { kind: 'document'; templateKey: string }
    | null
  >(null);
  /** The server's refusal of the open drawer's write, shown in the drawer. */
  const [refusal, setRefusal] = React.useState<string | null>(null);
  /** The last write's outcome, shown above the log. */
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
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
      setNotice({ tone: 'ok', text });
      onRetry?.();
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
    onBack={() => { setEditingId(null); onRetry?.(); }}
    onNavigate={onNavigate ?? (() => undefined)} onAsk={onAsk} />;

  return (
    <>
      <div className="qms-head">
        <div>
          <div className="qms-eyebrow">Workstream</div>
          <h1 className="qms-h1">Change control</h1>
          <div className="qms-sub">
            Your change-control log, aligned to ICH Q10 change management and EU GMP Annex 15. Raise a
            change request, assess its impact and risk, route it for independent approval, implement and
            verify effectiveness — and link every change to the deviations, CAPAs and validation documents
            it touches.
          </div>
        </div>
        <div className="qms-actions">
          <button
            className="qms-btn ghost"
            title="Sends this request to AnA; nothing in the log changes"
            onClick={() =>
              onAsk(
                'Run a change-control health check — show every change overdue for implementation, every one ' +
                  'awaiting approval, and any linked deviation or CAPA that is still open, ranked by risk.',
              )
            }
          >
            {I.sparkles} Ask AnA for a health check
          </button>
          <button
            className="qms-btn primary"
            onClick={() => openDrawer({ kind: 'raise' })}
          >
            {I.plus} Raise change request
          </button>
        </div>
      </div>

      {/* The KPI row is derived entirely from `summary`, so with no summary
          there is nothing to count. An unread summary is null rather than a
          zero-filled shell precisely so this decision has to be made here: a
          row of zeroes is a claim about the register ("no open changes"), not
          an absence of information about it. */}
      {summary === null ? (
        <div className="qms-kpis">
          <EmptyState
            title="Change-log totals are unavailable"
            hint="The counts appear once the change register loads."
            regulation="Serves the change-control record (ICH Q10)"
            testId="change-summary-absent"
          />
        </div>
      ) : (
      <div className="qms-kpis">
        <Kpi label="Open changes" val={String(summary.open)} sub={`${summary.total} in the log`} />
        <Kpi
          label="Awaiting approval"
          val={String(summary.awaitingApproval)}
          sub={summary.awaitingApproval ? 'In impact assessment' : 'None in assessment'}
          tone={summary.awaitingApproval ? 'warn' : 'ok'}
        />
        <Kpi
          label="In implementation"
          val={String(summary.inImplementation)}
          sub={summary.awaitingVerification ? `${summary.awaitingVerification} awaiting verification` : 'Being executed'}
        />
        <Kpi
          label="Overdue"
          val={String(summary.overdueImplementation)}
          sub={summary.overdueImplementation ? 'Past target date' : 'All on schedule'}
          tone={summary.overdueImplementation ? 'err' : 'ok'}
        />
      </div>
      )}

      {/* ── Lifecycle flowchart ── */}
      <section className="qms-sec">
        <div className="qms-sec-head">
          <h2>Change-control lifecycle</h2>
          <span className="meta">Every change, and where it sits right now</span>
          {stage !== 'all' && (
            <>
              <span className="spacer" />
              <button className="qms-link" onClick={() => onStageChange('all')}>
                {I.close} Clear filter · {STATE_LABEL[stage as ChangeState] ?? stage}
              </button>
            </>
          )}
        </div>
        {unread ? (
          <div className="qms-empty" role="status">
            {failed ? 'Stage counts appear once the change log can be read.' : 'Loading the change log…'}
          </div>
        ) : (
          <ChangeFlow counts={counts} activeStage={stage} onSelectStage={onStageChange} onAsk={onAsk} />
        )}
      </section>

      {/* ── Register / log ── */}
      <section className="qms-sec">
        <div className="qms-sec-head">
          <h2>Change control log</h2>
          {!unread && (
            <span className="meta">
              {visible.length} {visible.length === 1 ? 'change' : 'changes'}
              {stage !== 'all' ? ` · ${STATE_LABEL[stage as ChangeState] ?? stage}` : ''}
            </span>
          )}
        </div>

        <div className="qms-table">
          <div className="qms-thead" style={{ gridTemplateColumns: GRID, minWidth: ROW_MIN }}>
            <div>Number</div>
            <div>Title</div>
            <div>Type</div>
            <div>Class</div>
            <div>Status</div>
            <div>Target</div>
            <div>Links</div>
            <div />
          </div>
          {notice && (
            <div className="qms-empty" role={notice.tone === 'err' ? 'alert' : 'status'} data-tone={notice.tone}>
              {notice.text}
            </div>
          )}
          {failed && (
            <ErrorState
              title="The change log could not be read"
              message={error}
              retry={onRetry}
              testId="change-log-failed"
            />
          )}
          {unread && !failed && (
            <div className="qms-empty" role="status">Loading the change log…</div>
          )}
          {!unread && visible.length === 0 && <div className="qms-empty">No changes at this stage.</div>}
          {visible.map((c) => {
            const overdue = isImplementationOverdue(c);
            const open = openId === c.id;
            const linkCount = c.links?.length ?? 0;
            return (
              <React.Fragment key={c.id}>
                <div className="qms-row" style={{ gridTemplateColumns: GRID, minWidth: ROW_MIN }} data-status={c.status}>
                  <button
                    className="qms-cell qms-num mono"
                    onClick={() => onOpenIdChange(open ? null : c.id)}
                    aria-expanded={open}
                    title="Show linked records"
                  >
                    {c.changeNumber}
                  </button>
                  <div className="qms-cell qms-title" title={c.title}>{c.title}</div>
                  <div className="qms-cell">
                    <span className="qms-tag">{CHANGE_TYPE_LABEL[c.changeType] ?? c.changeType}</span>
                  </div>
                  <div className="qms-cell">
                    <span className="qcc-class" data-tone={CLASSIFICATION_TONE[c.classification]}>
                      {CLASSIFICATION_LABEL[c.classification]}
                    </span>
                  </div>
                  <div className="qms-cell">
                    <span className="qms-pill" data-tone={STATE_TONE[c.status]}>{STATE_LABEL[c.status]}</span>
                  </div>
                  <div className="qms-cell">
                    {c.targetImplementationDate ? (
                      <span className={overdue ? 'qms-overdue' : undefined}>
                        {formatDate(c.targetImplementationDate)}
                        {overdue && <> {I.flag}</>}
                      </span>
                    ) : '—'}
                  </div>
                  <button
                    className="qms-cell qcc-linkcount"
                    onClick={() => onOpenIdChange(open ? null : c.id)}
                    title={`${linkCount} linked record${linkCount === 1 ? '' : 's'}`}
                  >
                    {I.link} {linkCount}
                  </button>
                  <div className="qms-cell qms-rowacts">
                    {unsignedMovesOf(c).length > 0 && (
                      <button
                        className="qms-chip"
                        title="Move this change to its next lifecycle state, with a reason for the move"
                        onClick={() => openDrawer({ kind: 'advance', change: c })}
                      >
                        {I.arrowRight} Advance
                      </button>
                    )}
                    {c.status === 'under_assessment' && (
                      <button
                        className="qms-chip"
                        title="Approve with your electronic signature (password and second factor). The person who proposed the change cannot approve it."
                        onClick={() => setApproving(c)}
                      >
                        {I.check} Approve
                      </button>
                    )}
                    <button
                      className="qms-chip ghost"
                      title="Ask AnA about this change" aria-label="Ask AnA about this change"
                      onClick={() =>
                        onAsk(`Summarize change ${c.changeNumber} ${c.title}: its impact assessment, linked records, and what it needs next.`)
                      }
                    >
                      {I.sparkles}
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="qcc-detail">
                    <div className="qcc-detail-head">
                      <span className="qcc-detail-title">Linked records</span>
                      <button
                        className="qms-link"
                        onClick={() => openDrawer({ kind: 'link', change: c })}
                      >
                        {I.plus} Link a record
                      </button>
                    </div>
                    {linkCount === 0 ? (
                      <div className="qcc-detail-empty">
                        No linked records yet. Link the deviation, CAPA or validation protocol this change
                        touches so the change control log stays traceable end to end.
                      </div>
                    ) : (
                      <div className="qcc-links">
                        {c.links!.map((l) => (
                          <button
                            key={l.id}
                            className="qcc-link"
                            onClick={() =>
                              onAsk(`Open ${LINK_TYPE_LABEL[l.linkType]} ${l.linkedRef}${l.linkedLabel ? ` (${l.linkedLabel})` : ''} and show how it relates to change ${c.changeNumber}.`)
                            }
                          >
                            <span className="qcc-link-ico" data-type={l.linkType}>{linkIcon(LINK_TYPE_ICON[l.linkType])}</span>
                            <span className="qcc-link-body">
                              <span className="qcc-link-ref mono">{l.linkedRef}</span>
                              {l.linkedLabel && <span className="qcc-link-label">{l.linkedLabel}</span>}
                            </span>
                            <span className="qcc-link-rel">{RELATIONSHIP_LABEL[l.relationship]}</span>
                            <span className="qcc-link-type">{LINK_TYPE_LABEL[l.linkType]}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </section>

      {/* ── How to raise a change (training) + change forms ── */}
      <div className="qms-grid2">
        <section className="qms-sec">
          <div className="qms-sec-head">
            <h2>How to raise a change</h2>
            <span className="meta">Procedure guidance</span>
          </div>
          <div className="qcc-train">
            <ol className="qcc-steps">
              <li><span className="qcc-step-n">1</span> Describe the change — current state and proposed state.</li>
              <li><span className="qcc-step-n">2</span> Give the reason, and classify it minor, major or critical.</li>
              <li><span className="qcc-step-n">3</span> Assess impact on product, process, validation and filings.</li>
              <li><span className="qcc-step-n">4</span> Link the deviations, CAPAs and validation records it touches.</li>
              <li><span className="qcc-step-n">5</span> Route for independent approval, implement, then verify.</li>
            </ol>
            <div className="qcc-train-acts">
              <button
                className="qms-btn primary"
                onClick={() =>
                  onAsk(
                    'Explain how to raise a change request in this quality system. Explain each step of the ' +
                      'change-control procedure, what makes a change minor, major or critical, and what a good impact ' +
                      'assessment looks like. Personal read-and-understood acknowledgements are recorded by the signed-in reader in the SOP register.',
                  )
                }
              >
                {I.users} Explain the procedure
              </button>
              <button
                className="qms-btn ghost"
                onClick={() =>
                  onAsk(
                    'Help me find the change-control procedure in the SOP register. I will open its controlled revision and record my own read-and-understood acknowledgement there.',
                  )
                }
              >
                {I.bookOpen} Find the controlled procedure
              </button>
            </div>
          </div>
        </section>

        <section className="qms-sec">
          <div className="qms-sec-head">
            <h2>Change-control documents & forms</h2>
            <span className="meta">Created as controlled drafts in the SOP register</span>
          </div>
          <div className="qcc-forms">
            {tpl.templates == null && (
              <div className="qms-empty" role="status">
                {tpl.error ? 'The Quality system library could not be read.' : 'Loading the Quality system library…'}
              </div>
            )}
            {changeForms.map((f) => (
              <button
                key={f.key}
                className="qms-tpl-card"
                title={`Create a new ${f.label} as a draft with its standard change-control sections`}
                onClick={() => openDrawer({ kind: 'document', templateKey: f.key })}
              >
                <div className="qms-tpl-top">
                  <span className="qms-tpl-ico">{I.fileText}</span>
                  <span className="qms-tpl-prefix mono">{f.numberPrefix}</span>
                </div>
                <div className="qms-tpl-label">{f.label}</div>
                <div className="qms-tpl-desc">{f.description}</div>
              </button>
            ))}
          </div>
        </section>
      </div>
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
      {drawer?.kind === 'link' && (
        <C2CForm
          config={{
            eyebrow: 'Change control',
            title: `Link a record to ${drawer.change.changeNumber}`,
            governed: 'The link is written to the audit trail under your name.',
            submitLabel: 'Link record',
            ...(refusal ? { notice: refusal } : {}),
            fields: [
              { key: 'linkType', label: 'Record type', type: 'select', required: true, half: true, options: optionsOf(LINK_TYPE_LABEL) },
              { key: 'relationship', label: 'How it relates', type: 'select', half: true, options: optionsOf(RELATIONSHIP_LABEL) },
              { key: 'linkedRef', label: 'Reference', type: 'text', required: true, placeholder: 'DEV-2026-041', desc: 'The record’s number as it appears in its own register.' },
              { key: 'linkedLabel', label: 'Short description', type: 'text' },
            ],
          }}
          onCancel={() => setDrawer(null)}
          onSubmit={(v) => {
            const c = drawer.change;
            void runWrite(async () => {
              await linkQmsChange(c.id, {
                linkType: v.linkType as LinkType,
                linkedRef: v.linkedRef.trim(),
                linkedLabel: v.linkedLabel.trim() || undefined,
                relationship: (v.relationship || undefined) as Relationship | undefined,
              });
              return `${v.linkedRef.trim()} was linked to ${c.changeNumber}.`;
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
            onRetry?.();
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
          onClose={() => setApproving(null)}
          onSign={async (input) => {
            const manifest = await postQmsApproval({ kind: 'change', id: approving.id }, input);
            onRetry?.();
            return manifest;
          }}
        />
      )}
    </>
  );
}
