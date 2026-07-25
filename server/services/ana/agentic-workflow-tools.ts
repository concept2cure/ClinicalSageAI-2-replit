/**
 * Agentic workflow tools — the long-running / orientation tools, extracted from
 * the two mega-modules (AnaToolDefinitions.ts, AnaToolExecutor.ts) into one
 * cohesive place: the drafting council, background deep investigations, and the
 * client-journey read. Definitions AND handler registration live together here.
 *
 * This is the first tranche of a phased decomposition of those files. The
 * handler registration is INJECTED (registerAgenticWorkflowHandlers(register))
 * rather than importing registerToolHandler, so there is no runtime import cycle
 * with AnaToolExecutor; ToolContext is a type-only (erased) import. The module
 * is a sibling of the originals, so every relative import inside the handlers is
 * byte-identical to before.
 *
 * @module server/services/ana/agentic-workflow-tools
 */

import type { AnaTool } from '../ai-gateway/types';
import { capToolResultForModel } from './agentic-loop.js';
import type { ToolContext } from './AnaToolExecutor.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tool definitions
// ─────────────────────────────────────────────────────────────────────────────

export const CONVENE_DRAFTING_COUNCIL: AnaTool = {
  name: 'convene_drafting_council',
  description:
    "Convene the four-agent drafting council for a HIGH-ASSURANCE section draft: a Drafter writes the section, a Statistician extracts and checks every numerical claim, a Critic reviews it as a hostile agency reviewer, and a Synthesizer produces the final text with corrections applied. Use this when the user asks for a draft that is independently verified and adversarially reviewed before they see it (e.g. 'give me a reviewed draft of 2.5', 'run the council on the device description', 'I want a checked draft, not a first pass') — for a quick ordinary draft, use the normal drafting tools instead. Runs four sequential model calls (expect one to two minutes); every agent execution is Part-11 audit-logged with the model, tokens, and latency recorded. Returns the final synthesized text plus the verification and critique summaries. Nothing is auto-saved — the user promotes the final text through the governed authoring flow. If the council is not provisioned in this deployment, the tool says so instead of failing.",
  input_schema: {
    type: 'object',
    properties: {
      section_path: {
        type: 'string',
        description: "The section to draft (e.g. '2.5.4', 'device_description', 'M2.7.3 safety summary').",
      },
      requirements: {
        type: 'object',
        description:
          'Free-form drafting requirements the Drafter must honor — product/device name, indication, framework, key messages, constraints. Passed to the Drafter verbatim as JSON.',
      },
      context: {
        type: 'string',
        description:
          'Optional source/background text the draft must be grounded in (protocol excerpts, prior sections, data summaries). The Drafter may not invent facts beyond this and the requirements.',
      },
    },
    required: ['section_path'],
  },
};

export const GET_CLIENT_JOURNEY: AnaTool = {
  name: 'get_client_journey',
  description:
    "Find out where this client is on their journey from starting a license all the way to a full regulatory submission, and what the next milestone is. Returns a stage (just_licensed, onboarding, project_started, authoring, in_review, submission_ready, submitted), a plain-language read of where they are, the next milestone, and the concrete thing you should offer to do right now. Use this to ORIENT a client — especially a brand-new one who just started and doesn't know where to begin, or any time the user asks 'where do I start', 'what should I do next', or 'where does my program stand'. For a brand-new licensee it will tell you to welcome them and offer to set up their first project via the onboarding questionnaire (start_intelligence_flow with project_setup). Reads live project/artifact/submission state — deterministic, no guessing; when the tenant has no data yet it lands on the earliest welcome stage.",
  input_schema: {
    type: 'object',
    properties: {
      segment: {
        type: 'string',
        description:
          "Optional segment hint if you already know it ('mdx', 'biotech', or 'pharma') — tailors the welcome framing.",
      },
    },
    required: [],
  },
};

export const START_DEEP_INVESTIGATION: AnaTool = {
  name: 'start_deep_investigation',
  description:
    "Start a BACKGROUND deep investigation that keeps working after this turn ends: a thorough multi-round agentic research run (many searches, cross-checks, and verifications) whose progress and final research memo are persisted so the user can come back to it. Use ONLY when the question genuinely needs sustained multi-source research that would keep the user waiting several minutes — e.g. 'do a deep dive on predicate landscape for X', 'research everything on this pathway change and report back'. Do NOT use it for anything answerable in the current turn with a few tool calls — answer directly instead. Returns immediately with an investigation id; check on it later with check_deep_investigation. Runs at Thorough depth (deepest loop, full reasoning) on the platform's model-tier policy; concurrent background investigations are capped per tenant, and the tool says so plainly when the cap or provisioning blocks a start.",
  input_schema: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description:
          'The research question, stated precisely and self-contained — the background run cannot ask follow-ups.',
      },
      context: {
        type: 'string',
        description:
          'Optional background the run should ground in (program facts, constraints, prior findings).',
      },
    },
    required: ['question'],
  },
};

export const CHECK_DEEP_INVESTIGATION: AnaTool = {
  name: 'check_deep_investigation',
  description:
    "Check on background deep investigations: pass an investigation_id for one run's status, progress, and (when completed) its final research memo — or omit it to list the tenant's recent investigations. Reports honestly: a run orphaned by a server restart is reported as stalled, never as eternally running. Use whenever the user asks how a research task is going, or asks for its results.",
  input_schema: {
    type: 'object',
    properties: {
      investigation_id: {
        type: 'string',
        description: 'The investigation to inspect. Omit to list recent investigations instead.',
      },
    },
    required: [],
  },
};


// ─────────────────────────────────────────────────────────────────────────────
// Handler registration (injected register avoids an import cycle)
// ─────────────────────────────────────────────────────────────────────────────

type RegisterFn = (
  name: string,
  handler: (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>,
) => void;

/** Register the agentic-workflow tool handlers on the executor's registry. */
export function registerAgenticWorkflowHandlers(register: RegisterFn): void {
// The four-agent drafting council (Drafter → Statistician → Critic →
// Synthesizer, server/services/multi-agent-council.ts). Long-running by design
// (four sequential gateway calls, each Part-11 audit-logged); the pre-flight
// keeps it honest-by-construction in deployments where the lumen schema /
// agent registry has not been provisioned (npm run db:apply-c2c seeds it).
  register('convene_drafting_council', async (input, ctx) => {
  const sectionPath = typeof input.section_path === 'string' ? input.section_path.trim() : '';
  if (!sectionPath) {
    return JSON.stringify({ error: 'section_path is required — which section should the council draft?' });
  }
  const requirements =
    input.requirements && typeof input.requirements === 'object' && !Array.isArray(input.requirements)
      ? (input.requirements as Record<string, unknown>)
      : {};
  const context = typeof input.context === 'string' && input.context.trim() ? input.context.trim() : undefined;
  // Context rides inside requirements — the Drafter template renders requirements
  // as JSON, and the council's atom-based context store is a separate ingestion
  // path this conversational tool doesn't populate.
  const councilRequirements: Record<string, unknown> = {
    ...requirements,
    ...(context ? { source_context: context } : {}),
  };

  const { getPool } = await import('../../db.js');
  const pool = getPool();

  // Pre-flight: the council needs the provisioned lumen schema AND all four
  // seeded agents. Answer plainly when it isn't there instead of crashing
  // mid-pipeline — the honesty boundary for an infrastructure-backed tool.
  const registry = await pool
    .query(`SELECT count(*)::int AS n FROM lumen.agent_registry WHERE is_active = TRUE`)
    .catch(() => null);
  if (!registry || (registry.rows[0]?.n ?? 0) < 4) {
    return JSON.stringify({
      status: 'not_provisioned',
      error:
        'The drafting council is not provisioned in this deployment (lumen schema or agent registry missing). ' +
        'An administrator can enable it by applying the council migration (npm run db:apply-c2c).',
    });
  }

  try {
    const { MultiAgentCouncilService } = await import('../multi-agent-council.js');
    const council = new MultiAgentCouncilService(pool);
    const sessionId = await council.initializeSession(sectionPath, councilRequirements, []);
    const session = await council.executeCouncil(
      sessionId,
      ctx?.userId != null ? String(ctx.userId) : undefined,
    );
    return JSON.stringify({
      status: 'completed',
      session_id: session.id,
      section_path: sectionPath,
      final_text: session.finalText,
      corrections_applied: session.corrections,
      issues_found: session.issues,
      critic_assessment: session.criticResult?.overallAssessment,
      // Bounded detail so the model can narrate what the council caught
      // without the payload swamping the loop context.
      discrepancies: (session.statisticianResult?.verifications || [])
        .filter(v => v.status === 'DISCREPANCY')
        .slice(0, 10),
      high_severity_issues: (session.criticResult?.issues || [])
        .filter(i => i.severity === 'HIGH')
        .slice(0, 10),
      note:
        'Four-agent audit trail persisted (lumen.agent_executions). Nothing was auto-saved — promote the final text through the governed authoring flow.',
    });
  } catch (error: any) {
    return JSON.stringify({
      error: `Council execution failed: ${error?.message ?? 'unknown error'}`,
      tool: 'convene_drafting_council',
    });
  }
});

// Client onboarding journey (server/services/ana/client-journey.ts) — where the
// tenant is on the license → full-submission path, and what to offer next. A
// pure read over live state; honest-by-construction (no data → earliest welcome
// stage). Orients a brand-new client at first contact and any time thereafter.
  register('get_client_journey', async (input, ctx) => {
  const validSegments = new Set(['mdx', 'biotech', 'pharma']);
  const segment =
    typeof input.segment === 'string' && validSegments.has(input.segment)
      ? (input.segment as 'mdx' | 'biotech' | 'pharma')
      : null;
  const orgId = ctx?.organizationId ?? null;
  try {
    const { getClientJourney, describeClientJourney } = await import('./client-journey.js');
    const { getPool } = await import('../../db.js');
    // No tenant context yet (pre-license / anonymous): still orient them with
    // the welcome stage rather than failing.
    const journey =
      orgId != null
        ? await getClientJourney(getPool(), orgId, { segment })
        : describeClientJourney('just_licensed', { segment });
    return JSON.stringify({ source: 'AnA client journey', ...journey });
  } catch (error: any) {
    return JSON.stringify({
      error: `Could not read the client journey: ${error?.message ?? 'unknown error'}`,
      tool: 'get_client_journey',
    });
  }
});

// Background deep-research investigations (server/services/ana/deep-investigation.ts).
// start returns immediately — the run outlives this chat turn; check reports
// honest status including stalled runs. Dynamic import breaks the static cycle
// (the runner executes this module's agentic loop). Kill-switch:
// ANA_ENABLE_DEEP_INVESTIGATIONS=false.
  register('start_deep_investigation', async (input, ctx) => {
  if ((process.env.ANA_ENABLE_DEEP_INVESTIGATIONS ?? 'true').toLowerCase() === 'false') {
    return JSON.stringify({
      status: 'disabled',
      error: 'Background deep investigations are disabled in this deployment (ANA_ENABLE_DEEP_INVESTIGATIONS=false).',
    });
  }
  const question = typeof input.question === 'string' ? input.question.trim() : '';
  if (question.length < 12) {
    return JSON.stringify({
      error: 'A precise, self-contained research question is required — the background run cannot ask follow-ups.',
    });
  }
  const context = typeof input.context === 'string' && input.context.trim() ? input.context.trim() : undefined;
  try {
    const { startDeepInvestigation } = await import('./deep-investigation.js');
    const started = await startDeepInvestigation({
      question,
      context,
      organizationId: ctx?.organizationId ?? null,
      userId: ctx?.userId ?? null,
      projectId: ctx?.projectId ?? null,
    });
    if (started.status === 'limit_reached') {
      return JSON.stringify({
        status: 'limit_reached',
        error: `This tenant already has ${started.running} background investigation(s) active — check on those first (check_deep_investigation) or wait for one to finish.`,
      });
    }
    if (started.status === 'not_provisioned') {
      return JSON.stringify({
        status: 'not_provisioned',
        error:
          'Background investigations are not provisioned in this deployment (ana_deep_investigations table missing). ' +
          'An administrator can enable them by applying migrations (npm run db:apply-c2c).',
      });
    }
    return JSON.stringify({
      status: 'started',
      investigation_id: started.id,
      note:
        'The investigation is running in the background at Thorough depth and will keep working after this reply. ' +
        'Typical runs take a few minutes; check on it with check_deep_investigation.',
    });
  } catch (error: any) {
    return JSON.stringify({
      error: `Could not start the investigation: ${error?.message ?? 'unknown error'}`,
      tool: 'start_deep_investigation',
    });
  }
});

  register('check_deep_investigation', async (input, ctx) => {
  const orgId = ctx?.organizationId ?? null;
  try {
    const { getInvestigation, listRecentInvestigations, describeInvestigationStatus } =
      await import('./deep-investigation.js');
    const id = typeof input.investigation_id === 'string' ? input.investigation_id.trim() : '';
    if (!id) {
      const recent = await listRecentInvestigations(orgId, 5);
      return JSON.stringify({
        investigations: recent.map(r => ({
          investigation_id: r.id,
          question: r.question.length > 160 ? `${r.question.slice(0, 160)}…` : r.question,
          status: describeInvestigationStatus(r),
          tool_calls: r.tool_call_count,
          started_at: r.started_at,
          completed_at: r.completed_at,
        })),
        note: recent.length === 0 ? 'No background investigations for this tenant yet.' : undefined,
      });
    }
    const row = await getInvestigation(id, orgId);
    if (!row) {
      return JSON.stringify({ error: `No investigation ${id} found for this tenant.` });
    }
    const status = describeInvestigationStatus(row);
    return JSON.stringify({
      investigation_id: row.id,
      question: row.question,
      status,
      tool_calls: row.tool_call_count,
      // Recent activity so the model can narrate progress on a live run.
      recent_progress: (Array.isArray(row.progress) ? row.progress : []).slice(-5),
      ...(row.status === 'completed' && row.result_text
        ? { result: capToolResultForModel(row.result_text, 6000), model: row.model, provider: row.provider }
        : {}),
      ...(row.status === 'failed' ? { error: row.error } : {}),
      started_at: row.started_at,
      completed_at: row.completed_at,
    });
  } catch (error: any) {
    if (/relation .*ana_deep_investigations.* does not exist/i.test(String(error?.message))) {
      return JSON.stringify({
        status: 'not_provisioned',
        error: 'Background investigations are not provisioned in this deployment (npm run db:apply-c2c enables them).',
      });
    }
    return JSON.stringify({
      error: `Could not check investigations: ${error?.message ?? 'unknown error'}`,
      tool: 'check_deep_investigation',
    });
  }
});
}
