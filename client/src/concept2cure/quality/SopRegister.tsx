/**
 * SopRegister — the controlled-document register and SOP library surface.
 *
 * Document control over the live QMS backend (/api/mdx/qms/*): the register
 * catalog, the controlled lifecycle (draft → under review → effective →
 * superseded → retired), periodic-review tracking with overdue flags,
 * read-and-understood training, change control (revise / retire), and the
 * Quality system template gallery.
 *
 * AnA-first: actions are conversational prompts handed to the host's AnA
 * surface via `onAsk` — the same pattern as the MDX Quality kit and the
 * Intelligence cluster.
 *
 * Approval is the exception, because it is an electronic signature and AnA
 * cannot sign: a chat turn cannot collect a password. The row's Approve button
 * opens the shared EsignModal, which posts to the signed route
 * (POST /api/mdx/qms/documents/:id/approve, VSR-001 F-3). Until 2026-09-24 this
 * button was "Ask AnA to approve", its tooltip said "you still capture the
 * e-signature", and the tool it reached made the SOP effective with no
 * signature at all (new-code audit 2026-09-24, finding 1).
 *
 * @module client/src/concept2cure/quality/SopRegister
 */

import * as React from 'react';
import { I } from '../v2/icons';
import { registerRowMinWidth } from './registerGrid';
import {
  SOP_TEMPLATES,
  FIXTURE_DOCS,
  FIXTURE_TRAINING,
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
import { GovernedConfirmDialog } from '../_shared/components/GovernedConfirmDialog';
import { useAuthUser } from '@/services/portal/authService';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import type { QmsDoc } from './data';
/* The canonical sample-mode guard and its marker, shared with the MDX lane —
   one definition of "may a fixture reach the screen", so two lanes cannot
   answer it differently. */
import { useSampleRows, useShowingSample } from '../mdx/lib/useSampleRows';
import { SampleDataBanner } from '../mdx/components/SampleDataBanner';
import { ErrorState } from '../v2/dataConnect';

export interface SopRegisterProps {
  /** Forward a prompt to the host's AnA conversation surface. */
  onAsk: (q: string) => void;
  /** Status chip applied to the register (owned by QualityApp — AnA's filter action drives the same value). */
  filter: StatusFilter;
  /** Apply a status chip — the same setter the chips and AnA share. */
  onFilterChange: (f: StatusFilter) => void;
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

export function SopRegister({ onAsk, filter, onFilterChange }: SopRegisterProps) {
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
  const docs = useSampleRows(reg.docs, FIXTURE_DOCS);
  const templates = useSampleRows(tpl.templates, SOP_TEMPLATES);
  const reviewDue = rev.rows ?? deriveReviewDue(docs);
  /* Live read-and-understood compliance (numerator = distinct current
     acknowledgments, denominator = org roster). */
  const trainComp = useTrainingCompliance();
  const training = useSampleRows(trainComp.rows, FIXTURE_TRAINING);
  /* One predicate for the whole surface: the document register is what the
     rest is derived from, so if that is sample then so is the view. */
  const showingSample = useShowingSample(reg.docs);
  const user = useAuthUser(); // display only; the server resolves the signer
  /** The document being approved, while the signature dialog is open. */
  const [approving, setApproving] = React.useState<QmsDoc | null>(null);
  /* Retire is a governed, terminal write: a dialog that captures the reason
     (the server requires it and refuses without it), not a prompt into chat
     that asked AnA to ask for one. */
  const [retiring, setRetiring] = React.useState<QmsDoc | null>(null);
  const [retireErr, setRetireErr] = React.useState<string | null>(null);

  const effectiveCount = docs.filter((d) => d.status === 'effective').length;
  const underReviewCount = docs.filter((d) => d.status === 'in_review').length;
  const draftCount = docs.filter((d) => d.status === 'draft').length;
  const overdueCount = reviewDue.filter((r) => r.overdue).length;
  const trainedRows = training.filter((t) => t.of > 0);
  const trainingPct = trainedRows.length
    ? Math.round((trainedRows.reduce((s, t) => s + t.current / t.of, 0) / trainedRows.length) * 100)
    : 0;

  /* A read that has not answered is not an empty register. Outside sample mode
     `useSampleRows(null, …)` is `[]`, so until 2026-09-25 a 401, a 500 or a
     dropped connection rendered "Effective documents 0" and "Review overdue 0 —
     All current" in the ok tone, over "No documents due for review." The hooks
     computed the error; nothing here read it (HS-1,
     docs/evidence/reviews/2026-09-24/lenses.md). "Unread" is in flight or failed;
     neither may render a count. A resolved list that is non-empty came from
     live rows or from explicit sample mode, which the banner above marks. */
  const regUnread = reg.docs == null && docs.length === 0;
  const regFailed = regUnread && reg.error != null;
  /* Review dates come from their own read, or are derived from the register;
     they are unknown only when both are. */
  const reviewUnread = rev.rows == null && regUnread;
  const reviewFailed = reviewUnread && regFailed;
  const trainUnread = trainComp.rows == null && training.length === 0;
  const trainFailed = trainUnread && trainComp.error != null;
  const unreadSub = (failed: boolean) => (failed ? 'Could not be read' : 'Loading…');

  const visible = docs.filter((d) => filter === 'all' || d.status === filter);

  return (
    <>
      {/* This register showed effective SOPs and training-completion counts
          with no marker of any kind. */}
      <SampleDataBanner show={showingSample} loading={reg.loading} label="SOPs and training records" />
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
            onClick={() =>
              onAsk(
                'Run a QMS pre-inspection check — surface every controlled document overdue for periodic ' +
                  'review, every training gap, and anything not yet effective, ranked by inspection risk.',
              )
            }
          >
            {I.shieldCheck} Pre-inspection check
          </button>
          <button
            className="qms-btn primary"
            onClick={() =>
              onAsk(
                'Help me create a new controlled document. Ask me which type from the Quality system library ' +
                  '(quality manual, policy, SOP, work instruction, form, validation protocol, training curriculum), ' +
                  'assign the next document number, then open it with the standard Purpose to Approval section structure.',
              )
            }
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
              sub={underReviewCount ? 'Awaiting approval' : 'None in review'}
              tone={underReviewCount ? 'warn' : 'ok'}
            />
          </>
        )}
        {reviewUnread ? (
          <Kpi label="Review overdue" val="—" sub={unreadSub(reviewFailed)} />
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
            label="Training compliance"
            val="—"
            sub={trainUnread ? unreadSub(trainFailed) : 'No training-controlled documents yet'}
          />
        ) : (
          <Kpi
            label="Training compliance"
            val={String(trainingPct)}
            unit="%"
            sub="Read-and-understood, current cycle"
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
              onClick={() =>
                onAsk(
                  `Create a new ${t.label} from the Quality system library. Assign the next ${t.numberPrefix} number, ` +
                    `then open it with the standard sections: ${t.sections.map((s) => s.label).join(', ')}.`,
                )
              }
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
                  onClick={() =>
                    onAsk(
                      `Open ${d.docNumber} ${d.title} (v${d.version}, ${STATUS_LABEL[d.status]}). Walk me through its ` +
                        'sections, current status, training status and review history.',
                    )
                  }
                >
                  {d.docNumber}
                </button>
                <div className="qms-cell qms-title" title={d.title}>
                  {d.title}
                </div>
                <div className="qms-cell">
                  <span className="qms-tag">{DOC_TYPE_LABEL[d.docType] ?? d.docType}</span>
                </div>
                <div className="qms-cell mono">{d.version}</div>
                <div className="qms-cell">
                  <span className="qms-pill" data-tone={STATUS_TONE[d.status]}>
                    {STATUS_LABEL[d.status]}
                  </span>
                </div>
                <div className="qms-cell">{formatDate(d.effectiveDate)}</div>
                <div className="qms-cell">
                  {d.nextReviewDate ? (
                    <span className={overdue ? 'qms-overdue' : undefined}>
                      {formatDate(d.nextReviewDate)}
                      {overdue && <> {I.flag}</>}
                    </span>
                  ) : (
                    '—'
                  )}
                </div>
                <div className="qms-cell qms-rowacts">
                  {(d.status === 'draft' || d.status === 'in_review') && (
                    <button
                      className="qms-chip"
                      disabled={showingSample}
                      title={
                        showingSample
                          ? 'Sample rows cannot be approved'
                          : 'Approve with your electronic signature (password and second factor). The author cannot approve their own document.'
                      }
                      onClick={() => setApproving(d)}
                    >
                      {I.check} Approve
                    </button>
                  )}
                  {d.status === 'effective' && (
                    <>
                      <button
                        className="qms-chip"
                        title="Open a controlled revision"
                        onClick={() =>
                          onAsk(
                            `Open a controlled revision of ${d.docNumber} ${d.title} (currently v${d.version}). Ask me for ` +
                              'the reason for change, bump to the next version, return it to draft, and route it for review.',
                          )
                        }
                      >
                        {I.history} Revise
                      </button>
                      <button
                        className="qms-chip"
                        title="Retire"
                        onClick={() => { setRetireErr(null); setRetiring(d); }}
                      >
                        {I.archive} Retire
                      </button>
                    </>
                  )}
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
        <section className="qms-sec">
          <div className="qms-sec-head">
            <h2>Periodic review</h2>
            {!reviewUnread && (
              <span className="meta">
                {overdueCount} overdue · {reviewDue.length} within 120 days
              </span>
            )}
          </div>
          <div className="qms-review">
            {reviewFailed && (
              <ErrorState
                title="Periodic review dates could not be read"
                message={rev.error ?? reg.error}
                retry={() => {
                  reg.refresh?.();
                  rev.refresh?.();
                }}
                testId="sop-review-failed"
              />
            )}
            {reviewUnread && !reviewFailed && (
              <div className="qms-empty" role="status">Loading review dates…</div>
            )}
            {!reviewUnread && reviewDue.length === 0 && (
              <div className="qms-empty">No documents due for review.</div>
            )}
            {reviewDue.map((r) => (
              <button
                key={r.id}
                className="qms-review-row"
                data-overdue={r.overdue || undefined}
                onClick={() =>
                  onAsk(
                    `Schedule the periodic review of ${r.docNumber} ${r.title} (next review ${formatDate(r.nextReviewDate)}` +
                      `${r.overdue ? ', overdue' : ''}). Confirm the reviewer and due date, open a revision if changes are ` +
                      'needed, and log it.',
                  )
                }
              >
                <span className="qms-review-num mono">{r.docNumber}</span>
                <span className="qms-review-title" title={r.title}>
                  {r.title}
                </span>
                <span className="qms-review-when">
                  {r.overdue ? (
                    <span className="qms-flag-txt">{I.flag} Overdue</span>
                  ) : (
                    formatDate(r.nextReviewDate)
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="qms-sec">
          <div className="qms-sec-head">
            <h2>Read-and-understood training</h2>
            <span className="meta">Per controlled procedure</span>
            <span className="spacer" />
            <button
              className="qms-link"
              onClick={() =>
                onAsk(
                  'Record read-and-understood training. Ask me which controlled document and which team members, ' +
                    'capture the acknowledgment method (e-signature, attestation, or trainer-verified), then set the ' +
                    'next refresh date.',
                )
              }
            >
              {I.bookOpen} Record training
            </button>
          </div>
          <div className="qms-train">
            {trainFailed && (
              <ErrorState
                title="Training records could not be read"
                message={trainComp.error}
                retry={trainComp.refresh}
                testId="sop-training-failed"
              />
            )}
            {trainUnread && !trainFailed && (
              <div className="qms-empty" role="status">Loading training records…</div>
            )}
            {!trainUnread && training.length === 0 && (
              <div className="qms-empty">No training-controlled documents yet.</div>
            )}
            {training.map((t) => {
              const pct = t.of > 0 ? Math.round((t.current / t.of) * 100) : 0;
              const tone = pct < 80 ? 'err' : pct < 95 ? 'warn' : 'ok';
              return (
                <div key={t.doc} className="qms-train-row">
                  <span className="qms-train-doc" title={t.doc}>
                    {t.doc}
                  </span>
                  <span className="qms-train-bar">
                    <span className="qms-train-fill" data-tone={tone} style={{ width: `${pct}%` }} />
                  </span>
                  <span className="qms-train-pct mono">
                    {t.current}/{t.of}
                  </span>
                  <span className="qms-train-when">{t.lastCycle}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
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
        <GovernedConfirmDialog
          open
          action="Retire controlled document"
          target={`${retiring.docNumber} ${retiring.title} (v${retiring.version})`}
          resource={retiring.docNumber}
          minReason={8}
          confirmWord="retire"
          submitError={retireErr}
          onCancel={() => setRetiring(null)}
          onConfirm={async ({ reason }) => {
            const res = await apiRequest('POST', `/api/mdx/qms/documents/${retiring.id}/retire`, { reason });
            const json = await res.json().catch(() => null);
            if (!res.ok) {
              setRetireErr(serverMessage(json) ?? 'The document was not retired. Nothing changed.');
              return;
            }
            setRetiring(null);
            reg.refresh?.();
          }}
        />
      )}
    </>
  );
}
