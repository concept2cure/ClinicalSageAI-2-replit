/**
 * The gold bank covers what the platform sells, from real source text
 * (P-31 item 4, docs/MODEL_GOVERNANCE_DECISION_2026-10-13.md; P-56,
 * docs/LAUNCH_DEFINITION_OF_DONE.md; 2026-11-01).
 *
 * THE DEFECT THIS PREVENTS. The bank held `510k`, `cer` and `ind` only. A model
 * qualified on those would be admitted to draft CMC / Module 3 and Module
 * 2.5–2.7 content it was never evaluated on. And the bank's earlier passages
 * are fictional ("Acme Analyzer 2000"), which P-56 no longer accepts for these
 * two: their items are "authored from real source text and never invented".
 *
 * So: both document types reach both floors with headroom; every task of theirs
 * names the real document it was cut from; and a task cut from a synopsis kept
 * in this repository (csrs/) is shown, line by line, to be that PDF's own
 * text. A task whose "source" was typed in fails here.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const PQ_DIR = path.resolve(HERE, '..');

interface Source {
  document?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  license?: string;
  section?: string;
}
interface GoldTask {
  id: string;
  docType: string;
  taskType: string;
  input?: unknown;
  expectedFields?: Record<string, string>;
  source?: Source;
}

const bank = JSON.parse(
  readFileSync(path.join(PQ_DIR, '..', 'doc-quality', 'gold-tasks.json'), 'utf8'),
) as { tasks: GoldTask[] };
const protocol = JSON.parse(readFileSync(path.join(PQ_DIR, 'pq-protocol.json'), 'utf8')) as {
  components: Record<'generation' | 'extraction', { criteria: { minTasksPerDocType: number } }>;
};

/** The two document types P-31 item 4 owes. */
const OWED = ['module-2-clinical', 'module-3-quality'] as const;
/** Licences that let a short verbatim excerpt be kept with attribution. */
const REUSABLE = /^(CC BY|CC BY-SA|CC BY-NC|CC BY-NC-SA|CC BY-NC-ND|CC BY-ND|CC0|public domain)(\s[\d.]+)?$/i;

const owed = bank.tasks.filter((t) => (OWED as readonly string[]).includes(t.docType));
const hasInput = (t: GoldTask) => typeof t.input === 'string' && t.input.trim().length > 0;

describe('the bank covers CMC / Module 3 and Module 2.5–2.7', () => {
  for (const docType of OWED) {
    it(`${docType} reaches both floors with headroom`, () => {
      const generation = owed.filter((t) => t.docType === docType && t.taskType === 'generation' && hasInput(t)).length;
      const extraction = owed.filter((t) => t.docType === docType && t.taskType === 'extraction' && hasInput(t)
        && t.expectedFields && Object.keys(t.expectedFields).length > 0).length;
      expect(generation, `${docType} generation tasks`).toBeGreaterThan(protocol.components.generation.criteria.minTasksPerDocType);
      expect(extraction, `${docType} extraction tasks`).toBeGreaterThan(protocol.components.extraction.criteria.minTasksPerDocType);
    });
  }
});

describe('every owed task names the real document it was cut from', () => {
  it('a document in this repository, or a reusable published article', () => {
    const unnamed: string[] = [];
    for (const t of owed) {
      const s = t.source;
      if (!s?.title || !s.section) { unnamed.push(`${t.id}: no title or section`); continue; }
      if (s.document) {
        if (!existsSync(path.join(ROOT, s.document))) unnamed.push(`${t.id}: ${s.document} is not in the repository`);
      } else if (!s.pmid || !s.doi || !s.license || !REUSABLE.test(s.license.trim())) {
        unnamed.push(`${t.id}: an article needs a PMID, a DOI and a reusable licence (got ${s.license ?? 'none'})`);
      }
    }
    expect(unnamed).toEqual([]);
  });

  it('a task cut from a synopsis in csrs/ is that PDF\'s own text, line by line', async () => {
    const { PDFParse } = (await import('pdf-parse')) as unknown as {
      PDFParse: new (o: { data: Buffer }) => { getText(): Promise<{ text?: string }> };
    };
    const pdfText = new Map<string, string>();
    const notInSource: string[] = [];
    for (const t of owed.filter((x) => x.source?.document?.startsWith('csrs/'))) {
      const doc = t.source!.document!;
      if (!pdfText.has(doc)) {
        const parsed = await new PDFParse({ data: readFileSync(path.join(ROOT, doc)) }).getText();
        // The PDF's private-use bullet glyphs were transcribed as "•".
        pdfText.set(doc, (parsed.text ?? '').replace(/[]/g, '•'));
      }
      const text = pdfText.get(doc)!;
      for (const line of String(t.input).split('\n')) {
        if (line.trim() && !text.includes(line)) notInSource.push(`${t.id}: "${line.slice(0, 60)}"`);
      }
    }
    expect(notInSource).toEqual([]);
  }, 60_000);
});
