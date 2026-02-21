/**
 * Phase 6.6.D — Defense Packet Builder Panel ("Reviewer Simulator")
 *
 * The "holy sh*t" demo panel:
 *   1. Build deterministic defense packet from manifest
 *   2. Show readiness score + top risks
 *   3. Evidence tasks grouped by category with severity badges
 *   4. "Why FDA Will Ask This" — REGULATORY_OBJECTION_LIBRARY per risk code
 *   5. Submission gate check
 *   6. Export JSON/CSV + hash verification
 *
 * @phase 6.6.D
 */

import { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
// Table components available for future use
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertTriangle,
  CheckCircle,
  Play,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  Hash,
  ClipboardCheck,
  XCircle,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import {
  useBuildDefensePacket,
  useSubmissionGate,
  useWaiveTask,
} from '@/hooks/use-predicate-intelligence';
import { DownloadVerifyPanel } from './DownloadVerifyPanel';
import type {
  BuildDefensePacketResponse,
  EvidenceTaskFull,
  SubmissionGateResult,
} from '../../../shared/types/predicate-intelligence';
import {
  RISK_CODE_LABELS,
  RISK_CODE_SEVERITY,
  REGULATORY_OBJECTION_LIBRARY,
  RISK_CODES_LOCK_HASH,
  type RiskCode,
} from '../../../../shared/types/generated/risk-codes.generated';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const SEVERITY_BADGE: Record<string, 'destructive' | 'default' | 'secondary'> = {
  High: 'destructive',
  Medium: 'default',
  Low: 'secondary',
};

const STATUS_STYLES: Record<string, string> = {
  CREATED: 'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  READY: 'bg-green-100 text-green-700',
  BLOCKED: 'bg-red-100 text-red-700',
  STALE: 'bg-orange-100 text-orange-700',
  FAILED: 'bg-red-200 text-red-900',
};

const OPS_STATUS_ICON: Record<string, typeof Shield> = {
  CREATED: Shield,
  IN_PROGRESS: Loader2,
  READY: ShieldCheck,
  BLOCKED: ShieldAlert,
  STALE: AlertTriangle,
  FAILED: XCircle,
};

const CATEGORY_LABELS: Record<string, string> = {
  BenchTesting: 'Bench Testing',
  Biocompatibility: 'Biocompatibility',
  RiskManagement: 'Risk Management',
  SoftwareLifecycle: 'Software Lifecycle',
  Cybersecurity: 'Cybersecurity',
  SterilizationValidation: 'Sterilization',
  ClinicalEvidence: 'Clinical Evidence',
  LabelingIFU: 'Labeling / IFU',
  StandardsConformance: 'Standards',
  PostMarketSurveillance: 'Post-Market',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

function ReadinessGauge({ score, size = 'lg' }: { score: number; size?: 'sm' | 'lg' }) {
  const color = score >= 80 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600';
  const bgColor = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  const dim = size === 'lg' ? 'h-32 w-32' : 'h-20 w-20';
  const textSize = size === 'lg' ? 'text-3xl' : 'text-xl';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`relative ${dim}`}>
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
          <span className={`${textSize} font-bold ${color}`}>{Math.round(score)}</span>
        </div>
      </div>
      <div className={`h-1.5 ${size === 'lg' ? 'w-40' : 'w-24'} rounded-full bg-gray-200`}>
        <div
          className={`h-full rounded-full ${bgColor} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground font-medium">Defense Ready</span>
    </div>
  );
}

function ManifestBadge({ hash, label }: { hash: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const short = hash.slice(0, 12);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50 border border-dashed text-xs font-mono text-muted-foreground hover:bg-muted transition-colors"
            onClick={() => {
              navigator.clipboard.writeText(hash);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Hash className="h-3 w-3" />
            {label}: {short}…{copied && <CheckCircle className="h-3 w-3 text-green-500" />}
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[400px] break-all font-mono text-xs">
          {hash}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function TamperSafeBadge({ verified }: { verified: boolean }) {
  return (
    <Badge
      variant={verified ? 'default' : 'destructive'}
      className={`text-xs ${verified ? 'bg-green-100 text-green-800 border-green-200' : ''}`}
    >
      {verified ? <Lock className="h-3 w-3 mr-1" /> : <Unlock className="h-3 w-3 mr-1" />}
      {verified ? 'Tamper-Safe' : 'Unverified'}
    </Badge>
  );
}

function TopRiskCard({ code }: { code: string }) {
  const label = RISK_CODE_LABELS[code as RiskCode] || code;
  const severity = RISK_CODE_SEVERITY[code as RiskCode] || 'MEDIUM';
  const objection = REGULATORY_OBJECTION_LIBRARY[code as RiskCode];

  return (
    <div className="p-3 rounded-lg border bg-muted/30">
      <div className="flex items-center gap-2 mb-1">
        <Badge
          variant={
            severity === 'HIGH' ? 'destructive' : severity === 'MEDIUM' ? 'default' : 'secondary'
          }
          className="text-[10px]"
        >
          {severity}
        </Badge>
        <span className="font-mono text-xs text-blue-600">{code}</span>
      </div>
      <p className="text-sm font-medium">{label}</p>
      {objection && (
        <p className="text-xs text-muted-foreground mt-1 italic">
          FDA: "{objection.question.slice(0, 100)}
          {objection.question.length > 100 ? '…' : ''}"
        </p>
      )}
      {objection?.ectd_location && (
        <p className="text-xs text-blue-600/70 mt-0.5">eCTD: {objection.ectd_location}</p>
      )}
    </div>
  );
}

function EvidenceTaskRow({
  task,
  onWaive,
  isWaiving,
}: {
  task: EvidenceTaskFull;
  onWaive?: (taskId: string, reason: string) => void;
  isWaiving?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showWaiver, setShowWaiver] = useState(false);
  const [waiverReason, setWaiverReason] = useState('');
  const objection = task.triggered_risk_codes?.[0]
    ? REGULATORY_OBJECTION_LIBRARY[task.triggered_risk_codes[0] as RiskCode]
    : null;

  return (
    <div className="rounded-md border bg-card">
      <button
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="mt-0.5">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <Badge
          variant={SEVERITY_BADGE[task.severity] || 'secondary'}
          className="text-[10px] shrink-0 mt-0.5"
        >
          {task.severity}
        </Badge>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{task.title}</span>
            <Badge variant="outline" className="text-[9px] font-mono">
              {task.category}
            </Badge>
            {task.completion?.state === 'DONE' && (
              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            )}
            {task.completion?.state === 'WAIVED' && (
              <Badge variant="secondary" className="text-[9px]">
                WAIVED
              </Badge>
            )}
          </div>
          <div className="flex gap-1 mt-1 flex-wrap">
            {task.triggered_risk_codes.map(rc => (
              <Badge key={rc} variant="secondary" className="text-[9px] font-mono">
                {rc}
              </Badge>
            ))}
          </div>
        </div>
        <span className="text-xs text-muted-foreground font-mono shrink-0">
          {task.task_id.slice(0, 8)}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-0 ml-7 space-y-3 border-t">
          {/* Why it matters */}
          <p className="text-sm text-muted-foreground">{task.why_it_matters}</p>

          {/* Acceptance criteria */}
          {task.acceptance_criteria.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1">Acceptance Criteria</p>
              <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
                {task.acceptance_criteria.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommended artifacts */}
          {task.recommended_artifacts.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1">Recommended Artifacts</p>
              <div className="flex flex-wrap gap-1">
                {task.recommended_artifacts.map(a => (
                  <Badge key={a} variant="outline" className="text-[9px]">
                    {a}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Why FDA will ask this — Regulatory Objection Library */}
          {objection && (
            <div className="p-2.5 rounded-md bg-amber-50 border border-amber-200">
              <div className="flex items-start gap-2">
                <HelpCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-800 mb-0.5">
                    Why FDA Will Ask This
                  </p>
                  <p className="text-xs text-amber-700 italic">"{objection.question}"</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-700">
                      {objection.severity}
                    </Badge>
                    <span className="text-[9px] text-amber-600">
                      eCTD: {objection.ectd_location}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Anticipated reviewer questions from task */}
          {task.anticipated_questions?.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1">Anticipated Reviewer Questions</p>
              {task.anticipated_questions.map((q, i) => (
                <div key={i} className="p-2 rounded bg-muted/50 text-xs mb-1">
                  <p className="font-medium">{q.question}</p>
                  {q.recommended_artifacts?.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {q.recommended_artifacts.map(a => (
                        <Badge key={a} variant="outline" className="text-[8px]">
                          {a}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Waiver button for Part 11 compliant task waiving */}
          {task.completion?.state === 'OPEN' && onWaive && (
            <div>
              {!showWaiver ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={e => {
                    e.stopPropagation();
                    setShowWaiver(true);
                  }}
                >
                  Waive Task…
                </Button>
              ) : (
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs">Waiver Reason (Part 11 required)</Label>
                    <Input
                      value={waiverReason}
                      onChange={e => setWaiverReason(e.target.value)}
                      placeholder="Justification for waiving this task…"
                      className="text-xs h-8 mt-1"
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!waiverReason.trim() || isWaiving}
                    onClick={e => {
                      e.stopPropagation();
                      onWaive(task.task_id, waiverReason);
                    }}
                    className="text-xs"
                  >
                    {isWaiving ? 'Waiving…' : 'Waive'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={e => {
                      e.stopPropagation();
                      setShowWaiver(false);
                    }}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubmissionGateCard({ gate }: { gate: SubmissionGateResult }) {
  return (
    <Card
      className={gate.allowed ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}
    >
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          {gate.allowed ? (
            <ShieldCheck className="h-8 w-8 text-green-600" />
          ) : (
            <ShieldAlert className="h-8 w-8 text-red-600" />
          )}
          <div>
            <p className="font-semibold text-lg">
              {gate.allowed ? 'Submission Allowed' : 'Submission Blocked'}
            </p>
            {gate.reason && <p className="text-sm text-muted-foreground">{gate.reason}</p>}
          </div>
        </div>

        {gate.blocking_task_ids.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium mb-1">Blocking Tasks</p>
            <div className="flex flex-wrap gap-1">
              {gate.blocking_task_ids.map(id => (
                <Badge key={id} variant="destructive" className="text-[9px] font-mono">
                  {id.slice(0, 12)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {gate.blocking_risk_codes.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-medium mb-1">Blocking Risk Codes</p>
            <div className="flex flex-wrap gap-1">
              {gate.blocking_risk_codes.map(rc => (
                <Badge key={rc} variant="destructive" className="text-[9px] font-mono">
                  {rc}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {gate.recommended_next_actions.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium mb-1">Recommended Next Actions</p>
            <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
              {gate.recommended_next_actions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

interface DefensePacketPanelProps {
  programId: string;
  predicateKNumber?: string;
  initialSubjectDevice?: Record<string, string>;
}

export function DefensePacketPanel({
  programId,
  predicateKNumber = '',
  initialSubjectDevice = {},
}: DefensePacketPanelProps) {
  const [kNumber, setKNumber] = useState(predicateKNumber);
  const [productCode, setProductCode] = useState('');
  const [subjectDevice, setSubjectDevice] = useState<Record<string, string>>(initialSubjectDevice);
  const [result, setResult] = useState<BuildDefensePacketResponse | null>(null);
  const [gateResult, setGateResult] = useState<SubmissionGateResult | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const buildMut = useBuildDefensePacket(programId);
  const gateMut = useSubmissionGate(programId);
  const waiveMut = useWaiveTask(programId);

  const handleBuild = useCallback(() => {
    if (!kNumber.trim()) return;
    buildMut.mutate(
      {
        productCode: productCode || 'UNKNOWN',
        subjectDevice,
        selectedPredicate: { k_number: kNumber.trim() },
      },
      {
        onSuccess: data => {
          setResult(data);
          setGateResult(null);
        },
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kNumber, productCode, subjectDevice, buildMut]);

  const packet = result?.defense_packet;
  const gate = result?.submission_gate;

  const handleGateCheck = useCallback(() => {
    if (!packet?.manifest_hash) return;
    gateMut.mutate(packet.manifest_hash, {
      onSuccess: data => setGateResult(data),
    });
  }, [packet, gateMut]);

  const handleWaiveTask = useCallback(
    (taskId: string, reason: string) => {
      if (!packet?.packet_id) return;
      waiveMut.mutate({
        packetId: packet.packet_id,
        taskId,
        waiverReason: reason,
      });
    },
    [packet, waiveMut]
  );

  // Group tasks by category
  const tasksByCategory = useMemo(() => {
    if (!packet?.tasks) return {};
    const grouped: Record<string, EvidenceTaskFull[]> = {};
    for (const task of packet.tasks) {
      const cat = task.category || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(task);
    }
    return grouped;
  }, [packet?.tasks]);

  // Lock hash verification
  const lockHashVerified = useMemo(() => {
    if (!packet?.risk_vocab_hash) return false;
    // The packet's risk_vocab_hash should match the current lock hash
    return packet.risk_vocab_hash === RISK_CODES_LOCK_HASH;
  }, [packet]);

  const SE_FIELDS = [
    { key: 'intended_use', label: 'Intended Use' },
    { key: 'technology', label: 'Technology' },
    { key: 'materials', label: 'Materials' },
    { key: 'energy_source', label: 'Energy Source' },
    { key: 'sterilization', label: 'Sterilization' },
    { key: 'biocompatibility', label: 'Biocompatibility' },
    { key: 'software', label: 'Software/Firmware' },
    { key: 'performance', label: 'Performance' },
    { key: 'labeling', label: 'Labeling' },
  ];

  return (
    <div className="space-y-6">
      {/* Build Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Defense Packet Builder
            <Badge variant="outline" className="text-[10px]">
              6.6.D1
            </Badge>
          </CardTitle>
          <CardDescription>
            Generate a deterministic, hash-verified defense packet with evidence tasks, regulatory
            objections, and submission gating. Zero-LLM, fully auditable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="dp-kNumber">Predicate K-Number</Label>
              <Input
                id="dp-kNumber"
                value={kNumber}
                onChange={e => setKNumber(e.target.value)}
                placeholder="K123456"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="dp-productCode">Product Code</Label>
              <Input
                id="dp-productCode"
                value={productCode}
                onChange={e => setProductCode(e.target.value)}
                placeholder="e.g. DQA"
                className="mt-1"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleBuild}
                disabled={!kNumber.trim() || buildMut.isPending}
                className="w-full"
              >
                {buildMut.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Building…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" /> Build Defense Packet
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Subject Device Fields (collapsible) */}
          <details className="group">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
              ► Subject Device Details (optional)
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              {SE_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <Input
                    value={subjectDevice[key] || ''}
                    onChange={e => setSubjectDevice(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={label}
                    className="mt-1 text-sm"
                  />
                </div>
              ))}
            </div>
          </details>
        </CardContent>
      </Card>

      {/* Error */}
      {buildMut.isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <p className="text-sm text-red-800">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              {(buildMut.error as Error)?.message || 'Build failed'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {packet && (
        <>
          {/* Summary Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4 flex justify-center">
                <ReadinessGauge score={packet.readiness_score} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold">{packet.tasks.length}</p>
                <p className="text-xs text-muted-foreground">Evidence Tasks</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-red-600">
                  {packet.tasks.filter(t => t.severity === 'High').length}
                </p>
                <p className="text-xs text-muted-foreground">High Severity</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-blue-600">{packet.top_risks.length}</p>
                <p className="text-xs text-muted-foreground">Top Risks</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="flex items-center justify-center gap-2">
                  {(() => {
                    const Icon = OPS_STATUS_ICON[packet.status] || Shield;
                    return <Icon className="h-5 w-5" />;
                  })()}
                  <Badge className={STATUS_STYLES[packet.status]}>{packet.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Packet Status</p>
              </CardContent>
            </Card>
          </div>

          {/* Manifest metadata */}
          <div className="flex flex-wrap items-center gap-2">
            <ManifestBadge hash={packet.manifest_hash} label="manifest" />
            <ManifestBadge hash={packet.risk_vocab_hash} label="risk_vocab" />
            <TamperSafeBadge verified={lockHashVerified} />
            <Badge variant="outline" className="text-[10px] font-mono">
              v{packet.risk_code_map_version}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-mono">
              {packet.packet_version}
            </Badge>
          </div>

          {/* Inline submission gate from build response */}
          {gate && <SubmissionGateCard gate={gate} />}

          {/* Top Risks */}
          {packet.top_risks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Top Risks ({packet.top_risks.length})
                </CardTitle>
                <CardDescription>
                  Highest-impact risk codes driving evidence requirements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {packet.top_risks.map(rc => (
                    <TopRiskCard key={rc} code={rc} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Evidence Tasks by Category */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4" />
                Evidence Tasks ({packet.tasks.length})
              </CardTitle>
              <CardDescription>
                Grouped by evidence category. Expand each task for acceptance criteria, recommended
                artifacts, and anticipated FDA questions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(tasksByCategory).map(([category, tasks]) => (
                  <div key={category}>
                    <button
                      className="flex items-center gap-2 mb-2 hover:text-foreground transition-colors text-muted-foreground"
                      onClick={() =>
                        setExpandedCategory(expandedCategory === category ? null : category)
                      }
                    >
                      {expandedCategory === category ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span className="text-sm font-semibold">
                        {CATEGORY_LABELS[category] || category}
                      </span>
                      <Badge variant="outline" className="text-[9px]">
                        {tasks.length} task{tasks.length !== 1 ? 's' : ''}
                      </Badge>
                      {tasks.some(t => t.severity === 'High') && (
                        <Badge variant="destructive" className="text-[9px]">
                          HIGH
                        </Badge>
                      )}
                    </button>
                    {expandedCategory === category && (
                      <div className="space-y-2 ml-2">
                        {tasks.map(task => (
                          <EvidenceTaskRow
                            key={task.task_id}
                            task={task}
                            onWaive={handleWaiveTask}
                            isWaiving={waiveMut.isPending}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Download + Verify Panel */}
          <DownloadVerifyPanel
            programId={programId}
            manifestHash={packet.manifest_hash}
            lockHash={packet.risk_vocab_hash}
            builtAt={packet.generated_at}
            readinessScore={packet.readiness_score}
            taskCount={packet.tasks.length}
          />

          {/* Action Bar — Gate Check */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleGateCheck} disabled={gateMut.isPending} variant="default">
                  {gateMut.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Checking…
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4 mr-2" /> Submission Gate Check
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Standalone gate check result */}
          {gateResult && <SubmissionGateCard gate={gateResult} />}
        </>
      )}

      {/* Empty state */}
      {!result && !buildMut.isPending && !buildMut.isError && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Enter a predicate K-Number and build the defense packet.</p>
              <p className="text-sm mt-1">
                The builder generates deterministic evidence tasks, regulatory objections, and
                hash-verified manifests — zero LLM, fully Part 11 auditable.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
