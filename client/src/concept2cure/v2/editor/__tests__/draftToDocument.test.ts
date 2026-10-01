// @vitest-environment jsdom
/**
 * draftToDocument — an AnA draft that is not yet a document becomes one
 * (2026-10-01, D2 canvas → editor, step 4).
 *
 * The sections a markdown or HTML draft splits into, and the once-per-turn
 * rule: a document already made from the same conversation and turn is
 * opened, not created again, and nothing is created when that cannot be
 * checked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { draftSections, isProgramId, openDraftAsDocument } from '../draftToDocument';

const PID = '5ac45b38-a1d8-4a41-9488-fac39a57b852';
const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

describe('draftSections', () => {
  it('keeps the numbers the headings carry, drops the title heading, and files the opening text under the title', () => {
    const md = '# Clinical Overview\n\nWhy this overview.\n\n## 2.5.1 Product Development Rationale\n\nRationale **text**.\n\n## 2.5.2 Biopharmaceutics\n\n- one\n- two';
    const s = draftSections('Clinical Overview', md);
    expect(s.map(x => [x.code, x.title])).toEqual([
      ['0', 'Clinical Overview'],
      ['2.5.1', 'Product Development Rationale'],
      ['2.5.2', 'Biopharmaceutics'],
    ]);
    expect(s[0].content).toContain('Why this overview.');
    expect(s[1].content).toContain('<strong>text</strong>');
    expect(s[2].content).toContain('<li>two</li>');
    expect(s.some(x => x.content.includes('Clinical Overview'))).toBe(false);
  });

  it('numbers sections in order, keeping each heading as the title, when the headings carry no numbers', () => {
    const s = draftSections('Briefing book', '## Background\n\nA.\n\n## Questions for the agency\n\nB.');
    expect(s.map(x => [x.code, x.title])).toEqual([
      ['1', 'Background'],
      ['2', 'Questions for the agency'],
    ]);
  });

  it('numbers in order when two headings carry the same number', () => {
    const s = draftSections('Plan', '## 1. Scope\n\nA.\n\n## 1. Scope (continued)\n\nB.');
    expect(s.map(x => x.code)).toEqual(['1', '2']);
    expect(s[1].title).toBe('1. Scope (continued)');
  });

  it('is one section when the draft has no headings, and splits HTML the same way as markdown', () => {
    expect(draftSections('Memo', 'Just a paragraph.')).toEqual([{ code: '1', title: 'Memo', content: '<p>Just a paragraph.</p>' }]);
    const html = draftSections('SOP', '<h2>1. Purpose</h2><p>P.</p><h2>2. Scope</h2><p>S.</p>');
    expect(html.map(x => [x.code, x.title, x.content])).toEqual([
      ['1', 'Purpose', '<p>P.</p>'],
      ['2', 'Scope', '<p>S.</p>'],
    ]);
  });

  it('splits at the top heading level present and keeps deeper headings inside their section', () => {
    const s = draftSections('Protocol', '## 1. Objectives\n\n### 1.1 Primary\n\nX.\n\n## 2. Design\n\nY.');
    expect(s.map(x => x.code)).toEqual(['1', '2']);
    expect(s[0].content).toContain('<h3>1.1 Primary</h3>');
  });
});

describe('isProgramId', () => {
  it('accepts a program UUID only', () => {
    expect(isProgramId(PID)).toBe(true);
    expect(isProgramId(12)).toBe(false);
    expect(isProgramId('BX-204')).toBe(false);
  });
});

describe('openDraftAsDocument — once per turn', () => {
  const DRAFT = { title: 'SAP', content: '## 1. Objectives\n\nX.', documentType: 'sap' };
  const ORIGIN = { programId: PID, conversationId: 'thread-1', turnId: 'rec-9' };
  const calls: { method: string; url: string; body?: unknown }[] = [];
  let routes: Record<string, () => Response> = {};

  beforeEach(() => {
    calls.length = 0;
    routes = {};
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
      calls.push({ method, url, body });
      const r = routes[`${method} ${url}`];
      return r ? r() : ok({ success: true, documents: [] });
    });
  });

  const posts = () => calls.filter(c => c.method === 'POST');

  it('creates through from-draft, recording the conversation and the turn, when no earlier copy exists', async () => {
    routes['POST /api/authoring/docs/from-draft'] = () => ok({ success: true, data: { doc: { id: 'new-doc' } } }, 201);
    const out = await openDraftAsDocument(DRAFT, ORIGIN);
    expect(out).toEqual({ ok: true, docId: 'new-doc', programId: PID, reused: false });
    expect(posts()).toHaveLength(1);
    expect(posts()[0].body).toMatchObject({
      programId: PID,
      title: 'SAP',
      documentType: 'sap',
      sections: [{ code: '1', title: 'Objectives' }],
      provenance: { source: 'ana', conversationId: 'thread-1', turnId: 'rec-9' },
    });
  });

  it('opens the document made from the same conversation and turn, and creates nothing', async () => {
    routes[`GET /api/authoring/docs?programId=${PID}`] = () => ok({ documents: [{ id: 'other', title: 'SAP' }, { id: 'same', title: 'SAP' }, { id: 'x', title: 'Not this' }] });
    routes['GET /api/authoring/docs/other'] = () => ok({ document: { provenance: { source: 'ana', conversationId: 'thread-1', turnId: 'rec-1' } } });
    routes['GET /api/authoring/docs/same'] = () => ok({ document: { provenance: { source: 'ana', conversationId: 'thread-1', turnId: 'rec-9' } } });
    const out = await openDraftAsDocument(DRAFT, ORIGIN);
    expect(out).toEqual({ ok: true, docId: 'same', programId: PID, reused: true });
    expect(posts()).toHaveLength(0);
    expect(calls.some(c => c.url === '/api/authoring/docs/x')).toBe(false);
  });

  it('creates a new document when the same title came from another turn', async () => {
    routes[`GET /api/authoring/docs?programId=${PID}`] = () => ok({ documents: [{ id: 'other', title: 'SAP' }] });
    routes['GET /api/authoring/docs/other'] = () => ok({ document: { provenance: { source: 'ana', conversationId: 'thread-1', turnId: 'rec-1' } } });
    routes['POST /api/authoring/docs/from-draft'] = () => ok({ success: true, data: { doc: { id: 'new-doc' } } }, 201);
    const out = await openDraftAsDocument(DRAFT, ORIGIN);
    expect(out).toMatchObject({ ok: true, docId: 'new-doc', reused: false });
  });

  it('creates nothing when the earlier-copy check cannot run', async () => {
    routes[`GET /api/authoring/docs?programId=${PID}`] = () => ok({ success: false }, 500);
    const out = await openDraftAsDocument(DRAFT, ORIGIN);
    expect(out.ok).toBe(false);
    expect(posts()).toHaveLength(0);
  });

  it('says what the server refused, and reports no document', async () => {
    routes['POST /api/authoring/docs/from-draft'] = () => ok({ success: false, error: 'Project not found' }, 404);
    const out = await openDraftAsDocument(DRAFT, ORIGIN);
    expect(out).toEqual({ ok: false, message: 'Project not found' });
  });
});
