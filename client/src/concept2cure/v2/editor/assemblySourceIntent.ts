import type { EditorTarget } from '../editorTarget';
import { readAssemblySourceSelectors, type AssemblySourceSelector } from '@shared/authoring/assembly-sources';
import { captureEditorDraftGuard } from './authoringDraftTransport';

export interface AssemblySourceIntent {
  docId: string; programId: string; sources: AssemblySourceSelector[]; current: () => boolean;
}
/** The receiver captures current actor/session/project visit before any await. */
export function captureAssemblySourceIntent(target: EditorTarget, admitted: () => boolean): AssemblySourceIntent | null {
  if (!target.docId || !target.programId || target.assemblySources?.version !== 1) return null;
  const sources = readAssemblySourceSelectors(target.assemblySources.sources);
  if (!sources) return null;
  const current = captureEditorDraftGuard({ programId: target.programId, isCurrent: admitted });
  return { docId: target.docId, programId: target.programId, sources, current };
}
