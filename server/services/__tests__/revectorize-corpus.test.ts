/**
 * Tests for the corpus re-vectorization planner (dry-run skeleton).
 *
 * These are pure/offline: no DB, no network, no LLM. They pin the invariants
 * that make the planner safe to ship ahead of the (deferred) live migration:
 *   - tenant isolation is fail-closed (org required);
 *   - dimension vs. model changes are classified correctly;
 *   - the injected row counter is called with org-scoped args;
 *   - the live write path is refused, not silently attempted.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  planRevectorization,
  executeRevectorization,
  DEFAULT_BATCH_SIZE,
} from '../revectorize-corpus';

describe('planRevectorization — validation / tenant isolation', () => {
  it('throws for an unknown corpus (never silently defaults)', async () => {
    await expect(
      planRevectorization({
        corpus: 'not-a-corpus',
        toModel: 'bge-m3',
        toDimension: 1024,
        organizationId: 1,
      }),
    ).rejects.toThrow(/No embedding corpus policy/);
  });

  it('fails closed without a valid organizationId', async () => {
    await expect(
      planRevectorization({
        corpus: 'ragChunks',
        toModel: 'bge-m3',
        toDimension: 1536,
        organizationId: 0,
      }),
    ).rejects.toThrow(/tenant-scoped/);
    await expect(
      planRevectorization({
        corpus: 'ragChunks',
        toModel: 'bge-m3',
        toDimension: 1536,
        organizationId: -5,
      }),
    ).rejects.toThrow(/organizationId/);
  });

  it('rejects a non-positive-integer target dimension', async () => {
    await expect(
      planRevectorization({
        corpus: 'ragChunks',
        toModel: 'bge-m3',
        toDimension: 0,
        organizationId: 1,
      }),
    ).rejects.toThrow(/toDimension/);
  });

  it('rejects an empty target model', async () => {
    await expect(
      planRevectorization({
        corpus: 'ragChunks',
        toModel: '',
        toDimension: 1536,
        organizationId: 1,
      }),
    ).rejects.toThrow(/toModel/);
  });
});

describe('planRevectorization — change classification', () => {
  it('flags a column migration + re-embed for a dimension change (documentVectors 3072 -> 1536)', async () => {
    const plan = await planRevectorization({
      corpus: 'documentVectors',
      toModel: 'bge-large-en-v1.5',
      toDimension: 1536,
      organizationId: 42,
      knownRowCount: 500,
    });
    expect(plan.table).toBe('document_vectors');
    expect(plan.fromDimension).toBe(3072);
    expect(plan.toDimension).toBe(1536);
    expect(plan.requiresColumnMigration).toBe(true);
    expect(plan.requiresReembed).toBe(true);
    expect(plan.warnings.join(' ')).toMatch(/NEW pgvector/);
    expect(plan.batchSize).toBe(DEFAULT_BATCH_SIZE);
    expect(plan.batches).toBe(Math.ceil(500 / DEFAULT_BATCH_SIZE));
  });

  it('needs no column migration and no re-embed when model + dimension are unchanged', async () => {
    const policyModel = 'text-embedding-3-small';
    const plan = await planRevectorization({
      corpus: 'ragChunks',
      toModel: policyModel,
      toDimension: 1536,
      organizationId: 7,
      knownRowCount: 10,
    });
    expect(plan.requiresColumnMigration).toBe(false);
    expect(plan.requiresReembed).toBe(false);
    // Only warning permitted here is none about model/dimension.
    expect(plan.warnings.join(' ')).not.toMatch(/SILENT retrieval/);
    expect(plan.warnings.join(' ')).not.toMatch(/NEW pgvector/);
  });

  it('warns about silent retrieval misses when the model changes but the dimension does not', async () => {
    const plan = await planRevectorization({
      corpus: 'ragChunks',
      toModel: 'nomic-embed-text-v1.5',
      toDimension: 1536,
      organizationId: 7,
      knownRowCount: 10,
    });
    expect(plan.requiresColumnMigration).toBe(false);
    expect(plan.requiresReembed).toBe(true);
    expect(plan.warnings.join(' ')).toMatch(/SILENT retrieval/);
  });
});

describe('planRevectorization — sizing', () => {
  it('calls the injected counter with org-scoped args and sizes batches', async () => {
    const countRows = vi.fn().mockResolvedValue(300);
    const plan = await planRevectorization({
      corpus: 'knowledgeEntries',
      toModel: 'bge-m3',
      toDimension: 1536,
      organizationId: 99,
      batchSize: 100,
      countRows,
    });
    expect(countRows).toHaveBeenCalledWith({
      corpus: 'knowledgeEntries',
      table: 'knowledge_entries',
      organizationId: 99,
    });
    expect(plan.rowCount).toBe(300);
    expect(plan.batches).toBe(3);
  });

  it('leaves rowCount null and warns when neither counter nor knownRowCount is given', async () => {
    const plan = await planRevectorization({
      corpus: 'ragChunks',
      toModel: 'text-embedding-3-small',
      toDimension: 1536,
      organizationId: 1,
    });
    expect(plan.rowCount).toBeNull();
    expect(plan.batches).toBeNull();
    expect(plan.warnings.join(' ')).toMatch(/Row count unresolved/);
  });

  it('reports zero batches for an empty tenant corpus', async () => {
    const plan = await planRevectorization({
      corpus: 'ragChunks',
      toModel: 'text-embedding-3-small',
      toDimension: 1536,
      organizationId: 1,
      knownRowCount: 0,
    });
    expect(plan.rowCount).toBe(0);
    expect(plan.batches).toBe(0);
  });
});

describe('executeRevectorization', () => {
  it('returns the plan unchanged for a dry run', async () => {
    const plan = await executeRevectorization({
      corpus: 'ragChunks',
      toModel: 'text-embedding-3-small',
      toDimension: 1536,
      organizationId: 1,
      knownRowCount: 5,
      dryRun: true,
    });
    expect(plan.dryRun).toBe(true);
    expect(plan.rowCount).toBe(5);
  });

  it('refuses a live (non-dry-run) migration with its deferred preconditions', async () => {
    await expect(
      executeRevectorization({
        corpus: 'ragChunks',
        toModel: 'text-embedding-3-small',
        toDimension: 1536,
        organizationId: 1,
        knownRowCount: 5,
        dryRun: false,
      }),
    ).rejects.toThrow(/not implemented in this slice/);
  });
});
