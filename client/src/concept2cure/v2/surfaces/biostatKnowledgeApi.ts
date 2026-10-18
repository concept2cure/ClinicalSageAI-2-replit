/**
 * The biostatistics knowledge graph — the wire, and what is true about it.
 *
 * ── What this closes ─────────────────────────────────────────────────────────
 * Five routes under `/api/biostat/knowledge/*` were mounted and reached by NO
 * client code: query, ingest-csr, method-landscape, endpoint-method-matrix,
 * trend. The panel in `biostatKnowledge.tsx` is the first caller.
 *
 * ── What the three outcome-backed views can and cannot show ──────────────────
 * `method-landscape`, `endpoint-method-matrix` and `trend` all aggregate ONE
 * table, `method_regulatory_outcomes`, and that table HAS NO WRITER anywhere in
 * this repository — searched 2026-10-13 across `server/`, `shared/`,
 * `migrations/` and `scripts/`: three read sites, zero inserts.
 *
 * It cannot be filled from a CSR either. `ingestFromCSR` has the indication,
 * the endpoints, the parsed statistical methods, the phase and the agency — but
 * `method_regulatory_outcomes.accepted` is NOT NULL and a CSR carries no
 * agency-acceptance datum. `csr_reports.status` is this platform's own document
 * workflow ('draft' → 'approved'); deriving `accepted` from it would assert
 * that a regulator accepted a statistical method because a colleague approved a
 * document, and `getMethodLandscape` then divides by it to publish a SUCCESS
 * RATE. That is the figure a sponsor would take to a regulator.
 *
 * So the three views are structurally empty, and the UI says that in those
 * words — `PRECEDENT_STORE_EMPTY` below. "No precedent found for this
 * indication" would be a statement about the regulatory record. The true
 * statement is about this platform.
 *
 * Recording real precedent is a product decision, not a cleanup: it needs a
 * datum nothing currently captures. Filed for the founder rather than invented
 * here.
 *
 * @module client/src/concept2cure/v2/surfaces/biostatKnowledgeApi
 */
import { readOne } from './biostatPanelWire';

export { FAILED, messageOf, type Read } from './biostatPanelWire';

/** A node in the sponsor's own method graph. */
export interface GraphNode {
  id: number;
  nodeType: string;
  name: string;
  description: string | null;
  properties?: unknown;
  sourceCount: number | null;
}

export interface GraphEdge {
  id: number;
  sourceNodeId: number;
  targetNodeId: number;
  edgeType: string;
  weight: number | null;
  evidence?: unknown;
}

/**
 * What a query found. There is deliberately no `confidence`: the server
 * returned one until 2026-10-13 and it was the matched-row count rescaled into
 * [0.1, 0.95] so it would read as a probability.
 */
export interface GraphQueryResult {
  /** Narration over the rows. Null when the model did not answer. */
  answer: string | null;
  answerIsNarration: true;
  answerUnavailableReason: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  matchedNodeCount: number;
  matchedEdgeCount: number;
  /** False when the model that turns a question into search terms did not run. */
  parsedByModel: boolean;
  parseNote: string | null;
}

export interface IngestResult {
  nodesCreated: number;
  edgesCreated: number;
  csrId: number;
  indication: string | null;
}

export interface MethodLandscapeEntry {
  methodName: string;
  methodNodeId: number | null;
  totalUses: number;
  acceptedCount: number;
  rejectedCount: number;
  successRate: number;
  agencies: string[];
  phases: string[];
}

export interface EndpointMethodMatrixEntry {
  endpoint: string;
  method: string;
  totalCount: number;
  acceptedCount: number;
  successRate: number;
  agencies: string[];
}

export interface MethodTrendEntry {
  year: number;
  count: number;
  acceptedCount: number;
  successRate: number;
}

/**
 * Why a precedent view is empty — about this platform, not about the
 * regulatory record. See this module's header for the search that establishes
 * it.
 */
export const PRECEDENT_STORE_EMPTY =
  'Nothing in Concept2Cure records a regulatory outcome for a statistical method yet, so this view is ' +
  'empty for every indication — this is not a finding that no precedent exists. Ingesting a CSR builds ' +
  'the method graph above, but a CSR does not state whether an agency accepted the method, and that is ' +
  'the one datum these three views aggregate.';

const BASE = '/api/biostat/knowledge';

/** Only the parameters the server actually honours are sent. */
export interface MatrixFilters {
  indication?: string;
  phase?: string;
  agency?: string;
}

function qs(filters: MatrixFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (typeof v === 'string' && v.trim().length > 0) p.set(k, v.trim());
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const knowledgeApi = {
  query: (query: string) => readOne<GraphQueryResult>('POST', `${BASE}/query`, { query }),
  ingestCsr: (csrId: number) => readOne<IngestResult>('POST', `${BASE}/ingest-csr`, { csrId }),
  methodLandscape: (indication: string) =>
    readOne<MethodLandscapeEntry[]>('GET', `${BASE}/method-landscape/${encodeURIComponent(indication)}`),
  /* `phase` and `agency` are NOT offered for the landscape: the service
     aggregates across both and the route drops them. A filter the server
     ignores is worse than no filter. */
  endpointMethodMatrix: (filters: MatrixFilters = {}) =>
    readOne<EndpointMethodMatrixEntry[]>('GET', `${BASE}/endpoint-method-matrix${qs(filters)}`),
  trend: (concept: string) =>
    readOne<MethodTrendEntry[]>('GET', `${BASE}/trend/${encodeURIComponent(concept)}`),
};
