// @vitest-environment jsdom
/**
 * The conversation's artifact panel exports and routes what it shows.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * ConversationThread.tsx held `const artifacts: CtArtifact[] = []` — a literal —
 * so `ArtifactPanel`, `ArtifactCard` and every control on the card were
 * unreachable code that nonetheless looked finished. The two controls that had
 * been on the card were wired to `onAdvance`, and the one mount passed
 * `onAdvance={() => undefined}`: '.docx' downloaded no file and 'Route to
 * review' advanced no workflow.
 *
 * Both endpoints existed the whole time with no client caller:
 *   POST /api/concept2cure/artifacts/export-docx           (concept2cure.ts:12061)
 *   PUT  /api/concept2cure/projects/:p/artifacts/:a/status (concept2cure.ts:9147)
 *
 * And the real artifact source existed too: `AnaChatMessage.generatedDraft`,
 * written to `concept2cure_artifacts` by the stream's post-processing and
 * announced back as `artifact_version_saved`.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * The CHAIN each control completes — a click reaches the right transport with
 * the right body, and the file actually reaches the download primitive — plus
 * the two honest-failure rules: a refused transition leaves the status where it
 * was and says so, and a draft the server never persisted cannot be routed and
 * says why.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
let responder: (method: string, path: string) => { ok: boolean; status: number; json?: unknown };

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

const downloaded: Array<{ name: string; size: number }> = [];
vi.mock('../download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../download')>()),
  downloadBlob: (name: string, blob: Blob) => {
    downloaded.push({ name, size: blob.size });
    return true;
  },
}));

/* The chat hook is replaced so the turns — and the draft one of them produced —
   are inputs to this test rather than an SSE stream. Everything below the hook
   is the real surface. */
const chat = vi.hoisted(() => ({ messages: [] as unknown[] }));
const review = vi.hoisted(() => ({ me: { id: '1', organizationId: '1', displayName: 'Test Author', email: 'author@test.co' } as unknown }));
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: chat.messages,
    isStreaming: false,
    isLoadingThread: false,
    threadId: 'thr-1',
    send: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    interject: vi.fn(),
    reset: vi.fn(),
    loadThread: vi.fn(),
    runStatus: undefined,
  }),
}));

/* useDocumentList reads the signed-in session (editor/CanvasDocumentList.tsx);
   with no AuthProvider mounted, the real useAuth throws before the thread renders. */
vi.mock('@/services/portal/authService', async original => ({
  ...await original<typeof import('@/services/portal/authService')>(),
  useAuth: () => ({ user: { id: '1', organizationId: '1', displayName: 'Test Author', email: 'author@test.co' } }),
  /* The artifact's review reads the signed-in person to leave them out of the
     reviewers and to know whether they are one (ConversationArtifactReview). */
  useAuthUser: () => review.me,
}));

import { ConversationThread, conversationArtifacts } from '../surfaces/ConversationThread';

const DRAFT_BODY = '# Clinical Overview\n\nThe objective response rate was 42.1%.';

const SAVED_DRAFT = {
  id: 'a-1',
  role: 'assistant',
  text: 'Drafted the clinical overview.',
  groundingSources: ['CSR-201 section 7.4'],
  generatedDraft: {
    title: 'Clinical Overview 2.5',
    content: DRAFT_BODY,
    documentType: 'Clinical Overview',
    artifactId: 'artifact_1755_ab12cd34',
    version: 2,
  },
};
const UNSAVED_DRAFT = {
  ...SAVED_DRAFT,
  generatedDraft: { ...SAVED_DRAFT.generatedDraft, artifactId: undefined, version: undefined },
};

function mount() {
  render(
    <ConversationThread
      {...({ onNav: () => {}, onAsk: () => {} } as unknown as React.ComponentProps<
        typeof ConversationThread
      >)}
    />,
  );
  // The card body (and its controls) only exist once the card is expanded.
  fireEvent.click(screen.getByText('Clinical Overview 2.5').closest('button')!);
}

beforeEach(() => {
  calls.length = 0;
  downloaded.length = 0;
  chat.messages = [SAVED_DRAFT];
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: 12, title: 'BX-204' };
  (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'new' };
  apiRequest.mockReset();
  responder = () => ({ ok: true, status: 200, json: {} });
  apiRequest.mockImplementation(async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    const r = responder(method, path);
    if (!r.ok) {
      // `apiRequest` THROWS ApiRequestError for every non-OK status but 401 —
      // the behaviour `apiCall` exists to normalise. Reproduced here so the
      // refusal path under test is the one that actually runs.
      throw Object.assign(new Error('request failed'), {
        name: 'ApiRequestError',
        status: r.status,
        payload: r.json,
      });
    }
    return {
      ok: true,
      status: r.status,
      json: async () => r.json ?? {},
      blob: async () => new Blob(['PKdocx-bytes']),
    };
  });
});
afterEach(() => cleanup());

describe('conversationArtifacts — the panel reads real drafts, and invents nothing', () => {
  it("lists a turn's generatedDraft with its durable id and version", () => {
    const [a] = conversationArtifacts([SAVED_DRAFT] as never);
    expect(a.title).toBe('Clinical Overview 2.5');
    expect(a.artifactId).toBe('artifact_1755_ab12cd34');
    expect(a.version).toBe(2);
    expect(a.status).toBe('draft');
    /* Not reported by the stream, so not claimed by the card. */
    expect(a.prov.model).toBeUndefined();
    expect(a.prov.inputs).toBeUndefined();
    expect(a.prov.audit).toBeUndefined();
    expect(a.prov.evidence).toEqual(['CSR-201 section 7.4']);
  });

  it('marks a draft the server did not persist as out of the record', () => {
    const [a] = conversationArtifacts([UNSAVED_DRAFT] as never);
    expect(a.artifactId).toBeUndefined();
    expect(a.status).toBe('unsaved');
    expect(a.note).toMatch(/No stored version was reported/i);
  });

  it('ignores turns that produced no draft', () => {
    expect(conversationArtifacts([{ id: 'u-1', role: 'user', text: 'hi' }] as never)).toEqual([]);
  });
});

describe('ConversationThread artifact panel — the controls complete their chain', () => {
  it('.docx POSTs the draft to the export route and hands the file to downloadBlob', async () => {
    mount();
    fireEvent.click(screen.getByText(/\.docx/).closest('button')!);
    await waitFor(() =>
      expect(calls.some((c) => c.path === '/api/concept2cure/artifacts/export-docx')).toBe(true),
    );
    const c = calls.find((x) => x.path === '/api/concept2cure/artifacts/export-docx')!;
    expect(c.method).toBe('POST');
    expect(c.body).toEqual({ title: 'Clinical Overview 2.5', content: DRAFT_BODY });
    await waitFor(() => expect(downloaded.length).toBe(1));
    expect(downloaded[0].name).toBe('Clinical_Overview_2.5.docx');
    expect(downloaded[0].size).toBeGreaterThan(0);
  });

  it('Route to review PUTs the governed transition and adopts the new status', async () => {
    mount();
    expect(screen.getByText('Draft')).toBeTruthy();
    fireEvent.click(screen.getByText(/Route to review/).closest('button')!);
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const c = calls.find((x) => x.method === 'PUT')!;
    expect(c.path).toBe('/api/concept2cure/projects/12/artifacts/artifact_1755_ab12cd34/status');
    expect(c.body).toEqual({ status: 'review' });
    await waitFor(() => expect(screen.getByText('In review')).toBeTruthy());
  });

  it('leaves the status alone when the server refuses the transition, and says so', async () => {
    mount();
    responder = (method) =>
      method === 'PUT'
        ? {
            ok: false,
            status: 403,
            json: {
              success: false,
              error: {
                message: 'Role "viewer" is not permitted to perform transition: draft to review',
              },
            },
          }
        : { ok: true, status: 200, json: {} };
    fireEvent.click(screen.getByText(/Route to review/).closest('button')!);
    await waitFor(() => expect(screen.getByText(/not permitted/)).toBeTruthy());
    expect(screen.getByText(/The status is unchanged/)).toBeTruthy();
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.queryByText('In review')).toBeNull();
  });

  it('cannot route a draft the server never persisted, and gives the reason', () => {
    chat.messages = [UNSAVED_DRAFT];
    mount();
    const btn = screen.getByText(/Route to review/).closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    /* Was /not in the governed record/i. That sentence was a VERDICT on the
       governed record inferred from one missing SSE event, and it was removed
       because it is false in the commonest of the three states that withhold
       the event: an identical content hash returns { created: false } with a
       real artifactId, so the draft IS in the record — under an id this turn
       was never told. The reason now describes the reporting channel, which is
       the only thing the client actually knows, and this assertion follows it.
       The panel note below already used that wording; the two now agree. */
    expect(btn.title).toMatch(/No stored version was reported/i);
    expect(screen.getByText(/No stored version was reported/i)).toBeTruthy();
  });

  it('cannot route when no program is open — the workflow is scoped to one', () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = undefined;
    mount();
    const btn = screen.getByText(/Route to review/).closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText('Open a project first — the review workflow is scoped to one.')).toBeTruthy();
  });
});

/* ── P-95: the artifact's own review, reached from its card ─────────────────
   Review before approval is applied through each record's own review. For an
   AnA artifact that is the artifact reviewer routes, which no client reached
   (COORDINATION, the P-95 clarification c5208a29cd). In review, the card now
   reads the round, names reviewers from the project team (never the person in
   the conversation, who is the author and the eventual approver), and lets a
   named reviewer decide. The server's rules are not repeated here; its
   refusals are shown in its words. */
describe('ConversationThread artifact panel — the artifact review (P-95)', () => {
  const STATUS = '/api/concept2cure/projects/12/artifacts/artifact_1755_ab12cd34/reviews/status';
  const TEAM = '/api/concept2cure/projects/12/team';
  const ASSIGN = '/api/concept2cure/projects/12/artifacts/artifact_1755_ab12cd34/reviewers';
  const SUBMIT = '/api/concept2cure/projects/12/artifacts/artifact_1755_ab12cd34/reviews/submit';
  const NONE = { hasReviewers: false, currentRound: 0, reviewers: [], readyForApproval: false };
  const named = (status: string, decision: unknown = null, reviewerId = 7) => ({
    hasReviewers: true, currentRound: 1, readyForApproval: false,
    reviewers: [{ assignmentId: 'asg_1', reviewerId, reviewerName: 'Dana Reviewer', status, decision }],
  });
  let reviewState: unknown;
  let refuse: Record<string, { status: number; message: string }>;

  beforeEach(() => {
    reviewState = NONE;
    refuse = {};
    review.me = { id: '1', organizationId: '1', displayName: 'Test Author', email: 'author@test.co' };
    responder = (method, path) => {
      const no = refuse[`${method} ${path}`];
      if (no) return { ok: false, status: no.status, json: { success: false, error: { message: no.message } } };
      if (method === 'GET' && path === STATUS) return { ok: true, status: 200, json: { success: true, data: reviewState } };
      if (method === 'GET' && path === TEAM) {
        return { ok: true, status: 200, json: { success: true, data: [
          { userId: 1, name: 'Test Author', email: 'author@test.co', role: 'admin' },
          { userId: 7, name: 'Dana Reviewer', email: 'dana@test.co', role: 'reviewer' },
        ] } };
      }
      if (method === 'POST' && path === ASSIGN) {
        reviewState = named('pending');
        return { ok: true, status: 200, json: { success: true, data: { reviewRound: 1 } } };
      }
      if (method === 'POST' && path === SUBMIT) {
        reviewState = named('completed', { decision: 'approve', comment: 'Numbers match CSR-201.' }, 1);
        return { ok: true, status: 200, json: { success: true, data: {} } };
      }
      return { ok: true, status: 200, json: {} };
    };
  });

  async function inReview() {
    mount();
    fireEvent.click(screen.getByText(/Route to review/).closest('button')!);
    await waitFor(() => expect(screen.getByText('In review')).toBeTruthy());
  }

  it('in review, reads the round from the artifact reviewer routes and says no reviewer is named', async () => {
    await inReview();
    await waitFor(() => expect(screen.getByText('No reviewer is named yet.')).toBeTruthy());
    expect(calls.some(c => c.method === 'GET' && c.path === STATUS)).toBe(true);
  });

  it('names a reviewer from the project team, never the person in the conversation, and shows the round', async () => {
    await inReview();
    fireEvent.click(await screen.findByRole('button', { name: /Name reviewers for Clinical Overview 2.5/ }));
    await waitFor(() => expect(screen.getByText('Dana Reviewer')).toBeTruthy());
    // The author and eventual approver is not offered.
    expect(screen.queryByRole('checkbox', { name: /Test Author/ })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Dana Reviewer/ }));
    fireEvent.change(screen.getByLabelText(/Note for the reviewers/), { target: { value: 'Check the ORR against 7.4.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(calls.some(c => c.method === 'POST' && c.path === ASSIGN)).toBe(true));
    expect(calls.find(c => c.path === ASSIGN)!.body).toEqual({ reviewerIds: [7], notes: 'Check the ORR against 7.4.' });
    await waitFor(() => expect(screen.getByText('Waiting for a decision')).toBeTruthy());
    expect(screen.getByText(/Named 1 reviewer for Clinical Overview 2.5, round 1\./)).toBeTruthy();
  });

  it("shows the server's refusal in its words and assigns no one", async () => {
    await inReview();
    refuse[`POST ${ASSIGN}`] = { status: 403, message: 'Only admin, approver, or reviewer can assign reviewers' };
    fireEvent.click(await screen.findByRole('button', { name: /Name reviewers for/ }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Dana Reviewer/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(screen.getByText(/Only admin, approver, or reviewer can assign reviewers/)).toBeTruthy());
    expect(screen.getByText(/No one was assigned\./)).toBeTruthy();
    expect(screen.queryByText('Waiting for a decision')).toBeNull();
  });

  it('a named reviewer decides through the review submit route, and the decision is shown', async () => {
    reviewState = named('pending', null, 1);
    await inReview();
    fireEvent.change(await screen.findByLabelText(/You are a named reviewer/), { target: { value: 'Numbers match CSR-201.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(calls.some(c => c.method === 'POST' && c.path === SUBMIT)).toBe(true));
    expect(calls.find(c => c.path === SUBMIT)!.body).toEqual({ decision: 'approve', comment: 'Numbers match CSR-201.' });
    await waitFor(() => expect(screen.getByText('Approved — “Numbers match CSR-201.”')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('someone not named is offered no decision', async () => {
    reviewState = named('pending');
    await inReview();
    await waitFor(() => expect(screen.getByText('Waiting for a decision')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(calls.some(c => c.path === SUBMIT)).toBe(false);
  });

  it('a review that cannot be read says so, and never shows as no reviewers', async () => {
    refuse[`GET ${STATUS}`] = { status: 500, message: 'Failed to fetch review status' };
    await inReview();
    await waitFor(() => expect(screen.getByText(/Failed to fetch review status/)).toBeTruthy());
    expect(screen.queryByText('No reviewer is named yet.')).toBeNull();
    expect(screen.queryByRole('button', { name: /Name reviewers for/ })).toBeNull();
  });
});

