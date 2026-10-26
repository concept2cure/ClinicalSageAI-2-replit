/**
 * SoftwareSurface — IEC 62304 software lifecycle (one of the three
 * differentiators the platform review names, previously screenless).
 *
 * Project-scoped: the completeness matrix and item list key off the
 * project's regulatory_programs UUID. Read-first — a required-deliverable
 * completeness score drives a submission-readiness decision, so it renders
 * through DataGate and never fabricates a score or a deliverable.
 */

import * as React from 'react';
import { I } from '../icons';
import { DataGate } from '../components/DataGate';
import { useSoftware, kindLabel, type SoftwareSummary } from '../hooks/useSoftware';
import type { Program } from '../data/programs';

export interface SoftwareSurfaceProps {
  onAskAna: (text: string, opts?: { tool?: string }) => void;
  program: Program | null;
}

const STATUS_PILL: Record<string, string> = {
  draft: 'draft',
  in_review: 'review',
  approved: 'final',
  superseded: 'rejected',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  superseded: 'Superseded',
};

/* Slice 0: whether the score covers every FDA document the level asks for.
   An absent list is not an empty one. */
function everyDocumentCounted(sum: SoftwareSummary): boolean {
  return Array.isArray(sum.untracked) && sum.untracked.length === 0;
}

export function SoftwareSurface({ onAskAna, program }: SoftwareSurfaceProps) {
  const projectId = program?.id ?? null;
  const live = useSoftware(projectId);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workstream</div>
          <h1 className="page-title">Software lifecycle</h1>
          <div className="page-sub">
            IEC 62304 · FDA 2023 software &amp; cybersecurity guidance · AAMI TIR57.
            {program ? ` · ${program.code}` : ' · No program open'}
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() =>
              onAskAna(
                'Assess our IEC 62304 software documentation completeness for this project — which required deliverables are missing or unapproved, given the documentation level.',
              )
            }
            type="button"
          >
            {I.sparkles} Ask AnA
          </button>
        </div>
      </div>

      <DataGate
        state={live.summary}
        label="software completeness"
        onRetry={live.refresh}
        emptyHint="Create software lifecycle items to score the required IEC 62304 deliverable set for this project."
        regulation="Serves the IEC 62304 software lifecycle record"
      >
        {/* Slice 0 (placement map, `device-software` row): the route returns
            completion null, with a reason, when nothing is recorded or the
            cyber-device status is not, and null counts when the level is
            undetermined. Those were drawn as "%", " of  required" and a green
            "Approved" card (null < null is false). Not determined is said as
            such, tones come only from real numbers, and "ok" only from a
            computed score.
            Slice 0: for a determined level that score is over the record kinds
            this register tracks; `untracked` names the FDA documents it leaves
            out (always some, today) and `completionScope` says so. Both were
            dropped, and 100 read as "5 of 5 required deliverables approved" in
            green. The scope is shown with the score, the counts are named as
            tracked records, and "ok" needs nothing left uncounted. */}
        {(sum) => (
          <>
            <div className="metrics-row metrics-compact">
              <div className="metric-card">
                <div className="metric-label">Documentation level</div>
                <div className="metric-val" style={{ fontSize: 18, textTransform: 'capitalize' }}>
                  {sum.docLevel === 'undetermined' ? 'Not determined' : sum.docLevel}
                </div>
                <div className="metric-meta">FDA 2023 software guidance</div>
              </div>
              <div
                className="metric-card"
                data-tone={
                  sum.completion === null
                    ? undefined
                    : sum.completion >= 100
                      ? everyDocumentCounted(sum) ? 'ok' : undefined
                      : sum.completion > 0 ? 'warn' : undefined
                }
              >
                <div className="metric-label">Completeness</div>
                {sum.completion === null ? (
                  <>
                    <div className="metric-val" style={{ fontSize: 18 }}>Not determined</div>
                    {sum.reason && <div className="metric-meta">{sum.reason}</div>}
                  </>
                ) : (
                  <>
                    <div className="metric-val">
                      {sum.completion}
                      <span className="unit">%</span>
                    </div>
                    <div className="metric-meta">
                      {sum.completionScope ?? `${sum.approved} of ${sum.required} tracked lifecycle records approved`}
                    </div>
                  </>
                )}
              </div>
              <div
                className="metric-card"
                data-tone={
                  sum.approved !== null && sum.required !== null && sum.approved < sum.required
                    ? 'warn'
                    : sum.approved !== null && sum.required !== null && sum.completion !== null && everyDocumentCounted(sum)
                      ? 'ok'
                      : undefined
                }
              >
                <div className="metric-label">Approved</div>
                <div className="metric-val">
                  {sum.approved !== null && sum.required !== null ? (
                    <>
                      {sum.approved}
                      <span className="unit">/{sum.required}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </div>
                <div className="metric-meta">
                  {sum.completion === null ? 'Required set not determined' : 'Tracked lifecycle records signed off'}
                </div>
              </div>
            </div>

            <section className="section">
              <div className="section-head">
                <h2>Tracked deliverables</h2>
                {sum.matrix.length > 0 && (
                  <span className="section-sub">
                    The {sum.docLevel} documentation records this register tracks · present = drafted · approved = signed off
                  </span>
                )}
              </div>
              {/* An undetermined level has no required set: say so, rather than
                  draw an empty table under "The undetermined documentation set". */}
              {sum.matrix.length === 0 && (
                <p className="section-sub">
                  The deliverables this register tracks are listed once this project&apos;s documentation level is determined.
                </p>
              )}
              {sum.matrix.length > 0 && <div className="ctable">
                <div className="ctable-head" style={{ gridTemplateColumns: '1.6fr 110px 110px' }}>
                  <div>Deliverable</div>
                  <div>Present</div>
                  <div>Approved</div>
                </div>
                {sum.matrix.map((m) => (
                  <div key={m.kind} className="ctable-row" style={{ gridTemplateColumns: '1.6fr 110px 110px' }}>
                    <div className="ctable-strong">{kindLabel(m.kind)}</div>
                    <div>{m.present ? I.check : <span style={{ color: 'var(--warning)' }}>missing</span>}</div>
                    <div>
                      {m.approved ? (
                        <span className="status-pill final">approved</span>
                      ) : m.present ? (
                        <span className="status-pill review">unapproved</span>
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>
                ))}
              </div>}
            </section>
          </>
        )}
      </DataGate>

      <section className="section">
        <div className="section-head">
          <h2>Lifecycle items</h2>
          <span className="section-sub">
            All SRS / SDS / test / cybersecurity artifacts recorded for this project
          </span>
        </div>
        <DataGate
          state={live.items}
          label="software lifecycle items"
          onRetry={live.refresh}
          emptyHint="Software requirements, design, test, and cybersecurity artifacts appear here once recorded."
          /* Slice 0 (placement map, `device-software` row): the empty list
             offered only "Check again", a dead end. The screen has no create
             form yet (slice 19), but AnA's `create_software_lifecycle_item`
             runs in production, so ask her through the header's own onAskAna.
             Only with a project open — without one there is nothing to add to. */
          emptyAction={
            program
              ? {
                  label: 'Ask AnA to add a lifecycle item',
                  onAct: () =>
                    onAskAna(
                      'Add a software lifecycle item for this project — ask me the deliverable kind, documentation level, safety class and title, then record it.',
                    ),
                }
              : undefined
          }
          regulation="Serves the IEC 62304 software lifecycle record"
        >
          {(items) => (
            <div className="ctable">
              <div className="ctable-head" style={{ gridTemplateColumns: '150px 1.6fr 110px 80px 110px' }}>
                <div>Kind</div>
                <div>Title</div>
                <div>Identifier</div>
                <div>Class</div>
                <div>Status</div>
              </div>
              {items.map((it) => (
                <div key={it.id} className="ctable-row" style={{ gridTemplateColumns: '150px 1.6fr 110px 80px 110px' }}>
                  <div>{kindLabel(it.itemKind)}</div>
                  <div className="ctable-strong">{it.title}</div>
                  <div className="mono small-mono">{it.identifier ?? '—'}</div>
                  <div>{it.safetyClass ? `Class ${it.safetyClass}` : '—'}</div>
                  <div>
                    <span className={`status-pill ${STATUS_PILL[it.status] ?? 'draft'}`}>
                      {STATUS_LABEL[it.status] ?? it.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DataGate>
      </section>
    </>
  );
}
