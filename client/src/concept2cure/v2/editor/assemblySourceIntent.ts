import { captureEditorAssemblySourceOwner, captureEditorSourceDocumentStartOwner, type EditorTarget } from '../editorTarget';
import { readAssemblySourceSelectors, type AssemblySourceSelector } from '@shared/authoring/assembly-sources';
import { captureEditorDraftGuard } from './authoringDraftTransport';

/** Observed retirement never revives an already-admitted source command. */
function sourceIntentCurrent(owner: () => boolean, admitted: () => boolean, programId: string, sources: AssemblySourceSelector[]): () => boolean {
  const snapshot = JSON.stringify(sources);
  const guard = captureEditorDraftGuard({ programId,
    isCurrent: () => owner() && admitted() && JSON.stringify(readAssemblySourceSelectors(sources)) === snapshot });
  let retired = false;
  return () => {
    if (!retired) {
      try { retired = !guard(); } catch { retired = true; }
    }
    return !retired;
  };
}

export interface AssemblySourceIntent {
  docId: string; programId: string; sources: AssemblySourceSelector[]; current: () => boolean;
}
/** Retain the admitted sender and receiver across the same source handoff. */
export function captureAssemblySourceIntent(target: EditorTarget, admitted: () => boolean): AssemblySourceIntent | null {
  const owner = captureEditorAssemblySourceOwner(target);
  if (!owner || !target.docId || !target.programId || target.assemblySources?.version !== 1) return null;
  const sources = readAssemblySourceSelectors(target.assemblySources.sources);
  if (!sources) return null;
  const current = sourceIntentCurrent(owner, admitted, target.programId, sources);
  return { docId: target.docId, programId: target.programId, sources, current };
}

export interface AssemblySourceDocumentStartIntent {
  programId: string; sources: AssemblySourceSelector[]; current: () => boolean;
}
/** Source starts have no document UUID until the canonical creator confirms one. */
export function captureSourceDocumentStartIntent(target: EditorTarget, admitted: () => boolean): AssemblySourceDocumentStartIntent | null {
  const owner = captureEditorSourceDocumentStartOwner(target);
  const sources = readAssemblySourceSelectors(target.sourceDocumentStart?.sources);
  if (!owner || !sources || !target.programId) return null;
  const current = sourceIntentCurrent(owner, admitted, target.programId, sources);
  return { programId: target.programId, sources, current };
}
