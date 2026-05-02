/**
 * Tenant-extensible knowledge pack.
 *
 * Lets a tenant override or augment the platform's default MDX knowledge
 * (surfaces, workflows, regulations) with their own SOPs, internal
 * procedures, and house style.
 *
 * Storage: `organizations.settings.mdxKnowledgeOverrides`. Shape:
 *
 *   {
 *     surfaces:    { [key: string]: Partial<MdxSurface> },
 *     workflows:   { [id: string]:  Partial<MdxWorkflow> },
 *     regulations: { [id: string]:  Partial<MdxRegulation> },
 *     extraNotes?: string  // free-form Markdown appended to the system prompt
 *   }
 *
 * Merge semantics:
 *   - Per-entry, the tenant override is shallow-merged over the default.
 *   - Array fields (affordances, commonQuestions, requires) APPEND the
 *     override's items to the default — not replace. This keeps the
 *     platform's wisdom visible while letting tenants add house rules.
 *   - Strings (purpose, definition) are REPLACED when the override
 *     supplies a non-empty value. Tenants can rewrite explanations
 *     entirely if they prefer their wording.
 *   - `extraNotes` is appended verbatim to the system-prompt block.
 *
 * Read-only loader. Fail-soft: any DB error or malformed JSON returns
 * an empty override set (default knowledge stands).
 */

import type { Pool, PoolClient } from 'pg';
import type {
  MdxSurface,
  MdxWorkflow,
  MdxRegulation,
} from './mdx-knowledge-pack';

export interface MdxKnowledgeOverrides {
  surfaces?: Record<string, Partial<MdxSurface>>;
  workflows?: Record<string, Partial<MdxWorkflow>>;
  regulations?: Record<string, Partial<MdxRegulation>>;
  /** Appended verbatim to the system prompt under "Tenant-specific notes". */
  extraNotes?: string;
}

export async function loadMdxKnowledgeOverrides(
  client: Pool | PoolClient,
  organizationId: number,
): Promise<MdxKnowledgeOverrides> {
  if (!Number.isFinite(organizationId) || organizationId <= 0) return {};
  try {
    const { rows } = await client.query(
      `SELECT settings FROM organizations WHERE id = $1 LIMIT 1`,
      [organizationId],
    );
    const raw = rows[0]?.settings?.mdxKnowledgeOverrides;
    if (!raw || typeof raw !== 'object') return {};
    const out: MdxKnowledgeOverrides = {};
    if (raw.surfaces && typeof raw.surfaces === 'object') {
      out.surfaces = raw.surfaces as Record<string, Partial<MdxSurface>>;
    }
    if (raw.workflows && typeof raw.workflows === 'object') {
      out.workflows = raw.workflows as Record<string, Partial<MdxWorkflow>>;
    }
    if (raw.regulations && typeof raw.regulations === 'object') {
      out.regulations = raw.regulations as Record<string, Partial<MdxRegulation>>;
    }
    if (typeof raw.extraNotes === 'string' && raw.extraNotes.length > 0) {
      out.extraNotes = raw.extraNotes;
    }
    return out;
  } catch {
    return {};
  }
}

// ─── Merge helpers ─────────────────────────────────────────────────────────

function mergeSurface(
  base: MdxSurface,
  patch?: Partial<MdxSurface>,
): MdxSurface {
  if (!patch) return base;
  return {
    ...base,
    purpose: patch.purpose && patch.purpose.length > 0 ? patch.purpose : base.purpose,
    whenToUse:
      patch.whenToUse && patch.whenToUse.length > 0 ? patch.whenToUse : base.whenToUse,
    label: patch.label && patch.label.length > 0 ? patch.label : base.label,
    affordances: [...base.affordances, ...(patch.affordances ?? [])],
    commonQuestions: [...base.commonQuestions, ...(patch.commonQuestions ?? [])],
    relevantTools: [...base.relevantTools, ...(patch.relevantTools ?? [])],
    status: patch.status ?? base.status,
  };
}

function mergeWorkflow(
  base: MdxWorkflow,
  patch?: Partial<MdxWorkflow>,
): MdxWorkflow {
  if (!patch) return base;
  return {
    ...base,
    label: patch.label && patch.label.length > 0 ? patch.label : base.label,
    objective:
      patch.objective && patch.objective.length > 0 ? patch.objective : base.objective,
    trigger: patch.trigger && patch.trigger.length > 0 ? patch.trigger : base.trigger,
    steps: [...base.steps, ...(patch.steps ?? [])],
    successCriteria: [...base.successCriteria, ...(patch.successCriteria ?? [])],
    pitfalls: [...base.pitfalls, ...(patch.pitfalls ?? [])],
    surfaces: patch.surfaces ?? base.surfaces,
    tools: patch.tools ?? base.tools,
  };
}

function mergeRegulation(
  base: MdxRegulation,
  patch?: Partial<MdxRegulation>,
): MdxRegulation {
  if (!patch) return base;
  return {
    ...base,
    label: patch.label && patch.label.length > 0 ? patch.label : base.label,
    definition:
      patch.definition && patch.definition.length > 0 ? patch.definition : base.definition,
    citation:
      patch.citation && patch.citation.length > 0 ? patch.citation : base.citation,
    appliesWhen:
      patch.appliesWhen && patch.appliesWhen.length > 0
        ? patch.appliesWhen
        : base.appliesWhen,
    requires: [...base.requires, ...(patch.requires ?? [])],
  };
}

export function applySurfaceOverride(
  surface: MdxSurface,
  overrides: MdxKnowledgeOverrides,
): MdxSurface {
  const patch = overrides.surfaces?.[surface.key];
  return mergeSurface(surface, patch);
}

export function applyWorkflowOverride(
  workflow: MdxWorkflow,
  overrides: MdxKnowledgeOverrides,
): MdxWorkflow {
  const patch = overrides.workflows?.[workflow.id];
  return mergeWorkflow(workflow, patch);
}

export function applyRegulationOverride(
  regulation: MdxRegulation,
  overrides: MdxKnowledgeOverrides,
): MdxRegulation {
  const patch = overrides.regulations?.[regulation.id];
  return mergeRegulation(regulation, patch);
}
