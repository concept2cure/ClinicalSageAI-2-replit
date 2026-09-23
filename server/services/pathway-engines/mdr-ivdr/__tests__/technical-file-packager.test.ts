import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import {
  buildTechnicalFilePlan,
  materializeTechnicalFile,
} from '../technical-file-packager';
import { buildTechnicalFileManifest, type TechnicalFileManifest } from '../../technical-file-manifest';
import { assembleTechDoc } from '../tech-doc-assembler';
import type { CoreLeaf } from '../../../ectd/core-to-packager';

// A minimal MDR manifest with two sections that have sources + one required-missing.
function makeManifest(): TechnicalFileManifest {
  return {
    regulation: 'mdr',
    framework: 'EU MDR 2017/745',
    productName: 'Acme Cardiac Monitor',
    manufacturer: 'Acme Medical',
    generatedFrom: 'canonical-core',
    ready: false,
    totals: { sections: 3, requiredPresent: 2, requiredMissing: 1 },
    entries: [
      { path: '03-annex-ii/device-description', id: 'device-description', label: 'Device description', annex: 'Annex II 1', required: true, status: 'present', sources: ['1'] },
      { path: '03-annex-ii/gspr', id: 'gspr', label: 'GSPR checklist', annex: 'Annex I', required: true, status: 'present', sources: ['2'] },
      { path: '03-annex-ii/clinical-evaluation', id: 'clinical-evaluation', label: 'Clinical Evaluation Report', annex: 'Annex XIV', required: true, status: 'missing', sources: [] },
    ],
  };
}

const leaves: CoreLeaf[] = [
  { sectionCode: '1', title: 'Device description', lifecycleOp: 'new' },
  { sectionCode: '2', title: 'GSPR checklist', lifecycleOp: 'new' },
];

let tmpDir: string;
const fileBytes: Record<string, Buffer> = {
  '1': Buffer.from('DEVICE DESCRIPTION CONTENT'),
  '2': Buffer.from('GSPR CHECKLIST CONTENT'),
};

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tf-pkg-'));
  await fs.writeFile(path.join(tmpDir, 'desc.pdf'), fileBytes['1']);
  await fs.writeFile(path.join(tmpDir, 'gspr.pdf'), fileBytes['2']);
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// Resolver maps a leaf to its on-disk temp file (and an MD5 over its bytes).
function resolveFile(leaf: CoreLeaf) {
  if (leaf.sectionCode === '1') return { fileName: 'desc.pdf', sourcePath: path.join(tmpDir, 'desc.pdf'), md5: createHash('md5').update(fileBytes['1']).digest('hex') };
  if (leaf.sectionCode === '2') return { fileName: 'gspr.pdf', sourcePath: path.join(tmpDir, 'gspr.pdf') };
  return null;
}

describe('materializeTechnicalFile (end-to-end ZIP emission)', () => {
  it('plans, writes a real ZIP, and the ZIP round-trips with manifest + files + checksums', async () => {
    const plan = buildTechnicalFilePlan({ manifest: makeManifest(), leaves, resolveFile });
    // The missing clinical-evaluation section has no source → not a placed file.
    expect(plan.files).toHaveLength(2);

    const bundle = await materializeTechnicalFile(plan, { outputDir: tmpDir, applicationId: 'APP-001' });

    // Bundle metadata is honest + content-addressed.
    expect(bundle.fileCount).toBe(2);
    expect(bundle.sizeBytes).toBeGreaterThan(0);
    expect(bundle.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.path).toMatch(/APP-001-technical-file-mdr\.zip$/);

    // The ZIP exists and unzips.
    const zipBytes = await fs.readFile(bundle.path);
    expect(zipBytes.subarray(0, 2).toString('latin1')).toBe('PK'); // ZIP magic
    const zip = await JSZip.loadAsync(zipBytes);

    // Contains the manifest TOC, checksum index, and both placed files at Annex paths.
    expect(zip.file('manifest.json')).not.toBeNull();
    expect(zip.file('checksums.md5.txt')).not.toBeNull();
    expect(zip.file('03-annex-ii/device-description/desc.pdf')).not.toBeNull();
    expect(zip.file('03-annex-ii/gspr/gspr.pdf')).not.toBeNull();

    // Placed file content matches the source bytes (true round-trip).
    const descOut = await zip.file('03-annex-ii/device-description/desc.pdf')!.async('nodebuffer');
    expect(descOut.equals(fileBytes['1'])).toBe(true);

    // manifest.json round-trips to the same manifest.
    const manifestOut = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifestOut.regulation).toBe('mdr');
    expect(manifestOut.entries).toHaveLength(3);

    // checksum index lists every placed file + the manifest.
    const checksums = await zip.file('checksums.md5.txt')!.async('string');
    expect(checksums).toMatch(/manifest\.json/);
    expect(checksums).toMatch(/desc\.pdf/);
    expect(checksums).toMatch(/gspr\.pdf/);
  });

  it('is content-addressed: identical input yields the same sha256', async () => {
    const plan1 = buildTechnicalFilePlan({ manifest: makeManifest(), leaves, resolveFile });
    const plan2 = buildTechnicalFilePlan({ manifest: makeManifest(), leaves, resolveFile });
    const b1 = await materializeTechnicalFile(plan1, { outputDir: tmpDir, applicationId: 'APP-002' });
    const b2 = await materializeTechnicalFile(plan2, { outputDir: tmpDir, applicationId: 'APP-002' });
    expect(b1.sha256).toBe(b2.sha256);
  });

  it('pins every entry (files AND implicit folders) to a fixed epoch — no wall-clock timestamps', async () => {
    // Regression guard for the determinism flake: JSZip stamps the directory
    // entries it auto-creates for nested paths with `new Date()`, not the
    // per-file date, so two runs straddling the DOS 2-second boundary produced
    // different hashes. Deterministically catch a leak (no boundary needed) by
    // asserting NO entry carries a wall-clock (current-year) timestamp.
    const plan = buildTechnicalFilePlan({ manifest: makeManifest(), leaves, resolveFile });
    const bundle = await materializeTechnicalFile(plan, { outputDir: tmpDir, applicationId: 'APP-003' });
    const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
    const entries = Object.values(zip.files);
    expect(entries.length).toBeGreaterThan(0);
    const leaked = entries.filter((e) => e.date.getFullYear() !== 1980).map((e) => e.name);
    expect(leaked).toEqual([]);
  });

  it('reports skipped sources for leaves with no resolvable file', async () => {
    const manifest = makeManifest();
    // Add a section whose source leaf resolves to null.
    manifest.entries.push({ path: '03-annex-ii/extra', id: 'extra', label: 'Extra', annex: 'Annex II 9', required: false, status: 'optional-absent', sources: ['99'] });
    const plan = buildTechnicalFilePlan({
      manifest,
      leaves: [...leaves, { sectionCode: '99', title: 'Extra', lifecycleOp: 'new' }],
      resolveFile,
    });
    expect(plan.skipped.some((s) => s.sectionId === 'extra')).toBe(true);
    const bundle = await materializeTechnicalFile(plan, { outputDir: tmpDir, applicationId: 'APP-003' });
    expect(bundle.skippedCount).toBeGreaterThan(0);
  });
});

/*
 * 2026-09-23 (W5/D7, round-2 skeptic): the plan reconciles the manifest it
 * writes. manifest.json was the manifest from BEFORE the plan resolved any
 * leaf, so a ZIP without the CER still said ready: true and listed the CER as
 * 'present'. And a leaf no Annex II/III slot claims (IV.* conformity /
 * registration) is not a gap in the technical file — it is reported
 * separately as unmappedLeaves and never folded into `ready`.
 */
describe('buildTechnicalFilePlan — the manifest in the ZIP says what the ZIP holds', () => {
  function completeManifest(): TechnicalFileManifest {
    const m = makeManifest();
    m.ready = true;
    m.totals = { sections: 3, requiredPresent: 3, requiredMissing: 0 };
    m.entries[2] = { ...m.entries[2], status: 'present', sources: ['3'] };
    return m;
  }
  const cerLeaf: CoreLeaf = { sectionCode: '3', title: 'Clinical Evaluation Report', lifecycleOp: 'new' };

  it('an entry whose every source was skipped is not present, and the plan is not ready', async () => {
    const input = completeManifest();
    const plan = buildTechnicalFilePlan({ manifest: input, leaves: [...leaves, cerLeaf], resolveFile });
    expect(plan.skipped).toEqual([
      { sectionId: 'clinical-evaluation', source: '3', reason: 'no resolvable source file for the leaf document' },
    ]);
    const cer = plan.manifest.entries.find((e) => e.id === 'clinical-evaluation')!;
    expect(cer).toMatchObject({ status: 'missing', sources: [], unresolvedSources: ['3'] });
    expect(plan.manifest.ready).toBe(false);
    expect(plan.manifest.totals).toEqual({ sections: 3, requiredPresent: 2, requiredMissing: 1 });
    // The caller's manifest is not mutated.
    expect(input.ready).toBe(true);
    expect(input.entries[2].status).toBe('present');

    const bundle = await materializeTechnicalFile(plan, { outputDir: tmpDir, applicationId: 'APP-R1' });
    const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
    const written = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(written.ready).toBe(false);
    expect(written.entries.find((e: any) => e.id === 'clinical-evaluation')).toMatchObject({ status: 'missing', unresolvedSources: ['3'] });
  });

  it('a leaf no slot claims is reported as unmapped and does not make a complete file not ready', async () => {
    const iv: CoreLeaf = { sectionCode: 'IV.1', title: 'EU declaration of conformity — Annex IV', lifecycleOp: 'new' };
    const plan = buildTechnicalFilePlan({
      manifest: completeManifest(),
      leaves: [...leaves, cerLeaf, iv],
      resolveFile: (l) => (l.sectionCode === '3' || l.sectionCode === 'IV.1' ? resolveFile({ ...l, sectionCode: '2' }) : resolveFile(l)),
    });
    // 2026-09-23 (W5/D7, round-2 skeptic): each unmapped leaf now says whether
    // it is Annex II/III technical documentation (it counts against ready) or
    // outside it (IV.* — it does not). This assertion gained that field.
    expect(plan.unmappedLeaves).toEqual([
      { source: 'IV.1', inTechnicalDocumentation: false, reason: expect.stringMatching(/no technical-file section matched/) },
    ]);
    expect(plan.manifest.ready).toBe(true);
    const bundle = await materializeTechnicalFile(plan, { outputDir: tmpDir, applicationId: 'APP-R2' });
    const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
    const written = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(written.ready).toBe(true);
    expect(written.unmappedLeaves).toEqual([{ source: 'IV.1', inTechnicalDocumentation: false, reason: expect.any(String) }]);
  });

  it('a leaf whose source did not materialize makes the plan not ready, even when every slot is filled', () => {
    const plan = buildTechnicalFilePlan({
      manifest: completeManifest(),
      leaves: [...leaves, cerLeaf],
      resolveFile: (l) => (l.sectionCode === '3' ? resolveFile({ ...l, sectionCode: '2' }) : resolveFile(l)),
      unresolvedLeaves: [{ documentTable: 'vault_documents', documentId: null, reason: 'vault document not found' }],
    });
    expect(plan.skipped).toEqual([]);
    expect(plan.manifest.ready).toBe(false);
  });
});

/*
 * 2026-09-23 (W5/D7, round-2 skeptic, second pass). Two ways a leaf left the
 * ZIP while the plan said ready:
 *   1. Two leaves with the same section code in one slot: the source list is
 *      ['II.3.b', 'II.3.b'] and each source was looked up with find(), so the
 *      FIRST leaf was placed twice and the second never reached the ZIP — and
 *      was then reported 'unmapped', which is false.
 *   2. An authored Annex II/III section no slot of this regulation claims (the
 *      IVDR outline's mandatory II.6.3 stability group) was 'unmapped' and, once
 *      unmapped leaves stopped counting, the plan said ready without it.
 */
describe('buildTechnicalFilePlan — every leaf a slot claims reaches the ZIP once', () => {
  const dmManifest = (): TechnicalFileManifest => ({
    regulation: 'mdr',
    framework: 'EU MDR 2017/745',
    generatedFrom: 'canonical-core',
    ready: true,
    totals: { sections: 1, requiredPresent: 1, requiredMissing: 0 },
    entries: [
      { path: '03-annex-ii-3/design-manufacturing', id: 'design-manufacturing', label: 'Design & manufacturing', annex: 'Annex II 3', required: true, status: 'present', sources: ['II.3.b', 'II.3.b'] },
    ],
  });
  const first: CoreLeaf = { sectionCode: 'II.3.b', title: 'Manufacturing processes', lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 402 };
  const second: CoreLeaf = { sectionCode: 'II.3.b', title: 'Manufacturing process validation', lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 499 };
  const byId = (leaf: CoreLeaf) => ({ fileName: `doc-${leaf.documentId}.pdf`, sourcePath: path.join(tmpDir, 'desc.pdf') });

  it('two leaves with one section code in one slot are both placed, once each, and neither is unmapped', () => {
    const plan = buildTechnicalFilePlan({ manifest: dmManifest(), leaves: [first, second], resolveFile: byId });
    expect(plan.files.map((f) => f.targetPath)).toEqual([
      '03-annex-ii-3/design-manufacturing/doc-402.pdf',
      '03-annex-ii-3/design-manufacturing/doc-499.pdf',
    ]);
    expect(plan.unmappedLeaves).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(plan.manifest.ready).toBe(true);
  });

  it('when the second of two same-code leaves does not resolve, the slot lost a source and the plan is not ready', () => {
    const plan = buildTechnicalFilePlan({
      manifest: dmManifest(),
      leaves: [first, second],
      resolveFile: (l) => (l.documentId === 499 ? null : byId(l)),
    });
    expect(plan.files.map((f) => f.targetPath)).toEqual(['03-annex-ii-3/design-manufacturing/doc-402.pdf']);
    expect(plan.manifest.entries[0]).toMatchObject({ status: 'present', sources: ['II.3.b'], unresolvedSources: ['II.3.b'] });
    expect(plan.unmappedLeaves).toEqual([]);
    expect(plan.manifest.ready).toBe(false);
  });

  it('an authored Annex II/III leaf no slot claims makes the plan not ready; an IV.* leaf does not', () => {
    const iv: CoreLeaf = { sectionCode: 'IV.1', title: 'EU declaration of conformity', lifecycleOp: 'new' };
    const stability: CoreLeaf = { sectionCode: 'II.6.3.a', title: 'Claimed shelf life and real-time stability', lifecycleOp: 'new' };
    const withIv = buildTechnicalFilePlan({ manifest: dmManifest(), leaves: [first, second, iv], resolveFile: byId });
    expect(withIv.manifest.ready).toBe(true);

    const plan = buildTechnicalFilePlan({ manifest: dmManifest(), leaves: [first, second, iv, stability], resolveFile: byId });
    expect(plan.unmappedLeaves).toEqual([
      { source: 'IV.1', inTechnicalDocumentation: false, reason: expect.any(String) },
      { source: 'II.6.3.a', inTechnicalDocumentation: true, reason: expect.stringMatching(/Annex II\/III/) },
    ]);
    expect(plan.manifest.ready).toBe(false);
    expect(plan.manifest.unmappedLeaves).toEqual(plan.unmappedLeaves);
  });

  it('only the Annex II and III key trees count: III is not II, and IV / IIa are neither', () => {
    const plan = (code: string) =>
      buildTechnicalFilePlan({ manifest: dmManifest(), leaves: [first, second, { sectionCode: code, title: code, lifecycleOp: 'new' }], resolveFile: byId });
    expect(plan('II').manifest.ready).toBe(false);
    expect(plan('III.9').manifest.ready).toBe(false);
    expect(plan('IV').manifest.ready).toBe(true);
    expect(plan('IIa.1').manifest.ready).toBe(true);
    expect(plan('2.3.S').manifest.ready).toBe(true);
  });
});

/*
 * 2026-09-23 (W5/D7, residual repair). The plan placed each source by looking
 * its leaf up again from the section-code string. The slots match by document
 * type and title too, so two leaves with one code that different slots claim
 * were confused: with a bench report and the CER both at II.6.1.b, the CER slot
 * took the bench report (the first leaf with that code) and the plan said
 * ready. Each slot now carries the leaves it matched (tech-doc-assembler's
 * `leafIndices`), and the plan places exactly those.
 */
describe('buildTechnicalFilePlan — a slot places the leaves it matched, not the first leaf with the same code', () => {
  const L = (sectionCode: string, title: string, documentType: string | null, documentId: number): CoreLeaf => ({
    sectionCode,
    title,
    documentType,
    lifecycleOp: 'new',
    documentTable: 'coauthor_documents',
    documentId,
  });
  const base: CoreLeaf[] = [
    L('II.1.a', 'Device description', null, 1),
    L('II.2.b', 'Instructions for use', null, 2),
    L('II.3.b', 'Manufacturing', null, 3),
    L('II.4.a', 'GSPR checklist', null, 4),
    L('II.5.a', 'Risk management file', null, 5),
    L('II.6.1.a', 'Biocompatibility', null, 6),
    L('III.1', 'PMS plan', null, 8),
  ];
  const byId = (leaf: CoreLeaf) => ({ fileName: `doc-${leaf.documentId}.pdf`, sourcePath: path.join(tmpDir, 'desc.pdf') });
  const planFor = (leaves: CoreLeaf[], regulation: 'mdr' | 'ivdr' = 'mdr') => {
    const manifest = buildTechnicalFileManifest(
      assembleTechDoc({
        regulation,
        leaves: leaves.map((l) => ({ sectionCode: l.sectionCode, title: l.title, documentType: l.documentType ?? undefined })),
      }),
    );
    return buildTechnicalFilePlan({ manifest, leaves, resolveFile: byId });
  };
  const filesOf = (plan: ReturnType<typeof planFor>, sectionId: string) =>
    plan.files.filter((f) => f.sectionId === sectionId).map((f) => path.basename(f.targetPath));

  it('bench report and CER both at II.6.1.b, in either order: the CER slot holds the CER', () => {
    const bench = L('II.6.1.b', 'Physical and chemical characterisation bench report', null, 650);
    const cer = L('II.6.1.b', 'CER', 'cer', 651);
    for (const pair of [[bench, cer], [cer, bench]]) {
      const plan = planFor([...base, ...pair]);
      expect(filesOf(plan, 'clinical-evaluation')).toEqual(['doc-651.pdf']);
      expect(filesOf(plan, 'preclinical-clinical').sort()).toEqual(['doc-6.pdf', 'doc-650.pdf', 'doc-651.pdf']);
      expect(plan.unmappedLeaves).toEqual([]);
      expect(plan.skipped).toEqual([]);
      expect(plan.manifest.ready).toBe(true);
    }
  });

  it('IFU and CER share a non-Annex code (1.11): each lands in its own slot and the CER is not unmapped', () => {
    const ifu = L('1.11', 'Labelling', 'ifu', 650);
    const cer = L('1.11', 'Evaluation report', 'cer', 651);
    const noIfu = base.filter((l) => l.sectionCode !== 'II.2.b');
    for (const pair of [[ifu, cer], [cer, ifu]]) {
      const plan = planFor([...noIfu, ...pair]);
      expect(filesOf(plan, 'manufacturer-information')).toEqual(['doc-650.pdf']);
      expect(filesOf(plan, 'clinical-evaluation')).toEqual(['doc-651.pdf']);
      expect(plan.unmappedLeaves).toEqual([]);
      expect(plan.manifest.ready).toBe(true);
    }
  });

  it('a manifest entry whose sources are not the leaves its slot matches places nothing by string, and the plan is not ready', () => {
    const bench = L('II.6.1.b', 'Physical and chemical characterisation bench report', null, 650);
    const cer = L('II.6.1.b', 'CER', 'cer', 651);
    // The manifest was built from leaves in which 651 is the CER ...
    const manifest = buildTechnicalFileManifest(
      assembleTechDoc({
        regulation: 'mdr',
        leaves: [...base, bench, cer].map((l) => ({ sectionCode: l.sectionCode, title: l.title, documentType: l.documentType ?? undefined })),
      }),
    );
    // ... and the plan is handed leaves in which no leaf is the CER. The CER
    // entry still names 'II.6.1.b'; that string must not pick up the bench report.
    const plan = buildTechnicalFilePlan({ manifest, leaves: [...base, bench, { ...cer, documentType: null, title: 'Characterisation annex' }], resolveFile: byId });
    expect(filesOf(plan, 'clinical-evaluation')).toEqual([]);
    const entry = plan.manifest.entries.find((e) => e.id === 'clinical-evaluation')!;
    expect(entry).toMatchObject({ status: 'missing', sources: [], unresolvedSources: ['II.6.1.b'] });
    expect(plan.skipped).toContainEqual({
      sectionId: 'clinical-evaluation',
      source: 'II.6.1.b',
      reason: expect.stringMatching(/not the leaves this slot matches/),
    });
    expect(plan.manifest.ready).toBe(false);
  });

  it('two same-named files in one slot are de-collided (the leaves are distinct, so both are placed)', () => {
    const a = L('II.3.b', 'Manufacturing A', null, 3);
    const plan = buildTechnicalFilePlan({
      manifest: buildTechnicalFileManifest(assembleTechDoc({ regulation: 'mdr', leaves: [a, { ...a, title: 'Manufacturing B' }].map((l) => ({ sectionCode: l.sectionCode, title: l.title })) })),
      leaves: [a, { ...a, title: 'Manufacturing B' }],
      resolveFile: () => ({ fileName: 'same.pdf', sourcePath: path.join(tmpDir, 'desc.pdf') }),
    });
    expect(filesOf(plan, 'design-manufacturing')).toEqual(['same.pdf', 'same-2.pdf']);
  });

  // 2026-09-23 (W5/D7, residual repair — round 3): the CER slot matched
  // titleHas('clinical evaluation') as a substring of "Preclinical evaluation",
  // so a bench report filled Annex XIV. An outline-keyed leaf is placed by its key.
  it('no CER, and a II.6.1.a report titled "Preclinical evaluation ...": clinical-evaluation is missing and the plan is not ready', () => {
    const noBio = base.filter((l) => l.documentId !== 6);
    const plan = planFor([...noBio, L('II.6.1.a', 'Preclinical evaluation - biocompatibility (ISO 10993)', null, 6)]);
    expect(filesOf(plan, 'clinical-evaluation')).toEqual([]);
    expect(filesOf(plan, 'preclinical-clinical')).toEqual(['doc-6.pdf']);
    expect(plan.manifest.entries.find((e) => e.id === 'clinical-evaluation')).toMatchObject({ status: 'missing', sources: [] });
    expect(plan.manifest.ready).toBe(false);
  });

  it('a real CER at II.6.1.g and a II.6.1.b "Pre-clinical evaluation ..." bench report: Annex XIV holds only the CER', () => {
    const plan = planFor([...base, L('II.6.1.b', 'Pre-clinical evaluation of bench performance', null, 650), L('II.6.1.g', 'Clinical evaluation report — Annex XIV Part A', null, 651)]);
    expect(filesOf(plan, 'clinical-evaluation')).toEqual(['doc-651.pdf']);
    expect(filesOf(plan, 'preclinical-clinical').sort()).toEqual(['doc-6.pdf', 'doc-650.pdf']);
    expect(plan.unmappedLeaves).toEqual([]);
    expect(plan.manifest.ready).toBe(true);
  });

  it('IVDR with no II.6.2.c PER and a II.6.1.a "Analytical performance evaluation report": the PER is missing, not filled', () => {
    const ivdr = [
      L('II.1.a', 'a', null, 1), L('II.2.b', 'b', null, 2), L('II.3.b', 'c', null, 3), L('II.4.a', 'd', null, 4),
      L('II.5.a', 'e', null, 5), L('II.6.1.a', 'Analytical performance evaluation report', null, 6), L('II.6.2.b', 'g', null, 7),
      L('II.6.3.a', 's', null, 10), L('III.1', 'i', null, 9),
    ];
    const plan = planFor(ivdr, 'ivdr');
    expect(filesOf(plan, 'performance-evaluation')).toEqual([]);
    expect(filesOf(plan, 'analytical-performance')).toEqual(['doc-6.pdf']);
    expect(plan.manifest.ready).toBe(false);
  });

  it('an IVDR program with II.6.3 / II.6.4 / II.6.5 places them in their slots and nothing is unmapped', () => {
    const ivdr = [
      L('II.1.a', 'a', null, 1), L('II.2.b', 'b', null, 2), L('II.3.b', 'c', null, 3), L('II.4.a', 'd', null, 4),
      L('II.5.a', 'e', null, 5), L('II.6.1.a', 'f', null, 6), L('II.6.2.b', 'g', null, 7), L('II.6.2.c', 'h', null, 8),
      L('III.1', 'i', null, 9), L('II.6.3.a', 'Claimed shelf life', null, 10), L('II.6.4.a', 'Software V&V', null, 11), L('II.6.5', 'Usability', null, 12),
    ];
    const plan = planFor(ivdr, 'ivdr');
    expect(filesOf(plan, 'stability')).toEqual(['doc-10.pdf']);
    expect(filesOf(plan, 'software-cybersecurity')).toEqual(['doc-11.pdf']);
    expect(filesOf(plan, 'usability')).toEqual(['doc-12.pdf']);
    expect(plan.unmappedLeaves).toEqual([]);
    expect(plan.manifest.ready).toBe(true);
    // Without the mandatory stability group the IVDR file is not ready.
    expect(planFor(ivdr.filter((l) => l.documentId !== 10), 'ivdr').manifest.ready).toBe(false);
  });
});

/*
 * 2026-09-23 (W5/D7, final pass). A sequence built through the Vault flow:
 * every leaf is at a CTD code (the placement dialogs accept nothing else), has
 * no document type, and is titled with its file name minus the extension. The
 * round-3 word-boundary rule left 'IFU_EN_rev3' and 'GSPR_Checklist_v2' out of
 * their slots, so a file HEAD reported ready was not ready and the two
 * documents were left out of the ZIP.
 */
describe('buildTechnicalFilePlan — a Vault-built sequence (CTD codes, file-name titles)', () => {
  const V = (sectionCode: string, title: string, documentId: number): CoreLeaf => ({
    sectionCode, title, documentType: null, lifecycleOp: 'new', documentTable: 'vault_documents', documentId,
  });
  const vaultBase = [
    V('1.2', 'Device description and intended purpose', 1), V('3.2.P.3', 'Design and manufacturing information', 3),
    V('1.9', 'Risk management plan', 5), V('4.2.1', 'Preclinical bench testing', 6), V('5.3.5.4', 'Clinical_Evaluation_Report_v2', 7), V('5.3.6', 'PMS plan', 8),
  ];
  const resolve = (leaf: CoreLeaf) => ({ fileName: `doc-${leaf.documentId}.pdf`, sourcePath: path.join(tmpDir, 'desc.pdf') });
  const planOf = (leaves: CoreLeaf[]) =>
    buildTechnicalFilePlan({
      manifest: buildTechnicalFileManifest(assembleTechDoc({ regulation: 'mdr', leaves: leaves.map((l) => ({ sectionCode: l.sectionCode, title: l.title })) })),
      leaves,
      resolveFile: resolve,
    });
  const inSlot = (plan: ReturnType<typeof planOf>, id: string) => plan.files.filter((f) => f.sectionId === id).map((f) => path.basename(f.targetPath));

  it('"IFU_EN_rev3" + "GSPR_Checklist_v2", and "eIFU" + "GSPR-Checklist": the IFU and GSPR are filed and the plan is ready', () => {
    for (const [ifu, gspr] of [['IFU_EN_rev3', 'GSPR_Checklist_v2'], ['eIFU', 'GSPR-Checklist']]) {
      const plan = planOf([...vaultBase, V('1.3.1', ifu, 2), V('3.2.R', gspr, 4)]);
      expect(inSlot(plan, 'manufacturer-information')).toEqual(['doc-2.pdf']);
      expect(inSlot(plan, 'gspr')).toEqual(['doc-4.pdf']);
      expect(inSlot(plan, 'clinical-evaluation')).toEqual(['doc-7.pdf']);
      expect(plan.manifest.ready).toBe(true);
    }
  });

  /*
   * 2026-09-23 (W5/D7, final pass — repair): plural acronyms and an acronym
   * glued to a lower-case word. HEAD's substring match filed all of these and
   * reported the file ready; the first token rewrite split 'IFUs' into 'if' +
   * 'us' and 'GSPRchecklist' into 'gsp' + 'rchecklist', left both documents
   * out of the ZIP and reported manufacturer-information and gspr missing.
   */
  it('plural and glued acronym file names ("IFUs_all_languages", "GSPRs_checklist", "eIFUs", "GSPRchecklist", "IFUen"): filed, and ready as at HEAD', () => {
    for (const [ifu, gspr] of [['IFUs_all_languages', 'GSPRs_checklist'], ['IFUs_EN', 'GSPRs'], ['eIFUs', 'GSPRchecklist'], ['IFUen', 'GSPRs_checklist_v2']]) {
      const plan = planOf([...vaultBase, V('1.3.1', ifu, 2), V('3.2.R', gspr, 4)]);
      expect(inSlot(plan, 'manufacturer-information')).toEqual(['doc-2.pdf']);
      expect(inSlot(plan, 'gspr')).toEqual(['doc-4.pdf']);
      expect(plan.unmappedLeaves).toEqual([]);
      expect(plan.manifest.entries.filter((e) => e.status === 'missing')).toEqual([]);
      expect(plan.manifest.ready).toBe(true);
    }
  });

  it('the Annex II/III test reads the key trimmed and case-insensitively: " ii.9" counts, "iii.9" is the PMS plan, " IV.1" does not count', () => {
    const full = [...vaultBase, V('1.3.1', 'IFU_EN_rev3', 2), V('3.2.R', 'GSPR_Checklist_v2', 4)];
    const withLeaf = (code: string) => planOf([...full, V(code, 'Annex body', 99)]);
    expect(withLeaf(' ii.9').unmappedLeaves).toEqual([{ source: ' ii.9', inTechnicalDocumentation: true, reason: expect.stringMatching(/Annex II\/III/) }]);
    expect(withLeaf(' ii.9').manifest.ready).toBe(false);
    // 'iii.9' is under the Annex III key the PMS-plan slot claims: placed, not unmapped.
    expect(inSlot(withLeaf('iii.9'), 'pms-plan')).toContain('doc-99.pdf');
    expect(withLeaf('iii.9').unmappedLeaves).toEqual([]);
    expect(withLeaf(' IV.1').manifest.ready).toBe(true);
  });
  /*
   * 2026-09-23 (W5/D7, final pass): the Vault-built CER is filed by its title
   * alone. Requiring a document type or an outline key for it would refuse
   * every Vault-built sequence, so readiness is unchanged — but the manifest
   * written into the ZIP says which placed sources rest on the title alone.
   */
  it('a CER placed by its title alone is reported as matchedByTitleOnly in the manifest; ready is unchanged', () => {
    const plan = planOf([...vaultBase, V('1.3.1', 'IFU_EN_rev3', 2), V('3.2.R', 'GSPR_Checklist_v2', 4)]);
    expect(plan.manifest.ready).toBe(true);
    const cer = plan.manifest.entries.find((e) => e.id === 'clinical-evaluation')!;
    expect(cer.matchedByTitleOnly).toEqual(['5.3.5.4']);
    expect(plan.manifest.matchedByTitleOnly).toContainEqual({ sectionId: 'clinical-evaluation', source: '5.3.5.4' });
    // The bench report at 4.2.1 is matched by its '4' code prefix too: not title-only.
    expect(plan.manifest.entries.find((e) => e.id === 'preclinical-clinical')!.matchedByTitleOnly).toBeUndefined();
    // A CER at its outline key is not title-only.
    const keyed = planOf([...vaultBase.filter((l) => l.documentId !== 7), V('II.6.1.g', 'Clinical_Evaluation_Report_v2', 7), V('1.3.1', 'IFU_EN_rev3', 2), V('3.2.R', 'GSPR_Checklist_v2', 4)]);
    expect(keyed.manifest.entries.find((e) => e.id === 'clinical-evaluation')!.matchedByTitleOnly).toBeUndefined();
    expect(keyed.manifest.matchedByTitleOnly).not.toContainEqual(expect.objectContaining({ sectionId: 'clinical-evaluation' }));
  });
});
