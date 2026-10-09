/** Authenticated historical copying fidelity is not scientific qualification.
 * Real immutable writer, chained audit and disposition SQL; no signing writes.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDispositionHarness, type DispositionHarness, type DispositionFixture } from '../../document-data-disposition/__tests__/disposition-fixture';
import { TurnRecorder, sha256Hex, writeTurnRecord } from '../turn-record';
import { loadTurnRecord } from '../turn-record-verify';
import { sealVerifiedVersion, type SealVerifiedVersionInput } from '../verifiedSealService';
import { consumeRecordedDocxFidelity } from '../recorded-docx-fidelity';

const TEXT = 'Shelf life is 24 months at 25°C.';
const HASH = sha256Hex(TEXT);
const READ_LIMITS = { maxRecordBytes: 1_048_576, maxAuditBytes: 65_536, maxTextBytes: 1_048_576,
  maxTotalTextBytes: 4_194_304, maxTextRefs: 1_024 };
const ROOT = path.resolve('migrations');
let harness: DispositionHarness;
let fixture: DispositionFixture;
let projectId: number;
let versionId: number;
let statements: string[];

beforeAll(async () => {
  harness = await createDispositionHarness();
  await harness.pg.exec(fs.readFileSync(path.join(ROOT, '20260921_audit_logs_chain_seq.sql'), 'utf8'));
  await harness.pg.exec(fs.readFileSync(path.join(ROOT, '20260926_ana_turn_records.sql'), 'utf8'));
  await harness.pg.exec(`ALTER TABLE concept2cure_artifacts ADD COLUMN version integer;
    ALTER TABLE projects ADD COLUMN client_workspace_id integer;
    CREATE TABLE concept2cure_artifact_versions (id serial PRIMARY KEY, artifact_id integer NOT NULL,
      organization_id integer NOT NULL, version integer NOT NULL, content text, content_hash text);`);
});
afterAll(async () => { await harness.close(); });
beforeEach(async () => {
  fixture = await harness.seed();
  projectId = Number((await harness.pg.query<{ project_id: number }>(
    'SELECT project_id FROM concept2cure_artifacts WHERE id=$1', [fixture.artifact],
  )).rows[0].project_id);
  await harness.pg.query('UPDATE concept2cure_artifacts SET content=$2,content_hash=$3,version=2 WHERE id=$1',
    [fixture.artifact, TEXT, HASH]);
  versionId = Number((await harness.pg.query<{ id: number }>(`INSERT INTO concept2cure_artifact_versions
    (artifact_id,organization_id,version,content,content_hash) VALUES ($1,$2,2,$3,$4) RETURNING id`,
  [fixture.artifact, fixture.org, TEXT, HASH])).rows[0].id);
  statements = [];
});

function report(overrides: Record<string, unknown> = {}) {
  return {
    ok: true, scope: 'persisted_artifact_fidelity', comparisonBasis: 'persisted_artifact',
    artifactVerified: true, sourceVerified: false, sourceQualification: 'unassessed', sealEligible: false,
    target: { organizationId: fixture.org, projectId, artifactPk: fixture.artifact,
      artifactId: fixture.artifactNativeId, versionId, version: 2, contentSha256: HASH },
    docxSha256: sha256Hex('actual DOCX bytes are recorded elsewhere'), docxSizeBytes: 42,
    extractionMethod: 'controlled-receipt-fixture', docCharCount: TEXT.length,
    extractedTextSha256: HASH, comparisonTextSha256: HASH, sourceDiffPerformed: true,
    requiredStringsChecked: 0, missingRequiredStrings: [],
    divergence: { method: 'exact_text', additions: 0, deletions: 0 }, ...overrides,
  };
}
async function record(options: {
  report?: Record<string, unknown>; step?: Record<string, unknown>; projectRef?: string;
  extraText?: string; sent?: string; modelTexts?: string[];
} = {}) {
  const result = JSON.stringify(options.report ?? report());
  const recorder = new TurnRecorder();
  recorder.setTurn({ organizationId: fixture.org, actorUserId: 42, projectId: options.projectRef ?? String(projectId) });
  recorder.setRequest(options.extraText ?? 'Check the saved document', 'Check the saved document');
  if (options.modelTexts) recorder.setModelInput(options.modelTexts.map(content => ({ role: 'user', content })));
  recorder.addStep({ round: 1, tool: 'verify_docx_against_source', toolUseId: 'verify-1', label: 'Verify',
    status: 'success', input: { artifact_id: fixture.artifactNativeId, version_number: 2 }, result,
    runBy: 'platform', ...options.step });
  if (options.sent) recorder.setSentToModel([{ tool_use_id: 'verify-1', content: options.sent }]);
  const saved = await writeTurnRecord(harness.db, recorder.seal('answered'));
  return { turnRecordId: saved.id, stepIndex: 0, resultSha256: sha256Hex(result), toolUseId: 'verify-1' };
}
function input(receipt: unknown, overrides: Record<string, unknown> = {}): SealVerifiedVersionInput {
  return {
    organizationId: fixture.org, projectId, userId: 42, signerName: 'Jane Roe', title: 'Stability', content: TEXT,
    manifestation: { printedName: 'Jane Roe', meaning: 'APPROVER', reasonForChange: 'Reviewed report' },
    artifactExternalId: fixture.artifactNativeId, existingVersionNumber: 2,
    verification: { ok: true, receipt } as never, ...overrides,
  };
}
const pool = () => ({ connect: async () => ({
  query: async (sql: string, params?: unknown[]) => { statements.push(sql); return harness.db.query(sql, params); },
  release: () => undefined,
}) });
async function blocked(receipt: unknown, code: string, overrides: Record<string, unknown> = {}) {
  await expect(sealVerifiedVersion(input(receipt, overrides), pool())).rejects.toMatchObject({ code });
  expect(statements.filter(sql => /^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(sql))).toEqual([]);
}
async function privileged(sql: string, params: unknown[] = []) {
  await harness.pg.exec('ALTER TABLE ana_record_blobs DISABLE TRIGGER trg_ana_record_blobs_append_only');
  await harness.pg.exec('ALTER TABLE ana_turn_records DISABLE TRIGGER trg_ana_turn_records_append_only');
  try { await harness.pg.query(sql, params); } finally {
    await harness.pg.exec('ALTER TABLE ana_record_blobs ENABLE TRIGGER trg_ana_record_blobs_append_only');
    await harness.pg.exec('ALTER TABLE ana_turn_records ENABLE TRIGGER trg_ana_turn_records_append_only');
  }
}

describe('a recorded DOCX check has a bounded authenticated refusal path', () => {
  it('returns only a compact historical identity, not full texts or authorization', async () => {
    const receipt = await record();
    const result = await consumeRecordedDocxFidelity(harness.db, input(receipt), receipt);
    expect(result).toMatchObject({ ...receipt, auditPayloadVerified: true, fullAuditChainVerified: false,
      sourceVerified: false, sourceQualification: 'unassessed', sealEligible: false });
    expect(result.recordSha256).toMatch(/^[a-f0-9]{64}$/);
    for (const field of ['report', 'texts', 'content', 'recordText', 'extractedText']) expect(result).not.toHaveProperty(field);
  });
  it('authenticates faithful copying but still refuses scientific qualification without governed writes', async () => {
    await blocked(await record(), 'SOURCE_QUALIFICATION_UNASSESSED');
    expect(statements.some(sql => sql.includes('ana_turn_records'))).toBe(true);
    expect(statements.some(sql => sql.includes('concept2cure_artifacts'))).toBe(true);
  });
  it.each([null, 'id', {}, { turnRecordId: randomUUID(), stepIndex: -1, resultSha256: HASH },
    { turnRecordId: randomUUID(), stepIndex: 0, resultSha256: HASH.toUpperCase() },
    { turnRecordId: randomUUID(), stepIndex: 10001, resultSha256: HASH },
    { turnRecordId: randomUUID(), stepIndex: 0, resultSha256: HASH, toolUseId: ' ' }])(
    'refuses malformed explicit receipt %j before connecting', async receipt => {
      await blocked(receipt, 'INVALID_VERIFICATION_RECEIPT');
      expect(statements).toEqual([]);
    },
  );
  it('never loads a receipt from another tenant', async () => {
    const receipt = await record();
    await blocked(receipt, 'RECEIPT_UNAVAILABLE', { organizationId: fixture.org + 10000 });
  });
  it('reports a missing record honestly', async () => {
    await blocked({ turnRecordId: randomUUID(), stepIndex: 0, resultSha256: HASH }, 'RECEIPT_UNAVAILABLE');
  });
  it.each([{ stepIndex: 1 }, { resultSha256: 'a'.repeat(64) }, { toolUseId: 'another-tool-id' }])(
    'binds the exact recorded step %j', async changes => {
      await blocked({ ...await record(), ...changes }, 'RECEIPT_STEP_MISMATCH');
    },
  );
  it.each([{ tool: 'other_tool' }, { status: 'error' }, { runBy: 'server' }, { heldBack: true }])(
    'does not reinterpret ineligible step %j', async step => {
      await blocked(await record({ step }), 'RECEIPT_STEP_MISMATCH');
    },
  );
  it('authenticates the full recorded result even if the model received a budgeted summary', async () => {
    await blocked(await record({ sent: '{"ok":true}' }), 'SOURCE_QUALIFICATION_UNASSESSED');
  });
  it('will not use a model-budget rewrite digest as the full report proof', async () => {
    const sent = '{"ok":true}';
    await blocked({ ...await record({ sent }), resultSha256: sha256Hex(sent) }, 'RECEIPT_STEP_MISMATCH');
  });
  it.each([{ ok: false }, { scope: 'caller_text_fidelity' },
    { sourceVerified: true, sourceQualification: 'qualified', sealEligible: true }])(
    'refuses report claims outside copying fidelity %j', async overrides => {
      await blocked(await record({ report: report(overrides) }), 'RECEIPT_SCOPE_INSUFFICIENT');
    },
  );
  it('requires explicit seal selectors even when the receipt has a target', async () => {
    await blocked(await record(), 'RECEIPT_TARGET_MISMATCH', { artifactExternalId: undefined, existingVersionNumber: undefined });
  });
  it('binds the submitted bytes to the recorded current version', async () => {
    await blocked(await record(), 'RECEIPT_TARGET_MISMATCH', { content: `${TEXT} Changed.` });
  });
  it('rechecks current saved bytes rather than trusting historical fidelity', async () => {
    const receipt = await record();
    await harness.pg.query('UPDATE concept2cure_artifacts SET content=$2,content_hash=$3 WHERE id=$1',
      [fixture.artifact, 'Changed', sha256Hex('Changed')]);
    await blocked(receipt, 'RECEIPT_TARGET_MISMATCH');
  });
  it('rechecks canonical disposition eligibility after the receipt was recorded', async () => {
    const receipt = await record();
    await fixture.apply('remove_data');
    await blocked(receipt, 'RECEIPT_TARGET_MISMATCH');
  });
  it('resolves a recorded UUID project through the owned canonical anchor', async () => {
    await blocked(await record({ projectRef: fixture.program }), 'SOURCE_QUALIFICATION_UNASSESSED');
  });
  it('refuses a recorded project that does not resolve to the seal context', async () => {
    await blocked(await record({ projectRef: String(projectId + 10000) }), 'RECEIPT_TARGET_MISMATCH');
  });
});

describe('immutable receipt integrity and bounded transport', () => {
  it('catches a missing immutable result blob even past owner trigger protections', async () => {
    const receipt = await record();
    await privileged('DELETE FROM ana_record_blobs WHERE organization_id=$1 AND sha256=$2', [fixture.org, receipt.resultSha256]);
    await blocked(receipt, 'RECEIPT_INTEGRITY_FAILED');
  });
  it('catches a missing matching audit receipt', async () => {
    const receipt = await record();
    await harness.pg.query('DELETE FROM audit_logs WHERE tenant_id=$1 AND record_id=$2', [fixture.org, receipt.turnRecordId]);
    await blocked(receipt, 'RECEIPT_INTEGRITY_FAILED');
  });
  it('catches altered audit details that no longer authenticate the record', async () => {
    const receipt = await record();
    await harness.pg.query(`UPDATE audit_logs SET new_values=json_build_object('recordSha256',$3::text)
      WHERE tenant_id=$1 AND record_id=$2`, [fixture.org, receipt.turnRecordId, 'a'.repeat(64)]);
    await blocked(receipt, 'RECEIPT_INTEGRITY_FAILED');
  });
  it('catches a consistently rehashed record that no longer matches its audit receipt', async () => {
    const receipt = await record();
    const row = (await harness.pg.query<{ record_text: string }>('SELECT record_text FROM ana_turn_records WHERE id=$1', [receipt.turnRecordId])).rows[0];
    const body = JSON.parse(row.record_text); body.turn.projectId = 'different';
    const text = JSON.stringify(body);
    await privileged('UPDATE ana_turn_records SET record_text=$2,record_sha256=$3 WHERE id=$1', [receipt.turnRecordId, text, sha256Hex(text)]);
    await blocked(receipt, 'RECEIPT_INTEGRITY_FAILED');
  });
  it('enforces the consumer text byte limit on a genuinely recorded large turn', async () => {
    await blocked(await record({ extraText: 'x'.repeat(1_048_577) }), 'RECEIPT_LIMIT_EXCEEDED');
  });
  it('measures UTF-8 bytes, not JavaScript characters, for the individual text budget', async () => {
    const text = 'é'.repeat(524_289);
    expect(text.length).toBeLessThan(READ_LIMITS.maxTextBytes);
    expect(Buffer.byteLength(text, 'utf8')).toBeGreaterThan(READ_LIMITS.maxTextBytes);
    await blocked(await record({ extraText: text }), 'RECEIPT_LIMIT_EXCEEDED');
  });
  it('bounds aggregate unique text transport even when each blob fits individually', async () => {
    const modelTexts = Array.from({ length: 5 }, (_, index) => `${index}${'x'.repeat(900_000)}`);
    expect(modelTexts.every(text => Buffer.byteLength(text, 'utf8') <= READ_LIMITS.maxTextBytes)).toBe(true);
    expect(modelTexts.reduce((sum, text) => sum + Buffer.byteLength(text, 'utf8'), 0)).toBeGreaterThan(READ_LIMITS.maxTotalTextBytes);
    await blocked(await record({ modelTexts }), 'RECEIPT_LIMIT_EXCEEDED');
  });
  it('counts repeated content-addressed blobs once for aggregate transport', async () => {
    const shared = 'x'.repeat(900_000);
    await blocked(await record({ modelTexts: Array.from({ length: 5 }, () => shared) }), 'SOURCE_QUALIFICATION_UNASSESSED');
  });
  it('reports database read failure instead of allowing legacy fallback', async () => {
    const receipt = await record();
    const failing = { connect: async () => ({ query: async () => { throw new Error('Database unavailable'); }, release: () => undefined }) };
    await expect(sealVerifiedVersion(input(receipt), failing)).rejects.toMatchObject({ code: 'VERIFICATION_UNAVAILABLE' });
  });
});

describe('canonical record reader limits are opt-in', () => {
  it('keeps the unlimited historical reader compatible but refuses explicit record/text limits', async () => {
    const receipt = await record();
    expect(await loadTurnRecord(harness.db, fixture.org, receipt.turnRecordId)).not.toBeNull();
    const bounded = loadTurnRecord as unknown as (...args: unknown[]) => Promise<unknown>;
    for (const limits of [{ maxRecordBytes: 32 }, { maxTextBytes: 32 }, { maxAuditBytes: 32 },
      { maxTotalTextBytes: 32 }, { maxTextRefs: 1 }]) {
      await expect(bounded(harness.db, fixture.org, receipt.turnRecordId, { ...READ_LIMITS, ...limits })).rejects.toMatchObject({ name: 'TurnRecordReadError' });
    }
  });
});
