/**
 * Translation Platform API — mounted at /api/translation (behind authMiddleware).
 *
 *   POST /projects                        create project (seeds initial source segments)
 *   GET  /projects                        list projects (+ server-computed segmentCounts)
 *   GET  /projects/:id                    project + ordered segments (TranslationProjectDetail)
 *   POST /projects/:id/segments/draft     machine-draft pending segments (DRAFT accelerator only)
 *   POST /segments/:id/post-edit          human post-edit → in_progress (/back_translation)
 *   POST /segments/:id/back-translation   produce back-translation evidence (→ review when verified)
 *   POST /segments/:id/approve            approve (terminal; fully guarded)
 *   GET  /glossary                        list tenant glossary terms (DNT + preferred)
 *   POST /glossary                        upsert a glossary term
 *
 * Contract: shared/types/translation.ts (DTOs) consumed by
 * client/src/concept2cure/translation/services/translationService.ts. Every
 * success wraps in the canonical envelope via ok(res, data, meta); workflow /
 * validation failures use the shared ApiError envelope `{ error: { code,
 * message, details? } }` — the client specifically relies on the approve
 * endpoint surfacing 'method_not_approvable' and 'back_translation_required'.
 *
 * REGULATED-PLATFORM GUARDRAILS enforced here (via the pure hybrid-workflow
 * state machine — this layer never invents its own approval logic):
 *  - Machine translation is a DRAFT ACCELERATOR ONLY; approval requires human
 *    post-edit + passing back-translation evidence + a distinct reviewer.
 *  - All queries are tenant-scoped through DrizzleTranslationRepository.
 *  - No fabrication: a draft/back-translation provider failure surfaces a typed
 *    error (503 'draft_provider_unavailable' / 'back_translation_provider_unavailable');
 *    segments are left untouched.
 *  - Editing a segment's target text clears any prior back-translation evidence
 *    (evidence is bound to the exact text it verified).
 *
 * DB ↔ DTO vocabulary bridging goes through status-map.ts; the full DTO
 * provenance chain is persisted in translation_segments.metadata.provenance
 * (the table has no post_edited_at/reviewed_at columns), with the flat
 * provenance columns kept in sync for SQL-level audit.
 *
 * @module server/routes/translation.routes
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { ok, orgRequired, clientError, notFoundInTenant, serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';
import { getGateway } from '../services/ai-gateway/gateway.js';
import type { GatewayRequest, GatewayResponse } from '../services/ai-gateway/types';
import {
  createDrizzleTranslationRepository,
  type GlossaryTermRow,
  type TmEntryRow,
  type TranslationProjectRow,
  type TranslationRepository,
  type TranslationSegmentRow,
  type UpdateSegmentPatch,
} from '../services/translation/repository';
import {
  dbMethodToDto,
  dbStatusToDto,
  dtoMethodToDb,
  dtoStatusToDb,
  type DbSegmentMethod,
  type DbSegmentStatus,
} from '../services/translation/status-map';
import {
  allowedActions,
  approvalGuard,
  transition,
  WorkflowTransitionError,
  type WorkflowActor,
} from '../services/translation/hybrid-workflow';
import { DEFAULT_GUARDRAILS } from '../services/translation/types';
import { compileGlossary, emptyGlossary, type MaskingGlossary } from '../services/translation/glossary';
import {
  createInMemoryTranslationMemory,
  hashSource,
  similarity,
  type TranslationMemory,
} from '../services/translation/translation-memory';
import { createTranslationOrchestrator } from '../services/translation/index';
import {
  createLlmTranslationProvider,
  engineLabel,
  LlmProviderError,
  TRANSLATION_PROMPT_VERSION,
} from '../services/translation/providers/llm-provider';
import type {
  BackTranslationResult,
  GlossaryCategory,
  GlossaryTerm,
  SegmentProvenance,
  SourceLanguage,
  TargetLanguage,
  TranslationProject,
  TranslationSegment,
  TranslationStatus,
} from '@shared/types/translation';

const router = Router();
const log = createScopedLogger('translation-routes');

// One tenant-scoped repository for the router; every call passes organizationId.
const repo: TranslationRepository = createDrizzleTranslationRepository();

/** Prompt template id recorded for back-translation gateway calls. */
export const BACK_TRANSLATION_PROMPT_VERSION = 'translation-backtranslate-v1';

// ─────────────────────────────────────────────────────────────────────────────
// Request-context helpers (house conventions — see biopharma-specialty.routes)
// ─────────────────────────────────────────────────────────────────────────────

function getOrgId(req: Request): number | null {
  const raw = (req as { user?: { organizationId?: unknown } }).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : (raw as number);
  return Number.isFinite(n) ? n : null;
}

function getUserId(req: Request): number | null {
  const r = req as { userId?: unknown; user?: { id?: unknown; userId?: unknown } };
  const raw = r.user?.id ?? r.user?.userId ?? r.userId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseId(raw: unknown): number | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = typeof s === 'string' ? Number(s) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Shared ApiError envelope (shared/types/translation.ts): { error: { code, message, details? } }. */
function apiError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return res
    .status(status)
    .json({ error: { code, message, ...(details !== undefined ? { details } : {}) } });
}

/** 422 with zod field errors under the ApiError envelope. */
function validationError(res: Response, error: z.ZodError): Response {
  return apiError(res, 422, 'validation_failed', 'Validation failed', error.flatten().fieldErrors);
}

/**
 * Render a WorkflowTransitionError as its stable ApiError envelope. Illegal
 * status edges are conflicts (409); guardrail violations (method_not_approvable,
 * back_translation_required, reviewer_*, deterministic_draft, missing_evidence)
 * are unprocessable states (422); a missing actor is an auth problem (403).
 */
function workflowError(res: Response, err: WorkflowTransitionError): Response {
  const status = err.code === 'illegal_transition' ? 409 : err.code === 'actor_required' ? 403 : 422;
  return res.status(status).json(err.toApiError());
}

/** True when the underlying store isn't provisioned yet (undefined_table). */
function isMissingStore(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '42P01' || e?.cause?.code === '42P01';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary / DTO mapping (routes are the app-service seam for this platform)
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_LANGS = [
  'fr', 'de', 'ja', 'zh', 'ko', 'es', 'pt', 'it', 'nl', 'pl', 'sv', 'da', 'fi', 'cs', 'el', 'hu', 'ro',
] as const;
const SOURCE_LANGS = ['en', ...TARGET_LANGS] as const;

const GLOSSARY_CATEGORIES = [
  'regulatory_citation', 'agency_name', 'evidence_label', 'slash_command', 'json_block',
  'inn_drug_name', 'meddra_term', 'code', 'preferred_term',
] as const;

const ALL_STATUSES: readonly TranslationStatus[] = [
  'pending', 'mt_draft', 'in_progress', 'back_translation', 'review', 'approved', 'rejected',
];

type SegmentCounts = Record<TranslationStatus, number>;

function emptyCounts(): SegmentCounts {
  return Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as SegmentCounts;
}

function countsFor(rows: readonly TranslationSegmentRow[]): SegmentCounts {
  const counts = emptyCounts();
  for (const row of rows) counts[dbStatusToDto(row.status as DbSegmentStatus)] += 1;
  return counts;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function iso(value: Date | string | null | undefined): string | undefined {
  if (value == null) return undefined;
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * segment_key ↔ ordinal bridge. The repository orders segments by segment_key
 * (text sort), so ordinals are zero-padded on write to make lexicographic order
 * equal numeric order.
 */
function segmentKeyFor(ordinal: number): string {
  return String(ordinal).padStart(8, '0');
}

function ordinalFromKey(key: string): number {
  const n = Number.parseInt(key, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Fresh provenance for a just-seeded (untranslated) segment. */
function initialProvenance(sourceHash: string): SegmentProvenance {
  return {
    sourceHash,
    engine: null,
    promptVersion: null,
    postEditedBy: null,
    postEditedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    approvedBy: null,
    approvedAt: null,
    backTranslation: null,
  };
}

/**
 * Rebuild the DTO provenance for a row. metadata.provenance (written by these
 * routes on every transition) is authoritative; rows written by other tools
 * (seeds, imports) fall back to the flat provenance columns.
 */
function rowProvenance(row: TranslationSegmentRow): SegmentProvenance {
  const meta = asRecord(row.metadata);
  const p = asRecord(meta?.provenance) as Partial<SegmentProvenance> | undefined;
  const fallbackBackTranslation: BackTranslationResult | null =
    row.backTranslationText || row.backTranslationVerified
      ? {
          targetLang: row.targetLanguage as TargetLanguage,
          backText: row.backTranslationText ?? '',
          engine: row.engine ?? 'unknown',
          similarity: row.backTranslationVerified ? 1 : 0,
          verified: row.backTranslationVerified,
          performedAt: iso(row.updatedAt) ?? new Date(0).toISOString(),
        }
      : null;
  return {
    sourceHash: (p?.sourceHash as string) ?? row.sourceHash,
    engine: (p?.engine as string | null) ?? row.engine ?? null,
    promptVersion: (p?.promptVersion as string | null) ?? row.engineVersion ?? null,
    postEditedBy: (p?.postEditedBy as number | null) ?? row.postEditor ?? null,
    postEditedAt: (p?.postEditedAt as string | null) ?? null,
    reviewedBy: (p?.reviewedBy as number | null) ?? row.reviewer ?? null,
    reviewedAt: (p?.reviewedAt as string | null) ?? null,
    approvedBy: (p?.approvedBy as number | null) ?? row.approvedBy ?? null,
    approvedAt: (p?.approvedAt as string | null) ?? iso(row.approvedAt) ?? null,
    backTranslation: (p?.backTranslation as BackTranslationResult | null) ?? fallbackBackTranslation,
  };
}

/**
 * DB segment row → shared DTO. `sourceLang` comes from the owning project (the
 * segments table stores only the target language). A 'pending' segment has no
 * produced translation yet, so its DTO method is null even though the column
 * defaults to 'machine'.
 */
function segmentRowToDto(row: TranslationSegmentRow, sourceLang: SourceLanguage): TranslationSegment {
  const dbStatus = row.status as DbSegmentStatus;
  const status = dbStatusToDto(dbStatus);
  const method =
    dbStatus === 'pending' ? null : dbMethodToDto(row.method as DbSegmentMethod, dbStatus);
  return {
    id: row.id,
    projectId: row.projectId,
    organizationId: row.organizationId,
    ordinal: ordinalFromKey(row.segmentKey),
    sourceText: row.sourceText,
    targetText: row.targetText ?? '',
    sourceHash: row.sourceHash,
    sourceLang,
    targetLang: row.targetLanguage as TargetLanguage,
    method,
    status,
    provenance: rowProvenance(row),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/**
 * Project DTO status. The projects table speaks a coarser vocabulary
 * ('draft'|'in_translation'|'in_review'|'approved'|'archived') with no clean
 * 1:1 to TranslationStatus, and the repository exposes no project update — so
 * the DTO status is DERIVED from the (server-computed) segment counts, exactly
 * like segmentCounts. An empty project maps its stored status.
 */
function deriveProjectStatus(dbStatus: string, counts: SegmentCounts): TranslationStatus {
  const total = ALL_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  if (total === 0) {
    const map: Record<string, TranslationStatus> = {
      draft: 'pending',
      in_translation: 'in_progress',
      in_review: 'review',
      approved: 'approved',
      archived: 'rejected',
    };
    return map[dbStatus] ?? 'pending';
  }
  const active = total - counts.rejected;
  if (active === 0) return 'rejected';
  if (counts.approved === active) return 'approved';
  if (counts.review > 0) return 'review';
  if (counts.back_translation > 0) return 'back_translation';
  if (counts.in_progress > 0) return 'in_progress';
  if (counts.mt_draft > 0) return 'mt_draft';
  return 'pending';
}

function projectRowToDto(row: TranslationProjectRow, counts: SegmentCounts): TranslationProject {
  const meta = asRecord(row.metadata);
  const rawDocId = meta?.sourceDocumentId;
  const sourceDocumentId =
    typeof rawDocId === 'number' && Number.isFinite(rawDocId) ? rawDocId : null;
  const rawSection = meta?.sourceSectionCode;
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    sourceDocumentId,
    sourceSectionCode:
      typeof rawSection === 'string' ? rawSection : row.submissionContext ?? null,
    sourceLang: row.sourceLanguage as SourceLanguage,
    // Route-created projects always carry exactly one target locale.
    targetLang: (row.targetLanguages?.[0] ?? 'de') as TargetLanguage,
    status: deriveProjectStatus(row.status, counts),
    segmentCounts: counts,
    createdBy: row.createdBy,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/**
 * Glossary row → DTO. The table has no category column; the DTO category is
 * carried in metadata.category (written by the upsert route). Rows written
 * elsewhere degrade to 'code' (DNT) / 'preferred_term'.
 */
function glossaryRowToDto(row: GlossaryTermRow): GlossaryTerm {
  const meta = asRecord(row.metadata);
  const doNotTranslate = row.termType === 'do_not_translate';
  const rawCategory = meta?.category;
  const category: GlossaryCategory =
    typeof rawCategory === 'string' && (GLOSSARY_CATEGORIES as readonly string[]).includes(rawCategory)
      ? (rawCategory as GlossaryCategory)
      : doNotTranslate
        ? 'code'
        : 'preferred_term';
  return {
    id: row.id,
    organizationId: row.organizationId,
    sourceTerm: row.sourceTerm,
    targetTerm: row.targetTerm ?? null,
    doNotTranslate,
    category,
    targetLang: (row.targetLanguage as TargetLanguage | null) ?? null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/**
 * Persistable patch for a workflow-transitioned segment DTO. The full DTO
 * provenance rides in metadata.provenance; flat columns stay in sync.
 */
function patchFromDto(
  seg: TranslationSegment,
  existing: TranslationSegmentRow,
  extraMeta?: Record<string, unknown>,
): UpdateSegmentPatch {
  const bt = seg.provenance.backTranslation;
  return {
    targetText: seg.targetText === '' ? null : seg.targetText,
    method: dtoMethodToDb(seg.method ?? 'machine'),
    status: dtoStatusToDb(seg.status),
    engine: seg.provenance.engine,
    engineVersion: seg.provenance.promptVersion ?? null,
    postEditor: seg.provenance.postEditedBy,
    reviewer: seg.provenance.reviewedBy,
    backTranslationVerified: bt?.verified === true,
    backTranslationText: bt?.backText ?? null,
    approvedBy: seg.provenance.approvedBy,
    approvedAt: seg.provenance.approvedAt ? new Date(seg.provenance.approvedAt) : null,
    metadata: {
      ...asRecord(existing.metadata),
      ...extraMeta,
      provenance: seg.provenance,
    },
  };
}

/** Load a segment + its owning project's source language, tenant-scoped. */
async function loadSegmentContext(
  orgId: number,
  segmentId: number,
): Promise<{ row: TranslationSegmentRow; sourceLang: SourceLanguage } | null> {
  const row = await repo.getSegment(orgId, segmentId);
  if (!row) return null;
  const project = await repo.getProject(orgId, row.projectId);
  return { row, sourceLang: (project?.sourceLanguage ?? 'en') as SourceLanguage };
}

// ─────────────────────────────────────────────────────────────────────────────
// Draft-step assembly (glossary + TM + orchestrator, built lazily per request)
// ─────────────────────────────────────────────────────────────────────────────

/** Compile the tenant glossary for a project/language (empty when unprovisioned). */
async function loadMaskingGlossary(
  orgId: number,
  projectId: number,
  targetLang: TargetLanguage,
): Promise<MaskingGlossary> {
  try {
    const rows = await repo.listGlossary(orgId, { projectId });
    const terms = rows.map(glossaryRowToDto);
    const applies = (t: GlossaryTerm) => t.targetLang == null || t.targetLang === targetLang;
    return compileGlossary({
      organizationId: orgId,
      targetLang,
      dnt: terms.filter((t) => t.doNotTranslate && applies(t)),
      preferred: terms.filter((t) => !t.doNotTranslate && applies(t)),
    });
  } catch (err) {
    if (isMissingStore(err)) return emptyGlossary(orgId, targetLang);
    throw err;
  }
}

function tmEntryProvenance(row: TmEntryRow): SegmentProvenance {
  const meta = asRecord(row.metadata);
  const p = asRecord(meta?.provenance);
  if (p) return p as unknown as SegmentProvenance;
  return { ...initialProvenance(row.sourceHash), engine: 'tm-reuse' };
}

/**
 * Seed a synchronous in-memory TM with the persisted exact-match candidates for
 * the segments about to be drafted (the orchestrator's TranslationMemory
 * surface is synchronous, so DB hits are pre-fetched). Only human-verified
 * entries are eligible; a missing TM store simply disables reuse.
 */
async function seedTranslationMemory(
  orgId: number,
  sourceLang: SourceLanguage,
  rows: readonly TranslationSegmentRow[],
): Promise<TranslationMemory> {
  const tm = createInMemoryTranslationMemory();
  for (const row of rows) {
    try {
      const hits = await repo.tmLookup(orgId, {
        sourceLanguage: sourceLang,
        targetLanguage: row.targetLanguage,
        sourceHash: row.sourceHash || hashSource(row.sourceText),
      });
      for (const hit of hits) {
        if (hit.method === 'machine') continue; // machine output is never a TM source
        const meta = asRecord(hit.metadata);
        tm.store({
          organizationId: orgId,
          sourceLang,
          targetLang: row.targetLanguage as TargetLanguage,
          sourceText: hit.sourceText,
          targetText: hit.targetText,
          sourceHash: hit.sourceHash,
          method: meta?.dtoMethod === 'mt_postedited' ? 'mt_postedited' : 'human',
          provenance: tmEntryProvenance(hit),
        });
      }
    } catch (err) {
      if (!isMissingStore(err)) throw err;
      return tm; // TM store not provisioned — draft without reuse
    }
  }
  return tm;
}

/** Back-translation gateway request: target text → source language, temperature 0. */
function buildBackTranslationRequest(
  seg: TranslationSegment,
  opts: { orgId: number; userId: number | null; dataResidency?: GatewayRequest['dataResidency'] },
): GatewayRequest {
  const sourceName = seg.sourceLang === 'en' ? 'English' : `the language with BCP-47 code '${seg.sourceLang}'`;
  const system = [
    'You are verifying a regulatory/medical translation by BACK-TRANSLATION.',
    `Translate the following text (language code '${seg.targetLang}') back into ${sourceName},`,
    'literally and faithfully — do not summarize, omit, add, or "improve" the text.',
    'Preserve all formatting, numbering, identifiers, and line breaks exactly.',
    'Output ONLY the back-translated text. No preamble, no notes, no quotes.',
  ].join('\n');
  return {
    taskType: 'document_drafting',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: seg.targetText },
    ],
    temperature: 0,
    maxTokens: 4000,
    organizationId: opts.orgId,
    userId: opts.userId ?? undefined,
    callerModule: 'translation-back-translation',
    promptVersion: BACK_TRANSLATION_PROMPT_VERSION,
    dataResidency: opts.dataResidency,
    metadata: {
      promptVersion: BACK_TRANSLATION_PROMPT_VERSION,
      sourceLang: seg.sourceLang,
      targetLang: seg.targetLang,
      step: 'back_translation',
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(300),
  sourceDocumentId: z.number().int().positive().optional(),
  sourceSectionCode: z.string().trim().min(1).max(200).optional(),
  sourceLang: z.enum(SOURCE_LANGS),
  targetLang: z.enum(TARGET_LANGS),
  segments: z
    .array(
      z.object({
        ordinal: z.number().int().min(0).max(99_999_999),
        sourceText: z.string().min(1).max(20_000),
      }),
    )
    .min(1)
    .max(500)
    .refine(
      (segs) => new Set(segs.map((s) => s.ordinal)).size === segs.length,
      { message: 'segment ordinals must be unique' },
    ),
});

const draftSchema = z.object({
  projectId: z.number().int().positive().optional(), // URL param is authoritative
  segmentIds: z.array(z.number().int().positive()).max(500).optional(),
  dataResidency: z.enum(['any', 'us', 'eu', 'apac', 'on_prem']).optional(),
});

const postEditSchema = z.object({
  segmentId: z.number().int().positive().optional(), // URL param is authoritative
  targetText: z.string().min(1).max(40_000),
  method: z.enum(['mt_postedited', 'human']),
  readyForReview: z.boolean().optional(),
});

const backTranslationSchema = z.object({
  segmentId: z.number().int().positive().optional(),
  dataResidency: z.enum(['any', 'us', 'eu', 'apac', 'on_prem']).optional(),
});

const approveSchema = z.object({
  segmentId: z.number().int().positive().optional(),
  reviewNote: z.string().trim().max(2000).optional(),
});

const upsertGlossarySchema = z.object({
  id: z.number().int().positive().optional(), // upsert keys on (org, sourceTerm, targetLang)
  sourceTerm: z.string().trim().min(1).max(300),
  doNotTranslate: z.boolean(),
  category: z.enum(GLOSSARY_CATEGORIES),
  targetTerm: z.string().trim().min(1).max(500).nullish(),
  targetLang: z.enum(TARGET_LANGS).nullish(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Projects
// ─────────────────────────────────────────────────────────────────────────────

/** POST /projects — create a project and seed its initial source segments. */
router.post('/projects', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const userId = getUserId(req);
  if (userId === null) return clientError(res, 403, 'Authenticated user context required');

  const parsed = createProjectSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationError(res, parsed.error);
  const { name, sourceDocumentId, sourceSectionCode, sourceLang, targetLang, segments } = parsed.data;

  try {
    const projectRow = await repo.createProject(orgId, {
      name,
      sourceLanguage: sourceLang,
      targetLanguages: [targetLang],
      status: 'draft',
      submissionContext: sourceSectionCode ?? null,
      description: null,
      metadata: {
        sourceDocumentId: sourceDocumentId ?? null,
        sourceSectionCode: sourceSectionCode ?? null,
      },
      createdBy: userId,
    });

    // Seed segments in ordinal order. (The repository exposes no transaction
    // surface; a mid-seed failure surfaces as a 500 with the project created.)
    const segmentRows: TranslationSegmentRow[] = [];
    for (const s of [...segments].sort((a, b) => a.ordinal - b.ordinal)) {
      const sourceHash = hashSource(s.sourceText);
      segmentRows.push(
        await repo.addSegment(orgId, {
          projectId: projectRow.id,
          targetLanguage: targetLang,
          segmentKey: segmentKeyFor(s.ordinal),
          sourceText: s.sourceText,
          targetText: null,
          sourceHash,
          method: 'machine', // column default; DTO surfaces null until drafted
          status: 'pending',
          metadata: { provenance: initialProvenance(sourceHash) },
        }),
      );
    }

    return ok(res, projectRowToDto(projectRow, countsFor(segmentRows)), {
      segmentCount: segmentRows.length,
    });
  } catch (err) {
    if (isMissingStore(err)) {
      return apiError(res, 503, 'translation_store_unavailable', 'Translation store is not provisioned yet.');
    }
    return serverError(res, log, 'create-project', err);
  }
});

/** GET /projects — org-scoped list with server-computed segmentCounts. */
router.get('/projects', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const rows = await repo.listProjects(orgId);
    const projects: TranslationProject[] = [];
    for (const row of rows) {
      const segRows = await repo.getSegments(orgId, row.id);
      projects.push(projectRowToDto(row, countsFor(segRows)));
    }
    return ok(res, projects, { count: projects.length });
  } catch (err) {
    // Store not provisioned yet in this tenant → honest empty (fail closed).
    if (isMissingStore(err)) return ok(res, [], { count: 0, pendingStore: true });
    return serverError(res, log, 'list-projects', err);
  }
});

/** GET /projects/:id — project + full ordered segment list. */
router.get('/projects/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const projectId = parseId(req.params.id);
  if (projectId === null) return apiError(res, 400, 'invalid_id', 'Invalid project id');
  try {
    const row = await repo.getProject(orgId, projectId);
    if (!row) return notFoundInTenant(res, 'Translation project');
    const segRows = await repo.getSegments(orgId, projectId);
    const sourceLang = row.sourceLanguage as SourceLanguage;
    const detail = {
      ...projectRowToDto(row, countsFor(segRows)),
      segments: segRows.map((s) => segmentRowToDto(s, sourceLang)),
    };
    return ok(res, detail, { segmentCount: segRows.length });
  } catch (err) {
    return serverError(res, log, 'get-project', err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Machine draft (DRAFT accelerator only — never approvable on its own)
// ─────────────────────────────────────────────────────────────────────────────

/** POST /projects/:id/segments/draft — machine-draft pending segments. */
router.post('/projects/:id/segments/draft', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const userId = getUserId(req);
  const projectId = parseId(req.params.id);
  if (projectId === null) return apiError(res, 400, 'invalid_id', 'Invalid project id');
  const parsed = draftSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationError(res, parsed.error);

  try {
    const project = await repo.getProject(orgId, projectId);
    if (!project) return notFoundInTenant(res, 'Translation project');
    const sourceLang = project.sourceLanguage as SourceLanguage;
    const targetLang = (project.targetLanguages?.[0] ?? 'de') as TargetLanguage;

    const rows = await repo.getSegments(orgId, projectId);
    const pendingRows = rows.filter((r) => (r.status as DbSegmentStatus) === 'pending');
    const requested = parsed.data.segmentIds;
    const candidates = requested
      ? pendingRows.filter((r) => requested.includes(r.id))
      : pendingRows;
    // Requested ids that are not draftable are reported, not silently dropped.
    const preFailures = (requested ?? [])
      .filter((id) => !candidates.some((r) => r.id === id))
      .map((id) => ({
        segmentId: id,
        message: rows.some((r) => r.id === id)
          ? `segment ${id} is not in 'pending' state`
          : `segment ${id} not found in project ${projectId}`,
      }));

    if (candidates.length === 0) {
      return ok(
        res,
        { projectId, segments: [], engine: 'gateway-mt', deterministic: false },
        { count: 0, failures: preFailures },
      );
    }

    // Build the orchestrator lazily: if the AI gateway cannot even be
    // constructed (no provider/key configuration), degrade to a typed 503
    // instead of crashing — segments stay 'pending'.
    let provider;
    try {
      const gateway = getGateway();
      provider = createLlmTranslationProvider({ getGateway: () => gateway });
    } catch (err) {
      log.warn(`AI gateway unavailable for machine draft: ${errorMessage(err)}`, { orgId, projectId });
      return apiError(
        res,
        503,
        'draft_provider_unavailable',
        'Machine-draft provider is unavailable; segments were left pending.',
      );
    }

    const glossary = await loadMaskingGlossary(orgId, projectId, targetLang);
    const tm = await seedTranslationMemory(orgId, sourceLang, candidates);
    const orchestrator = createTranslationOrchestrator({ provider, tm });

    const dtoSegments = candidates.map((r) => segmentRowToDto(r, sourceLang));
    const { outcomes, failures } = await orchestrator.draftSegments(dtoSegments, {
      glossary,
      userId: userId ?? undefined,
      dataResidency: parsed.data.dataResidency,
      now: new Date().toISOString(),
    });

    // Every candidate failed on gateway availability → same typed 503.
    if (
      outcomes.length === 0 &&
      failures.length > 0 &&
      failures.every((f) => f.error instanceof LlmProviderError && f.error.code === 'gateway_unavailable')
    ) {
      return apiError(
        res,
        503,
        'draft_provider_unavailable',
        'Machine-draft provider is unavailable; segments were left pending.',
      );
    }

    const drafted: TranslationSegment[] = [];
    let deterministic = false;
    for (const outcome of outcomes) {
      deterministic = deterministic || outcome.deterministic;
      const existing = candidates.find((r) => r.id === outcome.segment.id);
      if (!existing) continue;
      const patch = patchFromDto(outcome.segment, existing, {
        deterministic: outcome.deterministic,
        draftSource: outcome.source,
      });
      // TM reuse keeps its true origin in storage ('translation_memory').
      if (outcome.source === 'tm_reuse') patch.method = 'translation_memory';
      const updated = await repo.updateSegment(orgId, existing.id, patch);
      if (updated) drafted.push(segmentRowToDto(updated, sourceLang));
    }

    return ok(
      res,
      {
        projectId,
        segments: drafted,
        engine: outcomes[0]?.engine ?? 'gateway-mt',
        deterministic,
      },
      {
        count: drafted.length,
        failures: [
          ...preFailures,
          ...failures.map((f) => ({ segmentId: f.segmentId, message: errorMessage(f.error) })),
        ],
      },
    );
  } catch (err) {
    if (err instanceof WorkflowTransitionError) return workflowError(res, err);
    if (isMissingStore(err)) {
      return apiError(res, 503, 'translation_store_unavailable', 'Translation store is not provisioned yet.');
    }
    return serverError(res, log, 'draft-segments', err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Segment workflow (post-edit → back-translation → approve)
// ─────────────────────────────────────────────────────────────────────────────

/** POST /segments/:id/post-edit — human correction (start_human / post_edit). */
router.post('/segments/:id/post-edit', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const userId = getUserId(req);
  if (userId === null) return clientError(res, 403, 'Authenticated user context required');
  const segmentId = parseId(req.params.id);
  if (segmentId === null) return apiError(res, 400, 'invalid_id', 'Invalid segment id');
  const parsed = postEditSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationError(res, parsed.error);

  try {
    const ctxRow = await loadSegmentContext(orgId, segmentId);
    if (!ctxRow) return notFoundInTenant(res, 'Translation segment');
    const { row, sourceLang } = ctxRow;

    let seg = segmentRowToDto(row, sourceLang);
    const previousTarget = seg.targetText;
    const actor: WorkflowActor = { userId };
    const now = new Date().toISOString();
    const ctx = { now, method: parsed.data.method };

    switch (seg.status) {
      case 'pending':
        seg = transition(seg, 'start_human', actor, ctx);
        break;
      case 'mt_draft':
      case 'in_progress':
        seg = transition(seg, 'post_edit', actor, ctx);
        break;
      case 'back_translation':
      case 'review':
        // Re-editing verified/reviewed text reopens it (clears stale sign-off).
        seg = transition(seg, 'reopen', actor, { now });
        seg = transition(seg, 'post_edit', actor, ctx);
        break;
      default:
        // Terminal states — let the state machine emit the typed illegal error.
        seg = transition(seg, 'post_edit', actor, ctx);
    }

    seg = { ...seg, targetText: parsed.data.targetText };
    if (parsed.data.targetText !== previousTarget && seg.provenance.backTranslation) {
      // Evidence is bound to the text it verified — a changed target
      // invalidates prior back-translation evidence (must be re-run).
      seg = { ...seg, provenance: { ...seg.provenance, backTranslation: null } };
    }
    if (parsed.data.readyForReview) {
      // The state machine has no in_progress → review shortcut: 'review' is
      // only reachable through back-translation. readyForReview therefore
      // advances the segment into the verification queue.
      seg = transition(seg, 'submit_for_back_translation', actor, { now });
    }

    const updated = await repo.updateSegment(orgId, seg.id, patchFromDto(seg, row));
    if (!updated) return notFoundInTenant(res, 'Translation segment');
    return ok(res, segmentRowToDto(updated, sourceLang));
  } catch (err) {
    if (err instanceof WorkflowTransitionError) return workflowError(res, err);
    return serverError(res, log, 'post-edit', err);
  }
});

/** POST /segments/:id/back-translation — produce/refresh verification evidence. */
router.post('/segments/:id/back-translation', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const userId = getUserId(req);
  if (userId === null) return clientError(res, 403, 'Authenticated user context required');
  const segmentId = parseId(req.params.id);
  if (segmentId === null) return apiError(res, 400, 'invalid_id', 'Invalid segment id');
  const parsed = backTranslationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationError(res, parsed.error);

  try {
    const ctxRow = await loadSegmentContext(orgId, segmentId);
    if (!ctxRow) return notFoundInTenant(res, 'Translation segment');
    const { row, sourceLang } = ctxRow;

    let seg = segmentRowToDto(row, sourceLang);
    const originalStatus = seg.status;
    const actor: WorkflowActor = { userId };
    const now = new Date().toISOString();

    if (seg.status === 'in_progress') {
      seg = transition(seg, 'submit_for_back_translation', actor, { now });
    }
    if (seg.status !== 'back_translation') {
      return workflowError(
        res,
        new WorkflowTransitionError(
          'illegal_transition',
          `Action 'run_back_translation' is not allowed from status '${originalStatus}'.`,
          { from: originalStatus, action: 'run_back_translation', allowed: allowedActions(originalStatus) },
        ),
      );
    }
    if (!seg.targetText.trim()) {
      return apiError(res, 422, 'missing_target_text', 'Segment has no target text to back-translate.');
    }

    // Round-trip via the AI gateway: target text → source language. Failure is
    // a typed 503 — evidence is never fabricated.
    let response: GatewayResponse;
    try {
      const gateway = getGateway();
      response = await gateway.route(
        buildBackTranslationRequest(seg, { orgId, userId, dataResidency: parsed.data.dataResidency }),
      );
    } catch (err) {
      log.warn(`Back-translation gateway call failed: ${errorMessage(err)}`, { orgId, segmentId });
      return apiError(
        res,
        503,
        'back_translation_provider_unavailable',
        'Back-translation provider is unavailable; no evidence was recorded.',
      );
    }
    const backText = (response.content ?? '').trim();
    if (!backText) {
      return apiError(res, 502, 'back_translation_empty', 'Back-translation returned no content.');
    }

    const deterministic = response.deterministic === true;
    const score = similarity(seg.sourceText, backText);
    const result: BackTranslationResult = {
      targetLang: seg.targetLang,
      backText,
      engine: engineLabel(response),
      similarity: Number(score.toFixed(4)),
      // Deterministic/demo output can never count as verification evidence.
      verified: !deterministic && score >= DEFAULT_GUARDRAILS.backTranslationThreshold,
      ...(deterministic
        ? { notes: 'Deterministic/demo engine output — not acceptable as verification evidence.' }
        : {}),
      performedAt: now,
    };

    seg = transition(seg, 'run_back_translation', actor, { now, backTranslation: result });
    if (result.verified) {
      // Passing evidence puts the segment in front of the reviewer of record.
      seg = transition(seg, 'submit_for_review', actor, { now });
    }

    const updated = await repo.updateSegment(orgId, seg.id, patchFromDto(seg, row));
    if (!updated) return notFoundInTenant(res, 'Translation segment');
    return ok(res, { segment: segmentRowToDto(updated, sourceLang), result });
  } catch (err) {
    if (err instanceof WorkflowTransitionError) return workflowError(res, err);
    return serverError(res, log, 'back-translation', err);
  }
});

/** POST /segments/:id/approve — terminal approval, fully guarded. */
router.post('/segments/:id/approve', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const userId = getUserId(req);
  if (userId === null) return clientError(res, 403, 'Authenticated user context required');
  const segmentId = parseId(req.params.id);
  if (segmentId === null) return apiError(res, 400, 'invalid_id', 'Invalid segment id');
  const parsed = approveSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationError(res, parsed.error);

  try {
    const ctxRow = await loadSegmentContext(orgId, segmentId);
    if (!ctxRow) return notFoundInTenant(res, 'Translation segment');
    const { row, sourceLang } = ctxRow;

    let seg = segmentRowToDto(row, sourceLang);
    const deterministicDraft = asRecord(row.metadata)?.deterministic === true;
    const now = new Date().toISOString();
    const actor: WorkflowActor = { userId, isReviewer: true, note: parsed.data.reviewNote };

    // Evaluate the SEMANTIC guardrails first (with this actor stamped as the
    // reviewer of record, exactly as transition('approve') would), so a machine
    // draft rejects with 'method_not_approvable' and missing/failed evidence
    // rejects with 'back_translation_required' regardless of current status.
    const candidate: TranslationSegment = {
      ...seg,
      provenance: { ...seg.provenance, reviewedBy: userId, reviewedAt: now },
    };
    const violation = approvalGuard(candidate, DEFAULT_GUARDRAILS, { deterministicDraft });
    if (violation) return workflowError(res, violation);

    // Then walk the legal status edges to 'approved'.
    if (seg.status === 'in_progress') {
      seg = transition(seg, 'submit_for_back_translation', actor, { now });
    }
    if (seg.status === 'back_translation') {
      seg = transition(seg, 'submit_for_review', actor, { now });
    }
    seg = transition(seg, 'approve', actor, { now, deterministicDraft });

    const updated = await repo.updateSegment(
      orgId,
      seg.id,
      patchFromDto(seg, row, parsed.data.reviewNote ? { reviewNote: parsed.data.reviewNote } : undefined),
    );
    if (!updated) return notFoundInTenant(res, 'Translation segment');

    // Accrue the approved pair into the tenant TM for future draft reuse.
    // Best-effort: TM problems never fail an already-recorded approval.
    try {
      await repo.tmStore(orgId, {
        sourceLanguage: seg.sourceLang,
        targetLanguage: seg.targetLang,
        sourceText: seg.sourceText,
        targetText: seg.targetText,
        sourceHash: seg.sourceHash || hashSource(seg.sourceText),
        method: 'human', // human-verified content (post-edited or from-scratch)
        approvedForReuse: true,
        originSegmentId: seg.id,
        usageCount: 0,
        metadata: { dtoMethod: seg.method, provenance: seg.provenance },
        createdBy: userId,
      });
    } catch (tmErr) {
      log.warn(`TM accrual failed for approved segment ${seg.id}: ${errorMessage(tmErr)}`, { orgId });
    }

    return ok(res, segmentRowToDto(updated, sourceLang));
  } catch (err) {
    if (err instanceof WorkflowTransitionError) return workflowError(res, err);
    return serverError(res, log, 'approve', err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Glossary (tenant DNT / preferred-term registry)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /glossary — org-scoped glossary terms. */
router.get('/glossary', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const rows = await repo.listGlossary(orgId);
    const terms = rows.map(glossaryRowToDto);
    return ok(res, terms, { count: terms.length });
  } catch (err) {
    // Store not provisioned yet in this tenant → honest empty (fail closed).
    if (isMissingStore(err)) return ok(res, [], { count: 0, pendingStore: true });
    return serverError(res, log, 'list-glossary', err);
  }
});

/** POST /glossary — upsert a term on the (org, sourceTerm, targetLang) key. */
router.post('/glossary', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const userId = getUserId(req);
  if (userId === null) return clientError(res, 403, 'Authenticated user context required');
  const parsed = upsertGlossarySchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationError(res, parsed.error);
  const { sourceTerm, doNotTranslate, category, targetTerm, targetLang } = parsed.data;

  try {
    const row = await repo.upsertGlossaryTerm(orgId, {
      projectId: null, // this surface manages org-wide terms
      sourceLanguage: 'en', // English is the platform's canonical source
      sourceTerm,
      targetLanguage: targetLang ?? null,
      // A DNT identifier is restored verbatim — a target rendering is meaningless.
      targetTerm: doNotTranslate ? null : targetTerm ?? null,
      termType: doNotTranslate ? 'do_not_translate' : 'preferred',
      caseSensitive: false,
      notes: null,
      metadata: { category },
      createdBy: userId,
    });
    return ok(res, glossaryRowToDto(row));
  } catch (err) {
    if (isMissingStore(err)) {
      return apiError(res, 503, 'translation_store_unavailable', 'Translation store is not provisioned yet.');
    }
    return serverError(res, log, 'upsert-glossary', err);
  }
});

export default router;
