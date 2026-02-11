/**
 * Phase 6.6.C-V2 — Evidence-Linked SE Matrix Panel
 *
 * Shows the V2 SE matrix with:
 *   - Subject device form (pre-filled if available)
 *   - Generate button → risk_code + evidence_task_ids
 *   - Comparison rows table with diff_flag badges
 *   - Evidence tasks checklist sorted by severity
 *   - Defense readiness score gauge
 *   - Download V2 DOCX button
 *
 * @phase 6.6.C
 */

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  Download,
  Play,
  FileText,
  Shield,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import {
  useGenerateSEMatrixV2,
  useRenderSEDocxV2,
  useReplayDeterminism,
} from '@/hooks/use-predicate-intelligence';
import type { ReplayDeterminismResult } from '../../../shared/types/predicate-intelligence';
import type {
  SEMatrixRowV2,
  EvidenceTaskV2,
  GenerateSEMatrixV2Response,
  DiffFlagV2,
  RiskCode,
} from '../../../shared/types/predicate-intelligence';
import { RISK_CODE_LABELS, RISK_CODES_LOCK_HASH } from '../../../shared/types/generated';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const DIFF_FLAG_STYLES: Record<DiffFlagV2, string> = {
  EQUIVALENT: 'bg-green-100 text-green-800 border-green-200',
  DISCUSSION_REQUIRED: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  SIGNIFICANT: 'bg-red-100 text-red-800 border-red-200',
};

const DIFF_FLAG_ICONS: Record<DiffFlagV2, typeof CheckCircle> = {
  EQUIVALENT: CheckCircle,
  DISCUSSION_REQUIRED: AlertCircle,
  SIGNIFICANT: AlertTriangle,
};

const SEVERITY_STYLES: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  LOW: 'bg-blue-100 text-blue-800',
};

const SE_FIELDS = [
  { key: 'intended_use', label: 'Intended Use' },
  { key: 'technology', label: 'Technology' },
  { key: 'materials', label: 'Materials' },
  { key: 'energy_source', label: 'Energy Source' },
  { key: 'sterilization', label: 'Sterilization' },
  { key: 'biocompatibility', label: 'Biocompatibility' },
  { key: 'software', label: 'Software/Firmware' },
  { key: 'performance', label: 'Performance' },
  { key: 'general', label: 'Labeling / General' },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

function ReadinessGauge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600';
  const bgColor = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 100 100" className="transform -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeDasharray={`${score * 2.51} 251`}
            className={color}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-2xl font-bold ${color}`}>{score}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 text-sm">
        <Shield className="h-4 w-4" />
        <span className="font-medium">Defense Readiness</span>
      </div>
      <div className={`h-1.5 w-32 rounded-full bg-gray-200`}>
        <div className={`h-full rounded-full ${bgColor}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function DiffFlagBadge({ flag }: { flag: DiffFlagV2 }) {
  const Icon = DIFF_FLAG_ICONS[flag];
  return (
    <Badge variant="outline" className={`${DIFF_FLAG_STYLES[flag]} text-xs`}>
      <Icon className="h-3 w-3 mr-1" />
      {flag.replace(/_/g, ' ')}
    </Badge>
  );
}

function RiskCodeBadge({ code }: { code: RiskCode | null }) {
  if (!code) return null;
  const label = RISK_CODE_LABELS[code as keyof typeof RISK_CODE_LABELS];
  return (
    <Badge variant="secondary" className="text-xs font-mono" title={label || code}>
      {code}
    </Badge>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

interface SEMatrixV2PanelProps {
  programId: string;
  predicateKNumber?: string;
  initialSubjectDevice?: Record<string, string>;
}

export function SEMatrixV2Panel({
  programId,
  predicateKNumber = '',
  initialSubjectDevice = {},
}: SEMatrixV2PanelProps) {
  const [kNumber, setKNumber] = useState(predicateKNumber);
  const [subjectDevice, setSubjectDevice] = useState<Record<string, string>>(initialSubjectDevice);
  const [result, setResult] = useState<GenerateSEMatrixV2Response | null>(null);

  const generateMutation = useGenerateSEMatrixV2();
  const renderDocxMutation = useRenderSEDocxV2();
  const replayMutation = useReplayDeterminism(programId);
  const [replayResult, setReplayResult] = useState<ReplayDeterminismResult | null>(null);

  const handleFieldChange = useCallback((key: string, value: string) => {
    setSubjectDevice(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleGenerate = useCallback(() => {
    if (!kNumber.trim()) return;
    generateMutation.mutate(
      {
        program_id: programId,
        selected_predicate_k_number: kNumber.trim(),
        subject_device: subjectDevice,
      },
      {
        onSuccess: data => setResult(data),
      }
    );
  }, [programId, kNumber, subjectDevice, generateMutation]);

  const handleDownloadDocx = useCallback(() => {
    if (!kNumber.trim()) return;
    renderDocxMutation.mutate(
      {
        program_id: programId,
        selected_predicate_k_number: kNumber.trim(),
        subject_device: subjectDevice,
      },
      {
        onSuccess: ({ blob, filename }) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
        },
      }
    );
  }, [programId, kNumber, subjectDevice, renderDocxMutation]);

  const payload = result?.se_matrix_payload;

  return (
    <div className="space-y-6">
      {/* Header + Generate */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Evidence-Linked SE Matrix (V2)
          </CardTitle>
          <CardDescription>
            Deterministic risk_code analysis with evidence_task_ids linkage. Generates 9 SE
            comparison rows, assigns canonical risk codes, and produces a deterministic evidence
            task checklist.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Predicate K-Number */}
          <div>
            <Label htmlFor="kNumber">Predicate K-Number</Label>
            <Input
              id="kNumber"
              placeholder="e.g. K123456"
              value={kNumber}
              onChange={e => setKNumber(e.target.value)}
              className="mt-1 max-w-xs"
            />
          </div>

          {/* Subject Device Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {SE_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <Label htmlFor={`se-${key}`} className="text-xs">
                  {label}
                </Label>
                <Input
                  id={`se-${key}`}
                  placeholder={label}
                  value={subjectDevice[key] || ''}
                  onChange={e => handleFieldChange(key, e.target.value)}
                  className="mt-1 text-sm"
                />
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button
              onClick={handleGenerate}
              disabled={!kNumber.trim() || generateMutation.isPending}
            >
              <Play className="h-4 w-4 mr-1" />
              {generateMutation.isPending ? 'Generating...' : 'Generate SE Matrix V2'}
            </Button>

            {payload && (
              <Button
                variant="outline"
                onClick={handleDownloadDocx}
                disabled={renderDocxMutation.isPending}
              >
                <Download className="h-4 w-4 mr-1" />
                {renderDocxMutation.isPending ? 'Rendering...' : 'Download V2 DOCX'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error states */}
      {generateMutation.isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <p className="text-sm text-red-800">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              {(generateMutation.error as Error)?.message || 'Generation failed'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {payload && result && (
        <>
          {/* Summary Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4 text-center">
                <ReadinessGauge score={result.defense_readiness_score} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold">{result.row_count}</p>
                <p className="text-xs text-muted-foreground">SE Rows</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-yellow-600">
                  {result.discussion_required_count}
                </p>
                <p className="text-xs text-muted-foreground">Discussion Required</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-red-600">{result.significant_count}</p>
                <p className="text-xs text-muted-foreground">Significant Diff</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-blue-600">{result.evidence_task_count}</p>
                <p className="text-xs text-muted-foreground">Evidence Tasks</p>
              </CardContent>
            </Card>
          </div>

          {/* Comparison Matrix Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Comparison Matrix</CardTitle>
              <CardDescription>
                Predicate: {payload.predicate_k_number} — {payload.predicate_device_name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Characteristic</TableHead>
                      <TableHead>Subject Device</TableHead>
                      <TableHead>Predicate</TableHead>
                      <TableHead className="w-[120px]">Status</TableHead>
                      <TableHead className="w-[130px]">Risk Code</TableHead>
                      <TableHead className="w-[60px]">Tasks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payload.comparison_rows.map((row: SEMatrixRowV2, idx: number) => (
                      <TableRow
                        key={idx}
                        className={
                          row.diff_flag === 'SIGNIFICANT'
                            ? 'bg-red-50'
                            : row.diff_flag === 'DISCUSSION_REQUIRED'
                              ? 'bg-yellow-50'
                              : ''
                        }
                      >
                        <TableCell className="font-medium text-sm">{row.characteristic}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">
                          {row.subject_value || '—'}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">
                          {row.predicate_value || '—'}
                        </TableCell>
                        <TableCell>
                          <DiffFlagBadge flag={row.diff_flag} />
                        </TableCell>
                        <TableCell>
                          <RiskCodeBadge code={row.risk_code} />
                        </TableCell>
                        <TableCell className="text-center">
                          {row.evidence_task_ids.length > 0 ? (
                            <Badge variant="secondary" className="text-xs">
                              {row.evidence_task_ids.length}
                            </Badge>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Evidence Tasks */}
          {payload.evidence_tasks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Evidence Tasks</CardTitle>
                <CardDescription>
                  Deterministic evidence checklist sorted by severity. Each task links to specific
                  risk codes in the matrix above.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {payload.evidence_tasks.map((task: EvidenceTaskV2) => (
                    <div
                      key={task.task_id}
                      className="flex items-start gap-3 rounded-md border p-3"
                    >
                      <Badge
                        className={`${SEVERITY_STYLES[task.severity] || 'bg-gray-100'} text-xs shrink-0`}
                      >
                        {task.severity}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{task.label}</span>
                          <Badge variant="outline" className="text-xs font-mono">
                            {task.risk_code}
                          </Badge>
                          <span className="text-xs text-muted-foreground font-mono">
                            [{task.task_id}]
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Category: {task.category} | eCTD: {task.mapping.ectd_section}
                        </p>
                        {task.recommended_artifacts.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {task.recommended_artifacts.map((art: string) => (
                              <Badge key={art} variant="outline" className="text-xs">
                                {art}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* E2: Replay Determinism + Metadata footer */}
          <div className="flex flex-col gap-3">
            {/* Replay Determinism — the mic drop */}
            {result.manifest_hash && (
              <div className="flex items-center gap-3">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={replayMutation.isPending}
                        data-testid="replay-determinism-btn"
                        onClick={() => {
                          setReplayResult(null);
                          replayMutation.mutate(
                            {
                              productCode: payload.comparison_rows?.[0]?.product_code || '',
                              subjectDevice: subjectDevice,
                              selectedPredicate: { k_number: kNumber },
                              originalManifestHash: result.manifest_hash!,
                            },
                            { onSuccess: data => setReplayResult(data) }
                          );
                        }}
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 mr-1.5 ${replayMutation.isPending ? 'animate-spin' : ''}`}
                        />
                        {replayMutation.isPending ? 'Replaying…' : 'Replay / Verify Determinism'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs max-w-xs">
                        Re-submits the same inputs and asserts identical manifest hash, risk vocab
                        hash, and triggered risk codes. Converts "trust me" into "watch it verify
                        itself."
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Replay result badge */}
                {replayResult && (
                  <Badge
                    variant="outline"
                    data-testid="replay-result-badge"
                    className={
                      replayResult.deterministic
                        ? 'bg-green-100 text-green-800 border-green-300'
                        : 'bg-red-100 text-red-800 border-red-300 animate-pulse'
                    }
                  >
                    {replayResult.deterministic ? (
                      <>
                        <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Deterministic — Verified
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="h-3.5 w-3.5 mr-1" /> RED DRIFT DETECTED
                      </>
                    )}
                  </Badge>
                )}

                {replayMutation.isError && (
                  <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
                    Replay failed: {replayMutation.error?.message?.slice(0, 60) || 'unknown error'}
                  </Badge>
                )}
              </div>
            )}

            {/* Drift detail lines (if any) */}
            {replayResult &&
              !replayResult.deterministic &&
              replayResult.drift_details.length > 0 && (
                <div
                  className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800 space-y-1"
                  data-testid="drift-details"
                >
                  <p className="font-semibold">
                    ⚠ Drift detected — downloads blocked until resolved:
                  </p>
                  {replayResult.drift_details.map((d, i) => (
                    <p key={i} className="font-mono text-[11px]">
                      • {d}
                    </p>
                  ))}
                </div>
              )}

            {/* Metadata row */}
            <div className="text-xs text-muted-foreground flex gap-4 flex-wrap">
              <span>Version: {payload.version}</span>
              <span>Risk Map: {result.risk_code_map_version}</span>
              <span>Lock: {RISK_CODES_LOCK_HASH.slice(0, 12)}…</span>
              <span>Generated: {new Date(result.generation_timestamp).toLocaleString()}</span>
              <span>Standard: {payload.regulatory_standard}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
