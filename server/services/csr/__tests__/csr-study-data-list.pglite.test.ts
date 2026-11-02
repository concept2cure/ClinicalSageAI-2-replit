/**
 * The study data a CSR is reviewed against (CSR demo rehearsal, 2026-11-02, CDISC pilot).
 *
 * The CSR scientific review maps each figure in the saved text to a cell of the retained tables, and the
 * reader accepts a document's frozen study data as well as a package run (saved-clinical-tables.ts). But
 * the reviewer is offered only what this list returns. A working copy imported from a CSR build has no
 * study data of its own: its text was drafted from the study data the build was bound to. So the list
 * names that study data too, by the import's build, and says which it is. Nothing crosses an organization
 * or a project: the study data row is read in this organization and this project only.
 */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RequestSqlClient } from '../../../db/requestDb.js';

const auth = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../source-access.js', async load => ({ ...await load<typeof import('../source-access.js')>(), authorizeCsrSourceProgram: auth }));
import { listCsrStudyData } from '../csr-study-data';

const PROGRAM = '11111111-2222-4333-8444-000000000011';
const OTHER_PROGRAM = '11111111-2222-4333-8444-000000000012';
const CSR_DOC = '22222222-0000-4000-8000-000000000001';
const WORKING_COPY = '22222222-0000-4000-8000-000000000002';
const FOREIGN_JOB_COPY = '22222222-0000-4000-8000-000000000003';
const OTHER_PROGRAM_COPY = '22222222-0000-4000-8000-000000000004';
const PLAIN_DOC = '22222222-0000-4000-8000-000000000005';
const FROZEN = '33333333-0000-4000-8000-000000000001';
const ELSEWHERE = '33333333-0000-4000-8000-000000000002';
const receipt = { adapter: 'concept2cure.csr-source.v1', studyId: 'SYN-201', protocolNumber: 'SYN-201', version: '1', sha256: 'a'.repeat(64) };

let database: PGlite;
const q = () => ({ query: (sql: string, params?: unknown[]) => database.query(sql, params) }) as unknown as RequestSqlClient;
const scope = { organizationId: 7, programId: PROGRAM, userId: 5 };
/** The stored shape (authoring-from-draft.ts): the origin names its build as `id`, the job id as text, with the
 * selection beside it. The first version of this test used the selection's shape (`jobId`), and the list missed
 * every real import (found in the running app, 2026-11-02). */
const imported = (jobId: number) => JSON.stringify({ source: 'import', importSource: { kind: 'csr', id: String(jobId),
  title: 'Synthetic study', programId: PROGRAM, selection: { kind: 'csr', jobId, sectionNumbers: ['1'] } } });

beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE TABLE authoring_documents (id uuid PRIMARY KEY, tenant_id integer NOT NULL, client_program_id uuid, provenance jsonb);
    CREATE TABLE csr_build_jobs (id serial PRIMARY KEY, organization_id integer NOT NULL, study_info_snapshot jsonb,
      source_run_id text GENERATED ALWAYS AS ((study_info_snapshot -> 'evidenceSource' ->> 'runId')) STORED);
    CREATE TABLE csr_study_data (study_data_id uuid PRIMARY KEY, organization_id integer NOT NULL, program_id uuid NOT NULL,
      authoring_document_id uuid NOT NULL, input_snapshot jsonb NOT NULL, input_digest text, input_seal text, created_by integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO csr_study_data (study_data_id, organization_id, program_id, authoring_document_id, input_snapshot, created_by) VALUES
      ('${FROZEN}', 7, '${PROGRAM}', '${CSR_DOC}', '{"clinicalSourceReceipts": ${JSON.stringify([receipt])}}', 5),
      ('${ELSEWHERE}', 7, '${OTHER_PROGRAM}', '${CSR_DOC}', '{"clinicalSourceReceipts": []}', 5);
    -- job 1: this organization, bound to the CSR document's study data; job 2: another organization naming the same id;
    -- job 3: this organization, bound to study data in another project.
    INSERT INTO csr_build_jobs (organization_id, study_info_snapshot) VALUES
      (7, '{"evidenceSource": {"runId": "${FROZEN}"}}'), (8, '{"evidenceSource": {"runId": "${FROZEN}"}}'),
      (7, '{"evidenceSource": {"runId": "${ELSEWHERE}"}}');
    INSERT INTO authoring_documents (id, tenant_id, client_program_id, provenance) VALUES
      ('${CSR_DOC}', 7, '${PROGRAM}', '{"source": "template"}'),
      ('${WORKING_COPY}', 7, '${PROGRAM}', '${imported(1)}'),
      ('${FOREIGN_JOB_COPY}', 7, '${PROGRAM}', '${imported(2)}'),
      ('${OTHER_PROGRAM_COPY}', 7, '${PROGRAM}', '${imported(3)}'),
      ('${PLAIN_DOC}', 7, '${PROGRAM}', NULL);
  `);
});
afterAll(async () => { await database?.close(); });

describe('the study data a document is reviewed against', () => {
  it('the CSR document lists the study data frozen for it, as before, saying so', async () => {
    const list = await listCsrStudyData(q(), scope, CSR_DOC);
    expect(list.map(e => [e.studyDataId, e.via])).toEqual([[FROZEN, 'this-document']]);
    expect(list[0].sources).toEqual([receipt]);
  });

  it('a working copy imported from a CSR build lists the study data that build was drafted from', async () => {
    const list = await listCsrStudyData(q(), scope, WORKING_COPY);
    expect(list.map(e => [e.studyDataId, e.via])).toEqual([[FROZEN, 'imported-build']]);
    expect(list[0].sources).toEqual([receipt]);
  });

  it('a build in another organization, or study data in another project, is never listed', async () => {
    expect(await listCsrStudyData(q(), scope, FOREIGN_JOB_COPY)).toEqual([]);
    expect(await listCsrStudyData(q(), scope, OTHER_PROGRAM_COPY)).toEqual([]);
  });

  it('a document with neither lists nothing', async () => {
    expect(await listCsrStudyData(q(), scope, PLAIN_DOC)).toEqual([]);
  });
});
