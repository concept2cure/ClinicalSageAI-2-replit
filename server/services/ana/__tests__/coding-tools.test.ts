/**
 * License-gated medical-coding tools (code_meddra / code_whodrug).
 *
 * Verifies the Lane C foundation is honest-by-construction:
 *   - With NO dictionary configured the tools FAIL CLOSED with status
 *     license_required and emit no fabricated code.
 *   - With a tiny SYNTHETIC (clearly non-licensed) fixture configured, an exact
 *     term maps to the expected PT/ingredient, a synonym still resolves, and an
 *     unknown term returns a clean no_match (never a throw, never a guess).
 * Exercised through the public getToolHandler() seam to also guard the wiring.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { getToolHandler } from '../AnaToolExecutor';
import { CODING_TOOLS } from '../codingTools';
import { MedicalCodingService } from '../../medical-coding/medical-coding-service';

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'medical-coding',
  '__fixtures__',
);
const MEDDRA_FIXTURE = path.join(FIXTURES, 'synthetic-meddra.json');
const WHODRUG_FIXTURE = path.join(FIXTURES, 'synthetic-whodrug.json');

const ctx = {} as any;

async function call(name: string, input: Record<string, unknown>) {
  const handler = getToolHandler(name);
  expect(handler, `handler for ${name} must be registered`).toBeTruthy();
  const raw = await handler!(input, ctx);
  return JSON.parse(raw as string);
}

describe('coding tools — registration', () => {
  it('every defined coding tool has a registered handler', () => {
    expect(CODING_TOOLS.map((t) => t.name)).toEqual(['code_meddra', 'code_whodrug']);
    for (const tool of CODING_TOOLS) {
      expect(getToolHandler(tool.name), `${tool.name} handler`).toBeTruthy();
    }
  });
});

describe('coding tools — fail closed without a license', () => {
  const ENV_KEYS = ['MEDDRA_DICTIONARY_PATH', 'WHODRUG_DICTIONARY_PATH'];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('code_meddra returns license_required and no fabricated code', async () => {
    const out = await call('code_meddra', { term: 'headache' });
    expect(out.status).toBe('license_required');
    expect(out.dictionary).toBe('MedDRA');
    expect(out.ptCode).toBeUndefined();
    expect(typeof out.message).toBe('string');
  });

  it('code_whodrug returns license_required and no fabricated code', async () => {
    const out = await call('code_whodrug', { drugName: 'paracetamol' });
    expect(out.status).toBe('license_required');
    expect(out.dictionary).toBe('WHODrug');
    expect(out.atcCode).toBeUndefined();
  });

  it('code_meddra still validates required input as needs_parameters', async () => {
    const out = await call('code_meddra', { term: '   ' });
    expect(out.status).toBe('needs_parameters');
  });
});

describe('medical-coding service — MedDRA over the synthetic fixture', () => {
  const svc = new MedicalCodingService({ meddraPath: MEDDRA_FIXTURE });

  it('reports the dictionary as licensed when a path is configured', () => {
    expect(svc.isMeddraLicensed()).toBe(true);
  });

  it('maps an exact PT name to its expected PT code with confidence 1', () => {
    const out = svc.codeMeddra('Synthetic nausea');
    expect(out.status).toBe('coded');
    if (out.status === 'coded') {
      expect(out.ptCode).toBe('00000002');
      expect(out.ptName).toBe('Synthetic nausea');
      expect(out.matchType).toBe('exact');
      expect(out.confidence).toBe(1);
      expect(out.soc).toBe('Synthetic gastrointestinal disorders');
    }
  });

  it('resolves an LLT synonym to its Preferred Term', () => {
    const out = svc.codeMeddra('synthetic queasiness');
    expect(out.status).toBe('coded');
    if (out.status === 'coded') {
      expect(out.ptCode).toBe('00000002');
      expect(out.matchType).toBe('synonym');
      expect(out.llt).toBe('synthetic queasiness');
    }
  });

  it('returns a clean no_match for an unknown term (no throw, no guess)', () => {
    const out = svc.codeMeddra('zzz unknown nonexistent term');
    expect(out.status).toBe('no_match');
    expect((out as any).ptCode).toBeUndefined();
  });
});

describe('medical-coding service — WHODrug over the synthetic fixture', () => {
  const svc = new MedicalCodingService({ whodrugPath: WHODRUG_FIXTURE });

  it('maps an exact ingredient to its ATC code', () => {
    const out = svc.codeWhodrug('Synthacillin');
    expect(out.status).toBe('coded');
    if (out.status === 'coded') {
      expect(out.ingredient).toBe('Synthacillin');
      expect(out.atcCode).toBe('Z02BB02');
      expect(out.matchType).toBe('exact');
    }
  });

  it('resolves a trade-name synonym to the ingredient', () => {
    const out = svc.codeWhodrug('Synthadol');
    expect(out.status).toBe('coded');
    if (out.status === 'coded') {
      expect(out.ingredient).toBe('Synthetacetamol');
      expect(out.atcCode).toBe('Z01AA01');
      expect(out.matchType).toBe('synonym');
    }
  });

  it('returns a clean no_match for an unknown drug', () => {
    const out = svc.codeWhodrug('definitely-not-a-real-drug');
    expect(out.status).toBe('no_match');
  });
});

describe('coding tools — handler path activates with the fixture via env', () => {
  let savedMeddra: string | undefined;

  beforeEach(() => {
    savedMeddra = process.env.MEDDRA_DICTIONARY_PATH;
    process.env.MEDDRA_DICTIONARY_PATH = MEDDRA_FIXTURE;
  });
  afterEach(() => {
    if (savedMeddra === undefined) delete process.env.MEDDRA_DICTIONARY_PATH;
    else process.env.MEDDRA_DICTIONARY_PATH = savedMeddra;
  });

  it('code_meddra codes an exact term over the env-configured fixture', async () => {
    const out = await call('code_meddra', { term: 'Synthetic headache' });
    expect(out.status).toBe('coded');
    expect(out.ptCode).toBe('00000001');
    expect(out.engine).toBe('deterministic');
  });
});
