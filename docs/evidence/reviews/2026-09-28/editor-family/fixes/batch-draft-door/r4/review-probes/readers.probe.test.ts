/**
 * Refute-review probe (round 3, batch-draft accept): what the lineage credits
 * to AnA vs. what the three named readers show.
 *
 * Readers, as the claim names them:
 *   - the eCTD leaf renderer: htmlToPlainText (server/services/ectd/leaf-pdf-renderer.ts)
 *   - the authoring export: sectionContentToBlocks (server/export/authoring-section-content.ts)
 *   - the browser editor (TipTap over DOMParser) — not runnable here; the
 *     browser's tokenizer is what BROWSER_TAG models.
 */
import { describe, it, expect } from 'vitest';
import { attributeMachineSpans, comparableText, rawTextFrom } from './tree/server/services/clinical-regulatory-evidence/machine-attribution';
import { detectSpans } from './tree/server/services/sentenceTraceabilityService';
import { htmlToPlainText } from './tree/server/services/ectd/leaf-pdf-renderer';
import { sectionContentToBlocks, blockRuns } from './tree/server/export/authoring-section-content';
import { looksLikeHtml } from './tree/shared/authoring/plain-text-html';

/** AnA's draft, as the turn record holds it (and as the card sends it as the claim). */
const RECORD = '<p>The study drug was well tolerated in all cohorts.</p>';
const SHOWN = '3 patients died';

function lineage(content: string, claim = RECORD) {
  const candidates = detectSpans(content, 'clause');
  const spans = attributeMachineSpans(candidates, {
    accepted: [{ authorId: 'ana', text: claim }],
    live: [],
    actor: '501',
    content,
  });
  return { candidates, spans };
}

function exportText(content: string): string {
  return sectionContentToBlocks(content)
    .map((b) => blockRuns(b).map((r) => r.text).join(''))
    .join('\n');
}

function report(label: string, content: string) {
  const { candidates, spans } = lineage(content);
  const leaf = htmlToPlainText(content);
  const exp = exportText(content);
  const credited = spans.filter((s) => s.inAcceptedText).map((s) => s.spanText);
  // eslint-disable-next-line no-console
  console.log(
    `\n[${label}]\n  content: ${JSON.stringify(content)}\n  looksLikeHtml: ${looksLikeHtml(content)}  rawTextFrom: ${rawTextFrom(content)}` +
      `\n  clauses: ${JSON.stringify(candidates.map((c) => c.text))}` +
      `\n  credited to AnA (accepted_machine_draft): ${JSON.stringify(credited)}` +
      `\n  credited clause comparable form: ${JSON.stringify(credited.map((t) => comparableText(t)))}` +
      `\n  eCTD leaf shows: ${JSON.stringify(leaf)}` +
      `\n  authoring export shows: ${JSON.stringify(exp)}`,
  );
  return { credited, leaf, exp };
}

describe('SHOW direction: words not in the record are shown in a clause credited to AnA', () => {
  it('D1: inside <pre>, node-html-parser (leaf + export) keeps tags as text; the lineage strips them', () => {
    const content = `<pre><b ${SHOWN}>The study drug was well tolerated in all cohorts.</b></pre>`;
    const { credited, leaf, exp } = report('D1 pre', content);
    expect(credited.length, 'the clause is credited to AnA').toBeGreaterThan(0);
    expect(credited.join(' ')).toContain(SHOWN);
    expect(leaf, 'the eCTD leaf shows the typed words').toContain(SHOWN);
    expect(exp, 'the authoring export shows the typed words').toContain(SHOWN);
  });

  it('D1b: <pre> with no </pre> (or </PRE> in another case) runs to the end of the content', () => {
    const content = `<p>Summary.</p><PRE>Note.</pre>\n\n<p>The study drug was well <i ${SHOWN}>tolerated</i> in all cohorts.</p>`;
    const { credited, leaf, exp } = report('D1b PRE unclosed (case-sensitive close)', content);
    expect(credited.some((t) => t.includes(SHOWN))).toBe(true);
    expect(leaf).toContain(SHOWN);
    expect(exp).toContain(SHOWN);
  });

  it.each([
    ['double quote after the name', `<b"${SHOWN}">`],
    ['comma after the name', `<b,${SHOWN}>`],
    ['parenthesis after the name', `<i(${SHOWN})>`],
    ['equals after the name', `<u=${SHOWN}>`],
  ])('D2: %s — a browser hides it as a tag, node-html-parser shows it as text, the lineage strips it', (_, token) => {
    const content = `<p>The study drug was well ${token} tolerated in all cohorts.</p>`;
    const { credited, leaf, exp } = report(`D2 ${token}`, content);
    expect(credited.length, 'credited to AnA').toBeGreaterThan(0);
    expect(credited.join(' ')).toContain(SHOWN);
    expect(leaf, 'the eCTD leaf shows the typed words').toContain(SHOWN);
    expect(exp, 'the authoring export shows the typed words').toContain(SHOWN);
  });
});

describe('HIDE direction: a reader is not shown words of the record the credited clause holds', () => {
  const NEGATED_RECORD = '<p>The study drug was not effective in reducing mortality.</p>';
  it.each([
    ['template', '<template>not </template>'],
    ['head', '<head>not </head>'],
  ])('D3: <%s> — the leaf drops its words; the lineage keeps them in the comparison', (_, wrap) => {
    const content = `<p>The study drug was ${wrap}effective in reducing mortality.</p>`;
    const candidates = detectSpans(content, 'clause');
    const spans = attributeMachineSpans(candidates, {
      accepted: [{ authorId: 'ana', text: NEGATED_RECORD }],
      live: [],
      actor: '501',
      content,
    });
    const credited = spans.filter((s) => s.inAcceptedText).map((s) => s.spanText);
    const leaf = htmlToPlainText(content);
    // eslint-disable-next-line no-console
    console.log(`\n[D3 ${wrap}]\n  record: ${NEGATED_RECORD}\n  content: ${content}\n  credited: ${JSON.stringify(credited)}\n  eCTD leaf shows: ${JSON.stringify(leaf)}\n  export shows: ${JSON.stringify(exportText(content))}`);
    expect(credited.length).toBeGreaterThan(0);
    expect(leaf).toBe('The study drug was effective in reducing mortality.');
  });
});
