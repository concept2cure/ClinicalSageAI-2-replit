/**
 * Auto-extraction: an approved model writes the extracted evidence, and a
 * failed extraction fails the job.
 *
 * extractTables transcribes table cells that are stored as extracted evidence
 * in concept2cure_artifacts; classifyAndEnrich decides the artifact's document
 * type and CTD sections. Until 2026-09-23 both defaulted to gpt-4o as 'general'
 * requests (no approval check applies), and both swallowed every failure: a
 * model error or unreadable reply was recorded as "0 tables" and documentType
 * 'Other', and the job completed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const S = vi.hoisted(() => ({ chat: vi.fn(), inserts: [] as string[] }));

const SOURCE_TEXT =
  'Table 14.2.1 Primary efficacy. Treatment arm response 42% (n=120). Placebo response 18% (n=118). ' +
  'The difference was statistically significant.';

vi.mock('../../db.js', () => ({
  pool: {
    query: async (sql: string) => {
      if (/SELECT content FROM concept2cure_artifacts/.test(sql)) return { rows: [{ content: SOURCE_TEXT }] };
      if (/^\s*INSERT INTO concept2cure_artifacts/i.test(sql)) {
        S.inserts.push(sql);
        return { rows: [{ id: 7 }] };
      }
      return { rows: [] };
    },
  },
}));
vi.mock('../auditService', () => ({ default: { logAction: async () => undefined } }));
vi.mock('../provenance/artifact-provenance', () => ({ recordArtifactProvenance: async () => undefined }));
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: S.chat } }));

import { getExtractionStatus, queueExtraction } from '../autoExtractionPipeline';

async function runJob() {
  const job = await queueExtraction('art-1', 'csr-excerpt.txt', SOURCE_TEXT.length, 5, 9, 1, { immediate: true });
  await vi.waitFor(() => {
    const s = getExtractionStatus(job.id, 9)?.status;
    expect(s === 'completed' || s === 'failed').toBe(true);
  });
  return getExtractionStatus(job.id, 9)!;
}

const TABLES = { tables: [{ title: 'Primary efficacy', headers: ['Arm', 'ORR'], rows: [['Treatment', '42%']], confidence: 0.9 }] };
const CLASSIFICATION = { metadata: { documentType: 'CSR', submissionModule: 'M5' }, sections: [], entities: [] };

function replies(...contents: string[]) {
  let i = 0;
  S.chat.mockImplementation(async () => ({ content: contents[Math.min(i++, contents.length - 1)] }));
}

beforeEach(() => {
  S.chat.mockReset();
  S.inserts.length = 0;
});

describe('auto-extraction', () => {
  it('asks for the tables as document_drafting and the classification as regulatory_review, pinning no model', async () => {
    replies(JSON.stringify(TABLES), JSON.stringify(CLASSIFICATION));
    await runJob();
    const tasks = S.chat.mock.calls.map(([req]) => [req.taskType, req.model]);
    expect(tasks).toEqual([
      ['document_drafting', undefined],
      ['regulatory_review', undefined],
    ]);
  });

  // Asserted by stage and error, not by job status alone: in this harness a
  // job with valid replies also fails later, at storage (see the evidence
  // README), so "the job failed" would prove nothing about extraction.
  it.each([
    ['an unreadable table reply', ['Here are the tables I found.', JSON.stringify(CLASSIFICATION)], 'table_extraction', /not valid JSON/],
    ['a table reply with no tables list', ['{"note":"none found"}', JSON.stringify(CLASSIFICATION)], 'table_extraction', /no tables list/],
    ['an unreadable classification', [JSON.stringify(TABLES), 'It is a clinical study report.'], 'classification', /not valid JSON/],
    ['a classification with no metadata', [JSON.stringify(TABLES), '{"sections":[]}'], 'classification', /no metadata/],
  ])('%s fails the job at that stage and stores nothing', async (_what, contents, stage, error) => {
    replies(...(contents as string[]));
    const job = await runJob();
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(error as RegExp);
    expect(job.stages.find(s => s.name === stage)?.status).not.toBe('completed');
    expect(S.inserts).toEqual([]);
  });

  it('a model failure fails the job, not "0 tables found"', async () => {
    S.chat.mockImplementation(async () => {
      throw new Error('MODEL_NOT_APPROVED_FOR_HIGH_RISK');
    });
    const job = await runJob();
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/MODEL_NOT_APPROVED/);
    expect(job.stages.find(s => s.name === 'table_extraction')?.status).not.toBe('completed');
  });
});
