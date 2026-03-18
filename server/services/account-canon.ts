/**
 * Account Canon Service
 *
 * Manages the account-level governed memory layer: canon items, event ledger,
 * projections, and selective resolution.
 *
 * Key principles:
 * - Append-only event ledger — every mutation recorded as an immutable event
 * - Versioned canon — updates create new versions, old ones superseded
 * - Selective resolution — only relevant canon injected into prompts based on
 *   submission type, module, work type, and regulatory region
 * - Audit trail — every AI run logs exactly which canon items were used
 *
 * @module server/services/account-canon
 */

import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('account-canon');

// ── Types ────────────────────────────────────────────────────────────────────

export interface CanonItem {
  id: number;
  canonId: string;
  organizationId: number;
  profileId: number | null;
  category: string;
  subcategory: string | null;
  key: string;
  title: string;
  content: string;
  submissionTypes: string[] | null;
  moduleTypes: string[] | null;
  workTypes: string[] | null;
  regulatoryRegions: string[] | null;
  version: number;
  status: string;
  sourceType: string | null;
  sourceDescription: string | null;
  confidenceScore: number;
  createdAt: string;
}

export interface AccountEventInput {
  organizationId: number;
  eventType: string;
  canonItemId?: number;
  skillBundleId?: number;
  targetType?: string;
  targetId?: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  description?: string;
  details?: Record<string, unknown>;
  actorId?: number;
  actorName?: string;
  actorEmail?: string;
  actorType?: string;
  correlationId?: string;
  projectId?: number;
  conversationId?: number;
  ipAddress?: string;
}

export interface ResolutionContext {
  organizationId: number;
  submissionType?: string;
  moduleType?: string;
  workType?: string;
  regulatoryRegion?: string;
  projectId?: number;
  conversationId?: number;
  threadId?: string;
  maxItems?: number;
}

export interface ResolvedAccountContext {
  canonItems: CanonItem[];
  terms: Array<{
    id: number;
    term: string;
    definition: string | null;
    context: string | null;
    alternatives: string[] | null;
    doNotUse: string[] | null;
    category: string | null;
  }>;
  bundles: Array<{
    id: number;
    bundleId: string;
    name: string;
    bundleType: string;
    promptFragments: Array<{ role: string; content: string; priority: number }>;
    outputStructure: Record<string, unknown> | null;
    evidencePreferences: Record<string, unknown> | null;
    authorityResponseStyle: Record<string, unknown> | null;
    policyBindings: Array<{ policyType: string; description: string; enforcement: string }>;
    reviewerRequirements: Record<string, unknown> | null;
  }>;
  templates: Array<{
    id: number;
    templateKey: string;
    name: string;
    sectionOverrides: unknown[] | null;
    namingConvention: string | null;
  }>;
  tokensEstimate: number;
  requestId: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build a scope-matching WHERE clause fragment.
 * Matches items where the scope array is NULL (applies to all) or overlaps
 * with the provided value.
 */
function scopeClause(column: string, value: string | undefined, paramIndex: number): {
  sql: string;
  param: string | null;
} {
  if (!value) {
    return { sql: '', param: null };
  }
  return {
    sql: ` AND (${column} IS NULL OR ${column}::jsonb ? $${paramIndex})`,
    param: value,
  };
}

// ── Canon CRUD ──────────────────────────────────────────────────────────────

/**
 * Assert a new canon fact. Creates the item and emits an event.
 */
export async function assertCanonFact(input: {
  organizationId: number;
  profileId?: number;
  category: string;
  subcategory?: string;
  key: string;
  title: string;
  content: string;
  submissionTypes?: string[];
  moduleTypes?: string[];
  workTypes?: string[];
  regulatoryRegions?: string[];
  sourceType?: string;
  sourceDocumentId?: string;
  sourceDescription?: string;
  confidenceScore?: number;
  actorId?: number;
  actorName?: string;
  actorEmail?: string;
  metadata?: Record<string, unknown>;
}): Promise<CanonItem> {
  const canonId = generateId('canon');

  const result = await pool.query(
    `INSERT INTO account_canon_items
     (canon_id, organization_id, profile_id, category, subcategory, key, title, content,
      submission_types, module_types, work_types, regulatory_regions,
      version, status, source_type, source_document_id, source_description,
      confidence_score, metadata, created_by_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             1, 'active', $13, $14, $15, $16, $17, $18, NOW(), NOW())
     RETURNING *`,
    [
      canonId,
      input.organizationId,
      input.profileId || null,
      input.category,
      input.subcategory || null,
      input.key,
      input.title,
      input.content,
      input.submissionTypes ? JSON.stringify(input.submissionTypes) : null,
      input.moduleTypes ? JSON.stringify(input.moduleTypes) : null,
      input.workTypes ? JSON.stringify(input.workTypes) : null,
      input.regulatoryRegions ? JSON.stringify(input.regulatoryRegions) : null,
      input.sourceType || 'manual',
      input.sourceDocumentId || null,
      input.sourceDescription || null,
      input.confidenceScore ?? 0.9,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.actorId || null,
    ]
  );

  const item = result.rows[0];

  // Emit event
  await appendEvent({
    organizationId: input.organizationId,
    eventType: 'account_fact_asserted',
    canonItemId: item.id,
    targetType: 'canon_item',
    targetId: canonId,
    newValue: { category: input.category, key: input.key, title: input.title },
    description: `Canon fact asserted: ${input.title}`,
    actorId: input.actorId,
    actorName: input.actorName,
    actorEmail: input.actorEmail,
  });

  return item;
}

/**
 * Validate an existing canon fact. Marks it as validated and emits an event.
 */
export async function validateCanonFact(
  canonItemId: number,
  organizationId: number,
  actorId: number,
  actorName?: string
): Promise<void> {
  await pool.query(
    `UPDATE account_canon_items SET status = 'active', confidence_score = 1.0, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2`,
    [canonItemId, organizationId]
  );

  await appendEvent({
    organizationId,
    eventType: 'account_fact_validated',
    canonItemId,
    targetType: 'canon_item',
    description: `Canon fact validated by ${actorName || 'user'}`,
    actorId,
    actorName,
  });
}

/**
 * Lock a canon fact. Locked items cannot be modified — only superseded.
 */
export async function lockCanonFact(
  canonItemId: number,
  organizationId: number,
  actorId: number,
  actorName?: string
): Promise<void> {
  await pool.query(
    `UPDATE account_canon_items SET status = 'locked', locked_at = NOW(), locked_by_id = $3, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2`,
    [canonItemId, organizationId, actorId]
  );

  await appendEvent({
    organizationId,
    eventType: 'account_fact_locked',
    canonItemId,
    targetType: 'canon_item',
    description: `Canon fact locked by ${actorName || 'user'}`,
    actorId,
    actorName,
  });
}

/**
 * Supersede a canon fact with a new version. The old version is marked
 * as superseded and points to the new one.
 */
export async function supersedeCanonFact(
  oldCanonItemId: number,
  newInput: Parameters<typeof assertCanonFact>[0]
): Promise<CanonItem> {
  // Get the old item's version
  const oldResult = await pool.query(
    'SELECT version, canon_id FROM account_canon_items WHERE id = $1 AND organization_id = $2',
    [oldCanonItemId, newInput.organizationId]
  );
  if (oldResult.rows.length === 0) {
    throw new Error(`Canon item ${oldCanonItemId} not found`);
  }
  const oldVersion = oldResult.rows[0].version;

  // Create the new version
  const newItem = await assertCanonFact({
    ...newInput,
    metadata: { ...newInput.metadata, previousVersion: oldCanonItemId },
  });

  // Update the new item's version number
  await pool.query(
    'UPDATE account_canon_items SET version = $1 WHERE id = $2',
    [oldVersion + 1, newItem.id]
  );

  // Mark the old item as superseded
  await pool.query(
    `UPDATE account_canon_items SET status = 'superseded', superseded_by_id = $1, updated_at = NOW()
     WHERE id = $2 AND organization_id = $3`,
    [newItem.id, oldCanonItemId, newInput.organizationId]
  );

  await appendEvent({
    organizationId: newInput.organizationId,
    eventType: 'account_fact_superseded',
    canonItemId: oldCanonItemId,
    targetType: 'canon_item',
    targetId: oldResult.rows[0].canon_id,
    previousValue: { version: oldVersion },
    newValue: { newCanonItemId: newItem.id, version: oldVersion + 1 },
    description: `Canon fact superseded: v${oldVersion} → v${oldVersion + 1}`,
    actorId: newInput.actorId,
    actorName: newInput.actorName,
  });

  return newItem;
}

/**
 * Get all active canon items for an organization, optionally filtered by category.
 */
export async function getCanonItems(
  organizationId: number,
  options?: { category?: string; status?: string; limit?: number; offset?: number }
): Promise<{ items: CanonItem[]; total: number }> {
  const conditions = ['organization_id = $1', "status != 'superseded'"];
  const params: unknown[] = [organizationId];

  if (options?.category) {
    params.push(options.category);
    conditions.push(`category = $${params.length}`);
  }
  if (options?.status) {
    params.push(options.status);
    conditions.push(`status = $${params.length}`);
  }

  const where = conditions.join(' AND ');
  const limit = options?.limit || 100;
  const offset = options?.offset || 0;

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM account_canon_items WHERE ${where}`,
    params
  );

  const result = await pool.query(
    `SELECT * FROM account_canon_items WHERE ${where}
     ORDER BY category, key, created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return {
    items: result.rows,
    total: parseInt(countResult.rows[0].count, 10),
  };
}

// ── Event Ledger ────────────────────────────────────────────────────────────

/**
 * Append an immutable event to the account event ledger.
 */
export async function appendEvent(input: AccountEventInput): Promise<string> {
  const eventId = generateId('aevt');

  await pool.query(
    `INSERT INTO account_events
     (event_id, organization_id, event_type, canon_item_id, skill_bundle_id,
      target_type, target_id, previous_value, new_value, description, details,
      actor_id, actor_name, actor_email, actor_type, correlation_id,
      project_id, conversation_id, ip_address, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())`,
    [
      eventId,
      input.organizationId,
      input.eventType,
      input.canonItemId || null,
      input.skillBundleId || null,
      input.targetType || null,
      input.targetId || null,
      input.previousValue ? JSON.stringify(input.previousValue) : null,
      input.newValue ? JSON.stringify(input.newValue) : null,
      input.description || null,
      input.details ? JSON.stringify(input.details) : '{}',
      input.actorId || null,
      input.actorName || null,
      input.actorEmail || null,
      input.actorType || 'user',
      input.correlationId || null,
      input.projectId || null,
      input.conversationId || null,
      input.ipAddress || null,
    ]
  );

  // Increment event counter on projection
  try {
    await pool.query(
      `UPDATE account_projection
       SET event_count_since_projection = event_count_since_projection + 1,
           last_event_at = NOW(), updated_at = NOW()
       WHERE organization_id = $1`,
      [input.organizationId]
    );
  } catch (error) {
    logger.debug(`Projection counter update skipped: ${error instanceof Error ? error.message : 'projection may not exist'}`);
  }

  return eventId;
}

/**
 * Get events from the ledger, optionally filtered.
 */
export async function getEvents(
  organizationId: number,
  options?: {
    eventType?: string;
    canonItemId?: number;
    since?: Date;
    limit?: number;
  }
): Promise<Array<Record<string, unknown>>> {
  const conditions = ['organization_id = $1'];
  const params: unknown[] = [organizationId];

  if (options?.eventType) {
    params.push(options.eventType);
    conditions.push(`event_type = $${params.length}`);
  }
  if (options?.canonItemId) {
    params.push(options.canonItemId);
    conditions.push(`canon_item_id = $${params.length}`);
  }
  if (options?.since) {
    params.push(options.since);
    conditions.push(`created_at >= $${params.length}`);
  }

  const result = await pool.query(
    `SELECT * FROM account_events WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC LIMIT ${options?.limit || 50}`,
    params
  );

  return result.rows;
}

// ── Selective Resolution ────────────────────────────────────────────────────

/**
 * Resolve account context for an AI run.
 *
 * Selects only canon items, terms, bundles, and templates that match
 * the current work context (submission type, module, work type, region).
 * Logs what was resolved for audit.
 */
export async function resolveAccountContext(
  ctx: ResolutionContext
): Promise<ResolvedAccountContext> {
  const requestId = generateId('req');
  const maxItems = ctx.maxItems || 30;

  // ── Resolve Canon Items ─────────────────────────────────────────────
  let canonQuery = `SELECT * FROM account_canon_items
    WHERE organization_id = $1 AND status IN ('active', 'locked')`;
  const canonParams: unknown[] = [ctx.organizationId];
  let paramIdx = 2;

  if (ctx.submissionType) {
    canonQuery += ` AND (submission_types IS NULL OR submission_types::jsonb ? $${paramIdx})`;
    canonParams.push(ctx.submissionType);
    paramIdx++;
  }
  if (ctx.moduleType) {
    canonQuery += ` AND (module_types IS NULL OR module_types::jsonb ? $${paramIdx})`;
    canonParams.push(ctx.moduleType);
    paramIdx++;
  }
  if (ctx.workType) {
    canonQuery += ` AND (work_types IS NULL OR work_types::jsonb ? $${paramIdx})`;
    canonParams.push(ctx.workType);
    paramIdx++;
  }
  if (ctx.regulatoryRegion) {
    canonQuery += ` AND (regulatory_regions IS NULL OR regulatory_regions::jsonb ? $${paramIdx})`;
    canonParams.push(ctx.regulatoryRegion);
    paramIdx++;
  }

  canonQuery += ` ORDER BY
    CASE WHEN status = 'locked' THEN 0 ELSE 1 END,
    confidence_score DESC,
    created_at DESC
    LIMIT ${maxItems}`;

  const canonResult = await pool.query(canonQuery, canonParams);

  // ── Resolve Terms ───────────────────────────────────────────────────
  let termQuery = `SELECT * FROM account_term_dictionary
    WHERE organization_id = $1 AND status IN ('active', 'locked')`;
  const termParams: unknown[] = [ctx.organizationId];
  let termIdx = 2;

  if (ctx.submissionType) {
    termQuery += ` AND (submission_types IS NULL OR submission_types::jsonb ? $${termIdx})`;
    termParams.push(ctx.submissionType);
    termIdx++;
  }
  if (ctx.regulatoryRegion) {
    termQuery += ` AND (regulatory_regions IS NULL OR regulatory_regions::jsonb ? $${termIdx})`;
    termParams.push(ctx.regulatoryRegion);
    termIdx++;
  }

  termQuery += ' ORDER BY category, term LIMIT 100';
  const termResult = await pool.query(termQuery, termParams);

  // ── Resolve Skill Bundles ───────────────────────────────────────────
  let bundleQuery = `SELECT * FROM account_skill_bundles
    WHERE organization_id = $1 AND status IN ('active', 'locked')`;
  const bundleParams: unknown[] = [ctx.organizationId];
  let bundleIdx = 2;

  if (ctx.submissionType) {
    bundleQuery += ` AND (submission_types IS NULL OR submission_types::jsonb ? $${bundleIdx})`;
    bundleParams.push(ctx.submissionType);
    bundleIdx++;
  }
  if (ctx.moduleType) {
    bundleQuery += ` AND (module_types IS NULL OR module_types::jsonb ? $${bundleIdx})`;
    bundleParams.push(ctx.moduleType);
    bundleIdx++;
  }
  if (ctx.workType) {
    bundleQuery += ` AND (work_types IS NULL OR work_types::jsonb ? $${bundleIdx})`;
    bundleParams.push(ctx.workType);
    bundleIdx++;
  }

  bundleQuery += ' ORDER BY name LIMIT 10';
  const bundleResult = await pool.query(bundleQuery, bundleParams);

  // ── Resolve Templates ───────────────────────────────────────────────
  let tmplQuery = `SELECT * FROM account_template_registry
    WHERE organization_id = $1 AND status IN ('active', 'locked')`;
  const tmplParams: unknown[] = [ctx.organizationId];
  let tmplIdx = 2;

  if (ctx.submissionType) {
    tmplQuery += ` AND (submission_type IS NULL OR submission_type = $${tmplIdx})`;
    tmplParams.push(ctx.submissionType);
    tmplIdx++;
  }
  if (ctx.regulatoryRegion) {
    tmplQuery += ` AND (regulatory_region IS NULL OR regulatory_region = $${tmplIdx})`;
    tmplParams.push(ctx.regulatoryRegion);
    tmplIdx++;
  }

  tmplQuery += ' ORDER BY name LIMIT 20';
  const tmplResult = await pool.query(tmplQuery, tmplParams);

  // ── Compute token estimate ──────────────────────────────────────────
  let tokensEstimate = 0;
  for (const item of canonResult.rows) {
    tokensEstimate += estimateTokens(item.content || '');
  }
  for (const term of termResult.rows) {
    tokensEstimate += estimateTokens(`${term.term}: ${term.definition || ''}`);
  }
  for (const bundle of bundleResult.rows) {
    const fragments = (bundle.prompt_fragments || []) as Array<{ content: string }>;
    for (const f of fragments) {
      tokensEstimate += estimateTokens(f.content || '');
    }
  }

  const resolved: ResolvedAccountContext = {
    canonItems: canonResult.rows,
    terms: termResult.rows.map((t: any) => ({
      id: t.id,
      term: t.term,
      definition: t.definition,
      context: t.context,
      alternatives: t.alternatives,
      doNotUse: t.do_not_use,
      category: t.category,
    })),
    bundles: bundleResult.rows.map((b: any) => ({
      id: b.id,
      bundleId: b.bundle_id,
      name: b.name,
      bundleType: b.bundle_type,
      promptFragments: b.prompt_fragments || [],
      outputStructure: b.output_structure,
      evidencePreferences: b.evidence_preferences,
      authorityResponseStyle: b.authority_response_style,
      policyBindings: b.policy_bindings || [],
      reviewerRequirements: b.reviewer_requirements,
    })),
    templates: tmplResult.rows.map((t: any) => ({
      id: t.id,
      templateKey: t.template_key,
      name: t.name,
      sectionOverrides: t.section_overrides,
      namingConvention: t.naming_convention,
    })),
    tokensEstimate,
    requestId,
  };

  // ── Log resolution for audit trail ──────────────────────────────────
  try {
    await pool.query(
      `INSERT INTO account_canon_resolution_log
       (organization_id, request_id, project_id, conversation_id, thread_id,
        resolved_canon_ids, resolved_bundle_ids, resolved_term_ids, resolved_template_ids,
        submission_type, module_type, work_type, regulatory_region,
        total_tokens_injected, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())`,
      [
        ctx.organizationId,
        requestId,
        ctx.projectId || null,
        ctx.conversationId || null,
        ctx.threadId || null,
        JSON.stringify(resolved.canonItems.map(c => c.id)),
        JSON.stringify(resolved.bundles.map(b => b.id)),
        JSON.stringify(resolved.terms.map(t => t.id)),
        JSON.stringify(resolved.templates.map(t => t.id)),
        ctx.submissionType || null,
        ctx.moduleType || null,
        ctx.workType || null,
        ctx.regulatoryRegion || null,
        tokensEstimate,
      ]
    );
  } catch (err) {
    logger.warn(`Failed to log canon resolution: ${err}`);
  }

  return resolved;
}

/**
 * Format resolved account context into a prompt block for injection
 * into the Lumen system prompt.
 */
export function formatResolvedContextForPrompt(resolved: ResolvedAccountContext): string {
  const parts: string[] = [];

  // ── Canon Items ─────────────────────────────────────────────────────
  if (resolved.canonItems.length > 0) {
    const grouped: Record<string, typeof resolved.canonItems> = {};
    for (const item of resolved.canonItems) {
      const cat = item.category || 'general';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    }

    parts.push('## Account Canon');
    parts.push('The following are governed truths for this account. Adhere to these strictly.');
    parts.push('');

    for (const [category, items] of Object.entries(grouped)) {
      const label = category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      parts.push(`### ${label}`);
      for (const item of items) {
        const locked = item.status === 'locked' ? ' [LOCKED]' : '';
        parts.push(`- **${item.title}**${locked}: ${item.content}`);
      }
      parts.push('');
    }
  }

  // ── Term Dictionary ─────────────────────────────────────────────────
  if (resolved.terms.length > 0) {
    parts.push('### Approved Terminology');
    parts.push('Use ONLY these terms. Do NOT use the listed alternatives.');
    parts.push('');
    for (const term of resolved.terms) {
      let line = `- **${term.term}**`;
      if (term.definition) line += `: ${term.definition}`;
      if (term.doNotUse?.length) line += ` (DO NOT USE: ${term.doNotUse.join(', ')})`;
      parts.push(line);
    }
    parts.push('');
  }

  // ── Skill Bundle Prompt Fragments ───────────────────────────────────
  if (resolved.bundles.length > 0) {
    for (const bundle of resolved.bundles) {
      if (bundle.promptFragments.length > 0) {
        parts.push(`### Execution Instructions: ${bundle.name}`);
        // Sort by priority (higher = more important)
        const sorted = [...bundle.promptFragments].sort((a, b) => (b.priority || 0) - (a.priority || 0));
        for (const fragment of sorted) {
          parts.push(fragment.content);
        }
        parts.push('');
      }

      if (bundle.evidencePreferences) {
        const ep = bundle.evidencePreferences as Record<string, unknown>;
        if (ep.preferredTypes) {
          parts.push(`**Evidence Preferences**: Prefer ${(ep.preferredTypes as string[]).join(', ')}`);
        }
        if (ep.citationStyle) {
          parts.push(`**Citation Style**: ${ep.citationStyle}`);
        }
      }

      if (bundle.authorityResponseStyle) {
        const ars = bundle.authorityResponseStyle as Record<string, unknown>;
        if (ars.tone) {
          parts.push(`**Response Tone**: ${ars.tone}`);
        }
        if (ars.requiredElements) {
          parts.push(`**Required Elements**: ${(ars.requiredElements as string[]).join(', ')}`);
        }
      }
    }
  }

  return parts.join('\n');
}

// ── Projection ──────────────────────────────────────────────────────────────

/**
 * Rebuild the account projection from the event ledger + current state.
 */
export async function rebuildProjection(organizationId: number): Promise<void> {
  const canonCounts = await pool.query(
    `SELECT status, COUNT(*) as cnt FROM account_canon_items
     WHERE organization_id = $1 AND status != 'superseded'
     GROUP BY status`,
    [organizationId]
  );

  let activeCount = 0;
  let lockedCount = 0;
  const byCategory: Record<string, number> = {};

  for (const row of canonCounts.rows) {
    if (row.status === 'active' || row.status === 'draft') activeCount += parseInt(row.cnt);
    if (row.status === 'locked') lockedCount += parseInt(row.cnt);
  }

  const categoryCounts = await pool.query(
    `SELECT category, COUNT(*) as cnt FROM account_canon_items
     WHERE organization_id = $1 AND status IN ('active', 'locked')
     GROUP BY category`,
    [organizationId]
  );
  for (const row of categoryCounts.rows) {
    byCategory[row.category] = parseInt(row.cnt);
  }

  const bundleCount = await pool.query(
    `SELECT COUNT(*) FROM account_skill_bundles
     WHERE organization_id = $1 AND status IN ('active', 'locked')`,
    [organizationId]
  );

  const termCount = await pool.query(
    `SELECT COUNT(*) FROM account_term_dictionary
     WHERE organization_id = $1 AND status IN ('active', 'locked')`,
    [organizationId]
  );

  const templateCount = await pool.query(
    `SELECT COUNT(*) FROM account_template_registry
     WHERE organization_id = $1 AND status IN ('active', 'locked')`,
    [organizationId]
  );

  const recentEvents = await pool.query(
    `SELECT event_id, event_type, description, created_at
     FROM account_events WHERE organization_id = $1
     ORDER BY created_at DESC LIMIT 10`,
    [organizationId]
  );

  await pool.query(
    `INSERT INTO account_projection
     (organization_id, active_canon_count, locked_canon_count,
      active_skill_bundle_count, term_dictionary_size, template_registry_size,
      canon_by_category, recent_events,
      last_projection_at, event_count_since_projection, projection_version,
      created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 0, 1, NOW(), NOW())
     ON CONFLICT (organization_id) DO UPDATE SET
       active_canon_count = $2,
       locked_canon_count = $3,
       active_skill_bundle_count = $4,
       term_dictionary_size = $5,
       template_registry_size = $6,
       canon_by_category = $7,
       recent_events = $8,
       last_projection_at = NOW(),
       event_count_since_projection = 0,
       projection_version = account_projection.projection_version + 1,
       updated_at = NOW()`,
    [
      organizationId,
      activeCount,
      lockedCount,
      parseInt(bundleCount.rows[0].count),
      parseInt(termCount.rows[0].count),
      parseInt(templateCount.rows[0].count),
      JSON.stringify(byCategory),
      JSON.stringify(recentEvents.rows.map((r: any) => ({
        eventId: r.event_id,
        eventType: r.event_type,
        description: r.description,
        createdAt: r.created_at?.toISOString(),
      }))),
    ]
  );
}

/**
 * Get the account projection (fast state view).
 */
export async function getProjection(
  organizationId: number
): Promise<Record<string, unknown> | null> {
  try {
    const result = await pool.query(
      'SELECT * FROM account_projection WHERE organization_id = $1',
      [organizationId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.warn(`Failed to get projection for org ${organizationId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}
