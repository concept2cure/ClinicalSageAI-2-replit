import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';

const COMPANY_LEGAL_REGISTRY = new URL('../../../../../migrations/20261018_company_legal_registry.sql', import.meta.url);

/**
 * What assembly reads of a tenant's company legal documents before it packages
 * (5ebfcfd2c): the requirements saved on `organizations.settings`
 * (stored-legal-readiness.ts) and the registry the Vault lifecycle source reads
 * (legal-registry.ts). Creates `organizations` when the suite has none, then
 * applies the real registry migration. The suite inserts its own tenant row:
 * assembly refuses a tenant whose configuration it cannot read, and reads an
 * empty `settings` as nothing saved.
 */
export async function applyCompanyLegalReads(pglite: PGlite): Promise<void> {
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT 'Sponsor organization', settings JSONB NOT NULL DEFAULT '{}'::jsonb)`);
  await pglite.exec(readFileSync(COMPANY_LEGAL_REGISTRY, 'utf8'));
}
