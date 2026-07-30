/**
 * Export-contract proof — ZIP export → reopen (unzip) → nested-artifact +
 * manifest cross-reference qualification.
 *
 * Proof hierarchy tiers 6-7 for the ZIP path (docs/architecture/PROOF_HIERARCHY.md).
 * The universal packager emits a real multi-file .zip deliverable
 * (universal-packager.ts generateZip, via `archiver`): an inner `<title>.html`, an
 * inner `<title>.json`, and a `manifest.json` whose `files` array enumerates the
 * package members. A container is more than its magic bytes — its manifest can lie
 * and its members can be corrupt. This proof takes the REAL generator's output and:
 *   - REOPEN (independent of the writer): unzips with `adm-zip`, which never saw
 *     the archiver writer, and enumerates the entries;
 *   - CROSS-REFERENCE: parses `manifest.json` and asserts every file it claims is
 *     actually present in the archive (no phantom members);
 *   - NESTED QUALIFY: reopens the inner `.html` with an independent DOM parser and
 *     the inner `.json` with a parser, and confirms the authored title + content
 *     TOKEN survive inside both members;
 *   - NON-VACUOUS: a corrupted container fails to reopen, and a valid ZIP that
 *     lacks `manifest.json` is rejected by the package-identity check.
 *
 * No DB, no mocks: the universal packager imports only docx/archiver/crypto.
 * Output: tests/export-contract/__reports__/zip-export.{manifest.json,report.md}
 */

import { describe, it, expect, afterAll } from 'vitest';
import AdmZip from 'adm-zip';
import { parse as parseHtml } from 'node-html-parser';
import { packageSingleFormat } from '../../server/services/universal-packager';
import { JourneyRecorder } from '../golden-journeys/harness';

const REPORT_DIR = 'tests/export-contract/__reports__';

const TITLE = 'Zip Export Contract';
const TOKEN = 'ROUNDTRIPZIP8K';
const CONTENT = `Deliverable body — ${TOKEN}`;

/** Package identity: an entry list is one of our packages iff it carries a manifest. */
function hasManifest(names: string[]): boolean {
  return names.includes('manifest.json');
}

const R = new JourneyRecorder(
  'Export-contract proof — ZIP export → reopen → nested + manifest qualification',
  'Generate a real multi-file .zip with the universal packager, reopen it with an ' +
    'independent unzip, cross-reference its manifest against the real entries, and ' +
    'reopen the nested html/json members independently.',
  ['(no DB — direct generator output)'],
);

afterAll(() => {
  R.write('zip-export', REPORT_DIR);
});

describe('ZIP export → reopen → nested + manifest qualification', () => {
  R.limitations.push(
    'The reader (adm-zip + node-html-parser + JSON.parse) is fully independent of ' +
      'the archiver writer. Attachments/sections paths are not exercised (packageSingleFormat ' +
      'supplies neither); only the always-present html/json/manifest members are qualified.',
  );

  it('generates, reopens the archive, and qualifies members + manifest', async () => {
    // ── Generate the real artifact ──────────────────────────────────────────
    const gen = await R.step('generate-real-zip', async () => {
      const output = await packageSingleFormat('zip', TITLE, CONTENT);
      expect(output).not.toBeNull();
      const buf = output!.buffer;
      expect(buf.length).toBeGreaterThan(0);
      expect(output!.format).toBe('zip');
      expect(output!.checksum).toMatch(/^[a-f0-9]{64}$/);
      // ZIP local-file-header magic PK\x03\x04.
      expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
      return { sizeBytes: buf.length, format: output!.format, mimeType: output!.mimeType, fileName: output!.fileName };
    });
    const output = await packageSingleFormat('zip', TITLE, CONTENT);
    const buffer = output!.buffer;

    // ── REOPEN + CROSS-REFERENCE: manifest names match real entries ──────────
    const arch = await R.step('reopen-unzip-and-cross-reference-manifest', async () => {
      const zip = new AdmZip(buffer);
      const names = zip.getEntries().map((e) => e.entryName);
      expect(hasManifest(names)).toBe(true);

      const manifest = JSON.parse(zip.getEntry('manifest.json')!.getData().toString('utf-8')) as {
        title: string;
        files: string[];
      };
      expect(manifest.title).toBe(TITLE);
      expect(Array.isArray(manifest.files)).toBe(true);
      expect(manifest.files.length).toBeGreaterThan(0);
      // Every file the manifest claims is actually in the archive (no phantoms).
      for (const f of manifest.files) {
        expect(names, `manifest lists ${f} but it is not in the archive`).toContain(f);
      }
      const htmlName = manifest.files.find((f) => f.endsWith('.html'));
      const jsonName = manifest.files.find((f) => f.endsWith('.json'));
      expect(htmlName, 'no html member listed in manifest').toBeTruthy();
      expect(jsonName, 'no json member listed in manifest').toBeTruthy();
      return { entryCount: names.length, manifestFiles: manifest.files.length, htmlName, jsonName };
    });

    // ── NESTED QUALIFY: reopen the inner html + json independently ────────────
    await R.step('reopen-nested-members', async () => {
      const zip = new AdmZip(buffer);
      // Inner HTML → DOM parse, title + token retrievable.
      const innerHtml = zip.getEntry(arch.htmlName as string)!.getData().toString('utf-8');
      const root = parseHtml(innerHtml);
      expect(root.querySelector('h1')?.text).toBe(TITLE);
      expect(root.querySelector('.content')?.text).toContain(TOKEN);
      // Inner JSON → parse, envelope round-trips.
      const innerJson = JSON.parse(zip.getEntry(arch.jsonName as string)!.getData().toString('utf-8')) as {
        title: string;
        content: string;
        generator: string;
      };
      expect(innerJson.title).toBe(TITLE);
      expect(innerJson.content).toContain(TOKEN);
      expect(innerJson.generator).toBe('Concept2Cure Universal Packager');
      return { htmlTitle: root.querySelector('h1')?.text, jsonTitle: innerJson.title };
    });

    // ── Non-vacuous #1: a corrupted container fails to reopen ─────────────────
    await R.expectBlocked('corrupted-zip-fails-reopen', async () => {
      // Overwrite the tail (end-of-central-directory region) with garbage.
      const corrupt = Buffer.concat([buffer.subarray(0, Math.floor(buffer.length / 2)), Buffer.from('CORRUPTEDPAYLOADCORRUPTEDPAYLOAD')]);
      let readerFailed = false;
      try {
        const zip = new AdmZip(corrupt);
        const names = zip.getEntries().map((e) => e.entryName);
        // If it "reads", the manifest member must still be reopenable — it will not be.
        const m = zip.getEntry('manifest.json');
        if (!m) readerFailed = true;
        else JSON.parse(m.getData().toString('utf-8'));
        if (!hasManifest(names)) readerFailed = true;
      } catch {
        readerFailed = true;
      }
      return { blocked: readerFailed, readerFailed };
    });

    // ── Non-vacuous #2: a valid ZIP without a manifest is not our package ─────
    await R.expectBlocked('valid-zip-without-manifest-is-rejected', async () => {
      const fake = new AdmZip();
      fake.addFile('readme.txt', Buffer.from('I am a zip, but not a Concept2Cure package.'));
      const names = new AdmZip(fake.toBuffer()).getEntries().map((e) => e.entryName);
      return { blocked: !hasManifest(names), entries: names };
    });

    R.observations.push(
      `Generated a ${gen.sizeBytes}-byte .zip (${arch.entryCount} entries); cross-referenced ` +
        `${arch.manifestFiles} manifest files against real entries and reopened the nested html/json.`,
    );
  });
});
