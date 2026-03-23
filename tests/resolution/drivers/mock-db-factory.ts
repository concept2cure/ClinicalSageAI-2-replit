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
  function mockExecute(query: any): Promise<{ rows: any[] }> {
    const queryStr = String(query?.queryChunks?.[0] || query?.sql || '');

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

    // All other queries succeed silently
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
