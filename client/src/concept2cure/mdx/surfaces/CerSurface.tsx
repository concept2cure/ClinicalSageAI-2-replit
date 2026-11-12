/**
 * CerSurface — the CER workbench (surface id 'device-cer'), hosting six tabs
 * over REAL backends inside the shared PathwayPanes wrapper:
 *
 *   Signals      /api/regulatory-programs/:id/safety-signals   (useProgramExtras)
 *   Literature   corpus feed + GET /api/cerv2/literature/search (pubmed-client)
 *   GSPR         /api/gspr catalog · mappings · coverage
 *   Equivalence  program record equivalent_devices (read-only — no matrix backend)
 *   PMS/PMCF     /api/post-market documentation-status + draft generation
 *   Generator    sections · MEDDEV structure check · governed /api/cerv2/export
 *
 * Layout follows ui_kits/mdx_phase2/CerWorkbench.jsx; every tab
 * renders honest loading, empty and error states, and none renders fixture
 * data. Shared per-program fetches (sections,
 * program extras, device profile) live here so switching tabs never re-fetches
 * them; tab-specific feeds load lazily when their tab first opens.
 *
 * P-114 item 3, 2026-11-12 (decided under the founder's delegation; MDX journey
 * M3): an EU MDR technical documentation project opens this screen from its
 * assembly door, and its filing is the Annex II and III file, of which the CER
 * is one part. For such a project the header also assembles that file, from the
 * project's own governed document, through the per-project route. A CER project
 * files its report and is offered no technical file.
 */

import * as React from 'react';
import { I } from '../icons';
import type { Program } from '../data/programs';
import { useK510EstarSections } from '../hooks/useK510';
import { useProgramExtras } from '../hooks/useProgramExtras';
import { useDeviceProfile } from '../hooks/useDeviceProfile';
import { PathwayPanes } from './pathway/PathwayPanes';
import { CerTabBar, CerTabPanel, type CerTabDef, type CerTabId } from './cer/CerTabs';
import { SignalsTab } from './cer/SignalsTab';
import { LiteratureTab } from './cer/LiteratureTab';
import { GsprMatrixTab } from './cer/GsprMatrixTab';
import { EquivalenceTab } from './cer/EquivalenceTab';
import { PmsPmcfTab } from './cer/PmsPmcfTab';
import { GeneratorTab } from './cer/GeneratorTab';
import type { EditorSectionRef } from '../../v2/editorTarget';
import { technicalFileStatusLine, useTechnicalFileExport } from '../hooks/useCerExport';
import { euTechnicalFileRegulation } from '@shared/constants/mdx';

export interface CerSurfaceProps {
  /** Active CER program from the shell's selection. */
  program: Program | null;
  onAskAna: (text: string) => void;
  /** Open the one document editor; a section ref deep-links to that section
   *  (Generator tab rows, DossierDrawer hand-off). */
  onOpenEditor?: (section?: EditorSectionRef) => void;
  /** Open a letter in Communication on its record (P-39 step 3, S2). */
  onOpenLetter?: (letterId: string) => void;
}

export function CerSurface({ program, onAskAna, onOpenEditor, onOpenLetter }: CerSurfaceProps) {
  const programId = program?.id ?? null;
  const [tab, setTab] = React.useState<CerTabId>('signals');

  /* CER sections live in the same cerv2_510k_sections table used by 510(k)
     and PMA — the legacy table name spans all three pathways. */
  const sectionsState = useK510EstarSections(programId, 'cer');

  /* Live safety signals + year-bucketed literature corpus, per-program. */
  const extras = useProgramExtras(programId);

  /* The program row (device profile + equivalent_devices), shared by the
     Equivalence and PMS/PMCF tabs. */
  const profileState = useDeviceProfile(programId);

  const includedSignalCount =
    extras.safetySignals?.filter((s) => s.status === 'included').length ?? 0;

  /* P-114 item 3: the EU regulation this project files its technical
     documentation under, from its recorded filing; null for a CER project. */
  const euRegulation = euTechnicalFileRegulation(program?.programType);
  const technicalFile = useTechnicalFileExport(programId);
  const technicalFileStatus = euRegulation
    ? technicalFileStatusLine(technicalFile.busy, technicalFile.outcome, euRegulation)
    : null;

  const tabs: CerTabDef[] = [
    {
      id: 'signals',
      label: 'Signals',
      sub: 'FAERS · MAUDE · Eudamed',
      count: extras.safetySignals?.length,
    },
    { id: 'literature', label: 'Literature', sub: 'Corpus · PubMed search' },
    { id: 'gspr', label: 'GSPR', sub: 'Annex I conformity' },
    { id: 'equivalence', label: 'Equivalence', sub: 'Article 61(5)' },
    { id: 'pms', label: 'PMS / PMCF', sub: 'Article 83 · Annex XIV B' },
    { id: 'generator', label: 'Generator', sub: 'Structure · export' },
  ];

  const workspace = (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">
            Clinical Evaluation Report{program ? ` · ${program.title}` : ''}
          </div>
          <div className="section-sub">
            {program
              ? `EU MDR Article 61 · ${program.dueLabel}`
              : 'EU MDR Article 61 · select a CER project to load its evaluation'}
          </div>
        </div>
        <div>
          <button
            className="section-more"
            onClick={() =>
              onAskAna(
                `Generate the CER draft for ${program ? program.title : 'the selected project'} — pull from the included ` +
                  'safety signals, the literature corpus, and the equivalence data. Mark gaps in narrative form.',
              )
            }
          >
            Generate draft {I.sparkles}
          </button>
          {euRegulation && (
            <button
              className="section-more"
              style={{ marginLeft: 8 }}
              disabled={technicalFile.busy}
              title={`Assemble a ZIP of this project’s written ${euRegulation.toUpperCase()} Annex II and III sections, with its manifest and checksums. It is not sent to a Notified Body.`}
              onClick={() => void technicalFile.assemble(euRegulation)}
            >
              Assemble technical file {I.fileText}
            </button>
          )}
        </div>
      </div>

      {technicalFileStatus && (
        <div className="section-sub" role="status" style={{ marginTop: 4 }} data-testid="technical-file-status">
          {technicalFileStatus}
        </div>
      )}

      <CerTabBar tabs={tabs} active={tab} onSelect={setTab} />

      <CerTabPanel id="signals" active={tab}>
        <SignalsTab
          signals={extras.safetySignals}
          loading={extras.loading}
          programTitle={program?.title ?? null}
          onAskAna={onAskAna}
        />
      </CerTabPanel>

      <CerTabPanel id="literature" active={tab}>
        <LiteratureTab
          literature={extras.literature}
          literatureTotal={extras.literatureTotal}
          loading={extras.loading}
          programId={programId}
          programTitle={program?.title ?? null}
          onAskAna={onAskAna}
        />
      </CerTabPanel>

      <CerTabPanel id="gspr" active={tab}>
        <GsprMatrixTab
          programId={programId}
          defaultRegulation={program?.pathway === 'ivdr' ? 'IVDR' : 'MDR'}
          onAskAna={onAskAna}
        />
      </CerTabPanel>

      <CerTabPanel id="equivalence" active={tab}>
        <EquivalenceTab
          profile={profileState.profile}
          profileLoading={profileState.loading}
          profileError={profileState.error}
          programTitle={program?.title ?? null}
          onAskAna={onAskAna}
        />
      </CerTabPanel>

      <CerTabPanel id="pms" active={tab}>
        <PmsPmcfTab programId={programId} profile={profileState.profile} onAskAna={onAskAna} />
      </CerTabPanel>

      <CerTabPanel id="generator" active={tab}>
        <GeneratorTab
          program={program}
          sections={sectionsState.rows}
          sectionsLoading={sectionsState.loading}
          sectionsError={sectionsState.error}
          refreshSections={sectionsState.refresh}
          includedSignalCount={includedSignalCount}
          literatureTotal={extras.literatureTotal}
          profile={profileState.profile}
          onAskAna={onAskAna}
          onOpenEditor={onOpenEditor}
        />
      </CerTabPanel>
    </>
  );

  return (
    <PathwayPanes
      pathway="cer"
      workspace={workspace}
      onAskAna={onAskAna}
      onOpenEditor={onOpenEditor}
      programId={programId}
      onOpenLetter={onOpenLetter}
    />
  );
}
