/**
 * P-93 (founder, 2026-11-02; docs/LAUNCH_DEFINITION_OF_DONE.md, "P-93 — FDA
 * sequences over 1 GiB are out of scope for launch"): "A sequence over the size
 * the documented channel takes is refused before signing, with a plain message,
 * from sequenceTransmitReadiness."
 *
 * Before this, nothing measured a package before the transmit signature. An FDA
 * package over 1 GiB was signed for, then routed by the gateway to an SFTP branch
 * no image ever shipped, and refused after the signature with a 500.
 *
 * The real assembler runs (the freeze-gate fixture's seed); only the size it
 * measured is overridden, so the rule is judged on the figure the package
 * reports, never on its inputs (design §10, C5 and C9: no setting lowers the
 * ceiling for a test).
 *
 * Design: docs/evidence/RIM/2026-11-08-designs/p93-sequence-size-limit-retire-sftp.design.md (§3, §4 test 1).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  db: null as any, pglite: null as any,
  /** The size the assembled package reports, when a case sets one. */
  sizeBytes: null as number | null,
  /** How many times the package was assembled. */
  assembled: 0,
  /** When set, assembly fails with this message. */
  assembleFails: null as string | null,
  /** When set, the package gate's region-blind rule reports this blocker too. */
  otherBlocker: null as string | null,
}));
vi.mock('../../../db', () => {
  const query = async (raw: string | { text: string; values?: unknown[] }, params?: unknown[]) => {
    const text = typeof raw === 'string' ? raw : raw.text;
    const values = params ?? (typeof raw === 'string' ? undefined : raw.values);
    const result = await h.pglite.query(text, values);
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  };
  return { get db() { return h.db; }, pool: { query, connect: async () => ({ query, release: () => undefined }) } };
});
vi.mock('../../ectd/assess-dispatch-readiness', () => {
  const clear = { cleared: true, blockers: [] as string[] };
  return { assessSequenceDispatchReadiness: async () => ({
    gate: clear, freezeGate: clear, dispatchGateOnSigning: clear, validationErrors: 0, unacknowledgedShadowCriticals: 0,
  }) };
});
vi.mock('../../ectd/assemble-from-core', async (original) => {
  const actual = await original<typeof import('../../ectd/assemble-from-core')>();
  return {
    ...actual,
    assembleSequence: async (...args: Parameters<typeof actual.assembleSequence>) => {
      h.assembled += 1;
      if (h.assembleFails) throw new Error(h.assembleFails);
      const assembled = await actual.assembleSequence(...args);
      if (h.sizeBytes !== null) assembled.bundle.sizeBytes = h.sizeBytes;
      return assembled;
    },
    assembledTransmitBlockers: (assembled: Parameters<typeof actual.assembledTransmitBlockers>[0]) => [
      ...actual.assembledTransmitBlockers(assembled), ...(h.otherBlocker ? [h.otherBlocker] : []),
    ],
  };
});
// Every route is configured and its transport available, so readiness reaches
// its last check; the size rule is the only thing these cases vary.
vi.mock('../../submission-gateways/index', async (original) => ({
  ...await original<object>(),
  getGateway: () => ({ isConfigured: async () => true }),
  gatewayTransportReadiness: async () => ({ implementation: 'available', reason: null }),
}));

import { createIndPgliteDb, AUDIT_LOGS_PGLITE_DDL, type IndPgliteDb } from '../../../db/pglite-harness';
import { FREEZE_GATE_SEED_SQL, FREEZE_PROGRAM_ID, ORG } from './_freeze-gate-fixture';
import { precheckGovernedStep } from '../submission-service';

const GIB = 2 ** 30;
const ctx = { organizationId: ORG, userId: 2 };
let db: IndPgliteDb;
let nextId = 9300;
const q = (text: string, params?: unknown[]) => db.pglite.query(text, params) as Promise<{ rows: any[] }>;

/** A sequence of its own submission (so no filing order applies), with one approved leaf the real assembler packages. */
async function sequence(status: 'validated' | 'frozen' | 'dispatched', region = 'fda', applicationType = 'ind'): Promise<number> {
  const id = nextId++;
  await q(`INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id)
    VALUES ($1, 'Launch ceiling', $5, 'pharma', $2, $3, 2, $4)`, [id, region, ORG, FREEZE_PROGRAM_ID, applicationType]);
  await q(`UPDATE submissions SET application_number = 'MARKET-123456' WHERE id = $1`, [id]);
  await q(`INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status, dispatch_status, frozen_at)
    VALUES ($1, $1, $2, '0000', $3, 2, $4, $5, $6)`,
  [id, region, ORG, status, status === 'dispatched' ? 'pending' : null, status === 'validated' ? null : '2026-10-01T12:00:00Z']);
  await q(`INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by)
    VALUES ($1, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 200, $2, 2)`, [id, ORG]);
  return id;
}

const readiness = (id: number, environment?: 'staging' | 'production') =>
  precheckGovernedStep(id, 'transmit', ctx, environment ? { environment } : {});

beforeAll(async () => {
  db = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true, shadowReview: true });
  h.db = db.db; h.pglite = db.pglite;
  await db.pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  await db.pglite.exec(FREEZE_GATE_SEED_SQL);
  await q('ALTER TABLE submissions ADD COLUMN IF NOT EXISTS application_number TEXT');
}, 120_000);
afterAll(async () => { await db?.close(); });
beforeEach(() => { h.sizeBytes = null; h.assembleFails = null; h.otherBlocker = null; });

describe('P-93: an FDA package over 1 GiB is refused before anyone signs to send it (readiness, site b)', () => {
  it('a dispatched FDA sequence of 1 GiB and one byte is refused by name, and nothing is signed, claimed or recorded', async () => {
    const id = await sequence('dispatched');
    h.sizeBytes = GIB + 1;
    const pre = await readiness(id, 'staging');
    expect(pre.cleared).toBe(false);
    expect(pre.refusal).toBe(
      'Refusing to transmit: the package is just over 1 GiB (1,073,741,825 bytes), and at launch Concept2Cure sends ' +
      'packages of up to 1 GiB to FDA. The sequence is dispatched, so its leaves can no longer be changed, and it ' +
      'cannot be sent as it is.');
    // The Dispatch tab hides refusals naming credentials (SubmissionSeqWorkspaces.tsx transmitBlockedBy); the FDA
    // 10 GB messages are decimal, and existing tests filter blockers on these words.
    expect(pre.refusal).not.toMatch(/credentials configured|is configured for|gateway limit|\bGB\b/);
    expect((await q('SELECT dispatch_status FROM ectd_sequences WHERE id = $1', [id])).rows[0].dispatch_status).toBe('pending');
    expect((await q(`SELECT id FROM electronic_signatures WHERE signed_target = $1`, [`ectd-sequence:${id}`])).rows).toEqual([]);
    expect((await q('SELECT id FROM submission_transmittals')).rows).toEqual([]);
  }, 120_000);

  it('says the size in GiB to two places when it does not round to the ceiling', async () => {
    const id = await sequence('dispatched');
    h.sizeBytes = Math.round(1.27 * GIB);
    expect((await readiness(id, 'production')).refusal).toMatch(
      /^Refusing to transmit: the package is 1\.27 GiB, and at launch Concept2Cure sends packages of up to 1 GiB to FDA\./);
  }, 120_000);

  it('a package of exactly 1 GiB is sent', async () => {
    const id = await sequence('dispatched');
    h.sizeBytes = GIB;
    expect(await readiness(id, 'staging')).toMatchObject({ cleared: true, refusal: null });
  }, 120_000);

  it('the Dispatch tab’s read, which names no environment, does not assemble', async () => {
    const id = await sequence('dispatched');
    h.sizeBytes = GIB + 1;
    const before = h.assembled;
    expect(await readiness(id)).toMatchObject({ cleared: true, refusal: null });
    expect(h.assembled).toBe(before);
  }, 120_000);

  it('a route whose gateway limit is unsourced (PMDA) is not measured', async () => {
    const id = await sequence('dispatched', 'jp');
    h.sizeBytes = GIB + 1;
    const before = h.assembled;
    expect(await readiness(id, 'staging')).toMatchObject({ cleared: true, refusal: null });
    expect(h.assembled).toBe(before);
  }, 120_000);

  it('readiness judges only the size: another package blocker stays the act’s to refuse (scope pin)', async () => {
    const id = await sequence('dispatched');
    h.sizeBytes = GIB;
    h.otherBlocker = '1 placed leaf(s) were left out of the package';
    expect(await readiness(id, 'staging')).toMatchObject({ cleared: true, refusal: null });
  }, 120_000);

  it('a package whose size cannot be measured is refused, never cleared', async () => {
    const id = await sequence('dispatched');
    h.assembleFails = 'the converter returned no bytes';
    const pre = await readiness(id, 'staging');
    expect(pre.cleared).toBe(false);
    expect(pre.refusal).toBe('Refusing to transmit: the sequence does not assemble into a package (the converter returned ' +
      'no bytes), so its size cannot be measured, and nothing can be sent.');
  }, 120_000);
});

/* The coordinating session's ruling on P-93's question 1(a), 2026-11-08 (C7): "the size the documented channel
   takes" reaches every route whose limit is sourced. EU CESP's 600 MiB was refused only by the guard, after the
   transmit signature. Readiness now refuses it before signing, on the guard's own rule (checkGatewaySize), so the
   figure and its sentence are one. A route whose figure is unsourced (PMDA) is not measured. */
describe('a route whose gateway limit is sourced is refused over it before signing (P-93, question 1(a))', () => {
  const EU_LIMIT = 600 * 1024 * 1024;
  it('an EU national filing over CESP’s 600 MiB is refused by the guard’s own sentence, and nothing is signed', async () => {
    const id = await sequence('dispatched', 'eu', 'EU_GENERIC_DCP');
    h.sizeBytes = 700 * 1024 * 1024;
    const pre = await readiness(id, 'production');
    expect(pre.cleared).toBe(false);
    expect(pre.refusal).toBe(
      'Refusing to transmit: Package is 700.0 MiB, over the EMA gateway limit of 600 MiB. Submit via the agency\'s ' +
      'large-submission channel (e.g. physical media) instead of the gateway. The sequence is dispatched, so its leaves ' +
      'can no longer be changed, and it cannot be sent as it is.');
    expect((await q(`SELECT id FROM electronic_signatures WHERE signed_target = $1`, [`ectd-sequence:${id}`])).rows).toEqual([]);
  }, 120_000);

  it('one byte over CESP’s 600 MiB is refused', async () => {
    const id = await sequence('dispatched', 'eu', 'EU_GENERIC_DCP');
    h.sizeBytes = EU_LIMIT + 1;
    expect((await readiness(id, 'production')).refusal).toMatch(/^Refusing to transmit: Package is .* over the EMA gateway limit/);
  }, 120_000);

  /* The coordinating session, 2026-11-09 (Q1(a) follow-on): the package gate refuses it at freeze and dispatch too,
     by the same rule and sentence, so a sequence that cannot be sent is not sealed or dispatched first. */
  it('an EU national filing over 600 MiB is refused at freeze, while its leaves can still change', async () => {
    const id = await sequence('validated', 'eu', 'EU_GENERIC_DCP');
    h.sizeBytes = 700 * 1024 * 1024;
    expect((await precheckGovernedStep(id, 'freeze', ctx)).refusal).toBe(
      'Refusing to freeze: Package is 700.0 MiB, over the EMA gateway limit of 600 MiB. Submit via the agency\'s ' +
      'large-submission channel (e.g. physical media) instead of the gateway. Remove some of its leaves and place them ' +
      'in a later sequence, so that each package is 600 MiB or less. Transmit would refuse this package, and once the ' +
      'sequence is frozen its leaves can no longer be changed.');
  }, 120_000);

  it('a frozen EU national filing over 600 MiB is refused at dispatch, saying its leaves are locked', async () => {
    const id = await sequence('frozen', 'eu', 'EU_GENERIC_DCP');
    h.sizeBytes = 700 * 1024 * 1024;
    expect((await precheckGovernedStep(id, 'dispatch', ctx)).refusal).toBe(
      'Refusing to dispatch: Package is 700.0 MiB, over the EMA gateway limit of 600 MiB. Submit via the agency\'s ' +
      'large-submission channel (e.g. physical media) instead of the gateway. The sequence is frozen, so its leaves can ' +
      'no longer be changed, and it cannot be sent as it is.');
  }, 120_000);

  it('at exactly CESP’s 600 MiB it is not refused on size', async () => {
    const id = await sequence('dispatched', 'eu', 'EU_GENERIC_DCP');
    h.sizeBytes = EU_LIMIT;
    expect(await readiness(id, 'production')).toMatchObject({ cleared: true, refusal: null });
  }, 120_000);
});

describe('P-93: freeze and dispatch refuse it too, before their signatures (the package gate, site a)', () => {
  it('a validated FDA sequence over 1 GiB is refused at freeze while its leaves can still change, with what to do', async () => {
    const id = await sequence('validated');
    h.sizeBytes = GIB + 1;
    const pre = await precheckGovernedStep(id, 'freeze', ctx);
    expect(pre.cleared).toBe(false);
    expect(pre.refusal).toBe(
      'Refusing to freeze: the package is just over 1 GiB (1,073,741,825 bytes), and at launch Concept2Cure sends ' +
      'packages of up to 1 GiB to FDA. Remove some of its leaves and place them in a later sequence, so that each ' +
      'package is 1 GiB or less. Transmit would refuse this package, and once the sequence is frozen its leaves can no ' +
      'longer be changed.');
  }, 120_000);

  it.each(['frozen', 'dispatched'] as const)('a %s FDA sequence over 1 GiB is refused at dispatch, saying its leaves are locked', async (status) => {
    const id = await sequence(status);
    h.sizeBytes = GIB + 1;
    const pre = await precheckGovernedStep(id, 'dispatch', ctx);
    expect(pre.cleared).toBe(false);
    expect(pre.refusal).toBe(
      'Refusing to dispatch: the package is just over 1 GiB (1,073,741,825 bytes), and at launch Concept2Cure sends ' +
      `packages of up to 1 GiB to FDA. The sequence is ${status}, so its leaves can no longer be changed, and it cannot ` +
      'be sent as it is.');
    // No act exists yet that frees a sequence's number (P-86), so none is named.
    expect(pre.refusal).not.toMatch(/retire/i);
  }, 120_000);

  it('a sequence for another region over 1 GiB is not refused on size at freeze', async () => {
    const id = await sequence('validated', 'jp');
    h.sizeBytes = GIB + 1;
    expect(await precheckGovernedStep(id, 'freeze', ctx)).toMatchObject({ cleared: true, refusal: null });
  }, 120_000);

  it('at exactly 1 GiB freeze is not refused on size', async () => {
    const id = await sequence('validated');
    h.sizeBytes = GIB;
    expect(await precheckGovernedStep(id, 'freeze', ctx)).toMatchObject({ cleared: true, refusal: null });
  }, 120_000);
});
