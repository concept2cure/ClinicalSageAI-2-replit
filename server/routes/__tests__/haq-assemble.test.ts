/**
 * POST /api/haq-manager/letters/:id/assemble — the button the whole HAQ
 * workbench builds toward, which had no onClick and no endpoint.
 *
 * A user approved every question in an agency round, clicked "Assemble response
 * package", and nothing happened at all.
 *
 * What matters once it DOES something is that it never ships a package that
 * misrepresents the round: an unapproved response must not be silently
 * included as though it were approved, and a question that carries no response
 * text must be named rather than quietly rendered as an empty answer to a
 * health authority.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { query, getById, update, create } = vi.hoisted(() => ({
  query: vi.fn(), getById: vi.fn(), update: vi.fn(), create: vi.fn(),
}));
vi.mock('../../utils/feature-persistence', () => ({
  createFeatureStore: () => ({ query, getById, update, create }),
}));

import haqRouter from '../haq-manager';

function app(org: number | null = 7) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: 5 };
    next();
  });
  a.use('/api/haq-manager', haqRouter);
  return a;
}

const LETTER = {
  letterId: 'IR-1', agency: 'FDA', authority: 'FDA', submission: 'NDA 200100',
  type: 'Information Request', received: '2026-06-01', due: '2026-07-01',
};
const q = (qid: string, over: Record<string, unknown> = {}) => ({
  id: Number(qid.replace(/\D+/g, '')), qid, letterId: 'IR-1', disc: 'Clinical',
  status: 'approved', q: 'What is the basis for the dose?',
  draft: 'The dose is supported by the exposure-response analysis in §5.3.',
  cites: ['CSR-201 §7.1'], commitments: ['Provide the updated PopPK report'],
  ...over,
});

beforeEach(() => { query.mockReset(); });

function store(letters: unknown[], questions: unknown[]) {
  query.mockImplementation(async (_org: number, kind: string) =>
    kind === 'letter' ? letters : questions);
}

describe('POST /letters/:id/assemble', () => {
  it('404s on a round this org does not have', async () => {
    store([], []);
    const res = await request(app()).post('/api/haq-manager/letters/IR-9/assemble').send({});
    expect(res.status).toBe(404);
  });

  it('refuses a round with no questions rather than emitting an empty package', async () => {
    store([LETTER], []);
    const res = await request(app()).post('/api/haq-manager/letters/IR-1/assemble').send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/no questions recorded/i);
  });

  it('refuses to assemble while any response is unapproved, and names each one', async () => {
    // The failure this exists to prevent: shipping a draft to a health
    // authority inside a package labelled as the approved responses.
    store([LETTER], [q('Q1'), q('Q2', { status: 'in_review' }), q('Q3', { status: 'draft' })]);
    const res = await request(app()).post('/api/haq-manager/letters/IR-1/assemble').send({});
    expect(res.status).toBe(409);
    expect(res.body.outstanding).toEqual([
      { id: 'Q2', status: 'in_review' },
      { id: 'Q3', status: 'draft' },
    ]);
    expect(res.body.error).toContain('Q2 (in_review)');
    expect(res.body.error).toContain('Q3 (draft)');
  });

  it('assembles the approved responses with their citations and commitments', async () => {
    store([LETTER], [q('Q1'), q('Q2', { q: 'Second question?', draft: 'Second response.' })]);
    const res = await request(app()).post('/api/haq-manager/letters/IR-1/assemble').send({});
    expect(res.status).toBe(200);
    const md: string = res.body.data.markdown;
    expect(res.body.data.questionCount).toBe(2);
    expect(md).toContain('NDA 200100');
    expect(md).toContain('What is the basis for the dose?');
    expect(md).toContain('The dose is supported by the exposure-response analysis in §5.3.');
    expect(md).toContain('CSR-201 §7.1');
    expect(md).toContain('Provide the updated PopPK report');
    expect(md).toContain('Second response.');
  });

  it('orders questions numerically, so Q10 follows Q9 rather than Q1', async () => {
    store([LETTER], [q('Q10'), q('Q2'), q('Q1')]);
    const res = await request(app()).post('/api/haq-manager/letters/IR-1/assemble').send({});
    const md: string = res.body.data.markdown;
    expect(md.indexOf('## Q1\n')).toBeLessThan(md.indexOf('## Q2'));
    expect(md.indexOf('## Q2')).toBeLessThan(md.indexOf('## Q10'));
  });

  it('names an approved question that carries no response text instead of rendering a blank answer', async () => {
    store([LETTER], [q('Q1'), q('Q2', { draft: '   ' })]);
    const res = await request(app()).post('/api/haq-manager/letters/IR-1/assemble').send({});
    expect(res.status).toBe(200);
    expect(res.body.data.questionsWithNoResponseText).toEqual(['Q2']);
    expect(res.body.data.markdown).toContain('no approved response text is recorded');
  });

  it('503s rather than 500s when the HAQ store is not provisioned', async () => {
    query.mockRejectedValue(Object.assign(new Error('relation does not exist'), { code: '42P01' }));
    const res = await request(app()).post('/api/haq-manager/letters/IR-1/assemble').send({});
    expect(res.status).toBe(503);
  });
});
