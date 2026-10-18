import type { AssemblyCommitData, AssemblyPlan, AssemblySection } from '@shared/authoring/assembly';
import type { AiDraftReviewSession, AiDraftReviewState } from './authoringDraftTransport';
import type { AssemblySourceManifest, AssemblySourceSelector } from '@shared/authoring/assembly-sources';

export interface AssemblyBuildOptions {
  docId: string | null; programId: string | null; docSealed: boolean; editorDirty: boolean;
  editRefusal?: string | null;
  isCurrent?: () => boolean;
  onStructureBuilt: (data: AssemblyCommitData) => void | Promise<void>;
  onReviewSection: (sectionId: string) => void;
}
export interface AssemblyTemplate { id: string; name: string }
export type AssemblyBuildPhase = 'idle' | 'outline' | 'previewing' | 'previewed' | 'building' | 'unknown' | 'checking' | 'checked' | 'built' | 'drafting' | 'stopped';
export interface AssemblyDraftSlot {
  section: AssemblySection;
  status: 'not-started' | 'drafting' | 'ready' | 'failed' | 'accepted';
  message?: string;
  review: AiDraftReviewState;
  current?: () => boolean;
  draftRegion: string | null;
  referenceContext: string;
  sourceSelectionKey: string;
  sources?: AssemblySourceManifest;
}
export interface AssemblyBuildState {
  templates: AssemblyTemplate[]; rosterLoading: boolean; rosterError: string | null; globalCatalogUnavailable: boolean;
  templateId: string; targetCode: string; outline: AssemblyPlan | null; plan: AssemblyPlan | null;
  phase: AssemblyBuildPhase; message: string; reason: string; withAna: boolean; requirements: string;
  slots: AssemblyDraftSlot[]; receipt: AssemblyCommitData | null;
  sourceSelection?: AssemblySourceSelector[]; disclosureRequest: number;
}
export interface AssemblyBuildController extends AssemblyBuildState {
  busy: boolean; disabledReason: string | null; reviewSessions: Record<string, AiDraftReviewSession>;
  chooseTemplate: (id: string) => Promise<void>; chooseTarget: (code: string) => void;
  setReason: (reason: string) => void; setWithAna: (value: boolean) => void; setRequirements: (value: string) => void;
  preview: () => Promise<void>; build: () => Promise<void>; check: () => Promise<void>; retryDrafts: () => Promise<void>;
  stop: () => void; review: (sectionId: string) => void; markAccepted: (sectionId: string) => void;
  loadTemplates: () => Promise<void>;
  adoptSources: (sources: AssemblySourceSelector[] | null) => boolean;
}
export interface AssemblyBucket {
  state: AssemblyBuildState; token: object | null; stopRequested: boolean;
  reviewToken?: object;
  sourceRevision: number;
}
export const initialAssemblyState = (): AssemblyBuildState => ({
  templates: [], rosterLoading: false, rosterError: null, globalCatalogUnavailable: false,
  templateId: '', targetCode: '', outline: null, plan: null, phase: 'idle', message: '', reason: '', withAna: false, requirements: '', slots: [], receipt: null, disclosureRequest: 0,
});
export const assemblyBusy = (phase: AssemblyBuildPhase): boolean => ['outline', 'previewing', 'building', 'checking', 'drafting'].includes(phase);
export function assemblyDisabledReason(options: AssemblyBuildOptions): string | null {
  if (!options.programId) return 'Open a project before building a document.';
  if (!options.docId) return 'Open or create a working document first.';
  if (options.docSealed) return 'This document is frozen. Start a working document to build more content.';
  if (options.editRefusal) return options.editRefusal;
  if (options.editorDirty) return 'Save or discard your editor changes before building or switching review sections.';
  return options.isCurrent?.() === false ? 'The editor is changing project or document. Finish that change first.' : null;
}
