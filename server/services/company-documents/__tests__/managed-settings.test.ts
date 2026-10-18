/** Real canonical settings writer: generic settings doors cannot alter the
 * governed company profile, and its authorized write and audit commit together. */
import { createHash } from 'node:crypto';
import { stableStringify } from '../../../../shared/canonical-json';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanyDocumentProfile } from '../../../../shared/company-documents';
import { DEFAULT_TEMPLATE_SPEC } from '../../../../shared/templates/template-spec';
import { companyProfileHash, companyDocumentsAuditDetails } from '../provenance';
const digest = (value: unknown) => createHash('sha256').update(stableStringify(value)).digest('hex');

const h = vi.hoisted(() => ({
  log: [] as string[], audit: vi.fn(), stored: {} as Record<string, unknown>,
  pending: null as Record<string, unknown> | null, update: vi.fn(),
}));
const client = {
  query: vi.fn(async (sql: string) => {
    h.log.push(sql);
    if (sql === 'BEGIN') h.pending = null;
    if (sql === 'COMMIT' && h.pending) h.stored = globalThis.structuredClone(h.pending);
    if (sql === 'COMMIT' || sql === 'ROLLBACK') h.pending = null;
    return { rows: [] };
  }),
};
vi.mock('../../../../shared/schema', () => ({ organizations: { id: 'id' } }));
vi.mock('../../../db/requestDb', () => ({
  requestPgClient: () => client,
  requestDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: () => ({ for: async (mode: string) => {
      h.log.push(`LOCK ${mode}`);
      return [{ id: 7, tier: 'standard', settings: globalThis.structuredClone(h.stored) }];
    } }) }) }) }),
    update: h.update,
  }),
}));
vi.mock('../../auditService', () => ({
  writeChainedAuditRow: async (tx: unknown, entry: Record<string, unknown>) => {
    h.log.push('AUDIT');
    return h.audit(tx, entry);
  },
}));

import { CompanyDocumentsSettingRefusedError, writeTenantSettings } from '../../tenant/tenant-settings-writer';
import type { SettingsWrite } from '../../tenant/tenant-settings-writer';

const req = { user: { id: 3 }, ip: '192.0.2.3', headers: {}, get: () => undefined } as unknown as Request;
const original: CompanyDocumentProfile = {
  version: 1, revision: 4, companyName: 'Sponsor', address: 'Company address', contact: '', registrationDetails: '',
  letterhead: { ...globalThis.structuredClone(DEFAULT_TEMPLATE_SPEC), header: { text: 'Company header' } },
  importedFrom: null, applyToReports: true, applyToSubmissionCorrespondence: true,
  legalDocuments: [{
    id: 'legal_1', contentHash: 'a'.repeat(64), vaultDocumentId: '22222222-2222-4222-8222-222222222222',
    programId: '11111111-1111-4111-8111-111111111111', title: 'Legal authorization', kind: 'authorization',
    version: '2', agencies: [], countries: [], submissionTypes: [], language: 'en', active: true,
    effectiveOn: null, expiresOn: null, registeredAt: '2026-10-17T00:00:00Z', registeredBy: '3',
  }],
};
const change = (next: SettingsWrite['next'], extra: Partial<SettingsWrite> = {}): SettingsWrite => ({
  action: 'tenant_settings_changed', reason: 'Reviewed company identity', next,
  sections: () => ['companyDocuments'], ...extra,
});

beforeEach(() => {
  h.log = [];
  h.stored = { security: { mfaRequired: true }, companyDocuments: globalThis.structuredClone(original) };
  h.pending = null;
  h.audit.mockReset();
  h.audit.mockResolvedValue({ id: 'audit-1' });
  h.update.mockReset();
  h.update.mockImplementation(() => ({ set: (values: { settings: Record<string, unknown> }) => ({
    where: () => ({ returning: async () => {
      h.log.push('UPDATE');
      h.pending = globalThis.structuredClone(values.settings);
      return [{ id: 7, settings: globalThis.structuredClone(values.settings) }];
    } }),
  }) }));
  client.query.mockClear();
});

describe('companyDocuments is a managed organization setting', () => {
  it('rolls back settings and audit when a governed before-commit projection fails', async () => {
    const before = globalThis.structuredClone(h.stored);
    const projection = vi.fn(async () => { h.log.push('PROJECTION'); throw new Error('Evidence changed before commit'); });
    await expect(writeTenantSettings(req, 7, change(current => ({ ...current,
      companyDocuments: { ...original, revision: 5, companyName: 'Would be changed' },
    }), { companyDocumentsDoor: true, beforeCommit: projection }))).rejects.toThrow('Evidence changed before commit');
    expect(projection).toHaveBeenCalledWith(client, expect.any(Object), expect.objectContaining({ companyDocuments: expect.objectContaining({ revision: 5 }) }));
    expect(h.log.indexOf('AUDIT')).toBeLessThan(h.log.indexOf('PROJECTION'));
    expect(h.log).toContain('ROLLBACK');
    expect(h.log).not.toContain('COMMIT');
    expect(h.stored).toEqual(before);
  });
  it.each([
    ['spoofed revision and approval', (current: Record<string, unknown>) => ({ ...current, companyDocuments: { revision: 999, legalDocuments: [{ approved: true }] } })],
    ['null clearing', (current: Record<string, unknown>) => ({ ...current, companyDocuments: null })],
    ['removed section', (current: Record<string, unknown>) => ({ security: current.security })],
    ['in-place mutation', (current: Record<string, unknown>) => {
      (current.companyDocuments as { revision: number }).revision = 999;
      return current;
    }],
  ] as const)('refuses %s through a generic settings door before update or audit', async (_label, next) => {
    const before = globalThis.structuredClone(h.stored);
    await expect(writeTenantSettings(req, 7, change(next))).rejects.toBeInstanceOf(CompanyDocumentsSettingRefusedError);
    expect(h.log).toEqual(['BEGIN', 'LOCK update', 'ROLLBACK']);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.stored).toEqual(before);
  });

  it('also refuses creation through a generic settings door when no company profile exists', async () => {
    delete h.stored.companyDocuments;
    await expect(writeTenantSettings(req, 7, change(current => ({ ...current, companyDocuments: original })))).rejects.toBeInstanceOf(CompanyDocumentsSettingRefusedError);
    expect(h.stored).not.toHaveProperty('companyDocuments');
    expect(h.audit).not.toHaveBeenCalled();
  });

});

describe('company profile and canonical registry audit provenance', () => {
  it('allows the governed company door and records changed field names with its supplied reason', async () => {
    const result = await writeTenantSettings(req, 7, change(current => ({
      ...current, companyDocuments: { ...original, revision: 5, companyName: 'Changed sponsor' },
    }), { companyDocumentsDoor: true }));
    expect(result?.companyDocuments).toMatchObject({ revision: 5, companyName: 'Changed sponsor' });
    expect(h.stored.companyDocuments).toEqual(result?.companyDocuments);
    expect(h.log).toEqual(['BEGIN', 'LOCK update', 'UPDATE', 'AUDIT', 'COMMIT']);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit.mock.calls[0][0]).toBe(client);
    expect(h.audit.mock.calls[0][1]).toMatchObject({
      tenantId: 7, userId: 3, resourceType: 'organization_settings', resourceId: '7',
      reason: 'Reviewed company identity',
      details: { sections: ['companyDocuments'], changedFields: { companyDocuments: ['companyName', 'revision'] } },
    });
    expect(h.audit.mock.calls[0][1].details.values).toEqual({});
    expect(h.audit.mock.calls[0][1].details.companyDocuments).toMatchObject({
      before: { revision: 4, sha256: companyProfileHash(original) },
      after: { revision: 5, sha256: companyProfileHash(result?.companyDocuments as CompanyDocumentProfile) },
      brandingPolicy: { before: { required: false, approvedDefaultDesignId: null }, after: { required: false, approvedDefaultDesignId: null } },
      requirements: { beforeSha256: digest([]), afterSha256: digest([]) },
      legalChanges: [],
    });
  });

  it('records legal archival through the unchanged original Vault reference and digest', async () => {
    const result = await writeTenantSettings(req, 7, change(current => ({
      ...current, companyDocuments: { ...original, revision: 5,
        legalDocuments: original.legalDocuments.map(document => ({ ...document, active: false })),
      },
    }), { companyDocumentsDoor: true }));
    const pointer = { vaultDocumentId: original.legalDocuments[0].vaultDocumentId, contentHash: original.legalDocuments[0].contentHash };
    expect(h.audit.mock.calls[0][1].details.companyDocuments).toMatchObject({
      before: { revision: 4, sha256: companyProfileHash(original) },
      after: { revision: 5, sha256: companyProfileHash(result?.companyDocuments as CompanyDocumentProfile) },
      brandingPolicy: { before: { required: false, approvedDefaultDesignId: null }, after: { required: false, approvedDefaultDesignId: null } },
      requirements: { beforeSha256: digest([]), afterSha256: digest([]) },
      legalChanges: [{ id: 'legal_1', before: { ...pointer, active: true, sha256: digest(original.legalDocuments[0]) }, after: { ...pointer, active: false, sha256: digest({ ...original.legalDocuments[0], active: false }) } }],
    });
    expect((result?.companyDocuments as CompanyDocumentProfile).legalDocuments[0]).toMatchObject({ ...pointer, active: false });
  });

  it('records canonical registry proof supplied internally while storing no legal array in settings', async () => {
    const after = { ...original, revision: 5, legalDocuments: original.legalDocuments.map(document => ({ ...document, active: false })) };
    const presentation: Partial<CompanyDocumentProfile> = { ...after };
    delete presentation.legalDocuments;
    await writeTenantSettings(req, 7, change(current => ({ ...current, companyDocuments: presentation }), {
      companyDocumentsDoor: true,
      companyDocumentsAudit: () => companyDocumentsAuditDetails(original, after, 'Sponsor'),
    }));
    expect(h.stored.companyDocuments).not.toHaveProperty('legalDocuments');
    expect(h.audit.mock.calls[0][1].details.companyDocuments.legalChanges[0]).toMatchObject({ id: 'legal_1',
      before: { active: true, sha256: digest(original.legalDocuments[0]) }, after: { active: false, sha256: digest(after.legalDocuments[0]) } });
  });

  it('keeps company prose, legal text and logo bytes out of the append-only audit while retaining provenance', async () => {
    const markers = ['private-company-name', 'private-company-address', 'private-header-text', 'private-legal-title'];
    const logoBase64 = Buffer.from('private-logo-bytes-never-log').toString('base64');
    const privateProfile: CompanyDocumentProfile = {
      ...original, companyName: markers[0], address: markers[1],
      letterhead: { ...original.letterhead, header: { text: markers[2] },
        brand: { logo: { mimeType: 'image/png', dataBase64: logoBase64, placement: 'header' } },
      },
      legalDocuments: original.legalDocuments.map(document => ({ ...document, title: markers[3] })),
    };
    h.stored.companyDocuments = privateProfile;
    await writeTenantSettings(req, 7, change(current => ({
      ...current, companyDocuments: { ...privateProfile, revision: 5 },
    }), { companyDocumentsDoor: true }));
    const auditJson = JSON.stringify(h.audit.mock.calls[0][1]);
    for (const marker of [...markers, logoBase64]) expect(auditJson).not.toContain(marker);
    expect(h.audit.mock.calls[0][1].details.companyDocuments).toMatchObject({
      before: { revision: 4, sha256: companyProfileHash(privateProfile) },
      after: { revision: 5, sha256: companyProfileHash({ ...privateProfile, revision: 5 }) },
    });
  });

  it('preserves the exact company profile during an unrelated settings update', async () => {
    const result = await writeTenantSettings(req, 7, change(current => ({
      ...current, security: { mfaRequired: false },
    }), { sections: () => ['security'], reason: 'Reviewed security policy' }));
    expect(result?.companyDocuments).toEqual(original);
    expect(h.stored.companyDocuments).toEqual(original);
    expect(h.stored.security).toEqual({ mfaRequired: false });
    expect(h.log.at(-1)).toBe('COMMIT');
    expect(h.audit.mock.calls[0][1].details).not.toHaveProperty('companyDocuments');
  });

  it('rolls back an authorized company change when its chained audit write fails', async () => {
    h.audit.mockRejectedValue(new Error('Audit persistence failed'));
    const before = globalThis.structuredClone(h.stored);
    await expect(writeTenantSettings(req, 7, change(current => ({
      ...current, companyDocuments: { ...original, revision: 5 },
    }), { companyDocumentsDoor: true }))).rejects.toThrow('Audit persistence failed');
    expect(h.log).toEqual(['BEGIN', 'LOCK update', 'UPDATE', 'AUDIT', 'ROLLBACK']);
    expect(h.stored).toEqual(before);
    expect(h.pending).toBeNull();
  });
});
