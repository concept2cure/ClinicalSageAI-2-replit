/**
 * A device screen shows device analyses.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The precedent board offered four analysis lenses on every search: CRL
 * triggers, RTF triggers, EMA Day-120/180 question patterns, Advisory Committee
 * risk. Three are drug concepts on their face. MDX_WORK_ORDER W2-8 recorded the
 * fourth as the one that was device-correct; it is not. `analyzeRTFTriggers`
 * checks Form FDA 356h, Orange Book patent certification under 21 CFR 314.101,
 * CTD Modules 1/2.5/2.7/3/4, CDISC SDTM/ADaM datasets, a pediatric study plan
 * and REMS — fifteen items, none of which exist in a 510(k).
 *
 * So a 510(k) submitter was shown "Patent Certification (Para I-IV)" as a
 * refusal trigger for their device, on all four lenses, with nothing on the
 * screen indicating the analysis was for a different kind of product.
 *
 * These tests hold three lines:
 *   1. the lens set follows the pathway, and the two families never mix;
 *   2. the device lenses carry no drug artefacts — the specific failure above;
 *   3. the two COMPUTED lenses read out of the repo's canonical engines rather
 *      than restating them, so they cannot drift from the engines that own
 *      that knowledge.
 */
import { describe, it, expect } from 'vitest';
import { buildDeviceLenses, lensKeysFor, isDevicePathway } from '../device-lenses';
import { evaluateSubstantialEquivalence } from '../../regulatory/substantial-equivalence';

const CLEARANCES = [
  { clearanceNumber: 'K183282', deviceName: 'Dexcom G6 CGM', decisionDate: '2019-03-29', decisionOutcome: 'CLEARED' },
  { clearanceNumber: 'K162489', deviceName: 'FreeStyle Libre', decisionDate: '2017-09-27', decisionOutcome: 'CLEARED' },
] as any[];

const lenses = (submissionType: string, precedents = CLEARANCES) =>
  buildDeviceLenses({ submissionType, productCode: 'BZH' }, precedents);

const allText = (submissionType: string) =>
  Object.values(lenses(submissionType))
    .flatMap((l) => [l.title, l.rate, ...l.items])
    .join(' | ');

describe('the lens set follows the pathway', () => {
  it('gives a 510(k) the device lenses and a drug submission the drug lenses', () => {
    expect(lensKeysFor('510(k)')).toEqual(['rta', 'ai', 'nse', 'predicate', 'panel']);
    expect(lensKeysFor('De Novo')).toEqual(['rta', 'ai', 'nse', 'predicate', 'panel']);
    expect(lensKeysFor('PMA')).toEqual(['rta', 'ai', 'nse', 'predicate', 'panel']);
    expect(lensKeysFor('NDA')).toEqual(['crl', 'rtf', 'ema', 'adcomm']);
    expect(lensKeysFor('BLA')).toEqual(['crl', 'rtf', 'ema', 'adcomm']);
  });

  it('never mixes the two families', () => {
    const device = new Set(lensKeysFor('510(k)'));
    const drug = new Set(lensKeysFor('NDA'));
    for (const k of device) expect(drug.has(k)).toBe(false);
  });

  it('treats an unrecognised submission type as a drug pathway', () => {
    // Failing OPEN to the device lenses would put an RTA checklist in front of
    // a drug submitter. The drug set is the safe default because this screen's
    // historical behaviour was drug-only.
    expect(isDevicePathway('SOMETHING_NEW')).toBe(false);
    expect(lensKeysFor('SOMETHING_NEW')).toEqual(['crl', 'rtf', 'ema', 'adcomm']);
  });
});

describe('the device lenses carry no drug artefacts', () => {
  // Each of these was on the device screen, inside the lens the work order
  // believed was the device-correct one.
  const DRUG_ARTEFACTS = [
    '356h', 'Orange Book', 'Patent Certification', 'Module 2.5', 'Module 2.7',
    'SDTM', 'ADaM', 'REMS', 'Pediatric Study Plan', 'Drug Substance',
    'Drug Product', 'Day-120', 'Advisory Committee', 'Complete Response',
  ];

  for (const pathway of ['510(k)', 'De Novo', 'PMA']) {
    it(`${pathway} shows none of them`, () => {
      const text = allText(pathway);
      for (const artefact of DRUG_ARTEFACTS) expect(text).not.toContain(artefact);
    });
  }

  it('calls a 510(k) refusal by its own name — acceptance, not filing', () => {
    // A 510(k) is refused ACCEPTANCE; a PMA is refused FILING. Different gates,
    // different authorities, and the board was calling the device one by the
    // drug one's name.
    expect(lenses('510(k)').rta.title).toContain('Refuse-to-Accept');
    expect(lenses('PMA').rta.title).toContain('Refuse-to-File');
  });

  it('grounds the acceptance checklist in the device regulations', () => {
    const rta = lenses('510(k)').rta.items.join(' ');
    expect(rta).toContain('807.87');      // what a 510(k) must contain
    expect(rta).toContain('807.92');      // 510(k) summary
    expect(rta).toContain('3881');        // Indications for Use form
    expect(rta).not.toContain('314.101'); // the drug RTF authority
  });
});

describe('the computed lenses read out of the canonical engines', () => {
  it('takes the NSE routes from the SE flowchart, in its own words', () => {
    const routes = lenses('510(k)').nse.items;
    expect(routes.length).toBeGreaterThan(0);

    // Every route must be a rationale the real flowchart actually produces —
    // not a hand-written paraphrase that could drift away from it.
    const engineRationales = new Set(
      [true, false]
        .flatMap((a) =>
          [true, false].flatMap((b) =>
            [true, false, undefined].flatMap((c) =>
              [true, false, null].map((d) =>
                evaluateSubstantialEquivalence({
                  sameIntendedUse: a,
                  sameTechnologicalCharacteristics: b,
                  differencesRaiseNewQuestions: c,
                  performanceDataSupportsEquivalence: d,
                }),
              ),
            ),
          ),
        )
        .filter((r) => r.determination === 'NSE')
        .map((r) => r.rationale),
    );
    expect(engineRationales.size).toBeGreaterThan(0);
    for (const route of routes) {
      expect([...engineRationales].some((r) => route.startsWith(r))).toBe(true);
    }
  });

  it('scores predicates through the adequacy rubric, over the real clearances', () => {
    const items = lenses('510(k)').predicate.items.join(' ');
    expect(items).toContain('K183282');
    expect(items).toContain('K162489');
  });

  it('withholds the adequacy BAND while the dominant factors are unassessed', () => {
    // Intended-use and technological-characteristics alignment carry most of
    // the score and need a reading of both device descriptions, which the board
    // does not have. Every registry predicate therefore lands in the low 40s
    // and would be banded "inadequate" — a verdict on our inputs wearing the
    // costume of a verdict on the predicate. A user talked out of a good
    // predicate cannot tell that the reason was our missing data.
    const lens = lenses('510(k)').predicate;
    expect(lens.items.join(' ')).not.toContain('inadequate');
    expect(lens.items.join(' ')).toContain('Not yet ranked');
    expect(lens.rate).toBe('partial — see below');
  });

  it('says there is nothing to score rather than scoring nothing', () => {
    const lens = buildDeviceLenses({ submissionType: '510(k)', productCode: 'BZH' }, []);
    expect(lens.predicate.items.join(' ')).toContain('nothing to score');
    // And it must not turn that into a finding about the world.
    expect(lens.predicate.items.join(' ')).toContain('not a finding that no adequate predicate exists');
  });

  it('does not express AI-request risk as a number it cannot compute', () => {
    // The work order asks for "AI-request likelihood". The board holds no data
    // on this device from which a likelihood could be derived, and a fabricated
    // percentage on a regulatory screen is worse than no number at all. The
    // lens presents the drivers instead.
    const ai = lenses('510(k)').ai;
    expect(`${ai.rate} ${ai.items.join(' ')}`).not.toMatch(/\d+\s?%/);
    expect(ai.items.length).toBeGreaterThan(5);
  });
});
