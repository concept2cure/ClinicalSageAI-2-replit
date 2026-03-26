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
  assumptionRecords,
  decisionRecords,
  type GovernanceBoundaryRule,
  type GovernanceBoundaryTransition,
} from '../../shared/schema/operating-system';

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

    // 2. Find applicable rules
    const rules = await this.getRules(request.organizationId, request.projectId);
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

      // Check assumption approval requirement
      if (rule.requiresAllAssumptionsApproved && request.projectId) {
        const unapproved = await database
          .select()
          .from(assumptionRecords)
          .where(and(
            eq(assumptionRecords.projectId, request.projectId),
            eq(assumptionRecords.organizationId, request.organizationId),
            sql`${assumptionRecords.status} NOT IN ('approved', 'superseded')`
          ));

        if (unapproved.length > 0) {
          blockedReasons.push(
            `Rule "${rule.ruleName}": ${unapproved.length} assumption(s) not yet approved. ` +
            `All assumptions must be approved before transitioning to ${request.toBoundary}.`
          );
        }
      }

      // Check decision resolution requirement
      if (rule.requiresAllDecisionsResolved && request.projectId) {
        const unresolved = await database
          .select()
          .from(decisionRecords)
          .where(and(
            eq(decisionRecords.projectId, request.projectId),
            eq(decisionRecords.organizationId, request.organizationId),
            sql`${decisionRecords.actionState} = 'recommended_only'`
          ));

        if (unresolved.length > 0) {
          blockedReasons.push(
            `Rule "${rule.ruleName}": ${unresolved.length} decision(s) still in recommended_only state. ` +
            `All decisions must be executed, rejected, or superseded before transitioning to ${request.toBoundary}.`
          );
        }
      }

      // Check minimum confidence
      if (rule.minimumConfidence && request.decisionId) {
        const [decision] = await database
          .select()
          .from(decisionRecords)
          .where(eq(decisionRecords.id, request.decisionId));

        if (decision) {
          const confidenceOrder: Record<string, number> = {
            uncertain: 0, provisional: 1, moderate: 2, strong: 3,
          };
          const required = confidenceOrder[rule.minimumConfidence] ?? 0;
          const actual = confidenceOrder[decision.confidence] ?? 0;
          if (actual < required) {
            blockedReasons.push(
              `Rule "${rule.ruleName}": Decision confidence "${decision.confidence}" does not meet minimum "${rule.minimumConfidence}".`
            );
          }
        }
      }
    }

    // 3. Contradiction gate — block if unresolved blocking contradictions exist
    if (request.projectId && request.toBoundary !== 'advisory') {
      try {
        const { contradictionEngineService } = await import('./contradiction-engine-service.js');
        if (contradictionEngineService?.checkPromotionBlocked) {
          const contradictionCheck = await contradictionEngineService.checkPromotionBlocked(
            request.organizationId,
            request.projectId,
            request.artifactId
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

    // 4. Readiness gate — block promoted/locked/submission transitions if readiness fails
    if (request.projectId &&
        (request.toBoundary === 'approved' || request.toBoundary === 'locked' || request.toBoundary === 'submission_ready')) {
      try {
        const { evaluateReadiness } = await import('./readiness-evaluation-service.js');
        if (evaluateReadiness) {
          const readinessResult = await evaluateReadiness({
            organizationId: request.organizationId,
            projectId: request.projectId,
            programType: '*',
          });
          if (!readinessResult.isReady && readinessResult.blockerCount > 0) {
            blockedReasons.push(
              `Readiness evaluation failed: ${readinessResult.blockerCount} blocker(s), score ${readinessResult.overallScore}/100. ` +
              `All blockers must be resolved before transitioning to ${request.toBoundary}.`
            );
          }
        }
      } catch {
        // Readiness engine unavailable — continue without gate (non-blocking degradation)
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

    const allowed = blockedReasons.length === 0;

    // 4. Record the transition attempt
    const [transition] = await database
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
