/**
 * AnA's question flows and war-game auditors no longer tell clients the
 * regulatory facts an adversarially verified audit found wrong (D2, 2026-10-22).
 *
 * docs/evidence/D2-ANA-KNOWLEDGE-AUDIT/2026-10-22/confirmed-findings.json holds
 * the 322 findings that survived verification, each with the exact text the
 * client was shown. Measured at 6b63513e4 before the change, 312 of those quotes
 * were present verbatim. Examples: REMS cited to "21 CFR 314.42", a section that
 * does not exist (the authority is FD&C Act section 505-1); "follow-up within
 * 8 additional days" attributed to 21 CFR 312.32(c)(2); companion diagnostics
 * cited to 21 CFR 809.30, which governs analyte specific reagents.
 *
 * The corrections are recall. eCFR, ich.org and fda.gov are not reachable
 * from the build environment, and the evidence README says so.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const FINDINGS: Array<{ file: string; line: number; quote: string; verbatim: boolean }> = JSON.parse(
  readFileSync(path.join(ROOT, 'docs/evidence/D2-ANA-KNOWLEDGE-AUDIT/2026-10-22/confirmed-findings.json'), 'utf8'),
);
const text = new Map<string, string>();
const read = (f: string) => {
  if (!text.has(f)) text.set(f, readFileSync(path.join(ROOT, f), 'utf8'));
  return text.get(f)!;
};

describe('confirmed regulatory errors are gone from what AnA tells clients', () => {
  it('the fixture is the full verified set', () => {
    expect(FINDINGS.length).toBe(322);
  });

  it('no quoted wrong statement remains in its file', () => {
    const remaining = FINDINGS.filter((f) => f.verbatim && read(f.file).includes(f.quote)).map((f) => `${f.file}:${f.line} ${f.quote.slice(0, 90)}`);
    expect(remaining).toEqual([]);
  });

  /* Citations the audit found repeatedly wrong, so they must not come back
     anywhere in the question flows or the auditors. */
  it('the recurring miscitations appear nowhere in the question flows or auditors', () => {
    const files = [...new Set(FINDINGS.map((f) => f.file))];
    const BANNED: Array<[RegExp, string]> = [
      [/21 CFR 314\.42\b/, 'no such section; REMS authority is FD&C Act 505-1'],
      [/312\.32\(c\)\(2\)[^"'`]{0,200}8 additional days/, '312.32(c)(2) sets only the 7-day report'],
      [/809\.30[^"'`]{0,120}companion diagnostic|companion diagnostic[^"'`]{0,160}809\.30/i, '809.30 governs analyte specific reagents'],
    ];
    const hits = files.flatMap((f) => BANNED.filter(([re]) => re.test(read(f))).map(([, why]) => `${f}: ${why}`));
    expect(hits).toEqual([]);
  });
});

/*
 * Second pass, same day (docs/evidence/D2-ANA-KNOWLEDGE-AUDIT/2026-10-22-pass2/):
 * 249 candidates over 63 files (the 31 above, the CER node files, the core
 * interview helpers and pathway-cautions), each put to an adversarial
 * verifier; 232 confirmed, several of them corrections the first pass made
 * from recall. Measured at 258a84cbf before the change, 229 quotes were
 * present verbatim.
 */
const PASS2: Array<{ file: string; line: number; quote: string; verbatim: boolean }> = JSON.parse(
  readFileSync(path.join(ROOT, 'docs/evidence/D2-ANA-KNOWLEDGE-AUDIT/2026-10-22-pass2/confirmed-findings.json'), 'utf8'),
);

describe('second pass: confirmed regulatory errors are gone', () => {
  it('the fixture is the full verified set', () => {
    expect(PASS2.length).toBe(232);
  });
  it('no quoted wrong statement remains in its file', () => {
    const remaining = PASS2.filter((f) => f.verbatim && read(f.file).includes(f.quote)).map((f) => `${f.file}:${f.line} ${f.quote.slice(0, 90)}`);
    expect(remaining).toEqual([]);
  });
});
