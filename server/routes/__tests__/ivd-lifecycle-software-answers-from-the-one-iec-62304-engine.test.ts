/**
 * POST /api/ivd-lifecycle/software/* answer from the one IEC 62304 engine
 * (2026-10-15).
 *
 * The four software endpoints ran on server/services/regulatory/iec-62304-software.ts,
 * a second IEC 62304 engine beside market-specs/software-lifecycle.ts. Its
 * classifySoftwareSafety read an unstated `canContributeToHazard` as "no", so an
 * empty body answered
 *
 *   200 { safetyClass: 'A', rationale: 'Software cannot contribute to a hazardous situation.' }
 *
 * — the defect the canonical engine stopped making in 142a52bb4 — and its
 * per-class artifact list was a second, different deliverable set. /software/sdlc
 * with no safetyClass answered a TypeError's text; /software/sbom summed a
 * vulnerability count nobody recorded as 0. The routes now run classifySoftware /
 * assessSoftwareDeliverables / assessSoupItems (software-lifecycle.ts) and the
 * §524B engine's presence check (cybersecurity-524b.ts), and the duplicate is gone.
 */
import { describe, it, expect, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* The auth gate is not what these cases are about; it installs a user and passes. */
vi.mock('../../middleware/auth', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: unknown }).user = { id: 1, organizationId: 1 };
    next();
  },
}));

import router from '../ivd-lifecycle';
import { SOFTWARE_DELIVERABLES, deliverablesForClass } from '../../services/market-specs/software-lifecycle';
import { CYBER_524B_ARTIFACTS } from '../../services/regulatory/cybersecurity-524b';

const app = express();
app.use(express.json());
app.use('/api/ivd-lifecycle', router);

const post = (path: string, body: object) => request(app).post(`/api/ivd-lifecycle${path}`).send(body);
const ids = (list: Array<{ id: string }>) => list.map((d) => d.id);
const factKeys = (facts: string[]) => facts.map((f) => f.split(' ')[0]);

describe('POST /software/safety-class', () => {
  it('states no class from an empty body, and names the facts that decide it', async () => {
    const res = await post('/software/safety-class', {});
    expect(res.status).toBe(200);
    expect(res.body.safetyClass, 'an empty body was given a safety class').toBeUndefined();
    expect(res.body.class).toBe('undetermined');
    expect(factKeys(res.body.missingFacts)).toEqual(['canContributeToDeathOrSeriousInjury', 'canContributeToNonSeriousInjury']);
    expect(JSON.stringify(res.body)).not.toMatch(/cannot contribute to a hazardous situation/i);
    // No deliverable is dropped before the class is known.
    expect(ids(res.body.deliverables)).toEqual(ids(SOFTWARE_DELIVERABLES));
    expect(Array.isArray(res.body.knowledge)).toBe(true);
  });

  it('classifies from stated harm facts, with that class’s deliverables', async () => {
    const cases: Array<[object, 'A' | 'B' | 'C']> = [
      [{ canContributeToDeathOrSeriousInjury: true }, 'C'],
      [{ canContributeToDeathOrSeriousInjury: false, canContributeToNonSeriousInjury: true }, 'B'],
      [{ canContributeToDeathOrSeriousInjury: false, canContributeToNonSeriousInjury: false }, 'A'],
    ];
    for (const [facts, cls] of cases) {
      const res = await post('/software/safety-class', facts);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ class: cls, missingFacts: [] });
      expect(ids(res.body.deliverables)).toEqual(ids(deliverablesForClass(cls)));
    }
  });

  it('refuses the retired input keys by name rather than ignoring a stated answer', async () => {
    const res = await post('/software/safety-class', { canContributeToHazard: false, worstCaseHarm: 'none', externalRiskControlRemovesHazard: false });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/canContributeToHazard/);
    expect(res.body.error).toMatch(/canContributeToDeathOrSeriousInjury/);
  });

  it('refuses a harm fact that is not true or false', async () => {
    const res = await post('/software/safety-class', { canContributeToDeathOrSeriousInjury: 'no' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/canContributeToDeathOrSeriousInjury/);
  });
});

describe('POST /software/sdlc', () => {
  it('assesses against the canonical deliverable set for the class', async () => {
    const res = await post('/software/sdlc', { safetyClass: 'C', present: ['development_plan', 'requirements'] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ class: 'C', ready: false, presentCount: 2, totalRequired: deliverablesForClass('C').length });
    expect(res.body.missing).toEqual(expect.arrayContaining(['architecture', 'detailed_design']));
  });

  it('refuses a missing or undetermined class instead of assessing against no set', async () => {
    for (const body of [{ present: [] }, { safetyClass: 'undetermined', present: [] }]) {
      const res = await post('/software/sdlc', body);
      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/safetyClass must be one of: A, B, C/);
    }
  });

  it('refuses a deliverable id the engine does not know, naming it', async () => {
    const res = await post('/software/sdlc', { safetyClass: 'A', present: ['software_requirements'] });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/software_requirements/);
  });
});

describe('POST /software/sbom', () => {
  it('lists SOUP gaps and does not count an unrecorded vulnerability count as zero', async () => {
    const res = await post('/software/sbom', {
      components: [
        { name: 'openssl', version: '3.0', requirementsDocumented: true, anomaliesEvaluated: false, knownVulnerabilities: 2 },
        { name: 'zlib', version: '1.3', requirementsDocumented: true, anomaliesEvaluated: true },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      componentCount: 2,
      unevaluatedAnomalies: ['openssl@3.0'],
      missingRequirements: [],
      totalKnownVulnerabilities: null,
      vulnerabilityCountNotRecorded: ['zlib@1.3'],
      complete: false,
    });
  });

  it('refuses a body with no components list', async () => {
    const res = await post('/software/sbom', {});
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/components/);
  });
});

// 2026-10-15: these posted the §524B engine's own camelCase ids ('threatModel') with
// no cyber-device status and pinned `ready: false`, and refused CYBER_ITEMS'
// 'threat_model' as unknown. The ids are CYBER_ITEMS' now, and §524B needs a cyber device.
describe('POST /software/cybersecurity', () => {
  it('reports the §524B artifacts present and missing for a cyber device', async () => {
    const res = await post('/software/cybersecurity', { cyberDevice: true, present: ['sbom', 'threat_model'] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'required', present: ['sbom', 'threat_model'], allPresent: false });
    expect(res.body.gaps).toHaveLength(CYBER_524B_ARTIFACTS.length - 2);
  });

  it('refuses an artifact id the engine does not know, naming it', async () => {
    const res = await post('/software/cybersecurity', { cyberDevice: true, present: ['threatModel'] });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/threatModel/);
  });
});

it('the second IEC 62304 engine is gone', () => {
  const duplicate = fileURLToPath(new URL('../../services/regulatory/iec-62304-software.ts', import.meta.url));
  expect(existsSync(duplicate)).toBe(false);
});
