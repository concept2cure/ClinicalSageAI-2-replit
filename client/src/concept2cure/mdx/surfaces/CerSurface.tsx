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
 * renders honest loading/empty/error states, with kit fixtures reachable only
 * through the explicit sample-mode guard. Shared per-program fetches (sections,
 * program extras, device profile) live here so switching tabs never re-fetches
 * them; tab-specific feeds load lazily when their tab first opens.
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

export interface CerSurfaceProps {
  /** Active CER program from the shell's selection. */
  program: Program | null;
  onAskAna: (text: string) => void;
  /** Open the one document editor; a section ref deep-links to that section
   *  (Generator tab rows, DossierDrawer hand-off). */
  onOpenEditor?: (section?: EditorSectionRef) => void;
}

export function CerSurface({ program, onAskAna, onOpenEditor }: CerSurfaceProps) {
  const programId = program?.id ?? null;
  const [tab, setTab] = React.useState<CerTabId>('signals');

  /* CER sections live in the same cerv2_510k_sections table used by 510(k)
     and PMA — the legacy table name spans all three pathways. */
  const sectionsState = useK510EstarSections(programId);

  /* Live safety signals + year-bucketed literature corpus, per-program. */
  const extras = useProgramExtras(programId);

  /* The program row (device profile + equivalent_devices), shared by the
     Equivalence and PMS/PMCF tabs. */
  const profileState = useDeviceProfile(programId);

  const includedSignalCount =
    extras.safetySignals?.filter((s) => s.status === 'included').length ?? 0;

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
              : 'EU MDR Article 61 · select a CER program to load its evaluation'}
          </div>
        </div>
        <button
          className="section-more"
          onClick={() =>
            onAskAna(
              `Generate the CER draft for ${program ? program.title : 'the selected program'} — pull from the included ` +
                'safety signals, the literature corpus, and the equivalence data. Mark gaps in narrative form.',
            )
          }
        >
          Generate draft {I.sparkles}
        </button>
      </div>

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
    />
  );
}
