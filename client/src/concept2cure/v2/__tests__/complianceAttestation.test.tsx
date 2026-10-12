// @vitest-environment jsdom
/**
 * The audit-trail attestation is reachable, and never reports absence of
 * evidence as evidence.
 *
 * `GET /api/tenant-export/attestation` walks the tenant's audit hash chain,
 * recomputes every entry and HMAC-signs the verdict (21 CFR Part 11
 * §11.10(e)). It had no caller anywhere in the client, so the one report that
 * attests the RECORD is intact — rather than reporting what the record says —
 * could not be run by anyone.
 *
 * The distinction this suite exists to hold is stated in the service's own
 * interface: UNVERIFIABLE is "NOT a synonym for INTACT". Entries written before
 * the hash-chain trigger was applied carry no hash and can never honestly be
 * given one, so a trail that predates the chain has a period nobody can attest
 * to — permanently. A screen that rendered that as a pass, or that let an
 * INTACT verdict over a partly-hashed trail read as covering the whole history,
 * would be worse than having no screen at all.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AuditAttestation, coverageSentence, type AttestationReport } from '../surfaces/ComplianceAttestation';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;

const BASE: AttestationReport = {
  schemaVersion: '1.0',
  organization: { id: 1, slug: 'acme-bio', name: 'Acme Bio' },
  generatedAt: '2026-10-11T09:00:00.000Z',
  windowStart: '2026-01-01T00:00:00.000Z',
  windowEnd: '2026-10-11T09:00:00.000Z',
  totalEntries: 4821,
  hashedEntries: 4821,
  unhashedEntries: 0,
  brokenLinks: 0,
  brokenLinkSamples: [],
  firstSequenceNumber: 1,
  lastSequenceNumber: 4821,
  attestation: 'INTACT',
  signature: { algorithm: 'HMAC-SHA256', keyId: 'audit-export-2026', value: 'd'.repeat(64) },
};

function serve(report: Partial<AttestationReport> | { status: number }) {
  apiRequest.mockImplementation(async () => {
    if ('status' in report && typeof report.status === 'number') {
      const err = Object.assign(new Error('refused'), {
        name: 'ApiRequestError',
        status: report.status,
        payload: { error: 'Admin role required for attestation' },
      });
      throw err;
    }
    return ok({ ...BASE, ...report });
  });
}

/* Braces, not an implicit return: vitest invokes whatever a beforeEach returns
   as a cleanup hook, and `mockReset()` returns the mock itself. */
beforeEach(() => {
  apiRequest.mockReset();
});
afterEach(() => cleanup());

async function runIt() {
  render(<AuditAttestation canRun />);
  fireEvent.click(screen.getByRole('button', { name: /Run attestation/ }));
  return waitFor(() => expect(apiRequest).toHaveBeenCalled());
}

describe('the attestation panel', () => {
  it('does not walk the chain on mount — it records an audit row per pull', () => {
    serve({});
    render(<AuditAttestation canRun />);
    expect(apiRequest).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Run attestation/ })).toBeTruthy();
  });

  it('reads the attestation route', async () => {
    serve({});
    await runIt();
    expect(apiRequest.mock.calls.some(([m, u]) => m === 'GET' && u === '/api/tenant-export/attestation')).toBe(true);
  });
});

describe('a member who may not run reports', () => {
  it('is told, rather than offered a control the server will refuse', () => {
    serve({});
    render(<AuditAttestation canRun={false} />);
    expect(screen.getByTestId('attestation-readers')).toBeTruthy();
    // complianceReports.test.tsx asserts no /^Run/ control exists for a reader.
    expect(screen.queryByRole('button', { name: /^Run/ })).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('the verdict', () => {
  it('INTACT over a fully hashed trail says the verdict covers the whole trail', async () => {
    serve({});
    await runIt();
    const result = await screen.findByTestId('attestation-result');
    expect(result.getAttribute('data-verdict')).toBe('INTACT');
    expect(result.textContent ?? '').toMatch(/Audit trail: Intact/);
    expect((await screen.findByTestId('attestation-coverage')).textContent ?? '')
      .toMatch(/All 4,821 entries are hashed, so the verdict covers the whole trail/);
  });

  it('UNVERIFIABLE is not a pass, and says nothing is being claimed', async () => {
    serve({
      attestation: 'UNVERIFIABLE',
      hashedEntries: 0,
      unhashedEntries: 4821,
      unverifiableReason: 'No entry carries a record hash; the hash chain was never applied to this tenant.',
    });
    await runIt();
    const result = await screen.findByTestId('attestation-result');
    expect(result.getAttribute('data-verdict')).toBe('UNVERIFIABLE');
    expect(result.textContent ?? '').toMatch(/Not verifiable/);
    expect(result.textContent ?? '').toMatch(/not a statement that the trail is intact/);
    // Never the words of a pass.
    expect(result.textContent ?? '').not.toMatch(/Audit trail: Intact/);
    // And the server's own reason is shown.
    expect(result.textContent ?? '').toMatch(/the hash chain was never applied/);
  });

  it('EMPTY is not a pass either', async () => {
    serve({ attestation: 'EMPTY', totalEntries: 0, hashedEntries: 0, unhashedEntries: 0 });
    await runIt();
    const result = await screen.findByTestId('attestation-result');
    expect(result.textContent ?? '').toMatch(/No entries/);
    expect(result.textContent ?? '').toMatch(/not a statement that the trail is intact/);
    expect(result.textContent ?? '').not.toMatch(/Audit trail: Intact/);
  });

  it('BROKEN names the entries whose link does not recompute', async () => {
    serve({
      attestation: 'BROKEN',
      brokenLinks: 3,
      brokenLinkSamples: [
        { id: 'evt-900', sequenceNumber: 900 },
        { id: 'evt-1401', sequenceNumber: 1401 },
      ],
    });
    await runIt();
    const broken = await screen.findByTestId('attestation-broken');
    expect(broken.textContent ?? '').toMatch(/sequence 900 — entry evt-900/);
    expect(broken.textContent ?? '').toMatch(/sequence 1401 — entry evt-1401/);
    // The sample is smaller than the count, and the screen says so.
    expect(broken.textContent ?? '').toMatch(/2 of 3 shown/);
  });

  it('a verdict this screen does not recognise claims nothing about it', async () => {
    serve({ attestation: 'SOMETHING_NEW' as AttestationReport['attestation'] });
    await runIt();
    const result = await screen.findByTestId('attestation-result');
    expect(result.textContent ?? '').toMatch(/does not recognise/);
    expect(result.textContent ?? '').not.toMatch(/Audit trail: Intact/);
  });

  it('an admin-role refusal is a refusal, not an outage', async () => {
    serve({ status: 403 });
    await runIt();
    expect((await screen.findByRole('alert')).textContent ?? '').toMatch(/Admin role required/);
    // ErrorState would send the reader to retry a server that is working fine.
    expect(screen.queryByTestId('attestation-error')).toBeNull();
  });
});

describe('coverageSentence — an INTACT verdict never implies more than it covers', () => {
  it('states the split when part of the trail is unhashed', () => {
    const s = coverageSentence({ ...BASE, totalEntries: 1000, hashedEntries: 600, unhashedEntries: 400 });
    expect(s).toMatch(/600 of 1,000 entries are hashed/);
    expect(s).toMatch(/cannot honestly be attested to/);
    expect(s).toMatch(/would prove nothing about the period they cover/);
  });

  it('says plainly when no part of the trail can be attested to', () => {
    const s = coverageSentence({ ...BASE, totalEntries: 1000, hashedEntries: 0, unhashedEntries: 1000 });
    expect(s).toMatch(/None of the 1,000 entries carries a hash/);
    expect(s).toMatch(/no part of this trail can be attested to/);
  });

  it('says nothing to qualify when the trail is wholly hashed', () => {
    expect(coverageSentence(BASE)).toMatch(/covers the whole trail/);
  });

  it('has nothing to say about a trail with no entries', () => {
    expect(coverageSentence({ ...BASE, totalEntries: 0, hashedEntries: 0, unhashedEntries: 0 })).toBeNull();
  });
});
