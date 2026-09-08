/**
 * eCTD prior-state fold — the lifecycle diff must see the WHOLE application on
 * file, not just the last sequence's delta.
 *
 * Each stored `leaf_manifest` is a per-sequence delta (the packager snapshots
 * only the leaves that sequence shipped, and unchanged leaves are deliberately
 * omitted). But `computeLifecycleOperations` treats the prior state it is handed
 * as the COMPLETE set on file at the agency.
 *
 * Reading only the single most recent prior manifest (the old `LIMIT 1`) broke
 * that from sequence 0002 onward: a leaf filed in 0000 and not re-filed in 0001
 * was missing from the prior state, so the diff found no predecessor and emitted
 *   <leaf operation="new" ...>            (no modified-file)
 * — asserting to the agency that the document had never been filed under this
 * application, while the version it was meant to supersede stayed current.
 *
 * These tests pin the fold: every preceding sequence is folded oldest-to-newest,
 * a withdrawn leaf drops off file, and each surviving leaf remembers the sequence
 * that actually holds it so its modified-file pointer traverses to the right
 * folder. They fail against the pre-fix single-manifest read.
 */
import { describe, it, expect } from 'vitest';
import { loadLatestPriorManifestBySubmission, type PoolLike } from '../prior-sequence-loader';
import { computeLifecycleOperations, type DesiredLeaf } from '../lifecycle-operator';

const ORG = 7;
const SUBMISSION = 1;

const IB_MD5_V1 = 'b'.repeat(32);
const IB_MD5_V2 = 'e'.repeat(32);

// 0000: the original dossier — drug substance, the Investigator's Brochure, and
// a leaf that a later sequence withdraws.
const SEQ_0000 = [
  { ctdSection: 'm3.2.s.1', fileName: 'drug-substance.pdf', href: 'm3/32-s-1/drug-substance.pdf', md5: 'a'.repeat(32), operation: 'new' },
  { ctdSection: 'm1.13', fileName: 'ib.pdf', href: 'm1/13-ib/ib.pdf', md5: IB_MD5_V1, operation: 'new' },
  { ctdSection: 'm3.2.s.9', fileName: 'obsolete.pdf', href: 'm3/32-s-9/obsolete.pdf', md5: 'd'.repeat(32), operation: 'new' },
];

// 0001: a narrow amendment — replaces the drug-substance leaf and withdraws the
// obsolete one. It says nothing about the IB, which is therefore still on file.
const SEQ_0001 = [
  { ctdSection: 'm3.2.s.1', fileName: 'drug-substance.pdf', href: 'm3/32-s-1/drug-substance.pdf', md5: 'c'.repeat(32), operation: 'replace' },
  { ctdSection: 'm3.2.s.9', fileName: 'obsolete.pdf', href: 'm3/32-s-9/obsolete.pdf', md5: 'd'.repeat(32), operation: 'delete' },
];

/**
 * Stub pool over the two prior compilations. It HONOURS the query's ORDER BY
 * direction and LIMIT so it is a faithful fake of both the fixed query and the
 * pre-fix `ORDER BY sequence_number DESC ... LIMIT 1` — otherwise these tests
 * would pass against the old code for the wrong reason.
 */
function stubPool() {
  const seen = { sql: '' };
  const all = [
    { sequence_number: '0000', leaf_manifest: SEQ_0000 },
    { sequence_number: '0001', leaf_manifest: SEQ_0001 },
  ];
  const pool: PoolLike = {
    async query(sql: string) {
      seen.sql = sql;
      const desc = /order\s+by\s+(?:\w+\.)?sequence_number\s+desc/i.test(sql);
      let rows = [...all].sort((a, b) =>
        desc
          ? b.sequence_number.localeCompare(a.sequence_number)
          : a.sequence_number.localeCompare(b.sequence_number),
      );
      const limit = sql.match(/limit\s+(\d+)/i);
      if (limit) rows = rows.slice(0, Number(limit[1]));
      return { rows };
    },
  };
  return { pool, seen };
}

const loadPrior = () => {
  const { pool, seen } = stubPool();
  return loadLatestPriorManifestBySubmission(pool, {
    organizationId: ORG,
    submissionId: SUBMISSION,
    currentSequence: '0002',
  }).then(r => ({ ...r, seen }));
};

describe('loadLatestPriorManifestBySubmission — cumulative prior state', () => {
  it('folds EVERY preceding sequence, not just the most recent', async () => {
    const { leaves } = await loadPrior();
    const keys = leaves.map(l => `${l.ctdSection}/${l.fileName}`);
    // The IB was filed in 0000 and never re-filed. Pre-fix it was absent from the
    // prior state, which is exactly what made it ship as operation="new".
    expect(keys).toContain('m1.13/ib.pdf');
    expect(keys).toContain('m3.2.s.1/drug-substance.pdf');
  });

  it('a later filing of the same leaf supersedes the earlier one', async () => {
    const { leaves } = await loadPrior();
    const ds = leaves.find(l => l.fileName === 'drug-substance.pdf');
    expect(ds?.md5).toBe('c'.repeat(32)); // 0001's version, not 0000's
    expect(ds?.sequenceNumber).toBe('0001');
  });

  it('a withdrawn leaf drops out of the effective state', async () => {
    const { leaves } = await loadPrior();
    expect(leaves.map(l => l.fileName)).not.toContain('obsolete.pdf');
  });

  it('each surviving leaf remembers the sequence that actually holds it', async () => {
    const { leaves } = await loadPrior();
    expect(leaves.find(l => l.fileName === 'ib.pdf')?.sequenceNumber).toBe('0000');
  });

  it('reports the most recent prior sequence number', async () => {
    const { priorSequenceNumber } = await loadPrior();
    expect(priorSequenceNumber).toBe('0001');
  });

  it('does NOT read only a single prior compilation', async () => {
    const { seen } = await loadPrior();
    // The pre-fix query ended in `LIMIT 1`, which is the defect itself.
    expect(seen.sql).not.toMatch(/limit\s+1/i);
    // Alias-tolerant: the query joins ectd_sequences to establish which prior
    // sequences were actually transmitted, so its columns are qualified.
    expect(seen.sql).toMatch(/order\s+by\s+(?:\w+\.)?sequence_number\s+asc/i);
  });
});

describe('lifecycle diff over the folded prior state', () => {
  it('supersedes a leaf last filed two sequences back as REPLACE pointing at that sequence', async () => {
    const { leaves: prior, priorSequenceNumber } = await loadPrior();

    // Sequence 0002 amends the Investigator's Brochure, last filed in 0000.
    const desired: DesiredLeaf[] = [
      {
        ctdSection: 'm1.13',
        fileName: 'ib.pdf',
        title: "Investigator's Brochure",
        sourcePath: '/tmp/ib.pdf',
        md5: IB_MD5_V2,
      },
    ];

    const { leaves, summary } = computeLifecycleOperations(prior, desired, {
      priorSequencePrefix: `../${priorSequenceNumber}/`, // '../0001/' — the naive prefix
    });

    expect(leaves).toHaveLength(1);
    const ib = leaves[0];
    // THE defect: pre-fix this was operation 'new' with no modified-file, telling
    // FDA the IB had never been filed under this application.
    expect(ib.operation).toBe('replace');
    expect(ib.operation).not.toBe('new');
    expect(summary.new).toBe(0);
    expect(summary.replace).toBe(1);
    // And the pointer must traverse to 0000, where the superseded file actually
    // lives — NOT to 0001, the most recent predecessor, which does not contain it.
    expect(ib.modifiedFile).toBe('../0000/m1/13-ib/ib.pdf');
  });

  it('still emits new for a genuinely first-time leaf', async () => {
    const { leaves: prior, priorSequenceNumber } = await loadPrior();
    const desired: DesiredLeaf[] = [
      {
        ctdSection: 'm5.3.5.1',
        fileName: 'csr-001.pdf',
        title: 'Clinical Study Report 001',
        sourcePath: '/tmp/csr.pdf',
        md5: 'f'.repeat(32),
      },
    ];
    const { leaves, summary } = computeLifecycleOperations(prior, desired, {
      priorSequencePrefix: `../${priorSequenceNumber}/`,
    });
    expect(leaves[0].operation).toBe('new');
    expect(leaves[0].modifiedFile).toBeUndefined();
    expect(summary.new).toBe(1);
  });
});
