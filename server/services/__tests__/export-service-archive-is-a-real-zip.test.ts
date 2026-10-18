/**
 * A study session archive is a real ZIP, and its manifest lists only what it
 * holds and names what it could not export.
 *
 * ── What the code used to do ────────────────────────────────────────────────
 * `createZipArchive` gzipped a home-made `name:length:` stream and renamed the
 * .tar.gz to .zip — no ZIP reader can open it. With no insight storage
 * implemented, `study_insights.json` was written as `[]` and the manifest said
 * `insight_count: 0`, which reads as "this study has no insights";
 * `file_count` was a guess from whether a protocol existed; and an unnamed
 * persona was recorded as 'unknown'.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

vi.mock('../../storage', () => ({ storage: {} }));

import { ExportService } from '../export-service';

let dataPath: string;
const previous = process.env.DATA_PATH;
beforeAll(() => {
  dataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'export-service-'));
  process.env.DATA_PATH = dataPath;
  // A file left in the session directory by an earlier run must not ride along.
  fs.mkdirSync(path.join(dataPath, 'sessions', 'S-1'), { recursive: true });
  fs.writeFileSync(path.join(dataPath, 'sessions', 'S-1', 'study_insights.json'), '[]');
});
afterAll(() => {
  if (previous === undefined) delete process.env.DATA_PATH;
  else process.env.DATA_PATH = previous;
  fs.rmSync(dataPath, { recursive: true, force: true });
});

describe('ExportService.createSessionArchive', () => {
  it('writes a ZIP a reader can open, holding exactly the files its manifest lists', async () => {
    const zipPath = await new ExportService().createSessionArchive('S-1');
    const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(Object.keys(zip.files).sort()).toEqual([...manifest.files].sort());
    expect(manifest.files).toContain('manifest.json');
  });

  it('exports no empty insights file and no insight count, and says insights were not exported', async () => {
    const zipPath = await new ExportService().createSessionArchive('S-1');
    const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
    expect(zip.file('study_insights.json')).toBeNull();
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest).not.toHaveProperty('insight_count');
    expect(manifest).not.toHaveProperty('file_count');
    expect(manifest.persona).toBeNull();
    expect(manifest.not_exported.join(' ')).toMatch(/insight/i);
  });

  it.each(['../outside', '..', '.', '/absolute', 'nested/study', 'nested\\study', 'S-1/../../outside', 'S-1\0bad', 'S'.repeat(129)])(
    'refuses a non-identifier study ID before creating any files: %j', async studyId => {
      const before = fs.readdirSync(path.join(dataPath, 'exports')).sort();
      await expect(new ExportService().createSessionArchive(studyId)).rejects.toThrow('Study ID must be a plain identifier');
      expect(fs.readdirSync(path.join(dataPath, 'exports')).sort()).toEqual(before);
    },
  );

  it('does not overwrite an earlier export made in the same second', async () => {
    const service = new ExportService();
    const [first, second] = await Promise.all([service.createSessionArchive('S-1'), service.createSessionArchive('S-1')]);
    expect(first).not.toBe(second);
    for (const name of [first, second]) {
      expect((await JSZip.loadAsync(fs.readFileSync(name))).file('manifest.json')).not.toBeNull();
    }
  });

  it('does not follow a pre-existing session artifact symlink', async () => {
    const sentinel = path.join(dataPath, 'outside-manifest.json');
    fs.writeFileSync(sentinel, 'retained outside bytes');
    fs.symlinkSync(sentinel, path.join(dataPath, 'sessions', 'S-1', 'manifest.json'));
    const zipPath = await new ExportService().createSessionArchive('S-1');
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('retained outside bytes');
    const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
    expect(JSON.parse(await zip.file('manifest.json')!.async('string')).study_id).toBe('S-1');
  });

  it('refuses an exports directory symlink outside the configured data root', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'export-link-root-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'export-link-outside-'));
    try {
      process.env.DATA_PATH = root;
      const service = new ExportService();
      process.env.DATA_PATH = dataPath;
      fs.symlinkSync(outside, path.join(root, 'exports'));
      await expect(service.createSessionArchive('S-1')).rejects.toThrow('Export directory must remain inside');
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally {
      process.env.DATA_PATH = dataPath;
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
