/**
 * PDEV Contradictions registry — 2-pane registry of cross-artifact
 * inconsistencies.
 *
 * Per PHASE_7_INSTALL.md §8 Phase 7.3:
 *   - 2-pane layout (list | detail)
 *   - blocks_promotion contradictions surface "Execute consequence" action
 *     with 30-char reason floor
 *
 * Port basis: design-system/ui_kits/pdev/Surfaces.jsx > PdevContradictions.
 */

import * as React from 'react';
import { PdevIcon } from '../icons';
import type {
  PdevContradiction,
  PdevContradictionsPayload,
} from '../data/types';

interface ContradictionsProps {
  programCode: string;
  payload: PdevContradictionsPayload;
  onAskAna: (text: string) => void;
}

export function PdevContradictionsSurface({
  programCode,
  payload,
  onAskAna,
}: ContradictionsProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(
    payload.contradictions[0]?.id ?? null,
  );

  React.useEffect(() => {
    if (
      selectedId &&
      !payload.contradictions.find((c) => c.id === selectedId)
    ) {
      setSelectedId(payload.contradictions[0]?.id ?? null);
    }
  }, [payload.contradictions, selectedId]);

  const selected: PdevContradiction | undefined = payload.contradictions.find(
    (c) => c.id === selectedId,
  );
  const blocking = payload.contradictions.filter(
    (c) => c.authorityState === 'blocks_promotion',
  ).length;

  return (
    <>
      <div className="pdev-page-header">
        <div>
          <div className="pdev-page-eyebrow">PDEV · {programCode}</div>
          <h1 className="pdev-page-title">Contradictions registry</h1>
          <div className="pdev-page-sub">
            {payload.contradictions.length} cross-artifact inconsistencies
            {blocking > 0 && ` · ${blocking} block promotion`}
          </div>
        </div>
        <div className="pdev-page-actions">
          <button
            className="pdev-btn ghost"
            onClick={() =>
              onAskAna('Show me what blocks IND promotion right now')
            }
            type="button"
          >
            <PdevIcon name="sparkles" /> Triage
          </button>
        </div>
      </div>

      {payload.contradictions.length === 0 ? (
        <div className="pdev-section">
          <div className="pdev-empty">No contradictions detected.</div>
        </div>
      ) : (
        <div className="pdev-contradiction-layout">
          <section className="pdev-section pdev-contradiction-table">
            <div className="pdev-section-head">
              <h2>All contradictions</h2>
            </div>
            {payload.contradictions.map((c) => (
              <button
                key={c.id}
                className="pdev-contradiction-row"
                data-on={selectedId === c.id || undefined}
                onClick={() => setSelectedId(c.id)}
                type="button"
              >
                <span className={`pdev-sev-dot tone-${c.severity}`} />
                <div className="pdev-contradiction-body">
                  <div className="pdev-contradiction-head">
                    <span className="mono pdev-contradiction-id">{c.id}</span>
                    <span
                      className={`pdev-authority-pill pdev-authority-${c.authorityState.replace(/_/g, '-')}`}
                    >
                      {c.authorityState.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="pdev-contradiction-pair">
                    <span className="mono">{c.objectA.split(' · ')[0]}</span>
                    <span className="vs">vs</span>
                    <span className="mono">{c.objectB.split(' · ')[0]}</span>
                  </div>
                  <div className="pdev-contradiction-meta mono small">
                    {c.type} · {c.reviewState.replace(/_/g, ' ')} ·{' '}
                    {new Date(c.when).toLocaleDateString()}
                  </div>
                </div>
              </button>
            ))}
          </section>

          {selected && (
            <section className="pdev-section pdev-contradiction-detail">
              <div className="pdev-contradiction-detail-head">
                <span className={`pdev-sev-dot tone-${selected.severity}`} />
                <span className="mono pdev-contradiction-id">{selected.id}</span>
                <span
                  className={`pdev-authority-pill pdev-authority-${selected.authorityState.replace(/_/g, '-')}`}
                >
                  {selected.authorityState.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="pdev-contradiction-pair-detail">
                <div className="pdev-contradiction-object">
                  <div className="lbl">Object A</div>
                  <div className="val mono">{selected.objectA}</div>
                </div>
                <div className="pdev-contradiction-vs">vs</div>
                <div className="pdev-contradiction-object">
                  <div className="lbl">Object B</div>
                  <div className="val mono">{selected.objectB}</div>
                </div>
              </div>
              <div className="pdev-contradiction-desc">{selected.desc}</div>
              <div className="pdev-contradiction-meta">
                <span className="lbl">Type</span>
                <span className="val mono">{selected.type}</span>
                <span className="lbl">Review state</span>
                <span className="val">
                  {selected.reviewState.replace(/_/g, ' ')}
                </span>
                <span className="lbl">Regulatory body</span>
                <span className="val">{selected.regulatoryBody}</span>
              </div>
              <div className="pdev-contradiction-actions">
                <button
                  className="pdev-btn ghost"
                  onClick={() =>
                    onAskAna(`Open ${selected.objectA.split(' · ')[0]}`)
                  }
                  type="button"
                >
                  <PdevIcon name="arrowRight" /> Open object A
                </button>
                <button
                  className="pdev-btn ghost"
                  onClick={() =>
                    onAskAna(`Open ${selected.objectB.split(' · ')[0]}`)
                  }
                  type="button"
                >
                  <PdevIcon name="arrowRight" /> Open object B
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
