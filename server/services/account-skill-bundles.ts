/**
 * Account Skill Bundles Service
 *
 * Manages reusable account-level execution bundles that codify
 * "how this account does X" — e.g., CER evidence structures,
 * IND module drafting defaults, FDA response letter style.
 *
 * Also manages the account term dictionary and template registry.
 *
 * @module server/services/account-skill-bundles
 */

import { pool } from '../db.js';
import { appendEvent } from './account-canon.js';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('account-skill-bundles');

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ── Skill Bundle CRUD ────────────────────────────────────────────────────────

export interface SkillBundleInput {
  organizationId: number;
  profileId?: number;
  name: string;
  description?: string;
  bundleType: string;
  submissionTypes?: string[];
  moduleTypes?: string[];
  workTypes?: string[];
  regulatoryRegions?: string[];
  promptFragments?: Array<{ role: string; content: string; priority: number }>;
  outputStructure?: Record<string, unknown>;
  evidencePreferences?: Record<string, unknown>;
  authorityResponseStyle?: Record<string, unknown>;
  policyBindings?: Array<{ policyType: string; description: string; enforcement: string }>;
  artifactDefaults?: Record<string, unknown>;
  reviewerRequirements?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  actorId?: number;
  actorName?: string;
}

export async function createSkillBundle(input: SkillBundleInput): Promise<Record<string, unknown>> {
  const bundleId = generateId('bundle');

  const result = await pool.query(
    `INSERT INTO account_skill_bundles
     (bundle_id, organization_id, profile_id, name, description, bundle_type,
      submission_types, module_types, work_types, regulatory_regions,
      prompt_fragments, output_structure, evidence_preferences,
      authority_response_style, policy_bindings, artifact_defaults,
      reviewer_requirements, version, status, metadata, created_by_id,
      created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 1, 'active', $18, $19, NOW(), NOW())
     RETURNING *`,
    [
      bundleId,
      input.organizationId,
      input.profileId || null,
      input.name,
      input.description || null,
      input.bundleType,
      input.submissionTypes ? JSON.stringify(input.submissionTypes) : null,
      input.moduleTypes ? JSON.stringify(input.moduleTypes) : null,
      input.workTypes ? JSON.stringify(input.workTypes) : null,
      input.regulatoryRegions ? JSON.stringify(input.regulatoryRegions) : null,
      JSON.stringify(input.promptFragments || []),
      input.outputStructure ? JSON.stringify(input.outputStructure) : null,
      input.evidencePreferences ? JSON.stringify(input.evidencePreferences) : null,
      input.authorityResponseStyle ? JSON.stringify(input.authorityResponseStyle) : null,
      JSON.stringify(input.policyBindings || []),
      input.artifactDefaults ? JSON.stringify(input.artifactDefaults) : null,
      input.reviewerRequirements ? JSON.stringify(input.reviewerRequirements) : null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.actorId || null,
    ]
  );

  await appendEvent({
    organizationId: input.organizationId,
    eventType: 'account_skill_bundle_created',
    skillBundleId: result.rows[0].id,
    targetType: 'skill_bundle',
    targetId: bundleId,
    newValue: { name: input.name, bundleType: input.bundleType },
    description: `Skill bundle created: ${input.name}`,
    actorId: input.actorId,
    actorName: input.actorName,
  });

  return result.rows[0];
}

export async function updateSkillBundle(
  bundleId: number,
  organizationId: number,
  updates: Partial<Omit<SkillBundleInput, 'organizationId'>>,
  actorId?: number,
  actorName?: string
): Promise<Record<string, unknown>> {
  // Check if locked
  const existing = await pool.query(
    'SELECT * FROM account_skill_bundles WHERE id = $1 AND organization_id = $2',
    [bundleId, organizationId]
  );
  if (existing.rows.length === 0) throw new Error('Skill bundle not found');
  if (existing.rows[0].status === 'locked') throw new Error('Cannot modify a locked skill bundle');

  const setClauses: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let idx = 1;

  const fieldMap: Record<string, string> = {
    name: 'name',
    description: 'description',
    bundleType: 'bundle_type',
    submissionTypes: 'submission_types',
    moduleTypes: 'module_types',
    workTypes: 'work_types',
    regulatoryRegions: 'regulatory_regions',
    promptFragments: 'prompt_fragments',
    outputStructure: 'output_structure',
    evidencePreferences: 'evidence_preferences',
    authorityResponseStyle: 'authority_response_style',
    policyBindings: 'policy_bindings',
    artifactDefaults: 'artifact_defaults',
    reviewerRequirements: 'reviewer_requirements',
    metadata: 'metadata',
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in updates) {
      const val = (updates as Record<string, unknown>)[key];
      params.push(typeof val === 'object' ? JSON.stringify(val) : val);
      setClauses.push(`${column} = $${idx}`);
      idx++;
    }
  }

  params.push(bundleId, organizationId);
  const result = await pool.query(
    `UPDATE account_skill_bundles SET ${setClauses.join(', ')}
     WHERE id = $${idx} AND organization_id = $${idx + 1}
     RETURNING *`,
    params
  );

  await appendEvent({
    organizationId,
    eventType: 'account_skill_bundle_updated',
    skillBundleId: bundleId,
    targetType: 'skill_bundle',
    description: `Skill bundle updated: ${result.rows[0].name}`,
    details: { updatedFields: Object.keys(updates) },
    actorId,
    actorName,
  });

  return result.rows[0];
}

export async function getSkillBundles(
  organizationId: number,
  options?: { bundleType?: string; status?: string; limit?: number }
): Promise<Array<Record<string, unknown>>> {
  const conditions = ['organization_id = $1'];
  const params: unknown[] = [organizationId];

  if (options?.bundleType) {
    params.push(options.bundleType);
    conditions.push(`bundle_type = $${params.length}`);
  }
  if (options?.status) {
    params.push(options.status);
    conditions.push(`status = $${params.length}`);
  } else {
    conditions.push("status != 'archived'");
  }

  const result = await pool.query(
    `SELECT * FROM account_skill_bundles WHERE ${conditions.join(' AND ')}
     ORDER BY name LIMIT ${options?.limit || 50}`,
    params
  );

  return result.rows;
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
