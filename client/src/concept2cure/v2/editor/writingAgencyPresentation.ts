/** Display/default state for the existing Region control. Generation re-reads
 * authority; this presentation does not resolve a filing or grant drafting. */
import { WRITING_AGENCIES, writingAgencyOf, type DraftingRegionState, type WritingAgency } from '@shared/authoring/writing-regions';
import { getApplicationType } from '@shared/regulatory/global-document-registry';
import { AGENCY_LABEL } from '@shared/regulatory/filing-catalog';
import type { FilingOutlineState } from '../useFilingOutline';
import type { ProgramSummary, ProgramSummaryState } from './programSummary';

export interface RecordedWritingFiling {
  /** Project fallback for genuinely unbound copies and legacy callers only. */
  registryId?: string | null;
  /** Undefined is unbound/legacy; null is a bound scope without a verified agency. */
  verifiedFilingAgency?: string | null;
  boundDocumentType?: string | null;
  draftingRegion?: string | null;
  draftingRegionState?: DraftingRegionState;
  state?: 'loading' | 'ready' | 'error';
}

function scopedReadState(current: boolean, ...states: string[]): NonNullable<RecordedWritingFiling['state']> {
  if (!current || states.includes('loading')) return 'loading';
  return states.includes('error') ? 'error' : 'ready';
}
function currentProgramRegistry(program: ProgramSummary | null, programId: string | null): string | null {
  return program?.id === programId ? program?.registryId ?? null : null;
}
/** Consume existing admitted reads; never infer a registry ID from a filing family. */
export function workbenchWritingFiling(input: {
  binding: { known: boolean; documentId: string | null };
  filing: Pick<FilingOutlineState, 'document' | 'loading' | 'error'>;
  program: ProgramSummary | null; programId: string | null; programReadState: ProgramSummaryState;
  section: Pick<RecordedWritingFiling, 'draftingRegion' | 'draftingRegionState'>;
  sectionsCurrent: boolean; sectionsState: string;
}): RecordedWritingFiling {
  const { binding, filing } = input;
  const state = scopedReadState(input.sectionsCurrent, input.sectionsState);
  if (!binding.known) return { ...input.section, verifiedFilingAgency: null, state: state === 'loading' ? state : 'error' };
  if (binding.documentId === null) return { ...input.section, registryId: currentProgramRegistry(input.program, input.programId),
    state: scopedReadState(input.sectionsCurrent, input.sectionsState, input.programReadState) };
  const selected = filing.document?.id === binding.documentId ? filing.document : null;
  return { ...input.section, verifiedFilingAgency: selected?.agency ?? null, boundDocumentType: selected?.doc_type ?? null,
    state: scopedReadState(input.sectionsCurrent, input.sectionsState, filing.loading ? 'loading' : filing.error || !selected ? 'error' : 'ready') };
}

const agencyKey = (value: string) => value.trim().toUpperCase().replace(/[ _-]/g, '');
const isEuDeviceFiling = (filing: RecordedWritingFiling) => ['cer', 'mdr', 'ivdr'].includes(filing.boundDocumentType?.trim().toLowerCase() ?? '');
/** Display the known storage alias without changing its admission identity. */
export function filingAuthorityLabel(filing: { doc_type: string; agency: string }): string {
  return filing.agency.toLowerCase() === 'ema' && isEuDeviceFiling({ boundDocumentType: filing.doc_type })
    ? AGENCY_LABEL.Notified_Body : filing.agency.toUpperCase();
}
function boundWritingAgency(filing: RecordedWritingFiling): WritingAgency | null {
  const raw = filing.verifiedFilingAgency;
  const agency = writingAgencyOf(raw);
  if (!raw || !agency) return null;
  // A stored agency is not a region. EU/US labels cannot establish a receiving authority.
  if (agencyKey(raw) !== agencyKey(agency) && !(agencyKey(raw) === 'HC' && agency === 'Health Canada')) return null;
  // These EU device outlines use ema as a historical rule-pack key, not their authority.
  if (agency === 'EMA' && isEuDeviceFiling(filing)) return null;
  return agency;
}
function recordedWritingAgency(filing: RecordedWritingFiling | undefined) {
  if (filing?.verifiedFilingAgency !== undefined) {
    const agency = boundWritingAgency(filing);
    const stored = filing.verifiedFilingAgency;
    const technicalKey = stored && agencyKey(stored) === 'EMA' && isEuDeviceFiling(filing);
    const label = technicalKey ? `${stored} (stored ${filing.boundDocumentType?.toUpperCase()} rule-pack key, not a receiving authority)` : stored;
    return { agency, label, scoped: true };
  }
  const application = filing?.registryId ? getApplicationType(filing.registryId) : null;
  return { agency: writingAgencyOf(application?.agency),
    label: application ? String(application.agency).replace(/_/g, ' ') : null, scoped: Boolean(application) };
}

interface RegionChoice {
  sourceHold: string | null;
  templateAgency: WritingAgency | null;
  applicationAgency: WritingAgency | null;
  applicationLabel: string | null;
  supportedAgency: WritingAgency | null;
  region: string;
}

function boundProjectionHold(filing: RecordedWritingFiling, templateAgency: WritingAgency | null): string | null {
  if (filing.verifiedFilingAgency !== undefined && isEuDeviceFiling(filing) && templateAgency === 'EMA') {
    return `The saved section’s EMA projection is not a verified receiving agency for this bound ${filing.boundDocumentType?.toUpperCase()} filing. Re-read its saved reference before drafting. Existing drafts remain available for review.`;
  }
  return null;
}

function referenceHold(filing: RecordedWritingFiling | undefined, templateAgency: WritingAgency | null): string | null {
  if (!filing) return null;
  if (filing.draftingRegionState === 'unavailable' || filing.draftingRegionState === 'recorded' && !templateAgency) {
    return 'The saved section reference could not be verified. Re-read the section before drafting; its parent template cannot supply a receiving agency.';
  }
  if (filing.verifiedFilingAgency !== undefined && filing.state !== 'ready') {
    return filing.state === 'loading' ? 'Reading this working copy’s exact filing before drafting.'
      : 'This working copy’s exact filing could not be verified. Re-read it before drafting.';
  }
  const projectionHold = boundProjectionHold(filing, templateAgency);
  if (projectionHold) return projectionHold;
  if (templateAgency) return null;
  if (filing.state === 'loading') return 'Reading the saved section and recorded application before choosing a writing region.';
  if (filing.state === 'error' || !filing.draftingRegionState) return 'The saved section or application could not be read. Re-read this section before drafting.';
  return null;
}

function generationHold(choice: RegionChoice): string | null {
  if (choice.sourceHold) return choice.sourceHold;
  if (!choice.supportedAgency) {
    const retained = choice.region ? `The retained writing region ${choice.region} is not supported. ` : '';
    return `${retained}Choose a supported writing region before drafting. No receiving agency is assumed.`;
  }
  if (choice.templateAgency && choice.supportedAgency !== choice.templateAgency) {
    return `The saved section template is for ${choice.templateAgency}. Choose ${choice.templateAgency} before drafting.`;
  }
  return null;
}

function regionNote(choice: RegionChoice, hold: string | null): string | null {
  if (choice.sourceHold) return choice.sourceHold;
  if (choice.applicationLabel && !choice.applicationAgency && !choice.templateAgency) {
    return `The recorded filing agency ${choice.applicationLabel} is not supported by this writing-region control. A writing label does not establish indexed requirements or filing readiness.`;
  }
  if (hold) return hold;
  if (choice.applicationAgency && !choice.templateAgency && choice.supportedAgency !== choice.applicationAgency) {
    return `The writing region ${choice.region} differs from the recorded filing's agency ${choice.applicationAgency}. Confirm the receiving jurisdiction; this choice does not establish compliance.`;
  }
  return null;
}

export function writingAgencyPresentation(input: {
  filing?: RecordedWritingFiling; initialRegion?: string; retainedRegion?: string;
}): { defaultRegion: string; generationHold: string | null; regionNote: string | null } {
  const receiving = recordedWritingAgency(input.filing);
  const templateAgency = input.filing?.draftingRegionState === 'recorded' ? writingAgencyOf(input.filing.draftingRegion) : null;
  const sourceHold = referenceHold(input.filing, templateAgency);
  const defaultRegion = sourceHold ? '' : templateAgency ?? (receiving.scoped ? receiving.agency ?? '' : writingAgencyOf(input.initialRegion) ?? '');
  const region = input.retainedRegion === undefined ? defaultRegion : input.retainedRegion;
  const choice: RegionChoice = { sourceHold, templateAgency, applicationAgency: receiving.agency, region,
    applicationLabel: receiving.label,
    supportedAgency: WRITING_AGENCIES.find(agency => agency === region) ?? null };
  const hold = generationHold(choice);
  return { defaultRegion, generationHold: hold, regionNote: regionNote(choice, hold) };
}
