// @vitest-environment jsdom
/**
 * The editor's audit rail tells the truth about each row, and lets a reviewer
 * take the record away.
 *
 * GET /api/authoring/docs/:docId/audit gives every event an `integrity`
 * verdict — the row as stored checked against its entry on the tenant audit
 * chain (server/services/authoring/authoring-record.ts). What is pinned here,
 * through the real surface (DocumentAuthoring → DocumentWorkbench → the rail):
 *
 *   - a row whose verdict is `intact: false` carries, always visible, a note
 *     naming the fields that no longer match;
 *   - an intact row, a row the chain does not name (`chained: false`), and a
 *     row from a server that sends no verdict carry nothing — unknown is not a
 *     failure, and intact rows get no "verified" badge;
 *   - "Download the record" GETs /audit/export with the bearer token (the real
 *     apiRequest over a stubbed fetch, so the header on the wire is what is
 *     asserted) and saves the package as a file;
 *   - a refusal — the server's 503 when it cannot record the export — is shown
 *     on the rail in the server's words, and nothing is saved.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Reviewer', email: 'reviewer@test.co' } }),
}));
vi.mock('../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));

/* jsdom implements no layout; ProseMirror's scroll-into-view asks for client
   rects and crashes the worker when a node type lacks the method. */
const emptyRects = function () {
  return [] as unknown as DOMRectList;
};
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<
  Record<string, unknown>
>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';
import { auditIntegrityNote, describeAuditMetadata } from '../editor/DocumentWorkbench';

const DOC = 'D1';
const TOKEN = 'tok-reviewer-7c1e';
const AT = '2026-09-26T10:05:00Z';
const EXPORT_URL = `/api/authoring/docs/${DOC}/audit/export`;
const REFUSAL =
  'The export was refused because it could not be recorded in the audit trail. Nothing was exported.';

/** A fetch Response double with the surface apiRequest reads. */
function reply(
  payload: unknown,
  status = 200,
  contentType = 'application/json; charset=utf-8',
): Response {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const headers = new Map<string, string>([['content-type', contentType]]);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    json: async () => JSON.parse(text),
    text: async () => text,
    blob: async () => new Blob([text], { type: contentType }),
    clone() {
      return this;
    },
  } as unknown as Response;
}

/** jsdom's Blob has no text(); FileReader it has. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(blob);
  });
}

const EVENTS = [
  {
    id: 'ev-broken',
    section_id: 'S1',
    event_type: 'comment_added',
    actor: 'reviewer@test.co',
    actor_role: 'reviewer',
    change_reason: null,
    content_hash_before: null,
    content_hash_after: 'a1b2c3d4e5f6',
    created_at: AT,
    metadata: { comment_id: 'c1', quote: 'Three registration batches were placed on study.' },
    integrity: { chained: true, intact: false, mismatches: ['after_content', 'metadata'], chainPayloadIntact: true },
  },
  {
    id: 'ev-intact',
    section_id: 'S1',
    event_type: 'EDIT',
    actor: 'author@test.co',
    actor_role: 'author',
    change_reason: 'Updated shelf-life claim',
    content_hash_before: '0f0f0f0f0f0f',
    content_hash_after: '1e1e1e1e1e1e',
    created_at: AT,
    metadata: null,
    integrity: { chained: true, intact: true, mismatches: [], chainPayloadIntact: true },
  },
  {
    id: 'ev-unchained',
    section_id: 'S1',
    event_type: 'EDIT',
    actor: 'author@test.co',
    actor_role: 'author',
    change_reason: 'Written before the chain carried trail ids',
    content_hash_before: null,
    content_hash_after: '2d2d2d2d2d2d',
    created_at: AT,
    metadata: null,
    integrity: { chained: false, intact: null, mismatches: [], chainPayloadIntact: null },
  },
  {
    id: 'ev-no-verdict',
    section_id: null,
    event_type: 'FREEZE',
    actor: 'author@test.co',
    actor_role: 'author',
    change_reason: 'From a server that sends no verdict',
    content_hash_before: null,
    content_hash_after: null,
    created_at: AT,
    metadata: null,
  },
];

let exportReply: () => Response;
let auditReply: () => Response;
type FetchInit = Parameters<typeof fetch>[1];
const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], _init?: FetchInit) => {
  const url = String(input);
  if (url.startsWith('/api/authoring/docs?')) {
    return reply({
      success: true,
      documents: [
        {
          id: DOC,
          title: 'Quality Overall Summary',
          module: 'M2',
          product_code: 'ABC',
          status: 'draft',
          updated_at: AT,
          section_count: 1,
        },
      ],
    });
  }
  if (url === `/api/authoring/docs/${DOC}/sections`) {
    return reply({
      success: true,
      sections: [
        {
          id: 'S1',
          doc_id: DOC,
          code: '2.3.P.8',
          title: 'Stability',
          content: '<p>Shelf life is supported.</p>',
          order_index: 0,
          comment_count: 0,
          revision_count: 1,
          citation_count: 0,
          updated_at: AT,
        },
      ],
    });
  }
  if (url.startsWith(`/api/authoring/docs/${DOC}/audit?`)) {
    return auditReply();
  }
  if (url === EXPORT_URL) return exportReply();
  // Not this test's subject; answered as an honest "not available here".
  if (url.startsWith('/api/data-origins/')) return reply({ error: 'Not found' }, 404);
  return reply({ success: true, revisions: [], sources: [], citations: [], comments: [] });
});

const props = () => ({
  surface: { id: 'document-authoring', label: 'Authoring' } as never,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

async function openAuditRail(): Promise<HTMLElement> {
  render(<DocumentAuthoring {...props()} />);
  await screen.findAllByText('Stability');
  fireEvent.click(screen.getByRole('button', { name: 'Audit' }));
  await waitFor(() => expect(screen.getAllByTestId('audit-event')).toHaveLength(EVENTS.length));
  return screen.getByRole('button', { name: 'Download the record' }).closest('aside') as HTMLElement;
}

function exportCalls() {
  return fetchMock.mock.calls.filter(([u]) => String(u) === EXPORT_URL);
}

const createObjectURL = vi.fn((_b: Blob) => 'blob:authoring-record');
const revokeObjectURL = vi.fn();
let clicked: HTMLAnchorElement[] = [];

beforeEach(() => {
  fetchMock.mockClear();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  clicked = [];
  try {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('trialsage_access_token', TOKEN);
  } catch {
    /* ignore */
  }
  exportReply = () =>
    reply({ format: 'authoring-record-export/1', events: EVENTS, chain: {}, verdicts: {} });
  auditReply = () => reply({ success: true, events: EVENTS, count: EVENTS.length });
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true, writable: true });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
});

describe('the audit rail reports each row’s chain verdict', () => {
  it('shows the note only on the row whose verdict is intact: false, naming the fields', async () => {
    await openAuditRail();
    const notes = screen.getAllByTestId('audit-integrity-note');
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toBe(
      'This entry no longer matches its record on the audit chain (text after, details).',
    );

    const rows = screen.getAllByTestId('audit-event');
    const [broken, intact, unchained, noVerdict] = rows;
    expect(within(broken).getByTestId('audit-integrity-note')).toBeTruthy();
    for (const row of [intact, unchained, noVerdict]) {
      expect(within(row).queryByTestId('audit-integrity-note')).toBeNull();
      expect(row.textContent).not.toMatch(/matches its record|audit chain/i);
    }
    // Silence is the default: nothing on the rail claims a row was verified.
    const rail = rows[0].closest('aside') as HTMLElement;
    expect(rail.textContent).not.toMatch(/\bverified\b|\bintact\b/i);
  });

  it('describes a comment row by the passage it quoted', async () => {
    await openAuditRail();
    const [broken] = screen.getAllByTestId('audit-event');
    expect(within(broken).getByTestId('audit-metadata').textContent).toBe(
      'commented on “Three registration batches were placed on study.”',
    );
  });
});

describe('Download the record', () => {
  it('GETs the export with the bearer token and saves the package as a file', async () => {
    await openAuditRail();
    fireEvent.click(screen.getByRole('button', { name: 'Download the record' }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(exportCalls()).toHaveLength(1);
    const init = exportCalls()[0][1] as NonNullable<FetchInit>;
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);

    const saved = createObjectURL.mock.calls[0][0] as Blob;
    expect(saved).toBeInstanceOf(Blob);
    expect(JSON.parse(await readBlob(saved)).format).toBe('authoring-record-export/1');
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe(`authoring-record-${DOC}.json`);
    expect(clicked[0].getAttribute('href')).toBe('blob:authoring-record');
    expect(screen.queryByTestId('audit-export-error')).toBeNull();
    // The button is usable again once the file has been handed over.
    expect(
      (screen.getByRole('button', { name: 'Download the record' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('shows the server’s refusal on the rail when the export cannot be recorded (503), and saves nothing', async () => {
    exportReply = () =>
      reply(
        { success: false, error: { code: 'AUTHORING_RECORD_EXPORT_NOT_RECORDED', message: REFUSAL } },
        503,
      );
    await openAuditRail();
    fireEvent.click(screen.getByRole('button', { name: 'Download the record' }));

    const alert = await screen.findByTestId('audit-export-error');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toBe(`The record was not downloaded. ${REFUSAL}`);
    expect(exportCalls()).toHaveLength(1);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clicked).toHaveLength(0);
  });

  it('a person without access to the record is told so — not shown a failed read or an empty trail', async () => {
    auditReply = () =>
      reply({ success: false, error: { code: 'AUDIT_TRAIL_NOT_PERMITTED', message: 'Reading this document’s record needs access.' } }, 403);
    render(<DocumentAuthoring {...props()} />);
    await screen.findAllByText('Stability');
    fireEvent.click(screen.getByRole('button', { name: 'Audit' }));
    await screen.findByText('No access to this document’s record');
    expect(screen.queryByText('Couldn’t load the audit trail')).toBeNull();
    expect(screen.queryAllByTestId('audit-event')).toHaveLength(0);
  });

  it('says so when the session is not authenticated (401), rather than nothing', async () => {
    exportReply = () => reply({ error: 'UNAUTHORIZED' }, 401);
    await openAuditRail();
    fireEvent.click(screen.getByRole('button', { name: 'Download the record' }));

    const alert = await screen.findByTestId('audit-export-error');
    expect(alert.textContent).toBe('The record was not downloaded. Your session isn’t authenticated.');
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});

describe('auditIntegrityNote', () => {
  it('speaks only for intact: false on a chained row', () => {
    expect(auditIntegrityNote({ chained: true, intact: false, mismatches: ['change_reason'] })).toBe(
      'This entry no longer matches its record on the audit chain (reason).',
    );
    expect(auditIntegrityNote({ chained: true, intact: false, mismatches: ['chain_payload'] })).toBe(
      'This entry no longer matches its record on the audit chain (chain entry).',
    );
    expect(auditIntegrityNote({ chained: true, intact: false, mismatches: [] })).toBe(
      'This entry no longer matches its record on the audit chain.',
    );
    expect(auditIntegrityNote({ chained: true, intact: true, mismatches: [] })).toBeNull();
    expect(auditIntegrityNote({ chained: false, intact: null, mismatches: [] })).toBeNull();
    expect(auditIntegrityNote(null)).toBeNull();
    expect(auditIntegrityNote(undefined)).toBeNull();
  });
});

describe('describeAuditMetadata — comments and bulk decisions recorded whole', () => {
  it('describes a comment or reply by its quoted passage, capped at 80 characters', () => {
    const long = 'x'.repeat(100);
    expect(describeAuditMetadata('reply_added', { quote: 'the stability claim' })).toBe(
      'commented on “the stability claim”',
    );
    expect(describeAuditMetadata('comment_added', { quote: long })).toBe(
      `commented on “${'x'.repeat(80)}…”`,
    );
    // No quote (a reply to a thread, a whole-section comment): nothing to add.
    expect(describeAuditMetadata('comment_added', { quote: null, comment_id: 'c1' })).toBeNull();
  });

  it('samples the first three texts of a bulk act and claims no omission when none was recorded', () => {
    const text = describeAuditMetadata('tracked_change_bulk_decision', {
      decision: 'accept',
      count: 5,
      changes: ['one', 'two', 'three', 'four', 'five'].map((t, i) => ({
        changeId: `c${i}`,
        changeType: 'insertion',
        text: t,
      })),
    });
    expect(text).toBe(
      'accepted 5 tracked changes in one action — including “one”, “two”, “three”',
    );
  });
});
