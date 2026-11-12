/**
 * Tool runtime — the one wrapper every connector tool runs through.
 *
 * For each call it: checks the token's scope against the tool's declared
 * scope; opens the tenant scope the platform's pool instrumentation requires
 * (under RLS_ENFORCE=on a query with no scope fails closed); runs the tool;
 * writes an audit row through the platform's audit service (tool name, org,
 * user, client, outcome, duration); and renders the outcome as an MCP
 * CallToolResult with both a short text summary and structuredContent.
 *
 * A refusal — no licence, no credentials, no API key, a service that says no —
 * is returned VERBATIM as an error result. Nothing here turns a failure into
 * an empty success.
 */

import type { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { isPlatformScopeRole, PlatformScopeRoleRefusedError, runWithTenantScope } from '../../db/tenantStore';
import type { McpConfig, McpScope } from '../config';
import { principalOf, type McpPrincipal } from '../auth/platform-token';
import type { RequestSqlClient } from '../../db/requestDb';
import { LazyRequestDbClient } from '../../middleware/lazyRequestDbClient';
import { applySessionScope } from '../../db/sessionScope';

export interface ToolRunContext {
  principal: McpPrincipal;
  config: McpConfig;
  /** Server-owned, pinned to this authenticated tool call; never tool input. */
  sqlClient?: RequestSqlClient;
  /** The shape AnA's registered handlers take (ToolContext in AnaToolExecutor). */
  ana: { organizationId: number; userId: number; organizationUuid: string | null;
    sqlClient?: RequestSqlClient; signal?: AbortSignal };
}

export type ToolOutcome =
  | { kind: 'ok'; summary: string; data: Record<string, unknown> }
  | { kind: 'refused'; reason: string; data?: Record<string, unknown> };

export const ok = (summary: string, data: Record<string, unknown>): ToolOutcome => ({ kind: 'ok', summary, data });
export const refused = (reason: string, data?: Record<string, unknown>): ToolOutcome => ({ kind: 'refused', reason, data });

export interface ToolSpec<Shape extends z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  inputSchema: Shape;
  annotations: Required<Pick<ToolAnnotations, 'readOnlyHint' | 'destructiveHint' | 'idempotentHint' | 'openWorldHint'>>;
  scope: McpScope;
  /** Part 11-relevant: the tool creates or changes a governed record. */
  governed: boolean;
  /** Which platform implementation the tool calls — documentation, not routing. */
  implementation: string;
  run(input: z.infer<z.ZodObject<Shape>>, ctx: ToolRunContext): Promise<ToolOutcome>;
}

export function defineTool<Shape extends z.ZodRawShape>(spec: ToolSpec<Shape>): ToolSpec<Shape> {
  return spec;
}

export type AnyToolSpec = ToolSpec<z.ZodRawShape>;

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? `${err.message} (code ${code})` : err.message;
  }
  return String(err);
}

/**
 * Parse what an AnA handler returned. Handlers return JSON strings; a plain
 * string is carried as { text }. An `error` key is a refusal, verbatim.
 */
export function parseAnaResult(raw: string): ToolOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return ok(raw.slice(0, 400), { text: raw });
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.error === 'string') return refused(obj.error, obj);
    if (obj.status === 'needs_parameters' || obj.status === 'needs_context') {
      return refused(String(obj.message ?? obj.status), obj);
    }
    return ok('', obj);
  }
  return ok('', { value: parsed });
}

/**
 * Call one of AnA's registered deterministic handlers with the caller's tenant.
 *
 * The tenant's AnA tool policy applies here as on every chat door: a tool in
 * `anaToolPolicy.deny` is withheld there by governedToolsetFor, and this ran
 * the handler directly, so the same tool still ran for the same organization
 * over the connector. Same loader, same filter (deny-list only; `allow` is
 * scoped to governed mutations), so the two doors cannot disagree.
 */
export async function callAnaHandler(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolRunContext,
): Promise<ToolOutcome> {
  const [{ getToolHandler }, { loadAnaToolPolicy, filterToolsByPolicy }, { getPool }] = await Promise.all([
    import('../../services/ana/AnaToolExecutor'),
    import('../../services/ana-ri/mdx-tool-policy'),
    import('../../db'),
  ]);
  const policy = await loadAnaToolPolicy(getPool(), ctx.ana.organizationId);
  if (filterToolsByPolicy([{ name }], policy).length === 0) {
    return refused(`Platform tool "${name}" is disabled by your organization's AnA tool policy.`);
  }
  const handler = getToolHandler(name);
  if (!handler) return refused(`Platform tool "${name}" is not registered on this deployment.`);
  const raw = await handler(input, ctx.ana);
  return parseAnaResult(raw);
}

async function writeAudit(entry: {
  principal: McpPrincipal;
  tool: string;
  governed: boolean;
  outcome: 'ok' | 'refused' | 'denied' | 'failed';
  durationMs: number;
  detail?: string;
}): Promise<boolean> {
  try {
    const { default: auditService } = await import('../../services/auditService');
    const result = await auditService.logAction({
      organizationId: entry.principal.organizationId,
      userId: entry.principal.userId,
      action: entry.governed ? 'mcp_governed_tool_call' : 'mcp_tool_call',
      resourceType: 'mcp_tool',
      resourceId: entry.tool,
      details: {
        tool: entry.tool,
        organizationId: entry.principal.organizationId,
        clientId: entry.principal.clientId,
        tokenUse: entry.principal.tokenUse,
        scopes: entry.principal.scopes,
        outcome: entry.outcome,
        durationMs: entry.durationMs,
        ...(entry.detail ? { detail: entry.detail.slice(0, 500) } : {}),
      },
    });
    // logAction resolves { persisted:false, error } rather than throwing when
    // the row could not be written (for example when no tenant scope is
    // active under RLS enforcement — the pool refuses the connection). That
    // is an audit outage, and a caller must never learn "ok" from a governed
    // tool whose record does not exist. Report it; the caller decides.
    const persisted = (result as { persisted?: boolean } | undefined)?.persisted;
    if (persisted === false) {
      const { logger } = await import('../../utils/logger.js');
      logger.error('[mcp] audit row not persisted for tool call', {
        tool: entry.tool,
        organizationId: entry.principal.organizationId,
        error: (result as { error?: string }).error,
      });
      return false;
    }
    return true;
  } catch (err) {
    const { logger } = await import('../../utils/logger.js');
    logger.error('[mcp] audit write threw for tool call', {
      tool: entry.tool,
      organizationId: entry.principal.organizationId,
      error: errorMessage(err),
    });
    return false;
  }
}

function render(outcome: ToolOutcome, tool: string): CallToolResult {
  if (outcome.kind === 'refused') {
    return {
      isError: true,
      content: [{ type: 'text', text: outcome.reason }],
      structuredContent: { tool, refused: true, reason: outcome.reason, ...(outcome.data ?? {}) },
    };
  }
  const summary = outcome.summary || `${tool} completed.`;
  return {
    content: [{ type: 'text', text: summary }],
    structuredContent: { tool, ...outcome.data },
  };
}

/** One lazy physical connection per verified tool call. Identity comes from
 * the SDK's validated principal, not headers, a fabricated Express request or
 * an organization/user field supplied to the model's tool arguments.
 *
 * The principal's role is written to app.current_user_role, which the platform
 * arm of about 977 tenant policies compares with 'app_super_admin'. A tool call
 * acts for one organisation, so that role is refused here, however it is cased
 * or padded, before any connection is taken, whatever the caller checked: the
 * same refusal a per-user request scope gives (P-72 slices 1a and 1b,
 * server/db/tenantStore.ts isPlatformScopeRole;
 * docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1b/). The principal's role
 * falls back to the token's claim when the membership row has none
 * (auth/platform-token.ts verifyPlatformBearer). */
async function createMcpCallSqlClient(principal: McpPrincipal, signal: AbortSignal | undefined): Promise<{
  sqlClient: RequestSqlClient; release(): Promise<void>;
}> {
  if (isPlatformScopeRole(principal.role)) throw new PlatformScopeRoleRefusedError('mcp tool call');
  const { pool } = await import('../../db');
  const client = new LazyRequestDbClient(pool, checkedOut => applySessionScope(checkedOut, {
    tenantId: String(principal.organizationId), role: principal.role, orgUuid: principal.organizationUuid, accountId: principal.userId,
  }));
  const sqlClient: RequestSqlClient = {
    async query(text, params) {
      // Cancellation stops follow-up statements. Never throw after a COMMIT
      // succeeded and thereby report a persisted action as if it failed.
      signal?.throwIfAborted();
      return client.query(text, params);
    },
  };
  return { sqlClient, release: () => client.release() };
}

/**
 * The connector's edge (MR-03 Stage 6 step 9, OPS-17). A tool call's answer
 * travels through CloudFront and the ALB, which close a connection that
 * carries nothing for 60 s. Two rules keep a call honest inside that:
 *  - a call whose request carries `_meta.progressToken` gets a
 *    `notifications/progress` every MCP_PROGRESS_INTERVAL_MS, which the
 *    streamable HTTP transport writes on the call's own stream;
 *  - a tool that writes nothing governed is answered at MCP_TOOL_DEADLINE_MS
 *    with an error result saying it did not finish, never with a partial
 *    result presented as complete. The work is told to stop (the call's
 *    signal), and its database connection is released only once it has
 *    settled. A governed tool has no deadline: it may already have written
 *    its record, and an error would report a persisted act as failed.
 */
export const MCP_TOOL_DEADLINE_MS = 50_000;
export const MCP_PROGRESS_INTERVAL_MS = 15_000;
const DEADLINE = Symbol('mcp-tool-deadline');

export function deadlineRefusal(tool: string): string {
  return `${tool} did not finish within the connector's time limit (${MCP_TOOL_DEADLINE_MS / 1000} s); nothing partial was returned. Continue in the app, where the same work has no such limit.`;
}

type CallExtra = {
  authInfo?: import('@modelcontextprotocol/sdk/server/auth/types.js').AuthInfo;
  signal?: AbortSignal;
  _meta?: { progressToken?: string | number };
  sendNotification?: (notification: { method: 'notifications/progress'; params: { progressToken: string | number; progress: number; message?: string } }) => Promise<void>;
};

/** Progress notifications for one call, while it runs; a no-op without a token. */
function startProgress(tool: string, extra: CallExtra, started: number): () => void {
  const token = extra._meta?.progressToken;
  if (token === undefined || !extra.sendNotification) return () => undefined;
  let beat = 0;
  const timer = setInterval(() => {
    beat += 1;
    extra.sendNotification!({
      method: 'notifications/progress',
      params: { progressToken: token, progress: beat, message: `${tool} is still working (${Math.round((Date.now() - started) / 1000)} s)` },
    }).catch(() => undefined);
  }, MCP_PROGRESS_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

/**
 * Run the tool; a tool that writes nothing governed is raced against the
 * deadline. Past it, the work is told to stop and handed back as `abandoned`,
 * so the caller releases the call's connection only once it settles.
 */
async function runWithinDeadline(
  spec: AnyToolSpec,
  input: Record<string, unknown>,
  ctx: ToolRunContext,
  stopWork: AbortController,
): Promise<{ outcome: ToolOutcome; audited: 'ok' | 'refused' | 'failed'; abandoned: Promise<unknown> | null }> {
  const work = spec.run(input, ctx);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const settled = spec.governed
      ? await work
      : await Promise.race([
        work,
        new Promise<typeof DEADLINE>((resolve) => { deadline = setTimeout(() => resolve(DEADLINE), MCP_TOOL_DEADLINE_MS); }),
      ]);
    if (settled === DEADLINE) {
      stopWork.abort(new Error(deadlineRefusal(spec.name)));
      return { outcome: refused(deadlineRefusal(spec.name), { deadlineMs: MCP_TOOL_DEADLINE_MS }), audited: 'failed', abandoned: work };
    }
    return { outcome: settled, audited: settled.kind === 'refused' ? 'refused' : 'ok', abandoned: null };
  } finally {
    clearTimeout(deadline);
  }
}

export function registerTool(server: McpServer, spec: AnyToolSpec, config: McpConfig): void {
  server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.inputSchema,
      annotations: { title: spec.title, ...spec.annotations },
      _meta: { scope: spec.scope, governed: spec.governed, implementation: spec.implementation },
    },
    async (input: Record<string, unknown>, extra: CallExtra) => {
      const principal = principalOf(extra.authInfo);
      if (!principal) {
        return render(refused('No authenticated principal on this call; the bearer token did not resolve to a user and organisation.'), spec.name);
      }
      const started = Date.now();
      // Everything below — the scope check's audit row, the tool itself and
      // its audit row — runs inside ONE tenant scope. The audit service reaches
      // the pool through the same tenant-scoped instrumentation as every other
      // write, and under RLS_ENFORCE=on that pool refuses a connection with no
      // scope; an audit write placed outside the scope was silently dropped.
      return runWithTenantScope(
        {
          tenantId: String(principal.organizationId),
          orgUuid: principal.organizationUuid,
          role: principal.role,
          accountId: principal.userId,
          source: 'request',
          caller: `mcp:${spec.name}`,
        },
        async () => {
          if (!principal.scopes.includes(spec.scope)) {
            const reason = `Insufficient scope: ${spec.name} requires ${spec.scope}; this token carries [${principal.scopes.join(' ')}].`;
            await writeAudit({ principal, tool: spec.name, governed: spec.governed, outcome: 'denied', durationMs: 0, detail: reason });
            return render(refused(reason), spec.name);
          }
          /* 2026-09-28 (GS-S-1, coverage-gap sweep): a governed tool writes a
             governed record, so it needs an editor role in the organization —
             read live from organization_users, never from the token. The scope
             check alone let a viewer's own login token (which resolves to every
             scope) run c2c_file_draft_for_review, which the REST route and AnA
             both refuse them. Same decision as AnA's registry wrapper. */
          if (spec.governed) {
            const { editorRoleDecision, editorRoleRefusalText } = await import('../../services/part11/editor-role');
            const decision = await editorRoleDecision(principal.userId, principal.organizationId);
            if (!decision.allowed) {
              const reason = editorRoleRefusalText(spec.name, `${spec.name}`, decision);
              await writeAudit({ principal, tool: spec.name, governed: spec.governed, outcome: 'denied', durationMs: 0, detail: reason });
              return render(refused(reason), spec.name);
            }
          }
          // The call's signal: the client's cancellation, and the deadline's.
          const stopWork = new AbortController();
          const signal = extra.signal ? AbortSignal.any([extra.signal, stopWork.signal]) : stopWork.signal;
          const call = await createMcpCallSqlClient(principal, signal);
          let running: Promise<unknown> | null = null;
          const stopProgress = startProgress(spec.name, extra, started);
          try {
            const ctx: ToolRunContext = {
              principal,
              config,
              sqlClient: call.sqlClient,
              ana: { organizationId: principal.organizationId, userId: principal.userId,
                organizationUuid: principal.organizationUuid, sqlClient: call.sqlClient, signal },
            };
            let outcome: ToolOutcome;
            let audited: 'ok' | 'refused' | 'failed';
            try {
              extra.signal?.throwIfAborted();
              ({ outcome, audited, abandoned: running } = await runWithinDeadline(spec, input, ctx, stopWork));
            } catch (err) {
              audited = 'failed';
              outcome = refused(`${spec.name} failed: ${errorMessage(err)}`);
            } finally {
              stopProgress();
            }
            const recorded = await writeAudit({
              principal,
              tool: spec.name,
              governed: spec.governed,
              outcome: audited,
              durationMs: Date.now() - started,
              detail: outcome.kind === 'refused' ? outcome.reason : undefined,
            });
            if (!recorded && spec.governed && outcome.kind !== 'refused') {
              // The action ran; its Part 11 record did not. Say exactly that
              // rather than "ok": the data is returned so nothing is hidden, and
              // the result is flagged so the client does not treat it as clean.
              return {
                isError: true,
                content: [
                  {
                    type: 'text',
                    text: `${spec.name} executed, but its audit record could not be written. Treat this result as unrecorded until the audit service is repaired; the platform logged the failure.`,
                  },
                ],
                structuredContent: { tool: spec.name, auditRecorded: false, ...outcome.data },
              };
            }
            return render(outcome, spec.name);
          } finally {
            // Wait for the handler to settle before resetting/releasing a
            // client that may still have a statement or transaction in flight.
            // Past the deadline the answer has gone; the release follows the
            // abandoned work, whenever it settles.
            if (running) void running.catch(() => undefined).finally(() => call.release().catch(() => undefined));
            else await call.release();
          }
        },
      );
    },
  );
}
