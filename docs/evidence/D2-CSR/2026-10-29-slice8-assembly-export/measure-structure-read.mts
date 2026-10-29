import os from 'node:os'; import path from 'node:path'; import { promises as fs } from 'node:fs';
import { CsrPdfWriter } from '../../../../server/services/csr/csr-pdf-writer';
import { planListings } from '../../../../server/services/csr/csr-listings';
import { readLeafTargets, readPdfStructure } from '../../../../server/services/csr/csr-pdf-structure';
import { scaleEnvelope, scaleAdlb } from '../../../../server/services/csr/__tests__/support/csr-scale-synthetic';
const N = Number(process.argv[2] ?? 3000);
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'csr-probe-'));
{
const env = scaleEnvelope(N); const lab = scaleAdlb(env);
const src = { study: env.studyData, participants: env.participants, laboratory: lab, protocolDeviations: [] };
const def = planListings(src).generated.find(d => d.number === '16.2.8')!;
const w = new CsrPdfWriter({ path: path.join(dir, 'lab.pdf'), title: 'lab', runningHeader: 'lab', stamp: new Date(0), landscape: true });
w.heading('Listing 16.2.8', 1, 'L16.2.8');
w.destination('Lextra');
await w.table({ headers: def.headers, widths: def.widths }, (function* () { for (const r of def.rows()) yield { cells: r.cells, bookmark: r.bookmark }; })());
await w.finish();
}
const gc = (globalThis as any).gc; gc(); gc();
const MiB = (x: number) => Math.round(x / 2 ** 20 * 10) / 10;
let base = process.memoryUsage().heapUsed;
const bounded = await readLeafTargets(path.join(dir, 'lab.pdf'));
const boundedHeld = process.memoryUsage().heapUsed - base;
gc(); gc(); base = process.memoryUsage().heapUsed;
const full = await readPdfStructure(await fs.readFile(path.join(dir, 'lab.pdf')));
const fullHeld = process.memoryUsage().heapUsed - base;
console.log(JSON.stringify({ subjects: N, bounded: bounded && { pages: bounded.pages, destinations: [...bounded.destinations] }, full: { pages: full.pages, destinations: [...full.destinations] }, boundedReadHeapMiB: MiB(boundedHeld), fullReadHeapMiB: MiB(fullHeld) }));
await fs.rm(dir, { recursive: true, force: true });
