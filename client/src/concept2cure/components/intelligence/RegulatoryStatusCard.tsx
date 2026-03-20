/**
 * RegulatoryStatusCard — Dashboard widget showing submission readiness at a glance.
 *
 * Displays:
 * - Precedents found count
 * - Risk score
 * - Approval probability
 * - Submission readiness
 *
 * Wired to live APIs: Precedent Engine search + Foresight score.
 */

import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  TrendingUp,
  FileSearch,
  Target,
  Loader2,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';

// ── Auth helper ──────────────────────────────────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

interface RegulatoryStatusCardProps {
  submissionType?: string;
  indication?: string;
  deviceName?: string;
  phase?: string;
  onOpenIntelligence?: () => void;
}

interface StatusData {
  precedentsFound: number;
  riskScore: number;
  approvalProbability: number;
  submissionReadiness: number;
}

export function RegulatoryStatusCard({
  submissionType,
  indication,
  deviceName: _deviceName,
  phase,
  onOpenIntelligence,
}: RegulatoryStatusCardProps) {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!submissionType) return;
    setLoading(true);

    let cancelled = false;

    // Fetch both precedent count and prediction in parallel
    Promise.allSettled([
      fetch('/api/precedent-engine/search', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          submissionType,
          indication: indication || undefined,
          limit: 20,
        }),
      }).then(r => (r.ok ? r.json() : null)),
      fetch('/api/foresight/score', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          studyId: `dash_${Date.now()}`,
          phase: phase || 'III',
          indication: indication || 'general',
          biomarkers: [],
          endpoints: [],
          sampleSize: 100,
        }),
      }).then(r => (r.ok ? r.json() : null)),
    ]).then(([precRes, foresightRes]) => {
      if (cancelled) return;
      const precedentsFound =
        precRes.status === 'fulfilled' && precRes.value
          ? (precRes.value.count ?? precRes.value.data?.length ?? 0)
          : 0;

      const prediction =
        foresightRes.status === 'fulfilled' && foresightRes.value
          ? (foresightRes.value.prediction ?? foresightRes.value.data ?? null)
          : null;

      const successScore = prediction?.successScore ?? 0;
      // Derive readiness from precedents + prediction
      const readiness = Math.min(
        100,
        Math.round(
          (precedentsFound > 0 ? 30 : 0) +
            (precedentsFound > 3 ? 15 : 0) +
            (successScore > 50 ? 25 : successScore > 30 ? 15 : 0) +
            (submissionType ? 15 : 0) +
            (indication ? 15 : 0)
        )
      );

      setData({
        precedentsFound,
        riskScore: prediction?.riskFactors?.length
          ? Math.min(100, prediction.riskFactors.length * 15)
          : 35,
        approvalProbability: successScore,
        submissionReadiness: readiness,
      });
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [submissionType, indication, phase]);

  if (!submissionType) return null;

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-zinc-200 bg-gradient-to-r from-indigo-50/60 to-violet-50/60">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="text-xs sm:text-sm font-semibold text-zinc-800 truncate">
            Regulatory Status
          </span>
        </div>
        {onOpenIntelligence && (
          <button
            onClick={onOpenIntelligence}
            className="flex items-center gap-0.5 text-[11px] text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Details
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-0 divide-x divide-y divide-zinc-100">
          {/* Submission Readiness */}
          <div className="p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Target className="w-3.5 h-3.5 text-violet-500" />
              <span className="text-[11px] text-zinc-500 font-medium">Readiness</span>
            </div>
            <div className="text-2xl font-bold text-zinc-800">{data.submissionReadiness}%</div>
            <div className="h-1.5 bg-zinc-100 rounded-full mt-1.5 overflow-hidden">
              <div
                className="h-full rounded-full bg-violet-500 transition-all"
                style={{ width: `${data.submissionReadiness}%` }}
              />
            </div>
          </div>

          {/* Precedents Found */}
          <div className="p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <FileSearch className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-[11px] text-zinc-500 font-medium">Precedents</span>
            </div>
            <div className="text-2xl font-bold text-zinc-800">{data.precedentsFound}</div>
            <span className="text-[11px] text-zinc-400">matching records</span>
          </div>

          {/* Risk Score */}
          <div className="p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[11px] text-zinc-500 font-medium">Risk Score</span>
            </div>
            <div className="text-2xl font-bold text-zinc-800">{data.riskScore}</div>
            <span
              className={`text-[11px] font-medium ${
                data.riskScore < 30
                  ? 'text-emerald-600'
                  : data.riskScore < 60
                    ? 'text-amber-600'
                    : 'text-red-600'
              }`}
            >
              {data.riskScore < 30 ? 'Low' : data.riskScore < 60 ? 'Moderate' : 'High'}
            </span>
          </div>

          {/* Approval Probability */}
          <div className="p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[11px] text-zinc-500 font-medium">Approval Prob.</span>
            </div>
            <div className="text-2xl font-bold text-zinc-800">{data.approvalProbability}%</div>
            <div className="h-1.5 bg-zinc-100 rounded-full mt-1.5 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${data.approvalProbability}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 text-center text-[11px] text-zinc-400">
          No data available. Configure submission type to see status.
        </div>
      )}
    </div>
  );
}

export default RegulatoryStatusCard;
