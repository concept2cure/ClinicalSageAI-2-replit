import { describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { qualifyV3 } from '../qualify';

describe('qualification reaches every generated STF', () => {
  it('records original and lifecycle STF checks and explicit unvendored schema notes', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'qualification-stf-'));
    const previousDir = process.env.ECTD_DTD_DIR;
    process.env.ECTD_DTD_DIR = path.join(work, 'empty-drop-point');
    try {
      const report = await qualifyV3('fda', work);
      const names = report.validators.filter(row => row.name.includes('stf-study-001.xml')).map(row => row.name);
      expect(names.some(name => name.startsWith('xmllint well-formed ('))).toBe(true);
      expect(names.some(name => name.startsWith('0001/xmllint well-formed ('))).toBe(true);
      expect(report.notes.join(' ')).toMatch(/stf-study-001\.xml.*ich-stf-v2-2\.dtd/);
      expect(report.validators.filter(row => row.name.includes('stf-study-001.xml') && row.name.includes('well-formed')))
        .toEqual(expect.arrayContaining([expect.objectContaining({ ran: true, passed: true })]));
    } finally {
      if (previousDir === undefined) delete process.env.ECTD_DTD_DIR; else process.env.ECTD_DTD_DIR = previousDir;
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);
});
