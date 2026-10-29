/**
 * CSR slice 8 (2026-10-29): the body leaf of an assembled CSR.
 *
 * In ICH E3 order, from ICH_E3_GUIDANCE: the drafted sections exactly as
 * saved (workflow-source-import verified each against its hash), with
 *   §3  a generated table of contents to four levels, each line linked;
 *   §4  the list of abbreviations from build_abbreviation_list's composer
 *       (medical-writing-qc.ts buildAbbreviationList), with the definition
 *       given at first use, or "not defined at first use" (never invented);
 *   §14 the engine tables, each linked into the §14 leaf;
 *   §16 every appendix, linked to its leaf, or marked as not supplied;
 * and every cross-reference in the text linked to its target.
 *
 * Laid out twice: once to learn the page of each heading, then for real with
 * those page numbers in the contents. The second layout must paginate exactly
 * as the first; if it does not, assembly fails rather than print a wrong page.
 */
import { buildAbbreviationList } from '../ana/medical-writing-qc.js';
import { ICH_E3_GUIDANCE } from '../ind/ctd/csr-e3-guidance.js';
import { CsrPdfWriter, type WrittenPdf } from './csr-pdf-writer.js';
import { splitCrossReferences, type CrossReferenceIndex, type TextRun, type UnresolvedReference } from './csr-cross-references.js';
import { CSR_TABLES_FILE, headingDestination, supportingOutputs, tflHeadings, type PlannedTfl } from './csr-assembly-plan.js';

export type AppendixState =
  | { state: 'filed'; fileName: string; detail: string }
  | { state: 'missing'; reason: string }
  | { state: 'not-applicable'; reason: string };

export interface BodyInput {
  studyId: string;
  title: string;
  /** The study's ClinicalTrials.gov registration, as the approved source states it. */
  nctNumber?: string | null;
  sections: ReadonlyMap<string, { title: string; content: string }>;
  tfls: readonly PlannedTfl[];
  appendices: ReadonlyMap<string, AppendixState>;
  leafTargets: CrossReferenceIndex['leafTargets'];
  stamp: Date;
}

export interface BodyHeading { number: string; title: string; level: number }
export interface RenderedBody { written: WrittenPdf; headings: BodyHeading[]; unresolved: UnresolvedReference[]; abbreviations: { total: number; undefinedAtFirstUse: string[] } }

const APPENDIX_GROUPS = new Set(['16', '16.1', '16.2', '16.3']);

/** The headings the body draws, in E3 order. */
export function bodyHeadings(input: Pick<BodyInput, 'sections' | 'tfls' | 'appendices'>): BodyHeading[] {
  const drafted = [...input.sections.keys()];
  const tflHeads = new Set(tflHeadings(input.tfls).map(h => h.number));
  const wanted = (n: string) => {
    if (n === '1' || n === '3' || n === '4') return true;
    if (n === '14' || n.startsWith('14.')) return tflHeads.has(n);
    if (n === '16' || n.startsWith('16.')) return APPENDIX_GROUPS.has(n) || input.appendices.has(n);
    return drafted.some(code => code === n || code.startsWith(`${n}.`));
  };
  return ICH_E3_GUIDANCE.filter(s => wanted(s.number)).map(s => ({ number: s.number, title: s.title, level: s.number.split('.').length }));
}

interface Pass { writer: CsrPdfWriter; index: CrossReferenceIndex; unresolved: UnresolvedReference[]; pages: Map<string, number> }

/** A drafted section's text: paragraphs, list items and markdown headings as written; references linked. */
function drawContent(pass: Pass, number: string, content: string): void {
  for (const block of content.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n').filter(l => l.trim());
    if (!lines.length) continue;
    if (lines.every(l => l.trim().startsWith('|'))) { for (const l of lines) pass.writer.lines(l.trim(), { font: 'Courier', size: 8 }); continue; }
    let buffer: string[] = [];
    const flush = () => { if (buffer.length) pass.writer.paragraph(runs(pass, number, buffer.join(' '))); buffer = []; };
    for (const line of lines) {
      const heading = /^#{1,6}\s+(.*)$/.exec(line.trim());
      if (heading) { flush(); pass.writer.lines(heading[1], { font: 'Helvetica-Bold', size: 10.5 }); continue; }
      if (/^\s*(?:[-*•]|\d+[.)])\s+/.test(line)) { flush(); buffer = [line.trim()]; flush(); continue; }
      buffer.push(line.trim());
    }
    flush();
  }
}

function runs(pass: Pass, section: string, text: string): TextRun[] {
  const found: UnresolvedReference[] = [];
  const result = splitCrossReferences(text, pass.index, found);
  pass.unresolved.push(...found.map(f => ({ ...f, section })));
  return result;
}

function drawTitlePage(pass: Pass, input: BodyInput): void {
  pass.writer.lines(input.title, { font: 'Helvetica-Bold', size: 16 });
  pass.writer.lines(`Clinical Study Report (ICH E3) — Study ${input.studyId}`, { size: 12 });
  if (input.nctNumber) pass.writer.lines(`ClinicalTrials.gov Identifier: ${input.nctNumber}`, { size: 11 });
  pass.writer.lines('Assembled from the saved CSR job’s hash-verified sections and the retained run’s engine tables. This assembly carries no approval or signature; those are recorded on the governed Authoring document.', { size: 9.5 });
}

function drawContents(pass: Pass, headings: readonly BodyHeading[], pages: ReadonlyMap<string, number> | null): void {
  for (const h of headings) {
    if (h.number === '3' || h.level > 4) continue;
    const page = pages ? String(pages.get(h.number) ?? '') : '000';
    pass.writer.tocLine(`${h.number} ${h.title}`, h.level, page, headingDestination(h.number));
  }
}

async function drawAbbreviations(pass: Pass, input: BodyInput): Promise<RenderedBody['abbreviations']> {
  const report = buildAbbreviationList([...input.sections.values()].map(s => s.content).join('\n\n'));
  if (!report.total) { pass.writer.lines('The drafted text uses no abbreviation.'); return { total: 0, undefinedAtFirstUse: [] }; }
  await pass.writer.table({ headers: ['Abbreviation', 'Definition at first use in this report'], widths: [1, 4], size: 9 },
    report.abbreviations.map(a => ({ cells: [a.abbreviation, a.definedAtFirstUse && a.expansion ? a.expansion : 'Not defined at first use in this report'] })));
  return { total: report.total, undefinedAtFirstUse: report.undefinedAbbreviations };
}

function drawTables(pass: Pass, heading: string, tfls: readonly PlannedTfl[], heads: ReadonlySet<string>): void {
  // The §14 document's name as it ships (csr-assembly.ts leafTargets), so the text and every link name the file the package holds.
  const tablesFile = (tfls.length && pass.index.leafTargets.get(tfls[0].number)?.fileName) || CSR_TABLES_FILE;
  if (heading === '14') pass.writer.lines(tfls.length ? `The tables of Section 14 are filed as a separate document, ${tablesFile}, in this study’s folder.` : 'Not supplied. The retained run holds no engine table, so no Section 14 document is filed.', tfls.length ? {} : { font: 'Helvetica-Oblique' });
  for (const t of tfls) {
    const parts = t.number.split('.');
    let parent = '';
    for (let n = parts.length - 1; n >= 1 && !parent; n--) if (heads.has(parts.slice(0, n).join('.'))) parent = parts.slice(0, n).join('.');
    if (parent !== heading) continue;
    pass.writer.paragraph([{ text: `Table ${t.number}`, link: { kind: 'external', fileName: tablesFile, destination: t.destination } }, { text: ` ${t.table.title}` }], { indent: 12 });
  }
}

function drawAppendix(pass: Pass, number: string, state: AppendixState | undefined): void {
  if (!state) return;
  if (state.state === 'filed') {
    pass.writer.paragraph([{ text: 'Filed as ' }, { text: state.fileName, link: { kind: 'external', fileName: state.fileName, destination: null } }, { text: ` — ${state.detail}` }]);
  } else if (state.state === 'missing') pass.writer.lines(`Not supplied. ${state.reason}`, { font: 'Helvetica-Oblique' });
  else pass.writer.lines(`Not applicable to this study: ${state.reason}`, { font: 'Helvetica-Oblique' });
}

function drawSupporting(pass: Pass, number: string, tfls: readonly PlannedTfl[]): void {
  const cited = supportingOutputs(number, tfls).filter(ref => pass.index.leafTargets.has(ref.split(' ')[1]));
  if (cited.length) pass.writer.paragraph(runs(pass, number, `Supporting outputs: ${cited.join(', ')}.`), { size: 9 });
}

async function drawHeading(pass: Pass, input: BodyInput, h: BodyHeading, ctx: { headings: BodyHeading[]; pages: ReadonlyMap<string, number> | null; abbreviations: RenderedBody['abbreviations'] }): Promise<void> {
  pass.writer.heading(`${h.number} ${h.title}`, Math.min(h.level, 4), headingDestination(h.number));
  pass.pages.set(h.number, pass.writer.pages);
  if (h.number === '1') drawTitlePage(pass, input);
  if (h.number === '3') drawContents(pass, ctx.headings, ctx.pages);
  if (h.number === '4') Object.assign(ctx.abbreviations, await drawAbbreviations(pass, input));
  const drafted = input.sections.get(h.number);
  if (drafted) drawContent(pass, h.number, drafted.content);
  if (h.number === '14' || h.number.startsWith('14.')) drawTables(pass, h.number, input.tfls, new Set(tflHeadings(input.tfls).map(t => t.number)));
  if (h.number.startsWith('16')) drawAppendix(pass, h.number, input.appendices.get(h.number));
  if (drafted) drawSupporting(pass, h.number, input.tfls);
}

async function layout(input: BodyInput, path: string | null, pages: ReadonlyMap<string, number> | null) {
  const headings = bodyHeadings(input);
  const writer = new CsrPdfWriter({ path, title: `${input.title} — Clinical Study Report body`, runningHeader: `Study ${input.studyId} — Clinical Study Report`, stamp: input.stamp });
  const pass: Pass = { writer, index: { bodyHeadings: new Set(headings.map(h => h.number)), leafTargets: input.leafTargets }, unresolved: [], pages: new Map() };
  const abbreviations: RenderedBody['abbreviations'] = { total: 0, undefinedAtFirstUse: [] };
  for (const h of headings) {
    await drawHeading(pass, input, h, { headings, pages, abbreviations });
    await writer.drain();
  }
  return { written: await writer.finish(), headings, unresolved: pass.unresolved, pages: pass.pages, abbreviations };
}

export async function renderBody(input: BodyInput, path: string): Promise<RenderedBody> {
  const first = await layout(input, null, null);
  const final = await layout(input, path, first.pages);
  for (const [number, page] of first.pages) {
    if (final.pages.get(number) !== page) throw new Error(`The body paginated differently on its second layout (heading ${number}); the contents would print a wrong page.`);
  }
  return { written: final.written, headings: final.headings, unresolved: final.unresolved, abbreviations: final.abbreviations };
}
