/**
 * <DocumentsPanel> — canonical "documents this surface owns" affordance.
 *
 * Row per document with status pill, version, sections progress, owner,
 * e-sig state, framework tag, and an "open in editor" handoff. Reusable
 * across Engineering / UDI / Postmarket / Analytics / Admin (each pass
 * their own document list).
 *
 * Port of design-system/ui_kits/mdx/documents-panel.jsx. CSS lives in
 * client/src/concept2cure/mdx/app.css (DOCUMENTS PANEL section) — which, until
 * that section was written, it did not: this line named a destination the port
 * never reached, and every class below matched nothing in any bundle.
 */

import * as React from 'react';
import { I } from '../icons';

// ─── Shared kit document shape ────────────────────────────────────────
//
// Mirrors design-system/ui_kits/mdx/data/engineering-docs.js (and the
// other *-docs.js files). Optional fields are surface-specific and most
// surfaces omit them entirely — DocumentsPanel renders only when present.

export type DocStatus = 'draft' | 'review' | 'ready' | 'locked';
export type DocEsigState = 'na' | 'pending' | 'signed';

export interface KitDocument {
  id: string;
  framework?: string;
  /** DHF section reference (Engineering-only — § number). */
  dhfRef?: string;
  type?: string;
  title: string;
  ver: string;
  status: DocStatus;
  completion: number;
  blocker?: boolean;
  blockerNote?: string;
  owner: string;
  reviewers?: string[];
  lastEdit: string;
  esigRequired?: boolean;
  esigState?: DocEsigState;
  signedBy?: string;
  sections: number;
  sectionsComplete: number;
  editor?: string;
  /** Per-doc counts shown as small chips beneath meta row. */
  openComments?: number;
  deviations?: number;
  openRisks?: number;
  anomalies?: number;
}

export interface KitDocFramework {
  id: string;
  label: string;
  desc?: string;
}

export interface DocumentsPanelProps {
  title?: string;
  subtitle?: string;
  docs: KitDocument[];
  /** Optional filter row across frameworks. Hidden when fewer than two. */
  frameworks?: KitDocFramework[];
  /** Open the document in the appropriate editor. */
  onOpenEditor?: (docId: string) => void;
  /** AnA handoff. When omitted, the "draft next section" chip hides. */
  onAskAna?: (text: string) => void;
  /** Density modifier — `compact` reduces row padding for high-volume surfaces. */
  density?: 'comfortable' | 'compact';
}

export function DocumentsPanel({
  title = 'Documents in flight',
  subtitle,
  docs,
  frameworks,
  onOpenEditor,
  onAskAna,
  density = 'comfortable',
}: DocumentsPanelProps) {
  const [framework, setFramework] = React.useState<string>('all');
  const filtered = React.useMemo(
    () => (framework === 'all' ? docs : docs.filter((d) => d.framework === framework)),
    [docs, framework],
  );

  /* Counts per framework for the segmented filter row. */
  const counts = React.useMemo(() => {
    const m: Record<string, number> = { all: docs.length };
    for (const d of docs) {
      if (d.framework) m[d.framework] = (m[d.framework] ?? 0) + 1;
    }
    return m;
  }, [docs]);

  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {subtitle && <span className="section-sub">{subtitle}</span>}
        {frameworks && frameworks.length > 1 && (
          <div className="seg small" style={{ marginLeft: 'auto' }}>
            <button
              className="seg-btn"
              data-on={framework === 'all' || undefined}
              onClick={() => setFramework('all')}
              type="button"
            >
              All <span className="count">{counts.all}</span>
            </button>
            {frameworks.map((f) => (
              <button
                key={f.id}
                className="seg-btn"
                data-on={framework === f.id || undefined}
                onClick={() => setFramework(f.id)}
                title={f.desc}
                type="button"
              >
                {f.label} <span className="count">{counts[f.id] ?? 0}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={`docs-panel${density === 'compact' ? ' docs-panel-compact' : ''}`}>
        {filtered.map((d) => {
          const fwLabel =
            d.framework
              ? (frameworks ?? []).find((f) => f.id === d.framework)?.label ?? d.framework
              : null;
          const esigTitle =
            d.esigState === 'signed'
              ? `Signed ${d.signedBy ?? ''}`
              : d.esigState === 'pending'
              ? 'E-signature required'
              : 'E-signature not yet applicable';
          return (
            <button
              key={d.id}
              className="docs-row"
              data-status={d.status}
              data-blocker={d.blocker || undefined}
              onClick={() => onOpenEditor?.(d.id)}
              type="button"
            >
              <div className="docs-rail" />
              <div className="docs-body">
                <div className="docs-head">
                  {fwLabel && (
                    <span className={`docs-framework docs-fw-${d.framework ?? ''}`}>{fwLabel}</span>
                  )}
                  {d.dhfRef && <span className="mono tiny docs-dhf">DHF §{d.dhfRef}</span>}
                  <span className={`status-pill ${d.status}`}>{d.status}</span>
                  {d.blocker && <span className="pill-err small">blocker</span>}
                  {d.esigRequired && d.esigState && (
                    <span className={`docs-esig docs-esig-${d.esigState}`} title={esigTitle}>
                      {I.shieldCheck}
                      <span>
                        {d.esigState === 'signed'
                          ? 'signed'
                          : d.esigState === 'pending'
                          ? 'sign pending'
                          : 'esig n/a'}
                      </span>
                    </span>
                  )}
                </div>
                <div className="docs-title">{d.title}</div>
                <div className="docs-meta">
                  <span className="mono small docs-ver">{d.ver}</span>
                  <span className="dot-sep" aria-hidden="true">·</span>
                  <span>
                    {d.sectionsComplete}/{d.sections} sections
                  </span>
                  <span className="docs-progress">
                    <span
                      className="docs-progress-fill"
                      style={{ width: `${d.completion}%` }}
                    />
                  </span>
                  <span className="mono small docs-pct">{d.completion}%</span>
                  <span className="dot-sep" aria-hidden="true">·</span>
                  <span className="docs-owner">{d.owner}</span>
                  {d.reviewers && d.reviewers.length > 0 && (
                    <>
                      <span style={{ color: 'var(--text-400)' }}>→</span>
                      <span className="docs-reviewers">
                        {d.reviewers.map((r) => (
                          <span key={r} className="docs-reviewer">
                            {r}
                          </span>
                        ))}
                      </span>
                    </>
                  )}
                  <span className="docs-last">{d.lastEdit}</span>
                </div>
                {d.blocker && d.blockerNote && (
                  <div className="docs-blocker-note">
                    <span className="ico">{I.alertCircle}</span>
                    <span>{d.blockerNote}</span>
                  </div>
                )}
                {(d.openComments || d.deviations || d.openRisks || d.anomalies) && (
                  <div className="docs-flags">
                    {d.openComments ? (
                      <span className="docs-flag">{d.openComments} open comments</span>
                    ) : null}
                    {d.deviations ? (
                      <span className="docs-flag">{d.deviations} deviations</span>
                    ) : null}
                    {d.openRisks ? (
                      <span className="docs-flag">{d.openRisks} open risks</span>
                    ) : null}
                    {d.anomalies ? (
                      <span className="docs-flag">{d.anomalies} unresolved anomalies</span>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="docs-actions">
                {onAskAna && (
                  <span
                    className="docs-action-chip"
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAskAna(`Draft the next missing section of ${d.title}.`);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        onAskAna(`Draft the next missing section of ${d.title}.`);
                      }
                    }}
                    title="Ask AnA to draft"
                  >
                    {I.sparkles}
                  </span>
                )}
                <span className="docs-open">{I.arrowRight}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
