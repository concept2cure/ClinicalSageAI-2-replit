import { chunkExtractedText } from '/home/user/ClinicalSageAI-2-replit/server/services/vault/document-chunking.service.ts';
import { buildPassageContext, PASSAGE_CONTEXT_SIDE_CHARS as SIDE, PASSAGE_CONTEXT_MAX_CHARS as MAX } from '/home/user/ClinicalSageAI-2-replit/server/services/vault/passage-context-span.ts';
import { draftSourceIdentityForText } from '/home/user/ClinicalSageAI-2-replit/server/services/ana/draft-source-identity.ts';

let seed = Number(process.argv[2] ?? 1);
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const ASTRAL = ['𝛼', '𝛽', '😀', '𠀋', '𝑥', '🧪'];
const WORDS = ['the', 'patients', 'ITT', 'N=40', '12/40', '(30%)', 'dose', 'mg/kg', 'β', 'é', 'result', 'Table', 'endpoint'];
function word(): string {
  const r = rnd();
  if (r < 0.08) return pick(ASTRAL) + pick(ASTRAL);
  if (r < 0.1) return 'x'.repeat(1 + Math.floor(rnd() * 3000)); // long no-space run
  if (r < 0.12) return Array.from({ length: 50 + Math.floor(rnd() * 1500) }, () => pick(ASTRAL)).join(''); // astral run, no spaces
  return pick(WORDS) + Math.floor(rnd() * 100000);
}
function genText(): string {
  const n = Math.floor(rnd() * Number(process.env.NW ?? 1500));
  let out = rnd() < 0.3 ? pick(['  ', '\r\n', '\n\n', '\t']) : '';
  for (let i = 0; i < n; i++) {
    out += word();
    const r = rnd();
    out += r < 0.05 ? '\r\n\r\n' : r < 0.1 ? '\n\n' : r < 0.15 ? '. ' : r < 0.18 ? '.\n' : r < 0.2 ? '\r\n' : ' ';
  }
  return out;
}
const counts: Record<string, number> = {};
const fails: string[] = [];
const roundtrip = (s: string) => Buffer.from(s, 'utf8').toString('utf8');
let docs = 0, hits = 0;
const ITER = Number(process.argv[3] ?? 300);
for (let it = 0; it < ITER; it++) {
  const T = genText();
  const optsList = [{}, { maxChars: 500, overlapChars: 100 }, { maxChars: 11500, overlapChars: 400 }, { maxChars: 13000, overlapChars: 1000 }];
  for (const opts of optsList) {
    const chunks = chunkExtractedText(T, opts);
    if (!chunks.length) continue;
    docs++;
    for (const db of [false, true]) {
      for (const w of [1, 2]) {
        for (const hit of chunks) {
          hits++;
          const win = chunks.filter(c => c.index >= hit.index - w && c.index <= hit.index + w);
          const coords = win.map(c => ({ id: 'id' + c.index, chunkIndex: c.index, charStart: c.charStart, charEnd: c.charEnd, text: db ? roundtrip(c.text) : c.text }))
            .sort(() => rnd() - 0.5);
          const r = buildPassageContext({ documentId: 'doc', contentHash: 'h', extractedText: T, hit: { chunkId: 'id' + hit.index, chunkIndex: hit.index }, chunks: coords });
          const key = `${db ? 'db' : 'raw'}:${JSON.stringify(opts)}:${r.context.status === 'available' ? 'available' + (r.context.clipped ? '-clipped' : '') : r.context.reason}`;
          counts[key] = (counts[key] ?? 0) + 1;
          if (r.context.status !== 'available') continue;
          const c = r.context; const s = c.reference.span; const hs = r.hitSpan!;
          const bad = (m: string) => fails.push(`${m} seed=${seed} it=${it} opts=${JSON.stringify(opts)} hit=${hit.index} span=${s.start}-${s.end} hs=${hs.start}-${hs.end}`);
          if (c.text !== T.slice(s.start, s.end)) bad('text!=slice');
          if (s.end - s.start > MAX) bad('over MAX');
          if (s.totalChars !== T.length) bad('totalChars');
          if (!(hs.start >= s.start && hs.end <= s.end)) bad('hit not inside');
          if (hs.start !== hit.charStart || hs.end !== hit.charEnd) bad('hitSpan wrong');
          if (c.text.slice(hs.start - s.start, hs.end - s.start) !== hit.text) bad('hit text not at hitSpan');
          const occ = c.text.split(hit.text).length - 1;
          if (occ !== 1 && !/^(.)\1*$/u.test(hit.text) && !/^[\u{10000}-\u{10FFFF}]+$/u.test(hit.text)) bad('hit occurrences=' + occ); else if (occ !== 1) counts['periodic-hit-occ>1']=(counts['periodic-hit-occ>1']??0)+1;
          const id = draftSourceIdentityForText(T, s);
          if (id.spanSha256 !== c.reference.spanSha256 || id.extractedTextSha256 !== c.reference.extractedTextSha256) bad('identity');
          const ws = win[0].charStart, we = win[win.length - 1].charEnd;
          if (c.clipped !== (s.start > ws || s.end < we)) bad('clipped');
          if (c.chunkRange[0] !== win[0].index || c.chunkRange[1] !== win[win.length - 1].index) bad('chunkRange');
          // Untrimmed expected span (pre-surrogate) — compare with tolerance 1
          let es = Math.max(ws, hs.start - SIDE), ee = Math.min(we, hs.end + SIDE);
          if (ee - es <= MAX && (Math.abs(es - s.start) > 1 || Math.abs(ee - s.end) > 1 || s.start > es || s.end < ee)) bad(`span != contract (${es}-${ee})`);
          // seams: \n\n in context only where T has it - trivially true as slice
        }
      }
    }
  }
}
console.log({ docs, hits, fails: fails.length });
const g: Record<string,number> = {}; for (const f of fails) { const k=f.split(' seed=')[0].replace(/\(\d+-\d+\)/,''); g[k]=(g[k]??0)+1; } console.log(g); console.log(fails.slice(0, 8).join('\n'));
console.log(Object.entries(counts).sort().map(([k, v]) => `${k}: ${v}`).join('\n'));
process.exit(0);
