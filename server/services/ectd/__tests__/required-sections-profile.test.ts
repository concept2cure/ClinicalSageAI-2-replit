/**
 * One home for the required-section profiles (R10 step 1).
 *
 * The required-section profile for a submission type lived inside the eCTD
 * leaf validator (`ectd4-validator.ts requiredSectionsFor`), privately, and it
 * knew three types: IND, NDA and BLA, all FDA. Everything else came back null
 * ("not assessed"). So:
 *
 *   - an EU MAA had no profile anywhere a gate could read, and the
 *     completeness engine (validate-completeness-engine.ts) papered over that
 *     by mapping MAA to NDA and checking it against FDA Form 356h;
 *   - a J-NDA had none either;
 *   - nothing outside the validator could ask the question at all.
 *
 * The profile now lives in `server/services/ectd/required-sections.ts` beside
 * the pack-bound resolver, and the validator reads it from there. Module 1
 * comes from the region profile (`requiredModule1CodesForRegion`); Modules 2-5
 * are the ICH M4 bodies. A type or region with no profile stays NULL — never an
 * empty set, never another region's set.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as requiredSections from '../required-sections';
import { quickValidate, validatePackage, type ECTDLeaf } from '../ectd4-validator';
import { requiredModule1CodesForRegion } from '../../region-profiles/region-profile-service';

type ProfileFn = (type: string, region?: string | null) => ReadonlySet<string> | null;
const requiredSectionsFor = (requiredSections as unknown as { requiredSectionsFor?: ProfileFn })
  .requiredSectionsFor;

function profile(type: string, region?: string | null): ReadonlySet<string> | null {
  expect(
    typeof requiredSectionsFor,
    'required-sections.ts exports no requiredSectionsFor — the profile has no shared home',
  ).toBe('function');
  return requiredSectionsFor!(type, region);
}

const MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
const leaf = (sectionCode: string): ECTDLeaf => ({
  sectionCode,
  title: sectionCode,
  checksum: MD5,
  checksumType: 'md5',
  operation: 'new',
  filePath: `${sectionCode.replace(/\./g, '-')}/doc.pdf`,
  mimeType: 'application/pdf',
  fileSize: 1024,
});

describe('required-sections — one profile, reachable outside the validator', () => {
  it('answers for an EU MAA instead of returning null', () => {
    const maa = profile('MAA', 'eu');
    expect(maa, "requiredSectionsFor('MAA','eu') is null — an MAA has no required-section profile").not.toBeNull();
    // EU Module 1 comes from the EU region profile, not from FDA's.
    for (const code of requiredModule1CodesForRegion('eu', 'maa')) {
      expect(maa!.has(code), `EU Module 1 ${code} missing from the MAA profile`).toBe(true);
    }
    expect(maa!.has('1.8.2'), 'risk-management plan (EU 1.8.2)').toBe(true);
    expect(maa!.has('1.6'), 'environmental risk assessment (EU 1.6)').toBe(true);
    // ICH M4 bodies.
    for (const code of ['2.3', '2.5', '2.7', '3.2.S', '3.2.P', '4.2.3', '5.3.5']) {
      expect(maa!.has(code), `ICH M4 ${code} missing from the MAA profile`).toBe(true);
    }
    // Never the FDA set: no debarment certification, no FDA environmental analysis.
    expect(maa!.has('1.3.3'), 'an MAA is asked for the FDA debarment certification').toBe(false);
    expect(maa!.has('1.12.14'), 'an MAA is asked for the FDA environmental analysis').toBe(false);
  });

  it('answers for a J-NDA from the JP region profile', () => {
    const jnda = profile('JNDA', 'jp');
    expect(jnda, "requiredSectionsFor('JNDA','jp') is null").not.toBeNull();
    for (const code of requiredModule1CodesForRegion('jp', 'jnda')) {
      expect(jnda!.has(code), `JP Module 1 ${code} missing from the J-NDA profile`).toBe(true);
    }
    expect(jnda!.has('2.5') && jnda!.has('5.3.5') && jnda!.has('3.2.P')).toBe(true);
    expect(jnda!.has('1.20'), 'a J-NDA is asked for the FDA general investigational plan').toBe(false);
  });

  it('infers the home region of a region-specific type when none is given', () => {
    expect([...(profile('MAA') ?? [])].sort()).toEqual([...(profile('MAA', 'eu') ?? [])].sort());
    expect([...(profile('J-NDA') ?? [])].sort()).toEqual([...(profile('JNDA', 'jp') ?? [])].sort());
    expect([...(profile('NDA') ?? [])].sort()).toEqual([...(profile('NDA', 'fda') ?? [])].sort());
  });

  it('keeps the IND, NDA and BLA profiles the validator already enforced', () => {
    for (const type of ['IND', 'NDA', 'BLA']) {
      const shared = profile(type, 'fda');
      expect(shared, `${type} lost its profile in the move`).not.toBeNull();
      const validator = quickValidate([], type).missing.map((c) => c.replace(/^m/, ''));
      expect([...shared!].sort(), `${type}: the validator and the shared profile disagree`).toEqual(
        [...validator].sort(),
      );
      for (const code of requiredModule1CodesForRegion('fda', type.toLowerCase())) {
        expect(shared!.has(code), `${type}: FDA Module 1 ${code} dropped in the move`).toBe(true);
      }
    }
    // The application-specific bodies the validator enforced before the move.
    const ind = profile('IND')!;
    const nda = profile('NDA')!;
    const bla = profile('BLA')!;
    expect(ind.has('1.20') && ind.has('5.3.5') && !ind.has('2.5'), 'IND body changed').toBe(true);
    expect(nda.has('3.2.R') && nda.has('4.2.2') && nda.has('5.2'), 'NDA body changed').toBe(true);
    expect(bla.has('3.2.R') && !bla.has('4.2.2'), 'BLA body changed').toBe(true);
    expect(nda.has('3.2.A') && bla.has('3.2.A'), 'NDA/BLA lost 3.2.A in the move').toBe(true);
    // 3.2.R is the region's own slot: FDA's, not part of the harmonised MAA body.
    expect(profile('MAA')!.has('3.2.R')).toBe(false);
  });

  it('does not tell an MAA or J-NDA that a conditional appendix (3.2.A) is missing', () => {
    // 3.2.A.1 facilities (biotech), 3.2.A.2 adventitious agents, 3.2.A.3 novel
    // excipients: conditional (ICH M4Q, recall). The record has no conditional
    // Necessity for Modules 2-5 yet, so the shared ICH body leaves it out.
    expect(profile('MAA')!.has('3.2.A'), 'every small-molecule MAA told m3.2.A is missing').toBe(false);
    expect(profile('JNDA')!.has('3.2.A'), 'every small-molecule J-NDA told m3.2.A is missing').toBe(false);
  });

  /* EMA's eCTD guidance: no table of contents is required in eCTD, the XML
     backbone acts as one (regulator-text via search,
     g-required-sections-home-facts.md row 8). The MAA profile reads Module 1
     from the shared record (shared/regulatory/regional-module1.ts via
     server/services/regional-ctd-templates.ts), where EU 1.1 is notInEctd. */
  it('does not demand an EU 1.1 table of contents of an eCTD MAA', () => {
    expect(profile('MAA', 'eu')!.has('1.1')).toBe(false);
  });

  it('is null — not another region’s set — where no profile exists', () => {
    expect(profile('NDA', 'eu'), 'an "NDA" filed in the EU borrowed the FDA NDA set').toBeNull();
    expect(profile('IND', 'jp'), 'an IND filed in Japan borrowed the FDA IND set').toBeNull();
    expect(profile('MAA', 'fda'), 'an MAA filed with FDA borrowed the EU set').toBeNull();
    expect(profile('NDA', 'kr')).toBeNull();
    expect(profile('510K', 'fda')).toBeNull();
    expect(profile('IVDR', 'eu')).toBeNull();
    expect(profile('', 'fda')).toBeNull();
  });

  it('hands out a profile no caller can edit for everyone else', () => {
    const maa = profile('MAA', 'eu')!;
    try {
      (maa as Set<string>).add('9.9');
    } catch {
      /* a frozen set may throw; either way the next caller must not see it */
    }
    expect(profile('MAA', 'eu')!.has('9.9')).toBe(false);
  });
});

describe('ectd4-validator reads the shared profile', () => {
  it('assesses an EU MAA package against the EU profile', () => {
    const r = quickValidate([], 'MAA', 'EU');
    expect(r.assessed, 'an MAA quick check reported "not assessed"').toBe(true);
    expect(r.missing).toContain('m1.8.2');
    expect(r.missing).not.toContain('m1.3.3');

    const report = validatePackage([leaf('m1.0')], 'MAA', { region: 'EU' });
    expect(report.findings.some((f) => f.code === 'REQUIRED_SECTIONS_NOT_ASSESSED')).toBe(false);
    const missing = report.findings.filter((f) => f.code === 'MISSING_REQUIRED_SECTION');
    expect(missing.map((f) => f.sectionCode)).toContain('m1.8.2');
    expect(
      missing.every((f) => !/312\.23/.test(f.rule)),
      'an MAA missing section is cited to 21 CFR 312.23(a), the US IND regulation',
    ).toBe(true);
  });

  it('cites each profile’s own basis, not the IND regulation, on a missing NDA section', () => {
    const report = validatePackage([], 'NDA');
    const missing = report.findings.filter((f) => f.code === 'MISSING_REQUIRED_SECTION');
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((f) => !/312\.23/.test(f.rule))).toBe(true);
  });

  it('does not lend the FDA NDA set to an NDA validated for another region', () => {
    const report = validatePackage([leaf('m1.0')], 'NDA', { region: 'EU' });
    expect(report.summary.sectionsRequired).toBeNull();
    expect(report.findings.some((f) => f.code === 'REQUIRED_SECTIONS_NOT_ASSESSED')).toBe(true);
  });

  it('no longer carries its own copy of the profile', () => {
    const src = readFileSync(resolve(__dirname, '../ectd4-validator.ts'), 'utf8');
    expect(src, 'ectd4-validator.ts still declares requiredSectionsFor').not.toMatch(
      /function\s+requiredSectionsFor\s*\(/,
    );
    expect(src, 'ectd4-validator.ts still declares a Modules 2-5 list').not.toMatch(/_M2_M5\s*=/);
    expect(src, 'ectd4-validator.ts still declares module1Required').not.toMatch(
      /function\s+module1Required\s*\(/,
    );
  });
});
