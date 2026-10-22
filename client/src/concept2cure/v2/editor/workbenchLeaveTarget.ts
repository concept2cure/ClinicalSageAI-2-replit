import type { AssemblySourceIntent } from './assemblySourceIntent';

export type WorkbenchLeaveTarget =
  | { kind: 'section'; id: string; mode?: 'section' | 'document'; module?: string; draftReview?: boolean }
  | { kind: 'document'; id: string; sectionId?: string; module?: string; assemblyIntent?: AssemblySourceIntent }
  | { kind: 'external-document'; id: string; module?: string; assemblyIntent?: AssemblySourceIntent }
  | { kind: 'program'; id: string; label: string; onContinue: () => void; onCancel: () => void; module?: string }
  | { kind: 'host-back'; label: string; onContinue: () => void; module?: never }
  | { kind: 'view'; mode: 'section' | 'document'; module?: never }
  | { kind: 'conversation'; prompt: string; module?: never };

export function workbenchAssemblyIntent(target: WorkbenchLeaveTarget): AssemblySourceIntent | undefined {
  return target.kind === 'document' || target.kind === 'external-document' ? target.assemblyIntent : undefined;
}
export function workbenchAlreadyThere(target: WorkbenchLeaveTarget, state: { viewMode: string; sectionId: string | null; docId: string | null; dirty: boolean }): boolean {
  if (target.kind === 'view') return target.mode === state.viewMode;
  if (target.kind === 'section') return target.id === state.sectionId && (!target.mode || target.mode === state.viewMode);
  return target.kind === 'document' && target.id === state.docId && (!target.sectionId || target.sectionId === state.sectionId)
    && !(target.assemblyIntent && state.dirty);
}
export function admitWorkbenchNavigation(target: WorkbenchLeaveTarget, projectSwitchHeld: boolean, onBlocked: () => void,
  admitSources: (intent: AssemblySourceIntent, adopt: boolean) => boolean): boolean {
  if (target.kind === 'conversation' && projectSwitchHeld) { onBlocked(); return false; }
  const intent = workbenchAssemblyIntent(target);
  return !intent || admitSources(intent, target.kind === 'document');
}
