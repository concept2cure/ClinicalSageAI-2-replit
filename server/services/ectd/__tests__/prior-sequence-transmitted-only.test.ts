/**
 * The prior state is what the AGENCY HOLDS, not what this platform has compiled.
 *
 * `loadLatestPriorManifestBySubmission` read `ectd_compilations` on
 * organization_id + submission_id + sequence_number < current + leaf_manifest IS
 * NOT NULL. It never joined `ectd_sequences` and never looked at
 * `dispatch_status`, `status` or `frozen_at`. Those rows are written by an
 * ordinary preview compile (POST /api/ectd/:projectIdent/compile), which stores
 * a full leaf_manifest for a sequence that is still `status='draft'`, that may
 * have reported `submissionReady:false` with blockers, and that was never
 * transmitted to anyone.
 *
 * Its consumer treats what comes back as the complete state on file: "a prior
 * leaf this sequence does not mention is still on file, unchanged"
 * (package-from-core.ts:184). So a local draft compile of 0001 made sequence
 * 0002 believe the agency already had those documents, and
 * `computeLifecycleOperations` marked every one of them `unchanged` — a package
 * containing NO FILES, audited as ECTD_PACKAGED_FROM_CORE success with
 * leafCount 0. Where a leaf did differ, the `modified-file` pointer referenced
 * ../0001/, a sequence folder the agency has never received.
 *
 * The rule is already written down in this repo, in the sibling package model:
 * "A bundle that was assembled and never transmitted is not on file at the
 * agency and must not appear in the prior state, so the history is appended at
 * successful transmit, never at assembly"
 * (package-sequence-lifecycle.ts:18-20). This is the core path being held to it.
 */
import { describe, it, expect } from 'vitest';
import { loadLatestPriorManifestBySubmission, type PoolLike } from '../prior-sequence-loader';
import { computeLifecycleOperations, type DesiredLeaf } from '../lifecycle-operator';

const ORG = 7;
const SUBMISSION = 42;
const MD5_V1 = '1'.repeat(32);
const MD5_V2 = '2'.repeat(32);
const MD5_NEW = '3'.repeat(32);

const OVERVIEW = {
  ctdSection: 'm2.5',
  fileName: 'clinical-overview.pdf',
  href: 'm2/25-clin-over/clinical-overview.pdf',
};
const SUMMARY = {
  ctdSection: 'm2.7',
  fileName: 'clinical-summary.pdf',
  href: 'm2/27-clin-sum/clinical-summary.pdf',
};

/**
 * A pool over two compiled sequences, only ONE of which was transmitted.
 *
 * The fake answers the join the fixed query issues. It deliberately does NOT
 * filter for the caller: it returns whichever compilation rows the SQL asks
 * for, so a query that omits the transmit predicate still gets both rows back
 * and the test observes the real defect rather than a fake that fixes it.
 */
function stubPool(dispatchBySeq: Record<string, string | null>) {
  const compilations = [
    { sequence_number: '0000', leaf_manifest: [{ ...OVERVIEW, md5: MD5_V1, operation: 'new' }] },
    {
      sequence_number: '0001',
      leaf_manifest: [
        { ...OVERVIEW, md5: MD5_V2, operation: 'replace' },
        { ...SUMMARY, md5: MD5_NEW, operation: 'new' },
      ],
    },
  ];
  const seen = { sql: '' };
  const pool: PoolLike = {
    async query(sql: string) {
      seen.sql = sql;
      const filtersOnTransmit = /dispatch_status/i.test(sql);
      const rows = compilations.filter((c) => {
        if (!filtersOnTransmit) return true;
        const d = dispatchBySeq[c.sequence_number];
        return d === 'sent' || d === 'acknowledged';
      });
      return { rows };
    },
  };
  return { pool, seen };
}

const load = (dispatchBySeq: Record<string, string | null>) => {
  const { pool, seen } = stubPool(dispatchBySeq);
  return loadLatestPriorManifestBySubmission(pool, {
    organizationId: ORG,
    submissionId: SUBMISSION,
    currentSequence: '0002',
  }).then((r) => ({ ...r, seen }));
};

/**
 * Sequence 0002 re-files both documents, unchanged since the 0001 draft.
 *
 * `DesiredLeaf` is `EctdLeaf` minus `operation`, so `title` and `sourcePath`
 * are required and `href` is not part of it — `href` is prior-side manifest
 * data. Built to the real type rather than cast to it, so the fixture cannot
 * drift from the shape the operator actually consumes.
 */
const DESIRED: DesiredLeaf[] = [
  {
    ctdSection: OVERVIEW.ctdSection,
    fileName: OVERVIEW.fileName,
    title: 'Clinical Overview',
    sourcePath: `/tmp/${OVERVIEW.fileName}`,
    md5: MD5_V2,
  },
  {
    ctdSection: SUMMARY.ctdSection,
    fileName: SUMMARY.fileName,
    title: 'Clinical Summary',
    sourcePath: `/tmp/${SUMMARY.fileName}`,
    md5: MD5_NEW,
  },
];

describe('prior state counts only sequences that actually reached the agency', () => {
  it('a compiled-but-never-transmitted sequence is not on file', async () => {
    // 0000 went out; 0001 was compiled locally and never dispatched.
    const { leaves, priorSequenceNumber, seen } = await load({ '0000': 'sent', '0001': null });

    expect(seen.sql, 'the query must establish which sequences were transmitted').toMatch(/dispatch_status/i);
    expect(priorSequenceNumber, 'the newest FILED sequence is 0000, not the local 0001 compile').toBe('0000');

    const keys = leaves.map((l) => `${l.ctdSection}/${l.fileName}`);
    expect(keys).toContain('m2.5/clinical-overview.pdf');
    expect(keys, 'the Clinical Summary exists only in an untransmitted compile').not.toContain(
      'm2.7/clinical-summary.pdf',
    );
  });

  it('and sequence 0002 therefore SHIPS the documents rather than calling them unchanged', async () => {
    const { leaves: prior } = await load({ '0000': 'sent', '0001': null });
    const ops = computeLifecycleOperations(prior, DESIRED);

    /* CONTROL — the defect itself, from the same inputs. Folding in the
       untransmitted 0001 makes both documents byte-identical to the prior
       state, so the diff calls them unchanged and (unchanged leaves being
       omitted by default) the package goes out with nothing in it. */
    const { leaves: pollutedPrior } = await load({ '0000': 'sent', '0001': 'sent' });
    const polluted = computeLifecycleOperations(pollutedPrior, DESIRED);
    expect(polluted.leaves, 'the control must reproduce the empty package').toEqual([]);
    expect(polluted.summary.unchanged).toBe(2);

    // The defect: prior state folded in the untransmitted 0001, both documents
    // matched it byte for byte, and the package went out with nothing in it.
    expect(ops.leaves.length, 'the package must not be empty').toBeGreaterThan(0);
    const byName = Object.fromEntries(ops.leaves.map((l) => [l.fileName, l]));
    // The overview was last FILED in 0000 at v1, so re-filing v2 supersedes it.
    expect(byName['clinical-overview.pdf']?.operation).toBe('replace');
    // The summary has never been filed at all.
    expect(byName['clinical-summary.pdf']?.operation).toBe('new');
  });

  it('an acknowledged sequence is on file just as a sent one is', async () => {
    const { leaves } = await load({ '0000': 'sent', '0001': 'acknowledged' });
    const keys = leaves.map((l) => `${l.ctdSection}/${l.fileName}`);
    expect(keys).toContain('m2.7/clinical-summary.pdf');
  });

  it('a QUEUED sequence is not on file — pending is not sent', async () => {
    /* `status='dispatched'` sets `dispatch_status='pending'`: the sequence is
       queued for transmit, which is not the same as the agency holding it. */
    const { leaves } = await load({ '0000': 'sent', '0001': 'pending' });
    const keys = leaves.map((l) => `${l.ctdSection}/${l.fileName}`);
    expect(keys).not.toContain('m2.7/clinical-summary.pdf');
  });

  it('nothing transmitted yet means an empty prior state, not a fabricated one', async () => {
    const { leaves, priorSequenceNumber } = await load({ '0000': null, '0001': null });
    expect(leaves).toEqual([]);
    expect(priorSequenceNumber).toBe('');
  });
});
