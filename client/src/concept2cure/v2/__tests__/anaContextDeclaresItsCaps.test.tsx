// @vitest-environment jsdom
/**
 * A capped list handed to the narrator declares its total.
 *
 * Under CLAUDE.md Rule 2 the deterministic engine supplies the figures and the
 * model narrates. A list the narrator cannot tell is truncated is worse than no
 * list: asked "what needs attention?", the model answers over what it was given
 * and has no way to say "and more". The repo's shape for this is
 * total-beside-the-cap — `CommunicationCenter.tsx` publishes `total` next to
 * `items.slice(0, 10)`.
 *
 * `Rbm.tsx` published `attention: (bd.attention ?? []).slice(0, 8)` alone
 * (coverage review C-6), so a severity-ranked regulatory attention list with
 * nine items reached the narrator as eight, silently.
 *
 * NOTE ON THE FINDING: the review said item 9 was hidden from a READER. It was
 * not — `RbmSurfacesA.tsx` maps `board.attention` in full and the server applies
 * no cap. This is the narrator's view only, which is why the assertions below
 * are about the published context and not about the screen.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('the RBM attention context declares its cap', () => {
  const rbm = SRC('surfaces/Rbm.tsx');

  it('publishes the total and the shown count beside the capped list', () => {
    expect(rbm).toMatch(/attentionTotal:\s*\(bd\.attention \?\? \[\]\)\.length/);
    expect(rbm).toMatch(/attentionShown:\s*Math\.min\(ATTENTION_CONTEXT_CAP/);
  });

  it('states the ordering, so "the most severe" is not an assumption the model makes', () => {
    expect(rbm).toMatch(/attentionOrdering:\s*'severity-ranked/);
  });

  it('names the cap once instead of repeating a literal', () => {
    expect(rbm).toMatch(/const ATTENTION_CONTEXT_CAP = 8;/);
    // The bare literal must not come back beside the named constant.
    expect(rbm).not.toMatch(/attention: \(bd\.attention \?\? \[\]\)\.slice\(0, 8\)/);
  });
});

describe('a governed report renders every section', () => {
  const insights = SRC('surfaces/Insights.tsx');

  /* `ROReport` had a `compact` prop that truncated the document to
     `sections.slice(0, 2)` with no note AND suppressed the actions and the
     evidence disclosure. No caller passed it, so it was dormant — but the first
     caller to pass it would have rendered two sections of a sealed, governed
     report AS the report. The working agreement's answer for an unreachable
     branch whose replacement is the full view at the same call site is to
     remove it, not to leave it to be switched on by accident. */
  it('has no truncating branch left to switch on', () => {
    expect(insights).not.toMatch(/compact \? report\.sections\.slice/);
    expect(insights).not.toMatch(/\{!compact &&/);
    expect(insights).not.toMatch(/compact\?: boolean/);
  });

  it('takes the sections as they are', () => {
    expect(insights).toMatch(/const sections = report\.sections;/);
  });
});
