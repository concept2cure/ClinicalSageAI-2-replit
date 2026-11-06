/**
 * Account Skill Bundles Service
 *
 * Skill bundles codify "how this account does X" — e.g., CER evidence
 * structures, IND module drafting defaults, FDA response letter style. They
 * are the organization's own AnA skills (see the section below).
 *
 * Also manages the account term dictionary and template registry.
 *
 * @module server/services/account-skill-bundles
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { TOOL_REGISTER } from './ana/tool-authorization.js';
import { PROJECT_SKILL_APPROVAL_TOOLS, type HumanCorrectionInput, type SkillApprovalBinding,
  type StandingRuleInput, type StandingRuleRecord, type StandingRuleReference } from '../../shared/ana/skills.js';
import type { RuleConflictDecisionPackage } from '../../shared/ana/skills.js';
import { stableStringify } from '../../shared/canonical-json.js';
import { appendEvent } from './account-canon.js';
import { writeChainedAuditRow } from './auditService.js';
import { getTenantScope } from '../db/tenantStore.js';
import { AggregateLearningRefusedError } from './intelligence/ana-failure-learning.js';
import { loadReviewedLearningLibraryArtifact, type ReviewedLearningLibraryReceipt } from './qms/controlled-document-service.js';

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ── Organization AnA skills (skill bundles) ─────────────────────────────────
//
// A skill bundle is an organization's own AnA skill (shared/ana/skills.ts):
// instructions AnA follows for a kind of work, selected per turn by what the
// person asked and what is on screen (server/services/ana/skills/). Until
// 2026-10-22 bundles were written by any member with no reason and no audit
// row, and were never read on the conversation path; that is why these writers
// changed shape. Each write here is an administrator's governed change: it
// takes a stated reason and runs on the request's tenant-scoped connection,
// the change, its chained audit row (before, after, reason) and its account
// event in one transaction. A refused audit row rolls the change back.

export interface SkillTxClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  release: (err?: Error) => void;
}
export interface SkillConnectable {
  connect: () => Promise<SkillTxClient>;
}
export interface SkillReadClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface SkillActor {
  userId: number;
  name?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** The fields an administrator writes. Lists are already validated against the vocabulary. */
export interface OrgSkillFields {
  standingRule?: StandingRuleInput;
  correction?: HumanCorrectionInput;
  expectedVersion?: number;
  policyBindings?: SkillApprovalBinding[];
  sourceAuditEventId?: string | null;
  name: string;
  description: string;
  instructions: string;
  disciplines: string[];
  useCases: string[];
  segments: string[];
  therapeuticAreas: string[];
  regions: string[];
  submissionTypes: string[];
  surfaces: string[];
  documentTypes: string[];
  triggers: string[];
  tools: string[];
  extendsSkillKey: string | null;
  extensionMode: 'addendum' | 'replace' | null;
  status: 'draft' | 'active' | 'archived';
  /** A skill written for one project: selected only on that project's turns. Null for the whole organization. */
  projectId: number | null;
}

/** An organization skill as stored, in the shape the selector and Settings read. */
export interface OrgSkillRecord extends Omit<OrgSkillFields, 'status'> {
  libraryReceipt?: ReviewedLearningLibraryReceipt | null;
  standingRuleRecord?: StandingRuleRecord | null;
  id: number;
  bundleId: string;
  status: 'draft' | 'active' | 'locked' | 'archived';
  version: number;
  updatedAt: string | null;
}

function listOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') {
    try {
      return listOf(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

function objectOf(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      return objectOf(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * A bundle's instructions: its prompt fragments by priority, then the evidence
 * and response-style preferences a bundle could carry before it was a skill.
 * One renderer, so Settings shows exactly what AnA reads.
 */
export function instructionsOfBundle(row: Record<string, unknown>): string {
  const raw = Array.isArray(row.prompt_fragments)
    ? row.prompt_fragments
    : (() => {
        try {
          return JSON.parse(String(row.prompt_fragments ?? '[]'));
        } catch {
          return [];
        }
      })();
  const fragments = (Array.isArray(raw) ? raw : [])
    .filter((f: any) => f && typeof f.content === 'string' && f.content.trim())
    .sort((a: any, b: any) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
  const parts: string[] = fragments.map((f: any) => String(f.content).trim());
  const evidence = objectOf(row.evidence_preferences);
  if (evidence) {
    const preferred = listOf(evidence.preferredTypes);
    if (preferred.length) parts.push(`Evidence preferences: prefer ${preferred.join(', ')}.`);
    if (typeof evidence.citationStyle === 'string' && evidence.citationStyle) parts.push(`Citation style: ${evidence.citationStyle}.`);
  }
  const style = objectOf(row.authority_response_style);
  if (style) {
    if (typeof style.tone === 'string' && style.tone) parts.push(`Response tone: ${style.tone}.`);
    const required = listOf(style.requiredElements);
    if (required.length) parts.push(`Required elements: ${required.join(', ')}.`);
  }
  return parts.join('\n\n');
}

/** Strict on populated runtime restrictions: corrupt policy is never no policy. */
export function approvalBindingsOf(value: unknown): SkillApprovalBinding[] {
  if (value == null) return [];
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed) || parsed.length > 12) throw new OrgSkillRefusal(409, 'INVALID_RULE_POLICY', 'The standing approval rules could not be verified.');
  return parsed.map(binding => {
    if (!binding || binding.policyType !== 'requires_approval' || binding.enforcement !== 'mandatory' ||
        typeof binding.toolName !== 'string' || ['execute_platform_command', 'run_agent'].includes(binding.toolName) ||
        !Object.prototype.hasOwnProperty.call(TOOL_REGISTER, binding.toolName) ||
        typeof binding.description !== 'string' || binding.description.trim().length < 8 || binding.description.length > 600) {
      throw new OrgSkillRefusal(409, 'INVALID_RULE_POLICY', 'The standing approval rules could not be verified.');
    }
    return { policyType: 'requires_approval', enforcement: 'mandatory', toolName: binding.toolName, description: binding.description };
  });
}

function sourceAuditEventOf(metadata: unknown): string | null {
  const source = objectOf(objectOf(metadata)?.standingRule)?.sourceAuditEventId;
  return typeof source === 'string' ? source.toLowerCase() : null;
}

const RULE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ruleReference = z.object({ bundleId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/), version: z.number().int().positive() }).strict();
const storedRuleSchema = z.object({ schemaVersion: z.literal(1), level: z.enum(['soft', 'standing', 'hard_gate']),
  state: z.enum(['active', 'revoked', 'superseded']), scope: z.enum(['tenant', 'project']),
  conflictKey: z.string().regex(/^[a-z][a-z0-9._-]{2,79}$/), sourceAuditEventId: z.string().uuid(),
  sourceInteractionId: z.string().uuid(), supersedes: z.array(ruleReference).max(12), createdAt: z.string().datetime(),
  revokedBy: z.number().int().positive().optional(), revokedAt: z.string().datetime().optional(),
}).strict();

export function standingRuleOf(metadata: unknown): StandingRuleRecord | null {
  const raw = objectOf(objectOf(metadata)?.standingRule);
  if (!raw) return null;
  if (!Object.prototype.hasOwnProperty.call(raw, 'schemaVersion') && Object.keys(raw).every(key => key === 'sourceAuditEventId')) return null;
  const parsed = storedRuleSchema.safeParse(raw);
  if (!parsed.success) throw new OrgSkillRefusal(409, 'INVALID_RULE_RECORD', 'The stored correction rule could not be verified.');
  return parsed.data;
}
const positiveId = (value: unknown): boolean => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const bundleProject = (row: Record<string, unknown>): number | null => row.project_id == null ? null : Number(row.project_id);

function unsupportedSource(): never {
  throw new OrgSkillRefusal(422, 'RULE_SOURCE_SCOPE_UNVERIFIED', 'Choose a recorded correction whose organization or project scope can be verified.');
}

function verifyCorrectionBasis(event: Record<string, unknown>, row: Record<string, unknown>, organizationId: number): void {
  const basis = objectOf(event.new_values);
  const projectId = row.project_id == null ? null : Number(row.project_id);
  if (basis?.correctionSha256 !== createHash('sha256').update(String(row.correction_text)).digest('hex') ||
    basis?.interactionId !== event.record_id || Number(basis?.actorUserId) !== Number(row.user_id) ||
    Number(basis?.organizationId) !== organizationId || basis?.projectId !== projectId) unsupportedSource();
}
async function humanCorrectionProject(client: SkillReadClient, organizationId: number, event: Record<string, unknown>): Promise<number | null> {
  if (event.action !== 'ana_correction.recorded' || typeof event.record_id !== 'string' || !RULE_UUID.test(event.record_id)) unsupportedSource();
  const correction = await client.query(`SELECT project_id,user_id,correction_text,user_corrected FROM intelligence.ana_interactions
    WHERE id=$1 AND organization_id=$2`, [event.record_id, organizationId]);
  const row = correction.rows[0];
  if (correction.rows.length !== 1 || row.user_corrected !== true || !positiveId(row.user_id) || Number(row.user_id) !== Number(event.user_id) ||
    typeof row.correction_text !== 'string' || !row.correction_text.trim()) unsupportedSource();
  verifyCorrectionBasis(event, row, organizationId);
  return row.project_id == null ? null : Number(row.project_id);
}

/** Resolve only the event schemas whose writers establish their actual scope. */
async function sourceProjectOf(client: SkillReadClient, organizationId: number, event: Record<string, unknown>): Promise<number | null> {
  switch (event.table_name) {
    case 'intelligence.ana_interactions': return humanCorrectionProject(client, organizationId, event);
    case 'organization_skill_settings':
      if (!['ana_skill.library_enabled', 'ana_skill.library_disabled'].includes(String(event.action))) unsupportedSource();
      return null;
    case 'account_skill_bundles': {
      if (!['ana_skill.created', 'ana_skill.updated'].includes(String(event.action))) unsupportedSource();
      const owner = await client.query('SELECT project_id FROM account_skill_bundles WHERE bundle_id = $1 AND organization_id = $2', [event.record_id, organizationId]);
      if (owner.rows.length !== 1) unsupportedSource();
      return bundleProject(owner.rows[0]);
    }
    case 'project_skill_settings': {
      if (!['ana_skill.project_deployed', 'ana_skill.project_turned_off', 'ana_skill.project_cleared'].includes(String(event.action))) unsupportedSource();
      const projectId = objectOf(event.new_values)?.projectId;
      if (typeof projectId !== 'number' || typeof event.record_id !== 'string' || !event.record_id.startsWith(`${projectId}:`)) unsupportedSource();
      return projectId;
    }
    default: return unsupportedSource();
  }
}

/** Provenance is checked on the same executor as the guarded write or call. */
async function validateRuleSource(client: SkillReadClient, organizationId: number, projectId: number | null, sourceAuditEventId: string): Promise<string | null> {
  const source = await client.query(
    'SELECT id, table_name, record_id, action, user_id, new_values FROM audit_logs WHERE id = $1 AND tenant_id = $2',
    [sourceAuditEventId, organizationId],
  );
  const event = source.rows[0];
  if (source.rows.length !== 1 || event.id !== sourceAuditEventId) {
    throw new OrgSkillRefusal(422, 'RULE_SOURCE_NOT_FOUND', 'The source audit record is not available in this organization.');
  }
  if (!positiveId(event.user_id)) throw new OrgSkillRefusal(422, 'RULE_SOURCE_ACTOR_UNVERIFIED', 'The correction source needs its recorded actor.');
  const sourceProject = await sourceProjectOf(client, organizationId, event);
  if (sourceProject !== null && (!positiveId(sourceProject) || sourceProject !== projectId)) {
    throw new OrgSkillRefusal(422, 'RULE_SOURCE_SCOPE_MISMATCH', 'A project correction can only govern that project; it cannot govern another project or the whole organization.');
  }
  return event.table_name === 'intelligence.ana_interactions' ? String(event.record_id) : null;
}

function assertProjectTools(bindings: SkillApprovalBinding[], projectId: number | null): void {
  if (projectId !== null && bindings.some(binding => !(PROJECT_SKILL_APPROVAL_TOOLS as readonly string[]).includes(binding.toolName))) {
    throw new OrgSkillRefusal(422, 'PROJECT_RULE_TOOL_UNSUPPORTED', 'This action does not yet have a verified project target for a mandatory project rule.');
  }
}

async function authorizeRuleHuman(client: SkillTxClient, organizationId: number, projectId: number | null, actor: SkillActor): Promise<void> {
  const { readCsrProjectActor } = await import('./csr/project-scope.js');
  const { GOVERNED_WRITE_ROLES } = await import('../middleware/orgMembership.js');
  const current = await readCsrProjectActor(client, organizationId, actor.userId, { forShare: true }).catch(error => {
    if (error?.status === 403) throw new OrgSkillRefusal(403, 'RULE_MEMBERSHIP_REQUIRED', 'Current active organization membership is required to manage rules.');
    throw error;
  });
  if (projectId === null) {
    if (!['admin', 'owner', 'super_admin'].includes(String(current.role))) throw new OrgSkillRefusal(403, 'RULE_ADMIN_REQUIRED', 'A current organization administrator must manage its rules.');
    return;
  }
  if (!GOVERNED_WRITE_ROLES.has(String(current.role))) throw new OrgSkillRefusal(403, 'RULE_WRITE_DENIED', 'Current project write permission is required to manage its rules.');
  const parent = await client.query('SELECT id,status FROM projects WHERE id=$1 AND organization_id=$2 FOR UPDATE', [projectId, organizationId]);
  const { canAccessReportProject } = await import('./report-os/project-access.js');
  if (parent.rows.length !== 1 || ['archived', 'deleted'].includes(String(parent.rows[0].status)) ||
    !await canAccessReportProject(organizationId, current, projectId, client, { forWrite: true })) {
    throw new OrgSkillRefusal(403, 'RULE_PROJECT_DENIED', 'Current project write permission is required to manage its rules.');
  }
}

function protectExistingApprovalActions(previous: Record<string, unknown> | undefined, fields: OrgSkillFields,
  bindings: SkillApprovalBinding[], priorRule: StandingRuleRecord | null): void {
  const priorBindings = approvalBindingsOf(previous?.policy_bindings);
  if (priorBindings.some(prior => !bindings.some(binding => binding.toolName === prior.toolName))) {
    throw new OrgSkillRefusal(409, 'RULE_ACTION_REMOVAL_REFUSED', 'A protected action cannot disappear through a method edit. Revoke its sourced rule explicitly.');
  }
  if (!priorRule && priorBindings.length && previous?.status === 'active' && fields.status !== 'active' && !fields.standingRule) {
    throw new OrgSkillRefusal(409, 'LEGACY_GATE_MIGRATION_REQUIRED', 'Record an actual correction and migrate this approval guard before explicitly revoking it.');
  }
}

function assertRuleTransition(requested: StandingRuleInput | StandingRuleRecord, prior: StandingRuleRecord | null): void {
  if (!prior) return;
  if (prior.state !== 'active') throw new OrgSkillRefusal(409, 'RULE_RETIRED', 'A revoked or superseded rule stays on the record. Create a new sourced rule.');
  if (prior.level === 'hard_gate' && requested.level !== 'hard_gate') throw new OrgSkillRefusal(409, 'RULE_DEMOTION_REFUSED', 'A hard gate cannot be softened by a method edit. Revoke it explicitly with a human reason.');
  if (requested.supersedes && prior.supersedes.some(ref => !requested.supersedes!.some(next => next.bundleId === ref.bundleId && next.version === ref.version))) {
    throw new OrgSkillRefusal(409, 'RULE_LINEAGE_IMMUTABLE', 'Recorded supersession references remain part of the rule history.');
  }
}
function assertActiveRuleStatus(requested: StandingRuleInput | StandingRuleRecord, fields: OrgSkillFields, previous?: Record<string, unknown>): void {
  if (requested.state !== 'active') return;
  if (fields.status === 'archived' || (previous?.status === 'active' && fields.status !== 'active')) {
    throw new OrgSkillRefusal(422, 'RULE_REVOKE_EXPLICIT', 'An active rule must be revoked explicitly before it stops governing work.');
  }
}

async function resolveRuleSource(client: SkillTxClient, organizationId: number, fields: OrgSkillFields,
  context: { projectId: number | null; actor: SkillActor; previousMetadata?: unknown }) {
  let sourceAuditEventId = fields.sourceAuditEventId === undefined ? sourceAuditEventOf(context.previousMetadata) : fields.sourceAuditEventId?.toLowerCase() ?? null;
  if (fields.correction) {
    if (fields.sourceAuditEventId) throw new OrgSkillRefusal(422, 'RULE_SOURCE_AMBIGUOUS', 'Choose a recorded correction or capture a new one.');
    const { recordAuditedHumanCorrection } = await import('./intelligence/ana-failure-learning.js');
    const captured = await recordAuditedHumanCorrection({ organizationId, projectId: context.projectId ?? undefined, userId: context.actor.userId,
      agency: fields.correction.agency, documentType: fields.correction.documentType, intent: fields.correction.intent,
      outcome: 'edited', userCorrected: true, correctionText: fields.correction.text }, client);
    sourceAuditEventId = captured.sourceAuditEventId;
  }
  if (!sourceAuditEventId) return { sourceAuditEventId: null, sourceInteractionId: null };
  if (!RULE_UUID.test(sourceAuditEventId)) throw new OrgSkillRefusal(422, 'RULE_SOURCE_REQUIRED', 'A standing rule needs a valid recorded correction source.');
  return { sourceAuditEventId, sourceInteractionId: await validateRuleSource(client, organizationId, context.projectId, sourceAuditEventId) };
}

function newStandingRule(requested: StandingRuleInput | StandingRuleRecord, prior: StandingRuleRecord | null,
  source: { sourceAuditEventId: string | null; sourceInteractionId: string | null }, projectId: number | null, actor: SkillActor): StandingRuleRecord {
  if (!source.sourceAuditEventId || !source.sourceInteractionId) throw new OrgSkillRefusal(422, 'HUMAN_CORRECTION_REQUIRED', 'This rule needs an actual recorded human correction and its source audit event.');
  return { schemaVersion: 1, level: requested.level, state: requested.state, scope: projectId === null ? 'tenant' : 'project',
    conflictKey: requested.conflictKey, sourceAuditEventId: source.sourceAuditEventId, sourceInteractionId: source.sourceInteractionId,
    supersedes: requested.supersedes ?? prior?.supersedes ?? [], createdAt: prior?.createdAt ?? new Date().toISOString(),
    ...(requested.state === 'revoked' ? { revokedBy: actor.userId, revokedAt: new Date().toISOString() } : {}) };
}
async function ruleMetadata(client: SkillTxClient, organizationId: number, fields: OrgSkillFields, actor: SkillActor, previous?: Record<string, unknown>) {
  const previousMetadata = previous?.metadata;
  const bindings = approvalBindingsOf(fields.policyBindings ?? previous?.policy_bindings);
  const owningProject = previous ? bundleProject(previous) : fields.projectId;
  const priorRule = standingRuleOf(previousMetadata);
  const requested = fields.standingRule ?? priorRule;
  if (requested) {
    await authorizeRuleHuman(client, organizationId, owningProject, actor);
    assertRuleTransition(requested, priorRule);
    assertActiveRuleStatus(requested, fields, previous);
    if ((requested.level === 'hard_gate') !== (bindings.length > 0)) throw new OrgSkillRefusal(422, 'RULE_GATE_BINDING_REQUIRED', 'A hard gate needs mandatory approval actions; softer rules cannot carry hidden approval gates.');
  } else if (fields.correction) throw new OrgSkillRefusal(422, 'RULE_REQUIRED', 'Choose how the recorded correction will govern the work.');
  protectExistingApprovalActions(previous, fields, bindings, priorRule);
  assertProjectTools(bindings, owningProject);
  const source = await resolveRuleSource(client, organizationId, fields, { projectId: owningProject, actor, previousMetadata });
  if (bindings.length && !source.sourceAuditEventId) throw new OrgSkillRefusal(422, 'RULE_SOURCE_REQUIRED', 'A standing approval rule needs its recorded source in this organization.');
  const metadata = { ...(objectOf(previousMetadata) ?? {}), standingRule: source.sourceAuditEventId ? { sourceAuditEventId: source.sourceAuditEventId } as Record<string, unknown> : null };
  if (!requested) return { bindings, metadata, standingRule: null };
  const standingRule = newStandingRule(requested, priorRule, source, owningProject, actor);
  metadata.standingRule = standingRule as unknown as Record<string, unknown>;
  return { bindings, metadata, standingRule };
}

function assertStoredRuleIdentity(rule: StandingRuleRecord | null, row: Record<string, unknown>): void {
  if (rule && (!positiveId(row.id) || !positiveId(row.version) || !['draft','active','locked','archived'].includes(String(row.status)) ||
    rule.scope !== (row.project_id == null ? 'tenant' : 'project'))) {
    throw new OrgSkillRefusal(409, 'INVALID_RULE_RECORD', 'The stored rule identity and scope could not be verified.');
  }
}

function toRecord(row: Record<string, unknown>): OrgSkillRecord {
  const mode = row.extension_mode === 'addendum' || row.extension_mode === 'replace' ? row.extension_mode : null;
  const status = String(row.status ?? 'draft');
  const standingRuleRecord = standingRuleOf(row.metadata);
  const libraryReceipt = libraryReceiptOf(row);
  assertStoredRuleIdentity(standingRuleRecord, row);
  return {
    ...(libraryReceipt ? { libraryReceipt } : {}),
    standingRuleRecord,
    id: Number(row.id),
    policyBindings: approvalBindingsOf(row.policy_bindings),
    sourceAuditEventId: sourceAuditEventOf(row.metadata),
    bundleId: String(row.bundle_id),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    instructions: instructionsOfBundle(row),
    disciplines: listOf(row.module_types),
    useCases: listOf(row.work_types),
    segments: listOf(row.segments),
    therapeuticAreas: listOf(row.therapeutic_areas),
    regions: listOf(row.regulatory_regions),
    submissionTypes: listOf(row.submission_types),
    surfaces: listOf(row.surfaces),
    documentTypes: listOf(row.document_types),
    triggers: listOf(row.triggers),
    tools: listOf(row.tool_names),
    extendsSkillKey: typeof row.extends_skill_key === 'string' ? row.extends_skill_key : null,
    extensionMode: mode,
    status: (['draft', 'active', 'locked', 'archived'].includes(status) ? status : 'draft') as OrgSkillRecord['status'],
    projectId: row.project_id == null ? null : Number(row.project_id),
    version: Number(row.version ?? 1),
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : null,
  };
}

/** The organization's skills. Archived ones only when asked for (Settings' history). */
export async function listOrgSkills(
  client: SkillReadClient,
  organizationId: number,
  options: { includeArchived?: boolean; projectId?: number | null } = {},
): Promise<OrgSkillRecord[]> {
  const { rows } = await client.query(
    `SELECT id, bundle_id, name, description, bundle_type, prompt_fragments, evidence_preferences,
              authority_response_style, module_types, work_types, submission_types, regulatory_regions,
              segments, therapeutic_areas, surfaces, document_types, triggers, tool_names,
              extends_skill_key, extension_mode, project_id, status, version, updated_at, policy_bindings, metadata FROM account_skill_bundles
      WHERE organization_id = $1 AND ($2::boolean OR status <> 'archived' OR metadata->'standingRule'->>'schemaVersion'='1')
        AND (NOT $3::boolean OR project_id IS NULL OR project_id=$4::integer)
      ORDER BY name, id`,
    [organizationId, options.includeArchived === true, options.projectId !== undefined, options.projectId ?? null],
  );
  await verifyReviewedLibraryRows(rows);
  return rows.map(toRecord);
}

const libraryReceiptSchema = z.object({ schemaVersion: z.literal(1), libraryVersionId: z.string().uuid(),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/), signatureHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
type ReviewedLibrary = Awaited<ReturnType<typeof loadReviewedLearningLibraryArtifact>>;
const issuedLibraryInstalls = new WeakMap<OrgSkillFields, ReviewedLibrary>();
function libraryReceiptOf(row: Record<string, unknown>): ReviewedLearningLibraryReceipt | null {
  const raw = objectOf(row.metadata)?.libraryReceipt;
  if (raw === undefined && !String(row.bundle_id).startsWith('reviewed_learning_')) return null;
  const parsed = libraryReceiptSchema.safeParse(raw);
  if (!parsed.success) throw new AggregateLearningRefusedError();
  return parsed.data;
}
function reviewedLibraryFields(library: ReviewedLibrary): OrgSkillFields {
  return { name: library.name, description: library.description, instructions: library.instructions,
    disciplines: ['quality-systems'], useCases: ['review'], segments: [], therapeuticAreas: [], regions: library.regions,
    submissionTypes: [], surfaces: [], documentTypes: library.documentTypes, triggers: [], tools: [],
    extendsSkillKey: null, extensionMode: null, status: 'active', projectId: null, policyBindings: [], sourceAuditEventId: null };
}
function libraryContentOf(record: Omit<OrgSkillFields, 'status'> & { status: string }) {
  const fields = { ...record } as Record<string, unknown>;
  for (const key of ['status', 'expectedVersion', 'id', 'bundleId', 'version', 'updatedAt', 'libraryReceipt', 'standingRuleRecord']) delete fields[key];
  fields.sourceAuditEventId ??= null;
  return fields;
}
async function verifyReviewedLibraryRows(rows: Array<Record<string, unknown>>): Promise<void> {
  for (const row of rows) {
    const receipt = libraryReceiptOf(row);
    if (!receipt || !['active', 'locked'].includes(String(row.status))) continue;
    const library = await loadReviewedLearningLibraryArtifact(receipt.libraryVersionId);
    const record = toRecord(row);
    if (stableStringify(library.receipt) !== stableStringify(receipt) ||
        stableStringify(libraryContentOf(record)) !== stableStringify(libraryContentOf(reviewedLibraryFields(library)))) {
      throw new AggregateLearningRefusedError();
    }
  }
}

/** A named administrator explicitly installs one verified immutable public library version. */
export async function installReviewedLearningSkill(pool: SkillConnectable, organizationId: number, actor: SkillActor, raw: unknown) {
  const parsed = z.object({ libraryVersionId: z.string().uuid(), expectedArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
    reasonForChange: z.string().trim().min(8).max(2000) }).strict().safeParse(raw);
  if (!parsed.success) throw new AggregateLearningRefusedError(400);
  const library = await loadReviewedLearningLibraryArtifact(parsed.data.libraryVersionId.toLowerCase());
  if (library.receipt.artifactSha256 !== parsed.data.expectedArtifactSha256) throw new AggregateLearningRefusedError(409);
  const fields = reviewedLibraryFields(library);
  issuedLibraryInstalls.set(fields, library);
  return createOrgSkill(pool, organizationId, fields, { actor, reason: parsed.data.reasonForChange });
}
async function installLibraryMetadata(client: SkillTxClient, organizationId: number, actor: SkillActor, fields: OrgSkillFields,
  metadata: Record<string, unknown>): Promise<void> {
  const issued = issuedLibraryInstalls.get(fields);
  if (!issued) return;
  await authorizeRuleHuman(client, organizationId, null, actor);
  const current = await loadReviewedLearningLibraryArtifact(issued.receipt.libraryVersionId);
  if (stableStringify(current) !== stableStringify(issued)) throw new AggregateLearningRefusedError(409);
  const duplicate = await client.query(`SELECT id FROM account_skill_bundles WHERE organization_id=$1
    AND metadata->'libraryReceipt'->>'libraryVersionId'=$2`, [organizationId, current.receipt.libraryVersionId]);
  if (duplicate.rows.length) throw new AggregateLearningRefusedError(409);
  metadata.libraryReceipt = current.receipt;
}

export interface AppliedStandingRule {
  id: number; bundleId: string; version: number; name: string; instructions: string; projectId: number | null;
  rule: StandingRuleRecord;
}

export function standingRuleConflicts(records: readonly OrgSkillRecord[]): RuleConflictDecisionPackage[] {
  const groups = new Map<string, OrgSkillRecord[]>();
  for (const record of records) {
    const rule = record.standingRuleRecord;
    if (!rule || rule.state !== 'active' || !['active','locked'].includes(record.status)) continue;
    const key = `${record.projectId ?? 'tenant'}:${rule.conflictKey}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return [...groups.values()].filter(group => group.length > 1).map(group => ({
    conflictKey: group[0].standingRuleRecord!.conflictKey,
    ruleRefs: group.map(record => ({ id: record.id, bundleId: record.bundleId, version: record.version,
      projectId: record.projectId, level: record.standingRuleRecord!.level })),
    resolution: 'Explicitly supersede or revoke the conflicting rule.',
  }));
}

async function appliedRulesFromRecords(client: SkillReadClient, organizationId: number, projectId: number | null, records: OrgSkillRecord[]): Promise<AppliedStandingRule[]> {
  const active = records.filter(record => record.standingRuleRecord?.state === 'active' && ['active','locked'].includes(record.status));
  const conflicts = standingRuleConflicts(active);
  if (conflicts.length) throw new OrgSkillRefusal(409, 'RULE_CONFLICT', 'Active rules with the same conflict key need a human decision.', conflicts[0]);
  for (const record of records) if (record.standingRuleRecord) await verifyRecordedRuleVersion(client, organizationId, record);
  const rules: AppliedStandingRule[] = [];
  for (const record of active) {
    const rule = record.standingRuleRecord!;
    if (record.projectId !== null && record.projectId !== projectId) throw new OrgSkillRefusal(403, 'RULE_SCOPE_UNVERIFIED', 'A rule from another project cannot govern this task.');
    const interactionId = await validateRuleSource(client, organizationId, record.projectId, rule.sourceAuditEventId);
    if (interactionId !== rule.sourceInteractionId || !record.instructions.trim() ||
      ((rule.level === 'hard_gate') !== (Boolean(record.policyBindings?.length)))) {
      throw new OrgSkillRefusal(409, 'INVALID_RULE_RECORD', 'The active rule and its correction or approval basis could not be verified.');
    }
    rules.push({ id: record.id, bundleId: record.bundleId, version: record.version, name: record.name,
      instructions: record.instructions, projectId: record.projectId, rule });
  }
  const projectKeys = new Set(rules.filter(rule => rule.projectId !== null && rule.rule.level !== 'hard_gate').map(rule => rule.rule.conflictKey));
  const applied = rules.filter(rule => rule.rule.level === 'hard_gate' || rule.projectId !== null || !projectKeys.has(rule.rule.conflictKey));
  if (applied.reduce((total, rule) => total + rule.instructions.length, 0) > 32000) {
    throw new OrgSkillRefusal(409, 'RULE_CONTEXT_LIMIT', 'The active rules exceed the supported context. Review them before continuing.');
  }
  return applied.sort((a,b) => a.bundleId.localeCompare(b.bundleId));
}

/** A state/level/version flag alone never establishes a human management act. */
async function verifyRecordedRuleVersion(client: SkillReadClient, organizationId: number, record: OrgSkillRecord): Promise<void> {
  const result = await client.query(`SELECT user_id,action,new_values FROM audit_logs
    WHERE tenant_id=$1 AND table_name='account_skill_bundles' AND record_id=$2
      AND new_values->'next'->>'version'=$3 ORDER BY occurred_at DESC,id DESC LIMIT 2`,
    [organizationId, record.bundleId, String(record.version)]);
  const audit = result.rows[0];
  const next = objectOf(objectOf(audit?.new_values)?.next);
  if (result.rows.length !== 1 || !positiveId(audit.user_id) ||
    !['ana_rule.created','ana_rule.promoted','ana_rule.revoked','ana_rule.superseded','ana_skill.updated'].includes(String(audit.action)) ||
    stableStringify(next) !== stableStringify(auditView(record))) {
    throw new OrgSkillRefusal(409, 'RULE_VERSION_UNRECORDED', 'The stored rule differs from its recorded human-managed version. Review the rule ledger before continuing.');
  }
}

export async function loadActiveStandingRules(client: SkillReadClient, organizationId: number, projectId: number | null): Promise<AppliedStandingRule[]> {
  if (!positiveId(organizationId) || (projectId !== null && !positiveId(projectId))) throw new OrgSkillRefusal(403, 'RULE_SCOPE_UNVERIFIED', 'A verified organization and project scope is required.');
  return appliedRulesFromRecords(client, organizationId, projectId, await listOrgSkills(client, organizationId, { projectId }));
}

export interface AlignmentRuleVersion {
  bundleId: string; version: number; level: StandingRuleRecord['level']; state: StandingRuleRecord['state'];
  action: string; occurredAt: string; sourceAuditEventId: string;
}
export interface AlignmentRuleSnapshot {
  rules: AlignmentRuleVersion[];
  issues: Array<{ code: 'conflict' | 'unverified_rule'; refs: Array<{ bundleId: string; version: number }> }>;
}
interface AlignmentRuleWindow { start: string; end: string }

/** Counts and version references only. Never exports instructions, names or correction text to a scheduled notice. */
export async function readAlignmentRuleSnapshot(client: SkillReadClient, organizationId: number, projectId: number | null,
  window?: AlignmentRuleWindow): Promise<AlignmentRuleSnapshot> {
  if (!positiveId(organizationId) || (projectId !== null && !positiveId(projectId))) throw new OrgSkillRefusal(403, 'RULE_SCOPE_UNVERIFIED', 'A verified rule scope is required.');
  const result: AlignmentRuleSnapshot = { rules: [], issues: [] };
  let records: OrgSkillRecord[];
  try { records = (await listOrgSkills(client, organizationId, { includeArchived: true, projectId })).filter(record => record.projectId === projectId && record.standingRuleRecord); }
  catch (error) {
    if (!(error instanceof OrgSkillRefusal)) throw error;
    result.issues.push({ code: 'unverified_rule', refs: [] }); return result;
  }
  records.sort((a,b) => a.bundleId.localeCompare(b.bundleId));
  for (const record of records) await collectAlignmentRule(client, { organizationId,record,window }, result);
  for (const conflict of standingRuleConflicts(records)) result.issues.push({ code: 'conflict', refs: conflict.ruleRefs.map(({ bundleId, version }) => ({ bundleId, version })) });
  return result;
}

async function collectAlignmentRule(client: SkillReadClient,
  input: { organizationId: number; record: OrgSkillRecord; window?: AlignmentRuleWindow }, result: AlignmentRuleSnapshot): Promise<void> {
  const { organizationId,record,window } = input;
  try {
    const checked = await readAlignmentRuleVersion(client, organizationId, record);
    if (!checked) throw new OrgSkillRefusal(409, 'RULE_VERSION_UNRECORDED', 'The recorded rule version could not be verified.');
    result.rules.push(...(window ? await readAlignmentRuleEvents(client, organizationId, record, window) : [checked]));
  } catch (error) {
    if (!(error instanceof OrgSkillRefusal)) throw error;
    result.issues.push({ code: 'unverified_rule', refs: [{ bundleId: record.bundleId, version: record.version }] });
  }
}

async function readAlignmentRuleVersion(client: SkillReadClient, organizationId: number, record: OrgSkillRecord): Promise<AlignmentRuleVersion | null> {
  try {
    await verifyRecordedRuleVersion(client, organizationId, record);
    const rule = record.standingRuleRecord!;
    if (rule.state === 'active') {
      const interactionId = await validateRuleSource(client, organizationId, record.projectId, rule.sourceAuditEventId);
      if (interactionId !== rule.sourceInteractionId) throw new OrgSkillRefusal(409, 'INVALID_RULE_RECORD', 'The correction source could not be verified.');
    }
    const event = await client.query(`SELECT action,occurred_at FROM audit_logs WHERE tenant_id=$1 AND table_name='account_skill_bundles'
      AND record_id=$2 AND new_values->'next'->>'version'=$3 ORDER BY occurred_at DESC,id DESC LIMIT 1`, [organizationId, record.bundleId, String(record.version)]);
    const rawTime = event.rows[0]?.occurred_at;
    const occurredAt = rawTime instanceof Date ? rawTime.toISOString() : new Date(String(rawTime)).toISOString();
    return { bundleId: record.bundleId, version: record.version, level: rule.level, state: rule.state,
      action: String(event.rows[0]?.action), occurredAt, sourceAuditEventId: rule.sourceAuditEventId };
  } catch (error) {
    if (!(error instanceof OrgSkillRefusal)) throw error;
    return null;
  }
}

async function readAlignmentRuleEvents(client: SkillReadClient, organizationId: number, record: OrgSkillRecord, window: AlignmentRuleWindow): Promise<AlignmentRuleVersion[]> {
  const events = await client.query(`SELECT user_id,action,occurred_at,new_values->'next'->>'version' AS version,
    new_values->'next'->'standingRuleRecord' AS rule,new_values->'next'->'projectId' AS project_id
    FROM audit_logs WHERE tenant_id=$1 AND table_name='account_skill_bundles' AND record_id=$2
    AND new_values->'next'->'standingRuleRecord' IS NOT NULL AND occurred_at >= $3::timestamptz AND occurred_at < $4::timestamptz
    ORDER BY occurred_at,id LIMIT 1001`, [organizationId,record.bundleId,window.start,window.end]);
  if (events.rows.length > 1000) throw new OrgSkillRefusal(409, 'RULE_ALIGNMENT_LIMIT', 'The rule history exceeds the supported digest window.');
  const seen = new Set<number>();
  return events.rows.map(event => {
    const version = Number(event.version); const rule = standingRuleOf({ standingRule: event.rule });
    const valid = [positiveId(event.user_id),Number.isSafeInteger(version),version > 0,version <= record.version,!seen.has(version),
      rule?.sourceAuditEventId === record.standingRuleRecord!.sourceAuditEventId,
      rule?.sourceInteractionId === record.standingRuleRecord!.sourceInteractionId,event.project_id === record.projectId,
      ['ana_rule.created','ana_rule.promoted','ana_rule.revoked','ana_rule.superseded','ana_skill.updated'].includes(String(event.action))].every(Boolean);
    if (!rule || !valid) {
      throw new OrgSkillRefusal(409, 'RULE_HISTORY_UNVERIFIED', 'The recorded rule history could not be verified.');
    }
    seen.add(version);
    const occurredAt = event.occurred_at instanceof Date ? event.occurred_at.toISOString() : new Date(String(event.occurred_at)).toISOString();
    return { bundleId: record.bundleId,version,level: rule.level,state: rule.state,action: String(event.action),occurredAt,sourceAuditEventId: rule.sourceAuditEventId };
  });
}

/** Exact references, never inferred textual similarity, dispose an old active rule. */
function assertSupersessionReference(ref: StandingRuleReference, candidates: OrgSkillRecord[], rule: StandingRuleRecord): void {
  const target = candidates.find(record => record.bundleId === ref.bundleId && record.version === ref.version);
  if (!target || target.status === 'locked' || (target.standingRuleRecord?.level === 'hard_gate' && rule.level !== 'hard_gate')) {
    throw new OrgSkillRefusal(409, 'RULE_SUPERSESSION_INVALID', 'A superseded rule must be the current active version in this scope and conflict key. A hard gate must be revoked explicitly before a softer replacement.');
  }
}
async function reconcileRuleWrite(client: SkillTxClient, organizationId: number,
  input: { fields: OrgSkillFields; rule: StandingRuleRecord | null; change: SkillChange; previous?: OrgSkillRecord }): Promise<void> {
  const { fields, rule, change, previous } = input;
  if (!rule || rule.state !== 'active' || fields.status === 'draft') return;
  const rows = await client.query(`SELECT * FROM account_skill_bundles WHERE organization_id=$1
    AND project_id IS NOT DISTINCT FROM $2 AND status IN ('active','locked') ORDER BY id FOR UPDATE`,
    [organizationId, fields.projectId]);
  const candidates = rows.rows.map(toRecord).filter(record => record.id !== previous?.id &&
    record.standingRuleRecord?.state === 'active' && record.standingRuleRecord.conflictKey === rule.conflictKey);
  const priorRefs = previous?.status === 'active' ? previous.standingRuleRecord?.supersedes ?? [] : [];
  const references = rule.supersedes.filter(ref => !priorRefs.some(old => old.bundleId === ref.bundleId && old.version === ref.version));
  if (new Set(rule.supersedes.map(ref => ref.bundleId)).size !== rule.supersedes.length) throw new OrgSkillRefusal(422, 'RULE_SUPERSESSION_INVALID', 'Name each superseded rule once.');
  for (const ref of references) assertSupersessionReference(ref, candidates, rule);
  const unresolved = candidates.filter(record => !references.some(ref => ref.bundleId === record.bundleId && ref.version === record.version));
  if (unresolved.length) throw new OrgSkillRefusal(409, 'RULE_CONFLICT', 'Another active rule has this conflict key. A human decision is required.', {
    conflictKey: rule.conflictKey, ruleRefs: unresolved.map(record => ({ id: record.id, bundleId: record.bundleId,
      version: record.version, projectId: record.projectId, level: record.standingRuleRecord!.level })),
    resolution: 'Explicitly supersede or revoke the conflicting rule.',
  });
  for (const ref of references) {
    const target = candidates.find(record => record.bundleId === ref.bundleId)!;
    const raw = rows.rows.find(row => Number(row.id) === target.id)!;
    const metadata = { ...metadataOfRuleRow(raw), standingRule: { ...target.standingRuleRecord!, state: 'superseded' } };
    const retired = await client.query(`UPDATE account_skill_bundles SET status='archived',metadata=$1::json,
      version=version+1,updated_at=NOW() WHERE id=$2 AND organization_id=$3 RETURNING *`, [JSON.stringify(metadata), target.id, organizationId]);
    await writeChainedAuditRow(client, { tenantId: organizationId, userId: change.actor.userId,
      action: 'ana_rule.superseded', resourceType: 'account_skill_bundles', resourceId: target.bundleId, reason: change.reason,
      details: { previous: auditView(target), next: auditView(toRecord(retired.rows[0])), reason: change.reason } });
  }
}

function metadataOfRuleRow(row: Record<string, unknown>): Record<string, unknown> { return objectOf(row.metadata) ?? {}; }

/** A sourced runtime restriction, independent of prompt skill selection. */
export interface MandatorySkillGate {
  skillId: number;
  bundleId: string;
  version: number;
  projectId: number | null;
  sourceAuditEventId: string;
  toolName: string;
  description: string;
}

function storedGateIdentity(row: Record<string, unknown>, organizationId: number, projectId: number | null) {
  const scopedProject = bundleProject(row);
  if (Number(row.organization_id) !== organizationId || !['active', 'locked'].includes(String(row.status)) ||
      (scopedProject !== null && scopedProject !== projectId)) {
    throw new OrgSkillRefusal(409, 'INVALID_RULE_POLICY', 'The standing approval rule scope could not be verified.');
  }
  const sourceAuditEventId = sourceAuditEventOf(row.metadata);
  if (!positiveId(row.id) || !positiveId(row.version) || typeof row.bundle_id !== 'string' || !row.bundle_id ||
      !sourceAuditEventId || !RULE_UUID.test(sourceAuditEventId)) {
    throw new OrgSkillRefusal(409, 'INVALID_RULE_POLICY', 'The standing approval rules could not be verified.');
  }
  return { id: Number(row.id), version: Number(row.version), scopedProject, sourceAuditEventId, bundleId: row.bundle_id };
}

/**
 * Read the union of tenant and current-project mandatory rules on the trusted
 * executor. Prompt relevance, project skill off/picks and replacement settings
 * never enter this query. Any unreadable or malformed populated rule refuses;
 * it is never converted to an empty rule set.
 */
export async function loadMandatorySkillGates(
  client: SkillReadClient,
  organizationId: number,
  projectId: number | null,
  ownerUserId?: number | null,
): Promise<{ rules: MandatorySkillGate[]; ruleHash: string }> {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0 ||
      (projectId !== null && (!Number.isSafeInteger(projectId) || projectId <= 0))) {
    throw new OrgSkillRefusal(403, 'RULE_SCOPE_UNVERIFIED', 'The standing rules need a verified organization and project scope.');
  }
  const { rows } = await client.query(
    `SELECT *
       FROM account_skill_bundles
      WHERE organization_id = $1 AND (status NOT IN ('draft', 'archived') OR metadata->'standingRule'->>'schemaVersion'='1')
        AND (project_id IS NULL OR project_id = $2)
      ORDER BY bundle_id, id`, [organizationId, projectId],
  );
  await verifyReviewedLibraryRows(rows);
  await appliedRulesFromRecords(client, organizationId, projectId, rows.map(toRecord));
  const rules: MandatorySkillGate[] = [];
  const checkedSources = new Set<string>();
  for (const row of rows) {
    if (['draft','archived'].includes(String(row.status))) continue;
    const standingRule = standingRuleOf(row.metadata);
    if (standingRule && standingRule.state !== 'active') continue;
    const bindings = approvalBindingsOf(row.policy_bindings);
    if (!bindings.length) continue;
    const { id, version, scopedProject, sourceAuditEventId, bundleId } = storedGateIdentity(row, organizationId, projectId);
    assertProjectTools(bindings, scopedProject);
    const sourceKey = `${sourceAuditEventId}:${scopedProject ?? 'tenant'}`;
    if (!checkedSources.has(sourceKey)) {
      await validateRuleSource(client, organizationId, scopedProject, sourceAuditEventId);
      checkedSources.add(sourceKey);
    }
    for (const binding of bindings) rules.push({
      skillId: id, bundleId, version, projectId: scopedProject,
      sourceAuditEventId, toolName: binding.toolName, description: binding.description,
    });
  }
  const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
  rules.sort((a, b) => compare(a.bundleId, b.bundleId) || compare(a.toolName, b.toolName) || compare(a.description, b.description));
  const privateRuleHash = await appendPrivateOwnerGates(client, organizationId, ownerUserId, rules);
  const ruleHash = createHash('sha256').update(JSON.stringify({ organizationId, projectId, rules, privateRuleHash })).digest('hex');
  return { rules, ruleHash };
}

/** Private gates export opaque references, never owner-authored wording. */
async function appendPrivateOwnerGates(client: SkillReadClient, organizationId: number, ownerUserId: number | null | undefined,
  rules: MandatorySkillGate[]): Promise<string | null> {
  const scope = getTenantScope();
  const ownerId = ownerUserId ?? (scope?.tenantId === String(organizationId) ? scope.accountId : null);
  if (ownerId == null) {
    if (scope?.source === 'request') throw new OrgSkillRefusal(403, 'PRIVATE_OWNER_REQUIRED', 'A verified account is required before checking private approval rules.');
    return null;
  }
  const { readPrivateUserRuleGates } = await import('./ana-context-router.js');
  const privateRules = await readPrivateUserRuleGates(client, organizationId, ownerId);
  for (const rule of privateRules.rules) rules.push({ skillId: rule.profileId, bundleId: `user_rule_${rule.ruleId}`,
    version: rule.version, projectId: null, sourceAuditEventId: rule.sourceAuditEventId, toolName: rule.toolName,
    description: 'Your private approval rule requires your explicit review.' });
  return privateRules.ruleHash;
}

export interface SkillSettingRecord {
  skillKey: string;
  enabled: boolean;
  reason: string;
  updatedById: number | null;
  updatedAt: string | null;
}

/** An administrator's on/off per library skill. No row: the skill is on. */
export async function readSkillSettings(client: SkillReadClient, organizationId: number): Promise<Map<string, SkillSettingRecord>> {
  const { rows } = await client.query(
    `SELECT skill_key, enabled, reason, updated_by_id, updated_at
       FROM organization_skill_settings WHERE organization_id = $1`,
    [organizationId],
  );
  return new Map(
    rows.map(r => [
      String(r.skill_key),
      {
        skillKey: String(r.skill_key),
        enabled: r.enabled === true,
        reason: String(r.reason ?? ''),
        updatedById: r.updated_by_id == null ? null : Number(r.updated_by_id),
        updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : null,
      },
    ]),
  );
}

/** Thrown for a change the store refuses; the route maps `status`. */
export class OrgSkillRefusal extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly decisionPackage?: RuleConflictDecisionPackage,
  ) {
    super(message);
    this.name = 'OrgSkillRefusal';
  }
}

/** One governed write: the change and its audit row commit together or not at all. */
export async function inTransaction<T>(pool: SkillConnectable, work: (client: SkillTxClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let committing = false;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    committing = true;
    await client.query('COMMIT');
    return result;
  } catch (err) {
    if (committing) {
      client.release(err instanceof Error ? err : new Error('Skill commit outcome unknown'));
      throw new OrgSkillRefusal(500, 'OUTCOME_UNKNOWN', 'The change could not be confirmed. Re-read the rule before trying again.');
    }
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

function fragmentsOf(instructions: string): string {
  return JSON.stringify([{ role: 'instruction', content: instructions.trim(), priority: 5 }]);
}

/** Why a change was made and who made it: every governed write carries both. */
export interface SkillChange {
  reason: string;
  actor: SkillActor;
}

function auditView(r: OrgSkillRecord): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...r };
  delete rest.id;
  delete rest.updatedAt;
  return rest;
}

/** A unique-index refusal means a second skill would replace the same library skill. */
function isOneReplacementViolation(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === '23505' && e?.constraint === 'acct_bundle_one_replacement';
}

/** Create an organization skill. Returns it as stored. */
export async function createOrgSkill(
  pool: SkillConnectable,
  organizationId: number,
  fields: OrgSkillFields,
  change: SkillChange,
): Promise<OrgSkillRecord> {
  const { reason, actor } = change;
  const library = issuedLibraryInstalls.get(fields);
  const bundleId = library ? `reviewed_learning_${organizationId}_${library.receipt.libraryVersionId}` : generateId('bundle');
  try {
    return await inTransaction(pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(3117,$1::integer)', [organizationId]);
      const rules = await ruleMetadata(client, organizationId, fields, actor);
      await installLibraryMetadata(client, organizationId, actor, fields, rules.metadata);
      await reconcileRuleWrite(client, organizationId, { fields, rule: rules.standingRule, change });
      const { rows } = await client.query(
        `INSERT INTO account_skill_bundles
           (bundle_id, organization_id, name, description, bundle_type, module_types, work_types,
            submission_types, regulatory_regions, segments, therapeutic_areas, surfaces, document_types,
            triggers, tool_names, extends_skill_key, extension_mode, prompt_fragments, policy_bindings,
            version, status, created_by_id, project_id, created_at, updated_at, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::json, $7::json, $8::json, $9::json, $10::jsonb, $11::jsonb, $12::jsonb,
                 $13::jsonb, $14::jsonb, $15::jsonb, $16, $17, $18::json, $22::json, 1, $19, $20, $21, NOW(), NOW(), $23::json)
         RETURNING id, bundle_id, name, description, bundle_type, prompt_fragments, evidence_preferences,
              authority_response_style, module_types, work_types, submission_types, regulatory_regions,
              segments, therapeutic_areas, surfaces, document_types, triggers, tool_names,
              extends_skill_key, extension_mode, project_id, status, version, updated_at, policy_bindings, metadata`,
        [
          bundleId,
          organizationId,
          fields.name,
          fields.description,
          fields.useCases[0] ?? 'skill',
          JSON.stringify(fields.disciplines),
          JSON.stringify(fields.useCases),
          JSON.stringify(fields.submissionTypes),
          JSON.stringify(fields.regions),
          JSON.stringify(fields.segments),
          JSON.stringify(fields.therapeuticAreas),
          JSON.stringify(fields.surfaces),
          JSON.stringify(fields.documentTypes),
          JSON.stringify(fields.triggers),
          JSON.stringify(fields.tools),
          fields.extendsSkillKey,
          fields.extensionMode,
          fragmentsOf(fields.instructions),
          rules.standingRule?.state === 'revoked' ? 'archived' : fields.status,
          actor.userId,
          fields.projectId,
          JSON.stringify(rules.bindings),
          JSON.stringify(rules.metadata),
        ],
      );
      const created = toRecord(rows[0]);
      await writeChainedAuditRow(client, {
        tenantId: organizationId,
        userId: actor.userId,
        action: rules.standingRule ? 'ana_rule.created' : 'ana_skill.created',
        resourceType: 'account_skill_bundles',
        resourceId: created.bundleId,
        reason,
        ipAddress: actor.ipAddress ?? undefined,
        userAgent: actor.userAgent ?? undefined,
        details: { previous: null, next: auditView(created), reason },
      });
      await appendEvent(
        {
          organizationId,
          eventType: 'account_skill_bundle_created',
          skillBundleId: created.id,
          targetType: 'skill_bundle',
          targetId: created.bundleId,
          newValue: { name: created.name, status: created.status, version: created.version },
          description: `AnA skill created: ${created.name}`,
          details: { reason },
          actorId: actor.userId,
          actorName: actor.name ?? undefined,
        },
        client,
      );
      return created;
    });
  } catch (err) {
    if (isOneReplacementViolation(err)) {
      throw new OrgSkillRefusal(409, 'ALREADY_REPLACED', 'Another skill of this organization already replaces that library skill.');
    }
    throw err;
  }
}

function assertSkillUpdateAllowed(previous: OrgSkillRecord, fields: OrgSkillFields): void {
  if (previous.libraryReceipt) {
    if (stableStringify(libraryContentOf(previous)) !== stableStringify(libraryContentOf(fields))) throw new AggregateLearningRefusedError(409);
  }
  if ((previous.standingRuleRecord || fields.standingRule || fields.expectedVersion !== undefined) && fields.expectedVersion !== previous.version) {
    throw new OrgSkillRefusal(409, 'RULE_VERSION_CHANGED', 'Re-read the current rule version before changing it.');
  }
  if (previous.status === 'locked') throw new OrgSkillRefusal(409, 'LOCKED', 'A locked skill cannot be changed.');
  if (previous.status === 'archived' && fields.status !== 'draft') throw new OrgSkillRefusal(409, 'ARCHIVED', 'An archived skill can only be restored as a draft.');
}
function skillUpdateAction(rule: StandingRuleRecord | null, previous: OrgSkillRecord): string {
  if (rule?.state === 'revoked') return 'ana_rule.revoked';
  if (rule?.level === 'hard_gate' && previous.standingRuleRecord?.level !== 'hard_gate') return 'ana_rule.promoted';
  return 'ana_skill.updated';
}

/**
 * Change an organization skill. A locked skill refuses every change; an
 * archived one refuses everything but being restored to a draft. The version
 * rises with each change, and the audit row holds the skill before and after.
 * The project a skill was written for is fixed at creation and not changed
 * here: who may change a skill depends on it, so moving it would move that.
 */
export async function updateOrgSkill(
  pool: SkillConnectable,
  organizationId: number,
  id: number,
  fields: OrgSkillFields,
  change: SkillChange,
): Promise<OrgSkillRecord> {
  const { reason, actor } = change;
  try {
    return await inTransaction(pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(3117,$1::integer)', [organizationId]);
      const before = await client.query(
        `SELECT id, bundle_id, name, description, bundle_type, prompt_fragments, evidence_preferences,
              authority_response_style, module_types, work_types, submission_types, regulatory_regions,
              segments, therapeutic_areas, surfaces, document_types, triggers, tool_names,
              extends_skill_key, extension_mode, project_id, status, version, updated_at, policy_bindings, metadata FROM account_skill_bundles
          WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [id, organizationId],
      );
      if (before.rows.length === 0) throw new OrgSkillRefusal(404, 'NOT_FOUND', 'That skill does not exist in this organization.');
      const previous = toRecord(before.rows[0]);
      assertSkillUpdateAllowed(previous, fields);
      const scopedFields = { ...fields, projectId: previous.projectId };
      const rules = await ruleMetadata(client, organizationId, scopedFields, actor, before.rows[0]);
      await reconcileRuleWrite(client, organizationId, { fields: scopedFields, rule: rules.standingRule, change, previous });
      const { rows } = await client.query(
        `UPDATE account_skill_bundles SET
            name = $3, description = $4, bundle_type = $5, module_types = $6::json, work_types = $7::json,
            submission_types = $8::json, regulatory_regions = $9::json, segments = $10::jsonb,
            therapeutic_areas = $11::jsonb, surfaces = $12::jsonb, document_types = $13::jsonb,
            triggers = $14::jsonb, tool_names = $15::jsonb, extends_skill_key = $16, extension_mode = $17,
            prompt_fragments = $18::json, status = $19, policy_bindings = $20::json, metadata = $21::json, version = version + 1, updated_at = NOW()
          WHERE id = $1 AND organization_id = $2
          RETURNING id, bundle_id, name, description, bundle_type, prompt_fragments, evidence_preferences,
              authority_response_style, module_types, work_types, submission_types, regulatory_regions,
              segments, therapeutic_areas, surfaces, document_types, triggers, tool_names,
              extends_skill_key, extension_mode, project_id, status, version, updated_at, policy_bindings, metadata`,
        [
          id,
          organizationId,
          fields.name,
          fields.description,
          fields.useCases[0] ?? 'skill',
          JSON.stringify(fields.disciplines),
          JSON.stringify(fields.useCases),
          JSON.stringify(fields.submissionTypes),
          JSON.stringify(fields.regions),
          JSON.stringify(fields.segments),
          JSON.stringify(fields.therapeuticAreas),
          JSON.stringify(fields.surfaces),
          JSON.stringify(fields.documentTypes),
          JSON.stringify(fields.triggers),
          JSON.stringify(fields.tools),
          fields.extendsSkillKey,
          fields.extensionMode,
          fragmentsOf(fields.instructions),
          rules.standingRule?.state === 'revoked' ? 'archived' : fields.status,
          JSON.stringify(rules.bindings),
          JSON.stringify(rules.metadata),
        ],
      );
      const next = toRecord(rows[0]);
      await verifyReviewedLibraryRows(rows);
      await writeChainedAuditRow(client, {
        tenantId: organizationId,
        userId: actor.userId,
        action: skillUpdateAction(rules.standingRule, previous),
        resourceType: 'account_skill_bundles',
        resourceId: next.bundleId,
        reason,
        ipAddress: actor.ipAddress ?? undefined,
        userAgent: actor.userAgent ?? undefined,
        details: { previous: auditView(previous), next: auditView(next), reason },
      });
      await appendEvent(
        {
          organizationId,
          eventType: 'account_skill_bundle_updated',
          skillBundleId: next.id,
          targetType: 'skill_bundle',
          targetId: next.bundleId,
          previousValue: { status: previous.status, version: previous.version },
          newValue: { status: next.status, version: next.version },
          description: `AnA skill updated: ${next.name}`,
          details: { reason },
          actorId: actor.userId,
          actorName: actor.name ?? undefined,
        },
        client,
      );
      return next;
    });
  } catch (err) {
    if (isOneReplacementViolation(err)) {
      throw new OrgSkillRefusal(409, 'ALREADY_REPLACED', 'Another skill of this organization already replaces that library skill.');
    }
    throw err;
  }
}

/**
 * Turn a platform-library skill on or off for the organization. Writing the
 * value it already has records nothing and changes nothing.
 */
export async function setLibrarySkillEnabled(
  pool: SkillConnectable,
  organizationId: number,
  skillKey: string,
  enabled: boolean,
  change: SkillChange,
): Promise<{ changed: boolean; enabled: boolean }> {
  const { reason, actor } = change;
  return inTransaction(pool, async client => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('ana_skill_setting:' || $1::text || ':' || $2::text))`, [
      organizationId,
      skillKey,
    ]);
    const { rows } = await client.query(
      `SELECT enabled FROM organization_skill_settings WHERE organization_id = $1 AND skill_key = $2`,
      [organizationId, skillKey],
    );
    const wasEnabled = rows.length === 0 ? true : rows[0].enabled === true;
    if (wasEnabled === enabled) return { changed: false, enabled };
    await client.query(
      `INSERT INTO organization_skill_settings (organization_id, skill_key, enabled, reason, updated_by_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (organization_id, skill_key) DO UPDATE SET
         enabled = EXCLUDED.enabled, reason = EXCLUDED.reason,
         updated_by_id = EXCLUDED.updated_by_id, updated_at = NOW()`,
      [organizationId, skillKey, enabled, reason, actor.userId],
    );
    await writeChainedAuditRow(client, {
      tenantId: organizationId,
      userId: actor.userId,
      action: enabled ? 'ana_skill.library_enabled' : 'ana_skill.library_disabled',
      resourceType: 'organization_skill_settings',
      resourceId: skillKey,
      reason,
      ipAddress: actor.ipAddress ?? undefined,
      userAgent: actor.userAgent ?? undefined,
      details: { skillKey, previousEnabled: wasEnabled, enabled, reason },
    });
    return { changed: true, enabled };
  });
}

// ── Term Dictionary CRUD ─────────────────────────────────────────────────────

export interface TermInput {
  organizationId: number;
  bundleId?: number;
  term: string;
  definition?: string;
  context?: string;
  alternatives?: string[];
  doNotUse?: string[];
  category?: string;
  submissionTypes?: string[];
  regulatoryRegions?: string[];
  actorId?: number;
  actorName?: string;
}

export async function addTerm(input: TermInput): Promise<Record<string, unknown>> {
  const result = await pool.query(
    `INSERT INTO account_term_dictionary
     (organization_id, bundle_id, term, definition, context, alternatives,
      do_not_use, category, submission_types, regulatory_regions,
      status, created_by_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11, NOW(), NOW())
     RETURNING *`,
    [
      input.organizationId,
      input.bundleId || null,
      input.term,
      input.definition || null,
      input.context || null,
      input.alternatives ? JSON.stringify(input.alternatives) : null,
      input.doNotUse ? JSON.stringify(input.doNotUse) : null,
      input.category || null,
      input.submissionTypes ? JSON.stringify(input.submissionTypes) : null,
      input.regulatoryRegions ? JSON.stringify(input.regulatoryRegions) : null,
      input.actorId || null,
    ]
  );

  await appendEvent({
    organizationId: input.organizationId,
    eventType: 'account_term_added',
    targetType: 'term_entry',
    targetId: String(result.rows[0].id),
    newValue: { term: input.term, definition: input.definition },
    description: `Term added: "${input.term}"`,
    actorId: input.actorId,
    actorName: input.actorName,
  });

  return result.rows[0];
}

export async function getTermDictionary(
  organizationId: number,
  options?: { category?: string; bundleId?: number; limit?: number }
): Promise<Array<Record<string, unknown>>> {
  const conditions = ['organization_id = $1', "status IN ('active', 'locked')"];
  const params: unknown[] = [organizationId];

  if (options?.category) {
    params.push(options.category);
    conditions.push(`category = $${params.length}`);
  }
  if (options?.bundleId) {
    params.push(options.bundleId);
    conditions.push(`bundle_id = $${params.length}`);
  }

  const result = await pool.query(
    `SELECT * FROM account_term_dictionary WHERE ${conditions.join(' AND ')}
     ORDER BY category, term LIMIT ${options?.limit || 200}`,
    params
  );

  return result.rows;
}

// ── Template Registry CRUD ────────────────────────────────────────────────────

export interface TemplateInput {
  organizationId: number;
  bundleId?: number;
  templateKey: string;
  name: string;
  description?: string;
  submissionType?: string;
  regulatoryRegion?: string;
  sectionOverrides?: Array<{
    sectionCode: string;
    title?: string;
    instruction?: string;
    required?: boolean;
    defaultContent?: string;
    order?: number;
  }>;
  defaultMetadata?: Record<string, unknown>;
  headerFooter?: Record<string, unknown>;
  namingConvention?: string;
  metadata?: Record<string, unknown>;
  actorId?: number;
  actorName?: string;
}

export async function addTemplate(input: TemplateInput): Promise<Record<string, unknown>> {
  const result = await pool.query(
    `INSERT INTO account_template_registry
     (organization_id, bundle_id, template_key, name, description,
      submission_type, regulatory_region, section_overrides,
      default_metadata, header_footer, naming_convention,
      version, status, created_by_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, 'active', $12, NOW(), NOW())
     RETURNING *`,
    [
      input.organizationId,
      input.bundleId || null,
      input.templateKey,
      input.name,
      input.description || null,
      input.submissionType || null,
      input.regulatoryRegion || null,
      input.sectionOverrides ? JSON.stringify(input.sectionOverrides) : null,
      input.defaultMetadata ? JSON.stringify(input.defaultMetadata) : null,
      input.headerFooter ? JSON.stringify(input.headerFooter) : null,
      input.namingConvention || null,
      input.actorId || null,
    ]
  );

  await appendEvent({
    organizationId: input.organizationId,
    eventType: 'account_template_approved',
    targetType: 'template_entry',
    targetId: String(result.rows[0].id),
    newValue: { templateKey: input.templateKey, name: input.name },
    description: `Template registered: ${input.name}`,
    actorId: input.actorId,
    actorName: input.actorName,
  });

  return result.rows[0];
}

export async function getTemplateRegistry(
  organizationId: number,
  options?: { submissionType?: string; regulatoryRegion?: string; limit?: number }
): Promise<Array<Record<string, unknown>>> {
  const conditions = ['organization_id = $1', "status IN ('active', 'locked')"];
  const params: unknown[] = [organizationId];

  if (options?.submissionType) {
    params.push(options.submissionType);
    conditions.push(`(submission_type IS NULL OR submission_type = $${params.length})`);
  }
  if (options?.regulatoryRegion) {
    params.push(options.regulatoryRegion);
    conditions.push(`(regulatory_region IS NULL OR regulatory_region = $${params.length})`);
  }

  const result = await pool.query(
    `SELECT * FROM account_template_registry WHERE ${conditions.join(' AND ')}
     ORDER BY name LIMIT ${options?.limit || 50}`,
    params
  );

  return result.rows;
}
