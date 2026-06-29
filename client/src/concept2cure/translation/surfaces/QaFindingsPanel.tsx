// QA findings for a translation segment — grouped by severity, each rendered
// with a tone, an icon, and text (never color alone — WCAG 2.2 AA). An 'error'
// finding means the segment must not auto-advance through the workflow; the
// panel surfaces that gate explicitly so the guardrail is visible, not implied.
//
// QA findings are not yet wired into the /api/translation contract, so this
// panel accepts them via props (`findings`) — usable now against any caller
// that already has the findings (e.g. a back-translation or terminology check).
// When a findings endpoint lands, a thin hook can feed the same prop shape.
//
// Reuses the labeling surface conventions (bp-*/lb-* classes, shared state
// helpers) rather than a parallel styling system. A later design-review pass
// should confirm the grouped-severity layout and the auto-advance banner read
// clearly with assistive technology.

import * as React from 'react';
import { LabelingIcon } from '../../labeling/icons';
import { Empty } from '../../labeling/surfaces/state';

/** Severity of a single QA finding. */
export type QaSeverity = 'error' | 'warning' | 'info';

/** One QA finding against a segment. */
export interface QaFinding {
  /** Stable id of the check that produced this finding (e.g. 'glossary.dnt'). */
  checkId: string;
  severity: QaSeverity;
  message: string;
}

interface QaFindingsPanelProps {
  /** Findings to render. Empty/omitted renders the clean state. */
  findings?: QaFinding[];
  /** Optional id of the segment these findings belong to, for the heading. */
  segmentOrdinal?: number;
  /** Optional loading flag for callers that fetch findings asynchronously. */
  isLoading?: boolean;
}

// Severity → tone + icon + human label. Order is the rendering / precedence
// order: errors first (they block), then warnings, then info.
const SEVERITY_ORDER: QaSeverity[] = ['error', 'warning', 'info'];

const SEVERITY_META: Record<
  QaSeverity,
  { tone: 'err' | 'warn' | 'review'; icon: string; label: string }
> = {
  error: { tone: 'err', icon: 'xCircle', label: 'Errors' },
  warning: { tone: 'warn', icon: 'warning', label: 'Warnings' },
  info: { tone: 'review', icon: 'alertCircle', label: 'Information' },
};

function groupBySeverity(findings: QaFinding[]): Record<QaSeverity, QaFinding[]> {
  const groups: Record<QaSeverity, QaFinding[]> = { error: [], warning: [], info: [] };
  for (const f of findings) {
    (groups[f.severity] ?? groups.info).push(f);
  }
  return groups;
}

export function QaFindingsPanel({ findings = [], segmentOrdinal, isLoading = false }: QaFindingsPanelProps) {
  const groups = React.useMemo(() => groupBySeverity(findings), [findings]);
  const errorCount = groups.error.length;
  const heading = segmentOrdinal != null ? `Segment ${segmentOrdinal} · QA findings` : 'QA findings';

  return (
    <section className="bp-card" aria-label={heading}>
      <div className="bp-card-head">
        <span>{heading}</span>
        <span className="bp-meta">{findings.length}</span>
      </div>

      {/* Auto-advance gate — pairs the error tone with explicit text. */}
      {errorCount > 0 && (
        <div className="lb-form-error" role="status" style={{ margin: '0 0 12px' }}>
          <LabelingIcon name="xCircle" size={14} />
          {errorCount === 1
            ? '1 error must be resolved before this segment can auto-advance.'
            : `${errorCount} errors must be resolved before this segment can auto-advance.`}
        </div>
      )}

      {isLoading ? (
        <div className="lb-state" role="status">Running QA checks…</div>
      ) : findings.length === 0 ? (
        <Empty>No QA findings. This segment passed every check.</Empty>
      ) : (
        <div className="lb-form" style={{ maxWidth: 'none', gap: 16 }}>
          {SEVERITY_ORDER.map((sev) => {
            const items = groups[sev];
            if (items.length === 0) return null;
            const meta = SEVERITY_META[sev];
            return (
              <div key={sev}>
                <div
                  className={`lb-chip lb-chip-${meta.tone}`}
                  style={{ marginBottom: 8 }}
                >
                  <LabelingIcon name={meta.icon} size={12} />
                  {meta.label} · {items.length}
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map((f, i) => (
                    <li
                      key={`${f.checkId}-${i}`}
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'flex-start',
                        padding: '8px 10px',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        background: 'var(--bg-000)',
                      }}
                    >
                      <span className={`lb-chip lb-chip-${meta.tone}`} style={{ flexShrink: 0 }}>
                        <LabelingIcon name={meta.icon} size={12} />
                        <span className="lb-sr-only">{sev}</span>
                        {sev}
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-100)' }}>{f.message}</span>
                        <span className="lb-mono">{f.checkId}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default QaFindingsPanel;
