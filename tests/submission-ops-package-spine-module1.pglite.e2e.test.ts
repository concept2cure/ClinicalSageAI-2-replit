/**
 * The package-model spine's FDA Module 1 and its own conformance verdicts, end
 * to end: the REAL assemble route, REAL SQL (PGlite), the REAL packager and the
 * REAL ZIP (package-spine sweep, owed lenses, 2026-10-08).
 *
 *   VP-1  the Form FDA 1571 rule runs for every IND sequence, 0000 included;
 *   VP-2  it is met only by a 1.1 leaf whose BYTES are FDA's form as issued and
 *         completed — on this route every leaf is a rendering of artifact text,
 *         so a mapped "1571" is reported as a rendering, a Form FDA 3674 does not
 *         count, and neither does FDA's blank form;
 *   F20   Form FDA 1571 and 356h are written once, in the us-regional admin
 *         `<submission-information><form form-type>`, not under `m1-1-forms` —
 *         and only a leaf whose bytes ARE that form is declared one; an NDA,
 *         ANDA or BLA original is held to the 356h as an IND is to the 1571;
 *   HS-2  the packager's non-conformant backbone and missing DTDs are warnings
 *         the operator sees at assembly, not facts stored out of sight;
 *   VP-7  the path the validator is handed is the path the zip carries.
 *
 * The seed and helpers are tests/support/package-spine-e2e.harness.ts.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { promises as fs } from 'fs';

// BUNDLE_DIR binds when the route module loads, so it is set before any import.
const { bundleDir } = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR || '/tmp'}/pkg-spine-m1-e2e-${process.pid}`;
  process.env.SUBMISSION_BUNDLE_DIR = dir;
  return { bundleDir: dir };
});

vi.mock('../server/routes/c2c/actions', () => ({
  recordGovernedAction: vi.fn(async () => ({ actionId: 'act_x', auditId: 'aud_x', sha256Chain: 'c' })),
}));
vi.mock('../server/db', async () => {
  const { pg: db, drizzleDb } = await import('./support/package-spine-pglite');
  return {
    db: drizzleDb,
    pool: {
      connect: async () => ({ query: (sql: string, params?: unknown[]) => db.query(sql, params ?? []), release: () => {} }),
      query: (sql: string, params?: unknown[]) => db.query(sql, params ?? []),
    },
  };
});
// Engines the router imports that this path never calls.
vi.mock('../server/submission-ops/policy-engine', () => ({ resolvePolicy: vi.fn(), resolveAllPolicies: vi.fn() }));
vi.mock('../server/submission-ops/readiness-engine', () => ({ computePackageReadiness: vi.fn() }));
vi.mock('../server/submission-ops/automation-runner', () => ({ runAutomationSweep: vi.fn() }));
vi.mock('../server/services/intelligence/index.js', () => ({ getProjectSignals: vi.fn(), analyzeCrossArtifactIntelligence: vi.fn() }));
vi.mock('../server/services/regulatory-correspondence/operating-layer', () => ({ readCanonicalDueSoonAndWorkload: vi.fn() }));
vi.mock('../server/src/services/ectd', () => ({ buildECTDZip: vi.fn() }));
// The real renderer and the real validator, observed: one case swaps a leaf's
// rendering for FDA's own form, one reads the paths the validator was handed.
vi.mock('../server/services/ectd/leaf-pdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/services/ectd/leaf-pdf')>();
  return { ...actual, buildLeafPdf: vi.fn(actual.buildLeafPdf) };
});
vi.mock('../server/services/submission-gateways/ectd-structural-validator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/services/submission-gateways/ectd-structural-validator')>();
  return { ...actual, validateEctdLeafs: vi.fn(actual.validateEctdLeafs) };
});
// The real security verdict; one case stands in for a verdict no vendored form can earn.
vi.mock('../server/services/ectd/leaf-pdf-security', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/services/ectd/leaf-pdf-security')>();
  return { ...actual, assessLeafPdfSecurity: vi.fn(actual.assessLeafPdfSecurity) };
});

import { buildLeafPdf } from '../server/services/ectd/leaf-pdf';
import { assessLeafPdfSecurity } from '../server/services/ectd/leaf-pdf-security';
import { validateEctdLeafs } from '../server/services/submission-gateways/ectd-structural-validator';
import { generateIndForm } from '../server/services/ind-forms/ind-form-fill-service';
import { indFormTemplatePath } from '../server/services/ind-forms/template-locations';
import { pg } from './support/package-spine-pglite';
import {
  PKG, IND_AMENDMENT, seed, assemble, storedBundle, fileTheStoredBundle, assertInternallyConsistent, mapFormSection,
} from './support/package-spine-e2e.harness';

type Finding = { severity: string; ruleId: string; message: string; filePath?: string };
const byRule = (findings: Finding[], id: string) => findings.filter((f) => f.ruleId === id);
const usRegional = async () => (await storedBundle()).zip.file('m1/us/us-regional.xml')!.async('string');
/** The XML between an element's open and close tags, or null when absent. */
const inner = (xml: string, element: string) => new RegExp(`<${element}>([\\s\\S]*?)</${element}>`).exec(xml)?.[1] ?? null;
const setFamily = (family: string) => pg.query(`UPDATE c2c_submission_packages SET package_family = $2 WHERE id = $1`, [PKG, family]);
/** Ship `bytes` as they are for each leaf titled `title…`, in place of the page
 *  the route renders: what a leaf source carrying the filed file would ship. */
const shipAsIs = (title: string, bytes: Buffer) => {
  const render = vi.mocked(buildLeafPdf).getMockImplementation()!;
  vi.mocked(buildLeafPdf).mockImplementation(async (input) => (input.title.startsWith(title) ? bytes : render(input)));
};
/** Form FDA 1571 completed by the IND lane's fill service, on the form as FDA issued it. */
let completed1571: Promise<Buffer> | undefined;
const aCompleted1571 = () =>
  (completed1571 ??= generateIndForm('FDA_1571', { sponsorName: 'Acme Biologics Inc', indNumber: '123456', serialNumber: '0000' } as never).then(
    (r) => Buffer.from(r.pdfBytes),
  ));

beforeEach(async () => {
  // Back to the real renderer and the real security verdict (vitest 4 restores
  // the implementation each vi.fn was created with).
  vi.mocked(buildLeafPdf).mockReset();
  vi.mocked(assessLeafPdfSecurity).mockReset();
  vi.mocked(validateEctdLeafs).mockClear();
  await seed();
});
afterAll(async () => {
  await fs.rm(bundleDir, { recursive: true, force: true }).catch(() => {});
});

describe('Form FDA 1571 on every IND sequence, judged on the bytes that ship (VP-1, VP-2)', () => {
  it('an IND original that carries no Form FDA 1571 is blocked', async () => {
    const res = await assemble();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { bundle } = await storedBundle();
    expect(byRule(bundle.validation.findings, 'M1-FORM-1571-MISSING')).toEqual([
      expect.objectContaining({ severity: 'error', message: expect.stringMatching(/Sequence 0000 .*21 CFR 312\.23\(a\)\(1\)/) }),
    ]);
    expect(res.body.data.bundle.validation.errorCount).toBeGreaterThanOrEqual(1);
  });

  it('a mapped "Form FDA 1571" is a page rendered from artifact text, and a distinct error says so', async () => {
    await mapFormSection(20, 'form-1571', 'Form FDA 1571');
    const res = await assemble();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { bundle } = await storedBundle();
    expect(byRule(bundle.validation.findings, 'M1-FORM-1571-MISSING')).toEqual([]);
    const [finding, ...more] = byRule(bundle.validation.findings, 'M1-FORM-1571-NOT-FDA-FORM');
    expect(more).toEqual([]);
    expect(finding).toMatchObject({ severity: 'error', filePath: expect.stringMatching(/^m1\/us\/1-1\/form-1571-/) });
    expect(finding.message).toMatch(/form-1571-\S+\.pdf is a page rendered from its artifact’s text/);
    expect(finding.message).toMatch(/not a page rendered from text/);
  });

  it('a follow-up whose only form is a Form FDA 3674 does not carry the 1571', async () => {
    expect((await assemble()).status).toBe(200);
    await fileTheStoredBundle('original');
    await mapFormSection(21, 'form-3674', 'Form FDA 3674');
    const res = await assemble({ sequence: '0001', ...IND_AMENDMENT });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { bundle } = await storedBundle();
    expect(bundle.leafManifest.map((l: { ctdSection: string }) => l.ctdSection)).toEqual(['1.1']);
    expect(byRule(bundle.validation.findings, 'M1-FORM-1571-NOT-FDA-FORM')).toEqual([
      expect.objectContaining({ severity: 'error', message: expect.stringMatching(/form-3674-\S+\.pdf is a page rendered/) }),
    ]);
  });

  it('FDA’s own Form FDA 3674 at 1.1 is named as that form, in the words the operator reads, not as the 1571', async () => {
    shipAsIs('Form FDA 3674', await fs.readFile(indFormTemplatePath('FDA_3674')));
    await mapFormSection(20, 'form-3674', 'Form FDA 3674');
    expect((await assemble()).status).toBe(200);
    const { bundle } = await storedBundle();
    const [finding] = byRule(bundle.validation.findings, 'M1-FORM-1571-NOT-FDA-FORM');
    expect(finding?.message).toMatch(/form-3674-\S+\.pdf is FDA’s blank Form FDA 3674, not Form FDA 1571/);
    expect(finding?.message).not.toMatch(/FDA_/);
  });

  it('FDA’s blank Form FDA 1571, byte for byte, is not a completed one: the finding names it, and it is not declared a form', async () => {
    shipAsIs('Form FDA 1571', await fs.readFile(indFormTemplatePath('FDA_1571')));
    await mapFormSection(20, 'form-1571', 'Form FDA 1571');
    expect((await assemble()).status).toBe(200);
    const { bundle } = await storedBundle();
    expect(byRule(bundle.validation.findings, 'M1-FORM-1571-NOT-FDA-FORM')).toEqual([
      expect.objectContaining({ severity: 'error', message: expect.stringMatching(/form-1571-\S+\.pdf is FDA’s blank Form FDA 1571, byte for byte/) }),
    ]);
    expect(inner(await usRegional(), 'submission-information')).not.toContain('<form ');
  });

  it('control: Form FDA 1571 completed on the form as FDA issued it meets the rule', async () => {
    shipAsIs('Form FDA 1571', await aCompleted1571());
    await mapFormSection(20, 'form-1571', 'Form FDA 1571');
    const res = await assemble();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { bundle } = await storedBundle();
    expect(bundle.validation.findings.filter((f: Finding) => f.ruleId.startsWith('M1-FORM-'))).toEqual([]);
  });
});

describe('Form FDA 1571 and 356h are written once, in the us-regional admin block (F20)', () => {
  it('a completed 1571 is a <form form-type="fdaft1"> under <submission-information>, and not a leaf under <m1-1-forms>', async () => {
    shipAsIs('Form FDA 1571', await aCompleted1571());
    await mapFormSection(20, 'form-1571', 'Form FDA 1571');
    expect((await assemble()).status).toBe(200);
    const { zip, bundle } = await storedBundle();
    const xml = await usRegional();
    const admin = inner(xml, 'submission-information');
    expect(admin).toMatch(/<form form-type="fdaft1">\s*<leaf\b[^>]*xlink:href="1-1\/form-1571-[^"]+\.pdf"/);
    expect(inner(xml, 'm1-regional')).not.toContain('form-1571-');
    // One leaf, one ID: the backbone no longer writes it twice.
    const ids = [...xml.matchAll(/\bID="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(bundle.regionalBackbone.conformanceGap).not.toMatch(/form-1571|written twice/);
    await assertInternallyConsistent(zip);
  });

  it('an NDA’s 356h as FDA issued it is a <form form-type="fdaft2">; a 3674 beside it stays a forms leaf with no declared form type', async () => {
    // The repository vendors the 356h decrypted (its manifest says so), so no
    // bytes here can be judged FDA's 356h as issued: the verdict is stood in for
    // one completed copy, to show what the route does with it.
    const issued356h = Buffer.from((await generateIndForm('FDA_356H', { sponsorName: 'Acme Biologics Inc', applicationType: 'NDA' } as never)).pdfBytes);
    const judge = vi.mocked(assessLeafPdfSecurity).getMockImplementation()!;
    vi.mocked(assessLeafPdfSecurity).mockImplementation(async (bytes, region, depth) =>
      Buffer.compare(bytes, issued356h) === 0 ? { verdict: 'fda-form-as-issued', formId: 'FDA_356H', edition: '2023-07-07' } : judge(bytes, region, depth),
    );
    shipAsIs('Form FDA 356h', issued356h);
    await setFamily('nda');
    await mapFormSection(20, 'form-356h', 'Form FDA 356h');
    await mapFormSection(21, 'form-3674', 'Form FDA 3674');
    const res = await assemble();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { zip, bundle } = await storedBundle();
    const xml = await usRegional();
    expect(inner(xml, 'submission-information')).toMatch(/<form form-type="fdaft2">\s*<leaf\b[^>]*xlink:href="1-1\/form-356h-/);
    const forms = inner(xml, 'm1-1-forms') ?? '';
    expect(forms).toContain('form-3674-');
    expect(forms).not.toContain('form-356h-');
    expect(bundle.regionalBackbone.conformanceGap).toMatch(/Module 1 forms leaf form-3674-\S+ \(1\.1\) has no declared form type/);
    // The 356h rule is met; the 1571 rule is an IND rule, and an NDA is not held to it.
    expect(bundle.validation.findings.filter((f: Finding) => f.ruleId.startsWith('M1-FORM-'))).toEqual([]);
    await assertInternallyConsistent(zip);
  });

  it.each([
    ['ind', 'form-1571', 'Form FDA 1571', 'M1-FORM-1571-NOT-FDA-FORM'],
    ['nda', 'form-356h', 'Form FDA 356h', 'M1-FORM-356H-NOT-FDA-FORM'],
  ])('%s: a %s page rendered from text is not declared a form; it stays a forms leaf, the gap names it, and it blocks', async (family, key, title, rule) => {
    await setFamily(family);
    await mapFormSection(20, key, title);
    expect((await assemble()).status).toBe(200);
    const { bundle } = await storedBundle();
    const xml = await usRegional();
    expect(inner(xml, 'submission-information')).not.toContain('<form ');
    expect(inner(xml, 'm1-1-forms')).toContain(`${key}-`);
    const gap = new RegExp(`Module 1 forms leaf ${key}-\\S+ \\(1\\.1\\) has no declared form type`);
    expect(bundle.regionalBackbone.conformanceGap).toMatch(gap);
    expect(byRule(bundle.validation.findings, 'REGIONAL-BACKBONE-NOT-CONFORMANT')[0].message).toMatch(gap);
    expect(byRule(bundle.validation.findings, rule)).toEqual([
      expect.objectContaining({ severity: 'error', message: expect.stringMatching(new RegExp(`${key}-\\S+\\.pdf is a page rendered from its artifact’s text`)) }),
    ]);
  });
});

describe('Form FDA 356h on a marketing application’s original (F20 review)', () => {
  it.each([
    ['nda', /21 CFR 314\.50\(a\)/],
    ['anda', /21 CFR 314\.94\(a\)\(1\)/],
    ['bla', /21 CFR 601\.2\(a\)/],
  ])('%s: an original that carries no Form FDA 356h is blocked, citing %s', async (family, cite) => {
    await setFamily(family);
    const res = await assemble();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { bundle } = await storedBundle();
    expect(byRule(bundle.validation.findings, 'M1-FORM-356H-MISSING')).toEqual([
      expect.objectContaining({ severity: 'error', message: expect.stringMatching(cite) }),
    ]);
    expect(bundle.validation.findings.filter((f: Finding) => f.ruleId.startsWith('M1-FORM-1571'))).toEqual([]);
    expect(res.body.data.bundle.validation.errorCount).toBeGreaterThanOrEqual(1);
  });

  it('a sequence that is not the original application is not held to it: an NDA’s product correspondence', async () => {
    await setFamily('nda');
    const res = await assemble({ submissionType: 'Product Correspondence', submissionSubType: 'Correspondence' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { bundle } = await storedBundle();
    expect(bundle.submissionTypeCode).toBe('fdast6');
    expect(bundle.validation.findings.filter((f: Finding) => f.ruleId.startsWith('M1-FORM-'))).toEqual([]);
  });
});

describe('the packager’s own verdicts are findings at assembly (HS-2)', () => {
  it('a backbone the packager judged not FDA-conformant, and the DTDs it could not bundle, are warnings that name why', async () => {
    const res = await assemble();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { bundle } = await storedBundle();
    const findings: Finding[] = bundle.validation.findings;
    expect(bundle.regionalBackbone.regionConformant).toBe(false);
    expect(byRule(findings, 'REGIONAL-BACKBONE-NOT-CONFORMANT')).toEqual([
      expect.objectContaining({
        severity: 'warning',
        filePath: 'm1/us/us-regional.xml',
        message: expect.stringContaining(bundle.regionalBackbone.conformanceGap),
      }),
    ]);
    const dtd = byRule(findings, 'DTD-NOT-SELF-CONTAINED');
    if (bundle.dtdStatus.selfContained) {
      expect(dtd).toEqual([]);
    } else {
      expect(dtd).toEqual([expect.objectContaining({ severity: 'warning' })]);
      for (const file of [...bundle.dtdStatus.missing, ...(bundle.dtdStatus.missingStylesheets ?? [])]) {
        expect(dtd[0].message).toContain(file);
      }
    }
    // Counted as warnings, and the response carries the verdicts themselves.
    expect(res.body.data.bundle.validation.warningCount).toBe(findings.filter((f) => f.severity === 'warning').length);
    expect(res.body.data.bundle.regionalBackbone).toEqual({
      regionConformant: false,
      conformanceGap: bundle.regionalBackbone.conformanceGap,
    });
    expect(res.body.data.bundle.dtdStatus.selfContained).toBe(bundle.dtdStatus.selfContained);
  });
});

describe('the path validated is the path shipped (VP-7)', () => {
  it('every leaf path handed to the validator is an entry in the zip, Module 3 folders included', async () => {
    expect((await assemble()).status).toBe(200);
    const { zip } = await storedBundle();
    const validated = vi.mocked(validateEctdLeafs).mock.calls.at(-1)![0].map((l: { path: string }) => l.path);
    expect(validated.some((p: string) => p.startsWith('m3/'))).toBe(true);
    for (const p of validated) expect(zip.file(p), `${p} is in the zip`).toBeTruthy();
  });
});
