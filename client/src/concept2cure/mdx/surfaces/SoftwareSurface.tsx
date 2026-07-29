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
import { useSoftware, kindLabel } from '../hooks/useSoftware';
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
            {program ? ` · ${program.code}` : ' · Select a project'}
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
      >
        {(sum) => (
          <>
            <div className="metrics-row metrics-compact">
              <div className="metric-card">
                <div className="metric-label">Documentation level</div>
                <div className="metric-val" style={{ fontSize: 18, textTransform: 'capitalize' }}>
                  {sum.docLevel}
                </div>
                <div className="metric-meta">FDA 2023 software guidance</div>
              </div>
              <div
                className="metric-card"
                data-tone={sum.completion >= 100 ? 'ok' : sum.completion > 0 ? 'warn' : undefined}
              >
                <div className="metric-label">Completeness</div>
                <div className="metric-val">
                  {sum.completion}
                  <span className="unit">%</span>
                </div>
                <div className="metric-meta">
                  {sum.approved} of {sum.required} required deliverables approved
                </div>
              </div>
              <div className="metric-card" data-tone={sum.approved < sum.required ? 'warn' : 'ok'}>
                <div className="metric-label">Approved</div>
                <div className="metric-val">
                  {sum.approved}
                  <span className="unit">/{sum.required}</span>
                </div>
                <div className="metric-meta">Required deliverables signed off</div>
              </div>
            </div>

            <section className="section">
              <div className="section-head">
                <h2>Required deliverables</h2>
                <span className="section-sub">
                  The {sum.docLevel} documentation set · present = drafted · approved = signed off
                </span>
              </div>
              <div className="ctable">
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
              </div>
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
