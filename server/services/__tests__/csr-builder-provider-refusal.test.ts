/**
 * The CSR build and a provider that will not answer (walked 2026-11-10 in a Codespace-style environment, the provider
 * a strict stand-in for the Messages API).
 *
 * The build drafts each ICH E3 heading through the AI gateway (csr-builder.ts, csr/csr-draft-refusal.ts). When the
 * gateway or the provider refused a call, the builder caught the error, logged "AI drafting failed for section N" with no reason, and used the heading's
 * template, or nothing where the heading has none. Walked: the gateway's own per-minute limit refused the 50th call,
 * the build then ran through its remaining 70 headings in under a second with every call refused, and ended "failed
 * at 56%: §11.1, §11.2 … have no saved text". A refused key, an account with no credit, or the provider's own 429
 * read exactly the same way, so a person holding a key could not tell why nothing was drafted.
 *
 * Now a limit or an overload is waited out and the heading drafted again, and a refusal that waiting cannot change
 * stops the build on that heading with a typed reason. The headings already saved are kept, and building again
 * resumes at the heading that stopped.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { chat } = vi.hoisted(() => ({ chat: vi.fn() }));
vi.mock('../../lib/unified-ai-client.js', () => ({ ai: { chat } }));

import { draftCSRSectionWithProvenance, getICHE3Structure, type CSRBuildRequest } from '../csr-builder';
import { GatewayAllProvidersFailedError, GatewayNoProviderError, GatewayPolicyError, RateLimitError } from '../ai-gateway/gateway';
import { csrBuildFailureText } from '../csr/csr-job-runner';

const request: CSRBuildRequest = {
  organizationId: 7, projectId: 11, userId: 2,
  studyInfo: { title: 'Synthetic study', protocolNumber: 'SYN-001', phase: 'Phase 2', indication: 'Synthetic indication',
    sponsor: 'Synthetic sponsor', investigationalProduct: 'Synthetic product', studyDesign: 'Synthetic study design', primaryEndpoint: 'Synthetic endpoint' },
};
const section = () => getICHE3Structure().find(row => row.number === '7')!;
const DRAFT = { content: 'This report describes the Synthetic study of Synthetic product in Synthetic indication.',
  provider: 'anthropic', model: 'test-model', deterministic: false, finishReason: 'end_turn', usage: { totalTokens: 30 } };
const userLimit = () => new RateLimitError('User rate limit exceeded: 31/30 requests per minute',
  { scope: 'user', count: 31, limit: 30, windowMs: 60_000 });
const allFailed = (last: string) => new GatewayAllProvidersFailedError(`All AI providers failed. Tried: claude-opus-4, claude-opus-5. Last error: ${last}`);

/**
 * The draft's outcome with the builder's waits run to their end. Only setTimeout is faked: the builder loads the
 * gateway's classifier when a call first fails, and that import needs real turns of the event loop.
 */
async function settled<T>(work: Promise<T>): Promise<{ value?: T; error?: { code?: string; message: string } }> {
  let done = false;
  const outcome = work.then(value => ({ value }), error => ({ error })).finally(() => { done = true; });
  while (!done) {
    await vi.advanceTimersByTimeAsync(120_000);
    await new Promise(resolve => setImmediate(resolve));
  }
  return outcome;
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); chat.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

it('waits out the gateway\'s per-minute limit and drafts the heading, instead of saving its template', async () => {
  chat.mockRejectedValueOnce(userLimit()).mockResolvedValueOnce(DRAFT);
  const { value, error } = await settled(draftCSRSectionWithProvenance(section(), request));
  expect(error).toBeUndefined();
  expect(chat).toHaveBeenCalledTimes(2);
  expect(value).toMatchObject({ source: 'ai', model: 'test-model' });
});

it.each([
  ['the provider\'s own rate limit', '429 {"type":"error","error":{"type":"rate_limit_error","message":"This request would exceed the rate limit"}}'],
  ['an overloaded provider', '529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'],
])('waits out %s and drafts the heading', async (_name, last) => {
  chat.mockRejectedValueOnce(allFailed(last)).mockRejectedValueOnce(allFailed(last)).mockResolvedValueOnce(DRAFT);
  const { value } = await settled(draftCSRSectionWithProvenance(section(), request));
  expect(chat).toHaveBeenCalledTimes(3);
  expect(value).toMatchObject({ source: 'ai' });
});

it('stops the build when the limit never lifts, and says so', async () => {
  chat.mockRejectedValue(userLimit());
  const { value, error } = await settled(draftCSRSectionWithProvenance(section(), request));
  expect(value).toBeUndefined();
  expect(error?.code).toBe('CSR_DRAFTING_RATE_LIMITED');
  expect(chat.mock.calls.length).toBeGreaterThan(2);
});

it.each([
  ['a key the provider refuses', '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}', 'CSR_DRAFTING_KEY_REFUSED'],
  ['an account with no credit', '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}', 'CSR_DRAFTING_ACCOUNT_REFUSED'],
  ['a model the account cannot use', '404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-opus-5-5"}}', 'CSR_DRAFTING_ACCOUNT_REFUSED'],
])('stops the build on %s at once: waiting cannot change it', async (_name, last, code) => {
  chat.mockRejectedValue(allFailed(last));
  const { value, error } = await settled(draftCSRSectionWithProvenance(section(), request));
  expect(value).toBeUndefined();
  expect(error?.code).toBe(code);
  expect(chat).toHaveBeenCalledOnce();
  // The receipt carries the typed code only: no provider text, no part of a key.
  expect(error?.message).toBe(code);
});

it('stops the build when no provider is configured for drafting', async () => {
  chat.mockRejectedValue(new GatewayNoProviderError('No AI providers are configured'));
  const { error } = await settled(draftCSRSectionWithProvenance(section(), request));
  expect(error?.code).toBe('CSR_DRAFTING_PROVIDER_UNAVAILABLE');
});

it('a policy refusal of one heading\'s content keeps the build going: the heading keeps its template, with the reason', async () => {
  chat.mockRejectedValueOnce(new GatewayPolicyError('Request blocked by PII policy'));
  const { value, error } = await settled(draftCSRSectionWithProvenance(section(), request));
  expect(error).toBeUndefined();
  expect(value).toMatchObject({ source: 'template', model: null, lineage: { rejectedModelDraft: { reason: 'gateway_policy_refused' } } });
});

it('a reply cut off at the token ceiling is not saved as a draft', async () => {
  chat.mockResolvedValueOnce({ ...DRAFT, content: 'This report describes the Synthetic study of', finishReason: 'max_tokens' });
  const { value } = await settled(draftCSRSectionWithProvenance(section(), request));
  expect(value).toMatchObject({ source: 'template', model: null, lineage: { rejectedModelDraft: { reason: 'draft_truncated' } } });
});

it('gives the model room for its reasoning and the heading: the request asks for more than a 4,096-token ceiling', async () => {
  chat.mockResolvedValueOnce(DRAFT);
  await settled(draftCSRSectionWithProvenance(section(), request));
  const options = chat.mock.calls[0][1] as { maxTokens: number };
  expect(options.maxTokens).toBeGreaterThanOrEqual(16000);
});

it.each([
  ['CSR_DRAFTING_KEY_REFUSED', /refused this deployment.s API key/i],
  ['CSR_DRAFTING_ACCOUNT_REFUSED', /no credit|access to the drafting model/i],
  ['CSR_DRAFTING_RATE_LIMITED', /rate limit/i],
  ['CSR_DRAFTING_PROVIDER_UNAVAILABLE', /did not answer|no AI provider/i],
  ['CSR_DRAFTING_MODEL_NOT_QUALIFIED', /approved for regulatory drafting/i],
])('the build card says why a build stopped on %s, and that the saved sections are kept', (code, words) => {
  const text = csrBuildFailureText({ code, message: code, section: '9.1', at: '2026-11-10T00:00:00.000Z' });
  expect(text).toMatch(words);
  expect(text).toMatch(/§9\.1/);
  expect(text).toMatch(/sections already saved are kept/i);
  expect(text).not.toMatch(/refusal CSR_/);
});
