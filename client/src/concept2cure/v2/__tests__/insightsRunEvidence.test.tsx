// @vitest-environment jsdom
/**
 * A run's Part 11 evidence is reachable, and says only what it can prove.
 *
 * `GET /runs/:id/seal` re-verifies a finalization against the audit chain in
 * four checks, and `GET /runs/:id/dependencies` records what each provider
 * contributed. Both sit inside the `/api/report-os/runs` prefix the insights
 * surface already claims, so both were callable since the 2026-10-01 review
 * built them — and neither had a caller. A sealed report re-opened from the
 * run history showed no seal, no signature and no sources.
 *
 * The verdict the suite cares most about is `not-verifiable`. It is the
 * ABSENCE of evidence — there is no verified chain record to check against —
 * and must read as its own state, not as a quieter "verified" and not as a
 * failure. Rendering absence of evidence as evidence is how a broken chain
 * stayed invisible (SECURITY-8 in that review).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { RunEvidence } from '../surfaces/InsightsRunEvidence';
import { sealFactRows, type RunSealView } from '../surfaces/insightsLibraryModel';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;
const boom = (status: number) => ({ ok: false, status, json: async () => ({ error: 'no' }) }) as unknown as Response;

const INTACT: RunSealView = {
  runId: 41,
  sealed: true,
  seal: { algorithm: 'sha256', contentHash: 'a'.repeat(64), atomCount: 18, sealedAt: '2026-10-02T09:05:00.000Z' },
  finalizedAt: '2026-10-02T09:05:00.000Z',
  signature: { signerName: 'R. Mehta', signedAt: '2026-10-02T09:05:00.000Z', meaning: 'approval' },
  finalization: { reason: 'Filed with the NDA submission package', meaning: 'approval', priorStatus: 'partial' },
  verification: {
    verdict: 'intact',
    checks: [
      { check: 'audit-chain', ok: true, detail: "The audit chain records seal aaaaaaaaaaaa…; the row links to the organisation's audit chain, and carries a valid HMAC seal." },
      { check: 'stored-seal', ok: true, detail: 'The stored seal agrees with the audit chain, field by field.' },
      { check: 'stored-document', ok: true, detail: 'The stored document hashes to the recorded seal, and its provenance atoms match.' },
      { check: 'signature', ok: true, detail: 'The electronic signature signed the seal the audit chain recorded.' },
    ],
  },
};

const NOT_VERIFIABLE: RunSealView = {
  ...INTACT,
  seal: { algorithm: null, contentHash: null, atomCount: null, sealedAt: null },
  signature: null,
  finalization: null,
  verification: {
    verdict: 'not-verifiable',
    checks: [
      { check: 'audit-chain', ok: false, detail: 'The finalization row holds no position on the audit chain, so the chain does not vouch for it.' },
      { check: 'stored-seal', ok: false, detail: 'Not checked: there is no verified record on the audit chain to compare it with.' },
    ],
  },
};

const MISMATCH: RunSealView = {
  ...INTACT,
  verification: {
    verdict: 'mismatch',
    checks: [
      { check: 'audit-chain', ok: true, detail: 'The audit chain records seal aaaaaaaaaaaa….' },
      { check: 'stored-document', ok: false, detail: 'The stored document no longer hashes to the recorded seal.' },
    ],
  },
};

const DEPS = [
  { id: 1, runId: 41, provider: 'submission_readiness', status: 'ok', blocker: null, observedAt: '2026-10-02T09:00:00.000Z' },
  { id: 2, runId: 41, provider: 'artifact_lifecycle', status: 'missing', blocker: 'No artifact lifecycle rows for this project.', observedAt: '2026-10-02T09:00:01.000Z' },
];

function serve(seal: RunSealView | 'fail', deps: unknown[] | 'fail' = DEPS) {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url.endsWith('/seal')) return seal === 'fail' ? boom(500) : ok({ data: seal });
    if (url.endsWith('/dependencies')) return deps === 'fail' ? boom(500) : ok({ data: deps });
    return ok({});
  });
}

/* Braces, not an implicit return. `mockReset()` returns the mock itself, and
   vitest invokes whatever a beforeEach RETURNS as a cleanup hook — so an
   implicit return calls `apiRequest()` bare after every test, with no url.
   homeNoFixtureProgram.test.tsx records the same trap; it cost that suite a
   phantom unhandled rejection pinned on an assertion that had already passed. */
beforeEach(() => {
  apiRequest.mockReset();
});
afterEach(() => cleanup());

/** Open the disclosure, which is what triggers the two reads. */
async function open() {
  render(<RunEvidence runId={41} />);
  fireEvent.click(screen.getByText(/Seal, signature and sources/));
  await waitFor(() => expect(apiRequest.mock.calls.length).toBeGreaterThan(0));
}

describe('a run’s evidence disclosure', () => {
  it('reads neither route until it is opened', () => {
    serve(INTACT);
    render(<RunEvidence runId={41} />);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('reads the seal and the dependencies once opened', async () => {
    serve(INTACT);
    await open();
    await waitFor(() => {
      const urls = apiRequest.mock.calls.map(([, u]) => String(u));
      expect(urls).toContain('/api/report-os/runs/41/seal');
      expect(urls).toContain('/api/report-os/runs/41/dependencies');
    });
  });
});

describe('the seal verdict', () => {
  it('an intact seal states the verdict, the four checks and the signature', async () => {
    serve(INTACT);
    await open();
    const seal = await screen.findByTestId('rl-seal');
    expect(seal.getAttribute('data-verdict')).toBe('intact');
    expect(within(seal).getByText('Seal verified')).toBeTruthy();
    // The server's own sentences, verbatim — more precise than a paraphrase.
    expect(within(seal).getByText(/stored document hashes to the recorded seal/)).toBeTruthy();
    expect(within(seal).getByText(/electronic signature signed the seal/)).toBeTruthy();
    // The 11.50 manifestation.
    expect(within(seal).getByText('R. Mehta')).toBeTruthy();
    expect(within(seal).getByText('approval')).toBeTruthy();
    expect(within(seal).getByText(/Filed with the NDA submission package/)).toBeTruthy();
  });

  it('"not verifiable" is its own state — neither a pass nor a failure', async () => {
    serve(NOT_VERIFIABLE);
    await open();
    const seal = await screen.findByTestId('rl-seal');
    expect(seal.getAttribute('data-verdict')).toBe('not-verifiable');
    expect(within(seal).getByText('Not verifiable')).toBeTruthy();
    // It must say that nothing is claimed, rather than implying either answer.
    expect(seal.textContent ?? '').toMatch(/nothing is claimed about\s+its seal either way/);
    expect(within(seal).queryByText('Seal verified')).toBeNull();
    expect(within(seal).queryByText('Seal does not verify')).toBeNull();
  });

  it('a mismatch says the document is withheld, not merely that a check failed', async () => {
    serve(MISMATCH);
    await open();
    const seal = await screen.findByTestId('rl-seal');
    expect(seal.getAttribute('data-verdict')).toBe('mismatch');
    expect(within(seal).getByText('Seal does not verify')).toBeTruthy();
    expect(seal.textContent ?? '').toMatch(/withheld/);
  });

  it('an unfinalized run says it carries no seal, rather than failing to verify one', async () => {
    serve({ ...INTACT, sealed: false });
    await open();
    expect(await screen.findByTestId('rl-seal-unsealed')).toBeTruthy();
    expect(screen.queryByTestId('rl-seal')).toBeNull();
  });

  it('a failed seal read claims nothing about the seal', async () => {
    serve('fail');
    await open();
    expect(await screen.findByTestId('rl-seal-error')).toBeTruthy();
    expect(screen.queryByText('Seal verified')).toBeNull();
    expect(screen.queryByTestId('rl-seal')).toBeNull();
  });
});

describe('what the report read', () => {
  it('lists each provider with its outcome, and the engine’s own blocker sentence', async () => {
    serve(INTACT);
    await open();
    const deps = await screen.findByTestId('rl-deps');
    expect(within(deps).getByText('submission_readiness')).toBeTruthy();
    expect(within(deps).getByText('artifact_lifecycle')).toBeTruthy();
    expect(within(deps).getByText('Not available')).toBeTruthy();
    expect(within(deps).getByText('No artifact lifecycle rows for this project.')).toBeTruthy();
  });

  it('no recorded providers says so, and does not imply the run read nothing', async () => {
    serve(INTACT, []);
    await open();
    const empty = await screen.findByTestId('rl-deps-empty');
    expect(empty.textContent ?? '').toMatch(/not the same as the run having read nothing/);
  });

  it('a failed dependency read is a failure, not an empty source list', async () => {
    serve(INTACT, 'fail');
    await open();
    expect(await screen.findByTestId('rl-deps-error')).toBeTruthy();
    expect(screen.queryByTestId('rl-deps-empty')).toBeNull();
  });
});

describe('sealFactRows — a field the record does not carry is omitted', () => {
  it('lists every recorded field of a full manifestation', () => {
    const terms = sealFactRows(INTACT).map((r) => r.term);
    expect(terms).toEqual([
      'Signed by', 'Signed at', 'Meaning', 'Reason given', 'Seal', 'Recorded on the chain',
    ]);
  });

  it('omits a missing signer rather than rendering it empty or invented', () => {
    const rows = sealFactRows({ ...INTACT, signature: { signerName: null, signedAt: null, meaning: null } });
    const terms = rows.map((r) => r.term);
    expect(terms).not.toContain('Signed by');
    expect(terms).not.toContain('Signed at');
    expect(terms).not.toContain('Meaning');
    // Nothing is a blank or a stand-in; every row that survives has a value.
    expect(rows.every((r) => r.value.trim().length > 0)).toBe(true);
    // And what IS recorded still shows.
    expect(terms).toContain('Seal');
  });

  it('a record with nothing recorded yields no rows at all', () => {
    const rows = sealFactRows({
      ...INTACT,
      seal: { algorithm: null, contentHash: null, atomCount: null, sealedAt: null },
      signature: null,
      finalization: null,
      finalizedAt: null,
    });
    expect(rows).toEqual([]);
  });

  it('marks the seal hash as mono so it is readable and wraps', () => {
    const seal = sealFactRows(INTACT).find((r) => r.term === 'Seal');
    expect(seal?.mono).toBe(true);
    expect(seal?.value).toMatch(/^sha256 a{64} · 18 provenance atoms$/);
  });
});
