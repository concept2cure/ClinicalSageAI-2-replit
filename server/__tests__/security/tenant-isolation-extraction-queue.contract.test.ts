/**
 * Tenant contract test — the auto-extraction job queue.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `autoExtractionPipeline` keeps its jobs in a process-global Map. Each job
 * carries the organizationId it was queued under, and neither reader consulted
 * it:
 *
 *     export function getExtractionStatus(jobId: string) {
 *       return extractionQueue.get(jobId);          // <-- no tenant term
 *     }
 *     export function getProjectExtractionJobs(projectId: number) {
 *       return [...extractionQueue.values()].filter(j => j.projectId === projectId);
 *     }
 *
 * Both are exposed unauthenticated-by-tenant at
 * GET /api/audit-services/extraction/status/:jobId and
 * GET /api/audit-services/extraction/project/:projectId
 * (server/routes/audit-services.ts, mounted by
 * register-advanced-platform-routes.ts:137).
 *
 * What a foreign caller received is not a status string. `job.result` holds
 * `textContent` — up to 50,000 characters of the extracted source document —
 * plus every parsed table, section and entity, and `contentHash`, a sha256 of
 * the UNTRUNCATED text. The project reader is keyed on an integer, so it needs
 * no guessing at all.
 *
 * The writer on the same router was already hardened: the POST that queues an
 * extraction takes its organization from the authenticated context and refuses
 * without one. Only the two readers were left open.
 *
 * ── What is asserted ─────────────────────────────────────────────────────────
 * That a job is reachable only under the organization it was queued for, that a
 * foreign job is indistinguishable from a missing one, and that an unusable
 * organization returns nothing rather than everything.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockPoolQuery, mockResolveGovernedContext, mockAiChat } = vi.hoisted(() => ({
  mockPoolQuery: vi.fn(),
  mockResolveGovernedContext: vi.fn(),
  mockAiChat: vi.fn(),
}));

vi.mock('../../db', () => ({ pool: { query: mockPoolQuery } }));
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: mockAiChat } }));
vi.mock('../../services/concept2cure/governedDocumentContractService.js', () => ({
  resolveGovernedContext: mockResolveGovernedContext,
}));

const ORG_A = 7;
const ORG_B = 991;
const PROJECT_A = 100;

let queueExtraction: any;
let getExtractionStatus: any;
let getProjectExtractionJobs: any;

beforeEach(async () => {
  vi.clearAllMocks();
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockResolveGovernedContext.mockResolvedValue(null);
  mockAiChat.mockResolvedValue({ content: '{}' });

  vi.resetModules();
  const mod = await import('../../services/autoExtractionPipeline');
  queueExtraction = mod.queueExtraction;
  getExtractionStatus = mod.getExtractionStatus;
  getProjectExtractionJobs = mod.getProjectExtractionJobs;
});

/** Queue one job for an organization and hand back its id. */
async function seed(organizationId: number, projectId = PROJECT_A, fileName = 'protocol.pdf') {
  const job = await queueExtraction(
    `file-${organizationId}-${projectId}`,
    fileName,
    1024,
    projectId,
    organizationId,
    1,
    { priority: 5 }
  );
  return job.id as string;
}

describe('Extraction queue — a job is reachable only under its own organization', () => {
  it('returns the job to the organization that queued it', async () => {
    const jobId = await seed(ORG_A);
    const job = getExtractionStatus(jobId, ORG_A);
    expect(job).toBeDefined();
    expect(job.organizationId).toBe(ORG_A);
  });

  it('does not return another organization\'s job', async () => {
    const jobId = await seed(ORG_A);
    // The decisive assertion. Unfixed, this hands ORG_B the whole job —
    // including job.result.textContent, up to 50,000 characters of ORG_A's
    // source document.
    expect(getExtractionStatus(jobId, ORG_B)).toBeUndefined();
  });

  it('reports a foreign job exactly as it reports a missing one', async () => {
    const jobId = await seed(ORG_A);
    const foreign = getExtractionStatus(jobId, ORG_B);
    const missing = getExtractionStatus('00000000-0000-4000-8000-000000000000', ORG_B);
    // Identical, so the reader cannot be used to prove a job id exists.
    expect(foreign).toBe(missing);
    expect(foreign).toBeUndefined();
  });

  it('fails closed on an unusable organization', async () => {
    const jobId = await seed(ORG_A);
    // 0 is not a harmless default here: it is an explicit global carve-out in
    // the artifacts RLS policy, so an org that arrives as 0 must not read.
    for (const org of [0, -1, Number.NaN, undefined as any, null as any]) {
      expect(getExtractionStatus(jobId, org)).toBeUndefined();
    }
  });
});

describe('Extraction queue — the project listing is scoped too', () => {
  it('lists only the caller organization\'s jobs for a project', async () => {
    await seed(ORG_A, PROJECT_A, 'a-protocol.pdf');
    await seed(ORG_B, PROJECT_A, 'b-protocol.pdf');

    const forA = getProjectExtractionJobs(PROJECT_A, ORG_A);
    expect(forA).toHaveLength(1);
    expect(forA[0].organizationId).toBe(ORG_A);
    expect(forA[0].fileName).toBe('a-protocol.pdf');

    const forB = getProjectExtractionJobs(PROJECT_A, ORG_B);
    expect(forB).toHaveLength(1);
    expect(forB[0].organizationId).toBe(ORG_B);
  });

  it('returns nothing for a project that belongs to another organization', async () => {
    await seed(ORG_A, PROJECT_A);
    // projectId is an integer and therefore enumerable — this is the cheap
    // path a foreign caller would actually take.
    expect(getProjectExtractionJobs(PROJECT_A, ORG_B)).toEqual([]);
  });

  it('returns an empty list, not the whole queue, for an unusable organization', async () => {
    await seed(ORG_A, PROJECT_A);
    for (const org of [0, -1, Number.NaN, undefined as any, null as any]) {
      expect(getProjectExtractionJobs(PROJECT_A, org)).toEqual([]);
    }
  });
});
