/**
 * The selector: what the person asked outranks what is on screen, nothing
 * loads on the screen alone when the program says the method is for something
 * else, and a turn holds a bounded number of skills — each passed-over skill
 * says why.
 */
import { describe, expect, it } from 'vitest';
import { matchTriggers, normalizeForMatch, selectSkills, type SelectableSkill } from '../selector';

function s(key: string, over: Partial<SelectableSkill> = {}): SelectableSkill {
  return {
    key,
    name: key,
    source: 'library',
    version: 1,
    contentHash: `hash-${key}`,
    triggers: [],
    instructions: `## Method\nThe ${key} method.`,
    tools: [],
    reviewState: 'unreviewed',
    disciplines: ['cmc'],
    useCases: ['drafting'],
    segments: [],
    therapeuticAreas: [],
    regions: [],
    submissionTypes: [],
    surfaces: [],
    documentTypes: [],
    replacedBy: null,
    addenda: [],
    ...over,
  };
}

describe('trigger matching', () => {
  it('matches whole phrases only', () => {
    const msg = normalizeForMatch('Our PKG of PK data and the shelf-life claim');
    expect(matchTriggers(msg, ['pk', 'pkg', 'shelf-life', 'shelf'])).toEqual(['pk', 'pkg', 'shelf-life', 'shelf']);
    expect(matchTriggers(normalizeForMatch('the pkgs'), ['pkg'])).toEqual([]);
  });

  it('reads typographic dashes and quotes as plain ones', () => {
    expect(matchTriggers(normalizeForMatch('the shelf‐life and “q1e”'), ['shelf-life', '"q1e"'])).toEqual([
      'shelf-life',
      '"q1e"',
    ]);
  });

  it('matches a trigger with punctuation, such as 510(k)', () => {
    expect(matchTriggers(normalizeForMatch('Is a 510(k) right for us?'), ['510(k)'])).toEqual(['510(k)']);
  });
});

describe('selection', () => {
  const stability = s('cmc.stability', { triggers: ['shelf life', 'stability'] });
  const cmc = s('cmc', { triggers: ['module 3', 'cmc'], surfaces: ['cmc'] });
  const predicate = s('device.substantial-equivalence', {
    triggers: ['predicate', '510(k)'],
    segments: ['device'],
    surfaces: ['submission-center'],
  });

  it('loads a skill the question names and none it does not', () => {
    const sel = selectSkills([stability, cmc, predicate], { message: 'How do we justify a 24-month shelf life?' });
    expect(sel.selected.map(x => x.skill.key)).toEqual(['cmc.stability']);
    expect(sel.selected[0].reasons[0]).toContain('"shelf life"');
    expect(sel.considered).toBe(3);
  });

  it('loads what is on screen when the question names nothing', () => {
    const sel = selectSkills([stability, cmc], { message: 'What should I do next?', surfaceId: 'cmc' });
    expect(sel.selected.map(x => x.skill.key)).toEqual(['cmc']);
    expect(sel.selected[0].contextOnly).toBe(true);
    expect(sel.selected[0].reasons).toContain('the cmc screen is open');
  });

  it('never loads on the screen alone a method the program says is for another segment', () => {
    const sel = selectSkills([predicate], {
      message: 'What should I do next?',
      surfaceId: 'submission-center',
      segments: ['pharma', 'biotech'],
    });
    expect(sel.selected).toEqual([]);
  });

  it('loads it when the person asks about it in words, and says the program differs', () => {
    const sel = selectSkills([predicate], {
      message: 'How does a 510(k) predicate argument work?',
      segments: ['pharma'],
    });
    expect(sel.selected.map(x => x.skill.key)).toEqual(['device.substantial-equivalence']);
    expect(sel.selected[0].reasons.join(' ')).toContain('loaded on the question though written for device');
  });

  it('loads at most one skill on the screen alone', () => {
    const other = s('cmc.other', { surfaces: ['cmc'] });
    const sel = selectSkills([cmc, other], { message: 'anything', surfaceId: 'cmc' });
    expect(sel.selected).toHaveLength(1);
    expect(sel.passedOver[0].why).toContain('only one skill is loaded on the screen alone');
  });

  it('holds three skills a turn and says why the fourth was passed over', () => {
    const many = ['a', 'b', 'c', 'd'].map(k => s(`cmc.${k}`, { triggers: [`term ${k}`] }));
    const sel = selectSkills(many, { message: 'term a, term b, term c and term d' });
    expect(sel.selected).toHaveLength(3);
    expect(sel.passedOver).toHaveLength(1);
    expect(sel.passedOver[0].why).toContain('3 closer matches');
  });

  it('keeps the turn within its character budget', () => {
    const big = s('cmc.big', { triggers: ['big'], instructions: 'x'.repeat(20000) });
    const big2 = s('cmc.big2', { triggers: ['big'], instructions: 'y'.repeat(20000) });
    const sel = selectSkills([big, big2], { message: 'big' }, { maxChars: 24000 });
    expect(sel.selected).toHaveLength(1);
    expect(sel.passedOver[0].why).toContain('budget');
  });

  it('loads a skill the person named, ahead of any match', () => {
    const sel = selectSkills([stability, cmc], { message: 'shelf life', invokedKeys: ['cmc'] });
    expect(sel.selected[0].skill.key).toBe('cmc');
    expect(sel.selected[0].invoked).toBe(true);
  });

  it('resolves any spelling of a submission type before comparing it', () => {
    const ind = s('submissions.ind-initial', { triggers: ['initial ind'], submissionTypes: ['US_IND'] });
    const sel = selectSkills([ind], { message: 'Plan the initial IND', submissionType: 'IND' });
    expect(sel.selected[0].reasons).toContain('the submission is US_IND');
  });

  it('breaks ties by the more specific skill, then by key, the same way every time', () => {
    const parent = s('cmc', { triggers: ['impurity'] });
    const child = s('cmc.impurities', { triggers: ['impurity'] });
    const a = selectSkills([parent, child], { message: 'impurity' }).selected.map(x => x.skill.key);
    const b = selectSkills([child, parent], { message: 'impurity' }).selected.map(x => x.skill.key);
    expect(a).toEqual(['cmc.impurities', 'cmc']);
    expect(b).toEqual(a);
  });
});
