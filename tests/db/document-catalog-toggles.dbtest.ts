/**
 * The document-catalog feature exists in the toggle table — and the key the
 * bootstrap writes is the key the service reads.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `feature_toggles` is EMPTY on a fully migrated database: no migration seeds
 * it, and only one key is bootstrapped at startup. `isFeatureEnabled` returns
 * false for a key with no row — correctly, "never enable a feature we cannot
 * confirm is on" — so `ana.document_catalog` and `ana.vault_chunking` resolved
 * OFF in every deployment. The whole client-files surface (tools, coverage
 * gate, session-start recall, passage index) was dark, and with no row there
 * was nothing in the toggle table for an operator to find: not a feature
 * switched off, a feature that could not be discovered.
 *
 * ── What this pins, against a real database ─────────────────────────────────
 *   1. the bootstrap CREATES both rows where there were none, disabled, each
 *      carrying a description that says what it does;
 *   2. it is idempotent — a second boot does not duplicate them;
 *   3. it does not re-disable a row an operator has enabled, which is the one
 *      way a "refresh the description" bootstrap could destroy a deliberate
 *      decision on every restart;
 *   4. flipping the row actually turns the capability on — the key written
 *      here is the key isDocumentCatalogEnabled consults, which a fixture
 *      asserting string equality could not prove.
 *
 * Only a real database can witness 1 and 4: both are statements about a table
 * and the query the service issues against it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

let owner: Pool;
let orgId: number;

const KEYS = ['ana.document_catalog', 'ana.vault_chunking'];

async function rows() {
  const { rows: r } = await owner.query(
    `SELECT feature_key, enabled, description
       FROM feature_toggles WHERE feature_key = ANY($1) ORDER BY feature_key`,
    [KEYS],
  );
  return r as Array<{ feature_key: string; enabled: boolean; description: string | null }>;
}

async function bootstrap() {
  const { bootstrapDocumentCatalogToggles } = await import(
    '../../server/startup/document-catalog-bootstrap'
  );
  return bootstrapDocumentCatalogToggles();
}

beforeAll(async () => {
  // The env overrides short-circuit the toggle read; this suite is about the
  // toggle itself, so they must be off for the resolved state to mean anything.
  delete process.env.ANA_DOCUMENT_CATALOG_FORCE_ON;
  delete process.env.ANA_VAULT_CHUNKING_FORCE_ON;

  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    ['dbtest-toggles tenant', 'dbtest-toggles-tenant'],
  );
  orgId = Number(org.rows[0].id);
});

beforeEach(async () => {
  await owner.query('DELETE FROM feature_toggles WHERE feature_key = ANY($1)', [KEYS]);
});

afterAll(async () => {
  await owner.query('DELETE FROM feature_toggles WHERE feature_key = ANY($1)', [KEYS]).catch(() => {});
  await owner.end().catch(() => {});
});

describe('the toggle rows the deployment never had', () => {
  it('creates both, disabled, each described', async () => {
    expect(await rows()).toHaveLength(0);
    const state = await bootstrap();

    const created = await rows();
    expect(created.map(r => r.feature_key)).toEqual(KEYS.slice().sort());
    for (const r of created) {
      expect(r.enabled).toBe(false);
      expect((r.description ?? '').length).toBeGreaterThan(30);
    }
    // And the state it reports back matches: off, by toggle, not by env.
    expect(state.catalog).toEqual({ enabled: false, source: 'off' });
    expect(state.chunking).toEqual({ enabled: false, source: 'off' });
  });

  it('is idempotent — a second boot does not duplicate the rows', async () => {
    await bootstrap();
    await bootstrap();
    expect(await rows()).toHaveLength(2);
  });

  it('does not re-disable a toggle an operator turned on', async () => {
    await bootstrap();
    await owner.query(
      `UPDATE feature_toggles SET enabled = TRUE WHERE feature_key = $1`,
      ['ana.document_catalog'],
    );
    const state = await bootstrap();
    const after = (await rows()).find(r => r.feature_key === 'ana.document_catalog');
    expect(after?.enabled).toBe(true);
    expect(state.catalog).toEqual({ enabled: true, source: 'toggle' });
  });
});

/**
 * The read needs a tenant scope, and nothing at startup has one.
 *
 * `initializeFeatureToggle` establishes a system scope and says why in eight
 * lines of comment: pool instrumentation refuses any statement issued with no
 * tenant scope while RLS_ENFORCE=on, which production hard-requires, and
 * `feature_toggles` is platform reference data with no tenant column and no
 * RLS policy, so the scope is a statement of what the operation IS.
 *
 * Every word of that applies to the READ, and the read did not have one. So it
 * was refused on every enforcing deployment, `isFeatureEnabled` caught the
 * refusal and fell back to `false`, and the toggle an operator had just
 * enabled resolved OFF — for the startup line, and for anything else running
 * outside a request. The write got the scope; the read did not; only the read
 * is on the path anybody watches.
 */
describe('the toggle read holds outside a request, where the bootstrap runs', () => {
  it('reads an enabled row with no ambient tenant scope', async () => {
    const { FeatureToggleService } = await import('../../server/services/featureToggleService');
    const { getTenantScope } = await import('../../server/db/tenantStore');
    // The condition under test: no scope at all, as at startup.
    expect(getTenantScope()).toBeUndefined();

    await owner.query(
      `INSERT INTO feature_toggles (feature_key, description, enabled)
       VALUES ($1, 'dbtest', TRUE)`,
      ['ana.document_catalog'],
    );
    const state = await FeatureToggleService.readFeatureState('ana.document_catalog');
    expect(state).toEqual({ enabled: true, readable: true });
    expect(await FeatureToggleService.isFeatureEnabled('ana.document_catalog')).toBe(true);
  });

  it('a genuinely disabled row is readable and off — not the same answer as a failed read', async () => {
    const { FeatureToggleService } = await import('../../server/services/featureToggleService');
    await owner.query(
      `INSERT INTO feature_toggles (feature_key, description, enabled)
       VALUES ($1, 'dbtest', FALSE)`,
      ['ana.document_catalog'],
    );
    expect(await FeatureToggleService.readFeatureState('ana.document_catalog')).toEqual({
      enabled: false,
      readable: true,
    });
  });

  it('a key with no row is readable and off — absence is an answer, not a failure', async () => {
    const { FeatureToggleService } = await import('../../server/services/featureToggleService');
    expect(await FeatureToggleService.readFeatureState('ana.document_catalog')).toEqual({
      enabled: false,
      readable: true,
    });
  });
});

describe('the key written is the key read', () => {
  it('enabling the row turns the capability on for an organization', async () => {
    await bootstrap();
    const { isDocumentCatalogEnabled } = await import(
      '../../server/services/vault/document-catalog.service'
    );
    // Fails closed while the row is off — the state every deployment was in.
    expect(await isDocumentCatalogEnabled(orgId)).toBe(false);

    await owner.query(
      `UPDATE feature_toggles SET enabled = TRUE WHERE feature_key = $1`,
      ['ana.document_catalog'],
    );
    expect(await isDocumentCatalogEnabled(orgId)).toBe(true);
  });

  it('a per-organization enablement works without turning it on globally', async () => {
    await bootstrap();
    const { isDocumentCatalogEnabled } = await import(
      '../../server/services/vault/document-catalog.service'
    );
    await owner.query(
      `UPDATE feature_toggles SET enabled_for_organization_ids = $2::jsonb
         WHERE feature_key = $1`,
      ['ana.document_catalog', JSON.stringify([orgId])],
    );
    expect(await isDocumentCatalogEnabled(orgId)).toBe(true);
    // The startup line reports the PLATFORM flag, which is still off — which is
    // why it says an org on the per-org list is unaffected rather than "off".
    expect(await isDocumentCatalogEnabled(orgId + 999_999)).toBe(false);
  });
});
