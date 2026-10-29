/**
 * CSR slice 7: the narrative job persists one subject at a time with its
 * SHA-256 and facts digest, resumes per subject, never overwrites a damaged
 * row, writes §14.3.3 and the §12.3.2 cross-reference only when every selected
 * subject has a verified narrative, and runs at the scale target. All data
 * SYNTHETIC (support/adam-narrative-synthetic.ts).
 */
import { describe, expect, it } from 'vitest';
import { runNarrativeJob, type NarrativeSectionRow, type NarrativeStore, type SavedNarrative } from '../csr-narrative-job';
import { reconcileNarrative } from '../narrative-reconciliation';
import { buildNarrativeIndex, subjectNarrativeFacts } from '../narrative-subject-facts';
import { selectNarrativeSubjects } from '../narrative-subject-selection';
import { adaeRows, narrativeBundle, narrativeDatasets, qualifies, subjectId } from './support/adam-narrative-synthetic';

class MemoryStore implements NarrativeStore {
  rows = new Map<string, SavedNarrative>();
  sections = new Map<string, NarrativeSectionRow>();
  saves = 0;
  stopAfter = Infinity;
  async saved() { return [...this.rows.values()].map(r => ({ ...r })); }
  async save(row: SavedNarrative) {
    if (this.saves >= this.stopAfter) return false;
    this.saves++;
    this.rows.set(row.subjectId, { ...row });
    return true;
  }
  async writeSections(rows: NarrativeSectionRow[]) {
    for (const r of rows) this.sections.set(r.sectionNumber, r);
    return { written: rows.map(r => r.sectionNumber), kept: [] };
  }
}

const run = (store: NarrativeStore, n: number, adae?: ReturnType<typeof adaeRows>) =>
  runNarrativeJob({ bundle: narrativeBundle(), datasets: narrativeDatasets(n, adae ? { adae } : {}), store, protocolNumber: 'SYN-LMN201-PROTOCOL' });

describe('narrative job (SYNTHETIC data)', () => {
  it('composes every selected subject and lands §14.3.3 and the §12.3.2 cross-reference', async () => {
    const store = new MemoryStore();
    const result = await run(store, 100);
    const expected = Array.from({ length: 100 }, (_, i) => i).filter(qualifies).length;
    expect(result).toMatchObject({ status: 'complete', selected: expected, composed: expected, refused: 0, resumed: 0 });
    expect(result.sections.written).toEqual(['14.3.3', '12.3.2']);
    const s1433 = store.sections.get('14.3.3')!.content;
    expect(s1433).toContain(`Subject ${subjectId(7)} (Placebo): Septic shock — death, serious adverse event, discontinuation`);
    expect(s1433).not.toMatch(/\[[^\]]*[A-Za-z][^\]]*\]/); // no unresolved placeholder
    expect(store.sections.get('12.3.2')!.content).toContain(`The ${expected} narratives are presented in Section 14.3.3`);
    expect(store.sections.get('14.3.3')!.lineage).toMatchObject({ composer: 'csr-narrative-job', prose: ['template'] });
  });

  it('resumes per subject: a stopped run keeps its saved subjects and the rerun composes only the rest', async () => {
    const store = new MemoryStore();
    store.stopAfter = 7;
    expect((await run(store, 100)).status).toBe('stopped');
    expect(store.rows.size).toBe(7);
    store.stopAfter = Infinity;
    const resumed = await run(store, 100);
    expect(resumed.status).toBe('complete');
    expect(resumed.resumed).toBe(7);
    expect(store.saves).toBe(resumed.selected);
  });

  it('never overwrites a saved narrative that fails its hash: the run fails and preserves it', async () => {
    const store = new MemoryStore();
    await run(store, 60);
    const victim = [...store.rows.values()][2];
    store.rows.set(victim.subjectId, { ...victim, content: `${victim.content} Edited outside the job.` });
    const result = await run(store, 60);
    expect(result).toMatchObject({ status: 'failed', reason: 'saved_narrative_integrity_failed', subjects: [victim.subjectId] });
    expect(store.rows.get(victim.subjectId)!.content).toContain('Edited outside the job.');
  });

  it('lands no section while a selected subject is refused, and lists it', async () => {
    const rows = adaeRows(30, (row, i, ae) => (i === 7 && ae.term === 'Septic shock' ? row.map((v, c) => (c === 10 ? 'N' : c === 12 ? 'NOT RECOVERED/NOT RESOLVED' : c === 8 ? 'N' : c === 13 ? 'DOSE NOT CHANGED' : v)) : row));
    const store = new MemoryStore();
    const result = await run(store, 30, rows);
    expect(result).toMatchObject({ status: 'incomplete', reason: 'narratives_refused', subjects: [subjectId(7)] });
    expect(store.sections.size).toBe(0);
    expect(store.rows.get(subjectId(7))).toMatchObject({ status: 'refused', content: null });
  });

  it('SYNTHETIC scale: 1,000 subjects, about 200 narratives, every fact reconciled, within seconds', async () => {
    const n = 1000;
    const datasets = narrativeDatasets(n);
    const store = new MemoryStore();
    const started = performance.now();
    const result = await runNarrativeJob({ bundle: narrativeBundle(), datasets, store, protocolNumber: 'SYN-LMN201-PROTOCOL' });
    const ms = performance.now() - started;
    expect(result.status).toBe('complete');
    expect(result.selected).toBe(Array.from({ length: n }, (_, i) => i).filter(qualifies).length);
    expect(result.selected).toBeGreaterThanOrEqual(180);
    expect(result.selected).toBeLessThanOrEqual(260);
    // Full fact-to-row reconciliation of every saved narrative, independently of the job.
    const selection = selectNarrativeSubjects(narrativeBundle(), datasets);
    const index = buildNarrativeIndex(datasets);
    let facts = 0;
    for (const subject of selection.subjects) {
      const f = subjectNarrativeFacts(datasets, index, subject);
      facts += f.facts.length;
      expect(reconcileNarrative(store.rows.get(subject.subjectId)!.content!, f).ok).toBe(true);
    }
    expect(ms).toBeLessThan(20_000);
    console.info(`[SYNTHETIC scale] subjects=${n} narratives=${result.selected} facts=${facts} ms=${Math.round(ms)} section14_3_3_chars=${store.sections.get('14.3.3')!.content.length} counts=${JSON.stringify(result.counts)}`);
  }, 60_000);

  it('SYNTHETIC scale target: 5,000 subjects, about 1,000 narratives (design decision 5)', async () => {
    const store = new MemoryStore();
    const started = performance.now();
    const result = await run(store, 5000);
    const ms = performance.now() - started;
    expect(result.status).toBe('complete');
    expect(result.selected).toBe(1000);
    expect(ms).toBeLessThan(60_000);
    console.info(`[SYNTHETIC scale target] subjects=5000 narratives=${result.selected} ms=${Math.round(ms)} section14_3_3_chars=${store.sections.get('14.3.3')!.content.length}`);
  }, 120_000);
});
