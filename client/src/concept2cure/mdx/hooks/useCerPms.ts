/**
 * useCerPms — live adapter for the CerWorkbench PMS / PMCF tab.
 *
 * Calls GET /api/mdx/postmarket which returns vigilance events and
 * CAPAs scoped to the organization. Adapts signals → ComplaintRow and
 * metrics → PmsKpi. Falls back to CER_PMS_KPIS / CER_PMS_COMPLAINTS
 * seed fixtures when no real data exists.
 *
 * PMCF studies and PMS timeline have no backend store yet — those
 * always use CER_PMCF_STUDIES / CER_PMS_TIMELINE seed fixtures.
 */

import { CER_PMS_KPIS, CER_PMS_COMPLAINTS } from '../data/cer';
import type { PmsKpi, ComplaintRow, ComplaintSeverity, ComplaintStatus } from '../data/cer';
import { useFetchJson } from './useFetchJson';

interface PmsSignal {
  id: string;
  device: string;
  source: string;
  opened: string;
  severity: string;
  kind: string;
  count: number;
  summary: string;
  owner: string;
  state: string;
}

interface PmsMetric {
  label: string;
  metric: string;
  meta: string;
  tone?: string;
}

interface PostMarketPayload {
  data: {
    metrics: PmsMetric[];
    signals: PmsSignal[];
    capas: unknown[];
    pmsPlan: unknown[];
    trends: unknown[];
  };
}

function adaptSeverity(s: string): ComplaintSeverity {
  return s === 'critical' || s === 'serious' ? 'serious' : 'non-serious';
}

function adaptStatus(s: string): ComplaintStatus {
  if (s === 'closed' || s === 'resolved') return 'closed';
  if (s === 'investigate' || s === 'open') return 'open';
  return 'in-review';
}

function adaptSignal(s: PmsSignal): ComplaintRow {
  const received = s.opened
    ? new Date(s.opened).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';
  return {
    code: s.id,
    category: s.kind || s.summary.slice(0, 40) || '—',
    severity: adaptSeverity(s.severity),
    status: adaptStatus(s.state),
    owner: s.owner || '—',
    received,
    source: s.source || '—',
  };
}

function adaptMetrics(metrics: PmsMetric[]): PmsKpi[] {
  return metrics.map(m => ({
    label: m.label,
    value: m.metric,
    foot: m.meta,
    tone: m.tone === 'err' ? 'bad' as const
      : m.tone === 'warn' ? 'warn' as const
      : m.tone === 'ok'  ? 'good' as const
      : undefined,
  }));
}

export interface UseCerPmsResult {
  pmsKpis: PmsKpi[];
  complaints: ComplaintRow[];
  loading: boolean;
}

export function useCerPms(): UseCerPmsResult {
  const { data, loading } = useFetchJson<PostMarketPayload>('/api/mdx/postmarket');
  const payload = data?.data;
  return {
    pmsKpis: payload?.metrics && payload.metrics.length > 0
      ? adaptMetrics(payload.metrics)
      : CER_PMS_KPIS,
    complaints: payload?.signals && payload.signals.length > 0
      ? payload.signals.map(adaptSignal)
      : CER_PMS_COMPLAINTS,
    loading,
  };
}
