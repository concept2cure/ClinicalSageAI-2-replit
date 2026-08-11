/**
 * Corpus re-vectorization planner (dry-run capable skeleton).
 *
 * Closes the concrete gap named in LOCALAI_ONPREM_INFERENCE_PILOT_PLAN §4:
 * the repo has NO dual-index / re-embedding migration tooling, yet moving a
 * corpus onto a self-hosted embedding model can change its vector dimension
 * (e.g. `documentVectors` is 3072d; most open embedding models are not). A
 * dimension change is not an in-place UPDATE — it needs a new pgvector column,
 * a full re-embed, and a dual-read cutover window (pilot plan §4/§10).
 *
 * WHAT SHIPS HERE (bounded + tested): the PLAN. Given a corpus, a target model
 * and dimension, and a tenant, `planRevectorization()` validates the request
 * against the canonical corpus policy (embedding-corpus-policy.ts), classifies
 * whether a column migration and/or re-embed is required, sizes the work in
 * batches, and surfaces the retrieval-integrity warnings an operator must see
 * BEFORE any cutover. It performs NO writes and makes NO network calls.
 *
 * WHAT IS DEFERRED (staged, human-reviewed): the live re-embed/write path.
 * `executeRevectorization()` runs the planner and, for a non-dry-run request,
 * throws with the exact preconditions — a governed self-hosted embedding
 * endpoint (reached ONLY via getEmbeddingProvider(), never a direct client),
 * idempotent `CREATE ... IF NOT EXISTS` DDL for the new column, and a signed
 * dual-read window. This keeps the risky migration out of an unreviewed slice.
 *
 * TENANT ISOLATION (non-negotiable): every plan is scoped to a single
 * organizationId. A missing/invalid org fails closed — there is no
 * cross-tenant, all-rows migration path. The row counter is INJECTED and must
 * itself apply org scoping; a default DB counter is intentionally omitted so
 * the tenant-scoping decision is explicit and human-reviewed per corpus (the
 * org column differs across the eight corpus tables).
 *
 * @compliance ICH E6(R2) data integrity — the same query against the same
 *   corpus must yield a reproducible result set; a half-migrated index (mixed
 *   models/dimensions) silently breaks that, which the warnings guard against.
 * @module server/services/revectorize-corpus
 */

import {
  getPolicyForCorpus,
  type EmbeddingModel,
} from './embedding-corpus-policy';

/** Default rows per re-embed batch when the caller does not specify one. */
export const DEFAULT_BATCH_SIZE = 128;

/**
 * Org-scoped row counter. Implementations MUST filter by organizationId — a
 * counter that ignores it would leak a cross-tenant row count and size a
 * cross-tenant migration. Injected (not defaulted) so that scoping is explicit.
 */
export type OrgScopedRowCounter = (args: {
  corpus: string;
  table: string;
  organizationId: number;
}) => Promise<number>;

export interface RevectorizeOptions {
  /** Logical corpus name; validated against CORPUS_POLICY (throws if unknown). */
  corpus: string;
  /** Self-hosted embedding model id that will produce the new vectors. */
  toModel: string;
  /** Vector dimension the toModel emits (must match the model's real output). */
  toDimension: number;
  /** REQUIRED — re-vectorization is always scoped to one tenant. */
  organizationId: number;
  /** Rows per re-embed batch. Default DEFAULT_BATCH_SIZE. */
  batchSize?: number;
  /**
   * Default true. The live re-embed/write path is deferred; a non-dry-run
   * request is rejected by executeRevectorization() with its preconditions.
   */
  dryRun?: boolean;
  /** Org-scoped counter used to size the migration. */
  countRows?: OrgScopedRowCounter;
  /** Pre-resolved row count (skips countRows) — for DB-less planning/tests. */
  knownRowCount?: number;
}

export interface RevectorizePlan {
  corpus: string;
  table: string;
  organizationId: number;
  /** Model/dimension the corpus is currently indexed with (from policy). */
  fromModel: EmbeddingModel;
  fromDimension: 1536 | 3072;
  /** Target model/dimension for the migration. */
  toModel: string;
  toDimension: number;
  /** Rows to migrate for this tenant, or null when unresolved. */
  rowCount: number | null;
  batchSize: number;
  /** ceil(rowCount / batchSize), or null when rowCount is unresolved. */
  batches: number | null;
  /** True when the target dimension differs → a new pgvector column is needed. */
  requiresColumnMigration: boolean;
  /** True when any row must be re-embedded (dimension OR model changed). */
  requiresReembed: boolean;
  dryRun: boolean;
  /** Operator-facing integrity warnings that must be resolved before cutover. */
  warnings: string[];
}

/**
 * Build a re-vectorization plan. Pure and side-effect-free apart from the
 * optional injected countRows() call: no writes, no LLM/network calls.
 */
export async function planRevectorization(
  opts: RevectorizeOptions,
): Promise<RevectorizePlan> {
  // Throws for an unknown corpus — never silently default (that is how a
  // dimension-mismatch bug reaches prod).
  const policy = getPolicyForCorpus(opts.corpus);

  // Tenant isolation is fail-closed: no valid org, no migration.
  if (!Number.isInteger(opts.organizationId) || opts.organizationId <= 0) {
    throw new Error(
      'planRevectorization requires a positive integer organizationId — ' +
        're-vectorization is always tenant-scoped; a cross-tenant migration is never permitted.',
    );
  }

  if (!Number.isInteger(opts.toDimension) || opts.toDimension <= 0) {
    throw new Error(
      `Invalid toDimension ${opts.toDimension}: must be a positive integer matching the ` +
        'deployed embedding model\'s real output dimension.',
    );
  }

  if (!opts.toModel || typeof opts.toModel !== 'string') {
    throw new Error(
      'planRevectorization requires a non-empty toModel (the self-hosted embedding ' +
        'model id that will produce toDimension).',
    );
  }

  const batchSize =
    opts.batchSize && opts.batchSize > 0
      ? Math.floor(opts.batchSize)
      : DEFAULT_BATCH_SIZE;

  const dryRun = opts.dryRun !== false; // default true

  let rowCount: number | null = null;
  if (typeof opts.knownRowCount === 'number' && Number.isFinite(opts.knownRowCount)) {
    rowCount = Math.max(0, Math.floor(opts.knownRowCount));
  } else if (opts.countRows) {
    rowCount = await opts.countRows({
      corpus: policy.corpus,
      table: policy.table,
      organizationId: opts.organizationId,
    });
  }

  const requiresColumnMigration = opts.toDimension !== policy.dimensions;
  const requiresReembed = requiresColumnMigration || opts.toModel !== policy.model;

  const warnings: string[] = [];
  if (requiresColumnMigration) {
    warnings.push(
      `Dimension change ${policy.dimensions}d -> ${opts.toDimension}d requires a NEW pgvector ` +
        `column (dual-index) plus a dual-read cutover window: the existing ${policy.dimensions}d ` +
        `index cannot be queried with ${opts.toDimension}d vectors, so old and new must coexist ` +
        'until re-embed completes.',
    );
  }
  if (!requiresColumnMigration && opts.toModel !== policy.model) {
    warnings.push(
      `Same dimension (${policy.dimensions}d) but different model (${policy.model} -> ${opts.toModel}): ` +
        'mixing vectors from two models in one index produces SILENT retrieval misses (no error). ' +
        'Re-embed every row for this tenant, or none.',
    );
  }
  if (rowCount === null) {
    warnings.push(
      'Row count unresolved — pass an org-scoped countRows() or knownRowCount to size the ' +
        'migration. A default DB counter is intentionally omitted so tenant scoping is explicit ' +
        'per corpus.',
    );
  }

  const batches =
    rowCount === null ? null : rowCount === 0 ? 0 : Math.ceil(rowCount / batchSize);

  return {
    corpus: policy.corpus,
    table: policy.table,
    organizationId: opts.organizationId,
    fromModel: policy.model,
    fromDimension: policy.dimensions,
    toModel: opts.toModel,
    toDimension: opts.toDimension,
    rowCount,
    batchSize,
    batches,
    requiresColumnMigration,
    requiresReembed,
    dryRun,
    warnings,
  };
}

/**
 * Execute a re-vectorization. Dry-run returns the plan unchanged. A non-dry-run
 * request is intentionally rejected in this slice: the live re-embed/write path
 * is deferred to staged, human-reviewed work with the preconditions below.
 */
export async function executeRevectorization(
  opts: RevectorizeOptions,
): Promise<RevectorizePlan> {
  const plan = await planRevectorization(opts);
  if (plan.dryRun) return plan;

  throw new Error(
    'executeRevectorization: the live re-embed/write path is intentionally not implemented ' +
      'in this slice. It requires (1) a configured self-hosted embedding endpoint reached ONLY ' +
      'via the governed getEmbeddingProvider() seam (never a direct client — that would trip ' +
      'check-gateway-bypass), (2) idempotent CREATE ... IF NOT EXISTS DDL for the new ' +
      'dimensioned column, and (3) a signed dual-read cutover window (LOCALAI pilot plan ' +
      'sections 4 and 10). Run with dryRun:true for the migration plan; the live path is ' +
      'deferred to staged, human-reviewed work.',
  );
}
