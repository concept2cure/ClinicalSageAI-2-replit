/**
 * The real Vault chunk writer stores each passage's section — section_title,
 * section_hierarchy and chunk_type — into the table exactly as
 * migrations/20260905b_vault_document_chunks.sql creates it: that file is
 * executed here (twice, as every deploy replays it), so the column types the
 * writer must satisfy (TEXT[], TEXT NOT NULL DEFAULT 'TEXT') are the
 * migration's, not a transcription of them.
 *
 * Before this, the INSERT named none of the three columns, so every chunk was
 * 'TEXT' with a NULL section, and every retrieved passage reached the RAG
 * reader with sectionTitle NULL. Only the pool connection is replaced; the
 * chunker, the section detector, the eligibility SQL and the INSERT run as-is.
 * This runs as the database owner: it does not qualify native RLS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ pg: null as PGlite | null, embeddingService: vi.fn() }));

function database(): PGlite {
  if (!h.pg) throw new Error('Section chunk test database is not ready');
  return h.pg;
}

async function query(sql: string, params: unknown[] = []) {
  const result = await database().query(sql, params);
  // PGlite SELECT has affectedRows=0; pg reports the returned row count.
  return { rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0 };
}

vi.mock('../../../db.js', () => ({
  pool: {
    query: (sql: string, params?: unknown[]) => query(sql, params),
    connect: async () => ({ query, release: () => undefined }),
  },
}));
vi.mock('../../enhancedEmbeddingService.js', () => ({ getEmbeddingService: h.embeddingService }));

import { chunkAndEmbedDocument } from '../document-chunking.service';
import type { PageSpan } from '../../ocr/page-offsets';

const ORG = 42;
const PROGRAM = '10000000-0000-4000-8000-000000000043';
const DOC = '20000000-0000-4000-8000-000000000043';
const MIGRATION = path.resolve(process.cwd(), 'migrations/20260905b_vault_document_chunks.sql');

interface StoredChunk {
  chunkIndex: number;
  charStart: number;
  charEnd: number;
  pageNumber: number | null;
  chunkType: string;
  sectionTitle: string | null;
  sectionHierarchy: string[] | null;
  text: string;
}

beforeAll(async () => {
  h.pg = new PGlite();
  await database().exec(`
    CREATE TABLE public.regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL);
    CREATE TABLE public.document_data_dispositions (
      organization_id integer NOT NULL, program_id uuid NOT NULL,
      vault_document_id uuid, linked_ids jsonb NOT NULL DEFAULT '{}', source_sha256 text
    );
    CREATE SCHEMA vault;
    CREATE TABLE vault.documents (
      id uuid PRIMARY KEY, program_id uuid NOT NULL REFERENCES public.regulatory_programs(id),
      content_hash text NOT NULL, extracted_text text NOT NULL
    );
  `);
  const migration = fs.readFileSync(MIGRATION, 'utf8');
  await database().exec(migration);
  await database().exec(migration);
  await database().query('INSERT INTO public.regulatory_programs VALUES ($1,$2)', [PROGRAM, ORG]);
});

beforeEach(async () => {
  // tenant-isolation-safe: isolated PGlite fixture contains this test's one organization only.
  await database().exec('TRUNCATE vault.document_chunks, vault.documents CASCADE');
  h.embeddingService.mockReset();
  h.embeddingService.mockImplementation(() => { throw new Error('Embedding must stay off in this keyless test'); });
});

afterAll(async () => { await h.pg?.close(); });

async function write(text: string, pageSpans?: PageSpan[]) {
  // tenant-isolation-safe: DOC is the sole document owned by this isolated fixture organization.
  await database().query(
    'INSERT INTO vault.documents (id,program_id,content_hash,extracted_text) VALUES ($1,$2,$3,$4)',
    [DOC, PROGRAM, 'c'.repeat(64), text],
  );
  return chunkAndEmbedDocument({ documentId: DOC, organizationId: ORG, text, pageSpans, embed: false });
}

async function storedChunks(): Promise<StoredChunk[]> {
  // tenant-isolation-safe: exact known fixture document; real writer ownership is tested separately.
  const result = await database().query<StoredChunk>(`
    SELECT chunk_index AS "chunkIndex", char_start AS "charStart", char_end AS "charEnd",
      page_number AS "pageNumber", chunk_type AS "chunkType", section_title AS "sectionTitle",
      section_hierarchy AS "sectionHierarchy", chunk_text AS text
    FROM vault.document_chunks WHERE document_id=$1 ORDER BY chunk_index
  `, [DOC]);
  return result.rows;
}

/* A clinical study report the way pdf-parse renders one: short lines, a tab
   between table cells. The narrative and the table are each longer than one
   chunk (4,000 characters), so chunks start inside each region and the
   expectation for every chunk follows from where it starts in this text. */
const narrative = (topic: string, lines: number) => Array.from({ length: lines }, (_, i) =>
  `Subject ${i + 1} in the ${topic} cohort completed the visit window with no protocol deviation recorded.`);
const tableRows = Array.from({ length: 200 }, (_, i) =>
  i === 100
    ? 'Pooled\tExamplinib 20 mg\t212\t102 (48.2%)\t41.3, 55.1'
    : `Site ${i + 1}\tExamplinib 20 mg\t${40 + (i % 9)}\t${18 + (i % 7)} (4${i % 10}.0%)\t3${i % 10}.1, 5${i % 10}.2`);
const SECTION = [
  '11 EFFICACY EVALUATION',
  '11.4 Efficacy Results and Tabulations of Individual Patient Data',
  '11.4.1 Primary Efficacy Endpoint',
];
const CAPTION = 'Table 11-3 Proportion of Responders at Week 24 (Full Analysis Set)';
const NEXT = [SECTION[0], SECTION[1], '11.4.2 Secondary Efficacy Endpoints'];
const REPORT = [
  'CLINICAL STUDY REPORT EXM-301',
  'Sponsor: Example Pharma Ltd',
  ...SECTION,
  ...narrative('primary', 70),
  CAPTION,
  'Site\tTreatment\tN\tResponders n (%)\t95% CI',
  ...tableRows,
  'Abbreviations: CI = confidence interval; FAS = full analysis set.',
  NEXT[2],
  ...narrative('secondary', 100),
].join('\n');

describe('the chunk writer stores the section each passage sits in', () => {
  it('writes section_title, section_hierarchy and chunk_type, by where each chunk starts', async () => {
    const result = await write(REPORT);
    expect(result).toMatchObject({ ok: true, embedded: false });
    const chunks = await storedChunks();
    expect(chunks.length).toBeGreaterThan(4);

    const firstSection = REPORT.indexOf(SECTION[0]);
    const primary = REPORT.indexOf(SECTION[2]);
    const caption = REPORT.indexOf(CAPTION);
    const secondary = REPORT.indexOf(NEXT[2]);
    const seen = { cover: 0, primary: 0, table: 0, secondary: 0 };
    for (const c of chunks) {
      const where = `chunk ${c.chunkIndex} at ${c.charStart}`;
      if (c.charStart < firstSection) {
        seen.cover++;
        expect({ title: c.sectionTitle, path: c.sectionHierarchy }, where).toEqual({ title: null, path: null });
      } else if (c.charStart >= primary && c.charStart < caption) {
        seen.primary++;
        expect({ title: c.sectionTitle, path: c.sectionHierarchy }, where).toEqual({ title: SECTION[2], path: SECTION });
      } else if (c.charStart >= caption && c.charStart < secondary) {
        seen.table++;
        // A table chunk is named by its caption; a chunk that is mostly prose
        // stays under the section, because where the table ends is not stated.
        expect({ title: c.sectionTitle, path: c.sectionHierarchy }, where).toEqual(
          c.chunkType === 'TABLE'
            ? { title: CAPTION, path: [...SECTION, CAPTION] }
            : { title: SECTION[2], path: SECTION },
        );
      } else if (c.charStart >= secondary) {
        seen.secondary++;
        expect({ type: c.chunkType, title: c.sectionTitle, path: c.sectionHierarchy }, where)
          .toEqual({ type: 'TEXT', title: NEXT[2], path: NEXT });
      }
    }
    // Every region was reached, so none of the branches above is vacuous.
    expect(seen.cover).toBeGreaterThan(0);
    expect(seen.primary).toBeGreaterThan(0);
    expect(seen.table).toBeGreaterThan(0);
    expect(seen.secondary).toBeGreaterThan(0);
    expect(chunks[0].chunkType).toBe('TEXT');
  });

  it('the chunk that quotes the statistic is a TABLE filed under its caption and its section', async () => {
    await write(REPORT);
    const caption = REPORT.indexOf(CAPTION);
    const quoting = (await storedChunks()).filter(c => c.text.includes('102 (48.2%)') && c.charStart > caption);
    expect(quoting.length).toBeGreaterThan(0);
    for (const c of quoting) {
      expect(c).toMatchObject({ chunkType: 'TABLE', sectionTitle: CAPTION, sectionHierarchy: [...SECTION, CAPTION] });
    }
  });

  it('keeps the page number beside the section', async () => {
    const secondary = REPORT.indexOf(NEXT[2]);
    await write(REPORT, [
      { page: 1, start: 0, end: secondary - 1 },
      { page: 2, start: secondary, end: REPORT.length },
    ]);
    const last = (await storedChunks()).at(-1)!;
    expect(last).toMatchObject({ pageNumber: 2, sectionTitle: NEXT[2] });
  });

  it('a document with no detectable heading stores NULL sections and the TEXT default', async () => {
    const minutes = [
      'Minutes of the data review meeting',
      'Attendees reviewed the listings and agreed on the following.',
      '1. The query backlog will be closed before database lock.',
      '2. Patients aged 18 or over remain the analysis population.',
    ].join('\n');
    await write(minutes);
    expect((await storedChunks()).map(c => [c.chunkType, c.sectionTitle, c.sectionHierarchy]))
      .toEqual([['TEXT', null, null]]);
  });
});
