/**
 * AnA's review_irb_submission reports the approval lifecycle three-valued and
 * says which checks ran.
 *
 * It used to attach continuingReviewStatus, which answers "continuing review not
 * required, not expired" when the review type or the approval date is not
 * recorded, and to end every non-critical result with "Submission passes the
 * deterministic 45 CFR 46.111 gate (<risk> risk)": for a medium result with an
 * open major finding, and for a low one where only four checks ran (the other
 * 46.111 criteria are the board's). It now reads irb/lifecycle.ts, as
 * GET /api/irb/submissions/:id/completeness already does, and names the checks
 * that ran and the ones that could not.
 *
 * Real creating migrations on PGlite, real reader, real handler.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;

const query = async (sql: string, params?: unknown[]) => {
  const r = await pglite.query(sql, params as unknown[]);
  return { rows: r.rows as any[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
};

vi.mock('../../../db', () => {
  const pool = {
    query: (s: string, p?: unknown[]) => query(s, p),
    connect: async () => ({ query: (s: string, p?: unknown[]) => query(s, p), release: () => undefined }),
  };
  return { pool, getPool: () => pool, db: {} };
});

import { getToolHandler } from '../AnaToolExecutor';

const ORG = 7;
const USER = 3;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const migration = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    CREATE TABLE submissions (id serial PRIMARY KEY);
    INSERT INTO organizations (id) VALUES (${ORG});
    INSERT INTO users (id) VALUES (${USER});
  `);
  await pglite.exec(migration('migrations/20260610_irb_submissions.sql'));
  await pglite.exec(migration('migrations/20260922d_irb_submission_context.sql'));
}, 60_000);

beforeEach(async () => {
  await pglite.exec('TRUNCATE irb_consent_documents, irb_sites, irb_reportable_events, irb_amendments, irb_submissions RESTART IDENTITY CASCADE;');
});

async function submission(over: { status?: string; reviewType?: string | null; riskLevel?: string; vulnerable?: boolean | null; sites?: number }): Promise<number> {
  const r = await pglite.query<{ id: number }>(
    `INSERT INTO irb_submissions (organization_id, protocol_number, title, created_by, status, review_type, risk_level, involves_vulnerable_populations)
     VALUES ($1, 'P-1', 'A study', $2, $3, $4, $5, $6) RETURNING id`,
    [ORG, USER, over.status ?? 'draft', over.reviewType ?? null, over.riskLevel ?? 'minimal', over.vulnerable === undefined ? false : over.vulnerable],
  );
  const id = r.rows[0].id;
  await pglite.query(
    `INSERT INTO irb_consent_documents (organization_id, irb_submission_id, document_name, version, created_by) VALUES ($1, $2, 'ICF', '1.1', $3)`,
    [ORG, id, USER],
  );
  for (let i = 0; i < (over.sites ?? 1); i++) {
    await pglite.query(`INSERT INTO irb_sites (organization_id, irb_submission_id, site_name, created_by) VALUES ($1, $2, $3, $4)`, [ORG, id, `Site ${i + 1}`, USER]);
  }
  return id;
}

async function review(id: number): Promise<Record<string, any>> {
  return JSON.parse(await getToolHandler('review_irb_submission')!({ irb_submission_id: id }, { organizationId: ORG } as never));
}

describe('review_irb_submission', () => {
  it('reads the lifecycle three-valued: an approval with no date on record is undetermined, not current', async () => {
    const out = await review(await submission({ status: 'approved', reviewType: 'full_board' }));
    expect(out.lifecycle?.approval).toBe('unknown');
    expect(out.lifecycle.undetermined).toBe(true);
    expect(out.lifecycle.findings.map((f: { code: string }) => f.code)).toContain('IRB-LC-001');
    expect(out.continuingReview).toBeUndefined();
    expect(out.message).toMatch(/approval status undetermined/i);
  });

  it('with nothing found, names the checks that ran and does not call it a 46.111 pass', async () => {
    const out = await review(await submission({}));
    expect(out.findings).toEqual([]);
    expect(out.message).not.toMatch(/passes/i);
    expect(out.message).toMatch(/No findings among the checks run/);
    expect(out.message).toMatch(/46\.111\(b\)/);
    expect(out.message).toMatch(/not evaluated/);
    expect(out.checksRun).toHaveLength(4);
  });

  it('a medium result with an open major finding is stated as not passing', async () => {
    const out = await review(await submission({ sites: 3 }));
    expect(out.riskLevel).toBe('medium');
    expect(out.message).not.toMatch(/passes/i);
    expect(out.message).toMatch(/1 finding \(1 major\), risk medium — does not pass/);
  });

  it('an unanswered vulnerable-populations question is reported as not assessed', async () => {
    const out = await review(await submission({ vulnerable: null }));
    expect(out.riskLevel).toBe('undetermined');
    expect(out.notAssessed.join(' ')).toMatch(/vulnerable/i);
    expect(out.message).toMatch(/Not assessed: .*vulnerable/i);
  });
});
