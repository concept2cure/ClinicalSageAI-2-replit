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
} from 'lucide-react';
import {
  useCandidates,
  useCreateCandidate,
  useAnalyze,
  useSEMatrix,
  useDefensePreview,
  useGenerateDefensePreview,
} from '@/hooks/use-predicate-intelligence';
import type {
  PredicateCandidate,
  EquivalenceStatus,
  AnticipatedQuestion,
  EvidenceGap,
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
};

const EQUIVALENCE_ICONS: Record<EquivalenceStatus, typeof CheckCircle> = {
  EQUIVALENT: CheckCircle,
  DISCUSSION_REQUIRED: AlertCircle,
  NOT_EQUIVALENT: XCircle,
  TOXIC: AlertTriangle,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Components
// ═══════════════════════════════════════════════════════════════════════════════

function ToxicityBadge({ score }: { score: number }) {
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
}: {
  programId: string;
  onSelectCandidate: (c: PredicateCandidate) => void;
}) {
  const { data: candidates, isLoading } = useCandidates(programId);
  const analyzeMut = useAnalyze(programId);
  const addMut = useCreateCandidate(programId);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchDevice, setSearchDevice] = useState('');
  const [searchCode, setSearchCode] = useState('');
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
  }, [searchDevice, searchCode, analyzeMut]);

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
      {/* Search bar — device similarity analyzer */}
      <Card>
        <CardContent className="pt-6">
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
            <Button onClick={handleAnalyze} disabled={!searchDevice.trim() || analyzeMut.isPending}>
              {analyzeMut.isPending ? (
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
        </CardContent>
      </Card>

      {/* Scatter Plot Visualization (Similarity vs Toxicity) */}
      {sorted.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" /> Predicate Radar
            </CardTitle>
            <CardDescription>
              Similarity (X) vs. Safety (Y). Green = recommended. Red = toxic. Click a point for
              details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative w-full h-64 border rounded-lg bg-muted/10 overflow-hidden">
              {/* Axis labels */}
              <span className="absolute bottom-1 right-2 text-[10px] text-muted-foreground">
                Similarity →
              </span>
              <span className="absolute top-1 left-2 text-[10px] text-muted-foreground">
                ← Safe
              </span>
              <span className="absolute bottom-1 left-2 text-[10px] text-muted-foreground">
                Toxic →
              </span>
              {/* Quadrant shading */}
              <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-green-50/50" />
              <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-red-50/50" />
              {/* Data points */}
              {sorted.map(c => {
                const x = c.similarity_score * 100;
                const y = (1 - c.toxicity_score) * 100; // invert: low toxicity = top
                const dotColor = c.recommended
                  ? 'bg-green-500 ring-green-300'
                  : c.toxicity_score > TOXICITY_THRESHOLDS.danger
                    ? 'bg-red-500 ring-red-300'
                    : c.toxicity_score > TOXICITY_THRESHOLDS.caution
                      ? 'bg-orange-400 ring-orange-200'
                      : 'bg-yellow-400 ring-yellow-200';
                return (
                  <TooltipProvider key={c.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className={`absolute w-4 h-4 rounded-full ring-2 cursor-pointer hover:scale-125 transition-transform ${dotColor}`}
                          style={{
                            left: `calc(${x}% - 8px)`,
                            bottom: `calc(${y}% - 8px)`,
                          }}
                          onClick={() => onSelectCandidate(c)}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                          <p className="font-semibold">{c.device_name}</p>
                          <p>
                            {c.k_number} — {c.manufacturer}
                          </p>
                          <p>
                            Similarity: {(c.similarity_score * 100).toFixed(0)}% | Toxicity:{' '}
                            {(c.toxicity_score * 100).toFixed(0)}%
                          </p>
                          {c.enforcement_events.length > 0 && (
                            <p className="text-red-600">
                              ⚠ {c.enforcement_events.length} enforcement event(s)
                            </p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          </CardContent>
        </Card>
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
                      <ToxicityBadge score={c.toxicity_score} />
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

      {/* SE comparison table */}
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

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Radar className="h-6 w-6" /> Predicate Intelligence
        </h1>
        <p className="text-muted-foreground mt-1">
          Find the safest, most defensible predicate — not just the most similar. Toxic Predicate
          Detection + Shadow 510(k) Review + Defense Readiness Scoring.
        </p>
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
            <TabsTrigger value="se-matrix" className="flex items-center gap-1">
              <FileText className="h-4 w-4" /> SE Matrix
            </TabsTrigger>
            <TabsTrigger value="defense" className="flex items-center gap-1">
              <Shield className="h-4 w-4" /> Defense Meter
            </TabsTrigger>
          </TabsList>

          <TabsContent value="radar" className="mt-4">
            <PredicateRadarTab programId={programId} onSelectCandidate={setSelectedCandidate} />
          </TabsContent>

          <TabsContent value="se-matrix" className="mt-4">
            <SEMatrixTab programId={programId} selectedCandidate={selectedCandidate} />
          </TabsContent>

          <TabsContent value="defense" className="mt-4">
            <DefenseMeterTab programId={programId} selectedCandidate={selectedCandidate} />
          </TabsContent>
        </Tabs>
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
