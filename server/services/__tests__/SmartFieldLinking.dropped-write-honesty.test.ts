/**
 * A field update with no destination row must never be reported as stored.
 *
 * Both propagation paths in SmartFieldLinking end in
 * `if (rows.length > 0) { …update… }` with no else, so when no destination row
 * exists the value is dropped in silence. `updateField` returned Promise<void>,
 * so neither caller could tell:
 *
 *   • POST /api/field-sync/update-field answered
 *     `{ success: true, message: 'Field updated and synchronized' }` regardless;
 *   • the socket handler emitted `field-update-success` to the sender AND
 *     broadcast `field-updated` to every subscriber in the project room — so
 *     other clients rendered a value that was not in the database and reverted
 *     on the next reload.
 *
 * That is not a hypothetical for `source: 'document'`: fda_510k_stage_progress
 * has NO INSERT anywhere in server/ or the migrations (ledger L22 / L173), so
 * the table is empty on every deployment and EVERY document-sourced update is
 * dropped. `source: 'workflow'` writes fda510kDocuments, which does have real
 * writers, and is dropped only while no document row exists yet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Rows the stubbed SELECT will return, set per test. */
let selectRows: unknown[] = [];
const updates: unknown[] = [];

vi.mock('../../db', () => {
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(selectRows);
        return () => chain;
      },
    },
  );
  const updateChain: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve([]);
        if (prop === 'set') return (v: unknown) => { updates.push(v); return updateChain; };
        return () => updateChain;
      },
    },
  );
  return {
    db: { select: () => chain, update: () => updateChain, insert: () => updateChain },
    pool: { query: vi.fn(async () => ({ rows: [] })) },
    getPool: () => ({ query: vi.fn(async () => ({ rows: [] })) }),
  };
});

import { smartFieldLinking } from '../SmartFieldLinking';

// assertProjectInOrg proves tenant ownership before any propagation; it is not
// what this file is about, so it is satisfied rather than exercised.
beforeEach(() => {
  selectRows = [];
  updates.length = 0;
  vi.spyOn(
    smartFieldLinking as unknown as { assertProjectInOrg: (o: number, p: number) => Promise<void> },
    'assertProjectInOrg',
  ).mockResolvedValue(undefined);
});

const update = (source: 'workflow' | 'document', field: string) =>
  smartFieldLinking.updateField({
    organizationId: 1,
    projectId: 10,
    source,
    field,
    value: 'a value',
    timestamp: new Date(),
    metadata: { organizationId: 1, projectId: 10 },
  } as never);

describe('updateField reports what actually happened', () => {
  it('reports no-destination — never applied — when the destination row does not exist', async () => {
    selectRows = []; // nothing to write into
    const outcome = await update('workflow', 'device.deviceName');
    expect(outcome.status).not.toBe('applied');
    expect(outcome.written).toBe(0);
  });

  it('writes nothing at all when there is no destination row', async () => {
    selectRows = [];
    await update('workflow', 'device.deviceName');
    expect(updates).toHaveLength(0);
  });

  it('reports applied, with a count, when a destination row takes the value', async () => {
    selectRows = [{ id: 1, content: JSON.stringify({}), version: 1, updatedBy: 7 }];
    const outcome = await update('workflow', 'device.deviceName');
    expect(outcome.status).toBe('applied');
    expect(outcome.written).toBeGreaterThan(0);
    expect(updates.length).toBeGreaterThan(0);
  });

  it('reports not-linked — distinct from a dropped write — for a field with no configured destination', async () => {
    const outcome = await update('workflow', 'nothing.links.to.this');
    expect(outcome.status).toBe('not-linked');
    expect(outcome.targets).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it('emits fieldUpdated only when a row actually took the value', async () => {
    const seen: unknown[] = [];
    smartFieldLinking.on('fieldUpdated', u => seen.push(u));

    selectRows = [];
    await update('workflow', 'device.deviceName');
    expect(seen, 'a dropped write must not be broadcast').toHaveLength(0);

    selectRows = [{ id: 1, content: JSON.stringify({}), version: 1, updatedBy: 7 }];
    await update('workflow', 'device.deviceName');
    expect(seen, 'a real write must still be broadcast').toHaveLength(1);

    smartFieldLinking.removeAllListeners('fieldUpdated');
  });
});
