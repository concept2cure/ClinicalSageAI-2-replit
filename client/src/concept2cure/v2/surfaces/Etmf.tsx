/**
 * The eTMF's own page (surface `etmf`): the door to the trial master file, which lives in the Vault.
 *
 * The eTMF was admitted to the Vault app on 2026-11-12 (P-74 item 1, P-75, P-124 item 6). The study's trial master
 * file is a section of the Vault's Required documents view (surfaces/VaultTrialMasterFile.tsx, hosted by
 * surfaces/Vault.tsx), and the Vault's header button, "Trial master file", shows it there. This page is what the
 * module's path in the Apps catalog (/concept2cure/etmf) and a link to the surface reach: with a project open it
 * opens the Vault on that section, once; with none it says that a trial master file belongs to a project's study.
 *
 * Until 2026-11-12 this page hosted the section itself, because the Vault could not call /api/etmf before admission
 * (ci:launch-scope-api). It no longer does: one place for the trial master file, not two (CLAUDE.md RULE 4). What AnA
 * could see of it here (the study, the verdict as the server gave it, the counts) the Vault now tells AnA
 * (surfaces/vaultTmfAnaContext.ts). Before that, until 2026-11-10, this file was a screen of its own with a trial id
 * typed by hand; docs/evidence/D2-ETMF/2026-11-10-vault-section/README.md maps where each of its parts went.
 */
import React, { useEffect, useMemo } from 'react';
import { I } from '../icons';
import { EmptyState, ProjectBack } from '../dataConnect';
import { shellProgramId, useShellProject } from '../shellProject';
import { usePublishSurfaceContext } from '../surfaceContext';
import type { SurfaceViewProps } from '../surfaceViews';
import { openVaultTrialMasterFile } from './VaultTrialMasterFile';
import type { AnaContext } from './vaultTmfAnaContext';
import '../styles/project-home-v2.css';

/** What AnA can see of this page: no project, or the Vault being opened on the trial master file. */
export function etmfAnaContext(projectOpen: boolean): AnaContext {
  if (!projectOpen) {
    return {
      summary: 'A trial master file belongs to a project’s study, and no project is open, so nothing is on screen. This is not an empty trial master file.',
      availableActions: ['Open a project from Projects'],
    };
  }
  return { summary: 'The trial master file is a section of the Vault’s Required documents view; the Vault is being opened there.' };
}

export function Etmf({ onNav }: SurfaceViewProps) {
  const projectId = shellProgramId(useShellProject());
  const context = useMemo(() => etmfAnaContext(projectId !== null), [projectId]);
  usePublishSurfaceContext('etmf', context);
  useEffect(() => { if (projectId) openVaultTrialMasterFile(onNav); }, [projectId, onNav]);

  return (
    <div className="page-inner" data-work-area="etmf">
      <ProjectBack onNav={onNav} />
      <header className="ph">
        <div>
          <h1 className="ph-title">Trial master file</h1>
          <p className="ph-sub">The records of a study, in the project’s Vault: what is filed, against which document, and what is missing.</p>
        </div>
      </header>
      {projectId ? (
        <p className="sec-sub" role="status" data-testid="etmf-opening">Opening the trial master file in the project’s Vault…</p>
      ) : (
        <EmptyState
          icon={I.folder}
          title="Open a project to see its trial master file"
          hint="A trial master file belongs to a study, and a study belongs to a project. It is kept in the project’s Vault. No project is open, so there is nothing to show."
          action={{ label: 'Open Projects', onAct: () => onNav('projects') }}
          testId="etmf-no-project"
        />
      )}
    </div>
  );
}
