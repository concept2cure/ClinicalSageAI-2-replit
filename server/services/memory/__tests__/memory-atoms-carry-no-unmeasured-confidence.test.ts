/**
 * Memory atoms carry no confidence nobody measured, and the model is not asked
 * for one.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 * Every heuristic rule stamped a constant confidenceScore on its atom (0.65 for
 * a regex compound id, 0.8 for a keyword hit, 1.0 for the "Ingested: X" atom —
 * also when X had not been read). The LLM path asked the model for a
 * "confidenceScore (0-1)", kept its self-report, and filled 0.6 when it gave
 * none. These were stored and shown to AnA as "confidence: NN%". They are rule
 * weights and a model's guess, not measurements; the drafts now carry none and
 * the row stores null.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const gw = vi.hoisted(() => ({ requests: [] as unknown[], reply: '' }));
vi.mock('../../ai-gateway/gateway.js', () => ({
  getGateway: () => ({
    route: async (req: unknown) => { gw.requests.push(req); return { content: gw.reply }; },
  }),
}));

import { extractMemoryEntriesFromText, extractProjectMemoryEntries } from '../heuristic-extraction';
import { extractMemoryEntriesViaGateway, parseMemoryEntries, MEMORY_ENTRIES_JSON_SCHEMA } from '../llm-extraction';

const CLIENT_TEXT =
  'Our mission is to cure rare disease through gene therapy. We are preparing an IND and a BLA. ' +
  'Lead asset ABC-1234 is in Phase II. Competitors include Vertex and Biogen in this space. ' +
  'CEO Jane Smith leads the team.';
const PROJECT_TEXT =
  'The primary endpoint is overall survival. The patient population includes adults with NSCLC. ' +
  'This is a randomized, double-blind study. Key risks include hepatotoxicity and neutropenia. ' +
  'Drug substance and drug product stability were assessed under GMP. FDA recommended an additional PK cohort.';
const confidenceOf = (e: object) => (e as { confidenceScore?: unknown }).confidenceScore;

beforeEach(() => { gw.requests.length = 0; gw.reply = ''; });

describe('heuristic extraction', () => {
  it('stamps no confidence on any client atom', () => {
    const out = extractMemoryEntriesFromText(CLIENT_TEXT, 'overview.pdf', 'Acme Bio');
    expect(out.length).toBeGreaterThan(5);
    expect(out.map(confidenceOf), 'a rule weight was stored as a confidence').toEqual(out.map(() => undefined));
  });

  it('stamps no confidence on any project atom', () => {
    const out = extractProjectMemoryEntries(PROJECT_TEXT, 'protocol.pdf', 'Study 001');
    expect(out.length).toBeGreaterThan(5);
    expect(out.map(confidenceOf), 'a rule weight was stored as a confidence').toEqual(out.map(() => undefined));
  });
});

describe('LLM extraction', () => {
  const entry = { category: 'regulatory', subcategory: 'pathway', title: 'IND referenced', content: 'An IND is planned.', importanceLevel: 'high' };

  it('does not keep the model’s self-reported confidence', () => {
    const [out] = parseMemoryEntries(JSON.stringify({ entries: [{ ...entry, confidenceScore: 0.97 }] }));
    expect(confidenceOf(out), 'the model’s guess was kept as a confidence').toBeUndefined();
  });

  it('does not fill a default confidence when the model gives none', () => {
    const [out] = parseMemoryEntries(JSON.stringify({ entries: [entry] }));
    expect(out).toMatchObject({ title: 'IND referenced' });
    expect(confidenceOf(out), 'a default was filled in as a confidence').toBeUndefined();
  });

  it('does not ask the model for a confidence figure', async () => {
    gw.reply = JSON.stringify({ entries: [entry] });
    await extractMemoryEntriesViaGateway({
      kind: 'client', text: 'An IND is planned.', fileName: 'f.pdf', subjectName: 'Acme', organizationId: 1, userId: 2,
    });
    expect(gw.requests).toHaveLength(1);
    expect(JSON.stringify(gw.requests[0]), 'the request asks the model for a number').not.toMatch(/confidence/i);
    expect(JSON.stringify(MEMORY_ENTRIES_JSON_SCHEMA)).not.toMatch(/confidence/i);
  });
});
