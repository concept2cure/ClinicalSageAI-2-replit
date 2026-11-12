// GA-DEMO-14 (docs/evidence/GA-READINESS/2026-11-10/ledger.json): every seeded biotech PDF printed "?" for dashes,
// >=, <= and the minus sign, and a long subtitle ran off the page. The writer (lib.mjs makeMultiPagePdfBuffer) uses
// Helvetica with WinAnsiEncoding and turned every character outside Latin-1 into "?". WinAnsi has the dashes, the
// curly quotes, the bullet and the ellipsis at its own codes; >=, <=, the minus sign, the arrow and the Greek letters
// the prose uses have no code there and are written out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMultiPagePdfBuffer } from './lib.mjs';

/** Every string drawn on the pages (the operands of Tj), as the PDF's own bytes, unescaped. */
function drawn(buf) {
  const body = buf.toString('latin1');
  const out = [];
  for (const m of body.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)) out.push(m[1].replace(/\\([\\()])/g, '$1'));
  return out;
}
/** Where each string starts and the font size it is drawn at. */
function placed(buf) {
  return [...buf.toString('latin1').matchAll(/\/F[12] ([\d.]+) Tf (\d+) (\d+) Td \(((?:\\.|[^\\)])*)\) Tj/g)]
    .map((m) => ({ size: Number(m[1]), x: Number(m[2]), text: m[4].replace(/\\([\\()])/g, '$1') }));
}

const PROSE = 'Assay range 0.5–50 µg/mL — accuracy ≥ 95% and CV ≤ 5%; a change of −2 °C → retest; it’s the “primary” endpoint… θ and κ.';

test('no character of the prose prints as "?"', () => {
  const pdf = makeMultiPagePdfBuffer({ title: 'Validation summary — method LMN-QC-07', subtitle: PROSE, sections: [{ heading: 'Results — § 4.2', paragraphs: [PROSE] }] });
  const text = drawn(pdf).join('\n');
  assert.equal(text.includes('?'), false, `a character was replaced: ${text}`);
});

test('dashes, quotes and the ellipsis keep their own WinAnsi codes; the rest is written out', () => {
  const t = drawn(makeMultiPagePdfBuffer({ title: 'T', sections: [{ heading: 'Results — § 4.2', paragraphs: [PROSE] }] })).join('\n');
  for (const [code, name] of [['\x96', 'en dash'], ['\x97', 'em dash'], ['\x92', 'right single quote'], ['\x93', 'left double quote'], ['\x94', 'right double quote'], ['\x85', 'ellipsis']]) {
    assert.ok(t.includes(code), `${name} is drawn as WinAnsi ${code.charCodeAt(0).toString(16)}`);
  }
  for (const s of ['>= 95%', '<= 5%', '-2 \xb0C', '->', 'theta', 'kappa', '\xb5g/mL', '\xa7 4.2']) assert.ok(t.includes(s), `"${s}" is in the text`);
});

test('a long title and subtitle wrap inside the 468 pt column, and the running header is cut, not run off', () => {
  const subtitle = 'A 13-week oral repeat-dose toxicity study of LMN-201 in Sprague-Dawley rats with a 4-week recovery period, GLP, report summary for the IND';
  const title = 'LMN-201-CDI02 (RePreve) clinical protocol, version 2.0, amendment 1, with the schedule of assessments';
  const lines = placed(makeMultiPagePdfBuffer({ title, subtitle, sections: [] }));
  // Helvetica is at most about 0.6 em wide on average for this prose; a line may not need more than the column.
  for (const l of lines) assert.ok(l.text.length * l.size * 0.5 <= 468 + 1, `"${l.text}" at ${l.size} pt is wider than the column`);
  const body = lines.filter((l) => l.size !== 8).map((l) => l.text).join(' ');
  assert.equal(body.replace(/\s+/g, ' '), `${title} ${subtitle}`, 'every word of the title and subtitle is drawn, in order');
});
