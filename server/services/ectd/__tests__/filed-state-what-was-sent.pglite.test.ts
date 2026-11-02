/**
 * What the agency holds is what was sent (F1, rows D7 and D2; 2026-11-01).
 *
 * The filed state (readFiledManifestRows, prior-sequence-loader.ts) folded
 * every non-rehearsal compile of a sequence that was sent or acknowledged. Two
 * defects followed, both feeding the NEXT sequence's lifecycle acts through
 * loadLatestPriorManifestBySubmission:
 *   - a leaf that only an earlier PREVIEW compile of the sent sequence carried
 *     read as on file (the phantom leaf);
 *   - a sequence sent with no compile on record was missing, so the next one
 *     bound against an empty prior state.
 *
 * The transmit guard now records, on the transmittal row it writes before the
 * wire, the leaf manifest of the package it hands the gateway and the dispatch
 * binding (submission-gateways/index.ts). The fold reads each filed sequence
 * from the one transmittal its transmit attempt binds, and from its compiles,
 * labelled, only when there is none (sequences sent before the guard kept it).
 *
 * Review (2026-11-02): only the sequence's own send is read (its agency's
 * gateway, its transmit signature, its id), every row binding the attempt
 * counts toward "more than one", and a sent sequence with neither record is
 * refused by the lifecycle read and listed, not included, by the view.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { buildLeafManifest } from '../sequence-manifest';
import {
  loadFiledStateBySubmission,
  loadLatestPriorManifestBySubmission,
  type PoolLike,
} from '../prior-sequence-loader';

const ORG = 7;
const OTHER_ORG = 8;

let pg: PGlite;
const pool: PoolLike = {
  query: (sql: string, params?: unknown[]) =>
    pg.query(sql, params) as unknown as Promise<{ rows: Array<Record<string, unknown>> }>,
};

type Leaf = ReturnType<typeof leaf>;
const leaf = (ctdSection: string, fileName: string, md5: string, operation = 'new', extra: Record<string, unknown> = {}) => ({
  ctdSection, fileName, md5, operation, href: `m3/${fileName}`, leafId: `leaf-${fileName.replace(/\W/g, '-')}`, backbone: 'index.xml', ...extra,
});
const attempt = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** The verified signature a transmit claim records beside its attempt (submission-service claimTransmitSlot). */
const SIGNATURE = 'sig-1';

/** A sequence; one bound to a transmit attempt also records the signature that claimed it. */
async function sequence(submissionId: number, number: string, dispatch: string | null, attemptId: string | null = null, region = 'fda'): Promise<number> {
  const { rows } = await pg.query<{ id: number }>(
    `INSERT INTO ectd_sequences (submission_id, sequence_number, organization_id, dispatch_status, transmit_attempt_id, transmit_signature_action_id, region)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [submissionId, number, ORG, dispatch, attemptId, attemptId ? SIGNATURE : null, region],
  );
  return rows[0].id;
}

async function compile(submissionId: number, number: string, manifest: Leaf[], at: string, type = 'module'): Promise<void> {
  await pg.query(
    `INSERT INTO ectd_compilations (organization_id, submission_id, compilation_type, sequence_number, leaf_manifest, compiled_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [ORG, submissionId, type, number, JSON.stringify(manifest), at],
  );
}

/** A transmittal row as the guard writes it: its binding, and what it carried
 *  through buildLeafManifest — or, for a send before the guard kept it, no manifest.
 *  FDA ESG's by default; `route` names another gateway's row. */
async function transmittal(
  binding: { attemptId: string; sequenceId: number; signatureActionId?: string },
  manifest: Leaf[] | null,
  org = ORG,
  route: { region: string; gateway: string; sha?: string } = { region: 'fda', gateway: 'esg' },
): Promise<number> {
  const sha = route.sha ?? 'a'.repeat(64);
  const metadata = {
    applicationId: 'IND123456',
    dispatchBinding: { signatureActionId: SIGNATURE, ...binding, organizationId: org, bundleSha256: sha },
    ...(manifest ? { leafManifest: buildLeafManifest(manifest) } : {}),
  };
  const { rows } = await pg.query<{ id: number }>(
    `INSERT INTO submission_transmittals (organization_id, region, gateway, status, bundle_sha256, metadata)
     VALUES ($1, $2, $3, 'received', $4, $5::jsonb) RETURNING id`,
    [org, route.region, route.gateway, sha, JSON.stringify(metadata)],
  );
  return rows[0].id;
}

const filedState = (submissionId: number) => loadFiledStateBySubmission(pool, { organizationId: ORG, submissionId });
const priorFor = (submissionId: number, currentSequence: string) =>
  loadLatestPriorManifestBySubmission(pool, { organizationId: ORG, submissionId, currentSequence });
const names = (leaves: Array<{ fileName: string }>) => leaves.map((l) => l.fileName).sort();

beforeAll(async () => {
  pg = new PGlite();
  // The columns the loader reads, named as in shared/schema.ts (ectdCompilations),
  // shared/schema/submissions.ts (ectdSequences) and the gateway tables
  // (submissionTransmittals: metadata is jsonb, leaf_manifest is json).
  await pg.exec(`
    CREATE TABLE ectd_sequences (
      id SERIAL PRIMARY KEY, submission_id INTEGER NOT NULL, region TEXT NOT NULL DEFAULT 'fda',
      sequence_number TEXT NOT NULL, organization_id INTEGER NOT NULL, dispatch_status TEXT,
      transmit_signature_action_id TEXT, transmit_attempt_id UUID, deleted_at TIMESTAMPTZ
    );
    CREATE TABLE ectd_compilations (
      id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, submission_id INTEGER,
      compilation_type TEXT NOT NULL DEFAULT 'module', application_number TEXT,
      sequence_number TEXT, leaf_manifest JSON, compiled_at TIMESTAMP
    );
    CREATE TABLE submission_transmittals (
      id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, region TEXT NOT NULL DEFAULT 'fda',
      gateway TEXT NOT NULL DEFAULT 'esg', status TEXT NOT NULL DEFAULT 'pending', bundle_sha256 TEXT,
      metadata JSONB DEFAULT '{}'::jsonb
    );
  `);
});

afterAll(async () => {
  await pg.close();
});

describe('a sequence sent with a record of what it carried is read from that record', () => {
  it('a leaf only an earlier preview compile carried is not on file (the phantom leaf)', async () => {
    const id = await sequence(1, '0000', 'sent', attempt(1));
    await compile(1, '0000', [leaf('3.2.S.1', 'general.pdf', 'a'.repeat(32)), leaf('3.2.S.2', 'draft-only.pdf', 'b'.repeat(32))], '2026-10-01T10:00:00');
    await transmittal({ attemptId: attempt(1), sequenceId: id }, [leaf('3.2.S.1', 'general.pdf', 'a'.repeat(32))]);
    const state = await filedState(1);
    expect(names(state.leaves)).toEqual(['general.pdf']);
    expect(state.sequences).toEqual([{ sequenceNumber: '0000', dispatchStatus: 'sent', filed: true, basis: 'transmit' }]);
    expect(names((await priorFor(1, '0001')).leaves)).toEqual(['general.pdf']);
  });

  it('a sequence sent with no compile on record is filed, and the next sequence binds against it', async () => {
    const id = await sequence(2, '0000', 'sent', attempt(2));
    await sequence(2, '0001', null);
    await transmittal({ attemptId: attempt(2), sequenceId: id }, [leaf('3.2.S.1', 'general.pdf', 'a'.repeat(32)), leaf('5.3.5.1', 'csr.pdf', 'b'.repeat(32))]);
    const state = await filedState(2);
    expect(names(state.leaves)).toEqual(['csr.pdf', 'general.pdf']);
    expect(state.throughSequence).toBe('0000');
    expect(state.sequences).toEqual([
      { sequenceNumber: '0000', dispatchStatus: 'sent', filed: true, basis: 'transmit' },
      { sequenceNumber: '0001', dispatchStatus: null, filed: false, basis: null },
    ]);
    const prior = await priorFor(2, '0001');
    expect(prior.priorSequenceNumber).toBe('0000');
    expect(prior.leaves.map((l) => [l.fileName, l.sequenceNumber]).sort()).toEqual([['csr.pdf', '0000'], ['general.pdf', '0000']]);
  });

  it('rejected, then resent: only the attempt the sequence is bound to is read', async () => {
    const id = await sequence(3, '0000', 'sent', attempt(32));
    await transmittal({ attemptId: attempt(31), sequenceId: id }, [leaf('3.2.S.1', 'first-send.pdf', 'a'.repeat(32))]);
    await transmittal({ attemptId: attempt(32), sequenceId: id }, [leaf('3.2.S.1', 'resend.pdf', 'c'.repeat(32))]);
    await expect(filedState(3).then((s) => ({ leaves: names(s.leaves), basis: s.sequences[0]?.basis })))
      .resolves.toEqual({ leaves: ['resend.pdf'], basis: 'transmit' });
  });
});

describe('a sequence sent before the guard kept a record is read from its compiles, and labelled so', () => {
  it('a bound transmittal with no leaf manifest, or no transmit attempt at all, keeps the compile read', async () => {
    const first = await sequence(4, '0000', 'acknowledged', attempt(4));
    await transmittal({ attemptId: attempt(4), sequenceId: first }, null);
    await compile(4, '0000', [leaf('3.2.S.1', 'legacy.pdf', 'a'.repeat(32))], '2026-09-01T10:00:00');
    await sequence(4, '0001', 'sent', null);
    await compile(4, '0001', [leaf('5.3.5.1', 'older.pdf', 'b'.repeat(32))], '2026-09-02T10:00:00');
    const state = await filedState(4);
    expect(names(state.leaves)).toEqual(['legacy.pdf', 'older.pdf']);
    expect(state.sequences).toEqual([
      { sequenceNumber: '0000', dispatchStatus: 'acknowledged', filed: true, basis: 'compiles' },
      { sequenceNumber: '0001', dispatchStatus: 'sent', filed: true, basis: 'compiles' },
    ]);
  });

  it('another organisation’s transmittal binding the same attempt is never read', async () => {
    const id = await sequence(6, '0000', 'sent', attempt(6));
    await compile(6, '0000', [leaf('3.2.S.1', 'mine.pdf', 'a'.repeat(32))], '2026-09-01T10:00:00');
    await transmittal({ attemptId: attempt(6), sequenceId: id }, [leaf('2.5', 'foreign.pdf', 'f'.repeat(32))], OTHER_ORG);
    const state = await filedState(6);
    expect({ leaves: names(state.leaves), basis: state.sequences[0]?.basis }).toEqual({ leaves: ['mine.pdf'], basis: 'compiles' });
  });
});

describe('a sent sequence with no record of what it carried: listed by the view, never bound against (F1 review)', () => {
  const refusal = /Sequence 0001 was sent to the agency, but nothing on record says what it carried: no record of the send, and no compile\. What is on file cannot be read, so nothing was bound against it\./;

  it('sent before the guard kept the record and never compiled: the next sequence is refused, the view names it', async () => {
    await sequence(9, '0000', 'acknowledged', null);
    await compile(9, '0000', [leaf('3.2.S.1', 'general.pdf', 'a'.repeat(32))], '2026-09-01T10:00:00');
    await sequence(9, '0001', 'sent', null); // no attempt bound, no transmittal, no compile
    await sequence(9, '0002', null);
    // Below the bound it is what the lifecycle acts would meet, so nothing is bound.
    await expect(priorFor(9, '0002')).rejects.toThrow(refusal);
    // At the bound it is not part of the prior state: 0001 itself binds against 0000.
    expect(names((await priorFor(9, '0001')).leaves)).toEqual(['general.pdf']);
    // The current view still reads, and lists it as not included.
    const state = await filedState(9);
    expect(names(state.leaves)).toEqual(['general.pdf']);
    expect(state.throughSequence).toBe('0000');
    expect(state.sequences).toEqual([
      { sequenceNumber: '0000', dispatchStatus: 'acknowledged', filed: true, basis: 'compiles' },
      { sequenceNumber: '0001', dispatchStatus: 'sent', filed: false, basis: null },
      { sequenceNumber: '0002', dispatchStatus: null, filed: false, basis: null },
    ]);
  });

  it('bound to its attempt, but the transmittal predates the record and there is no compile: the same refusal', async () => {
    await sequence(10, '0000', 'acknowledged', null);
    await compile(10, '0000', [leaf('3.2.S.1', 'general.pdf', 'a'.repeat(32))], '2026-09-01T10:00:00');
    const id = await sequence(10, '0001', 'sent', attempt(10));
    await transmittal({ attemptId: attempt(10), sequenceId: id }, null);
    await expect(priorFor(10, '0002')).rejects.toThrow(refusal);
    const state = await filedState(10);
    expect(state.sequences[1]).toEqual({ sequenceNumber: '0001', dispatchStatus: 'sent', filed: false, basis: null });
  });
});

describe('only the sequence’s own send is read (F1 review: rows written before the guard stamped the keys)', () => {
  it('another agency’s row carrying a binding to an FDA sequence is not read', async () => {
    const id = await sequence(11, '0000', 'sent', attempt(11));
    await compile(11, '0000', [leaf('3.2.S.1', 'real.pdf', 'a'.repeat(32))], '2026-09-01T10:00:00');
    // The FDA ESG row as it was written before the guard kept the record: the binding, no manifest.
    await transmittal({ attemptId: attempt(11), sequenceId: id }, null);
    // A CESP row that stored a caller's metadata verbatim, naming the same attempt, sequence and signature.
    await transmittal({ attemptId: attempt(11), sequenceId: id }, [leaf('3.2.S.1', 'invented.pdf', 'f'.repeat(32))], ORG,
      { region: 'ema', gateway: 'cesp', sha: 'e'.repeat(64) });
    const state = await filedState(11);
    expect({ leaves: names(state.leaves), basis: state.sequences[0]?.basis }).toEqual({ leaves: ['real.pdf'], basis: 'compiles' });
    expect(names((await priorFor(11, '0001')).leaves)).toEqual(['real.pdf']);
  });

  it('a row binding the attempt and sequence under another signature is not read', async () => {
    const id = await sequence(12, '0000', 'sent', attempt(12));
    await compile(12, '0000', [leaf('3.2.S.1', 'real.pdf', 'a'.repeat(32))], '2026-09-01T10:00:00');
    await transmittal({ attemptId: attempt(12), sequenceId: id, signatureActionId: 'sig-other' }, [leaf('3.2.S.1', 'invented.pdf', 'f'.repeat(32))]);
    const state = await filedState(12);
    expect({ leaves: names(state.leaves), basis: state.sequences[0]?.basis }).toEqual({ leaves: ['real.pdf'], basis: 'compiles' });
  });

  it('a row binding the attempt under another sequence’s id is not read', async () => {
    const id = await sequence(14, '0000', 'sent', attempt(14));
    await compile(14, '0000', [leaf('3.2.S.1', 'real.pdf', 'a'.repeat(32))], '2026-09-01T10:00:00');
    await transmittal({ attemptId: attempt(14), sequenceId: id + 1000 }, [leaf('3.2.S.1', 'invented.pdf', 'f'.repeat(32))]);
    const state = await filedState(14);
    expect({ leaves: names(state.leaves), basis: state.sequences[0]?.basis }).toEqual({ leaves: ['real.pdf'], basis: 'compiles' });
  });

  it('two rows of its own agency bind the attempt, one with no manifest: the read throws, never reads either', async () => {
    const id = await sequence(13, '0000', 'sent', attempt(13));
    await compile(13, '0000', [leaf('3.2.S.1', 'real.pdf', 'a'.repeat(32))], '2026-09-01T10:00:00');
    await transmittal({ attemptId: attempt(13), sequenceId: id }, null);
    await transmittal({ attemptId: attempt(13), sequenceId: id }, [leaf('3.2.S.1', 'invented.pdf', 'f'.repeat(32))], ORG,
      { region: 'fda', gateway: 'esg', sha: 'e'.repeat(64) });
    await expect(filedState(13)).rejects.toThrow(/Sequence 0000 is bound to more than one transmittal/);
  });

  it('an EU sequence is read from the EMA gateway’s row: the region is compared as one agency, not as text', async () => {
    const id = await sequence(15, '0000', 'sent', attempt(15), 'eu');
    await transmittal({ attemptId: attempt(15), sequenceId: id }, [leaf('3.2.S.1', 'sent-to-ema.pdf', 'a'.repeat(32))], ORG,
      { region: 'ema', gateway: 'cesp' });
    const state = await filedState(15);
    expect({ leaves: names(state.leaves), basis: state.sequences[0]?.basis }).toEqual({ leaves: ['sent-to-ema.pdf'], basis: 'transmit' });
  });
});

describe('a record that cannot say what was sent is an error, never a partial view', () => {
  it('two transmittals binding one attempt of one sequence: the read throws, naming the sequence', async () => {
    const id = await sequence(5, '0000', 'sent', attempt(5));
    await sequence(5, '0001', null);
    await compile(5, '0000', [leaf('3.2.S.1', 'compiled.pdf', 'a'.repeat(32))], '2026-09-01T10:00:00');
    await transmittal({ attemptId: attempt(5), sequenceId: id }, [leaf('3.2.S.1', 'one.pdf', 'a'.repeat(32))]);
    await transmittal({ attemptId: attempt(5), sequenceId: id }, [leaf('3.2.S.1', 'two.pdf', 'b'.repeat(32))]);
    const sentence = /Sequence 0000 is bound to more than one transmittal/;
    await expect(filedState(5)).rejects.toThrow(sentence);
    await expect(priorFor(5, '0001')).rejects.toThrow(sentence);
  });
});

describe('the acts behind each document hold across both kinds of record (cd5fd2281)', () => {
  const general = (md5: string, operation: string, extra: Record<string, unknown> = {}) => [leaf('3.2.S.1', 'general.pdf', md5, operation, extra)];
  const replace = { modifiedFile: '../0000/index.xml#leaf-general-pdf' };

  it('a sequence read from its transmittal, then one read from its compiles', async () => {
    const id = await sequence(7, '0000', 'acknowledged', attempt(7));
    await transmittal({ attemptId: attempt(7), sequenceId: id }, general('a'.repeat(32), 'new'));
    await sequence(7, '0001', 'sent', null);
    await compile(7, '0001', general('b'.repeat(32), 'replace', replace), '2026-09-02T10:00:00');
    const state = await filedState(7);
    expect(state.leaves.map((l) => [l.fileName, l.sequenceNumber, l.md5[0]])).toEqual([['general.pdf', '0001', 'b']]);
    expect(state.leaves[0].history.map((a) => [a.sequenceNumber, a.operation])).toEqual([['0000', 'new'], ['0001', 'replace']]);
    expect(state.sequences.map((s) => s.basis)).toEqual(['transmit', 'compiles']);
  });

  it('a sequence read from its compiles, then one read from its transmittal', async () => {
    await sequence(8, '0000', 'acknowledged', null);
    await compile(8, '0000', general('a'.repeat(32), 'new'), '2026-09-01T10:00:00');
    const id = await sequence(8, '0001', 'sent', attempt(8));
    await transmittal({ attemptId: attempt(8), sequenceId: id }, general('b'.repeat(32), 'replace', replace));
    const state = await filedState(8);
    expect(state.leaves.map((l) => [l.fileName, l.sequenceNumber, l.md5[0]])).toEqual([['general.pdf', '0001', 'b']]);
    expect(state.leaves[0].history.map((a) => [a.sequenceNumber, a.operation])).toEqual([['0000', 'new'], ['0001', 'replace']]);
    expect(state.sequences.map((s) => s.basis)).toEqual(['compiles', 'transmit']);
  });
});
