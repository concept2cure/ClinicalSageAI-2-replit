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

export interface ProtocolData {
  protocols: Protocol[];
  endpoints: Endpoint[];
  amendments: Amendment[];
}
export function useProtocols(): ProtocolData {
  const { data } = useFetchJson<Partial<ProtocolData>>('/api/intelligence/protocol');
  return {
    protocols: data?.protocols ?? PROTOCOLS,
    endpoints: data?.endpoints ?? ENDPOINTS,
    amendments: data?.amendments ?? AMENDMENTS,
  };
}

export interface CmcData {
  packages: CmcPackage[];
  stability: StabilityProgram[];
}
export function useCmc(): CmcData {
  const { data } = useFetchJson<Partial<CmcData>>('/api/intelligence/cmc');
  return {
    packages: data?.packages ?? CMC_PACKAGES,
    stability: data?.stability ?? STABILITY,
  };
}

export interface BiostatData {
  saps: Sap[];
  sampleSize: SampleSize;
  tlfQueue: TlfBuild[];
  interims: InterimAnalysis[];
}
export function useBiostat(): BiostatData {
  const { data } = useFetchJson<Partial<BiostatData>>('/api/intelligence/biostat');
  return {
    saps: data?.saps ?? SAPS,
    sampleSize: data?.sampleSize ?? SAMPLE_SIZE,
    tlfQueue: data?.tlfQueue ?? TLF_QUEUE,
    interims: data?.interims ?? INTERIMS,
  };
}

export interface ReportsData {
  kpis: ReportKpis;
  bars: ReportBar[];
  forecast: ForecastRow[];
  models: PrecedentModel[];
}
export function useReports(): ReportsData {
  const { data } = useFetchJson<Partial<ReportsData>>('/api/intelligence/reports');
  return {
    kpis: data?.kpis ?? REPORT_KPIS,
    bars: data?.bars ?? REPORT_BARS,
    forecast: data?.forecast ?? FORECAST,
    models: data?.models ?? PRECEDENT_MODELS,
  };
}
