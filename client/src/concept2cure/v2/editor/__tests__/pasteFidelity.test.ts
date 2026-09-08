// @vitest-environment jsdom
/**
 * A paste that loses the writer's words says so.
 *
 * ── The gap this closes ──────────────────────────────────────────────────────
 * `assessFidelity` protects STORED content: before a section becomes
 * rich-editable, the parse is proven to have kept every word, and a mismatch
 * drops it to source mode. Paste is the other door into this editor, and it is
 * the busier one — a medical writer drafts in Word, or lifts pages out of a
 * previous CSR, and pastes.
 *
 * The gate cannot see that path. Whatever the schema has no node for is dropped
 * at the instant of the paste, and by the time the section is stored the stored
 * string and the parse agree with each other perfectly, because the loss
 * happened before either of them existed. The words were gone one keystroke
 * after they arrived, and nothing said so.
 *
 * ── Why a count and not a diff ───────────────────────────────────────────────
 * The comparison is deliberately the same one the gate makes — words carried
 * against words kept — so it can report THAT something was dropped and not
 * what. The notice it drives therefore asks the writer to check their source
 * rather than claiming to know what went missing, which is the honest limit of
 * what a count can support.
 */
import { describe, expect, it } from 'vitest';
import { assessPasteFidelity } from '../roundTrip';

/* A Word paste as it actually arrives: mso attributes, a footnote reference,
   and a text box — constructs this schema has no node for. */
const WORD_HTML =
  '<p class="MsoNormal">The primary endpoint was overall survival.</p>' +
  '<div style="mso-element:footnote"><p>Analysed on the ITT population.</p></div>';

describe('assessPasteFidelity', () => {
  it('reports the words the parse could not keep', () => {
    // The footnote block is dropped; only the first sentence survives.
    const kept = 'The primary endpoint was overall survival.';
    const v = assessPasteFidelity(WORD_HTML, kept);

    expect(v.expected).toBe(11);
    expect(v.kept).toBe(6);
    expect(v.lost).toBe(5);
  });

  it('stays quiet when the parse kept everything', () => {
    const html = '<p>The primary endpoint was overall survival.</p>';
    const v = assessPasteFidelity(html, 'The primary endpoint was overall survival.');

    expect(v.lost).toBe(0);
  });

  /**
   * The property that decides whether anyone reads this notice. The two counts
   * come from different tokenisers — a DOM text walk and ProseMirror's slice
   * text — so they can disagree by a word across several pages. Reporting that
   * would put a warning on every ordinary paste.
   */
  it('does not cry wolf over a one-word tokenisation difference', () => {
    const html = '<p>' + Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ') + '</p>';
    const keptOneShort = Array.from({ length: 399 }, (_, i) => `word${i}`).join(' ');

    expect(assessPasteFidelity(html, keptOneShort).lost).toBe(0);
  });

  it('reports a real loss on a long paste, where one word would be noise', () => {
    const html = '<p>' + Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ') + '</p>';
    const keptHalf = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');

    const v = assessPasteFidelity(html, keptHalf);
    expect(v.lost).toBe(200);
  });

  it('ignores a plain-text paste, which has no structure to lose', () => {
    const v = assessPasteFidelity('Just some copied prose, no markup at all.', 'Just some');
    expect(v).toEqual({ expected: 0, kept: 0, lost: 0 });
  });

  /**
   * Whitespace is normalised on both sides for the same reason the gate does it:
   * a paste that reflows text has not lost any of it.
   */
  it('is insensitive to reflowed whitespace', () => {
    const html = '<p>The   primary\n\nendpoint was\tsurvival.</p>';
    expect(assessPasteFidelity(html, 'The primary endpoint was survival.').lost).toBe(0);
  });
});
