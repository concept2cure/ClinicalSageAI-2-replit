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
  nearestUsRegionalHeading,
  isKnownUsRegionalSection,
} from '../fda-regional-sections';

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
