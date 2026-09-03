/**
 * Self-test for the component class-coverage gate.
 *
 * The gate's verdict is only as good as its class READER, and the reader is a
 * hand-written scanner over JSX rather than a parser. Every case below is a
 * shape taken from real components in this repo, several of them shapes that an
 * earlier version of the reader got wrong:
 *
 *   • `docs-fw-${id}` was reported as a class `.docs-fw-` that nothing could
 *     ever define — a fabricated finding.
 *   • `docs-panel${cond ? ' docs-panel-compact' : ''}` had `docs-panel` dropped
 *     as if it were the same kind of fragment. It is not: the interpolation only
 *     ever prepends a space. That miss was found by deleting the DocumentsPanel
 *     stylesheet and watching the gate name nineteen of its twenty classes.
 *   • `k.delta.startsWith('-')` was read as a class named `-`.
 *   • `row[0] === 'Overall' ? …` was read as a class named `Overall`.
 *
 * These run against synthetic sources only. Nothing here reads dist/, so the
 * suite cannot go red because a checkout has no build — that conflation is what
 * makes a test suite untrustworthy the first time it is inconvenient.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  findLiteralClasses,
  definedClasses,
  stripJsComments,
} from '../check-component-class-coverage.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, '..', 'check-component-class-coverage.mjs');
const BASELINE = path.join(HERE, '..', 'component-class-coverage-baseline.json');

const classes = (src) => findLiteralClasses(src).map((f) => f.cls).sort();

test('reads a plain className string', () => {
  assert.deepEqual(classes('<div className="docs-panel docs-row" />'), ['docs-panel', 'docs-row']);
});

test('reads a braced string and a class-joiner call', () => {
  assert.deepEqual(classes("<div className={'docs-row'} />"), ['docs-row']);
  assert.deepEqual(classes('<div className={cn("docs-row", open && "is-open")} />'), ['docs-row', 'is-open']);
});

test('drops the fragment that abuts an interpolation', () => {
  assert.deepEqual(
    classes('<span className={`docs-framework docs-fw-${d.framework ?? ""}`} />'),
    ['docs-framework'],
  );
});

test('keeps a whole class when the interpolation can only prepend a space', () => {
  assert.deepEqual(
    classes('<div className={`docs-panel${density === "compact" ? " docs-panel-compact" : ""}`} />'),
    ['docs-panel', 'docs-panel-compact'],
  );
});

test('keeps a whole class when the interpolation can only append a space', () => {
  assert.deepEqual(
    classes('<div className={`${open ? "is-open " : ""}docs-row`} />'),
    ['docs-row', 'is-open'],
  );
});

test("drops a literal INSIDE an interpolation that the text before it glues to", () => {
  // PathwayPanes renders `dd-att-ico kind-${f.kind || 'file'}`. The element's
  // class is `kind-file`; nothing in the product ever renders `file`. The
  // reader used to report `file` because adjacency only ran inward — the chunk
  // learned whether the interpolation could extend it, and the interpolation
  // never learned whether the chunk extended IT.
  assert.deepEqual(
    classes("<span className={`dd-att-ico kind-${f.kind || 'file'}`} />"),
    ['dd-att-ico'],
  );
  // Every arm of a ternary sits at the same position, so both are glued.
  assert.deepEqual(
    classes("<span className={`tone-${ok ? 'good' : 'bad'} keep-me`} />"),
    ['keep-me'],
  );
  // The mirror: text AFTER the interpolation glues to it too.
  assert.deepEqual(
    classes("<span className={`${prefix || 'lead'}-tail spaced`} />"),
    ['spaced'],
  );
  // And the space-prefixed modifier is still whole — the fix must not
  // re-break the case the previous fix existed for.
  assert.deepEqual(
    classes("<div className={`docs-panel${compact ? ' docs-panel-compact' : ''}`} />"),
    ['docs-panel', 'docs-panel-compact'],
  );
});

test('does not read call arguments or comparison operands as classes', () => {
  assert.ok(!classes('<div className={`anl-delta ${k.delta.startsWith("-") ? "down" : "up"}`} />').includes('-'));
  assert.deepEqual(classes('<tr className={row[0] === "Overall" ? "is-overall" : ""} />'), ['is-overall']);
});

test('does not read a class named only in a comment', () => {
  assert.deepEqual(classes('// .docs-rail matched nothing in any bundle\nconst x = 1;'), []);
  assert.deepEqual(classes('/* every one of its classes — .docs-row, .docs-rail — matched nothing */'), []);
});

test('a // inside a string does not swallow the rest of the line', () => {
  assert.equal(stripJsComments('const u = "https://x"; // gone').trim(), 'const u = "https://x";');
  assert.deepEqual(classes('const u = "https://x.example"; const el = <i className="docs-open" />;'), ['docs-open']);
});

test('reports the line the class is rendered on', () => {
  const [hit] = findLiteralClasses('const a = 1;\nconst b = 2;\n<div className="docs-rail" />');
  assert.equal(hit.line, 3);
});

test('definedClasses unwraps the escapes Tailwind emits', () => {
  const set = definedClasses([{ css: '.docs-panel{}.md\\:flex{}.w-1\\/2{}' }]);
  assert.ok(set.has('docs-panel'));
  assert.ok(set.has('md:flex'), 'an escaped variant separator must resolve to the authored name');
  assert.ok(set.has('w-1/2'));
});

test('definedClasses counts a class named anywhere in a selector', () => {
  // `.mdx-shell .docs-row[data-status="ready"] .docs-rail` covers all three.
  const set = definedClasses([{ css: '.mdx-shell .docs-row[data-status="ready"] .docs-rail{width:4px}' }]);
  for (const c of ['mdx-shell', 'docs-row', 'docs-rail']) assert.ok(set.has(c), c);
});

test('--self-test passes with no build present', () => {
  const r = spawnSync(process.execPath, [GATE, '--self-test'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /self-test OK/);
});

test('the baseline is sorted, unique, and agrees with its own counts', () => {
  const b = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  assert.deepEqual(b.entries, [...b.entries].sort(), 'entries must be sorted so a diff is readable');
  assert.equal(new Set(b.entries).size, b.entries.length, 'no duplicate entries');
  assert.equal(b.entryCount, b.entries.length);
  assert.equal(b.classCount, new Set(b.entries.map((e) => e.split('::')[1])).size);
  for (const e of b.entries) {
    assert.match(e, /^client\/src\/.+::[-\w]+$/, `baseline key must be file::class — got ${e}`);
  }
});

test('the baseline does not carry DocumentsPanel — L100 is closed, not baselined', () => {
  const b = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const docs = b.entries.filter((e) => e.includes('DocumentsPanel.tsx'));
  assert.deepEqual(docs, [], 'a fixed component must not be sitting in the tolerated set');
});
