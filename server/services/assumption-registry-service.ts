/**
 * Assumption Registry Service
 *
 * Part 1: Makes critical assumptions explicit, structured, project-bound,
 * reviewable, traceable, and reusable across the platform.
 *
 * Assumptions are first-class governed objects with:
 * - Project binding and artifact linkage
 * - Source attribution and confidence
 * - Domain track and regulator compatibility
 * - Status lifecycle: active → under_review → superseded/withdrawn/challenged
 * - Multi-tenant enforcement via organization_id
 *
 * @module server/services/assumption-registry-service
 */

import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';
import { DEPLOYED_CONFIDENCE_LEVELS } from '../../shared/constants/operating-system-vocab';
import { assertDomainTrack, DEFAULT_DOMAIN_TRACK, type DomainTrack } from './domain-track.js';

const log = createScopedLogger('assumption-registry');

// ─── Types ───────────────────────────────────────────────────────────────────

/* The nine disciplines live in one place now — server/services/domain-track.ts
   — because a second copy of them is what let a caller hand this service the
   product-modality vocabulary and have every write rejected by the CHECK
   constraint and swallowed. Re-exported so existing importers of
   `DomainTrack` from this module keep working. */
export type { DomainTrack } from './domain-track.js';

/* The CHECK lists of assumption_records.category and .source_type
   (db/migrations/20260323_assumption_decision_contradiction.sql), as values so
   create() can refuse anything else before the INSERT. Until 2026-10-15 they
   were type unions only, and the SAP capture's 'analysis_population',
   'attrition', 'ana_generated' and 'manual' reached the INSERT, failed the
   CHECK, and were swallowed by the caller. The vocabulary test reads both
   lists out of the DDL and asserts these match. */
export const ASSUMPTION_CATEGORIES = [
  'efficacy', 'safety', 'statistical', 'design', 'population',
  'endpoint', 'dosing', 'manufacturing', 'regulatory_pathway',
  'comparator', 'dropout', 'missing_data', 'effect_size',
  'prevalence', 'enrollment', 'timeline', 'cost',
] as const;
export type AssumptionCategory = (typeof ASSUMPTION_CATEGORIES)[number];

export const ASSUMPTION_SOURCE_TYPES = [
  'protocol', 'sap', 'literature', 'precedent', 'expert_opinion',
  'regulatory_guidance', 'historical_data', 'modeling', 'sponsor_decision',
] as const;
export type SourceType = (typeof ASSUMPTION_SOURCE_TYPES)[number];

/** confidence_level's CHECK list, shared with decision_records. */
export type ConfidenceLevel = (typeof DEPLOYED_CONFIDENCE_LEVELS)[number];

export type AssumptionStatus =
  | 'active'
  | 'under_review'
  | 'superseded'
  | 'withdrawn'
  | 'challenged';

/**
 * A value the governance ledger will not record: missing, or outside its
 * column's vocabulary. Raised at the service boundary before any write, and
 * answered with 400 by the routes; nothing is recorded in its place.
 */
export class LedgerInputRefusal extends Error {
  readonly status = 400 as const;
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'LedgerInputRefusal';
  }
}

const isAbsent = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/** One of `allowed`, or a refusal naming the field and the allowed values. */
function memberOf<T extends string>(allowed: readonly T[], value: unknown, field: string, context: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new LedgerInputRefusal(
    field,
    `${context}: ${field} ${isAbsent(value) ? 'is required' : `${JSON.stringify(value)} is not a value the ledger records`}. ` +
      `Allowed: ${allowed.join(', ')}.`,
  );
}

/** Text the caller stated, or a refusal: the ledger records no stand-in for it. */
function statedText(value: unknown, field: string, context: string): string {
  if (typeof value === 'string' && value.trim() !== '') return value;
  throw new LedgerInputRefusal(field, `${context}: ${field} is required; nothing is recorded in its place.`);
}

function positiveInteger(value: unknown, field: string, context: string): number {
  const n = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
  if (typeof n === 'number' && Number.isInteger(n) && n > 0) return n;
  throw new LedgerInputRefusal(field, `${context}: ${field} must be a positive integer (got ${JSON.stringify(value)}).`);
}

/**
 * The confidence a caller stated, or null when it stated none — never a
 * default. Shared with decision-record-service: both columns carry the same
 * CHECK list.
 */
export function assertConfidenceLevel(value: unknown, field: string, context: string): ConfidenceLevel | null {
  return isAbsent(value) ? null : memberOf(DEPLOYED_CONFIDENCE_LEVELS, value, field, context);
}

/** assertDomainTrack's refusal, as one the routes answer with 400. */
function domainTrackOf(value: unknown, context: string): DomainTrack {
  try {
    return assertDomainTrack(value, context);
  } catch (err) {
    throw new LedgerInputRefusal('domainTrack', err instanceof Error ? err.message : String(err));
  }
}

/** The first of `values` that is non-blank text, or undefined. */
const firstText = (...values: unknown[]): string | undefined =>
  values.find((v): v is string => typeof v === 'string' && v.trim() !== '');

export interface AssumptionRecord {
  id: string;
  organizationId: number;
  projectId: number;
  assumptionCode: string;
  title: string;
  domainTrack: DomainTrack;
  category: AssumptionCategory;
  assumedValue: string;
  unit: string | null;
  rationale: string;
  sourceType: SourceType;
  sourceReference: string | null;
  /** As the caller stated it; null when nobody did (2026-10-15). */
  confidenceLevel: ConfidenceLevel | null;
  applicableRegulators: string[];
  linkedArtifactId: number | null;
  linkedArtifactVersion: number | null;
  linkedSectionCode: string | null;
  status: AssumptionStatus;
  supersededBy: string | null;
  supersessionReason: string | null;
  createdBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssumptionInput {
  organizationId: number;
  projectId: number;
  assumptionCode: string;
  title: string;
  domainTrack: DomainTrack;
  category: AssumptionCategory;
  assumedValue: string;
  unit?: string;
  rationale: string;
  sourceType: SourceType;
  sourceReference?: string;
  /** Stated by the caller, or absent. It defaulted to 'moderate' (2026-10-15). */
  confidenceLevel?: ConfidenceLevel | null;
  applicableRegulators?: string[];
  linkedArtifactId?: number;
  linkedArtifactVersion?: number;
  linkedSectionCode?: string;
  createdBy: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class AssumptionRegistryService {
  private static instance: AssumptionRegistryService;

  static getInstance(): AssumptionRegistryService {
    if (!AssumptionRegistryService.instance) {
      AssumptionRegistryService.instance = new AssumptionRegistryService();
    }
    return AssumptionRegistryService.instance;
  }

  /**
   * The legacy input shape (name, description, value, confidence,
   * createdById) mapped onto create(). Until 2026-10-15 it filled every input
   * it was not given — category 'regulatory_pathway', source 'expert_opinion',
   * confidence 'moderate', rationale 'No rationale provided', actor 'system',
   * code `ASM-${Date.now()}`, title 'Assumption' — and recorded a stated 0 as
   * '' (`0 || ''`). A missing input is now refused, by this shape's own name
   * for it; a missing confidence is recorded as none.
   */
  async createAssumption(input: Record<string, unknown>): Promise<AssumptionRecord> {
    const context = 'assumptionRegistryService.createAssumption';
    const value = [input.textValue, input.numericValue, input.value, input.assumedValue].find(
      (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== ''),
    );
    const createdById = Number(input.createdById);
    return this.create({
      organizationId: Number(input.organizationId),
      projectId: Number(input.projectId),
      assumptionCode: statedText(firstText(input.name, input.assumptionCode), 'assumptionCode', context),
      title: statedText(firstText(input.description, input.name, input.title), 'title', context),
      // Absent stays the documented default (domain-track.ts); present-but-wrong
      // is refused rather than cast through `as DomainTrack`, which is the cast
      // that let the modality vocabulary reach the INSERT.
      domainTrack: input.domainTrack == null ? DEFAULT_DOMAIN_TRACK : domainTrackOf(input.domainTrack, context),
      category: memberOf(ASSUMPTION_CATEGORIES, input.category, 'category', context),
      assumedValue: statedText(value === undefined ? undefined : String(value), 'assumedValue', context),
      unit: firstText(input.unit),
      rationale: statedText(input.rationale, 'rationale', context),
      sourceType: memberOf(ASSUMPTION_SOURCE_TYPES, input.sourceType, 'sourceType', context),
      sourceReference: firstText(input.sourceDescription, input.sourceReference),
      confidenceLevel: assertConfidenceLevel(input.confidence ?? input.confidenceLevel, 'confidence', context),
      applicableRegulators: [],
      linkedArtifactId: (input.sourceArtifactId as number) || undefined,
      linkedArtifactVersion: undefined,
      linkedSectionCode: undefined,
      createdBy: statedText(
        Number.isInteger(createdById) && createdById > 0 ? String(createdById) : undefined,
        'createdBy',
        context,
      ),
    });
  }

  async createContradictionLink(
    organizationId?: number,
    projectId?: number,
    sourceType?: string,
    sourceId?: string,
    targetType?: string,
    targetId?: string,
    comparisonType?: string,
    options: Record<string, unknown> = {}
  ): Promise<Record<string, unknown> | null> {
    // Legacy integration path calls this with no args — treat as a no-op.
    if (!organizationId || !projectId || !sourceType || !sourceId || !targetType || !targetId) {
      return null;
    }
    try {
      // `status` is not a column here and `created_by` is `created_by_id`, so
      // this INSERT 42703'd at PLAN time and no contradiction link was ever
      // recorded. The catch below logs it as "table unavailable" and returns
      // null, which is why it read as a missing table rather than a bad
      // statement. Found by ci:insert-columns-declared.
      //
      // The literal 'open' mapped to nothing: this table models link state as
      // `is_active` plus `inconsistency_detected`, not a status string. A new
      // link is active and not yet adjudicated, which is what 'open' meant.
      //
      // (This comment lives outside the template literal on purpose — the first
      // version put it inside, and the backticks quoting the column names
      // terminated the string.)
      const result = await pool!.query(
        `
        INSERT INTO contradiction_links (
          organization_id, project_id, source_type, source_id,
          target_type, target_id, comparison_type, is_active, created_by_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8)
        RETURNING *
      `,
        [
          organizationId,
          projectId,
          sourceType,
          sourceId,
          targetType,
          targetId,
          comparisonType ?? 'value_mismatch',
          // created_by_id is INTEGER REFERENCES users(id). The old value was
          // `String(createdById ?? 'system')`, so even once the column name was
          // right the literal 'system' would have been a 22P02 — and a string
          // id would have been coerced or rejected depending on its content.
          // An unattributable link records NULL rather than inventing an actor:
          // this column is a foreign key to a real user, not a label.
          Number.isInteger(Number(options.createdById)) && Number(options.createdById) > 0
            ? Number(options.createdById)
            : null,
        ]
      );
      return result.rows[0] ?? null;
    } catch (err) {
      // Was: warn('Contradiction link table unavailable (non-blocking)').
      // Both halves stopped being true on 2026-09-10. The table IS available —
      // db/migrations/20260910_contradiction_links_port.sql creates it on
      // C2C_MIGRATION_FILES — so a failure here is a genuine write failure, not
      // a missing relation. And it is not non-blocking: the caller asked for a
      // contradiction link to be recorded and none was. Returning null is kept
      // (the route turns it into a 500 rather than reporting success over it),
      // but it is logged as the error it is.
      log.error('Contradiction link NOT stored — the write failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async getContradictionLinks(
    projectId: number,
    organizationId: number
  ): Promise<Record<string, unknown>[]> {
    try {
      const result = await pool!.query(
        'SELECT * FROM contradiction_links WHERE project_id = $1 AND organization_id = $2 ORDER BY created_at DESC',
        [projectId, organizationId]
      );
      return result.rows;
    } catch (err) {
      // Deliberately NOT `return []`. An empty array is a claim that this
      // project has no contradiction links; a failed read is not that claim,
      // and "no contradictions found" is the answer a reviewer is most likely
      // to accept without checking. The route surfaces the throw.
      log.error('Contradiction link read failed — refusing to report an empty result', {
        projectId,
        organizationId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  async linkToArtifact(
    id?: string,
    organizationId?: number,
    artifactId?: number,
    artifactVersion?: number
  ): Promise<AssumptionRecord | null> {
    // Legacy integration path calls this with no args — treat as a no-op.
    if (!id || !organizationId || !artifactId) return null;
    const result = await pool!.query(
      `
      UPDATE assumption_records
      SET linked_artifact_id = $1, linked_artifact_version = $2, updated_at = NOW()
      WHERE id = $3 AND organization_id = $4
      RETURNING *
    `,
      [artifactId, artifactVersion ?? null, id, organizationId]
    );
    return result.rows.length ? this.map(result.rows[0]) : null;
  }

  async linkToDecision(): Promise<void> {
    // Compatibility shim for legacy integration paths.
  }

  async queryAssumptions(input: {
    organizationId: number;
    projectId?: number;
    domainTrack?: DomainTrack;
    category?: AssumptionCategory;
    status?: AssumptionStatus;
    confidence?: ConfidenceLevel;
    regulatorBody?: string;
    sourceArtifactId?: number;
    includeSuperseded?: boolean;
    limit?: number;
  }): Promise<AssumptionRecord[]> {
    const records = await this.search({
      organizationId: input.organizationId,
      projectId: input.projectId,
      domainTrack: input.domainTrack,
      category: input.category,
      status: input.status,
      linkedArtifactId: input.sourceArtifactId,
      limit: input.limit,
    });
    return records.filter(r => {
      if (!input.includeSuperseded && r.status === 'superseded') return false;
      if (input.confidence && r.confidenceLevel !== input.confidence) return false;
      if (input.regulatorBody && !r.applicableRegulators.includes(input.regulatorBody)) return false;
      return true;
    });
  }

  async getAssumption(id: string, organizationId: number): Promise<AssumptionRecord | null> {
    return this.getById(id, organizationId);
  }

  async updateAssumption(
    id: string,
    organizationId: number,
    input: Record<string, unknown>
  ): Promise<AssumptionRecord | null> {
    const editable: Record<string, string> = {
      title: 'title',
      rationale: 'rationale',
      assumedValue: 'assumed_value',
      unit: 'unit',
      confidenceLevel: 'confidence_level',
      sourceReference: 'source_reference',
    };
    // Refused here, not by the CHECK; a blank one clears it to "not stated".
    const values: Record<string, unknown> =
      input.confidenceLevel === undefined
        ? input
        : {
            ...input,
            confidenceLevel: assertConfidenceLevel(
              input.confidenceLevel,
              'confidenceLevel',
              'assumptionRegistryService.updateAssumption',
            ),
          };
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    let idx = 1;
    for (const [key, column] of Object.entries(editable)) {
      if (values[key] !== undefined) {
        sets.push(`${column} = $${idx++}`);
        params.push(values[key] as string | null);
      }
    }
    if (sets.length === 0) return this.getById(id, organizationId);
    sets.push('updated_at = NOW()');
    params.push(id, organizationId);
    const result = await pool!.query(
      `UPDATE assumption_records SET ${sets.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx} RETURNING *`,
      params
    );
    return result.rows.length ? this.map(result.rows[0]) : null;
  }

  async reviewAssumption(
    id: string,
    organizationId: number,
    userId: number
  ): Promise<AssumptionRecord | null> {
    return this.updateStatus(id, organizationId, 'under_review', String(userId));
  }

  async approveAssumption(
    id: string,
    organizationId: number,
    userId: number
  ): Promise<AssumptionRecord | null> {
    return this.updateStatus(id, organizationId, 'active', String(userId));
  }

  async rejectAssumption(
    id: string,
    organizationId: number,
    userId: number,
    _reason: string
  ): Promise<AssumptionRecord | null> {
    return this.updateStatus(id, organizationId, 'withdrawn', String(userId));
  }

  async supersedeAssumption(
    id: string,
    organizationId: number,
    replacement: Record<string, unknown>,
    reason: string
  ): Promise<AssumptionRecord | null> {
    // performedBy was `replacement.createdById ?? 'system'` (changed 2026-10-15):
    // createAssumption now refuses a replacement with no actor, before any write.
    const created = await this.createAssumption({ ...replacement, organizationId });
    return this.supersede(id, {
      organizationId,
      replacementId: created.id,
      reason,
      performedBy: String(replacement.createdById),
    });
  }

  async getAssumptionHistory(
    id: string,
    organizationId: number
  ): Promise<AssumptionRecord[]> {
    const current = await this.getById(id, organizationId);
    if (!current) return [];
    const result = await pool!.query(
      `
      SELECT * FROM assumption_records
      WHERE organization_id = $1 AND (id = $2 OR superseded_by = $2 OR assumption_code = $3)
      ORDER BY created_at ASC
    `,
      [organizationId, id, current.assumptionCode]
    );
    return result.rows.map(this.map);
  }

  async create(input: CreateAssumptionInput): Promise<AssumptionRecord> {
    const context = 'assumptionRegistryService.create';
    /* Same boundary as decisionRecordService.create, for the same reason: each
       column below carries a CHECK or a NOT NULL, and a caller passing a value
       outside it got a constraint violation buried in its own catch block while
       this registry stayed empty. The domain track was checked here; category,
       source and confidence were not, and a missing confidence was recorded as
       'moderate' (2026-10-15). Each is refused now, naming the field. */
    const domainTrack = domainTrackOf(input.domainTrack, context);
    const stated = {
      organizationId: positiveInteger(input.organizationId, 'organizationId', context),
      projectId: positiveInteger(input.projectId, 'projectId', context),
      assumptionCode: statedText(input.assumptionCode, 'assumptionCode', context),
      title: statedText(input.title, 'title', context),
      category: memberOf(ASSUMPTION_CATEGORIES, input.category, 'category', context),
      assumedValue: statedText(input.assumedValue, 'assumedValue', context),
      rationale: statedText(input.rationale, 'rationale', context),
      sourceType: memberOf(ASSUMPTION_SOURCE_TYPES, input.sourceType, 'sourceType', context),
      confidenceLevel: assertConfidenceLevel(input.confidenceLevel, 'confidenceLevel', context),
      createdBy: statedText(input.createdBy, 'createdBy', context),
    };
    log.info('Creating assumption', { code: stated.assumptionCode, project: stated.projectId });

    const result = await pool!.query(
      `
      INSERT INTO assumption_records (
        organization_id, project_id, assumption_code, title, domain_track,
        category, assumed_value, unit, rationale,
        source_type, source_reference, confidence_level,
        applicable_regulators, linked_artifact_id, linked_artifact_version,
        linked_section_code, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `,
      [
        stated.organizationId,
        stated.projectId,
        stated.assumptionCode,
        stated.title,
        domainTrack,
        stated.category,
        stated.assumedValue,
        input.unit ?? null,
        stated.rationale,
        stated.sourceType,
        input.sourceReference ?? null,
        stated.confidenceLevel,
        input.applicableRegulators ?? [],
        input.linkedArtifactId ?? null,
        input.linkedArtifactVersion ?? null,
        input.linkedSectionCode ?? null,
        stated.createdBy,
      ]
    );

    const record = this.map(result.rows[0]);

    // Auto-detect assumption drift after creation
    // Runs async — does not block the create response
    this.triggerDriftDetection(stated.organizationId, stated.projectId).catch(err => {
      log.warn('Assumption drift detection failed (non-blocking)', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return record;
  }

  /**
   * Trigger assumption drift detection for a project.
   * Called automatically after assumption creation/update.
   */
  private async triggerDriftDetection(organizationId: number, projectId: number): Promise<void> {
    try {
      const { contradictionEngineService } = await import('./contradiction-engine-service');
      const findings = await contradictionEngineService.detectAssumptionDrift(
        organizationId,
        projectId
      );
      if (findings.length > 0) {
        log.info('Assumption drift detected', { projectId, count: findings.length });
      }
    } catch {
      // Contradiction engine may not have tables yet — silently skip
    }
  }

  async search(input: {
    organizationId: number;
    projectId?: number;
    domainTrack?: DomainTrack;
    category?: AssumptionCategory;
    status?: AssumptionStatus;
    linkedArtifactId?: number;
    limit?: number;
  }): Promise<AssumptionRecord[]> {
    const conditions: string[] = ['organization_id = $1'];
    const params: (string | number)[] = [input.organizationId];
    let idx = 2;

    if (input.projectId) {
      conditions.push(`project_id = $${idx++}`);
      params.push(input.projectId);
    }
    if (input.domainTrack) {
      conditions.push(`domain_track = $${idx++}`);
      params.push(input.domainTrack);
    }
    if (input.category) {
      conditions.push(`category = $${idx++}`);
      params.push(input.category);
    }
    if (input.status) {
      conditions.push(`status = $${idx++}`);
      params.push(input.status);
    }
    if (input.linkedArtifactId) {
      conditions.push(`linked_artifact_id = $${idx++}`);
      params.push(input.linkedArtifactId);
    }

    const limit = input.limit ?? 50;
    params.push(limit);

    const result = await pool!.query(
      `
      SELECT * FROM assumption_records
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${idx}
    `,
      params
    );

    return result.rows.map(this.map);
  }

  async getById(id: string, organizationId: number): Promise<AssumptionRecord | null> {
    const result = await pool!.query(
      'SELECT * FROM assumption_records WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );
    return result.rows.length ? this.map(result.rows[0]) : null;
  }

  async supersede(
    id: string,
    input: {
      organizationId: number;
      replacementId: string;
      reason: string;
      performedBy: string;
    }
  ): Promise<AssumptionRecord | null> {
    // A supersession names its replacement, its reason and who performed it;
    // a missing one is refused rather than written as NULL (2026-10-15).
    const context = 'assumptionRegistryService.supersede';
    const replacementId = statedText(input.replacementId, 'replacementId', context);
    const reason = statedText(input.reason, 'reason', context);
    statedText(input.performedBy, 'performedBy', context);
    log.info('Superseding assumption', { id, replacementId });

    const result = await pool!.query(
      `
      UPDATE assumption_records
      SET status = 'superseded', superseded_by = $1, supersession_reason = $2, updated_at = NOW()
      WHERE id = $3 AND organization_id = $4
      RETURNING *
    `,
      [replacementId, reason, id, input.organizationId]
    );

    const record = result.rows.length ? this.map(result.rows[0]) : null;

    // Reactive propagation: mark downstream objects stale
    if (record) {
      this.propagateChange(record, 'assumption_superseded', input.reason).catch(err => {
        log.warn('Reactive propagation failed (non-blocking)', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return record;
  }

  /**
   * Propagate assumption change to downstream dependencies.
   * Marks linked artifacts/decisions as stale.
   */
  private async propagateChange(
    assumption: AssumptionRecord,
    triggerType:
      | 'assumption_superseded'
      | 'assumption_updated'
      | 'assumption_challenged'
      | 'assumption_withdrawn',
    reason: string
  ): Promise<void> {
    try {
      const { reactiveDependencyService } = await import('./reactive-dependency-service');
      await reactiveDependencyService.propagateChange({
        organizationId: assumption.organizationId,
        projectId: assumption.projectId,
        triggerType,
        sourceType: 'assumption',
        sourceId: assumption.id,
        sourceLabel: assumption.title,
        reason,
      });
    } catch {
      // Reactive service may not have tables yet — silently skip
    }
  }

  async updateStatus(
    id: string,
    organizationId: number,
    status: AssumptionStatus,
    reviewedBy?: string
  ): Promise<AssumptionRecord | null> {
    const result = await pool!.query(
      `
      UPDATE assumption_records
      SET status = $1, reviewed_by = $2, reviewed_at = CASE WHEN $2::text IS NOT NULL THEN NOW() ELSE reviewed_at END, updated_at = NOW()
      WHERE id = $3 AND organization_id = $4
      RETURNING *
    `,
      [status, reviewedBy ?? null, id, organizationId]
    );

    const record = result.rows.length ? this.map(result.rows[0]) : null;

    // Propagate on material status changes
    if (record && (status === 'challenged' || status === 'withdrawn')) {
      const triggerMap: Record<string, 'assumption_challenged' | 'assumption_withdrawn'> = {
        challenged: 'assumption_challenged',
        withdrawn: 'assumption_withdrawn',
      };
      this.propagateChange(record, triggerMap[status], `Assumption ${status}`).catch(err => {
        log.warn('Status change propagation failed (non-blocking)', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return record;
  }

  async getByProject(
    organizationId: number,
    projectId: number
  ): Promise<{
    total: number;
    byDomain: Record<string, number>;
    byStatus: Record<string, number>;
    active: AssumptionRecord[];
  }> {
    const all = await this.search({ organizationId, projectId, limit: 200 });
    const byDomain: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const a of all) {
      byDomain[a.domainTrack] = (byDomain[a.domainTrack] ?? 0) + 1;
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    }

    return {
      total: all.length,
      byDomain,
      byStatus,
      active: all.filter(a => a.status === 'active'),
    };
  }

  private map(row: Record<string, unknown>): AssumptionRecord {
    return {
      id: row.id as string,
      organizationId: row.organization_id as number,
      projectId: row.project_id as number,
      assumptionCode: row.assumption_code as string,
      title: row.title as string,
      domainTrack: row.domain_track as DomainTrack,
      category: row.category as AssumptionCategory,
      assumedValue: row.assumed_value as string,
      unit: row.unit as string | null,
      rationale: row.rationale as string,
      sourceType: row.source_type as SourceType,
      sourceReference: row.source_reference as string | null,
      confidenceLevel: (row.confidence_level as ConfidenceLevel | null) ?? null,
      applicableRegulators: (row.applicable_regulators as string[]) ?? [],
      linkedArtifactId: row.linked_artifact_id as number | null,
      linkedArtifactVersion: row.linked_artifact_version as number | null,
      linkedSectionCode: row.linked_section_code as string | null,
      status: row.status as AssumptionStatus,
      supersededBy: row.superseded_by as string | null,
      supersessionReason: row.supersession_reason as string | null,
      createdBy: row.created_by as string,
      reviewedBy: row.reviewed_by as string | null,
      reviewedAt: (row.reviewed_at as Date)?.toISOString() ?? null,
      createdAt: (row.created_at as Date)?.toISOString() ?? '',
      updatedAt: (row.updated_at as Date)?.toISOString() ?? '',
    };
  }
}

export const assumptionRegistryService = new AssumptionRegistryService();
