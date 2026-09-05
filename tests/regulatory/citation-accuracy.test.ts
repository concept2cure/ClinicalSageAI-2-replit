/**
 * Citation-accuracy regression guard.
 *
 * An adversarial FDA/ICH audit of the CTD authoring guidance and the lifecycle
 * document types surfaced a cluster of citation-to-subject mismatches (real
 * 21 CFR paragraph numbers pointing at the wrong subsection). Each was
 * remediated against the current eCFR. This test pins those specific
 * corrections so they cannot silently regress — it asserts the corrected
 * citation is present in the exact field it belongs to, and the superseded
 * (wrong) citation is gone from that same field.
 *
 * Scope is deliberately narrow: it guards the known-fixed points, not the whole
 * regulation. Broad "is every citation real" coverage is provided by the
 * adversarial SME audit, which a unit test cannot substitute for.
 */
import { describe, it, expect } from 'vitest';
import {
  CTD_AUTHORING_GUIDANCE,
  LIFECYCLE_DOCUMENT_TYPES,
  getLifecycleDocumentType,
} from '../../server/services/ind/ctd/index';

type Component = NonNullable<(typeof LIFECYCLE_DOCUMENT_TYPES)[number]['components']>[number];

function docType(id: string) {
  const dt = getLifecycleDocumentType(id);
  expect(dt, `lifecycle document type "${id}" must exist`).toBeTruthy();
  return dt!;
}

function component(id: string, code: string): Component {
  const dt = docType(id);
  const c = (dt.components ?? []).find((x) => x.code === code);
  expect(c, `component "${code}" must exist on doc type "${id}"`).toBeTruthy();
  return c!;
}

/** All citation-bearing prose of a component, concatenated. */
function componentText(c: Component): string {
  const anyC = c as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof anyC.guidance === 'string') parts.push(anyC.guidance);
  if (typeof anyC.authoringGuidance === 'string') parts.push(anyC.authoringGuidance);
  if (Array.isArray(anyC.keyContentElements)) parts.push((anyC.keyContentElements as string[]).join('\n'));
  if (typeof anyC.generationPrompt === 'string') parts.push(anyC.generationPrompt);
  return parts.join('\n');
}

function keyElements(c: Component): string[] {
  const k = (c as Record<string, unknown>).keyContentElements;
  return Array.isArray(k) ? (k as string[]) : [];
}

function ctdSectionText(code: string): string {
  const s = CTD_AUTHORING_GUIDANCE[code] as Record<string, unknown> | undefined;
  expect(s, `CTD authoring guidance for "${code}" must exist`).toBeTruthy();
  const parts: string[] = [];
  if (typeof s!.guidance === 'string') parts.push(s!.guidance as string);
  if (typeof s!.authoringGuidance === 'string') parts.push(s!.authoringGuidance as string);
  if (Array.isArray(s!.keyContentElements)) parts.push((s!.keyContentElements as string[]).join('\n'));
  if (typeof s!.generationPrompt === 'string') parts.push(s!.generationPrompt as string);
  return parts.join('\n');
}

describe('citation-accuracy regression guard — 21 CFR / ICH corrections', () => {
  it('IND initial · Introductory Statement: country-withdrawal disclosure cites 312.23(a)(3)(iii), not (a)(3)(iv)', () => {
    const c = component('ind_initial', 'INTRO-GIP');
    const text = componentText(c);
    // (a)(3)(iii) is the withdrawal-for-safety/effectiveness disclosure;
    // (a)(3)(iv) is the following-year plan.
    expect(text).toContain('312.23(a)(3)(iii)');
    expect(text).not.toContain('312.23(a)(3)(iv)');
  });

  it('IND Annual Report · safety summary: cites 312.33(b)(1)-(4), not (b)(1)-(2)', () => {
    const c = component('ind_annual_report', 'annual.safety_summary');
    const text = componentText(c);
    expect(text).toContain('312.33(b)(1)-(4)');
    expect(text).not.toContain('312.33(b)(1)-(2)');
  });

  it('IND Annual Report · IND changes: cites (b)(6) preclinical, (b)(7) manufacturing, (e) Phase 1 mods — not (b)(3)-(5)', () => {
    const c = component('ind_annual_report', 'annual.ind_changes');
    const text = componentText(c);
    expect(text).toContain('312.33(b)(6)');
    expect(text).toContain('312.33(b)(7)');
    expect(text).toContain('312.33(e)');
    // the superseded, wrong grouping
    expect(text).not.toContain('312.33(b)(3)');
    expect(text).not.toContain('312.33(b)(5)');
  });

  it('IND Annual Report · admin section: no Part 56 obligation asserted; cites 312.33(f) and (g)', () => {
    const c = component('ind_annual_report', 'annual.admin');
    // 21 CFR 312.33 has NO IRB/Part 56 reporting element.
    expect(c.title).not.toContain('Part 56');
    for (const k of keyElements(c)) expect(k).not.toContain('Part 56');
    const guidance = (c as Record<string, unknown>).guidance as string;
    expect(guidance).toContain('312.33(f)');
    expect(guidance).toContain('312.33(g)');
    // The corrective note is allowed to *mention* Part 56 only to disclaim it.
    const authoring = (c as Record<string, unknown>).authoringGuidance as string;
    if (authoring.includes('Part 56')) {
      expect(authoring).toContain('no IRB/Part 56 reporting element');
    }
  });

  it('IND Annual Report · regulatoryBasis: no phantom Part 56 element', () => {
    const dt = docType('ind_annual_report');
    expect((dt.regulatoryBasis ?? []).join('\n')).not.toContain('Part 56');
  });

  it('Pre-NDA meeting · 312.47(b)(2) is glossed as "Other meetings", not end-of-Phase-2', () => {
    const dt = docType('pre_nda_meeting');
    const basis = (dt.regulatoryBasis ?? []).join('\n');
    expect(basis).toContain('312.47(b)(2)');
    expect(basis).toContain('Other meetings');
    expect(basis).not.toContain('312.47(b)(2) (end-of-Phase-2');
  });

  it('CTD 1.2 · is the cover letter, and no Module 1 guidance claims a table-of-contents heading (the eCTD backbone is the index)', () => {
    // FDA eCTD Module 1 Specification v2.3: 1.1 forms, 1.2 cover letters. The
    // former "1.2 Comprehensive Table of Contents" entry filed content under the
    // cover-letter heading and asserted a document eCTD does not carry.
    const text = ctdSectionText('1.2');
    expect(text.toLowerCase()).toContain('cover letter');
    const m1Titles = Object.values(CTD_AUTHORING_GUIDANCE)
      .filter((g) => g.module === 1)
      .map((g) => g.title.toLowerCase());
    expect(m1Titles.some((t) => t.includes('table of contents'))).toBe(false);
  });

  it('CTD 1.20 · general investigational plan cites 312.23(a)(3) and files at FDA heading 1.20', () => {
    const text = ctdSectionText('1.20');
    expect(text).toContain('312.23(a)(3)');
    expect(text).toContain('1.20');
  });

  it('CTD 1.14.4.1 · IB: 312.23(a)(5) enumerates content; 312.55 is the separate furnishing duty', () => {
    // The IB files at FDA heading 1.14.4.1 (investigator brochure), not 1.4.1
    // (letters of authorization).
    const text = ctdSectionText('1.14.4.1');
    expect(text).toContain('312.23(a)(5)');
    expect(text).toContain('312.55 separately obligates');
    // the prior text wrongly said the IB's content "is described in 312.55"
    expect(text).not.toContain('content is described in 312.55');
  });
});
