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
  resolveAttachmentSlot,
  CONDITIONAL_ATTACHMENT_SLOTS,
  ESTAR_CHAPTER_PATH,
  type EstarAttachmentSlot,
} from '../estar-attachment-slots';
import { readXfaDatasetsValues } from '../../../forms/fill-official-pdf';

const DIR = process.env.ESTAR_TEMPLATE_DIR ?? 'assets/estar-templates';
const TEMPLATES = [
  /* Counts corrected 2026-09-08. The first measurement counted distinct field
     NAMES, and the name is not unique: nIVD declares `AddAttachment` twice
     (under ReprocSterDocs and under BiocompatibilityDocs) and IVD declares five
     names twice. Deduping on the name silently DROPPED a real slot per
     template. It also read 19 of 165 appends out of commented-out code. That
     the first number agreed with an independent count in
     device-market-readiness-2026-09-07.md was not corroboration — both were
     counting the same wrong thing. */
  { label: 'nIVD', file: 'eSTAR-510k-non-ivd.pdf', slots: 113, chapters: 67 },
  { label: 'IVD', file: 'eSTAR-510k-ivd.pdf', slots: 145, chapters: 78 },
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
      expect(new Set(slots.flatMap((s) => s.chapters)).size).toBe(t.chapters);
    });

    it('identifies a slot by its FULL SOM PATH, because the name is not unique', () => {
      expect(slots.every((s) => /AddAttachment/.test(s.field))).toBe(true);
      expect(new Set(slots.map((s) => s.somPath)).size).toBe(slots.length);
      /* The short name is not: deduping on it is what dropped a slot. */
      expect(new Set(slots.map((s) => s.field)).size).toBeLessThan(slots.length);
      expect(slots.every((s) => s.somPath.startsWith('root.'))).toBe(true);
      expect(slots.every((s) => s.somPath.endsWith(`.${s.field}`))).toBe(true);
    });

    it('has the Biocompatibility slot the old reader dropped', () => {
      /* `AddAttachment` is declared twice; the first won and this one vanished.
         Outline node E1 "Biocompatibility" is mandatory:true in the shipped
         510(k) pack, so the one slot its content could go into did not exist. */
      const bio = slots.find((s) => s.somPath.endsWith('BiocompatibilityDocs.AddAttachment'));
      expect(bio, 'the Biocompatibility slot is missing again').toBeTruthy();
      expect(bio!.description).toBe('Biocompatibility | Biocompatibility Documents');
      expect(bio!.chapters).toHaveLength(1);
    });

    it('never invents a null description — FDA names every slot', () => {
      /* The old reader scanned a 1200-character window backwards and reported
         null for 3 nIVD / 2 IVD slots FDA does name, and once paired a
         description with a chapter from a different handler. Scanning within
         the control's own declaration cannot do either. */
      expect(slots.filter((s) => s.description === null)).toEqual([]);
    });

    it('reads only LIVE script — 19 of the appends are commented out', () => {
      /* 6 sit inside block comments and 13 behind line comments, per template.
         Every slot still resolves at least one chapter, so nothing was lost by
         ignoring them; they were simply never FDA's live routing. */
      expect(slots.every((s) => s.chapters.length >= 1)).toBe(true);
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
      for (const s of slots) {
        for (const chapter of s.chapters) expect(chapter, s.somPath).toMatch(ESTAR_CHAPTER_PATH);
      }
    });

    it('represents the ONE ambiguous slot instead of picking a branch', () => {
      /* `ADAddAttachment910` (the User Fee Form) writes /CHAPTER 1/CH1.04/ when
         ApplicationType.ATRadioButton100 == 2 (Health Canada) and
         /CHAPTER 1/CH1.09/ otherwise (FDA). The old reader took whichever came
         first in the file and returned the HEALTH CANADA chapter for a US
         submission, silently. The platform deliberately does not write that
         radio (estar-field-map.ts), so the honest answer is both, and a refusal
         at resolve time. */
      const ambiguous = slots.filter((s) => s.chapters.length > 1);
      expect(ambiguous).toHaveLength(1);
      expect(ambiguous[0].somPath).toBe('root.AdministrativeDocumentation.ADAddAttachment910');
      expect(ambiguous[0].chapters).toEqual(['/CHAPTER 1/CH1.04/', '/CHAPTER 1/CH1.09/']);
      expect(ambiguous[0].description).toBe('Administrative Documentation | User Fee Form');
    });

    it('resolves an unambiguous slot and REFUSES the ambiguous one', () => {
      const cover = slots.find((s) => s.field === 'CLAddAttachment110')!;
      expect(resolveAttachmentSlot(cover)).toEqual({
        ok: true,
        chapter: '/CHAPTER 1/CH1.01/',
        description: 'Administrative Documentation | Cover Letter',
      });

      /* The conditional slot is refused when nothing says which branch, and
         RESOLVED when the document's own value does — which is not a guess: it
         is the same computation FDA's script performs on the same input. */
      const userFee = slots.find((s) => s.field === 'ADAddAttachment910')!;
      const undecided = resolveAttachmentSlot(userFee);
      expect(undecided).toMatchObject({ ok: false, reason: 'undecided_condition' });
      expect((undecided as { message: string }).message).toContain('ATRadioButton100');

      expect(
        resolveAttachmentSlot(userFee, { 'root.ApplicationType.ATRadioButton100': '1' }),
      ).toMatchObject({ ok: true, chapter: '/CHAPTER 1/CH1.09/' });
      expect(
        resolveAttachmentSlot(userFee, { 'root.ApplicationType.ATRadioButton100': '2' }),
      ).toMatchObject({ ok: true, chapter: '/CHAPTER 1/CH1.04/' });
      /* Anything that is not 2 is the else branch, as the template writes it. */
      expect(
        resolveAttachmentSlot(userFee, { 'root.ApplicationType.ATRadioButton100': '3' }),
      ).toMatchObject({ ok: true, chapter: '/CHAPTER 1/CH1.09/' });
    });

    it('every conditional slot is recorded, and its record matches the template', async () => {
      /* Transcribed AND asserted, like the forbidden-extension list. A future
         template that makes another control conditional fails here instead of
         silently resolving to whichever branch appears first. */
      for (const slot of slots.filter((s) => s.chapters.length > 1)) {
        const entry = CONDITIONAL_ATTACHMENT_SLOTS[slot.somPath];
        expect(entry, `${slot.somPath} has two chapters and no recorded condition`).toBeTruthy();
        expect([...Object.values(entry.chapterWhen), entry.otherwise].sort()).toEqual(
          [...slot.chapters].sort(),
        );
      }
      /* And the deciding field is really in the document, with a real value. */
      const values = await readXfaDatasetsValues(await fs.readFile(t.path), [
        'root.ApplicationType.ATRadioButton100',
      ]);
      expect(values['root.ApplicationType.ATRadioButton100']).toBe('1');
    }, 120_000);

    it('reads the cover letter slot exactly as the template writes it', () => {
      const cover = slots.find((s) => s.field === 'CLAddAttachment110');
      expect(cover).toEqual({
        somPath: 'root.CoverLetter.CLAddAttachment110',
        field: 'CLAddAttachment110',
        chapters: ['/CHAPTER 1/CH1.01/'],
        description: 'Administrative Documentation | Cover Letter',
        singleAttachment: 'Only a single cover letter is needed.',
      });
    });

    /*
     * FIVE controls per template, identically on both, open their handler with
     *
     *     if (this.resolveNode(<the attachment row>).presence == "visible") {
     *       xfa.host.messageBox("Only a single cover letter is needed.","",2,0);
     *     } else { … the add path … }
     *
     * so the second file is simply never attached. The list is asserted whole
     * rather than counted, because a reader that started matching the
     * signed-PDF message box every handler opens with would report 113 and a
     * count of "more than zero" would call that correct.
     *
     * `docs/reports/wo8-estar-attachments-2026-09-07.md` §4 recorded this as
     * "exactly two controls per template (CLAddAttachment110 and
     * ADAddAttachment803)". That is wrong; it is these five. Corrected
     * 2026-09-08 when the planner needed the rule and read it rather than
     * copying the sentence.
     */
    it('names every control that refuses a second attachment, in FDA\'s words', () => {
      const single = slots.filter((s) => s.singleAttachment !== null);
      expect(single.map((s) => s.somPath)).toEqual([
        'root.CoverLetter.CLAddAttachment110',
        'root.AdministrativeInformation.RelatedSubmissions.NSE510k.ADAddAttachment660',
        'root.RiskManagement.RiskMitigationTable.RMAddAttachment100',
        'root.RiskManagement.BenefitRisk.BRAddAttachment110',
        'root.AdministrativeDocumentation.ADAddAttachment803',
      ]);
      // Never the signed-PDF guard, which every one of the 113/145 carries.
      for (const s of single) expect(s.singleAttachment).not.toMatch(/once this PDF is signed/);
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
