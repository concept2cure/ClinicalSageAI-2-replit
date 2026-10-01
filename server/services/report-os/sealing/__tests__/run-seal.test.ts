/**
 * A finalized run's seal is read back and re-verified (reporting review
 * 2026-10-01, Part 11: "the report seal cannot be re-verified"), with the cases
 * the adversarial review of the change confirmed.
 *
 * The chain row is the record of the act; the stored seal and document (on the
 * mutable snapshot) are checked against it. Pinned here:
 *   - a changed document, a forged seal, or any changed seal field is a mismatch;
 *   - a seal or document removed after a finalize that recorded storing it is a
 *     mismatch, never "not verifiable";
 *   - two finalization rows, or a row whose content no longer matches its
 *     payload hash, fail the chain check;
 *   - a run whose status was rewritten after the chain recorded its
 *     finalization is a mismatch;
 *   - only what the chain recorded is returned as the seal;
 *   - only a seal from before the document was stored is "not verifiable";
 *   - every read is scoped to the run's organisation, and a failed read throws.
 */
import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { buildSealedRecord } from '../seal';
import { readRunSeal, readVerifiedSealedDocument, verifyStoredSeal, type ChainRecord } from '../run-seal';
import type { RenderedReport } from '../../render/types';

const REPORT: RenderedReport = {
  reportTypeId: 'readiness.executive_digest',
  scopeType: 'project',
  scopeId: '12',
  generatedAt: '2026-10-01T08:00:00.000Z',
  status: 'final',
  sections: [{ id: 'executive-summary', title: 'Executive summary', blocks: [{ kind: 'summary', text: 'Ready to file.' }] }],
};
const SEAL = buildSealedRecord(REPORT, '2026-10-01T09:00:00.000Z');
const tampered = (): RenderedReport => ({
  ...REPORT,
  sections: [{ id: 'executive-summary', title: 'Executive summary', blocks: [{ kind: 'summary', text: 'Ready to file!' }] }],
});

/** The chain's record of SEAL, as finalize writes it. */
const CHAIN: ChainRecord = {
  sealHash: SEAL.contentHash,
  sealedAt: SEAL.sealedAt,
  atomCount: SEAL.atomCount,
  algorithm: SEAL.algorithm,
  canonVersion: SEAL.canonVersion ?? null,
  documentStored: true,
  payloadBound: true,
  occurredAt: '2026-10-01T09:00:01.000Z',
  reason: 'Issued for the board pack',
  meaning: 'approval',
  priorStatus: 'completed',
};
const verdict = (input: Partial<Parameters<typeof verifyStoredSeal>[0]>) =>
  verifyStoredSeal({ seal: SEAL, sealedDocument: REPORT, chain: CHAIN, chainRows: 1, ...input });

describe('verifyStoredSeal', () => {
  it('is intact when the document, the stored seal and the chain all agree', () => {
    const v = verdict({});
    expect(v.verdict).toBe('intact');
    expect(v.checks.map((c) => [c.check, c.ok])).toEqual([['audit-chain', true], ['stored-seal', true], ['stored-document', true]]);
  });

  it('is a mismatch when the stored document was changed', () => {
    expect(verdict({ sealedDocument: tampered() }).verdict).toBe('mismatch');
  });

  it('is a mismatch when the document and its stored seal were both rewritten: the chain holds the original', () => {
    const v = verdict({ sealedDocument: tampered(), seal: buildSealedRecord(tampered(), SEAL.sealedAt) });
    expect(v.verdict).toBe('mismatch');
    expect(v.checks.find((c) => c.check === 'stored-seal')?.detail).toMatch(/hash/);
  });

  it.each([
    ['sealing time', { sealedAt: '2020-01-01T00:00:00.000Z' }],
    ['atom count', { atomCount: 99 }],
    ['algorithm', { algorithm: 'md5' as never }],
    ['canonicalizer', { canonVersion: (SEAL.canonVersion === 2 ? 1 : 2) as 1 | 2 }],
  ])("is a mismatch when only the stored seal's %s was changed", (field, change) => {
    const v = verdict({ seal: { ...SEAL, ...change } });
    expect(v.verdict).toBe('mismatch');
    expect(v.checks.find((c) => c.check === 'stored-seal')?.detail).toMatch(new RegExp(field));
  });

  it("is a mismatch when the document's provenance atoms no longer match the recorded count", () => {
    const withAtom: RenderedReport = {
      ...REPORT,
      sections: [{ id: 's', title: 'S', blocks: [{ kind: 'metric', label: 'm', value: 1, provenance: [{ sourceTable: 'projects' }] }] }],
    };
    const seal = { ...buildSealedRecord(withAtom, SEAL.sealedAt), atomCount: 0 };
    const chain = { ...CHAIN, sealHash: seal.contentHash, atomCount: 0 };
    const v = verifyStoredSeal({ seal, sealedDocument: withAtom, chain, chainRows: 1 });
    expect(v.verdict).toBe('mismatch');
    expect(v.checks.find((c) => c.check === 'stored-document')?.detail).toMatch(/provenance atoms/);
  });

  it.each([
    ['the sealed document', { sealedDocument: null }],
    ['the stored seal', { seal: null }],
  ])('is a mismatch, not "not verifiable", when %s was removed after a finalize that stored it', (_label, removed) => {
    expect(verdict(removed).verdict).toBe('mismatch');
  });

  it('is a mismatch when the chain holds two finalizations of the run', () => {
    const v = verdict({ chainRows: 2, chain: null });
    expect(v.verdict).toBe('mismatch');
    expect(v.checks[0].detail).toMatch(/2 finalizations/);
  });

  it("is a mismatch when the chain row's content no longer matches its payload hash", () => {
    expect(verdict({ chain: { ...CHAIN, payloadBound: false } }).verdict).toBe('mismatch');
  });

  it('is a mismatch when a sealed document is stored but the chain holds no finalization', () => {
    expect(verdict({ chain: null, chainRows: 0 }).verdict).toBe('mismatch');
  });

  it('is not verifiable for a seal from before the chain row and the stored document existed', () => {
    const v = verdict({ sealedDocument: null, chain: null, chainRows: 0 });
    expect(v.verdict).toBe('not-verifiable');
    expect(v.checks.find((c) => c.check === 'stored-document')?.detail).toMatch(/cannot be recomputed/);
  });

  it('is not verifiable for a finalization recorded before the document was stored, whose seal agrees with the chain', () => {
    expect(verdict({ sealedDocument: null, chain: { ...CHAIN, documentStored: false } }).verdict).toBe('not-verifiable');
  });

  it('is a mismatch for such a finalization when its stored seal disagrees with the chain', () => {
    const v = verdict({ sealedDocument: null, seal: { ...SEAL, sealedAt: '2020-01-01T00:00:00.000Z' }, chain: { ...CHAIN, documentStored: false } });
    expect(v.verdict).toBe('mismatch');
  });
});

/** The chain row as audit_logs holds it: new_values as written, payload_hash = sha256 of that text. */
function chainRow(details: Record<string, unknown>, edit?: (text: string) => string) {
  const written = JSON.stringify(details);
  return { nv: edit ? edit(written) : written, payload_hash: createHash('sha256').update(written).digest('hex'), occurred_at: new Date(CHAIN.occurredAt!) };
}
const CHAIN_DETAILS = {
  runUuid: 'u', reportTypeId: REPORT.reportTypeId, priorStatus: 'completed', sealHash: SEAL.contentHash,
  algorithm: SEAL.algorithm, canonVersion: SEAL.canonVersion, atomCount: SEAL.atomCount, sealedAt: SEAL.sealedAt,
  documentStored: true, reason: 'Issued for the board pack', meaning: 'approval',
};
const SIGNATURE = { signer_name: 'Dana Reyes', signed_at: new Date('2026-10-01T09:00:01.000Z'), signature_meaning: 'approval' };

/**
 * A client that answers each read from a table of rows and records every query
 * with its parameters. It honours LIMIT, as the database does: a chain read
 * limited to one row would never see a second finalization.
 */
function client(rows: { snapshot?: unknown; chain?: Array<Record<string, unknown>>; signature?: Record<string, unknown> }, fail?: RegExp) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const limited = (sql: string, all: Array<Record<string, unknown>>) => all.slice(0, Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? all.length));
  return {
    calls,
    query: async (sql: string, params: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> => {
      calls.push({ sql, params });
      if (fail?.test(sql)) throw new Error('connection reset');
      if (/FROM report_snapshots/.test(sql)) return { rows: rows.snapshot ? [{ snapshot_metadata: rows.snapshot }] : [] };
      if (/FROM audit_logs/.test(sql)) return { rows: limited(sql, rows.chain ?? []) };
      if (/FROM electronic_signatures/.test(sql)) return { rows: rows.signature ? [rows.signature] : [] };
      return { rows: [] };
    },
  };
}

const FINAL = { id: 41, organizationId: 7, status: 'final' };
const STORED = { seal: SEAL, sealedDocument: REPORT, finalizedAt: '2026-10-01T09:00:00.000Z' };

describe('readRunSeal', () => {
  it('reports the act as the chain recorded it, with the signature, and verifies the stored copies against it', async () => {
    const view = await readRunSeal(client({ snapshot: STORED, chain: [chainRow(CHAIN_DETAILS)], signature: SIGNATURE }), FINAL);
    expect(view).toMatchObject({
      runId: 41,
      sealed: true,
      seal: { algorithm: 'sha256', contentHash: SEAL.contentHash, sealedAt: SEAL.sealedAt, atomCount: SEAL.atomCount },
      finalizedAt: CHAIN.occurredAt,
      signature: { signerName: 'Dana Reyes', signedAt: '2026-10-01T09:00:01.000Z', meaning: 'approval' },
      finalization: { reason: 'Issued for the board pack', meaning: 'approval', priorStatus: 'completed' },
      verification: { verdict: 'intact' },
    });
  });

  it('reads a snapshot stored as json text too', async () => {
    const view = await readRunSeal(client({ snapshot: JSON.stringify(STORED), chain: [chainRow(CHAIN_DETAILS)] }), FINAL);
    expect(view.verification.verdict).toBe('intact');
  });

  it("binds the chain row's content to its payload hash: an edited row fails", async () => {
    const edited = chainRow(CHAIN_DETAILS, (t) => t.replace('Issued for the board pack', 'Issued for the audit'));
    const view = await readRunSeal(client({ snapshot: STORED, chain: [edited] }), FINAL);
    expect(view.verification.verdict).toBe('mismatch');
    expect(view.verification.checks[0].detail).toMatch(/payload hash/);
  });

  it('fails the chain check when the run was recorded as finalized twice', async () => {
    const view = await readRunSeal(client({ snapshot: STORED, chain: [chainRow(CHAIN_DETAILS), chainRow(CHAIN_DETAILS)] }), FINAL);
    expect(view.verification.verdict).toBe('mismatch');
    expect(view.finalization).toBeNull();
  });

  it('scopes every read to the run and its organisation', async () => {
    const c = client({ snapshot: STORED, chain: [chainRow(CHAIN_DETAILS)], signature: SIGNATURE });
    await readRunSeal(c, FINAL);
    const [snapshot, chain, signature] = c.calls;
    expect(snapshot.sql).toMatch(/WHERE run_id = \$1 AND organization_id = \$2/);
    expect(snapshot.params).toEqual([41, 7]);
    expect(chain.sql).toMatch(/WHERE tenant_id = \$1 AND record_id = \$2 AND action = 'report_os.run_finalized'/);
    expect(chain.params).toEqual([7, '41']);
    expect(signature.sql).toMatch(/WHERE organization_id = \$1 AND signed_target = \$2 AND superseded_by IS NULL/);
    expect(signature.params).toEqual([7, 'report-run:41']);
  });

  it('answers sealed: false for a run that is not final and never was: it reads only the chain', async () => {
    const c = client({ snapshot: STORED });
    const view = await readRunSeal(c, { ...FINAL, status: 'completed' });
    expect(view).toMatchObject({ sealed: false, seal: null, verification: { verdict: 'not-verifiable', checks: [] } });
    expect(c.calls.map((x) => x.sql)).toEqual([expect.stringMatching(/FROM audit_logs/)]);
  });

  it("is a mismatch when the run's status was rewritten after the chain recorded its finalization", async () => {
    const view = await readRunSeal(client({ snapshot: STORED, chain: [chainRow(CHAIN_DETAILS)] }), { ...FINAL, status: 'completed' });
    expect(view.verification.verdict).toBe('mismatch');
    expect(view.verification.checks[0].detail).toMatch(/records this run as finalized, but the run is now marked "completed"/);
  });

  it('shows only what the chain recorded: seal fields the snapshot carries beside it are never returned', async () => {
    const forged = { ...SEAL, atoms: [{ sourceTable: 'forged', sourceId: 'x' }], aiDisclosed: !SEAL.aiDisclosed, finalizedAt: '1999-01-01T00:00:00.000Z' };
    const view = await readRunSeal(client({ snapshot: { ...STORED, seal: forged }, chain: [chainRow(CHAIN_DETAILS)] }), FINAL);
    expect(view.verification.verdict).toBe('intact');
    expect(view.seal).toEqual({ algorithm: SEAL.algorithm, contentHash: SEAL.contentHash, atomCount: SEAL.atomCount, sealedAt: SEAL.sealedAt });
    expect(view.finalizedAt).toBe(CHAIN.occurredAt);
    expect(JSON.stringify(view)).not.toMatch(/forged|1999/);
  });

  it.each([
    ['the sealed document was removed', { snapshot: { seal: SEAL } }],
    ['the snapshot is gone', {}],
  ])('reads the chain\'s record that the document was stored: a mismatch when %s', async (_label, rows) => {
    const c = () => client({ ...rows, chain: [chainRow(CHAIN_DETAILS)] });
    expect((await readRunSeal(c(), FINAL)).verification.verdict).toBe('mismatch');
    expect(await readVerifiedSealedDocument(c(), FINAL)).toMatchObject({ verdict: 'mismatch' });
  });

  it('throws when a read fails: an error is never a verdict', async () => {
    await expect(readRunSeal(client({ snapshot: STORED }, /FROM audit_logs/), FINAL)).rejects.toThrow(/connection reset/);
  });
});

describe('readVerifiedSealedDocument', () => {
  it('returns the stored document with its verdict', async () => {
    const intact = await readVerifiedSealedDocument(client({ snapshot: STORED, chain: [chainRow(CHAIN_DETAILS)] }), FINAL);
    expect(intact).toEqual({ verdict: 'intact', document: REPORT });
    const changed = await readVerifiedSealedDocument(
      client({ snapshot: { ...STORED, sealedDocument: tampered() }, chain: [chainRow(CHAIN_DETAILS)] }),
      FINAL,
    );
    expect(changed.verdict).toBe('mismatch');
  });

  it('has no sealed document for a run not marked final: a mismatch when the chain records its finalization', async () => {
    const completed = { ...FINAL, status: 'completed' };
    expect(await readVerifiedSealedDocument(client({ snapshot: STORED }), completed)).toEqual({ verdict: 'not-verifiable', document: null });
    expect(await readVerifiedSealedDocument(client({ snapshot: STORED, chain: [chainRow(CHAIN_DETAILS)] }), completed)).toEqual({
      verdict: 'mismatch',
      document: null,
    });
  });
});
