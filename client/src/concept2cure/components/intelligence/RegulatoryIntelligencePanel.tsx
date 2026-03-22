/**
 * RegulatoryIntelligencePanel — Unified intelligence panel for document workspace.
 *
 * 5 tabs wired to live APIs:
 *   Insights    → AnA 1.0 RI regulatory-analysis + CSR search
 *   Precedents  → Precedent Engine search + compare
 *   Risk        → Foresight AI risk-analysis/clinical + Foresight score
 *   Strategy    → Precedent Engine strategy + recommendations
 *   Evidence    → CSR evidence search + evidence gap analysis
 *
 * Designed to sit beside the document editor as a side panel.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Brain,
  Search,
  ShieldAlert,
  Target,
  Loader2,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Lightbulb,
  BookOpen,
  ArrowRight,
  X,
  FileCheck,
} from 'lucide-react';
import {
  useRegulatoryAnalysis,
  useCSRSearch,
  useForesightPrediction,
  useClinicalRiskAnalysis,
  type RegulatoryAnalysisResult,
  type ForesightPrediction,
  type ClinicalRiskResult,
} from '../../hooks/useWorkspaceIntelligence';
import {
  usePrecedentSearch,
  usePrecedentCompare,
  usePrecedentStrategy,
  type PrecedentRecord,
  type CompareResult,
} from '../../hooks/usePrecedentEngine';
import { AlertFeed } from './AlertFeed';

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
  /** Callback to create a governed document from intelligence output */
  onCreateDocument?: (content: string, title: string, ctdSection?: string) => void;
}

type Tab = 'insights' | 'precedents' | 'risk' | 'strategy' | 'evidence' | 'alerts';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'insights', label: 'Insights', icon: Brain },
  { id: 'precedents', label: 'Precedents', icon: Search },
  { id: 'risk', label: 'Risk', icon: ShieldAlert },
  { id: 'strategy', label: 'Strategy', icon: Target },
  { id: 'evidence', label: 'Evidence', icon: FileCheck },
  { id: 'alerts', label: 'Alerts', icon: ShieldAlert },
];

// ── Helper: Score Bar ────────────────────────────────────────────────────────
function ScoreBar({ value, label, color }: { value: number; label: string; color: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-zinc-600">{label}</span>
        <span className="font-semibold text-zinc-900">{pct}%</span>
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
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${colors[level?.toLowerCase()] || 'bg-zinc-100 text-zinc-600'}`}
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
  documentContent: _documentContent,
  onClose,
  onCreateDocument,
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

  // ── Evidence state ─────────────────────────────────────────────────────
  const [evidenceQuery, setEvidenceQuery] = useState('');
  const evidenceSearch = useCSRSearch(
    evidenceQuery.length >= 3 ? { query_text: evidenceQuery, limit: 10 } : null
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

  // ── Auto-populate on mount when context is available ────────────────────
  const hasAutoRun = useRef(false);
  useEffect(() => {
    if (hasAutoRun.current) return;
    if (!submissionType && !indication && !deviceName) return;
    hasAutoRun.current = true;
    // Auto-run regulatory analysis (Insights tab)
    handleRunAnalysis();
    // Auto-run Foresight prediction (Risk tab)
    handleRunPrediction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionType, indication, deviceName]);

  return (
    <div className="flex flex-col h-full bg-white border-l border-zinc-200">
      {/* Header */}
      <div className="flex items-center justify-between px-2 sm:px-3 py-2 border-b border-zinc-200 bg-zinc-50 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <Brain className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-xs sm:text-sm font-semibold text-zinc-900 truncate">
            Regulatory Intelligence
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close regulatory intelligence" title="Close" className="p-1 rounded hover:bg-zinc-200/50 text-zinc-400 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 shrink-0">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1 px-1 sm:px-2 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-700 bg-blue-50/50'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
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
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {regulatoryAnalysis.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Brain className="w-3.5 h-3.5" />
              )}
              Analyze Regulatory Landscape
            </button>

            {/* RI Analysis Results */}
            {analysisResult && (
              <div className="space-y-2">
                <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-lg">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Brain className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-xs font-semibold text-blue-800">
                      {analysisResult.regulatory_framework || 'Regulatory Analysis'}
                    </span>
                  </div>
                  <ScoreBar
                    value={analysisResult.overall_confidence_score || 0}
                    label="Confidence"
                    color="bg-blue-500"
                  />
                  {analysisResult.regulatory_impact_summary && (
                    <p className="text-xs text-zinc-700 leading-relaxed mt-2">
                      {analysisResult.regulatory_impact_summary}
                    </p>
                  )}
                </div>

                {/* Recommendations */}
                {analysisResult.lumen_ai_recommendations?.length > 0 && (
                  <div className="p-2.5 bg-violet-50 border border-violet-100 rounded-lg">
                    <span className="text-xs font-semibold text-violet-700 uppercase tracking-wider">
                      Recommendations
                    </span>
                    <ul className="mt-1.5 space-y-1">
                      {analysisResult.lumen_ai_recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-700">
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
                <span className="text-xs font-semibold text-zinc-700">CSR Learnings</span>
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
                        <span className="text-xs font-medium text-zinc-900 truncate">
                          {csr.title}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded-full">
                          {csr.phase}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600 line-clamp-2">{csr.summary}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400">
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
                <p className="text-xs text-zinc-400 italic">
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
                        ? 'border-blue-300 bg-blue-50/50'
                        : 'border-zinc-200 hover:border-zinc-300 bg-white'
                    }`}
                    onClick={() => handleComparePrecedent(p)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-zinc-900">
                        {p.deviceName || p.applicantName || 'Unknown Device'}
                      </span>
                      <span className="text-xs font-mono text-blue-600">
                        {p.clearanceNumber}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
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
                      <p className="text-xs text-zinc-500 mt-1 truncate">{p.indication}</p>
                    )}
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-blue-600">
                      <ArrowRight className="w-3 h-3" />
                      Compare to my submission
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {precedentSearch.data?.length === 0 && !precedentSearch.isLoading && (
              <p className="text-xs text-zinc-400 italic text-center py-4">
                No precedents found. Set submission type and indication.
              </p>
            )}

            {/* Compare result */}
            {precedentCompare.isPending && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                <span className="text-xs text-zinc-500 ml-2">Comparing...</span>
              </div>
            )}
            {compareResult && (
              <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-lg space-y-2">
                <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                  Comparison Results
                </span>
                {compareResult.overallScore != null && (
                  <ScoreBar
                    value={compareResult.overallScore}
                    label="Overall Similarity"
                    color="bg-blue-500"
                  />
                )}
                {compareResult.riskLevel && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-600">Risk Level:</span>
                    <RiskBadge level={compareResult.riskLevel} />
                  </div>
                )}
                {compareResult.similarities?.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-emerald-700">Similarities</span>
                    <ul className="mt-1 space-y-0.5">
                      {compareResult.similarities.map((s, i) => (
                        <li key={i} className="flex items-start gap-1 text-xs text-zinc-600">
                          <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5 text-emerald-500" />
                          {typeof s === 'string' ? s : s.description || s.area}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {compareResult.differences?.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-amber-700">Differences</span>
                    <ul className="mt-1 space-y-0.5">
                      {compareResult.differences.map((d, i) => (
                        <li key={i} className="flex items-start gap-1 text-xs text-zinc-600">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-500" />
                          {typeof d === 'string' ? d : d.description || d.area}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {compareResult.recommendations?.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-violet-700">Recommendations</span>
                    <ul className="mt-1 space-y-0.5">
                      {compareResult.recommendations.map((r, i) => (
                        <li key={i} className="flex items-start gap-1 text-xs text-zinc-600">
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
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 disabled:opacity-60"
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
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-orange-600 text-white text-xs font-medium rounded-lg hover:bg-orange-700 disabled:opacity-60"
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
                  <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
                    AnA Predictions
                  </span>
                </div>
                <ScoreBar
                  value={(predictionResult.successScore || 0) / 100}
                  label="Trial Success Probability"
                  color="bg-amber-500"
                />
                {predictionResult.confidenceInterval && (
                  <p className="text-xs text-zinc-500">
                    Confidence interval: {predictionResult.confidenceInterval.low}% –{' '}
                    {predictionResult.confidenceInterval.high}%
                  </p>
                )}

                {/* Risk factors */}
                {predictionResult.riskFactors?.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-red-700">
                      Primary Risk Factors
                    </span>
                    <ul className="mt-1 space-y-0.5">
                      {predictionResult.riskFactors.map((rf, i) => (
                        <li key={i} className="flex items-start gap-1 text-xs text-zinc-600">
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
                    <span className="text-xs font-medium text-zinc-600">Similar Trials</span>
                    <div className="mt-1 space-y-1">
                      {predictionResult.similarTrials.slice(0, 3).map((t, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-xs px-2 py-1 bg-white rounded border border-zinc-200"
                        >
                          <span className="text-zinc-700 truncate">{t.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-400">{Math.round(t.similarity * 100)}%</span>
                            <span
                              className={`px-1 py-0.5 rounded-full text-xs font-medium ${
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
                  <span className="text-xs font-semibold text-orange-800 uppercase tracking-wider">
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
                        <span className="text-xs font-semibold text-orange-700">Go/No-Go:</span>
                        <p className="text-xs text-zinc-700 mt-0.5">
                          {riskResult.mitigationPlan.goNoGoRecommendation}
                        </p>
                      </div>
                    )}

                    {riskResult.mitigationPlan.highRisks?.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-red-700">
                          High Risks ({riskResult.mitigationPlan.highRisks.length})
                        </span>
                        <ul className="mt-1 space-y-1">
                          {riskResult.mitigationPlan.highRisks.map((r, i) => (
                            <li key={i} className="text-xs text-zinc-600 pl-3 relative">
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
                    <span className="text-xs font-semibold text-violet-800">
                      Recommended Strategy
                    </span>
                  </div>
                  {precedentStrategy.data.recommendedStrategy && (
                    <div className="p-2 bg-white rounded border border-blue-200 mb-2">
                      <span className="text-xs font-medium text-zinc-900">
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
                        <p className="text-xs text-zinc-600 mt-1">
                          {precedentStrategy.data.recommendedStrategy.rationale}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Testing requirements */}
                {precedentStrategy.data.testingRequirements?.length > 0 && (
                  <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-lg">
                    <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                      Required Testing
                    </span>
                    <ul className="mt-1.5 space-y-0.5">
                      {precedentStrategy.data.testingRequirements.map((t, i) => (
                        <li key={i} className="flex items-start gap-1 text-xs text-zinc-600">
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
                    <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                      Supporting Precedents ({precedentStrategy.data.supportingPrecedents.length})
                    </span>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {precedentStrategy.data.supportingPrecedents.map((p, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center px-1.5 py-0.5 bg-white border border-emerald-200 rounded text-xs text-emerald-700"
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
                    <span className="text-xs font-semibold text-red-700 uppercase tracking-wider">
                      Key Risks
                    </span>
                    <ul className="mt-1.5 space-y-0.5">
                      {precedentStrategy.data.keyRisks.map((r, i) => (
                        <li key={i} className="flex items-start gap-1 text-xs text-zinc-600">
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
                    <span className="text-xs font-medium text-zinc-600">
                      Alternative Strategies
                    </span>
                    <div className="mt-1 space-y-1">
                      {precedentStrategy.data.alternativeStrategies.map((alt, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between px-2 py-1.5 bg-zinc-50 rounded border border-zinc-200 text-xs"
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

            {/* Save as Strategy Memo */}
            {precedentStrategy.data && onCreateDocument && (
              <button
                onClick={() => {
                  const d = precedentStrategy.data;
                  const sections = [
                    `<h1>Regulatory Strategy Memo — ${submissionType || 'Submission'}</h1>`,
                    `<p><strong>Indication:</strong> ${indication || 'General'}</p>`,
                    d.recommendedStrategy
                      ? `<h2>Recommended Strategy</h2><p>${d.recommendedStrategy.pathway || d.recommendedStrategy.name || ''}</p><p>${d.recommendedStrategy.rationale || ''}</p>`
                      : '',
                    d.testingRequirements?.length
                      ? `<h2>Required Testing</h2><ul>${d.testingRequirements.map(t => `<li>${typeof t === 'string' ? t : t.requirement || t.name}</li>`).join('')}</ul>`
                      : '',
                    d.keyRisks?.length
                      ? `<h2>Key Risks</h2><ul>${d.keyRisks.map(r => `<li>${typeof r === 'string' ? r : r.description || r.risk}</li>`).join('')}</ul>`
                      : '',
                    d.supportingPrecedents?.length
                      ? `<h2>Supporting Precedents</h2><ul>${d.supportingPrecedents.map(p => `<li>${typeof p === 'string' ? p : p.clearanceNumber || p.deviceName || ''}</li>`).join('')}</ul>`
                      : '',
                  ]
                    .filter(Boolean)
                    .join('\n');
                  onCreateDocument(
                    sections,
                    `Strategy Memo — ${submissionType || 'Regulatory'}`,
                    '2.5'
                  );
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors duration-150"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                Save as Strategy Memo
              </button>
            )}

            {!precedentStrategy.data && !precedentStrategy.isLoading && (
              <p className="text-xs text-zinc-400 italic text-center py-4">
                Set submission type and indication to generate strategy recommendations.
              </p>
            )}
          </div>
        )}

        {/* ── EVIDENCE TAB ─────────────────────────────────────────── */}
        {activeTab === 'evidence' && (
          <div className="space-y-3">
            {/* Evidence Gap Analysis Summary */}
            {(() => {
              const required =
                submissionType === '510K'
                  ? [
                      'Biocompatibility',
                      'Performance Testing',
                      'Predicate Comparison',
                      'Software Validation',
                      'Sterilization',
                      'Shelf Life',
                    ]
                  : submissionType === 'IND'
                    ? [
                        'Preclinical Studies',
                        'CMC Data',
                        'Pharmacology',
                        'Toxicology',
                        'Clinical Protocol',
                        'Investigator Brochure',
                      ]
                    : submissionType === 'NDA' || submissionType === 'BLA'
                      ? [
                          'Phase I Data',
                          'Phase II Data',
                          'Phase III Data',
                          'Safety Database',
                          'Efficacy Analysis',
                          'CMC Documentation',
                        ]
                      : [
                          'Clinical Data',
                          'Safety Profile',
                          'Efficacy Endpoints',
                          'Manufacturing',
                          'Labeling',
                        ];
              const available = csrSearch.data?.length || 0;
              const coverageRatio = Math.min(1, available / Math.max(1, required.length));
              const coverageColor =
                coverageRatio >= 0.7
                  ? 'bg-emerald-500'
                  : coverageRatio >= 0.4
                    ? 'bg-amber-500'
                    : 'bg-red-500';
              const coverageLabel =
                coverageRatio >= 0.7 ? 'Good' : coverageRatio >= 0.4 ? 'Partial' : 'Gaps Found';
              return (
                <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-zinc-900 flex items-center gap-1">
                      <FileCheck className="w-3.5 h-3.5 text-blue-600" />
                      Evidence Coverage ({submissionType || 'General'})
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        coverageRatio >= 0.7
                          ? 'bg-emerald-100 text-emerald-700'
                          : coverageRatio >= 0.4
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {coverageLabel}
                    </span>
                  </div>
                  <div className="h-2 bg-zinc-200 rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${coverageColor}`}
                      style={{ width: `${Math.round(coverageRatio * 100)}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {required.map((req, i) => {
                      const matched = csrSearch.data?.some(
                        c =>
                          c.title?.toLowerCase().includes(req.toLowerCase().split(' ')[0]) ||
                          c.summary?.toLowerCase().includes(req.toLowerCase().split(' ')[0])
                      );
                      return (
                        <div key={i} className="flex items-center gap-1 text-xs">
                          {matched ? (
                            <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                          )}
                          <span
                            className={matched ? 'text-zinc-600' : 'text-amber-700 font-medium'}
                          >
                            {req}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            {/* Evidence search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                value={evidenceQuery}
                onChange={e => setEvidenceQuery(e.target.value)}
                placeholder="Search clinical evidence (CSRs, studies)..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none/30 bg-white"
              />
            </div>

            {/* CSR search results from auto-query (indication-based) */}
            {csrSearch.data && csrSearch.data.length > 0 && !evidenceQuery && (
              <div>
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  Relevant CSR Evidence ({csrSearch.data.length})
                </span>
                <div className="mt-1.5 space-y-1.5">
                  {csrSearch.data.map((csr, i) => (
                    <div
                      key={csr.id || i}
                      className="p-2.5 border border-zinc-200 rounded-lg bg-zinc-50/50 hover:bg-zinc-50 transition-colors duration-150"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-zinc-900 leading-tight">
                          {csr.title}
                        </span>
                        {csr.relevance_score != null && (
                          <span className="text-xs text-blue-600 font-medium shrink-0">
                            {Math.round(csr.relevance_score * 100)}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                        {csr.phase && <span>Phase {csr.phase}</span>}
                        {csr.indication && <span>· {csr.indication}</span>}
                        {csr.outcome && (
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                              csr.outcome.toLowerCase().includes('positive') ||
                              csr.outcome.toLowerCase().includes('success')
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {csr.outcome}
                          </span>
                        )}
                      </div>
                      {csr.sponsor && (
                        <div className="text-xs text-zinc-400 mt-1">{csr.sponsor}</div>
                      )}
                      {csr.summary && (
                        <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{csr.summary}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Manual search results */}
            {evidenceQuery.length >= 3 && (
              <div>
                {evidenceSearch.isLoading && (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-400 mr-2" />
                    <span className="text-xs text-zinc-400">Searching evidence...</span>
                  </div>
                )}
                {evidenceSearch.data && evidenceSearch.data.length > 0 && (
                  <>
                    <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                      Search Results ({evidenceSearch.data.length})
                    </span>
                    <div className="mt-1.5 space-y-1.5">
                      {evidenceSearch.data.map((csr, i) => (
                        <div
                          key={csr.id || i}
                          className="p-2.5 border border-zinc-200 rounded-lg bg-zinc-50/50 hover:bg-zinc-50 transition-colors duration-150"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-semibold text-zinc-900 leading-tight">
                              {csr.title}
                            </span>
                            {csr.relevance_score != null && (
                              <span className="text-xs text-blue-600 font-medium shrink-0">
                                {Math.round(csr.relevance_score * 100)}%
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                            {csr.phase && <span>Phase {csr.phase}</span>}
                            {csr.indication && <span>· {csr.indication}</span>}
                            {csr.outcome && (
                              <span
                                className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                  csr.outcome.toLowerCase().includes('positive') ||
                                  csr.outcome.toLowerCase().includes('success')
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {csr.outcome}
                              </span>
                            )}
                          </div>
                          {csr.sample_size && (
                            <div className="text-xs text-zinc-400 mt-1">
                              N={csr.sample_size} {csr.sponsor ? `· ${csr.sponsor}` : ''}
                            </div>
                          )}
                          {csr.summary && (
                            <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                              {csr.summary}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {evidenceSearch.data &&
                  evidenceSearch.data.length === 0 &&
                  !evidenceSearch.isLoading && (
                    <p className="text-xs text-zinc-400 italic text-center py-4">
                      No evidence found for "{evidenceQuery}"
                    </p>
                  )}
              </div>
            )}

            {/* Save as Evidence Binder */}
            {csrSearch.data && csrSearch.data.length > 0 && onCreateDocument && (
              <button
                onClick={() => {
                  const reports = csrSearch.data || [];
                  const html = [
                    `<h1>Evidence Binder — ${indication || submissionType || 'Clinical'}</h1>`,
                    `<p><strong>Historical Reports Matched:</strong> ${reports.length}</p>`,
                    `<p><strong>Regions:</strong> USA, EU, Canada (FDA / EMA / Health Canada open sources)</p>`,
                    '<h2>Matched Clinical Study Reports</h2>',
                    '<table><tr><th>Study</th><th>Phase</th><th>Indication</th><th>Outcome</th><th>Relevance</th></tr>',
                    ...reports.map(
                      c =>
                        `<tr><td>${c.title || ''}</td><td>${c.phase || ''}</td><td>${c.indication || ''}</td><td>${c.outcome || ''}</td><td>${c.relevance_score != null ? Math.round(c.relevance_score * 100) + '%' : ''}</td></tr>`
                    ),
                    '</table>',
                  ].join('\n');
                  onCreateDocument(
                    html,
                    `Evidence Binder — ${indication || submissionType || 'Clinical'}`,
                    '5.3'
                  );
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-150"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                Save as Evidence Binder
              </button>
            )}

            {/* Empty state */}
            {!evidenceQuery && (!csrSearch.data || csrSearch.data.length === 0) && (
              <div className="text-center py-6">
                <BookOpen className="w-8 h-8 mx-auto text-zinc-400 mb-2" />
                <p className="text-xs text-zinc-400">
                  Search 779+ clinical study reports or set an indication to auto-discover evidence.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Alerts tab ──────────────────────────────────────────────────── */}
        {activeTab === 'alerts' && (
          <AlertFeed
            therapeuticArea={therapeuticArea}
            compact
          />
        )}
      </div>
    </div>
  );
}

export default RegulatoryIntelligencePanel;
