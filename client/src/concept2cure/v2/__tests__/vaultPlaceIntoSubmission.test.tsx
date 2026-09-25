// @vitest-environment jsdom
/**
 * Filing a vault document into a submission — the control that makes the
 * capability reachable.
 *
 * ── What is different about this dialog ──────────────────────────────────────
 * The authoring dialog beside it SNAPSHOTS: an authored document lives as
 * sections in a store the assembler has no branch for, so filing one means
 * copying its content into `coauthor_documents` and stating the derivation.
 *
 * A vault document is already a governed PDF in the store of record, and a leaf
 * can now name it directly (`document_uuid` + the resolver's `vault_documents`
 * branch). So the vault copy is filed AS ITSELF. The most important assertion
 * here is a negative one: no snapshot is written. A copy would be a second
 * artifact to keep in step with the vault, and the whole point of the uuid
 * column was not needing one.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { VaultPlaceIntoSubmission } from '../surfaces/VaultPlaceIntoSubmission';

const DOC_UUID = '22222222-2222-4222-8222-222222222222';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}
function refused(code: string, message: string) {
  return {
    ok: false,
    status: 400,
    json: async () => ({ error: { code, message } }),
  } as Response;
}

const SUBMISSIONS = [
  { id: 4, title: 'BX-301 NDA', applicationType: 'nda', primaryRegion: 'us', status: 'open' },
  { id: 5, title: 'BX-301 IRB package', applicationType: 'irb', primaryRegion: 'us', status: 'open' },
  { id: 6, title: 'OR-801 510(k)', applicationType: '510k', primaryRegion: 'us', status: 'open' },
];
const SEQUENCES = [
  { id: 9, sequenceNumber: '0000', type: 'original', status: 'draft', region: 'us' },
  { id: 10, sequenceNumber: '0001', type: 'amendment', status: 'frozen', region: 'us' },
];

/** Records every write so the "no snapshot" assertion can be made. */
let writes: Array<{ method: string; url: string; body: unknown }>;

function mockApi(onPut: (body: unknown) => Response = () =>
  ok({ id: 77, sectionCode: '3.2.P.8.3', title: 'CSR-201', lifecycleOp: 'new' })) {
  writes = [];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (method !== 'GET') writes.push({ method, url, body });
    if (method === 'GET' && url === '/api/submissions') return ok(SUBMISSIONS);
    if (method === 'GET' && /^\/api\/submissions\/\d+\/sequences$/.test(url)) return ok(SEQUENCES);
    if (method === 'PUT' && /\/sequences\/\d+\/leaves$/.test(url)) return onPut(body);
    return ok({});
  });
}

const props = () => ({
  documentUuid: DOC_UUID,
  documentTitle: 'CSR-201',
  onClose: vi.fn(),
  onPlaced: vi.fn(),
});

const REASON = 'Stability summary approved for this sequence';

/** Choose the submission, type a section code, and give the placement's reason. */
async function fillTarget(section = '3.2.P.8.3', submissionId = '4', reason = REASON) {
  const sub = await screen.findByLabelText('Target submission');
  fireEvent.change(sub, { target: { value: submissionId } });
  await screen.findByLabelText('Sequence');
  fireEvent.change(screen.getByLabelText(/^Section code/), { target: { value: section } });
  fireEvent.change(screen.getByLabelText(/^Reason for this placement/), { target: { value: reason } });
}

beforeEach(() => mockApi());
afterEach(() => cleanup());

describe('the vault copy is filed as itself', () => {
  it('names the vault document by uuid, on the vault_documents table', async () => {
    render(<VaultPlaceIntoSubmission {...props()} />);
    await fillTarget();
    fireEvent.click(screen.getByRole('button', { name: /place into submission/i }));

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    const put = writes.find((w) => w.method === 'PUT');
    expect(put, 'the leaf was never written').toBeTruthy();
    const body = put!.body as Record<string, unknown>;
    expect(body.documentTable).toBe('vault_documents');
    expect(body.documentUuid).toBe(DOC_UUID);
    // The integer key space belongs to the other stores; sending one would be
    // refused server-side and means the wrong thing here.
    expect(body.documentId).toBeUndefined();
    expect(body.sectionCode).toBe('3.2.P.8.3');
  });

  it('writes NO snapshot — that is the whole point of the uuid column', async () => {
    render(<VaultPlaceIntoSubmission {...props()} />);
    await fillTarget();
    fireEvent.click(screen.getByRole('button', { name: /place into submission/i }));

    await waitFor(() => expect(writes.some((w) => w.method === 'PUT')).toBe(true));
    // A copy into the authoring store would be a second artifact to keep in
    // step with the vault, which is exactly what filing by uuid avoids.
    expect(writes.some((w) => String(w.url).includes('/api/coauthor/documents'))).toBe(false);
    expect(writes.filter((w) => w.method === 'POST')).toEqual([]);
  });

  it('reports the leaf the server actually wrote', async () => {
    render(<VaultPlaceIntoSubmission {...props()} />);
    await fillTarget();
    fireEvent.click(screen.getByRole('button', { name: /place into submission/i }));
    expect(await screen.findByText(/Filed as leaf 3\.2\.P\.8\.3 in sequence 0000/)).toBeTruthy();
  });
});

describe('refusals are refusals', () => {
  it('surfaces the server verdict verbatim and never claims a placement', async () => {
    mockApi(() => refused('FORBIDDEN', 'Referenced document not found for this organization.'));
    render(<VaultPlaceIntoSubmission {...props()} />);
    await fillTarget();
    fireEvent.click(screen.getByRole('button', { name: /place into submission/i }));

    expect(await screen.findByText(/not found for this organization/i)).toBeTruthy();
    expect(screen.queryByText(/Filed as leaf/)).toBeNull();
  });

  it('writes nothing for a section code no document can be filed at', async () => {
    render(<VaultPlaceIntoSubmission {...props()} />);
    await fillTarget('3');
    // A bare module is a container, not a section — refused before any write,
    // by the same rule the write boundary and the packager apply. Matched on a
    // contiguous fragment: the typed value is interpolated into the sentence,
    // which splits it across text nodes.
    expect(await screen.findByText(/container, not a section/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /place into submission/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(writes.filter((w) => w.method === 'PUT')).toEqual([]);
  });
});

describe('the target picker is the shared one', () => {
  it('offers the draft sequence and disables the frozen one, saying why', async () => {
    render(<VaultPlaceIntoSubmission {...props()} />);
    const sub = await screen.findByLabelText('Target submission');
    fireEvent.change(sub, { target: { value: '4' } });
    await screen.findByLabelText('Sequence');

    const frozen = screen.getByRole('option', { name: /0001/ }) as HTMLOptionElement;
    expect(frozen.disabled, 'a frozen sequence cannot take a leaf').toBe(true);
    expect(screen.getByText(/leaves are immutable/i)).toBeTruthy();
  });
});

/**
 * The section code is judged in the chosen submission's OWN vocabulary.
 *
 * This dialog applied the CTD rule to every submission, while the server has
 * judged placements by submission type since d0da50de
 * (shared/regulatory/placement-vocabulary.ts): an IRB package files on artifact
 * slots, a 510(k) on eSTAR sections. So the dialog refused every valid IRB and
 * eSTAR placement — and it did so as a malformed-code error, which read as the
 * user's mistake rather than the dialog's.
 */
describe('the section code is judged in the submission type\'s vocabulary', () => {
  it('files a vault document into an IRB package at an IRB slot', async () => {
    mockApi((body) => ok({ id: 78, sectionCode: (body as { sectionCode: string }).sectionCode, title: 'ICF', lifecycleOp: 'new' }));
    render(<VaultPlaceIntoSubmission {...props()} />);
    await fillTarget('irb.consent', '5');
    const btn = screen.getByRole('button', { name: /place into submission/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(writes.some((w) => w.method === 'PUT')).toBe(true));
    expect((writes.find((w) => w.method === 'PUT')!.body as Record<string, unknown>).sectionCode).toBe('irb.consent');
  });

  it('refuses a CTD code in an IRB package, naming the IRB vocabulary', async () => {
    render(<VaultPlaceIntoSubmission {...props()} />);
    await fillTarget('3.2.P.8.3', '5');
    expect((screen.getByRole('button', { name: /place into submission/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(await screen.findByText(/This is an IRB submission. Section code "3.2.P.8.3" is not an IRB package slot/)).toBeTruthy();
    expect(writes).toEqual([]);
  });

  it('files into a 510(k) at an eSTAR section', async () => {
    mockApi((body) => ok({ id: 79, sectionCode: (body as { sectionCode: string }).sectionCode, title: 'DD', lifecycleOp: 'new' }));
    render(<VaultPlaceIntoSubmission {...props()} />);
    await fillTarget('estar.device-description', '6');
    const btn = screen.getByRole('button', { name: /place into submission/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('stays strict for an eCTD submission: an IRB slot is not a CTD section', async () => {
    render(<VaultPlaceIntoSubmission {...props()} />);
    await fillTarget('irb.consent', '4');
    expect((screen.getByRole('button', { name: /place into submission/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});

/**
 * Only a PDF can be filed. The packager's vault branch refuses a leaf whose
 * bytes do not begin with %PDF- (leaf-source-resolver.ts), so offering to file
 * anything else — and then reporting "the vault copy is what will be assembled"
 * — promised an assembly that could never happen.
 */
describe('a non-PDF is refused before anything is written', () => {
  it('says why, and offers no placement', async () => {
    render(<VaultPlaceIntoSubmission {...props()} mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document" />);
    expect(await screen.findByText(/Only a PDF can be filed/)).toBeTruthy();
    expect(screen.queryByLabelText('Target submission')).toBeNull();
    expect(writes).toEqual([]);
  });

  it('a PDF is filed as before', async () => {
    render(<VaultPlaceIntoSubmission {...props()} mimeType="application/pdf" />);
    await fillTarget();
    expect((screen.getByRole('button', { name: /place into submission/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});

/* PX-1 (docs/evidence/reviews/2026-09-24/lenses.md): the placement's audit row
   recorded what changed and never why. The server now refuses a placement
   without a reason; the dialog says so before the click and sends it. */
describe('the placement carries its reason', () => {
  const placeButton = () => screen.getByRole('button', { name: /^Place into submission$/ }) as HTMLButtonElement;

  it('keeps Place disabled until a reason meets the floor, and says why', async () => {
    render(<VaultPlaceIntoSubmission {...props()} />);
    await fillTarget('3.2.P.8.3', '4', 'short');
    expect(placeButton().disabled).toBe(true);
    expect(placeButton().title).toMatch(/reason for this placement/i);
    expect(screen.getByText('At least 8 characters.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Reason for this placement/), { target: { value: REASON } });
    expect(placeButton().disabled).toBe(false);
  });

  it('sends the trimmed reason with the leaf', async () => {
    render(<VaultPlaceIntoSubmission {...props()} />);
    await fillTarget('3.2.P.8.3', '4', `  ${REASON}  `);
    fireEvent.click(placeButton());
    await waitFor(() => expect(writes.some((w) => w.method === 'PUT')).toBe(true));
    expect((writes.find((w) => w.method === 'PUT')!.body as Record<string, unknown>).reason).toBe(REASON);
  });
});

