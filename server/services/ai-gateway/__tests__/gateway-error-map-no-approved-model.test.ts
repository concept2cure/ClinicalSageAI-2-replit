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
import { APPROVED_MODELS } from '../../ai-governance/approved-models';

describe('classifyGatewayError — ModelNotApprovedError', () => {
  it('no-approved-model: says the deployment has no approved model, not "try again shortly"', () => {
    const c = classifyGatewayError(
      new ModelNotApprovedError('document_drafting', ['gpt-4o'], 'no-approved-model')
    );

    // A governance refusal, not an outage: its own code at 403 (ADR-0015, H3),
    // so nothing reads it as "the provider is down, retry".
    expect(c.code).toBe('MODEL_NOT_QUALIFIED');
    expect(c.message).not.toMatch(/try again shortly/i);
    expect(c.message).toMatch(/No model approved for regulatory drafting/);
    expect(c.message).toMatch(/configured on this deployment/);
    expect(c.message).not.toMatch(/!/);
  });

  // Walked 2026-11-06 with only an OpenAI key: the author read "an administrator needs to enable an approved model"
  // and could not tell that an OpenAI key is not one. /readyz named the providers; the conversation now does too,
  // from the same registry, so the sentence cannot drift from what is approved.
  it('no-approved-model: names the providers whose models are approved, from the registry', () => {
    const c = classifyGatewayError(new ModelNotApprovedError('document_drafting', ['gpt-4o'], 'no-approved-model'));
    const providers = new Set(APPROVED_MODELS.filter(m => m.approvedForHighRisk).map(m => m.provider));
    expect(providers.size).toBeGreaterThan(0);
    expect(c.message).toMatch(/Regulatory drafting is approved only for models served by /);
    if (providers.has('anthropic')) expect(c.message).toContain('Anthropic');
    if (providers.has('bedrock')) expect(c.message).toContain('Amazon Bedrock');
    if (providers.has('vertex')) expect(c.message).toContain('Google Vertex AI');
    if (!providers.has('openai')) expect(c.message).not.toMatch(/OpenAI/);
    expect(c.message).toMatch(/enable one of those providers/);
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
