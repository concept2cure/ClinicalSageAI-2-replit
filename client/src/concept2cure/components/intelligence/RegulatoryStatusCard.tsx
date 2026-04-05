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

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheck,
  TrendingUp,
  FileSearch,
  Target,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { DataStateWrapper, InlineLoading } from '@/components/ui/statesV2';

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
  const { data, isLoading, error } = useQuery<StatusData | null>({
    queryKey: ['concept2cure', 'regulatory-status', submissionType, indication, phase],
    queryFn: async () => {
      const [precRes, foresightRes] = await Promise.allSettled([
        apiRequest('POST', '/api/precedent-engine/search', {
          submissionType,
          indication: indication || undefined,
          limit: 20,
        }).then(r => r.json()),
        apiRequest('POST', '/api/foresight/score', {
          studyId: `dash_${Date.now()}`,
          phase: phase || 'III',
          indication: indication || 'general',
          biomarkers: [],
          endpoints: [],
          sampleSize: 100,
        }).then(r => r.json()),
      ]);

      const precedentsFound =
        precRes.status === 'fulfilled' && precRes.value
          ? (precRes.value.count ?? precRes.value.data?.length ?? 0)
          : 0;

      const prediction =
        foresightRes.status === 'fulfilled' && foresightRes.value
          ? (foresightRes.value.prediction ?? foresightRes.value.data ?? null)
          : null;

      const successScore = prediction?.successScore ?? 0;
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

      return {
        precedentsFound,
        riskScore: prediction?.riskFactors?.length
          ? Math.min(100, prediction.riskFactors.length * 15)
          : 35,
        approvalProbability: successScore,
        submissionReadiness: readiness,
      };
    },
    enabled: !!submissionType,
    staleTime: 60_000,
  });

  if (!submissionType) return null;

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-stone-200 bg-stone-50">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-xs sm:text-sm font-semibold text-stone-900 truncate">
            Regulatory Status
          </span>
        </div>
        {onOpenIntelligence && (
          <button
            onClick={onOpenIntelligence}
            className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-stone-700 font-medium"
          >
            Details
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <DataStateWrapper<StatusData | null>
        isLoading={isLoading}
        error={error}
        data={data ?? null}
        loadingComponent={<InlineLoading label="Loading regulatory status" testId="reg-status-loading" />}
        emptyTitle="No Data Available"
        emptyDescription="Configure submission type to see status."
        isEmpty={(d) => !d}
        testId="regulatory-status"
      >
        {(statusData) => statusData ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-0 divide-x divide-y divide-stone-100">
            {/* Submission Readiness */}
            <div className="p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Target className="w-3.5 h-3.5 text-stone-1000" />
                <span className="text-xs text-stone-500 font-medium">Readiness</span>
              </div>
              <div className="text-base font-semibold text-stone-900">{statusData.submissionReadiness}%</div>
              <div className="h-1.5 bg-stone-100 rounded-full mt-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-stone-1000 transition-all duration-150"
                  style={{ width: `${statusData.submissionReadiness}%` }}
                />
              </div>
            </div>

            {/* Precedents Found */}
            <div className="p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileSearch className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs text-stone-500 font-medium">Precedents</span>
              </div>
              <div className="text-base font-semibold text-stone-900">{statusData.precedentsFound}</div>
              <span className="text-xs text-stone-400">matching records</span>
            </div>

            {/* Risk Score */}
            <div className="p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs text-stone-500 font-medium">Risk Score</span>
              </div>
              <div className="text-base font-semibold text-stone-900">{statusData.riskScore}</div>
              <span
                className={`text-xs font-medium ${
                  statusData.riskScore < 30
                    ? 'text-emerald-600'
                    : statusData.riskScore < 60
                      ? 'text-amber-600'
                      : 'text-red-600'
                }`}
              >
                {statusData.riskScore < 30 ? 'Low' : statusData.riskScore < 60 ? 'Moderate' : 'High'}
              </span>
            </div>

            {/* Approval Probability */}
            <div className="p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs text-stone-500 font-medium">Approval Prob.</span>
              </div>
              <div className="text-base font-semibold text-stone-900">{statusData.approvalProbability}%</div>
              <div className="h-1.5 bg-stone-100 rounded-full mt-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-150"
                  style={{ width: `${statusData.approvalProbability}%` }}
                />
              </div>
            </div>
          </div>
        ) : null}
      </DataStateWrapper>
    </div>
  );
}

export default RegulatoryStatusCard;
