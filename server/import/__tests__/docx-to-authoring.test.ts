/**
 * Word import keeps the structure — proven by sending a document out through
 * the platform's OWN exporter and reading it back in.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Four services in this repo already read .docx, and all four call mammoth's
 * `extractRawText`, which returns a flat string. That is correct for the search
 * and retrieval those services do. It is wrong for authoring: a regulatory
 * author importing a technical file needs the TABLES — a predicate comparison,
 * a GSPR matrix, a stability table IS the content — and raw text throws every
 * one of them away, silently, leaving text on screen that looks like a
 * successful import (MDX_WORK_ORDER W3-5).
 *
 * ── Why the proof is a round trip ────────────────────────────────────────────
 * A fixture .docx checked into the repo would only prove this parses THAT file.
 * Instead the export path builds a real OOXML document from real blocks — the
 * same `blocksToDocx` the authoring export uses — and the import reads those
 * bytes back. Both halves are the product's own, so the test fails if either
 * one regresses, and it needs no binary fixture to stay honest.
 */
import { describe, it, expect } from 'vitest';
import { Document, Packer } from 'docx';
import * as docxNs from 'docx';
import { blocksToDocx, orderedListNumbering } from '../../export/authoring-blocks-to-docx';
import { importDocx, parseHeading, splitIntoSections } from '../docx-to-authoring';
import type { ContentBlock } from '../../export/authoring-section-content';

const run = (text: string) => ({ text, bold: false, italic: false, underline: false });
const cell = (text: string) => ({ runs: [run(text)] });

/** A document with the two things raw-text extraction destroys. */
const BLOCKS: ContentBlock[] = [
  { kind: 'heading', level: 1, runs: [run('5.1 Device Description')] },
  { kind: 'paragraph', runs: [run('The device is a continuous analyte monitor.')] },
  {
    kind: 'table',
    runs: [],
    rows: [
      [cell('Characteristic'), cell('Subject'), cell('Predicate')],
      [cell('Sensor life'), cell('10 days'), cell('7 days')],
      [cell('Calibration'), cell('Factory'), cell('Fingerstick')],
    ],
  },
  { kind: 'heading', level: 1, runs: [run('5.2 Performance Testing')] },
  { kind: 'list-item', ordered: false, runs: [run('Bench accuracy across the reportable range')] },
  { kind: 'list-item', ordered: false, runs: [run('Interference per CLSI EP07')] },
];

/**
 * Build a real .docx the way the export route does: blocksToDocx returns the
 * paragraphs and tables, and the caller assembles the Document around them —
 * including the numbering config the ordered-list style references.
 */
function build(blocks: ContentBlock[]) {
  return new Document({
    numbering: orderedListNumbering(docxNs as never),
    sections: [{ children: blocksToDocx(docxNs as never, blocks) }],
  });
}

async function toBuffer(blocks: ContentBlock[]): Promise<Buffer> {
  return Buffer.from(await Packer.toBuffer(build(blocks)));
}

async function roundTrip() {
  return importDocx(await toBuffer(BLOCKS));
}

describe('a document goes out through the exporter and comes back with its structure', () => {
  it('recovers the sections from the headings, with their codes', async () => {
    const r = await roundTrip();
    const coded = r.sections.filter((s) => s.code);
    expect(coded.map((s) => s.code)).toEqual(['5.1', '5.2']);
    expect(coded.map((s) => s.title)).toEqual(['Device Description', 'Performance Testing']);
  });

  it('keeps the table — the thing raw-text extraction destroys', async () => {
    const r = await roundTrip();
    const deviceDescription = r.sections.find((s) => s.code === '5.1');
    expect(deviceDescription?.html).toContain('<table');
    expect(deviceDescription?.html).toContain('Sensor life');
    expect(deviceDescription?.html).toContain('10 days');
    expect(deviceDescription?.html).toContain('Fingerstick');
    expect(r.counts.tables).toBe(1);
  });

  it('keeps the list, not just its text', async () => {
    const r = await roundTrip();
    const performance = r.sections.find((s) => s.code === '5.2');
    expect(performance?.html).toMatch(/<(ul|ol)/);
    expect(performance?.html).toContain('CLSI EP07');
    expect(r.counts.lists).toBeGreaterThan(0);
  });

  it('is measurably better than the extractRawText the other four readers use', async () => {
    const buffer = await toBuffer(BLOCKS);
    const mammoth = await import('mammoth');
    const raw = (await mammoth.extractRawText({ buffer })).value;

    expect(raw).not.toContain('<table');
    expect(raw).not.toMatch(/<(ul|ol)/);
    // The words are there, which is the trap: it reads like a successful import.
    expect(raw).toContain('Sensor life');

    const imported = await importDocx(buffer);
    expect(imported.sections.some((s) => s.html.includes('<table'))).toBe(true);
  });
});

describe('section codes are parsed, never invented', () => {
  it('splits a dotted code from its title', () => {
    expect(parseHeading('5.1 Device Description')).toEqual({ code: '5.1', title: 'Device Description' });
    expect(parseHeading('3.2.S Drug Substance')).toEqual({ code: '3.2.S', title: 'Drug Substance' });
    expect(parseHeading('2.7.3 Summary of Clinical Efficacy')).toEqual({
      code: '2.7.3',
      title: 'Summary of Clinical Efficacy',
    });
  });

  it('does not invent a code for a heading that carries none', () => {
    expect(parseHeading('Introduction')).toEqual({ code: null, title: 'Introduction' });
    expect(parseHeading('Executive summary')).toEqual({ code: null, title: 'Executive summary' });
  });

  it('reports headings that carry no code rather than guessing one', async () => {
    const r = await importDocx(
      await toBuffer([
        { kind: 'heading', level: 1, runs: [run('Introduction')] },
        { kind: 'paragraph', runs: [run('Body text.')] },
      ]),
    );
    expect(r.sections[0].code).toBeNull();
    expect(r.warnings.join(' ')).toContain('carry no section code');
  });
});

describe('nothing is dropped silently', () => {
  it('keeps content that appears before the first heading', () => {
    const s = splitIntoSections('<p>Preamble.</p><h1>1 First</h1><p>Body.</p>');
    expect(s[0].code).toBeNull();
    expect(s[0].html).toContain('Preamble.');
    expect(s[1].code).toBe('1');
  });

  it('says so when a document has no headings at all', async () => {
    const r = await importDocx(
      await toBuffer([{ kind: 'paragraph', runs: [run('A document with no headings whatsoever.')] }]),
    );
    expect(r.warnings.join(' ')).toContain('No headings were found');
    expect(r.sections[0].html).toContain('no headings whatsoever');
  });

  it('reports counts the author can check against the file they dragged in', async () => {
    const r = await roundTrip();
    expect(r.counts.sections).toBeGreaterThan(0);
    expect(r.counts.tables).toBe(1);
  });
});
