// @vitest-environment jsdom
/**
 * The one client reading of the server's signed-content facet
 * (SignedContentState.tsx; server/services/part11/signed-content-state.ts),
 * pinned: the words for each state, the facet this client cannot read, and
 * when a line is drawn at all (D5, 2026-10-29;
 * docs/evidence/D5-SIGNED-CONTENT-ON-SCREEN/2026-10-29/).
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import {
  PRE_BINDING_BASIS,
  SignedContentLine,
  UNAVAILABLE_FACET,
  showsSignedContent,
  signedContentFacetOf,
  signedContentForAna,
  signedContentWords,
} from '../SignedContentState';

afterEach(() => cleanup());

const f = (state: string, over: Record<string, unknown> = {}) => signedContentFacetOf({
  state, signatureId: 1, signerName: 'Sam Signer', signedAt: '2026-10-29T10:00:00.000Z', meaning: 'approval',
  bindingBasis: 'risk-residual-acceptance-content-sha256', reason: null, ...over,
});

describe('the words', () => {
  it.each([
    ['matches', {}, 'Signed content unchanged'],
    ['changed', {}, 'Changed since it was signed'],
    ['unverified', { bindingBasis: PRE_BINDING_BASIS }, 'Signed before content binding; not verifiable'],
    ['unverified', {}, 'Signed; the signed content could not be verified'],
    ['withdrawn', {}, 'Signature withdrawn'],
    ['unsigned', {}, 'Not signed'],
    ['unavailable', {}, 'Signature state could not be read'],
  ])('%s (%o) is "%s"', (state, over, words) => {
    expect(signedContentWords(f(state, over))).toBe(words);
  });
});

describe('a facet this client cannot read is unavailable, never unsigned', () => {
  it.each([[null], [undefined], ['matches'], [[]], [{}], [{ state: 'signed' }], [{ state: 42 }]])('%o', (v) => {
    expect(signedContentFacetOf(v).state).toBe('unavailable');
  });

  it("AnA is told an unread state is not 'unsigned'", () => {
    expect(signedContentForAna(UNAVAILABLE_FACET)).toMatchObject({
      state: 'unavailable', note: 'The signature state was not read. This is not a statement that the record is unsigned.',
    });
    expect(signedContentForAna(null).state).toBe('unavailable');
    expect(signedContentForAna(f('matches'), true).state).toBe('reading');
  });
});

describe('when a line is drawn', () => {
  it('for a record expected to be signed, whatever its state, and while reading', () => {
    for (const s of ['matches', 'changed', 'unverified', 'withdrawn', 'unsigned', 'unavailable']) expect(showsSignedContent(f(s), true)).toBe(true);
    expect(showsSignedContent(null, true, true)).toBe(true);
  });

  it('for a record not expected to be signed, only when it carries a signature', () => {
    expect(showsSignedContent(f('unsigned'), false)).toBe(false);
    expect(showsSignedContent(f('unavailable'), false)).toBe(false);
    expect(showsSignedContent(null, false, true)).toBe(false);
    for (const s of ['matches', 'changed', 'unverified', 'withdrawn']) expect(showsSignedContent(f(s), false)).toBe(true);
  });

  it('draws nothing for an unsigned record not expected to be signed', () => {
    const { container } = render(<SignedContentLine facet={f('unsigned')} expected={false} label="Approval signature" />);
    expect(container.textContent).toBe('');
  });

  it('says the state in words beside its tone, then who signed and when', () => {
    const { container } = render(<SignedContentLine facet={f('changed', { reason: 'It changed.' })} expected label="Acceptance signature" />);
    const chip = container.querySelector('.rd-chip') as HTMLElement;
    expect(chip.className).toContain('tone-err');
    expect(chip.textContent).toBe('Changed since it was signed');
    expect(chip.querySelector('svg')).not.toBeNull();
    expect(container.textContent).toContain('Signed by Sam Signer · Approval · 2026-10-29 10:00:00 UTC');
    expect(container.textContent).toContain('It changed.');
  });

  it('a read in progress is said as such, not as a state', () => {
    const { container } = render(<SignedContentLine facet={null} expected reading label="Label signature" />);
    expect(container.textContent).toBe('Label signature: reading its state…');
  });
});
