/**
 * The coverage report is the surface a product owner runs to answer "can this
 * platform take every filing type end to end". Its closing line is the answer.
 *
 * It printed `✅ Every startable filing type is finishable.` over an EU CTA.
 *
 * Two omissions in the script produced that. The tier line renders four of the
 * five tiers — `portal_only` is missing, so the printed counts do not sum to
 * the printed total, and the one filing in that tier is invisible. And the
 * verdict is driven by `getUnsubmittableFilings()`, which by contract returns
 * only the INTEGRATION backlog (`no_identity` / `no_gateway`); `portal_only` is
 * deliberately excluded from it, because no integration will ever make a portal
 * filing transmittable. `buildSubmittabilityReport().portalOnly` exists for
 * exactly this and the script never read it.
 *
 * A portal filing is not a gap to be closed, but it is emphatically not
 * finishable ON THE PLATFORM: EU_CTA's channel is CTIS, and the platform's own
 * gateway selection routes any EU non-device sequence to the medicines gateway
 * (CESP) instead. Reporting it as finishable is the one claim this report must
 * never make.
 *
 * Run as a subprocess because the script does its work at import.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const SCRIPT = path.resolve(process.cwd(), 'scripts/regulatory-coverage-report.ts');
const run = (...args: string[]): string =>
  execFileSync('npx', ['tsx', SCRIPT, ...args], { encoding: 'utf8', timeout: 180_000 });

/* The pool logger writes JSON lines to stdout both BEFORE and AFTER the report,
   so the report object has to be cut out of the stream rather than parsed from
   the whole of it: it is the pretty-printed object that starts on a line of its
   own, and it ends where its braces balance. */
function reportJson(stdout: string): string {
  const at = stdout.search(/^\{$/m);
  if (at < 0) throw new Error(`no report object in --json output:\n${stdout.slice(0, 400)}`);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = at; i < stdout.length; i++) {
    const ch = stdout[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return stdout.slice(at, i + 1);
  }
  throw new Error('report object never closed');
}

interface ReportJson {
  submittability: {
    total: number;
    byTier: Record<string, number>;
    portalOnly: Array<{ id: string; portalChannel?: string }>;
  };
  unsubmittable: unknown[];
}

describe('regulatory coverage report — the closing verdict', () => {
  let json: ReportJson;
  let text: string;

  beforeAll(() => {
    json = JSON.parse(reportJson(run('--json'))) as ReportJson;
    text = run();
  }, 300_000);

  it('the tier counts it PRINTS account for every filing', () => {
    // The module's own partition is sound; the defect was in the rendering.
    const fromJson = Object.values(json.submittability.byTier).reduce((a, b) => a + b, 0);
    expect(fromJson, 'byTier must partition the filing set').toBe(json.submittability.total);

    /* The human report's tier line printed four of the five tiers, so its
       numbers summed to 233 against a total of 234 — the missing one being the
       single portal-only filing. Summing what is actually on the page is the
       only check that catches a tier being dropped from the line, whatever it
       is called there. */
    const tierLine = text.split('\n').find((l) => /\bsubmittable\s+\d/.test(l));
    expect(tierLine, 'no tier summary line found in the report').toBeTruthy();
    const printed = (tierLine!.match(/\d+/g) ?? []).map(Number).reduce((a, b) => a + b, 0);
    expect(
      printed,
      `the printed tier counts sum to ${printed} but the report covers ${json.submittability.total} filings — a tier is missing from the line`,
    ).toBe(json.submittability.total);
  });

  it('names each portal-only filing AND the portal it belongs to', () => {
    for (const p of json.submittability.portalOnly) {
      expect(text, `${p.id} is portal-only and unnamed in the report`).toContain(p.id);
      /* The id alone is not enough — it appears elsewhere in the report as an
         authorable type. What a reader needs is the channel, because that is
         the fact that makes it unfinishable here. */
      if (p.portalChannel) {
        expect(text, `${p.id} is named without its portal channel`).toContain(p.portalChannel);
      }
    }
  });

  it('never claims everything is finishable while a filing has no channel off the platform', () => {
    const claimsAllFinishable = /Every startable filing type is finishable/.test(text);
    if (json.submittability.portalOnly.length > 0 || json.unsubmittable.length > 0) {
      expect(
        claimsAllFinishable,
        `report claims every filing is finishable, but ${json.submittability.portalOnly.length} portal-only ` +
          `and ${json.unsubmittable.length} unsubmittable filing(s) exist`,
      ).toBe(false);
    }
  });
});
