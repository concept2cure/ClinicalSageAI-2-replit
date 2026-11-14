/** Private receipt/body checks split from the existing Codespaces doctor. */
const nonblank = value => typeof value === 'string' && !!value.trim();
export const providerTimeout = error => ['TimeoutError', 'AbortError'].includes(String(error?.name));

export async function providerJson(response) {
  try { return await response.json(); }
  catch (error) {
    // A body timeout must not turn HTTP 200 into model-use proof. An unreadable
    // non-2xx body still keeps its HTTP auth/rate-limit/model-refusal meaning.
    if (providerTimeout(error)) throw error;
    return null;
  }
}

export function unverifiedProviderResponse(provider, httpStatus) {
  return { status: 'blocked', code: provider + '_RESPONSE_UNVERIFIED', httpStatus,
    authenticationVerified: false, billingVerified: false,
    explanation: 'The provider response could not be verified. No completed model reply is established.' };
}

function servedModelMatches(actual, requested) {
  return nonblank(actual) && nonblank(requested) && (actual === requested ||
    (actual.startsWith(requested + '-') && /^(?:\d{8}|\d{4}-\d{2}-\d{2})$/.test(actual.slice(requested.length + 1))));
}

function hasReplyText(content, type) {
  return Array.isArray(content) && content.some(block => block?.type === type && nonblank(block.text));
}

// Narrow evidence for this synchronous text-only prompt, not a full SDK schema
// validator or a model/PQ approval. Raw fetch does not synthesize output_text.
export function readableOpenAIReply(body, model) {
  return body?.object === 'response' && nonblank(body.id) && servedModelMatches(body.model, model) &&
    body.status === 'completed' && body.error == null && body.incomplete_details == null &&
    Array.isArray(body.output) && body.output.some(item => item?.type === 'message' &&
      item.role === 'assistant' && item.status === 'completed' && hasReplyText(item.content, 'output_text'));
}

export function readableAnthropicReply(body, model) {
  return body?.type === 'message' && nonblank(body.id) && body.role === 'assistant' &&
    servedModelMatches(body.model, model) && body.stop_reason === 'end_turn' && body.error == null &&
    hasReplyText(body.content, 'text');
}
