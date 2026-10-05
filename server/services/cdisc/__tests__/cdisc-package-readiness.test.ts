/**
 * CDISC dataset-package readiness — dispatches SDTM/ADaM datasets to the right
 * checker, checks the datasets FDA's Technical Rejection Criteria for Study Data
 * require (1734, 1736), and rolls up one package verdict.
 */

import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { assessPackageReadiness, assessStudyDataRequirements, type PackageDataset } from '../cdisc-package-readiness';
import { runCdiscPipeline } from '../pipeline';
import { checkSdtmDomainConformance, SDTM_KNOWN_DOMAINS } from '../sdtm-domain-conformance-checker';
import { BDS_REQUIRED, BDS_EXPECTED } from '../adam-bds-conformance-checker';
import { OCCDS_REQUIRED, OCCDS_EXPECTED } from '../adam-occds-conformance-checker';
import { ADSL_REQUIRED, ADSL_EXPECTED } from '../adam-adsl-conformance-checker';
import { FDA_STUDY_DATA_TRC } from '../../ind/ctd/regulatory-basis';
import cdiscRouter from '../../../routes/cdisc-validation.routes';

// Route logic only: pass the rate limiter through.
vi.mock('../../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: any, _res: any, next: any) => next(),
  default: (_req: any, _res: any, next: any) => next(),
}));

const dm: PackageDataset = {
  name: 'DM',
  standard: 'SDTM',
  domainOrClass: 'DM',
  variables: [
    { name: 'STUDYID', dataType: 'Char' }, { name: 'DOMAIN', dataType: 'Char' }, { name: 'USUBJID', dataType: 'Char' },
    { name: 'SUBJID', dataType: 'Char' }, { name: 'RFSTDTC', dataType: 'Char' }, { name: 'RFENDTC', dataType: 'Char' },
    { name: 'SITEID', dataType: 'Char' }, { name: 'AGE', dataType: 'Num' }, { name: 'AGEU', dataType: 'Char', controlledTerms: ['YEARS'] },
    { name: 'SEX', dataType: 'Char', controlledTerms: ['M', 'F'] }, { name: 'RACE', dataType: 'Char' }, { name: 'ETHNIC', dataType: 'Char' },
    { name: 'ARM', dataType: 'Char' }, { name: 'ARMCD', dataType: 'Char' }, { name: 'COUNTRY', dataType: 'Char' },
  ],
};

const adsl: PackageDataset = {
  name: 'ADSL',
  standard: 'ADaM',
  domainOrClass: 'ADSL',
  variables: [{ name: 'STUDYID', dataType: 'Char' }, { name: 'USUBJID', dataType: 'Char' }, { name: 'SAFFL', dataType: 'Char', controlledTerms: ['Y', 'N'] }],
};

describe('assessPackageReadiness', () => {
  it('rolls up a mixed SDTM + ADaM package', () => {
    const res = assessPackageReadiness({ studyName: 'C2C-001', datasets: [dm, adsl] });
    expect(res.summary.datasetCount).toBe(2);
    expect(res.datasets.map((d) => d.dataset)).toEqual(['DM', 'ADSL']);
    expect(res.datasets.every((d) => d.recognized)).toBe(true);
  });

  it('is not ready when a dataset has an SDTM conformance error', () => {
    const broken: PackageDataset = { ...dm, variables: dm.variables.filter((v) => v.name !== 'STUDYID') };
    const res = assessPackageReadiness({ datasets: [broken] });
    expect(res.ready).toBe(false);
    expect(res.summary.totalErrors).toBeGreaterThan(0);
    expect(res.datasets[0].findingCodes).toContain('MISSING_REQUIRED');
  });

  it('dispatches ADaM by class (ADSL/BDS/OCCDS)', () => {
    const bds: PackageDataset = { name: 'ADLB', standard: 'ADaM', domainOrClass: 'BDS', variables: [{ name: 'STUDYID', dataType: 'Char' }, { name: 'USUBJID', dataType: 'Char' }, { name: 'PARAMCD', dataType: 'Char' }, { name: 'PARAM', dataType: 'Char' }, { name: 'AVAL', dataType: 'Num' }] };
    const occds: PackageDataset = { name: 'ADAE', standard: 'ADaM', domainOrClass: 'OCCDS', variables: [{ name: 'STUDYID', dataType: 'Char' }, { name: 'USUBJID', dataType: 'Char' }, { name: 'AEDECOD', dataType: 'Char' }, { name: 'TRTA', dataType: 'Char' }] };
    const res = assessPackageReadiness({ datasets: [bds, occds] });
    expect(res.datasets[0].domainOrClass).toBe('BDS');
    expect(res.datasets[1].domainOrClass).toBe('OCCDS');
    expect(res.datasets.every((d) => d.recognized)).toBe(true);
  });

  it('flags an unrecognized dataset (unknown domain/class) as not ready', () => {
    const res = assessPackageReadiness({ datasets: [{ name: 'XX', standard: 'SDTM', domainOrClass: 'ZZZ', variables: [] }] });
    expect(res.datasets[0].recognized).toBe(false);
    expect(res.datasets[0].findingCodes).toContain('UNRECOGNIZED_DATASET');
    expect(res.ready).toBe(false);
    expect(res.summary.unrecognized).toBe(1);
  });

  it('is not ready for an empty package', () => {
    expect(assessPackageReadiness({ datasets: [] }).ready).toBe(false);
  });

  it('is deterministic', () => {
    expect(assessPackageReadiness({ datasets: [dm, adsl] })).toEqual(assessPackageReadiness({ datasets: [dm, adsl] }));
  });
});

// ── FDA Technical Rejection Criteria for Study Data (1734, 1736) ─────────────
// A package the TRC would reject must never read ready, and a TS dataset — the
// one 1734 requires for every study — must be checkable at all.

const vars = (...lists: ReadonlyArray<ReadonlyArray<{ name: string; dataType: 'Char' | 'Num' }>>) =>
  lists.flat().map((v) => ({ name: v.name, dataType: v.dataType }));

const bdsADLB: PackageDataset = {
  name: 'ADLB', standard: 'ADaM', domainOrClass: 'BDS',
  variables: [...vars(BDS_REQUIRED, BDS_EXPECTED), { name: 'AVAL', dataType: 'Num' }, { name: 'ADT', dataType: 'Num' }],
};
const occdsADAE: PackageDataset = { name: 'ADAE', standard: 'ADaM', domainOrClass: 'OCCDS', variables: vars(OCCDS_REQUIRED, OCCDS_EXPECTED) };
const fullAdsl: PackageDataset = { name: 'ADSL', standard: 'ADaM', domainOrClass: 'ADSL', variables: vars(ADSL_REQUIRED, ADSL_EXPECTED) };
/** FDA's simplified ts.xpt: STUDYID, TSPARMCD, TSVAL, TSVALNF only. */
const simplifiedTs: PackageDataset = {
  name: 'TS', standard: 'SDTM', domainOrClass: 'TS',
  variables: [
    { name: 'STUDYID', dataType: 'Char' }, { name: 'TSPARMCD', dataType: 'Char' },
    { name: 'TSVAL', dataType: 'Char' }, { name: 'TSVALNF', dataType: 'Char' },
  ],
};
const fullTs: PackageDataset = {
  ...simplifiedTs,
  variables: [
    ...simplifiedTs.variables,
    { name: 'DOMAIN', dataType: 'Char' }, { name: 'TSSEQ', dataType: 'Num' }, { name: 'TSPARM', dataType: 'Char' },
    { name: 'TSVALCD', dataType: 'Char' }, { name: 'TSVCDREF', dataType: 'Char' }, { name: 'TSVCDVER', dataType: 'Char' },
  ],
};
const mh: PackageDataset = {
  name: 'MH', standard: 'SDTM', domainOrClass: 'MH',
  variables: [{ name: 'STUDYID', dataType: 'Char' }, { name: 'DOMAIN', dataType: 'Char' }, { name: 'USUBJID', dataType: 'Char' }],
};
const req = (r: { requirements: Array<{ id: string; state: string }> }, id: string) => r.requirements.find((x) => x.id === id)?.state;

describe('assessPackageReadiness — FDA study-data TRC requirements', () => {
  it('an ADaM package with no TS, DM or ADSL is not ready and names TRC 1734 and 1736', () => {
    const res = assessPackageReadiness({ datasets: [bdsADLB, occdsADAE] });
    // Each dataset on its own is conformant; the package is still rejectable.
    expect(res.datasets.every((d) => d.ready)).toBe(true);
    expect(res.ready).toBe(false);
    expect(req(res, 'TRC_1734_NO_TS')).toBe('missing');
    expect(req(res, 'TRC_1736_NO_ADSL')).toBe('missing');
    // DM is an SDTM requirement; with no SDTM, it is a note, not a TRC row.
    expect(req(res, 'TRC_1736_NO_DM')).toBeUndefined();
    expect(res.notes.map((n) => n.id)).toContain('ADAM_WITHOUT_SDTM');
    expect(res.notes.find((n) => n.id === 'ADAM_WITHOUT_SDTM')!.basis.confidence).toBe('recall');
  });

  it("recognises FDA's simplified ts.xpt as a conformant TS", () => {
    const res = assessPackageReadiness({ datasets: [simplifiedTs] });
    expect(res.datasets[0].recognized).toBe(true);
    expect(res.datasets[0].findingCodes).not.toContain('UNRECOGNIZED_DATASET');
    expect(res.datasets[0].ready).toBe(true);
  });

  it('recognises the full TS form, and requires STUDYID and TSPARMCD', () => {
    expect(checkSdtmDomainConformance({ domain: 'TS', variables: fullTs.variables }).ready).toBe(true);
    const noParm = checkSdtmDomainConformance({ domain: 'TS', variables: fullTs.variables.filter((v) => v.name !== 'TSPARMCD') });
    expect(noParm.ready).toBe(false);
    expect(noParm.missingRequired).toEqual(['TSPARMCD']);
  });

  it('[DM, ADSL] without TS is not ready and names TRC_1734_NO_TS', () => {
    const res = assessPackageReadiness({ datasets: [dm, fullAdsl] });
    expect(res.ready).toBe(false);
    expect(req(res, 'TRC_1734_NO_TS')).toBe('missing');
    expect(req(res, 'TRC_1736_NO_DM')).toBe('met');
    expect(req(res, 'TRC_1736_NO_ADSL')).toBe('met');
    expect(res.reasons.join(' ')).toContain('TRC_1734_NO_TS');
  });

  it('define.xml is not-stated unless the caller declares it, and never met by default', () => {
    const res = assessPackageReadiness({ datasets: [dm, fullAdsl, simplifiedTs], tsParameters: ['SSTDTC'] });
    expect(req(res, 'TRC_1736_DEFINE_SDTM')).toBe('not-stated');
    expect(req(res, 'TRC_1736_DEFINE_ADAM')).toBe('not-stated');
    expect(res.ready).toBe(false);
    const declaredAbsent = assessPackageReadiness({ datasets: [dm, fullAdsl, simplifiedTs], defineXml: { sdtm: false, adam: true } });
    expect(req(declaredAbsent, 'TRC_1736_DEFINE_SDTM')).toBe('missing');
    expect(req(declaredAbsent, 'TRC_1736_DEFINE_ADAM')).toBe('met');
  });

  it('the study start date: missing without SSTDTC, not-stated when TS parameters are not supplied', () => {
    const base = { datasets: [dm, fullAdsl, simplifiedTs], defineXml: { sdtm: true, adam: true } };
    expect(req(assessPackageReadiness({ ...base, tsParameters: ['TITLE'] }), 'TRC_1734_SSTDTC')).toBe('missing');
    expect(req(assessPackageReadiness(base), 'TRC_1734_SSTDTC')).toBe('not-stated');
    expect(req(assessPackageReadiness({ ...base, tsParameters: ['sstdtc'] }), 'TRC_1734_SSTDTC')).toBe('met');
    // No TS at all: there is nowhere for the start date to be.
    expect(req(assessPackageReadiness({ ...base, datasets: [dm, fullAdsl], tsParameters: ['SSTDTC'] }), 'TRC_1734_SSTDTC')).toBe('missing');
  });

  it('a complete, declared package passes', () => {
    const res = assessPackageReadiness({
      datasets: [dm, simplifiedTs, fullAdsl, bdsADLB, occdsADAE],
      defineXml: { sdtm: true, adam: true },
      tsParameters: ['SSTDTC', 'TITLE'],
    });
    expect(res.requirements.every((r) => r.state === 'met')).toBe(true);
    expect(res.reasons).toEqual([]);
    expect(res.ready).toBe(true);
  });

  it('a known SDTM domain with no spec is not-conformance-checked, not unrecognised, and keeps ready false', () => {
    const res = assessPackageReadiness({
      datasets: [dm, simplifiedTs, mh],
      defineXml: { sdtm: true },
      tsParameters: ['SSTDTC'],
    });
    const mhRes = res.datasets.find((d) => d.dataset === 'MH')!;
    expect(mhRes.recognized).toBe(true);
    expect(mhRes.conformanceChecked).toBe(false);
    expect(mhRes.findingCodes).toEqual(['NOT_CONFORMANCE_CHECKED']);
    expect(mhRes.ready).toBe(false);
    expect(res.summary.unrecognized).toBe(0);
    expect(res.summary.notChecked).toBe(1);
    expect(res.ready).toBe(false);
    expect(res.reasons).toContain('1 dataset not conformance-checked');
    expect(SDTM_KNOWN_DOMAINS).toContain('MH');
  });

  it('every requirement carries the FDA TRC basis', () => {
    const r = assessStudyDataRequirements({ datasets: [dm, fullAdsl] });
    expect(r.requirements.length).toBeGreaterThan(0);
    for (const x of r.requirements) expect(x.basis).toBe(FDA_STUDY_DATA_TRC);
    expect(assessStudyDataRequirements({ datasets: [] }).requirements).toEqual([]);
  });

  it('runCdiscPipeline reads its ADSL finding from the canonical requirement', () => {
    const r = runCdiscPipeline({
      studyName: 'S', standard: 'ADaM',
      datasets: [{ name: 'ADAE', label: 'AE Analysis', variables: [
        { name: 'STUDYID', label: 'Study', type: 'text', length: 20 },
        { name: 'USUBJID', label: 'Subject', type: 'text', length: 30 },
      ] }],
    });
    const canonical = assessStudyDataRequirements({ datasets: [{ name: 'ADAE', standard: 'ADaM' }] })
      .requirements.find((x) => x.id === 'TRC_1736_NO_ADSL')!;
    const finding = r.findings.find((f) => f.rule === 'adam.adsl')!;
    expect(finding.message).toBe(canonical.message);
  });
});

describe('POST /api/cdisc-validation/package/readiness — defineXml and tsParameters', () => {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use((req, _res, next) => {
    (req as any).user = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
    next();
  });
  app.use('/api/cdisc-validation', cdiscRouter);
  const url = '/api/cdisc-validation/package/readiness';

  it('passes declared define.xml and TS parameters through to the engine', async () => {
    const res = await request(app).post(url).send({
      datasets: [dm, simplifiedTs, fullAdsl],
      defineXml: { sdtm: true, adam: true },
      tsParameters: ['SSTDTC'],
    });
    expect(res.status).toBe(200);
    expect(res.body.reasons).toEqual([]);
    expect(res.body.ready).toBe(true);
  });

  it.each([
    ['defineXml not an object', { defineXml: true }],
    ['defineXml with a non-boolean', { defineXml: { sdtm: 'yes' } }],
    ['defineXml with an unknown key', { defineXml: { send: true } }],
    ['tsParameters not an array', { tsParameters: 'SSTDTC' }],
    ['tsParameters with a non-string', { tsParameters: ['SSTDTC', 3] }],
  ])('400 when %s', async (_label, extra) => {
    const res = await request(app).post(url).send({ datasets: [dm], ...extra });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });
});
