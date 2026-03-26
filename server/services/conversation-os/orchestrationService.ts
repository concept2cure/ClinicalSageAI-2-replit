import { kernelStore } from './conversationKernel';
import { conversationPersistence, type ConversationContext } from './persistence';
import { retrieveRelevantChunks } from './retrievalService';
import { runBoundedRevisionLoop } from './qualityLoopService';

const HARD_TASK_KEYWORDS = ['ind', 'ectd', 'clinical', 'cmc', 'diagnostic', 'safety', 'submission'];
const withDefaultCtx = (ctx: Partial<ConversationContext> & { conversationId: string }): ConversationContext => ({
  projectId: ctx.projectId ?? 'project-unscoped',
  conversationId: ctx.conversationId,
  userId: ctx.userId ?? 'system',
});

export function classifyTask(task: string) {
  const lowered = task.toLowerCase();
  const signalHits = HARD_TASK_KEYWORDS.filter(term => lowered.includes(term)).length;
  const isHard = task.length > 120 || signalHits >= 2;
  return { class: isHard ? 'hard' : 'simple' as const, signalHits };
}

export async function planAndExecute(params: { conversationId: string; task: string; projectId?: string; userId?: string }) {
  const ctx = withDefaultCtx(params);
  const classification = classifyTask(params.task);
  const retrieved = await retrieveRelevantChunks({ ...ctx, query: params.task, limit: 6 });

  const trace = {
    conversationId: ctx.conversationId,
    task: params.task,
    class: classification.class,
    steps: [
      { id: 'step-1', label: 'Classify task complexity', status: 'completed' as const },
      { id: 'step-2', label: 'Retrieve scoped evidence chunks', status: 'completed' as const },
      { id: 'step-3', label: 'Generate proposal draft', status: 'completed' as const },
      { id: 'step-4', label: 'Evaluate and revise (bounded)', status: 'completed' as const },
    ],
    sourcesUsed: retrieved.map(r => r.sourceId),
  };

  const baseDraft = [
    `Objective: ${params.task}`,
    `Sources: ${retrieved.map(r => r.sourceId).join(', ') || 'none'}`,
    'Execution: Generated a governed proposal that requires explicit acceptance before artifact mutation.',
  ].join('\n');

  const quality = runBoundedRevisionLoop({ taskClass: classification.class, seedDraft: baseDraft, requiredKeywords: ['sources', 'objective', 'execution'] });
  kernelStore.plans.set(ctx.conversationId, trace);
  kernelStore.persist();
  await conversationPersistence.upsertPlan(ctx, trace);
  await conversationPersistence.logQualityEvaluation(ctx, null, quality.evaluations);

  return { trace, draft: quality.finalDraft, quality };
}

export async function getLatestPlanSummary(params: { conversationId: string; projectId?: string; userId?: string }) {
  const ctx = withDefaultCtx(params);
  const persisted = await conversationPersistence.getPlan(ctx);
  if (persisted) return persisted;
  return kernelStore.plans.get(ctx.conversationId) ?? null;
}
