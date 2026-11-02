/**
 * P-90 follow-up (2026-11-02): with the layout reader on, each table is its own
 * Vault chunk, read as a table and named by its caption.
 *
 * Found in the running app: a PDF read by the layout reader was recorded as
 * `pdf-layout`, but its three tables and the text around them became one TEXT
 * chunk. The chunker cuts by size at paragraph breaks, so a table was a TABLE
 * chunk only by chance. The reader knows where each table stands
 * (`layout.tables`), and the chunker now cuts there.
 *
 * Without table spans (every flag-off ingest) chunking is unchanged: the same
 * chunks, offset for offset.
 */
import { describe, expect, it } from 'vitest';
import { chunkExtractedText } from '../document-chunking.service';
import { chunkTypeOf, sectionsForChunks } from '../document-section-structure';
import { layoutFromDoclingDocument } from '../../../integrations/docling/client';
import { doclingFixture } from '../../../integrations/docling/__tests__/docling-serve-stand-in';

const reading = layoutFromDoclingDocument(doclingFixture('masked_tables'));
const spans = reading.tables.map((t) => ({ start: t.start, end: t.end }));

describe('each table is its own chunk', () => {
  it('the running app\'s document: three tables, three TABLE chunks, and the text around them in TEXT chunks', () => {
    const before = chunkExtractedText(reading.text);
    expect(before.map((c) => chunkTypeOf(c.text))).toEqual(['TEXT']);

    const chunks = chunkExtractedText(reading.text, { tableSpans: spans });
    for (const t of reading.tables) {
      const own = chunks.filter((c) => c.charStart <= t.start && c.charEnd >= t.end);
      expect(own, t.ref).toHaveLength(1);
      expect(chunkTypeOf(own[0].text), t.ref).toBe('TABLE');
      expect(reading.text.slice(own[0].charStart, own[0].charEnd).trim()).toBe(reading.text.slice(t.start, t.end).trim());
    }
    expect(chunks.filter((c) => chunkTypeOf(c.text) === 'TABLE')).toHaveLength(3);
  });

  it('every character is still in a chunk, in order, with exact spans', () => {
    const chunks = chunkExtractedText(reading.text, { tableSpans: spans });
    expect(chunks[0].charStart).toBe(0);
    expect(chunks[chunks.length - 1].charEnd).toBe(reading.text.length);
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.text).toBe(reading.text.slice(c.charStart, c.charEnd));
      if (i > 0) expect(c.charStart).toBeLessThanOrEqual(chunks[i - 1].charEnd);
    });
  });

  it('a table is named by its caption, as the chunker already names a table chunk', () => {
    const text = [
      '11.4 Efficacy results',
      'The primary endpoint was met.',
      'Table 14.2.1 Objective response by arm\nArm\tN\tResponders\tORR\nBexotinib\t212\t100\t47%\nPlacebo\t210\t42\t20%',
      'Responses were durable.',
    ].join('\n\n');
    const start = text.indexOf('Table 14.2.1');
    const end = text.indexOf('\n\nResponses');
    const chunks = chunkExtractedText(text, { tableSpans: [{ start, end }] });
    const sections = sectionsForChunks(text, chunks);
    const i = chunks.findIndex((c) => c.charStart <= start && c.charEnd >= end);
    expect(sections[i]).toMatchObject({ chunkType: 'TABLE', sectionTitle: expect.stringMatching(/^Table 14\.2\.1/) });
  });

  it('a table longer than a chunk is cut between rows, never inside a cell', () => {
    const rows = Array.from({ length: 400 }, (_, i) => `Subject ${1000 + i}\tArm ${i % 2 ? 'A' : 'B'}\tGrade ${i % 4}\tDay ${i % 28}`);
    const table = ['Table 14.3.1 Adverse events by subject', ...rows].join('\n');
    const text = `Safety overview.\n\n${table}\n\nEnd of tables.`;
    const start = text.indexOf('Table 14.3.1');
    const chunks = chunkExtractedText(text, { tableSpans: [{ start, end: start + table.length }] });
    const inTable = chunks.filter((c) => c.charStart >= start && c.charEnd <= start + table.length + 2);
    expect(inTable.length).toBeGreaterThan(1);
    for (const c of inTable.slice(0, -1)) expect(text[c.charEnd - 1]).toBe('\n');
  });
});

describe('without table spans, chunking is exactly what it was', () => {
  it('no spans, empty spans and spans outside the text give the same chunks as no option at all', () => {
    const text = reading.text + '\n\n' + 'A further paragraph. '.repeat(400);
    const base = chunkExtractedText(text);
    expect(base.length).toBeGreaterThan(1);
    expect(chunkExtractedText(text, {})).toEqual(base);
    expect(chunkExtractedText(text, { tableSpans: [] })).toEqual(base);
    expect(chunkExtractedText(text, { tableSpans: [{ start: text.length + 5, end: text.length + 10 }] })).toEqual(base);
  });
});
