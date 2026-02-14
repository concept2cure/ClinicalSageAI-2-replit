/**
 * Phase 6.6 — Predicate Intelligence Page
 *
 * The "Golden Predicate Demo" — jaw-dropping 510(k) generation in &lt;5 minutes.
 *
 * Tabs:
 *   1. Predicate Radar — Scatter plot (Similarity vs. Safety/Toxicity)
 *   2. SE Matrix      — Substantial Equivalence comparison table
 *   3. Defense Meter   — Shadow 510(k) review readiness scoring
 *
 * @phase 6.6 — Predicate Intelligence
 */

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertTriangle,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Target,
  Radar,
  Plus,
  Play,
  Search,
  Zap,
  Award,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowRight,
  Eye,
  Package,
  GitBranch,
} from 'lucide-react';
import {
  useCandidates,
  useCreateCandidate,
  useAnalyze,
  useSEMatrix,
  useDefensePreview,
  useGenerateDefensePreview,
  useSuggestPredicates,
  useGenerateSEMatrix,
  useToxicDetail,
  useToxicityProfile,
  useLineageGraph,
} from '@/hooks/use-predicate-intelligence';
import { SEMatrixV2Panel } from '@/components/predicate/SEMatrixV2Panel';
import { DefensePacketPanel } from '@/components/predicate/DefensePacketPanel';
import { PredicateRadarPlot } from '@/components/predicate/PredicateRadarPlot';
import { ProofStrip } from '@/components/predicate/ProofStrip';
import { LineageGraphPanel } from '@/components/predicate/LineageGraphPanel';
import type {
  PredicateCandidate,
  EquivalenceStatus,
  AnticipatedQuestion,
  EvidenceGap,
  PredicateSuggestion,
  StrategyRecommendation,
  SEMatrixComparisonRow,
  DiffSeverity,
  ToxicityBadge as ToxicityBadgeType,
} from '../../shared/types/predicate-intelligence';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const TOXICITY_THRESHOLDS = {
  safe: 0.15,
  caution: 0.35,
  danger: 0.6,
} as const;

const EQUIVALENCE_COLORS: Record<EquivalenceStatus, string> = {
  EQUIVALENT: 'bg-green-100 text-green-800 border-green-200',
  DISCUSSION_REQUIRED: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  NOT_EQUIVALENT: 'bg-red-100 text-red-800 border-red-200',
  TOXIC: 'bg-red-200 text-red-900 border-red-400',
  PENDING: 'bg-gray-100 text-gray-600 border-gray-200',
};

const EQUIVALENCE_ICONS: Record<EquivalenceStatus, typeof CheckCircle> = {
  EQUIVALENT: CheckCircle,
  DISCUSSION_REQUIRED: AlertCircle,
  NOT_EQUIVALENT: XCircle,
  TOXIC: AlertTriangle,
  PENDING: AlertCircle,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Components
// ═══════════════════════════════════════════════════════════════════════════════

const STRATEGY_COLORS: Record<StrategyRecommendation, string> = {
  CONSERVATIVE: 'bg-blue-100 text-blue-800 border-blue-200',
  AGGRESSIVE: 'bg-purple-100 text-purple-800 border-purple-200',
  BALANCED: 'bg-green-100 text-green-800 border-green-200',
  AVOID: 'bg-red-100 text-red-900 border-red-300',
};

const STRATEGY_ICONS: Record<StrategyRecommendation, typeof CheckCircle> = {
  CONSERVATIVE: Shield,
  AGGRESSIVE: Zap,
  BALANCED: ShieldCheck,
  AVOID: AlertTriangle,
};

const SEVERITY_COLORS: Record<string, string> = {
  none: 'text-green-600',
  low: 'text-yellow-600',
  medium: 'text-orange-600',
  high: 'text-red-600',
  critical: 'text-red-900 font-bold',
};

function StrategyBadge({ recommendation }: { recommendation: StrategyRecommendation }) {
  const Icon = STRATEGY_ICONS[recommendation] || Shield;
  return (
    <Badge variant="outline" className={STRATEGY_COLORS[recommendation] || ''}>
      <Icon className="h-3 w-3 mr-1" />
      {recommendation}
    </Badge>
  );
}

function ToxicityBadge({ score, badge }: { score: number; badge?: ToxicityBadgeType | null }) {
  // F.1: If server provides a discrete badge, use it (TOXIC / RISKY_FAMILY / CLEAN)
  if (badge === 'TOXIC') {
    return (
      <Badge variant="destructive" data-testid="toxicity-badge-toxic">
        <AlertTriangle className="h-3 w-3 mr-1" />
        TOXIC ({(score * 100).toFixed(0)}%)
      </Badge>
    );
  }
  if (badge === 'RISKY_FAMILY') {
    return (
      <Badge
        variant="outline"
        className="bg-orange-50 text-orange-700 border-orange-300"
        data-testid="toxicity-badge-risky-family"
      >
        <ShieldAlert className="h-3 w-3 mr-1" />
        RISKY FAMILY ({(score * 100).toFixed(0)}%)
      </Badge>
    );
  }
  if (badge === 'CLEAN') {
    return (
      <Badge
        variant="outline"
        className="bg-green-50 text-green-700 border-green-300"
        data-testid="toxicity-badge-clean"
      >
        <ShieldCheck className="h-3 w-3 mr-1" />
        Clean ({(score * 100).toFixed(0)}%)
      </Badge>
    );
  }

  // Fallback: score-based thresholds (pre-F.1 compat)
  if (score <= TOXICITY_THRESHOLDS.safe) {
    return (
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
        <ShieldCheck className="h-3 w-3 mr-1" />
        Safe ({(score * 100).toFixed(0)}%)
      </Badge>
    );
  }
  if (score <= TOXICITY_THRESHOLDS.caution) {
    return (
      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
        <Shield className="h-3 w-3 mr-1" />
        Caution ({(score * 100).toFixed(0)}%)
      </Badge>
    );
  }
  if (score <= TOXICITY_THRESHOLDS.danger) {
    return (
      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
        <ShieldAlert className="h-3 w-3 mr-1" />
        Elevated ({(score * 100).toFixed(0)}%)
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">
      <AlertTriangle className="h-3 w-3 mr-1" />
      TOXIC ({(score * 100).toFixed(0)}%)
    </Badge>
  );
}

function SimilarityBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{pct}%</span>
    </div>
  );
}

function ReadinessMeter({ score, size = 'lg' }: { score: number; size?: 'sm' | 'lg' }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600';
  const bgColor =
    pct >= 80 ? 'stroke-green-500' : pct >= 60 ? 'stroke-yellow-500' : 'stroke-red-500';
  const sz = size === 'lg' ? 120 : 48;
  const strokeWidth = size === 'lg' ? 8 : 4;
  const radius = (sz - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={sz} height={sz} className="-rotate-90">
        <circle
          cx={sz / 2}
          cy={sz / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        <circle
          cx={sz / 2}
          cy={sz / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={bgColor}
        />
      </svg>
      <span className={`absolute font-bold ${color} ${size === 'lg' ? 'text-2xl' : 'text-xs'}`}>
        {pct}%
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Predicate Radar Tab
// ═══════════════════════════════════════════════════════════════════════════════

function PredicateRadarTab({
  programId,
  onSelectCandidate,
  onToxicDetail,
}: {
  programId: string;
  onSelectCandidate: (c: PredicateCandidate) => void;
  onToxicDetail?: (kNumber: string) => void;
}) {
  const { data: candidates, isLoading } = useCandidates(programId);
  const analyzeMut = useAnalyze(programId);
  const addMut = useCreateCandidate(programId);
  const suggestMut = useSuggestPredicates(programId);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedCandidateInTab, setSelectedCandidateInTab] = useState<string | null>(null);
  const [searchDevice, setSearchDevice] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [intendedUse, setIntendedUse] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [technology, setTechnology] = useState('');
  const [materials, setMaterials] = useState('');
  const [energySource, setEnergySource] = useState('');
  const [tissueContact, setTissueContact] = useState('');
  const [duration, setDuration] = useState('');
  const [softwarePresent, setSoftwarePresent] = useState(false);
  const [addKNumber, setAddKNumber] = useState('');
  const [addDeviceName, setAddDeviceName] = useState('');
  const [addManufacturer, setAddManufacturer] = useState('');

  const sorted = useMemo(() => {
    if (!candidates) return [];
    return [...candidates].sort((a, b) => {
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      return a.toxicity_score - b.toxicity_score;
    });
  }, [candidates]);

  const handleAnalyze = useCallback(() => {
    if (!searchDevice.trim()) return;
    analyzeMut.mutate({ device_name: searchDevice, product_code: searchCode });
    // Trigger v2 predicate suggestion engine
    if (intendedUse.trim() && searchCode.trim()) {
      suggestMut.mutate({
        product_code: searchCode,
        device_name: searchDevice,
        intended_use: intendedUse,
        technology_description: technology || searchDevice,
        materials: materials
          ? materials
              .split(',')
              .map(m => m.trim())
              .filter(Boolean)
          : undefined,
        energy_source: energySource || undefined,
        tissue_contact: tissueContact || undefined,
        duration: duration || undefined,
        software_present: softwarePresent || undefined,
      });
    }
  }, [
    searchDevice,
    searchCode,
    intendedUse,
    technology,
    materials,
    energySource,
    tissueContact,
    duration,
    softwarePresent,
    analyzeMut,
    suggestMut,
  ]);

  const handleAdd = useCallback(() => {
    if (!addKNumber.trim() || !addDeviceName.trim()) return;
    addMut.mutate(
      { k_number: addKNumber, device_name: addDeviceName, manufacturer: addManufacturer },
      {
        onSuccess: () => {
          setShowAddDialog(false);
          setAddKNumber('');
          setAddDeviceName('');
          setAddManufacturer('');
        },
      }
    );
  }, [addKNumber, addDeviceName, addManufacturer, addMut]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search bar — device similarity analyzer + strategy engine */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1 block">Subject Device Name</label>
              <Input
                value={searchDevice}
                onChange={e => setSearchDevice(e.target.value)}
                placeholder="e.g. Cardiac Monitor, Blood Glucose Meter"
              />
            </div>
            <div className="w-40">
              <label className="text-sm font-medium mb-1 block">Product Code</label>
              <Input
                value={searchCode}
                onChange={e => setSearchCode(e.target.value)}
                placeholder="e.g. DQA, NBW"
              />
            </div>
            <Button
              onClick={handleAnalyze}
              disabled={!searchDevice.trim() || analyzeMut.isPending || suggestMut.isPending}
            >
              {analyzeMut.isPending || suggestMut.isPending ? (
                <>
                  <Search className="h-4 w-4 mr-2 animate-spin" /> Analyzing…
                </>
              ) : (
                <>
                  <Radar className="h-4 w-4 mr-2" /> Find Predicates
                </>
              )}
            </Button>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="h-4 w-4 mr-1" /> Manual
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Predicate Candidate</DialogTitle>
                  <DialogDescription>
                    Manually add a known predicate device for comparison.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-4">
                  <div>
                    <label className="text-sm font-medium">K-Number *</label>
                    <Input
                      value={addKNumber}
                      onChange={e => setAddKNumber(e.target.value)}
                      placeholder="K210123"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Device Name *</label>
                    <Input
                      value={addDeviceName}
                      onChange={e => setAddDeviceName(e.target.value)}
                      placeholder="Predicate Device Name"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Manufacturer</label>
                    <Input
                      value={addManufacturer}
                      onChange={e => setAddManufacturer(e.target.value)}
                      placeholder="Manufacturer Name"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAdd}
                    disabled={!addKNumber.trim() || !addDeviceName.trim() || addMut.isPending}
                  >
                    {addMut.isPending ? 'Adding…' : 'Add Candidate'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Strategy Engine Fields */}
          <div>
            <label className="text-sm font-medium mb-1 block">Intended Use / Indications</label>
            <Input
              value={intendedUse}
              onChange={e => setIntendedUse(e.target.value)}
              placeholder="e.g. Continuous monitoring of blood glucose levels in adults"
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-muted-foreground"
          >
            {showAdvanced ? '▼ Hide' : '► Show'} Strategy Engine Fields (Materials, Energy,
            Technology)
          </Button>

          {showAdvanced && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Technology Description</label>
                <Input
                  value={technology}
                  onChange={e => setTechnology(e.target.value)}
                  placeholder="e.g. Electrochemical sensor"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Materials (comma-separated)
                </label>
                <Input
                  value={materials}
                  onChange={e => setMaterials(e.target.value)}
                  placeholder="e.g. Titanium alloy, silicone"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Energy Source</label>
                <Input
                  value={energySource}
                  onChange={e => setEnergySource(e.target.value)}
                  placeholder="e.g. Battery (3.7V Li-ion)"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Tissue Contact</label>
                <select
                  value={tissueContact}
                  onChange={e => setTissueContact(e.target.value)}
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Select…</option>
                  <option value="none">None</option>
                  <option value="intact_skin">Intact Skin</option>
                  <option value="breached">Breached / Mucosal</option>
                  <option value="blood">Blood Path</option>
                  <option value="implant">Implant</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Duration (ISO 10993)</label>
                <select
                  value={duration}
                  onChange={e => setDuration(e.target.value)}
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Select…</option>
                  <option value="transient">&le;24h (Transient)</option>
                  <option value="short">24h–30d (Short)</option>
                  <option value="long">&gt;30d (Long / Permanent)</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 h-10">
                  <input
                    type="checkbox"
                    checked={softwarePresent}
                    onChange={e => setSoftwarePresent(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm font-medium">Software Present</span>
                </label>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shadow Reviewer Scorecard Results */}
      {suggestMut.data && suggestMut.data.suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-purple-600" /> Predicate Intelligence — Shadow Reviewer
            </CardTitle>
            <CardDescription>
              {suggestMut.data.total_candidates_scanned} candidates scanned — showing top{' '}
              {suggestMut.data.suggestions.length} ranked by similarity + defense readiness
              {suggestMut.data.cached && (
                <Badge variant="outline" className="ml-2 text-xs">
                  cached
                </Badge>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {suggestMut.data.suggestions.map((s: PredicateSuggestion) => (
                <div
                  key={s.k_number}
                  className={`p-4 rounded-lg border ${
                    s.strategy_recommendation === 'AVOID'
                      ? 'border-red-300 bg-red-50/50'
                      : s.strategy_recommendation === 'CONSERVATIVE'
                        ? 'border-blue-200 bg-blue-50/30'
                        : s.strategy_recommendation === 'AGGRESSIVE'
                          ? 'border-purple-200 bg-purple-50/30'
                          : 'border-green-200 bg-green-50/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      {/* Header row */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-sm font-semibold">{s.k_number}</span>
                        <StrategyBadge
                          recommendation={s.strategy_recommendation as StrategyRecommendation}
                        />
                        {s.risk_flags?.map((f: any, idx: number) => {
                          const code = typeof f === 'string' ? f : f.code;
                          const sev = typeof f === 'string' ? 'MEDIUM' : f.severity;
                          const sevColor =
                            sev === 'HIGH'
                              ? 'text-red-700 border-red-300'
                              : sev === 'MEDIUM'
                                ? 'text-orange-700 border-orange-300'
                                : 'text-yellow-700 border-yellow-300';
                          return (
                            <Badge
                              key={`${code}-${idx}`}
                              variant="outline"
                              className={`text-[10px] ${sevColor}`}
                              title={typeof f === 'object' ? f.message : ''}
                            >
                              {code.replace(/_/g, ' ')}
                            </Badge>
                          );
                        })}
                      </div>
                      <p className="font-medium">{s.device_name}</p>
                      {s.applicant && (
                        <p className="text-sm text-muted-foreground">{s.applicant}</p>
                      )}
                      <p className="text-sm text-muted-foreground italic">{s.reasoning}</p>

                      {/* Match Snippets (B1) */}
                      {s.match_snippets && s.match_snippets.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase">
                            Matched Excerpts
                          </p>
                          {s.match_snippets.map(
                            (snip: { text: string; source: string }, i: number) => (
                              <div
                                key={i}
                                className="text-xs bg-muted/40 rounded px-2 py-1 border-l-2 border-purple-300"
                              >
                                &ldquo;{snip.text}&rdquo;
                              </div>
                            )
                          )}
                        </div>
                      )}

                      {/* Anticipated Objections (B3) */}
                      {s.anticipated_objections && s.anticipated_objections.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase">
                            Anticipated Objections ({s.anticipated_objections.length})
                          </p>
                          {s.anticipated_objections.slice(0, 3).map((obj: any, i: number) => (
                            <div
                              key={i}
                              className="text-xs rounded px-2 py-1 border bg-orange-50/50 border-orange-200"
                            >
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${
                                    obj.severity === 'High'
                                      ? 'text-red-700 border-red-300'
                                      : obj.severity === 'Med'
                                        ? 'text-orange-700 border-orange-300'
                                        : 'text-yellow-700 border-yellow-300'
                                  }`}
                                >
                                  {obj.severity}
                                </Badge>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {obj.trigger}
                                </span>
                              </div>
                              <p className="mt-0.5">{obj.question}</p>
                              <p className="text-muted-foreground mt-0.5">
                                Fix: {obj.recommended_fix}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right column: scores */}
                    <div className="text-right space-y-2 min-w-[120px]">
                      <div>
                        <div className="text-xs text-muted-foreground">Similarity</div>
                        <div className="text-lg font-bold">
                          {(s.similarity_score * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Defense Readiness</div>
                        <div
                          className={`text-lg font-bold ${
                            s.defense_readiness_score >= 70
                              ? 'text-green-600'
                              : s.defense_readiness_score >= 50
                                ? 'text-yellow-600'
                                : 'text-red-600'
                          }`}
                        >
                          {s.defense_readiness_score.toFixed(0)}/100
                        </div>
                      </div>
                      {/* F.1: Toxicity badge from safety signals */}
                      {s.toxicity_score != null && (
                        <div>
                          <div className="text-xs text-muted-foreground">Safety</div>
                          <button
                            type="button"
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => onToxicDetail?.(s.k_number)}
                            title="Click to view safety signal details"
                          >
                            <ToxicityBadge score={s.toxicity_score} badge={s.badge} />
                          </button>
                        </div>
                      )}
                      {s.decision_date && (
                        <div className="text-xs text-muted-foreground">{s.decision_date}</div>
                      )}
                      {s.recency_years != null && (
                        <div className="text-xs text-muted-foreground">
                          {s.recency_years.toFixed(1)}y ago
                        </div>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-2"
                        onClick={() => {
                          onSelectCandidate({
                            id: s.k_number,
                            program_id: programId,
                            k_number: s.k_number,
                            device_name: s.device_name,
                            manufacturer: s.applicant || '',
                            similarity_score: s.similarity_score,
                          } as any);
                        }}
                      >
                        Select <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scatter Plot Visualization (Similarity vs Toxicity) — Phase 6.6.D SVG Radar */}
      {sorted.length > 0 && (
        <PredicateRadarPlot
          candidates={sorted}
          selectedCandidate={sorted.find(c => c.id === selectedCandidateInTab) ?? null}
          onSelectCandidate={c => {
            setSelectedCandidateInTab(c.id);
            onSelectCandidate(c);
          }}
        />
      )}

      {/* Candidate Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Predicate Candidates
          </CardTitle>
          <CardDescription>
            {sorted.length} candidate(s) — sorted by recommendation and safety
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Radar className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No predicate candidates yet.</p>
              <p className="text-sm">Use the search above to find predicates automatically.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>K-Number</TableHead>
                  <TableHead>Device Name</TableHead>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>Similarity</TableHead>
                  <TableHead>Toxicity</TableHead>
                  <TableHead>Enforcements</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(c => (
                  <TableRow
                    key={c.id}
                    className={
                      c.toxicity_score > TOXICITY_THRESHOLDS.danger
                        ? 'bg-red-50/50'
                        : c.recommended
                          ? 'bg-green-50/30'
                          : ''
                    }
                  >
                    <TableCell>
                      {c.recommended && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Award className="h-4 w-4 text-green-600" />
                            </TooltipTrigger>
                            <TooltipContent>Recommended predicate</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{c.k_number}</TableCell>
                    <TableCell className="font-medium">{c.device_name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.manufacturer}</TableCell>
                    <TableCell>
                      <SimilarityBar score={c.similarity_score} />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => onToxicDetail?.(c.k_number)}
                        title="Click to view safety signal details"
                      >
                        <ToxicityBadge score={c.toxicity_score} />
                      </button>
                    </TableCell>
                    <TableCell>
                      {c.enforcement_events.length > 0 ? (
                        <Badge variant="destructive" className="text-xs">
                          {c.enforcement_events.length} event(s)
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => onSelectCandidate(c)}>
                        <Eye className="h-4 w-4 mr-1" /> Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SE Matrix Tab
// ═══════════════════════════════════════════════════════════════════════════════

function SEMatrixTab({
  programId,
  selectedCandidate,
}: {
  programId: string;
  selectedCandidate: PredicateCandidate | null;
}) {
  const candidateId = selectedCandidate?.id;
  const { data: rows, isLoading } = useSEMatrix(programId, candidateId);
  const generateMut = useGenerateSEMatrix(programId);
  const [subjectIntendedUse, setSubjectIntendedUse] = useState('');
  const [subjectTechnology, setSubjectTechnology] = useState('');
  const [subjectMaterials, setSubjectMaterials] = useState('');

  if (!selectedCandidate) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Select a predicate candidate from the Radar tab to view the SE Matrix.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const matrixRows = rows || [];
  const generatedRows = generateMut.data?.se_matrix_payload?.comparison_rows || [];
  const displayRows = generatedRows.length > 0 ? generatedRows : null;

  const handleGenerateSEMatrix = () => {
    generateMut.mutate({
      selected_predicate_k_number: selectedCandidate.k_number,
      subject_device: {
        device_name: selectedCandidate.device_name,
        intended_use: subjectIntendedUse,
        technology: subjectTechnology,
        materials: subjectMaterials,
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Selected candidate banner */}
      <Card>
        <CardContent className="pt-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Comparing against:</p>
            <p className="font-semibold">
              {selectedCandidate.k_number} — {selectedCandidate.device_name}
            </p>
            <p className="text-sm text-muted-foreground">{selectedCandidate.manufacturer}</p>
          </div>
          <div className="flex items-center gap-4">
            <ToxicityBadge score={selectedCandidate.toxicity_score} />
            <SimilarityBar score={selectedCandidate.similarity_score} />
          </div>
        </CardContent>
      </Card>

      {/* Auto-generate SE Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-purple-600" /> Auto-Generate SE Matrix
          </CardTitle>
          <CardDescription>
            Enter your subject device characteristics to auto-populate the SE comparison matrix with
            regulatory intelligence and evidence-linked cells.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Intended Use</label>
              <Input
                value={subjectIntendedUse}
                onChange={e => setSubjectIntendedUse(e.target.value)}
                placeholder="Indications for use"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Technology</label>
              <Input
                value={subjectTechnology}
                onChange={e => setSubjectTechnology(e.target.value)}
                placeholder="Technological characteristics"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Materials</label>
              <Input
                value={subjectMaterials}
                onChange={e => setSubjectMaterials(e.target.value)}
                placeholder="Materials of construction"
              />
            </div>
          </div>
          <Button onClick={handleGenerateSEMatrix} disabled={generateMut.isPending}>
            {generateMut.isPending ? (
              <>
                <Zap className="h-4 w-4 mr-2 animate-pulse" /> Generating…
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" /> Generate SE Matrix
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Generated SE Matrix readiness banner */}
      {generateMut.data && (
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-purple-800">Auto-Generated SE Matrix</p>
                <p className="text-sm text-purple-600 mt-1">
                  {generateMut.data.row_count} comparison rows •{' '}
                  {generateMut.data.discussion_required_count} require discussion
                </p>
              </div>
              <ReadinessMeter score={generateMut.data.defense_readiness_score / 100} size="sm" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Auto-generated SE comparison table (Phase 6.6.C) */}
      {displayRows && displayRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Generated Substantial Equivalence Matrix</CardTitle>
            <CardDescription>
              Evidence-linked comparison with regulatory intelligence — generated by Phase 6.6.C
              engine
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Characteristic</TableHead>
                  <TableHead>Subject Device</TableHead>
                  <TableHead className="w-10">Conf.</TableHead>
                  <TableHead>Predicate Device</TableHead>
                  <TableHead className="w-10">Conf.</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="max-w-xs">Discussion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.map((row: SEMatrixComparisonRow) => {
                  const StatusIcon = EQUIVALENCE_ICONS[row.equivalence_status] || AlertCircle;
                  return (
                    <TableRow key={row.sort_order}>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.sort_order}
                      </TableCell>
                      <TableCell className="font-medium">{row.characteristic}</TableCell>
                      <TableCell>{row.subject_value.value}</TableCell>
                      <TableCell>
                        <ConfidenceDot confidence={row.subject_value.confidence} />
                      </TableCell>
                      <TableCell>{row.predicate_value.value}</TableCell>
                      <TableCell>
                        <ConfidenceDot confidence={row.predicate_value.confidence} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={EQUIVALENCE_COLORS[row.equivalence_status] || ''}
                        >
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {row.equivalence_status.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={SEVERITY_COLORS[row.diff_severity] || ''}>
                          {row.diff_severity}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {row.discussion_text || '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Legacy SE comparison table (from stored data) */}
      <Card>
        <CardHeader>
          <CardTitle>Substantial Equivalence Matrix</CardTitle>
          <CardDescription>
            Side-by-side comparison of subject device vs. predicate device characteristics
          </CardDescription>
        </CardHeader>
        <CardContent>
          {matrixRows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No SE matrix data available yet.</p>
              <p className="text-sm mt-1">
                Use &quot;Generate 510(k) Preview&quot; to auto-populate.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Characteristic</TableHead>
                  <TableHead>Subject Device</TableHead>
                  <TableHead className="w-12 text-center">Conf.</TableHead>
                  <TableHead>Predicate Device</TableHead>
                  <TableHead className="w-12 text-center">Conf.</TableHead>
                  <TableHead className="w-40">Status</TableHead>
                  <TableHead>Difference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrixRows.map(row => {
                  const StatusIcon = EQUIVALENCE_ICONS[row.equivalence_status];
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.characteristic}</TableCell>
                      <TableCell>{row.subject_value}</TableCell>
                      <TableCell className="text-center">
                        <ConfidenceDot confidence={row.subject_confidence} />
                      </TableCell>
                      <TableCell>{row.predicate_value}</TableCell>
                      <TableCell className="text-center">
                        <ConfidenceDot confidence={row.predicate_confidence} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={EQUIVALENCE_COLORS[row.equivalence_status]}
                        >
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {row.equivalence_status.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.diff_explanation || '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  const color =
    confidence >= 0.8 ? 'bg-green-500' : confidence >= 0.5 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <div className={`h-3 w-3 rounded-full mx-auto ${color}`} />
        </TooltipTrigger>
        <TooltipContent>{(confidence * 100).toFixed(0)}% confidence</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Defense Meter Tab
// ═══════════════════════════════════════════════════════════════════════════════

function DefenseMeterTab({
  programId,
  selectedCandidate,
}: {
  programId: string;
  selectedCandidate: PredicateCandidate | null;
}) {
  const candidateId = selectedCandidate?.id;
  const { data: defense, isLoading } = useDefensePreview(programId, candidateId);
  const generateMut = useGenerateDefensePreview(programId);

  if (!selectedCandidate) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Select a predicate candidate from the Radar tab to view defense readiness.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleGenerate = () => {
    if (!candidateId) return;
    generateMut.mutate({
      candidate_id: candidateId,
      subject_device: {
        device_name: 'Subject Device',
        product_code: '',
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Defense Readiness Overview */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-8">
            <ReadinessMeter score={defense?.readiness_score ?? 0} />
            <div className="flex-1">
              <h3 className="text-lg font-semibold">Defense Readiness</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedCandidate.k_number} — {selectedCandidate.device_name}
              </p>
              {defense?.recommendation && (
                <p className="text-sm mt-3 p-3 rounded-md bg-muted">{defense.recommendation}</p>
              )}
              {!defense && (
                <Button className="mt-4" onClick={handleGenerate} disabled={generateMut.isPending}>
                  {generateMut.isPending ? (
                    <>
                      <Zap className="h-4 w-4 mr-2 animate-pulse" /> Generating…
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" /> Generate Defense Preview
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Anticipated FDA Questions */}
      {defense?.anticipated_questions && defense.anticipated_questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" /> Anticipated FDA Questions
            </CardTitle>
            <CardDescription>
              Questions the Shadow 510(k) Reviewer predicts FDA will raise
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {defense.anticipated_questions.map((q: AnticipatedQuestion, i: number) => (
                <div
                  key={i}
                  className={`p-4 rounded-lg border ${
                    q.severity === 'high'
                      ? 'border-red-200 bg-red-50/50'
                      : q.severity === 'medium'
                        ? 'border-yellow-200 bg-yellow-50/50'
                        : 'border-gray-200 bg-gray-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium">{q.question}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Category: {q.category} | Guidance: {q.fda_guidance_citation}
                      </p>
                      {q.suggested_evidence_types.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {q.suggested_evidence_types.map(t => (
                            <Badge key={t} variant="secondary" className="text-xs">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Badge
                      variant={
                        q.severity === 'high'
                          ? 'destructive'
                          : q.severity === 'medium'
                            ? 'default'
                            : 'secondary'
                      }
                    >
                      {q.severity}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Evidence Gaps */}
      {defense?.evidence_gaps && defense.evidence_gaps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" /> Evidence Gaps
            </CardTitle>
            <CardDescription>Missing evidence that needs to be addressed</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Missing Evidence</TableHead>
                  <TableHead>Impact</TableHead>
                  <TableHead>Suggestion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {defense.evidence_gaps.map((gap: EvidenceGap, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{gap.category}</TableCell>
                    <TableCell>{gap.missing_evidence}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          gap.impact === 'high'
                            ? 'destructive'
                            : gap.impact === 'medium'
                              ? 'default'
                              : 'secondary'
                        }
                      >
                        {gap.impact}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {gap.suggestion}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Toxic Detail Drill-Down Dialog (Phase 6.6.F)
// ═══════════════════════════════════════════════════════════════════════════════

function ToxicDetailDialog({
  programId,
  kNumber,
  onClose,
}: {
  programId: string;
  kNumber: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useToxicDetail(programId, kNumber);

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Safety Signal Details — <span className="font-mono">{kNumber}</span>
          </DialogTitle>
          <DialogDescription>
            Detailed toxicity breakdown and safety signal citations for this predicate.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3 py-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-sm text-muted-foreground py-4">
            Failed to load toxic detail for {kNumber}.
          </p>
        )}

        {data && (
          <div className="space-y-4 py-2">
            {/* Summary badges */}
            <div className="flex items-center gap-3 flex-wrap">
              <ToxicityBadge score={data.toxicity_score} badge={data.badge} />
              <Badge variant="outline" className="text-xs">
                MDR: {data.mdr_rate_bucket}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Family Recalls: {data.family_recall_count}
              </Badge>
            </div>

            {/* Toxic reasons */}
            {data.toxic_because.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Why this predicate is flagged
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-sm">
                  {data.toxic_because.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Signal citations */}
            {data.signals.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Safety Signals ({data.signals.length})
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Severity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.signals.map((sig, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {sig.signal_type.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {sig.signal_date || '—'}
                        </TableCell>
                        <TableCell className="text-sm max-w-xs truncate">
                          {sig.description}
                          {sig.recall_number && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              (#{sig.recall_number})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`text-sm font-medium ${
                              sig.severity_score >= 0.7
                                ? 'text-red-600'
                                : sig.severity_score >= 0.4
                                  ? 'text-orange-600'
                                  : 'text-yellow-600'
                            }`}
                          >
                            {(sig.severity_score * 100).toFixed(0)}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {data.signals.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No safety signals on record for this device.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════════

interface PredicateIntelligencePageProps {
  programId?: string;
}

export default function PredicateIntelligencePage({
  programId: propProgramId,
}: PredicateIntelligencePageProps) {
  const urlProgramId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('program_id') || '';
  }, []);

  const [inputProgramId, setInputProgramId] = useState('');
  const programId = propProgramId || urlProgramId || inputProgramId;
  const [selectedCandidate, setSelectedCandidate] = useState<PredicateCandidate | null>(null);
  const [toxicDetailK, setToxicDetailK] = useState<string | null>(null);

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Toxic Detail Drill-Down Dialog (F.1) */}
      {toxicDetailK && (
        <ToxicDetailDialog
          programId={programId}
          kNumber={toxicDetailK}
          onClose={() => setToxicDetailK(null)}
        />
      )}
      {/* Header + Proof Strip (top-right) */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Radar className="h-6 w-6" /> Predicate Intelligence
          </h1>
          <p className="text-muted-foreground mt-1">
            Find the safest, most defensible predicate — not just the most similar. Toxic Predicate
            Detection + Shadow 510(k) Review + Defense Readiness Scoring.
          </p>
        </div>
        {/* E1: Proof Strip — zero-drift compliance badges (top-right) */}
        {programId && (
          <div className="flex-shrink-0">
            <ProofStrip programId={programId} subjectHash={selectedCandidate?.k_number || ''} />
          </div>
        )}
      </div>

      {/* Program ID selector (fallback if no prop or URL param) */}
      {!propProgramId && !urlProgramId && (
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium">Program ID</label>
              <Input
                value={inputProgramId}
                onChange={e => setInputProgramId(e.target.value)}
                placeholder="Enter program UUID…"
              />
            </div>
            <Button variant="outline" disabled={!inputProgramId}>
              <ArrowRight className="h-4 w-4 mr-1" /> Load
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Summary stats */}
      {programId && <SummaryCards programId={programId} selectedCandidate={selectedCandidate} />}

      {/* Main Tabs */}
      {programId && (
        <Tabs defaultValue="radar">
          <TabsList>
            <TabsTrigger value="radar" className="flex items-center gap-1">
              <Target className="h-4 w-4" /> Predicate Radar
            </TabsTrigger>
            <TabsTrigger value="strategy" className="flex items-center gap-1">
              <Zap className="h-4 w-4" /> Strategy Engine
            </TabsTrigger>
            <TabsTrigger value="se-matrix" className="flex items-center gap-1">
              <FileText className="h-4 w-4" /> SE Matrix
            </TabsTrigger>
            <TabsTrigger value="defense" className="flex items-center gap-1">
              <Shield className="h-4 w-4" /> Defense Meter
            </TabsTrigger>
            <TabsTrigger value="se-matrix-v2" className="flex items-center gap-1">
              <FileText className="h-4 w-4" /> SE Matrix V2
            </TabsTrigger>
            <TabsTrigger value="defense-packet" className="flex items-center gap-1">
              <Package className="h-4 w-4" /> Defense Packet
            </TabsTrigger>
            <TabsTrigger value="lineage" className="flex items-center gap-1">
              <GitBranch className="h-4 w-4" /> Lineage
            </TabsTrigger>
          </TabsList>

          <TabsContent value="radar" className="mt-4">
            <PredicateRadarTab
              programId={programId}
              onSelectCandidate={setSelectedCandidate}
              onToxicDetail={setToxicDetailK}
            />
          </TabsContent>

          <TabsContent value="strategy" className="mt-4">
            <StrategyTab programId={programId} onSelectCandidate={setSelectedCandidate} />
          </TabsContent>

          <TabsContent value="se-matrix" className="mt-4">
            <SEMatrixTab programId={programId} selectedCandidate={selectedCandidate} />
          </TabsContent>

          <TabsContent value="defense" className="mt-4">
            <DefenseMeterTab programId={programId} selectedCandidate={selectedCandidate} />
          </TabsContent>

          <TabsContent value="se-matrix-v2" className="mt-4">
            <SEMatrixV2Panel programId={programId} predicateKNumber={selectedCandidate?.k_number} />
          </TabsContent>

          <TabsContent value="defense-packet" className="mt-4">
            <DefensePacketPanel
              programId={programId}
              predicateKNumber={selectedCandidate?.k_number}
              initialSubjectDevice={{}}
            />
          </TabsContent>

          <TabsContent value="lineage" className="mt-4">
            {selectedCandidate?.k_number ? (
              <LineageGraphPanel programId={programId} kNumber={selectedCandidate.k_number} />
            ) : (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">
                    <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Select a predicate candidate to view its family lineage.</p>
                    <p className="text-sm mt-1">
                      Use the Predicate Radar or Strategy Engine tab to select a candidate first.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy Tab (Phase 6.6.B — Dedicated Strategy Engine UI)
// ═══════════════════════════════════════════════════════════════════════════════

function StrategyTab({
  programId,
  onSelectCandidate,
}: {
  programId: string;
  onSelectCandidate: (c: PredicateCandidate) => void;
}) {
  const suggestMut = useSuggestPredicates(programId);
  const [productCode, setProductCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [intendedUse, setIntendedUse] = useState('');
  const [technology, setTechnology] = useState('');
  const [materials, setMaterials] = useState('');
  const [energySource, setEnergySource] = useState('');
  const [tissueContact, setTissueContact] = useState('');
  const [duration, setDuration] = useState('');
  const [softwarePresent, setSoftwarePresent] = useState(false);
  const [sterilization, setSterilization] = useState('');
  const [patientPopulation, setPatientPopulation] = useState('');

  const handleSuggest = useCallback(() => {
    if (!productCode.trim() || !deviceName.trim() || !intendedUse.trim() || !technology.trim()) {
      return;
    }
    const materialList = materials
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
    suggestMut.mutate({
      product_code: productCode,
      device_name: deviceName,
      intended_use: intendedUse,
      technology_description: technology,
      materials: materialList.length ? materialList : undefined,
      energy_source: energySource || undefined,
      tissue_contact: tissueContact || undefined,
      duration: duration || undefined,
      software_present: softwarePresent || undefined,
      sterilization: sterilization || undefined,
      patient_population: patientPopulation || undefined,
    });
  }, [
    productCode,
    deviceName,
    intendedUse,
    technology,
    materials,
    energySource,
    tissueContact,
    duration,
    softwarePresent,
    sterilization,
    patientPopulation,
    suggestMut,
  ]);

  return (
    <div className="space-y-6">
      {/* Strategy input form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-purple-600" /> Regulatory Strategy Engine
          </CardTitle>
          <CardDescription>
            Enter your subject device details to find the safest, most defensible predicate. The
            strategy engine scores predicates on similarity, defense readiness, and objection risk.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Product Code *</label>
              <Input
                value={productCode}
                onChange={e => setProductCode(e.target.value)}
                placeholder="e.g. DQA, NBW, QKQ"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Device Name *</label>
              <Input
                value={deviceName}
                onChange={e => setDeviceName(e.target.value)}
                placeholder="e.g. Spinal Fusion Cage"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Intended Use *</label>
              <Input
                value={intendedUse}
                onChange={e => setIntendedUse(e.target.value)}
                placeholder="Continuous monitoring of blood glucose levels in adults"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Technology Description *</label>
              <Input
                value={technology}
                onChange={e => setTechnology(e.target.value)}
                placeholder="e.g. Titanium interbody cage for spinal fusion"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Materials</label>
              <Input
                value={materials}
                onChange={e => setMaterials(e.target.value)}
                placeholder="e.g. Titanium alloy, PEEK"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Energy Source</label>
              <Input
                value={energySource}
                onChange={e => setEnergySource(e.target.value)}
                placeholder="e.g. Battery 3.7V"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Tissue Contact</label>
              <select
                value={tissueContact}
                onChange={e => setTissueContact(e.target.value)}
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Select…</option>
                <option value="none">None</option>
                <option value="intact_skin">Intact Skin</option>
                <option value="breached">Breached / Mucosal</option>
                <option value="blood">Blood Path</option>
                <option value="implant">Implant</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Duration (ISO 10993)</label>
              <select
                value={duration}
                onChange={e => setDuration(e.target.value)}
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Select…</option>
                <option value="transient">≤24h (Transient)</option>
                <option value="short">24h–30d (Short)</option>
                <option value="long">&gt;30d (Long / Permanent)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Sterilization</label>
              <select
                value={sterilization}
                onChange={e => setSterilization(e.target.value)}
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Select…</option>
                <option value="EO">EO (Ethylene Oxide)</option>
                <option value="gamma">Gamma Irradiation</option>
                <option value="steam">Steam (Autoclave)</option>
                <option value="ebeam">E-Beam</option>
                <option value="none">None / Non-sterile</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Patient Population</label>
              <Input
                value={patientPopulation}
                onChange={e => setPatientPopulation(e.target.value)}
                placeholder="e.g. Adult, Pediatric, Geriatric"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 h-10">
                <input
                  type="checkbox"
                  checked={softwarePresent}
                  onChange={e => setSoftwarePresent(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium">Software Present</span>
              </label>
            </div>
          </div>
          <Button
            onClick={handleSuggest}
            disabled={
              !productCode.trim() ||
              !deviceName.trim() ||
              !intendedUse.trim() ||
              !technology.trim() ||
              suggestMut.isPending
            }
            className="bg-purple-600 hover:bg-purple-700"
          >
            {suggestMut.isPending ? (
              <>
                <Zap className="h-4 w-4 mr-2 animate-pulse" /> Analyzing Predicates…
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" /> Run Strategy Analysis
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Strategy results */}
      {suggestMut.data && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold">{suggestMut.data.total_candidates_scanned}</p>
                <p className="text-sm text-muted-foreground">Scanned</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-green-600">
                  {
                    suggestMut.data.suggestions.filter(
                      s =>
                        s.strategy_recommendation === 'BALANCED' ||
                        s.strategy_recommendation === 'CONSERVATIVE'
                    ).length
                  }
                </p>
                <p className="text-sm text-muted-foreground">Safe Options</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-red-600">
                  {
                    suggestMut.data.suggestions.filter(s => s.strategy_recommendation === 'AVOID')
                      .length
                  }
                </p>
                <p className="text-sm text-muted-foreground">Avoid</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-purple-600">
                  {suggestMut.data.suggestions.length}
                </p>
                <p className="text-sm text-muted-foreground">Suggestions</p>
              </CardContent>
            </Card>
          </div>

          {/* Ranked suggestions */}
          <Card>
            <CardHeader>
              <CardTitle>Ranked Predicate Suggestions</CardTitle>
              <CardDescription>Sorted by similarity score. Higher is better.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>K-Number</TableHead>
                    <TableHead>Device Name</TableHead>
                    <TableHead>Strategy</TableHead>
                    <TableHead>Similarity</TableHead>
                    <TableHead>DRS</TableHead>
                    <TableHead>Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestMut.data.suggestions.map((s: PredicateSuggestion, idx: number) => (
                    <TableRow
                      key={s.k_number}
                      className={
                        s.strategy_recommendation === 'AVOID'
                          ? 'bg-red-50/50'
                          : idx === 0
                            ? 'bg-green-50/30'
                            : ''
                      }
                    >
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-semibold">
                        {s.k_number}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{s.device_name}</p>
                          {s.applicant && (
                            <p className="text-xs text-muted-foreground">{s.applicant}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StrategyBadge
                          recommendation={s.strategy_recommendation as StrategyRecommendation}
                        />
                      </TableCell>
                      <TableCell>
                        <SimilarityBar score={s.similarity_score} />
                      </TableCell>
                      <TableCell>
                        <span
                          className={`font-mono text-sm ${
                            s.defense_readiness_score >= 70
                              ? 'text-green-700'
                              : s.defense_readiness_score >= 40
                                ? 'text-amber-600'
                                : 'text-red-600'
                          }`}
                        >
                          {s.defense_readiness_score?.toFixed(0) ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {s.similarity_score.toFixed(3)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Defense Packet Seed — enterprise-grade evidence fix list */}
          {suggestMut.data.defense_packet_seed?.tasks?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-600" /> Defense Packet Seed
                  <Badge variant="outline" className="text-[10px] ml-2">
                    Readiness: {suggestMut.data.defense_packet_seed.readiness_score}/100
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Machine-readable evidence fix list — bridges predicate ranking to regulatory
                  workflow.
                  {suggestMut.data.defense_packet_seed.top_risks?.length > 0 && (
                    <span className="ml-2">
                      Top risks:{' '}
                      {suggestMut.data.defense_packet_seed.top_risks.map((r: string, i: number) => (
                        <Badge key={i} variant="destructive" className="text-[9px] ml-1">
                          {r}
                        </Badge>
                      ))}
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {suggestMut.data.defense_packet_seed.tasks.map((task: any) => (
                    <div key={task.task_id} className="p-3 rounded-md border bg-muted/30">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant={
                            task.severity === 'HIGH'
                              ? 'destructive'
                              : task.severity === 'MEDIUM'
                                ? 'default'
                                : 'secondary'
                          }
                          className="text-[10px] shrink-0"
                        >
                          {task.severity}
                        </Badge>
                        <span className="font-mono text-xs text-blue-600 shrink-0">
                          [{task.category}]
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {task.trigger}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">{task.rationale}</p>
                      {task.recommended_artifacts?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {task.recommended_artifacts.map((art: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[9px]">
                              {art}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Reasoning details */}
          <Card>
            <CardHeader>
              <CardTitle>Strategy Reasoning</CardTitle>
              <CardDescription>
                Detailed regulatory reasoning for each predicate suggestion.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {suggestMut.data.suggestions.map((s: PredicateSuggestion) => (
                  <div key={s.k_number} className="p-3 rounded-md border bg-muted/30">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-semibold">{s.k_number}</span>
                      <StrategyBadge
                        recommendation={s.strategy_recommendation as StrategyRecommendation}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground italic">{s.reasoning}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Empty state */}
      {!suggestMut.data && !suggestMut.isPending && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <Zap className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Enter your device details above and run the strategy analysis.</p>
              <p className="text-sm mt-1">
                The engine evaluates predicate safety, regulatory history, and lineage risk.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Summary Cards
// ═══════════════════════════════════════════════════════════════════════════════

function SummaryCards({
  programId,
  selectedCandidate,
}: {
  programId: string;
  selectedCandidate: PredicateCandidate | null;
}) {
  const { data: candidates } = useCandidates(programId);
  const total = candidates?.length ?? 0;
  const safe = candidates?.filter(c => c.toxicity_score <= TOXICITY_THRESHOLDS.safe).length ?? 0;
  const toxic = candidates?.filter(c => c.toxicity_score > TOXICITY_THRESHOLDS.danger).length ?? 0;
  const recommended = candidates?.filter(c => c.recommended).length ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-3xl font-bold">{total}</p>
          <p className="text-sm text-muted-foreground">Total Candidates</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-3xl font-bold text-green-600">{safe}</p>
          <p className="text-sm text-muted-foreground">Safe Predicates</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-3xl font-bold text-red-600">{toxic}</p>
          <p className="text-sm text-muted-foreground">Toxic Predicates</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 text-center">
          {selectedCandidate ? (
            <ReadinessMeter score={0} size="sm" />
          ) : (
            <p className="text-3xl font-bold text-blue-600">{recommended}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {selectedCandidate ? 'Defense Ready' : 'Recommended'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
