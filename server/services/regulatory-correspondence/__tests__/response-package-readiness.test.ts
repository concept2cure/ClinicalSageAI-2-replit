/**
 * The response package: what it is built FROM, and what its readiness claims.
 *
 * Two defects measured on 2026-09-20, both invisible behind an `as any`:
 *
 * 1. `POST /response-packages` passed `SELECT * FROM c2c_correspondence_issues`
 *    into the compiler unmapped. The row is snake_case, the contract camelCase,
 *    so `mappedCtdSections` and `mappedArtifactIds` read `undefined` and every
 *    package ever compiled carried an EMPTY issue matrix — while the data to
 *    fill it sat in the row being passed.
 *
 * 2. `evidenceChecklist` set `status: 'missing' as const`, so `unresolvedGaps`
 *    was always the whole list and `readinessState` was always `evidence_gap`.
 *    Three of the five declared states were unreachable, and the one case that
 *    escaped — no issues at all — reported `review_ready`: nothing assessed,
 *    reported ready for review.
 */
import { afterAll, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from '../../../../shared/schema';
import type { RequestDb } from '../../../db/requestDb';
import type { CorrespondenceIssue } from '@shared/types/regulatory-correspondence';
import { runGovernedIssueParser } from '../issue-parser';
import { computeCorrespondenceIssueImpact, synchronizeReviewedCorrespondenceIssueImpact, createCanonicalTasksForIssue } from '../operating-layer';
vi.mock('../../../db', () => ({ db: {} }));

import { compileGovernedResponseAssembly } from '../response-package-compiler';
import {
  issueRowToCorrespondenceIssue,
  issueRowsToCorrespondenceIssues,
  type CorrespondenceIssueRow,
} from '../issue-row-mapper';

/** Exactly what `SELECT *` returns for one issue. */
function row(over: Partial<CorrespondenceIssueRow> = {}): CorrespondenceIssueRow {
  return {
    id: 'i1',
    correspondence_id: 'c1',
    category: 'nonclinical_issue',
    subcategory: 'biocompatibility',
    severity: 'high',
    blocker: true,
    response_required: true,
    source_excerpt: 'Your biocompatibility evaluation…',
    confidence: '0.7800',
    human_review_status: 'confirmed',
    due_date: null,
    mapped_ctd_sections: ['E1'],
    mapped_artifact_ids: ['art-1'],
    owner_user_id: 5,
    resolution_status: 'open',
    structured_extraction: {
      regulatorAskType: 'biocompatibility_evidence',
      impactedSubmissionComponent: 'nonclinical_testing',
      sectionCandidates: ['E1'],
      recommendedOwnerFunction: 'nonclinical',
      recommendedResponsePackageType: 'nonclinical_evidence_response',
      evidenceNeeds: ['ISO 10993 endpoint matrix'],
      confidenceTrace: [{ signal: 'rule_match', score: 0.6, deterministic: true }],
      humanReviewRequired: true,
    },
    ...over,
  };
}

describe('the DB row reaches the compiler as the contract it declares', () => {
  it('carries the section keys the row holds', () => {
    const issue = issueRowToCorrespondenceIssue(row());
    expect(issue.mappedCtdSections).toEqual(['E1']);
    expect(issue.mappedArtifactIds).toEqual(['art-1']);
  });

  it('carries the structured extraction, including the real evidence needs', () => {
    const issue = issueRowToCorrespondenceIssue(row());
    expect(issue.structuredExtraction?.evidenceNeeds).toEqual(['ISO 10993 endpoint matrix']);
    expect(issue.structuredExtraction?.sectionCandidates).toEqual(['E1']);
  });

  it('carries the device topic the parser named', () => {
    expect(issueRowToCorrespondenceIssue(row()).subcategory).toBe('biocompatibility');
  });

  it('reads numeric confidence out of the NUMERIC column the driver returns as text', () => {
    expect(issueRowToCorrespondenceIssue(row()).confidence).toBeCloseTo(0.78, 4);
  });

  it('survives jsonb arriving as text rather than parsed', () => {
    const issue = issueRowToCorrespondenceIssue(
      row({ mapped_ctd_sections: '["E1","E3"]' as unknown as string[] }),
    );
    expect(issue.mappedCtdSections).toEqual(['E1', 'E3']);
  });

  it('a malformed jsonb column is no sections, never a throw', () => {
    const issue = issueRowToCorrespondenceIssue(
      row({ mapped_ctd_sections: '{not json' as unknown as string[] }),
    );
    expect(issue.mappedCtdSections).toEqual([]);
  });

  it('a row written before the column existed reports NO extraction, not an empty one', () => {
    /* The column defaults to `{}`. Returning an object of empty strings would
       read as an extraction that was recorded and said nothing. */
    const issue = issueRowToCorrespondenceIssue(row({ structured_extraction: {} }));
    expect(issue.structuredExtraction).toBeUndefined();
  });

  it('the compiled matrix is not empty — the defect this mapper exists for', () => {
    const compiled = compileGovernedResponseAssembly({
      correspondenceId: 'c1',
      issues: issueRowsToCorrespondenceIssues([row()]),
    });
    expect(compiled.impactedSections).toEqual(['E1']);
    expect(compiled.issueMatrix[0].sectionKeys).toEqual(['E1']);
    // And the checklist names the regulator's actual ask, not the fallback.
    expect(compiled.evidenceChecklist[0].item).toContain('ISO 10993 endpoint matrix');
    expect(compiled.evidenceChecklist[0].item).not.toContain('Issue evidence attachment');
  });
});

// Actual Postgres statements and transaction rollback qualify the derived
// publishing blocker. No blocker write, source loader or mapper is mocked.
const letterText = 'Required stability data are missing for the drug product.';
let pg: PGlite;
let executor: RequestDb;
let currentIssue: CorrespondenceIssue;
const impactInput = () => ({ orgId: 2, projectId: 7, submissionId: 'sub-1', correspondenceId: 'corr-1', issue: currentIssue });
const blockers = async () => (await pg.query<{ id: number; org_id: number; project_id: number; blocker_type: string; status: string; package_db_id: number | null }>('SELECT id,org_id,project_id,blocker_type,status,package_db_id FROM c2c_blockers ORDER BY id')).rows;

async function saveIssue(issue: CorrespondenceIssue = currentIssue) {
  currentIssue = issue;
  await pg.query('UPDATE c2c_correspondence_issues SET human_review_status=$1,resolution_status=$2,source_excerpt=$3,structured_extraction=$4::jsonb WHERE id=$5',
    [issue.humanReviewStatus, issue.resolutionStatus, issue.sourceExcerpt, JSON.stringify(issue.structuredExtraction), issue.id]);
}
async function reviewed(status: CorrespondenceIssue['humanReviewStatus'] = 'confirmed') {
  const issue = globalThis.structuredClone(currentIssue);
  issue.humanReviewStatus = status;
  const extraction = issue.structuredExtraction!;
  extraction.feedbackCoding!.humanConfirmed = status === 'confirmed' || status === 'edited';
  extraction.humanReview = { reviewedBy: 11, reviewedAt: '2026-11-06T10:00:00.000Z', sourceTextDigest: extraction.sourceTextDigest!, status };
  await saveIssue(issue);
}
const sync = () => synchronizeReviewedCorrespondenceIssueImpact(impactInput(), executor);

beforeAll(async () => {
  pg = new PGlite();
  // Bridge only the pg driver's query protocol. Generic result rows stay typed;
  // Drizzle's array-row decoding is exercised against actual PGlite results.
  const client = { async query(config: string | { text: string; rowMode?: string }, params?: unknown[]) {
    const result = await pg.query<Record<string, unknown>>(typeof config === 'string' ? config : config.text, params);
    return { rows: typeof config === 'object' && config.rowMode === 'array' ? result.rows.map(Object.values) : result.rows };
  } };
  executor = drizzle(client as unknown as Pool, { schema });
  await pg.exec(`
    CREATE TABLE c2c_submissions (id TEXT PRIMARY KEY,organization_id INT,project_id INT);
    CREATE TABLE c2c_correspondence (id TEXT PRIMARY KEY,organization_id INT,project_id INT,submission_id TEXT,parsed_text TEXT,direction TEXT);
    CREATE TABLE c2c_correspondence_issues (id TEXT PRIMARY KEY,correspondence_id TEXT,category TEXT,severity TEXT,blocker BOOLEAN,response_required BOOLEAN,source_excerpt TEXT,confidence NUMERIC,human_review_status TEXT,mapped_ctd_sections JSONB,mapped_artifact_ids JSONB,resolution_status TEXT,structured_extraction JSONB);
  `);
  const kit = createRequire(import.meta.url)('drizzle-kit/api') as typeof import('drizzle-kit/api');
  const tables = { c2cBlockers: schema.c2cBlockers, c2cProjectWorkItems: schema.c2cProjectWorkItems,
    c2cSubmissionPackages: schema.c2cSubmissionPackages, c2cPackageSections: schema.c2cPackageSections };
  // Use the actual stored columns/defaults; unrelated domain FK targets are
  // outside this fixture. Tenant ownership is proved by the real source join.
  for (const statement of await kit.generateMigration(kit.generateDrizzleJson({}), kit.generateDrizzleJson(tables))) {
    if (/^CREATE TABLE/.test(statement)) await pg.exec(statement);
  }
}, 60_000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  await pg.exec('TRUNCATE c2c_blockers,c2c_correspondence_issues,c2c_correspondence,c2c_submissions,c2c_submission_packages,c2c_package_sections,c2c_project_work_items RESTART IDENTITY');
  currentIssue = runGovernedIssueParser(letterText, 'corr-1').issues.find(issue => issue.blocker)!;
  expect(currentIssue).toBeDefined();
  await pg.exec("INSERT INTO c2c_submissions VALUES ('sub-1',2,7)");
  await pg.query("INSERT INTO c2c_correspondence VALUES ('corr-1',2,7,'sub-1',$1,'inbound')", [letterText]);
  await pg.query(`INSERT INTO c2c_correspondence_issues VALUES ($1,'corr-1',$2,$3,$4,TRUE,$5,0.78,$6,$7::jsonb,'[]',$8,$9::jsonb)`,
    [currentIssue.id,currentIssue.category,currentIssue.severity,currentIssue.blocker,currentIssue.sourceExcerpt,currentIssue.humanReviewStatus,JSON.stringify(currentIssue.mappedCtdSections),currentIssue.resolutionStatus,JSON.stringify(currentIssue.structuredExtraction)]);
  await pg.exec("INSERT INTO c2c_submission_packages(package_id,org_id,project_id,package_family,title) VALUES ('pkg-1',2,7,'nda','Current active submission'); INSERT INTO c2c_package_sections(section_id,org_id,package_db_id,section_key,section_label) VALUES ('sec-1',2,1,'3.2.S','CMC')");
});

describe('correspondence-derived publishing blockers follow current human review', () => {
  it.each(['outbound', 'internal'])('closes a historical own blocker when the letter is %s', async direction => {
    await reviewed(); await sync();
    expect((await blockers()).map(b => b.status)).toEqual(['open']);
    await pg.query('UPDATE c2c_correspondence SET direction=$1', [direction]);
    expect(await sync()).toMatchObject({ blockerOpened: false, readinessPenalty: 0 });
    expect((await blockers()).map(b => b.status)).toEqual(['resolved']);
  });
  it('intake proposals create triage work without a publishing blocker or readiness penalty', async () => {
    expect(await computeCorrespondenceIssueImpact(impactInput(), executor)).toMatchObject({ blockerOpened: false, readinessPenalty: 0 });
    const tasks = await createCanonicalTasksForIssue({ orgId: 2,projectId: 7,issue: currentIssue,ownerUserId: 11,ownerName: 'Reviewer',linkedSectionKeys: [] }, executor);
    expect(tasks[0]).toMatchObject({ blockerImpact: 'none' });
    expect(tasks[0].taskType).not.toBe('publish_gate_remediation');
    expect(await blockers()).toEqual([]);
    expect((await pg.query<{ blocker_type: string | null }>('SELECT blocker_type FROM c2c_project_work_items')).rows[0].blocker_type).toBeNull();
  });
  it('opens once for a current confirmed objective issue, closes on resolution, and reopens the same row', async () => {
    await reviewed();
    expect(await sync()).toMatchObject({ blockerOpened: true, readinessPenalty: 15 });
    expect(await sync()).toMatchObject({ blockerOpened: false });
    const [first] = await blockers();
    await saveIssue({ ...currentIssue, resolutionStatus: 'resolved' });
    await sync();
    expect(await blockers()).toEqual([{ ...first, status: 'resolved' }]);
    await saveIssue({ ...currentIssue, resolutionStatus: 'open' });
    expect(await sync()).toMatchObject({ blockerOpened: true });
    expect(await blockers()).toEqual([first]);
  });
  it.each(['pending','rejected'] as const)('clears historical orphan blockers after %s while preserving other scope/type', async status => {
    await pg.query(`INSERT INTO c2c_blockers(blocker_id,org_id,project_id,package_db_id,blocker_type,title,status) VALUES
      ('own',2,7,1,'regulatory_correspondence_issue',$1,'open'),('duplicate',2,7,NULL,'regulatory_correspondence_issue',$1,'open'),
      ('foreign',3,7,1,'regulatory_correspondence_issue',$1,'open'),('otherproject',2,8,1,'regulatory_correspondence_issue',$1,'open'),('otherkind',2,7,1,'validation_error',$1,'open')`, [`Regulatory issue ${currentIssue.id}`]);
    await reviewed(status); await sync();
    expect((await blockers()).map(b => b.status)).toEqual(['resolved','resolved','open','open','open']);
  });
  it.each(['waived','resolved'] as const)('clears an accepted blocker when the issue becomes %s', async resolutionStatus => {
    await reviewed(); await sync(); await saveIssue({ ...currentIssue, resolutionStatus }); await sync();
    expect((await blockers()).map(b => b.status)).toEqual(['resolved']);
  });
  it.each(['subjective','unclassified'] as const)('a human-confirmed %s issue never becomes an objective publish gate', async register => {
    const text = register === 'subjective' ? 'Stability data presentation needs clearer organization.' : 'Stability data are supplied for review.';
    const parsed = runGovernedIssueParser(text, 'corr-1').issues.find(issue => issue.blocker)!;
    parsed.id = currentIssue.id; await saveIssue(parsed);
    await pg.query('UPDATE c2c_correspondence SET parsed_text=$1', [text]); await reviewed();
    expect(currentIssue.structuredExtraction?.feedbackCoding?.register).toBe(register);
    expect(await sync()).toMatchObject({ blockerOpened: false, readinessPenalty: 0 });
    expect(await blockers()).toEqual([]);
  });
  it.each(['source_changed','span_changed','review_digest','missing_actor','missing_review','forged_coding'] as const)('does not gate from invalid/stale evidence: %s', async failure => {
    await reviewed(); await sync();
    const extraction = currentIssue.structuredExtraction!;
    if (failure === 'source_changed') await pg.query('UPDATE c2c_correspondence SET parsed_text=$1', [`${letterText} Revised.`]);
    if (failure === 'span_changed') extraction.evidenceSpan!.text = 'Fabricated missing data';
    if (failure === 'review_digest') extraction.humanReview!.sourceTextDigest = '0'.repeat(64);
    if (failure === 'missing_actor') extraction.humanReview!.reviewedBy = 0;
    if (failure === 'missing_review') delete extraction.humanReview;
    if (failure === 'forged_coding') extraction.feedbackCoding!.deficiencyClass = 'presentation_expectation';
    await saveIssue();
    expect(await sync()).toMatchObject({ blockerOpened: false, readinessPenalty: 0 });
    expect((await blockers()).map(b => b.status)).toEqual(['resolved']);
  });
  it('uses the stored review rather than a caller claiming confirmation and refuses foreign ownership', async () => {
    const original = globalThis.structuredClone(currentIssue); await reviewed(); const forged = globalThis.structuredClone(currentIssue); await saveIssue(original);
    expect(await synchronizeReviewedCorrespondenceIssueImpact({ ...impactInput(), issue: forged }, executor)).toMatchObject({ blockerOpened: false });
    expect(await synchronizeReviewedCorrespondenceIssueImpact({ ...impactInput(), orgId: 3 }, executor)).toMatchObject({ blockerOpened: false });
    await pg.exec('UPDATE c2c_submissions SET project_id=8'); await reviewed();
    expect(await sync()).toMatchObject({ blockerOpened: false }); expect(await blockers()).toEqual([]);
  });
  it('rolls the derived blocker back with a refused review audit in the caller transaction', async () => {
    await pg.exec('BEGIN'); await reviewed(); await sync();
    expect((await blockers()).map(b => b.status)).toEqual(['open']);
    await expect(pg.exec("CREATE TEMP TABLE refusal (allowed BOOLEAN CHECK(allowed)); INSERT INTO refusal VALUES (FALSE)")).rejects.toThrow();
    await pg.exec('ROLLBACK');
    expect(await blockers()).toEqual([]);
    expect((await pg.query<{ human_review_status: string }>('SELECT human_review_status FROM c2c_correspondence_issues')).rows[0].human_review_status).toBe('pending');
  });
});

describe('readinessState is computed, and every state it claims is reachable', () => {
  const issue = (over: Partial<CorrespondenceIssue> = {}): CorrespondenceIssue =>
    issueRowToCorrespondenceIssue(row()) && { ...issueRowToCorrespondenceIssue(row()), ...over };

  const state = (issues: CorrespondenceIssue[], revisedArtifactIds?: string[]) =>
    compileGovernedResponseAssembly({ correspondenceId: 'c1', issues, revisedArtifactIds })
      .readinessState;

  it('nothing assessed is a DRAFT, not ready for review', () => {
    /* The old rule was `gaps > 0 ? evidence_gap : review_ready`, and with no
       issues there are no gaps — so an empty package reported itself ready. */
    expect(state([])).toBe('draft');
  });

  it('an extraction no person has confirmed is a draft', () => {
    expect(state([issue({ humanReviewStatus: 'pending', resolutionStatus: 'resolved' })], ['a'])).toBe(
      'draft',
    );
  });

  it('a confirmed but unresolved issue is an evidence gap', () => {
    expect(state([issue({ resolutionStatus: 'open' })], ['a'])).toBe('evidence_gap');
    expect(state([issue({ resolutionStatus: 'in_progress' })], ['a'])).toBe('evidence_gap');
  });

  it('all issues closed but nothing actually revised is still a gap', () => {
    expect(state([issue({ resolutionStatus: 'resolved', mappedArtifactIds: [] })], [])).toBe(
      'evidence_gap',
    );
  });

  it('closed, confirmed and revised is review_ready — the state that was unreachable', () => {
    expect(state([issue({ resolutionStatus: 'resolved' })], ['art-1'])).toBe('review_ready');
    expect(state([issue({ resolutionStatus: 'waived' })], ['art-1'])).toBe('review_ready');
  });

  it('one open issue among several holds the whole package back', () => {
    expect(
      state(
        [
          issue({ id: 'a', resolutionStatus: 'resolved' }),
          issue({ id: 'b', resolutionStatus: 'in_progress' }),
        ],
        ['art-1'],
      ),
    ).toBe('evidence_gap');
  });

  it('doing the work MOVES the signal — it is not a constant', () => {
    const open = state([issue({ resolutionStatus: 'open' })], ['art-1']);
    const done = state([issue({ resolutionStatus: 'resolved' })], ['art-1']);
    expect(open).not.toBe(done);
  });

  it('the checklist reflects the human decision, per item', () => {
    const c = compileGovernedResponseAssembly({
      correspondenceId: 'c1',
      issues: [
        issue({ id: 'a', resolutionStatus: 'resolved' }),
        issue({ id: 'b', resolutionStatus: 'open' }),
      ],
    });
    const byIssue = Object.fromEntries(
      c.evidenceChecklist.map((e) => [e.item.split(':')[0], e.status]),
    );
    expect(byIssue.a).toBe('satisfied');
    expect(byIssue.b).toBe('missing');
  });

  it('never claims approval_ready or send_ready from compilation alone', () => {
    /* Those are downstream governance states — something approved, something
       dispatched. Compiling a package is neither, and asserting them here would
       assert an approval nobody gave. */
    for (const s of [
      state([]),
      state([issue({ resolutionStatus: 'resolved' })], ['art-1']),
      state([issue({ resolutionStatus: 'open' })]),
    ]) {
      expect(['draft', 'evidence_gap', 'review_ready']).toContain(s);
    }
  });
});
