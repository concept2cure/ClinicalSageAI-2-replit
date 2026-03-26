import { kernelStore } from './conversationKernel';
import { retrieveRelevantChunks } from './retrievalService';
import { runBoundedRevisionLoop } from './qualityLoopService';

const HARD_TASK_KEYWORDS = ['ind', 'ectd', 'clinical', 'cmc', 'diagnostic', 'safety', 'submission'];

export function classifyTask(task: string) {
  const lowered = task.toLowerCase();
  const signalHits = HARD_TASK_KEYWORDS.filter(term => lowered.includes(term)).length;
  const isHard = task.length > 120 || signalHits >= 2;
  return { class: isHard ? 'hard' : 'simple' as const, signalHits };
}

export function planAndExecute(params: { conversationId: string; task: string }) {
  const { conversationId, task } = params;
  const classification = classifyTask(task);
  const retrieved = retrieveRelevantChunks({ conversationId, query: task, limit: 6 });

  const steps = [
    { id: 'step-1', label: 'Classify task complexity', status: 'completed' as const },
    { id: 'step-2', label: 'Retrieve scoped evidence chunks', status: 'completed' as const },
    { id: 'step-3', label: 'Generate proposal draft', status: 'completed' as const },
    { id: 'step-4', label: 'Evaluate and revise (bounded)', status: 'completed' as const },
  ];

  const trace = {
    conversationId,
    task,
    class: classification.class,
    steps,
    sourcesUsed: retrieved.map(r => r.sourceId),
  };

  const baseDraft = [
    `Objective: ${task}`,
    `Sources: ${retrieved.map(r => r.sourceId).join(', ') || 'none'}`,
    'Execution: Generated a governed proposal that requires explicit acceptance before artifact mutation.',
  ].join('\n');

  const quality = runBoundedRevisionLoop({
    taskClass: classification.class,
    seedDraft: baseDraft,
    requiredKeywords: ['sources', 'objective', 'execution'],
  });

  kernelStore.plans.set(conversationId, trace);

  return {
    trace,
    draft: quality.finalDraft,
    quality,
  };
}
