/**
 * Global agency tactics — the wisdom pack must now detect and surface tactics for
 * the major regulators a global biotech/pharma program touches beyond FDA/EMA
 * (PMDA, Health Canada, MHRA, TGA, NMPA, Swissmedic, ANVISA) plus global
 * MRCT/reliance sequencing. Each tactic must carry a basis and respect the tone
 * floor (no exclamation marks / emoji).
 */

import { describe, it, expect } from 'vitest';
import {
  AGENCY_TACTICS,
  detectRelevantTactics,
  buildAgencyTacticsBlock,
  getTactic,
} from '../agency-tactics';

const GLOBAL_IDS = [
  'g-pmda-japan',
  'g-health-canada',
  'g-mhra-uk',
  'g-tga-australia',
  'g-nmpa-china',
  'g-swissmedic',
  'g-anvisa-brazil',
  'g-global-sequencing',
];

describe('global agency tactics — presence and integrity', () => {
  it('registers every global-agency tactic in the aggregate', () => {
    for (const id of GLOBAL_IDS) {
      const t = getTactic(id);
      expect(t, `${id} must be registered`).toBeTruthy();
      expect(t!.basis.trim().length).toBeGreaterThan(0);
      expect(t!.tactic.trim().length).toBeGreaterThan(0);
    }
  });

  it('every tactic respects the tone floor (no exclamation marks or emoji)', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const t of AGENCY_TACTICS) {
      const text = `${t.situation} ${t.tactic} ${t.why} ${t.watchOut} ${t.basis}`;
      expect(text).not.toContain('!');
      expect(emoji.test(text)).toBe(false);
    }
  });
});

describe('global agency tactics — detection by agency name', () => {
  it.each([
    ['planning a PMDA consultation for our Japan filing', 'g-pmda-japan'],
    ['do we need a Health Canada pre-submission meeting', 'g-health-canada'],
    ['can we use the MHRA international recognition procedure', 'g-mhra-uk'],
    ['TGA registration leveraging our FDA approval', 'g-tga-australia'],
    ['NMPA China filing and HGR approval', 'g-nmpa-china'],
    ['do we file with Swissmedic separately from the EU', 'g-swissmedic'],
    ['ANVISA Brazil reliance pathway and GMP certification', 'g-anvisa-brazil'],
    ['global multi-region filing strategy and MRCT sequencing', 'g-global-sequencing'],
  ])('detects %s -> %s', (message, expectedId) => {
    const matched = detectRelevantTactics(message, {});
    expect(matched.map(t => t.id)).toContain(expectedId);
  });

  it('renders a non-empty block citing the agency pathway', () => {
    const block = buildAgencyTacticsBlock({ message: 'NMPA China filing and HGR approval' });
    expect(block.length).toBeGreaterThan(0);
    expect(block).toMatch(/E17|MRCT|overseas/i);
  });
});
