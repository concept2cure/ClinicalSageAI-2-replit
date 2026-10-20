/**
 * The agency response package as a Word document, from the same structure the
 * Markdown is rendered from (response-logic.ts ResponsePackageModel).
 *
 * Why not docxGenerator.generateDocxBuffer: it takes Markdown text, splits it
 * on blank lines and puts each block in one run, so a single line break inside
 * an approved response disappeared (the signed text was reflowed) and the
 * Markdown's own quote and emphasis marks printed as characters (review of
 * 0308ee25). A signed answer is reproduced here line for line: each line of
 * the question and of the response is its own paragraph, blank lines kept,
 * nothing re-wrapped or re-marked.
 *
 * @module server/services/agency-responses/response-package-docx
 */

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { ResponsePackageModel } from './response-logic';

/** One paragraph per line of the text, exactly; an empty line stays an empty paragraph. */
function lines(text: string, indentTwips = 0): Paragraph[] {
  return text.split(/\r?\n/).map(
    (line) => new Paragraph({ children: [new TextRun(line)], ...(indentTwips ? { indent: { left: indentTwips } } : {}) }),
  );
}

function label(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, bold: true })], spacing: { before: 160 } });
}

export async function renderResponsePackageDocx(m: ResponsePackageModel): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: m.title, heading: HeadingLevel.HEADING_1 }),
    ...m.header.map((h) => new Paragraph({ children: [new TextRun(h)] })),
    new Paragraph({ children: [new TextRun({ text: m.attestation, italics: true })], spacing: { before: 120 } }),
  ];
  for (const s of m.sections) {
    children.push(
      new Paragraph({ text: s.discipline ? `${s.questionRef} (${s.discipline})` : s.questionRef, heading: HeadingLevel.HEADING_2 }),
      label('Question'),
      ...lines(s.questionText, 360),
      label('Response, as approved'),
      ...lines(s.responseText, 360),
      new Paragraph({ children: [new TextRun({ text: s.signature, italics: true })], spacing: { before: 120 } }),
    );
  }
  if (m.commitments.length > 0) {
    children.push(
      new Paragraph({ text: 'Commitments recorded against this letter', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({
        children: [new TextRun('From the commitments register. They are tracked separately and are not covered by the signatures above.')],
      }),
      ...m.commitments.map((c) => new Paragraph({ children: [new TextRun(`${c.questionRef}: ${c.line}`)], bullet: { level: 0 } })),
    );
  }
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}
