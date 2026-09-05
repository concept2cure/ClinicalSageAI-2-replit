/**
 * SopRegister — the controlled-document register and SOP library surface.
 *
 * Document control over the live QMS backend (/api/mdx/qms/*): the register
 * catalog, the controlled lifecycle (draft → under review → effective →
 * superseded → retired), periodic-review tracking with overdue flags,
 * read-and-understood training, change control (revise / retire), and the
 * Quality system template gallery.
 *
 * AnA-first: every action is a conversational prompt handed to the host's AnA
 * surface via `onAsk` — the same pattern as the MDX Quality kit and the
 * Intelligence cluster. No mutation is performed directly here; AnA runs the
 * governed action (and captures the reason-for-change / e-signature) so the
 * 21 CFR Part 11 audit trail stays the single path.
 *
 * @module client/src/concept2cure/quality/SopRegister
 */

import * as React from 'react';
import { I } from './icons';
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
/* The canonical sample-mode guard and its marker, shared with the MDX lane —
   one definition of "may a fixture reach the screen", so two lanes cannot
   answer it differently. */
import { useSampleRows, useShowingSample } from '../mdx/lib/useSampleRows';
import { SampleDataBanner } from '../mdx/components/SampleDataBanner';

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

  const effectiveCount = docs.filter((d) => d.status === 'effective').length;
  const underReviewCount = docs.filter((d) => d.status === 'in_review').length;
  const draftCount = docs.filter((d) => d.status === 'draft').length;
  const overdueCount = reviewDue.filter((r) => r.overdue).length;
  const trainedRows = training.filter((t) => t.of > 0);
  const trainingPct = trainedRows.length
    ? Math.round((trainedRows.reduce((s, t) => s + t.current / t.of, 0) / trainedRows.length) * 100)
    : 0;

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
        <Kpi label="Effective documents" val={String(effectiveCount)} sub={`${docs.length} in register`} />
        <Kpi
          label="Under review"
          val={String(underReviewCount)}
          sub={underReviewCount ? 'Awaiting approval' : 'None in review'}
          tone={underReviewCount ? 'warn' : 'ok'}
        />
        <Kpi
          label="Review overdue"
          val={String(overdueCount)}
          sub={overdueCount ? 'Past next-review date' : 'All current'}
          tone={overdueCount ? 'err' : 'ok'}
        />
        <Kpi
          label="Training compliance"
          val={String(trainingPct)}
          unit="%"
          sub="Read-and-understood, current cycle"
          tone={trainingPct >= 95 ? 'ok' : trainingPct >= 80 ? 'warn' : 'err'}
        />
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
          <span className="meta">
            {effectiveCount} effective · {underReviewCount} under review · {draftCount} draft
          </span>
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
                      title="Opens the approval in AnA — you still capture the e-signature; it is not approved by clicking here"
                      onClick={() =>
                        onAsk(
                          `Approve ${d.docNumber} ${d.title} (v${d.version}) and make it effective — confirm the reviewer ` +
                            '(must differ from the author), capture the e-signature, set the effective date and the next ' +
                            'periodic-review date, then write the Part 11 audit entry.',
                        )
                      }
                    >
                      {I.sparkle} Ask AnA to approve
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
                        onClick={() =>
                          onAsk(
                            `Retire ${d.docNumber} ${d.title}. Ask me for the reason, confirm there is no active dependency, ` +
                              'then move it to retired and write the audit entry.',
                          )
                        }
                      >
                        {I.archive} Retire
                      </button>
                    </>
                  )}
                  <button
                    className="qms-chip ghost"
                    title="Ask AnA about this document"
                    onClick={() => onAsk(`Summarize ${d.docNumber} ${d.title} and tell me what it needs next.`)}
                  >
                    {I.sparkle}
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
            <span className="meta">
              {overdueCount} overdue · {reviewDue.length} within 120 days
            </span>
          </div>
          <div className="qms-review">
            {reviewDue.length === 0 && <div className="qms-empty">No documents due for review.</div>}
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
            {training.length === 0 && (
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
    </>
  );
}
