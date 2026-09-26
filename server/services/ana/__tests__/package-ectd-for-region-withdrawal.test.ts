/**
 * package_ectd_for_region: a withdrawal is declared by pointer, never by bytes.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic). The tool's schema REQUIRED source_path
 * on every leaf, delete included, and had no modified_file field; the handler
 * mapped {operation:'delete', source_path} straight into the packager. Every
 * withdrawal declared through AnA shipped the withdrawn document's bytes in
 * the withdrawing sequence, with no pointer at the filed copy.
 *
 * Now: source_path is not required (a delete has none), modified_file exists
 * and is carried through, and a delete that still names a source_path reaches
 * the packager's refusal instead of being shipped.
 */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import JSZip from 'jszip';

import { PACKAGE_ECTD_FOR_REGION } from '../AnaToolDefinitions';
import { getToolHandler } from '../AnaToolExecutor';

const CTX = { organizationId: 1, userId: 1, humanConfirmed: true };
const pdf = (l: string) => Buffer.from(`%PDF-1.4\n% ${l}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');

type LeafSchema = { properties: Record<string, unknown>; required: string[] };
const leafSchema = (): LeafSchema =>
  ((PACKAGE_ECTD_FOR_REGION.input_schema as unknown as { properties: { leaves: { items: LeafSchema } } }).properties.leaves.items);

async function run(input: Record<string, unknown>) {
  const handler = getToolHandler('package_ectd_for_region');
  expect(handler).toBeTypeOf('function');
  return JSON.parse(await handler!(input, CTX)) as { ok?: boolean; error?: string; bundlePath?: string };
}

const base = (outputDir: string, leaves: unknown[]) => ({
  region: 'fda', application_id: '123456', sequence: '0001', submission_type: 'original',
  application_type: 'ind', sponsor_id: 'D', sponsor_name: 'S', product_name: 'P',
  output_dir: outputDir, leaves,
});

describe('package_ectd_for_region — withdrawal', () => {
  it('does not require source_path, and offers modified_file', () => {
    const s = leafSchema();
    expect(s.required).not.toContain('source_path');
    expect(s.properties).toHaveProperty('modified_file');
  });

  it('packages a delete declared by modified_file, shipping no bytes for it', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-del-'));
    try {
      const cover = path.join(work, 'cover.pdf');
      await fs.writeFile(cover, pdf('cover'));
      const out = await run(base(path.join(work, 'out'), [
        { ctd_section: '3.2.S.2', operation: 'delete', file_name: 'old-manufacture.pdf', title: 'Old Manufacture',
          modified_file: '../0000/m3/3-2-s-2/old-manufacture.pdf' },
        { ctd_section: '1.2', operation: 'new', source_path: cover, file_name: 'cover.pdf', title: 'Cover' },
      ]));
      expect(out.error).toBeUndefined();
      const zip = await JSZip.loadAsync(await fs.readFile(out.bundlePath!));
      expect(Object.keys(zip.files).some((f) => f.endsWith('old-manufacture.pdf'))).toBe(false);
      const xml = (await zip.file('index.xml')?.async('string')) ?? '';
      expect(xml).toMatch(/<leaf operation="delete" modified-file="\.\.\/0000\/m3\/3-2-s-2\/old-manufacture\.pdf"/);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  });

  it('refuses a delete that still carries a source_path, naming the leaf', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-del-'));
    try {
      const withdrawn = path.join(work, 'old-manufacture.pdf');
      await fs.writeFile(withdrawn, pdf('WITHDRAWN DOCUMENT BYTES'));
      const out = await run(base(path.join(work, 'out'), [
        { ctd_section: '3.2.S.2', operation: 'delete', source_path: withdrawn, file_name: 'old-manufacture.pdf',
          title: 'Old Manufacture', modified_file: '../0000/m3/3-2-s-2/old-manufacture.pdf' },
      ]));
      expect(out.ok).toBeUndefined();
      expect(out.error).toMatch(/old-manufacture\.pdf/);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  });

  it('refuses a non-delete leaf with no source_path instead of reading an empty path', async () => {
    const out = await run(base(os.tmpdir(), [
      { ctd_section: '1.2', operation: 'new', file_name: 'cover.pdf', title: 'Cover' },
    ]));
    expect(out.error).toMatch(/source_path/);
    expect(out.error).toMatch(/cover\.pdf/);
  });

  // 2026-09-23 (W5/D7, round-2 skeptic, second pass): a delete in 0000 with no
  // modified_file returned ok:true and filed a delete of a file on record nowhere.
  it('refuses a delete in sequence 0000, naming the leaf', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-del-'));
    try {
      const cover = path.join(work, 'cover.pdf');
      await fs.writeFile(cover, pdf('cover'));
      const out = await run({ ...base(path.join(work, 'out'), [
        { ctd_section: '3.2.S.2', operation: 'delete', file_name: 'ghost.pdf', title: 'Ghost' },
        { ctd_section: '1.2', operation: 'new', source_path: cover, file_name: 'cover.pdf', title: 'Cover' },
      ]), sequence: '0000' });
      expect(out.ok).toBeUndefined();
      expect(out.error).toMatch(/ghost\.pdf/);
      expect(out.error).toMatch(/0000/);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  });
});
