import { beforeEach, describe, expect, it, vi } from 'vitest';

const child = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock('child_process', () => ({ execFile: child.execFile }));
import { __resetXmllintProbe, isXmllintAvailable, validateAgainstDtd } from '../xml-validator';

beforeEach(() => { child.execFile.mockReset(); __resetXmllintProbe(); });

describe('xmllint execution facts after its capability probe', () => {
  it('does not report execution when the previously available binary disappears', async () => {
    child.execFile.mockImplementation((_binary, args, _options, callback) => {
      if (args.includes('--version')) callback(null, '', 'libxml version');
      else callback(Object.assign(new Error('xmllint unavailable after probe'), { code: 'ENOENT' }), '', '');
    });
    expect(await isXmllintAvailable()).toBe(true);
    const result = await validateAgainstDtd('/synthetic/package/index.xml');
    expect(result).toMatchObject({ ran: false, valid: false });
    expect(result.errors.join(' ')).toMatch(/unavailable after probe/);
  });
  it('preserves a failed execution even when stderr is empty, with catalogs disabled per command', async () => {
    child.execFile.mockImplementation((_binary, args, _options, callback) => {
      if (args.includes('--version')) callback(null, '', 'libxml version');
      else callback(Object.assign(new Error('xmllint failed without stderr'), { code: 4 }), '', '');
    });
    const result = await validateAgainstDtd('/synthetic/package/index.xml');
    expect(result).toMatchObject({ ran: true, valid: false });
    expect(result.errors.join(' ')).toMatch(/failed without stderr/);
    const execution = child.execFile.mock.calls.find(call => call[1].includes('--valid'));
    expect(execution?.[1]).toEqual(expect.arrayContaining(['--nocatalogs', '--nonet']));
    expect(execution?.[2].env).toMatchObject({ XML_CATALOG_FILES: '', SGML_CATALOG_FILES: '' });
  });
});
