/* Measure what the one labelled-figure lexicon reads out of real regulatory
   prose. Corpus: PubMed phase-III RCT abstracts (open literature). */
import { readFileSync } from 'node:fs';
import { extractNumericalFacts } from '../../../../server/services/intelligence/labelled-figures';

/* Run from the repository root:
     npx tsx docs/evidence/F1/2026-11-01-labelled-figure-lexicon/recall.ts        */
const CORPUS = process.argv[2]
  ?? new URL('./corpus-pubmed-abstracts.json', import.meta.url).pathname;
const corpus: Array<{ pmid: string; abstract: string }> = JSON.parse(readFileSync(CORPUS, 'utf8'));

/** Sentences, roughly. */
function sentences(t: string): string[] {
  return t.replace(/\s+/g, ' ').split(/(?<=[.;])\s+(?=[A-Z(])/).filter((s) => s.length > 25);
}

/** Does this sentence state a figure a reviewer would reconcile? */
const GOVERNED = /\b(?:patients|subjects|participants|enrolled|randomi[sz]ed|sites|centres|centers|events|deaths|hazard ratio|HR|odds ratio|OR|p\s*[=<]|95%\s*CI|confidence interval|power|alpha|response rate|ORR|median|mean|incidence|%|mg|weeks?|months?|years?)\b/i;

let withNumber = 0, governed = 0, labelled = 0;
const misses: string[] = [];
const hits = new Map<string, number>();

for (const doc of corpus) {
  for (const s of sentences(doc.abstract)) {
    if (!/\d/.test(s)) continue;
    withNumber += 1;
    if (!GOVERNED.test(s)) continue;
    governed += 1;
    /* The extractor refuses text under 20 chars; pad nothing, just run it. */
    const facts = extractNumericalFacts(s);
    if (facts.length) {
      labelled += 1;
      for (const f of facts) hits.set(f.label, (hits.get(f.label) ?? 0) + 1);
    } else {
      misses.push(`[${doc.pmid}] ${s.slice(0, 190)}`);
    }
  }
}

console.info(`sentences with a number:        ${withNumber}`);
console.info(`...of which state a governed figure: ${governed}`);
console.info(`...of which the lexicon labels:      ${labelled}  (${Math.round(100 * labelled / governed)}%)`);
console.info(`\nlabels read: ${[...hits.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(', ')}`);
console.info(`\n── ${misses.length} governed sentences the lexicon reads nothing from ──`);
for (const m of misses) console.info('  ' + m);
