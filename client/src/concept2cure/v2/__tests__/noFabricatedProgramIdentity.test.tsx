// @vitest-environment jsdom
/**
 * No surface names a programme, product or person the tenant does not have.
 *
 * ── The defect class ─────────────────────────────────────────────────────────
 * Seventeen sites across the v2 surfaces carried invented identity as string
 * literals, rendered under the tenant's own live data:
 *
 *   RegChange / MarketAccess / HaqManager / AgencyMeetings
 *     `ask('Scan regulatory changes affecting the BX-204 portfolio…')` and four
 *     more like it. BX-204 is a demo fixture, so every real customer pressing
 *     those buttons asked the assistant about a product they do not own — and
 *     got a confident answer about it.
 *
 *   AgencyMeetings — the required "Program" select offered five invented
 *     programmes (BX-204 ×3, AltexaTab, Aurora CGM), so every meeting a
 *     customer persisted was filed against a fictional programme.
 *
 *   DocJourney — the document masthead read "Concept2Cure Biosciences, Inc." /
 *     "BX-204 (rezatinib) · BLA 761xyz" above the tenant's REAL content, which
 *     is what made it credible.
 *
 *   ProtocolGov — an empty audit panel rendered two invented 21 CFR Part 11
 *     entries: a person who does not exist, audit ids that trace to nothing,
 *     and truncated sha256 hashes.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * A source-level guard, deliberately: these are literals, and a literal is best
 * caught where it is written. Anything that re-introduces one fails here with
 * the file and the string named.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SURFACES = join(__dirname, '..', 'surfaces');

/** Match executable code, not the prose about it — every fix here left a
 *  comment explaining what the literal used to be, and those must not trip it. */
function executableOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Identities invented for the design mockups, which no tenant has. */
const FIXTURE_IDENTITY: Array<[string, RegExp]> = [
  ['BX-204 / BX204 (demo programme)', /BX-?204/],
  ['rezatinib (demo molecule)', /rezatinib/i],
  ['BLA 761xyz (demo application number)', /761xyz/],
  ['AltexaTab (demo programme)', /AltexaTab/i],
  ['Aurora CGM (demo programme)', /Aurora CGM/i],
  ['CARC-701 (demo study)', /CARC-701/],
  ['Libre 3 (named competitor in invented advice)', /Libre 3/],
  ['Concept2Cure Biosciences, Inc. (sponsor printed on tenant documents)', /Concept2Cure Biosciences/],
  ['AUD-77xx (invented Part 11 audit ids)', /AUD-77\d\d/],
];

/** A `placeholder="e.g. BX-204"` is an example in an EMPTY input — it never
 *  reaches the record and never claims to describe the tenant. Rendered text,
 *  select options and assistant prompts do.
 *
 *  Handles the three forms this codebase uses, including a JSX expression
 *  placeholder whose template literal interpolates (`placeholder={`e.g. ${…}`}`)
 *  — a naive quote-to-quote match stops at the first backtick and leaves the
 *  example behind. */
function withoutPlaceholderExamples(source: string): string {
  let out = source.replace(/placeholder:\s*[`'"][^`'"]*[`'"]/g, '');
  out = out.replace(/placeholder\s*=\s*[`'"][^`'"]*[`'"]/g, '');
  // placeholder={ … } — scan for the matching brace so interpolation is covered.
  for (;;) {
    const at = out.search(/placeholder\s*=\s*\{/);
    if (at < 0) break;
    let i = out.indexOf('{', at);
    let depth = 0;
    let end = -1;
    for (; i < out.length; i++) {
      if (out[i] === '{') depth++;
      else if (out[i] === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end < 0) break;
    out = out.slice(0, at) + out.slice(end + 1);
  }
  return out;
}

const files = readdirSync(SURFACES).filter((f) => f.endsWith('.tsx'));

describe('v2 surfaces carry no fabricated programme identity', () => {
  it('finds the surface directory (guards against this test silently covering nothing)', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it.each(FIXTURE_IDENTITY)('no surface renders %s', (_label, pattern) => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = withoutPlaceholderExamples(executableOnly(readFileSync(join(SURFACES, f), 'utf8')));
      if (pattern.test(src)) {
        const line = src.split('\n').find((l) => pattern.test(l))?.trim().slice(0, 120);
        offenders.push(`${f}: ${line}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('the audit panel fails closed', () => {
  it('renders no entries rather than inventing a Part 11 history', () => {
    const src = executableOnly(readFileSync(join(SURFACES, 'ProtocolGov.tsx'), 'utf8'));
    const fn = src.slice(src.indexOf('export function AuditTrail'));
    // The `entries?.length ? entries : [ …invented… ]` fallback is gone.
    expect(fn).not.toMatch(/entries\s*&&\s*entries\.length\s*\?/);
    expect(fn).toMatch(/entries \?\? \[\]/);
    expect(fn).toMatch(/No audit entries have been recorded/);
  });
});

describe('the programme select reads the org’s own portfolio', () => {
  it('AgencyMeetings builds its Program options from a live read, not a literal list', () => {
    const src = executableOnly(readFileSync(join(SURFACES, 'AgencyMeetings.tsx'), 'utf8'));
    expect(src).toMatch(/useLiveRows<AmProgramOption>\('\/api\/c2c\/projects'\)/);
    expect(src).toMatch(/options: programOptions/);
    // And it says so when there are none, rather than falling back to a list.
    expect(src).toMatch(/No programmes are recorded for your organization yet/);
  });
});
