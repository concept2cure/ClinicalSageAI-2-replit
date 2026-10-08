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

/** The packs live on trunk (migrations 20260528/20260529/20260804/20260806b/20260810b), by (doc_type, agency). */
const LIVE_PACKS = new Set([
  'ind:fda', 'nda:fda', 'bla:fda', 'anda:fda', 'ide:fda', 'k510:fda', 'pma:fda', 'denovo:fda',
  'cta:ema', 'maa:ema', 'mdr:ema', 'ivdr:ema', 'cer:ema',
  'jnda:pmda', 'ind:mhra',
]);
const packs: ActiveRulePacks = {
  find: (docType, agency) => (LIVE_PACKS.has(`${docType}:${agency}`) ? { version: 'v-test', label: `${docType}:${agency}` } : null),
};

describe('marketSupport — the FILING_SPINE.md F19 table', () => {
  it.each([
    ['maa', 'EMA', 'Flat Module 1, no channel'],
    ['nda', 'FDA', 'Structured Module 1'],
    ['nds', 'Health_Canada', 'No outline, no channel'],
    ['nda', 'ANVISA', 'Unmapped'],
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
    expect(s.line).toBe('New applications blocked: eCTD v4.0 required');
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
    expect(s.line).toMatch(/UK has no IND/);
  });

  it('an unmapped agency is refused at creation, with the reason', () => {
    for (const market of ['ANVISA', 'Swissmedic', 'CDSCO', 'HSA', 'br', 'Mars']) {
      const s = marketSupport({ applicationType: 'nda', market }, packs);
      expect(s.summary, market).toBe('Unmapped');
      expect(s.offered, market).toBe(false);
      expect(s.line, market).toMatch(/^Refused at creation: /);
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
