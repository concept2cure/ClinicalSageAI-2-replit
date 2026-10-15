/**
 * us-regional.xml Module 1 headings: their order, and what the bundle claims
 * about them (package-spine sweep F06, 2026-10-01).
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `buildFdaBackbone` wrote one heading element per section directly under
 * `<m1-regional>` in the order the package happened to list its leaves, so a
 * package listing its cover letter first wrote `<m1-2-cover-letters>` before
 * `<m1-1-forms>`. And the bundle's `regionalBackbone.regionConformant` was
 * true for every FDA package, by region alone: a 1.3.3 heading written
 * directly under `<m1-regional>` instead of inside its 1.3 parent, a Form 1571
 * with no declared form type, and an `<applicant-info>` with no contacts were
 * all stamped conformant.
 *
 * What is NOT fixed, and why: nesting a 1.x.y heading inside its parent needs
 * the parent's element name, and the repository records none it can stand
 * behind (the heading table, controlled-vocab/fda-regional-sections.ts, is
 * derived from the v4.0 context-of-use list, which names only the headings
 * leaves file under). So such a heading stays where it was, and the bundle now
 * SAYS so instead of claiming conformance.
 */
import { describe, it, expect } from 'vitest';
import { packFda, only, childNames, FULL_CONTACT } from './support/fda-backbone';
import { usRegionalSectionElement } from '../../ectd/controlled-vocab/fda-regional-sections';

const el = usRegionalSectionElement;

describe('Module 1 headings are written in section order, whatever order the package lists them in', () => {
  it.each([
    { listed: ['1.2', '1.1', '1.3.3'], expected: ['1.1', '1.2', '1.3.3'] },
    // Component-wise, not lexicographic: 1.3 < 1.12 < 1.14.4.1, and 1.2 < 1.12.
    { listed: ['1.14.4.1', '1.12.1', '1.2', '1.3.3', '1.1'], expected: ['1.1', '1.2', '1.3.3', '1.12.1', '1.14.4.1'] },
  ])('listed $listed → written $expected', async ({ listed, expected }) => {
    const { doc } = await packFda({
      leaves: listed.map((s) => ({ ctdSection: s, fileName: `leaf-${s.replace(/\./g, '-')}.pdf` })),
    });
    expect(childNames(only(doc, 'm1-regional'))).toEqual(expected.map(el));
  });

  it('a sub-section still files under its published heading, and that heading takes its own place in the order', async () => {
    const { doc } = await packFda({
      leaves: [
        { ctdSection: '1.2', fileName: 'cover.pdf' },
        { ctdSection: '1.1.2', fileName: 'form1572.pdf' },
        { ctdSection: '1.1', fileName: 'form1571.pdf' },
      ],
    });
    expect(childNames(only(doc, 'm1-regional'))).toEqual(['m1-1-forms', 'm1-2-cover-letters']);
    expect(childNames(only(doc, 'm1-1-forms'))).toEqual(['leaf', 'leaf']);
  });
});

describe('regionConformant is decided by the structure built, not by the region', () => {
  it('a heading below the top level, written directly under <m1-regional>, is not conformant — and its parent is named', async () => {
    const { bundle } = await packFda({
      leaves: [{ ctdSection: '1.2', fileName: 'cover.pdf' }, { ctdSection: '1.3.3', fileName: 'debarment.pdf' }],
      contacts: [FULL_CONTACT],
    });
    expect(bundle.regionalBackbone?.regionConformant).toBe(false);
    expect(bundle.regionalBackbone?.conformanceGap).toMatch(/1\.3\.3 is written directly under <m1-regional>/);
    expect(bundle.regionalBackbone?.conformanceGap).toMatch(/parent heading 1\.3\b/);
  });

  it('a Module 1 forms leaf with no declared form type is not conformant — and the file is named', async () => {
    const { bundle } = await packFda({
      leaves: [{ ctdSection: '1.1', fileName: 'form1571.pdf' }, { ctdSection: '1.2', fileName: 'cover.pdf' }],
      contacts: [FULL_CONTACT],
    });
    expect(bundle.regionalBackbone?.regionConformant).toBe(false);
    expect(bundle.regionalBackbone?.conformanceGap).toMatch(/form1571\.pdf .*no declared form type/);
  });

  it('no applicant contact is not conformant: <applicant-info> has no <applicant-contacts>', async () => {
    const { bundle } = await packFda();
    expect(bundle.regionalBackbone?.regionConformant).toBe(false);
    expect(bundle.regionalBackbone?.conformanceGap).toMatch(/no <applicant-contacts>/);
  });

  it('a declared form that also ships as a 1.1 leaf is written twice with one ID — not conformant', async () => {
    const { bundle, xml } = await packFda({
      leaves: [{ ctdSection: '1.1', fileName: 'form1571.pdf' }, { ctdSection: '1.2', fileName: 'cover.pdf' }],
      contacts: [FULL_CONTACT],
      forms: { 'form1571.pdf': '1571' },
    });
    // The bytes the claim is about: the same leaf ID appears twice.
    const ids = [...xml.matchAll(/\bID="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length - new Set(ids).size).toBe(1);
    expect(bundle.regionalBackbone?.regionConformant).toBe(false);
    expect(bundle.regionalBackbone?.conformanceGap).toMatch(/form1571\.pdf is written twice/);
  });

  it('a declared form filed under another heading is written twice as well, and the gap names that heading', async () => {
    const { bundle } = await packFda({
      leaves: [{ ctdSection: '1.2', fileName: 'cover.pdf' }],
      contacts: [FULL_CONTACT],
      forms: { 'cover.pdf': '1571' },
    });
    expect(bundle.regionalBackbone?.conformanceGap).toMatch(/cover\.pdf is written twice, under <form> and under <m1-2-cover-letters>/);
  });

  /* The closest this code can come today. Top-level headings only, a contact
     with both a telephone and an email: and the ONE thing left is the
     telephone-number-type, whose FDA code list is not vendored (the verified F07
     record lists it as missing). So no FDA package built today claims
     conformance, and the status says exactly why. When that list is vendored and
     the attribute written, this backbone reports no gap and the classifier's
     `true` branch (regional-backbone-readiness.test.ts) is what it gets. */
  it('the closest this code can build is still not conformant, and the only gap named is the unvendored telephone-number-type', async () => {
    const { bundle, doc } = await packFda({
      leaves: [
        { ctdSection: '1.20', fileName: 'plan.pdf' },
        { ctdSection: '1.2', fileName: 'cover.pdf' },
      ],
      contacts: [FULL_CONTACT],
    });
    expect(childNames(only(doc, 'm1-regional'))).toEqual([el('1.2'), el('1.20')]);
    expect(bundle.regionalBackbone?.regionConformant).toBe(false);
    expect(bundle.regionalBackbone?.conformanceGap).toBe(
      'applicant contact "Jane Smith": <telephone> carries no telephone-number-type, whose FDA code list is not vendored here',
    );
  });
});
