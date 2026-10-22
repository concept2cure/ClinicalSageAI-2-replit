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
  GOVERNED_FABRIC_DECISION_KIND,
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
  /** The artifact's type, for a rule scoped to artifact types (see ruleScope). */
  artifactType?: string;
  /** The domain track, for a rule scoped to one. */
  domainTrack?: string;
  /** The regulator the transition is for, for a rule scoped to one. */
  regulatorBody?: string;
}

export interface TransitionResult {
  allowed: boolean;
  blockedReasons: string[];
  /**
   * Each check this evaluation ran and found met, as a sentence — the only
   * basis on which a caller may say the transition met a rule. A requirement
   * that could not be checked is a blocked reason, never an entry here. Empty
   * when no rule or gate applied.
   */
  metRequirements: string[];
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

/**
 * One rule's minimum-confidence requirement against the decision named to rate
 * it — pure. Met only when that decision is on record in this organization's
 * project with a confidence ranking at or above the minimum; an unstated or
 * unrecognized confidence fails closed (rankConfidence).
 */
export function confidenceRequirement(ruleName: string, minimum: string, decisionId: string, recorded: { confidence_level: string | null } | undefined): { met: boolean; statement: string } {
  if (!recorded) return { met: false, statement: `Rule "${ruleName}": decision ${decisionId} is not on record in this organization's project, so its confidence could not be rated against "${minimum}". Failing closed.` };
  const required = rankConfidence(minimum);
  const actual = rankConfidence(recorded.confidence_level);
  if (required === null || actual === null) return { met: false, statement: `Rule "${ruleName}": confidence could not be compared (required "${minimum}", actual "${recorded.confidence_level ?? 'none recorded'}"). Failing closed.` };
  if (actual < required) return { met: false, statement: `Rule "${ruleName}": Decision confidence "${recorded.confidence_level}" does not meet minimum "${minimum}".` };
  return { met: true, statement: `Rule "${ruleName}": decision ${decisionId} records confidence "${recorded.confidence_level}", which meets the minimum "${minimum}".` };
}

/** Trimmed text, or null when blank or not text. */
function statedText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** How a stored value that is not a list of names reads in a refusal. */
function describeStored(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (Array.isArray(v)) return 'a list with an entry that is not a name';
  return typeof v === 'string' ? `the text "${v}"` : `a value of type ${typeof v}`;
}

/**
 * A rule row's role and artifact-type lists as stored, or why the row cannot be
 * read — pure. Until 2026-10-15 required_roles was read `?? []`: NULL meant "no
 * role required", an object was skipped and text threw, so a row nobody could
 * read passed as a rule with no requirement. Both columns default to '[]'.
 */
export function readRuleLists(rule: GovernanceBoundaryRule): { requiredRoles: string[]; artifactTypes: string[] } | { malformed: string } {
  const columns: Array<[string, unknown]> = [['required_roles', rule.requiredRoles], ['artifact_types', rule.artifactTypes]];
  for (const [column, value] of columns) {
    if (!Array.isArray(value) || value.some((entry) => statedText(entry) === null)) {
      return { malformed: `rule "${rule.ruleName}" (${rule.id}) records ${column} as ${describeStored(value)}, not a list of names` };
    }
  }
  return { requiredRoles: rule.requiredRoles as string[], artifactTypes: rule.artifactTypes as string[] };
}

/** Whether a rule governs a transition, by its declared scope; null = undetermined. */
export type RuleScopeFinding = { applies: true } | { applies: false } | { applies: null; statement: string };

/**
 * Whether a rule's declared scope covers a transition — pure. Until 2026-10-15 a
 * rule applied to every transition between its two boundaries, whatever its
 * artifactTypes / domainTrack / regulatorBody said. A stated value outside a
 * declared scope: the rule does not govern the transition. A declared scope the
 * request states nothing for: whether the rule applies is undetermined, and the
 * transition is refused with that reason — the rule is never skipped. Values
 * compare trimmed and case-insensitively.
 */
export function ruleScope(rule: GovernanceBoundaryRule, artifactTypes: string[], request: TransitionRequest): RuleScopeFinding {
  const scopes: Array<{ name: string; field: 'artifactType' | 'domainTrack' | 'regulatorBody'; allowed: string[] }> = [];
  if (artifactTypes.length > 0) scopes.push({ name: 'artifact types', field: 'artifactType', allowed: artifactTypes });
  const track = statedText(rule.domainTrack);
  if (track) scopes.push({ name: 'domain track', field: 'domainTrack', allowed: [track] });
  const regulator = statedText(rule.regulatorBody);
  if (regulator) scopes.push({ name: 'regulator', field: 'regulatorBody', allowed: [regulator] });

  const unstated: string[] = [];
  for (const scope of scopes) {
    const stated = statedText(request[scope.field]);
    if (stated === null) unstated.push(`${scope.name} ${scope.allowed.join(', ')} (${scope.field})`);
    else if (!scope.allowed.some((a) => a.trim().toLowerCase() === stated.toLowerCase())) return { applies: false };
  }
  if (unstated.length === 0) return { applies: true };
  const them = unstated.length === 1 ? 'it' : 'them';
  return { applies: null, statement: `Rule "${rule.ruleName}": applies only to ${unstated.join(' and ')}, and the request does not state ${them}, so whether the rule applies could not be determined. Failing closed.` };
}

/** What a rule is created from (createRule and the default set). */
export interface GovernanceRuleInput {
  organizationId: number; projectId?: number; ruleName: string; ruleDescription?: string;
  fromBoundary: BoundaryLevel; toBoundary: BoundaryLevel;
  requiresReview?: boolean; requiresApproval?: boolean; requiresAllAssumptionsApproved?: boolean; requiresAllDecisionsResolved?: boolean;
  minimumConfidence?: string; requiredRoles?: string[]; artifactTypes?: string[]; domainTrack?: string; regulatorBody?: string; createdById?: number;
}

/** The row a rule input writes — the named fields only. */
function ruleValues(i: GovernanceRuleInput): typeof governanceBoundaryRules.$inferInsert {
  return {
    organizationId: i.organizationId, projectId: i.projectId, ruleName: i.ruleName, ruleDescription: i.ruleDescription,
    fromBoundary: i.fromBoundary, toBoundary: i.toBoundary,
    requiresReview: i.requiresReview ?? false, requiresApproval: i.requiresApproval ?? false,
    requiresAllAssumptionsApproved: i.requiresAllAssumptionsApproved ?? false, requiresAllDecisionsResolved: i.requiresAllDecisionsResolved ?? false,
    minimumConfidence: i.minimumConfidence, requiredRoles: i.requiredRoles ?? [], artifactTypes: i.artifactTypes ?? [],
    domainTrack: (i.domainTrack ?? null) as GovernanceBoundaryRule['domainTrack'], regulatorBody: i.regulatorBody, createdById: i.createdById,
  };
}

/** The default rules seeded for an organization that has none. */
const DEFAULT_RULES: ReadonlyArray<Omit<GovernanceRuleInput, 'organizationId' | 'createdById'>> = [
  { ruleName: 'Advisory to Governed Draft', fromBoundary: 'advisory', toBoundary: 'governed_draft', requiresReview: true,
    ruleDescription: 'AI-generated advisory output must be reviewed before becoming a governed draft.' },
  { ruleName: 'Governed Draft to Approved', fromBoundary: 'governed_draft', toBoundary: 'approved', requiresApproval: true, requiresAllAssumptionsApproved: true,
    ruleDescription: 'Governed drafts require explicit approval and all linked assumptions must be approved.' },
  { ruleName: 'Approved to Locked', fromBoundary: 'approved', toBoundary: 'locked', requiresAllDecisionsResolved: true, minimumConfidence: 'moderate',
    ruleDescription: 'Approved content can only be locked when all decisions are resolved.' },
  { ruleName: 'Locked to Submission Ready', fromBoundary: 'locked', toBoundary: 'submission_ready',
    requiresAllAssumptionsApproved: true, requiresAllDecisionsResolved: true, minimumConfidence: 'strong',
    ruleDescription: 'Locked content moves to submission-ready only with strong confidence.' },
];

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

  async createRule(input: GovernanceRuleInput): Promise<GovernanceBoundaryRule> {
    const database = this.getDb();

    const [rule] = await database
      .insert(governanceBoundaryRules)
      .values(ruleValues(input))
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
    // unreadable rule store must block, not bypass. Seeding the default rules
    // is part of loading them (2026-10-15: a failed seed was swallowed, and an
    // organization left with no rules had none applied).
    let rules: GovernanceBoundaryRule[] = [];
    try {
      await this.ensureDefaultRules(request.organizationId);
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
    // What each check found met. See TransitionResult.metRequirements.
    const metRequirements: string[] = [];

    // EVERY requirement a matched rule sets is checked, or the transition is
    // refused with what could not be checked (2026-10-15). Until then the review
    // block was empty ("recorded as an advisory signal" — it was recorded
    // nowhere), requiresApproval was never read, and the role, assumption,
    // decision and confidence checks were skipped when their input was missing —
    // and the transition was still recorded as allowed under the rule.
    for (const rule of applicableRules) {
      // A row whose lists cannot be read refuses; a rule whose declared scope
      // does not cover this transition does not govern it, and one whose scope
      // the request leaves undetermined refuses (readRuleLists, ruleScope).
      const lists = readRuleLists(rule);
      if ('malformed' in lists) {
        matchedRuleIds.push(rule.id);
        blockedReasons.push(`Governance rules could not be loaded: ${lists.malformed}. Failing closed: transition to ${request.toBoundary} is blocked until the rule is corrected.`);
        continue;
      }
      const scope = ruleScope(rule, lists.artifactTypes, request);
      if (scope.applies === false) continue;
      matchedRuleIds.push(rule.id);
      if (scope.applies === null) {
        blockedReasons.push(scope.statement);
        continue;
      }

      // Review and approval: this boundary reads no review or approval record,
      // so neither can be shown here.
      if (rule.requiresReview) blockedReasons.push(`Rule "${rule.ruleName}": requires a review before ${request.toBoundary}, and this boundary reads no review record, so no review is shown. Failing closed.`);
      if (rule.requiresApproval) blockedReasons.push(`Rule "${rule.ruleName}": requires an explicit approval before ${request.toBoundary}, and this boundary reads no approval record, so no approval is shown. Failing closed.`);

      // Check role requirement
      const requiredRoles = lists.requiredRoles;
      if (requiredRoles.length > 0) {
        const role = request.actorRole;
        if (!role) blockedReasons.push(`Rule "${rule.ruleName}": requires one of the roles ${requiredRoles.join(', ')}, and no actor role was given. Failing closed.`);
        else if (!requiredRoles.includes(role)) blockedReasons.push(`Rule "${rule.ruleName}": Actor role "${role}" not in required roles: ${requiredRoles.join(', ')}`);
        else metRequirements.push(`Rule "${rule.ruleName}": actor role "${role}" is one of ${requiredRoles.join(', ')}.`);
      }

      if (rule.requiresAllAssumptionsApproved && !request.projectId) blockedReasons.push(`Rule "${rule.ruleName}": requires every assumption to be approved, and no project was identified to check. Failing closed.`);
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
          if (unsettled === 0) metRequirements.push(`Rule "${rule.ruleName}": every assumption in the project is approved, superseded or withdrawn.`);
        } catch (err) {
          blockedReasons.push(
            `Rule "${rule.ruleName}": assumption gate could not be evaluated ` +
            `(${err instanceof Error ? err.message : 'unknown error'}). Failing closed.`
          );
        }
      }

      if (rule.requiresAllDecisionsResolved && !request.projectId) blockedReasons.push(`Rule "${rule.ruleName}": requires every decision to be resolved, and no project was identified to check. Failing closed.`);
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
          // Human decisions only. A governed-fabric row is one machine gate
          // evaluation, written per evaluation by governed-decision-repository;
          // it is not something a person owes an answer on, and a single
          // 'review' verdict on one document action must not make a whole
          // project unlockable forever with no human able to clear it. See
          // GOVERNED_FABRIC_DECISION_KIND for why this distinction only
          // surfaced once those rows could actually be written.
          const res = await database.execute(sql`
            SELECT count(*)::int AS unresolved
            FROM decision_records
            WHERE project_id = ${request.projectId}
              AND organization_id = ${request.organizationId}
              AND action_state IN (${unresolvedStates})
              AND coalesce(decision_context->>'kind', '') <> ${GOVERNED_FABRIC_DECISION_KIND}
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
          if (unresolved === 0) metRequirements.push(`Rule "${rule.ruleName}": no decision in the project is unresolved (${UNRESOLVED_DECISION_ACTION_STATES.join('/')}).`);
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
      // The rated decision is the one the request names, in this project; a
      // missing name or a decision not on record refuses (confidenceRequirement).
      if (rule.minimumConfidence && !request.decisionId) blockedReasons.push(`Rule "${rule.ruleName}": requires decision confidence of at least "${rule.minimumConfidence}", and no decision was named (decisionId) whose recorded confidence could be rated. Failing closed.`);
      if (rule.minimumConfidence && request.decisionId) {
        try {
          const res = await database.execute(sql`
            SELECT confidence_level FROM decision_records
            WHERE id = ${request.decisionId} AND organization_id = ${request.organizationId} AND project_id = ${request.projectId}
          `);
          const rows = ((res as unknown as { rows?: Array<{ confidence_level: string | null }> }).rows ?? res) as Array<{ confidence_level: string | null }>;
          const finding = confidenceRequirement(rule.ruleName, rule.minimumConfidence, request.decisionId, rows[0]);
          (finding.met ? metRequirements : blockedReasons).push(finding.statement);
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
        if (contradictionCheck?.blocked === false) metRequirements.push(`Contradiction gate: no unresolved blocking contradiction for artifact ${request.artifactId}.`);
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
    //
    // It runs only with an identified actor (2026-10-15): the fabric evaluation
    // records a governed decision in its actor's name, and with none it was
    // recorded as decided by 'system'. Without one the transition is refused by
    // rule 5 below.
    const judgesDocument = Boolean(request.projectId) && request.artifactId != null && ['approved', 'locked', 'submission_ready'].includes(request.toBoundary);
    if (judgesDocument && request.actorId) {
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
          const unmet = documentBoundaryRequirements(request.toBoundary, facts);
          blockedReasons.push(...unmet);
          if (unmet.length === 0) metRequirements.push(`Document readiness gate: artifact ${request.artifactId} has content${request.toBoundary === 'submission_ready' ? `, is locked and is placed at ${facts.ctdSection}` : ''}.`);

          const { evaluateGovernedDocument } = await import('../src/control-plane/governed-document-evaluator.js');
          const fabricResult = evaluateGovernedDocument({
            context: {
              organizationId: String(request.organizationId),
              projectId: String(request.projectId),
              actorId: String(request.actorId),
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
          if (readiness.level !== 'blocked') metRequirements.push(`Fabric readiness gate: not blocked (readiness level "${readiness.level}").`);
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

    // 5. Default structural rules (always applied). A document promotion gate 4
    // judges needs its actor too — see gate 4.
    if (request.toBoundary === 'locked' || request.toBoundary === 'submission_ready' || judgesDocument) {
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
      blockedReasons, metRequirements,
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
   * Called lazily on first evaluateTransition() — idempotent. A failure throws
   * and evaluateTransition refuses the transition; until 2026-10-15 it was
   * swallowed ("non-blocking") and the organization was evaluated with no rules.
   */
  private async ensureDefaultRules(organizationId: number): Promise<void> {
    if (this.seededOrgs.has(organizationId)) return;
    const existing = await this.getRules(organizationId);
    if (existing.length === 0) {
      await this.seedDefaultRules(organizationId);
    }
    this.seededOrgs.add(organizationId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DEFAULT RULES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Seed default governance boundary rules for an organization.
   * Called when a new organization enables the operating system layer.
   */
  async seedDefaultRules(organizationId: number, createdById?: number): Promise<GovernanceBoundaryRule[]> {
    // One INSERT, so the set is written whole or not at all (2026-10-15). Rule
    // by rule, a failure part-way left a partial set, and an organization with
    // any rule is never re-seeded — the missing boundaries applied no rule.
    return this.getDb()
      .insert(governanceBoundaryRules)
      .values(DEFAULT_RULES.map((r) => ruleValues({ ...r, organizationId, createdById })))
      .returning();
  }
}
