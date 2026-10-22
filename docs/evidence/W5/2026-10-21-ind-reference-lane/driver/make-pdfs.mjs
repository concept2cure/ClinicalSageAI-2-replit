import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(`${process.env.REPO ?? process.cwd()}/package.json`);
const { PDFDocument, StandardFonts } = require('pdf-lib');

async function make(version, lines, out) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Vorelinib drug substance — analytical procedures (3.2.S.4.2), version ${version}`);
  doc.setAuthor('Concept2Cure Therapeutics (demonstration content)');
  doc.setCreationDate(new Date('2026-10-22T00:00:00Z'));
  doc.setModificationDate(new Date('2026-10-22T00:00:00Z'));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  let y = 740;
  for (const [size, text] of lines) { page.drawText(text, { x: 56, y, size, font }); y -= size + 10; }
  fs.writeFileSync(out, await doc.save({ useObjectStreams: false }));
}
const head = (v) => [
  [16, '3.2.S.4.2 Analytical Procedures — Vorelinib (BX-512) drug substance'],
  [10, `[Demo · Biotech] Demonstration content for a sandbox walk. Version ${v}. Fictional sponsor and data.`],
  [12, 'Assay and related substances: reversed-phase HPLC with UV detection at 254 nm.'],
  [12, 'Identity: HPLC retention time and IR spectrum against the reference standard.'],
  [12, 'Water content: Karl Fischer titration (coulometric).'],
  [12, 'Residual solvents: headspace GC per ICH Q3C.'],
];
await make('1.0', head('1.0'), 'out/BX-512-3-2-S-4-2-analytical-procedures.v1.pdf');
await make('2.0', [...head('2.0'), [12, 'Revision 2.0: related-substances method gradient extended; specificity re-demonstrated.']], 'out/BX-512-3-2-S-4-2-analytical-procedures.v2.pdf');
console.log(fs.statSync('out/BX-512-3-2-S-4-2-analytical-procedures.v1.pdf').size, fs.statSync('out/BX-512-3-2-S-4-2-analytical-procedures.v2.pdf').size);
