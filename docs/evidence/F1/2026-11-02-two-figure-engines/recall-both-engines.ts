import { readFileSync } from 'node:fs';
import { extractClaims } from '../../../../server/services/truth-engine/clinical-claims';
import { extractNumericalFacts } from '../../../../server/services/intelligence/labelled-figures';

const corpus: Array<{ pmid: string; abstract: string }> = JSON.parse(
  readFileSync(process.argv[2] ?? 'docs/evidence/F1/2026-11-01-labelled-figure-lexicon/corpus-pubmed-abstracts.json', 'utf8'));

function sentences(t: string): string[] {
  return t.replace(/\s+/g, ' ').split(/(?<=[.;])\s+(?=[A-Z(])/).filter((s) => s.length > 25);
}
const GOVERNED = /\b(?:patients|subjects|participants|enrolled|randomi[sz]ed|sites|centres|centers|events|deaths|hazard ratio|HR|odds ratio|OR|p\s*[=<]|95%\s*CI|confidence interval|power|alpha|response rate|ORR|median|mean|incidence|%|mg|weeks?|months?|years?)\b/i;

let governed = 0, lex = 0, claimed = 0, sawFigure = 0;
const onlyClaims: string[] = [], neither: string[] = [];
let firstErr: string | null = null;

for (const doc of corpus) {
  for (const s of sentences(doc.abstract)) {
    if (!/\d/.test(s) || !GOVERNED.test(s)) continue;
    governed += 1;
    const l = extractNumericalFacts(s).length > 0;
    let c = 0, u = 0;
    try {
      const r = extractClaims({ id: doc.pmid, role: 'csr', text: s } as never);
      c = r.claims.length; u = r.unframed.length;
    } catch (e) { if (!firstErr) firstErr = String(e).slice(0, 300); }
    if (l) lex += 1;
    if (c > 0) claimed += 1;
    if (c + u > 0) sawFigure += 1;
    if (!l && c) onlyClaims.push(`[${c} claims] ${s.slice(0, 160)}`);
    else if (!l && !c) neither.push(s.slice(0, 150));
  }
}
if (firstErr) console.info('first error from extractClaims:', firstErr, '\n');
console.info(`governed sentences:                       ${governed}`);
console.info(`the LEXICON labels:                       ${lex}  (${Math.round(100 * lex / governed)}%)`);
console.info(`the CLAIMS engine FRAMES as a claim:      ${claimed}  (${Math.round(100 * claimed / governed)}%)`);
console.info(`the CLAIMS engine saw a figure at all:    ${sawFigure}  (${Math.round(100 * sawFigure / governed)}%)`);
console.info(`\n── framed by CLAIMS, not labelled by the lexicon (first 15) ──`);
for (const m of onlyClaims.slice(0, 15)) console.info('  ' + m);
console.info(`\n── neither (first 10) ──`);
for (const m of neither.slice(0, 10)) console.info('  ' + m);
