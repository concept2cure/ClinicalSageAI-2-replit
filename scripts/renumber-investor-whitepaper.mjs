#!/usr/bin/env node
/**
 * Renumber the investor white paper from document order.
 *
 * Section numbers, running heads, page numbers and the contents table are
 * derived — never hand-maintained. Insert a section with a
 * `<!-- ═══ PAGE 0 · TITLE ═══ -->` marker and run this; the `PAGE N ·` prefix
 * is what the splitter matches on, and a marker without it is silently absorbed
 * into the preceding section.
 *
 * Page 1 is the cover and page 2 the contents, so section NN sits on page NN+2.
 *
 * Cross-references in prose ("see Section 14") are NOT rewritten — they are
 * reported. Renumbering makes a stale reference resolve to a valid but wrong
 * section, which nothing else will catch.
 *
 * Usage: node scripts/renumber-investor-whitepaper.mjs [--check]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.join(ROOT, 'docs/investor/whitepaper.html');
const CHECK_ONLY = process.argv.includes('--check');

const MARKER = /<!--\s*═+\s*PAGE\s+(\d+)\s*·\s*([^═]*?)\s*═+\s*-->/g;

let html = readFileSync(HTML, 'utf8');

// ── 1. Walk the markers in document order ───────────────────────────────────
const markers = [...html.matchAll(MARKER)].map((m, i) => ({
  index: m.index,
  raw: m[0],
  label: m[2],
  page: i + 1,
}));

if (markers.length < 3) {
  console.error(`Expected at least 3 page markers, found ${markers.length}.`);
  process.exit(1);
}

// Section title lives in the `<h1 class="section-title">` of each page block.
const problems = [];
const sections = markers.map((mk, i) => {
  const body = html.slice(mk.index, markers[i + 1]?.index ?? html.length);
  const title = body.match(/<h1 class="section-title">([\s\S]*?)<\/h1>/)?.[1];
  const runningHead = body.match(/<div class="running-head"><span>([\s\S]*?)<\/span>/)?.[1];
  return {
    ...mk,
    title: title ? title.replace(/\s+/g, ' ').trim() : null,
    runningHead: runningHead ? runningHead.replace(/\s+/g, ' ').trim() : null,
    // Cover is page 1, contents page 2; content sections start numbering at 1.
    section: mk.page > 2 ? mk.page - 2 : null,
  };
});

// ── 2. Rewrite marker page numbers, running heads, and section numbers ──────
let out = '';
let cursor = 0;
const pad = n => String(n).padStart(2, '0');

for (const [i, s] of sections.entries()) {
  const end = sections[i + 1]?.index ?? html.length;
  let block = html.slice(s.index, end);

  block = block.replace(MARKER, () =>
    `<!-- ═══════════════ PAGE ${s.page} · ${s.label} ═══════════════ -->`
  );

  block = block.replace(
    /(<div class="running-head"><span>)([\s\S]*?)(<\/span><span class="rh-num">)([^<]*)(<\/span>)/,
    (_m, a, head, b, _num, c) => {
      const rewritten =
        s.section === null
          ? head
          : head.replace(/^\d+\s·\s/, `${pad(s.section)} · `);
      return `${a}${rewritten}${b}${pad(s.page)}${c}`;
    }
  );

  if (s.section !== null) {
    block = block.replace(
      /<div class="section-num">Section\s+\d+<\/div>/,
      `<div class="section-num">Section ${pad(s.section)}</div>`
    );
  }

  out += html.slice(cursor, s.index) + block;
  cursor = end;
}
out += html.slice(cursor);
html = out;

// ── 3. Rewrite the contents table from the section list ─────────────────────
const content = sections.filter(s => s.section !== null);
let tocRow = 0;
html = html.replace(
  /<li><span class="toc-n">\d+<\/span><span class="toc-t">([\s\S]*?)<\/span><span class="toc-p">\d+<\/span><\/li>/g,
  (whole, tocTitle) => {
    const s = content[tocRow++];
    if (!s) {
      problems.push(`Contents has more rows (${tocRow}) than content sections (${content.length}).`);
      return whole;
    }
    const clean = tocTitle.replace(/\s+/g, ' ').trim();
    if (s.title && clean !== s.title && !s.title.startsWith(clean)) {
      problems.push(
        `Contents row ${pad(s.section)} reads "${clean}" but the section is titled "${s.title}".`
      );
    }
    return `<li><span class="toc-n">${pad(s.section)}</span><span class="toc-t">${tocTitle}</span><span class="toc-p">${pad(s.page)}</span></li>`;
  }
);
if (tocRow !== content.length) {
  problems.push(`Contents has ${tocRow} rows for ${content.length} content sections.`);
}

// ── 4. Report cross-references for manual re-audit ──────────────────────────
const byNumber = new Map(content.map(s => [s.section, s.title]));
const refs = [...html.matchAll(/Section\s+(\d{1,2})\b/g)]
  .map(m => Number(m[1]))
  .filter(n => !byNumber.has(n));
if (refs.length) {
  problems.push(`Cross-references to non-existent sections: ${[...new Set(refs)].join(', ')}`);
}

// ── 5. Emit ─────────────────────────────────────────────────────────────────
const original = readFileSync(HTML, 'utf8');
const changed = html !== original;

console.log(`${sections.length} pages · ${content.length} content sections`);
for (const p of problems) console.log(`  ! ${p}`);
console.log(
  `Cross-references in prose: ${[...html.matchAll(/Section\s+\d{1,2}\b/g)].length} — re-audit each against the titles above.`
);

if (CHECK_ONLY) {
  if (changed) console.log('Numbering is STALE — run without --check to rewrite.');
  process.exit(changed || problems.length ? 1 : 0);
}

if (changed) {
  writeFileSync(HTML, html);
  console.log('Renumbered.');
} else {
  console.log('Already consistent.');
}
process.exit(problems.length ? 1 : 0);
