/**
 * @fileoverview Precedent Intelligence Dashboard
 * @module concept2cure/components/precedent/PrecedentIntelligenceDashboard
 *
 * LIVE regulatory precedent intelligence — NOT mock data.
 * 4 tabs: Search · Compare · Risk · Strategy — all wired to /api/precedent-engine/*
 *
 * Uses existing UI primitives: Card, Tabs, Badge, Table, Button, Input (shadcn/ui).
 */

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  GitCompare,
  ShieldAlert,
  Compass,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowUpRight,
  Target,
  Scale,
  Clock,
  FileText,
  Sparkles,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import {
  usePrecedentSearch,
  usePrecedentCompare,
  usePrecedentRisk,
  usePrecedentStrategy,
  type SearchParams,
  type CompareParams,
  type CompareResult,
  type PrecedentRecord,
} from '../../hooks/usePrecedentEngine';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface PrecedentIntelligenceDashboardProps {
  projectSubmissionType?: string;
  projectDeviceName?: string;
  projectIndication?: string;
  projectDeviceClass?: string;
  projectTherapeuticArea?: string;
  onNavigateToEditor?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RISK BADGE
// ═══════════════════════════════════════════════════════════════════════════════

function RiskBadge({ level }: { level: string }) {
  const cfg: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    low: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      icon: <CheckCircle className="w-3 h-3" />,
    },
    medium: {
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      icon: <AlertTriangle className="w-3 h-3" />,
    },
    high: { bg: 'bg-red-50', text: 'text-red-700', icon: <ShieldAlert className="w-3 h-3" /> },
    critical: { bg: 'bg-red-100', text: 'text-red-800', icon: <XCircle className="w-3 h-3" /> },
  };
  const c = cfg[level] || cfg.medium;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        c.bg,
        c.text
      )}
    >
      {c.icon} {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCORE BAR
// ═══════════════════════════════════════════════════════════════════════════════

function ScoreBar({ value, max = 1, label }: { value: number; max?: number; label?: string }) {
  const pct = Math.round((value / max) * 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-zinc-500 w-28 flex-shrink-0">{label}</span>}
      <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-zinc-600 w-10 text-right">{pct}%</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function PrecedentIntelligenceDashboard({
  projectSubmissionType,
  projectDeviceName,
  projectIndication,
  projectDeviceClass,
  projectTherapeuticArea,
  onNavigateToEditor,
}: PrecedentIntelligenceDashboardProps) {
  const [activeTab, setActiveTab] = useState('search');

  // ── Search state ──────────────────────────────────────────────────────────
  const [searchSubmissionType, setSearchSubmissionType] = useState(
    projectSubmissionType || '510(k)'
  );
  const [searchDeviceClass, setSearchDeviceClass] = useState(projectDeviceClass || '');
  const [searchTherapeuticArea, setSearchTherapeuticArea] = useState(projectTherapeuticArea || '');
  const [searchIndication, setSearchIndication] = useState(projectIndication || '');
  const [searchActive, setSearchActive] = useState(false);

  const searchParams: SearchParams | null = searchActive
    ? {
        submissionType: searchSubmissionType,
        deviceClass: searchDeviceClass || undefined,
        therapeuticArea: searchTherapeuticArea || undefined,
        indication: searchIndication || undefined,
      }
    : null;

  const { data: searchResults, isLoading: searchLoading } = usePrecedentSearch(searchParams);

  // ── Compare state ─────────────────────────────────────────────────────────
  const [selectedPrecedent, setSelectedPrecedent] = useState<PrecedentRecord | null>(null);
  const [compareDeviceName, setCompareDeviceName] = useState(projectDeviceName || '');
  const [compareIndication, setCompareIndication] = useState(projectIndication || '');
  const [comparePredicate, setComparePredicate] = useState('');
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);

  const compareMutation = usePrecedentCompare();

  const handleCompare = useCallback(() => {
    if (!selectedPrecedent) return;
    const params: CompareParams = {
      precedentId: selectedPrecedent.id,
      submissionType: searchSubmissionType,
      deviceName: compareDeviceName || undefined,
      indication: compareIndication || undefined,
      predicateDevice: comparePredicate || undefined,
    };
    compareMutation.mutate(params, {
      onSuccess: data => setCompareResult(data),
    });
  }, [
    selectedPrecedent,
    searchSubmissionType,
    compareDeviceName,
    compareIndication,
    comparePredicate,
    compareMutation,
  ]);

  // ── Risk state ────────────────────────────────────────────────────────────
  const [riskActive, setRiskActive] = useState(false);
  const riskParams = riskActive
    ? {
        submissionType: searchSubmissionType,
        deviceName: compareDeviceName || projectDeviceName || undefined,
        indication: compareIndication || projectIndication || undefined,
        therapeuticArea: searchTherapeuticArea || projectTherapeuticArea || undefined,
        deviceClass: searchDeviceClass || projectDeviceClass || undefined,
      }
    : null;
  const { data: riskResult, isLoading: riskLoading } = usePrecedentRisk(riskParams);

  // ── Strategy state ────────────────────────────────────────────────────────
  const [strategyActive, setStrategyActive] = useState(false);
  const strategyParams = strategyActive
    ? {
        submissionType: searchSubmissionType,
        deviceName: compareDeviceName || projectDeviceName || undefined,
        indication: compareIndication || projectIndication || undefined,
        therapeuticArea: searchTherapeuticArea || projectTherapeuticArea || undefined,
        deviceClass: searchDeviceClass || projectDeviceClass || undefined,
      }
    : null;
  const { data: strategyResult, isLoading: strategyLoading } = usePrecedentStrategy(strategyParams);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-50/30">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        {/* Tab bar */}
        <div className="flex-shrink-0 border-b border-zinc-200 bg-white px-4">
          <TabsList className="h-11 bg-transparent gap-1">
            <TabsTrigger
              value="search"
              className="gap-1.5 data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700"
            >
              <Search className="w-3.5 h-3.5" /> Search
            </TabsTrigger>
            <TabsTrigger
              value="compare"
              className="gap-1.5 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"
            >
              <GitCompare className="w-3.5 h-3.5" /> Compare
            </TabsTrigger>
            <TabsTrigger
              value="risk"
              className="gap-1.5 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700"
            >
              <ShieldAlert className="w-3.5 h-3.5" /> Risk
            </TabsTrigger>
            <TabsTrigger
              value="strategy"
              className="gap-1.5 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700"
            >
              <Compass className="w-3.5 h-3.5" /> Strategy
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ─── SEARCH TAB ──────────────────────────────────────────────────── */}
        <TabsContent value="search" className="flex-1 overflow-y-auto p-4 space-y-4 mt-0">
          {/* Search form */}
          <div className="border border-border/40 rounded-sm bg-background">
            <div className="px-3 py-2 border-b border-border/30 pb-3">
              <h3 className="text-sm font-semibold text-sm flex items-center gap-2">
                <Search className="w-4 h-4 text-violet-600" />
                Search Regulatory Precedents
              </h3>
            </div>
            <div className="px-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Submission Type *</label>
                  <Select value={searchSubmissionType} onValueChange={setSearchSubmissionType}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="510(k)">510(k)</SelectItem>
                      <SelectItem value="PMA">PMA</SelectItem>
                      <SelectItem value="De Novo">De Novo</SelectItem>
                      <SelectItem value="IND">IND</SelectItem>
                      <SelectItem value="NDA">NDA</SelectItem>
                      <SelectItem value="BLA">BLA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Device Class</label>
                  <Select value={searchDeviceClass} onValueChange={setSearchDeviceClass}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any</SelectItem>
                      <SelectItem value="1">Class I</SelectItem>
                      <SelectItem value="2">Class II</SelectItem>
                      <SelectItem value="3">Class III</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Therapeutic Area</label>
                  <Input
                    value={searchTherapeuticArea}
                    onChange={e => setSearchTherapeuticArea(e.target.value)}
                    placeholder="e.g., Orthopedic, Cardiovascular"
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Indication</label>
                  <Input
                    value={searchIndication}
                    onChange={e => setSearchIndication(e.target.value)}
                    placeholder="e.g., Total knee arthroplasty"
                    className="h-9"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  onClick={() => setSearchActive(true)}
                  disabled={!searchSubmissionType}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                  size="sm"
                >
                  {searchLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <Search className="w-4 h-4 mr-1" />
                  )}
                  Search Precedents
                </Button>
              </div>
            </div>
          </div>

          {/* Search results */}
          {searchActive && (
            <div className="border border-border/40 rounded-sm bg-background">
              <div className="px-3 py-2 border-b border-border/30 pb-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-sm">
                    Results {searchResults?.length ? `(${searchResults.length})` : ''}
                  </h3>
                  {searchResults?.length ? (
                    <Badge variant="secondary" className="text-xs">
                      {searchSubmissionType}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="px-3 py-2">
                {searchLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                    <span className="ml-2 text-sm text-zinc-500">
                      Searching across FDA databases...
                    </span>
                  </div>
                ) : !searchResults?.length ? (
                  <div className="text-center py-8">
                    <Search className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
                    <p className="text-sm text-zinc-500">
                      No precedents found. Try broadening your search criteria.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {searchResults.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedPrecedent(p);
                          setActiveTab('compare');
                        }}
                        className={cn(
                          'w-full text-left p-3 rounded-lg border transition-all hover:shadow-sm',
                          selectedPrecedent?.id === p.id
                            ? 'border-violet-300 bg-violet-50/50'
                            : 'border-zinc-200 hover:border-zinc-300 bg-white'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm text-zinc-900 truncate">
                                {p.deviceName || p.clearanceNumber || 'Unnamed'}
                              </span>
                              {p.clearanceNumber && (
                                <Badge variant="outline" className="text-xs flex-shrink-0">
                                  {p.clearanceNumber}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500 truncate">
                              {p.indication || p.therapeuticArea || p.submissionType}
                              {p.applicant ? ` · ${p.applicant}` : ''}
                            </p>
                            {p.strategySummary && (
                              <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                                {p.strategySummary}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            {p.decisionOutcome && (
                              <Badge
                                variant="secondary"
                                className={cn(
                                  'text-xs',
                                  p.decisionOutcome === 'cleared' &&
                                    'bg-emerald-50 text-emerald-700',
                                  p.decisionOutcome === 'approved' &&
                                    'bg-emerald-50 text-emerald-700',
                                  p.decisionOutcome === 'rejected' && 'bg-red-50 text-red-700'
                                )}
                              >
                                {p.decisionOutcome}
                              </Badge>
                            )}
                            {p.confidenceScore != null && (
                              <span className="text-xs text-zinc-400">
                                {Math.round(p.confidenceScore * 100)}% conf
                              </span>
                            )}
                            <ChevronRight className="w-3 h-3 text-zinc-400 mt-1" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ─── COMPARE TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="compare" className="flex-1 overflow-y-auto p-4 space-y-4 mt-0">
          {!selectedPrecedent ? (
            <div className="border border-border/40 rounded-sm bg-background">
              <div className="px-3 py-2 py-12 text-center">
                <GitCompare className="w-10 h-10 text-zinc-400 mx-auto mb-3" />
                <h3 className="text-sm font-medium text-zinc-700 mb-1">
                  Select a Precedent to Compare
                </h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Search for precedents first, then click one to compare against your submission.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4"
                  onClick={() => setActiveTab('search')}
                >
                  <Search className="w-3.5 h-3.5 mr-1" /> Go to Search
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Selected precedent summary */}
              <div className="border border-border/40 rounded-sm bg-background border-blue-200 bg-blue-50/30">
                <div className="px-3 py-2 border-b border-border/30 pb-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600" />
                      Comparing Against
                    </h3>
                    {selectedPrecedent.decisionOutcome && (
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-xs',
                          selectedPrecedent.decisionOutcome === 'cleared' &&
                            'bg-emerald-100 text-emerald-700'
                        )}
                      >
                        {selectedPrecedent.decisionOutcome}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="px-3 py-2">
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-zinc-500">Device</span>
                      <p className="font-medium text-zinc-900">
                        {selectedPrecedent.deviceName || '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-zinc-500">Clearance</span>
                      <p className="font-medium text-zinc-900">
                        {selectedPrecedent.clearanceNumber || '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-zinc-500">Predicate</span>
                      <p className="font-medium text-zinc-900">
                        {selectedPrecedent.predicateDevice || '—'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Your device fields */}
              <div className="border border-border/40 rounded-sm bg-background">
                <div className="px-3 py-2 border-b border-border/30 pb-3">
                  <h3 className="text-sm font-semibold text-sm flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-600" />
                    Your Submission Details
                  </h3>
                </div>
                <div className="px-3 py-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Your Device Name</label>
                      <Input
                        value={compareDeviceName}
                        onChange={e => setCompareDeviceName(e.target.value)}
                        placeholder="e.g., FlexiKnee Pro"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Indication</label>
                      <Input
                        value={compareIndication}
                        onChange={e => setCompareIndication(e.target.value)}
                        placeholder="e.g., Total knee arthroplasty"
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-zinc-500 mb-1 block">Predicate Device</label>
                      <Input
                        value={comparePredicate}
                        onChange={e => setComparePredicate(e.target.value)}
                        placeholder="e.g., OrthoFlex Knee System"
                        className="h-9"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      onClick={handleCompare}
                      disabled={compareMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      size="sm"
                    >
                      {compareMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        <GitCompare className="w-4 h-4 mr-1" />
                      )}
                      Run Comparison
                    </Button>
                  </div>
                </div>
              </div>

              {/* Comparison results */}
              {compareResult && (
                <div className="border border-border/40 rounded-sm bg-background">
                  <div className="px-3 py-2 border-b border-border/30 pb-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-sm">Comparison Results</h3>
                      <div className="flex items-center gap-2">
                        <RiskBadge level={compareResult.riskLevel} />
                        <ScoreBar value={compareResult.overallScore} label="Match" />
                      </div>
                    </div>
                  </div>
                  <div className="px-3 py-2 space-y-4">
                    {/* Similarities */}
                    {compareResult.similarities.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-emerald-700 flex items-center gap-1 mb-2">
                          <CheckCircle className="w-3.5 h-3.5" /> Similarities (
                          {compareResult.similarities.length})
                        </h4>
                        <div className="space-y-1.5">
                          {compareResult.similarities.map((d, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 text-xs p-2 rounded bg-emerald-50/50"
                            >
                              <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                              <span className="font-medium text-zinc-700 w-32 flex-shrink-0">
                                {d.dimension}
                              </span>
                              <span className="text-zinc-500 truncate flex-1">{d.userValue}</span>
                              <Badge variant="outline" className="text-xs">
                                {d.impact}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Differences */}
                    {compareResult.differences.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-amber-700 flex items-center gap-1 mb-2">
                          <AlertTriangle className="w-3.5 h-3.5" /> Differences (
                          {compareResult.differences.length})
                        </h4>
                        <div className="space-y-1.5">
                          {compareResult.differences.map((d, i) => (
                            <div
                              key={i}
                              className="text-xs p-2 rounded bg-amber-50/50 border border-amber-100"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                                <span className="font-medium text-zinc-700">{d.dimension}</span>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-xs ml-auto',
                                    d.impact === 'high' && 'border-red-200 text-red-600'
                                  )}
                                >
                                  {d.impact}
                                </Badge>
                              </div>
                              <div className="ml-5 grid grid-cols-2 gap-2 text-zinc-500">
                                <div>
                                  <span className="text-zinc-400">Yours:</span> {d.userValue}
                                </div>
                                <div>
                                  <span className="text-zinc-400">Precedent:</span>{' '}
                                  {d.precedentValue}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recommendations */}
                    {compareResult.recommendations.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-violet-700 flex items-center gap-1 mb-2">
                          <Sparkles className="w-3.5 h-3.5" /> Recommendations
                        </h4>
                        <ul className="space-y-1">
                          {compareResult.recommendations.map((r, i) => (
                            <li
                              key={i}
                              className="text-xs text-zinc-600 flex items-start gap-2 p-2 bg-violet-50/50 rounded"
                            >
                              <ArrowUpRight className="w-3 h-3 text-violet-500 flex-shrink-0 mt-0.5" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ─── RISK TAB ────────────────────────────────────────────────────── */}
        <TabsContent value="risk" className="flex-1 overflow-y-auto p-4 space-y-4 mt-0">
          <div className="border border-border/40 rounded-sm bg-background">
            <div className="px-3 py-2 border-b border-border/30 pb-3">
              <h3 className="text-sm font-semibold text-sm flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                Regulatory Risk Analysis
              </h3>
            </div>
            <div className="px-3 py-2">
              <p className="text-xs text-zinc-500 mb-3">
                Cross-references adversarial precedents, safety signals, toxic predicates, and FDA
                objection patterns.
              </p>
              <Button
                onClick={() => setRiskActive(true)}
                disabled={riskLoading || !searchSubmissionType}
                className="bg-amber-600 hover:bg-amber-700 text-white"
                size="sm"
              >
                {riskLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <ShieldAlert className="w-4 h-4 mr-1" />
                )}
                Analyze Risk
              </Button>
            </div>
          </div>

          {riskResult && (
            <>
              {/* Risk score card */}
              <div
                className={cn(
                  'border border-border/40 rounded-sm bg-background border-l-4',
                  riskResult.overallRisk === 'low' && 'border-l-emerald-500',
                  riskResult.overallRisk === 'medium' && 'border-l-amber-500',
                  riskResult.overallRisk === 'high' && 'border-l-red-500',
                  riskResult.overallRisk === 'critical' && 'border-l-red-700'
                )}
              >
                <div className="px-3 py-2 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-zinc-900">Risk Assessment</h3>
                      <p className="text-xs text-zinc-500">Based on historical FDA patterns</p>
                    </div>
                    <div className="text-right">
                      <RiskBadge level={riskResult.overallRisk} />
                      <p className="text-xs text-zinc-400 mt-1">
                        Score: {riskResult.riskScore}/100
                      </p>
                    </div>
                  </div>
                  <ScoreBar value={riskResult.riskScore} max={100} label="Risk Level" />
                </div>
              </div>

              {/* Risk factors */}
              {riskResult.factors.length > 0 && (
                <div className="border border-border/40 rounded-sm bg-background">
                  <div className="px-3 py-2 border-b border-border/30 pb-2">
                    <h3 className="text-sm font-semibold text-sm">Risk Factors</h3>
                  </div>
                  <div className="px-3 py-2">
                    <div className="space-y-2">
                      {riskResult.factors.map((f, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 p-2 rounded bg-red-50/50 text-xs"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <span className="font-medium text-zinc-900">{f.factor}</span>
                            <p className="text-zinc-500 mt-0.5">{f.detail}</p>
                          </div>
                          <Badge variant="outline" className="ml-auto flex-shrink-0 text-xs">
                            {f.severity}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Safety signals */}
              {riskResult.safetySignals.length > 0 && (
                <div className="border border-border/40 rounded-sm bg-background">
                  <div className="px-3 py-2 border-b border-border/30 pb-2">
                    <h3 className="text-sm font-semibold text-sm flex items-center gap-2">
                      <Zap className="w-4 h-4 text-red-500" /> Safety Signals
                    </h3>
                  </div>
                  <div className="px-3 py-2">
                    <div className="space-y-1.5">
                      {riskResult.safetySignals.map((s, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 p-2 rounded bg-zinc-50 text-xs"
                        >
                          <Zap className="w-3 h-3 text-red-400 flex-shrink-0" />
                          <span className="font-medium text-zinc-700">{s.device}</span>
                          <span className="text-zinc-500 flex-1 truncate">{s.signal}</span>
                          <RiskBadge level={s.severity} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Mitigation strategies */}
              {riskResult.mitigationStrategies.length > 0 && (
                <div className="border border-border/40 rounded-sm bg-background">
                  <div className="px-3 py-2 border-b border-border/30 pb-2">
                    <h3 className="text-sm font-semibold text-sm flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" /> Mitigation Strategies
                    </h3>
                  </div>
                  <div className="px-3 py-2">
                    <ul className="space-y-1.5">
                      {riskResult.mitigationStrategies.map((s, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-xs text-zinc-600 p-2 bg-emerald-50/50 rounded"
                        >
                          <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0 mt-0.5" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {riskResult.factors.length === 0 && riskResult.safetySignals.length === 0 && (
                <div className="border border-border/40 rounded-sm bg-background">
                  <div className="px-3 py-2 py-8 text-center">
                    <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                    <h3 className="text-sm font-medium text-zinc-700">Low Risk Profile</h3>
                    <p className="text-xs text-zinc-500 mt-1">
                      No adversarial precedents, safety signals, or toxic predicates found for this
                      submission profile.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ─── STRATEGY TAB ────────────────────────────────────────────────── */}
        <TabsContent value="strategy" className="flex-1 overflow-y-auto p-4 space-y-4 mt-0">
          <div className="border border-border/40 rounded-sm bg-background">
            <div className="px-3 py-2 border-b border-border/30 pb-3">
              <h3 className="text-sm font-semibold text-sm flex items-center gap-2">
                <Compass className="w-4 h-4 text-emerald-600" />
                Regulatory Strategy Advisor
              </h3>
            </div>
            <div className="px-3 py-2">
              <p className="text-xs text-zinc-500 mb-3">
                Analyzes approved vs. rejected precedents to recommend the optimal submission
                strategy.
              </p>
              <Button
                onClick={() => setStrategyActive(true)}
                disabled={strategyLoading || !searchSubmissionType}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                size="sm"
              >
                {strategyLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Compass className="w-4 h-4 mr-1" />
                )}
                Get Strategy
              </Button>
            </div>
          </div>

          {strategyResult && (
            <>
              {/* Primary strategy */}
              <div className="border border-border/40 rounded-sm bg-background border-l-4 border-l-emerald-500">
                <div className="px-3 py-2 pt-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-base font-semibold text-zinc-900">
                        {strategyResult.recommendedStrategy}
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex items-center gap-1 text-xs text-zinc-500">
                          <Clock className="w-3 h-3" />
                          {strategyResult.estimatedTimeline}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <ScoreBar value={strategyResult.confidence} label="Confidence" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Supporting precedents */}
              {strategyResult.supportingPrecedents.length > 0 && (
                <div className="border border-border/40 rounded-sm bg-background">
                  <div className="px-3 py-2 border-b border-border/30 pb-2">
                    <h3 className="text-sm font-semibold text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600" />
                      Supporting Precedents ({strategyResult.supportingPrecedents.length})
                    </h3>
                  </div>
                  <div className="px-3 py-2">
                    <div className="space-y-1.5">
                      {strategyResult.supportingPrecedents.map((p, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 p-2 rounded text-xs border border-zinc-200 hover:bg-zinc-50"
                        >
                          <FileText className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                          <span className="font-medium text-zinc-700">
                            {p.deviceName || p.clearanceNumber}
                          </span>
                          {p.clearanceNumber && (
                            <Badge variant="outline" className="text-xs">
                              {p.clearanceNumber}
                            </Badge>
                          )}
                          {p.decisionOutcome && (
                            <Badge
                              variant="secondary"
                              className="text-xs ml-auto bg-emerald-50 text-emerald-700"
                            >
                              {p.decisionOutcome}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Alternative strategies */}
              {strategyResult.alternativeStrategies.length > 0 && (
                <div className="border border-border/40 rounded-sm bg-background">
                  <div className="px-3 py-2 border-b border-border/30 pb-2">
                    <h3 className="text-sm font-semibold text-sm">Alternative Strategies</h3>
                  </div>
                  <div className="px-3 py-2">
                    <div className="space-y-2">
                      {strategyResult.alternativeStrategies.map((alt, i) => (
                        <div
                          key={i}
                          className="p-3 rounded-lg border border-zinc-200 bg-zinc-50/50"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-zinc-900">
                              {alt.strategy}
                            </span>
                            <ScoreBar value={alt.confidence} label="" />
                          </div>
                          <p className="text-xs text-zinc-500">{alt.rationale}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Testing requirements */}
              {strategyResult.testingRequirements.length > 0 && (
                <div className="border border-border/40 rounded-sm bg-background">
                  <div className="px-3 py-2 border-b border-border/30 pb-2">
                    <h3 className="text-sm font-semibold text-sm flex items-center gap-2">
                      <Scale className="w-4 h-4 text-violet-600" />
                      Testing Requirements
                    </h3>
                  </div>
                  <div className="px-3 py-2">
                    <ul className="space-y-1">
                      {strategyResult.testingRequirements.map((t, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs text-zinc-600 p-1.5">
                          <CheckCircle className="w-3 h-3 text-violet-400 flex-shrink-0" />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Key risks */}
              {strategyResult.keyRisks.length > 0 && (
                <div className="border border-border/40 rounded-sm bg-background">
                  <div className="px-3 py-2 border-b border-border/30 pb-2">
                    <h3 className="text-sm font-semibold text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      Key Risks to Address
                    </h3>
                  </div>
                  <div className="px-3 py-2">
                    <ul className="space-y-1">
                      {strategyResult.keyRisks.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-zinc-600 p-1.5">
                          <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Action: navigate to editor */}
              {onNavigateToEditor && (
                <div className="flex justify-center pt-2">
                  <Button
                    onClick={onNavigateToEditor}
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Open Document Editor
                    <ArrowUpRight className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default PrecedentIntelligenceDashboard;
