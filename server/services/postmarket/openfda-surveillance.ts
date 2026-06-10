/**
 * Post-market surveillance — openFDA device adverse-event (MAUDE) and recall
 * ingestion + signal aggregation. The evaluation flagged that MAUDE/recall feeds
 * were not integrated (only the 510(k) predicate endpoint was). This module
 * normalizes openFDA responses and computes surveillance signals.
 *
 * The network call sits behind an injectable `fetcher` seam so the
 * normalization + aggregation logic is unit-testable without network access;
 * the default fetcher uses the openFDA device endpoints.
 */

// ── MAUDE adverse events ─────────────────────────────────────────────────────

export type MaudeEventType = 'Death' | 'Injury' | 'Malfunction' | 'Other';

export interface MaudeEvent {
  reportNumber: string;
  eventType: MaudeEventType;
  /** Parsed from openFDA YYYYMMDD; null when absent/unparseable. */
  dateReceived: Date | null;
  productProblems: string[];
  manufacturer: string | null;
}

interface OpenFdaEventRecord {
  report_number?: string;
  event_type?: string;
  date_received?: string;
  product_problems?: string[];
  device?: { manufacturer_d_name?: string }[];
}

function parseOpenFdaDate(s?: string): Date | null {
  if (!s || !/^\d{8}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function normalizeEventType(raw?: string): MaudeEventType {
  switch ((raw ?? '').toLowerCase()) {
    case 'death':
      return 'Death';
    case 'injury':
      return 'Injury';
    case 'malfunction':
      return 'Malfunction';
    default:
      return 'Other';
  }
}

/** Normalize an openFDA device/event response into MAUDE event records. */
export function normalizeMaudeResponse(response: { results?: OpenFdaEventRecord[] }): MaudeEvent[] {
  const results = response?.results ?? [];
  return results.map(r => ({
    reportNumber: r.report_number ?? '',
    eventType: normalizeEventType(r.event_type),
    dateReceived: parseOpenFdaDate(r.date_received),
    productProblems: Array.isArray(r.product_problems) ? r.product_problems : [],
    manufacturer: r.device?.[0]?.manufacturer_d_name ?? null,
  }));
}

export interface SignalAggregationOptions {
  /** Length of the recent window (days). Default 90. */
  recentWindowDays?: number;
  /** Length of the baseline window immediately before it (days). Default 365. */
  baselineWindowDays?: number;
  /** Reference "now"; defaults to the latest event date or the wall clock. */
  now?: Date;
  /** Recent rate must exceed baseline rate by this factor to flag. Default 2. */
  signalFactor?: number;
  /** Minimum recent count required to flag a signal. Default 3. */
  minRecentCount?: number;
}

export interface SignalAggregationResult {
  total: number;
  byEventType: Record<MaudeEventType, number>;
  /** Device/product problems by descending frequency. */
  topProblems: { problem: string; count: number }[];
  recentCount: number;
  baselineCount: number;
  recentRatePerDay: number;
  baselineRatePerDay: number;
  /** True when the recent rate spikes above baseline (per the options). */
  signalDetected: boolean;
  /** Count of death/injury events — the serious-harm subset. */
  seriousCount: number;
}

/** Aggregate MAUDE events into counts, top problems, and a spike signal. */
export function aggregateSignals(
  events: MaudeEvent[],
  options: SignalAggregationOptions = {}
): SignalAggregationResult {
  const recentDays = options.recentWindowDays ?? 90;
  const baselineDays = options.baselineWindowDays ?? 365;
  const factor = options.signalFactor ?? 2;
  const minRecent = options.minRecentCount ?? 3;

  const byEventType: Record<MaudeEventType, number> = { Death: 0, Injury: 0, Malfunction: 0, Other: 0 };
  const problemCounts = new Map<string, number>();
  for (const e of events) {
    byEventType[e.eventType]++;
    for (const p of e.productProblems) problemCounts.set(p, (problemCounts.get(p) ?? 0) + 1);
  }
  const topProblems = [...problemCounts.entries()]
    .map(([problem, count]) => ({ problem, count }))
    .sort((a, b) => b.count - a.count || a.problem.localeCompare(b.problem));

  // Determine "now": the latest event date, else supplied/clock.
  const dated = events.map(e => e.dateReceived).filter((d): d is Date => d !== null);
  const now =
    options.now ?? (dated.length ? new Date(Math.max(...dated.map(d => d.getTime()))) : new Date());
  const dayMs = 86_400_000;
  const recentStart = now.getTime() - recentDays * dayMs;
  const baselineStart = recentStart - baselineDays * dayMs;

  let recentCount = 0;
  let baselineCount = 0;
  for (const d of dated) {
    const t = d.getTime();
    if (t > recentStart && t <= now.getTime()) recentCount++;
    else if (t > baselineStart && t <= recentStart) baselineCount++;
  }
  const recentRatePerDay = recentCount / recentDays;
  const baselineRatePerDay = baselineCount / baselineDays;
  const signalDetected =
    recentCount >= minRecent && recentRatePerDay >= factor * baselineRatePerDay;

  return {
    total: events.length,
    byEventType,
    topProblems,
    recentCount,
    baselineCount,
    recentRatePerDay,
    baselineRatePerDay,
    signalDetected,
    seriousCount: byEventType.Death + byEventType.Injury,
  };
}

// ── Device recalls ───────────────────────────────────────────────────────────

export type RecallClass = 'Class I' | 'Class II' | 'Class III' | 'Unclassified';

export interface DeviceRecall {
  recallNumber: string;
  classification: RecallClass;
  reason: string;
  status: string | null;
  recallingFirm: string | null;
}

interface OpenFdaRecallRecord {
  recall_number?: string;
  classification?: string;
  reason_for_recall?: string;
  status?: string;
  recalling_firm?: string;
}

function normalizeRecallClass(raw?: string): RecallClass {
  switch ((raw ?? '').trim()) {
    case 'Class I':
      return 'Class I';
    case 'Class II':
      return 'Class II';
    case 'Class III':
      return 'Class III';
    default:
      return 'Unclassified';
  }
}

/** Normalize an openFDA device/recall (enforcement) response. */
export function normalizeRecallResponse(response: {
  results?: OpenFdaRecallRecord[];
}): DeviceRecall[] {
  return (response?.results ?? []).map(r => ({
    recallNumber: r.recall_number ?? '',
    classification: normalizeRecallClass(r.classification),
    reason: r.reason_for_recall ?? '',
    status: r.status ?? null,
    recallingFirm: r.recalling_firm ?? null,
  }));
}

export interface RecallSummary {
  total: number;
  byClassification: Record<RecallClass, number>;
  /** Count of Class I recalls — the most serious. */
  classICount: number;
}

/** Summarize recalls by classification. */
export function summarizeRecalls(recalls: DeviceRecall[]): RecallSummary {
  const byClassification: Record<RecallClass, number> = {
    'Class I': 0,
    'Class II': 0,
    'Class III': 0,
    Unclassified: 0,
  };
  for (const r of recalls) byClassification[r.classification]++;
  return { total: recalls.length, byClassification, classICount: byClassification['Class I'] };
}

// ── openFDA fetch seam ───────────────────────────────────────────────────────

export type Fetcher = (url: string) => Promise<{ json: () => Promise<unknown> }>;

const OPENFDA_BASE = 'https://api.fda.gov/device';

/** Build an openFDA query URL with a search expression and limit. */
function buildUrl(endpoint: string, search: string, limit: number): string {
  return `${OPENFDA_BASE}/${endpoint}.json?search=${encodeURIComponent(search)}&limit=${limit}`;
}

/**
 * Fetch + normalize MAUDE adverse events for a device search expression. The
 * `fetcher` defaults to global fetch; inject one for tests.
 */
export async function fetchMaudeEvents(
  search: string,
  opts: { limit?: number; fetcher?: Fetcher } = {}
): Promise<MaudeEvent[]> {
  const fetcher = opts.fetcher ?? ((url: string) => fetch(url));
  const res = await fetcher(buildUrl('event', search, opts.limit ?? 100));
  const json = (await res.json()) as { results?: OpenFdaEventRecord[] };
  return normalizeMaudeResponse(json);
}

/** Fetch + normalize device recalls for a device search expression. */
export async function fetchDeviceRecalls(
  search: string,
  opts: { limit?: number; fetcher?: Fetcher } = {}
): Promise<DeviceRecall[]> {
  const fetcher = opts.fetcher ?? ((url: string) => fetch(url));
  const res = await fetcher(buildUrl('recall', search, opts.limit ?? 100));
  const json = (await res.json()) as { results?: OpenFdaRecallRecord[] };
  return normalizeRecallResponse(json);
}
