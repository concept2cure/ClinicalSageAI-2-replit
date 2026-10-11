/** Cached readers must honor the same recorded ancestry as canonical sources. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDispositionHarness } from './disposition-fixture';
import {
  artifactDataEligibleSql, artifactOriginalFileAvailableSql, atomDataEligibleSql,
  atomOriginalFileAvailableSql, capturedDataEligibleSql, ragDataEligibleSql,
  ragOriginalFileAvailableSql,
} from '../eligibility';

let harness: Awaited<ReturnType<typeof createDispositionHarness>>;
let fixture: Awaited<ReturnType<typeof seedDescendant>>;

async function seedDescendant(choice: 'keep_data' | 'remove_data', recorded = true) {
  const f = await harness.seed();
  await f.apply(choice);
  // Represents already persisted legacy work: its exact parent edge is present,
  // but its different bytes were not in the original disposition snapshot.
  const upload = randomUUID();
  const hash = 'b'.repeat(64);
  await harness.pg.query(`INSERT INTO file_uploads VALUES ($1,$2,$3,$4,'processed')`,
    [upload, f.org, hash, `uploads/org-${f.org}/${upload}.xlsx`]);
  const capture = (await harness.pg.query<{ id: number }>(`INSERT INTO cre_evidence_sources
    (organization_id,client_program_id,source_type,title,checksum,extraction_status,ingestion_status,provenance,metadata,is_current)
    VALUES ($1,$2,'client_document','Edited study.xlsx',$3,'extracted','ingested',$4,'{}',true) RETURNING id`,
  [f.org, f.program, hash, JSON.stringify({ fileUploadId: upload, ...(recorded ? {
    origin: 'spreadsheet_edit', parentSourceIds: [f.capture], derivedFromFileId: f.upload,
    derivedFromSha256: 'a'.repeat(64),
  } : {}) })])).rows[0].id;
  const project = (await harness.pg.query<{ id: number }>('SELECT id FROM projects WHERE organization_id=$1', [f.org])).rows[0].id;
  const nativeArtifact = randomUUID();
  const artifact = (await harness.pg.query<{ id: number }>(`INSERT INTO concept2cure_artifacts
    (organization_id,project_id,artifact_id,content_hash,content,status,metadata)
    VALUES ($1,$2,$3,$4,'Edited descendant data','draft',$5) RETURNING id`,
  [f.org, project, nativeArtifact, 'c'.repeat(64), JSON.stringify({ fileId: upload })])).rows[0].id;
  const atom = (await harness.pg.query<{ id: number }>(`INSERT INTO lumen_data_atoms
    (organization_id,source_type,source_id,structured_data,status,content)
    VALUES ($1,'chat_upload',$2,'{}','active','Cached edited endpoint') RETURNING id`,
  [f.org, `cre_source:${capture}`])).rows[0].id;
  const rag = (await harness.pg.query<{ id: string }>(`INSERT INTO rag_documents
    (organization_id,document_id) VALUES ($1,$2) RETURNING id`, [f.org, `cre_source:${capture}`])).rows[0].id;
  return { org: f.org, capture, artifact, nativeArtifact, upload, atom, rag, root: f };
}

async function atomView(org: number, type: string, ref: string, data: Record<string, unknown> = {}) {
  const rows = await harness.pg.query<{ eligible: boolean; available: boolean }>(`SELECT
    ${atomDataEligibleSql('a')} AS eligible, ${atomOriginalFileAvailableSql('a')} AS available
    FROM (SELECT $1::integer AS organization_id,$2::text AS source_type,$3::text AS source_id,$4::json AS structured_data) a`,
  [org, type, ref, JSON.stringify(data)]);
  return rows.rows;
}

async function ragView(org: number, ref: string) {
  const rows = await harness.pg.query<{ eligible: boolean; available: boolean }>(`SELECT
    ${ragDataEligibleSql('r')} AS eligible, ${ragOriginalFileAvailableSql('r')} AS available
    FROM (SELECT $1::integer AS organization_id,$2::text AS document_id) r`, [org, ref]);
  return rows.rows;
}

async function artifactView(org: number, id: number) {
  const rows = await harness.pg.query<{ eligible: boolean; available: boolean }>(`SELECT
    ${artifactDataEligibleSql('a')} AS eligible, ${artifactOriginalFileAvailableSql('a')} AS available
    FROM concept2cure_artifacts a WHERE a.organization_id=$1 AND a.id=$2`, [org, id]);
  return rows.rows;
}

beforeAll(async () => {
  harness = await createDispositionHarness();
  fixture = await seedDescendant('remove_data');
});
afterAll(async () => { await harness.close(); });

describe('recorded descendant cached-read eligibility', () => {
  it('establishes that the canonical captured descendant is already refused', async () => {
    const rows = await harness.pg.query<{ eligible: boolean }>(`SELECT ${capturedDataEligibleSql('s')} AS eligible
      FROM cre_evidence_sources s WHERE s.organization_id=$1 AND s.id=$2`, [fixture.org, fixture.capture]);
    expect(rows.rows).toEqual([{ eligible: false }]);
  });

  it('refuses the same descendant through the atom reader predicate', async () => {
    const rows = await harness.pg.query<{ eligible: boolean }>(`SELECT ${atomDataEligibleSql('a')} AS eligible
      FROM lumen_data_atoms a WHERE a.organization_id=$1 AND a.id=$2`, [fixture.org, fixture.atom]);
    expect(rows.rows).toEqual([{ eligible: false }]);
  });

  it('refuses the same descendant through the RAG reader predicate', async () => {
    const rows = await harness.pg.query<{ eligible: boolean }>(`SELECT ${ragDataEligibleSql('r')} AS eligible
      FROM rag_documents r WHERE r.organization_id=$1 AND r.id=$2`, [fixture.org, fixture.rag]);
    expect(rows.rows).toEqual([{ eligible: false }]);
  });

  it('refuses the descendant upload through the artifact reader predicate', async () => {
    const rows = await harness.pg.query<{ eligible: boolean }>(`SELECT ${artifactDataEligibleSql('a')} AS eligible
      FROM concept2cure_artifacts a WHERE a.organization_id=$1 AND a.id=$2`, [fixture.org, fixture.artifact]);
    expect(rows.rows).toEqual([{ eligible: false }]);
  });
});

describe('cached reader recorded-identity controls', () => {
  it.each(['captured', 'supporting', 'contradicting', 'upload_prefix', 'upload_id', 'artifact_id', 'artifact_native'])(
    'refuses the exact descendant atom association: %s', async format => {
      const input: [string, string, Record<string, unknown>?] = format === 'captured'
        ? ['captured_source', String(fixture.capture)]
        : format === 'supporting' ? ['clinical_regulatory_evidence', 'assessment', { supportingSourceIds: [fixture.capture] }]
        : format === 'contradicting' ? ['clinical_regulatory_evidence', 'assessment', { contradictingSourceIds: [fixture.capture] }]
        : format === 'upload_prefix' ? ['chat_upload', `upload:${fixture.upload}`]
        : format === 'upload_id' ? ['file_upload', fixture.upload]
        : format === 'artifact_id' ? ['artifact', String(fixture.artifact)]
        : ['data_room_upload', fixture.nativeArtifact];
      expect(await atomView(fixture.org, ...input)).toEqual([{ eligible: false, available: false }]);
    });

  it.each(['upload', 'artifact_id', 'artifact_native'])('refuses the exact descendant RAG association: %s', async format => {
    const ref = format === 'upload' ? fixture.upload : format === 'artifact_id' ? String(fixture.artifact) : fixture.nativeArtifact;
    expect(await ragView(fixture.org, ref)).toEqual([{ eligible: false, available: false }]);
  });

  it('retains descendants of keep_data without marking their distinct original file unavailable', async () => {
    const f = await seedDescendant('keep_data');
    expect(await atomView(f.org, 'chat_upload', `cre_source:${f.capture}`)).toEqual([{ eligible: true, available: true }]);
    expect(await ragView(f.org, String(f.artifact))).toEqual([{ eligible: true, available: true }]);
    expect(await artifactView(f.org, f.artifact)).toEqual([{ eligible: true, available: true }]);
  });

  it('keeps the retained source data distinct from that exact source original-file availability', async () => {
    const f = await seedDescendant('keep_data');
    expect(await atomView(f.org, 'chat_upload', `cre_source:${f.root.capture}`)).toEqual([{ eligible: true, available: false }]);
    expect(await ragView(f.org, String(f.root.artifact))).toEqual([{ eligible: true, available: false }]);
    expect(await artifactView(f.org, f.root.artifact)).toEqual([{ eligible: true, available: false }]);
  });

  it('does not invent derivation from the same child digest in an independent upload', async () => {
    const f = await seedDescendant('remove_data', false);
    expect(await atomView(f.org, 'chat_upload', `cre_source:${f.capture}`)).toEqual([{ eligible: true, available: true }]);
    expect(await ragView(f.org, f.upload)).toEqual([{ eligible: true, available: true }]);
    expect(await artifactView(f.org, f.artifact)).toEqual([{ eligible: true, available: true }]);
  });

  it('does not import a different tenant recorded associations', async () => {
    const f = await harness.seed();
    expect(await atomView(f.org, 'chat_upload', `cre_source:${fixture.capture}`)).toEqual([{ eligible: true, available: true }]);
    expect(await ragView(f.org, fixture.upload)).toEqual([{ eligible: true, available: true }]);
    expect(await ragView(f.org, fixture.nativeArtifact)).toEqual([{ eligible: true, available: true }]);
  });

  it('refuses a cached reference whose named parent digest is contradictory', async () => {
    const f = await seedDescendant('keep_data');
    await harness.pg.query(`UPDATE cre_evidence_sources SET provenance=jsonb_set(provenance,'{derivedFromSha256}',to_jsonb($3::text))
      WHERE organization_id=$1 AND id=$2`, [f.org, f.capture, 'e'.repeat(64)]);
    expect(await atomView(f.org, 'chat_upload', `cre_source:${f.capture}`)).toEqual([{ eligible: false, available: false }]);
    expect(await ragView(f.org, f.upload)).toEqual([{ eligible: false, available: false }]);
    expect(await artifactView(f.org, f.artifact)).toEqual([{ eligible: false, available: false }]);
  });
});
