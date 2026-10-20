/** D2/W2: actual source-context issuer and authority; synthetic read boundaries.
 * No database, provider or replacement source-context implementation is used. */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const seam = vi.hoisted(() => ({ scope: vi.fn(), load: vi.fn(), actor: vi.fn(), program: vi.fn() }));
vi.mock('../catalog-scope', () => ({ catalogScope: seam.scope,
  sourceReadInput: (ctx: { userId?: number; projectId?: number | null; projectRef?: string | null },
    organizationId: number, requestedProgramId: string | null = null) => ({ organizationId,
    userId: ctx.userId ?? 0, projectId: ctx.projectId ?? null, projectRef: ctx.projectRef ?? null, requestedProgramId }) }));
vi.mock('../../vault/document-catalog.service', () => ({ loadDocumentForActor: seam.load,
  revalidateActorSourceScope: seam.actor }));
vi.mock('../../c2c/current-program-access', () => ({ requireProgramScopeStillCurrent: seam.program }));

import { DraftCancelledError } from '../batch-draft-result';
import { assertDraftSourceContextCurrent, loadDraftProjectSources,
  type DraftSourceContextIdentity } from '../draft-project-sources';

// Test the optional per-call contract without changing baseline production types.
const revalidate = assertDraftSourceContextCurrent as unknown as (
  context: unknown, identity: DraftSourceContextIdentity, signal?: AbortSignal
) => Promise<void>;
const SOURCE = '10000000-0000-4000-8000-000000000001';
const OTHER_SOURCE = '10000000-0000-4000-8000-000000000002';
const PROGRAM = '20000000-0000-4000-8000-000000000001';
const TEXT = 'Observed result: 12 of 30 participants 💊; investigator review required.';
const OTHER_TEXT = 'Device diagnostic sensitivity: 18 of 20 samples; review the source.';
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const executor = { query: vi.fn() };
const identity = { organizationId: 7, userId: 3, projectId: PROGRAM };
const actorContext = { organizationId: 7, userId: 3, projectRef: PROGRAM, sqlClient: executor };
const fullLoad = ['scope', 'meta:A', 'body:A', 'meta:B', 'body:B', 'current:A', 'current:B', 'actor', 'program'];
const fullAssertion = ['current:A', 'current:B', 'actor', 'program'];

function document(id: string, text: string) {
  return { id, organizationId: 7, programId: PROGRAM, contentHash: 'a'.repeat(64),
    documentTitle: 'Synthetic CSR', fileName: 'csr.pdf', extractedText: text, extractedTextSha256: sha(text),
    isCurrent: true, originalFileAvailable: true, disposition: null as string | null,
    sourceAccess: { currentUseEligible: true },
    catalog: { contentHash: 'a'.repeat(64), status: 'extracted', extractionMethod: 'pdf-text', extractionConfidence: null } };
}
const documents = new Map([[SOURCE, document(SOURCE, TEXT)], [OTHER_SOURCE, document(OTHER_SOURCE, OTHER_TEXT)]]);
let trace: string[];
let mode: 'load' | 'assert';
let bodyReads: Map<string, number>;
let activeController: AbortController | undefined;
let abortAt: string | undefined;
let rejectAt: string | undefined;
let readFailure: Error;

function boundary(operation: string) {
  trace.push(operation);
  if (operation === abortAt) activeController?.abort();
  if (operation === rejectAt) throw readFailure;
}
function selected(signal?: unknown) {
  const context = { ...actorContext, signal: signal as AbortSignal | undefined };
  return loadDraftProjectSources([SOURCE, OTHER_SOURCE], context, 'Observed result');
}
function assertionPhase(controller?: AbortController) {
  trace = [];
  mode = 'assert';
  activeController = controller;
}
async function settle<T>(promise: Promise<T>) {
  try { return { kind: 'fulfilled' as const, value: await promise }; }
  catch (error) { return { kind: 'rejected' as const, error }; }
}
async function expectStopped(promise: Promise<unknown>, expectedTrace: string[]) {
  const outcome = await settle(promise);
  // A fulfilled load would issue a genuine WeakMap context after Stop.
  expect.soft(outcome.kind).toBe('rejected');
  if (outcome.kind === 'rejected') expect.soft(outcome.error).toBeInstanceOf(DraftCancelledError);
  expect(trace).toEqual(expectedTrace);
}

beforeEach(() => {
  vi.resetAllMocks();
  trace = [];
  mode = 'load';
  bodyReads = new Map();
  activeController = undefined;
  abortAt = undefined;
  rejectAt = undefined;
  readFailure = new Error('Synthetic catalog operation rejected.');
  seam.scope.mockImplementation(async () => {
    boundary('scope');
    return { programId: PROGRAM, executor,
      admittedScope: { organizationId: 7, userId: 3, programId: PROGRAM, role: 'viewer', accessibleProgramIds: [PROGRAM] },
      accessibleScope: { actor: { userId: 3, role: 'viewer' }, programIds: [PROGRAM] } };
  });
  seam.load.mockImplementation(async ({ documentId }: { documentId: string }, options: { includeText?: boolean }) => {
    let stage = 'meta';
    if (options.includeText) {
      const count = bodyReads.get(documentId) ?? 0;
      stage = mode === 'assert' || count > 0 ? 'current' : 'body';
      bodyReads.set(documentId, count + 1);
    }
    boundary(`${stage}:${documentId === SOURCE ? 'A' : 'B'}`);
    return documents.get(documentId) ?? null;
  });
  seam.actor.mockImplementation(async () => { boundary('actor'); });
  seam.program.mockImplementation(async () => { boundary('program'); });
});

describe('selected-source loader operation cancellation', () => {
  it('starts no catalog or scope operation for a pre-aborted native signal', async () => {
    activeController = new AbortController();
    activeController.abort();
    await expectStopped(selected(activeController.signal), []);
  });

  it.each(fullLoad.map(operation => ({ operation })))(
    'stops after $operation settles and never issues a context or starts a later operation', async ({ operation }) => {
      activeController = new AbortController();
      abortAt = operation;
      await expectStopped(selected(activeController.signal), fullLoad.slice(0, fullLoad.indexOf(operation) + 1));
    },
  );

  it.each(['scope', 'body:A', 'current:A', 'actor', 'program'].map(operation => ({ operation })))(
    'retains the real rejection from $operation when Stop coincides', async ({ operation }) => {
      activeController = new AbortController();
      abortAt = operation;
      rejectAt = operation;
      await expect(selected(activeController.signal)).rejects.toBe(readFailure);
      expect(trace).toEqual(fullLoad.slice(0, fullLoad.indexOf(operation) + 1));
    },
  );
});

describe('genuine source-context per-consumer operation cancellation', () => {
  it('starts no authority read when the current consumer is already stopped', async () => {
    const context = await selected();
    const consumer = new AbortController();
    consumer.abort();
    assertionPhase(consumer);
    await expectStopped(revalidate(context, identity, consumer.signal), []);
  });

  it.each(fullAssertion.map(operation => ({ operation })))(
    'stops the current consumer after $operation without starting a later authority operation', async ({ operation }) => {
      const context = await selected();
      const consumer = new AbortController();
      assertionPhase(consumer);
      abortAt = operation;
      await expectStopped(revalidate(context, identity, consumer.signal),
        fullAssertion.slice(0, fullAssertion.indexOf(operation) + 1));
    },
  );

  it.each(fullAssertion.map(operation => ({ operation })))(
    'retains a real $operation rejection despite concurrent consumer Stop', async ({ operation }) => {
      const context = await selected();
      const consumer = new AbortController();
      assertionPhase(consumer);
      abortAt = operation;
      rejectAt = operation;
      await expect(revalidate(context, identity, consumer.signal)).rejects.toBe(readFailure);
      expect(trace).toEqual(fullAssertion.slice(0, fullAssertion.indexOf(operation) + 1));
    },
  );

  it('allows a fresh legitimate consumer after the loader signal is stopped', async () => {
    const loader = new AbortController();
    const context = await selected(loader.signal);
    loader.abort();
    const consumer = new AbortController();
    assertionPhase(consumer);
    await expect(revalidate(context, identity, consumer.signal)).resolves.toBeUndefined();
    expect(trace).toEqual(fullAssertion);
  });
});

describe('source identity and untrusted-signal controls', () => {
  it('preserves exact two-document text, spans, hashes and frozen authority with no signal', async () => {
    const context = await selected();
    expect(trace).toEqual(fullLoad);
    expect(context.status).toBe('loaded');
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.sources)).toBe(true);
    for (const [index, [documentId, text]] of [[SOURCE, TEXT], [OTHER_SOURCE, OTHER_TEXT]].entries()) {
      const source = context.sources[index];
      expect(source).toMatchObject({ version: 2, documentId, programId: PROGRAM, contentHash: 'a'.repeat(64),
        extractedTextSha256: sha(text), spanSha256: sha(text), text, completeText: true,
        span: { start: 0, end: text.length, totalChars: text.length } });
      expect(Object.isFrozen(source)).toBe(true);
      expect(Object.isFrozen(source.span)).toBe(true);
    }
    assertionPhase();
    await expect(revalidate(context, identity)).resolves.toBeUndefined();
    expect(trace).toEqual(fullAssertion);
    expect(executor.query).not.toHaveBeenCalled();
  });

  it('ignores a caller-forged signal without reading its aborted flag or calling its methods', async () => {
    const readAborted = vi.fn(() => true);
    const throwIfAborted = vi.fn(() => { throw new Error('Forged abort method must never run.'); });
    const addEventListener = vi.fn();
    const forged = { get aborted() { return readAborted(); }, throwIfAborted, addEventListener };
    const context = await selected(forged);
    expect(trace).toEqual(fullLoad);
    assertionPhase();
    await expect(revalidate(context, identity, forged as unknown as AbortSignal)).resolves.toBeUndefined();
    expect(trace).toEqual(fullAssertion);
    expect(readAborted).not.toHaveBeenCalled();
    expect(throwIfAborted).not.toHaveBeenCalled();
    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('retains private context identity and consumer pinning with an unstopped native signal', async () => {
    const controller = new AbortController();
    const context = await selected(controller.signal);
    assertionPhase(controller);
    await expect(revalidate({ ...context }, identity, controller.signal)).rejects.toThrow('SOURCE_CONTEXT_UNTRUSTED');
    await expect(revalidate(context, { ...identity, userId: 8 }, controller.signal)).rejects.toThrow('SOURCE_CONTEXT_IDENTITY_MISMATCH');
    expect(trace).toEqual([]);
    await expect(revalidate(context, identity, controller.signal)).resolves.toBeUndefined();
    expect(trace).toEqual(fullAssertion);
  });
});
