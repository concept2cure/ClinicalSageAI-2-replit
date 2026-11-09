/**
 * PMA surface — 10-phase grid · 4 trial KPIs · the project's 21 CFR 814 modules.
 * Ported from Surfaces.jsx > PMASurface.
 */

import * as React from 'react';
import { I } from '../icons';
import { PMA_PHASES } from '../data/pma';
import type { Program } from '../data/programs';
import { useProgramExtras } from '../hooks/useProgramExtras';
import { useProgramDetail } from '../hooks/useMdxPrograms';
import type { ProgramPhase } from '@shared/constants/mdx';
import { DataGate } from '../components/DataGate';
import { toDataState } from '../lib/dataState';
import { useEstarExport, exportStatusLine } from '../hooks/useEstarExport';
import { PathwayPanes } from './pathway/PathwayPanes';
import { EstarFilingPanel } from './EstarFilingPanel';
import { OfficialEstarPanel, officialEstarTypeFor, officialEstarVariantFor } from './OfficialEstarPanel';
import type { EditorSectionRef } from '../../v2/editorTarget';
import type { PmaModule } from '../hooks/useProgramExtras';

export interface PmaSurfaceProps {
  /** Active PMA program from App.tsx. When null, the surface renders the
      kit's canonical fixture demo (used in the design tool / before a
      program is selected). */
  program: Program | null;
  onAskAna: (text: string) => void;
  /** Open the one document editor; a section ref deep-links to that section. */
  onOpenEditor?: (section?: EditorSectionRef) => void;
  /** Open a letter in Communication on its record (P-39 step 3, S2). */
  onOpenLetter?: (letterId: string) => void;
}

/* Slice 0, the map's `device-pma` row ("it states only the recorded stage, and
   none when none is recorded"), second pass after audit.

   `derivePhases` mapped the kit's stageIdx onto this grid through a table its
   own comment called an approximation, lit that cell with the project's whole
   progress_percent, and the header stated the result as the project's
   position: a recorded `authoring` read "Phase 4 of 10 — Manufacturing
   validation", and a PMA filed and awaiting FDA read "Phase 9 of 10 —
   Approval". Nor is stageIdx recorded: useMdxPrograms derives it, from progress
   bands when no phase is recorded, so a project with none read "Phase 2 of 10
   — Preclinical".

   A project records a generic project phase (PROGRAM_PHASES), never a PMA
   phase. So the header states that phase, read from the project's own row, and
   the grid is the pathway's taxonomy with no cell lit. */
const PROJECT_PHASE_LABEL: Record<ProgramPhase, string> = {
  planning: 'Planning',
  evidence_collection: 'Evidence collection',
  authoring: 'Authoring',
  review: 'Review',
  submission: 'Submission',
  post_market: 'Post-market',
};

/**
 * The project's recorded phase as one sentence, or null with no project. Shared
 * with IvdSurface, whose stage strip had the same defect. A failed read says
 * so; it is never "no phase recorded".
 */
export function useRecordedPhaseLine(programId: string | null): string | null {
  const { detail, loading, error } = useProgramDetail(programId);
  /* Slice 0 (audit 2): the project whose read has started. useFetchJson starts
     the read in an effect, so on the render before it (first mount, or a switch
     of project) the hook still holds the previous project's row or error, and a
     200 with no row in it (useProgramDetail returns `data?.data ?? null`) looked
     like "not asked yet": the line read "Reading the project phase" for as long
     as the screen stayed open. This is set in the same effect flush that starts
     the read, so from the next render on `!loading` means this project's read
     has finished. */
  const [readFor, setReadFor] = React.useState<string | null>(null);
  React.useEffect(() => {
    setReadFor(programId);
  }, [programId]);
  if (!programId) return null;
  if (readFor !== programId || loading) return 'Reading the project phase';
  if (error) return 'The project phase could not be read';
  const row = detail as unknown as { id?: unknown; phase?: unknown } | null;
  const isRow = !!row && typeof row === 'object' && !Array.isArray(row) && row.id != null;
  // Finished, with no row, a malformed one or another project's: not this project's phase.
  if (!isRow || String(row.id) !== programId) return 'The project phase could not be read';
  const phase = row.phase;
  if (typeof phase !== 'string' || !phase.trim()) return 'No project phase recorded';
  return `Project phase: ${PROJECT_PHASE_LABEL[phase as ProgramPhase] ?? phase.replace(/_/g, ' ')}`;
}

/* MDX journey M18 (2026-11-02): a module's state is what the PMA mapper says of
   the project's own PMA document, the same as the assembly verdict. "present"
   is the verdict's word: at least one finished section counts for the module. */
const PMA_MODULE_PILL: Record<PmaModule['status'], { tone: string; text: string }> = {
  present: { tone: 'complete', text: 'present' },
  written: { tone: 'review', text: 'written' },
  not_started: { tone: 'empty', text: 'not started' },
};

/** A row the server's getPmaModules returns; anything else is not a module. */
function isPmaModule(m: unknown): m is PmaModule {
  const r = m as Partial<PmaModule> | null;
  return !!r && typeof r.id === 'string' && typeof r.label === 'string'
    && typeof r.status === 'string' && Object.prototype.hasOwnProperty.call(PMA_MODULE_PILL, r.status)
    && Array.isArray(r.finished) && Array.isArray(r.written);
}

/** What is written in a module, by section code. */
export function pmaModuleFacts(m: PmaModule): string {
  if (m.finished.length) {
    const more = m.written.length ? ` · written: ${m.written.join(', ')}` : '';
    return `Finished: ${m.finished.join(', ')}${more}`;
  }
  if (m.written.length) return `Written, not finished: ${m.written.join(', ')}`;
  return 'Nothing written';
}

export function PmaSurface({ program, onAskAna, onOpenEditor, onOpenLetter }: PmaSurfaceProps) {
  /* Slice 0: the taxonomy, no position — see the note above PROJECT_PHASE_LABEL. */
  const phases = PMA_PHASES;
  const phaseLine = useRecordedPhaseLine(program ? String(program.id) : null);

  /* Live PMA modules + trial metrics. Modules are the project's own PMA
     document scored by the PMA mapper (pathway-engines/pma/pma-mapper.ts), the
     same computation as the assembly verdict; until M18 (2026-11-02) they
     grouped the organization's legacy 510(k) sections by a six-card kit
     taxonomy. Trial metrics join to clinical_ops.studies for the program's
     enrollment / sites / serious protocol deviations / endpoints, from the
     clinical_ops study the project is linked to (M20).

     These two read `Falls back to kit fixtures during load + on error`, and
     did exactly that, through a ternary rather than a `??`:

         extras.pmaTrialMetrics?.length ? extras.pmaTrialMetrics : PMA_TRIAL_METRICS

     which is the `live ?? FIXTURE` pattern spelled as a ternary, firing
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
     from idle. The two fixtures were deleted with sample mode on 2026-10-14. */
  const extras = useProgramExtras(program?.id ?? null);
  /* A row that is not a module is a failed read, said as one: it neither
     throws inside the cards nor passes for "no PMA document". */
  const modulesMalformed = Array.isArray(extras.pmaModules) && !extras.pmaModules.every(isPmaModule);
  const modulesState = toDataState(
    extras.pmaModules,
    extras.loading,
    extras.error ?? (modulesMalformed ? 'The PMA modules could not be read: the answer was not a list of modules.' : null),
    { idleReason: 'PMA module assembly is held per project.' },
  );
  const trialState = toDataState(extras.pmaTrialMetrics, extras.loading, extras.error, {
    idleReason: 'Pivotal-trial figures are held per project.',
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
              Nothing is named here that the program did not supply.
              Slice 0: the program branch claimed a PMA phase mapped from a
              derived stage too; it now states the recorded project phase. */}
          <div className="section-title">
            PMA pathway{program ? ` · ${program.title}` : ''}
          </div>
          <div className="section-sub">
            {program
              ? `${phaseLine} · ${program.dueLabel}`
              : `${phases.length} PMA phases · no project selected`}
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
                : 'Select a PMA project first')
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
              {/* Slice 0: an idle phase's progress is not recorded; "0%" would claim it. */}
              <span>{p.status === 'idle' ? '—' : `${p.pct}%`}</span>
              <span className={`status-dot ${p.status}`} />
            </div>
          </div>
        ))}
      </div>
      {/* Slice 0: say why no phase is lit, so an unlit grid is not read as "nothing started". */}
      {program && (
        <div className="section-sub" data-testid="pma-phase-note">
          The PMA pathway's {phases.length} phases. None is marked: a project records its project phase, stated above,
          not a PMA phase.
        </div>
      )}

      <DataGate
        state={trialState}
        label="pivotal-trial figures"
        emptyHint="Enrolment, sites and endpoint figures appear here once this project has a registered study."
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
        emptyHint="This project has no PMA document, so it has no PMA modules to show."
      >
        {(mods) => {
          const required = mods.filter((m) => m.required);
          const present = required.filter((m) => m.status === 'present').length;
          return (
      <>
      <div className="section-hdr">
        <div>
          <div className="section-title">PMA modules</div>
          <div className="section-sub">
            Original PMA (21 CFR 814.20) · {present} of {required.length} required modules present, as the assembly check
            counts them
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
                `PMA module ${m.module}, "${m.label}": ${pmaModuleFacts(m)}. ` +
                  `Walk me through what's open and where I should focus.`,
              )
            }
            title={`Ask AnA about ${m.label}`}
          >
            <div className="pma-mod-hdr">
              <div className="pma-mod-label">{m.label}</div>
              <span className={`status-pill ${PMA_MODULE_PILL[m.status].tone}`}>{PMA_MODULE_PILL[m.status].text}</span>
            </div>
            <div className="pma-mod-desc">Module {m.module} · {m.required ? 'required' : 'conditional'}</div>
            <div className="pma-mod-foot">
              <span>{pmaModuleFacts(m)}</span>
              <span>{I.chevronRight}</span>
            </div>
          </button>
        ))}
      </div>
      </>
          );
        }}
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
          submissions (register → produce → track), scoped to THIS programme — without programId the readiness verdict
          is computed over every device in the organisation. */}
      <EstarFilingPanel programId={program?.id ?? null} defaultVariant={officialEstarVariantFor(program)} />
    </>
  );

  return (
    <PathwayPanes
      pathway="pma"
      workspace={workspace}
      onAskAna={onAskAna}
      onOpenEditor={onOpenEditor}
      programId={program?.id ?? null}
      onOpenLetter={onOpenLetter}
    />
  );
}
