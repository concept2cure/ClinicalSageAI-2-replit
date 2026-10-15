export function evaluateDraft(params: { draft: string; requiredKeywords?: string[]; minLength?: number }) {
  const { draft, requiredKeywords = [], minLength = 240 } = params;
  const failures: string[] = [];

  if (draft.length < minLength) {
    failures.push(`Draft too short (${draft.length} chars < ${minLength})`);
  }

  for (const keyword of requiredKeywords) {
    if (!draft.toLowerCase().includes(keyword.toLowerCase())) {
      failures.push(`Missing keyword: ${keyword}`);
    }
  }

  return {
    pass: failures.length === 0,
    failures,
  };
}

/**
 * Evaluate a proposal draft once and report what the evaluation found.
 *
 * This was runBoundedRevisionLoop. On a failing evaluation it appended
 * "Revision N: Added coverage for <keywords> with source-backed detail." to the
 * draft and evaluated again: a sentence that added nothing but the keywords and
 * the length the check looks for, so the loop passed its own check by writing
 * the words it checks for, and the proposal a user could accept into a
 * regulatory document claimed source-backed detail it did not have (removed
 * 2026-10-15). A draft that does not meet the bar is reported as not meeting
 * it, unchanged. A simple task is not evaluated, and says so (`pass: null`).
 */
export function assessDraft(params: {
  taskClass: 'simple' | 'hard';
  draft: string;
  requiredKeywords: string[];
}): { pass: boolean | null; evaluations: { pass: boolean; failures: string[] }[]; bypassed: boolean } {
  if (params.taskClass === 'simple') {
    return { pass: null, evaluations: [], bypassed: true };
  }
  const evaluation = evaluateDraft({ draft: params.draft, requiredKeywords: params.requiredKeywords });
  return { pass: evaluation.pass, evaluations: [evaluation], bypassed: false };
}
