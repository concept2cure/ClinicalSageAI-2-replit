/** Real SQL for capture scope and lineage; independent-client races live in the native suite. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { seedSourceReadParents } from './source-read-fixture';
import { RECORDED_LINEAGE_STORES_DDL } from '../../document-data-disposition/__tests__/lineage-stores-fixture';
import { extractTableDdl } from '../../../../tests/golden-journeys/harness';

let pg: PGlite;
let intercept: ((sql: string) => Promise<void>) | undefined;
const query = async (sql: string, params?: unknown[]) => {
  await intercept?.(sql);
  const result = await pg.query<Record<string, unknown>>(sql, params);
  return { rows: result.rows };
};
vi.mock('../../../db', () => ({ pool: {
  query: (sql: string, params?: unknown[]) => query(sql, params),
  connect: async () => ({ query, release: () => undefined }),
} }));
const audit = vi.hoisted(() => ({ fail: false, rows: [] as Array<{ action: string; resourceId: string; details: unknown }> }));
vi.mock('../../auditService', () => ({ writeChainedAuditRow: async (_q: unknown, entry: { action: string; resourceId: string; details: unknown }) => {
  if (audit.fail) { audit.fail = false; throw new Error('injected capture audit failure'); }
  audit.rows.push(entry);
} }));

import * as spine from '../evidence-spine.service';

const ORG = 711;
const OTHER_ORG = 712;
const PROGRAM = '55555555-5555-4555-8555-555555555555';
const OTHER_PROGRAM = '66666666-6666-4666-8666-666666666666';
let studyA: number;
let studyB: number;

const migration = (file: string) => fs.readFileSync(new URL(`../../../../${file}`, import.meta.url), 'utf8');

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(RECORDED_LINEAGE_STORES_DDL);
  await seedSourceReadParents(pg, [ORG, OTHER_ORG], [PROGRAM, OTHER_PROGRAM]);
  await pg.exec(extractTableDdl('migrations/0000_sweet_joseph.sql', ['cdisc_prm_studies']));
  for (const file of [
    'db/migrations/20260727_prm_program_link.sql',
    'db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
    'migrations/20260726_cre_source_program_scope.sql',
    'migrations/20260829_cre_source_versioning.sql',
    'migrations/20261001_cre_evidence_sources_capture_immutability.sql',
    'migrations/20261008d_cre_source_study_ref.sql',
    'migrations/20261006_document_data_dispositions.sql',
  ]) await pg.exec(migration(file));
  for (const protocol of ['STUDY-A', 'STUDY-B']) {
    const { rows } = await query(`INSERT INTO cdisc_prm_studies
      (tenant_id,study_id,protocol_id,protocol_title,protocol_version,program_id)
      VALUES ($1,$2,$3,'Study capture fixture','1.0',$4) RETURNING id`,
    [ORG, `sd_${protocol}`, protocol, PROGRAM]);
    if (protocol === 'STUDY-A') studyA = Number(rows[0].id);
    else studyB = Number(rows[0].id);
  }
}, 90_000);
afterAll(async () => { await pg?.close(); });

async function source(title: string, checksum: string, studyRef: number | null, extra: Record<string, unknown> = {}) {
  const saved = await spine.createSource(ORG, {
    sourceType: 'client_document', visibilityClass: 'project_private', clientProgramId: PROGRAM,
    title, checksum, ...extra,
  });
  await query('UPDATE cre_evidence_sources SET study_ref=$1 WHERE id=$2 AND organization_id=$3', [studyRef, saved.id, ORG]);
  return saved;
}

describe('same filename is a successor only within a positively matched study', () => {
  it('does not offer another study’s same-filename source as predecessor', async () => {
    await source('cross-study.pdf', 'study-a-1', studyA);
    const found = await spine.findSupersededCandidate(ORG, {
      title: 'cross-study.pdf', sourceType: 'client_document', programId: PROGRAM, studyRef: studyB,
    });
    expect(found).toBeNull();
  });

  it('finds the correct study even when a second study has the same filename', async () => {
    const own = await source('two-studies.pdf', 'study-a-2', studyA);
    await source('two-studies.pdf', 'study-b-2', studyB);
    const found = await spine.findSupersededCandidate(ORG, {
      title: 'two-studies.pdf', sourceType: 'client_document', programId: PROGRAM, studyRef: studyA,
    });
    expect(found?.id).toBe(own.id);
  });

  it('does not infer a successor when the incoming study is unmatched', async () => {
    await source('unknown-study.pdf', 'study-a-3', studyA);
    expect(await spine.findSupersededCandidate(ORG, {
      title: 'unknown-study.pdf', sourceType: 'client_document', programId: PROGRAM, studyRef: null,
    })).toBeNull();
  });

  it('does not equate two unresolved study references', async () => {
    await source('both-unknown.pdf', 'unknown-1', null);
    expect(await spine.findSupersededCandidate(ORG, {
      title: 'both-unknown.pdf', sourceType: 'client_document', programId: PROGRAM,
    })).toBeNull();
  });

  it('binds the complete project scope as well as study identity', async () => {
    await source('different-workspace.pdf', 'study-a-4', studyA, { clientWorkspaceId: 9 });
    expect(await spine.findSupersededCandidate(ORG, {
      title: 'different-workspace.pdf', sourceType: 'client_document', programId: PROGRAM,
      workspaceId: null, studyRef: studyA,
    })).toBeNull();
  });
});

let uploadSequence = 0;
async function upload(title: string, body: string, actorId = 1) {
  const id = `capture-upload-${++uploadSequence}`;
  const checksum = createHash('sha256').update(body).digest('hex');
  const storagePath = `uploads/org-${ORG}/${id}`;
  await query(`INSERT INTO file_uploads(id,organization_id,user_id,original_name,mime_type,file_size,storage_path,checksum_sha256,status)
    VALUES($1,$2,$3,$4,'text/plain',$5,$6,$7,'uploaded')`, [id, ORG, actorId, title, Buffer.byteLength(body), storagePath, checksum]);
  return { sourceType: 'client_document' as const, visibilityClass: 'project_private' as const,
    clientProgramId: PROGRAM, clientWorkspaceId: null, title, storedArtifactRef: storagePath, checksum,
    createdBy: actorId, provenance: { origin: 'chat_upload', fileUploadId: id, uploadedByUserId: actorId } };
}
async function capture(title: string, body: string) {
  return spine.captureClientSource(ORG, await upload(title, body), { text: body });
}
const states = async (title: string) => (await query(`SELECT id,checksum,study_ref,is_current,previous_version_id,provenance
  FROM cre_evidence_sources WHERE organization_id=$1 AND title=$2 ORDER BY id`, [ORG, title])).rows;

describe('the admitted capture decision is one transaction', () => {
  it('captures two studies’ same filename independently, then revises only its own study', async () => {
    const title = 'shared-protocol.txt';
    const a = await capture(title, 'Protocol Number: STUDY-A\nVersion 1.0');
    const b = await capture(title, 'Protocol Number: STUDY-B\nVersion 1.0');
    const a2 = await capture(title, 'Protocol Number: STUDY-A\nVersion 2.0');
    expect(a.supersededId).toBeNull();
    expect(b.supersededId).toBeNull();
    expect(a2.supersededId).toBe(a.source.id);
    expect(await states(title)).toMatchObject([
      { id: a.source.id, study_ref: studyA, is_current: false, previous_version_id: null, checksum: a.source.checksum },
      { id: b.source.id, study_ref: studyB, is_current: true, previous_version_id: null },
      { id: a2.source.id, study_ref: studyA, is_current: true, previous_version_id: a.source.id },
    ]);
    expect(a2.source.provenance.supersedes).toMatchObject({ sourceId: a.source.id, studyRef: studyA,
      matchedOn: 'title+projectScope+sourceType+studyRef' });
    expect(a2.source.provenance.studyMatch).toMatchObject({ studyRef: studyA,
      candidates: [{ id: studyA, studyId: 'sd_STUDY-A', protocolId: 'STUDY-A' }] });
  });

  it('reuses current bytes without changing the original upload, capturer or title', async () => {
    const body = 'Protocol Number: STUDY-A\nReusable capture';
    const first = await capture('original-identity.txt', body);
    await query("INSERT INTO users(id,name,email,password_hash,status) VALUES(2,'Other uploader','capture-other@example.invalid','fixture-only','active')");
    await query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,2,'admin')", [ORG]);
    const repeated = await spine.captureClientSource(ORG, await upload('renamed-copy.txt', body, 2), { text: body });
    expect(repeated).toMatchObject({ reused: true, supersededId: null, source: { id: first.source.id, title: 'original-identity.txt' } });
    expect(repeated.source.provenance).toEqual(first.source.provenance);
    const saved = await query('SELECT created_by FROM cre_evidence_sources WHERE id=$1', [first.source.id]);
    expect(saved.rows[0].created_by).toBe(1);
    expect(await states('renamed-copy.txt')).toHaveLength(0);
  });

  it.each([
    ['unmatched', 'Protocol Number: UNKNOWN-X'],
    ['multiple known', 'Protocol Number: STUDY-A\nProtocol ID: STUDY-B'],
    ['later unmatched', 'Protocol Number: STUDY-A\nProtocol ID: UNKNOWN-Y'],
    ['no study', 'A project-wide source without a study identifier'],
  ])('captures %s scope without retiring the same-named study source', async (_label, body) => {
    const title = `ambiguous-${_label}.txt`;
    const initial = await capture(title, `Protocol Number: STUDY-A\nInitial ${_label}`);
    const next = await capture(title, body);
    expect(next.supersededId).toBeNull();
    expect(await states(title)).toMatchObject([
      { id: initial.source.id, is_current: true, study_ref: studyA },
      { id: next.source.id, is_current: true, study_ref: null, previous_version_id: null },
    ]);
  });

  it('declines two same-study filename candidates without guessing the newest', async () => {
    const title = 'ambiguous-predecessors.txt';
    const first = await source(title, 'ambiguous-a', studyA);
    const second = await source(title, 'ambiguous-b', studyA);
    const added = await capture(title, 'Protocol Number: STUDY-A\nNew candidate');
    expect(added.supersededId).toBeNull();
    expect((await states(title)).map(row => [row.id, row.is_current])).toEqual([
      [first.id, true], [second.id, true], [added.source.id, true],
    ]);
  });
});

describe('capture retains historical bytes and exact identity', () => {
  it('never reactivates superseded bytes or creates a current clone of them', async () => {
    const title = 'retained-bytes.txt';
    const body = 'Protocol Number: STUDY-A\nOld retained bytes';
    const first = await capture(title, body);
    const next = await capture(title, `${body}\nAmended`);
    await expect(capture(title, body)).rejects.toMatchObject({ status: 409, code: 'SOURCE_CAPTURE_RETIRED', sourceId: first.source.id });
    expect(await states(title)).toMatchObject([
      { id: first.source.id, is_current: false }, { id: next.source.id, is_current: true },
    ]);
  });

  it('cannot revive unresolved retired bytes after a study is registered', async () => {
    const title = 'late-study-match.txt';
    const body = 'Protocol Number: STUDY-A\nPreviously unclassified bytes';
    const hash = createHash('sha256').update(body).digest('hex');
    const old = await source(title, hash, null);
    await query('UPDATE cre_evidence_sources SET is_current=FALSE WHERE id=$1', [old.id]);
    await expect(capture(title, body)).rejects.toMatchObject({ code: 'SOURCE_CAPTURE_RETIRED', sourceId: old.id });
    expect(await states(title)).toHaveLength(1);
  });

  it('matches identical bytes only within the explicitly selected study', async () => {
    const first = await source('identity-study-a.txt', 'same-study-scope-hash', studyA);
    const second = await source('identity-study-b.txt', 'same-study-scope-hash', studyB);
    const opts = { sourceType: 'client_document' as const, clientProgramId: PROGRAM, clientWorkspaceId: null };
    expect((await spine.findSourceByChecksum(ORG, 'same-study-scope-hash', { ...opts, studyRef: studyA }))?.id).toBe(first.id);
    expect((await spine.findSourceByChecksum(ORG, 'same-study-scope-hash', { ...opts, studyRef: studyB }))?.id).toBe(second.id);
    expect(await spine.findSourceByChecksum(ORG, 'same-study-scope-hash', { ...opts, studyRef: null })).toBeNull();
    expect(await spine.findSourceByChecksum(OTHER_ORG, 'same-study-scope-hash', { ...opts, studyRef: studyA })).toBeNull();
  });
});

describe('capture admission and commit outcomes fail closed', () => {
  it('an audit failure rolls back retirement and the new source together', async () => {
    const title = 'audit-rollback.txt';
    const first = await capture(title, 'Protocol Number: STUDY-A\nOriginal');
    audit.fail = true;
    await expect(capture(title, 'Protocol Number: STUDY-A\nUpdated')).rejects.toThrow('injected capture audit failure');
    expect(await states(title)).toMatchObject([{ id: first.source.id, is_current: true, previous_version_id: null }]);
  });

  it('a failed study lookup refuses capture rather than recording an unrelated source', async () => {
    const title = 'lookup-unavailable.txt';
    const params = await upload(title, 'Protocol Number: STUDY-A');
    intercept = async sql => { if (sql.includes('SELECT id, study_id, protocol_id')) throw new Error('study store unavailable'); };
    try { await expect(spine.captureClientSource(ORG, params, { text: 'Protocol Number: STUDY-A' })).rejects.toThrow('study store unavailable'); }
    finally { intercept = undefined; }
    expect(await states(title)).toHaveLength(0);
  });

  it('rechecks membership after waiting for the capture reservation', async () => {
    const title = 'revoked-capture.txt';
    const params = await upload(title, 'Protocol Number: STUDY-A');
    intercept = async sql => {
      if (sql.includes('SELECT pg_advisory_xact_lock')) {
        intercept = undefined;
        await pg.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=1', [ORG]);
      }
    };
    try { await expect(spine.captureClientSource(ORG, params, { text: 'Protocol Number: STUDY-A' })).rejects.toMatchObject({ status: 403 }); }
    finally { intercept = undefined; }
    expect(await states(title)).toHaveLength(0);
  });

  it('requires the recorded original upload and never accepts a guessed byte binding', async () => {
    const title = 'wrong-original.txt';
    const params = await upload(title, 'Protocol Number: STUDY-A');
    await expect(spine.captureClientSource(ORG, { ...params, checksum: '0'.repeat(64) }, { text: 'Protocol Number: STUDY-A' }))
      .rejects.toMatchObject({ code: 'SOURCE_UPLOAD_UNAVAILABLE' });
    expect(await states(title)).toHaveLength(0);
  });

  it('a retained deleted capture cannot be replaced by a fresh current identity for its bytes', async () => {
    const title = 'deleted-capture.txt';
    const body = 'Protocol Number: STUDY-A\nRetained deleted source';
    const first = await capture(title, body);
    await query('UPDATE cre_evidence_sources SET deleted_at=now() WHERE id=$1', [first.source.id]);
    await expect(capture(title, body)).rejects.toMatchObject({ code: 'SOURCE_CAPTURE_RETIRED', sourceId: first.source.id });
    expect(await states(title)).toHaveLength(1);
  });

  it('a project use share permits reading but cannot capture a file', async () => {
    const title = 'read-share-only.txt';
    const body = 'Protocol Number: STUDY-A\nRead-only collaborator';
    await query("INSERT INTO users(id,name,email,password_hash,status) VALUES(3,'Read collaborator','capture-reader@example.invalid','fixture-only','active')");
    await query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,3,'member')", [ORG]);
    await query("INSERT INTO project_members(organization_id,project_id,user_id,role,status) VALUES($1,$1,3,'use','active')", [ORG]);
    await expect(spine.captureClientSource(ORG, await upload(title, body, 3), { text: body }))
      .rejects.toMatchObject({ status: 403, code: 'SOURCE_WRITE_PERMISSION_DENIED' });
    expect(await states(title)).toHaveLength(0);
  });

  it('a lost commit acknowledgement preserves uncertainty and a retry resolves the committed identity', async () => {
    const title = 'uncertain-commit.txt';
    const body = 'Protocol Number: STUDY-A\nCommitted but acknowledgement lost';
    const params = await upload(title, body);
    intercept = async sql => {
      if (sql === 'COMMIT') {
        intercept = undefined;
        await pg.query('COMMIT');
        throw new Error('injected lost commit acknowledgement');
      }
    };
    try { await expect(spine.captureClientSource(ORG, params, { text: body }))
      .rejects.toMatchObject({ status: 503, code: 'SOURCE_CAPTURE_COMMIT_UNCONFIRMED' }); }
    finally { intercept = undefined; }
    const committed = await states(title);
    expect(committed).toHaveLength(1);
    const recovered = await capture(title, body);
    expect(recovered).toMatchObject({ reused: true, source: { id: committed[0].id } });
    expect(await states(title)).toHaveLength(1);
  });
});

describe('the canonical program reservation remains a required admission', () => {
  it('refuses a program that disappears at its row lock before any source insert', async () => {
    const title = 'program-retired-at-lock.txt';
    const params = await upload(title, 'Protocol Number: STUDY-A');
    const writes: string[] = [];
    intercept = async sql => {
      if (/FROM regulatory_programs\b/.test(sql) && /FOR SHARE/.test(sql)) {
        await pg.query('UPDATE regulatory_programs SET deleted_at=now() WHERE id=$1', [PROGRAM]);
      }
      if (/INSERT INTO cre_evidence_sources\b/.test(sql)) writes.push(sql);
    };
    try { await expect(spine.captureClientSource(ORG, params, { text: 'Protocol Number: STUDY-A' }))
      .rejects.toMatchObject({ status: 404, code: 'PROJECT_NOT_FOUND' }); }
    finally { intercept = undefined; }
    expect(writes).toHaveLength(0);
    expect(await states(title)).toHaveLength(0);
  });

  it('reports an unavailable program row lock separately from a missing program', async () => {
    const title = 'program-lock-unavailable.txt';
    const params = await upload(title, 'Protocol Number: STUDY-A');
    intercept = async sql => {
      if (/FROM regulatory_programs\b/.test(sql) && /FOR SHARE/.test(sql)) throw new Error('injected ownership store failure');
    };
    try { await expect(spine.captureClientSource(ORG, params, { text: 'Protocol Number: STUDY-A' }))
      .rejects.toMatchObject({ status: 503, code: 'PROJECT_ACCESS_UNAVAILABLE' }); }
    finally { intercept = undefined; }
    expect(await states(title)).toHaveLength(0);
  });
});
