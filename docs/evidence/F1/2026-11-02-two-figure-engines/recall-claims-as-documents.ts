/* The same corpus, fed to the claims engine as DOCUMENTS rather than as bare
   sentences: a claim's frame needs the study, the population and the arms,
   and a one-sentence source states none of them. */
import { readFileSync } from 'node:fs';
import { extractClaims } from '../../../../server/services/truth-engine/clinical-claims';

const corpus: Array<{ pmid: string; abstract: string; title?: string }> = JSON.parse(
  readFileSync(process.argv[2] ?? 'docs/evidence/F1/2026-11-01-labelled-figure-lexicon/corpus-pubmed-abstracts.json', 'utf8'));

let claims = 0, unframed = 0;
const reasons = new Map<string, number>();
const examples: string[] = [];
for (const doc of corpus) {
  const r = extractClaims({ id: doc.pmid, role: 'csr', title: doc.title, text: doc.abstract } as never);
  claims += r.claims.length;
  unframed += r.unframed.length;
  for (const u of r.unframed) reasons.set(u.reason, (reasons.get(u.reason) ?? 0) + 1);
  for (const c of r.claims.slice(0, 2)) {
    examples.push(`[${doc.pmid}] ${JSON.stringify({ measure: (c as any).measure ?? (c as any).frame?.measure, value: (c as any).value, arm: (c as any).frame?.arm?.name ?? (c as any).frame?.arm })}`);
  }
}
console.info(`documents: ${corpus.length}`);
console.info(`claims framed:   ${claims}`);
console.info(`figures unframed: ${unframed}`);
console.info(`\nunframed reasons:`);
for (const [k, v] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) console.info(`  ${String(v).padStart(4)}  ${k}`);
console.info(`\nexample claims:`);
for (const e of examples.slice(0, 12)) console.info('  ' + e);
