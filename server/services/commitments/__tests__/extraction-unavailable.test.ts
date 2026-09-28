/**
 * A failed commitment extraction is not a document with no commitments in it.
 *
 * `extractCommitments` wrapped the whole gateway call and returned `[]` on ANY
 * failure — policy refusal, PII/PHI block, all-providers-failed, 429/500, no
 * configured provider — byte-identical to a document that genuinely contains no
 * PMR/PMC/REMS/Annex II obligation. `parseCommitmentsJson` did the same for a
 * truncated or refused completion. `POST /api/c2c/commitments/extract` then
 * answered HTTP 200 with `{ count: 0 }`.
 *
 * That is CLAUDE.md's "an error is never rendered as an empty result", on the
 * engine whose own module comment says a missed commitment is pure liability.
 * The same file already models the honest alternative: PATCH /:id/status sets
 * auditWriteFailed + auditWarning so "the gap travels with the response".
 *
 * Extraction now fails closed with a typed ExtractionUnavailableError, and the
 * pure parser gained a null-returning sibling so an UNREADABLE answer is
 * distinguishable from a genuine empty array.
 */
import { describe, it, expect, vi } from 'vitest';

const routeMock = vi.hoisted(() => vi.fn());
vi.mock('../../ai-gateway/gateway', () => ({ getGateway: () => ({ route: routeMock }) }));

import {
  extractCommitments,
  ExtractionUnavailableError,
  parseCommitmentsArrayOrNull,
  parseCommitmentsJson,
} from '../commitments-service';

const ONE = JSON.stringify([
  {
    direction: 'inbound', commitmentType: 'PMR', authority: 'FDA',
    title: 'Conduct a postmarketing study', description: 'PMR study',
    sourceQuote: 'The applicant must conduct a postmarketing study.', dueDateText: 'by 2027-12-31',
  },
]);

const DOC = 'A document long enough to pass the minimum-length guard for extraction.';

describe('parseCommitmentsArrayOrNull — unreadable is not empty', () => {
  it('returns null when the answer cannot be read as a JSON array', () => {
    expect(parseCommitmentsArrayOrNull('not json')).toBeNull();
    expect(parseCommitmentsArrayOrNull('{"not":"an array"}')).toBeNull();
    expect(parseCommitmentsArrayOrNull('')).toBeNull();
  });

  it('returns an empty array for a genuine empty result', () => {
    expect(parseCommitmentsArrayOrNull('[]')).toEqual([]);
  });

  it('parseCommitmentsJson keeps its original lenient contract', () => {
    // Unchanged for existing callers: unreadable still collapses to [].
    expect(parseCommitmentsJson('not json')).toEqual([]);
    expect(parseCommitmentsJson('[]')).toEqual([]);
  });
});

describe('extractCommitments — a failure is raised, never reported as none', () => {
  /* Harness note, established by elimination rather than assumed: with a
     file-level beforeEach that called into this hoisted mock, every failing-
     gateway case was marked failed with the mock's own error even though each
     assertion passed (verified by logging after every await). Neither an async
     vs synchronous throw nor mockReset vs mockClear changed that; removing the
     file-level hook did. So there is none, and the one case that asserts on the
     call count clears it locally. route() throws synchronously here, which
     reaches the same catch in extractCommitments as an async rejection would. */
  const gatewayDown = () =>
    routeMock.mockImplementation(() => {
      throw new Error('all providers failed');
    });

  it('throws when the gateway fails, instead of returning []', async () => {
    gatewayDown();
    await expect(extractCommitments(DOC)).rejects.toBeInstanceOf(ExtractionUnavailableError);
  });

  it('carries a stable error code for callers to branch on', async () => {
    gatewayDown();
    await expect(extractCommitments(DOC)).rejects.toMatchObject({
      code: 'COMMITMENT_EXTRACTION_UNAVAILABLE',
    });
  });

  it('carries the underlying reason, so the caller can say WHY', async () => {
    gatewayDown();
    await expect(extractCommitments(DOC)).rejects.toThrow(/all providers failed/);
  });

  it('throws when the model answer cannot be read', async () => {
    routeMock.mockResolvedValue({ content: 'I cannot help with that.' });
    await expect(extractCommitments(DOC)).rejects.toBeInstanceOf(ExtractionUnavailableError);
  });

  it('returns [] for an extraction that RAN and genuinely found none', async () => {
    routeMock.mockResolvedValue({ content: '[]' });
    await expect(extractCommitments(DOC)).resolves.toEqual([]);
  });

  it('returns the commitments when extraction succeeds', async () => {
    routeMock.mockResolvedValue({ content: ONE });
    const out = await extractCommitments(DOC);
    expect(out).toHaveLength(1);
    expect(out[0].commitmentType).toBe('PMR');
  });

  it('still short-circuits a document too short to extract from', async () => {
    routeMock.mockClear();
    await expect(extractCommitments('too short')).resolves.toEqual([]);
    expect(routeMock).not.toHaveBeenCalled();
  });
});
