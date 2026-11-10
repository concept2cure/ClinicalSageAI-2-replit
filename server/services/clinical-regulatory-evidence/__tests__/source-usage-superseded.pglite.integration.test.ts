/**
 * Source usage when a cited version is superseded — END-TO-END against in-process PGlite, with the same migrations as
 * source-usage.pglite.integration.test.ts (split from it, which is at its length limit).
 *
 * S12 (founder decisions P-83, P-109): a new version flags the sections written from the old one. A data-room capture
 * is immutable (migrations/20261001), so a new version is a new row made by createSupersedingSource, and the cited row
 * keeps its checksum. The data room's "Used in" and the project's changed list compared checksums only, so a section
 * written from a superseded version was never counted, though the editor already said "replaced since cited".
 */

import { seedSourceReadParents } from './source-read-fixture';
import { RECORDED_LINEAGE_STORES_DDL } from '../../document-data-disposition/__tests__/lineage-stores-fixture';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const pool = {
  query: async <R = Record<string, unknown>>(sql: string, params?: unknown[]) => {
    const r = await pglite.query<R>(sql, params);
    return {
      rows: r.rows,
      rowCount: (r as { affectedRows?: number }).affectedRows ?? r.rows.length,
    };
  },
} satisfies import('../span-lineage.service').Queryable;
// `connect` too: a data-room capture's INSERT and its chained row run in one transaction (VR-16b).
vi.mock('../../../db', () => ({
  pool: {
    query: (s: string, p?: unknown[]) => pool.query(s, p),
    connect: async () => ({ query: (s: string, p?: unknown[]) => pool.query(s, p), release: () => {} }),
  },
}));

// A data-room capture writes its chained audit row in the same transaction
// (VR-16b). The chain itself is exercised on PostgreSQL
// (tests/db/data-room-capture-provenance.dbtest.ts); here the writer is
// captured, so the spine-only schema needs no audit_logs table.
vi.mock('../../auditService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../auditService')>()),
  writeChainedAuditRow: async () => undefined,
}));

import * as spine from '../evidence-spine.service';
import * as usage from '../source-usage.service';

const ORG_A = 511;
const ORG_B = 622;
const PROGRAM_A = '33333333-3333-4333-8333-333333333333';
const PROGRAM_B = '44444444-4444-4444-8444-444444444444';
const PROGRAM_A_OTHER = '55555555-5555-4555-8555-555555555555';
const ACTOR = '1';

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

/** A client document as the chat upload route records it. */
function clientDoc(checksum: string, over: Record<string, unknown> = {}) {
  return {
    sourceType: 'client_document' as const,
    visibilityClass: 'project_private' as const,
    clientProgramId: PROGRAM_A,
    title: 'protocol.pdf',
    checksum,
    ingestionStatus: 'ingested' as const,
    extractionStatus: 'extracted' as const,
    provenance: { origin: 'chat_upload', fileUploadId: 'file_' + checksum },
    metadata: { mimeType: 'application/pdf' },
    ...over,
  };
}

/** Create a document + section in the authoring store, returning the section id.
 *  The document belongs to a project, project A unless said otherwise (PF-07). */
async function makeSection(
  orgId: number,
  docTitle: string,
  code: string,
  programId: string | null = PROGRAM_A,
): Promise<{ docId: string; sectionId: string }> {
  const docId = crypto.randomUUID();
  const sectionId = crypto.randomUUID();
  await pool.query(`INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id, client_program_id) VALUES ($1, $2, 'M3', 'draft', $3, $4, $5)`, [docId, docTitle, ACTOR, orgId, programId],
  );
  await pool.query(`INSERT INTO authoring_sections (id, doc_id, code, title, content, tenant_id) VALUES ($1, $2, $3, $4, '', $5)`, [sectionId, docId, code, 'Section ' + code, orgId],
  );
  return { docId, sectionId };
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(RECORDED_LINEAGE_STORES_DDL);
  await seedSourceReadParents(pglite, [ORG_A, ORG_B], [PROGRAM_A, PROGRAM_B]);
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  // The live capture writer records the actual uploader in this canonical column.
  await pglite.exec('ALTER TABLE cre_evidence_sources ADD COLUMN created_by integer');
  await pglite.exec(migration('migrations/20260726_cre_source_program_scope.sql'));
  await pglite.exec(migration('migrations/20260829_cre_source_versioning.sql'));
  // A new version is checked against its predecessor's study (createSupersedingSource), so the column is present.
  await pglite.exec(migration('migrations/20261008d_cre_source_study_ref.sql'));
  await pglite.exec(migration('db/migrations/20260725_authoring_document_loop_tables.sql'));
  await pglite.exec(migration('db/migrations/20260817_doc_revisions_immutable_ledger.sql'));
  await pglite.exec(migration('db/migrations/20260730_authoring_comments_router_columns.sql'));
  // authoring_documents.client_program_id: a document's project, which a citation is judged by (PF-11).
  await pglite.exec(migration('migrations/20260727_authoring_document_program_scope.sql'));
  await pglite.exec(migration('db/migrations/20260727_authoring_object_permissions.sql'));
  await pglite.exec(migration('migrations/20260726_authoring_citation_source_usage.sql'));
  await pglite.exec(migration('migrations/20261006_document_data_dispositions.sql'));
  // A genuinely same-organization accessible second programme exercises
  // project correspondence after current source admission, not a foreign parent.
  await pool.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name) VALUES($1,$2,'Second owned source programme','SOURCE-511-OTHER','IND','drug','FDA','QA fixture')`, [PROGRAM_A_OTHER, ORG_A]);
  await pool.query(`INSERT INTO projects(id,organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings) VALUES(713,$1,$1,'Second owned source project','regulatory','active',1,1,$2,'{}')`, [ORG_A, PROGRAM_A_OTHER]);
  await pool.query("INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,713,'private')", [ORG_A]);
  // Four real migrations into a cold WASM Postgres exceeds the 10s default hook
  // timeout on a loaded runner.
}, 90_000);
afterAll(async () => {
  await pglite.close();
}, 30_000);

/* S12 (P-83, P-109): "a new version flags the sections that used the old one". A data-room capture is immutable
   (migrations/20261001), so a new version is a new row (createSupersedingSource) and the cited row keeps its
   checksum. The changed counts compared checksums only, so a section written from a superseded version was never
   counted, though the editor already says "replaced since cited". */
describe('a section cites a version that has been superseded', () => {
  async function citedThenSuperseded(tag: string, hops = 1) {
    const v1 = await spine.createSource(ORG_A, clientDoc(`sha-${tag}-v1`));
    const { sectionId, docId } = await makeSection(ORG_A, `Written from ${tag} v1`, `${tag}.1`);
    await usage.citeSource(ORG_A, { sectionId, sourceId: v1.id, createdBy: ACTOR });
    let head = v1.id;
    for (let i = 2; i <= hops + 1; i += 1) {
      head = (await spine.createSupersedingSource(ORG_A, clientDoc(`sha-${tag}-v${i}`), head)).source.id;
    }
    return { v1, sectionId, docId, head };
  }

  it('counts the section as changed in the data room’s "Used in"', async () => {
    const { v1 } = await citedThenSuperseded('sup');
    const summary = await usage.summarizeSourceUsage(pool, ORG_A, [v1.id], { userId: 1 });
    expect(summary.get(v1.id)?.sections).toBe(1);
    expect(summary.get(v1.id)?.changedSections).toBe(1);
  });

  it('lists it as a change for the project, with the current version’s checksum, across several versions', async () => {
    const { v1, sectionId } = await citedThenSuperseded('hop', 2);
    const changes = await usage.listChangedSourceUsages(pool, ORG_A, { userId: 1, programId: PROGRAM_A, sourceId: v1.id });
    expect(changes).toHaveLength(1);
    expect(changes[0].sectionId).toBe(sectionId);
    expect(changes[0].citedChecksum).toBe('sha-hop-v1');
    expect(changes[0].currentChecksum).toBe('sha-hop-v3');
  });

  it('a section citing the current version is not changed', async () => {
    const { head } = await citedThenSuperseded('cur');
    const { sectionId } = await makeSection(ORG_A, 'Written from the current version', 'cur.2');
    await usage.citeSource(ORG_A, { sectionId, sourceId: head, createdBy: ACTOR });
    const summary = await usage.summarizeSourceUsage(pool, ORG_A, [head], { userId: 1 });
    expect(summary.get(head)?.changedSections).toBe(0);
    expect(await usage.listChangedSourceUsages(pool, ORG_A, { userId: 1, sourceId: head })).toHaveLength(0);
  });

  it('a superseded citation that recorded no checksum is listed with its checksum as unknown, never the text "null"', async () => {
    const v1 = await spine.createSource(ORG_A, clientDoc('sha-nock-v1'));
    const { sectionId } = await makeSection(ORG_A, 'Cited with no checksum', 'nock.1');
    await usage.citeSource(ORG_A, { sectionId, sourceId: v1.id, createdBy: ACTOR });
    await pool.query('UPDATE authoring_citations SET payload_sha256 = NULL WHERE section_id = $1', [sectionId]);
    await spine.createSupersedingSource(ORG_A, clientDoc('sha-nock-v2'), v1.id);
    const changes = await usage.listChangedSourceUsages(pool, ORG_A, { userId: 1, sourceId: v1.id });
    expect(changes).toHaveLength(1);
    expect(changes[0].citedChecksum).toBeNull();
    expect(changes[0].currentChecksum).toBe('sha-nock-v2');
  });
});

