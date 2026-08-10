// @vitest-environment jsdom
/**
 * BatchDraft — the identity a draft is written against, and what "accepted"
 * is allowed to mean.
 *
 * Two defects motivated this file, and both are the kind that a screenshot
 * cannot show:
 *
 * 1. SELECTION WAS KEYED BY SECTION NUMBER, NOT DOCUMENT ID. `num` is the
 *    display number and is NOT unique — the spine renders '—' for every
 *    document that carries no eCTD number. So N numberless sections behaved as
 *    one item: ticking one ticked them all, they shared a single draft card,
 *    and `todo.find(s => s.num === key)` resolved to whichever document came
 *    first. That was survivable while acceptance did nothing. It stopped being
 *    survivable the moment accepting wrote to a real document — the failure
 *    mode is one section's generated prose landing in another section's
 *    regulated document, silently.
 *
 * 2. "ACCEPTED" WAS A CLAIM, NOT AN OUTCOME. Acceptance dispatched through
 *    window.C2C_AUTHORING.saveSection — a runtime channel this repo never
 *    provides — and marked the card accepted even when that call rejected
 *    (`.then(mark).catch(() => mark())`). The user saw "accepted"; nothing was
 *    written. Every assertion below about acceptance is therefore about the
 *    REQUEST that was actually sent and the state that follows a REAL answer.
 *
 * The sample-card case is here for the same reason: bdSample() output is
 * fabricated placeholder prose, and writing it into a regulated document would
 * be the worst thing this surface could do.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import { BatchDraft } from '../surfaces/BatchDraft';

// BatchDraft reads only onAsk/onNav/segment; typing it by what the test
// supplies keeps this file from churning on unrelated registry changes.
const Surface = BatchDraft as unknown as React.ComponentType<Record<string, unknown>>;

interface Leaf {
  id: string;
  num: string;
  title: string;
  status: string;
  pct: number | null;
  preview?: string | null;
}

/** Requests the surface actually made, in order — the subject of most asserts. */
let sent: Array<{ url: string; method: string; body: any }>;
/** What POST …/accept answers with; overridden per test. */
let acceptResponse: { status: number; body: unknown };
let spineBody: unknown;

const leaves = (over: Partial<Leaf>[] = []): Leaf[] =>
  over.map((o, i) => ({
    id: String(i + 1),
    num: '—',
    title: 'Section ' + (i + 1),
    status: 'draft',
    pct: 0,
    preview: null,
    ...o,
  }));

const spine = (over: Record<string, unknown> = {}) => ({
  data: { program: 'BX204', standard: null, framework: null, tree: [], ...over },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  sent = [];
  acceptResponse = { status: 200, body: { success: true, data: { supersededVersion: null } } };
  spineBody = spine();
  // connected() is `Boolean(getAuthToken())`; without a token the surface takes
  // the offline sample path and none of this is exercised.
  sessionStorage.setItem('trialsage_access_token', 'test-token');

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: any, init: any = {}) => {
      const url = String(input);
      const method = String(init.method || 'GET');
      const body = init.body ? JSON.parse(init.body) : null;
      sent.push({ url, method, body });

      if (url.includes('/api/batch-draft/spine')) return json(200, spineBody);
      if (url.includes('/accept')) return json(acceptResponse.status, acceptResponse.body);
      if (url.includes('/api/claude/batch')) {
        const requests = (body?.requests ?? []) as unknown[];
        return json(200, {
          success: true,
          data: {
            results: requests.map((_, i) => ({
              content: '<p>Draft body ' + (i + 1) + '</p>',
              model: 'claude-test',
              latencyMs: 100,
            })),
          },
        });
      }
      return json(404, { error: 'unexpected ' + url });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

const renderSurface = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Surface onAsk={() => {}} onNav={() => {}} segment="biotech" />
    </QueryClientProvider>,
  );
};

const acceptCalls = () => sent.filter(r => r.url.includes('/accept'));

/** Drive pick → draft → review and return the container. */
async function draftAll(container: HTMLElement) {
  await waitFor(() => expect(container.querySelectorAll('.bd-pick-item').length).toBeGreaterThan(0));
  // Wait for the button to be ENABLED, not merely present. Selection and the
  // framework are both seeded by effects that land a commit after the spine
  // does, so asserting the moment the list appears reads the pre-seed render.
  await waitFor(() =>
    expect(
      (container.querySelector('.bd-pick-actions .bd-primary') as HTMLButtonElement).disabled,
      'the Draft button never enabled — no sections selected, or no framework set',
    ).toBe(false),
  );
  fireEvent.click(container.querySelector('.bd-pick-actions .bd-primary') as HTMLButtonElement);
  await waitFor(() => expect(container.querySelectorAll('.bd-card').length).toBeGreaterThan(0));
  await waitFor(() =>
    expect(container.querySelectorAll('.bd-card.st-done').length).toBeGreaterThan(0),
  );
  return container;
}

describe('a draft belongs to one document, even when sections share a number', () => {
  it('selects numberless sections independently', async () => {
    spineBody = spine({
      // Both render as '—'. Under the old num-keyed selection these were one item.
      tree: leaves([{ id: '11', title: 'Nonclinical overview' }, { id: '22', title: 'Clinical overview' }]),
    });
    const { container } = renderSurface();

    // Both start selected (initialSel pre-picks the least-complete five), but
    // the seeding effect lands a commit after the list renders — wait for the
    // seeded state rather than reading the render before it.
    await waitFor(() => expect(container.querySelectorAll('.bd-pick-item.on').length).toBe(2));

    fireEvent.click(container.querySelectorAll('.bd-pick-item')[0]);

    expect(
      container.querySelectorAll('.bd-pick-item.on').length,
      'deselecting one numberless section deselected the other — selection is not keyed by document id',
    ).toBe(1);
  });

  it('renders one card per document, not one card for the shared number', async () => {
    spineBody = spine({
      framework: 'ich_clinical',
      tree: leaves([{ id: '11', title: 'Nonclinical overview' }, { id: '22', title: 'Clinical overview' }]),
    });
    const { container } = renderSurface();
    await draftAll(container);

    expect(container.querySelectorAll('.bd-card').length).toBe(2);
    expect(container.textContent).toContain('Nonclinical overview');
    expect(container.textContent).toContain('Clinical overview');
  });

  it('accepts each card into its OWN document', async () => {
    spineBody = spine({
      framework: 'ich_clinical',
      tree: leaves([{ id: '11', title: 'Nonclinical overview' }, { id: '22', title: 'Clinical overview' }]),
    });
    const { container } = renderSurface();
    await draftAll(container);

    const buttons = container.querySelectorAll('.bd-card-acts .bd-primary');
    expect(buttons.length).toBe(2);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(acceptCalls().length).toBe(1));
    fireEvent.click(container.querySelectorAll('.bd-card-acts .bd-primary')[0]);
    await waitFor(() => expect(acceptCalls().length).toBe(2));

    const targets = acceptCalls().map(r => r.url.replace(/^.*\/documents\//, '').replace('/accept', ''));
    expect(
      new Set(targets).size,
      'two cards were accepted into the same document — the write used a shared key',
    ).toBe(2);
    expect(targets.sort()).toEqual(['11', '22']);

    // Each request carries the prose that card is showing, not a neighbour's.
    const bodies = acceptCalls().map(r => r.body.content);
    expect(new Set(bodies).size).toBe(2);
  });
});

describe('"accepted" means the write came back, not that it was attempted', () => {
  const oneLeaf = () =>
    spine({ framework: 'ich_clinical', tree: leaves([{ id: '7', num: '2.7.1', title: 'Summary of Clinical Efficacy' }]) });

  it('marks the card accepted and reports the version its content superseded', async () => {
    spineBody = oneLeaf();
    acceptResponse = { status: 200, body: { success: true, data: { supersededVersion: 3 } } };
    const { container } = renderSurface();
    await draftAll(container);

    fireEvent.click(container.querySelector('.bd-card-acts .bd-primary') as HTMLButtonElement);

    await waitFor(() => expect(container.querySelector('.bd-card.accepted')).not.toBeNull());
    expect(container.textContent).toContain('previous content kept as version 3');
  });

  it('does NOT mark the card accepted when the write fails, and says why', async () => {
    spineBody = oneLeaf();
    acceptResponse = { status: 500, body: { success: false, error: 'Failed to save the accepted draft' } };
    const { container } = renderSurface();
    await draftAll(container);

    fireEvent.click(container.querySelector('.bd-card-acts .bd-primary') as HTMLButtonElement);

    await waitFor(() => expect(container.textContent).toContain('Not saved'));
    expect(
      container.querySelector('.bd-card.accepted'),
      'a failed write still presented the draft as accepted — the old .catch(mark) behaviour',
    ).toBeNull();
    expect(container.textContent).toContain('Failed to save the accepted draft');
    // And the card offers the write again rather than stranding the draft.
    expect(container.textContent).toContain('Retry save');
  });

  it('does not treat a 200 carrying success:false as a write', async () => {
    // The other half of the failure surface. `apiRequest` THROWS on a 5xx, so
    // the test above exercises the catch path; a route that answers 200 with
    // `{ success: false }` returns normally and is checked in the body. Both
    // have to reach the same "not saved" state, and the first version of this
    // file only covered one of them — a mutation that marked the card accepted
    // in the returns-normally branch passed the whole suite.
    spineBody = oneLeaf();
    acceptResponse = { status: 200, body: { success: false, error: 'Document not found' } };
    const { container } = renderSurface();
    await draftAll(container);

    fireEvent.click(container.querySelector('.bd-card-acts .bd-primary') as HTMLButtonElement);

    await waitFor(() => expect(container.textContent).toContain('Not saved'));
    expect(container.querySelector('.bd-card.accepted')).toBeNull();
    expect(container.textContent).toContain('Document not found');
  });

  it('does not send a second write while the first is in flight', async () => {
    spineBody = oneLeaf();
    const { container } = renderSurface();
    await draftAll(container);

    const btn = container.querySelector('.bd-card-acts .bd-primary') as HTMLButtonElement;
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    await waitFor(() => expect(container.querySelector('.bd-card.accepted')).not.toBeNull());
    expect(acceptCalls().length, 'double-clicking Accept wrote the document more than once').toBe(1);
  });

  it('records the framework the prose was actually drafted against', async () => {
    spineBody = oneLeaf();
    const { container } = renderSurface();
    await draftAll(container);

    fireEvent.click(container.querySelector('.bd-card-acts .bd-primary') as HTMLButtonElement);
    await waitFor(() => expect(acceptCalls().length).toBe(1));

    // Same value the drafting request used — that is the only thing that makes
    // it safe to hand back as the next batch's default.
    const draftReq = sent.find(r => r.url.includes('/api/claude/batch'));
    expect(draftReq?.body.requests[0].framework).toBe('ich_clinical');
    expect(acceptCalls()[0].body.framework).toBe('ich_clinical');
  });
});

describe('sample prose is never written to a regulated document', () => {
  it('stages an offline sample card locally and sends nothing', async () => {
    // No token → connected() is false → the surface takes the sample path.
    sessionStorage.clear();
    spineBody = spine({ tree: leaves([{ id: '7', num: '2.7.1', title: 'Summary of Clinical Efficacy' }]) });
    const { container } = renderSurface();

    await draftAll(container);

    fireEvent.click(container.querySelector('.bd-card-acts .bd-primary') as HTMLButtonElement);
    await waitFor(() => expect(container.querySelector('.bd-card.accepted')).not.toBeNull());

    expect(acceptCalls().length, 'fabricated sample prose was POSTed to a document').toBe(0);
    expect(container.textContent).toContain('never written to a document');
  });
});

describe('the framework picker is remembered or stated — never guessed', () => {
  it('presets the framework the documents recorded', async () => {
    spineBody = spine({ framework: 'fda_510k', tree: leaves([{ id: '7', num: '1.1', title: 'Cover letter' }]) });
    const { container } = renderSurface();

    await waitFor(() => expect(container.querySelector('.bd-fw')).not.toBeNull());
    await waitFor(() => expect((container.querySelector('.bd-fw') as HTMLSelectElement).value).toBe('fda_510k'));
    expect(container.textContent).toContain('carried forward from the last draft accepted');
  });

  it('stays blank when the documents record nothing', async () => {
    spineBody = spine({ framework: null, tree: leaves([{ id: '7', num: '1.1', title: 'Cover letter' }]) });
    const { container } = renderSurface();

    await waitFor(() => expect(container.querySelector('.bd-fw')).not.toBeNull());
    expect((container.querySelector('.bd-fw') as HTMLSelectElement).value).toBe('');
    // And the surface refuses to draft rather than picking one for the user.
    expect((container.querySelector('.bd-pick-actions .bd-primary') as HTMLButtonElement).disabled).toBe(true);
  });

  it('stays blank for a framework this build has no option for', async () => {
    // A <select> given an unknown value renders as unselected. Seeding it
    // anyway would leave `framework` truthy while the control showed nothing —
    // the Draft button enabled, drafting against a framework the user never saw.
    spineBody = spine({ framework: 'iso_13485', tree: leaves([{ id: '7', num: '1.1', title: 'Cover letter' }]) });
    const { container } = renderSurface();

    await waitFor(() => expect(container.querySelector('.bd-fw')).not.toBeNull());
    expect((container.querySelector('.bd-fw') as HTMLSelectElement).value).toBe('');
    expect((container.querySelector('.bd-pick-actions .bd-primary') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders a spine with no framework field at all — an older server is not an error', async () => {
    const older = spine({ tree: leaves([{ id: '7', num: '1.1', title: 'Cover letter' }]) }) as any;
    delete older.data.framework;
    spineBody = older;
    const { container } = renderSurface();

    await waitFor(() => expect(container.textContent).toContain('Cover letter'));
    expect(container.querySelector('.c2c-empty-state.tone-error')).toBeNull();
  });
});
