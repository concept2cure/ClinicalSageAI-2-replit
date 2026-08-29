/**
 * Inline marks survive the tag strip — in BOTH export pipelines.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Two independent pipelines reduce stored HTML to text with
 * `replace(/<[^>]+>/g, '')`, a rule that removes a tag and inserts NOTHING:
 *
 *   server/services/ectd/leaf-pdf-renderer.ts       htmlToPlainText
 *   server/services/docx/masterDocumentBuilder.ts   htmlToOoxml
 *
 * For `<sup>` and for the editor's tracked-change marks that is not lost
 * formatting, it is changed content:
 *
 *   10<sup>6</sup> CFU/mL                        ->  106 CFU/mL
 *   <del>100 mg</del><ins>200 mg</ins>           ->  100 mg200 mg
 *   Dose <del>100 mg</del> daily                 ->  Dose 100 mg daily
 *
 * The first is wrong by five orders of magnitude and looks completely normal.
 * The third is the most dangerous: a deletion a reviewer PROPOSED was silently
 * ACCEPTED, so the filed document asserts 100 mg as settled fact.
 *
 * ── Why both pipelines are asserted here ─────────────────────────────────────
 * They are two callers of one capability, and they had already drifted apart on
 * the identical table-cell defect once — it was fixed in one and not the other.
 * Testing only the shared helper would prove the conversion works and not that
 * either pipeline calls it. Each is exercised through its own public function.
 */
import { describe, it, expect } from 'vitest';

import { inlineMarksToText } from '../inline-marks-to-text';
import { htmlToPlainText } from '../../services/ectd/leaf-pdf-renderer';
import { htmlToOoxml } from '../../services/docx/masterDocumentBuilder';

describe('inlineMarksToText', () => {
  it('keeps a superscript as a magnitude, not a concatenated digit', () => {
    expect(inlineMarksToText('10<sup>6</sup>')).toBe('10^6');
  });

  it('marks both sides of an unresolved change', () => {
    expect(inlineMarksToText('<del>100 mg</del><ins>200 mg</ins>')).toBe('[-100 mg-][+200 mg+]');
  });

  it('tolerates the attributes the editor actually writes', () => {
    /* The suggestion marks carry data-author-name and data-at. A bare-tag
       pattern would miss every real one. */
    expect(
      inlineMarksToText('<ins data-author-name="QA" data-at="2026-01-01T00:00:00Z">b</ins>'),
    ).toBe('[+b+]');
  });

  it('leaves subscript alone — dropping it changes nothing a reader misreads', () => {
    expect(inlineMarksToText('CO<sub>2</sub>')).toBe('CO<sub>2</sub>');
  });

  it('leaves every other tag untouched for the caller to handle', () => {
    /* It runs before the caller's own structural rules, which must still see
       the document they expect. */
    expect(inlineMarksToText('<p>a</p><table><tr><td>b</td></tr></table>')).toBe(
      '<p>a</p><table><tr><td>b</td></tr></table>',
    );
  });

  it('changes nothing when there are no marks', () => {
    expect(inlineMarksToText('<p>Administer 200 mg daily.</p>')).toBe(
      '<p>Administer 200 mg daily.</p>',
    );
  });
});

describe('both pipelines actually call it', () => {
  const PENDING = '<p>Administer <del>100 mg</del><ins>200 mg</ins> daily.</p>';
  const EXPONENT = '<p>Bioburden was 10<sup>6</sup> CFU/mL.</p>';

  describe('the eCTD leaf PDF renderer', () => {
    it('does not fuse a pending change', () => {
      expect(htmlToPlainText(PENDING)).toBe('Administer [-100 mg-][+200 mg+] daily.');
    });
    it('does not drop an exponent', () => {
      expect(htmlToPlainText(EXPONENT)).toBe('Bioburden was 10^6 CFU/mL.');
    });
    it('does not accept a proposed deletion', () => {
      expect(htmlToPlainText('<p>Dose <del>100 mg</del> daily.</p>')).not.toBe(
        'Dose 100 mg daily.',
      );
    });
  });

  describe('the master DOCX builder', () => {
    /* Asserted over the emitted OOXML rather than an intermediate string: the
       structural rules strip inner tags in four separate places, so a helper
       called in the wrong order would still lose the marks. */
    it('does not fuse a pending change', () => {
      const xml = htmlToOoxml(PENDING);
      expect(xml).toContain('[-100 mg-][+200 mg+]');
      expect(xml, 'the two values were concatenated into one').not.toContain('100 mg200 mg');
    });

    it('does not drop an exponent', () => {
      const xml = htmlToOoxml(EXPONENT);
      expect(xml).toContain('10^6');
      expect(xml, 'the exponent became a trailing digit').not.toMatch(/was 106\b/);
    });

    it('does not accept a proposed deletion', () => {
      const xml = htmlToOoxml('<p>Dose <del>100 mg</del> daily.</p>');
      expect(xml).toContain('[-100 mg-]');
    });

    it('still builds ordinary settled prose unchanged', () => {
      const xml = htmlToOoxml('<p>Administer 200 mg daily.</p>');
      expect(xml).toContain('Administer 200 mg daily.');
      expect(xml).not.toContain('[-');
      expect(xml).not.toContain('[+');
      expect(xml).not.toContain('^');
    });
  });
});
