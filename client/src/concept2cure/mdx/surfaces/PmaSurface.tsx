/**
 * PMA surface — 10-phase grid · 4 trial KPIs · 6 module cards.
 * Ported from Surfaces.jsx > PMASurface.
 */

import * as React from 'react';
import { I } from '../icons';
import { PMA_MODULES, PMA_PHASES, PMA_TRIAL_METRICS, type PmaPhase } from '../data/pma';
import type { Program } from '../data/programs';
import { useProgramExtras } from '../hooks/useProgramExtras';
import { PathwayPanes } from './pathway/PathwayPanes';

export interface PmaSurfaceProps {
  /** Active PMA program from App.tsx. When null, the surface renders the
      kit's canonical fixture demo (used in the design tool / before a
      program is selected). */
  program: Program | null;
  onAskAna: (text: string) => void;
  onOpenEditor?: () => void;
}

/* Derive per-phase status + pct from the active program's stageIdx +
   readiness. The 10-phase taxonomy is closed-enum kit content (the PMA
   pathway has these phases by definition); only the active position +
   progress is dynamic. */
function derivePhases(program: Program | null): PmaPhase[] {
  if (!program) return PMA_PHASES;
  /* Map kit's 7 stage codes onto the PMA 10-phase grid. The kit's
     stageIdx (0..7) and the PMA grid (0..9) don't line up 1:1 — PMA
     adds a 'pivotal trial' and 'advisory panel' that aren't in the
     generic 7-stage timeline. We approximate:
        kit 0 (Intake)        → presub        (idx 0)
        kit 1 (Classify)      → preclin       (idx 1)
        kit 2 (Predicate)     → ide           (idx 2)
        kit 3 (Performance)   → mfg           (idx 3)
        kit 4 (SE)            → pivotal       (idx 4)
        kit 5 (Assemble)      → labeling+mod  (idx 5–6)
        kit 6 (Submit)        → panel+app     (idx 7–8)
        kit 7 (Cleared)       → postapp       (idx 9) */
  const KIT_TO_PMA: Record<number, number> = {
    0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 6, 6: 8, 7: 9,
  };
  const activeIdx = KIT_TO_PMA[program.stageIdx] ?? 4;
  return PMA_PHASES.map((p, i) => {
    if (i < activeIdx) return { ...p, pct: 100, status: 'complete' };
    if (i === activeIdx) {
      const status = program.status === 'blocked' ? 'blocked' : 'active';
      return { ...p, pct: program.readiness, status };
    }
    return { ...p, pct: 0, status: 'idle' };
  });
}

export function PmaSurface({ program, onAskAna, onOpenEditor }: PmaSurfaceProps) {
  const phases = derivePhases(program);
  const activeIdx = phases.findIndex(p => p.status === 'active' || p.status === 'blocked');
  const activeLabel = phases[Math.max(activeIdx, 0)]?.label ?? PMA_PHASES[4].label;

  /* Live PMA modules + trial metrics. Modules group cerv2_510k_sections by
     PMA module taxonomy (preclinical / clinical / manufacturing /
     labeling / statistical / financial). Trial metrics join to
     clinical_ops.studies for the program's enrollment / sites / AE
     rate / endpoints. Falls back to kit fixtures during load + on error. */
  const extras = useProgramExtras(program?.id ?? null);
  const sourceModules = extras.pmaModules && extras.pmaModules.length > 0
    ? extras.pmaModules
    : PMA_MODULES;
  const sourceTrialMetrics = extras.pmaTrialMetrics && extras.pmaTrialMetrics.length > 0
    ? extras.pmaTrialMetrics
    : PMA_TRIAL_METRICS;
  const totalDocs = sourceModules.reduce((s, m) => s + m.docs, 0);

  const workspace = (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">
            PMA pathway · {program ? program.title : 'CV-330 Implantable Monitor'}
          </div>
          <div className="section-sub">
            Phase {Math.max(activeIdx, 0) + 1} of {phases.length} — {activeLabel}
            {program ? ` · ${program.dueLabel}` : ' · PMA filing Q3 2026'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="section-more" onClick={onOpenEditor}>Open module editor {I.right}</button>
        </div>
      </div>

      <div className="phases">
        {phases.map((p, i) => (
          <div key={p.id} className={`phase ${p.status}`}>
            <div className="phase-label">
              {i + 1}. {p.label}
            </div>
            <div className="phase-bar">
              <div className="phase-bar-fill" style={{ width: `${p.pct}%` }} />
            </div>
            <div
              className="phase-pct"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>{p.pct}%</span>
              <span className={`status-dot ${p.status}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="health">
        {sourceTrialMetrics.map((d, i) => (
          <div key={i} className="health-card">
            <div className="health-label">{d.label}</div>
            <div className="health-metric">
              {d.metric}
              {d.unit && <span className="unit">{d.unit}</span>}
            </div>
            {d.bar && (
              <div className="readiness">
                <div
                  className={`readiness-fill ${d.bar.tone || ''}`}
                  style={{ width: `${d.bar.pct}%` }}
                />
              </div>
            )}
            <div className={`health-meta ${d.tone || ''}`}>{d.meta}</div>
          </div>
        ))}
      </div>

      <div className="section-hdr">
        <div>
          <div className="section-title">PMA modules</div>
          <div className="section-sub">
            Section-by-section assembly · {totalDocs} document{totalDocs === 1 ? '' : 's'} total
          </div>
        </div>
      </div>
      <div className="pma-modules">
        {sourceModules.map(m => (
          <button
            key={m.id}
            className="pma-mod"
            onClick={() =>
              onAskAna(
                `Open PMA module "${m.label}" — ${m.docs} documents · status: ${m.status}. ` +
                  `Walk me through what's open and where I should focus.`,
              )
            }
            title={`Open ${m.label}`}
          >
            <div className="pma-mod-hdr">
              <div className="pma-mod-label">{m.label}</div>
              <span className={`status-pill ${m.status}`}>{m.status}</span>
            </div>
            <div className="pma-mod-desc">{m.desc}</div>
            <div className="pma-mod-foot">
              <span>{m.docs} documents</span>
              <span>{I.chevronRight}</span>
            </div>
          </button>
        ))}
      </div>
    </>
  );

  return (
    <PathwayPanes
      pathway="pma"
      workspace={workspace}
      onAskAna={onAskAna}
      onOpenEditor={onOpenEditor}
    />
  );
}
