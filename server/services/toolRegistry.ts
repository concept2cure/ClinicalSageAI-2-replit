/**
 * Tool Registry
 *
 * Central registry of all tools the assistant can invoke.
 * Each tool is a typed definition with metadata for routing, display, and execution.
 *
 * Architecture:
 *   Intent string → Registry lookup → Tool definition → execute() → ToolResult
 *
 * Categories map to platform modules:
 *   regulatory  — CER, 510(k), IND, IVDR, eCTD
 *   documents   — vault upload, authoring, export
 *   analysis    — protocol analysis, similarity search, CSR extraction
 *   workspace   — project management, settings
 *   chat        — generic assistant interactions
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolCategory = 'regulatory' | 'documents' | 'analysis' | 'workspace' | 'chat';

export interface ToolParam {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  description?: string;
}

export interface ToolArtifact {
  type: string;
  id: string;
  title: string;
  status: 'queued' | 'running' | 'generated' | 'failed';
  projectId?: string | null;
  data?: Record<string, unknown>;
}

export interface ToolResult {
  /** Whether the tool executed successfully */
  ok: boolean;
  artifact: ToolArtifact | null;
  message: { role: 'assistant'; content: string };
  /** Short summary for LLM context (keeps tool results compact) */
  summary?: string;
  redirect?: string;
  openModal?: string;
  /** Additional tools the router should chain after this one */
  chain?: string[];
}

export interface ToolContext {
  organizationId: string;
  userId: string | null;
  projectId?: string | null;
}

export interface ToolDefinition {
  /** Unique intent string: 'category.action' or 'category.subcategory.action' */
  name: string;
  /** Human-readable label for UI display */
  label: string;
  /** What this tool does — shown in tool picker / help */
  description: string;
  /** Module category for grouping and routing */
  category: ToolCategory;
  /** Accepted parameters */
  params: ToolParam[];
  /** Aliases that also resolve to this tool */
  aliases?: string[];
  /** Execute the tool */
  execute: (params: Record<string, string>, ctx: ToolContext) => Promise<ToolResult>;
}

// ─── Tool Execution Logging ──────────────────────────────────────────────────

import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';
const registryLogger = createScopedLogger('tool-registry');

/** Persist a tool execution record for audit / replay / analytics */
export async function logToolRun(params: {
  threadId?: string;
  projectId?: number | null;
  userId?: number | null;
  organizationId?: number | null;
  toolName: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
  status: 'success' | 'error' | 'not_found';
  errorMessage?: string;
  latencyMs: number;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO chat_tool_runs
         (thread_id, project_id, user_id, organization_id, tool_name, arguments, result, status, error_message, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        params.threadId || null,
        params.projectId || null,
        params.userId || null,
        params.organizationId || null,
        params.toolName,
        JSON.stringify(params.arguments),
        JSON.stringify(params.result),
        params.status,
        params.errorMessage || null,
        params.latencyMs,
      ]
    );
  } catch (err: any) {
    registryLogger.warn(`Failed to log tool run: ${err.message}`);
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const tools = new Map<string, ToolDefinition>();

/**
 * Register a tool definition. Throws on duplicate name/alias.
 */
export function registerTool(def: ToolDefinition): void {
  if (tools.has(def.name)) {
    throw new Error(`Tool "${def.name}" is already registered`);
  }
  tools.set(def.name, def);
  if (def.aliases) {
    for (const alias of def.aliases) {
      if (tools.has(alias)) {
        throw new Error(`Tool alias "${alias}" conflicts with existing tool`);
      }
      tools.set(alias, def);
    }
  }
}

/**
 * Look up a tool by its intent name or alias.
 */
export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

/**
 * List all unique tool definitions (de-duplicated from aliases).
 */
export function listTools(): ToolDefinition[] {
  const seen = new Set<string>();
  const result: ToolDefinition[] = [];
  for (const def of tools.values()) {
    if (!seen.has(def.name)) {
      seen.add(def.name);
      result.push(def);
    }
  }
  return result;
}

/**
 * List tools in a specific category.
 */
export function listToolsByCategory(category: ToolCategory): ToolDefinition[] {
  return listTools().filter(t => t.category === category);
}

/**
 * Check if a tool exists for the given intent.
 */
export function hasTool(name: string): boolean {
  return tools.has(name);
}

/**
 * Convert registered tools into OpenAI function-calling format.
 * Only includes tools with descriptions (skips internal/UI-only tools).
 */
/** Convert dotted tool name to OpenAI-safe name (dots → underscores) */
export function toOpenAIName(name: string): string {
  return name.replace(/\./g, '_');
}

/** Reverse: OpenAI-safe name back to registry name (underscores → dots) */
export function fromOpenAIName(oaiName: string): string {
  // Try exact match first, then try converting underscores to dots
  if (hasTool(oaiName)) return oaiName;
  const dotted = oaiName.replace(/_/g, '.');
  if (hasTool(dotted)) return dotted;
  return oaiName;
}

export function toOpenAITools(): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return listTools()
    .filter(t => t.description && t.category !== 'chat')
    .map(t => ({
      type: 'function' as const,
      function: {
        name: toOpenAIName(t.name),
        description: t.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            t.params.map(p => [
              p.name,
              {
                type: p.type,
                description: p.description || p.name,
              },
            ])
          ),
          required: t.params.filter(p => p.required).map(p => p.name),
        },
      },
    }));
}
