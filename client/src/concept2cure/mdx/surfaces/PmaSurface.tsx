/**
 * PMA surface — 10-phase grid · 4 trial KPIs · 6 module cards.
 * Ported from Surfaces.jsx > PMASurface.
 */

import * as React from 'react';
import { I } from '../icons';
import { PMA_MODULES, PMA_PHASES, PMA_TRIAL_METRICS, type PmaPhase } from '../data/pma';
import type { Program } from '../data/programs';
import { useProgramExtras } from '../hooks/useProgramExtras';
import { DataGate } from '../components/DataGate';
import { toDataState } from '../lib/dataState';
import { useEstarExport, exportStatusLine } from '../hooks/useEstarExport';
import { PathwayPanes } from './pathway/PathwayPanes';
import { EstarFilingPanel } from './EstarFilingPanel';
import { OfficialEstarPanel, officialEstarTypeFor, officialEstarVariantFor } from './OfficialEstarPanel';
import type { EditorSectionRef } from '../../v2/editorTarget';

export interface PmaSurfaceProps {
  /** Active PMA program from App.tsx. When null, the surface renders the
      kit's canonical fixture demo (used in the design tool / before a
      program is selected). */
  program: Program | null;
  onAskAna: (text: string) => void;
  /** Open the one document editor; a section ref deep-links to that section. */
  onOpenEditor?: (section?: EditorSectionRef) => void;
}

/* Derive per-phase status + pct from the active program's stageIdx +
   readiness. The 10-phase taxonomy is closed-enum kit content (the PMA
   pathway has these phases by definition); only the active position +
   progress is dynamic. */
function derivePhases(program: Program | null): PmaPhase[] {
  /* With no program selected there is no progress to report. PMA_PHASES is
     the taxonomy and nothing else now — see its header for the position it
     used to carry and why it no longer does. */
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
     rate / endpoints.

     These two read `Falls back to kit fixtures during load + on error`, and
     did exactly that, through a ternary rather than a `??`:

         extras.pmaTrialMetrics?.length ? extras.pmaTrialMetrics : PMA_TRIAL_METRICS

     which is the pattern ../lib/useSampleRows.ts was written to delete, firing
     on precisely the occasions a user cannot detect — an empty tenant, an
     expired token, a 500, a fetch that has not started. What it substituted is
     not neutral: PMA_TRIAL_METRICS asserts `Enrolled 412 / 680 · Behind plan by
     3 weeks` and `Adverse events 47 · 3 serious · 2 device-related under
     adjudication`, and PMA_MODULES describes `CV-330 IDE pivotal — 412/680
     enrolled · 14 sites` and three facilities under audit. A regulated user
     whose read failed saw another company's enrolment and another company's
     serious adverse events as their own programme's, with no banner.

     `ci:fixture-fallback` did not catch it: that gate keys on `live ?? FIXTURE`
     and on a FIXTURE_/SAMPLE_/DEMO_ name, and this is a ternary over constants
     named for the pathway.

     Both go through DataGate now, which separates loading from error from empty
     from idle, and renders the kit content only under explicit sample mode —
     impossible in a production build — always under its standing banner. */
  const extras = useProgramExtras(program?.id ?? null);
  const modulesState = toDataState(extras.pmaModules, extras.loading, extras.error, {
    idleReason: 'PMA module assembly is held per program.',
  });
  const trialState = toDataState(extras.pmaTrialMetrics, extras.loading, extras.error, {
    idleReason: 'Pivotal-trial figures are held per program.',
  });

  /* Real export action — POST /api/510k/estar/build with the program's ident
     and useProjectContent. The server reads THIS program's governed PMA
     document (the 21 CFR 814.20 sections authored in the editor) and renders
     one PDF per authored section plus the combined PDF/DOCX, labelled as a
     draft content package — NOT the official FDA eSTAR. Same hook, same
     entitlement contract (locked-never-dead) as the 510(k) surface. */
  const estarExport = useEstarExport();
  const exportStatus = exportStatusLine(estarExport.busy, estarExport.outcome);
  const entitlementLocked = estarExport.outcome?.blockedByEntitlement === true;
  const lockedTitle = entitlementLocked
    ? estarExport.outcome?.requiredTier
      ? `Locked — requires the ${estarExport.outcome.requiredTier} plan (device assembly readiness)`
      : 'Locked — requires a higher plan (device assembly readiness)'
    : null;

  const workspace = (
    <>
      <div className="section-hdr">
        <div>
          {/* With no PMA program this read "PMA pathway · CV-330 Implantable
              Monitor" over "Phase 1 of 10 — Pre-submission · PMA filing Q3
              2026": an invented device, an invented filing date, and a phase
              claimed as current, all as inline literals with no sample-mode
              guard, so they shipped to any tenant whose programme list has no
              pathway === 'pma' row. The phase claim was the quietest of the
              three — Math.max(activeIdx, 0) turns "no active phase" (-1) into
              "phase 1", which is then asserted beside ten bars reading 0%.
              Nothing is named here that the program did not supply. */}
          <div className="section-title">
            PMA pathway{program ? ` · ${program.title}` : ''}
          </div>
          <div className="section-sub">
            {program
              ? `Phase ${Math.max(activeIdx, 0) + 1} of ${phases.length} — ${activeLabel} · ${program.dueLabel}`
              : `${phases.length} phases · position is set by the active program`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* No section named — deliberately `()`, not the click event. Passing
              the handler bare would hand the MouseEvent to the editor channel
              as though it were a section ref. */}
          <button className="section-more" onClick={() => onOpenEditor?.()}>Open module editor {I.right}</button>
          <button
            className="section-more"
            disabled={estarExport.busy || !program || entitlementLocked}
            title={
              lockedTitle ??
              (program
                ? 'Assemble a draft ZIP of your authored 21 CFR 814.20 sections (one PDF per section plus the combined PDF/DOCX) — NOT the official FDA eSTAR that CDRH ingests'
                : 'Select a PMA program first')
            }
            onClick={() => {
              if (!program) return;
              void estarExport.exportDraftPackage({ id: program.id, code: program.code, title: program.title });
            }}
          >
            Export PMA package (draft) {I.download}
          </button>
        </div>
      </div>

      {exportStatus && (
        <div className="section-sub" role="status" style={{ marginTop: 4 }}>
          {entitlementLocked ? (
            <span className="status-pill review" style={{ marginRight: 6 }}>
              Locked
            </span>
          ) : null}
          {exportStatus}
        </div>
      )}

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

      <DataGate
        state={trialState}
        label="pivotal-trial figures"
        sample={PMA_TRIAL_METRICS}
        emptyHint="Enrolment, sites and endpoint figures appear here once this program has a registered study."
      >
        {(metrics) => (
      <div className="health">
        {metrics.map((d, i) => (
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
        )}
      </DataGate>

      <DataGate
        state={modulesState}
        label="PMA modules"
        sample={PMA_MODULES}
        emptyHint="Modules appear here once 21 CFR 814.20 sections are authored for this program."
      >
        {(mods) => (
      <>
      <div className="section-hdr">
        <div>
          <div className="section-title">PMA modules</div>
          <div className="section-sub">
            Section-by-section assembly · {mods.reduce((n, m) => n + m.docs, 0)} document{mods.reduce((n, m) => n + m.docs, 0) === 1 ? '' : 's'} total
          </div>
        </div>
      </div>
      <div className="pma-modules">
        {mods.map(m => (
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
        )}
      </DataGate>

      {/* The official FDA eSTAR PDF — readiness gate, the governed field
          preview and the one Generate control, produced on the same vendored
          nIVD / IVD template FDA ships for 510(k), De Novo and PMA. Both the
          family and the pathway follow the PROGRAM, never this surface: a
          literal type="pma" here mapped a De Novo or 510(k) program opened on
          the PMA surface onto the PMA field map. The draft package button in
          the header stays: it is the authored-content ZIP, not the official
          eSTAR. */}
      <OfficialEstarPanel program={program} type={officialEstarTypeFor(program)} variant={officialEstarVariantFor(program)} />

      {/* eSTAR filing journey — live registration prerequisites + tracked
          submissions (register → produce → track), org-scoped from the session. */}
      <EstarFilingPanel />
    </>
  );

  return (
    <PathwayPanes
      pathway="pma"
      workspace={workspace}
      onAskAna={onAskAna}
      onOpenEditor={onOpenEditor}
      programId={program?.id ?? null}
    />
  );
}
