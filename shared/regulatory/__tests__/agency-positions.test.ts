/**
 * The agency question is positions, drawn from the two governed region modules
 * (founder's directive, 2026-10-12).
 *
 * `primary_regulatory_agency` is the answer the rest of the platform keys on:
 * the region it names decides the Module 1 backbone, the validation profile,
 * the gateway, the dossier standard and which filings exist at all. The engine
 * declared it `agency_select`; nothing ever implemented that type, so it
 * reached the person as a free-text box.
 *
 * What these tests hold:
 *   - the two governed modules agree, in both directions, on which twelve
 *     regions exist — the same check the pathway catalogue runs against the
 *     filing registry;
 *   - the value is the canonical code, so the answer is keyable;
 *   - what filing with an agency commits the programme to is DERIVED from
 *     those rows, including what AnA does not hold for it — the 7-of-12
 *     Module 1 split and the 6-of-12 rule split are stated, not glossed;
 *   - an answer in any of the platform's four region vocabularies resolves,
 *     and one that belongs to none resolves to nothing rather than a guess.
 */
import { describe, expect, it } from 'vitest';

import { agencyFor, agencyOptions, agencyPositions, regionsNamed } from '../agency-positions.js';
import { REGION_IDENTITY, listCanonicalRegions } from '../region-identity.js';
import { REGION_PROFILES } from '../region-profiles.js';

describe('the agencies this platform configures', () => {
  it('are the canonical regions, in both directions', () => {
    const offered = agencyPositions().map(p => p.value);
    /* The two modules hold the same twelve in different orders — identity by
       its own table, profiles by reading order — so this compares the sets.
       The question is offered in the profiles' order. */
    expect([...offered].sort(), 'a region with a profile but no identity, or the reverse').toEqual(
      [...listCanonicalRegions()].sort(),
    );
    expect(offered).toEqual(REGION_PROFILES.map(p => p.region));
    expect(offered.length).toBe(12);
  });

  it('answer with the code the platform keys on, not a label', () => {
    const fda = agencyPositions().find(p => p.value === 'US')!;
    expect(fda.label).toBe('FDA — United States');
    expect(REGION_IDENTITY[fda.value].agency).toBe('FDA');
  });

  it('read an underscored registry name aloud', () => {
    expect(agencyPositions().find(p => p.value === 'CA')!.label).toBe('Health Canada — Canada');
    expect(agencyFor('CA')).toBe('Health Canada');
    expect(agencyFor('EU')).toBe('EMA');
  });
});

describe('what filing with an agency commits the programme to', () => {
  it('says the dossier standard the agency takes', () => {
    expect(agencyPositions().find(p => p.value === 'US')!.commits).toMatch(/Submissions are eCTD/);
    expect(agencyPositions().find(p => p.value === 'SG')!.commits, 'HSA takes ACTD').toMatch(/ACTD/);
    expect(agencyPositions().find(p => p.value === 'CN')!.commits, 'NMPA takes CTD').toMatch(/Submissions are CTD/);
  });

  it('says what AnA does NOT hold, which is the part nowhere else says', () => {
    /* 7 of 12 regions have a Module 1 checklist and 6 of 12 have their own
       validation rules. A sponsor is told which side of that line they are on
       BEFORE they choose, and the claim is read off the governed row rather
       than written per agency. */
    for (const position of agencyPositions()) {
      const identity = REGION_IDENTITY[position.value];
      expect(position.commits, position.value).toMatch(
        identity.market ? /AnA holds this agency’s Module 1 requirements/ : /AnA holds no Module 1 checklist/,
      );
      expect(position.commits, position.value).toMatch(
        identity.ruleRegion ? /validates against its own rule set/ : /no region-specific validation rules/,
      );
    }
    // And the two sides both exist, so neither branch is vacuous.
    const held = agencyPositions().filter(p => REGION_IDENTITY[p.value].market);
    expect(held.length).toBe(7);
    expect(agencyPositions().length - held.length).toBe(5);
  });

  it('never travels without saying something', () => {
    for (const option of agencyOptions()) {
      expect(option.commits.length, option.value).toBeGreaterThan(40);
      expect(option.label, option.value).toContain('—');
    }
  });
});

describe('the regions a set of answers names', () => {
  it('resolves every vocabulary the platform speaks, and de-duplicates', () => {
    expect(regionsNamed(['US'])).toEqual(['US']);
    expect(regionsNamed(['ema']), 'a gateway slug').toEqual(['EU']);
    expect(regionsNamed(['health_canada']), 'an agency name, mixed case in the registry').toEqual(['CA']);
    expect(regionsNamed(['EU', 'ema', 'eu'])).toEqual(['EU']);
    expect(regionsNamed(['US', 'pmda', 'mhra'])).toEqual(['US', 'JP', 'UK']);
  });

  it('resolves a value that belongs to no region to nothing, rather than a guess', () => {
    expect(regionsNamed(['who']), 'WHO prequalification is not a national filing').toEqual([]);
    expect(regionsNamed(['__other__'])).toEqual([]);
    expect(regionsNamed([null, undefined, 7, ''])).toEqual([]);
    expect(regionsNamed([])).toEqual([]);
  });
});
