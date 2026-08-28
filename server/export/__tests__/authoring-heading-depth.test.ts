/**
 * CTD heading depth survives the parse and reaches both export renderers.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The block model declared `level?: 1 | 2 | 3` and the parser clamped with
 *
 *     const level = Math.min(3, Number(heading[1])) as 1 | 2 | 3;
 *
 * CTD sections nest deeper than three — 2.7.3.1.2 is five — so an H4 a writer
 * had legitimately stored came back an H3 and the document's hierarchy was
 * quietly flattened one rank.
 *
 * The round-trip fidelity gate could not catch it. That gate compares TEXT
 * (client/src/concept2cure/v2/editor/roundTrip.ts), and a heading demoted from
 * H4 to H3 keeps every character: the words survive, the structure does not.
 * Hierarchy is what a reviewer navigates a submission by — it drives the Word
 * navigation pane and the generated table of contents — so this is a filing
 * defect, not a styling one.
 *
 * ── And the renderers made it worse ──────────────────────────────────────────
 * DOCX mapped level 1→Heading 2, 2→Heading 3, and EVERYTHING else→Heading 4.
 * HTML did not look at the level at all: `parts.push(\`<h3>…</h3>\`)` for every
 * heading, so that path collapsed the whole hierarchy to a single rank.
 *
 * The one-level offset in both renderers is deliberate and preserved: the
 * section title is the H1 above this content, so content level 1 is Heading 2.
 */
import { describe, expect, it } from 'vitest';
import { sectionContentToBlocks } from '../authoring-section-content';
import { blocksToHtml } from '../authoring-blocks-to-html';

const NESTED =
  '<h1>Summary of Clinical Efficacy</h1>' +
  '<h2>Study Design</h2>' +
  '<h3>Population</h3>' +
  '<h4>Inclusion criteria</h4>' +
  '<h5>Laboratory thresholds</h5>' +
  '<p>Body text.</p>';

describe('heading depth — CTD nests deeper than three', () => {
  it('keeps every level through the parse instead of clamping at 3', () => {
    const levels = sectionContentToBlocks(NESTED)
      .filter((b) => b.kind === 'heading')
      .map((b) => b.level);

    // The whole point: 4 and 5 are present rather than folded onto 3.
    expect(levels).toEqual([1, 2, 3, 4, 5]);
  });

  it('renders each level as its own rank in HTML, offset below the section title', () => {
    const html = blocksToHtml(sectionContentToBlocks(NESTED));

    expect(html).toContain('<h2>Summary of Clinical Efficacy</h2>');
    expect(html).toContain('<h3>Study Design</h3>');
    expect(html).toContain('<h4>Population</h4>');
    expect(html).toContain('<h5>Inclusion criteria</h5>');
    expect(html).toContain('<h6>Laboratory thresholds</h6>');

    // The regression this replaces: every heading arriving as <h3>.
    expect((html.match(/<h3>/g) || []).length).toBe(1);
  });

  it('never emits a heading above h6, whatever the input claims', () => {
    // h6 is the deepest rank HTML has; a level beyond the schema must clamp at
    // the renderer rather than produce invalid markup.
    const html = blocksToHtml(sectionContentToBlocks('<h6>Very deep</h6>'));
    expect(html).toMatch(/<h[2-6]>Very deep<\/h[2-6]>/);
    expect(html).not.toMatch(/<h[7-9]/);
  });
});
