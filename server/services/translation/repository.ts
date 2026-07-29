/**
 * Translation service — PERSISTENCE (tenant-scoped Drizzle repository).
 *
 * The storage seam between the pure translation engine (orchestrator +
 * hybrid-workflow state machine, ./index.ts) and the Postgres `translation_*`
 * tables (shared/schema.ts). The engine is storage-agnostic and speaks the
 * SHARED DTOs; this layer speaks RAW DB ROWS. The DB↔DTO vocabulary mapping
 * lives in the application SERVICE (./translation-service.ts), exercised in
 * exactly one place — never here.
 *
 * REGULATED-PLATFORM GUARDRAILS honored here:
 *  - TENANT ISOLATION IS MANDATORY. Every method takes `organizationId` first and
 *    filters every query by `eq(<table>.organizationId, organizationId)` (+
 *    `isNull(deletedAt)` for soft-deleted tables). Per-id reads return `null` on a
 *    cross-tenant / not-found miss — never another tenant's row. Mirrors the
 *    explicit-predicate idiom in server/services/regulatory-programs.service.ts.
 *  - NO workflow decisions here. This layer persists what the service (which
 *    drives the pure state machine) hands it; it never approves/promotes.
 *  - TM reuse content is human-verified only — `tmStore` persists whatever the
 *    SERVICE hands it, and the SERVICE refuses to store a 'machine' segment
 *    (mirrors InMemoryTranslationMemory.store in ./translation-memory.ts).
 *
 * @module server/services/translation/repository
 */

import { and, arrayContains, desc, eq, isNull, or } from 'drizzle-orm';

import { db } from '../../db';
import {
  glossaryTerms,
  translationMemoryEntries,
  translationProjects,
  translationSegments,
} from '@shared/schema';

// ── DB-row aliases (drizzle InferSelect/InferInsert) ─────────────────────────
// The repository speaks raw DB rows; the SHARED DTOs (TranslationProject etc.
// from @shared/types/translation) are produced by the SERVICE's mapping. We
// derive row types locally and never re-export them under the DTO names.

export type TranslationProjectRow = typeof translationProjects.$inferSelect;
export type TranslationProjectInsert = typeof translationProjects.$inferInsert;
export type TranslationSegmentRow = typeof translationSegments.$inferSelect;
export type TranslationSegmentInsert = typeof translationSegments.$inferInsert;
export type GlossaryTermRow = typeof glossaryTerms.$inferSelect;
export type GlossaryTermInsert = typeof glossaryTerms.$inferInsert;
export type TmEntryRow = typeof translationMemoryEntries.$inferSelect;
export type TmEntryInsert = typeof translationMemoryEntries.$inferInsert;

// ── Filter / patch shapes ────────────────────────────────────────────────────

export interface ListProjectsFilter {
  status?: string;
  targetLanguage?: string;
  submissionContext?: string;
}

export interface GetSegmentsFilter {
  status?: string;
  targetLanguage?: string;
}

/** Partial column patch for a segment (DB vocab). Undefined fields are untouched. */
export interface UpdateSegmentPatch {
  targetText?: string | null;
  method?: string;
  status?: string;
  engine?: string | null;
  engineVersion?: string | null;
  postEditor?: number | null;
  reviewer?: number | null;
  backTranslationVerified?: boolean;
  backTranslationText?: string | null;
  approvedBy?: number | null;
  approvedAt?: Date | null;
  metadata?: unknown;
}

/** Exact-match TM lookup key (the SERVICE supplies the SHA-256 source hash). */
export interface TmLookupKey {
  sourceLanguage: string;
  targetLanguage: string;
  sourceHash: string;
}

/** Thrown when a write targets a parent project the tenant does not own. */
export class ProjectNotFoundError extends Error {
  constructor(public readonly projectId: number) {
    super(`translation project ${projectId} not found for tenant`);
    this.name = 'ProjectNotFoundError';
  }
}

// ── Repository interface ─────────────────────────────────────────────────────

export interface TranslationRepository {
  createProject(
    organizationId: number,
    input: Omit<TranslationProjectInsert, 'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Promise<TranslationProjectRow>;
  getProject(organizationId: number, projectId: number): Promise<TranslationProjectRow | null>;
  listProjects(organizationId: number, filter?: ListProjectsFilter): Promise<TranslationProjectRow[]>;

  addSegment(
    organizationId: number,
    input: Omit<TranslationSegmentInsert, 'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Promise<TranslationSegmentRow>;
  updateSegment(
    organizationId: number,
    segmentId: number,
    patch: UpdateSegmentPatch,
  ): Promise<TranslationSegmentRow | null>;
  getSegment(organizationId: number, segmentId: number): Promise<TranslationSegmentRow | null>;
  getSegments(
    organizationId: number,
    projectId: number,
    filter?: GetSegmentsFilter,
  ): Promise<TranslationSegmentRow[]>;

  upsertGlossaryTerm(
    organizationId: number,
    input: Omit<GlossaryTermInsert, 'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Promise<GlossaryTermRow>;
  listGlossary(
    organizationId: number,
    opts?: { projectId?: number | null; targetLanguage?: string },
  ): Promise<GlossaryTermRow[]>;

  tmLookup(organizationId: number, key: TmLookupKey): Promise<TmEntryRow[]>;
  tmStore(
    organizationId: number,
    input: Omit<TmEntryInsert, 'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Promise<TmEntryRow>;
}

// ── Drizzle implementation ───────────────────────────────────────────────────

/**
 * Postgres/Drizzle implementation of {@link TranslationRepository}. Uses the
 * shared `db` handle (injected so tests / request-scoped RLS handles can be
 * supplied) and the `translation_*` tables. Every query is filtered by
 * `organizationId` (+ `isNull(deletedAt)`).
 */
export class DrizzleTranslationRepository implements TranslationRepository {
  private readonly db: typeof db;

  constructor(database: typeof db = db) {
    this.db = database;
  }

  async createProject(
    organizationId: number,
    input: Omit<TranslationProjectInsert, 'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Promise<TranslationProjectRow> {
    const [row] = await this.db
      .insert(translationProjects)
      .values({ ...input, organizationId })
      .returning();
    return row;
  }

  async getProject(organizationId: number, projectId: number): Promise<TranslationProjectRow | null> {
    const [row] = await this.db
      .select()
      .from(translationProjects)
      .where(
        and(
          eq(translationProjects.organizationId, organizationId),
          eq(translationProjects.id, projectId),
          isNull(translationProjects.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async listProjects(organizationId: number, filter?: ListProjectsFilter): Promise<TranslationProjectRow[]> {
    const predicates = [
      eq(translationProjects.organizationId, organizationId),
      isNull(translationProjects.deletedAt),
    ];
    if (filter?.status) predicates.push(eq(translationProjects.status, filter.status));
    if (filter?.submissionContext) {
      predicates.push(eq(translationProjects.submissionContext, filter.submissionContext));
    }
    if (filter?.targetLanguage) {
      predicates.push(arrayContains(translationProjects.targetLanguages, [filter.targetLanguage]));
    }
    return this.db
      .select()
      .from(translationProjects)
      .where(and(...predicates))
      .orderBy(desc(translationProjects.createdAt));
  }

  async addSegment(
    organizationId: number,
    input: Omit<TranslationSegmentInsert, 'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Promise<TranslationSegmentRow> {
    // Gate on parent ownership: never let a tenant attach a segment to a project
    // they don't own, even though the FK alone would permit a cross-tenant id.
    const parent = await this.getProject(organizationId, input.projectId);
    if (!parent) throw new ProjectNotFoundError(input.projectId);
    const [row] = await this.db
      .insert(translationSegments)
      .values({ ...input, organizationId })
      .returning();
    return row;
  }

  async updateSegment(
    organizationId: number,
    segmentId: number,
    patch: UpdateSegmentPatch,
  ): Promise<TranslationSegmentRow | null> {
    const [row] = await this.db
      .update(translationSegments)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(translationSegments.organizationId, organizationId),
          eq(translationSegments.id, segmentId),
          isNull(translationSegments.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  }

  async getSegment(organizationId: number, segmentId: number): Promise<TranslationSegmentRow | null> {
    const [row] = await this.db
      .select()
      .from(translationSegments)
      .where(
        and(
          eq(translationSegments.organizationId, organizationId),
          eq(translationSegments.id, segmentId),
          isNull(translationSegments.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async getSegments(
    organizationId: number,
    projectId: number,
    filter?: GetSegmentsFilter,
  ): Promise<TranslationSegmentRow[]> {
    const predicates = [
      eq(translationSegments.organizationId, organizationId),
      eq(translationSegments.projectId, projectId),
      isNull(translationSegments.deletedAt),
    ];
    if (filter?.status) predicates.push(eq(translationSegments.status, filter.status));
    if (filter?.targetLanguage) {
      predicates.push(eq(translationSegments.targetLanguage, filter.targetLanguage));
    }
    return this.db
      .select()
      .from(translationSegments)
      .where(and(...predicates))
      .orderBy(translationSegments.segmentKey);
  }

  async upsertGlossaryTerm(
    organizationId: number,
    input: Omit<GlossaryTermInsert, 'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Promise<GlossaryTermRow> {
    // Manual upsert on the business key (org + source term + target language);
    // there is no DB unique constraint, so we select-then-write within the tenant.
    const [existing] = await this.db
      .select()
      .from(glossaryTerms)
      .where(
        and(
          eq(glossaryTerms.organizationId, organizationId),
          eq(glossaryTerms.sourceTerm, input.sourceTerm),
          input.targetLanguage
            ? eq(glossaryTerms.targetLanguage, input.targetLanguage)
            : isNull(glossaryTerms.targetLanguage),
          isNull(glossaryTerms.deletedAt),
        ),
      )
      .limit(1);

    if (existing) {
      const [row] = await this.db
        .update(glossaryTerms)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(glossaryTerms.organizationId, organizationId), eq(glossaryTerms.id, existing.id)))
        .returning();
      return row;
    }
    const [row] = await this.db
      .insert(glossaryTerms)
      .values({ ...input, organizationId })
      .returning();
    return row;
  }

  async listGlossary(
    organizationId: number,
    opts?: { projectId?: number | null; targetLanguage?: string },
  ): Promise<GlossaryTermRow[]> {
    const predicates = [
      eq(glossaryTerms.organizationId, organizationId),
      isNull(glossaryTerms.deletedAt),
    ];
    if (opts?.projectId != null) {
      // Project-scoped query also returns org-wide terms (projectId IS NULL).
      predicates.push(
        or(eq(glossaryTerms.projectId, opts.projectId), isNull(glossaryTerms.projectId))!,
      );
    }
    if (opts?.targetLanguage) {
      predicates.push(eq(glossaryTerms.targetLanguage, opts.targetLanguage));
    }
    return this.db
      .select()
      .from(glossaryTerms)
      .where(and(...predicates))
      .orderBy(glossaryTerms.sourceTerm);
  }

  async tmLookup(organizationId: number, key: TmLookupKey): Promise<TmEntryRow[]> {
    return this.db
      .select()
      .from(translationMemoryEntries)
      .where(
        and(
          eq(translationMemoryEntries.organizationId, organizationId),
          eq(translationMemoryEntries.sourceLanguage, key.sourceLanguage),
          eq(translationMemoryEntries.targetLanguage, key.targetLanguage),
          eq(translationMemoryEntries.sourceHash, key.sourceHash),
          eq(translationMemoryEntries.approvedForReuse, true),
          isNull(translationMemoryEntries.deletedAt),
        ),
      )
      .orderBy(desc(translationMemoryEntries.usageCount));
  }

  async tmStore(
    organizationId: number,
    input: Omit<TmEntryInsert, 'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Promise<TmEntryRow> {
    // Deterministic upsert on org + language pair + source hash.
    const [existing] = await this.db
      .select()
      .from(translationMemoryEntries)
      .where(
        and(
          eq(translationMemoryEntries.organizationId, organizationId),
          eq(translationMemoryEntries.sourceLanguage, input.sourceLanguage),
          eq(translationMemoryEntries.targetLanguage, input.targetLanguage),
          eq(translationMemoryEntries.sourceHash, input.sourceHash),
          isNull(translationMemoryEntries.deletedAt),
        ),
      )
      .limit(1);

    if (existing) {
      const [row] = await this.db
        .update(translationMemoryEntries)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(
            eq(translationMemoryEntries.organizationId, organizationId),
            eq(translationMemoryEntries.id, existing.id),
          ),
        )
        .returning();
      return row;
    }
    const [row] = await this.db
      .insert(translationMemoryEntries)
      .values({ ...input, organizationId })
      .returning();
    return row;
  }
}

/** Factory mirroring the service layer's construction style. */
export function createDrizzleTranslationRepository(database: typeof db = db): TranslationRepository {
  return new DrizzleTranslationRepository(database);
}
