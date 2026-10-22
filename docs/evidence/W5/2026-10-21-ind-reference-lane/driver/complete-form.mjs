// Stand-in for "the sponsor completes the remaining boxes in Acrobat": fills the
// form's still-empty text boxes with a visible STAND-IN marker so the bytes are no
// longer the platform's own render. Not a signature; not a sponsor-completed form.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(`${process.env.REPO ?? process.cwd()}/package.json`);
const { PDFDocument, PDFTextField } = require('pdf-lib');

const [, , input, output] = process.argv;
const doc = await PDFDocument.load(fs.readFileSync(input), { ignoreEncryption: false });
const form = doc.getForm();
let filled = 0;
const names = [];
for (const field of form.getFields()) {
  if (!(field instanceof PDFTextField)) continue;
  const name = field.getName();
  if ((field.getText() ?? '').trim() !== '') continue;
  if (!/date|sign|name/i.test(name)) continue;
  try { field.setText(/date/i.test(name) ? '2026-10-22' : 'STAND-IN (sandbox run, not signed)'); filled += 1; names.push(name); } catch { /* read-only or comb field */ }
  if (filled >= 3) break;
}
if (filled === 0) {
  // No suitable empty box: change the document info only, which still changes the bytes.
  doc.setSubject('Stand-in completed form for a sandbox run — not signed');
}
doc.setKeywords(['stand-in', 'sandbox', 'not-signed']);
fs.writeFileSync(output, await doc.save());
console.info(JSON.stringify({ filled, names, bytes: fs.statSync(output).size }));
