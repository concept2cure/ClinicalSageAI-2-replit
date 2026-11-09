/**
 * A work project's assigned Vault family is checked by one rule (S12 gap 5, slice 2): the family has a current live
 * version in this organisation's filing program. "Current live" is the Vault tree's own predicate: not deleted, its data
 * not withdrawn (document_data_dispositions, the real migration), not superseded. Every reason a family is not there
 * gives the same null, so the check cannot be used to learn whether a code exists in another program or organisation.
 */
import { seedSourceReadParents } from './source-read-fixture';
import { RECORDED_LINEAGE_STORES_DDL } from '../../document-data-disposition/__tests__/lineage-stores-fixture';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireAssignedVaultFamily, vaultFamilyInProgram, VaultFamilyRefusal } from '../vault-citation-changes';

let pglite: PGlite;
const q = { query: async (sql: string, params?: unknown[]) => ({ rows: (await pglite.query(sql, params)).rows as Record<string, unknown>[] }) };
const ORG_A = 951;
const ORG_B = 962;
const PROGRAM_A = '88888888-8888-4888-8888-888888888888';
const PROGRAM_B = '99999999-9999-4999-8999-999999999999';
const PROGRAM_A2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

async function version(orgId: number, programId: string, code: string, label: string, after: string | null = null): Promise<string> {
  const id = crypto.randomUUID();
  await pglite.query(`INSERT INTO vault.documents (id, organization_id, program_id, document_code, version, document_title, supersedes_id, content_hash)
    VALUES ($1, $2, $3, $4, $5, 'Drug substance specification', $6, $7)`, [id, orgId, programId, code, label, after, sha(id)]);
  return id;
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(RECORDED_LINEAGE_STORES_DDL);
  await seedSourceReadParents(pglite, [ORG_A, ORG_B], [PROGRAM_A, PROGRAM_B]);
  await pglite.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name)
    VALUES($1,$2,'Second programme','SOURCE-951-B','IND','drug','FDA','QA fixture')`, [PROGRAM_A2, ORG_A]);
  await pglite.exec(`CREATE SCHEMA IF NOT EXISTS vault;
    CREATE TABLE vault.documents (id uuid PRIMARY KEY, organization_id int NOT NULL, program_id uuid, document_code text,
      version text, document_title text, supersedes_id uuid, deleted_at timestamptz, content_hash text,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp());`);
  // The disposition guard reads the evidence spine.
  for (const file of ['db/migrations/20260724_clinical_regulatory_evidence_spine.sql', 'migrations/20260726_cre_source_program_scope.sql',
    'migrations/20260829_cre_source_versioning.sql']) await pglite.exec(migration(file));
  await pglite.exec(migration('migrations/20261006_document_data_dispositions.sql'));
}, 90_000);
afterAll(async () => { await pglite.close(); }, 30_000);

describe('a work project\'s assigned Vault family is in this program (S12 gap 5, slice 2)', () => {
  it('names the family\'s current version, not a superseded one', async () => {
    const v1 = await version(ORG_A, PROGRAM_A, 'DS-SPEC', '1.0');
    const v2 = await version(ORG_A, PROGRAM_A, 'DS-SPEC', '2.0', v1);
    expect(await vaultFamilyInProgram(q, ORG_A, PROGRAM_A, ' DS-SPEC ')).toEqual({ id: v2, version: '2.0', title: 'Drug substance specification', documentCode: 'DS-SPEC' });
  });

  it('says the same nothing for an unknown family, another program\'s, and another organisation\'s', async () => {
    await version(ORG_A, PROGRAM_A2, 'DP-SPEC', '1.0');
    await version(ORG_B, PROGRAM_B, 'DX-SPEC', '1.0');
    expect(await vaultFamilyInProgram(q, ORG_A, PROGRAM_A, 'NO-SUCH')).toBeNull();
    expect(await vaultFamilyInProgram(q, ORG_A, PROGRAM_A, 'DP-SPEC')).toBeNull();
    expect(await vaultFamilyInProgram(q, ORG_A, PROGRAM_A, 'DX-SPEC')).toBeNull();
    expect(await vaultFamilyInProgram(q, ORG_A, PROGRAM_B, 'DX-SPEC')).toBeNull();
  });

  it('says nothing for a family whose versions are all deleted, or whose current version\'s data was withdrawn', async () => {
    const gone = await version(ORG_A, PROGRAM_A, 'DS-GONE', '1.0');
    await pglite.query('UPDATE vault.documents SET deleted_at = now() WHERE id = $1', [gone]);
    expect(await vaultFamilyInProgram(q, ORG_A, PROGRAM_A, 'DS-GONE')).toBeNull();
    // v1 was replaced by v2, and v2's data was withdrawn: the family has no current live version, v1 is not revived.
    const w1 = await version(ORG_A, PROGRAM_A, 'DS-WITHDRAWN', '1.0');
    const w = await version(ORG_A, PROGRAM_A, 'DS-WITHDRAWN', '2.0', w1);
    // The disposition record as the withdraw path writes it (migrations/20261006): its data removed.
    await pglite.query(`INSERT INTO public.document_data_dispositions (organization_id, program_id, vault_document_id, choice, reason,
        actor_id, source_sha256, preview_hash, linked_ids, impact_snapshot, audit_receipt)
      VALUES ($1, $2, $3::uuid, 'remove_data', 'Withdrawn: the specification was issued in error.', 1, $4, $4,
        jsonb_build_object('capturedSourceIds', '[]'::jsonb, 'vaultDocumentIds', jsonb_build_array($3::text), 'artifactIds', '[]'::jsonb,
          'uploadIds', '[]'::jsonb), '{}'::jsonb,
        jsonb_build_object('id', 'audit-1', 'sha256Chain', $4::text))`, [ORG_A, PROGRAM_A, w, sha(w)]);
    expect(await vaultFamilyInProgram(q, ORG_A, PROGRAM_A, 'DS-WITHDRAWN')).toBeNull();
  });

  it('refuses a malformed program or code without reading', async () => {
    expect(await vaultFamilyInProgram(q, ORG_A, 'not-a-uuid', 'DS-SPEC')).toBeNull();
    expect(await vaultFamilyInProgram(q, ORG_A, PROGRAM_A, '')).toBeNull();
    expect(await vaultFamilyInProgram(q, ORG_A, PROGRAM_A, 42)).toBeNull();
  });

  it('where a task assigns the family: the program is the task\'s own work project\'s, never the body\'s (POST /api/tasks/tasks)', async () => {
    // A work project under program A's anchor (projects.id = the organisation's id in the fixture): no program of its own.
    await pglite.query(`INSERT INTO projects(id,organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,parent_project_id,depth,settings)
      VALUES(9511,$1,$1,'Drug substance CMC','regulatory','active',1,1,$1,1,'{}')`, [ORG_A]);
    const v = await version(ORG_A, PROGRAM_A, 'DS-ASSIGNED', '1.0');
    const data = (over: Record<string, unknown> = {}) => ({ workProjectId: 9511, vaultDocumentCode: 'DS-ASSIGNED', ...over });
    expect(await requireAssignedVaultFamily(q, ORG_A, 9511, data())).toMatchObject({ id: v, documentCode: 'DS-ASSIGNED' });
    expect(await requireAssignedVaultFamily(q, ORG_A, 9511, data({ programId: PROGRAM_A.toUpperCase() }))).toMatchObject({ id: v });
    // No field, no check: a task that assigns no family is untouched.
    expect(await requireAssignedVaultFamily(q, ORG_A, 9511, { workProjectId: 9511 })).toBeNull();
    expect(await requireAssignedVaultFamily(q, ORG_A, undefined, undefined)).toBeNull();
    // A member of program A names program A2's real family, through the body's program or alone: the same refusal.
    await version(ORG_A, PROGRAM_A2, 'DP-A2-SPEC', '1.0');
    for (const refused of [data({ programId: PROGRAM_A2, vaultDocumentCode: 'DP-A2-SPEC' }), data({ vaultDocumentCode: 'DP-A2-SPEC' }),
      data({ programId: PROGRAM_A2 }), data({ vaultDocumentCode: 'NO-SUCH' })]) {
      await expect(requireAssignedVaultFamily(q, ORG_A, 9511, refused)).rejects.toBeInstanceOf(VaultFamilyRefusal);
    }
    // A family named with no project to read the program from is refused too.
    await expect(requireAssignedVaultFamily(q, ORG_A, undefined, data())).rejects.toMatchObject({ status: 409, code: 'VAULT_FAMILY_NOT_IN_PROGRAM' });
  });
});
