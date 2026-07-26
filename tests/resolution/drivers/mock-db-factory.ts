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
  function sqlText(query: any): string {
    const chunks: any[] = query?.queryChunks ?? [];
    if (chunks.length === 0) return String(query?.sql ?? '');
    return chunks
      .map(c => (Array.isArray(c?.value) ? c.value.join('') : typeof c === 'string' ? c : ''))
      .join(' ');
  }

  function mockExecute(query: any): Promise<{ rows: any[] }> {
    const queryStr = sqlText(query);

    // Artifact status lookup
    if (queryStr.includes('concept2cure_artifacts') && queryStr.includes('SELECT')) {
      if (state.artifacts.length > 0) {
        return Promise.resolve({ rows: [{ status: state.artifacts[0].status }] });
      }
      return Promise.resolve({ rows: [] });
    }

    // Document status lookup
    if (queryStr.includes('unified_documents') && queryStr.includes('SELECT')) {
      if (state.documents.length > 0) {
        return Promise.resolve({ rows: [{ status: state.documents[0].status }] });
      }
      return Promise.resolve({ rows: [] });
    }

    // Assumption supersession check
    if (queryStr.includes('supersession_records') && queryStr.includes('SELECT') && queryStr.includes('confirmed')) {
      const confirmed = state.supersessions.find(s => s.state === 'confirmed');
      return Promise.resolve(confirmed
        ? { rows: [{ state: 'confirmed' }] }
        : { rows: [] }
      );
    }

    // Execution receipt persistence (ADR-0009).
    //
    // receipt-store.persistExecutionReceipt does INSERT … RETURNING id and reads
    // inserted[0].id. The catch-all below returns { rows: [] }, so that read threw
    // and bundle-executor — which treats an unpersistable receipt as a FAILED
    // execution, deliberately — surfaced it as 8 orchestrator failures.
    //
    // The executor's behaviour is correct and is NOT relaxed here: effects that
    // are durable but unproven must not be reported as a completed correction.
    // What was wrong is this mock, which did not model the table the code writes.
    if (queryStr.includes('bundle_execution_receipts')) {
      if (queryStr.includes('INSERT')) {
        receiptSeq += 1;
        const id = `mock-receipt-${receiptSeq}`;
        state.receipts.push({ id });
        return Promise.resolve({ rows: [{ id }] });
      }
      // Verifier reads (matches-snapshot / changed-since-execution) have no
      // stored rows to find in a mock run.
      return Promise.resolve({ rows: [] });
    }

    // All other queries succeed silently.
    //
    // NOTE: this catch-all is the same hazard the schema-contract tier exists to
    // close — a mock that accepts any statement and returns an empty result set
    // cannot tell a working query from a nonexistent table. It is tolerable here
    // only because these are decision-matrix tests, not storage tests.
    return Promise.resolve({ rows: [] });
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
    },
    drivers: {
      supersession: supersessionDriver,
      artifact: artifactDriver,
    },
  };
}
