/**
 * Governance Boundary Service
 *
 * Enforces semantic boundaries between:
 * advisory → governed_draft → approved → locked → submission_ready
 *
 * This is not a permissions system. It is a semantic operating-boundary layer
 * that makes the distinction between AI recommendation and organizational
 * position explicit, operational, and auditable.
 *
 * @module server/services/governance-boundary-service
 */

import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  governanceBoundaryRules,
  governanceBoundaryTransitions,
  type GovernanceBoundaryRule,
  type GovernanceBoundaryTransition,
} from '../../shared/schema/operating-system';
// Gate vocabulary comes from the DEPLOYED schema constants, not from the
// orphaned Drizzle assumption/decision tables. The previous implementation
// queried shared/schema/operating-system.ts's assumptionRecords/decisionRecords,
// whose column set only exists in migrations/0010 — a migration with no
// execution path. Against real databases those queries threw, callers swallowed
// the throw, and every gate silently failed open (conflict C-8).
import {
  ASSUMPTION_SETTLED_SQL_PREDICATE,
  UNRESOLVED_DECISION_ACTION_STATES,
  rankConfidence,
} from '../../shared/constants/operating-system-vocab';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type BoundaryLevel = 'advisory' | 'governed_draft' | 'approved' | 'locked' | 'submission_ready';

export interface TransitionRequest {
  organizationId: number;
  projectId: number;
  artifactId?: number;
  decisionId?: string;
  assumptionId?: string;
  fromBoundary: BoundaryLevel;
  toBoundary: BoundaryLevel;
  actorId?: number;
  actorRole?: string;
}

export interface TransitionResult {
  allowed: boolean;
  blockedReasons: string[];
  ruleId?: string;
  transition?: GovernanceBoundaryTransition;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOUNDARY ORDER (for validation)
// ═══════════════════════════════════════════════════════════════════════════════

const BOUNDARY_ORDER: Record<BoundaryLevel, number> = {
  advisory: 0,
  governed_draft: 1,
  approved: 2,
  locked: 3,
  submission_ready: 4,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class GovernanceBoundaryService {
  private static instance: GovernanceBoundaryService;

  static getInstance(): GovernanceBoundaryService {
    if (!GovernanceBoundaryService.instance) {
      GovernanceBoundaryService.instance = new GovernanceBoundaryService();
    }
    return GovernanceBoundaryService.instance;
  }

  private getDb() {
    if (!db) throw new Error('Database unavailable');
    return db;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  async createRule(input: {
    organizationId: number;
    projectId?: number;
    ruleName: string;
    ruleDescription?: string;
    fromBoundary: BoundaryLevel;
    toBoundary: BoundaryLevel;
    requiresReview?: boolean;
    requiresApproval?: boolean;
    requiresAllAssumptionsApproved?: boolean;
    requiresAllDecisionsResolved?: boolean;
    minimumConfidence?: string;
    requiredRoles?: string[];
    artifactTypes?: string[];
    domainTrack?: string;
    regulatorBody?: string;
    createdById?: number;
  }): Promise<GovernanceBoundaryRule> {
    const database = this.getDb();

    const [rule] = await database
      .insert(governanceBoundaryRules)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        ruleName: input.ruleName,
        ruleDescription: input.ruleDescription,
        fromBoundary: input.fromBoundary,
        toBoundary: input.toBoundary,
        requiresReview: input.requiresReview ?? false,
        requiresApproval: input.requiresApproval ?? false,
        requiresAllAssumptionsApproved: input.requiresAllAssumptionsApproved ?? false,
        requiresAllDecisionsResolved: input.requiresAllDecisionsResolved ?? false,
        minimumConfidence: input.minimumConfidence,
        requiredRoles: input.requiredRoles ?? [],
        artifactTypes: input.artifactTypes ?? [],
        domainTrack: input.domainTrack as any,
        regulatorBody: input.regulatorBody,
        createdById: input.createdById,
      })
      .returning();

    return rule;
  }

  async getRules(organizationId: number, projectId?: number): Promise<GovernanceBoundaryRule[]> {
    const database = this.getDb();
    const conditions = [
      eq(governanceBoundaryRules.organizationId, organizationId),
      eq(governanceBoundaryRules.isActive, true),
    ];
    if (projectId) {
      // Include org-wide rules (null projectId) and project-specific rules
      conditions.push(
        sql`(${governanceBoundaryRules.projectId} = ${projectId} OR ${governanceBoundaryRules.projectId} IS NULL)`
      );
    }

    return database
      .select()
      .from(governanceBoundaryRules)
      .where(and(...conditions));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRANSITION EVALUATION
  // ─────────────────────────────────────────────────────────────────────────

  async evaluateTransition(request: TransitionRequest): Promise<TransitionResult> {
    const database = this.getDb();
    const blockedReasons: string[] = [];

    // 0. Auto-seed default rules if none exist (lazy initialization)
    await this.ensureDefaultRules(request.organizationId);

    // 1. Validate transition direction
    if (request.fromBoundary === request.toBoundary) {
      blockedReasons.push(
        `No-op transition: ${request.fromBoundary} → ${request.toBoundary}. Source and target boundary are the same.`
      );
    } else if (BOUNDARY_ORDER[request.toBoundary] < BOUNDARY_ORDER[request.fromBoundary]) {
      // Allow reversion to advisory from any boundary (e.g., rework)
      if (request.toBoundary !== 'advisory') {
        blockedReasons.push(
          `Invalid transition direction: ${request.fromBoundary} → ${request.toBoundary}. ` +
          `Boundaries must progress forward unless reverting to advisory.`
        );
      }
    }

    // 2. Find applicable rules — FAIL CLOSED if they cannot be loaded.
    // If this throws to the caller, every caller's catch{} falls back to a
    // weaker check and the whole rule layer silently disappears (C-8). An
    // unreadable rule store must block, not bypass.
    let rules: GovernanceBoundaryRule[] = [];
    try {
      rules = await this.getRules(request.organizationId, request.projectId);
    } catch (err) {
      blockedReasons.push(
        `Governance rules could not be loaded (${err instanceof Error ? err.message : 'unknown error'}). ` +
        `Failing closed: transition to ${request.toBoundary} is blocked until the rule store is reachable.`
      );
    }
    const applicableRules = rules.filter(
      r => r.fromBoundary === request.fromBoundary && r.toBoundary === request.toBoundary
    );

    const matchedRuleIds: string[] = [];

    for (const rule of applicableRules) {
      matchedRuleIds.push(rule.id);

      // Check review requirement
      if (rule.requiresReview) {
        // Review requirement is recorded as an advisory signal for now.
        // Full enforcement requires integration with the review thread system.
        // This ensures the rule is visible in transition logs.
      }

      // Check role requirement
      if ((rule.requiredRoles as string[])?.length > 0 && request.actorRole) {
        if (!(rule.requiredRoles as string[]).includes(request.actorRole)) {
          blockedReasons.push(
            `Rule "${rule.ruleName}": Actor role "${request.actorRole}" not in required roles: ${(rule.requiredRoles as string[]).join(', ')}`
          );
        }
      }

      // Check assumption approval requirement — against the DEPLOYED shape.
      // "Approved" in the deployed vocabulary is status='active' WITH a
      // reviewer recorded; bare 'active' is the column default (created, never
      // approved) and must block. See ASSUMPTION_SETTLED_SQL_PREDICATE.
      if (rule.requiresAllAssumptionsApproved && request.projectId) {
        try {
          const res = await database.execute(sql`
            SELECT count(*)::int AS unsettled
            FROM assumption_records
            WHERE project_id = ${request.projectId}
              AND organization_id = ${request.organizationId}
              AND NOT ${sql.raw(ASSUMPTION_SETTLED_SQL_PREDICATE)}
          `);
          const rows = ((res as unknown as { rows?: Array<{ unsettled: number }> }).rows ?? res) as Array<{ unsettled: number }>;
          const unsettled = Number(rows[0]?.unsettled ?? 0);
          if (unsettled > 0) {
            blockedReasons.push(
              `Rule "${rule.ruleName}": ${unsettled} assumption(s) not yet approved ` +
              `(approved = reviewed and active; superseded/withdrawn do not block). ` +
              `All assumptions must be approved before transitioning to ${request.toBoundary}.`
            );
          }
        } catch (err) {
          blockedReasons.push(
            `Rule "${rule.ruleName}": assumption gate could not be evaluated ` +
            `(${err instanceof Error ? err.message : 'unknown error'}). Failing closed.`
          );
        }
      }

      // Check decision resolution requirement — against the DEPLOYED
      // action_state vocabulary. The previous filter value 'recommended_only'
      // is not legal in the deployed CHECK constraint, so this gate had never
      // matched a row.
      if (rule.requiresAllDecisionsResolved && request.projectId) {
        try {
          const unresolvedStates = sql.join(
            UNRESOLVED_DECISION_ACTION_STATES.map((s) => sql`${s}`),
            sql`, `
          );
          const res = await database.execute(sql`
            SELECT count(*)::int AS unresolved
            FROM decision_records
            WHERE project_id = ${request.projectId}
              AND organization_id = ${request.organizationId}
              AND action_state IN (${unresolvedStates})
          `);
          const rows = ((res as unknown as { rows?: Array<{ unresolved: number }> }).rows ?? res) as Array<{ unresolved: number }>;
          const unresolved = Number(rows[0]?.unresolved ?? 0);
          if (unresolved > 0) {
            blockedReasons.push(
              `Rule "${rule.ruleName}": ${unresolved} decision(s) unresolved ` +
              `(${UNRESOLVED_DECISION_ACTION_STATES.join('/')}). ` +
              `All decisions must be approved, executed, rejected, or superseded before transitioning to ${request.toBoundary}.`
            );
          }
        } catch (err) {
          blockedReasons.push(
            `Rule "${rule.ruleName}": decision gate could not be evaluated ` +
            `(${err instanceof Error ? err.message : 'unknown error'}). Failing closed.`
          );
        }
      }

      // Check minimum confidence — reads the DEPLOYED confidence_level column
      // and ranks BOTH vocabularies on one ladder (rules were seeded with
      // 'moderate'/'strong'; deployed decisions carry 'definitive'…'speculative').
      // An unrecognized value on either side blocks: defaulting unknowns to 0
      // is what made a 'definitive' decision score equal to 'speculative'.
      if (rule.minimumConfidence && request.decisionId) {
        try {
          const res = await database.execute(sql`
            SELECT confidence_level
            FROM decision_records
            WHERE id = ${request.decisionId}
              AND organization_id = ${request.organizationId}
          `);
          const rows = ((res as unknown as { rows?: Array<{ confidence_level: string }> }).rows ?? res) as Array<{ confidence_level: string }>;
          const decision = rows[0];
          if (decision) {
            const required = rankConfidence(rule.minimumConfidence);
            const actual = rankConfidence(decision.confidence_level);
            if (required === null || actual === null) {
              blockedReasons.push(
                `Rule "${rule.ruleName}": confidence could not be compared ` +
                `(required "${rule.minimumConfidence}", actual "${decision.confidence_level}"). Failing closed.`
              );
            } else if (actual < required) {
              blockedReasons.push(
                `Rule "${rule.ruleName}": Decision confidence "${decision.confidence_level}" does not meet minimum "${rule.minimumConfidence}".`
              );
            }
          }
        } catch (err) {
          blockedReasons.push(
            `Rule "${rule.ruleName}": confidence gate could not be evaluated ` +
            `(${err instanceof Error ? err.message : 'unknown error'}). Failing closed.`
          );
        }
      }
    }

    // 3. Contradiction gate — block if unresolved blocking contradictions exist
    if (request.projectId && request.artifactId != null && request.toBoundary !== 'advisory') {
      try {
        const { contradictionEngineService } = await import('./contradiction-engine-service.js');
        if (contradictionEngineService?.checkPromotionBlocked) {
          const contradictionCheck = await contradictionEngineService.checkPromotionBlocked(
            request.organizationId,
            request.projectId,
            request.artifactId ?? 0
          );
          if (contradictionCheck?.blocked) {
            const blockingCount = contradictionCheck.blockingFindings?.length ?? 0;
            blockedReasons.push(
              `${blockingCount} unresolved blocking contradiction(s) must be resolved before transitioning to ${request.toBoundary}.`
            );
          }
        }
      } catch {
        // Contradiction engine unavailable — continue without gate (non-blocking degradation)
      }
    }

    // 4. Readiness gate — delegates to canonical governed document decision fabric
    //    GovernanceBoundaryService no longer computes readiness independently.
    //    The fabric evaluator (readiness-gates.ts) is the single readiness authority.
    if (request.projectId &&
        (request.toBoundary === 'approved' || request.toBoundary === 'locked' || request.toBoundary === 'submission_ready')) {
      try {
        const { evaluateGovernedDocument } = await import('../src/control-plane/governed-document-evaluator.js');
        const fabricResult = evaluateGovernedDocument({
          context: {
            organizationId: String(request.organizationId),
            projectId: String(request.projectId),
            actorId: String(request.actorId || 'system'),
            intendedAction: 'promote',
            artifactId: request.artifactId ? String(request.artifactId) : undefined,
            actorRole: request.actorRole,
          },
          documentState: {
            hasContent: true,
            hasEvidence: true,
            hasBeenReviewed: request.toBoundary !== 'approved',
            hasApproval: request.toBoundary === 'locked' || request.toBoundary === 'submission_ready',
            hasPlacement: false,
            placementValid: false,
            hasProvenance: true,
            unresolvedContradictionCount: 0, // already checked in contradiction gate above
            criticalContradictionCount: 0,
          },
        });
        const readiness = fabricResult.evaluation.readiness;
        if (readiness.level === 'blocked' && readiness.blockers.length > 0) {
          for (const blocker of readiness.blockers) {
            blockedReasons.push(
              `Fabric readiness gate: ${blocker.message}`
            );
          }
        }
      } catch {
        // Fabric readiness gate unavailable — continue without (non-blocking degradation)
      }
    }

    // 5. Default structural rules (always applied)
    if (request.toBoundary === 'locked' || request.toBoundary === 'submission_ready') {
      if (!request.actorId) {
        blockedReasons.push(
          `Transition to ${request.toBoundary} requires an identified actor (actorId).`
        );
      }
    }

    let allowed = blockedReasons.length === 0;

    // 4. Record the transition attempt — the append-only audit trail.
    // FAIL CLOSED on persistence failure: an allowed=true result whose audit
    // record was never written is local-only success presented as persisted
    // truth, which master §2 forbids. If the record cannot be written, the
    // transition is denied. (Previously an insert failure threw out of this
    // method; callers swallowed the throw and proceeded ungoverned.)
    let transition: GovernanceBoundaryTransition | undefined;
    try {
      const [row] = await database
        .insert(governanceBoundaryTransitions)
        .values({
          organizationId: request.organizationId,
          projectId: request.projectId,
          artifactId: request.artifactId,
          decisionId: request.decisionId,
          assumptionId: request.assumptionId,
          fromBoundary: request.fromBoundary,
          toBoundary: request.toBoundary,
          ruleId: matchedRuleIds[0],
          transitionAllowed: allowed,
          blockedReasons,
          actorId: request.actorId,
          actorRole: request.actorRole,
        })
        .returning();
      transition = row;
    } catch (err) {
      allowed = false;
      blockedReasons.push(
        `Transition audit record could not be persisted ` +
        `(${err instanceof Error ? err.message : 'unknown error'}). ` +
        `Failing closed: a transition without a durable audit record is not allowed.`
      );
    }

    return {
      allowed,
      blockedReasons,
      ruleId: matchedRuleIds[0],
      transition,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRANSITION HISTORY
  // ─────────────────────────────────────────────────────────────────────────

  async getTransitionHistory(
    organizationId: number,
    projectId: number,
    artifactId?: number
  ): Promise<GovernanceBoundaryTransition[]> {
    const database = this.getDb();
    const conditions = [
      eq(governanceBoundaryTransitions.organizationId, organizationId),
      eq(governanceBoundaryTransitions.projectId, projectId),
    ];
    if (artifactId) {
      conditions.push(eq(governanceBoundaryTransitions.artifactId, artifactId));
    }

    return database
      .select()
      .from(governanceBoundaryTransitions)
      .where(and(...conditions))
      .orderBy(desc(governanceBoundaryTransitions.createdAt));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUTO-SEED (lazy initialization)
  // ─────────────────────────────────────────────────────────────────────────

  private seededOrgs = new Set<number>();

  /**
   * Ensure default rules exist for the organization.
   * Called lazily on first evaluateTransition() — idempotent.
   */
  private async ensureDefaultRules(organizationId: number): Promise<void> {
    if (this.seededOrgs.has(organizationId)) return;
    try {
      const existing = await this.getRules(organizationId);
      if (existing.length === 0) {
        await this.seedDefaultRules(organizationId);
      }
      this.seededOrgs.add(organizationId);
    } catch {
      // Non-blocking — seeding failure doesn't prevent transition evaluation
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DEFAULT RULES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Seed default governance boundary rules for an organization.
   * Called when a new organization enables the operating system layer.
   */
  async seedDefaultRules(organizationId: number, createdById?: number): Promise<GovernanceBoundaryRule[]> {
    const rules: GovernanceBoundaryRule[] = [];

    // Rule 1: advisory → governed_draft requires review
    rules.push(await this.createRule({
      organizationId,
      ruleName: 'Advisory to Governed Draft',
      ruleDescription: 'AI-generated advisory output must be reviewed before becoming a governed draft.',
      fromBoundary: 'advisory',
      toBoundary: 'governed_draft',
      requiresReview: true,
      createdById,
    }));

    // Rule 2: governed_draft → approved requires approval + all assumptions approved
    rules.push(await this.createRule({
      organizationId,
      ruleName: 'Governed Draft to Approved',
      ruleDescription: 'Governed drafts require explicit approval and all linked assumptions must be approved.',
      fromBoundary: 'governed_draft',
      toBoundary: 'approved',
      requiresApproval: true,
      requiresAllAssumptionsApproved: true,
      createdById,
    }));

    // Rule 3: approved → locked requires all decisions resolved
    rules.push(await this.createRule({
      organizationId,
      ruleName: 'Approved to Locked',
      ruleDescription: 'Approved content can only be locked when all decisions are resolved.',
      fromBoundary: 'approved',
      toBoundary: 'locked',
      requiresAllDecisionsResolved: true,
      minimumConfidence: 'moderate',
      createdById,
    }));

    // Rule 4: locked → submission_ready requires strong confidence
    rules.push(await this.createRule({
      organizationId,
      ruleName: 'Locked to Submission Ready',
      ruleDescription: 'Locked content moves to submission-ready only with strong confidence.',
      fromBoundary: 'locked',
      toBoundary: 'submission_ready',
      requiresAllAssumptionsApproved: true,
      requiresAllDecisionsResolved: true,
      minimumConfidence: 'strong',
      createdById,
    }));

    return rules;
  }
}
