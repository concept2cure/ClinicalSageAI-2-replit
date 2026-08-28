/**
 * ChangeControl — the change-control register, lifecycle flowchart, and the
 * links that tie every change to its deviations, CAPAs and validation records.
 *
 * The four things the Quality & Assurance brief asks for, on one surface:
 *   1. Train employees in how to raise change requests (the "How to raise a
 *      change" panel — AnA-first).
 *   2. Draft the change-control documents and forms we provide (the change
 *      forms gallery — each opens the controlled template).
 *   3. Monitor the change-control log aligned to ICH Q10 / Annex 15 (the
 *      register + lifecycle flowchart).
 *   4. Link every change to deviations, CAPAs and validation documents (the
 *      per-change cross-reference panel).
 *
 * AnA-first: every governed action is a conversational prompt handed to the
 * host's AnA surface via `onAsk` — AnA runs the governed transition and captures
 * the reason-for-change / e-signature, so the 21 CFR Part 11 audit trail stays
 * the single path. No mutation is performed directly here.
 *
 * @module client/src/concept2cure/quality/ChangeControl
 */

import * as React from 'react';
import { I } from './icons';
import { registerRowMinWidth } from './registerGrid';
import { ChangeFlow } from './ChangeFlow';
import {
  FIXTURE_SUMMARY,
  CHANGE_FORMS,
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
/* The canonical sample-mode guard and its marker, shared with the MDX lane
   rather than re-implemented here — one definition of "may a fixture reach the
   screen", so the two lanes cannot answer it differently. */
import { useSampleValue } from '../mdx/lib/useSampleRows';
import { SampleDataBanner } from '../mdx/components/SampleDataBanner';
import { EmptyState } from '../v2/dataConnect';

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
  /** The change register, already through the sample-mode boundary (see QualityApp). */
  changes: ChangeControlRow[];
  /** True while the register read is in flight. */
  loading: boolean;
  /** True when `changes` is the fixture — renders the standing sample marker. */
  showingSample: boolean;
}

const GRID = '112px minmax(0, 1fr) 118px 80px 128px 104px 62px 120px';
/* Derived, never hand-kept — see registerGrid.ts. Below this the title track
   resolves to 0px and the row's last columns are clipped away. */
const ROW_MIN = registerRowMinWidth(GRID);

function Kpi({
  label, val, sub, tone,
}: { label: string; val: string; sub: string; tone?: 'ok' | 'warn' | 'err' }) {
  return (
    <div className="qms-kpi" data-tone={tone === 'ok' ? '' : tone || ''}>
      <div className="lbl">{label}</div>
      <div className="val">{val}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

/** Icon element for a link type (from the shared `I` set). */
function linkIcon(iconKey: string): React.ReactNode {
  return (I as Record<string, React.ReactNode>)[iconKey] ?? I.link;
}

export function ChangeControl({
  onAsk,
  stage,
  onStageChange,
  openId,
  onOpenIdChange,
  changes,
  loading,
  showingSample,
}: ChangeControlProps) {
  const sum = useChangeSummary();

  /* The register read — and its sample-mode boundary — lives in QualityApp
     now, lifted because AnA's open-change action resolves free-text names
     against the same rows this log renders, and a handler can only read state
     its own component holds. `changes` arrives already gated: live rows, or
     the fixture only under explicit sample mode (impossible in a production
     build), always under the standing marker below. */
  const summary = useSampleValue(sum.summary, FIXTURE_SUMMARY);
  const counts = React.useMemo(() => deriveStageCounts(changes), [changes]);

  const visible = changes.filter((c) => stage === 'all' || c.status === stage);

  return (
    <>
      {/* The standing marker. This surface once had none — its raw fallback
          was silent as well as ungated. The gate now lives with the read in
          QualityApp; the marker stays here, where the rows render. */}
      <SampleDataBanner show={showingSample} loading={loading} label="change records" />
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
            onClick={() =>
              onAsk(
                'Run a change-control health check — show every change overdue for implementation, every one ' +
                  'awaiting approval, and any linked deviation or CAPA that is still open, ranked by risk.',
              )
            }
          >
            {I.shieldCheck} Health check
          </button>
          <button
            className="qms-btn primary"
            onClick={() =>
              onAsk(
                'Help me raise a change request. Walk me through the change-request form: what is changing ' +
                  '(current state → proposed state), the reason, the classification (minor / major / critical), ' +
                  'the impact assessment, and which documents, deviations, CAPAs and validation records it affects. ' +
                  'Then assign the next CC- number and open it as a controlled change.',
              )
            }
          >
            {I.plus} Raise change request
          </button>
        </div>
      </div>

      {/* The KPI row is derived entirely from `summary`, so with no summary
          there is nothing to count. `useSampleValue` returns null rather than a
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
                {I.x} Clear filter · {STATE_LABEL[stage as ChangeState] ?? stage}
              </button>
            </>
          )}
        </div>
        <ChangeFlow counts={counts} activeStage={stage} onSelectStage={onStageChange} onAsk={onAsk} />
      </section>

      {/* ── Register / log ── */}
      <section className="qms-sec">
        <div className="qms-sec-head">
          <h2>Change control log</h2>
          <span className="meta">
            {visible.length} {visible.length === 1 ? 'change' : 'changes'}
            {stage !== 'all' ? ` · ${STATE_LABEL[stage as ChangeState] ?? stage}` : ''}
          </span>
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
          {visible.length === 0 && <div className="qms-empty">No changes at this stage.</div>}
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
                    <button
                      className="qms-chip"
                      title="Advance this change"
                      onClick={() =>
                        onAsk(
                          `Advance ${c.changeNumber} ${c.title} (currently ${STATE_LABEL[c.status]}). Tell me the next ` +
                            'controlled step, confirm the reviewer or approver (the approver must differ from the initiator), ' +
                            'capture the reason and e-signature, then write the Part 11 audit entry.',
                        )
                      }
                    >
                      {I.arrowRight} Advance
                    </button>
                    <button
                      className="qms-chip ghost"
                      title="Ask AnA about this change"
                      onClick={() =>
                        onAsk(`Summarize change ${c.changeNumber} ${c.title}: its impact assessment, linked records, and what it needs next.`)
                      }
                    >
                      {I.sparkle}
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="qcc-detail">
                    <div className="qcc-detail-head">
                      <span className="qcc-detail-title">Linked records</span>
                      <button
                        className="qms-link"
                        onClick={() =>
                          onAsk(
                            `Link a record to change ${c.changeNumber}. Ask me whether it is a deviation, CAPA, ` +
                              'validation protocol or controlled document, capture its reference and how it relates ' +
                              '(triggered by / addresses / requires / impacts), then attach it.',
                          )
                        }
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
            <span className="meta">AnA trains your team</span>
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
                    'Train me on how to raise a change request in this quality system. Explain each step of the ' +
                      'change-control procedure, what makes a change minor, major or critical, and what a good impact ' +
                      'assessment looks like. Then quiz me and record read-and-understood training for the change-control SOP.',
                  )
                }
              >
                {I.users} Train me
              </button>
              <button
                className="qms-btn ghost"
                onClick={() =>
                  onAsk(
                    'Record read-and-understood training on the change-control procedure for my team. Ask me which ' +
                      'team members, capture the acknowledgment method, and set the next refresh date.',
                  )
                }
              >
                {I.bookOpen} Record team training
              </button>
            </div>
          </div>
        </section>

        <section className="qms-sec">
          <div className="qms-sec-head">
            <h2>Change-control documents & forms</h2>
            <span className="meta">Draft in the editor and AnA’s Canvas</span>
          </div>
          <div className="qcc-forms">
            {CHANGE_FORMS.map((f) => (
              <button
                key={f.key}
                className="qms-tpl-card"
                onClick={() =>
                  onAsk(
                    `Create a new ${f.label} from the Quality system library. Assign the next ${f.numberPrefix} number, ` +
                      'then open it in the editor with the standard change-control sections so I can draft it.',
                  )
                }
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
    </>
  );
}
