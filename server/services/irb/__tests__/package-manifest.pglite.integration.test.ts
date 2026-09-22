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
CREATE TABLE irb_submissions (id serial PRIMARY KEY, organization_id int NOT NULL, submission_id int, protocol_number text, title text, review_type text, risk_level text NOT NULL DEFAULT 'minimal', involves_vulnerable_populations boolean NOT NULL DEFAULT false, consent_waiver_requested boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'draft', deleted_at timestamptz,
  /* The four package-manifest facts, exactly as
     migrations/20260922d_irb_submission_context.sql declares them: nullable,
     NO DEFAULT. The catalog shape itself is pinned against the real migration
     file in submission-context-columns.pglite.integration.test.ts; what this
     file proves is that a NULL here survives the READER and arrives at the
     manifest as undetermined rather than as false. */
  involves_children boolean, is_ind_study boolean, uses_phi boolean, uses_recruitment_material boolean);
CREATE TABLE ectd_sequences (id serial PRIMARY KEY, submission_id int NOT NULL, organization_id int NOT NULL, region text, sequence_number text, status text DEFAULT 'draft', deleted_at timestamptz);
CREATE TABLE submission_leaves (id serial PRIMARY KEY, sequence_id int NOT NULL, section_code text NOT NULL, title text NOT NULL, document_table text, document_id int, document_uuid uuid, deleted_at timestamptz);
`;

/**
 * Seed a submission. Every context fact defaults to ABSENT here, and absent is
 * written as SQL NULL — `?? null`, never `=== true`. Writing false for an
 * unmentioned fact would make this helper itself the defect the manifest
 * exists to prevent, and every "undetermined" assertion below would pass for
 * the wrong reason.
 */
async function seedIrb(over: Record<string, unknown> = {}): Promise<number> {
  const r = await pool.query(
    `INSERT INTO irb_submissions (organization_id, submission_id, protocol_number, title, risk_level, consent_waiver_requested,
                                  involves_children, is_ind_study, uses_phi, uses_recruitment_material)
     VALUES ($1,$2,'P-1','A study',$3,$4,$5,$6,$7,$8) RETURNING id`,
    [over.org ?? ORG, over.submissionId ?? null, over.riskLevel ?? 'minimal', over.waiver ?? false,
      over.involvesChildren ?? null, over.isIndStudy ?? null, over.usesPhi ?? null, over.usesRecruitmentMaterial ?? null],
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

const GATED_SLOTS = [
  'irb.assent',
  'irb.financial-disclosure',
  'irb.form-1572',
  'irb.hipaa-authorization',
  'irb.recruitment-material',
] as const;

/** Every fact answered "yes", which is the most demanding package a board asks for. */
const ALL_RECORDED_TRUE = {
  involvesChildren: true,
  isIndStudy: true,
  usesPhi: true,
  usesRecruitmentMaterial: true,
} as const;

describe('what the submission does not record stays undecided', () => {
  /*
   * `migrations/20260922d_irb_submission_context.sql` made these four facts
   * RECORDABLE. It did not make them recorded, and the distinction is the
   * point: a NULL column must arrive at the manifest as absent, so the
   * requirement reports `undetermined` and names the field that would settle
   * it. The reader's `?? null` is what carries that; a `Boolean(...)` or
   * `=== true` there would read an unanswered column as "this study does not
   * run under an IND" — a claim nobody made, and the one a board would be
   * misled by.
   *
   * This was the state of EVERY submission before that migration, and it is
   * still the state of every submission nobody has answered.
   */
  it('leaves the flag-gated requirements undetermined, with a settling field named', async () => {
    const irbId = await seedIrb({ submissionId: 500 });

    const out = await getPackageManifest(ORG, irbId);
    const undecided = out.manifest.rows.filter((r) => r.requirement === 'undetermined');

    expect(undecided.map((r) => r.slot).sort()).toEqual([...GATED_SLOTS]);
    for (const r of undecided) expect(r.settledBy).toBeTruthy();
    expect(out.manifest.counts.undetermined).toBe(5);
  });

  it('leaves a fact still absent undetermined even when its neighbours are answered', async () => {
    /* The partial answer is the realistic case and the one a coercing reader
       gets wrong most quietly: three facts recorded, one not. */
    const irbId = await seedIrb({ submissionId: 500, involvesChildren: false, isIndStudy: true, usesPhi: true });

    const out = await getPackageManifest(ORG, irbId);
    const undecided = out.manifest.rows.filter((r) => r.requirement === 'undetermined');

    expect(undecided.map((r) => r.slot)).toEqual(['irb.recruitment-material']);
    expect(undecided[0]?.settledBy).toBe('usesRecruitmentMaterial');
  });
});

describe('a RECORDED fact decides the requirement', () => {
  it('recorded true makes each gated slot conditional-required', async () => {
    const irbId = await seedIrb({ submissionId: 500, ...ALL_RECORDED_TRUE });

    const out = await getPackageManifest(ORG, irbId);

    for (const slot of GATED_SLOTS) {
      const row = out.manifest.rows.find((r) => r.slot === slot);
      expect(row?.requirement, slot).toBe('conditional');
      expect(row?.settledBy, slot).toBeUndefined();
    }
    expect(out.manifest.counts.undetermined).toBe(0);
    expect(out.manifest.counts.conditional).toBeGreaterThanOrEqual(5);
  });

  it('recorded false decides it the other way — not_required, not undetermined', async () => {
    const irbId = await seedIrb({
      submissionId: 500,
      involvesChildren: false,
      isIndStudy: false,
      usesPhi: false,
      usesRecruitmentMaterial: false,
    });

    const out = await getPackageManifest(ORG, irbId);

    for (const slot of GATED_SLOTS) {
      const row = out.manifest.rows.find((r) => r.slot === slot);
      expect(row?.requirement, slot).toBe('not_required');
      /* The basis must cite the RECORD, not the absence of one. */
      expect(row?.basis, slot).toMatch(/This submission records/);
      expect(row?.basis, slot).not.toMatch(/could not be decided/);
    }
    expect(out.manifest.counts.undetermined).toBe(0);
  });

  it('a false and a true on the same submission are two different answers', async () => {
    const irbId = await seedIrb({
      submissionId: 500,
      involvesChildren: true,
      isIndStudy: false,
      usesPhi: true,
      usesRecruitmentMaterial: false,
    });

    const out = await getPackageManifest(ORG, irbId);
    const req = (slot: string) => out.manifest.rows.find((r) => r.slot === slot)?.requirement;

    expect(req('irb.assent')).toBe('conditional');
    expect(req('irb.form-1572')).toBe('not_required');
    expect(req('irb.financial-disclosure')).toBe('not_required');
    expect(req('irb.hipaa-authorization')).toBe('conditional');
    expect(req('irb.recruitment-material')).toBe('not_required');
  });
});

describe('readyToAssemble is reachable', () => {
  /*
   * Before the context columns existed, NO submission could reach this: five
   * requirements were undetermined on every row and `readyToAssemble` requires
   * `counts.undetermined === 0`. A gate nothing can pass tells a sponsor
   * nothing. These two tests are the proof that the ceiling is gone — and the
   * one after them is the proof that the ceiling was load-bearing, not
   * removed.
   */
  async function everySlotPlaced(irbId: number, submissionId: number): Promise<void> {
    const seq = await seedSequence(submissionId);
    const out = await getPackageManifest(ORG, irbId);
    for (const row of out.manifest.rows) {
      if (row.requirement === 'required' || row.requirement === 'conditional') await seedLeaf(seq, row.slot);
    }
  }

  it('reaches true with every fact recorded and every demanded slot placed', async () => {
    const irbId = await seedIrb({ submissionId: 500, riskLevel: 'greater_than_minimal', ...ALL_RECORDED_TRUE });
    await everySlotPlaced(irbId, 500);

    const out = await getPackageManifest(ORG, irbId);

    expect(out.manifest.counts.undetermined).toBe(0);
    expect(out.manifest.counts.unresolvable).toBe(0);
    expect(out.manifest.counts.required).toBe(out.manifest.counts.requiredSatisfied);
    expect(out.manifest.counts.conditional).toBe(out.manifest.counts.conditionalSatisfied);
    expect(out.manifest.readyToAssemble).toBe(true);
  });

  it('reaches true on a recorded-false package WITHOUT the slots that false excused', async () => {
    const irbId = await seedIrb({
      submissionId: 500,
      riskLevel: 'minimal',
      involvesChildren: false,
      isIndStudy: false,
      usesPhi: false,
      usesRecruitmentMaterial: false,
    });
    await everySlotPlaced(irbId, 500);

    const out = await getPackageManifest(ORG, irbId);
    const placedSlots = out.manifest.rows.filter((r) => r.placed.length > 0).map((r) => r.slot);

    expect(out.manifest.readyToAssemble).toBe(true);
    /* The recorded "no" genuinely took them out of the package, rather than
       being satisfied by a document quietly placed at them anyway. */
    for (const slot of GATED_SLOTS) expect(placedSlots, slot).not.toContain(slot);
  });

  it('is blocked again by a single fact going back to NOT RECORDED', async () => {
    /* The retraction case, and the fail-first proof for the two above: the
       ONLY difference from the first test is one column set back to NULL. */
    const irbId = await seedIrb({ submissionId: 500, riskLevel: 'greater_than_minimal', ...ALL_RECORDED_TRUE });
    await everySlotPlaced(irbId, 500);
    expect((await getPackageManifest(ORG, irbId)).manifest.readyToAssemble).toBe(true);

    await pool.query(`UPDATE irb_submissions SET is_ind_study = NULL WHERE id = $1`, [irbId]);

    const out = await getPackageManifest(ORG, irbId);
    expect(out.manifest.counts.undetermined).toBe(2); // the 1572 and the financial disclosure
    expect(out.manifest.readyToAssemble).toBe(false);
  });
});

describe('the rest of the recorded context still carries through', () => {
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
