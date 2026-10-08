/**
 * What the product offers for a filing, read from the one market verdict
 * (FILING_SPINE.md F19, `offer`; WORKFLOW_DECISION_2026-10-08.md §4 Q2, §5).
 *
 * The product never offers a filing it cannot finish, it says why, and it keeps
 * authoring value. Before this, the verdict said what a market could carry but
 * nothing turned that into an offer: project creation and the New project
 * picker offered every filing, including Health Canada (no outline, no
 * channel), an MHRA "IND" and a new Japanese application (eCTD v4.0).
 *
 * The pack set is the one market-support.test.ts uses, plus mod3:ich, the
 * harmonised Module 3 pack a master file is bound to at creation.
 */
import { describe, expect, it } from 'vitest';
import {
  marketSupport, sequenceTypeRefusal, documentAgencyFor, FDA_VARIATION_REASON, HEALTH_CANADA_NO_TRANSPORT,
  type ActiveRulePacks,
} from '../market-support';
import { ADAPTER_UNSOURCED } from '../../submission-gateways/transport-refusals';

const LIVE_PACKS = new Set([
  'ind:fda', 'nda:fda', 'bla:fda', 'anda:fda', 'ide:fda', 'k510:fda', 'pma:fda', 'denovo:fda',
  'cta:ema', 'maa:ema', 'mdr:ema', 'ivdr:ema', 'cer:ema',
  'jnda:pmda', 'ind:mhra', 'mod3:ich',
]);
const packs: ActiveRulePacks = {
  find: (docType, agency) => (LIVE_PACKS.has(`${docType}:${agency}`) ? { version: 'v-test', label: `${docType}:${agency}` } : null),
};
const ASOF = '2026-10-08';
const offer = (applicationType: string, market: string, continuingLifecycle?: boolean) =>
  marketSupport({ applicationType, market, continuingLifecycle }, packs, ASOF).offer;

describe('offer — build and sequence: US drug applications only', () => {
  it.each(['ind', 'nda', 'bla', 'anda'])('(%s, FDA) is built and sequenced, and says transmit is not proven', (t) => {
    const o = offer(t, 'FDA');
    expect(o.tier).toBe('build_and_sequence');
    expect(o.label).toBe('Build and sequence');
    expect(o.reason).toMatch(/eCTD sequence for FDA\. Transmit not proven: /);
  });
});

describe('offer — author documents for this market', () => {
  it('an EU MAA: Module 1 is flat, so no EMA sequence is built', () => {
    const o = offer('maa', 'EMA');
    expect(o).toMatchObject({ tier: 'author_only', label: 'Author documents for this market' });
    expect(o.reason).toMatch(/filed flat .* so no EMA sequence is built/);
  });

  it('an EU clinical trial (CTA through CTIS)', () => {
    expect(offer('cta', 'EMA').tier).toBe('author_only');
  });

  it.each(['510k', 'de_novo', 'pma', 'ide'])('a US device filing (%s): authored, no sequence', (t) => {
    const o = offer(t, 'FDA');
    expect(o.tier).toBe('author_only');
    expect(o.reason).toMatch(/builds no FDA sequence for a /);
  });

  it('a master file: bound to the harmonised Module 3 outline, as creation binds it, and authored', () => {
    const s = marketSupport({ applicationType: 'dmf', market: 'FDA' }, packs, ASOF);
    expect(s.outline.state).toBe('outline');
    expect(s.outline.pack?.label).toBe('mod3:ich');
    expect(s.offer.tier).toBe('author_only');
  });

  it('a continuing PMDA application (approval number on file): authored, Module 1 flat', () => {
    const o = offer('jnda', 'PMDA', true);
    expect(o.tier).toBe('author_only');
    expect(o.reason).toMatch(/no PMDA sequence is built/);
  });
});

describe('offer — not offered, with the reason', () => {
  it.each([
    ['nds', 'Health_Canada', /^Health Canada has no governed NDS outline here, so a project would have nothing to author and no channel to send it\.$/],
    ['nda', 'Health Canada', /^Health Canada has no governed NDA outline here/],
    ['cta', 'Health_Canada', /^Health Canada has no governed CTA outline here/],
    ['nda', 'TGA', /^TGA has no governed NDA outline here/],
    ['nda', 'NMPA', /^NMPA has no governed NDA outline here/],
    ['nda', 'MFDS', /^MFDS has no governed NDA outline here/],
    ['nda', 'EMA', /^EMA has no governed NDA outline here/],
    ['ind', 'MHRA', /^Not offered: the UK has no IND/],
    ['nda', 'ANVISA', /^Refused at creation: /],
    ['nda', 'EU / Notified Body', /^Refused at creation: A Notified Body assesses EU MDR and IVDR technical documentation and clinical evaluation reports; it takes no NDA\.$/],
    ['device', 'EU / Notified Body', /^Refused at creation: No document class is defined for program type 'device'\.$/],
    ['device', 'FDA', /^FDA has no governed DEVICE outline here/],
    ['jnda', 'PMDA', /^PMDA requires eCTD v4\.0 for new applications, and this platform builds eCTD v3\.2\.2 only\.$/],
  ])('(%s, %s)', (t, market, reason) => {
    const o = offer(t, market);
    expect(o.tier).toBe('not_offered');
    expect(o.label).toBe('Not offered');
    expect(o.reason).toMatch(reason);
    expect(o.reason).not.toMatch(/\.\.$/);
  });
});

describe('sequenceTypeRefusal — FDA has no variation', () => {
  it('refuses a variation for FDA, however the region is named', () => {
    for (const r of ['fda', 'FDA', 'US', 'us']) expect(sequenceTypeRefusal(r, 'variation'), r).toBe(FDA_VARIATION_REASON);
  });
  it('an EU variation, and every other FDA type, is not refused here', () => {
    expect(sequenceTypeRefusal('eu', 'variation')).toBeNull();
    expect(sequenceTypeRefusal('ema', 'variation')).toBeNull();
    for (const t of ['original', 'amendment', 'response', 'annual', 'withdrawal']) expect(sequenceTypeRefusal('fda', t), t).toBeNull();
  });
});

// ── Added 2026-10-08 (F19b review) ──────────────────────────────────────────

describe('offer — build and sequence is stated for the application itself, not for every filing of its type', () => {
  it('an FDA NDA names the NDA and the marketing applications of its family, and no meeting, designation, supplement, report or QMS record', () => {
    const o = offer('nda', 'FDA');
    expect(o.tier).toBe('build_and_sequence');
    expect(o.appliesTo).toEqual(expect.arrayContaining(['US_NDA', 'US_505B2', 'US_ROLLING', 'US_ACCEL_APPROVAL']));
    for (const id of ['US_TYPE_A_MEETING', 'US_IND_AMENDMENT', 'US_NDA_SUPP', 'US_ORPHAN', 'US_BTD', 'US_ICSR_15DAY', 'US_PADER', 'QMS_DMR', 'QMS_DESIGN_CONTROLS']) {
      expect(o.appliesTo, id).not.toContain(id);
    }
  });
  it('an FDA BLA names the BLA and the 351(k), not the supplement', () => {
    const o = offer('bla', 'FDA');
    expect(o.appliesTo).toEqual(expect.arrayContaining(['US_BLA', 'US_351K']));
    expect(o.appliesTo).not.toContain('US_BLA_SUPP');
  });
  it('an author-only or refused offer is not scoped to named filings', () => {
    expect(offer('maa', 'EMA').appliesTo).toBeNull();
    expect(offer('nda', 'TGA').appliesTo).toBeNull();
  });
});

describe('offer — the EU device lane through a Notified Body', () => {
  it.each(['mdr', 'ivdr', 'cer'])('(%s, EU / Notified Body) reads the EU device outline and is authored, naming the Notified Body', (t) => {
    const s = marketSupport({ applicationType: t, market: 'EU / Notified Body' }, packs, ASOF);
    expect(s.region).toBe('EU');
    expect(s.agency).toBe('Notified_Body');
    expect(s.outline.pack?.label).toBe(`${t}:ema`);
    expect(s.offer.tier).toBe('author_only');
    expect(s.offer.reason).toMatch(/^Author the documents here\. This platform builds no Notified Body sequence for a /);
  });
  it('however the catalog or an API caller names it', () => {
    for (const m of ['EU / Notified Body', 'Notified_Body', 'notified body', 'NB']) {
      expect(marketSupport({ applicationType: 'mdr', market: m }, packs, ASOF).offer.tier, m).toBe('author_only');
    }
  });
});

describe('documentAgencyFor — creation scaffolds against the market the verdict judged', () => {
  it.each([
    ['nda', 'us', 'FDA'], ['nda', 'US', 'FDA'], ['maa', 'EU', 'EMA'], ['maa', 'eu', 'EMA'],
    ['nda', 'FDA', 'FDA'], ['nda', 'Health Canada', 'Health_Canada'],
    ['mdr', 'EU / Notified Body', 'EMA'], ['ivdr', 'EU / Notified Body', 'EMA'], ['cer', 'EU / Notified Body', 'EMA'],
  ])('(%s, %s) → %s', (t, m, want) => {
    expect(documentAgencyFor({ applicationType: t, market: m })).toBe(want);
  });
  it.each([['nda', 'EU / Notified Body'], ['nda', 'Swissmedic'], ['device', 'EU / Notified Body']])('(%s, %s) → null: the caller keeps what it sent', (t, m) => {
    expect(documentAgencyFor({ applicationType: t, market: m })).toBeNull();
  });
});

describe('Health Canada: the channel says nothing is sent, not that an adapter posts', () => {
  it('the statement uses the Health Canada sentence, which the adapter refusal also uses', () => {
    const s = marketSupport({ applicationType: 'nds', market: 'Health_Canada' }, packs, ASOF);
    expect(s.channel.state).toBe('none');
    expect(s.channel.detail).toBe(HEALTH_CANADA_NO_TRANSPORT);
    expect(s.channel.detail).not.toBe(ADAPTER_UNSOURCED);
  });
});
