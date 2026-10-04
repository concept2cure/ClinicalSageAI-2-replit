/* eslint-disable -- the round-3 refute-review probe as it ran, paths redacted; it imports a git-archive tree that is not in the repository. */
/**
 * INFORMATIONAL: the working tree holds another session's uncommitted change
 * (server/export/section-html-parse.ts; leaf-pdf-renderer reads <pre> as markup
 * and plain text as plain text). Does it close D1/D2/D5 for the two readers?
 */
import { it } from 'vitest';
import { htmlToPlainText, renderLeafPdf } from '<repo>/server/services/ectd/leaf-pdf-renderer';
import { sectionContentToBlocks, blockRuns } from '<repo>/server/export/authoring-section-content';
const S = '3 patients died';
const cases: Array<[string, string]> = [
  ['D1 pre', `<pre><b ${S}>The study drug was well tolerated in all cohorts.</b></pre>`],
  ['D2 <b"…">', `<p>The study drug was well <b"${S}"> tolerated in all cohorts.</p>`],
  ['D2 <b/…>', `<p>The study drug was well <b/${S}> tolerated in all cohorts.</p>`],
  ['D3 template', '<p>The study drug was <template>not </template>effective in reducing mortality.</p>'],
  ['D5 img alt', `<p>The study drug was well <img src="data:image/png;base64,iVBORw0KGgo=" alt="${S}"> tolerated in all cohorts.</p>`],
];
it('working-tree readers', () => {
  for (const [label, c] of cases) {
    const exp = sectionContentToBlocks(c).map((b) => blockRuns(b).map((r) => r.text).join('')).join('\n');
    console.log(`[inflight ${label}] leaf: ${JSON.stringify(htmlToPlainText(c))} | export: ${JSON.stringify(exp)}`);
  }
});
