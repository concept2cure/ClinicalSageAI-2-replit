/**
 * A placed Module 3 section is filed as a typeset document, not as markdown.
 *
 * The Module 3 placement stores its composition as markdown
 * (module3Composer.renderComposedSectionMarkdown — the same bytes as the
 * governed artifact, which place-module3-into-submission's tests pin). The leaf
 * resolver rendered that string with renderLeafPdf, a text renderer, so the
 * PDF a reviewer opens read "## 3.2.S.4.1 Specification" and
 * "| Test | Acceptance criterion |" / "| --- | --- |" (hand-off item 17,
 * docs/work-orders/README.md). Text is read back out of the rendered PDF with
 * pdfjs: the raw bytes are compressed, so a substring search over them proves
 * nothing either way.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';
import { renderComposedSectionMarkdown, type GeneratedTable } from '../../module3Composer';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({
  get db() {
    return holder.db;
  },
}));

import { materializeLeafSources } from '../leaf-source-resolver';
import {
  composedSectionToBlocks,
  renderComposedSectionLeafPdf,
  renderTypesetLeafPdf,
} from '../typeset-leaf-pdf';

async function pdfPages(buf: Buffer): Promise<string[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    pages.push(
      content.items
        .map((i: any) => i.str)
        .join(' ')
        .replace(/\s+/g, ' ')
    );
  }
  return pages;
}

async function outline(buf: Buffer): Promise<any[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  return ((await doc.getOutline()) as any[]) ?? [];
}

const SPEC: GeneratedTable = {
  title: 'Drug substance specification',
  headers: ['Test', 'Method', 'Acceptance criterion'],
  rows: [
    ['Appearance', 'Visual', 'White to off-white powder'],
    ['Assay (HPLC)', 'AM-0012', '98.0–102.0% (anhydrous basis)'],
    ['Impurity B', 'AM-0013', 'NMT 0.15%'],
    ['Residual solvents', 'GC-HS (Ph. Eur. 2.4.24)', 'Ethanol ≤ 5000 ppm'],
  ],
};
const NARRATIVE =
  'The specification is given in the table below. Impurity B was <LOQ in all 3 batches; ' +
  'limits follow ICH Q3A(R2) and Q6A.';
const LABEL = '3.2.S.4.1 Specification';
const MARKDOWN = renderComposedSectionMarkdown(LABEL, NARRATIVE, [SPEC]);

/** What markdown syntax looks like when it reaches a page as text. */
function expectNoMarkdownSyntax(text: string): void {
  expect(text).not.toMatch(/(^|\s)#{2,}\s/);
  expect(text).not.toMatch(/\|\s*-{3,}/);
  expect(text).not.toContain('|');
}

describe('a placed Module 3 section, through the leaf resolver', () => {
  let harness: IndPgliteDb;
  const dirs: string[] = [];

  beforeAll(async () => {
    harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
    holder.db = harness.db;
    await harness.pglite.query(
      `INSERT INTO coauthor_documents (id, organization_id, title, content, status, module_number, metadata)
       VALUES (301, 1, $1, $2, 'approved', 'm3.2.S.4.1', $3::json)`,
      [
        `Module 3 — ${LABEL} (§3.2.S.4.1)`,
        MARKDOWN,
        JSON.stringify({ placedFrom: 'cmc-module3-os', sectionKey: '3.2.S.4.1' }),
      ]
    );
  });
  afterAll(async () => {
    await harness?.pglite.close();
    for (const d of dirs) await fs.rm(d, { recursive: true, force: true });
  });

  it('files the section as headings, prose and a table — never as markdown', async () => {
    const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'm3-leaf-'));
    dirs.push(stageDir);
    const result = await materializeLeafSources({
      organizationId: 1,
      stageDir,
      leaves: [{ documentTable: 'coauthor_documents', documentId: 301, lifecycleOp: 'new' }],
    } as any);
    const [staged] = [...result.byKey.values()];
    const text = (await pdfPages(await fs.readFile(staged.sourcePath))).join(' ');

    expectNoMarkdownSyntax(text);
    for (const value of [
      'Impurity B',
      'NMT 0.15%',
      'AM-0013',
      'White to off-white powder',
      'Acceptance criterion',
    ]) {
      expect(text).toContain(value);
    }
    expect(text).toContain('<LOQ in all 3 batches');
  });
});

describe('composedSectionToBlocks reads the composer’s one format exactly', () => {
  it('reads a composed section as a heading, a paragraph, a table title and a table', () => {
    const blocks = composedSectionToBlocks(MARKDOWN);
    expect(blocks.map(b => b.kind)).toEqual(['heading', 'paragraph', 'heading', 'table']);
    const table = blocks[3] as Extract<(typeof blocks)[number], { kind: 'table' }>;
    expect(table.headers).toEqual(SPEC.headers);
    expect(table.rows).toEqual(SPEC.rows);
  });

  /* Recorded text is not markdown. A markdown reading took the asterisks of
     "1*10^3 CFU/g" as emphasis and filed "110^3 CFU/g" (discovery map,
     typeset-emphasis-alters-recorded-values); lines starting "1." or "#"
     became lists and headings. Every character must come back. */
  const HOSTILE_NARRATIVE = [
    'Charge 2*3 kg, then wash 4*5 L; TAMC NMT 1*10^3 CFU/g and TYMC NMT 1*10^2 CFU/g.',
    '1. Dissolve in _ethanol_ at 40 °C.\n3. Filter (0.2 µm) — `pore` [size] ~ nominal.',
    '# not a heading\n> not a quote\n---\nImpurity B was <LOQ; dissolution &ge; 80% (Q); R&D lot \\ 7.',
  ].join('\n\n');
  const HOSTILE_TABLES = [
    {
      title: 'Microbial limits | release',
      headers: ['Test', 'Acceptance criterion', 'Note'],
      rows: [
        ['TAMC', 'NMT 1*10^3 CFU/g', '*not* emphasis'],
        ['Assay', '98.0–102.0% | anhydrous', ''],
        ['Impurity_A', '≤ 0.15% (C_max)', '1. starts like a list'],
      ],
    },
    { title: 'Empty', headers: ['A'], rows: [] },
  ];

  it('returns every recorded character of the narrative and every cell, whatever it looks like', () => {
    const blocks = composedSectionToBlocks(
      renderComposedSectionMarkdown('3.2.P.5.1 Specifications', HOSTILE_NARRATIVE, HOSTILE_TABLES)
    );
    expect(blocks[0]).toEqual({ kind: 'heading', level: 2, text: '3.2.P.5.1 Specifications' });
    const paragraphs = blocks.filter(b => b.kind === 'paragraph').map(b => (b as any).text);
    expect(paragraphs.join('\n\n')).toBe(HOSTILE_NARRATIVE);
    const tables = blocks.filter(b => b.kind === 'table') as any[];
    expect(tables.map(t => ({ headers: t.headers, rows: t.rows }))).toEqual(
      HOSTILE_TABLES.map(t => ({ headers: t.headers, rows: t.rows }))
    );
    const titles = blocks
      .filter(b => b.kind === 'heading' && (b as any).level === 3)
      .map(b => (b as any).text);
    expect(titles).toEqual(HOSTILE_TABLES.map(t => t.title));
  });

  it('files "1*10^3 CFU/g" with its asterisk, end to end through the PDF', async () => {
    const pdf = await renderComposedSectionLeafPdf(
      renderComposedSectionMarkdown('3.2.P.5.1 Specifications', HOSTILE_NARRATIVE, HOSTILE_TABLES),
      { title: 'Specifications', sectionCode: 'm3.2.P.5.1' }
    );
    const text = (await pdfPages(pdf)).join(' ');
    expect(text).toContain('1*10^3 CFU/g');
    expect(text).toContain('2*3 kg');
    expect(text).toContain('# not a heading');
    expect(text).toContain('98.0–102.0% | anhydrous');
  });

  it('keeps content that is not in the composer’s format whole, as literal paragraphs', () => {
    const text = '### Not a table\n\n| a |\nno separator row';
    expect(composedSectionToBlocks(text)).toEqual([
      { kind: 'paragraph', text: '### Not a table' },
      { kind: 'paragraph', text: '| a |\nno separator row' },
    ]);
  });
});

describe('renderTypesetLeafPdf — determinism and tables', () => {
  it('is byte-deterministic', async () => {
    const opts = { title: LABEL, sectionCode: 'm3.2.S.4.1' };
    const a = await renderComposedSectionLeafPdf(MARKDOWN, opts);
    const b = await renderComposedSectionLeafPdf(MARKDOWN, opts);
    expect(a.equals(b)).toBe(true);
  });

  it('repeats a long table header on every page the table runs onto', async () => {
    const rows = Array.from({ length: 140 }, (_, i) => [
      `T${i + 1} months`,
      `${(99.9 - i * 0.01).toFixed(2)}%`,
      `0.0${i % 10}%`,
    ]);
    const pdf = await renderTypesetLeafPdf(
      [{ kind: 'table', headers: ['Time point', 'Assay', 'Total impurities'], rows }],
      { title: 'Stability data', sectionCode: 'm3.2.P.8.3' }
    );
    const pages = await pdfPages(pdf);
    expect(pages.length).toBeGreaterThan(2);
    for (const page of pages) expect(page).toContain('Total impurities');
    const all = pages.join(' ');
    expect(all).toContain('T1 months');
    expect(all).toContain('T140 months');
  });

  it('fits a wide table to the page without losing a word', async () => {
    const headers = [
      'Batch',
      'Scale',
      'Site',
      'Use',
      'Assay',
      'Impurity A',
      'Impurity B',
      'Water (KF)',
    ];
    const rows = [
      [
        'DS-2026-001-ENGINEERING',
        '25 kg',
        'Contract manufacturer, Building 4',
        'Toxicology and clinical',
        '99.4%',
        '0.05%',
        '<LOQ',
        '0.3%',
      ],
    ];
    const pdf = await renderTypesetLeafPdf([{ kind: 'table', headers, rows }], {
      title: 'Batch analyses',
    });
    const text = (await pdfPages(pdf)).join(' ');
    for (const word of [
      'Contract',
      'manufacturer,',
      'Building',
      'Toxicology',
      'clinical',
      'Water',
      '(KF)',
      '<LOQ',
    ]) {
      expect(text).toContain(word);
    }
  });
});

describe('renderTypesetLeafPdf — orientation and bookmarks', () => {
  it('turns a table too wide for portrait onto a landscape page, with its heading, and returns to portrait', async () => {
    // Nine columns whose longest words do not fit a portrait text width even
    // at the smallest type size, but do fit a landscape one.
    const headers = [
      'Impurity',
      'Classification',
      'Specification',
      'Qualification',
      'Identification',
      'Characterisation',
      'Disposition',
      'Toxicological',
      'Justification',
    ];
    const rows = [
      [
        'N-nitrosodimethylamine',
        'mutagenic',
        'NMT 0.15%',
        'Qualified by the 90-day rat study',
        'LC-MS/MS',
        'Incomplete methylation at step 3',
        'within the ICH M7 Class 2 acceptable intake',
        'Ames negative',
        'ICH Q3A(R2)',
      ],
    ];
    const pdf = await renderTypesetLeafPdf(
      [
        { kind: 'paragraph', text: 'Before.' },
        { kind: 'heading', level: 3, text: 'Impurity Profile' },
        { kind: 'table', headers, rows },
        { kind: 'paragraph', text: 'After the table.' },
      ],
      { title: 'Impurities', sectionCode: 'm3.2.S.3.2' }
    );
    const { PDFDocument } = await import('pdf-lib');
    const sizes = (await PDFDocument.load(pdf)).getPages().map(p => {
      const { width, height } = p.getSize();
      return width > height ? 'landscape' : 'portrait';
    });
    expect(sizes).toEqual(['portrait', 'landscape', 'portrait']);
    const pages = await pdfPages(pdf);
    expect(pages[1]).toContain('Impurity Profile');
    expect(pages[1]).toContain('Characterisation');
    expect(pages[1]).toContain('nitrosodimethylamine');
    expect(pages[2]).toContain('After the table.');
  });

  it('bookmarks each heading under the document, on the page it is drawn', async () => {
    const pdf = await renderComposedSectionLeafPdf(MARKDOWN, {
      title: LABEL,
      sectionCode: 'm3.2.S.4.1',
    });
    const [root] = await outline(pdf);
    expect(String(root.title)).toContain('m3.2.S.4.1');
    expect(root.items.map((n: any) => String(n.title))).toEqual([LABEL]);
    expect(root.items[0].items.map((n: any) => String(n.title))).toEqual([
      'Drug substance specification',
    ]);
  });
});
