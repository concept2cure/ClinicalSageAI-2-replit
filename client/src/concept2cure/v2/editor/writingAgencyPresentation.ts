/** Display/default state for the existing Region control. Generation re-reads
 * authority; this presentation does not resolve a filing or grant drafting. */
import { WRITING_AGENCIES, writingAgencyOf, type DraftingRegionState, type WritingAgency } from '@shared/authoring/writing-regions';
import { getApplicationType } from '@shared/regulatory/global-document-registry';

export interface RecordedWritingFiling {
  registryId?: string | null;
  draftingRegion?: string | null;
  draftingRegionState?: DraftingRegionState;
  state?: 'loading' | 'ready' | 'error';
}

interface RegionChoice {
  sourceHold: string | null;
  templateAgency: WritingAgency | null;
  applicationAgency: WritingAgency | null;
  applicationLabel: string | null;
  supportedAgency: WritingAgency | null;
  region: string;
}

function referenceHold(filing: RecordedWritingFiling | undefined, templateAgency: WritingAgency | null): string | null {
  if (!filing) return null;
  if (filing.draftingRegionState === 'unavailable' || filing.draftingRegionState === 'recorded' && !templateAgency) {
    return 'The saved section reference could not be verified. Re-read the section before drafting; its parent template cannot supply a receiving agency.';
  }
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
    return `The recorded application agency ${choice.applicationLabel} is not supported by this writing-region control. A writing label does not establish indexed requirements or filing readiness.`;
  }
  if (hold) return hold;
  if (choice.applicationAgency && !choice.templateAgency && choice.supportedAgency !== choice.applicationAgency) {
    return `The writing region ${choice.region} differs from the recorded application's agency ${choice.applicationAgency}. Confirm the receiving jurisdiction; this choice does not establish compliance.`;
  }
  return null;
}

export function writingAgencyPresentation(input: {
  filing?: RecordedWritingFiling; initialRegion?: string; retainedRegion?: string;
}): { defaultRegion: string; generationHold: string | null; regionNote: string | null } {
  const application = input.filing?.registryId ? getApplicationType(input.filing.registryId) : null;
  const templateAgency = input.filing?.draftingRegionState === 'recorded' ? writingAgencyOf(input.filing.draftingRegion) : null;
  const applicationAgency = writingAgencyOf(application?.region);
  const sourceHold = referenceHold(input.filing, templateAgency);
  const defaultRegion = sourceHold ? '' : templateAgency ?? (application ? applicationAgency ?? '' : writingAgencyOf(input.initialRegion) ?? '');
  const region = input.retainedRegion === undefined ? defaultRegion : input.retainedRegion;
  const choice: RegionChoice = { sourceHold, templateAgency, applicationAgency, region,
    applicationLabel: application ? String(application.agency).replace(/_/g, ' ') : null,
    supportedAgency: WRITING_AGENCIES.find(agency => agency === region) ?? null };
  const hold = generationHold(choice);
  return { defaultRegion, generationHold: hold, regionNote: regionNote(choice, hold) };
}
