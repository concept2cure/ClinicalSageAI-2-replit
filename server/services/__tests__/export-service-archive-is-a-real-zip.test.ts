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
  process.env.DATA_PATH = previous;
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
});
