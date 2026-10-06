/**
 * Read-only payload/routing probe. Run from the repository root:
 * node --import tsx docs/evidence/D4/2026-10-06-ana-usability-pass2/gateway/payload-probe.mjs
 *
 * Character / 4 figures are estimates, not tokenizer counts. This measures
 * only the base persona and selected tool definitions, not the full prompt or
 * live provider latency. No model request or context retrieval is made.
 */
process.env.SKIP_DB_STARTUP_TEST = 'true';
const root = new URL('../../../../../', import.meta.url);
const readModule = relative => import(new URL(relative, root).href);
const { buildAnaRISystemPrompt } = await readModule('server/services/ana-ri/persona.ts');
const { getAllEnabledTools } = await readModule('server/services/ana/AnaToolDefinitions.ts');
const { selectToolsForTurn, SELF_DRIVE_TOOLS } = await readModule('server/services/ana/tool-selection.ts');
const { planKernelExecution } = await readModule('server/services/kernel-router.ts');
const { resolveModelTier, isSubstantiveTurn } = await readModule('server/services/ai-gateway/reasoning.ts');

const all = getAllEnabledTools();
const personaChars = buildAnaRISystemPrompt().length;
console.info(JSON.stringify({
  basePersonaChars: personaChars,
  estimatedPersonaTokens: Math.ceil(personaChars / 4),
  registeredTools: all.length,
  toolSelectionDisabled: process.env.ANA_TOOL_SELECTION_DISABLED === '1',
}));
for (const message of [
  'hi',
  'hello',
  'open settings',
  'go to biostatistics',
  'run the sales demo',
  'What is the page limit for a 510(k) summary?',
]) {
  const plan = planKernelExecution({
    route: '/api/ana-ri/stream', messageLength: message.length, intentLens: 'auto',
  });
  const tools = selectToolsForTurn(all, message, { pinned: [...SELF_DRIVE_TOOLS] });
  const toolChars = JSON.stringify(tools).length;
  console.info(JSON.stringify({
    message,
    taskType: plan.taskType,
    riskTier: plan.riskTier,
    modelTier: resolveModelTier({
      effort: 'balanced',
      riskTier: plan.riskTier,
      taskType: plan.taskType,
      intentLens: 'auto',
      substantive: isSubstantiveTurn({ messageLength: message.length, intentLens: 'auto' }),
    }),
    selectedTools: tools.length,
    serializedToolChars: toolChars,
    estimatedToolTokens: Math.ceil(toolChars / 4),
    estimatedPersonaAndToolTokens: Math.ceil(personaChars / 4) + Math.ceil(toolChars / 4),
  }));
}
// Imported service graphs can keep maintenance timers alive. The probe's work
// is complete; there are no asynchronous reads or provider calls to wait for.
process.exit(0);
