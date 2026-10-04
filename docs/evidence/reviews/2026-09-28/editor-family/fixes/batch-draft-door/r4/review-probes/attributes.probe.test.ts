/**
 * Refute-review probes D5–D7: attribute text and tag boundaries that a reader
 * shows, in a clause the lineage credits to AnA. All modules from ./tree
 * (git archive 283fe08c4).
 */
import { describe, it, expect } from 'vitest';
import { attributeMachineSpans, comparableText } from './tree/server/services/clinical-regulatory-evidence/machine-attribution';
import { detectSpans } from './tree/server/services/sentenceTraceabilityService';
import { htmlToPlainText } from './tree/server/services/ectd/leaf-pdf-renderer';
import { sectionContentToBlocks, blockRuns } from './tree/server/export/authoring-section-content';
import { refusedFigures } from './tree/server/services/authoring/authoring-html-sanitizer';

const SHOWN = '3 patients died';

function credit(content: string, record: string) {
  const spans = attributeMachineSpans(detectSpans(content, 'clause'), {
    accepted: [{ authorId: 'ana', text: record }],
    live: [],
    actor: '501',
    content,
  });
  return spans.filter((s) => s.inAcceptedText).map((s) => s.spanText);
}
const log = (...a: unknown[]) => console.log(...a); // eslint-disable-line no-console

describe('D5: <img alt> on a figure the figure rule accepts', () => {
  it('the eCTD leaf prints the alt text inside the credited clause', async () => {
    const record = '<p>The study drug was well tolerated in all cohorts.</p>';
    const content = `<p>The study drug was well <img src="data:image/png;base64,iVBORw0KGgo=" alt="${SHOWN}"> tolerated in all cohorts.</p>`;
    const refused = await refusedFigures(content);
    const credited = credit(content, record);
    const leaf = htmlToPlainText(content);
    log(`[D5] figure rule refuses: ${JSON.stringify(refused)}\n  credited: ${JSON.stringify(credited)}\n  leaf: ${JSON.stringify(leaf)}`);
    expect(refused).toEqual([]);
    expect(credited.some((t) => t.includes(SHOWN))).toBe(true);
    expect(leaf).toContain(SHOWN);
  });
});

describe('D6: attributes the authoring export prints as text', () => {
  const record = '<p>The study drug was well tolerated in all cohorts.</p>';
  it.each([
    ['a footnote (sup data-note)', `<p>The study drug was well <sup data-note="${SHOWN}">tolerated</sup> in all cohorts.</p>`, 'footnote'],
    ['a citation locator (data-cite-locator)', `<p>The study drug was well tolerated<a data-cite="src-1" data-cite-locator="${SHOWN}"></a> in all cohorts.</p>`, 'citationLocator'],
  ])('%s', (_, content, field) => {
    const credited = credit(content, record);
    const runs = sectionContentToBlocks(content).flatMap((b) => blockRuns(b));
    const carried = runs.map((r) => (r as Record<string, unknown>)[field]).filter(Boolean);
    log(`[D6 ${field}] credited: ${JSON.stringify(credited)}\n  export runs: ${JSON.stringify(runs)}`);
    expect(credited.length).toBeGreaterThan(0);
    expect(carried).toContain(SHOWN);
  });
});

describe('D7: an inline tag joins two of AnA\'s tokens; every reader shows the joined token', () => {
  it('record "At Week 2 4 patients"; content "At Week 2<b>4</b> patients" reads "At Week 24 patients"', () => {
    const record = 'At Week 2 4 patients reported headache.';
    const content = '<p>At Week 2<b>4</b> patients reported headache.</p>';
    const credited = credit(content, record);
    const leaf = htmlToPlainText(content);
    const exp = sectionContentToBlocks(content).map((b) => blockRuns(b).map((r) => r.text).join('')).join('\n');
    log(`[D7] credited: ${JSON.stringify(credited)}  comparable: ${JSON.stringify(credited.map((t) => comparableText(t)))}\n  leaf: ${JSON.stringify(leaf)}\n  export: ${JSON.stringify(exp)}`);
    expect(credited.length).toBeGreaterThan(0);
    expect(leaf).toContain('Week 24 patients');
    expect(exp).toContain('Week 24 patients');
  });
});
