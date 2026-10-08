/**
 * Each market states what the platform can carry (docs/design/FILING_SPINE.md F19).
 *
 * A market is one agency and one application type. What the platform can do
 * for one is decided in several places that never met:
 *   - the rule pack: is there a governed outline (c2c_rule_packs)?
 *   - the regional backbone: is Module 1 built to the agency's own headings,
 *     filed flat, or another region's placeholder (classifyRegionalBackbone)?
 *   - the region profile: does the gate check this region's Module 1?
 *   - the channel: is there a way to send it, and does its adapter refuse?
 *
 * The resolver read none of them: it called a market buildable whenever a
 * Module 1 backbone file name existed (`AGENCY_MODULE1`), so EMA and PMDA read
 * "buildable" while their Module 1 is filed flat. And nothing in the UI said
 * what a market cannot do.
 *
 * `marketSupport` composes the four into one statement, from deterministic
 * sources only. The table in FILING_SPINE.md §3 ("What is real today, per
 * region") is what these cases hold.
 */
import { describe, expect, it } from 'vitest';
import {
  marketSupport,
  module1ShapeForAgency,
  readMarketSupport,
  type ActiveRulePacks,
} from '../market-support';
import { resolveSubmissionPlan, submissionCoverageMatrix } from '../submission-resolver';
import { pmdaEctdV4Fact } from '../../ectd/dispatch-readiness';

/** The date marketSupport judges as of when given none. */
const today = () => new Date().toISOString().slice(0, 10);

/** The packs live on trunk (migrations 20260528/20260529/20260804/20260806b/20260810b), by (doc_type, agency). */
const LIVE_PACKS = new Set([
  'ind:fda', 'nda:fda', 'bla:fda', 'anda:fda', 'ide:fda', 'k510:fda', 'pma:fda', 'denovo:fda',
  'cta:ema', 'maa:ema', 'mdr:ema', 'ivdr:ema', 'cer:ema',
  'jnda:pmda', 'ind:mhra',
  // ICH-harmonised packs (20260528), the scaffolder's fallback (AGENCY_FALLBACKS).
  'mod3:ich', 'mod2:ich', 'ib:ich', 'protocol:ich', 'csr:ich',
]);
const packs: ActiveRulePacks = {
  find: (docType, agency) => (LIVE_PACKS.has(`${docType}:${agency}`) ? { version: 'v-test', label: `${docType}:${agency}` } : null),
};

describe('marketSupport — the FILING_SPINE.md F19 table', () => {
  it.each([
    ['maa', 'EMA', 'Flat Module 1, no channel'],
    ['nda', 'FDA', 'Structured Module 1'],
    ['nds', 'Health_Canada', 'No outline, no channel'],
    ['nda', 'ANVISA', 'Not supported'],
  ])('(%s, %s) → %s', (applicationType, market, summary) => {
    expect(marketSupport({ applicationType, market }, packs).summary).toBe(summary);
  });

  it('a market is named by its agency, its region code or its submission region alike', () => {
    for (const market of ['EMA', 'eu', 'EU', 'ema']) {
      expect(marketSupport({ applicationType: 'maa', market }, packs).summary, market).toBe('Flat Module 1, no channel');
    }
    for (const market of ['Health_Canada', 'ca', 'CA', 'Health Canada']) {
      expect(marketSupport({ applicationType: 'nds', market }, packs).summary, market).toBe('No outline, no channel');
    }
  });

  it('FDA: transmit is wired but not proven, and the line says why', () => {
    const s = marketSupport({ applicationType: 'nda', market: 'FDA' }, packs);
    expect(s.outline.state).toBe('outline');
    expect(s.module1.state).toBe('structured');
    expect(s.regionProfile).toBe(true);
    expect(s.channel.state).toBe('unproven');
    expect(s.line).toMatch(/^Transmit not proven: /);
    expect(s.buildable).toBe(true);
    expect(s.offered).toBe(true);
  });

  it('EMA MAA: flat Module 1, and the applicant uploads it', () => {
    const s = marketSupport({ applicationType: 'maa', market: 'EMA' }, packs);
    expect(s.module1.state).toBe('flat');
    expect(s.channel.state).toBe('applicant_uploads');
    expect(s.line).toMatch(/^Applicant uploads/);
    expect(s.buildable).toBe(false);
  });

  it('EMA CTA goes through the CTIS portal only', () => {
    const s = marketSupport({ applicationType: 'cta', market: 'EMA' }, packs);
    expect(s.channel.state).toBe('portal');
    expect(s.line).toMatch(/CTIS portal only/);
  });

  it('PMDA J-NDA: flat, the adapter refuses, and a new application is blocked on eCTD v4.0', () => {
    const s = marketSupport({ applicationType: 'jnda', market: 'PMDA' }, packs);
    expect(s.summary).toBe('Flat Module 1, no channel');
    expect(s.channel.state).toBe('refused');
    // 2026-10-08 (filing-spine review, open item 9): the line is true only
    // from a date, so it names that date — the dated registry fact's, read
    // where the block is decided. It read "…eCTD v4.0 required" with no date.
    const fact = pmdaEctdV4Fact(today());
    expect(fact?.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.line).toBe(`New applications blocked: eCTD v4.0 required from ${fact?.effectiveDate}`);
    expect(s.buildable).toBe(false);
  });

  it('Health Canada: no outline; its adapter posts to an endpoint written from no agency source, so no channel', () => {
    const s = marketSupport({ applicationType: 'nds', market: 'Health_Canada' }, packs);
    expect(s.outline.state).toBe('no_outline');
    expect(s.channel.state).toBe('none');
    expect(s.regionProfile).toBe(false);
    expect(s.line).toBe('No outline; no channel');
  });

  it('NMPA, MFDS and TGA: no outline; no channel. NMPA and MFDS are gate-checked, TGA is not', () => {
    for (const [market, profiled] of [['NMPA', true], ['MFDS', true], ['TGA', false]] as const) {
      const s = marketSupport({ applicationType: 'nda', market }, packs);
      expect(s.summary, market).toBe('No outline, no channel');
      expect(s.module1.state, market).toBe('placeholder');
      expect(s.regionProfile, market).toBe(profiled);
    }
  });

  it('MHRA "IND" is not offered: the UK has no IND, and the ind:mhra pack is mislabelled', () => {
    const s = marketSupport({ applicationType: 'ind', market: 'MHRA' }, packs);
    expect(s.summary).toBe('Not offered');
    expect(s.offered).toBe(false);
    expect(s.line).toBe('Not offered: the UK has no IND application type');
  });

  /* Amended 2026-10-08 (filing-spine design review, .design/filing-spine/
     DESIGN_REVIEW.md): the line read "Refused at creation: No document agency
     is defined for 'ANVISA'." Creating a submission for such a market is not
     refused (only a project's outline binding is declined), so the line claimed
     a control that is not there, in the platform's internal words. */
  it('an unmapped agency is not supported: no outline or channel, and no refusal is claimed', () => {
    for (const market of ['ANVISA', 'Swissmedic', 'CDSCO', 'HSA', 'br', 'Mars']) {
      const s = marketSupport({ applicationType: 'nda', market }, packs);
      expect(s.summary, market).toBe('Not supported');
      expect(s.offered, market).toBe(false);
      expect(s.line, market).toMatch(/^Not supported: the platform has no filing outline or channel for /);
      expect(s.line, market).not.toMatch(/refused|document agency/i);
    }
    expect(marketSupport({ applicationType: 'nda', market: 'ANVISA' }, packs).line).toMatch(/for ANVISA$/);
  });

  it('no line names a rule pack, an adapter or a signature format', () => {
    for (const [applicationType, market] of [['ind', 'MHRA'], ['maa', 'EMA'], ['nda', 'FDA'], ['nds', 'Health_Canada'], ['nda', 'Mars']]) {
      const s = marketSupport({ applicationType, market }, packs);
      expect(s.line, `${applicationType}:${market}`).not.toMatch(/rule pack|adapter|ind:mhra|ema:|PKCS|AS2/);
    }
  });

  it('no pack is borrowed from another agency: an FDA NDA pack does not give Health Canada an outline', () => {
    const s = marketSupport({ applicationType: 'nda', market: 'Health_Canada' }, packs);
    expect(s.outline.state).toBe('no_outline');
  });

  it('module1ShapeForAgency is the backbone classification, by agency', () => {
    expect(module1ShapeForAgency('FDA')).toBe('structured');
    expect(module1ShapeForAgency('EMA')).toBe('flat');
    expect(module1ShapeForAgency('PMDA')).toBe('flat');
    expect(module1ShapeForAgency('Health_Canada')).toBe('flat');
    expect(module1ShapeForAgency('NMPA')).toBe('placeholder');
    expect(module1ShapeForAgency('nonsense')).toBeNull();
  });
});

/* Filing-spine design review, 2026-10-08 (.design/filing-spine/DESIGN_REVIEW.md,
   honest-state lens). A 510(k) read "Structured Module 1. Transmit not proven…"
   and was buildable: the platform builds no device package, and a device
   filing is not eCTD. A DMF read "No outline" while the scaffolder gave its
   project the ICH Module 3 outline: the disagreement F19 exists to remove. */
describe('device filings claim no eCTD build, and the outline agrees with the scaffolder', () => {
  it.each([
    ['510k', 'FDA'], ['pma', 'FDA'], ['de_novo', 'FDA'], ['ide', 'FDA'], ['mdr', 'EMA'], ['cer', 'EMA'],
  ])('(%s, %s): not buildable, and no eCTD Module 1 or transmit is claimed', (applicationType, market) => {
    const s = marketSupport({ applicationType, market }, packs);
    expect(s.buildable).toBe(false);
    expect(s.summary).toMatch(/, no package$/);
    expect(s.line).toMatch(/device filings are not eCTD, and the platform builds no device package or transmit yet$/);
    expect(`${s.summary} ${s.line}`).not.toMatch(/Module 1|Transmit not proven/);
  });

  it('a 510(k) has its outline: outline only, no package', () => {
    expect(marketSupport({ applicationType: '510k', market: 'FDA' }, packs).summary).toBe('Outline only, no package');
  });

  it("a DMF has the ICH Module 3 outline the scaffolder gives its project", () => {
    const s = marketSupport({ applicationType: 'dmf', market: 'FDA' }, packs);
    expect(s.outline.state).toBe('outline');
    expect(s.outline.pack?.label).toBe('mod3:ich');
  });
});

describe('readMarketSupport fails closed on an empty rule-pack read', () => {
  it('no active pack at all is a failed read, not "No outline" for every market', async () => {
    const empty = { query: async () => ({ rows: [] }) };
    await expect(readMarketSupport(empty, [{ applicationType: 'nda', market: 'FDA' }])).rejects.toThrow(/rule pack/i);
  });
});

describe('readMarketSupport reads the active packs once, from c2c_rule_packs', () => {
  it('asks only for packs not superseded, and composes every requested market from that one read', async () => {
    const queries: string[] = [];
    const client = {
      query: async (sql: string) => {
        queries.push(sql);
        return { rows: [...LIVE_PACKS].map((k) => { const [doc_type, agency] = k.split(':'); return { doc_type, agency, version: 'v', label: k }; }) };
      },
    };
    const out = await readMarketSupport(client, [
      { applicationType: 'maa', market: 'EMA' },
      { applicationType: 'nda', market: 'FDA' },
    ]);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/c2c_rule_packs/);
    expect(queries[0]).toMatch(/superseded_by IS NULL/);
    expect(out.map((m) => m.summary)).toEqual(['Flat Module 1, no channel', 'Structured Module 1']);
  });
});

describe('the submission resolver reads the same judgement (submission-resolver.ts)', () => {
  it('EMA and PMDA are no longer reported buildable; FDA is', () => {
    const plan = resolveSubmissionPlan({ filingType: 'BLA' });
    const by = Object.fromEntries(plan.perRegion.map((r) => [r.region, r]));
    expect(by.US.buildSupported).toBe(true);
    expect(by.EU.buildSupported).toBe(false);
    expect(by.JP.buildSupported).toBe(false);
  });

  it('PMDA is not reported submit-supported while its adapter refuses every transmit', () => {
    const plan = resolveSubmissionPlan({ filingType: 'BLA' });
    expect(plan.perRegion.find((r) => r.region === 'JP')!.submitSupported).toBe(false);
  });

  it('the coverage matrix agrees with the plan', () => {
    const matrix = submissionCoverageMatrix();
    const cells = matrix.rows.flatMap((r) => r.cells);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      if (cell.region === 'EU' || cell.region === 'JP') expect(cell.buildSupported, `${cell.region}`).toBe(false);
      if (cell.region === 'JP') expect(cell.submitSupported, 'JP').toBe(false);
    }
  });
});
