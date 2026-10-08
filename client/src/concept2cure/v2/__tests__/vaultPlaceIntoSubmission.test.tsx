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
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

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

const PID = '11111111-1111-4111-8111-111111111111';
/* Anchored to the project the dialog places into: an unanchored submission is
   not offered for a project's document (QA j3 finding (b)), so the fixtures
   name their program. */
const SUBMISSIONS = [
  { id: 4, title: 'BX-301 NDA', applicationType: 'nda', primaryRegion: 'us', status: 'open', programId: PID },
  { id: 5, title: 'BX-301 IRB package', applicationType: 'irb', primaryRegion: 'us', status: 'open', programId: PID },
  { id: 6, title: 'OR-801 510(k)', applicationType: '510k', primaryRegion: 'us', status: 'open', programId: PID },
];
/* The list as the server returns it: scoped to ?programId when given. */
function submissionList(rows: Array<{ programId?: string | null }>, url: string) {
  const program = new URL(url, 'http://localhost').searchParams.get('programId');
  return program ? rows.filter((row) => row.programId === program) : rows;
}
const SEQUENCES = [
  { id: 9, sequenceNumber: '0000', type: 'original', status: 'draft', region: 'us' },
  { id: 10, sequenceNumber: '0001', type: 'amendment', status: 'frozen', region: 'us' },
];

const VERSIONS_URL = `/api/c2c/project-vault/${PID}/documents/${DOC_UUID}/versions`;

/** This version as GET …/versions returns it: its stage, and the server's own VR-14 verdict. */
const version = (stage: string | null, transmitRefusal: string | null | undefined, over: Record<string, unknown> = {}) => ({
  id: DOC_UUID, version: '1.0', contentHash: 'a'.repeat(64), fileSize: 1024, fileName: 'csr-201.pdf',
  uploader: 'Ada Author', createdAt: '2026-09-30T10:00:00.000Z', current: true, link: 'none',
  lifecycle: stage ? { canonicalId: 'c-1', stage, review: null, approval: null } : null,
  placements: [],
  ...(transmitRefusal === undefined ? {} : { transmitRefusal }),
  ...over,
});
const versionsOk = (...versions: unknown[]) => ok({ success: true, data: { versions } });

/** Records every write so the "no snapshot" assertion can be made. */
let writes: Array<{ method: string; url: string; body: unknown }>;
/** Every read, so a read that must not happen can be asserted absent. */
let reads: string[];
/** The answer to GET …/versions. */
let onVersions: () => Response | Promise<Response>;

const leaf = (over: Record<string, unknown> = {}) => ({
  id: 77, sequenceId: 9, sectionCode: '3.2.P.8.3', title: 'CSR-201', lifecycleOp: 'new',
  documentTable: 'vault_documents', documentUuid: DOC_UUID,
  auditTrail: { persisted: true, chained: true }, ...over,
});
function mockApi(onPut: (body: unknown) => Response | Promise<Response> = (body) =>
  ok(leaf({ lifecycleOp: (body as { lifecycleOp: string }).lifecycleOp }))) {
  writes = [];
  reads = [];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (method !== 'GET') writes.push({ method, url, body });
    else reads.push(url);
    if (method === 'GET' && (url === '/api/submissions' || url.startsWith('/api/submissions?'))) return ok(submissionList(SUBMISSIONS, url));
    if (method === 'GET' && /^\/api\/submissions\/\d+\/sequences$/.test(url)) return ok(SEQUENCES);
    if (method === 'GET' && url === VERSIONS_URL) return onVersions();
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

/** Choose the submission and give the reason, leaving the section code as the dialog set it. */
async function chooseTarget(submissionId = '4', reason = REASON) {
  fireEvent.change(await screen.findByLabelText('Target submission'), { target: { value: submissionId } });
  await screen.findByLabelText('Sequence');
  fireEvent.change(screen.getByLabelText(/^Reason for this placement/), { target: { value: reason } });
}

beforeEach(() => {
  onVersions = () => versionsOk(version('approved', null));
  mockApi();
});
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
    mockApi((body) => ok(leaf({ id: 78, sectionCode: (body as { sectionCode: string }).sectionCode, title: 'ICF' })));
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
    mockApi((body) => ok(leaf({ id: 79, sectionCode: (body as { sectionCode: string }).sectionCode, title: 'DD' })));
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

const placeBtn = () => screen.getByRole('button', { name: /^Place into submission$/ }) as HTMLButtonElement;

const PREFILLED = "Pre-filled from this document's confirmed filing.";

/* The section is pre-filled only from a CONFIRMED filing. A suggestion is the
   classifier's guess, and a leaf filed on a guess nobody confirmed would make
   the guess the decision. A pre-filled code is judged exactly as a typed one. */
describe('the section code is pre-filled from a confirmed filing, and only from one', () => {
  it('(a) pre-fills a confirmed filing\'s section, says where it came from, and files at it', async () => {
    render(<VaultPlaceIntoSubmission {...props()} filing={{ ctdSection: '3.2.P.8.3', placementStatus: 'confirmed' }} />);
    expect(((await screen.findByLabelText(/^Section code/)) as HTMLInputElement).value).toBe('3.2.P.8.3');
    expect(screen.getByText(PREFILLED)).toBeTruthy();
    await chooseTarget();
    fireEvent.click(placeBtn());
    await waitFor(() => expect(writes.some((w) => w.method === 'PUT')).toBe(true));
    expect((writes.find((w) => w.method === 'PUT')!.body as Record<string, unknown>).sectionCode).toBe('3.2.P.8.3');
  });

  it('(a) stops saying "pre-filled" once the person changes the code', async () => {
    render(<VaultPlaceIntoSubmission {...props()} filing={{ ctdSection: '3.2.P.8.3', placementStatus: 'confirmed' }} />);
    expect(await screen.findByText(PREFILLED)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Section code/), { target: { value: '3.2.P.8.1' } });
    expect(screen.queryByText(PREFILLED)).toBeNull();
  });

  it('(b) leaves a suggested section for the person to enter, and says what was suggested', async () => {
    render(<VaultPlaceIntoSubmission {...props()} filing={{ ctdSection: '3.2.P.8.3', placementStatus: 'suggested' }} />);
    expect(((await screen.findByLabelText(/^Section code/)) as HTMLInputElement).value).toBe('');
    expect(screen.getByText('The filing suggests 3.2.P.8.3. It is not confirmed, so the section is left for you to enter.')).toBeTruthy();
    expect(screen.queryByText(PREFILLED)).toBeNull();
  });

  it.each([
    ['no filing', undefined],
    ['a null filing', null],
    ['a confirmed filing with no section', { ctdSection: null, placementStatus: 'confirmed' }],
    ['a confirmed filing with a blank section', { ctdSection: '   ', placementStatus: 'confirmed' }],
    ['an unfiled document', { ctdSection: '3.2.P.8.3', placementStatus: 'unfiled' }],
  ])('(c) %s leaves the section blank and claims nothing', async (_name, filing) => {
    render(<VaultPlaceIntoSubmission {...props()} filing={filing} />);
    expect(((await screen.findByLabelText(/^Section code/)) as HTMLInputElement).value).toBe('');
    expect(screen.queryByText(PREFILLED)).toBeNull();
    expect(screen.queryByText(/The filing suggests/)).toBeNull();
  });

  it('(d) a pre-filled code is judged like a typed one: a container keeps Place disabled', async () => {
    render(<VaultPlaceIntoSubmission {...props()} filing={{ ctdSection: '3', placementStatus: 'confirmed' }} />);
    await chooseTarget();
    expect(screen.getByText(/container, not a section/)).toBeTruthy();
    expect(placeBtn().disabled).toBe(true);
    expect(writes.filter((w) => w.method === 'PUT')).toEqual([]);
  });

  it('(d) a pre-filled CTD code is judged in the chosen submission\'s vocabulary', async () => {
    render(<VaultPlaceIntoSubmission {...props()} filing={{ ctdSection: '3.2.P.8', placementStatus: 'confirmed' }} />);
    expect(((await screen.findByLabelText(/^Section code/)) as HTMLInputElement).value).toBe('3.2.P.8');
    await chooseTarget('5');
    expect(screen.getByText(/This is an IRB submission\. Section code "3\.2\.P\.8" is not an IRB package slot/)).toBeTruthy();
    expect(placeBtn().disabled).toBe(true);
    expect(writes.filter((w) => w.method === 'PUT')).toEqual([]);
  });
});

const STAGE_UNREAD = "This version's review stage is not shown here. Only an approved, current version is transmitted.";
const STAGE_LOADING = "Reading this version's review stage…";
const STAGE_UNKNOWN =
  "This version's review stage could not be read, so whether it would be transmitted is not shown. " +
  'Only an approved, current version is transmitted.';
const DELETE_NOTE = "A Delete leaf ships no content, so this version's approval is not checked for it.";
const wouldNot = (reason: string) =>
  `This version would not be transmitted: ${reason}. It can be placed now, but the sequence will not be frozen, ` +
  'dispatched or transmitted until this leaf names an approved, current version.';
const FILED = 'Filed as leaf 3.2.P.8.3 in sequence 0000. The vault copy is what will be assembled — nothing was duplicated.';
const willNot = (reason: string) => ` It will not be transmitted until this leaf names an approved, current version (${reason}).`;

/* FD5 (c) / VR-14: the server refuses to freeze, dispatch or transmit a
   sequence whose leaf names a Vault version that is not approved and current.
   Placement itself is not refused, so the dialog says so before and after the
   click — in the server's words, read from GET …/versions, never re-judged. */
describe("this version's stage and the server's verdict on transmitting it", () => {
  const renderForProject = () =>
    render(<VaultPlaceIntoSubmission {...props()} projectId={PID} mimeType="application/pdf" />);

  it('(e) an in-review version: its stage, and the server\'s reason it would not be transmitted', async () => {
    onVersions = () => versionsOk(version('in_review', 'in_review, not approved'));
    renderForProject();
    expect(await screen.findByText('Review and approval: In review.')).toBeTruthy();
    expect(screen.getByText(wouldNot('in_review, not approved')).getAttribute('role')).toBe('status');
    expect(reads).toContain(VERSIONS_URL);
  });

  it('says it is reading while the read is in flight', async () => {
    onVersions = () => new Promise<Response>(() => {});
    renderForProject();
    expect(await screen.findByText(STAGE_LOADING)).toBeTruthy();
    expect(screen.queryByText(/would not be transmitted/)).toBeNull();
  });

  it('(f) an approved, current version says so and warns of nothing', async () => {
    renderForProject();
    expect(await screen.findByText('Review and approval: Approved. This is the approved, current version.')).toBeTruthy();
    expect(screen.queryByText(/would not be transmitted/)).toBeNull();
    expect(document.querySelector('.de-gov-t')!.textContent).toMatch(/Only an approved, current version is transmitted\.$/);
  });

  it.each([
    ['superseded by a later version', { current: false }],
    ['approved for different content than these bytes', {}],
  ])('(g) an approved stage the server refuses anyway: "%s", printed verbatim', async (reason, over) => {
    onVersions = () => versionsOk(version('approved', reason, over));
    renderForProject();
    expect(await screen.findByText('Review and approval: Approved.')).toBeTruthy();
    expect(screen.getByText(wouldNot(reason))).toBeTruthy();
  });

  it('(h) a Delete leaf ships no content: no approval is checked and nothing is warned of', async () => {
    onVersions = () => versionsOk(version('in_review', 'in_review, not approved'));
    renderForProject();
    await screen.findByText(wouldNot('in_review, not approved'));
    await fillTarget();
    fireEvent.change(screen.getByLabelText('Lifecycle operation'), { target: { value: 'delete' } });
    expect(screen.getByText(DELETE_NOTE)).toBeTruthy();
    expect(screen.queryByText(/would not be transmitted/)).toBeNull();
    fireEvent.click(placeBtn());
    expect((await screen.findByText(/Filed as leaf/)).textContent).toBe(FILED);
    expect((writes.find((w) => w.method === 'PUT')!.body as Record<string, unknown>).lifecycleOp).toBe('delete');
  });

  it('(i) an unapproved version can still be placed, and the verdict says it will not be transmitted', async () => {
    onVersions = () => versionsOk(version('in_review', 'in_review, not approved'));
    renderForProject();
    await screen.findByText(wouldNot('in_review, not approved'));
    await fillTarget();
    expect(placeBtn().disabled).toBe(false);
    fireEvent.click(placeBtn());
    expect((await screen.findByText(/Filed as leaf/)).textContent).toBe(FILED + willNot('in_review, not approved'));
    expect(writes.filter((w) => w.method === 'PUT')).toHaveLength(1);
  });

  it('(j) an approved, current version\'s placement claims nothing about transmission', async () => {
    renderForProject();
    await screen.findByText(/This is the approved, current version/);
    await fillTarget();
    fireEvent.click(placeBtn());
    expect((await screen.findByText(/Filed as leaf/)).textContent).toBe(FILED);
  });

  it.each([
    ['a failed read', () => ({ ok: false, status: 500, json: async () => ({ success: false }) }) as Response],
    ['a list without this version', () => versionsOk(version('approved', null, { id: '99999999-9999-4999-8999-999999999999' }))],
    ['a version the server gave no verdict for', () => versionsOk(version('approved', undefined))],
  ])('(k) %s says the stage could not be read, and placement stays open', async (_name, answer) => {
    onVersions = answer;
    renderForProject();
    expect((await screen.findByText(STAGE_UNKNOWN)).getAttribute('role')).toBe('status');
    expect(screen.queryByText(/This is the approved, current version/)).toBeNull();
    await fillTarget();
    expect(placeBtn().disabled).toBe(false);
  });

  it('(l) without a project it reads nothing and says the stage is not shown', async () => {
    render(<VaultPlaceIntoSubmission {...props()} mimeType="application/pdf" />);
    expect(await screen.findByText(STAGE_UNREAD)).toBeTruthy();
    await fillTarget();
    expect(reads.some((u) => u.endsWith('/versions'))).toBe(false);
  });

  it('a file that can never be filed is not read for its stage', async () => {
    render(<VaultPlaceIntoSubmission {...props()} projectId={PID} mimeType="text/plain" />);
    expect(await screen.findByText(/Only a PDF can be filed/)).toBeTruthy();
    expect(reads.some((u) => u.endsWith('/versions'))).toBe(false);
  });
});


describe('vault filing confirmation', () => {
  it('blocks retry after a lost write reply and offers the existing filing workspace', async () => {
    mockApi(async () => { throw new Error('lost reply'); });
    const callbacks = { ...props(), onNav: vi.fn() };
    render(<VaultPlaceIntoSubmission {...callbacks} />);
    await fillTarget(); fireEvent.click(placeBtn());
    expect(await screen.findByText(/cannot confirm whether.*placed/i)).toBeTruthy();
    expect(placeBtn().disabled).toBe(true);
    expect(callbacks.onPlaced).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Check filing status/i }));
    expect(callbacks.onNav).toHaveBeenCalledWith('submission-center');
    expect(callbacks.onClose).toHaveBeenCalled();
    expect(writes).toHaveLength(1);
  });

  it.each([
    null, false, {}, { id: 0 }, { id: 1.5 },
    { sequenceId: 999 }, { documentUuid: '33333333-3333-4333-8333-333333333333' },
    { documentTable: 'coauthor_documents' }, { sectionCode: '3.2.P.8.1' }, { lifecycleOp: 'replace' },
  ])('does not confirm a malformed or mismatched receipt %j', async (over) => {
    mockApi(() => ok(over && typeof over === 'object' && Object.keys(over).length ? leaf(over) : over));
    const callbacks = props(); render(<VaultPlaceIntoSubmission {...callbacks} />);
    await fillTarget(); fireEvent.click(placeBtn());
    expect(await screen.findByText(/cannot confirm whether.*placed/i)).toBeTruthy();
    expect(placeBtn().disabled).toBe(true);
    expect(screen.queryByText(/Filed as leaf/)).toBeNull();
    expect(callbacks.onPlaced).not.toHaveBeenCalled();
  });

  it.each([undefined, null, { persisted: false }, { persisted: true, chained: false }])(
    'discloses incomplete audit confirmation %j without denying the placed leaf', async (auditTrail) => {
      mockApi(() => ok(leaf({ auditTrail })));
      const callbacks = props(); render(<VaultPlaceIntoSubmission {...callbacks} />);
      await fillTarget(); fireEvent.click(placeBtn());
      expect(await screen.findByText(/Filed as leaf.*placement audit entry/i)).toBeTruthy();
      expect(placeBtn().disabled).toBe(true);
      expect(callbacks.onPlaced).toHaveBeenCalledTimes(1);
    },
  );

  it('allows retry after a known pre-write refusal', async () => {
    mockApi(() => refused('FORBIDDEN', 'Referenced document not found for this organization.'));
    render(<VaultPlaceIntoSubmission {...props()} />);
    await fillTarget(); fireEvent.click(placeBtn());
    await screen.findByText(/not found for this organization/i);
    expect(placeBtn().disabled).toBe(false);
  });

  it('ignores a write receipt after switching source document', async () => {
    let resolve!: (value: Response) => void;
    mockApi(() => new Promise<Response>((done) => { resolve = done; }));
    const old = props(); const next = { ...props(), documentUuid: '33333333-3333-4333-8333-333333333333', documentTitle: 'New source' };
    const { rerender } = render(<VaultPlaceIntoSubmission {...old} />);
    await fillTarget(); fireEvent.click(placeBtn());
    rerender(<VaultPlaceIntoSubmission {...next} />);
    await act(async () => resolve(ok(leaf())));
    expect(old.onPlaced).not.toHaveBeenCalled(); expect(next.onPlaced).not.toHaveBeenCalled();
    expect(screen.queryByText(/Filed as leaf/)).toBeNull();
    expect(screen.getByText('New source')).toBeTruthy();
    expect(placeBtn().disabled).toBe(true);
  });

  it('ignores a write receipt after switching the source project', async () => {
    let resolve!: (value: Response) => void;
    mockApi(() => new Promise<Response>((done) => { resolve = done; }));
    const callbacks = props();
    const { rerender } = render(<VaultPlaceIntoSubmission {...callbacks} projectId={PID} />);
    await fillTarget(); fireEvent.click(placeBtn());
    rerender(<VaultPlaceIntoSubmission {...callbacks} projectId="33333333-3333-4333-8333-333333333333" />);
    await act(async () => resolve(ok(leaf())));
    expect(callbacks.onPlaced).not.toHaveBeenCalled();
    expect(screen.queryByText(/Filed as leaf/)).toBeNull();
    expect(placeBtn().disabled).toBe(true);
  });

  it('locks filing fields while the write is pending', async () => {
    let resolve!: (value: Response) => void;
    mockApi(() => new Promise<Response>((done) => { resolve = done; }));
    render(<VaultPlaceIntoSubmission {...props()} />);
    await fillTarget(); fireEvent.click(placeBtn());
    expect((screen.getByLabelText('Target submission') as HTMLSelectElement).disabled ||
      screen.getByLabelText('Target submission').closest('fieldset')?.disabled).toBe(true);
    await act(async () => resolve(ok(leaf())));
    expect(writes).toHaveLength(1);
  });
});
