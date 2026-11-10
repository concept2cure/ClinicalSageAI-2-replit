// @vitest-environment jsdom
/**
 * J3 human test R9 (docs/evidence/HUMAN-TEST/J3/README.md): the build preview told an empty saved section
 * "Preserve existing section and text", and every draftable row "AnA can prepare a candidate only if this saved
 * section is empty", whatever the row held. A preview says what the build will do.
 *
 * What the build does (useAuthoringAssemblyBuild.ts): a saved section is kept as it is, a missing one is added with
 * the template's stored text, and AnA prepares a candidate only for a draftable section that is empty once built.
 * `row.content` is the saved text for a kept row and the template's text for an added one, so it decides both lines.
 */
import { describe, expect, it } from 'vitest';
import { assemblyRowWords } from '../AuthoringAssemblyBuild';

const base = { code: '2.5', title: 'Clinical overview', ordering: 0, aiDraftable: true, aiDraftableReason: 'Narrative', gaps: [] as string[] };
const kept = (content: string) => ({ ...base, content, disposition: 'preserve' as const, existingSectionId: 's1' });
const added = (content: string) => ({ ...base, content, disposition: 'append' as const });

describe('the build preview says what the build will do to each section', () => {
  it('a kept section with text, and one without', () => {
    expect(assemblyRowWords(kept('<p>Saved.</p>'), true)).toEqual({
      what: 'Kept as saved, with its text', ana: 'It holds text, so AnA prepares no candidate for it.' });
    expect(assemblyRowWords(kept('  '), true)).toEqual({
      what: 'Kept as saved; it has no text yet', ana: 'AnA prepares a candidate for it, for you to review.' });
  });

  it('an added section with the template text, and one without', () => {
    expect(assemblyRowWords(added('Template text.'), true)).toEqual({
      what: "Added, with the template's stored text", ana: 'It holds text, so AnA prepares no candidate for it.' });
    expect(assemblyRowWords(added(''), true)).toEqual({
      what: 'Added empty; scientific content is missing', ana: 'AnA prepares a candidate for it, for you to review.' });
  });

  it('a section AnA does not draft gives its reason, and without AnA there is no AnA line', () => {
    expect(assemblyRowWords({ ...added(''), aiDraftable: false, aiDraftableReason: 'Manual source preparation.' }, true).ana)
      .toBe('AnA drafting is unavailable: Manual source preparation.');
    expect(assemblyRowWords(kept(''), false).ana).toBeNull();
  });

  it('never says a section holds text it does not hold', () => {
    for (const r of [kept(''), kept(' \n ')]) expect(assemblyRowWords(r, true).what).not.toMatch(/with its text|and text/);
  });
});
