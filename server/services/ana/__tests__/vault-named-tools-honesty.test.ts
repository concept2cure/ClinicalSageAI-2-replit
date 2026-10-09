/**
 * The tools named "vault" read the Artifacts Center, not the Vault — and must
 * never tell a user a Vault file does not exist.
 *
 * list_vault_documents and read_vault_document read concept2cure_artifacts:
 * the governed Data Room / Artifacts Center records. The Vault launch app
 * stores the files a client uploads in vault.documents, a different table.
 * The tools' names, descriptions, progress labels and empty answers all said
 * "vault", so a user who uploaded a protocol to the Vault and asked AnA about
 * it was told "No vault documents match the filters." or "No vault document
 * '…' in this organization." — a false statement of absence about a file that
 * is exactly where they put it.
 *
 * That is the failure this whole client-files lane exists to end, and it is
 * live at launch: with 'ana.document_catalog' off (the default for every new
 * organisation) governedToolsetFor withholds the tools that DO read the Vault,
 * which leaves these two as the only document tools AnA has with "vault" in
 * the name. Their answers now say what they searched and point at the Vault
 * rather than denying it.
 */
import { describe, it, expect, vi } from 'vitest';

const pool = vi.hoisted(() => ({
  query: vi.fn(async () => ({ rows: [] as unknown[] })),
  connect: vi.fn(),
}));
vi.mock('../../../db', () => ({ getPool: () => pool, pool, db: {} }));

import { getToolHandler } from '../AnaToolExecutor';
import { LIST_VAULT_DOCUMENTS, READ_VAULT_DOCUMENT } from '../document-surface-tool-defs';

const CTX = { organizationId: 5, userId: 41, organizationUuid: 'org-uuid' };
const run = async (name: string, input: Record<string, unknown>) =>
  JSON.parse(await getToolHandler(name)!(input, CTX as never));

const VAULT_ABSENCE = /No vault document/i;

describe('Artifacts Center tools named "vault"', () => {
  it('an empty listing says what it searched, not that the Vault is empty', async () => {
    const out = await run('list_vault_documents', { query: 'protocol' });
    expect(out.message).not.toMatch(VAULT_ABSENCE);
    expect(out.message).toMatch(/Artifacts Center/);
    expect(out.message).toMatch(/uploaded to the Vault/i);
  });

  it('an unknown id is not reported as absent from the Vault', async () => {
    const out = await run('read_vault_document', { artifact_id: 'd3b07384-d113-4ec6-a1b2-5f0e2c1a9b7e' });
    expect(out.error).not.toMatch(VAULT_ABSENCE);
    expect(out.error).toMatch(/Artifacts Center/);
  });

  it('their descriptions tell the model which store they read', () => {
    for (const def of [LIST_VAULT_DOCUMENTS, READ_VAULT_DOCUMENT]) {
      expect(def.description, def.name).toMatch(/Artifacts Center/);
      expect(def.description, def.name).toMatch(/not the files uploaded to the Vault/i);
    }
  });
});
