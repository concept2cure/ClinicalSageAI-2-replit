import path from 'path';
import fs from 'fs/promises';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';

export async function generateDocxBuffer(title: string, content: string): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: title || 'Document',
            heading: HeadingLevel.HEADING_1,
          }),
          ...content.split('\n\n').map(p => new Paragraph({ children: [new TextRun(p)] })),
        ],
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  return buf;
}

export async function saveGeneratedDocx(buffer: Buffer, filename: string): Promise<string> {
  const baseDir = path.resolve(process.cwd(), 'generated_documents');
  await fs.mkdir(baseDir, { recursive: true });
  const safe = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const outPath = path.join(baseDir, safe);
  await fs.writeFile(outPath, buffer);
  return outPath;
}
