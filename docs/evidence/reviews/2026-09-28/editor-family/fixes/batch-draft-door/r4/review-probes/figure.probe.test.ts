/* eslint-disable -- the round-3 refute-review probe as it ran, paths redacted; it imports a git-archive tree that is not in the repository. */
/**
 * Refute-review probe: the figure rule on this door (refuseNonFigures →
 * refusedFigures) and an <img> inside <template>. Modules from ./tree (283fe08c4).
 */
import { it, expect } from 'vitest';
import { refusedFigures } from './tree/server/services/authoring/authoring-html-sanitizer';
import { sectionContentToBlocks } from './tree/server/export/authoring-section-content';
it('an external <img> inside <template> passes the figure rule; the export still reads it as an image', async () => {
  const content = '<p>See the figure.</p><template><img src="https://tracker.example/pixel.png" alt="Figure 1"></template>';
  const refused = await refusedFigures(content);
  const blocks = sectionContentToBlocks(content);
  console.log(`[FIG] refused: ${JSON.stringify(refused)}\n  export blocks: ${JSON.stringify(blocks)}`);
  expect(refused).toEqual([]);
  expect(blocks.some((b) => b.kind === 'image')).toBe(true);
});
it('CONTROL: the same <img> outside <template> is refused', async () => {
  const refused = await refusedFigures('<p>See the figure.</p><img src="https://tracker.example/pixel.png" alt="Figure 1">');
  console.log(`[FIG control] refused: ${JSON.stringify(refused)}`);
  expect(refused).toHaveLength(1);
});
