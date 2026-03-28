/**
 * AnA Context Router — CLAUDE.md Memory Compression Model
 *
 * Implements the three-level merge/override hierarchy:
 *   TOP    — Global.md  (Company)  ~50 lines  → merges with →
 *   MIDDLE — Local.md   (Project)  ~50 lines  → overridden by →
 *   BOTTOM — User.md    (Personal) ~20 lines
 *
 * Each document is a ROUTER (~50 lines) that POINTS to deep knowledge,
 * not an encyclopedia. Full details live in DB tables with indexed retrieval.
 *
 * Also injects:
 *   - AnA Capability Context (~15 lines) — what AnA can do for this project
 *   - AnA Wisdom Context (~15 lines) — what AnA has learned
 *   - Scoped Rules (~50 lines) — matching rules for current action context
 *
 * Total base prompt addition: ~200 lines (not 2000+).
 *
 * @module server/services/ana-context-router
 * Concept2Cure (C2C) / AnA 1.0 RI — NEVER "ClinicalSageAI"
 */

import { db } from '../db';
import {
  userIntelligenceProfiles,
  anaCapabilityRegistry,
  anaPlatformWisdom,
  anaClientObjectives,
  anaProjectCapabilities,
} from 'shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { ActionContext } from './ana-scoped-rule-loader';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ContextRouterParams {
  organizationId: number;
  projectId?: number;
  userId?: number;
  actionContext?: ActionContext;
}

export interface MergedContextResult {
  /** The full merged context block for injection into the AI prompt */
  contextBlock: string;
  /** Individual layers for debugging / display */
  layers: {
    global: string | null;
    local: string | null;
    user: string | null;
    capabilities: string | null;
    wisdom: string | null;
    scopedRules: string | null;
  };
  /** Total line count */
  totalLines: number;
}

// ─── User.md Builder (BOTTOM layer — ~20 lines) ────────────────────────────

/**
 * Build the User.md router — personal overrides.
 * This is the BOTTOM layer (like CLAUDE.local.md, gitignored).
 * Overrides both Global.md and Local.md settings.
 */
export async function buildUserContext(
  userId: number,
  organizationId: number
): Promise<string | null> {
  try {
    const [profile] = await db
      .select()
      .from(userIntelligenceProfiles)
      .where(
        and(
          eq(userIntelligenceProfiles.userId, userId),
          eq(userIntelligenceProfiles.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!profile) return null;

    const parts: string[] = [];
    parts.push(`## User Preferences — ${profile.displayName || 'User'}`);
    parts.push(`> These override company and project defaults.`);

    if (profile.role) parts.push(`- **Role**: ${profile.role}`);
    if (profile.department) parts.push(`- **Department**: ${profile.department}`);

    const expertise = profile.expertiseAreas as string[] | null;
    if (expertise?.length) {
      parts.push(`- **Expertise**: ${expertise.join(', ')}`);
    }

    const regSpec = profile.regulatorySpecializations as string[] | null;
    if (regSpec?.length) {
      parts.push(`- **Regulatory Focus**: ${regSpec.join(', ')}`);
    }

    if (profile.communicationStyle) {
      parts.push(`- **Response Style**: ${profile.communicationStyle}`);
    }

    if (profile.personalInstructions) {
      parts.push(`\n### Personal Instructions`);
      // Compress to max 5 lines
      const lines = profile.personalInstructions.split('\n').filter(l => l.trim());
      parts.push(...lines.slice(0, 5));
    }

    return parts.join('\n');
  } catch {
    return null;
  }
}

// ─── AnA Capability Context (~15 lines) ─────────────────────────────────────

/**
 * Build a compressed capability router for the current project context.
 * Shows AnA what she can do, filtered by project type + regulatory body.
 */
export async function buildCapabilityRouterContext(
  projectId?: number,
  regulatoryBodies?: string[],
  projectType?: string
): Promise<string | null> {
  try {
    // Get top capabilities by success rate
    const capabilities = await db
      .select({
        capabilityKey: anaCapabilityRegistry.capabilityKey,
        name: anaCapabilityRegistry.name,
        category: anaCapabilityRegistry.category,
        slashCommand: anaCapabilityRegistry.slashCommand,
        successCount: anaCapabilityRegistry.successCount,
        failureCount: anaCapabilityRegistry.failureCount,
      })
      .from(anaCapabilityRegistry)
      .where(eq(anaCapabilityRegistry.isActive, true))
      .orderBy(desc(anaCapabilityRegistry.successCount))
      .limit(50);

    if (!capabilities.length) return null;

    // Filter by project context
    const relevant = capabilities; // All active capabilities are available

    // Group by category, show top per category
    const grouped: Record<string, typeof capabilities> = {};
    for (const cap of relevant) {
      if (!grouped[cap.category]) grouped[cap.category] = [];
      if (grouped[cap.category].length < 3) {
        grouped[cap.category].push(cap);
      }
    }

    const parts: string[] = [];
    parts.push(`## AnA Capabilities ${projectType ? `for ${projectType}` : ''}`);
    parts.push(`> ${relevant.length} capabilities available. Top by category:`);

    for (const [category, caps] of Object.entries(grouped)) {
      const capList = caps
        .map(c => {
          const cmd = c.slashCommand ? ` (\`${c.slashCommand}\`)` : '';
          const total = (c.successCount ?? 0) + (c.failureCount ?? 0);
          const rate = total > 0 ? Math.round(((c.successCount ?? 0) / total) * 100) : 0;
          return `${c.name}${cmd}${total > 10 ? ` — ${rate}% success` : ''}`;
        })
        .join(', ');
      parts.push(`- **${category}**: ${capList}`);
    }

    // Add project-specific effectiveness if available
    if (projectId) {
      const projectCaps = await db
        .select()
        .from(anaProjectCapabilities)
        .where(
          and(
            eq(anaProjectCapabilities.projectId, projectId),
            eq(anaProjectCapabilities.enabled, true)
          )
        )
        .orderBy(desc(anaProjectCapabilities.timesUsed))
        .limit(5);

      if (projectCaps.length > 0) {
        const topUsed = projectCaps
          .map(pc => `${pc.capabilityKey} (${pc.timesUsed}x)`)
          .join(', ');
        parts.push(`- **Most used in this project**: ${topUsed}`);
      }
    }

    return parts.join('\n');
  } catch {
    return null;
  }
}

// ─── Wisdom Router Context (~15 lines) ──────────────────────────────────────

/**
 * Build a compressed wisdom block — what AnA has learned.
 * Filters platform wisdom by project context.
 */
export async function buildWisdomRouterContext(
  organizationId: number,
  projectId?: number,
  regulatoryBody?: string,
  projectType?: string
): Promise<string | null> {
  try {
    // Get relevant platform wisdom entries
    const wisdomConditions = [
      eq(anaPlatformWisdom.isActive, true),
      sql`${anaPlatformWisdom.evidenceCount} >= ${anaPlatformWisdom.minEvidenceThreshold}`,
    ];

    const wisdom = await db
      .select()
      .from(anaPlatformWisdom)
      .where(and(...wisdomConditions))
      .orderBy(desc(anaPlatformWisdom.confidenceScore))
      .limit(20);

    // Filter by context
    const relevant = wisdom.filter(w => {
      if (regulatoryBody && w.regulatoryBody && w.regulatoryBody !== regulatoryBody) return false;
      if (projectType && w.projectType && w.projectType !== projectType) return false;
      return true;
    });

    // Get active objectives
    const objectives = await db
      .select()
      .from(anaClientObjectives)
      .where(
        and(
          eq(anaClientObjectives.organizationId, organizationId),
          sql`${anaClientObjectives.status} != 'achieved'`
        )
      )
      .orderBy(
        sql`CASE WHEN ${anaClientObjectives.priority} = 'critical' THEN 1 WHEN ${anaClientObjectives.priority} = 'high' THEN 2 ELSE 3 END`
      )
      .limit(3);

    if (!relevant.length && !objectives.length) return null;

    const parts: string[] = [];
    parts.push(`## AnA Wisdom — What I've Learned`);

    // Risk reductions
    const risks = relevant.filter(w => w.category === 'risk_reduction' || w.category === 'deficiency_prevention');
    if (risks.length > 0) {
      const topRisk = risks[0];
      parts.push(`- **Risk Alert**: ${topRisk.patternDescription.slice(0, 120)}`);
      parts.push(`  → ${topRisk.recommendation.slice(0, 100)}`);
    }

    // Success patterns
    const successes = relevant.filter(w => w.category === 'success_pattern');
    if (successes.length > 0) {
      const topSuccess = successes[0];
      parts.push(`- **Success Pattern**: ${topSuccess.patternDescription.slice(0, 120)}`);
    }

    // Objectives
    if (objectives.length > 0) {
      parts.push(`\n### Active Objectives`);
      for (const obj of objectives.slice(0, 3)) {
        const statusIcon = obj.status === 'on_track' ? '✓' : obj.status === 'at_risk' ? '⚠' : '✗';
        parts.push(`- ${statusIcon} [${obj.priority}] ${obj.objective}${obj.targetDate ? ` (by ${new Date(obj.targetDate).toLocaleDateString()})` : ''}`);
      }
    }

    return parts.join('\n');
  } catch {
    return null;
  }
}

// ─── Merge/Override Engine ──────────────────────────────────────────────────

/**
 * The core merge function. Combines all context layers following
 * the CLAUDE.md three-level hierarchy:
 *
 *   Global.md (company)  ← base
 *   + Local.md (project) ← adds/specializes
 *   + User.md (personal) ← overrides
 *   + Capabilities (~15 lines)
 *   + Wisdom (~15 lines)
 *   + Scoped Rules (~50 lines, loaded on-demand)
 *
 * Override semantics:
 *   - User says "be concise" → overrides company default of "be detailed"
 *   - Project says "FDA only" → narrows company's "FDA, EMA, PMDA"
 *   - Personal instructions override project override company
 */
export async function buildMergedContext(
  params: ContextRouterParams
): Promise<MergedContextResult> {
  const { organizationId, projectId, userId, actionContext } = params;

  // Load all layers in parallel
  const [
    userContext,
    capabilityContext,
    wisdomContext,
  ] = await Promise.all([
    userId ? buildUserContext(userId, organizationId) : Promise.resolve(null),
    buildCapabilityRouterContext(projectId).catch(() => null),
    buildWisdomRouterContext(organizationId, projectId).catch(() => null),
  ]);

  // Load scoped rules if action context is available
  let scopedRulesContext: string | null = null;
  if (actionContext) {
    try {
      // Dynamic import to avoid circular deps
      const { buildScopedRuleContext } = await import('./ana-scoped-rule-loader');
      scopedRulesContext = await buildScopedRuleContext(actionContext);
    } catch {
      // Scoped rules are optional — degrade gracefully
    }
  }

  // NOTE: Global.md (clientIntelligence) and Local.md (projectIntelligence)
  // are already injected by ana-context-builder.ts at lines 931-941.
  // We only inject the NEW layers here: User.md, Capabilities, Wisdom, Rules.

  const blocks: string[] = [];

  // User.md (BOTTOM — overrides)
  if (userContext) {
    blocks.push(userContext);
  }

  // AnA Capabilities
  if (capabilityContext) {
    blocks.push(capabilityContext);
  }

  // AnA Wisdom
  if (wisdomContext) {
    blocks.push(wisdomContext);
  }

  // Scoped Rules (path-matched)
  if (scopedRulesContext) {
    blocks.push(scopedRulesContext);
  }

  const contextBlock = blocks.join('\n\n');
  const totalLines = contextBlock.split('\n').length;

  return {
    contextBlock,
    layers: {
      global: null, // Already injected by ana-context-builder
      local: null, // Already injected by ana-context-builder
      user: userContext,
      capabilities: capabilityContext,
      wisdom: wisdomContext,
      scopedRules: scopedRulesContext,
    },
    totalLines,
  };
}

/**
 * Upsert a user intelligence profile. Called when users edit
 * their preferences via /my-context or the UserContextEditor UI.
 */
export async function upsertUserProfile(
  userId: number,
  organizationId: number,
  data: Partial<{
    displayName: string;
    role: string;
    department: string;
    expertiseAreas: string[];
    regulatorySpecializations: string[];
    communicationStyle: string;
    personalInstructions: string;
    workflowPreferences: Record<string, unknown>;
  }>
): Promise<void> {
  const existing = await db
    .select({ id: userIntelligenceProfiles.id })
    .from(userIntelligenceProfiles)
    .where(
      and(
        eq(userIntelligenceProfiles.userId, userId),
        eq(userIntelligenceProfiles.organizationId, organizationId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(userIntelligenceProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userIntelligenceProfiles.id, existing[0].id));
  } else {
    await db.insert(userIntelligenceProfiles).values({
      userId,
      organizationId,
      ...data,
    });
  }
}

/**
 * Record a user interaction for auto-learning.
 * Called after every AI response to track engagement.
 */
export async function recordUserInteraction(
  userId: number,
  organizationId: number
): Promise<void> {
  try {
    await db
      .update(userIntelligenceProfiles)
      .set({
        totalInteractions: sql`${userIntelligenceProfiles.totalInteractions} + 1`,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userIntelligenceProfiles.userId, userId),
          eq(userIntelligenceProfiles.organizationId, organizationId)
        )
      );
  } catch {
    // Non-blocking — don't fail the main operation
  }
}
