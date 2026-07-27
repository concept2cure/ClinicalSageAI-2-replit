import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { assertAuthoringAuthorizationReady } from '../authoringAuthorizationInvariant';

const REQUIRED = [
  'doc_permissions_role_check',
  'doc_permissions_validity_check',
  'doc_permissions_doc_tenant_fkey',
  'doc_permissions_section_doc_tenant_fkey',
];

function poolWith(input?: {
  documents?: boolean;
  permissions?: boolean;
  constraints?: string[];
  trigger?: boolean;
  rls?: boolean;
}): Pool {
  const values = {
    documents: input?.documents ?? true,
    permissions: input?.permissions ?? true,
    constraints: input?.constraints ?? REQUIRED,
    trigger: input?.trigger ?? true,
    rls: input?.rls ?? true,
  };

  return {
    query: vi.fn(async (sql: string) => {
      if (/to_regclass\('public\.authoring_documents'\)/.test(sql)) {
        return {
          rows: [
            {
              documents: values.documents ? 'authoring_documents' : null,
              permissions: values.permissions ? 'doc_permissions' : null,
            },
          ],
        };
      }
      if (/FROM pg_constraint/.test(sql)) {
        return { rows: values.constraints.map(conname => ({ conname })) };
      }
      if (/FROM pg_trigger/.test(sql)) {
        return { rows: values.trigger ? [{ tgname: 'authoring_document_seed_permissions' }] : [] };
      }
      if (/FROM pg_class/.test(sql)) {
        return {
          rows: [
            {
              relrowsecurity: values.rls,
              relforcerowsecurity: values.rls,
            },
          ],
        };
      }
      return { rows: [] };
    }),
  } as unknown as Pool;
}

afterEach(() => {
  delete process.env.AUTHORING_SUBSYSTEM_OPTIONAL;
});

describe('authoring authorization startup invariant', () => {
  it('passes only when permission schema, constraints, trigger, and forced RLS are present', async () => {
    await expect(assertAuthoringAuthorizationReady(poolWith())).resolves.toBeUndefined();
  });

  it('fails when the permission table is absent', async () => {
    await expect(
      assertAuthoringAuthorizationReady(poolWith({ permissions: false })),
    ).rejects.toThrow(/doc_permissions is absent/i);
  });

  it('fails when the document-to-tenant or section-to-document constraints are partial', async () => {
    await expect(
      assertAuthoringAuthorizationReady(poolWith({ constraints: REQUIRED.slice(0, 2) })),
    ).rejects.toThrow(/missing constraints/i);
  });

  it('fails when creator permission seeding is not installed', async () => {
    await expect(
      assertAuthoringAuthorizationReady(poolWith({ trigger: false })),
    ).rejects.toThrow(/missing trigger/i);
  });

  it('fails when RLS is not enabled and forced', async () => {
    await expect(
      assertAuthoringAuthorizationReady(poolWith({ rls: false })),
    ).rejects.toThrow(/RLS is not both enabled and forced/i);
  });

  it('allows a deliberately absent optional authoring capability but never a partial one', async () => {
    process.env.AUTHORING_SUBSYSTEM_OPTIONAL = 'true';
    await expect(
      assertAuthoringAuthorizationReady(poolWith({ documents: false, permissions: false })),
    ).resolves.toBeUndefined();

    await expect(
      assertAuthoringAuthorizationReady(poolWith({ documents: true, permissions: false })),
    ).rejects.toThrow(/doc_permissions is absent/i);
  });
});
