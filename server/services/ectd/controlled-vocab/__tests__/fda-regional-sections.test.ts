/**
 * FDA us-regional heading elements — a leaf below a published heading nests
 * under that heading, never under an invented element.
 *
 * Every reconciled IND tree files the transmittal forms at 1.1.1 / 1.1.2 /
 * 1.1.3 (below the published `1.1 forms` heading). The mapper used to emit
 * `<m1-1-1>` for those, an element the FDA regional structure does not define,
 * so the package validated locally (no DTD vendored) and would have failed the
 * agency validator on the first real submission.
 */
import { describe, it, expect } from 'vitest';
import {
  usRegionalSectionElement,
  usRegionalHeadingPlacement,
  nearestUsRegionalHeading,
  isKnownUsRegionalSection,
} from '../fda-regional-sections';
import { CV_CONTEXT_OF_USE } from '../cv-v4-data';

describe('usRegionalSectionElement', () => {
  it('maps a published heading to its element', () => {
    expect(usRegionalSectionElement('1.2')).toBe('m1-2-cover-letters');
    expect(usRegionalSectionElement('m1.6.1')).toBe('m1-6-1-meeting-request');
    expect(usRegionalSectionElement('1.20')).toBe('m1-20-general-investigational-plan-for-initial-ind');
  });

  it('nests a leaf below a published heading under that heading (the 1.1.x forms)', () => {
    expect(usRegionalSectionElement('1.1.1')).toBe('m1-1-forms');
    expect(usRegionalSectionElement('m1.1.3')).toBe('m1-1-forms');
    expect(usRegionalSectionElement('1.3.4.2')).toBe(usRegionalSectionElement('1.3.4'));
    expect(usRegionalSectionElement('1.14.4.1.2')).toBe(usRegionalSectionElement('1.14.4.1'));
  });

  it('never emits the invented per-form element the packager used to produce', () => {
    for (const code of ['1.1.1', '1.1.2', '1.1.3', '1.1.4']) {
      expect(usRegionalSectionElement(code)).not.toMatch(/^m1-1-[1-4]$/);
    }
  });

  it('reports the nearest published heading, or null when there is none', () => {
    expect(nearestUsRegionalHeading('1.1.2')).toBe('1.1');
    expect(nearestUsRegionalHeading('1.12.14')).toBe('1.12.14');
    // 1.3.1 is an ANCESTOR of published leaves (1.3.1.1 …), not a leaf itself.
    expect(nearestUsRegionalHeading('1.3.1')).toBeNull();
    expect(isKnownUsRegionalSection('1.3.1')).toBe(false);
  });

  it('keeps the derived fallback for a code with no published ancestor', () => {
    expect(usRegionalSectionElement('1.99')).toBe('m1-99');
  });
});

/**
 * Package-spine sweep F06 (2026-10-01): every heading is written directly under
 * <m1-regional>, and only a top-level one belongs there. A deeper heading's
 * parent element name is not recorded in this repository, so the placement
 * reports a gap instead of inventing one, and the bundle cannot claim
 * conformance for it.
 */
describe('usRegionalHeadingPlacement', () => {
  it('a top-level heading (or a section filed under one) is a placement this code can stand behind', () => {
    expect(usRegionalHeadingPlacement('1.2')).toEqual({ heading: '1.2', element: 'm1-2-cover-letters' });
    expect(usRegionalHeadingPlacement('m1.1.3')).toEqual({ heading: '1.1', element: 'm1-1-forms' });
  });

  it('a deeper heading is written directly under <m1-regional>, and the gap names every parent it should sit in', () => {
    const debarment = usRegionalHeadingPlacement('1.3.3');
    expect(debarment.element).toBe(usRegionalSectionElement('1.3.3'));
    expect(debarment.gap).toMatch(/^1\.3\.3 is written directly under <m1-regional>, not inside its parent heading 1\.3:/);
    expect(usRegionalHeadingPlacement('1.14.4.1').gap).toMatch(/parent heading 1\.14, 1\.14\.4:/);
  });

  it('1.18: the one recorded parent derives a name that encodes 1.18.1, so neither it nor its children can be stood behind', () => {
    expect(usRegionalHeadingPlacement('1.18').gap).toMatch(/<m1-18-1-naming>, a recorded name that does not encode 1\.18$/);
    expect(usRegionalHeadingPlacement('1.18.1').gap).toMatch(/1\.18 \(recorded as <m1-18-1-naming>\)/);
  });

  it('a section with no published heading gets the fallback element, and a gap saying it is not an FDA element', () => {
    expect(usRegionalHeadingPlacement('1.99')).toEqual({
      heading: '1.99', element: 'm1-99', gap: '1.99 has no published FDA heading, so <m1-99> is not an FDA heading element',
    });
  });

  it('of the 124 published headings, exactly the top-level four carry no gap', () => {
    const clean = CV_CONTEXT_OF_USE.codes
      .map((r) => r.code.replace(/^us_/, ''))
      .filter((s) => !usRegionalHeadingPlacement(s).gap);
    expect(clean).toEqual(['1.1', '1.2', '1.19', '1.20']);
  });
});
