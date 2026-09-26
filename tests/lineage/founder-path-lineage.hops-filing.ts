/**
 * Hops 7–8 of the founder-path lineage walk (place into a sequence, transmit to
 * the agency) and the two walks over recorded keys. Support for
 * tests/lineage/founder-path-lineage.pglite.test.ts — not a test file; the
 * header there names every route and service line these hops drive.
 */
import { expect } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PoolClient } from 'pg';
import type { Queryable as SpanQueryable } from '../../server/services/clinical-regulatory-evidence/span-lineage.service';
import { REPO_ROOT } from '../golden-journeys/harness';
import { Hop, ORG_A, AUTHOR, PASSWORD, SHA256_X, HEX64, sha256, json, asPrincipal, type World } from './founder-path-lineage.world';

type Row = Record<string, unknown>;

/**
 * 7 · takeAuthoringSnapshot — the service behind POST /api/coauthor/documents
 * (coauthor.ts:200-208; coauthor-snapshot.ts:423) — then POST /api/submissions/:id/sequences
 * (submissions.ts:876) and PUT /sequences/:id/leaves ×2 (:928; submission-service.ts:1842, :2062).
 */
export async function hopPlace(w: World): Promise<void> {
  const { k, q } = w;
  const hop = new Hop('place');
  const { takeAuthoringSnapshot } = await import('../../server/services/coauthor/coauthor-snapshot');
  const snap = await takeAuthoringSnapshot({
    organizationId: ORG_A, sourceAuthoringDocId: String(k.docId), moduleNumber: '2.5', templateId: null,
    createdBy: AUTHOR.id, actor: { userId: Number(AUTHOR.id), email: AUTHOR.email } as never,
  });
  expect(snap.ok, JSON.stringify(snap)).toBe(true);
  k.coauthorId = Number((snap as { document: { id: number } }).document.id);
  const seq = await asPrincipal(ORG_A, 3)(request(w.app).post(`/api/submissions/${k.submissionId}/sequences`)).send({ region: 'fda', sequenceNumber: '0000', type: 'original' });
  expect(seq.status, JSON.stringify(seq.body)).toBe(201);
  k.sequenceId = Number(seq.body.id);
  const place = (body: Row) => asPrincipal(ORG_A, 3)(request(w.app).put(`/api/submissions/sequences/${k.sequenceId}/leaves`)).send(body);
  const l1 = await place({
    sectionCode: '2.5', title: 'Clinical Overview', lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: k.coauthorId,
    reason: 'Placing the sealed Module 2.5 filing copy into the original IND sequence.',
  });
  const l2 = await place({
    sectionCode: '2.5', title: 'Clinical Overview (Vault PDF)', lifecycleOp: 'new', documentTable: 'vault_documents', documentUuid: k.vaultDocumentId,
    reason: 'Placing the Vault copy of the sealed Module 2.5 into the original IND sequence.',
  });
  expect(l1.status, JSON.stringify(l1.body)).toBe(200);
  expect(l2.status, JSON.stringify(l2.body)).toBe(200);
  k.leafIds = [Number(l1.body.id), Number(l2.body.id)];

  await hop.check('filing-copy-names-seal', 'the filing copy is aliased to the authoring document and names the seal it was taken under', async (observe) => {
    const [c] = await q<{ status: string; metadata: unknown }>('SELECT status, metadata FROM coauthor_documents WHERE id = $1', [k.coauthorId]);
    const [alias] = await q<{ canonical_id: string }>(
      `SELECT canonical_id FROM c2c_document_aliases WHERE store = 'coauthor_documents' AND native_id = $1 AND organization_id = $2`, [String(k.coauthorId), ORG_A]);
    observe(c?.status);
    expect(c.status).toBe('approved');
    expect(json(c.metadata)).toMatchObject({ docId: k.docId, sealVersion: 'approved', sealContentHash: k.approvedSealHash });
    expect(alias?.canonical_id).toBe(k.docId);
  });
  await hop.check('coauthor-leaf-pins-copy', 'the coauthor leaf pins the filing copy and the sha256 of its text', async (observe) => {
    const [leaf] = await q('SELECT * FROM submission_leaves WHERE id = $1', [k.leafIds![0]]);
    const [c] = await q<{ content: string }>('SELECT content FROM coauthor_documents WHERE id = $1', [k.coauthorId]);
    observe(leaf?.document_table);
    expect(leaf).toMatchObject({ document_table: 'coauthor_documents', document_id: k.coauthorId, document_content_sha256: sha256(c.content) });
  });
  await hop.check('vault-leaf-pins-bytes', 'the vault leaf pins the Vault document and its content hash', async (observe) => {
    const [leaf] = await q('SELECT * FROM submission_leaves WHERE id = $1', [k.leafIds![1]]);
    const [v] = await q<{ content_hash: string }>('SELECT content_hash FROM vault.documents WHERE id = $1', [k.vaultDocumentId]);
    observe(leaf?.document_table);
    expect(leaf).toMatchObject({ document_table: 'vault_documents', document_uuid: k.vaultDocumentId, document_content_sha256: v.content_hash });
  });
  await hop.check('placement-audit-names-document-and-pin', 'each LEAF_CREATED ledger row names the document it placed and the pin it took', async (observe) => {
    const leaves = await q<{ id: number; document_id: number | null; document_uuid: string | null; document_content_sha256: string }>(
      'SELECT id, document_id, document_uuid, document_content_sha256 FROM submission_leaves WHERE id = ANY($1) ORDER BY id', [k.leafIds]);
    const named: boolean[] = [];
    for (const leaf of leaves) {
      const [row] = await q<{ new_values: unknown }>(`SELECT new_values FROM audit_logs WHERE action = 'LEAF_CREATED' AND record_id = $1`, [String(leaf.id)]);
      const text = JSON.stringify(json(row?.new_values));
      named.push(text.includes(leaf.document_content_sha256) && text.includes(String(leaf.document_uuid ?? leaf.document_id)));
    }
    observe(named);
    expect(named).toEqual(leaves.map(() => true));
  });
  hop.verdict();
}

/** Staging FDA ESG credentials whose files exist; the AS2 signature and POST that would read them are stubbed. */
function configureStubEsg(w: World): void {
  const creds = fs.mkdtempSync(path.join(os.tmpdir(), 'founder-lineage-esg-'));
  w.tmpDirs.push(creds);
  for (const f of ['cert.pem', 'key.pem', 'fda.pem']) fs.writeFileSync(path.join(creds, f), 'stub: the AS2 signature and POST are stubbed');
  const env: Record<string, string> = {
    FDA_ESG_STAGING_URL: 'https://esg-staging.fda.example/as2',
    FDA_ESG_STAGING_AS2_FROM: 'C2C-SPONSOR',
    FDA_ESG_STAGING_CERT_PATH: path.join(creds, 'cert.pem'),
    FDA_ESG_STAGING_KEY_PATH: path.join(creds, 'key.pem'),
    FDA_ESG_STAGING_FDA_CERT_PATH: path.join(creds, 'fda.pem'),
  };
  for (const [key, value] of Object.entries(env)) {
    if (!(key in w.envBefore)) w.envBefore[key] = process.env[key];
    process.env[key] = value;
  }
}

/**
 * The Submission Center's governed sequence: transition to validated, then
 * freeze, dispatch and transmit, each on its own Part 11 sign by the approver
 * (separation of duties: the author created the sequence). Routes:
 * submissions.ts:890, :1674, :1690, :1718; c2c/actions.ts:777.
 */
async function freezeDispatchTransmit(w: World): Promise<request.Response> {
  const seqId = w.k.sequenceId!;
  const as = (userId: number) => asPrincipal(ORG_A, userId);
  for (const status of ['assembling', 'validated']) {
    const t = await as(3)(request(w.app).post(`/api/submissions/sequences/${seqId}/transition`)).send({ status });
    expect(t.status, JSON.stringify(t.body)).toBe(200);
  }
  // Seeded, not run: POST /sequences/:id/shadow-review calls a model (see the test file's header).
  await w.jdb.pool.query(
    `INSERT INTO shadow_review_runs (sequence_id, organization_id, region, lens, status, summary, created_by)
     VALUES ($1, $2, 'fda', 'fda_filing', 'complete', 'Seeded completed run: the reviewer calls a model', $3)`,
    [seqId, ORG_A, 3],
  );
  const sign = async (intent: 'freeze' | 'dispatch' | 'transmit'): Promise<string> => {
    const s = await as(4)(request(w.app).post('/api/c2c/actions/sign')).send({
      target: `ectd-sequence:${seqId}`,
      reason: `Approved for ${intent}: the C2C-101 IND original sequence is complete.`,
      payload: { intent, meaning: 'approval' },
      reauth: { password: PASSWORD },
    });
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    return String(s.body.actionId);
  };
  for (const step of ['freeze', 'dispatch'] as const) {
    const r = await as(4)(request(w.app).post(`/api/submissions/sequences/${seqId}/${step}`)).send({ signatureActionId: await sign(step) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
  return as(4)(request(w.app).post(`/api/submissions/sequences/${seqId}/transmit`)).send({
    signatureActionId: await sign('transmit'), environment: 'staging', applicationId: '123456', sponsorId: 'C2C-SPONSOR', sponsorName: 'Founder Org',
  });
}

/** Files under client/src that call the sequence transmit route. */
function sequenceTransmitCallers(): string[] {
  const callers: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== '__tests__') walk(full);
      } else if (/\.(tsx?|jsx?)$/.test(e.name) && /\/api\/submissions\/sequences\/[^'"`\n]*\/transmit/.test(fs.readFileSync(full, 'utf8'))) {
        callers.push(path.relative(REPO_ROOT, full));
      }
    }
  };
  walk(path.join(REPO_ROOT, 'client', 'src'));
  return callers;
}

/** 8 · transmitSequence (submission-service.ts:1217, :1418, :1443) through the real FDA ESG gateway (fda-esg.ts:264-281). */
export async function hopTransmit(w: World): Promise<void> {
  const { k, q } = w;
  const hop = new Hop('transmit');
  configureStubEsg(w);
  const tr = await freezeDispatchTransmit(w);
  expect(tr.status, JSON.stringify(tr.body)).toBe(200);
  k.transmittalId = Number(tr.body.transmittalId);
  const [tx] = await q('SELECT * FROM submission_transmittals WHERE id = $1', [k.transmittalId]);
  const transmitted = async () => (await q<{ record_id: string; new_values: unknown }>(
    `SELECT record_id, new_values FROM audit_logs WHERE action = 'ECTD_TRANSMITTED' AND tenant_id = $1`, [ORG_A]))[0];

  await hop.check('transmitted', 'the transmittal records the sha256 of exactly the bytes that left, and the ledger names it', async (observe) => {
    const row = await transmitted();
    observe(tr.body.transmitted);
    expect(tr.body).toMatchObject({ transmitted: true, gateway: 'esg' });
    expect(w.h.wire).toHaveLength(1);
    expect(tx.bundle_sha256).toBe(sha256(w.h.wire[0]));
    expect(row.record_id).toBe(String(k.sequenceId));
    expect(json(row.new_values).transmittalId).toBe(k.transmittalId);
  });
  await hop.check('reachable-from-the-product', 'a Submission Center control calls the sequence transmit route', async (observe) => {
    const callers = sequenceTransmitCallers();
    observe(callers.length);
    expect(callers.length).toBeGreaterThan(0);
  });
  await hop.check('bytes-retained', 'the bytes the agency received can be read back by the transmittal and hash to its bundle_sha256', async (observe) => {
    const kept = typeof tx.bundle_path === 'string' && fs.existsSync(tx.bundle_path);
    observe(kept);
    expect(kept).toBe(true);
    expect(sha256(fs.readFileSync(String(tx.bundle_path)))).toBe(tx.bundle_sha256);
  });
  await hop.check('transmittal-names-sequence', 'the transmittal row names its sequence and its project', async (observe) => {
    observe({ sequenceIdColumn: 'sequence_id' in tx, programId: tx.program_id ?? null });
    expect(tx.sequence_id).toBe(k.sequenceId);
    expect(tx.program_id).toBe(k.programId);
  });
  await hop.check('transmit-record-names-bundle', 'the ECTD_TRANSMITTED ledger row carries the bundle sha256', async (observe) => {
    const carries = JSON.stringify(json((await transmitted()).new_values)).includes(String(tx.bundle_sha256));
    observe(carries);
    expect(carries).toBe(true);
  });
  hop.verdict();
}

/** Walk back: from the one transmittal id, by recorded keys only. */
export async function walkBack(w: World): Promise<void> {
  const { k, q } = w;
  const hop = new Hop('walk-back');
  const trail: { sequenceId?: number; leaves?: Row[]; docId?: string } = {};

  await hop.check('audit-ledger-verifies', 'the tenant’s chained audit ledger — which several steps below read keys from — verifies', async (observe) => {
    const { verifyAuditChain } = await import('../../server/services/audit/chain');
    const verdict = await verifyAuditChain((await w.jdb.pool.connect()) as unknown as PoolClient, { tenantId: ORG_A });
    observe(verdict.ok);
    expect(verdict.ok, JSON.stringify(verdict)).toBe(true);
  });
  await hop.check('transmittal-to-sequence', 'the transmittal resolves to exactly one sequence', async (observe) => {
    const rows = await q<{ record_id: string }>(`SELECT record_id FROM audit_logs WHERE action = 'ECTD_TRANSMITTED' AND (new_values->>'transmittalId')::int = $1`, [k.transmittalId]);
    observe(rows.length);
    expect(rows).toHaveLength(1);
    trail.sequenceId = Number(rows[0].record_id);
  });
  await hop.check('sequence-to-pinned-leaves', 'the sequence’s leaves each name a document and pin its digest', async (observe) => {
    trail.leaves = await q('SELECT * FROM submission_leaves WHERE sequence_id = $1 AND deleted_at IS NULL ORDER BY id', [trail.sequenceId]);
    observe(trail.leaves.map((l) => l.document_table));
    expect(trail.leaves).toHaveLength(2);
    for (const l of trail.leaves) expect(String(l.document_content_sha256)).toMatch(HEX64);
  });
  await hop.check('leaves-to-project', 'each leaf reaches the project: the filing copy through its alias, the Vault copy through its program', async (observe) => {
    const programIds = new Set<string>();
    for (const l of trail.leaves!) {
      if (l.document_table === 'coauthor_documents') {
        const [a] = await q<{ canonical_id: string }>(`SELECT canonical_id FROM c2c_document_aliases WHERE store = 'coauthor_documents' AND native_id = $1`, [String(l.document_id)]);
        const [d] = await q<{ id: string; client_program_id: string }>('SELECT id, client_program_id FROM authoring_documents WHERE id = $1', [a.canonical_id]);
        trail.docId = d.id;
        programIds.add(d.client_program_id);
      } else {
        programIds.add((await q<{ program_id: string }>('SELECT program_id FROM vault.documents WHERE id = $1', [l.document_uuid]))[0].program_id);
      }
    }
    observe([...programIds].map((p) => p === k.programId));
    expect([...programIds]).toEqual([k.programId]);
  });
  await hop.check('sequence-to-project', 'the sequence’s submission reaches the same project (the project-creation record names it)', async (observe) => {
    const [s] = await q<{ submission_id: number }>('SELECT submission_id FROM ectd_sequences WHERE id = $1', [trail.sequenceId]);
    const rows = await q<{ target: string }>(`SELECT target FROM audit_logs WHERE action = 'c2c.project.create' AND (new_values->>'submission_id')::int = $1`, [s.submission_id]);
    const programs = [...new Set(rows.map((r) => r.target.replace(/^regulatory_program:/, '')))];
    observe(programs.length);
    expect(programs).toEqual([k.programId]);
  });
  await hop.check('filing-copy-leaf-to-seal', 'the filing-copy leaf reaches the seal: the copy names it, the seal verifies, the pin still matches the copy', async (observe) => {
    const leaf = trail.leaves!.find((l) => l.document_table === 'coauthor_documents')!;
    const [c] = await q<{ content: string; metadata: unknown }>('SELECT content, metadata FROM coauthor_documents WHERE id = $1', [leaf.document_id]);
    const m = json(c.metadata);
    const [seal] = await q<{ content_hash: string; frozen_content: string }>('SELECT content_hash, frozen_content FROM frozen_documents WHERE document_id = $1 AND version = $2', [m.docId, m.sealVersion]);
    observe(Boolean(seal));
    expect(seal.content_hash).toBe(m.sealContentHash);
    expect(sha256(seal.frozen_content)).toBe(seal.content_hash);
    expect(sha256(c.content)).toBe(leaf.document_content_sha256);
  });
  await hop.check('vault-leaf-to-seal', 'the Vault leaf reaches the seal it was rendered from, by a recorded key', async (observe) => {
    const leaf = trail.leaves!.find((l) => l.document_table === 'vault_documents')!;
    const seals = await q<{ content_hash: string }>('SELECT content_hash FROM frozen_documents WHERE document_id = $1', [trail.docId]);
    const recorded = JSON.stringify([
      await q('SELECT * FROM vault.documents WHERE id = $1', [leaf.document_uuid]),
      await q(`SELECT new_values FROM audit_logs WHERE new_values->>'vaultDocumentId' = $1`, [String(leaf.document_uuid)]),
    ]);
    const named = seals.filter((s) => recorded.includes(s.content_hash)).length;
    observe(named);
    expect(named).toBeGreaterThanOrEqual(1);
  });
  await hop.check('document-to-source-checksum', 'the authoring document’s spans reach cre_evidence_sources.checksum = sha256(X)', async (observe) => {
    const { listDocumentSpans } = await import('../../server/services/clinical-regulatory-evidence/span-lineage.service');
    const checksums: string[] = [];
    for (const s of await q<{ id: string }>('SELECT id FROM authoring_sections WHERE doc_id = $1', [trail.docId])) {
      const spans = await listDocumentSpans(ORG_A, { documentTable: 'authoring_sections', documentId: s.id }, w.jdb.pool as unknown as SpanQueryable);
      for (const span of spans.filter((x) => x.provenanceKind === 'cre_evidence_source')) {
        checksums.push(...(await q<{ checksum: string }>('SELECT checksum FROM cre_evidence_sources WHERE id = $1', [Number(span.referenceId)])).map((r) => r.checksum));
      }
    }
    observe(checksums.length);
    expect(checksums).toContain(SHA256_X);
  });
  hop.verdict();
}

/** From the project's authoring document, forward through both of its copies to the transmittal. */
async function documentToTransmittals(w: World): Promise<{ leaves: number; sequences: number; transmittals: number[] }> {
  const { k, q } = w;
  const [doc] = await q<{ id: string }>('SELECT id FROM authoring_documents WHERE client_program_id = $1', [k.programId]);
  const [alias] = await q<{ native_id: string }>(`SELECT native_id FROM c2c_document_aliases WHERE canonical_id = $1 AND store = 'coauthor_documents'`, [doc.id]);
  const filed = await q<{ new_values: unknown }>(`SELECT new_values FROM audit_logs WHERE action = 'authoring.document.file_to_vault' AND record_id = $1`, [doc.id]);
  const leaves = await q<{ sequence_id: number }>(
    `SELECT sequence_id FROM submission_leaves
      WHERE deleted_at IS NULL
        AND ((document_table = 'coauthor_documents' AND document_id = $1)
          OR (document_table = 'vault_documents' AND document_uuid::text = ANY($2)))`,
    [Number(alias.native_id), filed.map((r) => String(json(r.new_values).vaultDocumentId))]);
  const sequences = [...new Set(leaves.map((l) => l.sequence_id))];
  const tx = await q<{ transmittal_id: number }>(
    `SELECT (new_values->>'transmittalId')::int AS transmittal_id FROM audit_logs WHERE action = 'ECTD_TRANSMITTED' AND record_id = ANY($1)`,
    [sequences.map(String)]);
  return { leaves: leaves.length, sequences: sequences.length, transmittals: tx.map((t) => t.transmittal_id) };
}

/** Walk forward: from the project, and from the one source id, by recorded keys only. */
export async function walkForward(w: World): Promise<void> {
  const { k, q } = w;
  const hop = new Hop('walk-forward');

  await hop.check('project-to-its-records', 'from the project: its Data Room source, its authoring document, its Vault copy and its submission', async (observe) => {
    const counts = [
      (await q('SELECT id FROM cre_evidence_sources WHERE client_program_id = $1', [k.programId])).length,
      (await q('SELECT id FROM authoring_documents WHERE client_program_id = $1', [k.programId])).length,
      (await q('SELECT id FROM vault.documents WHERE program_id = $1 AND deleted_at IS NULL', [k.programId])).length,
      (await q(`SELECT 1 FROM audit_logs WHERE action = 'c2c.project.create' AND target = $1 AND new_values->>'submission_id' IS NOT NULL`, [`regulatory_program:${k.programId}`])).length,
    ];
    observe(counts);
    expect(counts).toEqual([1, 1, 1, 1]);
  });
  await hop.check('source-to-documents', 'from the source: the spans citing it reach an authoring document of the project', async (observe) => {
    const { listSpansCitingSource } = await import('../../server/services/clinical-regulatory-evidence/span-lineage.service');
    const spans = await listSpansCitingSource(ORG_A, k.sourceId!, w.jdb.pool as unknown as SpanQueryable);
    const sectionIds = spans.filter((x) => x.documentTable === 'authoring_sections').map((x) => x.documentId);
    const docs = await q<{ id: string }>(
      `SELECT DISTINCT d.id FROM authoring_sections s JOIN authoring_documents d ON d.id = s.doc_id
        WHERE s.id::text = ANY($1) AND d.client_program_id = $2`, [sectionIds, k.programId]);
    observe(spans.length);
    expect(docs.map((d) => d.id)).toContain(k.docId);
  });
  await hop.check('document-to-transmittal', 'from the project’s authoring document: its filing copy and its Vault copy reach the transmitted sequence', async (observe) => {
    const reached = await documentToTransmittals(w);
    observe({ leaves: reached.leaves, sequences: reached.sequences, transmittals: reached.transmittals.length });
    expect(reached.leaves).toBe(2);
    expect(reached.transmittals).toEqual([k.transmittalId]);
  });
  await hop.check('data-room-shows-use', 'the project’s Data Room reports the source as used by a document', async (observe) => {
    const dr = await asPrincipal(ORG_A, 3)(request(w.app).get(`/api/c2c/projects/${k.programId}/sources`));
    const hit = (dr.body.sources ?? []).find((s: { id: number }) => s.id === k.sourceId);
    observe(hit?.usage?.documents ?? null);
    expect(hit?.usage?.documents).toBeGreaterThanOrEqual(1);
  });
  hop.verdict();
}
