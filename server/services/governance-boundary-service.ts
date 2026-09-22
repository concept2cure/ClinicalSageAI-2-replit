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
import { normalizeCtdCode } from '../../shared/regulatory/section-code';

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

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT READINESS (gate 4) — pure
// ═══════════════════════════════════════════════════════════════════════════════

/** The columns gate 4 reads from `concept2cure_artifacts`. */
export interface ArtifactReadinessRow {
  status: string | null;
  content: string | null;
  content_hash: string | null;
  citations: unknown;
  ctd_section: string | null;
  type: string | null;
}

/** What the artifact row actually records — and nothing it does not. */
export interface DocumentReadinessFacts {
  status: string | null;
  hasContent: boolean;
  evidenceCount: number;
  hasApproval: boolean;
  ctdSection: string | null;
  placementValid: boolean;
  documentType: string | null;
}

export function documentReadinessFacts(row: ArtifactReadinessRow): DocumentReadinessFacts {
  const citations = Array.isArray(row.citations) ? row.citations : [];
  const ctd = typeof row.ctd_section === 'string' && row.ctd_section.trim() ? row.ctd_section.trim() : null;
  return {
    status: row.status ?? null,
    hasContent: typeof row.content === 'string' && row.content.trim().length > 0,
    evidenceCount: citations.length,
    hasApproval: row.status === 'approved' || row.status === 'locked',
    ctdSection: ctd,
    placementValid: ctd !== null && normalizeCtdCode(ctd) !== null,
    documentType: row.type ?? null,
  };
}

/**
 * The hard requirements a document must meet to ENTER a boundary, enforced by
 * gate 4 and nowhere else. Kept to what document control plainly demands, so
 * the gate does not invent policy:
 *   - any promotion past governed_draft needs content — an empty record
 *     cannot be approved, locked or submitted;
 *   - submission_ready needs the artifact to have been LOCKED (the boundary
 *     is locked → submission_ready, and the route does not check it), and a
 *     valid CTD placement, because an eCTD leaf with no section has nowhere
 *     to be filed.
 * Status preconditions for approve (in review) and lock (approved) stay with
 * those routes, which already enforce them.
 */
export function documentBoundaryRequirements(toBoundary: BoundaryLevel, facts: DocumentReadinessFacts): string[] {
  const reasons: string[] = [];
  if (!facts.hasContent) {
    reasons.push(`Document readiness gate: the artifact has no content, so it cannot be moved to ${toBoundary}.`);
  }
  if (toBoundary === 'submission_ready') {
    if (facts.status !== 'locked') {
      reasons.push(
        `Document readiness gate: the artifact is "${facts.status ?? 'unknown'}"; only a locked artifact can be marked submission-ready.`
      );
    }
    if (facts.ctdSection === null) {
      reasons.push('Document readiness gate: the artifact has no CTD placement, so there is nowhere in the submission to file it.');
    } else if (!facts.placementValid) {
      reasons.push(`Document readiness gate: "${facts.ctdSection}" is not a valid CTD section code.`);
    }
  }
  return reasons;
}

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

    // Counts from gate 3, handed to gate 4 so the readiness fabric judges the
    // contradictions that were actually found rather than an asserted zero.
    let contradictionCounts: { unresolved: number; critical: number } | null = null;

    // 3. Contradiction gate — block if unresolved blocking contradictions exist.
    //
    // FAIL CLOSED (2026-09-22). This catch, and the one on gate 4, used to be
    // empty with the comment "non-blocking degradation". `allowed` below is
    // `blockedReasons.length === 0`, so a gate that threw was arithmetically
    // the same as a gate that passed, and the append-only row recorded
    // `transitionAllowed: true, blockedReasons: []` for a lock whose
    // contradiction check never ran. Gates 2, the confidence gate and the audit
    // insert in this same method already fail closed; these two now match. A
    // missing `checkPromotionBlocked` is the same case — the gate cannot run —
    // and is no longer a silent skip.
    if (request.projectId && request.artifactId != null && request.toBoundary !== 'advisory') {
      try {
        const { contradictionEngineService } = await import('./contradiction-engine-service.js');
        if (typeof contradictionEngineService?.checkPromotionBlocked !== 'function') {
          throw new Error('contradiction engine does not expose checkPromotionBlocked');
        }
        const contradictionCheck = await contradictionEngineService.checkPromotionBlocked(
          request.organizationId,
          request.projectId,
          request.artifactId
        );
        contradictionCounts = {
          unresolved: (contradictionCheck?.blockingFindings?.length ?? 0) + (contradictionCheck?.warningFindings?.length ?? 0),
          critical: contradictionCheck?.blockingFindings?.length ?? 0,
        };
        if (contradictionCheck?.blocked) {
          const blockingCount = contradictionCheck.blockingFindings?.length ?? 0;
          blockedReasons.push(
            `${blockingCount} unresolved blocking contradiction(s) must be resolved before transitioning to ${request.toBoundary}.`
          );
        }
      } catch (err) {
        blockedReasons.push(
          `Contradiction gate could not be evaluated ` +
          `(${err instanceof Error ? err.message : 'unknown error'}). ` +
          `Failing closed: transition to ${request.toBoundary} is blocked until unresolved contradictions can be checked.`
        );
      }
    }

    // 4. Document readiness gate — the artifact's REAL state.
    //
    // Rewritten 2026-09-22. This gate used to hand the readiness fabric
    // `hasContent: true, hasEvidence: true, hasProvenance: true`, and derived
    // `hasBeenReviewed` / `hasApproval` from the boundary being REQUESTED — so it
    // judged facts nobody had checked, about a document it never read. And the
    // fabric turns only contradictions, staleness and missing context into
    // blockers, so for content, placement and status the gate could not block
    // at all. `mark-submission-ready` relied on it and checks neither the
    // artifact's status nor its placement itself.
    //
    // Now: the artifact row is read, org- and project-scoped; a missing row
    // fails closed; the fabric is fed only what that row records; and the
    // boundary's own hard requirements (`documentBoundaryRequirements`) are
    // enforced here, once, as the single readiness authority. It applies to
    // DOCUMENT transitions only: a transition with no artifactId (a decision or
    // assumption) has no document to judge and is not judged as one.
    if (request.projectId && request.artifactId != null &&
        (request.toBoundary === 'approved' || request.toBoundary === 'locked' || request.toBoundary === 'submission_ready')) {
      try {
        const res = await database.execute(sql`
          SELECT status, content, content_hash, citations, ctd_section, type
          FROM concept2cure_artifacts
          WHERE id = ${request.artifactId}
            AND project_id = ${request.projectId}
            AND organization_id = ${request.organizationId}
          LIMIT 1
        `);
        const rows = ((res as unknown as { rows?: ArtifactReadinessRow[] }).rows ?? res) as ArtifactReadinessRow[];
        const row = rows[0];
        if (!row) {
          blockedReasons.push(
            `Document readiness gate: artifact ${request.artifactId} was not found in this organization and project. ` +
            `Failing closed: a document that cannot be read cannot be judged ready.`
          );
        } else {
          const facts = documentReadinessFacts(row);
          blockedReasons.push(...documentBoundaryRequirements(request.toBoundary, facts));

          const { evaluateGovernedDocument } = await import('../src/control-plane/governed-document-evaluator.js');
          const fabricResult = evaluateGovernedDocument({
            context: {
              organizationId: String(request.organizationId),
              projectId: String(request.projectId),
              actorId: String(request.actorId || 'system'),
              intendedAction: 'promote',
              artifactId: String(request.artifactId),
              actorRole: request.actorRole,
              documentType: facts.documentType ?? undefined,
              ctdSection: facts.ctdSection ?? undefined,
            },
            documentState: {
              hasContent: facts.hasContent,
              hasEvidence: facts.evidenceCount > 0,
              evidenceCount: facts.evidenceCount,
              // An approval implies a completed review; nothing else here
              // records one, so nothing else is claimed.
              hasBeenReviewed: facts.hasApproval,
              hasApproval: facts.hasApproval,
              hasPlacement: facts.ctdSection !== null,
              placementValid: facts.placementValid,
              // Not evaluated by this gate. The content hash is an integrity
              // check, not a provenance chain, and is not passed off as one.
              hasProvenance: false,
              unresolvedContradictionCount: contradictionCounts?.unresolved ?? 0,
              criticalContradictionCount: contradictionCounts?.critical ?? 0,
            },
          });
          const readiness = fabricResult.evaluation.readiness;
          if (readiness.level === 'blocked') {
            blockedReasons.push(...readiness.blockers.map((b) => `Fabric readiness gate: ${b.message}`));
          }
        }
      } catch (err) {
        // Fail closed — see gate 3.
        blockedReasons.push(
          `Fabric readiness gate could not be evaluated ` +
          `(${err instanceof Error ? err.message : 'unknown error'}). ` +
          `Failing closed: transition to ${request.toBoundary} is blocked until readiness can be evaluated.`
        );
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
