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
import { useSurfaceActionHandlers } from '../../v2/surfaceActions';

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

  /* Selection only. Review-state changes on a contradiction are governed
     (they carry promotion-blocking authority), so they stay in conversation.
     The payload is already resolved when this leaf renders — the host gates
     it — so there is no not-ready state to hold for. */
  useSurfaceActionHandlers('pdev-contradictions', {
    'pdev-contradictions.select-contradiction': (params) => {
      const raw = String(params.contradiction ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a contradiction to open.' };
      const rows = payload.contradictions;
      if (rows.length === 0) {
        return { ok: false, reason: 'No contradictions are recorded for this program, so there is nothing to select.' };
      }
      const needle = raw.toLowerCase();
      const exact = rows.filter((c) => c.id.toLowerCase() === needle);
      const hits = exact.length
        ? exact
        : rows.filter(
            (c) =>
              c.objectA.toLowerCase().includes(needle) || c.objectB.toLowerCase().includes(needle),
          );
      if (hits.length === 0) return { ok: false, reason: `No contradiction named "${raw}".` };
      if (hits.length > 1) {
        return { ok: false, reason: `"${raw}" matches ${hits.length} contradictions — name one exactly.` };
      }
      const c = hits[0];
      setSelectedId(c.id);
      return {
        ok: true,
        detail: `Selected ${c.id} — ${c.objectA.split(' · ')[0]} vs ${c.objectB.split(' · ')[0]}`,
      };
    },
  });

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
          {/* "No contradictions detected." asserted that a detection RAN and came
              back clean. Nothing here establishes that. The registry is a read
              over contradictionEngineService.searchFindings, which returns
              contradictions the engine has already DETECTED and persisted — so an
              empty list is equally the shape of a program nothing has ever scanned.
              (The loading and failed reads are handled by the caller in App.tsx and
              never reach this branch, so this is specifically the read-succeeded,
              nothing-returned case.) Same rule as the submission gate on the v2
              Inconsistency surface: an empty findings set is not a finding of
              "none". */}
          <div className="pdev-empty">
            The registry is empty for this program. It lists contradictions the
            engine has detected, so an empty registry does not confirm a scan
            has run.
          </div>
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
