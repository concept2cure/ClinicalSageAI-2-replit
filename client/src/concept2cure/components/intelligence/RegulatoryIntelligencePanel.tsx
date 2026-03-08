/**
 * RegulatoryIntelligencePanel — Unified intelligence panel for document workspace.
 *
 * 4 tabs wired to live APIs:
 *   Insights    → Lumen Cortex regulatory-analysis + CSR search
 *   Precedents  → Precedent Engine search + compare
 *   Risk        → Foresight AI risk-analysis/clinical + Foresight score
 *   Strategy    → Precedent Engine strategy + recommendations
 *
 * Designed to sit beside the document editor as a side panel.
 */

import React, { useState, useCallback } from 'react';
import {
  Brain,
  Search,
  ShieldAlert,
  Target,
  Loader2,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  FileText,
  TrendingUp,
  BarChart3,
  Lightbulb,
  BookOpen,
  ArrowRight,
  X,
} from 'lucide-react';
import {
  useRegulatoryAnalysis,
  useCSRSearch,
  useForesightPrediction,
  useClinicalRiskAnalysis,
  type RegulatoryAnalysisResult,
  type CSRSearchResult,
  type ForesightPrediction,
  type ClinicalRiskResult,
} from '../../hooks/useWorkspaceIntelligence';
import {
  usePrecedentSearch,
  usePrecedentCompare,
  usePrecedentStrategy,
  type PrecedentRecord,
  type CompareResult,
  type StrategyResult,
} from '../../hooks/usePrecedentEngine';

// ── Props ────────────────────────────────────────────────────────────────────
export interface RegulatoryIntelligencePanelProps {
  submissionType?: string;
  indication?: string;
  deviceName?: string;
  deviceClass?: string;
  therapeuticArea?: string;
  phase?: string;
  /** Current document content (for context-aware analysis) */
  documentContent?: string;
  onClose?: () => void;
}

type Tab = 'insights' | 'precedents' | 'risk' | 'strategy';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'insights', label: 'Insights', icon: Brain },
  { id: 'precedents', label: 'Precedents', icon: Search },
  { id: 'risk', label: 'Risk', icon: ShieldAlert },
  { id: 'strategy', label: 'Strategy', icon: Target },
];

// ── Helper: Score Bar ────────────────────────────────────────────────────────
function ScoreBar({ value, label, color }: { value: number; label: string; color: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-zinc-600">{label}</span>
        <span className="font-semibold text-zinc-800">{pct}%</span>
      </div>
      <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Helper: Risk Badge ───────────────────────────────────────────────────────
function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    low: 'bg-emerald-100 text-emerald-700',
    medium: 'bg-amber-100 text-amber-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${colors[level?.toLowerCase()] || 'bg-zinc-100 text-zinc-600'}`}
    >
      {level}
    </span>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export function RegulatoryIntelligencePanel({
  submissionType,
  indication,
  deviceName,
  deviceClass,
  therapeuticArea,
  phase,
  documentContent,
  onClose,
}: RegulatoryIntelligencePanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('insights');

  // ── Insights state ─────────────────────────────────────────────────────
  const [analysisResult, setAnalysisResult] = useState<RegulatoryAnalysisResult | null>(null);
  const regulatoryAnalysis = useRegulatoryAnalysis();
  const csrSearch = useCSRSearch(indication ? { query_text: indication, limit: 5 } : null);

  // ── Precedents state ──────────────────────────────────────────────────
  const precedentSearch = usePrecedentSearch(
    submissionType
      ? {
          submissionType,
          indication: indication || undefined,
          deviceClass: deviceClass || undefined,
          therapeuticArea: therapeuticArea || undefined,
        }
      : null
  );
  const precedentCompare = usePrecedentCompare();
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [selectedPrecedent, setSelectedPrecedent] = useState<PrecedentRecord | null>(null);

  // ── Risk state ─────────────────────────────────────────────────────────
  const [predictionResult, setPredictionResult] = useState<ForesightPrediction | null>(null);
  const [riskResult, setRiskResult] = useState<ClinicalRiskResult | null>(null);
  const foresightPrediction = useForesightPrediction();
  const clinicalRisk = useClinicalRiskAnalysis();

  // ── Strategy state ─────────────────────────────────────────────────────
  const precedentStrategy = usePrecedentStrategy(
    submissionType
      ? {
          submissionType,
          indication: indication || '',
          therapeuticArea: therapeuticArea || '',
          deviceName: deviceName || '',
          deviceClass: deviceClass || '',
        }
      : null
  );

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleRunAnalysis = useCallback(() => {
    const query = `${submissionType || '510(k)'} submission analysis for ${indication || deviceName || 'medical device'}: regulatory requirements, precedent evidence, and risk factors`;
    regulatoryAnalysis.mutate(query, {
      onSuccess: data => setAnalysisResult(data),
    });
  }, [submissionType, indication, deviceName, regulatoryAnalysis]);

  const handleComparePrecedent = useCallback(
    (precedent: PrecedentRecord) => {
      setSelectedPrecedent(precedent);
      precedentCompare.mutate(
        {
          precedentId: precedent.id,
          submissionType: submissionType || '510(k)',
          deviceName: deviceName || '',
          indication: indication || '',
        },
        { onSuccess: data => setCompareResult(data) }
      );
    },
    [submissionType, deviceName, indication, precedentCompare]
  );

  const handleRunPrediction = useCallback(() => {
    foresightPrediction.mutate(
      {
        phase: phase || 'III',
        indication: indication || 'general',
        sampleSize: 100,
      },
      { onSuccess: data => setPredictionResult(data) }
    );
  }, [phase, indication, foresightPrediction]);

  const handleRunRiskAnalysis = useCallback(() => {
    clinicalRisk.mutate(
      {
        phase: phase || 'III',
        indication: indication || 'general',
        targetPopulation: indication,
      },
      { onSuccess: data => setRiskResult(data) }
    );
  }, [phase, indication, clinicalRisk]);

  return (
    <div className="flex flex-col h-full bg-white border-l border-zinc-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 bg-gradient-to-r from-indigo-50/80 to-violet-50/80 shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-indigo-600" />
          <span className="text-sm font-semibold text-zinc-800">Regulatory Intelligence</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-200/50 text-zinc-400">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-100 shrink-0">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-700 bg-indigo-50/50'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── INSIGHTS TAB ──────────────────────────────────────────────── */}
        {activeTab === 'insights' && (
          <div className="p-3 space-y-3">
            {/* Run Analysis button */}
            <button
              onClick={handleRunAnalysis}
              disabled={regulatoryAnalysis.isPending}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {regulatoryAnalysis.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Brain className="w-3.5 h-3.5" />
              )}
              Analyze Regulatory Landscape
            </button>

            {/* Lumen Analysis Results */}
            {analysisResult && (
              <div className="space-y-2">
                <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-lg">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Brain className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="text-[11px] font-semibold text-indigo-800">
                      {analysisResult.regulatory_framework || 'Regulatory Analysis'}
                    </span>
                  </div>
                  <ScoreBar
                    value={analysisResult.overall_confidence_score || 0}
                    label="Confidence"
                    color="bg-indigo-500"
                  />
                  {analysisResult.regulatory_impact_summary && (
                    <p className="text-[11px] text-zinc-700 leading-relaxed mt-2">
                      {analysisResult.regulatory_impact_summary}
                    </p>
                  )}
                </div>

                {/* Recommendations */}
                {analysisResult.lumen_ai_recommendations?.length > 0 && (
                  <div className="p-2.5 bg-violet-50 border border-violet-100 rounded-lg">
                    <span className="text-[10px] font-semibold text-violet-700 uppercase tracking-wider">
                      Recommendations
                    </span>
                    <ul className="mt-1.5 space-y-1">
                      {analysisResult.lumen_ai_recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11px] text-zinc-700">
                          <Lightbulb className="w-3 h-3 flex-shrink-0 mt-0.5 text-violet-500" />
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* CSR Learnings */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <BookOpen className="w-3.5 h-3.5 text-teal-600" />
                <span className="text-[11px] font-semibold text-zinc-700">CSR Learnings</span>
                {csrSearch.isLoading && <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />}
              </div>
              {csrSearch.data && csrSearch.data.length > 0 ? (
                <div className="space-y-1.5">
                  {csrSearch.data.map((csr, i) => (
                    <div
                      key={csr.id || i}
                      className="p-2 bg-teal-50/60 border border-teal-100 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-medium text-zinc-800 truncate">
                          {csr.title}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded-full">
                          {csr.phase}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-600 line-clamp-2">{csr.summary}</p>
                      <div className="flex items-center gap-2 mt-1 text-[9px] text-zinc-400">
                        <span>{csr.indication}</span>
                        <span>&middot;</span>
                        <span>n={csr.sample_size}</span>
                        <span>&middot;</span>
                        <span className="capitalize">{csr.outcome}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : !csrSearch.isLoading ? (
                <p className="text-[11px] text-zinc-400 italic">
                  {indication
                    ? 'No CSR data found for this indication.'
                    : 'Set indication to load CSR insights.'}
                </p>
              ) : null}
            </div>
          </div>
        )}

        {/* ── PRECEDENTS TAB ────────────────────────────────────────────── */}
        {activeTab === 'precedents' && (
          <div className="p-3 space-y-3">
            {precedentSearch.isLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
              </div>
            )}

            {/* Precedent cards */}
            {precedentSearch.data && precedentSearch.data.length > 0 && (
              <div className="space-y-2">
                {precedentSearch.data.map((p, i) => (
                  <div
                    key={p.id || i}
                    className={`p-2.5 border rounded-lg cursor-pointer transition-colors ${
                      selectedPrecedent?.id === p.id
                        ? 'border-indigo-300 bg-indigo-50/50'
                        : 'border-zinc-200 hover:border-zinc-300 bg-white'
                    }`}
                    onClick={() => handleComparePrecedent(p)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium text-zinc-800">
                        {p.deviceName || p.applicantName || 'Unknown Device'}
                      </span>
                      <span className="text-[10px] font-mono text-indigo-600">
                        {p.clearanceNumber}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span
                        className={`px-1.5 py-0.5 rounded-full font-medium ${
                          p.decisionOutcome === 'CLEARED' || p.decisionOutcome === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {p.decisionOutcome}
                      </span>
                      <span className="text-zinc-400">{p.submissionType}</span>
                      {p.similarity != null && (
                        <span className="text-zinc-500 ml-auto">
                          {Math.round(p.similarity * 100)}% similar
                        </span>
                      )}
                    </div>
                    {p.indication && (
                      <p className="text-[10px] text-zinc-500 mt-1 truncate">{p.indication}</p>
                    )}
                    <div className="flex items-center gap-1 mt-1.5 text-[10px] text-indigo-600">
                      <ArrowRight className="w-3 h-3" />
                      Compare to my submission
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {precedentSearch.data?.length === 0 && !precedentSearch.isLoading && (
              <p className="text-[11px] text-zinc-400 italic text-center py-4">
                No precedents found. Set submission type and indication.
              </p>
            )}

            {/* Compare result */}
            {precedentCompare.isPending && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                <span className="text-[11px] text-zinc-500 ml-2">Comparing...</span>
              </div>
            )}
            {compareResult && (
              <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-lg space-y-2">
                <span className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wider">
                  Comparison Results
                </span>
                {compareResult.overallScore != null && (
                  <ScoreBar
                    value={compareResult.overallScore}
                    label="Overall Similarity"
                    color="bg-indigo-500"
                  />
                )}
                {compareResult.riskLevel && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-zinc-600">Risk Level:</span>
                    <RiskBadge level={compareResult.riskLevel} />
                  </div>
                )}
                {compareResult.similarities?.length > 0 && (
                  <div>
                    <span className="text-[10px] font-medium text-emerald-700">Similarities</span>
                    <ul className="mt-1 space-y-0.5">
                      {compareResult.similarities.map((s, i) => (
                        <li key={i} className="flex items-start gap-1 text-[10px] text-zinc-600">
                          <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5 text-emerald-500" />
                          {typeof s === 'string' ? s : s.description || s.area}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {compareResult.differences?.length > 0 && (
                  <div>
                    <span className="text-[10px] font-medium text-amber-700">Differences</span>
                    <ul className="mt-1 space-y-0.5">
                      {compareResult.differences.map((d, i) => (
                        <li key={i} className="flex items-start gap-1 text-[10px] text-zinc-600">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-500" />
                          {typeof d === 'string' ? d : d.description || d.area}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {compareResult.recommendations?.length > 0 && (
                  <div>
                    <span className="text-[10px] font-medium text-violet-700">Recommendations</span>
                    <ul className="mt-1 space-y-0.5">
                      {compareResult.recommendations.map((r, i) => (
                        <li key={i} className="flex items-start gap-1 text-[10px] text-zinc-600">
                          <Lightbulb className="w-3 h-3 flex-shrink-0 mt-0.5 text-violet-500" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── RISK TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'risk' && (
          <div className="p-3 space-y-3">
            {/* Prediction button */}
            <button
              onClick={handleRunPrediction}
              disabled={foresightPrediction.isPending}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              {foresightPrediction.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <TrendingUp className="w-3.5 h-3.5" />
              )}
              Predict Trial Success
            </button>

            {/* Risk analysis button */}
            <button
              onClick={handleRunRiskAnalysis}
              disabled={clinicalRisk.isPending}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-orange-600 text-white text-xs font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50"
            >
              {clinicalRisk.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ShieldAlert className="w-3.5 h-3.5" />
              )}
              Clinical Risk Analysis
            </button>

            {/* Prediction results */}
            {predictionResult && (
              <div className="p-2.5 bg-amber-50 border border-amber-100 rounded-lg space-y-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-[10px] font-semibold text-amber-800 uppercase tracking-wider">
                    Foresight Prediction
                  </span>
                </div>
                <ScoreBar
                  value={(predictionResult.successScore || 0) / 100}
                  label="Trial Success Probability"
                  color="bg-amber-500"
                />
                {predictionResult.confidenceInterval && (
                  <p className="text-[10px] text-zinc-500">
                    Confidence interval: {predictionResult.confidenceInterval.low}% –{' '}
                    {predictionResult.confidenceInterval.high}%
                  </p>
                )}

                {/* Risk factors */}
                {predictionResult.riskFactors?.length > 0 && (
                  <div>
                    <span className="text-[10px] font-medium text-red-700">
                      Primary Risk Factors
                    </span>
                    <ul className="mt-1 space-y-0.5">
                      {predictionResult.riskFactors.map((rf, i) => (
                        <li key={i} className="flex items-start gap-1 text-[10px] text-zinc-600">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5 text-red-400" />
                          <span>
                            <strong>{rf.factor}</strong>
                            {rf.impact && ` — ${rf.impact}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Similar trials */}
                {predictionResult.similarTrials?.length > 0 && (
                  <div>
                    <span className="text-[10px] font-medium text-zinc-600">Similar Trials</span>
                    <div className="mt-1 space-y-1">
                      {predictionResult.similarTrials.slice(0, 3).map((t, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-[10px] px-2 py-1 bg-white rounded border border-zinc-100"
                        >
                          <span className="text-zinc-700 truncate">{t.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-400">{Math.round(t.similarity * 100)}%</span>
                            <span
                              className={`px-1 py-0.5 rounded-full text-[9px] font-medium ${
                                t.outcome === 'success'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {t.outcome}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Clinical risk results */}
            {riskResult && (
              <div className="p-2.5 bg-orange-50 border border-orange-100 rounded-lg space-y-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-orange-600" />
                  <span className="text-[10px] font-semibold text-orange-800 uppercase tracking-wider">
                    Clinical Risk Assessment
                  </span>
                </div>

                {riskResult.mitigationPlan && (
                  <>
                    <ScoreBar
                      value={(riskResult.mitigationPlan.overallRiskScore || 0) / 100}
                      label="Overall Risk Score"
                      color="bg-orange-500"
                    />

                    {riskResult.mitigationPlan.goNoGoRecommendation && (
                      <div className="p-2 bg-white rounded border border-orange-200">
                        <span className="text-[10px] font-semibold text-orange-700">Go/No-Go:</span>
                        <p className="text-[11px] text-zinc-700 mt-0.5">
                          {riskResult.mitigationPlan.goNoGoRecommendation}
                        </p>
                      </div>
                    )}

                    {riskResult.mitigationPlan.highRisks?.length > 0 && (
                      <div>
                        <span className="text-[10px] font-medium text-red-700">
                          High Risks ({riskResult.mitigationPlan.highRisks.length})
                        </span>
                        <ul className="mt-1 space-y-1">
                          {riskResult.mitigationPlan.highRisks.map((r, i) => (
                            <li key={i} className="text-[10px] text-zinc-600 pl-3 relative">
                              <span className="absolute left-0 text-red-400">●</span>
                              <strong>{r.risk}</strong>
                              {r.mitigation && (
                                <span className="text-zinc-500"> → {r.mitigation}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STRATEGY TAB ──────────────────────────────────────────────── */}
        {activeTab === 'strategy' && (
          <div className="p-3 space-y-3">
            {precedentStrategy.isLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
              </div>
            )}

            {precedentStrategy.data && (
              <div className="space-y-2">
                {/* Recommended strategy */}
                <div className="p-2.5 bg-violet-50 border border-violet-100 rounded-lg">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Target className="w-3.5 h-3.5 text-violet-600" />
                    <span className="text-[11px] font-semibold text-violet-800">
                      Recommended Strategy
                    </span>
                  </div>
                  {precedentStrategy.data.recommendedStrategy && (
                    <div className="p-2 bg-white rounded border border-violet-200 mb-2">
                      <span className="text-xs font-medium text-zinc-800">
                        {precedentStrategy.data.recommendedStrategy.pathway ||
                          precedentStrategy.data.recommendedStrategy.name ||
                          'Recommended Pathway'}
                      </span>
                      {precedentStrategy.data.recommendedStrategy.confidence != null && (
                        <div className="mt-1.5">
                          <ScoreBar
                            value={precedentStrategy.data.recommendedStrategy.confidence}
                            label="Confidence"
                            color="bg-violet-500"
                          />
                        </div>
                      )}
                      {precedentStrategy.data.recommendedStrategy.rationale && (
                        <p className="text-[10px] text-zinc-600 mt-1">
                          {precedentStrategy.data.recommendedStrategy.rationale}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Testing requirements */}
                {precedentStrategy.data.testingRequirements?.length > 0 && (
                  <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-lg">
                    <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">
                      Required Testing
                    </span>
                    <ul className="mt-1.5 space-y-0.5">
                      {precedentStrategy.data.testingRequirements.map((t, i) => (
                        <li key={i} className="flex items-start gap-1 text-[10px] text-zinc-600">
                          <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5 text-blue-500" />
                          {typeof t === 'string' ? t : t.requirement || t.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Supporting precedents */}
                {precedentStrategy.data.supportingPrecedents?.length > 0 && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-lg">
                    <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">
                      Supporting Precedents ({precedentStrategy.data.supportingPrecedents.length})
                    </span>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {precedentStrategy.data.supportingPrecedents.map((p, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center px-1.5 py-0.5 bg-white border border-emerald-200 rounded text-[9px] text-emerald-700"
                        >
                          {typeof p === 'string'
                            ? p
                            : p.clearanceNumber || p.deviceName || `Precedent ${i + 1}`}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key risks */}
                {precedentStrategy.data.keyRisks?.length > 0 && (
                  <div className="p-2.5 bg-red-50 border border-red-100 rounded-lg">
                    <span className="text-[10px] font-semibold text-red-700 uppercase tracking-wider">
                      Key Risks
                    </span>
                    <ul className="mt-1.5 space-y-0.5">
                      {precedentStrategy.data.keyRisks.map((r, i) => (
                        <li key={i} className="flex items-start gap-1 text-[10px] text-zinc-600">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5 text-red-400" />
                          {typeof r === 'string' ? r : r.description || r.risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Alternative strategies */}
                {precedentStrategy.data.alternativeStrategies?.length > 0 && (
                  <div>
                    <span className="text-[10px] font-medium text-zinc-600">
                      Alternative Strategies
                    </span>
                    <div className="mt-1 space-y-1">
                      {precedentStrategy.data.alternativeStrategies.map((alt, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between px-2 py-1.5 bg-zinc-50 rounded border border-zinc-100 text-[10px]"
                        >
                          <span className="text-zinc-700">
                            {typeof alt === 'string' ? alt : alt.pathway || alt.name}
                          </span>
                          {typeof alt !== 'string' && alt.confidence != null && (
                            <span className="text-zinc-500">
                              {Math.round(alt.confidence * 100)}%
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!precedentStrategy.data && !precedentStrategy.isLoading && (
              <p className="text-[11px] text-zinc-400 italic text-center py-4">
                Set submission type and indication to generate strategy recommendations.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default RegulatoryIntelligencePanel;
