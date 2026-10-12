/**
 * One combination-product classification engine.
 *
 * Four engines answered "which FDA Center leads this combination product":
 *
 *   - combination-products-knowledge.ts  determinePrimaryModeOfAction / classifyCombinationProduct
 *     (AnA's determine_primary_mode_of_action and classify_combination_product tools)
 *   - global-ri/combination-product-classification.ts  classifyCombinationProduct
 *     (POST /api/global-ri/combination/classify)
 *   - market-specs/combination-products.ts  assessCombinationProduct
 *     (AnA's assess_combination_product, POST /api/submissions/... assess)
 *   - combination-product-service.ts  determinePrimaryMode
 *     (GET /api/biologics/combination-products/classify and /requirements)
 *
 * They disagreed, and the last one was wrong:
 *
 *   - it listed the drug-eluting stent as a drug-led (CDER) example. FDA assigns
 *     drug-eluting coronary stents to CDRH: the stent's device mode of action is
 *     the primary one (fda.gov, Jurisdictional Update: Drug-Eluting Cardiovascular
 *     Stents);
 *   - it cited the PMOA as "21 CFR 3.2(e)". 3.2(e) defines a combination product;
 *     3.2(m) defines the primary mode of action, and 3.4 assigns the Center;
 *   - an unknown primaryAction silently became "drug".
 *
 * The canonical engine itself cited the Request for Designation as 21 CFR 3.5
 * and the letter of designation as 3.7. eCFR: 3.5 is the procedure for
 * identifying the designated component, 3.7 is the request for designation, and
 * 3.8 is the letter of designation. It also called two devices co-packaged a
 * combination product; 3.2(e)(2) requires drug+device, device+biologic or
 * biologic+drug.
 *
 * Facts: docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-combination-product-one-engine-facts.md
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import request from 'supertest';

vi.mock('../../../auth.js', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { basisProblems } from '../../../../shared/regulatory/regulatory-basis';
import {
  determinePrimaryModeOfAction,
  classifyCombinationProduct as classifyCategory,
  listCitations,
  type ConstituentType,
  type FdaCenter,
} from '../combination-products-knowledge';
import {
  classifyCombinationProduct as classifyRegion,
  type FdaCombinationClassification,
} from '../../global-ri/combination-product-classification';
import { assessCombinationProduct } from '../../market-specs/combination-products';
import biologicsRouter from '../../../routes/biologics-routes';

const REPO = resolve(__dirname, '../../../..');
const src = (p: string): string => readFileSync(resolve(REPO, p), 'utf8');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/biologics', biologicsRouter);
  return a;
}

interface Fixture {
  product: string;
  /** Pattern that finds this product in any engine's text. */
  mention: RegExp;
  constituents: Array<{ type: ConstituentType; primary: boolean }>;
  pmoa: ConstituentType;
  center: FdaCenter;
}

/**
 * Lead Centers as FDA assigns them. The drug-eluting stent is regulator text
 * (fda.gov jurisdictional update); the other three are recall, all small-molecule
 * drug PMOA (see the facts file).
 */
const FIXTURES: Fixture[] = [
  {
    product: 'drug-eluting coronary stent',
    mention: /drug[- ]eluting stent/i,
    constituents: [
      { type: 'device', primary: true },
      { type: 'drug', primary: false },
    ],
    pmoa: 'device',
    center: 'CDRH',
  },
  {
    product: 'prefilled syringe (small-molecule drug)',
    mention: /prefilled syringe/i,
    constituents: [
      { type: 'drug', primary: true },
      { type: 'device', primary: false },
    ],
    pmoa: 'drug',
    center: 'CDER',
  },
  {
    product: 'transdermal patch',
    mention: /transdermal patch/i,
    constituents: [
      { type: 'drug', primary: true },
      { type: 'device', primary: false },
    ],
    pmoa: 'drug',
    center: 'CDER',
  },
  {
    product: 'autoinjector (small-molecule drug)',
    mention: /auto-?injector/i,
    constituents: [
      { type: 'drug', primary: true },
      { type: 'device', primary: false },
    ],
    pmoa: 'drug',
    center: 'CDER',
  },
];

describe('parity: every engine gives the fixture the Center FDA gives', () => {
  for (const f of FIXTURES) {
    it(`${f.product} → ${f.center}`, async () => {
      const canonical = determinePrimaryModeOfAction({
        productDescription: f.product,
        constituents: f.constituents.map((c) => ({ type: c.type, providesPrimaryTherapeuticEffect: c.primary })),
      });
      expect(canonical.leadCenter).toBe(f.center);
      expect(canonical.pmoaType).toBe(f.pmoa);

      const region = classifyRegion({ region: 'FDA', primaryModeOfAction: f.pmoa }) as FdaCombinationClassification;
      expect(region.leadCenter).toBe(f.center);

      const market = assessCombinationProduct({
        components: f.constituents.map((c) => c.type),
        primaryModeOfAction: f.pmoa,
        combinationType: 'single_entity',
      });
      expect(market.fdaLeadCenter).toBe(f.center);

      const res = await request(app()).get('/api/biologics/combination-products/classify').query({ primaryAction: f.pmoa });
      expect(res.status).toBe(200);
      expect(res.body.leadCenter).toBe(f.center);
    });
  }

  it('no /classify answer names a fixture product under a Center FDA does not give it', async () => {
    const wrong: string[] = [];
    for (const primaryAction of ['drug', 'device', 'biologic'] as const) {
      const res = await request(app()).get('/api/biologics/combination-products/classify').query({ primaryAction });
      expect(res.status).toBe(200);
      const text = JSON.stringify(res.body);
      for (const f of FIXTURES) {
        if (f.mention.test(text) && res.body.leadCenter !== f.center) {
          wrong.push(`${primaryAction}: ${f.product} listed under ${res.body.leadCenter}, FDA: ${f.center}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('PMOA is cited to 21 CFR 3.2(m) and assigned under 3.4', () => {
  it('/classify cites 3.2(m) and 3.4, and never 3.2(e) for the primary mode of action', async () => {
    const res = await request(app()).get('/api/biologics/combination-products/classify').query({ primaryAction: 'device' });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/3\.2\(e\)[^"]*primary mode of action/i);
    const ids = (res.body.citations ?? []).map((c: { id: string }) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['21 CFR 3.2(m)', '21 CFR 3.4']));
  });

  it('the canonical engine cites mode of action to 3.2(k) and PMOA to 3.2(m)', () => {
    const r = determinePrimaryModeOfAction({ constituents: [{ type: 'device', providesPrimaryTherapeuticEffect: true }] });
    const text = r.rationale.join('\n');
    expect(text).toMatch(/Mode of action \(21 CFR 3\.2\(k\)\)/);
    expect(text).toMatch(/Primary mode of action \(PMOA, 21 CFR 3\.2\(m\)/);
    expect(text).not.toMatch(/Mode of action \(21 CFR 3\.2\(m\)\)/);
  });

  it('the Part 3 citations carry a well-formed eCFR basis', () => {
    const byId = new Map(listCitations().map((c) => [c.id, c]));
    for (const id of ['21 CFR 3.2(e)', '21 CFR 3.2(k)', '21 CFR 3.2(m)', '21 CFR 3.4', '21 CFR 3.5', '21 CFR 3.7', '21 CFR 3.8']) {
      const c = byId.get(id);
      expect(c, id).toBeDefined();
      expect(c?.basis, id).toBeDefined();
      expect(basisProblems(c!.basis!), id).toEqual([]);
      expect(c!.basis!.url, id).toMatch(/^https:\/\/www\.ecfr\.gov\//);
    }
    expect(byId.get('21 CFR 3.7')?.description).toMatch(/Request for designation/i);
    expect(byId.get('21 CFR 3.8')?.description).toMatch(/letter of designation/i);
    expect(byId.get('21 CFR 3.5')?.description).not.toMatch(/Request for Designation/i);
  });
});

describe('Request for Designation: every engine recommends it and cites 21 CFR 3.7', () => {
  const RFD_AT_3_5 = /(Request for Designation|RFD)[^.]{0,40}21 CFR 3\.5\b/i;

  it('canonical: an indeterminate PMOA recommends an RFD under 3.7 and the letter under 3.8', () => {
    const r = determinePrimaryModeOfAction({ constituents: [{ type: 'drug' }, { type: 'device' }] });
    expect(r.recommendRequestForDesignation).toBe(true);
    const notes = r.notes.join('\n');
    expect(notes).toMatch(/21 CFR 3\.7/);
    expect(notes).toMatch(/letter of designation \(21 CFR 3\.8\)/i);
    expect(notes).not.toMatch(RFD_AT_3_5);
    const cat = classifyCategory({ constituentTypes: ['drug', 'device'], relationship: 'physically-combined' });
    expect(cat.notes.join('\n')).not.toMatch(RFD_AT_3_5);
    expect(cat.notes.join('\n')).toMatch(/21 CFR 3\.7/);
  });

  it('global-ri: no PMOA → OCP (RFD), citing 3.7', () => {
    const r = classifyRegion({ region: 'FDA' }) as FdaCombinationClassification;
    expect(r.leadCenter).toBe('OCP (RFD)');
    expect(r.notes.join('\n')).toMatch(/21 CFR 3\.7/);
    expect(r.citation).toMatch(/3\.2\(m\)/);
  });

  it('market-specs: no PMOA → no Center, an RFD citing 3.7', () => {
    const a = assessCombinationProduct({ components: ['drug', 'device'] });
    expect(a.fdaLeadCenter).toBeUndefined();
    expect(a.considerations.join('\n')).toMatch(/21 CFR 3\.7/);
  });
});

describe('21 CFR 3.2(e): one type of article is not a combination product', () => {
  it('two devices co-packaged are not a combination product, in either engine', () => {
    const cat = classifyCategory({ constituentTypes: ['device', 'device'], relationship: 'co-packaged' });
    expect(cat.isCombinationProduct).toBe(false);
    const m = assessCombinationProduct({ components: ['device', 'device'], combinationType: 'co_packaged' });
    expect(m.isCombination).toBe(false);
  });

  it('a drug co-packaged with a device is a 3.2(e)(2) combination product, in both', () => {
    const cat = classifyCategory({ constituentTypes: ['drug', 'device'], relationship: 'co-packaged' });
    expect(cat.isCombinationProduct).toBe(true);
    expect(cat.definitionSubparagraph).toBe('21 CFR 3.2(e)(2)');
    expect(assessCombinationProduct({ components: ['drug', 'device'], combinationType: 'co_packaged' }).isCombination).toBe(true);
  });
});

describe('fail closed on an unknown mode of action', () => {
  it('/classify and /requirements refuse an unknown primaryAction instead of answering "drug"', async () => {
    const a = await request(app()).get('/api/biologics/combination-products/classify').query({ primaryAction: 'cosmetic' });
    expect(a.status).toBe(400);
    const b = await request(app()).get('/api/biologics/combination-products/requirements').query({ primaryAction: 'cosmetic', targetAgency: 'FDA' });
    expect(b.status).toBe(400);
  });

  it('the global-ri classifier refuses an unknown PMOA instead of returning no Center', () => {
    expect(() => classifyRegion({ region: 'FDA', primaryModeOfAction: 'cosmetic' as never })).toThrow();
  });

  it('the canonical engine refuses an unknown constituent type instead of assigning CDRH', () => {
    expect(() => determinePrimaryModeOfAction({ constituents: [], assertedPmoaType: 'cosmetic' as never })).toThrow();
  });
});

describe('/requirements reads its Center from the canonical engine', () => {
  it('device PMOA → CDRH and a device application', async () => {
    const res = await request(app()).get('/api/biologics/combination-products/requirements').query({ primaryAction: 'device', targetAgency: 'FDA' });
    expect(res.status).toBe(200);
    expect(res.body.classification.leadCenter).toBe('CDRH');
    expect(res.body.classification.citations.map((c: { id: string }) => c.id)).toContain('21 CFR 3.2(m)');
    expect(res.body.submissionType).toMatch(/PMA|510\(k\)/);
  });
});

describe('one engine: the other three delegate, and the parallel copy is gone', () => {
  const KNOWLEDGE = /from ['"][./]*combination-products\/combination-products-knowledge(\.js)?['"]/;
  const OWN_CENTER_MAP = /drug:\s*'CDER'[\s\S]{0,80}device:\s*'CDRH'|device:\s*'CDRH'[\s\S]{0,80}drug:\s*'CDER'/;

  it('global-ri and market-specs import the canonical engine and keep no PMOA→Center map', () => {
    for (const p of ['server/services/global-ri/combination-product-classification.ts', 'server/services/market-specs/combination-products.ts']) {
      const s = src(p);
      expect(s, p).toMatch(KNOWLEDGE);
      expect(s, p).not.toMatch(OWN_CENTER_MAP);
    }
  });

  it('combination-product-service has no determinePrimaryMode, and the routes call the canonical engine', () => {
    expect(src('server/services/combination-product-service.ts')).not.toMatch(/determinePrimaryMode\s*\(/);
    const routes = src('server/routes/biologics-routes.ts');
    expect(routes).toMatch(/determinePrimaryModeOfAction/);
    expect(routes).not.toMatch(/\.determinePrimaryMode\(/);
  });
});
