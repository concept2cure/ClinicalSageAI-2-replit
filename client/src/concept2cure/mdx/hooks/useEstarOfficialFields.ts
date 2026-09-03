/**
 * useEstarOfficialFields — the "what will be written" preview for the official
 * FDA eSTAR, consuming GET /api/510k/estar/official-fields (read-only; the
 * route produces nothing). One row per mapped template field: the template's
 * caption, the governed value the platform holds for the open program, and the
 * store it came from. Unsourced keys come back with value/source null — the
 * surface offers an input for those, scoped to a single export and never
 * stored.
 *
 * Honest by construction: a 404 (program not in this org) or a 422 (the
 * descriptor's field map is not populated) surfaces as `error`, never as an
 * empty field list — useFetchJson already throws on every non-2xx, and this
 * hook adds nothing that could quietly turn a refusal into "no fields". A 200
 * whose body is not the documented shape is an error too, for the same reason.
 *
 * The error is a sentence, not the transport line. useFetchJson's message is
 * `HTTP <status>: <first 200 chars of body>`, and ErrorState's internals
 * filter (client/src/lib/queryClient.ts redactInternals) redacts anything that
 * BEGINS with a status to '' — so passing it through left the user a bare
 * title and a retry that could not succeed on a 404 or 422. The hook derives
 * a human `error` and an `errorKind` from the status and, where present, the
 * `"error":"CODE"` token; the surface offers retry only for 'failed'.
 *
 * Mirrors useDeviceProfile: a pure, exported URL builder plus a thin adapter of
 * useFetchJson's `data` into the surface shape.
 */

import { useFetchJson } from './useFetchJson';

export type OfficialEstarType = '510k';
export type OfficialEstarVariant = 'device' | 'ivd';

export interface OfficialFieldView {
  /** Canonical key (e.g. deviceTradeName). */
  key: string;
  /** The template's own caption for the field. */
  caption: string;
  /** The XFA SOM path the fill writes to; null when the map carries none. */
  xfaSomPath: string | null;
  /** The governed value, or null when the platform holds none. */
  value: string | null;
  /** 'store.column' provenance, or null for a user-supplied-only key. */
  source: string | null;
}

export interface OfficialFieldsView {
  descriptorId: string;
  type: string;
  variant: string;
  mappedCount: number;
  sourcedCount: number;
  fields: OfficialFieldView[];
}

/**
 * Build the /official-fields URL. Pure + exported so the query contract is
 * unit-testable without a DOM. Null disables the fetch (useFetchJson idle).
 */
export function officialFieldsUrl(
  ident: string | null,
  type: OfficialEstarType,
  variant: OfficialEstarVariant,
): string | null {
  if (!ident) return null;
  const params = new URLSearchParams();
  params.set('ident', ident);
  params.set('type', type);
  params.set('variant', variant);
  return `/api/510k/estar/official-fields?${params.toString()}`;
}

/** The stores a governed value may come from, in the words a reader knows
 *  them by. Keyed by the store half of a 'store.column' provenance string. */
const STORE_WORDS: Record<string, string> = {
  regulatory_programs: 'Device profile',
  organizations: 'Organization',
  fda_510k_projects: '510(k) project',
  client_workspaces: 'Client workspace',
};

/** Column halves that need more than an underscore-to-space rewrite. */
const COLUMN_WORDS: Record<string, string> = {
  'predicate_devices[0].kNumber': 'first predicate · K-number',
  'predicate_devices[0].name': 'first predicate · name',
  'predicate_devices[0].manufacturer': 'first predicate · manufacturer',
};

export const REQUEST_SOURCE_WORDS = 'Entered for this export · not stored';
export const NO_SOURCE_WORDS = 'No governed source';

/**
 * Render a provenance string as plain words for the surface — the user reads
 * "Device profile · product name", never a store or column name. Unknown
 * stores fall back to the column words alone so a new source is still
 * described rather than shown raw. Pure + exported for the unit test.
 */
export function sourceWords(source: string | null | undefined): string {
  if (!source) return NO_SOURCE_WORDS;
  if (source === 'request') return REQUEST_SOURCE_WORDS;
  const dot = source.indexOf('.');
  const store = dot === -1 ? source : source.slice(0, dot);
  const column = dot === -1 ? '' : source.slice(dot + 1);
  const columnWords = COLUMN_WORDS[column] ?? column.replace(/_/g, ' ');
  const storeWords = STORE_WORDS[store];
  if (!storeWords) return columnWords || 'Governed record';
  return columnWords ? `${storeWords} · ${columnWords}` : storeWords;
}

/**
 * Why the field list is not on screen.
 *   not-found       the route refused the ident org-scoped (404) — a retry
 *                   cannot change that;
 *   not-producible  the descriptor's field map is not populated (422) — there
 *                   is nothing to preview until it is;
 *   failed          anything else: a 5xx, a proxy page, a network throw, a
 *                   body that is not a field list — a retry may succeed.
 */
export type OfficialFieldsErrorKind = 'not-found' | 'not-producible' | 'failed';

export interface OfficialFieldsError {
  error: string | null;
  errorKind: OfficialFieldsErrorKind | null;
}

const NOT_FOUND_WORDS = 'This program was not found in your organization';
const NOT_PRODUCIBLE_WORDS =
  'The field map for this template is not populated, so there is nothing to preview';
const FAILED_WORDS = 'The field list could not be loaded';
const NOT_A_FIELD_LIST_WORDS = 'The field list could not be read';

/** The status useFetchJson prefixes: `HTTP <status>[: <body>]`. */
const HTTP_STATUS = /^\s*HTTP\s+(\d{3})\b/;
/** The `"error":"CODE"` token of an error envelope — matched, never parsed,
 *  because the body may be cut at 200 characters and is rarely a whole object. */
const ERROR_CODE = /"error"\s*:\s*"([A-Z][A-Z0-9_]*)"/;

/**
 * Derive the sentence and kind from useFetchJson's message. Pure + exported so
 * the status → sentence mapping is pinned without a DOM, including the
 * truncated-body case. Never JSON.parse — the body is a fragment.
 */
export function describeOfficialFieldsError(message: string | null | undefined): OfficialFieldsError {
  if (!message) return { error: null, errorKind: null };
  const status = HTTP_STATUS.exec(message)?.[1] ?? null;
  const code = ERROR_CODE.exec(message)?.[1] ?? null;
  if (code === 'ESTAR_FIELD_MAP_NOT_POPULATED' || status === '422') {
    return { error: NOT_PRODUCIBLE_WORDS, errorKind: 'not-producible' };
  }
  if (status === '404') return { error: NOT_FOUND_WORDS, errorKind: 'not-found' };
  return { error: FAILED_WORDS, errorKind: 'failed' };
}

export interface UseEstarOfficialFieldsResult extends OfficialFieldsError {
  fields: OfficialFieldsView | null;
  loading: boolean;
  refresh: () => void;
}

function isOfficialFieldsView(data: unknown): data is OfficialFieldsView {
  if (!data || typeof data !== 'object') return false;
  const d = data as Partial<OfficialFieldsView>;
  return (
    Array.isArray(d.fields) &&
    typeof d.mappedCount === 'number' &&
    typeof d.sourcedCount === 'number'
  );
}

export function useEstarOfficialFields(
  ident: string | null,
  type: OfficialEstarType,
  variant: OfficialEstarVariant,
): UseEstarOfficialFieldsResult {
  const url = officialFieldsUrl(ident, type, variant);
  const { data, loading, error, refresh } = useFetchJson<unknown>(url);
  if (data !== null && !isOfficialFieldsView(data)) {
    /* A 200 that is not the documented shape is not a field list. Saying so
       beats rendering an empty table over a body nobody has read. */
    return { fields: null, loading, error: NOT_A_FIELD_LIST_WORDS, errorKind: 'failed', refresh };
  }
  return { fields: data ?? null, loading, ...describeOfficialFieldsError(error), refresh };
}
