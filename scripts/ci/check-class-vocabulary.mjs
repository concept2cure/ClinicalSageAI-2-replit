#!/usr/bin/env node
/**
 * One vocabulary per class, enforced.
 *
 * `shared/regulatory/device-class.ts` holds the three governed class
 * vocabularies — the US 21 CFR 860 classes, the MDR's seven DECLARED classes
 * and the IVDR's four — and says why each has the shape it has. A read-only
 * sweep before the classification question found the US class enumerated at
 * least fifteen times across the repository (three of them with a different
 * value set), the MDR class in two irreconcilable shapes, and the IVDR class
 * enumerated eight times and asked by no question anywhere. Two interviews had
 * already drifted out of the fact reader's vocabulary without a test noticing.
 *
 * Promoting one module did not stop the next session writing a ninth list, so
 * this is the gate. It refuses a literal enumeration of a governed vocabulary
 * where the surrounding name says which vocabulary it is — `ivdr_class`,
 * `deviceClass`, `riskClass`, `EUMDRClass`. It does NOT refuse 'A' | 'B' | 'C'
 * | 'D' in general: those are also cleanroom grades (GMP Annex 1) and FDA
 * meeting types, and a gate that cannot tell them apart would be a gate nobody
 * can keep.
 *
 * Genuine exceptions go in scripts/ci/class-vocabulary-baseline.json WITH A
 * WRITTEN REASON; an entry without one is the thing this file exists to
 * prevent (CLAUDE.md RULE 1's baseline discipline, applied here).
 *
 * Exercise the failure branch with:
 *   node scripts/ci/check-class-vocabulary.mjs --selftest
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const BASELINE = 'scripts/ci/class-vocabulary-baseline.json';

/** The modules that may hold a vocabulary, because holding it is their job. */
const CANONICAL = [
  'shared/regulatory/device-class.ts',
  'shared/constants/domain/device-classification.ts',
  'server/services/market-specs/device-classification.ts',
  'scripts/ci/check-class-vocabulary.mjs',
];

/**
 * The vocabularies, as a literal enumeration is written: an array of quoted
 * values or a union of them, in any order-preserving spelling with optional
 * whitespace.
 */
const VOCABULARIES = [
  { name: 'IVDR_CLASSES', values: ['A', 'B', 'C', 'D'] },
  { name: 'MDR_DECLARED_CLASSES', values: ['I', 'Is', 'Im', 'Ir', 'IIa', 'IIb', 'III'] },
  { name: 'MDR_RULE_CLASSES', values: ['I', 'IIa', 'IIb', 'III'] },
  { name: 'DEVICE_CLASSES', values: ['I', 'II', 'III'] },
];

/** The names that say WHICH vocabulary a literal list is, so a grade is not a class. */
const NAMES = /ivdr|mdr|device_?class|risk_?class|eu_?class/i;

/**
 * The CODE of a line: '' for a comment line, and a trailing `// …` removed.
 * `(?<!:)` leaves a URL's `//` alone, so a line that cites a regulation by
 * link is still scanned for a real literal.
 */
const codeOf = line => {
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return '';
  return line.replace(/(?<!:)\/\/.*$/, '');
};

const literalPattern = values => {
  const q = values.map(v => `['"\`]${v}['"\`]`).join('\\s*(?:,|\\|)\\s*');
  return new RegExp(q);
};

const FILES = () =>
  execFileSync('git', ['ls-files', '*.ts', '*.tsx', '*.mjs'], { encoding: 'utf8', cwd: ROOT })
    .split('\n')
    .filter(Boolean)
    .filter(f => !f.includes('__tests__') && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
    .filter(f => !CANONICAL.includes(f));

function findings(files, read = f => readFileSync(path.join(ROOT, f), 'utf8')) {
  const out = [];
  for (const file of files) {
    const lines = read(file).split('\n');
    lines.forEach((line, i) => {
      /* A COMMENT restating the values is documentation, not a second
         vocabulary — "// 'I', 'II', 'III' (for devices)" beside a column tells
         a reader what the column holds and nothing reads it as a list. Only
         code is refused. */
      const code = codeOf(line);
      if (!code || !NAMES.test(code)) return;
      for (const vocab of VOCABULARIES) {
        if (!literalPattern(vocab.values).test(code)) continue;
        out.push({ file, line: i + 1, vocabulary: vocab.name, text: line.trim().slice(0, 160) });
        break;
      }
    });
  }
  return out;
}

function baseline() {
  if (!existsSync(path.join(ROOT, BASELINE))) return [];
  const raw = JSON.parse(readFileSync(path.join(ROOT, BASELINE), 'utf8'));
  const entries = Array.isArray(raw) ? raw : (raw.exceptions ?? []);
  const bad = entries.filter(e => !e.reason || String(e.reason).trim().length < 30);
  if (bad.length) {
    console.error('[ci:class-vocabulary] FAIL — baseline entries without a written reason:');
    for (const e of bad) console.error(`  ${e.file}:${e.line ?? '?'}`);
    process.exit(1);
  }
  return entries;
}

function run() {
  const allowed = new Set(baseline().map(e => `${e.file}:${e.line ?? ''}`));
  const allowedFiles = new Set(baseline().filter(e => !e.line).map(e => e.file));
  const hits = findings(FILES()).filter(
    h => !allowed.has(`${h.file}:${h.line}`) && !allowedFiles.has(h.file),
  );
  if (hits.length === 0) {
    console.log(`[ci:class-vocabulary] OK — ${FILES().length} file(s) scanned, no restated class vocabulary.`);
    return;
  }
  console.error('[ci:class-vocabulary] FAIL — a governed class vocabulary restated:');
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line}  ${h.vocabulary}\n      ${h.text}`);
  }
  console.error(
    '\n  Import it from shared/regulatory/device-class.ts instead. A JSON-schema enum\n' +
      '  takes [...IVDR_CLASSES]; a type alias takes the exported type. A genuine\n' +
      `  exception goes in ${BASELINE} WITH A REASON.`,
  );
  process.exit(1);
}

/** The failure branch, on the real case: a ninth IVDR list in a new file. */
function selftest() {
  const fake = {
    'server/services/pretend/ivd-tool.ts': "  ivdr_class: { type: 'string', enum: ['A', 'B', 'C', 'D'] },",
    'server/services/pretend/cleanroom.ts': "  grade: 'A' | 'B' | 'C' | 'D';",
    'server/services/pretend/meeting.ts': "export type MeetingType = 'A' | 'B' | 'C' | 'D';",
    'server/services/pretend/mdr.ts': "  euMdrClass: 'I' | 'Is' | 'Im' | 'Ir' | 'IIa' | 'IIb' | 'III';",
    'server/services/pretend/column.ts': "  deviceClass: text('device_class'), // 'I', 'II', 'III' (for devices)",
  };
  const hits = findings(Object.keys(fake), f => fake[f]);
  const seen = hits.map(h => `${h.file}:${h.vocabulary}`).sort();
  const expected = [
    'server/services/pretend/ivd-tool.ts:IVDR_CLASSES',
    'server/services/pretend/mdr.ts:MDR_DECLARED_CLASSES',
  ];
  const ok = JSON.stringify(seen) === JSON.stringify(expected);
  console.log(ok ? '[ci:class-vocabulary:selftest] OK — refuses the two class lists and' : '[ci:class-vocabulary:selftest] FAIL');
  console.log(ok ? '  leaves the cleanroom grade and the FDA meeting type alone.' : `  saw ${JSON.stringify(seen)}`);
  if (!ok) process.exit(1);
}

if (process.argv.includes('--selftest')) selftest();
else run();
