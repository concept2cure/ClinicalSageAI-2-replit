/**
 * POST /api/ind-generation/generate-section — filing-integrity regression.
 *
 * The handler drafts ANY CTD section — including Module 4 Nonclinical
 * (toxicology conclusions, NOAEL statements) and Module 2 overviews — from a
 * request body carrying only product identity/phase, with no study/evidence
 * data. Before this fix the system prompt carried no anti-fabrication
 * constraint, and a drafted section that still contained an invented (or
 * placeholder-marked) NOAEL value / safety conclusion was persisted into the
 * governed artifact store and reported back as "drafted successfully" — with
 * no signal that the section was not actually data-complete.
 *
 * These tests fail against the pre-fix handler because it emits no
 * `needsData` field at all (so `needsData` is `undefined`, never `true`) and
 * because its system prompt carries no do-not-invent instruction.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const route = vi.fn();
vi.mock('../../services/ai-gateway/index.js', () => ({
  getGateway: () => ({ route }),
}));

// generate-form (a sibling route in the same file) touches the docx master
// document builder; stub it so importing the router never depends on a real
// docx/pdf toolchain being present in the test environment.
vi.mock('../../services/docx/masterDocumentBuilder.js', () => ({
  getMasterDocumentBuilder: () => ({
    generateFromScratch: vi.fn(),
    generateEctdXml: vi.fn(),
  }),
}));

import indGenerationRouter from '../ind-generation';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/ind-generation', indGenerationRouter);
  return a;
}

const REQ_BODY = {
  projectId: 'proj-1',
  sectionCode: '2.6', // Module 2.6 Nonclinical Written and Tabulated Summaries
  productName: 'BX-099',
  indication: 'metastatic solid tumors',
  sponsor: 'Acme Biosciences',
  phase: 'Phase 1',
};

// The parameters are declared even though the body ignores them: this stands in
// for global fetch, which is called as fetch(url, init), and vi.fn infers the
// call-args tuple from the implementation's signature. Declared with none, the
// tuple is `[]`, and the `([url]) =>` destructuring below cannot index it
// (TS2493). Naming them makes mock.calls describe the real call shape.
const fetchMock = vi.fn(async (_url?: unknown, _init?: unknown) =>
  new Response(JSON.stringify({ success: true, data: { id: 'artifact-1' } }), { status: 200 }),
);

beforeEach(() => {
  route.mockReset();
  fetchMock.mockClear();
  // Simulate the governed concept2cure artifact store accepting the save.
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/ind-generation/generate-section — no fabrication', () => {
  it('signals needsData (never "drafted successfully") when the model leaves an unresolved placeholder', async () => {
    route.mockResolvedValue({
      content:
        'REPEAT-DOSE TOXICOLOGY\n\nIn a 28-day repeat-dose study, the NOAEL was determined to be ' +
        '[NOAEL VALUE]. No evidence of genotoxic potential was observed. [TOXICOLOGY FINDING TO BE INSERTED]',
    });

    const res = await request(app()).post('/api/ind-generation/generate-section').send(REQ_BODY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // The old behavior: an unconditional "drafted successfully" with no
    // completeness signal at all. This must no longer be the response for
    // content that still carries unresolved placeholders.
    expect(res.body.data.message).not.toMatch(/drafted successfully/i);
    expect(res.body.data.needsData).toBe(true);
    expect(Array.isArray(res.body.data.unresolvedPlaceholders)).toBe(true);
    expect(res.body.data.unresolvedPlaceholders.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.unresolvedPlaceholders).toEqual(
      expect.arrayContaining(['[NOAEL VALUE]', '[TOXICOLOGY FINDING TO BE INSERTED]']),
    );
    // Status stays 'draft' (governed store still has the section, but it is
    // not represented as filing-ready) — never a status that reads as done.
    expect(res.body.data.status).toBe('draft');

    // The governed artifact store must also receive the incomplete signal,
    // not just the API response, so a downstream readiness/assemble check
    // can fail closed off the persisted artifact itself.
    const createCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/artifacts'),
    );
    expect(createCall).toBeDefined();
    const body = JSON.parse((createCall as any)[1].body);
    expect(body.metadata.needsData).toBe(true);
    expect(body.metadata.unresolvedPlaceholders.length).toBeGreaterThanOrEqual(2);
  });

  it('reports "drafted successfully" when the content has no unresolved placeholders', async () => {
    route.mockResolvedValue({
      content: 'INTRODUCTION\n\nThis section summarizes the nonclinical program for BX-099.',
    });

    const res = await request(app()).post('/api/ind-generation/generate-section').send(REQ_BODY);

    expect(res.status).toBe(200);
    expect(res.body.data.needsData).toBe(false);
    expect(res.body.data.unresolvedPlaceholders).toEqual([]);
    expect(res.body.data.message).toMatch(/drafted successfully/i);
  });

  it('sends the AI gateway an explicit anti-fabrication / do-not-invent system prompt', async () => {
    route.mockResolvedValue({ content: 'Some drafted content with no placeholders.' });

    await request(app()).post('/api/ind-generation/generate-section').send(REQ_BODY);

    expect(route).toHaveBeenCalledTimes(1);
    const callArgs = route.mock.calls[0][0];
    const systemMessage = callArgs.messages.find((m: { role: string }) => m.role === 'system');

    expect(systemMessage).toBeDefined();
    expect(systemMessage.content).toMatch(/do not invent/i);
    expect(systemMessage.content).toMatch(/NOAEL/);
    expect(systemMessage.content).toMatch(/\[DATA TO BE INSERTED\]/);
  });

  it('threads an optional sourceData field into the user prompt so the model has real material to ground on', async () => {
    route.mockResolvedValue({ content: 'Grounded content.' });

    await request(app())
      .post('/api/ind-generation/generate-section')
      .send({ ...REQ_BODY, sourceData: 'Study BX099-TOX-01: NOAEL = 50 mg/kg/day (rat, 28-day repeat dose).' });

    const callArgs = route.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user');
    expect(userMessage.content).toContain('SOURCE DATA');
    expect(userMessage.content).toContain('NOAEL = 50 mg/kg/day');
  });
});
