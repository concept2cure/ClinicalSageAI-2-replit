/**
 * An in-memory NarrativeStore (csr-narrative-job.ts) for tests: the same
 * contract as csr-narrative-store.ts sqlNarrativeStore (rows by subject, read a
 * page at a time in (sequence, subjectId) order, §14.3.3 landed from its
 * chunks with the SHA-256 of what was written), without a database.
 */
import { createHash } from 'node:crypto';
import type { NarrativePageCursor, NarrativeSectionRow, NarrativeStore, SavedNarrative, StreamedNarrativeSection } from '../../csr-narrative-job';

const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
export class MemoryStore implements NarrativeStore {
  rows = new Map<string, SavedNarrative>();
  sections = new Map<string, NarrativeSectionRow>();
  saves = 0;
  stopAfter = Infinity;
  largestChunk = 0;
  async heads() {
    return [...this.rows.values()].map(r => ({ subjectId: r.subjectId, sequence: r.sequence, status: r.status, factsDigest: r.factsDigest, prose: r.qc.prose,
      verified: r.status === 'composed' ? !!r.content?.trim() && r.contentHash === hash(r.content) : r.content === null && r.contentHash === null }));
  }
  async page(after: NarrativePageCursor | null, limit: number) {
    const sorted = [...this.rows.values()].sort((a, b) => a.sequence - b.sequence || (a.subjectId < b.subjectId ? -1 : 1));
    return sorted.filter(r => !after || r.sequence > after.sequence || (r.sequence === after.sequence && r.subjectId > after.subjectId))
      .slice(0, limit).map(r => ({ ...r }));
  }
  async save(row: SavedNarrative) {
    if (this.saves >= this.stopAfter) return false;
    this.saves++;
    this.rows.set(row.subjectId, { ...row });
    return true;
  }
  async writeSections({ narratives, crossReference }: { narratives: StreamedNarrativeSection; crossReference: NarrativeSectionRow }) {
    let content = '';
    for await (const chunk of narratives.chunks) { this.largestChunk = Math.max(this.largestChunk, chunk.length); content += chunk; }
    this.sections.set('14.3.3', { sectionNumber: '14.3.3', content, contentHash: hash(content), lineage: narratives.lineage });
    this.sections.set('12.3.2', crossReference);
    return { written: ['14.3.3', '12.3.2'], kept: [] };
  }
}
