/**
 * Model narration over a stability study's RECORDED data.
 *
 * Every function here receives the study's own rows — study, conditions,
 * timepoints, tests with their recorded limits, results, and the deterministic
 * trend/shelf-life assessments computed from them — and asks the model to
 * explain, prioritise or draft from THAT. Numbers, verdicts and limits come
 * from the data and the deterministic engines (CLAUDE.md RULE 2); the model
 * narrates them and says what is missing.
 *
 * Until 2026-09-23 most of these were given only the study id and asked to
 * "explain the stability data trends", "identify the top 5 priority actions"
 * or "draft a complete P.8" — with nothing to base it on — and each caught its
 * own failure and returned canned text ("probable causes: analytical method
 * variability, …", a "standing best-practice recommendation") that the route
 * answered 200 with. A model failure now propagates: the route says nothing
 * was generated.
 *
 * @module server/src/services/ai/stability
 */

import { getGateway } from '../../../services/ai-gateway/index.js';

/** What the router hands every function: the study as recorded, and nothing invented. */
export interface StabilityContext {
  study: Record<string, unknown>;
  conditions: Record<string, unknown>[];
  timepoints: Record<string, unknown>[];
  tests: Record<string, unknown>[];
  results: Record<string, unknown>[];
  /** Deterministic assessments (OOT regression control chart, ICH Q1E), or their refusals. */
  assessments: Record<string, unknown>[];
}

const GROUNDING =
  'Use ONLY the study data supplied below. Do not state any value, limit, date, shelf life, storage ' +
  'condition or result that is not in it. Where the data do not answer something, say that it is not ' +
  'recorded. Figures you cite must be copied from the data or the supplied assessments, not computed by you.';

const dataBlock = (ctx: StabilityContext) => `Study data (JSON):\n${JSON.stringify(ctx, null, 2)}`;

// ──────────────────────────────────────────────
// 1. aiExplainStability
// ──────────────────────────────────────────────
export async function aiExplainStability(ctx: StabilityContext): Promise<{ explanation: string }> {
  const result = await getGateway().route({
    taskType: 'document_analysis',
    callerModule: 'stability.aiExplainStability',
    messages: [
      {
        role: 'system',
        content:
          'You are a pharmaceutical stability scientist (ICH Q1A(R2), Q1E). Explain the recorded stability ' +
          'data and the supplied deterministic assessments in plain scientific language. ' +
          GROUNDING,
      },
      { role: 'user', content: `Explain the trends and key observations in this study.\n\n${dataBlock(ctx)}` },
    ],
    maxTokens: 1200,
    temperature: 0.25,
  });
  return { explanation: result.content };
}

// ──────────────────────────────────────────────
// 2. aiCoachPriorities
// ──────────────────────────────────────────────
interface PriorityItem {
  action: string;
  urgency: string;
  rationale: string;
}

export async function aiCoachPriorities(ctx: StabilityContext): Promise<{ priorities: PriorityItem[] }> {
  return getGateway().structuredOutput<{ priorities: PriorityItem[] }>(
    'Identify up to 5 priority actions for this stability study from its recorded timepoints (planned and ' +
      'actual dates), results and the supplied out-of-trend assessments. For each: action, urgency ' +
      '(critical / high / medium / low) and a rationale that cites the record it comes from. ' +
      GROUNDING +
      `\n\n${dataBlock(ctx)}`,
    {
      type: 'object',
      properties: {
        priorities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              urgency: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
              rationale: { type: 'string' },
            },
            required: ['action', 'urgency', 'rationale'],
          },
        },
      },
      required: ['priorities'],
    },
    { taskType: 'regulatory_review', callerModule: 'stability.aiCoachPriorities', maxTokens: 1200 }
  );
}

// ──────────────────────────────────────────────
// 3. aiFixPlanFromIssues
// ──────────────────────────────────────────────
export async function aiFixPlanFromIssues(ctx: StabilityContext, issues: unknown): Promise<{ plan: string }> {
  const result = await getGateway().route({
    taskType: 'regulatory_review',
    callerModule: 'stability.aiFixPlanFromIssues',
    messages: [
      {
        role: 'system',
        content:
          'You are a pharmaceutical quality engineer specialising in stability studies. Given the issues ' +
          'raised against this study, draft a remediation plan: concrete steps, responsible roles and the ' +
          'ICH/GMP references that apply. Dates and owners are for the team to set; do not invent them. ' +
          GROUNDING,
      },
      {
        role: 'user',
        content: `Issues raised:\n${JSON.stringify(issues ?? [], null, 2)}\n\n${dataBlock(ctx)}`,
      },
    ],
    maxTokens: 1500,
    temperature: 0.3,
  });
  return { plan: result.content };
}

// ──────────────────────────────────────────────
// 4. aiDraftP8
// ──────────────────────────────────────────────
export async function aiDraftP8(ctx: StabilityContext): Promise<{ draft: string }> {
  const result = await getGateway().route({
    taskType: 'document_drafting',
    callerModule: 'stability.aiDraftP8',
    messages: [
      {
        role: 'system',
        content:
          'You are a regulatory writer (ICH M4Q(R1), CTD Module 3). Draft section 3.2.P.8 Stability from the ' +
          'recorded study. The storage conditions, timepoints, tests, limits and results are those in the data; ' +
          'a shelf life may be stated only as the supplied ICH Q1E assessment states it. Where the record is ' +
          'silent, write [NOT RECORDED: <what>] rather than a value. ' +
          GROUNDING,
      },
      { role: 'user', content: `Draft 3.2.P.8 for this study.\n\n${dataBlock(ctx)}` },
    ],
    maxTokens: 2000,
    temperature: 0.2,
  });
  return { draft: result.content };
}

// ──────────────────────────────────────────────
// 5. aiRootCauseOOS
// ──────────────────────────────────────────────
export async function aiRootCauseOOS(
  ctx: StabilityContext,
  oosData: unknown
): Promise<{ analysis: string; probableCauses: string[]; recommendations: string[] }> {
  return getGateway().structuredOutput<{ analysis: string; probableCauses: string[]; recommendations: string[] }>(
    'Support a root-cause investigation of the out-of-specification result below (Ishikawa / 5-Why over ' +
      'the 6M categories). These are hypotheses for the investigation to test, not findings; say so. ' +
      GROUNDING +
      `\n\nOOS result as reported:\n${JSON.stringify(oosData ?? null, null, 2)}\n\n${dataBlock(ctx)}`,
    {
      type: 'object',
      properties: {
        analysis: { type: 'string', description: 'Narrative, framed as hypotheses to investigate' },
        probableCauses: { type: 'array', items: { type: 'string' } },
        recommendations: { type: 'array', items: { type: 'string' } },
      },
      required: ['analysis', 'probableCauses', 'recommendations'],
    },
    { taskType: 'document_analysis', callerModule: 'stability.aiRootCauseOOS', maxTokens: 1500 }
  );
}

// 6. aiRecommendLabelStorage — REMOVED 2026-09-23. It asked a model for a label
// statement and shelf life "based on the stability data" while passing only the
// study id, and its one caller wrote the answer into stab_studies.label_storage.
// The shelf life is now the ICH Q1E estimate from the study's own results
// (server/services/cmc/shelf-life.ts, GET /api/stability/studies/:id/ai/t90);
// the label statement is a reviewed human decision. POST /studies/:id/ai/label
// answers 410 and says so (stability-router-honesty.test.ts).
//
// 7. simpleShelfLifeT90 — REMOVED 2026-09-23. Despite its signature it read no
// data: it assumed "a typical 5 % loss over 6 months" and Ea = 83 144 J/mol, so
// every study, and any id, got t90 = 61.5 months "high — supports a 24-month
// shelf life claim". GET /studies/:id/ai/t90 now runs estimateShelfLife
// (server/services/cmc/shelf-life.ts) on the study's recorded results.

// ──────────────────────────────────────────────
// 8. aiDraftProtocol
// ──────────────────────────────────────────────
export async function aiDraftProtocol(ctx: StabilityContext): Promise<{ draft: string }> {
  const result = await getGateway().route({
    taskType: 'document_drafting',
    callerModule: 'stability.aiDraftProtocol',
    messages: [
      {
        role: 'system',
        content:
          'You are a stability protocol writer (ICH Q1A(R2)). Draft the protocol for the study as recorded: ' +
          'its conditions, timepoints, tests and acceptance criteria. Where the record has no acceptance ' +
          'criterion or other element a protocol needs, write [NOT RECORDED: <what>]. ' +
          GROUNDING,
      },
      { role: 'user', content: `Draft the protocol for this study.\n\n${dataBlock(ctx)}` },
    ],
    maxTokens: 2500,
    temperature: 0.2,
  });
  return { draft: result.content };
}

// ──────────────────────────────────────────────
// 9. aiCAPAFromOOT
// ──────────────────────────────────────────────
export async function aiCAPAFromOOT(
  ctx: StabilityContext,
  oot: unknown
): Promise<{ suggestion: string; capaActions: string[] }> {
  return getGateway().structuredOutput<{ suggestion: string; capaActions: string[] }>(
    'Suggest a CAPA for the out-of-trend signal below, for a quality reviewer to accept or reject. ' +
      GROUNDING +
      `\n\nOOT signal as reported:\n${JSON.stringify(oot ?? null, null, 2)}\n\n${dataBlock(ctx)}`,
    {
      type: 'object',
      properties: {
        suggestion: { type: 'string' },
        capaActions: { type: 'array', items: { type: 'string' } },
      },
      required: ['suggestion', 'capaActions'],
    },
    { taskType: 'regulatory_review', callerModule: 'stability.aiCAPAFromOOT', maxTokens: 1200 }
  );
}
