/** Exact normal-package bytes are validated with explicitly synthetic grammars.
 * These schemas prove engine execution; they are not agency schemas/conformance. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { packageEctdSubmission, type PackagerInput } from '../regional-packager';
import { writeGoldenLeaves, v3GoldenInput } from '../../ectd/qualification/golden-fixtures';
import type { DtdValidationEvidence } from '@shared/regulatory/ectd-dtd-validation';

let work: string;
let input: PackagerInput;
let drop: string;
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

beforeEach(async () => {
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'synthetic-package-dtd-'));
  drop = path.join(work, 'drop');
  await fs.mkdir(drop);
  vi.stubEnv('ECTD_DTD_DIR', drop);
  vi.stubEnv('ECTD_REQUIRE_DTD', 'false');
  const paths = await writeGoldenLeaves(path.join(work, 'leaves'));
  input = { ...v3GoldenInput({ region: 'fda', sequence: '0000', applicationId: '123456', outputDir: path.join(work, 'out'), paths }), emitUnzipped: false, environment: 'staging' };
});
afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); if (work) await fs.rm(work, { recursive: true, force: true }); });

/** A permissive test grammar for exactly the generated element/attribute names. */
function syntheticDtd(xml: string): string {
  const elements = new Map<string, Set<string>>();
  for (const match of xml.matchAll(/<([A-Za-z_][\w:.-]*)(\s[^<>]*?)?\/?\s*>/g)) {
    const attributes = elements.get(match[1]) ?? new Set<string>();
    for (const attribute of (match[2] ?? '').matchAll(/([\w:.-]+)\s*=\s*(["']).*?\2/g)) attributes.add(attribute[1]);
    elements.set(match[1], attributes);
  }
  return '<!-- SYNTHETIC QUALIFICATION GRAMMAR; NOT AN AGENCY DTD -->\n' + [...elements].map(([name, attributes]) =>
    `<!ELEMENT ${name} ANY>\n${attributes.size ? `<!ATTLIST ${name} ${[...attributes].map(a => `${a} CDATA #IMPLIED`).join(' ')}>\n` : ''}`,
  ).join('');
}

async function writeManifest() {
  const names = (await fs.readdir(drop)).filter(name => /\.(dtd|xsl)$/.test(name)).sort();
  const lines = await Promise.all(names.map(async name => `${hash(await fs.readFile(path.join(drop, name)))}  ${name}`));
  await fs.writeFile(path.join(drop, 'checksums.txt'), lines.join('\n') + '\n');
}

async function provisionSyntheticSupport(options: { includeStfStylesheet?: boolean } = {}) {
  const seed = await packageEctdSubmission(input);
  const zip = await JSZip.loadAsync(await fs.readFile(seed.path));
  for (const name of Object.keys(zip.files).filter(name => name === 'index.xml' || name.endsWith('-regional.xml') || /\/stf-[^/]+\.xml$/.test(name))) {
    const xml = await zip.file(name)!.async('string');
    const system = /<!DOCTYPE[^>]*SYSTEM\s+"([^"]+)"/.exec(xml)?.[1];
    expect(system).toBeTruthy();
    await fs.writeFile(path.join(drop, path.posix.basename(system!)), syntheticDtd(xml));
  }
  const stylesheets = ['ectd-2-0.xsl', 'us-regional.xsl',
    ...(options.includeStfStylesheet === false ? [] : ['ich-stf-stylesheet-2-3.xsl'])];
  for (const file of stylesheets) await fs.writeFile(path.join(drop, file), '<!-- SYNTHETIC QUALIFICATION STYLESHEET -->');
  await writeManifest();
}

async function capture(label: string, bundle: Awaited<ReturnType<typeof packageEctdSubmission>>) {
  const evidenceDir = process.env.DTD_QUALIFICATION_OUTPUT_DIR;
  if (evidenceDir) {
    await fs.mkdir(evidenceDir, { recursive: true });
    await fs.writeFile(path.join(evidenceDir, `${label}.json`), JSON.stringify({ syntheticSchemas: true, agencyAcceptance: false,
      packageSha256: bundle.sha256, dtdStatus: bundle.dtdStatus, regionalBackbone: bundle.regionalBackbone }, null, 2) + '\n');
    await fs.copyFile(bundle.path, path.join(evidenceDir, `${label}.zip`));
  }
}

describe('normal package DTD execution evidence', () => {
  it('records every generated backbone/STF as unverified when the drop-point is empty', async () => {
    const bundle = await packageEctdSubmission(input);
    const validation = bundle.dtdStatus?.validation as DtdValidationEvidence;
    expect(validation).toBeDefined();
    const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
    const expected = Object.keys(zip.files).filter(name => name === 'index.xml' || name.endsWith('-regional.xml') || /\/stf-[^/]+\.xml$/.test(name)).sort();
    expect(validation.expectedFiles.sort()).toEqual(expected);
    expect(validation.files.map(file => file.relPath).sort()).toEqual(expected);
    expect(validation.passed).toBe(false);
    expect(bundle.dtdStatus?.missing).toContain('ich-stf-v2-2.dtd');
    expect(validation.files.every(file => file.dtd.ran === false && file.dtd.valid === false)).toBe(true);
    await capture('missing-assets', bundle);
  }, 30_000);

  it('validates all captured ZIP XML and checksum-pins its exact supportive bytes', async () => {
    await provisionSyntheticSupport();
    const mkdir = vi.spyOn(fs, 'mkdtemp');
    const bundle = await packageEctdSubmission(input);
    const validation = bundle.dtdStatus?.validation as DtdValidationEvidence;
    expect(validation).toMatchObject({ version: 1, passed: true, integrity: { ok: true } });
    expect(validation.files).toHaveLength(3);
    for (const file of validation.files) {
      expect(file.wellFormed).toMatchObject({ ran: true, valid: true });
      expect(file.doctype).toMatchObject({ valid: true });
      expect(file.dtd).toMatchObject({ ran: true, valid: true });
      expect(JSON.stringify(file)).not.toContain(os.tmpdir());
    }
    const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
    for (const name of validation.integrity.verified) {
      const prefix = name.endsWith('.xsl') ? 'util/style' : 'util/dtd';
      const bytes = await zip.file(`${prefix}/${name}`)!.async('nodebuffer');
      expect(hash(bytes)).toBe(hash(await fs.readFile(path.join(drop, name))));
    }
    const stfPath = validation.expectedFiles.find(name => /\/stf-/.test(name))!;
    const stf = await zip.file(stfPath)!.async('string');
    const system = /<!DOCTYPE[^>]*SYSTEM\s+"([^"]+)"/.exec(stf)![1];
    expect(path.posix.normalize(path.posix.join(path.posix.dirname(stfPath), system))).toBe('util/dtd/ich-stf-v2-2.dtd');
    const privateDirs = await Promise.all(mkdir.mock.results.map(result => result.value));
    expect(privateDirs.length).toBeGreaterThan(0);
    for (const dir of privateDirs) await expect(fs.access(dir)).rejects.toMatchObject({ code: 'ENOENT' });
    await capture('synthetic-valid', bundle);
  }, 30_000);

  it('records an invalid STF even when both backbones validate and all bytes are checksum-pinned', async () => {
    await provisionSyntheticSupport();
    await fs.writeFile(path.join(drop, 'ich-stf-v2-2.dtd'), '<!-- SYNTHETIC INVALID-STF CASE -->\n<!ELEMENT wrong-study EMPTY>');
    await writeManifest();
    const bundle = await packageEctdSubmission(input);
    expect(bundle.dtdStatus?.validation).toMatchObject({ passed: false, integrity: { ok: true } });
    const rows = bundle.dtdStatus!.validation!.files;
    expect(JSON.stringify(rows)).not.toContain(os.tmpdir());
    expect(rows.find(row => /\/stf-/.test(row.relPath))?.dtd).toMatchObject({ ran: true, valid: false });
    expect(rows.filter(row => !/\/stf-/.test(row.relPath)).every(row => row.dtd.ran && row.dtd.valid)).toBe(true);
    await capture('invalid-stf', bundle);
  }, 30_000);

  it('refuses to certify changed supportive bytes despite otherwise valid XML', async () => {
    await provisionSyntheticSupport();
    await fs.appendFile(path.join(drop, 'ich-ectd-3-2.dtd'), '\n<!-- CHANGED AFTER THE SYNTHETIC MANIFEST -->\n');
    const bundle = await packageEctdSubmission(input);
    expect(bundle.dtdStatus?.validation).toMatchObject({ passed: false, integrity: { ok: false,
      mismatched: [expect.objectContaining({ fileName: 'ich-ectd-3-2.dtd' })] } });
    await capture('tampered-support', bundle);
  }, 30_000);

  it('requires actual passing proof in production and cleans its private tree before refusing', async () => {
    await provisionSyntheticSupport();
    await fs.writeFile(path.join(drop, 'ich-stf-v2-2.dtd'), '<!ELEMENT wrong-study EMPTY>');
    await writeManifest();
    vi.stubEnv('ECTD_REQUIRE_DTD', 'true');
    const outputDir = path.join(work, 'refused-output');
    const mkdir = vi.spyOn(fs, 'mkdtemp');
    const failure = await packageEctdSubmission({ ...input, environment: 'production', outputDir }).catch(error => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toMatch(/DTD.*valid|valid.*DTD/i);
    expect(failure.message).toMatch(/stf-[^/\s]+\.xml/);
    expect(failure.message).toMatch(/study|wrong-study/);
    expect(failure.message).not.toContain(os.tmpdir());
    expect(await fs.readdir(outputDir).catch(() => [])).toEqual([]);
    const privateDirs = await Promise.all(mkdir.mock.results.map(result => result.value));
    for (const dir of privateDirs) await expect(fs.access(dir)).rejects.toMatchObject({ code: 'ENOENT' });
  }, 30_000);

  it('does not require an STF DTD when this sequence generates no STF', async () => {
    const bundle = await packageEctdSubmission({ ...input, leaves: input.leaves.filter(leaf => !leaf.studyId) });
    expect(bundle.dtdStatus?.required).not.toContain('ich-stf-v2-2.dtd');
    expect(bundle.dtdStatus?.requiredStylesheets).not.toContain('ich-stf-stylesheet-2-3.xsl');
    expect(bundle.dtdStatus?.validation?.expectedFiles).toHaveLength(2);
  }, 30_000);

});

describe('STF stylesheet in the captured package', () => {
  it('resolves the actual STF processing instruction to the current captured stylesheet and pins its bytes (SYNTHETIC)', async () => {
    await provisionSyntheticSupport();
    const stylesheet = Buffer.from('<!-- SYNTHETIC STF STYLESHEET, NOT AN AGENCY ARTIFACT -->');
    await fs.writeFile(path.join(drop, 'ich-stf-stylesheet-2-3.xsl'), stylesheet);
    await writeManifest();
    const bundle = await packageEctdSubmission(input);
    const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
    const stfPath = Object.keys(zip.files).find(name => /\/stf-[^/]+\.xml$/.test(name))!;
    expect(stfPath).toBeTruthy();
    const stf = await zip.file(stfPath)!.async('string');
    const processingInstruction = /<\?xml-stylesheet\s+type="text\/xsl"\s+href="([^"]+)"\s*\?>/.exec(stf);
    expect(processingInstruction).not.toBeNull();
    const stylesheetPath = path.posix.normalize(path.posix.join(path.posix.dirname(stfPath), processingInstruction![1]));
    expect(stylesheetPath).toBe('util/style/ich-stf-stylesheet-2-3.xsl');
    expect(await zip.file(stylesheetPath)!.async('nodebuffer')).toEqual(stylesheet);
    expect(bundle.dtdStatus?.requiredStylesheets).toContain('ich-stf-stylesheet-2-3.xsl');
    expect(bundle.dtdStatus?.validation?.integrity.verified).toContain('ich-stf-stylesheet-2-3.xsl');
    expect(bundle.dtdStatus?.validation?.passed).toBe(true);
    const md5 = createHash('md5').update(stylesheet).digest('hex');
    expect(await zip.file('util/index-md5.txt')!.async('string')).toContain(`${md5}  ${stylesheetPath}`);
  }, 30_000);

  it('reports a missing STF stylesheet even while all XML validates against the synthetic DTDs', async () => {
    await provisionSyntheticSupport({ includeStfStylesheet: false });
    const bundle = await packageEctdSubmission(input);
    expect(bundle.dtdStatus?.missing).toEqual([]);
    expect(bundle.dtdStatus?.missingStylesheets).toEqual(['ich-stf-stylesheet-2-3.xsl']);
    expect(bundle.dtdStatus?.selfContained).toBe(false);
    expect(bundle.dtdStatus?.validation?.files.every(file => file.dtd.ran && file.dtd.valid)).toBe(true);
    expect(bundle.dtdStatus?.validation?.passed).toBe(false);
  }, 30_000);

  it('refuses a required production STF package missing only the current STF stylesheet before writing output', async () => {
    await provisionSyntheticSupport({ includeStfStylesheet: false });
    vi.stubEnv('ECTD_REQUIRE_DTD', 'true');
    const outputDir = path.join(work, 'missing-stf-style-output');
    const failure = await packageEctdSubmission({ ...input, environment: 'production', outputDir }).catch(error => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toContain('ich-stf-stylesheet-2-3.xsl');
    expect(await fs.readdir(outputDir).catch(() => [])).toEqual([]);
  }, 30_000);
});
