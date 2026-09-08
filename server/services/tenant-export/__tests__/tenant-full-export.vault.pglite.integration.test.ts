/**
 * The tenant export includes the vault.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `discoverTenantTables` swept `WHERE c.table_schema = 'public'`. `vault.documents`
 * is in the `vault` schema, so it was never discovered — and this module's own
 * opening paragraph is about exactly that omission. It says a curated manifest
 * would hand a customer "their programme records and none of their documents,
 * VAULT CONTENTS, uploads, projects or workspaces — while the purge deleted all
 * of them", and offers itself as the fix. It then discovered no vault table.
 *
 * So the export claimed to be catalog-driven and complete while omitting the
 * customer's actual regulatory documents. Under GDPR Art. 20 that is the item a
 * data return most obviously has to contain.
 *
 * ── Why PGlite ───────────────────────────────────────────────────────────────
 * The behaviour under test IS a catalog query. A mocked `information_schema`
 * would be a restatement of the fix rather than a test of it, and the thing that
 * broke — a schema predicate — is invisible unless a real catalog answers.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { discoverTenantTables } from '../tenant-full-export.service';

let db: PGlite;
/** PGlite exposes query/connect; the service only needs `query`. */
const asClient = () => ({ query: (sql: string, params?: unknown[]) => db.query(sql, params) }) as never;

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`
    CREATE SCHEMA vault;
    -- A public tenant table, discovered before and after.
    CREATE TABLE public.regulatory_programs (id SERIAL PRIMARY KEY, organization_id INTEGER);
    -- The customer's documents, in the schema the sweep could not see.
    CREATE TABLE vault.documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id INTEGER,
      document_title TEXT
    );
    -- Tenant-keyed but in a schema NOT on the include list: internal/derived
    -- state that must stay out of a customer's data return.
    CREATE SCHEMA cortex;
    CREATE TABLE cortex.derived_signals (id SERIAL PRIMARY KEY, organization_id INTEGER);
    -- No tenant key at all: reference data, never a tenant's.
    CREATE TABLE public.country_codes (code TEXT PRIMARY KEY);
    -- The excluded-name case, to prove exclusions are applied per schema.
    -- api_keys is on EXPORT_EXCLUDED_TABLES (a credential, not a record the
    -- tenant should receive back in plaintext). audit_logs deliberately is NOT:
    -- the purge preserves the audit trail, but the EXPORT hands it over — two
    -- lists, two reasons, and conflating them is easy.
    CREATE TABLE public.api_keys (id SERIAL PRIMARY KEY, organization_id INTEGER);
    CREATE TABLE vault.api_keys (id SERIAL PRIMARY KEY, organization_id INTEGER);
  `);
});

afterAll(async () => {
  await db?.close?.();
});

describe('discoverTenantTables — schema coverage', () => {
  it('discovers vault.documents, which the public-only sweep could not', async () => {
    const found = await discoverTenantTables(asClient());
    const vaultDocs = found.find(f => f.schema === 'vault' && f.table === 'documents');
    expect(vaultDocs).toBeDefined();
    expect(vaultDocs!.tenantColumn).toBe('organization_id');
  });

  it('still discovers public tenant tables', async () => {
    const found = await discoverTenantTables(asClient());
    expect(found.some(f => f.schema === 'public' && f.table === 'regulatory_programs')).toBe(true);
  });

  it('does NOT sweep schemas that are not on the include list', async () => {
    // The reason the list is explicit rather than "every schema": cortex, ai,
    // compliance and identity hold derived, internal or cross-tenant state, and
    // sweeping them wholesale would put material in a customer's data return
    // that is not the customer's.
    const found = await discoverTenantTables(asClient());
    expect(found.some(f => f.schema === 'cortex')).toBe(false);
  });

  it('ignores tables with no tenant key', async () => {
    const found = await discoverTenantTables(asClient());
    expect(found.some(f => f.table === 'country_codes')).toBe(false);
  });
});

describe('exclusions are per schema, not per bare name', () => {
  it('excludes public.api_keys — a credential is not a record to hand back', async () => {
    const found = await discoverTenantTables(asClient());
    expect(found.some(f => f.schema === 'public' && f.table === 'api_keys')).toBe(false);
  });

  it('does not let that exclusion silently reach a same-named table elsewhere', async () => {
    // A bare-name exclusion applied globally would drop vault.api_keys too — a
    // table nobody considered, removed from a data return by coincidence of
    // naming. Keyed by schema.table, the two are distinct.
    const found = await discoverTenantTables(asClient());
    expect(found.some(f => f.schema === 'vault' && f.table === 'api_keys')).toBe(true);
  });
});
