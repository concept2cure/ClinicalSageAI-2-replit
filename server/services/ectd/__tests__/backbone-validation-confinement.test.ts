/** Real libxml2 with synthetic package bytes; no agency schemas or live I/O. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateBackboneFile } from '../backbone-validation';
import { __resetXmllintProbe, isXmllintAvailable } from '../xml-validator';

let work: string;
let pkg: string;
let grammar: string;
const emptyRoot = '<!ELEMENT root EMPTY>';
const documentFor = (systemId = 'util/dtd/root.dtd') => `<!DOCTYPE root SYSTEM "${systemId}"><root/>`;

beforeAll(async () => {
  __resetXmllintProbe();
  expect(await isXmllintAvailable(), 'Confinement qualification requires the real xmllint binary on PATH; absence is not a passing run.').toBe(true);
});
beforeEach(async () => {
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-confinement-'));
  pkg = path.join(work, 'pkg');
  grammar = path.join(pkg, 'util/dtd/root.dtd');
  await fs.mkdir(path.dirname(grammar), { recursive: true });
  await fs.writeFile(grammar, emptyRoot);
  await fs.writeFile(path.join(pkg, 'index.xml'), documentFor());
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(work, { recursive: true, force: true });
});

async function outsideGrammar(): Promise<string> {
  const outside = path.join(work, 'outside.dtd');
  await fs.writeFile(outside, emptyRoot);
  return outside;
}
async function expectConfinedRefusal(): Promise<void> {
  const result = await validateBackboneFile(pkg, 'index.xml');
  expect(result.dtd).toMatchObject({ ran: false, valid: false, mode: 'dtd' });
  expect(result.dtd.errors.join(' ').length).toBeGreaterThan(0);
  expect(result.reports.some(report => !report.passed)).toBe(true);
}

describe('actual package-confined DTD validation', () => {
  it('executes a real contained DTD as its positive control', async () => {
    const result = await validateBackboneFile(pkg, 'index.xml');
    expect(result.wellFormed).toMatchObject({ ran: true, valid: true });
    expect(result.doctype).toEqual({ valid: true, errors: [] });
    expect(result.dtd).toMatchObject({ ran: true, valid: true, mode: 'dtd' });
    expect(result.reports.every(report => report.passed)).toBe(true);
  });

  it('accepts a captured package-local secondary parameter entity', async () => {
    await fs.writeFile(grammar, '<!ENTITY % module SYSTEM "module.ent">%module;');
    await fs.writeFile(path.join(path.dirname(grammar), 'module.ent'), emptyRoot);
    expect((await validateBackboneFile(pkg, 'index.xml')).dtd).toMatchObject({ ran: true, valid: true });
  });

  it('does not certify a DOCTYPE written only in a comment', async () => {
    await fs.writeFile(path.join(pkg, 'index.xml'), '<!-- <!DOCTYPE root SYSTEM "util/dtd/root.dtd"> --><root/>');
    const result = await validateBackboneFile(pkg, 'index.xml');
    expect(result.doctype.valid).toBe(false);
    expect(result.reports.find(report => report.name.startsWith('backbone DOCTYPE'))?.passed).toBe(false);
  });

  it('does not let a benign commented declaration mask the actual escaped DTD', async () => {
    await outsideGrammar();
    await fs.writeFile(path.join(pkg, 'index.xml'), '<!-- <!DOCTYPE root SYSTEM "util/dtd/root.dtd"> -->' + documentFor('../outside.dtd'));
    await expectConfinedRefusal();
  });

  it('rejects a symlinked XML input even when its declaration names a local DTD', async () => {
    const outside = path.join(work, 'outside.xml');
    await fs.writeFile(outside, documentFor());
    await fs.rm(path.join(pkg, 'index.xml'));
    await fs.symlink(outside, path.join(pkg, 'index.xml'));
    await expectConfinedRefusal();
  });

  it('rejects a symlinked primary DTD', async () => {
    const outside = await outsideGrammar();
    await fs.rm(grammar);
    await fs.symlink(outside, grammar);
    await expectConfinedRefusal();
  });

  it('rejects an intermediate DTD directory symlink', async () => {
    const externalDirectory = path.join(work, 'external-dtd');
    await fs.mkdir(externalDirectory);
    await fs.writeFile(path.join(externalDirectory, 'root.dtd'), emptyRoot);
    await fs.rm(path.dirname(grammar), { recursive: true });
    await fs.symlink(externalDirectory, path.dirname(grammar));
    await expectConfinedRefusal();
  });

  it('rejects a symlinked secondary parameter entity', async () => {
    const outside = await outsideGrammar();
    await fs.writeFile(grammar, '<!ENTITY % module SYSTEM "module.ent">%module;');
    await fs.symlink(outside, path.join(path.dirname(grammar), 'module.ent'));
    await expectConfinedRefusal();
  });

  it('refuses an absolute file URI hidden in a secondary DTD declaration', async () => {
    const outside = await outsideGrammar();
    await fs.writeFile(grammar, `<!ENTITY % external SYSTEM "${pathToFileURL(outside).href}">%external;`);
    await expectConfinedRefusal();
  });

  it.each(['missing.ent', 'https://schemas.invalid/not-captured.ent'])('refuses a missing or remote module even when libxml can validate without it: %s', async module => {
    await fs.writeFile(grammar, `<!ENTITY % optional SYSTEM "${module}">%optional;${emptyRoot}`);
    await expectConfinedRefusal();
  });

  it('refuses an XML internal subset that references an outside entity', async () => {
    const outside = path.join(work, 'outside.txt');
    await fs.writeFile(outside, 'Synthetic outside text.');
    await fs.writeFile(grammar, '<!ELEMENT root (#PCDATA)>');
    await fs.writeFile(path.join(pkg, 'index.xml'), `<!DOCTYPE root SYSTEM "util/dtd/root.dtd" [<!ENTITY outside SYSTEM "${pathToFileURL(outside).href}">]><root>&outside;</root>`);
    await expectConfinedRefusal();
  });

  it('does not use an ambient XML catalog as proof of a missing packaged module', async () => {
    const outside = await outsideGrammar();
    const module = path.join(path.dirname(grammar), 'missing.ent');
    const catalog = path.join(work, 'catalog.xml');
    await fs.writeFile(catalog, `<catalog xmlns="urn:oasis:names:tc:entity:xmlns:xml:catalog"><system systemId="${pathToFileURL(module).href}" uri="${pathToFileURL(outside).href}"/></catalog>`);
    vi.stubEnv('XML_CATALOG_FILES', catalog);
    vi.stubEnv('SGML_CATALOG_FILES', catalog);
    await fs.writeFile(grammar, '<!ENTITY % module SYSTEM "missing.ent">%module;');
    await expectConfinedRefusal();
  });

  it('rejects URI-encoded traversal even when a literal percent-path decoy exists in the package', async () => {
    await outsideGrammar();
    const system = 'util/dtd/%2e%2e/%2e%2e/%2e%2e/outside.dtd';
    const decoy = path.join(pkg, system);
    await fs.mkdir(path.dirname(decoy), { recursive: true });
    await fs.writeFile(decoy, '<!ELEMENT different EMPTY>');
    await fs.writeFile(path.join(pkg, 'index.xml'), documentFor(system));
    await expectConfinedRefusal();
  });

  it('rejects a constructed external identifier split across parameter entities', async () => {
    const outside = await outsideGrammar();
    await fs.writeFile(grammar, `<!ENTITY % header "SYSTEM '${pathToFileURL(outside).href}'">\n<!ENTITY % external %header;>\n%external;`);
    await expectConfinedRefusal();
  });

  it('does not audit UTF-16 DTD bytes as if they were dependency-free UTF-8', async () => {
    const outside = await outsideGrammar();
    const text = `\uFEFF<?xml encoding="UTF-16"?>\n<!ENTITY % external SYSTEM "${pathToFileURL(outside).href}">\n%external;`;
    await fs.writeFile(grammar, Buffer.from(text, 'utf16le'));
    await expectConfinedRefusal();
  });
});
