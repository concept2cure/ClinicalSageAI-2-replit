/**
 * A Module 3 section's approver may not be one of the people who ENTERED the
 * register records it was composed from — against a real (in-process PGlite)
 * Postgres, through the platform's one separation-of-duties service.
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 * The section-approve route checked re-authentication, signing authority, a
 * stated reason, the signature's meaning, the read-before-sign hash, open
 * critical contradictions, completeness, staleness and lineage drift — and not
 * who wrote the data. One person could record every register row a section
 * cites and then sign the approval that puts it in an IND. URS-007 §3 said so
 * in as many words, and said why it could not be fixed: "the approver may still
 * be the last writer of the records a section was composed from; separating
 * those two people needs the record-level audit rows that name that writer,
 * which is open work."
 *
 * Those rows landed on 2026-10-18 (`services/cmc/register-audit.ts`), so this
 * is the control they were for.
 *
 * ── What is pinned ───────────────────────────────────────────────────────────
 * Real tables and the real `cmc.register.create` rows, because the claim is
 * about a join across the section's own lineage:
 *
 *   cmc_module3_sections → cmc_section_lineage → cmc_source_objects
 *                        → audit_logs (action 'cmc.register.create')
 *
 *   • the operator of the cited records cannot approve; a colleague can;
 *   • one unattributed cited record refuses the approval and NAMES it — an
 *     unknown writer is not "no conflict";
 *   • a section citing nothing refuses;
 *   • both material source types resolve to the one material register;
 *   • another tenant's create row is not this tenant's operator;
 *   • a failed lookup reads as "could not verify", never as "no conflict".
 *
 * @compliance 21 CFR Part 11 §11.10(e), §11.10(g); 21 CFR 211.22, 211.100(a)
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';

const holder = vi.hoisted(() => ({ pg: null as any }));
/* separation-of-duties.ts reads `pool` at import time for its default reader.
   Every call here passes an explicit client, so the default is never used. */
vi.mock('../../../db.js', () => ({ pool: { query: async () => ({ rows: [] }) } }));
vi.mock('../../../db', () => ({ pool: { query: async () => ({ rows: [] }) } }));

import {
  SeparationOfDutiesAuthorUnresolvedError,
  SeparationOfDutiesError,
  SeparationOfDutiesUnverifiedError,
  assertSignerIsNotAuthor,
  cmcModule3SectionTarget,
  resolveTargetAuthors,
} from '../../governance/separation-of-duties';
/* The action name comes from the module that WRITES it, so a fixture can never
   drift from the real row: an import of it from anywhere else would be a
   second spelling. */
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { CMC_REGISTER_CREATE } from '../register-audit';
import { REGISTER_BY_SOURCE_TYPE, readSectionRecordOperators } from '../register-operators';

const ORG = 5150;
const OTHER_ORG = 5151;
const PROJECT = 'aaaaaaaa-0000-4000-8000-00000000515a';
const RECORDER = 9001;
const APPROVER = 9002;

const DDL = `
CREATE TABLE cmc_module3_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL, project_id TEXT NOT NULL, section_key TEXT NOT NULL,
  approval_state TEXT DEFAULT 'draft');
CREATE TABLE cmc_source_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL, project_id TEXT NOT NULL,
  source_type TEXT NOT NULL, source_key TEXT NOT NULL, source_hash TEXT, version INTEGER DEFAULT 1);
CREATE TABLE cmc_section_lineage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL, section_id UUID NOT NULL, source_object_id UUID NOT NULL,
  source_hash_at_compile TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
-- The change PROPOSAL register: a second change-control table (uuid ids) whose
-- operator lives in created_by, which predates the chain row.
CREATE TABLE cmc_change_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL, title TEXT, created_by INTEGER,
  deleted_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
${AUDIT_LOGS_PGLITE_DDL}
`;

const client = { query: (text: string, params?: unknown[]) => holder.pg.query(text, params) };

/** A compiled section that cites the given records. */
async function section(sectionKey: string, cites: Array<{ sourceType: string; recordId: string }>): Promise<string> {
  const s = await holder.pg.query(
    `INSERT INTO cmc_module3_sections (organization_id, project_id, section_key) VALUES ($1, $2, $3) RETURNING id`,
    [ORG, PROJECT, sectionKey],
  );
  const sectionId = s.rows[0].id as string;
  for (const cite of cites) {
    const o = await holder.pg.query(
      `INSERT INTO cmc_source_objects (organization_id, project_id, source_type, source_key)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [ORG, PROJECT, cite.sourceType, `${cite.sourceType}:${cite.recordId}`],
    );
    await holder.pg.query(
      `INSERT INTO cmc_section_lineage (organization_id, section_id, source_object_id) VALUES ($1, $2, $3)`,
      [ORG, sectionId, o.rows[0].id],
    );
  }
  return sectionId;
}

/** The chain row a register create writes (register-audit.ts). */
async function recordedBy(register: string, recordId: string, actorId: number, orgId = ORG): Promise<void> {
  await holder.pg.query(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, table_name, record_id, actor_id, target, new_values)
     VALUES ($1, $2, $3, $4, $5, $6, $3, $7, $8::json)`,
    [
      randomUUID(),
      orgId,
      actorId,
      CMC_REGISTER_CREATE,
      `${register}_table`,
      recordId,
      `${register}_table:${recordId}`,
      JSON.stringify({ register, recordId, projectId: PROJECT }),
    ],
  );
}

beforeAll(async () => {
  holder.pg = new PGlite();
  await holder.pg.exec(DDL);
}, 60_000);
afterAll(async () => {
  await holder.pg?.close();
});
beforeEach(async () => {
  await holder.pg.exec(
    'DELETE FROM cmc_section_lineage; DELETE FROM cmc_source_objects; DELETE FROM cmc_module3_sections;' +
      ' DELETE FROM cmc_change_controls; DELETE FROM audit_logs;',
  );
});

const target = (key: string) => cmcModule3SectionTarget(PROJECT, key);

describe('the section’s authors are the people who entered its records', () => {
  it('names every operator of the cited records, and the sources it read', async () => {
    await section('3.2.S.4.1', [
      { sourceType: 'specification', recordId: '11' },
      { sourceType: 'method', recordId: '22' },
    ]);
    await recordedBy('specification', '11', RECORDER);
    await recordedBy('analytical_method', '22', RECORDER + 5);

    const authorship = await resolveTargetAuthors(target('3.2.S.4.1'), ORG, client);
    expect(authorship.modelled).toBe(true);
    expect(authorship.authors).toEqual([RECORDER, RECORDER + 5]);
    expect(authorship.sources).toEqual(['register entries (audit chain)']);
    expect(authorship.incomplete).toBeUndefined();
  });

  it('maps a source type to its register — an excipient and a raw material are one register', async () => {
    expect(REGISTER_BY_SOURCE_TYPE.excipient).toBe('material_spec');
    expect(REGISTER_BY_SOURCE_TYPE.raw_material_spec).toBe('material_spec');
    expect(REGISTER_BY_SOURCE_TYPE.method).toBe('analytical_method');
    expect(REGISTER_BY_SOURCE_TYPE.qc_result).toBe('qc_test');

    await section('3.2.P.4.1', [
      { sourceType: 'excipient', recordId: '31' },
      { sourceType: 'raw_material_spec', recordId: '32' },
    ]);
    await recordedBy('material_spec', '31', RECORDER);
    await recordedBy('material_spec', '32', RECORDER);

    const read = await readSectionRecordOperators(client, ORG, PROJECT, '3.2.P.4.1');
    expect(read.operators).toEqual([RECORDER]);
    expect(read.unattributed).toEqual([]);
    expect(read.cited.map((c) => c.register)).toEqual(['material_spec', 'material_spec']);
  });

  it('reads the change PROPOSAL register’s operator from its own column', async () => {
    /* Found by the staff simulation on 2026-10-18: §3.2.P.3 cited
       `change_control:<uuid>` — a row of `cmc_change_controls`, the second
       change-control table — and the chain named nobody for it, so a correct
       approval was refused for want of a fact the database held in
       `created_by`. */
    const proposal = await holder.pg.query(
      `INSERT INTO cmc_change_controls (organization_id, title, created_by) VALUES ($1, 'Scale-up 50→200 kg', $2) RETURNING id`,
      [ORG, RECORDER],
    );
    const id = proposal.rows[0].id as string;
    await section('3.2.P.3', [{ sourceType: 'change_control', recordId: id }]);

    const read = await readSectionRecordOperators(client, ORG, PROJECT, '3.2.P.3');
    expect(read.operators).toEqual([RECORDER]);
    expect(read.unattributed).toEqual([]);
    expect(read.sources).toEqual(['change proposals (created_by)']);

    await expect(
      assertSignerIsNotAuthor(target('3.2.P.3'), ORG, RECORDER, { command: 'sign', meaning: 'approval', client }),
    ).rejects.toThrow(/change proposals \(created_by\)/);
    expect(
      (await assertSignerIsNotAuthor(target('3.2.P.3'), ORG, APPROVER, { command: 'sign', meaning: 'approval', client })).checked,
    ).toBe(true);
  });

  it('a change proposal of another organisation names nobody here', async () => {
    const proposal = await holder.pg.query(
      `INSERT INTO cmc_change_controls (organization_id, title, created_by) VALUES ($1, 'Elsewhere', $2) RETURNING id`,
      [OTHER_ORG, RECORDER],
    );
    await section('3.2.P.3', [{ sourceType: 'change_control', recordId: proposal.rows[0].id as string }]);
    const read = await readSectionRecordOperators(client, ORG, PROJECT, '3.2.P.3');
    expect(read.operators).toEqual([]);
    expect(read.unattributed).toHaveLength(1);
  });

  it('does not take another tenant’s create row as this tenant’s operator', async () => {
    await section('3.2.S.2.1', [{ sourceType: 'manufacturing_process', recordId: '41' }]);
    await recordedBy('manufacturing_process', '41', RECORDER, OTHER_ORG);

    const read = await readSectionRecordOperators(client, ORG, PROJECT, '3.2.S.2.1');
    expect(read.operators).toEqual([]);
    expect(read.unattributed).toEqual(['manufacturing_process:41']);
  });
});

describe('the approval refuses the person who entered the data', () => {
  it('refuses the operator and admits a colleague', async () => {
    await section('3.2.S.4.1', [{ sourceType: 'specification', recordId: '11' }]);
    await recordedBy('specification', '11', RECORDER);

    await expect(
      assertSignerIsNotAuthor(target('3.2.S.4.1'), ORG, RECORDER, { command: 'sign', meaning: 'approval', client }),
    ).rejects.toBeInstanceOf(SeparationOfDutiesError);
    await expect(
      assertSignerIsNotAuthor(target('3.2.S.4.1'), ORG, RECORDER, { command: 'sign', meaning: 'approval', client }),
    ).rejects.toThrow(/you are an author of this record \(register entries \(audit chain\)\)/);

    const ok = await assertSignerIsNotAuthor(target('3.2.S.4.1'), ORG, APPROVER, {
      command: 'sign',
      meaning: 'approval',
      client,
    });
    expect(ok.checked).toBe(true);
  });

  it('refuses when one cited record has no recorded operator, and names it', async () => {
    await section('3.2.P.5.1', [
      { sourceType: 'specification', recordId: '11' },
      { sourceType: 'method', recordId: '22' },
    ]);
    await recordedBy('specification', '11', RECORDER);
    // method:22 predates attribution — nobody is recorded for it.

    const err = await assertSignerIsNotAuthor(target('3.2.P.5.1'), ORG, APPROVER, {
      command: 'sign',
      meaning: 'approval',
      client,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SeparationOfDutiesAuthorUnresolvedError);
    expect(String(err.message)).toContain('method:22');
    expect(String(err.message)).toMatch(/no recorded operator/);
    expect(String(err.message)).toMatch(/Nothing was signed/);
  });

  it('says “you wrote it” rather than “partly unknown” when both are true', async () => {
    await section('3.2.P.5.2', [
      { sourceType: 'specification', recordId: '11' },
      { sourceType: 'method', recordId: '22' },
    ]);
    await recordedBy('specification', '11', RECORDER);

    await expect(
      assertSignerIsNotAuthor(target('3.2.P.5.2'), ORG, RECORDER, { command: 'sign', meaning: 'approval', client }),
    ).rejects.toBeInstanceOf(SeparationOfDutiesError);
  });

  it('refuses a section that cites nothing', async () => {
    await section('3.2.S.1.1', []);
    const err = await assertSignerIsNotAuthor(target('3.2.S.1.1'), ORG, APPROVER, {
      command: 'sign',
      meaning: 'approval',
      client,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SeparationOfDutiesAuthorUnresolvedError);
    expect(String(err.message)).toMatch(/cites no recorded source/);
  });

  it('a failed lookup reads as “could not verify”, never as “no conflict”', async () => {
    await section('3.2.S.4.2', [{ sourceType: 'specification', recordId: '11' }]);
    await recordedBy('specification', '11', RECORDER);
    const broken = {
      query: async (text: string, params?: unknown[]) => {
        if (/FROM audit_logs/.test(text)) {
          const e = new Error('relation "audit_logs" does not exist') as Error & { code?: string };
          e.code = '42P01';
          throw e;
        }
        return holder.pg.query(text, params);
      },
    };
    await expect(
      assertSignerIsNotAuthor(target('3.2.S.4.2'), ORG, APPROVER, { command: 'sign', meaning: 'approval', client: broken }),
    ).rejects.toBeInstanceOf(SeparationOfDutiesUnverifiedError);
  });

  it('an authorship-meaning signature skips the check — which is why the route refuses that meaning', async () => {
    await section('3.2.S.4.3', [{ sourceType: 'specification', recordId: '11' }]);
    await recordedBy('specification', '11', RECORDER);
    const out = await assertSignerIsNotAuthor(target('3.2.S.4.3'), ORG, RECORDER, {
      command: 'sign',
      meaning: 'authorship',
      client,
    });
    expect(out.checked).toBe(false);
    expect(out.reason).toMatch(/Authorship signature/);
  });
});
