// @vitest-environment jsdom
/** Actual cards, hooks and API client; fetch is the sole network seam. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BatchDraft } from '../surfaces/BatchDraft';

interface SurfaceProps { onAsk(text: string): void; onNav(id: string): void; segment: string }
// This surface reads these three props; no shell-only registry fixture is needed.
const Surface = BatchDraft as unknown as React.ComponentType<SurfaceProps>;
interface Termination { finishReason?: string | null; truncated?: boolean }
interface WireDraft extends Termination {
  content: string; model: string; latencyMs: number;
  turnRecord: { status: string; id: string; sha256: string };
}
interface Leaf { id: string; num: string; title: string; status: string; pct: number; preview: null }
interface SentRequest { url: string; method: string; body: Record<string, unknown> | null }
type FetchInput = Parameters<typeof globalThis.fetch>[0];
type FetchOptions = NonNullable<Parameters<typeof globalThis.fetch>[1]>;

const TURN_ID = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';
const COMPLETE = '<p>The investigator must review the evidence.</p>';
const INCOMPLETE = 'UNFINISHED_ENDPOINT_RESULT_MUST_NOT_BE_READY';
let sent: SentRequest[];
let results: WireDraft[];
let leaves: Leaf[];
let queryClient: QueryClient | undefined;

function draft(termination: Termination, content = COMPLETE): WireDraft {
  return { content, model: 'component-test-model', latencyMs: 10, ...termination,
    turnRecord: { status: 'recorded', id: TURN_ID, sha256: 'a'.repeat(64) } };
}

const leaf = (id: string, title: string): Leaf => ({ id, num: '—', title, status: 'draft', pct: 0, preview: null });
const json = (body: unknown): Response => new Response(JSON.stringify(body), {
  status: 200, headers: { 'content-type': 'application/json' },
});

function requestBody(init?: FetchOptions): Record<string, unknown> | null {
  if (typeof init?.body !== 'string') return null;
  const body: unknown = JSON.parse(init.body);
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
}

beforeEach(() => {
  sent = [];
  leaves = [leaf('7', 'Clinical efficacy')];
  results = [draft({ finishReason: 'end_turn', truncated: false })];
  sessionStorage.setItem('trialsage_access_token', 'component-test-token');
  vi.stubGlobal('fetch', vi.fn(async (input: FetchInput, init?: FetchOptions): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    sent.push({ url, method: init?.method ?? 'GET', body: requestBody(init) });
    if (url.includes('/api/batch-draft/spine')) return json({ data: {
      program: null, standard: null, framework: 'ich_clinical', tree: leaves,
    } });
    if (url.includes('/api/claude/batch')) return json({ success: true, data: { results } });
    if (url.includes('/accept')) return json({ success: true, data: { supersededVersion: null } });
    throw new Error(`Unexpected test network request: ${url}`);
  }));
});

afterEach(() => {
  cleanup();
  queryClient?.clear();
  queryClient = undefined;
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function card(container: HTMLElement, index = 0): HTMLElement {
  const element = container.querySelectorAll<HTMLElement>('.bd-card').item(index);
  if (!element) throw new Error(`Draft card ${index} was not rendered`);
  return element;
}

function acceptButton(element: HTMLElement): HTMLButtonElement {
  const button = element.querySelector<HTMLButtonElement>('.bd-card-acts .bd-primary');
  if (!button) throw new Error('This draft has no Accept control');
  return button;
}

const acceptCalls = (): SentRequest[] => sent.filter(request => request.url.includes('/accept'));
function acceptedBody(): Record<string, unknown> {
  const body = acceptCalls()[0]?.body;
  if (!body) throw new Error('No acceptance body was sent');
  return body;
}

async function renderAndDraft(): Promise<HTMLElement> {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const { container } = render(<QueryClientProvider client={queryClient}>
    <Surface onAsk={() => {}} onNav={() => {}} segment="biotech" />
  </QueryClientProvider>);
  await waitFor(() => {
    const button = container.querySelector<HTMLButtonElement>('.bd-pick-actions .bd-primary');
    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(false);
  });
  fireEvent.click(container.querySelector<HTMLButtonElement>('.bd-pick-actions .bd-primary')!);
  await waitFor(() => expect(container.querySelectorAll('.bd-card')).toHaveLength(results.length));
  await waitFor(() => expect(container.querySelectorAll('.bd-card.st-drafting')).toHaveLength(0));
  return container;
}

describe('BatchDraft acceptance preserves the generation termination handoff', () => {
  it('posts the complete result status in snake_case with its own document and recorded machine text', async () => {
    const container = await renderAndDraft();
    fireEvent.click(acceptButton(card(container)));
    await waitFor(() => expect(acceptCalls()).toHaveLength(1));
    expect(acceptCalls()[0].url).toContain('/documents/7/accept');
    expect(acceptedBody()).toMatchObject({ finish_reason: 'end_turn', truncated: false, content: COMPLETE,
      framework: 'ich_clinical', turnRecordId: TURN_ID, acceptedMachineText: [{ authorId: 'ana', text: COMPLETE }] });
    expect(acceptedBody()).not.toHaveProperty('finishReason');
    expect(acceptedBody()).not.toHaveProperty('model');
    await waitFor(() => expect(card(container).classList.contains('accepted')).toBe(true));
  });

  it.each([undefined, null, 'unknown'])('forwards unconfirmed reason %s without inventing a completed finish', async finishReason => {
    results = [draft({ finishReason })];
    const container = await renderAndDraft();
    fireEvent.click(acceptButton(card(container)));
    await waitFor(() => expect(acceptCalls()).toHaveLength(1));
    expect(acceptedBody()).toMatchObject({ finish_reason: finishReason ?? null, truncated: false });
  });

  it('keeps original machine text and exact termination metadata when the user edits accepted prose', async () => {
    results = [draft({ finishReason: ' end_turn ', truncated: false })];
    const container = await renderAndDraft();
    const edit = card(container).querySelector<HTMLButtonElement>('[data-testid="bd-card-edit-toggle"]');
    if (!edit) throw new Error('The editable draft has no Edit control');
    fireEvent.click(edit);
    const textarea = card(container).querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('Edit did not open the draft textarea');
    const revised = '<p>The investigator reviewed the evidence and recorded an open question.</p>';
    fireEvent.change(textarea, { target: { value: revised } });
    fireEvent.click(acceptButton(card(container)));
    await waitFor(() => expect(acceptCalls()).toHaveLength(1));
    expect(acceptedBody()).toMatchObject({ content: revised, finish_reason: ' end_turn ', truncated: false,
      turnRecordId: TURN_ID, acceptedMachineText: [{ authorId: 'ana', text: COMPLETE }] });
    expect(acceptCalls()[0].url).toContain('/documents/7/accept');
  });
});

describe('BatchDraft keeps known cut-off prose out of ready cards', () => {
  const cutoffs: Termination[] = [
    { finishReason: 'max_tokens', truncated: false }, { finishReason: 'length', truncated: false },
    { finishReason: 'chunk_timeout', truncated: false }, { finishReason: ' max_tokens ', truncated: false },
    { finishReason: 'unknown', truncated: true }, { truncated: true }, { finishReason: 'end_turn', truncated: true },
  ];

  it.each(cutoffs)('refuses %j while retaining the complete sibling in its original document slot', async termination => {
    leaves = [leaf('7', 'Cut-off safety'), leaf('8', 'Complete efficacy')];
    results = [draft(termination, `<p>${INCOMPLETE}</p>`), draft({ finishReason: 'stop', truncated: false })];
    const container = await renderAndDraft();
    const stopped = card(container, 0);
    const complete = card(container, 1);
    expect(stopped.classList.contains('st-error')).toBe(true);
    expect(stopped.textContent).toContain('Cut-off safety');
    expect(stopped.textContent).toMatch(/shorten|split/i);
    expect(stopped.textContent).toMatch(/redraft|re-draft|retry/i);
    expect(stopped.textContent).not.toContain(INCOMPLETE);
    expect(stopped.querySelector('.bd-primary')).toBeNull();
    expect(stopped.querySelector('textarea')).toBeNull();
    expect(complete.classList.contains('st-done')).toBe(true);
    expect(complete.textContent).toContain('Complete efficacy');
    expect(container.querySelector('.bd-prog-txt')?.textContent).toBe('1/2 drafted');
    expect(acceptCalls()).toHaveLength(0);
    fireEvent.click(acceptButton(complete));
    await waitFor(() => expect(acceptCalls()).toHaveLength(1));
    expect(acceptCalls()[0].url).toContain('/documents/8/accept');
    expect(acceptedBody()).toMatchObject({ content: COMPLETE, finish_reason: 'stop', truncated: false });
    expect(JSON.stringify(acceptCalls())).not.toContain(INCOMPLETE);
  });
});

describe('BatchDraft existing non-cutoff review controls', () => {
  it.each(['end_turn', 'unknown', undefined, null])('preserves a usable review card for reason %s without certifying completeness', async finishReason => {
    results = [draft({ finishReason, truncated: false })];
    const container = await renderAndDraft();
    expect(card(container).classList.contains('st-done')).toBe(true);
    expect(card(container).textContent).toContain('The investigator must review the evidence.');
    expect(acceptButton(card(container)).disabled).toBe(false);
    expect(container.querySelector('.bd-prog-txt')?.textContent).toBe('1/1 drafted');
    expect(container.textContent).not.toMatch(/verified complete|scientifically complete/i);
    expect(acceptCalls()).toHaveLength(0);
  });
});
