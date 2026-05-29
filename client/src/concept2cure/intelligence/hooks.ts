/**
 * Intelligence cluster — data hooks (Phase 11).
 *
 * Each surface hook fetches its `/api/intelligence/*` bundle and falls back
 * to the ported fixture shape on load / error — the MDX `live ?? fixture`
 * pattern. The endpoints are read-only (no mutations in Phase 11; mutation
 * lives in Authoring). Until the backend ships these routes the hooks return
 * the fixtures, so the surfaces render fully today and light up when the
 * endpoints land.
 *
 * Endpoint contract (PHASE_11_INSTALL.md §3):
 *   protocol  → GET /api/intelligence/protocol
 *   cmc       → GET /api/intelligence/cmc
 *   biostat   → GET /api/intelligence/biostat
 *   reports   → GET /api/intelligence/reports
 *
 * @module client/src/concept2cure/intelligence/hooks
 */

import { useFetchJson } from '../mdx/hooks/useFetchJson';
import {
  PROTOCOLS, ENDPOINTS, AMENDMENTS,
  CMC_PACKAGES, STABILITY,
  SAPS, SAMPLE_SIZE, TLF_QUEUE, INTERIMS,
  REPORT_KPIS, REPORT_BARS, FORECAST, PRECEDENT_MODELS,
  type Protocol, type Endpoint, type Amendment,
  type CmcPackage, type StabilityProgram,
  type Sap, type SampleSize, type TlfBuild, type InterimAnalysis,
  type ReportKpis, type ReportBar, type ForecastRow, type PrecedentModel,
} from './data';

/** Server responses use the canonical `{ data }` envelope (server/lib/api-response.ok).
 *  The route omits any field it has no rows for, so the per-field `?? fixture`
 *  fallback below keeps those sections populated until their backend lands. */
type Envelope<T> = { data?: Partial<T> };

export interface ProtocolData {
  protocols: Protocol[];
  endpoints: Endpoint[];
  amendments: Amendment[];
}
export function useProtocols(): ProtocolData {
  const { data } = useFetchJson<Envelope<ProtocolData>>('/api/intelligence/protocol');
  const d = data?.data;
  return {
    protocols: d?.protocols ?? PROTOCOLS,
    endpoints: d?.endpoints ?? ENDPOINTS,
    amendments: d?.amendments ?? AMENDMENTS,
  };
}

export interface CmcData {
  packages: CmcPackage[];
  stability: StabilityProgram[];
}
export function useCmc(): CmcData {
  const { data } = useFetchJson<Envelope<CmcData>>('/api/intelligence/cmc');
  const d = data?.data;
  return {
    packages: d?.packages ?? CMC_PACKAGES,
    stability: d?.stability ?? STABILITY,
  };
}

export interface BiostatData {
  saps: Sap[];
  sampleSize: SampleSize;
  tlfQueue: TlfBuild[];
  interims: InterimAnalysis[];
}
export function useBiostat(): BiostatData {
  const { data } = useFetchJson<Envelope<BiostatData>>('/api/intelligence/biostat');
  const d = data?.data;
  return {
    saps: d?.saps ?? SAPS,
    sampleSize: d?.sampleSize ?? SAMPLE_SIZE,
    tlfQueue: d?.tlfQueue ?? TLF_QUEUE,
    interims: d?.interims ?? INTERIMS,
  };
}

export interface ReportsData {
  kpis: ReportKpis;
  bars: ReportBar[];
  forecast: ForecastRow[];
  models: PrecedentModel[];
}
export function useReports(): ReportsData {
  const { data } = useFetchJson<Envelope<ReportsData>>('/api/intelligence/reports');
  const d = data?.data;
  return {
    kpis: d?.kpis ?? REPORT_KPIS,
    bars: d?.bars ?? REPORT_BARS,
    forecast: d?.forecast ?? FORECAST,
    models: d?.models ?? PRECEDENT_MODELS,
  };
}
