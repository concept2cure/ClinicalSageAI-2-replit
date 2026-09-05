// @vitest-environment jsdom
/**
 * GatewayTransmittals — proves the "file to the agency" surface is wired to the
 * real dispatch layer (/api/mdx/gateways): lists gateways + the transmittal
 * log, transmits with the governed reason + §11 re-auth (server-gated), and
 * surfaces the 401 re-auth and 409 active-transmittal-lock rejections honestly.
 * C2CForm is stubbed to drive the wiring.
 *
 * It also pins two corrections to what this surface TELLS the user. It used to
 * say a downloaded acknowledgement was "the agency's actual bytes" — true only
 * for an FDA AS2 MDN; for the other twelve gateways the file is composed by this
 * platform from its own transmittal row, so a sponsor could archive a
 * self-authored document as agency proof of receipt. And it said a rollback
 * happened "at the gateway", which the code explicitly cannot do: it records a
 * status change in this platform's audit trail and makes no network call.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('../C2CForm', () => ({
  // One submit button per dialog; the values it submits depend on which form
  // was mounted, so the record-identifiers / assemble / transmit wiring can each
  // be driven end to end.
  C2CForm: ({ config, onSubmit }: any) => {
    const values =
      config.title === 'Record regulatory identifiers'
        ? { packageId: '77', applicationNumber: 'IND123456', applicantId: 'DUNS-123456789', applicantName: 'Acme Biologics Inc', reason: 'Recording the IND number assigned by CDER' }
        : config.title === 'Assemble bundle'
          ? { packageId: '77', region: 'FDA', sequence: '0001', reason: 'Assemble sequence 0001 for FDA' }
          : { region: 'fda', gateway: 'esg', packageId: '77', submissionType: 'original', reason: 'Dispatch sequence 0003 to FDA', password: 'pw', totp: '123456' };
    return <button data-testid="form-submit" onClick={() => onSubmit(values)}>{config.submitLabel}</button>;
  },
}));

import { GatewayTransmittals } from '../surfaces/GatewayTransmittals';

function env(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => ({ data }) } as Response;
}
function ackResponse(provenance: 'agency' | 'platform-record', body: string) {
  return {
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h.toLowerCase() === 'x-ack-provenance' ? provenance : null) },
    blob: async () => ({ size: body.length }),
    json: async () => ({}),
  } as unknown as Response;
}

const props = () => ({ surface: { id: 'gateway-transmittals', label: 'Dispatch' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const GATEWAYS = [{ region: 'fda', gateway: 'esg', name: 'FDA ESG', configured: true, environment: 'production' }];
const LOG = [{ id: 3, region: 'fda', gateway: 'esg', submission_type: 'original', transmission_id: 'ESG-XYZ', status: 'acknowledged', submitted_at: '2026-07-21T00:00:00Z', ack_received_at: '2026-07-21T01:00:00Z' }];

afterEach(() => cleanup());
beforeEach(() => {
  // jsdom implements neither; without them the download handler throws and the
  // catch reports a failure, so the toast under test never renders.
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:stub');
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
    if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
    // The real shape: the gateway result flattened onto data, tracking field transmissionId.
    if (method === 'POST' && url === '/api/mdx/gateways/fda/esg/transmit') return env({ transmittalId: 4242, transmissionId: 'ESG-NEW-1', status: 'received' }, 201);
    if (method === 'GET' && url === '/api/mdx/gateways/transmittals/3/status') return env({ status: 'acknowledged', gatewayState: 'DONE' });
    return env(null);
  });
});

describe('GatewayTransmittals — real dispatch layer', () => {
  it('lists gateways with credential status and the transmittal log', async () => {
    render(<GatewayTransmittals {...props()} />);
    expect(await screen.findByText('FDA ESG')).toBeTruthy();
    expect(screen.getByText('configured')).toBeTruthy();
    expect(screen.getByText('ESG-XYZ')).toBeTruthy();
    expect(screen.getByText('acknowledged')).toBeTruthy();
  });

  it('transmits with the governed reason + §11 re-auth and reports the gateway ref', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /^Transmit$/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/mdx/gateways/fda/esg/transmit');
      expect(call).toBeTruthy();
      const body = call![2] as any;
      expect(body.reason).toBe('Dispatch sequence 0003 to FDA');
      expect(body.reauth).toEqual({ password: 'pw', totp: '123456' });
      expect(body.packageId).toBe(77);
    });
    expect(await screen.findByText(/gateway ref ESG-NEW-1/)).toBeTruthy();
  });

  it('surfaces a 401 re-auth rejection honestly (nothing left the platform)', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'POST' && url.endsWith('/transmit')) return { ok: false, status: 401, json: async () => ({ error: 'ReAuth required' }) } as Response;
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /^Transmit$/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    expect(await screen.findByText(/re-authentication failed.*Nothing left the platform/)).toBeTruthy();
  });

  it('surfaces the 409 active-transmittal lock with the holder id', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      // The real error envelope: { error, details } — never a data key.
      if (method === 'POST' && url.endsWith('/transmit')) return { ok: false, status: 409, json: async () => ({ error: 'An active transmittal holds the lock', details: { transmittalId: 3, status: 'transmitting' } }) } as Response;
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /^Transmit$/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    expect(await screen.findByText(/transmittal #3 is already active/)).toBeTruthy();
  });

  it('renders the structural gate’s findings on a 422 (errors first) so the refusal is actionable, and clears them on the next attempt', async () => {
    // The 422 body carries the findings recorded on the stored bundle at
    // assembly. The toast alone showed only the summary line, so the operator
    // never saw WHICH rule refused — here, the one naming the identifiers still
    // to be recorded.
    const refuse = async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'POST' && url.endsWith('/transmit')) {
        return {
          ok: false, status: 422,
          json: async () => ({
            error: 'Bundle failed eCTD structural validation (1 error); re-assemble after fixing.',
            details: { findings: [
              { severity: 'info', ruleId: 'SUMMARY', message: '2 leaf(s), 0 empty' },
              { severity: 'error', ruleId: 'REGULATORY-IDENTIFIER-MISSING', message: 'The regional Module 1 backbone must carry the agency application number and applicant identity (missing package metadata: regulatory.applicationNumber). Record the real identifiers before transmitting.' },
            ] },
          }),
        } as Response;
      }
      return env(null);
    };
    apiRequest.mockImplementation(refuse);
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /^Transmit$/ }));
    fireEvent.click(screen.getByTestId('form-submit'));

    expect(await screen.findByText(/structural gate rejected the bundle/)).toBeTruthy();
    const card = await screen.findByRole('region', { name: 'Structural gate refusal' });
    expect(card.textContent).toMatch(/assemble the package again, then transmit/);
    expect(screen.getByText(/regulatory\.applicationNumber/)).toBeTruthy();
    // Errors are listed before informational findings.
    const chips = Array.from(card.querySelectorAll('.rd-chip')).map((c) => c.textContent);
    expect(chips).toEqual(['REGULATORY-IDENTIFIER-MISSING', 'SUMMARY']);

    // The refusal closed the drawer so the card is not under its overlay.
    expect(screen.queryByTestId('form-submit')).toBeNull();
    // The next attempt succeeds: the refusal card is gone, not left as stale state.
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST' && url.endsWith('/transmit')) return env({ transmittalId: 4243, transmissionId: 'ESG-NEW-2', status: 'received' }, 201);
      return refuse(method, url);
    });
    fireEvent.click(screen.getByRole('button', { name: /^Transmit$/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    expect(await screen.findByText(/gateway ref ESG-NEW-2/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Structural gate refusal' })).toBeNull();
  });

  it('records regulatory identifiers through the governed PUT route and says the cleared bundle must be assembled again', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'PUT' && url === '/api/submission-ops/packages/77/regulatory-identifiers') {
        return env({ packageId: 'pkg_77', changed: true, staleBundleCleared: true, ledgerWriteFailed: false });
      }
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /Record identifiers/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'PUT');
      expect(call).toBeTruthy();
      expect(call![1]).toBe('/api/submission-ops/packages/77/regulatory-identifiers');
      expect(call![2]).toMatchObject({ applicationNumber: 'IND123456', applicantId: 'DUNS-123456789', applicantName: 'Acme Biologics Inc', reason: 'Recording the IND number assigned by CDER' });
    });
    expect(await screen.findByText(/Identifiers recorded on package pkg_77.*cleared — assemble again before transmitting/)).toBeTruthy();
  });

  it('surfaces a refused identifier (400) with the server’s own reason, and records nothing', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'PUT') return { ok: false, status: 400, json: async () => ({ error: 'Identifier(s) do not meet the agency-identifier contract: applicationNumber.', code: 'REGULATORY_IDENTIFIER_INVALID', fields: ['applicationNumber'] }) } as Response;
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /Record identifiers/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    expect(await screen.findByText(/Not recorded — Identifier\(s\) do not meet the agency-identifier contract: applicationNumber\./)).toBeTruthy();
  });

  it('assembles through the canonical packager and reports the bundle as ready to transmit', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'POST' && url === '/api/submission-ops/packages/77/assemble') {
        return env({ packageId: 'pkg_77', bundle: { sha256: 'abcdef0123456789' + 'a'.repeat(48), leafCount: 4, validation: { errorCount: 0, warningCount: 1, infoCount: 1 } } });
      }
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /Assemble bundle/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/submission-ops/packages/77/assemble');
      expect(call).toBeTruthy();
      expect(call![2]).toEqual({ reason: 'Assemble sequence 0001 for FDA', region: 'FDA', sequence: '0001' });
    });
    // "Ready to transmit" would overclaim: the gate still checks region, size and opt-ins.
    expect(await screen.findByText(/Bundle assembled for pkg_77 · 4 leaves · 1 warning · sha256 abcdef012345\. No error-severity findings; the transmit gate still checks/)).toBeTruthy();
    expect(screen.queryByText(/Ready to transmit/)).toBeNull();
  });

  it('says so when the assembly’s governed-action ledger entry could not be written', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'POST' && url.endsWith('/assemble')) {
        return { ok: true, status: 200, json: async () => ({
          success: true, ledgerWriteFailed: true,
          ledgerWarning: 'The bundle was assembled, but its governed-action ledger entry could not be written. Record this assembly manually and raise it with your administrator before relying on the audit trail.',
          data: { packageId: 'pkg_77', bundle: { sha256: 'f'.repeat(64), leafCount: 3, validation: { errorCount: 0, warningCount: 0, infoCount: 1 } } },
        }) } as Response;
      }
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /Assemble bundle/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    expect(await screen.findByText(/ledger entry could not be written\. Record this assembly manually/)).toBeTruthy();
  });

  it('shows a bundle assembled WITH error findings in the findings card, fetched from preflight, and offers to record identifiers when that is the finding', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'POST' && url === '/api/submission-ops/packages/77/assemble') {
        return env({ packageId: 'pkg_77', bundle: { sha256: 'f'.repeat(64), leafCount: 2, validation: { errorCount: 1, warningCount: 0, infoCount: 1 } } });
      }
      if (method === 'POST' && url === '/api/submission-ops/packages/77/preflight') {
        return env({ findings: [
          { severity: 'info', ruleId: 'SUMMARY', message: '2 leaf(s)' },
          { severity: 'error', ruleId: 'REGULATORY-IDENTIFIER-MISSING', message: 'missing package metadata: regulatory.applicationNumber' },
        ] });
      }
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /Assemble bundle/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    const card = await screen.findByRole('region', { name: 'Packager refusal' });
    expect(card.textContent).toMatch(/1 error-severity finding; transmit will refuse it/);
    const chips = Array.from(card.querySelectorAll('.rd-chip')).map((c) => c.textContent);
    expect(chips).toEqual(['REGULATORY-IDENTIFIER-MISSING', 'SUMMARY']);
    // The card offers the fix for exactly this finding, prefilled for the same package.
    const fix = card.querySelector('button')!;
    expect(fix.textContent).toMatch(/Record identifiers/);
    fireEvent.click(fix);
    expect(screen.getByTestId('form-submit').textContent).toBe('Record');
  });

  it('renders a packager REFUSAL (422) with its findings', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'POST' && url.endsWith('/assemble')) {
        return { ok: false, status: 422, json: async () => ({ error: 'Refusing to package: 1 leaf could not be placed', code: 'PACKAGER_REFUSED', validation: { findings: [{ severity: 'error', ruleId: 'PACKAGER-REFUSED', message: 'cover.pdf has no heading' }] } }) } as Response;
      }
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /Assemble bundle/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    expect(await screen.findByText(/Not assembled — Refusing to package: 1 leaf could not be placed\./)).toBeTruthy();
    const card = await screen.findByRole('region', { name: 'Packager refusal' });
    expect(card.textContent).toMatch(/cover\.pdf has no heading/);
    expect(card.textContent).toMatch(/Resolve the findings, then assemble the package again/);
  });

  it('a transmit refusal that carries no findings (package never assembled) says so — never that findings were recorded on a bundle', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'POST' && url.endsWith('/transmit')) return { ok: false, status: 422, json: async () => ({ error: 'No assembled bundle; call POST /api/submission-ops/packages/:packageId/assemble first.', code: 'BUNDLE_NOT_ASSEMBLED' }) } as Response;
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /^Transmit$/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    const card = await screen.findByRole('region', { name: 'Structural gate refusal' });
    expect(card.textContent).toMatch(/No assembled bundle/);
    // The absence of an itemized list is stated as exactly that — never as
    // "no findings", which reads as an assessment result the empty array
    // cannot evidence (the empty-state gate flags that phrasing).
    expect(card.textContent).toMatch(/did not include an itemized findings list/);
    expect(card.textContent).not.toMatch(/recorded on the stored bundle/);
    expect(card.textContent).not.toMatch(/no findings/i);
  });

  it('says when the findings for an assembled-with-errors bundle could not be loaded, instead of an empty table under an error count', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'POST' && url.endsWith('/assemble')) return env({ packageId: 'pkg_77', bundle: { sha256: 'f'.repeat(64), leafCount: 2, validation: { errorCount: 3, warningCount: 0, infoCount: 1 } } });
      if (method === 'POST' && url.endsWith('/preflight')) return { ok: false, status: 409, json: async () => ({ gate: 'not_assembled', error: 'No assembled bundle; call assemble first.' }) } as Response;
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /Assemble bundle/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    const card = await screen.findByRole('region', { name: 'Packager refusal' });
    expect(card.textContent).toMatch(/3 error-severity findings/);
    expect(card.textContent).toMatch(/could not be loaded \(HTTP 409/);
    expect(card.querySelector('table')).toBeNull();
    // The badge does not read "0 findings" beside a sentence counting three.
    expect(card.querySelector('.s')?.textContent).toBe('findings unavailable');
  });

  it('a lost ledger entry on a SUCCESSFUL transmission is announced as an alert, never an unqualified success', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'POST' && url.endsWith('/transmit')) {
        return env({
          transmittalId: 4242, transmissionId: 'ESG-NEW-9', status: 'received', ledgerWriteFailed: true,
          ledgerWarning: 'The transmission completed, but its governed-action ledger entry could not be written. Record this transmittal manually and raise it with your administrator before relying on the audit trail.',
        }, 201);
      }
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /^Transmit$/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    const toast = await screen.findByText(/gateway ref ESG-NEW-9.*ledger entry could not be written/);
    expect(toast.closest('[role="alert"]')).not.toBeNull();
  });

  it('recording identifiers removes only the identifiers finding; an unrelated finding stays on the card', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'POST' && url.endsWith('/assemble')) return env({ packageId: 'pkg_77', bundle: { sha256: 'f'.repeat(64), leafCount: 2, validation: { errorCount: 2, warningCount: 0, infoCount: 0 } } });
      if (method === 'POST' && url.endsWith('/preflight')) return env({ findings: [
        { severity: 'error', ruleId: 'REGULATORY-IDENTIFIER-MISSING', message: 'missing regulatory.applicationNumber' },
        { severity: 'error', ruleId: 'LEAF-UNPLACED', message: 'Misc (misc-attachment): no placeable CTD section is declared.' },
      ] });
      if (method === 'PUT') return env({ packageId: 'pkg_77', changed: true, staleBundleCleared: true, ledgerWriteFailed: false });
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /Assemble bundle/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    const card = await screen.findByRole('region', { name: 'Packager refusal' });
    fireEvent.click(card.querySelector('button')!);
    fireEvent.click(screen.getByTestId('form-submit'));
    await screen.findByText(/Identifiers recorded on package pkg_77/);
    const after = screen.getByRole('region', { name: 'Packager refusal' });
    expect(after.textContent).toMatch(/The findings below remain from the last assembly and still stand/);
    expect(after.textContent).toMatch(/LEAF-UNPLACED/);
    expect(after.textContent).not.toMatch(/REGULATORY-IDENTIFIER-MISSING/);
  });

  it('recording identifiers from the card’s own button clears the card it came from, and a lost ledger entry is announced as an alert', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'POST' && url.endsWith('/assemble')) return env({ packageId: 'pkg_77', bundle: { sha256: 'f'.repeat(64), leafCount: 2, validation: { errorCount: 1, warningCount: 0, infoCount: 0 } } });
      if (method === 'POST' && url.endsWith('/preflight')) return env({ findings: [{ severity: 'error', ruleId: 'REGULATORY-IDENTIFIER-MISSING', message: 'missing regulatory.applicationNumber' }] });
      if (method === 'PUT') return env({ packageId: 'pkg_77', changed: true, staleBundleCleared: true, ledgerWriteFailed: true });
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('FDA ESG');
    fireEvent.click(screen.getByRole('button', { name: /Assemble bundle/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    const card = await screen.findByRole('region', { name: 'Packager refusal' });
    fireEvent.click(card.querySelector('button')!);
    fireEvent.click(screen.getByTestId('form-submit'));
    const toast = await screen.findByText(/The governance ledger could not be written/);
    expect(toast.closest('[role="alert"]')).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'Packager refusal' })).toBeNull();
  });

  it('polls the live gateway status for a transmittal', async () => {
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-XYZ');
    fireEvent.click(screen.getByRole('button', { name: /Status/ }));
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[1] === '/api/mdx/gateways/transmittals/3/status')).toBe(true));
    expect(await screen.findByText('gatewayState')).toBeTruthy();
    expect(screen.getByText('DONE')).toBeTruthy();
  });

  it('does not call a platform-composed record the agency\u2019s bytes', async () => {
    // The twelve non-FDA gateways return a document this platform wrote. The
    // toast must say so, and the download must not be named like a receipt.
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'GET' && url.endsWith('/ack')) return ackResponse('platform-record', 'CONCEPT2CURE TRANSMITTAL RECORD');
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-XYZ');
    fireEvent.click(screen.getByRole('button', { name: /ACK/ }));
    const toast = await screen.findByText(/NOT an agency acknowledgment/i);
    expect(toast).toBeTruthy();
    expect(screen.queryByText(/agency\u2019s actual bytes/i)).toBeNull();
  });

  it('does call a genuine agency MDN the agency\u2019s own bytes', async () => {
    // The one real agency artefact the platform holds must still read as one,
    // or the correction would make every download equally untrustworthy.
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'GET' && url.endsWith('/ack')) return ackResponse('agency', 'Disposition: automatic-action');
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-XYZ');
    fireEvent.click(screen.getByRole('button', { name: /ACK/ }));
    expect(await screen.findByText(/the agency\u2019s own bytes/i)).toBeTruthy();
  });

  it('does not claim a rollback retracted the submission at the agency', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/gateways') return env(GATEWAYS);
      if (method === 'GET' && url === '/api/mdx/gateways/transmittals') return env(LOG);
      if (method === 'POST' && url.endsWith('/rollback')) return env({ status: 'rolled_back', agencyRetractionRequired: true });
      return env(null);
    });
    render(<GatewayTransmittals {...props()} />);
    await screen.findByText('ESG-XYZ');
    fireEvent.click(screen.getByRole('button', { name: /Rollback/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    const toast = await screen.findByText(/agency still holds the transmitted bytes/i);
    expect(toast).toBeTruthy();
    expect(screen.queryByText(/rolled back at the gateway/i)).toBeNull();
  });
});
