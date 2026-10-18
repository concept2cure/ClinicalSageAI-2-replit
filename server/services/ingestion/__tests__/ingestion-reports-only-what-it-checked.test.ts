/**
 * Ingestion reports only what it checked: no model confidence as a figure, no
 * unverified locator counted, no count string as a locator, no unchecked section.
 *
 * What the code used to do:
 *   - classifyDocument returned the model's own `confidence` — cast from its
 *     JSON, unvalidated — as the classification's confidence, and wrote it into
 *     the AI_GENERATE audit row under that name. The same file says a figure a
 *     model reports about itself "is not evidence of anything".
 *   - It returned, audited and proposed as a leaf whatever `sectionCode` the
 *     model wrote, without checking it names a CTD section.
 *   - extractStructure stored submission_evidence_links.confidence as the share
 *     of claims for which the model supplied a non-empty locator string — never
 *     looked for in the document — and source_locator as "N claim(s), M
 *     source(s)", a count, not a locator.
 *   - It wrote the caller's section code to target_section_code unchecked.
 *
 * Now: the model's number is `modelStatedConfidence` with basis
 * 'model_self_report' (null unless a number in [0, 1]); a section the model
 * proposes that is not a CTD section is refused by name; a locator counts only
 * when it is found in the text that was read; the document-level link carries no
 * locator; and an extract section code is judged against the submission's own
 * vocabulary (validateSectionCode, as upsertLeaf judges a placement).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const holder = vi.hoisted(() => ({
  modelAnswer: {} as Record<string, unknown>,
  /** Rows returned by successive `.limit()` reads, in order. */
  reads: [] as unknown[][],
  inserted: [] as Record<string, unknown>[],
  logAction: null as any,
  route: null as any,
}));

vi.mock('../../../db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => holder.reads.shift() ?? [] }) }),
    }),
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        holder.inserted.push(v);
      },
    }),
  },
}));
vi.mock('../../auditService', () => {
  holder.logAction = vi.fn(async () => ({ persisted: true }));
  return { default: { logAction: (...a: unknown[]) => holder.logAction(...a) } };
});
vi.mock('../../ai-gateway', () => {
  holder.route = vi.fn(async () => ({ content: JSON.stringify(holder.modelAnswer) }));
  return { getGateway: () => ({ route: (...a: unknown[]) => holder.route(...a) }) };
});

import { classifyDocument, extractStructure, IngestionError } from '../ingestion-service';

const ORG = 7;
const USER = 3;
const DOC_TEXT =
  '<h1>2.5 Clinical Overview</h1><h2>Efficacy Results</h2><p>The primary endpoint was met.</p>' +
  '<h2>Safety Summary</h2><p>No new signals.</p>';
const doc = { id: 201, organizationId: ORG, title: 'Clinical Overview', content: DOC_TEXT };
const indSubmission = { id: 1, organizationId: ORG, applicationType: 'ind', deletedAt: null };

const auditDetails = (task: string) =>
  holder.logAction.mock.calls.map((c: any[]) => c[0]?.details).filter((d: any) => d?.task === task).pop();

beforeEach(() => {
  holder.reads = [];
  holder.inserted = [];
  holder.logAction.mockClear();
  holder.route.mockClear();
  holder.modelAnswer = {
    sectionCode: '2.5',
    ctdModule: 2,
    granularity: null,
    documentType: 'clinical_overview',
    confidence: 0.97,
    rationale: 'overview',
  };
});

describe('classifyDocument', () => {
  it("labels the model's confidence as its own statement, and returns no `confidence` figure", async () => {
    holder.reads = [[doc]];
    const result = await classifyDocument({ documentId: 201, userId: USER, organizationId: ORG });

    expect(result, "the model's self-reported confidence was returned as the classification's confidence").not.toHaveProperty(
      'confidence',
    );
    expect(result.modelStatedConfidence).toBe(0.97);
    expect(result.confidenceBasis).toBe('model_self_report');
    const details = auditDetails('document-classify');
    expect(details).not.toHaveProperty('confidence');
    expect(details).toMatchObject({ modelStatedConfidence: 0.97, confidenceBasis: 'model_self_report' });
  });

  it.each([[7], ['high'], [null], [undefined]])('a model confidence of %j is not a number in [0, 1]: null', async (stated) => {
    holder.reads = [[doc]];
    holder.modelAnswer = { ...holder.modelAnswer, confidence: stated };
    const result = await classifyDocument({ documentId: 201, userId: USER, organizationId: ORG });
    expect(result.modelStatedConfidence).toBeNull();
  });

  it('refuses a proposed section that names no CTD section, and proposes no leaf under it', async () => {
    holder.reads = [[doc]];
    holder.modelAnswer = { ...holder.modelAnswer, sectionCode: 'Module 2 overview' };
    const result = await classifyDocument({ documentId: 201, userId: USER, organizationId: ORG, sequenceId: 3 });

    expect(result.sectionCode, 'a section code that names no CTD section was returned as the classification').toBeNull();
    expect(result.sectionCodeRefused?.proposed).toBe('Module 2 overview');
    expect(result.sectionCodeRefused?.reason).toMatch(/does not name a CTD section/);
    expect(result.proposedLeaf).toBeUndefined();
    expect(auditDetails('document-classify')).toMatchObject({ sectionCode: null });
  });

  it('never takes a refusal from the model', async () => {
    holder.reads = [[doc]];
    holder.modelAnswer = { ...holder.modelAnswer, sectionCodeRefused: { proposed: 'x', reason: 'model said so' } };
    const result = await classifyDocument({ documentId: 201, userId: USER, organizationId: ORG });
    expect(result.sectionCode).toBe('2.5');
    expect(result.sectionCodeRefused).toBeUndefined();
  });
});

describe('the AI_GENERATE audit row is reported, not discarded', () => {
  // ci:discarded-audit-write: both calls were `await auditService.logAction(...)`
  // with the outcome thrown away, so a lost §11.10(e) row was invisible.
  it('classify and extract return whether their audit row was written', async () => {
    holder.reads = [[doc]];
    const classified = await classifyDocument({ documentId: 201, userId: USER, organizationId: ORG });
    expect(classified.auditTrail).toMatchObject({ persisted: true });

    holder.logAction.mockResolvedValueOnce({ persisted: false, chained: false, tamperProof: false, error: 'db down' });
    holder.reads = [[doc], [indSubmission]];
    holder.modelAnswer = { structure: [], extractedClaims: [], referencedSources: [] };
    const extracted = await extractStructure({
      documentId: 201, sectionCode: '2.5', submissionId: 1, userId: USER, organizationId: ORG,
    });
    expect(extracted.auditTrail, 'a lost audit row was reported as nothing at all').toMatchObject({
      persisted: false,
      code: 'AUDIT_ROW_NOT_PERSISTED',
    });
  });
});

describe('extractStructure', () => {
  it('counts a locator only when it is found in the text read, and stores no count string as a locator', async () => {
    holder.reads = [[doc], [indSubmission]];
    holder.modelAnswer = {
      structure: [{ level: 1, heading: '2.5 Clinical Overview' }],
      extractedClaims: [
        { text: 'The primary endpoint was met.', locator: 'Efficacy Results' },
        { text: 'Response rate 40%.', locator: 'page 14' },
        { text: 'Survival improved.', locator: 'Section 9.9 Long-term Outcomes' },
        { text: 'No new signals.', locator: null },
      ],
      referencedSources: ['Study 101'],
    };
    await extractStructure({ documentId: 201, sectionCode: '2.5', submissionId: 1, userId: USER, organizationId: ORG });

    expect(holder.inserted).toHaveLength(1);
    const link = holder.inserted[0];
    expect(link.confidence, 'a locator string the model wrote was counted without being found in the document').toBe(0.25);
    expect(link.sourceLocator, 'a count string was stored as the source locator').toBeNull();
    expect(link.targetSectionCode).toBe('2.5');
  });

  it("refuses a section code outside the submission's vocabulary before asking the model or writing a link", async () => {
    holder.reads = [[doc], [indSubmission]];
    const attempt = extractStructure({
      documentId: 201,
      sectionCode: 'clinical overview',
      submissionId: 1,
      userId: USER,
      organizationId: ORG,
    });
    await expect(attempt).rejects.toBeInstanceOf(IngestionError);
    await expect(attempt).rejects.toMatchObject({ code: 'INVALID_SECTION_CODE' });
    expect(holder.inserted, 'an unchecked section code was written to target_section_code').toEqual([]);
    expect(holder.route).not.toHaveBeenCalled();
  });
});
