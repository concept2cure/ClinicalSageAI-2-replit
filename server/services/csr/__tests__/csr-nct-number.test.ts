/**
 * A CSR names the study's ClinicalTrials.gov registration when its approved
 * source states one (D5, 2026-10-29; CSR path review for LMN-201,
 * NCT05330182).
 *
 * The source contract (CsrStudyInfoSchema, strict) refused an nctNumber
 * outright. The build route stripped it without a word, and nothing that
 * composes the CSR or Module 2 printed one. Now:
 *   - the contract takes it, and only in its form, NCT plus eight digits;
 *   - the drafting prompt and the §1 and §2 templates state it;
 *   - the assembled body's title page prints it;
 *   - Module 2.7's Clinical Study Index carries it, or says the source states
 *     none.
 * It is never guessed: no number in, none out.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The model returns nothing, so the template is what the section says; the prompt is still recorded.
const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn(async (_m: unknown, _o?: unknown) => '') }));
const chat = async (m: unknown, o?: unknown) => ({ content: await chatMock(m, o), model: 'test-model' });
vi.mock('../../../lib/unified-ai-client.js', () => ({ ai: { chat, complete: chatMock }, default: { chat, complete: chatMock } }));
vi.mock('../../usage-metering.js', () => ({
  checkQuota: vi.fn(async () => ({ allowed: true, remaining: 10, limit: 10 })),
  recordUsage: vi.fn(async () => undefined),
}));

import { CsrStudyInfoSchema, nctNumberOf } from '../../../../shared/csr-source-input';
import { draftCSRSection, type CSRBuildRequest } from '../../csr-builder';
import { buildM27ClinicalSummary, type CSRSummaryInput } from '../../m2-summary-builders';
import { assembleCsr } from '../csr-assembly';
import { assemblyInput } from './support/csr-assembly-fixture';
import express from 'express';
import request from 'supertest';
import csrBuilderRouter from '../../../routes/csr-builder-routes';

const NCT = 'NCT05330182';
const INFO: CSRBuildRequest['studyInfo'] = {
  title: 'RePreve: LMN-201 for prevention of recurrent C. difficile infection', protocolNumber: 'LMN-201-CDI02',
  phase: 'Phase 2/3', indication: 'recurrent C. difficile infection', sponsor: 'Lumen Bioscience',
  investigationalProduct: 'LMN-201', studyDesign: 'randomized, double-blind, placebo-controlled',
  primaryEndpoint: 'recurrence-free at week 8',
};

async function bodyText(file: string): Promise<string> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(await fs.readFile(file)) }).promise;
  const items = (await (await doc.getPage(1)).getTextContent()).items as Array<{ str: string }>;
  return items.map(i => i.str).join(' ');
}

describe('the source contract', () => {
  it('takes a ClinicalTrials.gov number in its form, NCT and eight digits', () => {
    expect(CsrStudyInfoSchema.parse({ ...INFO, nctNumber: ` ${NCT} ` }).nctNumber).toBe(NCT);
    for (const bad of ['NCT0533018', 'nct05330182', 'NCT05330182X', '05330182', 'EudraCT 2021-000000-00']) {
      expect(CsrStudyInfoSchema.safeParse({ ...INFO, nctNumber: bad }).success).toBe(false);
    }
  });

  it('a study information record states its registration only when it is well formed', () => {
    expect(nctNumberOf({ nctNumber: NCT })).toBe(NCT);
    expect(nctNumberOf({ nctNumber: 'NCT123' })).toBeNull();
    expect(nctNumberOf({})).toBeNull();
    expect(nctNumberOf(null)).toBeNull();
  });
});

describe('drafting', () => {
  beforeEach(() => chatMock.mockClear());

  it('the prompt states the registration, and the §1 and §2 templates print it', async () => {
    const one = await draftCSRSection('1', { ...INFO, nctNumber: NCT });
    const system = JSON.stringify(chatMock.mock.calls[0]?.[0]);
    expect(system).toContain(`ClinicalTrials.gov: ${NCT}`);
    expect(one).toMatchObject({ isAI: false });
    expect(one.content).toContain(`ClinicalTrials.gov Identifier: ${NCT}`);
    expect((await draftCSRSection('2', { ...INFO, nctNumber: NCT })).content).toContain(`ClinicalTrials.gov Identifier: ${NCT}`);
  });

  it('with none stated, none is printed or prompted', async () => {
    const one = await draftCSRSection('1', INFO);
    expect(JSON.stringify(chatMock.mock.calls[0]?.[0])).not.toContain('ClinicalTrials.gov');
    expect(one.content).not.toContain('ClinicalTrials.gov');
  });
});

describe('the CSR builder route', () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as unknown as { user: unknown }).user = { organizationId: 7, id: 5 }; next(); });
  app.use('/api/csr-builder', csrBuilderRouter);

  it('keeps the registration a request states (it was stripped), and refuses a malformed one', async () => {
    const ok = await request(app).post('/api/csr-builder/draft-section').send({ sectionNumber: '1', studyInfo: { ...INFO, nctNumber: NCT } });
    expect(ok.status).toBe(200);
    expect(ok.body.content).toContain(`ClinicalTrials.gov Identifier: ${NCT}`);
    const bad = await request(app).post('/api/csr-builder/draft-section').send({ sectionNumber: '1', studyInfo: { ...INFO, nctNumber: 'NCT1' } });
    expect(bad.status).toBe(400);
  });
});

describe('Module 2.7 Clinical Study Index', () => {
  const study = (nctNumber?: string | null): CSRSummaryInput => ({
    studyId: 'LMN-201-CDI02', protocolNumber: 'LMN-201-CDI02', phase: 'Phase 2/3', studyDesign: INFO.studyDesign,
    primaryEndpoint: INFO.primaryEndpoint, primaryResult: 'See §11.4', sampleSize: null, pivotal: true,
    ...(nctNumber === undefined ? {} : { nctNumber }),
  });
  const index = (c: CSRSummaryInput) => buildM27ClinicalSummary({ csrs: [c], indication: INFO.indication, investigationalProduct: 'LMN-201' })
    .tables?.find(t => t.title === 'Clinical Study Index');

  it('carries the registration beside the study', () => {
    const t = index(study(NCT));
    expect(t?.headers.slice(0, 2)).toEqual(['Study ID', 'ClinicalTrials.gov']);
    expect(t?.rows[0].slice(0, 2)).toEqual(['LMN-201-CDI02', NCT]);
  });

  it.each([[undefined], [null]])('says the source states none (%j), never leaves it blank', (nct) => {
    expect(index(study(nct))?.rows[0][1]).toBe('Not stated in the source');
  });
});

describe('the assembled title page', () => {
  let work: string;
  let out: string;
  beforeEach(async () => {
    work = await fs.mkdtemp(path.join(os.tmpdir(), 'csr-nct-'));
    out = path.join(work, 'out');
    await fs.mkdir(out);
  });
  afterEach(async () => { await fs.rm(work, { recursive: true, force: true }); });

  it('prints the registration under the study', async () => {
    const result = await assembleCsr(await assemblyInput(out, { nctNumber: NCT }));
    const body = result.leaves.find(l => l.appendix === 'body')!;
    expect(await bodyText(path.join(out, body.fileName))).toContain(`ClinicalTrials.gov Identifier: ${NCT}`);
  }, 60_000);

  it('prints none when the source states none', async () => {
    const result = await assembleCsr(await assemblyInput(out));
    const body = result.leaves.find(l => l.appendix === 'body')!;
    expect(await bodyText(path.join(out, body.fileName))).not.toContain('ClinicalTrials.gov');
  }, 60_000);
});
