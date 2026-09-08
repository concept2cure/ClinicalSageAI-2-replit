/**
 * The eSTAR's attachment slots, measured from the template's own scripts.
 *
 * An attachment reaches CDRH as a routing token in the form's
 * `Verification.AttachmentManifest` field. FDA's own code writes it, and says
 * exactly what it is:
 *
 *     d[AttachmentIndex].description = "Administrative Documentation | Cover Letter";
 *     Verification.AttachmentManifest.rawValue =
 *       Verification.AttachmentManifest.rawValue + "<<" + d[AttachmentIndex].path
 *       + "|/CHAPTER 1/CH1.01/" + ">>";
 *
 * So a slot is three facts — the `AddAttachment` control, the chapter token it
 * writes, and FDA's own description of what belongs there — and all three are
 * IN the template. They are read from it rather than transcribed into a table
 * here, which is the same rule `estar-field-map.ts` follows: a hand-copied
 * regulatory constant is a transcription error waiting for a deploy.
 *
 * The counts below were measured on the vendored templates on 2026-09-07. They
 * are pinned so that a template swap has to be noticed rather than absorbed.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';

import {
  attachmentManifestToken,
  listEstarAttachmentSlots,
  ESTAR_CHAPTER_PATH,
  type EstarAttachmentSlot,
} from '../estar-attachment-slots';

const DIR = process.env.ESTAR_TEMPLATE_DIR ?? 'assets/estar-templates';
const TEMPLATES = [
  { label: 'nIVD', file: 'eSTAR-510k-non-ivd.pdf', slots: 112, chapters: 65 },
  { label: 'IVD', file: 'eSTAR-510k-ivd.pdf', slots: 140, chapters: 77 },
].map((t) => ({ ...t, path: path.resolve(DIR, t.file), exists: fsSync.existsSync(path.resolve(DIR, t.file)) }));

describe('attachmentManifestToken', () => {
  it('is exactly the shape FDA\'s own script builds', () => {
    expect(attachmentManifestToken('Cover Letter.pdf', '/CHAPTER 1/CH1.01/')).toBe(
      '<<Cover Letter.pdf|/CHAPTER 1/CH1.01/>>',
    );
  });

  it('refuses a chapter that is not a chapter path', () => {
    expect(() => attachmentManifestToken('a.pdf', 'CH1.01')).toThrow(/CHAPTER path/);
  });

  it('accepts the shapes the templates actually contain, not the shape they look like', () => {
    /* Both measured in the vendored templates on 2026-09-07. A tighter guess
       — /CHAPTER \d+/CH\d+\.\d+/ — rejects a fifth of the real slots. */
    expect(() => attachmentManifestToken('a.pdf', '/CHAPTER 6A/CH6A.03/CH6A.03.01/')).not.toThrow();
    expect(() =>
      attachmentManifestToken('a.pdf', '/CHAPTER 3/CH3.05/CH3.05.05/CH3.05.05.01/'),
    ).not.toThrow();
  });
});

for (const t of TEMPLATES) {
  describe.skipIf(!t.exists)(`eSTAR attachment slots — ${t.label}`, () => {
    let slots: EstarAttachmentSlot[];

    beforeAll(async () => {
      slots = await listEstarAttachmentSlots(await fs.readFile(t.path));
    }, 120_000);

    it(`finds ${t.slots} slots over ${t.chapters} distinct chapters`, () => {
      expect(slots).toHaveLength(t.slots);
      /* Fewer chapters than slots: several controls file into one chapter —
         five ADAddAttachment0xx all route to /CHAPTER 1/CH1.04/. */
      expect(new Set(slots.map((s) => s.chapter)).size).toBe(t.chapters);
    });

    it('names each slot by its AddAttachment control, once', () => {
      expect(slots.every((s) => /AddAttachment/.test(s.field))).toBe(true);
      expect(new Set(slots.map((s) => s.field)).size).toBe(slots.length);
    });

    it('does not offer the labeling-type re-route as a slot', () => {
      /* `LBAttachment360.Type` moves an ALREADY-attached labeling file between
         /CHAPTER 5/CH5.04, CH5.08, CH5.09 and CH5.10 as the applicant changes
         the labeling kind. It writes the manifest, and it is not somewhere a
         file can be attached; its real slot is here on its own. */
      expect(slots.some((s) => s.field === 'Type')).toBe(false);
      expect(slots.some((s) => s.field === 'LBAddAttachment360')).toBe(true);
    });

    it('carries a chapter token in the form the manifest expects', () => {
      for (const s of slots) expect(s.chapter, s.field).toMatch(ESTAR_CHAPTER_PATH);
    });

    it('reads the cover letter slot exactly as the template writes it', () => {
      const cover = slots.find((s) => s.field === 'CLAddAttachment110');
      expect(cover).toEqual({
        field: 'CLAddAttachment110',
        chapter: '/CHAPTER 1/CH1.01/',
        description: 'Administrative Documentation | Cover Letter',
      });
    });

    it('describes most slots — the description is FDA\'s, or null, never invented', () => {
      const described = slots.filter((s) => s.description !== null);
      expect(described.length).toBeGreaterThan(slots.length / 2);
      for (const s of slots) {
        expect(s.description === null || s.description.length > 0).toBe(true);
      }
    });
  });
}
