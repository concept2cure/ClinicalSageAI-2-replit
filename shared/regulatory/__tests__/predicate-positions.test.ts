/**
 * The predicate strategy a 510(k) programme takes (founder's directive,
 * 2026-10-12).
 *
 * The interview asked for a predicate's name, number and manufacturer as three
 * required text boxes and never asked the question they presuppose. The gap
 * reached past this flow: the marking rules could say "you have named a
 * predicate, so a De Novo needs a basis" but not the stronger thing — "you
 * have said there is none, so a 510(k) is not the route" — because no
 * interview could state it, and an empty text box is an unanswered question.
 */
import { describe, expect, it } from 'vitest';

import {
  predicateOptions,
  predicatePositionFor,
  predicatePositions,
  predicateStateOf,
  WITHOUT_PREDICATE,
} from '../predicate-positions.js';

describe('the positions', () => {
  it('say what each commits the submission to, with the authority that recognises it', () => {
    for (const position of predicatePositions()) {
      expect(position.commits.length, position.value).toBeGreaterThan(40);
      expect(position.authority.trim(), position.value).not.toBe('');
      expect(position.commits.toLowerCase(), position.value).not.toBe(position.label.toLowerCase());
    }
    expect(predicateOptions().map(o => o.value)).toEqual(predicatePositions().map(p => p.value));
  });

  it('keeps one predicate apart from several, and names BOTH cases several covers', () => {
    expect(predicatePositionFor('single_predicate')!.commits).toMatch(/single legally marketed device/);
    const several = predicatePositionFor('multiple_predicates')!.commits;
    /* The 2014 guidance allows two cases and this named only the second until a
       review caught it: more than one intended use, each with its own
       predicate; or one intended use with features from several predicates
       that share it. */
    expect(several).toMatch(/more than one intended use/);
    expect(several).toMatch(/features taken from several predicates that share it/);
    expect(several, 'and says what it does not allow').toMatch(/indications from one and the technology from another/);
    expect(several).toMatch(/widens what FDA will compare/);
  });

  it('offers the split predicate and says FDA does not accept it', () => {
    /* A position that says plainly what taking it costs is worth more than its
       absence, which teaches nobody anything. */
    const split = predicatePositionFor('split_predicate')!;
    expect(split.commits).toMatch(/FDA does not accept this/);
    /* The consequence the guidance actually states is a finding of not
       substantially equivalent. "Expect a Refuse to Accept decision" was an
       overstatement — an RTA is a completeness decision — and a review caught
       it. */
    expect(split.commits).toMatch(/not substantially equivalent/);
    expect(split.commits, 'the overstated consequence is gone').not.toMatch(/Refuse to Accept/);
    expect(split.authority).toMatch(/not permitted/);
  });

  it('distinguishes a reference device from a predicate', () => {
    expect(predicatePositionFor('reference_device_only')!.commits).toMatch(/not a basis for substantial equivalence/);
  });

  it('names the two conditions a De Novo has, each to ITS OWN subsection', () => {
    /* These were cited to each other's subsection until a review caught it.
       (ii) is the direct request, made without filing a 510(k) first; (i) is
       the route after an NSE determination on one already filed. */
    expect(predicatePositionFor('no_predicate')!.authority).toMatch(/513\(f\)\(2\)\(A\)\(ii\)/);
    expect(predicatePositionFor('nse_received')!.authority).toMatch(/513\(f\)\(2\)\(A\)\(i\);/);
    /* And the regulation at subpart level: 860.220 is the request's content. */
    for (const value of ['no_predicate', 'nse_received']) {
      expect(predicatePositionFor(value)!.authority, value).toMatch(/860 Subpart D/);
      expect(predicatePositionFor(value)!.authority, value).not.toMatch(/860\.220/);
    }
    expect(WITHOUT_PREDICATE).toEqual(['no_predicate', 'nse_received']);
  });

  it('holds nothing for a value it does not know', () => {
    expect(predicatePositionFor('whatever')).toBeNull();
  });
});

describe('what the answers say about the device being compared to', () => {
  it('reads a stated strategy', () => {
    expect(predicateStateOf({ strategy: 'no_predicate' })).toBe('none');
    expect(predicateStateOf({ strategy: 'nse_received' })).toBe('nse');
    expect(predicateStateOf({ strategy: 'single_predicate' })).toBe('named');
    expect(predicateStateOf({ strategy: 'multiple_predicates' })).toBe('named');
  });

  it('reads a predicate named in any of the places a flow asks for one', () => {
    expect(predicateStateOf({ named: 'K123456' })).toBe('named');
    expect(predicateStateOf({ strategy: null, named: ' Acme Stent ' })).toBe('named');
  });

  it('says nothing where nothing was said, which is not the same as "there is none"', () => {
    expect(predicateStateOf({})).toBeNull();
    expect(predicateStateOf({ strategy: '', named: '   ' })).toBeNull();
    expect(
      predicateStateOf({ strategy: 'reference_device_only' }),
      'a reference device says a predicate was not claimed, not that none exists',
    ).toBeNull();
  });

  it('prefers the stated strategy over a name left in an earlier box', () => {
    /* A sponsor who answers "there is no predicate" after typing one has
       changed their position, and the newer statement is the answer. */
    expect(predicateStateOf({ strategy: 'no_predicate', named: 'K123456' })).toBe('none');
  });
});
