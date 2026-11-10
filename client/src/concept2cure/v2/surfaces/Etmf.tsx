/**
 * The trial master file of the open project's study (surface `etmf`).
 *
 * This page hosts the one client of /api/etmf: the section the Vault's Required
 * documents view will hold (surfaces/VaultTrialMasterFile.tsx; P-75 puts the
 * eTMF inside the Vault). Until the eTMF is admitted to the Vault app the Vault
 * may not call /api/etmf (ci:launch-scope-api), so the section lives here and
 * the Vault's header button, "Trial master file", opens this page. At admission
 * the section moves into the Vault's Required documents view.
 *
 * Until 2026-11-10 this file was a screen of its own: a trial id typed by hand
 * and bound to no study, an upload-and-file with no reason, a preview of the
 * inspection package. The server now files against a study of the project and
 * requires a reason, so that screen could no longer file. It is retired here
 * rather than kept beside the section (one client, not two). What it did that
 * the section does not yet is recorded in
 * docs/evidence/D2-ETMF/2026-11-10-vault-section/README.md.
 *
 * The page adds only what a page needs: the way back to the project, the
 * title, an honest empty state when no project is open, and what AnA can see
 * of the screen. That is what the section read, told to this page as it reads
 * it; the page makes no read of its own.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { tmfArtifactName } from '@shared/constants/domain/tmf-reference-model';
import { I } from '../icons';
import { EmptyState, ProjectBack, readRefusalWords } from '../dataConnect';
import { shellProgramId, useShellProject } from '../shellProject';
import { usePublishSurfaceContext, type SurfaceContext } from '../surfaceContext';
import type { SurfaceViewProps } from '../surfaceViews';
import { VaultTrialMasterFile, tmfVerdict, tmfVerdictSentence, type TmfSectionState } from './VaultTrialMasterFile';
import '../styles/project-home-v2.css';

type AnaContext = Omit<SurfaceContext, 'surfaceId'>;
type StudiesShown = Extract<TmfSectionState, { study: null }>;
type StudyShown = Exclude<TmfSectionState, { study: null }>;

const NOT_EMPTY = 'The screen states no verdict because of that, not because the trial master file is empty.';

/** The project's studies, before one is on screen: being read, not read, none, or several to choose from. */
function studiesContext({ studies }: StudiesShown): AnaContext {
  if (studies.loading) return { summary: 'The open project’s studies are being read; no trial master file is on screen yet.' };
  if (!studies.data) {
    const refusal = readRefusalWords(studies, 'the project’s studies');
    return {
      summary: `${refusal ? refusal.message : 'The open project’s studies could not be read.'} No trial master file is on screen because of that, ` +
        'not because the project has no study.',
    };
  }
  const count = studies.data.designs.length;
  if (count === 0) {
    return { summary: 'The open project has no study, so it has no trial master file. A study is created in Protocol design.', facts: { studies: 0 } };
  }
  return {
    summary: `The open project has ${count} studies and none is chosen on screen yet. A trial master file is of one study, so none is shown.`,
    facts: { studies: count },
    availableActions: ['Choose the study whose trial master file to show'],
  };
}

/** One study's trial master file: being read, not read, or the verdict as the server gave it with its counts. */
function studyContext({ study, completeness }: StudyShown): AnaContext {
  const name = study.title?.trim() || study.studyId;
  const facts = { studyId: study.studyId, study: name };
  if (completeness.loading) return { summary: `The trial master file of ${name} is being read; nothing on screen is final yet.`, facts };
  const result = completeness.data;
  if (!result) {
    const refusal = readRefusalWords(completeness, 'the trial master file');
    return { summary: `${refusal ? refusal.message : `The trial master file of ${name} could not be read.`} ${NOT_EMPTY}`, facts };
  }
  const verdict = tmfVerdict(result);
  const missing = result.zones.flatMap((z) => z.missing.map((code) => ({ zone: z.number, name: tmfArtifactName(code) })));
  return {
    summary: `Trial master file of ${name}, essential records. ${tmfVerdictSentence(verdict, result)}`,
    facts: {
      ...facts,
      verdict,
      // The server's own answer. null is "not determined": neither ready nor not ready.
      ready: result.ready,
      basis: result.basis ?? null,
      counts: result.summary,
      zones: result.zones.map((z) => ({ number: z.number, name: z.name, required: z.required.length, filed: z.present.length })),
      // Capped: enough to name a record back to the person.
      missing: missing.slice(0, 20),
    },
    availableActions: [
      'File a document from this project’s Vault against a record that is not filed, with a reason (a role that may write the Vault)',
      'Remove a filing, with a reason (a role that may write the Vault)',
      'Download the inspection package',
    ],
  };
}

/** What AnA can see of this page: only what the section read. No project, or nothing read yet, is said as that. */
export function etmfAnaContext(projectOpen: boolean, shown: TmfSectionState | null): AnaContext {
  if (!projectOpen) {
    return {
      summary: 'A trial master file belongs to a project’s study, and no project is open, so nothing is on screen. This is not an empty trial master file.',
      availableActions: ['Open a project from Projects'],
    };
  }
  if (!shown) return { summary: 'The open project’s trial master file is being read; nothing on screen is final yet.' };
  return shown.study === null ? studiesContext(shown) : studyContext(shown);
}

export function Etmf({ onNav }: SurfaceViewProps) {
  const projectId = shellProgramId(useShellProject());
  /* What the section is showing, with the project it read it for: a project opened next never inherits it. */
  const [told, setTold] = useState<{ projectId: string | null; state: TmfSectionState } | null>(null);
  const tell = useCallback((state: TmfSectionState) => setTold({ projectId, state }), [projectId]);
  const shown = told && told.projectId === projectId ? told.state : null;
  const context = useMemo(() => etmfAnaContext(projectId !== null, shown), [projectId, shown]);
  usePublishSurfaceContext('etmf', context);

  return (
    <div className="page-inner" data-work-area="etmf">
      <ProjectBack onNav={onNav} />
      <header className="ph">
        <div>
          <h1 className="ph-title">Trial master file</h1>
          <p className="ph-sub">The essential records of a study: what is filed, against which document, and what is missing.</p>
        </div>
      </header>
      {projectId ? (
        <VaultTrialMasterFile key={projectId} projectId={projectId} active heading="Essential records" onState={tell} />
      ) : (
        <EmptyState
          icon={I.folder}
          title="Open a project to see its trial master file"
          hint="A trial master file belongs to a study, and a study belongs to a project. No project is open, so there is nothing to show."
          action={{ label: 'Open Projects', onAct: () => onNav('projects') }}
          testId="etmf-no-project"
        />
      )}
    </div>
  );
}
