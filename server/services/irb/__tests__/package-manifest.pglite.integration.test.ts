/**
 * The IRB package manifest, read from the real tables.
 *
 * The pure engine is covered by `package-manifest.test.ts`. What this proves is
 * the join that `docs/design/IRB_SUBMISSION.md` D1 makes load-bearing: an IRB
 * submission is a SUBMISSION, and its package is the leaves placed at IRB slots
 * on that submission's sequences — not a second document stack.
 *
 * It also pins the distinction a surface must not blur: an IRB submission that
 * has never been linked to the Submission Center has NO package to inspect,
 * which is a different fact from a package with nothing in it.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as any[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) }, db: {} }));

import { getPackageManifest } from '../irb-service';

const ORG = 7;
const OTHER = 9;

const DDL = `
CREATE TABLE irb_submissions (id serial PRIMARY KEY, organization_id int NOT NULL, submission_id int, protocol_number text, title text, review_type text, risk_level text NOT NULL DEFAULT 'minimal', involves_vulnerable_populations boolean NOT NULL DEFAULT false, consent_waiver_requested boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'draft', deleted_at timestamptz);
CREATE TABLE ectd_sequences (id serial PRIMARY KEY, submission_id int NOT NULL, organization_id int NOT NULL, region text, sequence_number text, status text DEFAULT 'draft', deleted_at timestamptz);
CREATE TABLE submission_leaves (id serial PRIMARY KEY, sequence_id int NOT NULL, section_code text NOT NULL, title text NOT NULL, document_table text, document_id int, document_uuid uuid, deleted_at timestamptz);
`;

async function seedIrb(over: Record<string, unknown> = {}): Promise<number> {
  const r = await pool.query(
    `INSERT INTO irb_submissions (organization_id, submission_id, protocol_number, title, risk_level, consent_waiver_requested)
     VALUES ($1,$2,'P-1','A study',$3,$4) RETURNING id`,
    [over.org ?? ORG, over.submissionId ?? null, over.riskLevel ?? 'minimal', over.waiver ?? false],
  );
  return Number(r.rows[0].id);
}

async function seedSequence(submissionId: number, org = ORG): Promise<number> {
  const r = await pool.query(
    `INSERT INTO ectd_sequences (submission_id, organization_id, region, sequence_number) VALUES ($1,$2,'fda','0000') RETURNING id`,
    [submissionId, org],
  );
  return Number(r.rows[0].id);
}

async function seedLeaf(seqId: number, slot: string, opts: { resolvable?: boolean } = {}): Promise<void> {
  const resolvable = opts.resolvable !== false;
  await pool.query(
    `INSERT INTO submission_leaves (sequence_id, section_code, title, document_table, document_id)
     VALUES ($1,$2,'Doc',$3,$4)`,
    [seqId, slot, resolvable ? 'unified_documents' : null, resolvable ? 42 : null],
  );
}

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); });
beforeEach(async () => {
  await pglite.exec('TRUNCATE irb_submissions, ectd_sequences, submission_leaves RESTART IDENTITY;');
});

describe('unlinked is not empty', () => {
  it('reports a null linked submission rather than an empty package', async () => {
    const irbId = await seedIrb();

    const out = await getPackageManifest(ORG, irbId);

    expect(out.linkedSubmissionId).toBeNull();
    expect(out.manifest.rows.every((r) => r.placed.length === 0)).toBe(true);
    expect(out.manifest.readyToAssemble).toBe(false);
  });

  it('reports a linked submission that carries nothing as linked-but-empty', async () => {
    const irbId = await seedIrb({ submissionId: 500 });
    await seedSequence(500);

    const out = await getPackageManifest(ORG, irbId);

    expect(out.linkedSubmissionId).toBe(500);
    expect(out.manifest.readyToAssemble).toBe(false);
  });
});

describe('the package is the submission’s leaves', () => {
  it('reads the leaves placed at IRB slots on the linked submission', async () => {
    const irbId = await seedIrb({ submissionId: 500 });
    const seq = await seedSequence(500);
    await seedLeaf(seq, 'irb.protocol');
    await seedLeaf(seq, 'irb.consent');

    const out = await getPackageManifest(ORG, irbId);
    const protocol = out.manifest.rows.find((r) => r.slot === 'irb.protocol');

    expect(out.linkedSubmissionId).toBe(500);
    expect(protocol?.satisfied).toBe(true);
    expect(out.manifest.counts.requiredSatisfied).toBeGreaterThanOrEqual(2);
  });

  it('does not read CTD leaves on the same submission as IRB artifacts', async () => {
    const irbId = await seedIrb({ submissionId: 500 });
    const seq = await seedSequence(500);
    await seedLeaf(seq, '2.7.3');
    await seedLeaf(seq, 'irb.protocol');

    const out = await getPackageManifest(ORG, irbId);

    expect(out.manifest.unexpectedSlots).toEqual([]);
    expect(out.manifest.rows.flatMap((r) => r.placed)).toHaveLength(1);
  });

  it('counts a leaf that names no document as a placeholder, not an artifact', async () => {
    const irbId = await seedIrb({ submissionId: 500 });
    const seq = await seedSequence(500);
    await seedLeaf(seq, 'irb.protocol', { resolvable: false });

    const out = await getPackageManifest(ORG, irbId);
    const row = out.manifest.rows.find((r) => r.slot === 'irb.protocol');

    expect(row?.placed).toHaveLength(1);
    expect(row?.satisfied).toBe(false);
    expect(out.manifest.counts.unresolvable).toBe(1);
  });

  it('ignores a soft-deleted leaf and a soft-deleted sequence', async () => {
    const irbId = await seedIrb({ submissionId: 500 });
    const seq = await seedSequence(500);
    await seedLeaf(seq, 'irb.protocol');
    await pool.query(`UPDATE submission_leaves SET deleted_at = now()`);
    expect((await getPackageManifest(ORG, irbId)).manifest.rows.flatMap((r) => r.placed)).toHaveLength(0);

    await pool.query(`UPDATE submission_leaves SET deleted_at = NULL`);
    await pool.query(`UPDATE ectd_sequences SET deleted_at = now()`);
    expect((await getPackageManifest(ORG, irbId)).manifest.rows.flatMap((r) => r.placed)).toHaveLength(0);
  });
});

describe('tenant scope', () => {
  it('does not read another organization’s IRB submission', async () => {
    const irbId = await seedIrb({ org: OTHER, submissionId: 500 });

    await expect(getPackageManifest(ORG, irbId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('does not read leaves from a sequence belonging to another organization', async () => {
    const irbId = await seedIrb({ submissionId: 500 });
    await seedSequence(500, OTHER);
    const otherSeq = 1;
    await seedLeaf(otherSeq, 'irb.protocol');

    const out = await getPackageManifest(ORG, irbId);

    expect(out.manifest.rows.flatMap((r) => r.placed)).toHaveLength(0);
  });
});

describe('what the submission does not record stays undecided', () => {
  /*
   * `irb_submissions` records no IND status, no child involvement, no PHI use
   * and no recruitment plan. The reader passes NONE of them rather than
   * passing false, so the manifest reports those requirements as undetermined
   * and names the field that would settle each. Passing false would have read
   * as "this study does not run under an IND" — a claim nobody made.
   */
  it('leaves the flag-gated requirements undetermined, with a settling field named', async () => {
    const irbId = await seedIrb({ submissionId: 500 });

    const out = await getPackageManifest(ORG, irbId);
    const undecided = out.manifest.rows.filter((r) => r.requirement === 'undetermined');

    expect(undecided.map((r) => r.slot).sort()).toEqual([
      'irb.assent',
      'irb.financial-disclosure',
      'irb.form-1572',
      'irb.hipaa-authorization',
      'irb.recruitment-material',
    ]);
    for (const r of undecided) expect(r.settledBy).toBeTruthy();
    expect(out.manifest.counts.undetermined).toBe(5);
  });

  it('carries the recorded risk level through, so the monitoring plan IS decided', async () => {
    const irbId = await seedIrb({ submissionId: 500, riskLevel: 'greater_than_minimal' });

    const out = await getPackageManifest(ORG, irbId);
    const row = out.manifest.rows.find((r) => r.slot === 'irb.safety-monitoring-plan');

    expect(row?.requirement).toBe('conditional');
  });

  it('carries a requested consent waiver through as still requiring consent', async () => {
    const irbId = await seedIrb({ submissionId: 500, waiver: true });

    const out = await getPackageManifest(ORG, irbId);
    const row = out.manifest.rows.find((r) => r.slot === 'irb.consent');

    expect(row?.requirement).toBe('required');
    expect(row?.basis).toMatch(/not a waiver granted/);
  });
});
