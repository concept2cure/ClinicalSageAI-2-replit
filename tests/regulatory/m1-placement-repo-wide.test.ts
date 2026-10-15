/**
 * No file anywhere states an FDA Module 1 placement the record contradicts.
 *
 * ── Why a scan and not an inventory ──────────────────────────────────────────
 * `ctd-registry-consistency.test.ts` holds the copies someone listed by hand, and its own comment
 * promised an inventory ratchet (`scripts/ci/check-ctd-registry-inventory.mjs`) that would refuse a
 * copy nobody declared. That design does not survive contact with this repository: **113 files**
 * carry five or more distinct CTD section-code literals. A baseline with 113 entries is a snapshot,
 * not a gate, and the next session adds the 114th.
 *
 * So this holds the rule instead of the roster. Every placement defect found on 2026-10-12 had one
 * shape — **a Module 1 section code written beside a title naming a Module 1 document** — and
 * `violationsFor` already decides that from a `{code, title}` pair. This extracts those pairs from
 * source text across the whole scanned tree and runs the same contract over them. A new copy in a
 * new file is caught on the day it is written, with nothing to declare and no inventory to keep
 * current.
 *
 * ── What it reads ────────────────────────────────────────────────────────────
 * A Module 1 code under a code-valued key (`code`, `sectionCode`, `ctdSection`, `section`,
 * `number`, …) and the nearest title under a title-valued key (`title`, `sectionTitle`, `heading`,
 * `label`, …) within 300 characters. It is a text scan, not a parser, so it is deliberately
 * conservative: a bare `'1'` is not read as a code (a USPI's "1 Indications and Usage" is not a
 * CTD heading), and a code with no nearby title yields no pair.
 *
 * ── The baseline ─────────────────────────────────────────────────────────────
 * A pair that is NOT an FDA eCTD Module 1 placement — a 510(k)/eSTAR attachment number, an EU or
 * JP regional heading, a device technical-file index — goes in `NOT_FDA_ECTD` **with a written
 * reason**, which is the idiom CLAUDE.md Rule 1 already sets for
 * `migration-drop-safety-baseline.json`: "an entry without one is the thing that file exists to
 * prevent." A pair that IS an FDA placement and disagrees with the record is a defect, and is
 * fixed rather than baselined.
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import { violationsFor, type TreeNode } from './ctd-contract';

const ROOT = path.resolve(__dirname, '../..');
const SCAN = ['server', 'shared', 'client/src', 'services', 'scripts'];

/** A dotted Module 1 code under a key that names a section. A bare `'1'` is excluded: see header. */
const CODE_KEY =
  /\b(?:code|sectionCode|ctdSection|section|number|ctd_section|sectionId)\s*:\s*['"`](m?1(?:\.\d+)+)['"`]/g;
const TITLE_KEY =
  /\b(?:title|sectionTitle|heading|label|name|displayName|sectionName)\s*:\s*(['"`])((?:\\.|(?!\1).){2,90})\1/g;
const WINDOW = 300;

/*
 * Which regional Module 1 a pair belongs to, from the nearest preceding marker.
 *
 * Module 1 is THE regional module: 1.1 is Forms at FDA, a Comprehensive Table of Contents in the
 * EU, and a Cover Letter at PMDA. A `{code, title}` pair carries no region, so a scan that applied
 * the FDA contract to every pair would call the EU tree in `regional-module1.ts` wrong — it did, on
 * its first run, for thirteen correct EU and JP headings.
 *
 * This is a text heuristic, not a parser: the nearest marker before the code wins, and a file with
 * no marker at all is read as US, because this platform's default backbone is the FDA eCTD and the
 * files that mean something else say so (`FDA:`/`EMA:`/`PMDA:` keys, `EU_TREE`, an eSTAR or IVDR
 * mention). It is held to the real cases by the tests below, and `NOT_FDA_ECTD` carries the pairs
 * it still cannot place, each with a written reason.
 */
/** `M1_EU` and `M1_FDA` are how this repository names its regional blocks, and `\b` does not match
 *  inside them because `_` is a word character — the first version of this heuristic read every one
 *  of them as unmarked. The boundary therefore treats `_` as a separator. */
const EDGE = '(?<![A-Za-z0-9])';
const EDGE_END = '(?![A-Za-z0-9])';
const marker = (alts: string, region: 'US' | 'OTHER', flags = ''): readonly [RegExp, 'US' | 'OTHER'] => [
  new RegExp(`${EDGE}(?:${alts})${EDGE_END}`, `g${flags}`),
  region,
];
const REGION_MARKERS: ReadonlyArray<readonly [RegExp, 'US' | 'OTHER']> = [
  marker('US|USA|FDA|USFDA', 'US'),
  marker('EU|EMA|EEA|CHMP|NtA|IVDR|MDR|CTIS|CTR|SmPC|SPC', 'OTHER'),
  marker('JP|PMDA|Japan|Japanese|CTD-J', 'OTHER'),
  marker('NMPA|China|Chinese|TGA|Swissmedic|MHRA|Health ?Canada|canadaCta|HPFB|CTA', 'OTHER'),
  marker('510k|510\\\\(k\\\\)|eSTAR|De ?Novo|PMA|technical[-_ ]?file|udi', 'OTHER', 'i'),
];

/** A title that names its own backbone settles the region, whatever precedes it in the file. */
const TITLE_SAYS_OTHER =
  /510\(k\)|\beSTAR\b|\bDe Novo\b|\bPMA\b|\bSmPC\b|\bSPC\b|package leaflet|\bEU\b|\bEMA\b|Japanese|CTD-J|\bCTIS\b|\bIVDR\b|\bMDR\b/i;
const BACK = 4000;

/** The region whose Module 1 this pair states. 'US' when nothing says otherwise. */
export function regionOf(text: string, at: number): 'US' | 'OTHER' {
  const before = text.slice(Math.max(0, at - BACK), at);
  let bestAt = -1;
  let best: 'US' | 'OTHER' = 'US';
  for (const [re, region] of REGION_MARKERS) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    for (const m of before.matchAll(g)) if (m.index! > bestAt) { bestAt = m.index!; best = region; }
  }
  return bestAt === -1 ? 'US' : best;
}

export interface Pair extends TreeNode {
  file: string;
  line: number;
}

function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|mjs|cjs|js)$/.test(name) && !/\.(test|spec)\.[tj]sx?$/.test(name)) out.push(p);
    }
  };
  SCAN.forEach((d) => walk(path.join(ROOT, d)));
  return out;
}

/**
 * The nearest title inside the same object literal as the code at `at`, or null.
 *
 * The braces are found by counting, bounded by WINDOW so a malformed or very large literal cannot
 * walk the whole file. A row that carries no title of its own yields null rather than borrowing its
 * neighbour's.
 */
export function objectTitle(text: string, at: number): string | null {
  let open = -1;
  let depth = 0;
  for (let i = at; i >= Math.max(0, at - WINDOW); i--) {
    const c = text[i];
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) { open = i; break; }
      depth--;
    }
  }
  if (open === -1) return null;
  let close = -1;
  depth = 0;
  for (let i = open + 1; i < Math.min(text.length, open + 2 * WINDOW); i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') {
      if (depth === 0) { close = i; break; }
      depth--;
    }
  }
  if (close === -1) return null;
  const body = text.slice(open, close);
  let title: string | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const tm of body.matchAll(TITLE_KEY)) {
    const d = Math.abs(open + tm.index! - at);
    if (d < best) { best = d; title = tm[2]; }
  }
  return title;
}

function pairsIn(file: string, text: string): Pair[] {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const out: Pair[] = [];
  for (const m of text.matchAll(CODE_KEY)) {
    /* The title from the SAME object literal as the code, nearest first.

       Two earlier versions got this wrong in opposite directions, and each was caught by a real
       file. A plain nearest-title window paired `code: '1.0'` in filing-placement.ts with the
       heading of the row ABOVE it. Preferring the title after the code then dropped
       templateCatalog.ts, whose rows write `title` before `sectionCode`, so the code paired with
       the NEXT row's title and the defect disappeared — a false negative, which is worse. The
       object's own braces are the boundary that is actually meant. */
    const title = objectTitle(text, m.index!);
    if (title && !TITLE_SAYS_OTHER.test(title) && regionOf(text, m.index!) === 'US') {
      out.push({ file: rel, line: text.slice(0, m.index!).split('\n').length, code: m[1], title });
    }
  }
  return out;
}

const PAIRS: Pair[] = sources().flatMap((f) => pairsIn(f, readFileSync(f, 'utf8')));

/**
 * Pairs the region heuristic cannot place, each with a written reason.
 *
 * Keyed by file + code + title, not by line, so an edit above them does not invalidate the entry.
 * This is the idiom CLAUDE.md Rule 1 sets for `migration-drop-safety-baseline.json`: "Genuine
 * exceptions go in … **with a written reason**; an entry without one is the thing that file exists
 * to prevent." Both halves are enforced below — an entry with an empty reason fails, and so does a
 * STALE entry, so a file that is fixed or deleted cannot leave a permanent exemption behind.
 *
 * A pair that IS an FDA placement and disagrees with the record does not belong here. It is a
 * defect, and the ten files found on 2026-10-13 were fixed rather than listed.
 */
const NOT_FDA_ECTD: ReadonlyArray<{ file: string; code: string; title: string; why: string }> = [
  {
    file: 'server/services/intelligence/template-seeds.ts',
    code: '1.0',
    title: 'Cover letter',
    why:
      "The EU block of the template seeds (templateCode ema_maa_centralised, submissionType 'MAA', " +
      "sourceReference 'EMA Notice to Applicants Volume 2B'). 1.0 is the EU regional cover-letter " +
      'heading and the row is correct. The heuristic reads it as US because the nearest marker ' +
      "before it is the word FDA inside the block's own note (“Centralised procedure uses EU " +
      'forms, not FDA 356h”), and a text scan cannot read that as a negation.',
  },
];

const exempt = (p: Pair) =>
  NOT_FDA_ECTD.some((e) => e.file === p.file && e.code === p.code && e.title === p.title);


describe('the scan reads what it claims to read', () => {
  it('finds the record itself, and the copies the registry already declares', () => {
    expect(PAIRS.length).toBeGreaterThan(100);
    const files = new Set(PAIRS.map((p) => p.file));
    expect(files).toContain('shared/regulatory/regional-module1.ts');
    expect(files.size).toBeGreaterThan(20);
  });

  it('does not read a bare "1" as a CTD code', () => {
    // A USPI's "1 Indications and Usage" and a protocol's "1 Introduction" are not CTD headings.
    expect(pairsIn('/x/a.ts', "{ code: '1', title: 'Indications and Usage' }")).toEqual([]);
    expect(pairsIn('/x/a.ts', "{ code: '1.1', title: 'Cover Letter' }")).toHaveLength(1);
  });

  it('pairs a code with the nearest title, not the first one in the file', () => {
    const src = "{ code: '1.1', title: 'Forms' },\n{ code: '1.2', title: 'Cover Letter' },";
    expect(pairsIn('/x/a.ts', src).map((p) => [p.code, p.title])).toEqual([
      ['1.1', 'Forms'],
      ['1.2', 'Cover Letter'],
    ]);
  });
});

describe('every FDA Module 1 placement in the repository agrees with the record', () => {
  it('names each file, line, code and title that does not', () => {
    const out: string[] = [];
    for (const p of PAIRS) {
      if (exempt(p)) continue;
      for (const v of violationsFor([p])) out.push(`${p.file}:${p.line} — ${v}`);
    }
    expect(out, `\n${out.join('\n')}\n`).toEqual([]);
  });
});

describe('the region heuristic places the real cases', () => {
  const at = (src: string, needle: string) => regionOf(src, src.indexOf(needle));

  it('an agency-keyed table: the FDA block is US, the EMA and PMDA blocks are not', () => {
    // The real shape of REQUIRED_SECTIONS in ctd-ingestion-service.ts.
    const src = [
      'const REQUIRED_SECTIONS = {',
      "  FDA: [{ section: '1.2', title: 'Cover Letter' }],",
      "  EMA: [{ section: '1.0', title: 'Cover Letter' }],",
      "  PMDA: [{ section: '1.1', title: 'Cover Letter (Japanese)' }],",
      '};',
    ].join('\n');
    expect(at(src, "'1.2'")).toBe('US');
    expect(at(src, "'1.0'")).toBe('OTHER');
    expect(at(src, "'1.1'")).toBe('OTHER');
  });

  it('the record’s own three trees', () => {
    const src = [
      'const US_TREE = [',
      "  { number: '1.1', title: 'Forms' },",
      '];',
      '// EU — EU Module 1 eCTD Specification',
      'const EU_TREE = [',
      "  { number: '1.0', title: 'Cover Letter' },",
      '];',
      'const JP_TREE = [',
      "  { number: '1.6', title: 'Status of Use in Foreign Countries' },",
      '];',
    ].join('\n');
    expect(at(src, "'1.1'")).toBe('US');
    expect(at(src, "'1.0'")).toBe('OTHER');
    expect(at(src, "'1.6'")).toBe('OTHER');
  });

  it('a 510(k) / eSTAR attachment number is not an FDA eCTD Module 1 code', () => {
    const src = "// 510(k) eSTAR content package\n{ sectionCode: '1.1', title: '510(k) Cover Letter' }";
    expect(at(src, "'1.1'")).toBe('OTHER');
  });

  it('a file with no regional marker at all is read as US', () => {
    expect(at("{ ctdSection: '1.3.3', sectionTitle: \"Investigator's Brochure\" }", "'1.3.3'")).toBe('US');
  });

  it('the nearest marker wins, so a US block after an EU block is still US', () => {
    const src = "// EMA regional\n{ section: '1.0', title: 'Cover Letter' }\n// FDA regional\n{ section: '1.2', title: 'Cover Letter' }";
    expect(at(src, "'1.0'")).toBe('OTHER');
    expect(at(src, "'1.2'")).toBe('US');
  });
});

describe('a code pairs with its own object’s title, which three real files decided', () => {
  const pairs = (src: string) => pairsIn('/x/a.ts', src).map((p) => [p.code, p.title]);

  it('templateCatalog.ts: a row that writes its title BEFORE its code still pairs with it', () => {
    // Preferring the title after the code dropped this file entirely — a false negative.
    const src =
      "{ id: 'cover_letter', title: 'Cover Letter', description: 'Regulatory submission cover letter', sectionCode: '1.1' },\n" +
      "{ id: 'qos', title: 'Quality Overall Summary', sectionCode: '2.3' },";
    expect(pairs(src)).toEqual([['1.1', 'Cover Letter']]);
  });

  it('filing-placement.ts: a row does not borrow the heading of the row above it', () => {
    const src =
      "{ code: '1.11.3', module: 'M1', heading: '1.11.3 Information amendment — clinical' },\n" +
      "{ code: '1.0', module: 'M1', heading: 'EU Module 1.0 — cover letter with the response document' },";
    /* 1.11.3 pairs with its own heading, which is right. The point is the row BELOW it: the window
       version paired `code: '1.0'` with the 1.11.3 heading on the line before, and the contract
       then reported "1.0 \"1.11.3 Information amendment\" is not an FDA Module 1 heading" — a
       finding about a row that does not exist. 1.0's own heading says EU, so it is dropped. */
    expect(pairs(src)).toEqual([['1.11.3', '1.11.3 Information amendment — clinical']]);
  });

  it('regional-module1-requirements.ts: an id-bearing `code` key is not the section code', () => {
    // `section` carries the eCTD code here, `code` carries an id, and `label` is the title. Window
    // pairing read m1.1 against the NEXT row's label and reported six placements that are correct.
    const src =
      "{ code: 'us_356h', label: 'FDA Form 356h (Application to Market)', section: 'm1.1' },\n" +
      "{ code: 'us_cover_letter', label: 'Cover letter', section: 'm1.2' },";
    expect(pairs(src)).toEqual([
      ['m1.1', 'FDA Form 356h (Application to Market)'],
      ['m1.2', 'Cover letter'],
    ]);
    expect(violationsFor(pairsIn('/x/a.ts', src))).toEqual([]);
  });

  it('a row with no title of its own yields no pair, rather than borrowing one', () => {
    expect(pairs("{ ordering: 3, sectionCode: '1.1', required: true }")).toEqual([]);
  });
});

describe('the baseline cannot become a parking space', () => {
  it('every entry carries a written reason', () => {
    for (const e of NOT_FDA_ECTD) {
      expect(e.why.trim().length, `${e.file} ${e.code} "${e.title}"`).toBeGreaterThan(40);
    }
  });

  it('no entry is stale — each still matches a pair the scan finds', () => {
    const stale = NOT_FDA_ECTD.filter(
      (e) => !PAIRS.some((p) => p.file === e.file && p.code === e.code && p.title === e.title),
    ).map((e) => `${e.file} ${e.code} "${e.title}"`);
    expect(stale, `\n${stale.join('\n')}\n`).toEqual([]);
  });

  it('no entry exempts a pair the contract is happy with anyway', () => {
    // An entry that is not hiding a violation is noise, and noise is how a baseline stops being read.
    const pointless = NOT_FDA_ECTD.filter((e) =>
      PAIRS.filter((p) => p.file === e.file && p.code === e.code && p.title === e.title).every(
        (p) => violationsFor([p]).length === 0,
      ),
    ).map((e) => `${e.file} ${e.code} "${e.title}"`);
    expect(pointless, `\n${pointless.join('\n')}\n`).toEqual([]);
  });
});
