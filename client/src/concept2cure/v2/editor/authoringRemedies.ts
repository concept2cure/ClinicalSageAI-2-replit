import type { EditorBridgeProposeResult } from './DocumentWorkbench';
export { parseRemedyAnswer, type AuthoringRemedy, type RemedyAnswer } from '@shared/authoring/remedies';

export function remedyRefusal(result: Extract<EditorBridgeProposeResult, { ok: false }>): string {
  if (result.reason === 'model-not-approved') return result.message;
  const reasons: Record<Exclude<typeof result.reason, 'model-not-approved'>, string> = {
    stale: 'The saved section changed since AnA read it. Ask AnA to re-read it before preparing this fix again.',
    'wrong-section': 'Open the section named by this fix before applying it.',
    'no-base': 'This fix does not identify the saved version AnA read. Ask AnA to re-read the section.',
    'not-editable': 'This section cannot take a tracked fix right now (source mode, read-only or frozen).',
    'not-found': 'The quoted passage is no longer in one editable text block. Ask AnA to re-read the section.',
    ambiguous: 'The quoted passage occurs more than once. Ask AnA to include its surrounding text.',
    'overlaps-suggestion': 'This passage already contains pending changes. Review those changes before adding another fix.',
    structural: 'This fix would split the document structure. Ask AnA for a fix within one paragraph or a complete block.',
    'unsupported-content': 'This passage cannot carry a tracked replacement.',
  };
  return reasons[result.reason];
}
