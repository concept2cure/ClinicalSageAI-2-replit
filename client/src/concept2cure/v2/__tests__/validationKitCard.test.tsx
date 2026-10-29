// @vitest-environment jsdom
/**
 * The GAMP 5 validation package on administration's Settings (decision P-67).
 *
 * A regulated customer's computer-system-validation file is built from the
 * vendor's package, so the card may claim only what the documents are. Pinned:
 *
 * 1. Each document's status is its own header's, verbatim. The unmounted
 *    AdminConsole this replaces turned "DRAFT — UNSIGNED" into a "Draft" badge
 *    and a status it could not read into "Available".
 * 2. A failed read is shown as unread, never as an empty package. AdminConsole
 *    showed "Provided at contract — not yet self-serve" for both.
 * 3. A refused download says so, beside the list.
 * 4. The card is mounted where administration's Settings renders its cards.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import * as React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ValidationKitCard } from '../surfaces/ValidationKitCard';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const NOTE = 'These are the vendor’s validation documents as they stand.';
const PACKAGE = {
  artifacts: [
    { docId: 'VMP-001', type: 'Validation Master Plan', title: 'VMP-001 — Validation Master Plan', version: '0.4', status: 'DRAFT — UNSIGNED', sizeBytes: 10 },
    { docId: 'OQ-008', type: 'Operational Qualification', title: 'OQ-008 — CMC / Module 3', version: '0.10', status: 'DRAFT — UNSIGNED, NOT EXECUTED', sizeBytes: 10 },
    { docId: 'TM-001', type: 'Traceability Matrix', title: 'TM-001', version: null, status: null, sizeBytes: 10 },
  ],
  count: 3,
  note: NOTE,
};

let catalog: () => Response;
let download: () => Response;

beforeEach(() => {
  catalog = () => json(200, PACKAGE);
  download = () => new Response('# VMP-001', { status: 200 });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith('/api/validation-kit')) return catalog();
      if (url.includes('/api/validation-kit/')) return download();
      return json(404, { error: 'unexpected ' + url });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the validation package card', () => {
  it("shows each document's own status, verbatim, and says when a document records none", async () => {
    render(<ValidationKitCard />);
    await waitFor(() => expect(screen.getAllByTestId('validation-kit-document')).toHaveLength(3));
    const rows = screen.getAllByTestId('validation-kit-document').map(r => r.textContent ?? '');
    expect(rows[0]).toContain('VMP-001');
    expect(rows[0]).toContain('DRAFT — UNSIGNED');
    expect(rows[1]).toContain('DRAFT — UNSIGNED, NOT EXECUTED');
    expect(rows[2]).toContain('No status recorded in the document');
    const text = document.body.textContent ?? '';
    for (const claim of ['Available', 'Approved', 'Self-serve', 'Live']) expect(text).not.toContain(claim);
    expect(text).toContain(NOTE);
  });

  it('shows a failed read as unread, with the status, never as an empty package', async () => {
    catalog = () => json(500, { error: 'boom' });
    render(<ValidationKitCard />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be read'));
    expect(screen.getByRole('alert').textContent).toContain('HTTP 500');
    expect(screen.queryAllByTestId('validation-kit-document')).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/provided at contract|not available on this deployment/i);
  });

  it('reads again on Retry', async () => {
    catalog = () => json(503, { error: 'down' });
    render(<ValidationKitCard />);
    await waitFor(() => screen.getByRole('alert'));
    catalog = () => json(200, PACKAGE);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getAllByTestId('validation-kit-document')).toHaveLength(3));
  });

  it("shows the server's own words for an empty package", async () => {
    catalog = () => json(200, { artifacts: [], count: 0, note: 'Validation documents are not available on this deployment.' });
    render(<ValidationKitCard />);
    await waitFor(() => expect(document.body.textContent).toContain('not available on this deployment'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so when a download is refused', async () => {
    download = () => json(403, { error: 'no' });
    render(<ValidationKitCard />);
    await waitFor(() => screen.getAllByTestId('validation-kit-document'));
    fireEvent.click(screen.getByRole('button', { name: 'Download VMP-001' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('VMP-001 was not downloaded'));
  });
});

describe('where it is reached', () => {
  it("is one of administration's Settings cards, and nothing else renders the package", () => {
    const root = path.resolve(__dirname, '..');
    const settings = readFileSync(path.join(root, 'surfaces/AdminSettings.tsx'), 'utf8');
    expect(settings).toMatch(/import \{ ValidationKitCard \} from '\.\/ValidationKitCard'/);
    expect(settings).toMatch(/<ValidationKitCard \/>/);
    const surfaces = readFileSync(path.join(root, 'surfaces/AdminSurfaces.tsx'), 'utf8');
    expect(surfaces).not.toContain('/api/validation-kit');
    expect(surfaces).not.toMatch(/export function AdminConsole\b/);
  });
});
