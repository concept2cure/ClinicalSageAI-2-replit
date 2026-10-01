/**
 * What an author is told when no approved model can draft (U3a).
 *
 * On an OpenAI-only deployment every Authoring draft is refused with
 * ModelNotApprovedError('no-approved-model'): every model approvedForHighRisk
 * in ai-governance/approved-models.ts is Claude. The message used to end
 * "Try again shortly." That is false — nothing changes with time; the
 * deployment has no approved model configured — and it sends an author into a
 * retry loop that cannot succeed. The message now says what is true.
 *
 * The 'explicit' refusal (a caller named an unapproved model) is a different
 * fact and keeps a different message: an approved model may well be
 * configured, so telling that caller "none is configured" would be the same
 * kind of false.
 */
import { describe, expect, it } from 'vitest';
import { ModelNotApprovedError } from '../gateway';
import { classifyGatewayError } from '../gateway-error-map';

describe('classifyGatewayError — ModelNotApprovedError', () => {
  it('no-approved-model: says the deployment has no approved model, not "try again shortly"', () => {
    const c = classifyGatewayError(
      new ModelNotApprovedError('document_drafting', ['gpt-4o'], 'no-approved-model')
    );

    expect(c.code).toBe('PROVIDER_UNAVAILABLE');
    expect(c.message).not.toMatch(/try again shortly/i);
    expect(c.message).toMatch(/No model approved for regulatory drafting/);
    expect(c.message).toMatch(/configured on this deployment/);
    expect(c.message).not.toMatch(/!/);
  });

  it('explicit: names the refusal of the requested model, and does not claim none is configured', () => {
    const c = classifyGatewayError(
      new ModelNotApprovedError('document_drafting', ['claude-sonnet-4'], 'explicit')
    );

    expect(c.code).toBe('PROVIDER_UNAVAILABLE');
    expect(c.message).toMatch(/approved for regulatory drafting/);
    expect(c.message).not.toMatch(/try again shortly/i);
    expect(c.message).not.toMatch(/configured on this deployment/);
  });
});
