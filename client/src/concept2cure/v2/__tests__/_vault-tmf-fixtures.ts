/**
 * Shared fixtures for the trial master file tests: one study's eTMF as a small
 * in-memory server, answered in the shapes server/routes/etmf.routes.ts sends.
 * Not a test file — the runners match *.test.tsx.
 *
 * The completeness answers are computed by the service's own pure assessment
 * (server/services/etmf/tmf-completeness.ts) over the filings held here, so a
 * filing or a removal changes what the next read says the way the server's
 * would. The refusals are written as their senders write them and read into
 * the error `apiRequest` throws by its own reader (`extractApiError`).
 *
 * `tmf.vaultDocs` is this project's Vault. A filing against a Vault document
 * that is not in it is refused as the server refuses it
 * (DOCUMENT_NOT_IN_PROJECT), and `stubVaultIngest` answers the Vault's upload
 * (POST /api/vault/ingest, through the XHR fake) by putting the file there.
 */
import { createHash } from 'node:crypto';
import { ApiRequestError, extractApiError } from '@/lib/queryClient';
import { TMF_REFERENCE_MODEL } from '@shared/constants/domain/tmf-reference-model';
import { assessTmfCompleteness, type TmfDocumentEvidence } from '../../../../../server/services/etmf/tmf-completeness';
import { ingestReceipt, stubIngestXhr, type IngestInit } from './_ingest-xhr-fake';
import { PID } from './_vault-surface-fixtures';

export const STUDY = { studyId: 'BX-204-201', programId: PID, title: 'BX-204 in plaque psoriasis', phase: '2', indication: 'Plaque psoriasis', status: 'draft', updatedAt: null };
export const EXTENSION = { ...STUDY, studyId: 'BX-204-301', title: 'BX-204 long-term extension', phase: '3' };
export const PLAN_DOC = '22222222-2222-4222-8222-222222222222';
export const PROTOCOL_DOC = '33333333-3333-4333-8333-333333333333';
/** The essential records of the one catalog, by code. */
export const ESSENTIAL = TMF_REFERENCE_MODEL.flatMap((z) => z.artifacts.filter((a) => a.essential).map((a) => a.code));
export const tmfBase = (studyId: string) => `/api/etmf/trials/${studyId}`;
export const BASE = tmfBase(STUDY.studyId);

export type VaultDocument = { title: string | null; version: string | null; current: boolean };
export type FilingRow = { id: string; artifactCode: string; documentRef: string | null; filedAt: string };
type Route = 'studies' | 'completeness' | 'filings' | 'file' | 'remove' | 'package';
export type Scope = 'essential' | 'all';
/** What a route answers: a response, or one still on its way. A refusal is thrown, as `apiRequest` throws it. */
type Answer = Response | Promise<Response>;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const GATE = (code: string, message: string) => ({ error: { code, message } }); // server/middleware/moduleEntitlementGate.ts
export const ROUTE = (code: string, message: string) => ({ success: false, error: code, message }); // server/routes/etmf.routes.ts
export const ROLE = { error: 'Insufficient permissions' }; // the role guard: no code
export const NOT_RELEASED = GATE('LAUNCH_SCOPE', 'This part of the product is not in this release.');
export const NOT_LICENSED = GATE('MODULE_NOT_LICENSED', 'This module is not part of your subscription.');
export const NO_STUDY = ROUTE('STUDY_NOT_FOUND', 'No study with this id is in a project you can open. Nothing was read or changed.');
export const FAILED = ROUTE('INTERNAL', 'eTMF request failed.');
export function refusal(status: number, payload: unknown): ApiRequestError {
  const { message, code } = extractApiError(payload, status);
  return new ApiRequestError(message, status, payload, code);
}

export const filing = (artifactCode: string, documentRef: string | null, n = 1): FilingRow =>
  ({ id: `f${n}f${n}f${n}f${n}-0000-4000-8000-00000000000${n}`, artifactCode, documentRef, filedAt: '2026-11-02T09:30:00.000Z' });

/**
 * The server's state: the project's studies, each study's live filings, and the Vault documents that exist.
 * `refuseWith` makes one route throw a refusal or answer something else. `resetTmf` restores it before each case.
 */
export const tmf = {
  studies: [] as unknown[],
  filings: {} as Record<string, FilingRow[]>,
  vaultDocs: new Map<string, VaultDocument>(),
  refuseWith: {} as Partial<Record<Route, (studyId: string, scope: Scope) => Answer>>,
};
export function resetTmf(): void {
  tmf.studies = [STUDY];
  tmf.filings = { [STUDY.studyId]: [filing('protocol', `vault://${PROTOCOL_DOC}`, 1)], [EXTENSION.studyId]: [] };
  tmf.vaultDocs = new Map([
    [PLAN_DOC, { title: 'Monitoring plan', version: '2', current: true }],
    [PROTOCOL_DOC, { title: 'Protocol BX-204-201', version: '1.0', current: true }],
  ]);
  tmf.refuseWith = {};
}

const vaultIdOf = (row: FilingRow) => /^vault:\/\/(.+)$/.exec((row.documentRef ?? '').trim())?.[1] ?? null;
function evidenceOf(row: FilingRow): TmfDocumentEvidence {
  if (!(row.documentRef ?? '').trim()) return 'no_document';
  const id = vaultIdOf(row);
  if (!id) return 'unverifiable';
  return tmf.vaultDocs.has(id) ? 'verified' : 'unresolved';
}

/** As GET …/completeness answers: the service's assessment of the study's live filings in a scope, with the study it is about. */
export function completenessOf(studyId: string = STUDY.studyId, scope: Scope = 'essential') {
  const rows = tmf.filings[studyId] ?? [];
  const study = studyId === EXTENSION.studyId ? EXTENSION : STUDY;
  return {
    ...assessTmfCompleteness({
      providedArtifacts: rows.map((f) => f.artifactCode),
      scope,
      documentEvidence: Object.fromEntries(rows.map((f) => [f.artifactCode, evidenceOf(f)])),
    }),
    study: { id: 7, studyId, programId: PID, protocolId: studyId, title: study.title, phase: study.phase, indication: study.indication, status: 'draft' },
  };
}

/** As GET …/artifacts answers: each live filing, with the document the server found for its reference, or null. */
export function filingsOf(studyId: string = STUDY.studyId) {
  return (tmf.filings[studyId] ?? []).map((f) => {
    const id = vaultIdOf(f);
    const found = id ? tmf.vaultDocs.get(id) : undefined;
    return { ...f, document: id && found ? { id, ...found } : null };
  });
}

const PACKAGE = new TextEncoder().encode('PK-inspection-package');
export const packageSha = createHash('sha256').update(PACKAGE).digest('hex');
/** As GET …/inspection-package answers. The server names the file by the study, whatever the scope (tmf-inspection-package.ts). */
export const packageResponse = (sha: string, ready = 'false') => new Response(PACKAGE, {
  status: 200,
  headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="tmf-inspection-BX-204-201.zip"', 'X-TMF-SHA256': sha, 'X-TMF-Ready': ready },
});

const SEARCH = { data: { query: 'plan', total: 1, limit: 25, offset: 0,
  results: [{ id: PLAN_DOC, title: 'Monitoring plan', version: '2', current: true, snippet: null, contentHash: 'a'.repeat(64) }] } };

export const NOT_IN_PROJECT = ROUTE('DOCUMENT_NOT_IN_PROJECT',
  "That Vault document is not held in this study's project, so the artifact cannot be recorded as filed against it. File a document from the project's own Vault.");

function fileIt(studyId: string, body: unknown): Response {
  const sent = body as { artifactCode?: string; documentRef?: string };
  const row = filing(String(sent.artifactCode), sent.documentRef ?? null, 9);
  // tmf-artifact-persistence.ts assertDocumentInStudyProject: a Vault reference must name a live document of the study's project.
  const id = vaultIdOf(row);
  if (id && !tmf.vaultDocs.has(id)) throw refusal(409, NOT_IN_PROJECT);
  tmf.filings[studyId] = [...(tmf.filings[studyId] ?? []).filter((f) => f.artifactCode !== row.artifactCode), row];
  return json(row, 201);
}
function removeIt(id: string): Response {
  for (const studyId of Object.keys(tmf.filings)) tmf.filings[studyId] = tmf.filings[studyId].filter((f) => f.id !== id);
  return new Response(null, { status: 204 });
}

/** A study's routes: `/api/etmf/trials/<studyId>/<rest>`. A route's refusal, when one is set, answers in its place. */
function studyRoute(method: string, studyId: string, rest: string, body: unknown): Answer | null {
  const scoped = /^(completeness|inspection-package)\?scope=(essential|all)$/.exec(rest);
  const scope = (scoped?.[2] ?? 'essential') as Scope;
  const routes: Partial<Record<string, [Route, () => Answer]>> = {
    'GET completeness': ['completeness', () => json(completenessOf(studyId, scope))],
    'GET artifacts': ['filings', () => json(filingsOf(studyId))],
    'GET inspection-package': ['package', () => packageResponse(packageSha)],
    'POST artifacts': ['file', () => fileIt(studyId, body)],
  };
  const route = routes[`${method} ${scoped?.[1] ?? rest}`];
  if (!route) return null;
  return tmf.refuseWith[route[0]]?.(studyId, scope) ?? route[1]();
}

/** The routes the section calls, answered from the state above; null for any other request. */
export async function tmfApi(method: string, url: string, body?: unknown): Promise<Response | null> {
  const ofStudy = /^\/api\/etmf\/trials\/([^/]+)\/(.+)$/.exec(url);
  if (ofStudy) return studyRoute(method, decodeURIComponent(ofStudy[1]), ofStudy[2], body);
  if (method === 'GET' && url === `/api/study-design?program_id=${PID}`) return tmf.refuseWith.studies?.('', 'essential') ?? json({ designs: tmf.studies });
  if (method === 'GET' && url.startsWith(`/api/c2c/project-vault/${PID}/search?q=`)) return json(SEARCH);
  if (method === 'DELETE' && url.startsWith('/api/etmf/artifacts/')) {
    return tmf.refuseWith.remove?.('', 'essential') ?? removeIt(decodeURIComponent(url.slice('/api/etmf/artifacts/'.length)));
  }
  return null;
}

/**
 * The Vault's upload, answered as POST /api/vault/ingest answers: the file is recorded as a document of the
 * project it was sent to, which then exists in that project's Vault. `other` answers a request another way
 * (a refusal, a reply that confirms nothing). Returns each request as it was sent.
 */
export function stubVaultIngest(other?: (form: FormData) => { status: number; body: unknown } | null) {
  const sent: Array<{ url: string; form: FormData }> = [];
  stubIngestXhr(async (url: string, init: IngestInit) => {
    const form = init.body as FormData;
    sent.push({ url, form });
    const answer = other?.(form);
    if (answer) return { ok: answer.status < 400, status: answer.status, json: async () => answer.body };
    const receipt = ingestReceipt(form);
    if (receipt.document.programId === PID) {
      tmf.vaultDocs.set(receipt.document.id, { title: receipt.document.documentTitle, version: receipt.document.version, current: true });
    }
    return { ok: true, status: 201, json: async () => receipt };
  });
  return sent;
}
