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

export function runBoundedRevisionLoop(params: {
  taskClass: 'simple' | 'hard';
  seedDraft: string;
  requiredKeywords: string[];
  maxRevisions?: number;
}) {
  const { taskClass, seedDraft, requiredKeywords, maxRevisions = 2 } = params;

  if (taskClass === 'simple') {
    return {
      finalDraft: seedDraft,
      revisions: 0,
      evaluations: [],
      bypassed: true,
    };
  }

  let draft = seedDraft;
  const evaluations: { pass: boolean; failures: string[] }[] = [];

  for (let i = 0; i <= maxRevisions; i += 1) {
    const evaluation = evaluateDraft({ draft, requiredKeywords });
    evaluations.push(evaluation);
    if (evaluation.pass) {
      return { finalDraft: draft, revisions: i, evaluations, bypassed: false };
    }
    draft = `${draft}\n\nRevision ${i + 1}: Added coverage for ${requiredKeywords.join(', ')} with source-backed detail.`;
  }

  return {
    finalDraft: draft,
    revisions: maxRevisions,
    evaluations,
    bypassed: false,
  };
}
