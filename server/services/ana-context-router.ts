/**
 * AnA Context Router — CLAUDE.md Memory Compression Model
 *
 * Implements the three-level merge/override hierarchy:
 *   User.md (Personal) defaults → Global.md (Company) → Local.md (Project).
 *   Project instructions take precedence; a hard gate at any scope remains
 *   binding. Same-scope conflicts require a human decision (spec v0.5 §21.2).
 *
 * Each document is a ROUTER (~50 lines) that POINTS to deep knowledge,
 * not an encyclopedia. Full details live in DB tables with indexed retrieval.
 *
 * Also injects:
 *   - AnA Capability Context (~15 lines) — what AnA can do for this project
 *   - AnA Wisdom Context (~15 lines) — what AnA has learned
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
  anaClientObjectives,
  anaProjectCapabilities,
} from 'shared/schema/ana-intelligence';
import { eq, and, desc, sql, or, isNull } from 'drizzle-orm';
import { pickWritable } from '../utils/authedOrgId';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { stableStringify } from '../../shared/canonical-json';
import { PROJECT_SKILL_APPROVAL_TOOLS, type PrivateUserRuleDto, type PrivateUserRuleLedgerDto,
  type PrivateUserRuleAction, type PrivateUserRuleWriteDto, type PrivateRuleContextReceipt } from '../../shared/ana/skills';
import { getTenantScope } from '../db/tenantStore';
import type { RequestConnectable, RequestSqlClient } from '../db/requestDb';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ContextRouterParams {
  organizationId: number;
  projectId?: number;
  userId?: number;
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
  };
  /** Total line count */
  totalLines: number;
}

// ─── User.md Builder (personal defaults — ~20 lines) ────────────────────────────

/**
 * Build the User.md router — personal working preferences. Tenant and project
 * requirements take precedence over these defaults. Runtime approval gates
 * remain enforced by the tool layer, independently of context instructions.
 */
export async function buildUserContext(
  userId: number,
  organizationId: number
): Promise<string | null> {
  if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(organizationId) || organizationId <= 0) return null;
  // This string can enter administrator-readable prompt records. Personal
  // data is expanded only by an owner-authorized final SDK capsule.
  return `## Personal context availability
Saved personal preferences are not included in the shared context. A protected owner context may supply them for this reply.
Private approval rules remain enforced independently.`;
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
 * Build the tenant's current scoped objectives. Legacy global wisdom is held
 * before querying, independently of stored active flags or evidence counts.
 */
export async function buildWisdomRouterContext(
  organizationId: number,
  projectId?: number,
  _regulatoryBody?: string,
  _projectType?: string
): Promise<string | null> {
  try {
    // Legacy global wisdom has no exact-artifact reviewed promotion. Do not
    // query it, even if active or supported by large recorded counts.
    // Active objectives: the organisation's own, and this project's when one is
    // open. Never another project's: until 2026-11-01 this read the top three of
    // every project in the organisation, across client workspaces, into each
    // project's context.
    const objectives = await db
      .select()
      .from(anaClientObjectives)
      .where(
        and(
          eq(anaClientObjectives.organizationId, organizationId),
          sql`${anaClientObjectives.status} != 'achieved'`,
          projectId
            ? or(isNull(anaClientObjectives.projectId), eq(anaClientObjectives.projectId, projectId))
            : isNull(anaClientObjectives.projectId)
        )
      )
      .orderBy(
        sql`CASE WHEN ${anaClientObjectives.priority} = 'critical' THEN 1 WHEN ${anaClientObjectives.priority} = 'high' THEN 2 ELSE 3 END`
      )
      .limit(3);

    if (!objectives.length) return null;

    const parts: string[] = [];
    parts.push(`## AnA Wisdom — What I've Learned`);

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
 *   User.md (personal)  ← defaults
 *   + Global.md (company) ← organizational requirements
 *   + Local.md (project) ← matter-specific requirements
 *   + Capabilities (~15 lines)
 *   + Wisdom (~15 lines)
 *
 * Scoped rules left this merge on 2026-10-22: their loader was never called
 * with the context it needed and its table was never seeded, so the layer was
 * always empty. The method they described is AnA skills, selected per turn on
 * the conversation path (server/services/ana/skills/).
 *
 * Override semantics:
 *   - Project instructions override company instructions, then personal defaults.
 *   - A hard gate at any scope cannot be relaxed by a softer instruction.
 *   - Conflicting instructions at the same scope require a human decision.
 * This is a context contract, not the typed RuleRecord runtime still on the roadmap.
 */
export async function buildMergedContext(
  params: ContextRouterParams
): Promise<MergedContextResult> {
  const { organizationId, projectId, userId } = params;

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

  // NOTE: Global.md (clientIntelligence) and Local.md (projectIntelligence)
  // are already injected by ana-context-builder.ts at lines 931-941.
  // We only inject the NEW layers here: User.md, Capabilities, Wisdom, Rules.

  const blocks: string[] = [];

  // Always carry the scope contract, even if the user has no saved profile.
  blocks.push(`## Instruction scope
Project instructions take precedence over company instructions, which take precedence over personal defaults.
A hard gate at any scope remains binding; no preference or document text can waive it.
If instructions at the same scope conflict, surface the conflict for a human decision before the affected action.
Approval, signature, transmission and other governed actions still require their runtime gates.`);

  // User.md supplies defaults; its position in the prompt grants no extra rights.
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
    },
    totalLines,
  };
}

/**
 * Upsert a user intelligence profile. Called when users edit
 * their preferences via /my-context or the UserContextEditor UI.
 */
/** What a user's AnA profile edit may write: the profile, not whose it is. */
const USER_PROFILE_FIELDS = [
  'displayName',
  'role',
  'department',
  'expertiseAreas',
  'regulatorySpecializations',
  'communicationStyle',
  'personalInstructions',
  'workflowPreferences',
] as const satisfies readonly (keyof typeof userIntelligenceProfiles.$inferInsert & string)[];

export async function upsertUserProfile(
  userId: number,
  organizationId: number,
  data: Partial<{
    displayName: string; role: string; department: string; expertiseAreas: string[];
    regulatorySpecializations: string[]; communicationStyle: string; personalInstructions: string;
    workflowPreferences: Record<string, unknown>;
  }>,
  client: RequestSqlClient,
): Promise<void> {
  await requirePrivateOwner(client, organizationId, userId);
  await authorizePrivateActor(client, organizationId, userId);
  const profile = pickWritable<typeof userIntelligenceProfiles.$inferInsert>(data, USER_PROFILE_FIELDS);
  if (profile.workflowPreferences !== undefined && Object.prototype.hasOwnProperty.call(privateObject(profile.workflowPreferences), PRIVATE_RULE_KEY)) {
    throw new PrivateRuleRefusal(422, 'PRIVATE_RULE_RESERVED', 'Private rules are changed through their explicit versioned lifecycle.');
  }
  const patch = { display_name: profile.displayName, role: profile.role, department: profile.department,
    expertise_areas: profile.expertiseAreas, regulatory_specializations: profile.regulatorySpecializations,
    communication_style: profile.communicationStyle, personal_instructions: profile.personalInstructions,
    workflow_preferences: profile.workflowPreferences };
  await client.query(`INSERT INTO user_intelligence_profiles AS saved
    (user_id,organization_id,display_name,role,department,expertise_areas,regulatory_specializations,communication_style,personal_instructions,workflow_preferences)
    SELECT $1,$2,patch.display_name,patch.role,patch.department,COALESCE(patch.expertise_areas,'[]'::jsonb),
      COALESCE(patch.regulatory_specializations,'[]'::jsonb),patch.communication_style,patch.personal_instructions,COALESCE(patch.workflow_preferences,'{}'::jsonb)
    FROM jsonb_populate_record(NULL::user_intelligence_profiles,$3::jsonb) AS patch
    ON CONFLICT(user_id,organization_id) DO UPDATE SET
      display_name=CASE WHEN $3::jsonb ? 'display_name' THEN EXCLUDED.display_name ELSE saved.display_name END,
      role=CASE WHEN $3::jsonb ? 'role' THEN EXCLUDED.role ELSE saved.role END,
      department=CASE WHEN $3::jsonb ? 'department' THEN EXCLUDED.department ELSE saved.department END,
      expertise_areas=CASE WHEN $3::jsonb ? 'expertise_areas' THEN EXCLUDED.expertise_areas ELSE saved.expertise_areas END,
      regulatory_specializations=CASE WHEN $3::jsonb ? 'regulatory_specializations' THEN EXCLUDED.regulatory_specializations ELSE saved.regulatory_specializations END,
      communication_style=CASE WHEN $3::jsonb ? 'communication_style' THEN EXCLUDED.communication_style ELSE saved.communication_style END,
      personal_instructions=CASE WHEN $3::jsonb ? 'personal_instructions' THEN EXCLUDED.personal_instructions ELSE saved.personal_instructions END,
      workflow_preferences=CASE WHEN $3::jsonb ? 'workflow_preferences' THEN COALESCE(saved.workflow_preferences,'{}'::jsonb) || EXCLUDED.workflow_preferences ELSE saved.workflow_preferences END,
      updated_at=NOW()`, [userId,organizationId,JSON.stringify(patch)]);
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

// Owner-private rules use the existing private profile. They never enter the
// tenant-readable correction store, account events, or model prompt capture.
const PRIVATE_RULE_KEY = 'annaRulesV1';
const privateHash = (value: unknown): string => createHash('sha256').update(stableStringify(value)).digest('hex');
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const privateReferenceSchema = z.object({ ruleId: z.string().uuid(), version: z.number().int().positive() }).strict();
const privateBindingSchema = z.object({ policyType: z.literal('requires_approval'), enforcement: z.literal('mandatory'),
  toolName: z.enum(PROJECT_SKILL_APPROVAL_TOOLS), description: z.string().trim().min(8).max(600) }).strict();
const storedPrivateBindingSchema = privateBindingSchema.extend({ description: z.string().min(8).max(600) });
const privateRuleInputSchema = z.object({ name: z.string().trim().min(1).max(120), instructions: z.string().trim().min(8).max(8000),
  level: z.enum(['soft', 'standing', 'hard_gate']), conflictKey: z.string().regex(/^[a-z][a-z0-9._-]{2,79}$/),
  policyBindings: z.array(privateBindingSchema).max(1).default([]), supersedes: z.array(privateReferenceSchema).max(12).optional(),
}).strict().superRefine((rule, context) => {
  if ((rule.level === 'hard_gate') !== (rule.policyBindings.length > 0)) context.addIssue({ code: 'custom', message: 'Only a hard gate requires an approval binding.' });
});
const privateCorrectionInputSchema = z.object({ text: z.string().trim().min(8).max(500),
  agency: z.string().trim().min(1).max(80), documentType: z.string().trim().min(1).max(80), intent: z.string().trim().min(1).max(80) }).strict();
const privateActionCommon = { intentId: z.string().uuid(), reason: z.string().trim().min(8).max(2000) };
export const privateUserRuleActionSchema = z.discriminatedUnion('action', [
  z.object({ ...privateActionCommon, action: z.literal('create_rule'), rule: privateRuleInputSchema, correction: privateCorrectionInputSchema }).strict(),
  z.object({ ...privateActionCommon, action: z.literal('update_rule'), ruleId: z.string().uuid(), expectedVersion: z.number().int().positive(), rule: privateRuleInputSchema }).strict(),
  z.object({ ...privateActionCommon, action: z.literal('revoke_rule'), ruleId: z.string().uuid(), expectedVersion: z.number().int().positive() }).strict(),
]);
const privateRuleSchema = z.object({ ruleId: z.string().uuid(), version: z.number().int().positive(), scope: z.literal('user'),
  level: z.enum(['soft', 'standing', 'hard_gate']), state: z.enum(['active', 'revoked', 'superseded']),
  name: z.string().min(1).max(120), instructions: z.string().min(8).max(8000), conflictKey: z.string().regex(/^[a-z][a-z0-9._-]{2,79}$/),
  policyBindings: z.array(storedPrivateBindingSchema).max(1), source: z.object({ correctionId: z.string().uuid(), sourceAuditEventId: z.string().uuid(), correctionSha256: sha256Schema }).strict(),
  supersedes: z.array(privateReferenceSchema).max(12), createdAt: z.string().datetime(), updatedAt: z.string().datetime() }).strict();
const privateCorrectionSchema = z.object({ text: z.string().min(8).max(500), agency: z.string().min(1).max(80),
  documentType: z.string().min(1).max(80), intent: z.string().min(1).max(80), correctionId: z.string().uuid(),
  sourceAuditEventId: z.string().uuid(), correctionSha256: sha256Schema }).strict();
const privateReceiptSchema = z.object({ intentId: z.string().uuid(), payloadSha256: sha256Schema, ruleId: z.string().uuid(), version: z.number().int().positive(), revision: z.number().int().positive() }).strict();
const privateHistorySchema = z.object({ snapshot: privateRuleSchema, snapshotSha256: sha256Schema, intentId: z.string().uuid(),
  reason: z.string().min(8).max(2000), action: z.enum(['ana_rule.created', 'ana_rule.updated', 'ana_rule.promoted', 'ana_rule.revoked', 'ana_rule.superseded']),
  occurredAt: z.string().datetime() }).strict();
const privateStoreSchema = z.object({ schemaVersion: z.literal(1), revision: z.number().int().nonnegative(),
  rules: z.array(privateRuleSchema).max(64), corrections: z.array(privateCorrectionSchema).max(64),
  history: z.array(privateHistorySchema).max(512), receipts: z.array(privateReceiptSchema).max(512) }).strict();
type PrivateRuleStore = z.infer<typeof privateStoreSchema>;
type PrivateRuleHistory = z.infer<typeof privateHistorySchema>;
interface PrivateRuleState { profileId: number | null; preferences: Record<string, unknown>; store: PrivateRuleStore }
interface PrivateRuleWriteContext {
  client: RequestSqlClient; state: PrivateRuleState; organizationId: number; userId: number;
  request: PrivateUserRuleAction; payloadSha256: string;
}

export class PrivateRuleRefusal extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
const privateRefusal = (code = 'PRIVATE_RULE_UNVERIFIED'): never => { throw new PrivateRuleRefusal(409, code, 'Your private rule record needs review before work can continue.'); };
function privateObject(value: unknown): Record<string, unknown> {
  const result = z.record(z.string(), z.unknown()).safeParse(value ?? {});
  if (!result.success) return privateRefusal();
  return result.data;
}

async function requirePrivateOwner(client: RequestSqlClient, organizationId: number, userId: number): Promise<void> {
  const scope = getTenantScope();
  if (!Number.isSafeInteger(userId) || userId <= 0 || scope?.accountId !== userId || scope.tenantId !== String(organizationId)) {
    throw new PrivateRuleRefusal(403, 'PRIVATE_OWNER_REQUIRED', 'Your verified account and organization are required to read private rules.');
  }
  const current = await client.query("SELECT current_setting('app.current_tenant_id',true) AS tenant_scope,current_setting('app.current_account_id',true) AS owner_scope");
  if (current.rows[0]?.tenant_scope !== String(organizationId) || current.rows[0]?.owner_scope !== String(userId)) {
    throw new PrivateRuleRefusal(403, 'PRIVATE_OWNER_REQUIRED', 'Your verified account and organization are required to read private rules.');
  }
}

async function authorizePrivateActor(client: RequestSqlClient, organizationId: number, userId: number, forShare = false): Promise<void> {
  try {
    const { readCurrentProgramActor } = await import('./c2c/current-program-access');
    await readCurrentProgramActor(client, { organizationId, userId, forShare });
  } catch (error) {
    if (error instanceof Error && 'status' in error && error.status === 403) {
      throw new PrivateRuleRefusal(403, 'PRIVATE_MEMBERSHIP_REQUIRED', 'Your current active organization membership is required.');
    }
    throw new PrivateRuleRefusal(503, 'PRIVATE_MEMBERSHIP_UNAVAILABLE', 'Your current organization membership could not be confirmed.');
  }
}

function privateConflicts(rules: PrivateUserRuleDto[]): PrivateUserRuleLedgerDto['conflicts'] {
  const groups = new Map<string, PrivateUserRuleDto[]>();
  for (const rule of rules.filter(rule => rule.state === 'active')) groups.set(rule.conflictKey, [...groups.get(rule.conflictKey) ?? [], rule]);
  return [...groups].filter(([, group]) => group.length > 1).map(([conflictKey, group]) => ({ conflictKey,
    ruleRefs: group.map(rule => ({ ruleId: rule.ruleId, version: rule.version })) }));
}
function privateLedger(organizationId: number, userId: number, state: PrivateRuleState): PrivateUserRuleLedgerDto {
  return { schemaVersion: 1, organizationId, userId, revision: state.store.revision, promptUse: 'protected_turns_only',
    rules: state.store.rules, conflicts: privateConflicts(state.store.rules), receipts: state.store.receipts };
}

function verifyPrivateCorrection(store: PrivateRuleStore, rule: PrivateUserRuleDto, events: Record<string, unknown>[], profileId: number, userId: number): void {
  const correction = store.corrections.find(item => item.correctionId === rule.source.correctionId);
  if (!correction) return privateRefusal();
  const { text, agency, documentType, intent } = correction;
  const event = events.find(item => item.id === rule.source.sourceAuditEventId);
  const values = privateObject(event?.new_values);
  if (correction.sourceAuditEventId !== rule.source.sourceAuditEventId || correction.correctionSha256 !== rule.source.correctionSha256 ||
    privateHash({ text, agency, documentType, intent }) !== rule.source.correctionSha256 || event?.action !== 'ana_correction.recorded' ||
    Number(event.user_id) !== userId || values.profileId !== profileId || values.ownerUserId !== userId ||
    values.correctionId !== correction.correctionId || values.correctionSha256 !== correction.correctionSha256) return privateRefusal();
}
function verifyPrivateHistoryEntry(state: PrivateRuleState, history: PrivateRuleHistory, events: Record<string, unknown>[], userId: number): void {
  const snapshot = history.snapshot;
  if (privateHash({ snapshot, reason: history.reason, intentId: history.intentId }) !== history.snapshotSha256) return privateRefusal();
  const matches = events.filter(event => event.record_id === snapshot.ruleId && privateObject(event.new_values).version === snapshot.version);
  const event = matches[0]; const values = privateObject(event?.new_values);
  if (matches.length !== 1 || event?.action !== history.action || Number(event.user_id) !== userId ||
    values.profileId !== state.profileId || values.ownerUserId !== userId || values.intentId !== history.intentId ||
    values.snapshotSha256 !== history.snapshotSha256 || values.reasonSha256 !== privateHash(history.reason)) return privateRefusal();
  if (state.profileId === null) return privateRefusal();
  verifyPrivateCorrection(state.store, snapshot, events, state.profileId, userId);
}
function verifyPrivateRuleHead(store: PrivateRuleStore, rule: PrivateUserRuleDto): void {
  const history = store.history.filter(entry => entry.snapshot.ruleId === rule.ruleId).sort((a, b) => a.snapshot.version - b.snapshot.version);
  if (!history.length || history.some((entry, index) => entry.snapshot.version !== index + 1) ||
    stableStringify(history.at(-1)?.snapshot) !== stableStringify(rule) ||
    ((rule.level === 'hard_gate') !== Boolean(rule.policyBindings.length))) return privateRefusal();
}
function verifyPrivateReceipts(store: PrivateRuleStore, events: Record<string, unknown>[]): void {
  if (events.length !== store.history.length || new Set(store.rules.map(rule => rule.ruleId)).size !== store.rules.length ||
    new Set(store.receipts.map(receipt => receipt.intentId)).size !== store.receipts.length || store.revision !== store.receipts.length ||
    store.history.some(entry => !store.rules.some(rule => rule.ruleId === entry.snapshot.ruleId))) return privateRefusal();
  for (const receipt of store.receipts) {
    const event = events.find(item => item.record_id === receipt.ruleId && privateObject(item.new_values).version === receipt.version);
    const values = privateObject(event?.new_values);
    if (values.intentId !== receipt.intentId || values.payloadSha256 !== receipt.payloadSha256 || values.revision !== receipt.revision || receipt.revision > store.revision) return privateRefusal();
  }
}
function verifyPrivateHistory(state: PrivateRuleState, events: Record<string, unknown>[], userId: number): void {
  const seen = new Set<string>();
  for (const history of state.store.history) {
    const key = `${history.snapshot.ruleId}:${history.snapshot.version}`;
    if (seen.has(key)) return privateRefusal();
    seen.add(key);
    verifyPrivateHistoryEntry(state, history, events, userId);
  }
  for (const rule of state.store.rules) verifyPrivateRuleHead(state.store, rule);
  verifyPrivateReceipts(state.store, events.filter(event => String(event.action).startsWith('ana_rule.')));
}

async function readPrivateState(client: RequestSqlClient, organizationId: number, userId: number, lock = false): Promise<PrivateRuleState> {
  await requirePrivateOwner(client, organizationId, userId);
  const result = lock
    ? await client.query('SELECT id,workflow_preferences FROM user_intelligence_profiles WHERE user_id=$1 AND organization_id=$2 FOR UPDATE', [userId, organizationId])
    : await client.query('SELECT id,workflow_preferences FROM user_intelligence_profiles WHERE user_id=$1 AND organization_id=$2', [userId, organizationId]);
  const row = result.rows[0]; const preferences = privateObject(row?.workflow_preferences);
  const raw = preferences[PRIVATE_RULE_KEY] ?? { schemaVersion: 1, revision: 0, rules: [], corrections: [], history: [], receipts: [] };
  const parsed = privateStoreSchema.safeParse(raw);
  if (!parsed.success || result.rows.length > 1) return privateRefusal();
  const profileId = row ? Number(row.id) : null;
  if (profileId !== null && (!Number.isSafeInteger(profileId) || profileId <= 0)) return privateRefusal();
  const state = { profileId, preferences, store: parsed.data };
  const events = await client.query(`SELECT id,user_id,record_id,action,new_values FROM audit_logs
    WHERE tenant_id=$1 AND user_id=$2 AND table_name='user_intelligence_profiles' AND new_values->>'privacy'='owner'
    ORDER BY occurred_at,id LIMIT 2049`, [organizationId, userId]);
  if (events.rows.length > 2048 || (state.profileId === null && events.rows.length)) return privateRefusal();
  verifyPrivateHistory(state, events.rows, userId);
  return state;
}

export async function readPrivateUserRuleLedger(client: RequestSqlClient, organizationId: number, userId: number): Promise<PrivateUserRuleLedgerDto> {
  await authorizePrivateActor(client, organizationId, userId);
  return privateLedger(organizationId, userId, await readPrivateState(client, organizationId, userId));
}

async function capturePrivateCorrection(client: RequestSqlClient, state: PrivateRuleState, organizationId: number, userId: number,
  correction: z.infer<typeof privateCorrectionInputSchema>): Promise<PrivateUserRuleDto['source']> {
  const correctionId = randomUUID(); const correctionSha256 = privateHash(correction);
  const { writeChainedAuditRow } = await import('./auditService');
  await writeChainedAuditRow(client, { tenantId: organizationId, userId, action: 'ana_correction.recorded', resourceType: 'user_intelligence_profiles',
    resourceId: correctionId, reason: 'Owner-private human correction recorded.',
    details: { privacy: 'owner', ownerUserId: userId, profileId: state.profileId, correctionId, correctionSha256 } });
  const recorded = await client.query(`SELECT id FROM audit_logs WHERE tenant_id=$1 AND user_id=$2 AND table_name='user_intelligence_profiles'
    AND record_id=$3 AND action='ana_correction.recorded'`, [organizationId, userId, correctionId]);
  const sourceAuditEventId = recorded.rows[0]?.id;
  if (recorded.rows.length !== 1 || typeof sourceAuditEventId !== 'string') return privateRefusal();
  const source = { correctionId, sourceAuditEventId, correctionSha256 };
  state.store.corrections.push({ ...correction, ...source });
  return source;
}

async function appendPrivateRuleVersion(context: PrivateRuleWriteContext, snapshot: PrivateUserRuleDto, action: PrivateRuleHistory['action']): Promise<void> {
  const { client, state, organizationId, userId, request, payloadSha256 } = context;
  const recordedSnapshot = privateRuleSchema.parse(snapshot);
  const history = { snapshot: recordedSnapshot, action, intentId: request.intentId, reason: request.reason, occurredAt: snapshot.updatedAt,
    snapshotSha256: privateHash({ snapshot, reason: request.reason, intentId: request.intentId }) };
  const { writeChainedAuditRow } = await import('./auditService');
  await writeChainedAuditRow(client, { tenantId: organizationId, userId, action, resourceType: 'user_intelligence_profiles', resourceId: snapshot.ruleId,
    reason: 'Owner-private rule lifecycle recorded.', details: { privacy: 'owner', ownerUserId: userId, profileId: state.profileId,
      ruleId: snapshot.ruleId, version: snapshot.version, snapshotSha256: history.snapshotSha256, intentId: request.intentId,
      payloadSha256, revision: state.store.revision, reasonSha256: privateHash(request.reason) } });
  state.store.history.push(history);
  const index = state.store.rules.findIndex(rule => rule.ruleId === snapshot.ruleId);
  if (index < 0) state.store.rules.push(recordedSnapshot); else state.store.rules[index] = recordedSnapshot;
}

function privateRuleTarget(state: PrivateRuleState, request: Exclude<PrivateUserRuleAction, { action: 'create_rule' }>): PrivateUserRuleDto {
  const previous = state.store.rules.find(rule => rule.ruleId === request.ruleId);
  if (!previous) throw new PrivateRuleRefusal(404, 'PRIVATE_RULE_NOT_FOUND', 'This private rule is not available to your account.');
  if (previous.version !== request.expectedVersion) throw new PrivateRuleRefusal(409, 'PRIVATE_RULE_VERSION_CHANGED', 'This private rule changed. Read its current version before editing.');
  if (previous.state !== 'active') throw new PrivateRuleRefusal(409, 'PRIVATE_RULE_RETIRED', 'A retired private rule remains on the record. Create a new sourced rule.');
  if (request.action === 'update_rule' && previous.level === 'hard_gate' &&
    (request.rule.level !== 'hard_gate' || previous.policyBindings.some(prior => !request.rule.policyBindings?.some(binding => binding.toolName === prior.toolName)))) {
    throw new PrivateRuleRefusal(409, 'PRIVATE_RULE_DEMOTION_REFUSED', 'Revoke a private hard gate explicitly before it stops governing actions.');
  }
  return previous;
}

function privateRuleSupersedes(previous: PrivateUserRuleDto | null, requested: PrivateUserRuleDto['supersedes'] | undefined): PrivateUserRuleDto['supersedes'] {
  const supersedes = requested ?? previous?.supersedes ?? [];
  if (previous?.supersedes.some(ref => !supersedes.some(next => next.ruleId === ref.ruleId && next.version === ref.version))) {
    throw new PrivateRuleRefusal(409, 'PRIVATE_RULE_LINEAGE_IMMUTABLE', 'Recorded supersession references remain part of private rule history.');
  }
  return supersedes;
}
function nextPrivateRule(request: Exclude<PrivateUserRuleAction, { action: 'revoke_rule' }>, previous: PrivateUserRuleDto | null,
  source: PrivateUserRuleDto['source'], now: string): PrivateUserRuleDto {
  return { ...request.rule, policyBindings: request.rule.policyBindings ?? [], supersedes: privateRuleSupersedes(previous, request.rule.supersedes),
    ruleId: previous?.ruleId ?? randomUUID(), version: (previous?.version ?? 0) + 1, scope: 'user', state: 'active', source,
    createdAt: previous?.createdAt ?? now, updatedAt: now };
}
function privateUpdateAction(previous: PrivateUserRuleDto | null, next: PrivateUserRuleDto): PrivateRuleHistory['action'] {
  if (!previous) return 'ana_rule.created';
  return previous.level !== 'hard_gate' && next.level === 'hard_gate' ? 'ana_rule.promoted' : 'ana_rule.updated';
}
async function applyPrivateRuleAction(context: PrivateRuleWriteContext): Promise<PrivateUserRuleDto> {
  const { client, state, organizationId, userId, request } = context;
  const previous = request.action === 'create_rule' ? null : privateRuleTarget(state, request);
  const now = new Date().toISOString();
  if (request.action === 'revoke_rule') {
    if (!previous) return privateRefusal();
    const next = { ...previous, state: 'revoked' as const, version: previous.version + 1, updatedAt: now };
    await appendPrivateRuleVersion(context, next, 'ana_rule.revoked');
    return next;
  }
  const source = previous?.source ?? (request.action === 'create_rule' ? await capturePrivateCorrection(client, state, organizationId, userId, request.correction) : privateRefusal());
  const next = nextPrivateRule(request, previous, source, now);
  await supersedePrivateRules(context, { request, previous, supersedes: next.supersedes, now });
  const action = privateUpdateAction(previous, next);
  await appendPrivateRuleVersion(context, next, action);
  return next;
}

function assertPrivateSupersessionTarget(target: PrivateUserRuleDto | undefined, ref: PrivateUserRuleDto['supersedes'][number],
  input: { previous: PrivateUserRuleDto | null; conflictKey: string; level: PrivateUserRuleDto['level'] }): void {
  if (!target || target.ruleId === input.previous?.ruleId || target.version !== ref.version || target.state !== 'active' ||
    target.conflictKey !== input.conflictKey || (target.level === 'hard_gate' && input.level !== 'hard_gate')) privateRefusal('PRIVATE_RULE_CONFLICT');
}
async function supersedePrivateRules(context: PrivateRuleWriteContext,
  input: { request: Exclude<PrivateUserRuleAction, { action: 'revoke_rule' }>; previous: PrivateUserRuleDto | null;
    supersedes: PrivateUserRuleDto['supersedes']; now: string }): Promise<void> {
  const { state } = context;
  const { request, previous, supersedes, now } = input;
  const inherited = previous?.supersedes ?? [];
  const newRefs = supersedes.filter(ref => !inherited.some(old => old.ruleId === ref.ruleId && old.version === ref.version));
  if (new Set(supersedes.map(ref => ref.ruleId)).size !== supersedes.length) return privateRefusal('PRIVATE_RULE_CONFLICT');
  for (const ref of newRefs) {
    const target = state.store.rules.find(rule => rule.ruleId === ref.ruleId);
    assertPrivateSupersessionTarget(target, ref, { previous, conflictKey: request.rule.conflictKey, level: request.rule.level });
  }
  const conflicts = state.store.rules.filter(rule => rule.state === 'active' && rule.ruleId !== previous?.ruleId && rule.conflictKey === request.rule.conflictKey);
  if (conflicts.some(rule => !newRefs.some(ref => ref.ruleId === rule.ruleId && ref.version === rule.version))) {
    throw new PrivateRuleRefusal(409, 'PRIVATE_RULE_CONFLICT', 'Active private rules with this conflict key require an explicit versioned replacement decision.');
  }
  for (const ref of newRefs) {
    const target = state.store.rules.find(rule => rule.ruleId === ref.ruleId);
    if (!target) return privateRefusal();
    await appendPrivateRuleVersion(context,
      { ...target, state: 'superseded', version: target.version + 1, updatedAt: now }, 'ana_rule.superseded');
  }
}

export async function writePrivateUserRule(connectable: RequestConnectable, organizationId: number, userId: number,
  input: unknown): Promise<PrivateUserRuleWriteDto> {
  const request = privateUserRuleActionSchema.parse(input);
  const payloadSha256 = privateHash(input);
  const client = await connectable.connect(); let committing = false;
  try {
    await client.query('BEGIN');
    await requirePrivateOwner(client, organizationId, userId);
    await authorizePrivateActor(client, organizationId, userId, true);
    await client.query('INSERT INTO user_intelligence_profiles(user_id,organization_id) VALUES($1,$2) ON CONFLICT(user_id,organization_id) DO NOTHING', [userId, organizationId]);
    const state = await readPrivateState(client, organizationId, userId, true);
    const prior = state.store.receipts.find(receipt => receipt.intentId === request.intentId);
    if (prior) {
      if (prior.payloadSha256 !== payloadSha256) throw new PrivateRuleRefusal(409, 'PRIVATE_INTENT_REUSED', 'This intent already records a different private rule change.');
    } else {
      state.store.revision++;
      const next = await applyPrivateRuleAction({ client, state, organizationId, userId, request, payloadSha256 });
      state.store.receipts.push({ intentId: request.intentId, payloadSha256, ruleId: next.ruleId, version: next.version, revision: state.store.revision });
      if (!privateStoreSchema.safeParse(state.store).success) throw new PrivateRuleRefusal(409, 'PRIVATE_RULE_LIMIT', 'Your private rule history has reached its supported limit.');
      await client.query(`UPDATE user_intelligence_profiles SET workflow_preferences=jsonb_set(COALESCE(workflow_preferences,'{}'::jsonb),'{annaRulesV1}',$1::jsonb,true),updated_at=NOW()
        WHERE id=$2 AND user_id=$3 AND organization_id=$4`, [JSON.stringify(state.store), state.profileId, userId, organizationId]);
    }
    committing = true; await client.query('COMMIT');
    return { success: true, audited: true, replayed: Boolean(prior), intentId: request.intentId, privateRules: privateLedger(organizationId, userId, state) };
  } catch (error) {
    if (committing) {
      client.release(new Error('Private rule transaction outcome unknown'));
      return reconcilePrivateRuleIntent(organizationId, userId, request.intentId, payloadSha256);
    }
    try { await client.query('ROLLBACK'); } catch { client.release(new Error('Private rule rollback could not be confirmed')); }
    throw error;
  } finally { client.release(); }
}

async function reconcilePrivateRuleIntent(organizationId: number, userId: number, intentId: string, payloadSha256: string): Promise<PrivateUserRuleWriteDto> {
  try {
    const { withTenantConnection } = await import('../db/withTenantConnection');
    return await withTenantConnection({ tenantId: organizationId, accountId: userId, source: 'request', caller: 'private-rule:intent-reconcile' }, async client => {
      const ledger = await readPrivateUserRuleLedger(client, organizationId, userId);
      const receipt = ledger.receipts.find(receipt => receipt.intentId === intentId);
      if (!receipt || receipt.payloadSha256 !== payloadSha256) throw new Error('Private intent not confirmed');
      return { success: true, audited: true, replayed: true, intentId, privateRules: ledger };
    });
  } catch {
    throw new PrivateRuleRefusal(503, 'PRIVATE_RULE_OUTCOME_UNKNOWN', 'The private rule change could not be confirmed. Re-read its intent receipt before retrying the same change.');
  }
}

/** Only opaque, version-bound approval requirements leave the owner store. */
interface PrivateUserRuleGateReference { profileId: number; ruleId: string; version: number; sourceAuditEventId: string; toolName: string }
export async function readPrivateUserRuleGates(client: RequestSqlClient, organizationId: number, userId: number): Promise<{
  rules: PrivateUserRuleGateReference[];
  ruleHash: string;
}> {
  await authorizePrivateActor(client, organizationId, userId);
  const state = await readPrivateState(client, organizationId, userId);
  if (privateConflicts(state.store.rules).length) throw new PrivateRuleRefusal(409, 'PRIVATE_RULE_CONFLICT', 'Conflicting private rule versions need your explicit decision before work can continue.');
  const rules: PrivateUserRuleGateReference[] = [];
  for (const rule of state.store.rules.filter(rule => rule.state === 'active' && rule.level === 'hard_gate')) {
    if (state.profileId === null) return privateRefusal();
    for (const binding of rule.policyBindings) rules.push({ profileId: state.profileId, ruleId: rule.ruleId, version: rule.version,
      sourceAuditEventId: rule.source.sourceAuditEventId, toolName: binding.toolName });
  }
  return { rules, ruleHash: privateHash({ organizationId, userId, revision: state.store.revision, rules }) };
}

const issuedPrivateRuleReceipts = new WeakMap<object, PrivateRuleContextReceipt>();
async function privateContextReceiptMetadata(client: RequestSqlClient, organizationId: number, ownerUserId: number): Promise<PrivateRuleContextReceipt> {
  await authorizePrivateActor(client, organizationId, ownerUserId);
  const state = await readPrivateState(client, organizationId, ownerUserId);
  if (privateConflicts(state.store.rules).length) return privateRefusal('PRIVATE_RULE_CONFLICT');
  const active = state.store.rules.filter(rule => rule.state === 'active');
  const receipt: PrivateRuleContextReceipt = { schemaVersion: 1, organizationId, ownerUserId, profileId: state.profileId, revision: state.store.revision,
    ruleSetSha256: privateHash({ profileId: state.profileId, revision: state.store.revision, active }),
    ruleRefs: Object.freeze(active.map(rule => Object.freeze({ ruleId: rule.ruleId, version: rule.version, sourceAuditEventId: rule.source.sourceAuditEventId }))),
    promptUse: 'protected_turns_only' };
  return Object.freeze(receipt);
}

/** No raw expansion: readers may bind an immutable owner marker before any future private use. */
export async function issuePrivateRuleContextReceipt(client: RequestSqlClient, organizationId: number, ownerUserId: number): Promise<PrivateRuleContextReceipt> {
  const receipt = await privateContextReceiptMetadata(client, organizationId, ownerUserId);
  issuedPrivateRuleReceipts.set(receipt, receipt);
  return receipt;
}

/** Serialized metadata, a foreign owner, or a superseded/revoked snapshot confers no private authority. */
export async function validatePrivateRuleContextReceipt(client: RequestSqlClient, receipt: unknown,
  scope: { organizationId: number; userId: number }): Promise<PrivateRuleContextReceipt> {
  const issued = receipt !== null && typeof receipt === 'object' ? issuedPrivateRuleReceipts.get(receipt) : undefined;
  if (!issued || issued.organizationId !== scope.organizationId || issued.ownerUserId !== scope.userId) {
    throw new PrivateRuleRefusal(403, 'PRIVATE_CONTEXT_UNVERIFIED', 'Current server-issued private context authority is required.');
  }
  const current = await privateContextReceiptMetadata(client, scope.organizationId, scope.userId);
  if (stableStringify(current) !== stableStringify(issued)) {
    throw new PrivateRuleRefusal(409, 'PRIVATE_CONTEXT_CHANGED', 'The private rule context changed. Read its current version before continuing.');
  }
  return issued;
}

/** Metadata bridge for immutable owner-private run/record markers. Never raw text. */
export async function validateOwnerPrivateSourceReceipt(client: RequestSqlClient, receipt: unknown,
  actor: { organizationId: number; userId: number }): Promise<{ sourceReceiptSha256: string; version: number }> {
  const { validateRunOwnerPrivateSourceReceipt } = await import('./ana/run-control');
  const retained = await validateRunOwnerPrivateSourceReceipt(client, receipt, actor);
  if (retained) return retained;
  const source = await validatePrivateRuleContextReceipt(client, receipt, actor);
  return Object.freeze({ sourceReceiptSha256: privateHash(source), version: source.revision });
}

/** Called only by the final SDK capsule expansion, after owner-private capture is established. */
export async function resolvePrivateRuleContextAtModelBoundary(client: RequestSqlClient, receipt: unknown,
  actor: { organizationId: number; userId: number; projectId: number | null; programId?: string | null; runId: string; threadId: string | null }): Promise<string> {
  const source = await validateOwnerPrivateSourceReceipt(client, receipt, actor);
  const [{ loadActiveStandingRules }, { assertRunOwnerPrivateCapture }, { admitAnaProjectScope }] = await Promise.all([
    import('./account-skill-bundles'), import('./ana/run-control'), import('./ana/project-scope-admission'),
  ]);
  const captureScope = { ...actor, programId: actor.programId ?? undefined, sourceReceiptSha256: source.sourceReceiptSha256 };
  await assertRunOwnerPrivateCapture(client, captureScope);
  const projectInput = { ...actor, projectRef: actor.programId };
  const project = await admitAnaProjectScope(client, projectInput);
  if (project.projectId !== actor.projectId) throw new PrivateRuleRefusal(403, 'PRIVATE_SCOPE_CHANGED', 'The private context project scope could not be confirmed.');
  const [privateRules, higherRules] = await Promise.all([
    readPrivateUserRuleLedger(client, actor.organizationId, actor.userId),
    loadActiveStandingRules(client, actor.organizationId, project.projectId),
  ]);
  const higherKeys = new Set(higherRules.map(item => item.rule.conflictKey));
  const applied = privateRules.rules.filter(rule => rule.state === 'active' && (rule.level === 'hard_gate' || !higherKeys.has(rule.conflictKey)));
  await validatePrivateRuleContextReceipt(client, receipt, actor);
  await assertRunOwnerPrivateCapture(client, captureScope);
  await admitAnaProjectScope(client, projectInput);
  if (!applied.length) return '';
  const text = ['## Your private standing instructions',
    'These personal defaults yield to project and company requirements. A hard gate at any scope remains binding and is enforced separately.',
    ...applied.map(rule => `[${rule.ruleId}@${rule.version}; ${rule.level}] ${rule.instructions}`)].join('\n');
  if (text.length > 32000) throw new PrivateRuleRefusal(409, 'PRIVATE_CONTEXT_LIMIT', 'The active private instructions need review before they can fit this task.');
  return text;
}

/** Server-only host adapter: activation precedes user persistence; text exists only at final SDK expansion. */
export async function issuePrivateRuleModelContext(client: RequestConnectable,
  scope: import('./ai-gateway/model-call-scope').OwnerPrivateModelContextScope): Promise<import('./ai-gateway/model-call-scope').OwnerPrivateModelContextCapsule | null> {
  const actor = Object.freeze({ ...scope });
  const sourceReceipt = await issuePrivateRuleContextReceipt(client, actor.organizationId, actor.userId);
  if (!sourceReceipt.ruleRefs.length) return null;
  const source = await validateOwnerPrivateSourceReceipt(client, sourceReceipt, actor);
  const [{ issueOwnerPrivateModelContext }, { markRunOwnerPrivate, recheckRunOwnerPrivacy }, { markThreadOwnerPrivate }] = await Promise.all([
    import('./ai-gateway/model-call-scope'), import('./ana/run-control'), import('./chat-thread-helpers'),
  ]);
  let capture: import('./ana/run-control').RunOwnerPrivacyReceipt | null = null;
  return issueOwnerPrivateModelContext({ scope: actor, sourceRef: source.sourceReceiptSha256,
    activate: async () => {
      if (capture) await recheckRunOwnerPrivacy(client, capture);
      else capture = await markRunOwnerPrivate(client, { ...actor, programId: actor.programId ?? undefined }, sourceReceipt);
      if (actor.threadId !== null) await markThreadOwnerPrivate(actor.threadId, capture);
    },
    expand: async () => {
      if (!capture) throw new PrivateRuleRefusal(503, 'PRIVATE_CAPTURE_REQUIRED', 'Protected capture is required before using private context.');
      await recheckRunOwnerPrivacy(client, capture);
      return resolvePrivateRuleContextAtModelBoundary(client, sourceReceipt, actor);
    },
    recheck: async () => {
      // Root preflight checks source authority before activation, without text.
      // Once activated, every SDK checkpoint must also retain its capture/key.
      if (capture) await recheckRunOwnerPrivacy(client, capture);
      const current = await validateOwnerPrivateSourceReceipt(client, sourceReceipt, actor);
      if (current.sourceReceiptSha256 !== source.sourceReceiptSha256) {
        throw new PrivateRuleRefusal(409, 'PRIVATE_CONTEXT_CHANGED', 'The private rule context changed before this model call.');
      }
    },
  });
}

const legacyUserContextSchema = z.object({ id: z.number().int().positive(), display_name: z.string().nullable(), role: z.string().nullable(),
  department: z.string().nullable(), expertise_areas: z.array(z.string()).nullable(), regulatory_specializations: z.array(z.string()).nullable(),
  communication_style: z.string().nullable(), personal_instructions: z.string().nullable() }).strict();
const legacyRelationalContextSchema = z.object({ id: z.number().int().positive(), project_id: z.number().int().positive().nullable(),
  profile_summary: z.string().nullable(), tone_calibration: z.record(z.string(), z.unknown()).nullable(),
  emotional_signals: z.array(z.object({ at: z.string(), signal: z.string() }).strict()).nullable(),
  acknowledged_mistakes: z.array(z.object({ at: z.string(), mistake: z.string(), correction: z.string() }).strict()).nullable() }).strict();
interface LegacyPrivateMaterial {
  user: z.infer<typeof legacyUserContextSchema> | null;
  relational: Array<z.infer<typeof legacyRelationalContextSchema>>;
}
type PrivateModelScope = import('./ai-gateway/model-call-scope').OwnerPrivateModelContextScope;
async function readLegacyPrivateMaterial(client: RequestSqlClient, actor: PrivateModelScope): Promise<LegacyPrivateMaterial> {
  await requirePrivateOwner(client, actor.organizationId, actor.userId);
  await authorizePrivateActor(client, actor.organizationId, actor.userId);
  const { admitAnaProjectScope } = await import('./ana/project-scope-admission');
  const project = await admitAnaProjectScope(client, { ...actor, projectRef: actor.programId });
  if (project.projectId !== actor.projectId) throw new PrivateRuleRefusal(403, 'PRIVATE_SCOPE_CHANGED', 'The personal context project scope could not be confirmed.');
  const [users, relational] = await Promise.all([
    client.query(`SELECT id,display_name,role,department,expertise_areas,regulatory_specializations,communication_style,personal_instructions
      FROM user_intelligence_profiles WHERE organization_id=$1 AND user_id=$2`, [actor.organizationId, actor.userId]),
    client.query(`SELECT id,project_id,profile_summary,tone_calibration,emotional_signals,acknowledged_mistakes
      FROM ana_relational_profiles WHERE organization_id=$1 AND user_id=$2 AND (project_id IS NULL OR project_id=$3) ORDER BY id`,
      [actor.organizationId, actor.userId, actor.projectId]),
  ]);
  if (users.rows.length > 1 || relational.rows.length > 2) return privateRefusal();
  return { user: users.rows[0] ? legacyUserContextSchema.parse(users.rows[0]) : null,
    relational: relational.rows.map(row => legacyRelationalContextSchema.parse(row)) };
}
function legacyMaterialPresent(material: LegacyPrivateMaterial): boolean {
  const user = material.user;
  return Boolean(user && [user.display_name,user.role,user.department,user.communication_style,user.personal_instructions].some(value => value?.trim()) ||
    user?.expertise_areas?.length || user?.regulatory_specializations?.length || material.relational.some(row => row.profile_summary?.trim() ||
      Object.keys(row.tone_calibration ?? {}).length || row.emotional_signals?.length || row.acknowledged_mistakes?.length));
}
function legacyUserContextLines(user: LegacyPrivateMaterial['user']): string[] {
  const parts: string[] = [];
  if (!user) return parts;
  for (const value of [user.display_name,user.role,user.department,user.communication_style]) if (value) parts.push(value);
  if (user.expertise_areas?.length) parts.push(`Expertise: ${user.expertise_areas.join(', ')}`);
  if (user.regulatory_specializations?.length) parts.push(`Regulatory focus: ${user.regulatory_specializations.join(', ')}`);
  if (user.personal_instructions) parts.push(user.personal_instructions);
  return parts;
}
function legacyRelationalContextInput(rows: LegacyPrivateMaterial['relational']) {
  const empty = { profile_summary: null, tone_calibration: null, emotional_signals: [], acknowledged_mistakes: [] };
  const own = rows.find(row => row.project_id === null) ?? empty;
  const project = rows.find(row => row.project_id !== null) ?? empty;
  const signals = [...own.emotional_signals ?? [], ...project.emotional_signals ?? []];
  return { userNotes: own.profile_summary, projectNotes: project.profile_summary,
    toneCalibration: own.tone_calibration, recentEmotionalSignal: signals.at(-1)?.signal ?? null,
    acknowledgedMistakes: [...own.acknowledged_mistakes ?? [], ...project.acknowledged_mistakes ?? []] };
}
async function renderLegacyPrivateMaterial(material: LegacyPrivateMaterial): Promise<string> {
  const { renderRelationalContextBlock } = await import('./ana-ri/personality-core');
  const parts = ['## Your private personal defaults',
    'These older preferences and working notes are defaults only. Current typed standing rules and project/company requirements take precedence; no preference waives a runtime gate.',
    ...legacyUserContextLines(material.user), renderRelationalContextBlock(legacyRelationalContextInput(material.relational))];
  const text = parts.join('\n');
  if (text.length > 32000) throw new PrivateRuleRefusal(409, 'PRIVATE_CONTEXT_LIMIT', 'The saved personal context needs review before it can fit this task.');
  return text;
}

/** Legacy mutable profiles get their own actual source receipt, never a fabricated typed-rule source. */
export async function issueLegacyPrivateModelContext(client: RequestConnectable, scope: PrivateModelScope): Promise<import('./ai-gateway/model-call-scope').OwnerPrivateModelContextCapsule | null> {
  const actor = Object.freeze({ ...scope });
  let material: LegacyPrivateMaterial;
  try { material = await readLegacyPrivateMaterial(client, actor); }
  catch {
    // Generic context already carries an honest fixed omission notice. Optional
    // legacy prose is never replaced with an asserted empty memory or raw text.
    return null;
  }
  if (!legacyMaterialPresent(material)) return null;
  const sourceHash = privateHash({ kind: 'legacy_private_context_v1', actor, material });
  const [{ issueOwnerPrivateModelContext }, control, { markThreadOwnerPrivate }] = await Promise.all([
    import('./ai-gateway/model-call-scope'), import('./ana/run-control'), import('./chat-thread-helpers'),
  ]);
  const sourceReceipt = control.issueRunOwnerPrivateSourceReceipt({ scope: { ...actor, programId: actor.programId ?? undefined },
    sourceReceiptSha256: sourceHash, version: 1, recheck: async current => {
      if (privateHash({ kind: 'legacy_private_context_v1', actor, material: await readLegacyPrivateMaterial(current, actor) }) !== sourceHash) {
        throw new PrivateRuleRefusal(409, 'PRIVATE_CONTEXT_CHANGED', 'The saved personal context changed before this model call.');
      }
    } });
  let capture: import('./ana/run-control').RunOwnerPrivacyReceipt | null = null;
  const recheck = async () => {
    await validateOwnerPrivateSourceReceipt(client, sourceReceipt, actor);
    if (capture) await control.recheckRunOwnerPrivacy(client, capture);
  };
  return issueOwnerPrivateModelContext({ scope: actor, sourceRef: sourceHash,
    activate: async () => {
      if (capture) await recheck(); else capture = await control.markRunOwnerPrivate(client, { ...actor, programId: actor.programId ?? undefined }, sourceReceipt);
      if (actor.threadId !== null) await markThreadOwnerPrivate(actor.threadId, capture);
    }, recheck,
    expand: async () => {
      if (!capture) throw new PrivateRuleRefusal(503, 'PRIVATE_CAPTURE_REQUIRED', 'Protected capture is required before using personal context.');
      await recheck();
      const text = await renderLegacyPrivateMaterial(await readLegacyPrivateMaterial(client, actor));
      await recheck(); return text;
    },
  });
}
