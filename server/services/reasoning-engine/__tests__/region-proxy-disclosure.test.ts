/**
 * buildSubmissionStructure — a substituted region must say it was substituted.
 *
 * The reasoning engine holds rule data for three regions (fda, eu, jp).
 * REGION_ALIASES additionally maps nine other jurisdictions onto them —
 * Health Canada/CN/AU/BR/IN/KR/SG -> fda, MHRA/Swissmedic -> eu — and
 * REGISTRY_REGION_TO_ENGINE does the same for registry IDs. The result then
 * pushed only the NORMALIZED region and discarded the caller's raw string, so a
 * planner asking for Health Canada received:
 *
 *   { region: 'fda', supported: true, requiredSections: <FDA Module 1>,
 *     reviewClock: <PDUFA> }
 *
 * with nothing recording that a substitution had occurred — a Health Canada NDS
 * answered with "1.1 Forms (FDA 1571 for IND / FDA 356h for NDA/BLA)" and a
 * PDUFA clock. The module's own docstring promises unsupported regions are
 * reported "never fabricated", and the honest `supported: false` branch is
 * unreachable for all nine.
 *
 * These tests pin the disclosure. They fail against the pre-fix result, which
 * carried neither requestedRegion nor proxyForRequestedRegion nor a note.
 */
import { describe, it, expect } from 'vitest';
import { buildSubmissionStructure } from '../submission-structure';

describe('buildSubmissionStructure — cross-jurisdiction proxying is disclosed', () => {
  it('discloses that Health Canada is answered with FDA structure', () => {
    const s = buildSubmissionStructure(['health canada'], 'nda');
    const r = s.regions[0];
    expect(r.requestedRegion).toBe('health canada');
    expect(r.proxyForRequestedRegion).toBe(true);
    expect(r.note).toMatch(/no rule data for "health canada"/i);
    expect(r.note).toMatch(/NOT "health canada"'s own requirements/i);
    // The structure is still offered — the fix discloses, it does not withhold.
    expect(r.requiredSections?.length).toBeGreaterThan(0);
  });

  it.each([
    ['canada', 'fda'],
    ['mhra', 'eu'],
    ['tga', 'fda'],
    ['nmpa', 'fda'],
    ['swissmedic', 'eu'],
  ])('flags %s -> %s as a proxy', (raw, engine) => {
    const r = buildSubmissionStructure([raw], 'nda').regions[0];
    expect(r.region).toBe(engine);
    expect(r.proxyForRequestedRegion).toBe(true);
    expect(r.note).toBeTruthy();
  });

  it.each(['fda', 'us', 'united states', 'eu', 'ema', 'japan', 'pmda'])(
    'does NOT flag %s, which is the engine region itself',
    (raw) => {
      const r = buildSubmissionStructure([raw], 'nda').regions[0];
      expect(r.supported).toBe(true);
      expect(r.proxyForRequestedRegion).toBeUndefined();
      expect(r.note).toBeUndefined();
      expect(r.requestedRegion).toBe(raw);
    },
  );

  it('still reports a genuinely unknown region as unsupported', () => {
    const r = buildSubmissionStructure(['mars'], 'nda').regions[0];
    expect(r.supported).toBe(false);
    expect(r.requestedRegion).toBe('mars');
    expect(r.note).toMatch(/not in the reasoning-engine rule data/i);
  });
});
