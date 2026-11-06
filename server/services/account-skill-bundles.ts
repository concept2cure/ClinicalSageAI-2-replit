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
import { pool } from '../db.js';
import { TOOL_REGISTER } from './ana/tool-authorization.js';
import { PROJECT_SKILL_APPROVAL_TOOLS, type SkillApprovalBinding } from '../../shared/ana/skills.js';
import { appendEvent } from './account-canon.js';
import { writeChainedAuditRow } from './auditService.js';

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
const positiveId = (value: unknown): boolean => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const bundleProject = (row: Record<string, unknown>): number | null => row.project_id == null ? null : Number(row.project_id);

function unsupportedSource(): never {
  throw new OrgSkillRefusal(422, 'RULE_SOURCE_SCOPE_UNVERIFIED', 'Choose a recorded skill correction whose organization or project scope can be verified.');
}

/** Resolve only the event schemas whose writers establish their actual scope. */
async function sourceProjectOf(client: SkillReadClient, organizationId: number, event: Record<string, unknown>): Promise<number | null> {
  switch (event.table_name) {
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
async function validateRuleSource(client: SkillReadClient, organizationId: number, projectId: number | null, sourceAuditEventId: string): Promise<void> {
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
}

function assertProjectTools(bindings: SkillApprovalBinding[], projectId: number | null): void {
  if (projectId !== null && bindings.some(binding => !(PROJECT_SKILL_APPROVAL_TOOLS as readonly string[]).includes(binding.toolName))) {
    throw new OrgSkillRefusal(422, 'PROJECT_RULE_TOOL_UNSUPPORTED', 'This action does not yet have a verified project target for a mandatory project rule.');
  }
}

async function ruleMetadata(client: SkillTxClient, organizationId: number, fields: OrgSkillFields, previous?: Record<string, unknown>) {
  const bindings = approvalBindingsOf(fields.policyBindings ?? previous?.policy_bindings);
  const owningProject = previous ? bundleProject(previous) : fields.projectId;
  assertProjectTools(bindings, owningProject);
  const sourceAuditEventId = fields.sourceAuditEventId === undefined ? sourceAuditEventOf(previous?.metadata) : fields.sourceAuditEventId?.toLowerCase() ?? null;
  if (bindings.length && !sourceAuditEventId) {
    throw new OrgSkillRefusal(422, 'RULE_SOURCE_REQUIRED', 'A standing approval rule needs its recorded source in this organization.');
  }
  if (sourceAuditEventId) {
    if (!RULE_UUID.test(sourceAuditEventId)) throw new OrgSkillRefusal(422, 'RULE_SOURCE_REQUIRED', 'A standing rule needs a valid recorded correction source.');
    await validateRuleSource(client, organizationId, owningProject, sourceAuditEventId);
  }
  const metadata = { ...(objectOf(previous?.metadata) ?? {}), standingRule: sourceAuditEventId ? { sourceAuditEventId } : null };
  return { bindings, metadata };
}

function toRecord(row: Record<string, unknown>): OrgSkillRecord {
  const mode = row.extension_mode === 'addendum' || row.extension_mode === 'replace' ? row.extension_mode : null;
  const status = String(row.status ?? 'draft');
  return {
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
  options: { includeArchived?: boolean } = {},
): Promise<OrgSkillRecord[]> {
  const { rows } = await client.query(
    `SELECT id, bundle_id, name, description, bundle_type, prompt_fragments, evidence_preferences,
              authority_response_style, module_types, work_types, submission_types, regulatory_regions,
              segments, therapeutic_areas, surfaces, document_types, triggers, tool_names,
              extends_skill_key, extension_mode, project_id, status, version, updated_at, policy_bindings, metadata FROM account_skill_bundles
      WHERE organization_id = $1 AND ($2::boolean OR status <> 'archived')
      ORDER BY name, id`,
    [organizationId, options.includeArchived === true],
  );
  return rows.map(toRecord);
}

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
): Promise<{ rules: MandatorySkillGate[]; ruleHash: string }> {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0 ||
      (projectId !== null && (!Number.isSafeInteger(projectId) || projectId <= 0))) {
    throw new OrgSkillRefusal(403, 'RULE_SCOPE_UNVERIFIED', 'The standing rules need a verified organization and project scope.');
  }
  const { rows } = await client.query(
    `SELECT id, bundle_id, organization_id, project_id, version, status, policy_bindings, metadata
       FROM account_skill_bundles
      WHERE organization_id = $1 AND status NOT IN ('draft', 'archived')
        AND (project_id IS NULL OR project_id = $2)
      ORDER BY bundle_id, id`, [organizationId, projectId],
  );
  const rules: MandatorySkillGate[] = [];
  const checkedSources = new Set<string>();
  for (const row of rows) {
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
  const ruleHash = createHash('sha256').update(JSON.stringify({ organizationId, projectId, rules })).digest('hex');
  return { rules, ruleHash };
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
  ) {
    super(message);
    this.name = 'OrgSkillRefusal';
  }
}

/** One governed write: the change and its audit row commit together or not at all. */
export async function inTransaction<T>(pool: SkillConnectable, work: (client: SkillTxClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
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
  const bundleId = generateId('bundle');
  try {
    return await inTransaction(pool, async client => {
      const rules = await ruleMetadata(client, organizationId, fields);
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
          fields.status,
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
        action: 'ana_skill.created',
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
      if (previous.status === 'locked') {
        throw new OrgSkillRefusal(409, 'LOCKED', 'A locked skill cannot be changed.');
      }
      if (previous.status === 'archived' && fields.status !== 'draft') {
        throw new OrgSkillRefusal(409, 'ARCHIVED', 'An archived skill can only be restored as a draft.');
      }
      const rules = await ruleMetadata(client, organizationId, fields, before.rows[0]);
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
          fields.status,
          JSON.stringify(rules.bindings),
          JSON.stringify(rules.metadata),
        ],
      );
      const next = toRecord(rows[0]);
      await writeChainedAuditRow(client, {
        tenantId: organizationId,
        userId: actor.userId,
        action: 'ana_skill.updated',
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
