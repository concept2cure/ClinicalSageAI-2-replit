/**
 * The governed writer of a tenant's AI placement policy (D6).
 *
 * Until 2026-09-25 nothing in the application wrote ai_placement_policies:
 * the gateway enforced a policy only hand-run SQL could set, with no record of
 * who set it or why. These cases pin what a change must be — complete,
 * reasoned, satisfiable, recorded in the same transaction, and effective on
 * the next dispatch rather than after a stale cache expires.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The spy records calls; the outcome comes from a plain function, because a
// rejecting vi.fn reached through a module-mock wrapper is reported as a test
// failure by this harness even when the code under test catches it.
const writeChainedAuditRow = vi.fn();
let auditOutcome: () => Promise<void> = async () => undefined;
vi.mock('../../../auditService', () => ({
  writeChainedAuditRow: (...a: unknown[]) => {
    writeChainedAuditRow(...a);
    return auditOutcome();
  },
}));

let tableRow: Record<string, unknown> | null = null;
vi.mock('../../../../db/runtime', () => ({
  getPool: () => ({
    query: async () => ({ rows: tableRow ? [tableRow] : [] }),
  }),
}));

const custodyFixture = vi.hoisted(() => ({
  source: null as any, deniedSource: false, kmsRevoked: false, membership: 'admin',
  objects: new Map<string, any>(), sourceReads: [] as any[],
}));
vi.mock('../../../vault/document-catalog.service', () => ({
  loadDocumentForActor: async (input: any) => {
    custodyFixture.sourceReads.push(input);
    const d = custodyFixture.source;
    return custodyFixture.deniedSource || !d || input.organizationId !== d.organizationId ||
      input.projectId !== d.admittedScope.projectId || input.documentId !== d.id || input.userId !== 5 ? null : JSON.parse(JSON.stringify(d));
  },
}));
vi.mock('../../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: async () => custodyFixture.membership }));
vi.mock('../../../storage/index', () => ({ getStorageProviderFor: () => ({
  put: async (input: any) => {
    const { randomUUID, createHash } = await import('node:crypto');
    const id = randomUUID(), sha256 = createHash('sha256').update(input.bytes).digest('hex');
    custodyFixture.objects.set(`${input.orgId}:${id}`, { bytes: Buffer.from(input.bytes), sha256, sizeBytes: input.bytes.length });
    return { provider: 'local', vaultVersionId: id, vaultFileId: `vault://${id}`, sha256, sizeBytes: input.bytes.length };
  },
  get: async (id: string, orgId: number) => custodyFixture.objects.get(`${orgId}:${id}`) ?? null,
  delete: async (id: string, orgId: number) => custodyFixture.objects.delete(`${orgId}:${id}`),
}) }));
vi.mock('../../../security/field-encryption', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../security/field-encryption')>();
  const crypto = await import('node:crypto');
  const key = (arn: string, context: any) => crypto.createHash('sha256').update(arn + JSON.stringify(context)).digest();
  const ops = {
    generate: async (arn: string, context: any) => {
      if (custodyFixture.kmsRevoked) throw new Error('key disabled');
      return { plaintext: key(arn, context), ciphertext: new Uint8Array([1, 2, 3]), keyId: arn };
    },
    decrypt: async (arn: string, _cipher: Uint8Array, context: any) => {
      if (custodyFixture.kmsRevoked) throw new Error('key disabled');
      return { plaintext: key(arn, context), keyId: arn };
    },
  };
  return { ...actual, sealTenantPayload: (p: string, c: any, arn: string) => actual.sealTenantPayload(p, c, arn, ops),
    openTenantPayload: (p: string, c: any, arn: string) => actual.openTenantPayload(p, c, arn, ops) };
});

import {
  parsePlacementPolicyInput,
  placementPolicyContradiction,
  writeOrgPlacementPolicy,
  type StoredPlacementPolicy,
  parseDerivativeAction, readDerivativeCustody, manageDerivativeCustody,
  authorizeDerivativeUse, recheckDerivativeUse, reinjectAndVerifyDerivative,
  type DerivativeCustodyView, type DerivativeReviewView,
} from '../org-placement-writer';
import { resetOrgPlacementResolver, setOrgPlacementResolver } from '../org-placement';
import { DbOrgPlacementResolver } from '../org-placement-db';

const REASON = 'Order Form 2026-09 limits this tenant to its own AWS account.';
const OPEN: Omit<StoredPlacementPolicy, never> = {
  residency: null,
  zeroDataRetention: false,
  allowedSubstrates: null,
  allowedProviders: null,
  publicSourceFrontier: false,
  publicSourceEgress: true,
};
const PRIVATE_ONLY: StoredPlacementPolicy = {
  residency: 'us',
  zeroDataRetention: true,
  allowedSubstrates: ['frontier_private'],
  allowedProviders: ['bedrock'],
  publicSourceFrontier: false,
  publicSourceEgress: true,
};

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...PRIVATE_ONLY, reasonForChange: REASON, ...overrides };
}

function bodyWithout(key: string): Record<string, unknown> {
  const b = body();
  delete b[key];
  return b;
}

describe('parsePlacementPolicyInput', () => {
  it('accepts a complete, reasoned, satisfiable policy', () => {
    const r = parsePlacementPolicyInput(body({ allowedProviders: ['bedrock', 'bedrock'] }));
    expect(r).toEqual({ ok: true, policy: { ...PRIVATE_ONLY }, reasonForChange: REASON });
  });

  it('refuses a partial policy — an omitted field must never reset a constraint', () => {
    const r = parsePlacementPolicyInput(bodyWithout('zeroDataRetention'));
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/missing: zeroDataRetention/) });
  });

  it('refuses an unknown key, including a client-supplied organizationId', () => {
    expect(parsePlacementPolicyInput(body({ organizationId: 99 }))).toMatchObject({
      ok: false,
      message: 'Unknown policy key: organizationId.',
    });
  });

  it('requires a reason for change', () => {
    expect(parsePlacementPolicyInput(body({ reasonForChange: '  ok  ' }))).toMatchObject({ ok: false });
    expect(parsePlacementPolicyInput(bodyWithout('reasonForChange'))).toMatchObject({ ok: false });
  });

  it('refuses an empty allow-list — null says "no constraint", [] would refuse everything', () => {
    expect(parsePlacementPolicyInput(body({ allowedSubstrates: [] }))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/allowedSubstrates must be null/),
    });
  });

  it('refuses values this build does not know, rather than dropping them', () => {
    expect(parsePlacementPolicyInput(body({ allowedProviders: ['bedrock', 'kimi'] }))).toMatchObject({
      ok: false,
      message: 'allowedProviders names unknown values: kimi.',
    });
    expect(parsePlacementPolicyInput(body({ residency: 'any' }))).toMatchObject({ ok: false });
    expect(parsePlacementPolicyInput(body({ zeroDataRetention: 'true' }))).toMatchObject({ ok: false });
  });

  it('refuses a policy no AI service could satisfy', () => {
    expect(
      parsePlacementPolicyInput(body({ allowedSubstrates: ['self_hosted'], allowedProviders: ['anthropic', 'moonshot'] })),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/No AI service is on both/) });
    expect(
      placementPolicyContradiction({ ...OPEN, residency: 'on_prem', allowedSubstrates: ['frontier_private'] }),
    ).toMatch(/self-hosted/);
    expect(placementPolicyContradiction({ ...OPEN, residency: 'on_prem', allowedProviders: ['local'] })).toBeNull();
  });

  it('refuses a residency or retention no allowed lane could ever provide (D6 review)', () => {
    // Until 2026-09-26 these were accepted with a 200, and every later request
    // for the tenant was refused: the shared frontier lanes have no residency,
    // and Kimi offers no zero retention, whatever is deployed.
    expect(placementPolicyContradiction({ ...OPEN, residency: 'us', allowedProviders: ['anthropic'] })).toMatch(
      /None of the allowed AI services can provide residency us/,
    );
    expect(placementPolicyContradiction({ ...OPEN, residency: 'eu', allowedSubstrates: ['frontier_shared'] })).toMatch(
      /residency eu/,
    );
    expect(placementPolicyContradiction({ ...OPEN, zeroDataRetention: true, allowedProviders: ['moonshot'] })).toMatch(
      /zero data retention/,
    );
    // A lane the deployment defines, or a shared lane whose ZDR is an agreement, stays possible.
    expect(placementPolicyContradiction({ ...OPEN, residency: 'eu', allowedProviders: ['bedrock'] })).toBeNull();
    expect(placementPolicyContradiction({ ...OPEN, zeroDataRetention: true, allowedProviders: ['anthropic'] })).toBeNull();
  });
});

function fakePool(opts: { failAudit?: boolean; existing?: Record<string, unknown> | null } = {}) {
  const statements: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      const head = sql.trim().split(/\s+/).slice(0, 1)[0];
      statements.push(/FOR UPDATE/.test(sql) ? 'SELECT … FOR UPDATE' : /pg_advisory_xact_lock/.test(sql) ? 'LOCK' : head);
      if (/FOR UPDATE/.test(sql)) return { rows: opts.existing ? [opts.existing] : [] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  auditOutcome = async () => {
    statements.push('audit');
    if (opts.failAudit) throw new Error('audit_logs unavailable');
  };
  return { pool: { query: client.query, connect: async () => client }, client, statements };
}

describe('writeOrgPlacementPolicy', () => {
  beforeEach(() => writeChainedAuditRow.mockReset());
  afterEach(() => resetOrgPlacementResolver());

  it('writes the policy and its audit row (before, after, reason) in one transaction, then invalidates', async () => {
    const invalidate = vi.fn();
    setOrgPlacementResolver({ resolve: async () => null, invalidate });
    const existing = {
      required_data_residency: null,
      zero_data_retention: false,
      allowed_substrates: null,
      allowed_providers: null,
      public_source_frontier: false,
      public_source_egress: true,
    };
    const { pool, client, statements } = fakePool({ existing });

    const result = await writeOrgPlacementPolicy(pool, 42, PRIVATE_ONLY, REASON, { userId: 5, ipAddress: '10.0.0.1' });

    expect(statements).toEqual(['BEGIN', 'LOCK', 'SELECT … FOR UPDATE', 'INSERT', 'audit', 'COMMIT']);
    const [auditClient, entry] = writeChainedAuditRow.mock.calls[0];
    expect(auditClient).toBe(client); // same connection, same transaction
    expect(entry).toMatchObject({
      tenantId: 42,
      userId: 5,
      action: 'ai_placement_policy.update',
      resourceType: 'ai_placement_policies',
      resourceId: '42',
      details: { previousPolicy: OPEN, newPolicy: PRIVATE_ONLY, reasonForChange: REASON },
    });
    expect(result).toEqual({ previousPolicy: OPEN, policy: PRIVATE_ONLY });
    expect(invalidate).toHaveBeenCalledWith(42);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('commits nothing and invalidates nothing when the audit row cannot be written', async () => {
    const invalidate = vi.fn();
    setOrgPlacementResolver({ resolve: async () => null, invalidate });
    const { pool, client, statements } = fakePool({ failAudit: true });

    await expect(writeOrgPlacementPolicy(pool, 42, PRIVATE_ONLY, REASON, { userId: 5 })).rejects.toThrow(
      /audit_logs unavailable/,
    );
    expect(statements).toEqual(['BEGIN', 'LOCK', 'SELECT … FOR UPDATE', 'INSERT', 'audit', 'ROLLBACK']);
    expect(invalidate).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('the next dispatch sees a tightened policy at once, not after the cache expires', async () => {
    const resolver = new DbOrgPlacementResolver();
    setOrgPlacementResolver(resolver);
    tableRow = null; // no policy yet
    expect(await resolver.resolve(42)).toBeNull(); // now cached as "no policy"

    const { pool } = fakePool();
    await writeOrgPlacementPolicy(pool, 42, PRIVATE_ONLY, REASON, { userId: 5 });
    tableRow = {
      required_data_residency: 'us',
      zero_data_retention: true,
      allowed_substrates: ['frontier_private'],
      allowed_providers: ['bedrock'],
      public_source_frontier: false,
      public_source_egress: true,
    };

    expect(await resolver.resolve(42)).toMatchObject({
      residency: 'us',
      zeroDataRetention: true,
      allowedSubstrates: ['frontier_private'],
      allowedProviders: ['bedrock'],
    });
    tableRow = null;
  });
});


const CUSTODY_ARN = 'arn:aws:kms:us-east-1:123456789012:key/11111111-1111-4111-8111-111111111111';
const DOC_ID = '22222222-2222-4222-8222-222222222222';
function derivativePool() {
  let settings: any = { unrelatedSetting: { keep: true } }, snapshot: any;
  let loseCommitAcknowledgement = false;
  const release = vi.fn();
  let placement = { required_data_residency: null, zero_data_retention: true, allowed_substrates: ['frontier_shared'],
    allowed_providers: ['anthropic'], public_source_frontier: false, public_source_egress: false };
  const query = vi.fn(async (sql: string, args: any[] = []) => {
    if (sql === 'BEGIN') snapshot = JSON.parse(JSON.stringify(settings));
    if (sql === 'ROLLBACK') settings = snapshot;
    if (sql === 'COMMIT' && loseCommitAcknowledgement) {
      loseCommitAcknowledgement = false;
      throw new Error('Synthetic acknowledgement loss after commit');
    }
    if (/SELECT settings FROM organizations/.test(sql)) return { rows: args[0] === 7 ? [{ settings: JSON.parse(JSON.stringify(settings)) }] : [] };
    if (/UPDATE organizations SET settings/.test(sql)) settings = JSON.parse(args[1]);
    if (/FROM ai_placement_policies/.test(sql)) return { rows: args[0] === 7 ? [JSON.parse(JSON.stringify(placement))] : [] };
    return { rows: [] };
  });
  return { query, connect: async () => ({ query, release }), get: () => settings, release,
    loseNextCommitAcknowledgement: () => { loseCommitAcknowledgement = true; },
    mutate: (fn: (value: any) => void) => fn(settings), changePlacement: (p: any) => { placement = { ...placement, ...p }; } };
}
function resetCustodyFixture() {
  custodyFixture.objects.clear(); custodyFixture.sourceReads.length = 0;
  custodyFixture.deniedSource = false; custodyFixture.kmsRevoked = false; custodyFixture.membership = 'admin';
  custodyFixture.source = { id: DOC_ID, organizationId: 7, programId: '33333333-3333-4333-8333-333333333333',
    contentHash: 'a'.repeat(64), extractedTextSha256: 'b'.repeat(64), extractedText: 'SecretMolecule-X uses 3.14159 mg.',
    classification: 'CONFIDENTIAL', isCurrent: true, admittedScope: { projectId: 42 }, sourceAccess: { currentUseEligible: true } };
  auditOutcome = async () => undefined; writeChainedAuditRow.mockClear();
}
async function prepareCustody(pool = derivativePool()) {
  const actor = { userId: 5 };
  await manageDerivativeCustody(pool, 7, { action: 'derivative_policy', policy: { enabled: true, kmsKeyArn: CUSTODY_ARN, maxLifetimeSeconds: 3600 }, reasonForChange: REASON }, actor);
  const view = await manageDerivativeCustody(pool, 7, { action: 'derivative_prepare', projectId: 42, documentId: DOC_ID,
    template: 'Assess {{0}} at dose {{1}}.', spans: [{ start: 0, end: 16, label: 'MOLECULE' }, { start: 22, end: 29, label: 'VALUE' }],
    expiresInSeconds: 600, reasonForChange: REASON }, actor) as DerivativeCustodyView;
  const record = view.records[0];
  const input = { organizationId: 7, userId: 5, projectId: 42, derivativeId: record.derivativeId };
  return { pool, record, input, actor };
}
async function attestCustody(f: Awaited<ReturnType<typeof prepareCustody>>) {
  await manageDerivativeCustody(f.pool, 7, { action: 'derivative_attest', derivativeId: f.record.derivativeId, projectId: 42,
    payloadSha256: f.record.payloadSha256, expectedVersion: f.record.version, reasonForChange: REASON }, f.actor);
}
describe('derivative custody management and exact-use authority', () => {
  beforeEach(resetCustodyFixture);
  it('keeps maps/candidate encrypted, exposes reviewed residual only, and attestation changes next use', async () => {
    const f = await prepareCustody();
    expect((await readDerivativeCustody(f.pool, 7)).records[0].status).toBe('prepared');
    const state = JSON.stringify(f.pool.get());
    expect(state).not.toMatch(/SecretMolecule|3\.14159|Assess/);
    expect(f.pool.get().unrelatedSetting).toEqual({ keep: true });
    expect(JSON.stringify([...custodyFixture.objects.values()])).not.toMatch(/SecretMolecule|3\.14159|Assess/);
    await expect(authorizeDerivativeUse(f.pool, f.input)).rejects.toThrow();
    const review = await manageDerivativeCustody(f.pool, 7, { action: 'derivative_review', projectId: 42, derivativeId: f.record.derivativeId, reasonForChange: REASON }, f.actor) as DerivativeReviewView;
    expect(review.exactPayload).toContain('[[C2C_');
    expect(review.exactPayload).not.toContain('SecretMolecule-X');
    await attestCustody(f);
    const issued = await authorizeDerivativeUse(f.pool, f.input);
    expect(issued.exactPayload).toBe(review.exactPayload);
    expect(issued.sourceBinding).toEqual({ documentId: f.record.documentId, programId: f.record.programId,
      contentHash: f.record.sourceHash, extractedTextSha256: f.record.extractedTextSha256, projectId: f.record.projectId });
    expect(Object.isFrozen(issued.sourceBinding)).toBe(true);
    expect((await reinjectAndVerifyDerivative(f.pool, f.input, issued, issued.exactPayload)).content).toBe('Assess SecretMolecule-X at dose 3.14159.');
    expect(JSON.stringify(writeChainedAuditRow.mock.calls)).not.toMatch(/SecretMolecule|3\.14159|Assess/);
  });
  it('rejects stale versions, changed SHA, body human claims and non-admin writers', async () => {
    const f = await prepareCustody();
    for (const override of [{ expectedVersion: 2 }, { payloadSha256: 'c'.repeat(64) }]) await expect(manageDerivativeCustody(f.pool, 7, {
      action: 'derivative_attest', projectId: 42, derivativeId: f.record.derivativeId, payloadSha256: f.record.payloadSha256,
      expectedVersion: 1, reasonForChange: REASON, ...override }, f.actor)).rejects.toThrow();
    expect(() => parseDerivativeAction({ action: 'derivative_review', projectId: 42, derivativeId: f.record.derivativeId,
      reasonForChange: REASON, humanApproved: true })).toThrow();
    custodyFixture.membership = 'writer';
    await expect(manageDerivativeCustody(f.pool, 7, { action: 'derivative_review', projectId: 42,
      derivativeId: f.record.derivativeId, reasonForChange: REASON }, f.actor)).rejects.toThrow();
    expect(f.pool.get().derivativeCustody.records[f.record.derivativeId].status).toBe('prepared');
  });
  it('refuses foreign tenant/project/actor, raw T3 or unknown source classification', async () => {
    const f = await prepareCustody(); await attestCustody(f);
    for (const change of [{ organizationId: 8 }, { projectId: 43 }, { userId: 6 }]) await expect(authorizeDerivativeUse(f.pool, { ...f.input, ...change })).rejects.toThrow();
    for (const classification of ['CONTROLLED', 'INTERNAL', null]) {
      custodyFixture.source.classification = classification;
      await expect(authorizeDerivativeUse(f.pool, f.input)).rejects.toThrow();
    }
  });
  it('invalidates issued authority for expiry/revoke/source/extraction/policy/ordinary placement changes', async () => {
    const mutations = [
      (f: any) => f.pool.mutate((s: any) => { s.derivativeCustody.records[f.record.derivativeId].expiresAt = '2000-01-01T00:00:00.000Z'; }),
      (f: any) => f.pool.mutate((s: any) => { s.derivativeCustody.records[f.record.derivativeId].status = 'revoked'; }),
      () => { custodyFixture.source.contentHash = 'c'.repeat(64); },
      () => { custodyFixture.source.extractedTextSha256 = 'c'.repeat(64); },
      (f: any) => f.pool.mutate((s: any) => { s.derivativeCustody.policy.version += 1; }),
      (f: any) => f.pool.changePlacement({ allowed_providers: ['local'] }),
      (f: any) => f.pool.changePlacement({ zero_data_retention: false }),
      () => { custodyFixture.deniedSource = true; }, () => { custodyFixture.kmsRevoked = true; },
    ];
    for (const mutate of mutations) {
      resetCustodyFixture(); const f = await prepareCustody(); await attestCustody(f);
      const issued = await authorizeDerivativeUse(f.pool, f.input); mutate(f);
      await expect(recheckDerivativeUse(f.pool, f.input, issued)).rejects.toThrow();
      await expect(reinjectAndVerifyDerivative(f.pool, f.input, issued, issued.exactPayload)).rejects.toThrow();
    }
  });
  it('revokes without KMS/source access even after policy disabled and source expired', async () => {
    const f = await prepareCustody(); await attestCustody(f);
    custodyFixture.kmsRevoked = true; custodyFixture.deniedSource = true;
    f.pool.mutate(s => { s.derivativeCustody.policy.enabled = false; s.derivativeCustody.policy.version += 1;
      s.derivativeCustody.records[f.record.derivativeId].expiresAt = '2000-01-01T00:00:00.000Z'; });
    const view = await manageDerivativeCustody(f.pool, 7, { action: 'derivative_revoke', projectId: 42,
      derivativeId: f.record.derivativeId, payloadSha256: f.record.payloadSha256, expectedVersion: 2, reasonForChange: REASON }, f.actor) as DerivativeCustodyView;
    expect(view.records[0]).toMatchObject({ status: 'revoked', version: 3 });
  });
});

describe('derivative custody transaction outcomes', () => {
  beforeEach(resetCustodyFixture);
  it('rolls back lifecycle mutation and cleans encrypted orphan when audit fails', async () => {
    const f = await prepareCustody(); const before = JSON.parse(JSON.stringify(f.pool.get()));
    auditOutcome = async () => { throw new Error('audit unavailable'); };
    await expect(attestCustody(f)).rejects.toThrow(); expect(f.pool.get()).toEqual(before);
    const initialObjects = custodyFixture.objects.size;
    await expect(manageDerivativeCustody(f.pool, 7, { action: 'derivative_prepare', projectId: 42, documentId: DOC_ID,
      template: '{{0}}', spans: [{ start: 0, end: 16, label: 'MOLECULE' }], expiresInSeconds: 60, reasonForChange: REASON }, f.actor)).rejects.toThrow();
    expect(custodyFixture.objects.size).toBe(initialObjects);
  });
  it('preserves an encrypted candidate after an unknown commit outcome and discards the connection', async () => {
    const f = await prepareCustody();
    const objectCount = custodyFixture.objects.size;
    f.pool.query.mockClear(); f.pool.release.mockClear(); f.pool.loseNextCommitAcknowledgement();
    await expect(manageDerivativeCustody(f.pool, 7, { action: 'derivative_prepare', projectId: 42, documentId: DOC_ID,
      template: '{{0}}', spans: [{ start: 0, end: 16, label: 'MOLECULE' }], expiresInSeconds: 60,
      reasonForChange: REASON }, f.actor)).rejects.toThrow('commit acknowledgement unavailable');
    expect(f.pool.query.mock.calls.map(call => call[0])).not.toContain('ROLLBACK');
    expect(f.pool.release).toHaveBeenCalledWith(expect.any(Error));
    const current = await readDerivativeCustody(f.pool, 7);
    expect(current.records).toHaveLength(2);
    expect(custodyFixture.objects.size).toBe(objectCount + 1);
    for (const record of current.records) expect(custodyFixture.objects.has(`7:${record.storage.versionId}`)).toBe(true);
    const latest = current.records.find(record => record.derivativeId !== f.record.derivativeId)!;
    await expect(authorizeDerivativeUse(f.pool, { ...f.input, derivativeId: latest.derivativeId })).rejects.toThrow();
  });
});

describe('derivative authority integrity', () => {
  beforeEach(resetCustodyFixture);
  it('rejects cloned authority, one-byte stored tampering and invalid/missing/duplicate model tokens', async () => {
    const f = await prepareCustody(); await attestCustody(f); const issued = await authorizeDerivativeUse(f.pool, f.input);
    await expect(recheckDerivativeUse(f.pool, f.input, { ...issued })).rejects.toThrow();
    for (const text of ['no tokens', issued.exactPayload + issued.exactPayload, issued.exactPayload + ' [[C2C_FORGED]]']) {
      await expect(reinjectAndVerifyDerivative(f.pool, f.input, issued, text)).rejects.toThrow();
    }
    const bytes = custodyFixture.objects.get(`7:${f.record.storage.versionId}`).bytes;
    bytes[10] ^= 1;
    await expect(recheckDerivativeUse(f.pool, f.input, issued)).rejects.toThrow();
  });
});
