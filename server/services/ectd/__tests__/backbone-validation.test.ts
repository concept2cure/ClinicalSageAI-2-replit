import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { validateBackboneFile } from '../qualification/qualify';
import { __resetXmllintProbe } from '../xml-validator';

let work: string;
let pkg: string;
const xml = (system = 'util/dtd/root.dtd', body = '<root/>') => `<!DOCTYPE root SYSTEM "${system}">${body}`;
beforeEach(async () => {
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'backbone-proof-'));
  pkg = path.join(work, 'pkg');
  await fs.mkdir(path.join(pkg, 'util/dtd'), { recursive: true });
  await fs.writeFile(path.join(pkg, 'util/dtd/root.dtd'), '<!ELEMENT root EMPTY>');
  await fs.writeFile(path.join(pkg, 'index.xml'), xml());
  __resetXmllintProbe();
});
afterEach(async () => { __resetXmllintProbe(); await fs.rm(work, { recursive: true, force: true }); });

describe('canonical per-file DTD evidence', () => {
  it('records actual well-formedness, DOCTYPE and DTD execution', async () => {
    const result = await validateBackboneFile(pkg, 'index.xml');
    expect(result).toMatchObject({ relPath: 'index.xml', wellFormed: { ran: true, valid: true, mode: 'well-formed' },
      doctype: { valid: true, errors: [] }, dtd: { ran: true, valid: true, mode: 'dtd' } });
  });
  it('records grammar-invalid XML separately from well-formedness', async () => {
    await fs.writeFile(path.join(pkg, 'index.xml'), xml(undefined, '<root><unexpected/></root>'));
    expect(await validateBackboneFile(pkg, 'index.xml')).toMatchObject({ wellFormed: { ran: true, valid: true }, dtd: { ran: true, valid: false } });
  });
  it('records a declared but absent DTD as unexecuted, not passed', async () => {
    await fs.rm(path.join(pkg, 'util/dtd/root.dtd'));
    const result = await validateBackboneFile(pkg, 'index.xml');
    expect(result).toMatchObject({ doctype: { valid: true }, dtdSkipped: { relPath: 'index.xml', dtd: 'root.dtd' }, dtd: { ran: false, valid: false } });
    expect(result.dtd.errors.join(' ')).toMatch(/missing|absent|not.*package/i);
  });
  it('records a missing runtime as unexecuted, not passed', async () => {
    const previousPath = process.env.PATH;
    process.env.PATH = '';
    __resetXmllintProbe();
    try {
      expect(await validateBackboneFile(pkg, 'index.xml')).toMatchObject({ wellFormed: { ran: false, valid: false }, dtd: { ran: false, valid: false, errors: ['xmllint not available'] } });
    } finally { process.env.PATH = previousPath; __resetXmllintProbe(); }
  });
  it('does not let a commented declaration override the actual declaration', async () => {
    await fs.writeFile(path.join(pkg, 'index.xml'), `<!-- <!DOCTYPE root SYSTEM "missing.dtd"> -->${xml()}`);
    expect(await validateBackboneFile(pkg, 'index.xml')).toMatchObject({ doctype: { valid: true }, dtd: { ran: true, valid: true } });
  });
});

describe('validation is confined to the shipped package', () => {
  it.each(['../outside.xml', '/outside.xml'])('refuses unsafe XML path %s before invoking xmllint', async (relPath) => {
    await fs.writeFile(path.join(work, 'outside.xml'), xml('pkg/util/dtd/root.dtd'));
    expect(await validateBackboneFile(pkg, relPath)).toMatchObject({ doctype: { valid: false }, wellFormed: { ran: false }, dtd: { ran: false, valid: false } });
  });
  it('refuses a symlinked XML file outside the package', async () => {
    await fs.writeFile(path.join(work, 'outside.xml'), '<root/>');
    await fs.symlink(path.join(work, 'outside.xml'), path.join(pkg, 'linked.xml'));
    expect(await validateBackboneFile(pkg, 'linked.xml')).toMatchObject({ doctype: { valid: false }, dtd: { ran: false, valid: false } });
  });
  it.each(['absolute', 'symlink', 'network'])('refuses %s primary DTD references', async (kind) => {
    let system = path.join(pkg, 'util/dtd/root.dtd');
    if (kind === 'symlink') {
      await fs.writeFile(path.join(work, 'outside.dtd'), '<!ELEMENT root EMPTY>');
      await fs.symlink(path.join(work, 'outside.dtd'), path.join(pkg, 'util/dtd/link.dtd'));
      system = 'util/dtd/link.dtd';
    }
    if (kind === 'network') system = 'https://example.invalid/root.dtd';
    await fs.writeFile(path.join(pkg, 'index.xml'), xml(system));
    expect(await validateBackboneFile(pkg, 'index.xml')).toMatchObject({ doctype: { valid: false }, dtd: { ran: false, valid: false } });
  });
  it.each(['outside', 'network', 'missing', 'symlink', 'public'])('never certifies an unsafe %s secondary dependency', async (kind) => {
    let system = '../../../outside.dtd';
    await fs.writeFile(path.join(work, 'outside.dtd'), '<!ELEMENT root EMPTY>');
    if (kind === 'network') system = 'https://example.invalid/dependency.dtd';
    if (kind === 'missing') system = 'missing.dtd';
    if (kind === 'symlink') {
      await fs.symlink(path.join(work, 'outside.dtd'), path.join(pkg, 'util/dtd/dependency.dtd'));
      system = 'dependency.dtd';
    }
    const identifier = kind === 'public' ? `PUBLIC "synthetic public id" "${system}"` : `SYSTEM "${system}"`;
    await fs.writeFile(path.join(pkg, 'util/dtd/root.dtd'), `<!ENTITY % dependency ${identifier}>%dependency;`);
    const result = await validateBackboneFile(pkg, 'index.xml');
    expect(result.dtd.valid).toBe(false);
    expect(result.dtd.ran).toBe(false);
    expect(result.dtd.errors.join(' ')).toMatch(/dependency|outside|external|missing|absent/i);
  });
  it('allows a literal package-contained secondary dependency and lets xmllint judge its grammar', async () => {
    await fs.writeFile(path.join(pkg, 'util/dtd/root.dtd'), '<!ENTITY % dependency SYSTEM "dependency.dtd">%dependency;');
    await fs.writeFile(path.join(pkg, 'util/dtd/dependency.dtd'), '<!ELEMENT root EMPTY>');
    expect(await validateBackboneFile(pkg, 'index.xml')).toMatchObject({ dtd: { ran: true, valid: true } });
  });
  it('refuses unprovable declarations generated by parameter entities', async () => {
    await fs.writeFile(path.join(pkg, 'util/dtd/root.dtd'), '<!ENTITY % generated "<!ELEMENT root EMPTY>">%generated;');
    expect(await validateBackboneFile(pkg, 'index.xml')).toMatchObject({ dtd: { ran: false, valid: false } });
  });
});
