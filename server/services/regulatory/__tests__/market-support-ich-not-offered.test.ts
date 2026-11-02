/**
 * ICH / Global, asked for a filing that is not one of its harmonised document
 * classes, says why nothing is offered, and the Quality Overall Summary, the
 * drug substance and the drug product each say where they are written (D2 3b
 * Slice 4; P-55 row 5, F-D, decided 2026-10-26: no standalone QOS, drug
 * substance or drug product project, and P-28 is not widened).
 *
 * Before: harmonisedSupport (market-support.ts) returned null for such a type,
 * so unmappedSupport answered "Not supported: the platform has no filing
 * outline or channel for ICH / Global", with "No document agency is defined
 * for 'ICH / Global'." as the outline detail. The New project picker shows
 * offer.reason on every not-offered ICH / Global row (AnaVerbs.tsx), and the
 * catalog asks the QOS, 3.2.S and 3.2.P rows as an NDA there (Projects.tsx
 * programTypeFor), so none of the three said where it is written. A CSR's line
 * said it was "placed into an application's sequence" from here, though since
 * 5ab138ed3 a class project opens no submission.
 *
 * The sentences are asserted as literals, so this file runs unchanged against
 * the code as it was before the change. The pack set is
 * market-support-offer.test.ts's, plus csr:ich.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { marketSupport, marketOfferGivenOutline, type ActiveRulePacks } from '../market-support';
import { getApplicationType } from '../../../../shared/regulatory/global-document-registry';
import { resolveFilingCatalogEntry } from '../../../../shared/regulatory/filing-catalog';

const LIVE_PACKS = new Set([
  'ind:fda', 'nda:fda', 'bla:fda', 'anda:fda', 'ide:fda', 'k510:fda', 'pma:fda', 'denovo:fda',
  'cta:ema', 'maa:ema', 'mdr:ema', 'ivdr:ema', 'cer:ema',
  'jnda:pmda', 'ind:mhra', 'mod3:ich', 'csr:ich',
]);
const packs: ActiveRulePacks = {
  find: (docType, agency) => (LIVE_PACKS.has(`${docType}:${agency}`) ? { version: 'v-test', label: `${docType}:${agency}` } : null),
};
const ASOF = '2026-11-01';
const at = (applicationType: string, market: string) => marketSupport({ applicationType, market }, packs, ASOF);

const ICH_LINE = 'Not offered: ICH is no jurisdiction and takes no filing, and this filing is not authored here as a project of its own';
const QOS = "Not offered as its own project: the Quality Overall Summary is Module 2.3 of its application, so it is written in that application's project. "
  + "For a small-molecule US IND, AnA composes it there from the project's CMC / Module 3 records.";
const DS = "Not offered as its own project: drug substance quality is Module 3.2.S of its application, so it is written in that application's project; "
  + 'for a small-molecule US IND it is composed there in CMC / Module 3. A drug substance filed on its own by its holder is a Drug Master File (US) '
  + 'or an Active Substance Master File (EU): choose that filing type instead.';
const DP = "Not offered as its own project: drug product quality is Module 3.2.P of its application, so it is written in that application's project; "
  + 'for a small-molecule US IND it is composed there in CMC / Module 3.';

describe('ICH / Global, asked for a filing that is not a harmonised document class: not offered, and why', () => {
  it.each([
    ['nda', 'ICH / Global'], ['ind', 'ICH / Global'], ['bla', 'ICH'], ['maa', 'ich_global'],
    ['pas', 'ICH / Global'], // an FDA document class, not a harmonised one
  ])('(%s, %s)', (applicationType, market) => {
    const s = at(applicationType, market);
    expect(s).toMatchObject({ agency: 'ICH', region: null, summary: 'Not offered', line: ICH_LINE, buildable: false, offered: false });
    expect(s.module1.state).toBeNull();
    expect(s.channel.state).toBe('none');
    expect(s.offer).toMatchObject({ tier: 'not_offered', label: 'Not offered', reason: `${ICH_LINE}.`, appliesTo: null });
  });

  it('no part of the statement claims a missing outline or names a document agency', () => {
    const s = at('nda', 'ICH / Global');
    for (const text of [s.line, s.offer.reason, s.outline.detail, s.module1.detail, s.channel.detail]) {
      expect(text).not.toMatch(/Not supported|no filing outline|document agency/i);
    }
  });

  it('project creation reads the same refusal, whatever the scaffold would find', () => {
    for (const outlineFound of [true, false]) {
      const o = marketOfferGivenOutline({ applicationType: 'nda', market: 'ICH / Global' }, outlineFound, ASOF);
      expect(o.tier, String(outlineFound)).toBe('not_offered');
      expect(o.reason, String(outlineFound)).toBe(`${ICH_LINE}.`);
      expect(o.reasonByFiling?.ICH_M3_DS, String(outlineFound)).toBe(DS);
    }
  });
});

describe('the QOS, the drug substance and the drug product each say where they are written', () => {
  const own = () => at('nda', 'ICH / Global').offer.reasonByFiling ?? {};

  it('exactly these three registered filings carry a reason of their own, and the tier is unchanged', () => {
    expect(Object.keys(own()).sort()).toEqual(['ICH_M3_DP', 'ICH_M3_DS', 'ICH_QOS']);
    expect(at('nda', 'ICH / Global').offer.tier).toBe('not_offered');
  });

  it('each names its module, where it is written, and what is composed for a small-molecule US IND', () => {
    expect(own()).toEqual({ ICH_QOS: QOS, ICH_M3_DS: DS, ICH_M3_DP: DP });
  });

  it('each reads as sentences, with no ids or tool names on screen', () => {
    const texts = Object.values(own());
    expect(texts).toHaveLength(3);
    for (const text of texts) {
      expect(text).toMatch(/^Not offered as its own project: .*\.$/);
      expect(text).not.toMatch(/\.\.|_/);
    }
  });

  it('only ICH\'s not-offered statement carries a per-filing reason', () => {
    for (const [t, m] of [['nda', 'FDA'], ['maa', 'EMA'], ['nda', 'ANVISA'], ['nda', 'EU / Notified Body'], ['csr', 'ICH / Global']]) {
      expect(at(t, m).offer, `${t}:${m}`).not.toHaveProperty('reasonByFiling');
    }
  });
});

describe('what the three sentences state is true of the records they name', () => {
  it('the registry places the QOS at 2.3, the drug substance at 3.2.S and the drug product at 3.2.P', () => {
    expect(getApplicationType('ICH_QOS')?.ctdModule).toBe('2.3');
    expect(getApplicationType('ICH_M3_DS')?.ctdModule).toBe('3.2.S');
    expect(getApplicationType('ICH_M3_DP')?.ctdModule).toBe('3.2.P');
  });

  it('a drug substance filed on its own has its filing types, each in the catalog and offered for authoring', () => {
    expect(resolveFilingCatalogEntry('us_dmf')?.displayName).toBe('Drug Master File');
    expect(resolveFilingCatalogEntry('eu_asmf')?.displayName).toBe('Active Substance Master File');
    expect(at('dmf', 'FDA').offer.tier).toBe('author_only');
    expect(at('dmf', 'EMA').offer.tier).toBe('author_only');
  });

  it('AnA composes the QOS: its record-composed Module 2.3 tool is in the launch scope', () => {
    const inventory = JSON.parse(readFileSync('server/services/ana/ana-launch-scope.inventory.json', 'utf8'));
    expect(inventory.tools.inScope).toContain('draft_quality_overall_summary_m2_3');
  });
});

describe("a harmonised document at ICH says it is filed from its application's own project (as 5ab138ed3 words it)", () => {
  it("(csr, ICH / Global): authored here, and filed in its application's sequence from that project", () => {
    const s = at('csr', 'ICH / Global');
    expect(s.offer.tier).toBe('author_only');
    expect(s.line).toBe("Outline only: authored here; a harmonised document is filed in its application's sequence from that application's own project");
    expect(s.channel.detail).toBe("a harmonised document is filed in its application's sequence from that application's own project, and is not sent on its own");
  });
});
