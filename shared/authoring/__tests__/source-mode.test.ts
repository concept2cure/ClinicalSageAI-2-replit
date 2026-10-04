/**
 * opensInSourceMode — the section editor's deterministic source-mode test, in
 * one place for the editor and the lineage.
 *
 * Periodic review 2026-09-28, editor family, the batch-draft accept, round 4
 * (D4): RichSectionEditor opens content holding figure, svg, video, embed or
 * object in source mode, a textarea showing every character. The lineage read
 * such content as HTML and credited AnA with clauses whose markup that reader
 * shows. It now reads it as the editor does, through this predicate.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { opensInSourceMode } from '../source-mode';

describe('opensInSourceMode', () => {
  it.each([
    ['<figure></figure>'],
    ['<p>a</p><SVG viewBox="0 0 1 1"></svg>'],
    ['<video\nsrc="x">'],
    ['<embed/>'],
    ['<object data="x">'],
  ])('is true for %j', (stored) => {
    expect(opensInSourceMode(stored)).toBe(true);
  });

  it.each([
    ['<p>Plain paragraph.</p>'],
    ['<figcaption>x</figcaption>'],
    ['<figures>'],
    ['< figure>'],
    ['&lt;figure&gt;'],
    ['a figure in prose'],
  ])('is false for %j', (stored) => {
    expect(opensInSourceMode(stored)).toBe(false);
  });

  it('is the editor\'s own test: RichSectionEditor imports it and keeps no copy', () => {
    const editor = fs.readFileSync(
      path.resolve(__dirname, '../../../client/src/concept2cure/v2/editor/RichSectionEditor.tsx'),
      'utf8',
    );
    expect(editor).toMatch(/import \{ opensInSourceMode \} from '@shared\/authoring\/source-mode';/);
    expect(editor).toContain('if (opensInSourceMode(stored))');
    expect(editor, 'a second copy of the test drifts from this one').not.toMatch(/figure\|svg\|video\|embed\|object/);
  });
});
