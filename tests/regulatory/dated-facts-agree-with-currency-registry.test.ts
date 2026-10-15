/**
 * Dated regulatory facts must agree across the stores that state them.
 *
 * `server/services/regulatory-currency/currency-registry.ts` is the platform's
 * one record of dated facts (docs/design/ANA_REGULATORY_RECORD.md, "One store
 * of dated facts"). The filing catalog, the IVD legal corpus and AnA's LDT tool
 * repeated two of those facts as literal strings and contradicted it:
 *
 *   - the FDA 2024 LDT rule — void (vacated 2025-03-31, reverted by FDA rule
 *     2025-09-19) — was offered as an "LDT Notification" filing with "phased
 *     requirements", described as vacated "pending appeal", and the register_ldt
 *     tool told AnA its first-offered date drives "grandfathering eligibility";
 *   - the QMSR (in force 2026-02-02, ISO 13485:2016 by reference) — the catalog
 *     still called 21 CFR 820 the "Quality System Regulation" and cited the
 *     removed 21 CFR 820.30 as the current basis for design controls.
 *
 * And the registry had no QMSR fact at all, so check_guidance_freshness could
 * not flag a 21 CFR 820.30 citation as superseded.
 *
 * US_LDT stays in the catalog and active: founder decision 18
 * (docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/DECISIONS.md).
 */
import { describe, it, expect } from 'vitest';

import {
  GLOBAL_REGISTRY,
  getApplicationType,
} from '../../shared/regulatory/global-document-registry';
import { FILING_CATALOG } from '../../shared/regulatory/filing-catalog';
import {
  REGULATORY_FACTS,
  findFacts,
} from '../../server/services/regulatory-currency/currency-registry';
import { checkGuidanceFreshness } from '../../server/services/regulatory-currency/guidance-ingestion-service';
import { LEGAL_IVD_KNOWLEDGE } from '../../server/services/ivd-knowledge/legal/legal-ivd';
import { REGISTER_LDT } from '../../server/services/ana/mutation-surface-tool-defs';

const AS_OF = '2026-10-05';

/** Sections of 21 CFR 820 the QMSR removed (820.20 – 820.250). */
const REMOVED_QSR_SECTION =
  /\b820\.(20|22|25|30|40|50|60|65|70|72|75|80|86|90|100|120|130|140|150|160|170|180|181|184|186|198|200|250)\b/;

function ldtFact() {
  const fact = REGULATORY_FACTS.find((f) => f.id === 'us-ldt-final-rule-void');
  if (!fact) throw new Error('us-ldt-final-rule-void is missing from the currency registry');
  return fact;
}

function qmsrFact() {
  const facts = findFacts({ topic: 'QMSR', jurisdiction: 'US' });
  expect(facts.map((f) => f.id)).toEqual(['us-qmsr']);
  return facts[0];
}

describe('the QMSR is a dated fact in the currency registry', () => {
  it('records the QMSR as in force from 2026-02-02 against the Federal Register final rule', () => {
    const fact = qmsrFact();
    expect(fact.status).toBe('in_force');
    expect(fact.effectiveDate).toBe('2026-02-02');
    expect(new URL(fact.sourceUrl).hostname).toBe('www.federalregister.gov');
    expect(fact.sourceUrl).toContain('2024-01709');
    expect(fact.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fact.appliesTo).toEqual(['mdx']);
    expect(fact.aliases).toEqual(expect.arrayContaining(['QMSR', 'Quality Management System Regulation']));
    expect(fact.note).toMatch(/ISO 13485:2016/);
    expect(fact.note).toMatch(/7\.3/);
    expect(fact.note).toMatch(/820\.10/);
  });

  it('never supersedes a bare "21 CFR 820" — that would mark every 820.10 citation superseded', () => {
    const alternatives = (qmsrFact().supersedes ?? '').split(' / ').map((s) => s.trim());
    expect(alternatives).toEqual(expect.arrayContaining(['21 CFR 820.30', 'Quality System Regulation']));
    expect(alternatives).not.toContain('21 CFR 820');
    expect(alternatives).not.toContain('820');
  });

  it('lets check_guidance_freshness flag a removed-section citation and pass a QMSR one', () => {
    const { results } = checkGuidanceFreshness({
      asOf: AS_OF,
      citedGuidances: [
        { title: 'Design controls per 21 CFR 820.30(c)', jurisdiction: 'US' },
        { title: 'Quality System Regulation (21 CFR 820)', jurisdiction: 'US' },
        { title: '21 CFR 820.10', jurisdiction: 'US' },
      ],
    });
    expect(results[0].current).toBe(false);
    expect(results[0].basis?.id).toBe('us-qmsr');
    expect(results[1].current).toBe(false);
    expect(results[1].basis?.id).toBe('us-qmsr');
    expect(results[2].current).not.toBe(false);
  });

  it('does not call the QMSR final rule superseded when it is cited by its Federal Register title', () => {
    // FR 2024-01709 — the fact's own sourceUrl — is titled "Medical Devices;
    // Quality System Regulation Amendments". "Quality System Regulation" is in
    // supersedes, so without an alias for the rule's title this citation of
    // the current QMSR rule read as "superseded by the QMSR".
    const { results } = checkGuidanceFreshness({
      asOf: AS_OF,
      citedGuidances: [
        { title: 'Medical Devices; Quality System Regulation Amendments', jurisdiction: 'US' },
        { title: 'Quality System Regulation Amendments (89 FR 7496)', jurisdiction: 'US' },
      ],
    });
    for (const r of results) {
      expect(r.current).not.toBe(false);
      expect(r.basis?.id).toBe('us-qmsr');
    }
  });

  it('is not returned for a drug CGMP question (21 CFR 210/211)', () => {
    expect(findFacts({ topic: 'CGMP', jurisdiction: 'US' }).map((f) => f.id)).not.toContain('us-qmsr');
  });

  it('is appended, so findFacts(...)[0] for LDT and EUDAMED still returns their own facts', () => {
    const ids = REGULATORY_FACTS.map((f) => f.id);
    expect(ids.indexOf('us-qmsr')).toBeGreaterThan(ids.indexOf('eu-eudamed-mandatory'));
    expect(ids.indexOf('us-qmsr')).toBeGreaterThan(ids.indexOf('us-ldt-final-rule-void'));
    expect(findFacts({ topic: 'LDT' })[0].id).toBe('us-ldt-final-rule-void');
    expect(findFacts({ topic: 'EUDAMED' })[0].id).toBe('eu-eudamed-mandatory');
  });
});

describe('the filing catalog agrees with the QMSR fact', () => {
  it('names 21 CFR 820 the QMSR, dated from the fact, with QSR kept as a search synonym', () => {
    const e = getApplicationType('QMS_QSR_820');
    expect(e?.active).toBe(true);
    expect(e?.displayName).toBe('QMSR (21 CFR 820)');
    expect(e?.description).toMatch(/Quality Management System Regulation/);
    expect(e?.description).toContain(qmsrFact().effectiveDate);
    expect(e?.description).toMatch(/ISO 13485:2016/);
    expect(e?.synonyms).toEqual(expect.arrayContaining(['QSR', 'QMSR', '21 CFR 820']));
  });

  it('cites design controls as ISO 13485:2016 §7.3 via 21 CFR 820.10, with 820.30 only as "formerly"', () => {
    for (const id of ['US_DHF', 'QMS_DESIGN_CONTROLS']) {
      const e = getApplicationType(id);
      expect(e?.active, id).toBe(true);
      expect(e?.description, id).toMatch(/ISO 13485:2016 §7\.3 via 21 CFR 820\.10/);
      expect(e?.description, id).toMatch(/formerly 21 CFR 820\.30/);
      /* Kept so a search for the old citation still finds the entry. */
      expect(e?.synonyms, id).toContain('21 CFR 820.30');
    }
  });

  it('never cites a removed QSR section as current in any catalog description', () => {
    const offenders = GLOBAL_REGISTRY.filter((e) => {
      const d = e.description ?? '';
      return REMOVED_QSR_SECTION.test(d) && !/\bformerly\b/i.test(d);
    }).map((e) => `${e.id}: ${e.description}`);
    expect(offenders).toEqual([]);
  });
});

describe('the LDT position agrees with the void-rule fact', () => {
  it('keeps US_LDT active and in the filing catalog (founder decision 18)', () => {
    expect(getApplicationType('US_LDT')?.active).toBe(true);
    expect(FILING_CATALOG.some((e) => e.registryId === 'US_LDT')).toBe(true);
  });

  it('presents US_LDT as a regulatory-status entry, not a filing under the void rule', () => {
    const e = getApplicationType('US_LDT');
    const fact = ldtFact();
    expect(fact.status).toBe('void');
    expect(e?.displayName).not.toMatch(/notification/i);
    expect(e?.displayName).toMatch(/regulatory status/i);
    expect(e?.description).not.toMatch(/phased requirements/i);
    expect(e?.description).toMatch(/CLIA/);
    expect(e?.description).toMatch(/no FDA premarket submission/i);
    expect(e?.description).toContain(fact.id);
    expect(e?.description).toContain('2025-03-31');
    expect(e?.description).toContain(fact.effectiveDate);
  });

  it('tells AnA the rule is void, not vacated "pending appeal"', () => {
    const entry = LEGAL_IVD_KNOWLEDGE.find((k) => k.id === 'legal.ivd.ldt-rule');
    expect(entry).toBeDefined();
    const text = [entry!.title, entry!.summary, entry!.detail, ...entry!.keyPoints, ...(entry!.pitfalls ?? [])].join('\n');
    expect(text).not.toMatch(/pending appeal/i);
    expect(text).not.toMatch(/appeal\/VALID Act unresolved/i);
    expect(text).not.toMatch(/successful appeal/i);
    expect(text).toContain('2025-03-31');
    expect(text).toContain(ldtFact().effectiveDate);
    expect(text).toMatch(/VALID Act[^.]*proposed legislation/i);
    /* The entry cites the fact's own source, so one registry update moves both. */
    expect(entry!.citations.map((c) => c.url)).toContain(ldtFact().sourceUrl);
    expect(entry!.lastReviewed >= ldtFact().lastVerified).toBe(true);
  });

  it('marks register_ldt grandfathering and phase fields historical, as /api/mdx/ldt does', () => {
    expect(REGISTER_LDT.description).not.toMatch(/used for grandfathering eligibility per/i);
    expect(REGISTER_LDT.description).toMatch(/void/i);
    expect(REGISTER_LDT.description).toContain(ldtFact().id);
    expect(REGISTER_LDT.description).toMatch(/historical/i);
    const props = (REGISTER_LDT.input_schema as { properties: Record<string, { description?: string }> }).properties;
    for (const field of ['first_offered_date', 'grandfathered', 'current_phase']) {
      expect(props[field]?.description, field).toMatch(/historical/i);
    }
  });
});
