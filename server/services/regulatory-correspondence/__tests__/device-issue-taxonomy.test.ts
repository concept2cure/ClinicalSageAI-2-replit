/**
 * The CDRH taxonomy, and the two things about it that can be silently wrong.
 *
 * 1. A transcribed section key that is not a real leaf of the pack it is named
 *    under. The keys here are read back out of
 *    `migrations/20260901b_estar_510k_denovo_outlines.sql` — the file that
 *    actually seeds them — rather than repeated in the assertion, because a
 *    test that repeats the transcription confirms the transcription.
 * 2. A key that is real but belongs to the OTHER pathway. 510(k) D5 is "Shelf
 *    life and packaging"; De Novo D5 is "Cybersecurity". Both are valid keys,
 *    so a pathway mix-up passes every existence check ever written and files a
 *    cybersecurity deficiency against shelf-life documentation.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { runGovernedIssueParser } from '../issue-parser';
import {
  DEVICE_ISSUE_TAXONOMY,
  devicePathwayFor,
  isDeviceSubmissionType,
  type DevicePathway,
} from '../device-issue-taxonomy';

const OUTLINES = path.resolve(
  process.cwd(),
  'migrations/20260901b_estar_510k_denovo_outlines.sql',
);

/** key → label, per pathway, straight out of the seeding migration. */
function readPacks(): Record<DevicePathway, Map<string, string>> {
  const src = fs.readFileSync(OUTLINES, 'utf8');
  const blocks = [...src.matchAll(/\$pack\$(\[[\s\S]*?\])\$pack\$/g)].map((m) => m[1]);
  expect(blocks.length).toBeGreaterThanOrEqual(2);
  const [k510, denovo] = blocks.map((b) => {
    const rows = JSON.parse(b) as Array<{ key: string; label: string; parent_key: string | null }>;
    return new Map(rows.filter((r) => r.parent_key).map((r) => [r.key, r.label]));
  });
  return { k510, denovo };
}

const PACKS = readPacks();

describe('the seeding migration still says what this taxonomy was written against', () => {
  it('reads both packs, with the leaf counts they ship', () => {
    expect(PACKS.k510.size).toBe(29);
    expect(PACKS.denovo.size).toBe(25);
  });

  it('the pathway key collision that forces per-pathway mapping is real', () => {
    // If this ever stops being true, the per-pathway map below is over-built —
    // and until it does, a single "device" key set is a live hazard.
    expect(PACKS.k510.get('D4')).toMatch(/Sterilization/i);
    expect(PACKS.denovo.get('D4')).toMatch(/Software/i);
    expect(PACKS.k510.get('D5')).toMatch(/Shelf life/i);
    expect(PACKS.denovo.get('D5')).toMatch(/Cybersecurity/i);
    expect(PACKS.k510.get('E1')).toMatch(/Biocompatibility/i);
    expect(PACKS.denovo.get('E1')).toMatch(/labeling/i);
  });
});

describe('every section key the taxonomy names is a real leaf of that pathway', () => {
  for (const rule of DEVICE_ISSUE_TAXONOMY) {
    for (const pathway of ['k510', 'denovo'] as const) {
      const keys = rule.sections[pathway];
      if (!keys) continue;
      it(`${rule.topic} → ${pathway}: ${keys.join(', ')}`, () => {
        for (const k of keys) {
          expect(PACKS[pathway].has(k), `${pathway} has no leaf "${k}"`).toBe(true);
        }
      });
    }
  }
});

/**
 * The keys are real; this is whether they are the RIGHT ones. Each row names
 * the word that must appear in the seeded label — so a pathway mix-up, which
 * every existence check above would pass, fails here.
 */
describe('the named key is the section the topic is about', () => {
  const EXPECTED: Array<[string, DevicePathway, string, RegExp]> = [
    ['biocompatibility', 'k510', 'E1', /Biocompatibility/i],
    ['biocompatibility', 'denovo', 'D2', /Biocompatibility/i],
    ['software', 'k510', 'E2', /Software/i],
    ['software', 'denovo', 'D4', /Software/i],
    ['cybersecurity', 'k510', 'E3', /Cybersecurity/i],
    ['cybersecurity', 'denovo', 'D5', /Cybersecurity/i],
    ['electrical_emc', 'k510', 'E4', /Electromagnetic|electrical/i],
    ['electrical_emc', 'denovo', 'D6', /Electromagnetic|electrical/i],
    ['bench_performance', 'k510', 'E5', /Bench/i],
    ['bench_performance', 'denovo', 'D1', /Bench/i],
    ['animal_study', 'k510', 'E6', /Animal/i],
    ['animal_study', 'denovo', 'D7', /Animal/i],
    ['clinical_performance', 'k510', 'E7', /Clinical/i],
    ['clinical_performance', 'denovo', 'D8', /Clinical/i],
    ['human_factors', 'k510', 'E8', /Human factors|usability/i],
    ['human_factors', 'denovo', 'D9', /Human factors|usability/i],
    ['labeling', 'k510', 'D2', /labeling/i],
    ['labeling', 'denovo', 'E1', /labeling/i],
    ['indications_for_use', 'k510', 'B2', /Indications for use/i],
    ['indications_for_use', 'denovo', 'A2', /Indications for use/i],
    ['quality_system', 'k510', 'F1', /Quality management/i],
    ['quality_system', 'denovo', 'G1', /Quality management/i],
    ['additional_information_hold', 'k510', 'G2', /Additional information/i],
    ['sterilization_shelf_life', 'k510', 'D4', /Sterilization/i],
    ['sterilization_shelf_life', 'denovo', 'D3', /Sterilization/i],
  ];

  for (const [topic, pathway, key, labelMustMatch] of EXPECTED) {
    it(`${topic} on ${pathway} names ${key}, and ${key} is about it`, () => {
      const rule = DEVICE_ISSUE_TAXONOMY.find((r) => r.topic === topic);
      expect(rule, `no rule named ${topic}`).toBeDefined();
      expect(rule!.sections[pathway]).toContain(key);
      expect(PACKS[pathway].get(key)).toMatch(labelMustMatch);
    });
  }
});

describe('pathway selection', () => {
  it('recognises the device submission types', () => {
    for (const t of ['510k', 'de_novo', 'pma', 'ide', 'q_sub', '513g']) {
      expect(isDeviceSubmissionType(t), t).toBe(true);
    }
    for (const t of ['nda', 'bla', 'ind', 'maa', '', null, undefined]) {
      expect(isDeviceSubmissionType(t as string), String(t)).toBe(false);
    }
  });

  it('names a pathway only where a rule pack is seeded', () => {
    expect(devicePathwayFor('510k')).toBe('k510');
    expect(devicePathwayFor('de_novo')).toBe('denovo');
    // Device, classified, but no seeded outline — so no borrowed keys.
    expect(devicePathwayFor('pma')).toBeNull();
    expect(devicePathwayFor('ide')).toBeNull();
    expect(devicePathwayFor('q_sub')).toBeNull();
  });
});

describe('the letters CDRH actually sends', () => {
  const RTA = `Re: K243118
REFUSE TO ACCEPT (RTA) — 510(k) Notification
Your 510(k) was not accepted for substantive review because the acceptance
checklist items below were not met.`;

  const AI = `ADDITIONAL INFORMATION REQUEST (AI)
We cannot reach a substantial equivalence determination. Your submission is
placed on hold.
A1. The predicate device K201234 has different technological characteristics.
A2. Your biocompatibility evaluation does not address cytotoxicity per ISO 10993-5.
A3. Provide the cybersecurity risk management report per section 524B.
A4. The proposed labeling does not include the warnings identified in the risk analysis.`;

  it('a Refuse to Accept is critical and blocking, not "other_unclassified"', () => {
    /* The shipped drug rule reads `refuse to file` — and `rtf` is one character
       from `rta`, which is how this stayed invisible. Measured before the fix:
       category other_unclassified, severity low, blocker false, on the most
       severe device outcome short of NSE. */
    const r = runGovernedIssueParser(RTA, 'c', { submissionType: '510k' });
    const issue = r.issues.find((i) => i.category === 'filing_acceptance_issue');
    expect(issue, 'no filing-acceptance issue raised for an RTA').toBeDefined();
    expect(issue!.severity).toBe('critical');
    expect(issue!.blocker).toBe(true);
    expect(r.issues.map((i) => i.category)).not.toContain('other_unclassified');
  });

  it('an AI letter yields the deficiencies it actually raises', () => {
    const r = runGovernedIssueParser(AI, 'c', { submissionType: '510k' });
    const topics = r.issues.map((i) => i.subcategory);
    for (const t of ['substantial_equivalence', 'biocompatibility', 'cybersecurity', 'labeling']) {
      expect(topics, `missing ${t}`).toContain(t);
    }
  });

  it('maps them onto 510(k) sections, and onto no CTD section at all', () => {
    const r = runGovernedIssueParser(AI, 'c', { submissionType: '510k' });
    const sections = new Set(r.issues.flatMap((i) => i.mappedCtdSections));
    expect(sections).toContain('E1'); // Biocompatibility
    expect(sections).toContain('E3'); // Cybersecurity
    expect(sections).toContain('D2'); // Proposed labeling
    expect(sections).toContain('C1'); // Predicate
    // A 510(k) has no CTD modules. Before this, the same letter returned
    // 2.5 / 2.7.4 and nothing else.
    for (const s of sections) expect(s).not.toMatch(/^\d/);
  });

  it('the SAME letter on De Novo maps to De Novo keys, never 510(k) ones', () => {
    const k = runGovernedIssueParser(AI, 'c', { submissionType: '510k' });
    const d = runGovernedIssueParser(AI, 'c', { submissionType: 'de_novo' });
    const kb = k.issues.find((i) => i.subcategory === 'biocompatibility')!.mappedCtdSections;
    const db = d.issues.find((i) => i.subcategory === 'biocompatibility')!.mappedCtdSections;
    expect(kb).toEqual(['E1']);
    expect(db).toEqual(['D2']);
    // De Novo E1 is "Proposed labeling" — filing biocompatibility there is the
    // whole reason the map is per pathway.
    expect(db).not.toContain('E1');
  });

  it('a device pathway with no seeded pack classifies, and names no section', () => {
    const r = runGovernedIssueParser(AI, 'c', { submissionType: 'pma' });
    expect(r.issues.map((i) => i.subcategory)).toContain('biocompatibility');
    expect(r.issues.flatMap((i) => i.mappedCtdSections)).toEqual([]);
  });

  it('a drug submission is untouched by the device rules', () => {
    const drug = runGovernedIssueParser(
      'Deficiency: stability data are incomplete and an adverse event was unreported.',
      'c',
      { submissionType: 'nda' },
    );
    expect(drug.issues.map((i) => i.category)).toContain('cmc_quality_issue');
    expect(drug.issues.flatMap((i) => i.mappedCtdSections)).toContain('3.2.S');
  });

  it('no context at all is the drug taxonomy, exactly as before', () => {
    const text = 'Deficiency: stability data are incomplete.';
    const a = runGovernedIssueParser(text, 'c');
    const b = runGovernedIssueParser(text, 'c', {});
    expect(a.issues.map((i) => i.category)).toEqual(b.issues.map((i) => i.category));
    expect(a.issues.flatMap((i) => i.mappedCtdSections)).toContain('3.2.S');
  });
});

describe('the device patterns match words, not substrings', () => {
  /*
   * The drug taxonomy beside this one shipped four unanchored keywords, one of
   * which ("format", inside "information") fired on every letter FDA sends.
   * The device acronyms are SHORTER and the same mistake here is worse — these
   * are the words that would have done it, measured against the keyword set:
   *
   *   "important"  contains rta  (impo-RTA-nt)   -> Refuse to Accept, CRITICAL, blocking
   *   "portal"     contains rta  (po-RTA-l)      -> Refuse to Accept, CRITICAL, blocking
   *   "response"   contains nse  (respo-NSE)     -> Not Substantially Equivalent, CRITICAL
   *   "consensus"  contains nse  (co-NSE-nsus)   -> Not Substantially Equivalent, CRITICAL
   *   "nonsense", "dispense"     contains nse    -> same
   *   "emcee"      contains emc                  -> electrical/EMC
   *
   * "response" and "important" appear in essentially every regulatory letter,
   * so an unanchored `nse` or `rta` would declare almost every device
   * correspondence a critical, blocking NSE or RTA.
   */
  const INNOCENT = [
    'important', 'importantly', 'portal', 'response', 'consensus', 'nonsense',
    'dispense', 'emcee', 'information', 'therapy', 'brisk', 'equality',
  ];

  const fired = (w: string) =>
    runGovernedIssueParser(`This is ${w}.`, 'c', { submissionType: '510k' })
      .metadata.matchedRuleCount;

  for (const w of INNOCENT) {
    it(`"${w}" matches no device rule`, () => {
      expect(fired(w)).toBe(0);
    });
  }

  it('the real keywords still fire — the anchor removes accidents, not matches', () => {
    for (const w of ['software', 'cybersecurity', 'biocompatibility', 'labelling', 'usability']) {
      expect(fired(w), `"${w}" is a real device keyword`).toBeGreaterThan(0);
    }
    // The acronyms, in the form a letter writes them.
    expect(
      runGovernedIssueParser('This is an RTA decision.', 'c', { submissionType: '510k' })
        .metadata.matchedRuleCount,
    ).toBeGreaterThan(0);
    expect(
      runGovernedIssueParser('The determination was NSE.', 'c', { submissionType: '510k' })
        .metadata.matchedRuleCount,
    ).toBeGreaterThan(0);
  });
});
