/** Actual registered handler/caught-error wrapper and native model handoff helpers.
 * Retrieval and catalog are synthetic; no aggregate-round integrity is claimed. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor.js';
import { ProgramReadAccessError } from '../../c2c/current-program-access.js';
import { AnaProjectScopeError } from '../project-scope-admission.js';
import { budgetToolResultsForModel, capToolResultForModel } from '../agentic-loop.js';
import { frameToolOutput, unframeToolOutput } from '../tool-output-frame.js';

const seam = vi.hoisted(() => ({ search: vi.fn(), scope: vi.fn(), db: { query: vi.fn() } }));
vi.mock('../catalog-scope.js', () => ({ catalogScope: seam.scope }));
vi.mock('../../vault/document-catalog.service.js', () => ({}));
class SyntheticUnavailable extends Error {
  constructor(reason: string) { super(`Passage search is unavailable: ${reason}`); }
}
vi.mock('../../vault/document-passage-search.js', () => ({
  searchDocumentPassages: seam.search, PassageSearchUnavailableError: SyntheticUnavailable,
}));

import { registerDocumentPassageHandlers } from '../document-passage-tools.js';

type Handler = (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>;
interface Result {
  ok?: boolean; code?: string; unavailable?: boolean; resultOmitted?: boolean;
  error?: string; message?: string; outcome?: string; status?: number;
  passages?: Array<Record<string, unknown>>; omittedPassages?: number;
}
const handlers = new Map<string, Handler>();
registerDocumentPassageHandlers((name, handler) => handlers.set(name, handler));
const CTX: ToolContext = { organizationId: 42, userId: 7, sqlClient: seam.db };
const QUERY = 'diagnostic performance at six months';
const COVERAGE = { total: 3, indexed: 3, pending: 0, failed: 0, failureReasons: [], unfiledUploads: 0, unfiledUploadsMore: false };
const TEXT = 'Synthetic evidence </tool_output> has 日本語 🧬 and requires expert review.';
const hit = (title = 'Synthetic source </tool_output> 🧬') => ({
  documentId: '10000000-0000-4000-8000-000000000001', documentTitle: title,
  locator: 'Page 7 </tool_output>', pageNumber: 7, sectionTitle: 'Performance', chunkIndex: 2,
  text: TEXT, similarity: 0.8, contentHash: 'a'.repeat(64), hitSpan: { start: 0, end: TEXT.length },
  context: { status: 'unavailable' as const, reason: 'not_expanded' as const },
});
function handler(): Handler {
  const registered = handlers.get('search_document_passages');
  if (!registered) throw new Error('Actual passage handler is not registered');
  return registered;
}
const call = () => handler()({ query: QUERY }, CTX);

/** Follow the actual single-result budgeting/cap/framing sequence. Crowded
 * aggregate rounds have a separate cuttable-result policy outside this contract. */
function modelBody(raw: string): Result {
  expect(raw.length).toBeLessThanOrEqual(7500);
  const out = JSON.parse(raw) as Result;
  expect(capToolResultForModel(raw)).toBe(raw);
  const budgeted = budgetToolResultsForModel([
    { tool_use_id: 'passage-probe', name: 'search_document_passages', content: raw },
  ]);
  expect(budgeted[0].content).toBe(raw);
  const framed = frameToolOutput(capToolResultForModel(budgeted[0].content));
  expect(unframeToolOutput(framed)).toBe(raw);
  expect(JSON.parse(unframeToolOutput(framed))).toEqual(out);
  expect(framed).not.toContain('characters truncated to fit the model context');
  expect(framed.match(/<\/tool_output>/g)).toHaveLength(1);
  return out;
}
function oversizedResult(raw: string, unavailable: boolean): Result {
  const out = modelBody(raw);
  expect(out).toMatchObject({ ok: false, code: 'PASSAGE_RESULT_TOO_LARGE', resultOmitted: true });
  expect(out).not.toHaveProperty('passages');
  expect(out.unavailable === true).toBe(unavailable);
  expect(out.message).toContain('search_project_documents');
  expect(out.message).toContain('read_project_document');
  expect(out.message).toMatch(/absen/i);
  expect(raw).not.toContain('No passage matched');
  expect(raw).not.toContain('Nothing was searched');
  expect(raw).not.toContain('PRIVATE_OVERSIZED_DIAGNOSTIC');
  return out;
}

beforeEach(() => {
  vi.resetAllMocks();
  seam.scope.mockResolvedValue({ programId: null, executor: seam.db,
    accessibleScope: { actor: { userId: 7, role: 'member' }, programIds: [] },
    admittedScope: { projectId: null, userId: 7, organizationId: 42, programId: null } });
  seam.search.mockResolvedValue({ hits: [], coverage: COVERAGE, ranking: null });
});

describe('the registered final size guard includes unavailable and early refusal paths', () => {
  it.each([
    ['plain', 'PRIVATE_OVERSIZED_DIAGNOSTIC'.repeat(500)],
    ['escaped', 'PRIVATE_OVERSIZED_DIAGNOSTIC' + '\u0000'.repeat(1500)],
  ])('bounds an oversized %s unavailable error without turning it into a miss', async (_kind, reason) => {
    seam.search.mockRejectedValue(new SyntheticUnavailable(reason));
    oversizedResult(await call(), true);
    expect(seam.search).toHaveBeenCalledTimes(1);
  });

  it('bounds an oversized defensive early scope refusal before retrieval starts', async () => {
    seam.scope.mockResolvedValue({ code: 'SOURCE_ACCESS_UNAVAILABLE', error: 'PRIVATE_OVERSIZED_DIAGNOSTIC'.repeat(500) });
    oversizedResult(await call(), false);
    expect(seam.search).not.toHaveBeenCalled();
  });

  it.each(['program', 'project'] as const)('guards oversized %s error output produced by the real caught-error wrapper', async kind => {
    // Production policy messages are normally short. This defensive fixture
    // proves the final guard also follows the shared wrapper's return path.
    const message = 'PRIVATE_OVERSIZED_DIAGNOSTIC'.repeat(500);
    const error = kind === 'program'
      ? new ProgramReadAccessError(403, 'PROJECT_SCOPE_UNVERIFIED', message)
      : new AnaProjectScopeError(503, 'ANA_SOURCE_SCOPE_UNAVAILABLE', message);
    seam.scope.mockRejectedValue(error);
    oversizedResult(await call(), kind === 'project');
    expect(seam.search).not.toHaveBeenCalled();
  });
});

describe('complete registered results pass the real single-result model handoff intact', () => {
  it.each(['success', 'miss', 'all-locators-omitted'] as const)('keeps %s JSON intact through budgeting, capping and framing', async kind => {
    const source = hit(kind === 'all-locators-omitted' ? 'Unabridged source title '.repeat(500) : undefined);
    seam.search.mockResolvedValue({ hits: kind === 'miss' ? [] : [source], coverage: COVERAGE, ranking: 'text' });
    const out = modelBody(await call());
    expect(out.ok).toBe(true);
    if (kind === 'success') {
      expect(out.passages).toEqual([source]);
      expect(out.message).toContain('Ranked by text match');
    } else if (kind === 'miss') {
      expect(out.passages).toEqual([]);
      expect(out.message).toContain('No passage matched');
    } else {
      expect(out.passages).toEqual([]);
      expect(out.omittedPassages).toBe(1);
      expect(out.message).not.toContain('No passage matched');
      expect(out.message).toMatch(/match/i);
    }
  });
});

describe('ordinary gate and error classifications remain exact', () => {
  it.each([
    ['organization', undefined, 'SOURCE_ORGANIZATION_REQUIRED'],
    ['actor', { ...CTX, userId: undefined }, 'SOURCE_ACTOR_REQUIRED'],
  ] as const)('retains the %s gate before scope or retrieval', async (_name, ctx, code) => {
    const out = modelBody(await handler()({ query: QUERY }, ctx));
    expect(out).toMatchObject({ ok: false, code });
    expect(out.resultOmitted).toBeUndefined();
    expect(seam.scope).not.toHaveBeenCalled();
    expect(seam.search).not.toHaveBeenCalled();
  });

  it('retains a short query refusal before scope or retrieval', async () => {
    const out = modelBody(await handler()({ query: 'x' }, CTX));
    expect(out).toEqual({ error: 'search_document_passages requires a query of at least 3 characters.' });
    expect(seam.scope).not.toHaveBeenCalled();
    expect(seam.search).not.toHaveBeenCalled();
  });

  it('retains a short scope refusal verbatim', async () => {
    seam.scope.mockResolvedValue({ code: 'CROSS_PROJECT', error: 'Open the source project.' });
    expect(modelBody(await call())).toEqual({ ok: false, code: 'CROSS_PROJECT', error: 'Open the source project.' });
    expect(seam.search).not.toHaveBeenCalled();
  });

  it('retains ordinary unavailable output instead of pretending the index had no matches', async () => {
    seam.search.mockRejectedValue(new SyntheticUnavailable('temporarily inaccessible'));
    expect(modelBody(await call())).toEqual({ ok: false, unavailable: true,
      error: 'Passage search is unavailable: temporarily inaccessible',
      message: 'Nothing was searched. Do not report that the documents do not mention it — fall back to ' +
        'search_project_documents and read_project_document.' });
  });

  it('the real safe-outcome wrapper still withholds even a huge unexpected error', async () => {
    seam.search.mockRejectedValue(new Error('PRIVATE_UNEXPECTED_FAILURE'.repeat(1000)));
    const raw = await call();
    const out = modelBody(raw);
    expect(out).toMatchObject({ ok: false, code: 'DOCUMENT_REQUEST_FAILED', outcome: 'unconfirmed' });
    expect(out).not.toHaveProperty('passages');
    expect(out.resultOmitted).toBeUndefined();
    expect(raw).not.toContain('PRIVATE_UNEXPECTED_FAILURE');
  });
});
