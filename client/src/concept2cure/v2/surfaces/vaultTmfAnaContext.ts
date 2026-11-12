/**
 * What AnA can see of the trial master file section: only what the section read (P-124; eTMF admission, 2026-11-12).
 *
 * Split out of surfaces/Etmf.tsx, unchanged, when the section moved into the Vault's Required documents view: the
 * Vault tells AnA the same as the page that hosted the section did. A study being read, a read that failed, no
 * study, several to choose from, or the verdict and figures as the server gave them. Nothing is computed here.
 */
import { tmfArtifactName } from '@shared/constants/domain/tmf-reference-model';
import { readRefusalWords } from '../dataConnect';
import type { SurfaceContext } from '../surfaceContext';
import type { TmfSectionState } from './VaultTrialMasterFile';
import { NOT_ASSESSED, SCOPE_LABEL, tmfFigures, tmfFiguresSentence, tmfVerdict, tmfVerdictSentence } from './vaultTmf';

export type AnaContext = Omit<SurfaceContext, 'surfaceId'>;
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

/**
 * One study's trial master file in the scope on screen: being read, not read,
 * or the verdict as the server gave it, with the figures the screen shows.
 */
function studyContext({ study, scope, completeness }: StudyShown): AnaContext {
  const name = study.title?.trim() || study.studyId;
  const checked = SCOPE_LABEL[scope].toLowerCase();
  const facts = { studyId: study.studyId, study: name, scope };
  if (completeness.loading) return { summary: `The trial master file of ${name} (${checked}) is being read; nothing on screen is final yet.`, facts };
  const result = completeness.data;
  if (!result) {
    const refusal = readRefusalWords(completeness, 'the trial master file');
    return { summary: `${refusal ? refusal.message : `The trial master file of ${name} (${checked}) could not be read.`} ${NOT_EMPTY}`, facts };
  }
  const verdict = tmfVerdict(result);
  // The screen shows no figures where the answer states none (nothing assessed, or no count given), so none is told.
  const figures = tmfFiguresSentence(result);
  const missing = result.zones.flatMap((z) => z.missing.map((code) => ({ zone: z.number, code, name: tmfArtifactName(code) })));
  return {
    summary: `Trial master file of ${name}, ${checked}. ${tmfVerdictSentence(verdict, result)}${figures ? ` ${figures}` : ''} ${NOT_ASSESSED}`,
    facts: {
      ...facts,
      verdict,
      // The server's own answer. null is "not determined": neither ready nor not ready.
      ready: result.ready,
      basis: result.basis ?? null,
      counts: result.summary,
      figures: tmfFigures(result),
      zones: result.zones.map((z) => ({ number: z.number, name: z.name, required: z.required.length, filed: z.present.length })),
      // Capped: enough to name a record back to the person. `counts.totalMissing` is how many there are.
      missing: missing.slice(0, 20),
    },
    availableActions: [
      'Switch between the essential records and all records of the reference model',
      'File a document from this project’s Vault against a record that is not filed, with a reason (a role that may write the Vault)',
      'Upload a file from the person’s computer into this project’s Vault and file it against a record in one step, with a reason (a role that may write the Vault)',
      'Remove a filing, with a reason (a role that may write the Vault)',
      'Download the inspection package for the scope on screen',
    ],
  };
}

/** What AnA can see of the section once a project is open: being read, or what it read. */
export function tmfSectionAnaContext(shown: TmfSectionState | null): AnaContext {
  if (!shown) return { summary: 'The open project’s trial master file is being read; nothing on screen is final yet.' };
  return shown.study === null ? studiesContext(shown) : studyContext(shown);
}
