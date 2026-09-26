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
import { runWithTenantScope } from '../../db/tenantStore';
import type { McpConfig, McpScope } from '../config';
import { principalOf, type McpPrincipal } from '../auth/platform-token';
import {
  buildToolProposalResult,
  buildToolRefusalResult,
  isProposeOnlyTool,
  refusedInChatTool,
} from '../../services/ana/propose-only-tools';

export interface ToolRunContext {
  principal: McpPrincipal;
  config: McpConfig;
  /** The shape AnA's registered handlers take (ToolContext in AnaToolExecutor). */
  ana: {
    organizationId: number;
    userId: number;
    organizationUuid: string | null;
    /**
     * A person's confirmation of a proposed tool call. Never set on this
     * surface: a connector call has no person in the loop, so a propose-only
     * tool is refused here in practice. Read, not written — its one writer
     * anywhere is routes/ana-ri/utility.ts (propose-only-partition.test.ts).
     */
    humanConfirmed?: boolean;
  };
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
 * This is a door into the handler map with no other classifier in front of it,
 * so the propose-only partition for direct tools (propose-only-tools.ts; audit
 * DP-36, P1-34) is held here: an act a chat cannot perform is refused with
 * where a person takes it, and a proposal is refused HUMAN_CONFIRMATION_REQUIRED
 * unless the context carries a person's confirmation — which nothing on this
 * surface ever stamps. Both are audited as denials, like a scope denial. The
 * confirmation is read from the context and never from the tool's input.
 */
export async function callAnaHandler(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolRunContext,
): Promise<ToolOutcome> {
  const refusal = refusedInChatTool(name, input);
  if (refusal) {
    await writeAudit({ principal: ctx.principal, tool: name, governed: true, outcome: 'denied', durationMs: 0, detail: `REFUSED_IN_CHAT: ${refusal.act}` });
    return parseAnaResult(JSON.stringify(buildToolRefusalResult(refusal)));
  }
  if (isProposeOnlyTool(name) && ctx.ana.humanConfirmed !== true) {
    await writeAudit({ principal: ctx.principal, tool: name, governed: true, outcome: 'denied', durationMs: 0, detail: 'HUMAN_CONFIRMATION_REQUIRED: no person in the loop on the connector surface' });
    return parseAnaResult(JSON.stringify(buildToolProposalResult(name, input)));
  }
  const { getToolHandler } = await import('../../services/ana/AnaToolExecutor');
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
    async (input: Record<string, unknown>, extra: { authInfo?: import('@modelcontextprotocol/sdk/server/auth/types.js').AuthInfo }) => {
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
          source: 'request',
          caller: `mcp:${spec.name}`,
        },
        async () => {
          if (!principal.scopes.includes(spec.scope)) {
            const reason = `Insufficient scope: ${spec.name} requires ${spec.scope}; this token carries [${principal.scopes.join(' ')}].`;
            await writeAudit({ principal, tool: spec.name, governed: spec.governed, outcome: 'denied', durationMs: 0, detail: reason });
            return render(refused(reason), spec.name);
          }
          const ctx: ToolRunContext = {
            principal,
            config,
            ana: { organizationId: principal.organizationId, userId: principal.userId, organizationUuid: principal.organizationUuid },
          };
          let outcome: ToolOutcome;
          let audited: 'ok' | 'refused' | 'failed' = 'ok';
          try {
            outcome = await spec.run(input, ctx);
            if (outcome.kind === 'refused') audited = 'refused';
          } catch (err) {
            audited = 'failed';
            outcome = refused(`${spec.name} failed: ${errorMessage(err)}`);
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
        },
      );
    },
  );
}
