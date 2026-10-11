/**
 * AnA's chat CER and IVDR context comes from the canonical outlines
 * (record step g-device-chat-cer-per-projection, finding 68 step 3).
 *
 * What was wrong:
 *  - send-message.ts injected device-section-registry.ts SECTIONS_CER into the
 *    chat prompt: 8 sections with no equivalence, no appraisal, no evaluator
 *    qualification and no references, and the PMCF *plan* filed as CER
 *    section 8. The canonical CER outline is CER_SECTIONS in
 *    server/services/market-specs/cer-structure.ts (12 sections), which already
 *    backs assess_device_evidence_structure and assessStoredCer.
 *  - A detected 'IVDR' context injected nothing: getDeviceSections('IVDR')
 *    returned [], although PER_SECTIONS exists in per-structure.ts.
 *
 * What this pins:
 *  - getDeviceSections('CER') / ('IVDR') are projections of CER_SECTIONS /
 *    PER_SECTIONS: same sections, same order, same required flags. Nothing is
 *    restated, so a change to the record reaches the chat prompt.
 *  - The equivalence section is conditional, not "optional".
 *  - Codes are keyed on the record's section id. The retired numeric codes
 *    CER.1–CER.8 meant different sections (CER.4 was "Literature Review",
 *    CER.8 the PMCF plan); artifacts saved under them must not be read as a
 *    drafted section of the new outline.
 *  - The chat block is rendered by the registry, and the device-status route
 *    answers IVDR with the PER outline and refuses a type it does not know.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import request from 'supertest';

const { route } = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock('../../ai-gateway/index.js', () => ({ getGateway: () => ({ route }) }));

import * as registry from '../../device/device-section-registry';
import { CER_SECTIONS } from '../../market-specs/cer-structure';
import { PER_SECTIONS } from '../../market-specs/per-structure';
import router from '../../../routes/ind-generation';

type Section = { code: string; title: string; required: boolean; guidance: string; appliesWhen?: string };
type Lookup = (type: string) => Section[];
type Render = (type: string, ctx?: { activeProject?: string }) => string;
type Guard = (value: unknown) => boolean;

const reg = registry as unknown as Record<string, unknown>;
const sectionsFor = (type: string): Section[] => (registry.getDeviceSections as unknown as Lookup)(type);

function fn<T>(name: string): T {
  const f = reg[name];
  expect(typeof f, `device-section-registry exports no ${name}`).toBe('function');
  return f as T;
}

describe('getDeviceSections projects the canonical CER and PER outlines', () => {
  it("'CER' is CER_SECTIONS: 12 sections, same order and required flags", () => {
    const cer = sectionsFor('CER');
    expect(cer.map((s) => s.title)).toEqual(CER_SECTIONS.map((s) => s.title));
    expect(cer.map((s) => s.required)).toEqual(CER_SECTIONS.map((s) => s.required));
    expect(cer).toHaveLength(12);
  });

  it("'CER' carries equivalence, appraisal, evaluator qualification and references", () => {
    const titles = sectionsFor('CER').map((s) => s.title);
    for (const t of [
      'Equivalence (where claimed)',
      'Appraisal of the Clinical Data',
      'Qualification of the Evaluators',
      'References and Appendices',
    ]) {
      expect(titles, t).toContain(t);
    }
  });

  it("'CER' no longer files the PMCF plan as a CER section", () => {
    const titles = sectionsFor('CER').map((s) => s.title);
    expect(titles).not.toContain('PMCF Plan');
    expect(titles).not.toContain('Executive Summary');
  });

  it("'IVDR' is PER_SECTIONS, not an empty list", () => {
    const per = sectionsFor('IVDR');
    expect(per.length).toBeGreaterThan(0);
    expect(per.map((s) => s.title)).toEqual(PER_SECTIONS.map((s) => s.title));
    expect(per.map((s) => s.required)).toEqual(PER_SECTIONS.map((s) => s.required));
    expect(per.map((s) => s.title)).toContain('Analytical Performance Report');
  });

  it('the equivalence section applies only when equivalence is claimed', () => {
    const eq = sectionsFor('CER').find((s) => s.title === 'Equivalence (where claimed)');
    expect(eq?.required).toBe(false);
    expect(eq?.appliesWhen, 'equivalence rendered as merely optional').toMatch(/equivalence is claimed/i);
    for (const s of sectionsFor('CER').filter((x) => x.title !== 'Equivalence (where claimed)')) {
      expect(s.appliesWhen, s.title).toBeUndefined();
    }
  });

  it('codes are keyed on the record id, never a retired numeric CER.n code', () => {
    const cer = sectionsFor('CER');
    const per = sectionsFor('IVDR');
    expect(cer.map((s) => s.code)).toEqual(CER_SECTIONS.map((s) => `CER.${s.id}`));
    expect(per.map((s) => s.code)).toEqual(PER_SECTIONS.map((s) => `PER.${s.id}`));
    for (const s of [...cer, ...per]) expect(s.code, s.title).not.toMatch(/^(CER|PER)\.\d+$/);
    const all = registry.ALL_DEVICE_SECTIONS.map((s) => s.code);
    expect(new Set(all).size, 'duplicate section code').toBe(all.length);
  });

  it('guidance comes from the record, not a restated citation', () => {
    const cer = sectionsFor('CER');
    CER_SECTIONS.forEach((s, i) => expect(cer[i].guidance).toBe(s.purpose));
    const per = sectionsFor('IVDR');
    PER_SECTIONS.forEach((s, i) => expect(per[i].guidance).toBe(s.purpose));
  });

  it('getDeviceSectionByCode resolves a projected section', () => {
    expect(registry.getDeviceSectionByCode('CER.appraisal')?.title).toBe('Appraisal of the Clinical Data');
    expect(registry.getDeviceSectionByCode('PER.analytical_performance')?.title).toBe('Analytical Performance Report');
    expect(registry.getDeviceSectionByCode('CER.8')).toBeUndefined();
  });

  it('the 510(k), PMA and De Novo outlines are untouched by this step', () => {
    expect(sectionsFor('510K')).toHaveLength(10);
    expect(sectionsFor('PMA')).toHaveLength(8);
    expect(sectionsFor('DE_NOVO')).toHaveLength(6);
  });
});

describe('the chat device block is rendered from the projection', () => {
  it('isDeviceSubmissionType knows CER and IVDR and nothing it cannot answer for', () => {
    const is = fn<Guard>('isDeviceSubmissionType');
    for (const t of ['510K', 'PMA', 'DE_NOVO', 'CER', 'IVDR']) expect(is(t), t).toBe(true);
    for (const t of ['NDA', 'cer', '', undefined, 'MDR']) expect(is(t), String(t)).toBe(false);
  });

  it('the CER block lists all 12 sections and marks equivalence as conditional', () => {
    const block = fn<Render>('renderDeviceContextBlock')('CER', { activeProject: 'Stent X' });
    for (const s of CER_SECTIONS) expect(block, s.title).toContain(s.title);
    expect(block).toContain('Project: Stent X');
    expect(block).toMatch(/11 required, 12 total/);
    const eqLine = block.split('\n').find((l) => l.includes('Equivalence (where claimed)'));
    expect(eqLine).toMatch(/only when equivalence is claimed/i);
    expect(eqLine).not.toMatch(/\(optional\)/);
    expect(block).not.toContain('PMCF Plan');
  });

  it('the IVDR block lists the PER outline and does not pass it off as the whole IVDR file', () => {
    const block = fn<Render>('renderDeviceContextBlock')('IVDR');
    for (const s of PER_SECTIONS) expect(block, s.title).toContain(s.title);
    expect(block).toMatch(/performance evaluation report/i);
    expect(block).toMatch(/not the full .*technical documentation/i);
  });

  it('an unknown type renders nothing', () => {
    expect(fn<Render>('renderDeviceContextBlock')('NDA')).toBe('');
  });

  // The replacement has to stay REACHABLE. This step deleted the chat route's own
  // inline device block — a hard-coded type list and an 8-section CER list built
  // in the handler. Five editor generations were deleted and rebuilt in this
  // repository because no gate pinned the path that replaced them
  // (CLAUDE.md working agreement). So: the route must call the projection, and
  // must not grow its own copy back.
  it('the chat route renders the block through the registry, not its own list', () => {
    const route = readFileSync(
      path.join(__dirname, '../../../routes/chat/send-message.ts'),
      'utf8',
    );
    expect(route).toContain('renderDeviceContextBlock');
    expect(route).toContain('isDeviceSubmissionType');
    // The retired inline copy: a literal device-type array and a hand-built section list.
    expect(route).not.toMatch(/\[\s*'510K'\s*,\s*'PMA'\s*,\s*'DE_NOVO'/);
    expect(route).not.toMatch(/getDeviceSections\s*\(/);
    expect(route).not.toContain('Required sections (');
  });
});

// ── GET /api/ind-generation/device-status ────────────────────────────────────

const TOKEN = 'Bearer caller-token-7-41';
const fetchMock = vi.fn(async (_url?: unknown, _init?: unknown): Promise<Response> => {
  throw new Error('fetch not scripted');
});
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    (req as unknown as { user: Record<string, unknown> }).user = { id: 41, userId: 41, organizationId: 7, role: 'user' };
    next();
  });
  a.use('/api/ind-generation', router);
  return a;
}

describe('GET /device-status answers CER and IVDR from the canonical outlines', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('IVDR returns the PER sections', async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, data: [] }));
    const r = await request(app()).get('/api/ind-generation/device-status/IVDR/3').set('Authorization', TOKEN);
    expect(r.status).toBe(200);
    expect(r.body.data.sections.map((s: { title: string }) => s.title)).toEqual(PER_SECTIONS.map((s) => s.title));
  });

  it('an artifact saved under a retired CER.n code does not mark a new section drafted', async () => {
    fetchMock.mockResolvedValue(
      json(200, {
        success: true,
        data: [
          { id: 'a4', ctdSection: 'CER.4', status: 'draft' }, // was "Literature Review"
          { id: 'a8', ctdSection: 'CER.8', status: 'approved' }, // was the PMCF plan
          { id: 'a7', ctdSection: 'CER.appraisal', status: 'draft' },
        ],
      }),
    );
    const r = await request(app()).get('/api/ind-generation/device-status/CER/3').set('Authorization', TOKEN);
    expect(r.status).toBe(200);
    expect(r.body.data.totalSections).toBe(12);
    expect(r.body.data.completedSections).toBe(1);
    const appraisal = r.body.data.sections.find((s: { code: string }) => s.code === 'CER.appraisal');
    expect(appraisal).toMatchObject({ status: 'draft', artifactId: 'a7' });
  });

  it('refuses a type it does not know with 400, before reading artifacts', async () => {
    const r = await request(app()).get('/api/ind-generation/device-status/NDA/3').set('Authorization', TOKEN);
    expect(r.status).toBe(400);
    expect(r.body.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
