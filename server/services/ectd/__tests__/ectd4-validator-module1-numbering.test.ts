/**
 * The eCTD leaf validator asked for FDA Module 1 sections that mean other things.
 *
 * `IND_REQUIRED_SECTIONS` and its NDA/BLA siblings were hand-written literals
 * whose comments describe the EU/legacy CTD layout, applied to FDA codes. Read
 * against this repository's own FDA Module 1 model (`regional-ctd-templates`,
 * and the `ind:fda` rule pack), four of the IND entries name a different
 * heading than the comment beside them claims:
 *
 *   demanded   the comment said                     FDA v2.3 actually is
 *   m1.5       Table of Contents                    Application Status
 *   m1.6       Introductory Statement & Gen. Plan   Meetings          (real home 1.20)
 *   m1.7       Investigator's Brochure              not in the FDA profile at all
 *                                                                     (real home 1.14.4.1)
 *   m1.9       Environmental Assessment             Pediatric Administrative Information
 *                                                                     (real home 1.12.14)
 *
 * NDA/BLA carry the same m1.5, and NDA adds m1.15 "Annotated Labeling" where
 * FDA 1.15 is Promotional Material.
 *
 * So a correctly assembled IND is told it is missing four sections, under codes
 * that would have it file its Investigator's Brochure and general
 * investigational plan into headings meant for something else — and the
 * sections it genuinely must carry there (1.12.14, 1.14.4.1, 1.20) were never
 * asked for.
 *
 * Three further defects in the same required-section path, all of the same
 * family — a check that did not run reported as a check that passed:
 *
 *   - `requiredSectionsFor` returns an EMPTY set for every submission type
 *     other than IND/NDA/BLA, so `validatePackage` emits no
 *     MISSING_REQUIRED_SECTION findings and the package reads as complete. The
 *     empty set is deliberate (it avoids flagging IND sections on a non-IND);
 *     saying nothing about it is not.
 *   - `quickValidate` computes `required.size > 0 ? … : 100`, so those same
 *     submission types come back **100% complete having checked nothing**.
 *   - `quickValidate` matches with `present.has(req)` while `validatePackage`
 *     uses the prefix rule `anyLeafSatisfies`. A required NODE (m3.2.S) is
 *     satisfied by a placed leaf beneath it (m3.2.S.1); the prefix fix was
 *     applied to one and not the other, so the two disagree on the same
 *     package.
 */
import { describe, it, expect } from 'vitest';
import { quickValidate, validatePackage } from '../ectd4-validator';
import { getSubmissionRegionProfile } from '../../region-profiles/region-profile-service';

/** Every Module 1 code the US profile declares, with its heading. */
function usModule1Headings(): Map<string, string> {
  const profile = getSubmissionRegionProfile('fda');
  if (!profile) throw new Error('US region profile missing');
  const out = new Map<string, string>();
  const walk = (sections: any[]): void => {
    for (const s of sections) {
      out.set(String(s.number), String(s.title));
      if (s.childSections?.length) walk(s.childSections);
    }
  };
  walk(profile.module1Sections as any[]);
  return out;
}

/** The Module 1 codes a package of this type is told it must carry. */
function demandedModule1(submissionType: string): string[] {
  const { missing } = quickValidate([], submissionType);
  return missing.filter((c) => /^m1\./.test(c)).map((c) => c.slice(1));
}

describe('eCTD leaf validator — Module 1 codes mean what the FDA profile says', () => {
  const headings = usModule1Headings();

  it.each(['IND', 'NDA', 'BLA'])('%s asks only for headings the US profile declares', (type) => {
    const unknown = demandedModule1(type).filter((code) => !headings.has(code));
    expect(
      unknown,
      `these Module 1 codes are required of a ${type} but are not in this repo's FDA Module 1 profile`,
    ).toEqual([]);
  });

  it('never asks an NDA or BLA for Application Status either, nor an NDA for Promotional Material', () => {
    for (const type of ['NDA', 'BLA']) {
      expect(
        new Set(demandedModule1(type)).has('1.5'),
        `a ${type} is told to file 1.5 "${headings.get('1.5')}" as its table of contents`,
      ).toBe(false);
    }
    expect(
      new Set(demandedModule1('NDA')).has('1.15'),
      `an NDA is told to file 1.15 "${headings.get('1.15')}" as annotated labeling`,
    ).toBe(false);
  });

  it('never asks an IND for Application Status, Meetings or Pediatric Administrative Information', () => {
    /* The three that DO exist in the profile but mean something other than
       the comment beside them. Named individually because each one sends a
       filer to the wrong heading. */
    const demanded = new Set(demandedModule1('IND'));
    for (const code of ['1.5', '1.6', '1.9']) {
      expect(
        demanded.has(code),
        `an initial IND is told to file ${code} "${headings.get(code)}"`,
      ).toBe(false);
    }
  });

  it('asks for the Investigator’s Brochure and general plan where the FDA files them', () => {
    const demanded = new Set(demandedModule1('IND'));
    // 21 CFR 312.23(a)(5) IB, (a)(3) general investigational plan, 25.31 environmental.
    expect(demanded.has('1.14.4.1') || demanded.has('1.14.4') || demanded.has('1.14')).toBe(true);
    expect(demanded.has('1.20')).toBe(true);
    expect(demanded.has('1.12.14') || demanded.has('1.12')).toBe(true);
  });
});

describe('eCTD leaf validator — a check that did not run is never a pass', () => {
  it('does not report 100% complete for a type it has no required set for', () => {
    const r = quickValidate([], 'ANDA');
    expect(
      r.completeness,
      'an unassessed submission type came back 100% complete having checked nothing',
    ).not.toBe(100);
  });

  it('says so when it cannot assess a submission type', () => {
    const report: any = validatePackage(
      [
        {
          sectionCode: 'm1.1',
          title: 'Form FDA 356h',
          checksum: 'a'.repeat(32),
          checksumType: 'md5',
          operation: 'new',
          filePath: 'm1/us/11-forms/form-356h.pdf',
        },
      ] as any,
      'ANDA',
    );
    const said = JSON.stringify(report).toLowerCase();
    expect(
      /not assessed|no required-section|cannot assess|unknown submission type/.test(said),
      'the package validated clean without disclosing that no required-section check ran',
    ).toBe(true);
  });

  it('agrees with validatePackage that a placed child satisfies a required node', () => {
    /* m3.2.S is a NODE; nothing is ever written at the parent code. The prefix
       rule was added to validatePackage and not to quickValidate, so the two
       gave different answers for the same package. */
    const { missing } = quickValidate(['m3.2.S.1'], 'IND');
    expect(missing, 'a placed m3.2.S.1 leaf should satisfy the required m3.2.S node').not.toContain(
      'm3.2.S',
    );
  });
});
