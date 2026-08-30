/**
 * Tests for the Vault coexistence workflow layer: field mapping (pure) and the
 * push/pull sync service against injected fakes. No network, no DB.
 */

import { describe, it, expect, vi } from 'vitest';
import { toVaultFields, fromVaultDocument } from '../field-mapping';
import { VaultSyncService } from '../vault-sync-service';
import type { VaultDocument } from '../client';

describe('toVaultFields', () => {
  it('maps title + section + known document type to Vault fields', () => {
    const fields = toVaultFields(
      { title: 'CSR Draft', documentType: 'csr', sectionCode: '5.3.5.1' },
      { lifecycle: 'Draft to Approved' },
    );
    expect(fields).toEqual({
      name__v: 'CSR Draft (5.3.5.1)',
      type__v: 'Clinical Study Report',
      lifecycle__v: 'Draft to Approved',
    });
  });

  it('honors per-org type overrides and extra constant fields', () => {
    const fields = toVaultFields(
      { title: 'IB v4', documentType: 'ib' },
      { typeMap: { ib: 'Investigator Brochure (Custom)' }, extraFields: { 'country__v': 'US' } },
    );
    expect(fields['type__v']).toBe('Investigator Brochure (Custom)');
    expect(fields['country__v']).toBe('US');
    expect(fields['name__v']).toBe('IB v4'); // no section suffix without sectionCode
  });

  it('omits type__v for an unknown document type rather than guessing', () => {
    const fields = toVaultFields({ title: 'Memo', documentType: 'unknown_kind' });
    expect(fields['type__v']).toBeUndefined();
  });
});

describe('fromVaultDocument', () => {
  it('recovers title, section code, and the C2C document type', () => {
    const doc: VaultDocument = {
      id: 9,
      name: 'CSR Draft (5.3.5.1)',
      type: 'Clinical Study Report',
      status: 'Approved',
      lifecycle: 'Draft to Approved',
      raw: {},
    };
    const meta = fromVaultDocument(doc);
    expect(meta.title).toBe('CSR Draft');
    expect(meta.sectionCode).toBe('5.3.5.1');
    expect(meta.documentType).toBe('csr');
    expect(meta.vaultStatus).toBe('Approved');
  });

  it('passes unmapped Vault types through verbatim (nothing silently dropped)', () => {
    const meta = fromVaultDocument({ id: 1, name: 'Site List', type: 'Custom Vault Type', raw: {} });
    expect(meta.documentType).toBe('Custom Vault Type');
    expect(meta.sectionCode).toBeNull();
  });
});

function makeFakes() {
  const client = {
    uploadDocument: vi.fn().mockResolvedValue({ documentId: 4711, majorVersion: 0, minorVersion: 1 }),
    getDocument: vi.fn().mockResolvedValue({
      id: 4711,
      name: 'Protocol v2 (5.3.5.1)',
      type: 'Protocol',
      majorVersion: 1,
      minorVersion: 0,
      raw: {},
    } satisfies VaultDocument),
    downloadDocumentFile: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 vault-bytes')),
  };
  const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
  const audit = { logAction: vi.fn().mockResolvedValue({ persisted: true, chained: true, tamperProof: true }) };
  const svc = new VaultSyncService(client as any, pool, audit);
  return { client, pool, audit, svc };
}

const LOCAL = { documentTable: 'coauthor_documents', documentId: 42 };

describe('VaultSyncService.pushDocument', () => {
  it('uploads with mapped fields, upserts the link, and audits — in one call path', async () => {
    const { client, pool, audit, svc } = makeFakes();
    const result = await svc.pushDocument({
      organizationId: 7,
      userId: 3,
      local: LOCAL,
      meta: { title: 'CSR Draft', documentType: 'csr', sectionCode: '5.3.5.1' },
      fileName: 'csr-draft.docx',
      bytes: Buffer.from('docx'),
    });

    expect(result.documentId).toBe(4711);
    expect(result.contentSha256).toMatch(/^[0-9a-f]{64}$/);

    expect(client.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({ fields: expect.objectContaining({ name__v: 'CSR Draft (5.3.5.1)' }) }),
    );
    // Link upsert carries org scoping, the Vault id, and the push direction.
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO veeva_vault_links');
    expect(sql).toContain('ON CONFLICT (organization_id, document_table, document_id)');
    expect(params).toEqual(expect.arrayContaining([7, 'coauthor_documents', 42, 4711, 'push']));

    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'VEEVA_VAULT_PUSH', organizationId: 7, resourceId: 42 }),
    );
  });

  it('fails the push when the audit write fails (no unaudited sync)', async () => {
    const { audit, svc } = makeFakes();
    audit.logAction.mockRejectedValue(new Error('audit store down'));
    await expect(
      svc.pushDocument({
        organizationId: 7,
        userId: 3,
        local: LOCAL,
        meta: { title: 'X' },
        fileName: 'x.pdf',
        bytes: Buffer.from('x'),
      }),
    ).rejects.toThrow('audit store down');
  });
});

describe('VaultSyncService.pullDocument', () => {
  it('fetches metadata + file, maps it back, links, and audits', async () => {
    const { pool, audit, svc } = makeFakes();
    const result = await svc.pullDocument({
      organizationId: 7,
      userId: 3,
      vaultDocumentId: 4711,
      local: LOCAL,
    });

    expect(result.meta.title).toBe('Protocol v2');
    expect(result.meta.sectionCode).toBe('5.3.5.1');
    expect(result.meta.documentType).toBe('protocol');
    expect(result.bytes.toString()).toContain('vault-bytes');

    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual(expect.arrayContaining([7, 4711, 'pull']));
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'VEEVA_VAULT_PULL', resourceId: 42 }),
    );
  });
});
