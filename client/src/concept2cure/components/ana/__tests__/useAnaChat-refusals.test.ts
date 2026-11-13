// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { streamRefusalText } from '../useAnaChat';

describe('AnA refusal recovery', () => {
  it('gives a sign-in recovery for HTTP 401 without blaming the network', () => {
    const message = streamRefusalText({ status: 401 });
    expect(message).toContain('Sign in again');
    expect(message).toContain('This message was not saved.');
    expect(message).not.toMatch(/unreachable|network|gateway/i);
  });

  it('gives an access recovery for HTTP 403 without blaming the network', () => {
    const message = streamRefusalText({ status: 403 });
    expect(message).toContain('access');
    expect(message).toContain('administrator');
    expect(message).not.toMatch(/unreachable|network|gateway/i);
  });

  it.each([new Error('A server failure'), { status: 500 }])('does not invent a cause for an unexplained failure', failure => {
    const message = streamRefusalText(failure);
    expect(message).toContain("couldn't complete this request");
    // A bare error may be a lost socket (unknown); an HTTP 500 came before the stream, so before the save.
    expect(message).toMatch(/could not confirm whether your message was saved|this message was not saved/);
    expect(message).not.toMatch(/unreachable|network|gateway/i);
  });

  it.each([
    [{ status: 503, code: 'GATEWAY_UNAVAILABLE' }, 'No AI provider is configured'],
    [{ status: 429, code: 'WEEKLY_LIMIT_EXCEEDED' }, 'weekly limit'],
    [{ status: 429 }, 'Too many AnA requests'],
  ])('keeps the specific explanation for %o', (failure, explanation) => {
    expect(streamRefusalText(failure)).toContain(explanation);
  });
});

describe('a classified gateway refusal says its cause (2026-11-06)', () => {
  const refused = (code: string, message: string, status?: number) =>
    Object.assign(new Error(message), { code, serverSent: true, ...(status ? { status } : {}) });

  it('a refused API key is named, not "try again"', () => {
    const text = streamRefusalText(refused('PROVIDER_KEY_REFUSED',
      "The AI provider (Anthropic) refused this deployment's API key, so the request was not answered. Retrying will not change this; an administrator must set a valid key."));
    expect(text).toContain("refused this deployment's API key");
    expect(text).toContain('saved in this conversation without an answer');
    expect(text).not.toMatch(/couldn't complete this request|Try again/);
  });

  it('an account with no credit left is named, not "try again"', () => {
    const text = streamRefusalText(refused('PROVIDER_ACCOUNT_REFUSED',
      "The AI provider (Anthropic) refused the request because this deployment's account has no credit or quota left. Retrying will not change this; an administrator must add credit to the provider account."));
    expect(text).toContain('no credit or quota left');
    expect(text).toContain('saved in this conversation without an answer');
    expect(text).not.toMatch(/couldn't complete this request|Try again/);
  });

  it('a qualified-model refusal sent as 403 is not told to sign in again', () => {
    const text = streamRefusalText(refused('MODEL_NOT_QUALIFIED',
      'No model approved for regulatory drafting and review is configured on this deployment for this request.', 403));
    expect(text).toContain('No model approved for regulatory drafting');
    expect(text).not.toMatch(/Sign in again/);
  });

  it('falls back to the generic line when the server sent no sentence', () => {
    expect(streamRefusalText(refused('PROVIDER_UNAVAILABLE', 'Stream error'))).toContain("couldn't complete this request");
  });
});

/*
 * Finding 86 of the S12 biotech sweep (2026-11-09): a first turn refused 503 GATEWAY_UNAVAILABLE was not saved, while
 * the refusal said "Prior turns are preserved". Every refusal now says what is true of THIS message. The server
 * refuses over HTTP before the stream opens, so before the conversation or the question is saved
 * (routes/ana-ri/stream.ts openSseStream, then getOrCreateThread and saveMessage). The run and conversation refusals
 * come as frames, still before the save. A gateway refusal comes from a model call, after the question was saved.
 */
describe('each refusal says whether this message was saved (finding 86)', () => {
  const frame = (code: string, message: string, status?: number) =>
    Object.assign(new Error(message), { code, serverSent: true, ...(status ? { status } : {}) });

  it('a deployment with no AI provider says this message was not saved', () => {
    const text = streamRefusalText({ status: 503, code: 'GATEWAY_UNAVAILABLE' });
    expect(text).toContain('No AI provider is configured');
    expect(text).toContain('This message was not saved.');
  });

  it.each([{ status: 401 }, { status: 403 }, { status: 429 }, { status: 429, code: 'WEEKLY_LIMIT_EXCEEDED' }, { status: 500 }])(
    'an HTTP refusal %o says this message was not saved', failure => {
      expect(streamRefusalText(failure)).toMatch(/not saved|not sent or saved|not taken or saved/);
      expect(streamRefusalText(failure)).not.toContain('saved in this conversation');
    });

  it.each([
    ['THREAD_UNAVAILABLE', 'This conversation could not be opened. Please retry.'],
    ['HISTORY_UNAVAILABLE', 'Earlier conversation could not be loaded. Please retry.'],
  ])('%s keeps the server sentence and says the message was not saved', (code, sentence) => {
    expect(streamRefusalText(frame(code, sentence))).toBe(`${sentence} This message was not saved.`);
  });

  it('a question the server could not save says so in its own words', () => {
    expect(streamRefusalText(frame('CONVERSATION_UNAVAILABLE', 'Your question could not be saved. Please retry.')))
      .toBe('Your question could not be saved. Please retry.');
  });

  it.each(['THREAD_UNAVAILABLE', 'HISTORY_UNAVAILABLE', 'CONVERSATION_UNAVAILABLE'])(
    '%s with no server sentence still says the message was not saved', code => {
      expect(streamRefusalText(frame(code, 'Stream error'))).toMatch(/not (be )?saved/);
    });

  it('a gateway refusal after the question was saved says it is kept without an answer', () => {
    const text = streamRefusalText(frame('PROVIDER_KEY_REFUSED', "The AI provider (Anthropic) refused this deployment's API key, so the request was not answered."));
    expect(text).toContain("refused this deployment's API key");
    expect(text).toContain('Your message is saved in this conversation without an answer.');
  });

  it.each([new Error('The stream ended before the turn finished'), frame('UNRELATED_FAILURE', 'private detail')])(
    'when it cannot be known, it says so and shows no server text: %o', failure => {
      const text = streamRefusalText(failure);
      expect(text).toContain('could not confirm whether your message was saved');
      expect(text).not.toContain('private detail');
    });

  it.each([
    { status: 401 }, { status: 403 }, { status: 429 }, { status: 500 }, { status: 503, code: 'GATEWAY_UNAVAILABLE' },
    { status: 429, code: 'WEEKLY_LIMIT_EXCEEDED' }, new Error('x'),
    frame('PROVIDER_KEY_REFUSED', 'Refused.'), frame('PLACEMENT_REFUSED', 'Refused.'), frame('PROVIDER_UNAVAILABLE', 'Stream error'),
    frame('THREAD_UNAVAILABLE', 'x'), frame('HISTORY_UNAVAILABLE', 'x'), frame('CONVERSATION_UNAVAILABLE', 'x'),
  ])('no refusal claims that turns are preserved: %o', failure => {
    expect(streamRefusalText(failure)).not.toMatch(/preserved/i);
  });
});
