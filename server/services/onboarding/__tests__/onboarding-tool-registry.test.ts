/**
 * Structural guarantee: onboarding exposes NO write-capable tool to the model.
 *
 * Separate from readiness.test.ts because this pulls in the full AnA tool tree
 * and must not share that file's database mock.
 */
import { describe, it, expect } from 'vitest';
import { ALL_ANA_TOOLS } from '../../ana/AnaToolDefinitions';

describe('onboarding AnA tools', () => {
  const names = ALL_ANA_TOOLS.map((t) => t.name);

  it('registers the read-only readiness tool', () => {
    expect(names).toContain('summarize_onboarding_readiness');
  });

  it('exposes NO model-callable onboarding commit', () => {
    // A commit tool could self-invoke inside the agentic loop, defeating the
    // human-approval gate the onboarding flow is built on. Applying proposals
    // must stay a human action through the governed endpoint.
    expect(names.filter((n) => /onboarding.*(commit|apply|write|save)/i.test(n))).toEqual([]);
  });

  it('describes the readiness tool as read-only so the model does not imply it can change things', () => {
    const tool = ALL_ANA_TOOLS.find((t) => t.name === 'summarize_onboarding_readiness')!;
    expect(tool.description.toLowerCase()).toContain('read-only');
    expect(tool.description).toMatch(/review and approve|never changes/i);
  });
});
