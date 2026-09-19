/**
 * Mock DB Factory — Operation-Scoped Drizzle Mock
 *
 * Creates a Drizzle-compatible mock that delegates to intent drivers.
 * Each operation (SELECT, INSERT, UPDATE) is handled separately.
 * No shared chain builders. No cross-operation contamination.
 *
 * IMPORTANT: No vitest dependency. Plain functions only.
 * This keeps the factory independent of vi.mock hoisting.
 */

import type { ResolutionTestState } from './resolution-test-state';
import { SupersessionDriver } from './supersession-driver';
import { ArtifactDriver } from './artifact-driver';
import { sqlText } from './drizzle-sql-text';

export function createMockDb(state: ResolutionTestState) {
  /** Monotonic id source for persisted execution receipts. */
  let receiptSeq = 0;
  const supersessionDriver = new SupersessionDriver(state);
  const artifactDriver = new ArtifactDriver(state);

  // ─────────────────────────────────────────────────────────
  // SELECT — reads state, never mutates
  // ─────────────────────────────────────────────────────────
  function createSelectChain() {
    let selectedTable = '';

    const chain: any = {
      from(table: any) {
        selectedTable = table?.name || table?.[Symbol.for('drizzle:Name')] || '';
        return chain;
      },
      where() { return chain; },
      limit() {
        return resolveSelectResult(selectedTable);
      },
      orderBy() {
        if (selectedTable === 'resolution_bundle_items') {
          return Promise.resolve(
            [...state.bundleItems].sort((a, b) => a.sortOrder - b.sortOrder)
          );
        }
        return Promise.resolve([]);
      },
    };

    return chain;
  }

  function resolveSelectResult(tableName: string): Promise<any[]> {
    switch (tableName) {
      case 'resolution_bundles': {
        const bundle = state.bundles[0];
        return Promise.resolve(bundle ? [bundle] : []);
      }
      case 'resolution_plans': {
        const plan = state.plans[0];
        return Promise.resolve(plan ? [plan] : []);
      }
      case 'supersession_records': {
        // The driver manages business logic.
        // Mock returns the latest record for confirm lookups.
        const latest = state.supersessions[state.supersessions.length - 1];
        return Promise.resolve(latest ? [latest] : []);
      }
      default:
        return Promise.resolve([]);
    }
  }

  // ─────────────────────────────────────────────────────────
  // INSERT — creates records via drivers, NOT via chain gymnastics
  // ─────────────────────────────────────────────────────────
  function createInsertChain() {
    let pendingInsert: any = null;

    return {
      values(data: any) {
        pendingInsert = Array.isArray(data) ? data[0] : data;
        return this;
      },
      returning() {
        if (!pendingInsert) return Promise.resolve([]);

        // Supersession insert → route to driver
        if (pendingInsert.supersededObjectType) {
          try {
            const record = supersessionDriver.create({
              organizationId: pendingInsert.organizationId,
              projectId: pendingInsert.projectId,
              supersededObjectType: pendingInsert.supersededObjectType,
              supersededObjectId: pendingInsert.supersededObjectId,
              supersededObjectTitle: pendingInsert.supersededObjectTitle,
              successorObjectType: pendingInsert.successorObjectType,
              successorObjectId: pendingInsert.successorObjectId,
              successorObjectTitle: pendingInsert.successorObjectTitle,
              rationale: pendingInsert.rationale,
              resolutionPlanId: pendingInsert.resolutionPlanId,
              bundleId: pendingInsert.bundleId,
              createdById: pendingInsert.createdById,
            });
            pendingInsert = null;
            return Promise.resolve([record]);
          } catch (error) {
            pendingInsert = null;
            throw error;
          }
        }

        // Generic insert
        const result = { id: `mock-${Date.now()}`, ...pendingInsert };
        pendingInsert = null;
        return Promise.resolve([result]);
      },
    };
  }

  // ─────────────────────────────────────────────────────────
  // UPDATE — mutates state, routes by table + data shape
  // ─────────────────────────────────────────────────────────
  const PLAN_STATES = new Set([
    'unresolved', 'proposed_resolution', 'in_resolution',
    'resolved_pending_review', 'resolved_approved', 'superseded', 'cancelled',
  ]);
  const BUNDLE_STATES = new Set([
    'draft', 'proposed', 'in_progress', 'pending_review',
    'approved', 'applied', 'rejected', 'cancelled',
  ]);

  function createUpdateChain(tableName: string) {
    let updateData: any = null;

    const chain: any = {
      set(data: any) {
        updateData = data;

        if (data.state) {
          // Route state update to correct entity based on table name
          if (tableName === 'resolution_plans' && state.plans[0] && PLAN_STATES.has(data.state)) {
            state.plans[0].state = data.state;
          } else if (tableName === 'resolution_bundles' && state.bundles[0] && BUNDLE_STATES.has(data.state)) {
            state.bundles[0].state = data.state;
          } else if (tableName === 'resolution_bundle_items') {
            // Item status updates — find and update specific item
            // (handled below in where chain if needed)
          } else {
            // Fallback: try both (backwards compatible with existing tests)
            if (state.bundles[0] && BUNDLE_STATES.has(data.state)) {
              state.bundles[0].state = data.state;
            }
            if (state.plans[0] && PLAN_STATES.has(data.state)) {
              state.plans[0].state = data.state;
            }
          }
        }

        // Receipt memo
        if (data.resolutionMemo && state.bundles[0]) {
          state.bundles[0].resolutionMemo = data.resolutionMemo;
        }

        return chain;
      },
      where() { return chain; },
      returning() {
        // Supersession confirm/revert
        if (updateData?.state === 'confirmed' || updateData?.state === 'reverted') {
          const latest = state.supersessions[state.supersessions.length - 1];
          if (latest) {
            latest.state = updateData.state;
            if (updateData.state === 'confirmed') {
              latest.confirmedAt = new Date();
              latest.confirmedById = updateData.confirmedById;
            }
            return Promise.resolve([latest]);
          }
        }
        return Promise.resolve([{ ...updateData }]);
      },
    };

    return chain;
  }

  // ─────────────────────────────────────────────────────────
  // EXECUTE — raw SQL for getObjectState, markSuperseded, etc.
  // ─────────────────────────────────────────────────────────
  /**
   * Reconstruct the SQL text of a drizzle `sql` template.
   *
   * This used to be `String(query?.queryChunks?.[0] || query?.sql || '')`, which
   * stringifies a StringChunk as "[object Object]" — so EVERY branch below
   * silently failed to match and every raw query fell through to `{ rows: [] }`.
   * The mock looked like it modelled artifact and supersession lookups; it
   * modelled nothing. Exposed when the ADR-0009 receipt insert needed a real
   * RETURNING row rather than an empty result.
   *
   * A StringChunk holds its text in `.value` as a string[]; params are separate
   * chunks and contribute no text.
   */
  let versionSeq = 0;

  /**
   * Which statement gets which rows, IN ORDER — the first `when` that matches
   * answers. Order is load-bearing and is why this is one ordered list rather
   * than a lookup: stageRewrite issues INSERT … SELECT … FROM
   * concept2cure_artifacts, which contains both 'concept2cure_artifacts' and
   * 'SELECT', so the artifact-status route below would answer it with a status
   * row if it came first.
   */
  const ROUTES: Array<{ when: (q: string) => boolean; rows: () => { rows: any[] } }> = [
    {
      /* Staged rewrite version insert (ledger L177). stageRewrite now reads
         RETURNING id and treats zero rows as "no such artifact in this tenant" —
         it used to return true regardless, reporting a rewrite the database
         never took. So this models the match honestly: a row comes back only
         when the scenario actually has an artifact. */
      when: (q) => q.includes('INSERT INTO concept2cure_artifact_versions'),
      rows: () => {
        versionSeq += 1;
        return state.artifacts.length > 0 ? { rows: [{ id: `mock-version-${versionSeq}` }] } : { rows: [] };
      },
    },
    {
      /* Span lineage (ledger L177). stageRewrite attributes the rewritten text
         in the same transaction, and the span writer reads rows[0].id.

         A STUB, not a model — in the spirit of the catch-all at the bottom of
         this list: these are decision-matrix tests, not storage tests. The
         insert hands back an id, and the coverage read reports one span wide
         enough to satisfy assertLineageCoversContent. What the gate actually
         records is proven against the real schema in the PGlite lineage tests. */
      when: (q) => q.includes('document_span_lineage') && q.includes('INSERT'),
      rows: () => ({ rows: [{ id: 'mock-span' }] }),
    },
    {
      when: (q) => q.includes('document_span_lineage') && q.includes('char_start'),
      rows: () => ({ rows: [{ char_start: 0, char_end: 1_000_000 }] }),
    },
    {
      when: (q) => q.includes('document_span_lineage'),
      rows: () => ({ rows: [] }),
    },
    {
      // Artifact status lookup
      when: (q) => q.includes('concept2cure_artifacts') && q.includes('SELECT'),
      rows: () =>
        state.artifacts.length > 0 ? { rows: [{ status: state.artifacts[0].status }] } : { rows: [] },
    },
    {
      // Document status lookup
      when: (q) => q.includes('unified_documents') && q.includes('SELECT'),
      rows: () =>
        state.documents.length > 0 ? { rows: [{ status: state.documents[0].status }] } : { rows: [] },
    },
    {
      // Assumption supersession check
      when: (q) => q.includes('supersession_records') && q.includes('SELECT') && q.includes('confirmed'),
      rows: () => (state.supersessions.some((x) => x.state === 'confirmed')
        ? { rows: [{ state: 'confirmed' }] }
        : { rows: [] }),
    },
    {
      /* Execution receipt persistence (ADR-0009).

         receipt-store.persistExecutionReceipt does INSERT … RETURNING id and
         reads inserted[0].id. The catch-all below returns { rows: [] }, so that
         read threw and bundle-executor — which treats an unpersistable receipt
         as a FAILED execution, deliberately — surfaced it as 8 orchestrator
         failures. The executor's behaviour is correct and is NOT relaxed here:
         effects that are durable but unproven must not be reported as a
         completed correction. What was wrong is this mock, which did not model
         the table the code writes. */
      when: (q) => q.includes('bundle_execution_receipts') && q.includes('INSERT'),
      rows: () => {
        receiptSeq += 1;
        const id = `mock-receipt-${receiptSeq}`;
        state.receipts.push({ id });
        return { rows: [{ id }] };
      },
    },
    {
      // Verifier reads (matches-snapshot / changed-since-execution) have no
      // stored rows to find in a mock run.
      when: (q) => q.includes('bundle_execution_receipts'),
      rows: () => ({ rows: [] }),
    },
  ];

  /**
   * All other queries succeed silently.
   *
   * NOTE: that catch-all is the same hazard the schema-contract tier exists to
   * close — a mock that accepts any statement and returns an empty result set
   * cannot tell a working query from a nonexistent table. It is tolerable here
   * only because these are decision-matrix tests, not storage tests.
   */
  function mockExecute(query: any): Promise<{ rows: any[] }> {
    const queryStr = sqlText(query);
    const route = ROUTES.find((r) => r.when(queryStr));
    return Promise.resolve(route ? route.rows() : { rows: [] });
  }

  // ─────────────────────────────────────────────────────────
  // ASSEMBLED MOCK
  // ─────────────────────────────────────────────────────────
  return {
    db: {
      select: () => createSelectChain(),
      insert: () => createInsertChain(),
      update: (table: any) => {
        const tName = table?.name || table?.[Symbol.for('drizzle:Name')] || '';
        return createUpdateChain(tName);
      },
      execute: mockExecute,
      /* stageRewrite wraps its version write and its lineage in one transaction
         (ledger L177). The mock has no real transaction to give it, so the
         callback runs against the same execute — enough for these
         decision-matrix tests, which assert outcomes rather than atomicity. */
      transaction: async (fn: (tx: any) => any) => fn({ execute: mockExecute }),
    },
    drivers: {
      supersession: supersessionDriver,
      artifact: artifactDriver,
    },
  };
}
