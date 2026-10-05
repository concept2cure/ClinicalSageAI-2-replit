/**
 * Every registered copy of a CTD code/title pair agrees with the one record.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * Verified finding 33 (D2, 2026-10-05; docs/design/ANA_REGULATORY_RECORD.md §10,
 * R5). Two contracts held CTD trees to the record: the FDA Module 1 placement
 * contract in fda-module1-numbering.test.ts, and the Module 2–5 title checks in
 * ana-ctd-section-truth.test.ts. Each covered only the trees someone had listed
 * by hand, and each kept its rules inside its own test file, so a new registry
 * could not reuse them. Nothing anywhere would have noticed a registry that
 * called 2.7.3 "Summary of Clinical Safety": the only Module 2–5 title check
 * compared the three AnA prompt copies, and only for codes in
 * CTD_AUTHORING_GUIDANCE.
 *
 * The rules now live once, in tests/regulatory/ctd-contract.ts:
 *   - `violationsFor` — the FDA Module 1 contract (moved, with three amendments
 *     pinned below);
 *   - `m2to5Violations` — a Module 2–5 code must be a heading of the record
 *     (CTD_AUTHORING_GUIDANCE ∪ ich-m4-headings), and its title must not
 *     contradict the record's title;
 *   - `registryViolations` — both, for one registered copy.
 *
 * This file holds the contract's own pins, the record's self-checks, the copies
 * that agree with the record today, and the mutation that proves the check is
 * live. A copy that does NOT agree today gets its own file,
 * tests/regulatory/ctd-registry/<registry>.consistency.test.ts, written failing
 * first by the step that fixes it, so parallel lanes never share a test file.
 */
import { describe, it, expect } from 'vitest';

import {
  violationsFor,
  m2to5Violations,
  checkM2to5,
  registryViolations,
  retitled,
  CONTRADICTING_TERMS,
  type CtdRegistry,
  type TreeNode,
} from './ctd-contract';
import { CTD_AUTHORING_GUIDANCE } from '../../server/services/ind/ctd/authoring-guidance';
import { ICH_M4_HEADINGS, ichHeadingTitle } from '../../server/services/ind/ctd/ich-m4-headings';
import { normalizeCtdCode } from '../../shared/regulatory/section-code';
import { IND_SECTIONS } from '../../server/services/ind/ind-section-registry';
import { getAllINDSections } from '../../services/regulatory/ind-ectd-sections';
import { DOCUMENT_TEMPLATES } from '../../server/services/ana-ri/document-templates';
import { getWorkflow } from '../../server/services/ana-ri/workflow-orchestration';
import { getRequiredArtifacts } from '../../server/services/regulatory/requiredArtifactMatrix';

const FDA_M1_HELD_BY = 'tests/regulatory/fda-module1-numbering.test.ts';

/** `code` is `parent` or a heading beneath it — i.e. a CTD code, not a document's own numbering. */
function extendsCode(code: string | undefined, parent: string | undefined): boolean {
  const c = normalizeCtdCode(code);
  const p = normalizeCtdCode(parent);
  return c !== null && p !== null && (c === p || c.startsWith(`${p}.`));
}

/**
 * The registered copies that agree with the record today. Each names the file
 * that holds the copy, so the inventory ratchet
 * (scripts/ci/check-ctd-registry-inventory.mjs) can treat it as declared.
 */
const REGISTRIES: CtdRegistry[] = [
  {
    name: 'IND section registry (AnA plans, coverage, chat)',
    ownerPath: 'server/services/ind/ind-section-registry.ts',
    region: 'US',
    module1HeldBy: FDA_M1_HELD_BY,
    read: () => IND_SECTIONS.map((s) => ({ code: s.code, title: s.title })),
  },
  {
    name: 'deep IND eCTD map (project bootstrap, readiness, checklist)',
    ownerPath: 'services/regulatory/ind-ectd-sections.ts',
    region: 'US',
    module1HeldBy: FDA_M1_HELD_BY,
    read: () => getAllINDSections().map((s) => ({ code: s.code, title: s.title })),
  },
  {
    // A template's own section numbers are CTD codes only where they extend its
    // CTD primary code (2.5 → 2.5.4). A CSR's E3 numbering ("5.1 Independent
    // Ethics Committee") is not a CTD heading and is not read as one.
    name: 'AnA document templates (injected when a message names a document)',
    ownerPath: 'server/services/ana-ri/document-templates.ts',
    region: 'multi',
    read: () =>
      Object.values(DOCUMENT_TEMPLATES).flatMap((t) => [
        { code: t.primaryCode, title: t.displayName },
        ...t.sections
          .filter((s) => extendsCode(s.code, t.primaryCode))
          .map((s) => ({ code: s.code, title: s.heading })),
      ]),
  },
  {
    name: 'AnA submission workflows (IND / NDA / BLA)',
    ownerPath: 'server/services/ana-ri/workflow-orchestration.ts',
    region: 'US',
    module1HeldBy: FDA_M1_HELD_BY,
    read: () =>
      ['ind', 'nda', 'bla'].flatMap((type) =>
        getWorkflow(type)!.phases.flatMap((p) => p.steps).map((s) => ({ code: s.ctdSection, title: s.title })),
      ),
  },
  {
    name: 'required-artifact matrix (US IND / NDA / BLA bootstrap)',
    ownerPath: 'server/services/regulatory/requiredArtifactMatrix.ts',
    region: 'US',
    module1HeldBy: FDA_M1_HELD_BY,
    read: () =>
      ['US_IND', 'US_IND_AMENDMENT', 'US_NDA', 'US_BLA'].flatMap((registry) =>
        getRequiredArtifacts(registry).flatMap((a) => a.sectionCodes.map((code) => ({ code, title: a.label }))),
      ),
  },
];

const RECORD: TreeNode[] = [
  ...Object.values(CTD_AUTHORING_GUIDANCE).map((g) => ({ code: g.code, title: g.title })),
  ...ICH_M4_HEADINGS.map((h) => ({ code: h.code, title: h.title })),
];

describe('the shared Module 1 contract — amendments', () => {
  it.each([undefined, null, '', '   '])('an entry with no code (%j) is skipped, whatever its title says', (code) => {
    expect(violationsFor([{ code, title: 'IND cover letter' }])).toEqual([]);
    expect(violationsFor([{ code, title: 'Environmental analysis' }])).toEqual([]);
  });

  it('a node naming several Module 1 documents may sit at the heading that holds them all', () => {
    // FDA 1.4 References holds 1.4.1 letters of authorization and 1.4.2
    // statements of right of reference; one node for both belongs at 1.4.
    expect(violationsFor([{ code: '1.4', title: 'References — letters of authorization / right of reference' }])).toEqual([]);
    expect(violationsFor([{ code: 'm1.4', title: 'References (letter of authorization; right of reference)' }])).toEqual([]);
  });

  it('…but a node naming one document still files at that document’s heading, not at a parent', () => {
    // The defect fixed in the IND workflow on 2026-10-04: the IB at 1.14.
    expect(violationsFor([{ code: '1.14', title: "Investigator's Brochure" }])).toHaveLength(1);
    expect(violationsFor([{ code: '1.4', title: 'Letter of authorization' }])).toHaveLength(1);
    // Two documents under different headings, filed at one of them: still wrong.
    expect(violationsFor([{ code: '1.1', title: 'Cover Letter / FDA Form 1571' }]).join('\n')).toMatch(/cover letter files under 1\.2/);
  });

  it.each([
    ['1.3.2', 'Patent information', /1\.3\.2 is field copy certification/],
    ['1.3.5', 'Field copy certification', /1\.3\.5 is patent and exclusivity/],
    ['1.12.14', 'Pediatric study plan', /1\.12\.14 is environmental analysis/],
  ])('a node AT %s must carry the meaning FDA fixes for it (%s is caught)', (code, title, message) => {
    expect(violationsFor([{ code, title }]).join('\n')).toMatch(message);
  });

  it('the identity rules accept what those headings hold, and say nothing about a title-less code', () => {
    expect(
      violationsFor([
        { code: '1.3.2', title: 'Field copy certification' },
        { code: '1.3.5', title: 'Patent and exclusivity' },
        { code: '1.3.5', title: 'Patent information and certification' },
        { code: '1.12.14', title: 'Environmental analysis' },
        { code: '1.12.14', title: 'Claim of categorical exclusion' },
        { code: '1.12.14', title: '' },
        { code: '1.3.5', title: '' },
      ]),
    ).toEqual([]);
  });
});

describe('the Module 2–5 contract — a real heading, and a title that does not contradict it', () => {
  it.each([
    ['4.3.1', 'Single dose toxicity'],
    ['m4.3.1', 'MODULE 4.3.1 - SINGLE DOSE TOXICITY'],
    ['2.8', 'Regional summary'],
    ['5.3.8', 'Other study reports'],
  ])('%s is not a heading of the record', (code, title) => {
    expect(m2to5Violations([{ code, title }]).join('\n')).toMatch(/is not an ICH M4 heading/);
  });

  it.each([
    ['2.7.3', 'Summary of Clinical Safety', 'efficacy/safety'],
    ['2.7.3', 'Summary of Clinical Pharmacodynamics', 'the old orchestrator line'],
    ['2.7.4', 'Summary of Clinical Efficacy', 'efficacy/safety'],
    ['2.7.5', 'Summary of Clinical Safety', 'literature references, not a summary'],
    ['2.6.2', 'Pharmacokinetics Written Summary', 'pharmacology/pharmacokinetics'],
    ['2.6.6', 'Pharmacology Written Summary', 'toxicology/pharmacology'],
    ['2.6.3', 'Pharmacology Written Summary', 'written/tabulated'],
    ['2.5', 'Clinical Summary', 'overview/summary'],
    ['2.7', 'Clinical Overview', 'summary/overview'],
    ['3.2.S', 'Drug Product', 'substance/product'],
    ['m3.2.P', 'Drug Substance', 'product/substance'],
  ])('%s "%s" contradicts the record (%s)', (code, title) => {
    expect(m2to5Violations([{ code, title }]).join('\n')).toMatch(/contradicts the record/);
  });

  it('extra words are not contradictions, and neither is naming both members of a pair', () => {
    expect(
      m2to5Violations([
        { code: '2.7.3', title: 'Summary of Clinical Efficacy (2.7.3)' },
        { code: '2.7.3', title: 'Summary of Clinical Efficacy — pooled efficacy and safety-relevant endpoints' },
        { code: '2.7.2', title: 'Summary of Clinical Pharmacology Studies (pharmacokinetics and pharmacodynamics)' },
        { code: '2.5', title: 'Clinical Overview (a critical summary)' },
        { code: '3.2.P', title: 'CMC Drug Product (3.2.P)' },
        { code: '5.3.5.3', title: 'Integrated Summary of Safety (ISS)' },
        { code: '2.6.4', title: 'Pharmacokinetics Written Summary' },
        { code: '4.2.3.1', title: 'Single-dose toxicity studies' },
        { code: '2.4', title: 'Nonclinical data package' },
      ]),
    ).toEqual([]);
  });

  it('Module 1, code-less and non-code entries are not its business', () => {
    expect(
      m2to5Violations([
        { code: '1.2', title: 'Summary of Clinical Safety' },
        { code: undefined, title: 'Summary of Clinical Safety' },
        { code: 'IB', title: "Investigator's Brochure" },
        { code: 'E3 12.3.2', title: 'Safety narrative' },
      ]),
    ).toEqual([]);
  });

  it('Module 3 depth the record does not yet model is reported unchecked — neither passed nor failed', () => {
    // ich-m4-headings.ts holds the Module 3 skeleton only; 2.3.S.x and
    // 3.2.S.x.y belong to the CMC lane, which appends them to the same record.
    const result = checkM2to5([
      { code: '2.3.S.1', title: 'General Information' },
      { code: '3.2.S.1.1', title: 'Nomenclature' },
      { code: '3.2.A.1', title: 'Facilities and Equipment' },
      { code: '3.2.S.4.1', title: 'Specification' },
    ]);
    expect(result.violations).toEqual([]);
    expect(result.unchecked.map((n) => n.code)).toEqual(['2.3.S.1', '3.2.S.1.1', '3.2.A.1']);
  });
});

describe('the record checks against itself', () => {
  it('every heading of both halves is a heading, checked, and agrees with itself', () => {
    expect(RECORD.length).toBeGreaterThan(200);
    const m2to5 = RECORD.filter((n) => /^[2-5]/.test(n.code ?? ''));
    const result = checkM2to5(m2to5);
    expect(result.violations).toEqual([]);
    expect(result.unchecked).toEqual([]);
  });

  // The term that tells each heading from its siblings, per ICH M4E(R2) /
  // M4S(R2) / M4Q(R1) (basis: g-ctd-contract-and-consistency-facts.md). A
  // record title that lost it would make every copy that is right look wrong.
  it.each([
    ['2.5', 'overview'],
    ['2.7', 'summary'],
    ['2.7.3', 'efficacy'],
    ['2.7.4', 'safety'],
    ['2.7.5', 'literature'],
    ['2.6.2', 'pharmacology written'],
    ['2.6.3', 'pharmacology tabulated'],
    ['2.6.4', 'pharmacokinetics written'],
    ['2.6.6', 'toxicology written'],
    ['3.2.S', 'substance'],
    ['3.2.P', 'product'],
  ])('the record titles %s with "%s"', (code, words) => {
    expect(ichHeadingTitle(code)!.toLowerCase()).toContain(words);
  });

  it('every contradicting term is a word some record title carries', () => {
    const titles = RECORD.map((n) => n.title);
    for (const group of CONTRADICTING_TERMS) {
      for (const term of group) {
        expect(titles.some((t) => term.test(t)), String(term)).toBe(true);
      }
    }
  });
});

describe('registered copies agree with the record', () => {
  it.each(REGISTRIES.map((r) => [r.name, r] as const))('%s', (_name, registry) => {
    const nodes = registry.read();
    expect(nodes.length, `${registry.ownerPath} yields no entries`).toBeGreaterThan(0);
    expect(registryViolations(registry), registry.ownerPath).toEqual([]);
  });
});

describe('the check is live — a wrong 2.7.3 is caught wherever 2.7.3 is named', () => {
  const names273 = (r: CtdRegistry) => r.read().some((n) => normalizeCtdCode(n.code) === '2.7.3');

  it('retitling the record’s 2.7.3 "Summary of Clinical Safety" fails every registry that names 2.7.3', () => {
    const naming = REGISTRIES.filter(names273);
    expect(naming.length, 'no registered copy names 2.7.3; the mutation proves nothing').toBeGreaterThan(0);
    const mutated = retitled('2.7.3', 'Summary of Clinical Safety');
    for (const r of naming) {
      expect(registryViolations(r, { titleOf: mutated }).join('\n'), r.name).toMatch(/2\.7\.3 .*contradicts the record/);
      expect(registryViolations(r), r.name).toEqual([]);
    }
  });

  it('a copy that retitles 2.7.3 "Summary of Clinical Safety" fails against the real record', () => {
    for (const r of REGISTRIES.filter(names273)) {
      const wrong: CtdRegistry = {
        ...r,
        read: () =>
          r.read().map((n) => (normalizeCtdCode(n.code) === '2.7.3' ? { ...n, title: 'Summary of Clinical Safety (2.7.3)' } : n)),
      };
      expect(registryViolations(wrong).join('\n'), r.name).toMatch(/2\.7\.3 .*contradicts the record/);
    }
  });
});
