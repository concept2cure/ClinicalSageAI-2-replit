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
 *   - a finalization row the chain does not vouch for (no position, a broken
 *     link, a missing or invalid HMAC seal where the key is configured) is not
 *     the record;
 *   - the finalization's signature must exist and have signed the same seal;
 *   - only a seal from before the document was stored is "not verifiable";
 *   - every read is scoped to the run's organisation, the status is read after
 *     the chain, a malformed document is a failed check, and a failed read
 *     throws.
 */
import { createHash } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSealedRecord } from '../seal';
import { readRunSeal, readSealForExport, readVerifiedSealedDocument, verifyStoredSeal, type ChainRecord, type SignatureRecord } from '../run-seal';
import { deriveChainHash } from '../../../audit/chain';
import { sealRecord, GENESIS_PREVIOUS_HASH } from '../../../audit/audit-hmac-seal';
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
  chained: { link: 'linked', seal: 'no-key' },
  occurredAt: '2026-10-01T09:00:01.000Z',
  reason: 'Issued for the board pack',
  meaning: 'approval',
  priorStatus: 'completed',
};
const SIGNED: SignatureRecord = { signerName: 'Dana Reyes', signedAt: '2026-10-01T09:00:01.000Z', meaning: 'approval', signedSealHash: SEAL.contentHash };
const verdict = (input: Partial<Parameters<typeof verifyStoredSeal>[0]>) =>
  verifyStoredSeal({ seal: SEAL, sealedDocument: REPORT, snapshotFound: true, chain: CHAIN, chainRows: 1, signature: SIGNED, ...input });

describe('verifyStoredSeal', () => {
  it('is intact when the document, the stored seal and the chain all agree', () => {
    const v = verdict({});
    expect(v.verdict).toBe('intact');
    expect(v.checks.map((c) => [c.check, c.ok])).toEqual([['audit-chain', true], ['stored-seal', true], ['stored-document', true], ['signature', true]]);
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
    // nosemgrep: detect-non-literal-regexp -- a test: field is a literal seal field name from the table
    expect(v.checks.find((c) => c.check === 'stored-seal')?.detail).toMatch(new RegExp(field));
  });

  it("is a mismatch when the document's provenance atoms no longer match the recorded count", () => {
    const withAtom: RenderedReport = {
      ...REPORT,
      sections: [{ id: 's', title: 'S', blocks: [{ kind: 'metric', label: 'm', value: 1, provenance: [{ sourceTable: 'projects' }] }] }],
    };
    const seal = { ...buildSealedRecord(withAtom, SEAL.sealedAt), atomCount: 0 };
    const chain = { ...CHAIN, sealHash: seal.contentHash, atomCount: 0 };
    const v = verifyStoredSeal({ seal, sealedDocument: withAtom, snapshotFound: true, chain, chainRows: 1, signature: { ...SIGNED, signedSealHash: seal.contentHash } });
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
    expect(v.checks.find((c) => c.check === 'stored-document')?.detail).toMatch(/^Not checked: .*no finalization/);
  });

  it('is not verifiable for a finalization recorded before the document was stored, whose seal agrees with the chain', () => {
    expect(verdict({ sealedDocument: null, chain: { ...CHAIN, documentStored: false } }).verdict).toBe('not-verifiable');
  });

  it('is a mismatch for such a finalization when its stored seal disagrees with the chain', () => {
    const v = verdict({ sealedDocument: null, seal: { ...SEAL, sealedAt: '2020-01-01T00:00:00.000Z' }, chain: { ...CHAIN, documentStored: false } });
    expect(v.verdict).toBe('mismatch');
  });

  it('is a mismatch for such a finalization when its seal was removed from a snapshot that still exists', () => {
    const legacy = { sealedDocument: null, seal: null, chain: { ...CHAIN, documentStored: false } };
    expect(verdict({ ...legacy, snapshotFound: true }).verdict).toBe('mismatch');
    expect(verdict({ ...legacy, snapshotFound: false }).verdict).toBe('not-verifiable');
  });

});

describe('verifyStoredSeal: what the chain, the signature and the document can vouch for', () => {
  it.each([
    ['holds no chain position', { link: 'unsequenced', seal: 'no-key' }, /no position on the audit chain/],
    ["does not link to the organisation's chain", { link: 'broken', seal: 'no-key' }, /does not link/],
    ['carries no HMAC seal although the key is configured', { link: 'linked', seal: 'absent' }, /no audit HMAC seal/],
    ['carries an HMAC seal that does not verify', { link: 'linked', seal: 'invalid' }, /does not verify/],
  ] as const)('is a mismatch when the finalization row %s', (_label, chained, detail) => {
    const v = verdict({ chain: { ...CHAIN, chained } });
    expect(v.verdict).toBe('mismatch');
    expect(v.checks[0].detail).toMatch(detail);
  });

  it.each([
    ['no electronic signature is recorded', null],
    ["the signature's manifest names another seal", { ...SIGNED, signedSealHash: 'f'.repeat(64) }],
  ])('is a mismatch when %s for a finalize that recorded storing the document', (_label, signature) => {
    const v = verdict({ signature });
    expect(v.verdict).toBe('mismatch');
    expect(v.checks.find((c) => c.check === 'signature')?.ok).toBe(false);
  });

  it('checks nothing against an unverified record: every other check says it was not run, none claims agreement', () => {
    for (const input of [{ chain: null, chainRows: 0 }, { chain: null, chainRows: 2 }, { chain: { ...CHAIN, payloadBound: false } }]) {
      const v = verdict(input);
      expect(v.checks.slice(1).every((c) => !c.ok && /^Not checked/.test(c.detail)), JSON.stringify(v.checks)).toBe(true);
    }
  });

  it('a malformed stored document is a failed check, never a crash', () => {
    const bad = { ...REPORT, sections: [{ id: 'x', title: 'X', blocks: null }] } as unknown as typeof REPORT;
    expect(() => verdict({ sealedDocument: bad, chain: null, chainRows: 0 })).not.toThrow();
    const v = verdict({ sealedDocument: bad });
    expect(v.verdict).toBe('mismatch');
    expect(v.checks.find((c) => c.check === 'stored-document')?.detail).toMatch(/malformed/);
  });
});

/** finalize's chain row as audit_logs holds it: new_values as written, payload_hash over that text, linked from genesis. */
const OCCURRED = new Date(CHAIN.occurredAt!);
function chainRow(details: Record<string, unknown>, opts: { edit?: (text: string) => string; unchained?: boolean } = {}) {
  const written = JSON.stringify(details);
  const payload_hash = createHash('sha256').update(written).digest('hex');
  const base = { action: 'report_os.run_finalized', actor_id: 5, target: 'report_run:41', payload_hash, occurred_at: OCCURRED };
  const sha256_chain = opts.unchained ? null : deriveChainHash(base, GENESIS_PREVIOUS_HASH);
  return { ...base, nv: opts.edit ? opts.edit(written) : written, tenant_id: 7, sha256_chain, chain_seq: opts.unchained ? null : 10, hmac_seal: null as string | null };
}
const CHAIN_DETAILS = {
  runUuid: 'u', reportTypeId: REPORT.reportTypeId, priorStatus: 'completed', sealHash: SEAL.contentHash,
  algorithm: SEAL.algorithm, canonVersion: SEAL.canonVersion, atomCount: SEAL.atomCount, sealedAt: SEAL.sealedAt,
  documentStored: true, reason: 'Issued for the board pack', meaning: 'approval',
};
const SIGNATURE = {
  signer_name: 'Dana Reyes', signed_at: new Date('2026-10-01T09:00:01.000Z'), signature_meaning: 'approval',
  manifest: JSON.stringify({ target: 'report-run:41', act: { finalized: true, sealHash: SEAL.contentHash } }),
};

interface Rows {
  status?: string | null;
  snapshot?: unknown;
  chain?: Array<Record<string, unknown>>;
  /** What the chain read answers from its second call on (a finalize committing between reads). */
  chainLater?: Array<Record<string, unknown>>;
  signature?: Record<string, unknown> | null;
}

/**
 * A client that answers each read from a table of rows and records every query
 * with its parameters. It honours LIMIT, as the database does: a chain read
 * limited to one row would never see a second finalization.
 */
function client(rows: Rows, fail?: RegExp) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const limited = (sql: string, all: Array<Record<string, unknown>>) => all.slice(0, Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? all.length));
  let chainReads = 0;
  const answer = (sql: string): Array<Record<string, unknown>> => {
    if (/FROM report_runs/.test(sql)) return rows.status === null ? [] : [{ status: rows.status ?? 'final' }];
    if (/FROM report_snapshots/.test(sql)) return rows.snapshot ? [{ snapshot_metadata: rows.snapshot }] : [];
    if (/action = 'report_os.run_finalized'/.test(sql)) {
      chainReads += 1;
      return limited(sql, (chainReads > 1 && rows.chainLater) || rows.chain || []);
    }
    if (/FROM electronic_signatures/.test(sql)) return rows.signature === null ? [] : [rows.signature ?? SIGNATURE];
    return []; // the chain row's predecessor reads: none, so it links from genesis
  };
  return {
    calls,
    query: async (sql: string, params: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> => {
      calls.push({ sql, params });
      if (fail?.test(sql)) throw new Error('connection reset');
      return { rows: answer(sql) };
    },
  };
}

const RUN = { id: 41, organizationId: 7 };
const STORED = { seal: SEAL, sealedDocument: REPORT, finalizedAt: '2026-10-01T09:00:00.000Z' };
const ON_RECORD: Rows = { snapshot: STORED, chain: [chainRow(CHAIN_DETAILS)] };

describe('readRunSeal', () => {
  it('reports the act as the chain recorded it, with the signature, and verifies the stored copies against it', async () => {
    const view = await readRunSeal(client(ON_RECORD), RUN);
    expect(view).toMatchObject({
      runId: 41,
      sealed: true,
      seal: { algorithm: 'sha256', contentHash: SEAL.contentHash, sealedAt: SEAL.sealedAt, atomCount: SEAL.atomCount },
      finalizedAt: CHAIN.occurredAt,
      signature: { signerName: 'Dana Reyes', signedAt: '2026-10-01T09:00:01.000Z', meaning: 'approval' },
      finalization: { reason: 'Issued for the board pack', meaning: 'approval', priorStatus: 'completed' },
      verification: { verdict: 'intact' },
    });
    expect(view.verification.checks[0].detail).toMatch(/links to the organisation's audit chain, but no audit HMAC key is configured here/);
  });

  it('reads a snapshot stored as json text too', async () => {
    expect((await readRunSeal(client({ ...ON_RECORD, snapshot: JSON.stringify(STORED) }), RUN)).verification.verdict).toBe('intact');
  });

  it("binds the chain row's content to its payload hash: an edited row fails", async () => {
    const edited = chainRow(CHAIN_DETAILS, { edit: (t) => t.replace('Issued for the board pack', 'Issued for the audit') });
    const view = await readRunSeal(client({ snapshot: STORED, chain: [edited] }), RUN);
    expect(view.verification.verdict).toBe('mismatch');
    expect(view.verification.checks[0].detail).toMatch(/payload hash/);
  });

  it('does not trust a finalization row that holds no position on the chain: the app role can insert one', async () => {
    const view = await readRunSeal(client({ snapshot: STORED, chain: [chainRow(CHAIN_DETAILS, { unchained: true })] }), RUN);
    expect(view.verification.verdict).toBe('mismatch');
    expect(view.verification.checks[0].detail).toMatch(/no position on the audit chain/);
  });

  it('fails the chain check when the run was recorded as finalized twice', async () => {
    const view = await readRunSeal(client({ snapshot: STORED, chain: [chainRow(CHAIN_DETAILS), chainRow(CHAIN_DETAILS)] }), RUN);
    expect(view.verification.verdict).toBe('mismatch');
    expect(view.finalization).toBeNull();
  });

  it('scopes every read to the run and its organisation', async () => {
    const c = client(ON_RECORD);
    await readRunSeal(c, RUN);
    const call = (re: RegExp) => c.calls.find((x) => re.test(x.sql))!;
    expect(call(/FROM report_runs/).sql).toMatch(/WHERE id = \$1 AND organization_id = \$2/);
    expect(call(/FROM report_runs/).params).toEqual([41, 7]);
    expect(call(/FROM report_snapshots/).sql).toMatch(/WHERE run_id = \$1 AND organization_id = \$2/);
    expect(call(/FROM report_snapshots/).params).toEqual([41, 7]);
    expect(call(/run_finalized/).sql).toMatch(/WHERE tenant_id = \$1 AND record_id = \$2 AND action = 'report_os.run_finalized'/);
    expect(call(/run_finalized/).params).toEqual([7, '41']);
    expect(call(/chain_seq < \$2/).params).toEqual([7, '10']);
    expect(call(/FROM electronic_signatures/).sql).toMatch(/WHERE organization_id = \$1 AND signed_target = \$2 AND superseded_by IS NULL/);
    expect(call(/FROM electronic_signatures/).params).toEqual([7, 'report-run:41']);
  });

  it('reads the chain before the status, so a finalize committing between the two is not a contradiction', async () => {
    const c = client({ snapshot: STORED, chain: [], chainLater: [chainRow(CHAIN_DETAILS)] });
    expect((await readRunSeal(c, RUN)).verification.verdict).toBe('intact');
    const order = c.calls.map((x) => (/run_finalized/.test(x.sql) ? 'chain' : /report_runs/.test(x.sql) ? 'status' : '')).filter(Boolean);
    expect(order).toEqual(['chain', 'status', 'chain']);
  });

  it('answers sealed: false for a run that is not final and never was', async () => {
    const view = await readRunSeal(client({ status: 'completed', snapshot: STORED }), RUN);
    expect(view).toMatchObject({ sealed: false, seal: null, verification: { verdict: 'not-verifiable', checks: [] } });
  });

  it("is a mismatch when the run's status was rewritten after the chain recorded its finalization", async () => {
    const view = await readRunSeal(client({ ...ON_RECORD, status: 'completed' }), RUN);
    expect(view.verification.verdict).toBe('mismatch');
    expect(view.verification.checks[0].detail).toMatch(/records this run as finalized, but the run is now marked "completed"/);
  });

  it('shows only what the chain recorded: seal fields the snapshot carries beside it are never returned', async () => {
    const forged = { ...SEAL, atoms: [{ sourceTable: 'forged', sourceId: 'x' }], aiDisclosed: !SEAL.aiDisclosed, finalizedAt: '1999-01-01T00:00:00.000Z' };
    const view = await readRunSeal(client({ ...ON_RECORD, snapshot: { ...STORED, seal: forged } }), RUN);
    expect(view.verification.verdict).toBe('intact');
    expect(view.seal).toEqual({ algorithm: SEAL.algorithm, contentHash: SEAL.contentHash, atomCount: SEAL.atomCount, sealedAt: SEAL.sealedAt });
    expect(view.finalizedAt).toBe(CHAIN.occurredAt);
    expect(JSON.stringify(view)).not.toMatch(/forged|1999/);
  });

  it.each([
    ['the sealed document was removed', { snapshot: { seal: SEAL } }],
    ['the snapshot is gone', { snapshot: undefined }],
    ['the signature is gone', { signature: null }],
  ])("reads the chain's record of what finalize stored: a mismatch when %s", async (_label, rows) => {
    const c = () => client({ ...ON_RECORD, ...rows });
    expect((await readRunSeal(c(), RUN)).verification.verdict).toBe('mismatch');
    expect(await readVerifiedSealedDocument(c(), RUN)).toMatchObject({ verdict: 'mismatch' });
  });

  it('throws when a read fails: an error is never a verdict', async () => {
    await expect(readRunSeal(client(ON_RECORD, /run_finalized/), RUN)).rejects.toThrow(/connection reset/);
  });
});

describe('the audit HMAC seal over the finalization row, where the key is configured', () => {
  const KEY = 'k'.repeat(48);
  const prior = process.env.AUDIT_HMAC_KEY;
  afterEach(() => {
    if (prior === undefined) delete process.env.AUDIT_HMAC_KEY;
    else process.env.AUDIT_HMAC_KEY = prior;
  });
  const sealedRow = (hmac: (chainHash: string) => string | null) => {
    const row = chainRow(CHAIN_DETAILS);
    return { ...row, hmac_seal: hmac(row.sha256_chain!) };
  };
  const sealWith = (key: string) => (h: string) => sealRecord({ recordHash: h, previousHash: GENESIS_PREVIOUS_HASH, sequenceNumber: 0 }, key);

  it('is intact when the row carries a valid seal over its link', async () => {
    process.env.AUDIT_HMAC_KEY = KEY;
    const view = await readRunSeal(client({ snapshot: STORED, chain: [sealedRow(sealWith(KEY))] }), RUN);
    expect(view.verification.verdict).toBe('intact');
    expect(view.verification.checks[0].detail).toMatch(/its audit HMAC seal verifies/);
  });

  it.each([
    ['carries no seal', () => null],
    ['carries a seal made without the key', sealWith('x'.repeat(48))],
  ])('is a mismatch when the row %s', async (_label, hmac) => {
    process.env.AUDIT_HMAC_KEY = KEY;
    expect((await readRunSeal(client({ snapshot: STORED, chain: [sealedRow(hmac)] }), RUN)).verification.verdict).toBe('mismatch');
  });
});

describe('readVerifiedSealedDocument and readSealForExport', () => {
  it('return the stored document only when it verifies', async () => {
    expect(await readVerifiedSealedDocument(client(ON_RECORD), RUN)).toEqual({ verdict: 'intact', document: REPORT });
    const changed = { ...ON_RECORD, snapshot: { ...STORED, sealedDocument: tampered() } };
    expect((await readVerifiedSealedDocument(client(changed), RUN)).verdict).toBe('mismatch');
    expect(await readSealForExport(client(changed), RUN)).toMatchObject({ document: null, view: { verification: { verdict: 'mismatch' } } });
    expect((await readSealForExport(client(ON_RECORD), RUN)).document).toEqual(REPORT);
  });

  it('has no sealed document for a run not marked final: a mismatch when the chain records its finalization', async () => {
    expect(await readVerifiedSealedDocument(client({ status: 'completed', snapshot: STORED }), RUN)).toEqual({ verdict: 'not-verifiable', document: null });
    expect(await readVerifiedSealedDocument(client({ ...ON_RECORD, status: 'completed' }), RUN)).toEqual({ verdict: 'mismatch', document: null });
  });

  it('a malformed stored document with no finalization on the chain is a mismatch, not a crash', async () => {
    const bad = { ...REPORT, sections: [{ id: 'x', title: 'X', blocks: null }] };
    await expect(readVerifiedSealedDocument(client({ snapshot: { seal: SEAL, sealedDocument: bad }, chain: [] }), RUN)).resolves.toMatchObject({ verdict: 'mismatch' });
  });
});
