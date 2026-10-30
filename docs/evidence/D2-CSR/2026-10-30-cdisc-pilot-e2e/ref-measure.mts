/* §14.3.3 by reference: time and memory of the import and the assembly at N narratives (SYNTHETIC). Run per N in its own process. */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const repo = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '');
const N = Number(process.argv[2]);
const out = process.argv[3];
const { landSyntheticBuild, narrativeDatabase, PROGRAM } = await import(`${repo}/server/services/csr/__tests__/support/narrative-reference-fixture.ts`);
const { materializeWorkflowSource } = await import(`${repo}/server/services/authoring/workflow-source-import.ts`);
const { assembleCsr } = await import(`${repo}/server/services/csr/csr-assembly.ts`);
const { assemblyInput } = await import(`${repo}/server/services/csr/__tests__/support/csr-assembly-fixture.ts`);
const { sqlLandedNarratives } = await import(`${repo}/server/services/csr/csr-narrative-landed.ts`);
const { sqlNarrativeStore } = await import(`${repo}/server/services/csr/csr-narrative-store.ts`);
const gc = () => (globalThis as { gc?: () => void }).gc?.();
const mib = (b: number) => Math.round((b / 1048576) * 10) / 10;
let peakRss = 0;
const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 25);
async function measure<T>(fn: () => Promise<T>) {
  gc(); const heapBefore = process.memoryUsage().heapUsed; peakRss = process.memoryUsage().rss;
  let peakHeap = heapBefore; const h = setInterval(() => { peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed); }, 10);
  const t = performance.now(); const value = await fn(); const ms = performance.now() - t;
  clearInterval(h); peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
  return { value, seconds: Math.round(ms) / 1000, heapBeforeMiB: mib(heapBefore), peakHeapMiB: mib(peakHeap), peakRssMiB: mib(Math.max(peakRss, process.memoryUsage().rss)) };
}
const { pg, q } = await narrativeDatabase();
const land = await measure(() => landSyntheticBuild(q, 41, N, { keepRows: false, inline: [{ code: '13', content: 'Synthetic conclusions.' }] }));
const input = { organizationId: 7, userId: 5, target: { programId: PROGRAM, projectId: 11 }, source: { kind: 'csr' as const, jobId: 41 } };
const imported = await measure(() => materializeWorkflowSource(input, q));
const ref = imported.value.origin.sectionOrigins.find((o: { code: string }) => o.code === '14.3.3').narrativeReference;
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ref-measure-'));
const fixture = await assemblyInput(path.join(work, 'fixture'));
const leafDir = path.join(work, 'out'); await fs.mkdir(leafDir);
// The narratives leaf as the production assembly reads it: the landed row a slice at a time, the store a page at a time.
const pages = { n: 0 };
const store = sqlNarrativeStore(q, { organizationId: 7, jobId: 41, projectId: 11 });
const assembled = await measure(async () => assembleCsr({ ...fixture, sections: imported.value.sections.filter((s: { code: string }) => s.code !== '14.3.3'), outDir: leafDir,
  narratives: { page: (a, l) => { pages.n++; return store.page(a, l); } }, landedNarratives: (await sqlLandedNarratives(q, { organizationId: 7, jobId: 41 }))!, supplied: fixture.supplied }));
const leaf = assembled.value.leaves.find((l: { appendix: string }) => l.appendix === '14.3.3');
clearInterval(sampler);
const result = { narratives: N, landedCharacters: land.value.landedLength, landedSha256: land.value.landedSha256,
  land: { seconds: land.seconds, peakHeapMiB: land.peakHeapMiB, peakRssMiB: land.peakRssMiB },
  import: { seconds: imported.seconds, heapBeforeMiB: imported.heapBeforeMiB, peakHeapMiB: imported.peakHeapMiB, peakRssMiB: imported.peakRssMiB,
    inlineCharacters: imported.value.sections.reduce((n: number, s: { content: string }) => n + s.content.length, 0), referenceNarratives: ref.narratives },
  assembly: { seconds: assembled.seconds, heapBeforeMiB: assembled.heapBeforeMiB, peakHeapMiB: assembled.peakHeapMiB, peakRssMiB: assembled.peakRssMiB,
    narrativesVerified: assembled.value.narratives?.verified, narrativesSubjects: assembled.value.narratives?.subjects, findings: assembled.value.narratives?.findings.length,
    leafPages: leaf?.pages, leafBytes: leaf?.bytes, storePagesRead: pages.n, totalPages: assembled.value.leaves.reduce((n: number, l: { pages: number }) => n + (l.pages ?? 0), 0) },
  note: 'PGlite runs in this process, so RSS includes the database. Synthetic narratives of about 1,400 characters each.' };
await fs.writeFile(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
await pg.close(); await fs.rm(work, { recursive: true, force: true });
process.exit(0);
