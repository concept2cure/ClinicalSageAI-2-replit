/**
 * Background deep-research investigations.
 *
 * A deep investigation is an agentic research run that outlives the chat turn
 * that started it: AnA starts one with the start_deep_investigation tool, this
 * runner executes a Thorough-depth multi-round tool loop out-of-band (same
 * canonical loop core as every other agentic surface), progress + a heartbeat
 * are persisted to ana_deep_investigations, and check_deep_investigation
 * reports honest status — including "stalled" when a server restart orphaned a
 * run mid-flight (in-process execution does not survive restarts; the record
 * does, and it never lies about it).
 *
 * Cost posture: an explicit deep-research request is the definition of a
 * Thorough turn, so the run uses the platform's tier policy at 'thorough' —
 * including any ANA_TIER_*_MODEL deployment remaps — plus Thorough reasoning
 * and output budgets. Concurrency is capped per tenant so background research
 * can never become a runaway spender.
 *
 * @module server/services/ana/deep-investigation
 */

import { getPool } from '../../db.js';
import { getGateway } from '../ai-gateway/gateway.js';
import type { GatewayRequest } from '../ai-gateway/types.js';
import {
  resolveThinkingConfig,
  resolveOutputBudget,
  resolveModelTier,
  resolveTierModel,
} from '../ai-gateway/reasoning.js';
import { buildAnaRISystemPrompt } from '../ana-ri/persona.js';
import { loadAnaToolPolicy, filterToolsByPolicy } from '../ana-ri/mdx-tool-policy.js';
import { resolveMaxRounds, resolveRoundExtension } from './agentic-loop.js';
import { getAllEnabledTools } from './AnaToolDefinitions.js';
import { selectToolsForTurn } from './tool-selection.js';

/** The two investigation tools — excluded from a run's own tool surface so a
 * background investigation can never recursively spawn more investigations. */
export const DEEP_INVESTIGATION_TOOL_NAMES: ReadonlySet<string> = new Set([
  'start_deep_investigation',
  'check_deep_investigation',
]);

/** Max queued+running investigations per tenant (runaway-cost guard). */
export const MAX_CONCURRENT_INVESTIGATIONS = 2;

/** A running/queued row with no heartbeat inside this window is stalled. */
export const STALE_AFTER_MS = 5 * 60_000;

/** Progress events kept per row (append-only, oldest retained). */
const PROGRESS_EVENT_CAP = 60;

export type InvestigationStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface InvestigationRow {
  id: string;
  status: InvestigationStatus | string;
  question: string;
  progress: Array<{ at: string; note: string }>;
  result_text: string | null;
  error: string | null;
  tool_call_count: number;
  model: string | null;
  provider: string | null;
  created_at: string | Date;
  started_at: string | Date | null;
  heartbeat_at: string | Date | null;
  completed_at: string | Date | null;
}

/**
 * A queued/running investigation whose newest liveness signal (heartbeat, else
 * started, else created) is older than the stale window is stalled — the
 * process running it is gone (restart/crash) and it will never finish. Pure.
 */
export function isInvestigationStale(
  row: Pick<InvestigationRow, 'status' | 'created_at' | 'started_at' | 'heartbeat_at'>,
  now: Date = new Date(),
  staleAfterMs: number = STALE_AFTER_MS,
): boolean {
  if (row.status !== 'running' && row.status !== 'queued') return false;
  const newest = row.heartbeat_at ?? row.started_at ?? row.created_at;
  const t = new Date(newest).getTime();
  return Number.isFinite(t) ? now.getTime() - t > staleAfterMs : true;
}

/**
 * User-facing status for a row, with stalled runs reported honestly instead of
 * as an eternal "running". Pure.
 */
export function describeInvestigationStatus(
  row: Pick<InvestigationRow, 'status' | 'created_at' | 'started_at' | 'heartbeat_at'>,
  now: Date = new Date(),
): string {
  if (isInvestigationStale(row, now)) {
    return 'stalled — the server restarted while this was running; start a fresh investigation';
  }
  return String(row.status);
}

export interface StartInvestigationInput {
  question: string;
  context?: string;
  organizationId?: number | null;
  userId?: number | null;
  projectId?: number | null;
}

export type StartInvestigationResult =
  | { status: 'started'; id: string }
  | { status: 'limit_reached'; running: number }
  | { status: 'not_provisioned' };

/**
 * Create the investigation record and launch the background run. The insert is
 * the provisioning probe: a missing table reports `not_provisioned` (the
 * migration is the fix) instead of throwing into the chat turn.
 */
export async function startDeepInvestigation(
  input: StartInvestigationInput,
): Promise<StartInvestigationResult> {
  const pool = getPool();
  try {
    const active = await pool.query(
      `SELECT count(*)::int AS n FROM ana_deep_investigations
       WHERE status IN ('queued','running')
         AND (organization_id IS NOT DISTINCT FROM $1)
         AND heartbeat_at > NOW() - INTERVAL '5 minutes'`,
      [input.organizationId ?? null],
    );
    const running = active.rows[0]?.n ?? 0;
    if (running >= MAX_CONCURRENT_INVESTIGATIONS) {
      return { status: 'limit_reached', running };
    }
    const inserted = await pool.query(
      `INSERT INTO ana_deep_investigations
         (organization_id, user_id, project_id, question, context, status, heartbeat_at)
       VALUES ($1, $2, $3, $4, $5, 'queued', NOW())
       RETURNING id`,
      [
        input.organizationId ?? null,
        input.userId ?? null,
        input.projectId ?? null,
        input.question,
        input.context ?? null,
      ],
    );
    const id: string = inserted.rows[0].id;
    // Fire-and-forget: the run continues after this chat turn returns. Failures
    // are recorded on the row — never thrown into a request that already ended.
    void runInvestigation(id).catch(async (err: unknown) => {
      await markFailed(id, err instanceof Error ? err.message : String(err));
    });
    return { status: 'started', id };
  } catch (err: unknown) {
    if (/relation .*ana_deep_investigations.* does not exist/i.test(String((err as Error)?.message))) {
      return { status: 'not_provisioned' };
    }
    throw err;
  }
}

async function markFailed(id: string, error: string): Promise<void> {
  await getPool()
    .query(
      `UPDATE ana_deep_investigations
       SET status = 'failed', error = $2, completed_at = NOW()
       WHERE id = $1 AND status IN ('queued','running')`,
      [id, error.slice(0, 2000)],
    )
    .catch(() => {});
}

/** Append a progress event (bounded) and refresh the heartbeat. Best-effort. */
async function appendProgress(id: string, note: string): Promise<void> {
  const event = JSON.stringify([{ at: new Date().toISOString(), note: note.slice(0, 200) }]);
  await getPool()
    .query(
      `UPDATE ana_deep_investigations
       SET progress = CASE
             WHEN jsonb_array_length(progress) >= ${PROGRESS_EVENT_CAP} THEN progress
             ELSE progress || $2::jsonb
           END,
           tool_call_count = tool_call_count + 1,
           heartbeat_at = NOW()
       WHERE id = $1`,
      [id, event],
    )
    .catch(() => {});
}

/**
 * Execute the investigation: Thorough-depth agentic loop over the tenant's
 * governed tool surface, final memo persisted to the row.
 */
async function runInvestigation(id: string): Promise<void> {
  const pool = getPool();
  const loaded = await pool.query(
    `UPDATE ana_deep_investigations
     SET status = 'running', started_at = NOW(), heartbeat_at = NOW()
     WHERE id = $1 AND status = 'queued'
     RETURNING question, context, organization_id, user_id, project_id`,
    [id],
  );
  if (loaded.rows.length === 0) return; // already picked up / cancelled
  const row = loaded.rows[0];
  const orgId: number | null = row.organization_id ?? null;

  // Governed tool surface: tenant deny-list first, then relevance selection for
  // the question — minus the investigation tools themselves (no recursion).
  const policy = orgId != null ? await loadAnaToolPolicy(pool, orgId) : {};
  const tools = selectToolsForTurn(
    filterToolsByPolicy(getAllEnabledTools(), policy).filter(
      t => !DEEP_INVESTIGATION_TOOL_NAMES.has(t.name),
    ),
    String(row.question),
    {},
  );

  const systemPrompt =
    buildAnaRISystemPrompt() +
    `\n\n## DEEP INVESTIGATION MODE\n` +
    `You are running a background deep investigation — there is no user present to answer questions, ` +
    `so where an input is missing, state the assumption you made and continue. Investigate thoroughly ` +
    `with your tools, then produce a final, self-contained research memo in markdown:\n` +
    `1. The question, restated precisely.\n` +
    `2. What you searched and verified (which tools, which sources).\n` +
    `3. Findings, each carrying your [KNOWN]/[INFERRED]/[MISSING] evidence labels.\n` +
    `4. Contradictions, gaps, and what would resolve them.\n` +
    `5. Bottom line — the defensible answer and its confidence.\n` +
    `The memo must stand alone when read hours later, without this conversation.`;

  const question =
    String(row.question) + (row.context ? `\n\nBackground context provided:\n${row.context}` : '');

  // Thorough posture end-to-end: tier policy (with deployment remaps), 16k
  // reasoning budget, full output headroom, deepest loop + extension.
  const gw = getGateway();
  const enabledModels = typeof gw.getModels === 'function' ? gw.getModels().filter(m => m.enabled) : [];
  const tiered = resolveTierModel(resolveModelTier({ effort: 'thorough' }), enabledModels, process.env);
  const thinking = resolveThinkingConfig({ effort: 'thorough' });

  const request: GatewayRequest = {
    taskType: 'regulatory_review',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ],
    maxTokens: resolveOutputBudget('thorough'),
    strategy: 'quality_optimized',
    ...(tiered ? { provider: tiered.provider, model: tiered.model } : {}),
    ...(thinking.enabled ? { thinking } : {}),
    ...(tools.length > 0 ? { tools, toolChoice: 'auto' as const } : {}),
    promptCache: { enabled: true, type: 'ephemeral' },
    ...(orgId != null ? { organizationId: orgId } : {}),
    callerModule: 'ana-deep-investigation',
  };

  // Dynamic import breaks the static cycle (AnaToolExecutor registers this
  // module's tool handlers; this module runs the executor's loop).
  const { executeAgenticLoop } = await import('./AnaToolExecutor.js');
  const response = await executeAgenticLoop(request, {
    maxRounds: resolveMaxRounds('thorough'),
    progressExtension: resolveRoundExtension('thorough'),
    toolContext: {
      organizationId: orgId,
      userId: row.user_id ?? null,
      projectId: row.project_id ?? null,
    },
    onToolExecution: (toolName) => {
      void appendProgress(id, toolName.replace(/_/g, ' '));
    },
  });

  await pool.query(
    `UPDATE ana_deep_investigations
     SET status = 'completed', result_text = $2, model = $3, provider = $4,
         heartbeat_at = NOW(), completed_at = NOW()
     WHERE id = $1`,
    [id, response.content || '', response.model ?? null, response.provider ?? null],
  );
}

/** Load one investigation scoped to the tenant (null org matches null). */
export async function getInvestigation(
  id: string,
  organizationId: number | null,
): Promise<InvestigationRow | null> {
  const { rows } = await getPool().query(
    `SELECT id, status, question, progress, result_text, error, tool_call_count,
            model, provider, created_at, started_at, heartbeat_at, completed_at
     FROM ana_deep_investigations
     WHERE id = $1 AND organization_id IS NOT DISTINCT FROM $2`,
    [id, organizationId],
  );
  return (rows[0] as InvestigationRow) ?? null;
}

/** Most recent investigations for the tenant (for a check without an id). */
export async function listRecentInvestigations(
  organizationId: number | null,
  limit = 5,
): Promise<InvestigationRow[]> {
  const { rows } = await getPool().query(
    `SELECT id, status, question, progress, result_text, error, tool_call_count,
            model, provider, created_at, started_at, heartbeat_at, completed_at
     FROM ana_deep_investigations
     WHERE organization_id IS NOT DISTINCT FROM $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [organizationId, limit],
  );
  return rows as InvestigationRow[];
}
