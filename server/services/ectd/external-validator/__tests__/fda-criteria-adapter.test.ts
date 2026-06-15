import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  validateFdaCriteria,
  FdaCriteriaValidatorAdapter,
  resolveExternalValidator,
} from '..';

const dirs: string[] = [];

afterEach(async () => {
  while (dirs.length) {
    const d = dirs.pop()!;
    await fs.rm(d, { recursive: true, force: true });
  }
});

/** Materialize a package from a { relPath: contents } spec into a temp dir. */
async function makePackage(spec: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fda-pkg-'));
  dirs.push(root);
  for (const [rel, contents] of Object.entries(spec)) {
    const abs = path.join(root, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, contents);
  }
  return root;
}

const cleanPackage = {
  'index.xml': '<ectd/>',
  'util/index-md5.txt': 'abc  index.xml\n',
  'm1/us/us-regional.xml': '<fda-regional/>',
  'm1/us/cover-letter.pdf': '%PDF-1.7 cover',
};

function ids(findings: { ruleId: string }[]): string[] {
  return findings.map((f) => f.ruleId);
}

describe('validateFdaCriteria', () => {
  it('passes a structurally clean FDA package (with a subset-notice info finding)', async () => {
    const dir = await makePackage(cleanPackage);
    const r = await validateFdaCriteria({ packageDir: dir, region: 'fda' });
    expect(r.ran).toBe(true);
    expect(r.errorCount).toBe(0);
    expect(r.passed).toBe(true);
    expect(r.validator).toBe('fda-criteria-subset');
    // honesty disclaimer always present, never blocks
    expect(ids(r.findings)).toContain('C2C-SUBSET-NOTICE');
  });

  it('errors on a missing backbone, MD5 index, and regional backbone', async () => {
    const dir = await makePackage({ 'm1/us/cover-letter.pdf': 'x' }); // none of the required spine
    const r = await validateFdaCriteria({ packageDir: dir, region: 'fda' });
    expect(r.passed).toBe(false);
    expect(ids(r.findings)).toEqual(
      expect.arrayContaining(['FDA-BACKBONE-MISSING', 'FDA-MD5-INDEX-MISSING', 'FDA-REGIONAL-BACKBONE-MISSING']),
    );
  });

  it('errors on an empty (0-byte) leaf file', async () => {
    const dir = await makePackage({ ...cleanPackage, 'm1/us/empty.pdf': '' });
    const r = await validateFdaCriteria({ packageDir: dir, region: 'fda' });
    expect(r.passed).toBe(false);
    const empty = r.findings.find((f) => f.ruleId === 'FDA-EMPTY-FILE');
    expect(empty?.leafHref).toBe('m1/us/empty.pdf');
  });

  it('errors on file/folder names that violate FDA naming (uppercase / spaces)', async () => {
    const dir = await makePackage({ ...cleanPackage, 'm1/us/Bad Name.pdf': 'x' });
    const r = await validateFdaCriteria({ packageDir: dir, region: 'fda' });
    expect(ids(r.findings)).toContain('FDA-INVALID-NAME');
    expect(r.passed).toBe(false);
  });

  it('checks the correct regional backbone per region', async () => {
    const dir = await makePackage(cleanPackage); // has us-regional.xml only
    const ema = await validateFdaCriteria({ packageDir: dir, region: 'ema' });
    expect(ids(ema.findings)).toContain('FDA-REGIONAL-BACKBONE-MISSING');
  });
});

describe('FdaCriteriaValidatorAdapter + resolver', () => {
  const prior = process.env.EVALIDATOR_USE_FDA_CRITERIA_FALLBACK;
  const priorBin = process.env.EVALIDATOR_BINARY;
  const priorEp = process.env.EVALIDATOR_ENDPOINT;

  afterEach(() => {
    if (prior === undefined) delete process.env.EVALIDATOR_USE_FDA_CRITERIA_FALLBACK;
    else process.env.EVALIDATOR_USE_FDA_CRITERIA_FALLBACK = prior;
    if (priorBin === undefined) delete process.env.EVALIDATOR_BINARY;
    if (priorEp === undefined) delete process.env.EVALIDATOR_ENDPOINT;
  });

  it('is configured only when the opt-in flag is set', async () => {
    delete process.env.EVALIDATOR_USE_FDA_CRITERIA_FALLBACK;
    expect(await new FdaCriteriaValidatorAdapter().isConfigured()).toBe(false);
    process.env.EVALIDATOR_USE_FDA_CRITERIA_FALLBACK = 'true';
    expect(await new FdaCriteriaValidatorAdapter().isConfigured()).toBe(true);
  });

  it('resolver picks the FDA-criteria subset when enabled and LORENZ is absent', async () => {
    delete process.env.EVALIDATOR_BINARY;
    delete process.env.EVALIDATOR_ENDPOINT;
    process.env.EVALIDATOR_USE_FDA_CRITERIA_FALLBACK = 'true';
    const v = await resolveExternalValidator();
    expect(v.name).toBe('fda-criteria-subset');
  });

  it('resolver falls back to no-op when neither LORENZ nor the subset is enabled', async () => {
    delete process.env.EVALIDATOR_BINARY;
    delete process.env.EVALIDATOR_ENDPOINT;
    delete process.env.EVALIDATOR_USE_FDA_CRITERIA_FALLBACK;
    const v = await resolveExternalValidator();
    expect(v.name).toBe('noop');
  });
});
