/**
 * Submission Center API client (typed)
 *
 * One typed wrapper over every Submission Center endpoint, returning the shared
 * contract shapes from @shared/types/submission-api. Auth is the platform's
 * cookie session (`credentials: 'include'`) — no tokens in JS. Errors are
 * normalized to `SubmissionApiError { code, message }`.
 *
 * A dropped-in UI kit imports these (directly or via the hooks in ./hooks) and
 * never hand-rolls a fetch. See _install/README.md.
 */

import type {
  CreateSubmissionRequest,
  SubmissionResponse,
  SubmissionListResponse,
  CreateSequenceRequest,
  SequenceResponse,
  SequenceListResponse,
  TransitionSequenceRequest,
  UpsertLeafRequest,
  LeafResponse,
  LeafListResponse,
  PlanRequest,
  PlanResponse,
  ValidationExplainRequest,
  ValidationExplainResponse,
  CrossRegionRequest,
  CrossRegionResponse,
  DispatchQcRequest,
  DispatchQcResponse,
  ProvenanceResponse,
  ConsistencyCheckRequest,
  ConsistencyResponse,
  ShadowReviewRequest,
  ShadowReviewRunResponse,
  ShadowFindingResponse,
  RegionProfileResponse,
  GenerateSectionRequest,
  GenerateSectionChunk,
  GenerateSectionResult,
} from '@shared/types/submission-api';

export class SubmissionApiError extends Error {
  constructor(public code: string, message: string, public status?: number, public details?: unknown) {
    super(message);
    this.name = 'SubmissionApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new SubmissionApiError('NETWORK', e instanceof Error ? e.message : 'Network request failed.');
  }
  const text = await res.text();
  const json = text ? safeJson(text) : undefined;
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error;
    throw new SubmissionApiError(err?.code ?? 'INTERNAL', err?.message ?? `Request failed (${res.status}).`, res.status, err?.details);
  }
  return json as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
}

export const submissionClient = {
  // Portfolio + hub
  listSubmissions: () => request<SubmissionListResponse>('GET', '/api/submissions'),
  createSubmission: (b: CreateSubmissionRequest) => request<SubmissionResponse>('POST', '/api/submissions', b),
  getSubmission: (id: number) => request<SubmissionResponse>('GET', `/api/submissions/${id}`),

  // Sequences
  listSequences: (id: number) => request<SequenceListResponse>('GET', `/api/submissions/${id}/sequences`),
  createSequence: (id: number, b: CreateSequenceRequest) => request<SequenceResponse>('POST', `/api/submissions/${id}/sequences`, b),
  transitionSequence: (seqId: number, b: TransitionSequenceRequest) =>
    request<SequenceResponse>('POST', `/api/submissions/sequences/${seqId}/transition`, b),

  // Builder leaves
  listLeaves: (seqId: number) => request<LeafListResponse>('GET', `/api/submissions/sequences/${seqId}/leaves`),
  upsertLeaf: (seqId: number, b: UpsertLeafRequest) => request<LeafResponse>('PUT', `/api/submissions/sequences/${seqId}/leaves`, b),

  // Planner
  plan: (id: number, b: PlanRequest) => request<PlanResponse>('POST', `/api/submissions/${id}/plan`, b),

  // Validation co-pilot
  explainValidation: (id: number, b: ValidationExplainRequest) =>
    request<ValidationExplainResponse>('POST', `/api/submissions/${id}/validation/explain`, b),

  // Cross-region
  crossRegion: (id: number, b: CrossRegionRequest) => request<CrossRegionResponse>('POST', `/api/submissions/${id}/cross-region`, b),

  // Dispatch QC (does not transmit)
  dispatchQc: (id: number, b: DispatchQcRequest) => request<DispatchQcResponse>('POST', `/api/submissions/${id}/dispatch-qc`, b),

  // Truth Engine
  provenance: (id: number, section: string) => request<ProvenanceResponse>('GET', `/api/submissions/${id}/provenance${qs({ section })}`),
  runConsistency: (id: number, b: ConsistencyCheckRequest) => request<ConsistencyResponse>('POST', `/api/submissions/${id}/consistency`, b),
  listConsistency: (id: number) => request<ConsistencyResponse>('GET', `/api/submissions/${id}/consistency`),

  // Shadow Review
  runShadowReview: (seqId: number, b: ShadowReviewRequest = {}) =>
    request<ShadowReviewRunResponse>('POST', `/api/submissions/sequences/${seqId}/shadow-review`, b),
  listShadowReviews: (seqId: number) => request<ShadowReviewRunResponse[]>('GET', `/api/submissions/sequences/${seqId}/shadow-review`),
  shadowFindings: (runId: number) => request<ShadowFindingResponse[]>('GET', `/api/submissions/shadow-review/${runId}/findings`),

  // Region profiles (static metadata)
  regionProfiles: () => request<RegionProfileResponse[]>('GET', '/api/region-profiles'),
  regionProfile: (region: string) => request<RegionProfileResponse>('GET', `/api/region-profiles/${region}`),
};

/**
 * Authoring is POST + Server-Sent-Events. `onChunk` fires per token; resolves
 * with the final `GenerateSectionResult` (the persisted governed draft). Pass an
 * AbortSignal to cancel. Rejects with SubmissionApiError on `event: error`.
 */
export async function generateSectionStream(
  submissionId: number,
  body: GenerateSectionRequest,
  onChunk: (c: GenerateSectionChunk) => void,
  signal?: AbortSignal
): Promise<GenerateSectionResult> {
  const res = await fetch(`/api/submissions/${submissionId}/sections/generate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new SubmissionApiError('PROVIDER_UNAVAILABLE', `Authoring stream failed (${res.status}).`, res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: GenerateSectionResult | undefined;
  let errored: SubmissionApiError | undefined;

  // Parse SSE frames separated by a blank line; each frame has `event:` + `data:`.
  const handleFrame = (frame: string) => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return;
    const data = safeJson(dataLines.join('\n'));
    if (event === 'chunk') onChunk(data as GenerateSectionChunk);
    else if (event === 'done') result = data as GenerateSectionResult;
    else if (event === 'error') {
      const e = data as { code?: string; message?: string };
      errored = new SubmissionApiError(e?.code ?? 'INTERNAL', e?.message ?? 'Authoring failed.');
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      handleFrame(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 2);
    }
  }
  if (buffer.trim()) handleFrame(buffer);
  if (errored) throw errored;
  if (!result) throw new SubmissionApiError('INVALID_AI_RESPONSE', 'Authoring stream ended without a result.');
  return result;
}

export default submissionClient;
