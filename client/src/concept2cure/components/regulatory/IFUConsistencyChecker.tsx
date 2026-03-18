/**
 * Concept2Cure - IFU Consistency Checker
 *
 * Specialized tool for verifying Instructions for Use (IFU) consistency
 * against 510(k) summary, labeling, and promotional materials.
 *
 * Biotech/CRO specific: Device labeling compliance per FDA 21 CFR 801
 *
 * @module concept2cure/components/regulatory/IFUConsistencyChecker
 * @version 1.0.0
 */

import React, { useState, useCallback } from 'react';
import type { Project, Artifact } from '../../types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  RefreshCw,
  Download,
  Copy,
  ChevronRight,
  FileCheck,
  Loader2,
  Info,
  Scale,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ConsistencyIssue {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category:
    | 'indications'
    | 'contraindications'
    | 'warnings'
    | 'procedures'
    | 'specifications'
    | 'claims';
  title: string;
  description: string;
  sourceDocument: string;
  sourceText: string;
  ifuText?: string;
  recommendation: string;
  regulatoryReference?: string;
}

interface ConsistencyCheckResult {
  overallScore: number;
  totalIssues: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  checkedDocuments: string[];
  issues: ConsistencyIssue[];
  timestamp: Date;
}

interface IFUConsistencyCheckerProps {
  project: Project;
  ifuArtifact?: Artifact;
  relatedArtifacts: Artifact[];
  onRunCheck: () => Promise<ConsistencyCheckResult>;
  onResolveIssue: (issueId: string, resolution: string) => void;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  indications: 'Indications for Use',
  contraindications: 'Contraindications',
  warnings: 'Warnings & Precautions',
  procedures: 'Operating Procedures',
  specifications: 'Device Specifications',
  claims: 'Performance Claims',
};

const REGULATORY_REFERENCES = {
  labeling: '21 CFR 801 - Labeling',
  premarket: '21 CFR 807 - Premarket Notification',
  qsr: '21 CFR 820 - Quality System Regulation',
  udiRule: '21 CFR 830 - Unique Device Identification',
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const getSeverityColor = (severity: string): string => {
  switch (severity) {
    case 'critical':
      return 'text-red-700 bg-red-50 border-red-200';
    case 'warning':
      return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'info':
      return 'text-blue-700 bg-blue-50 border-blue-200';
    default:
      return 'text-zinc-700 bg-zinc-50 border-zinc-200';
  }
};

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case 'critical':
      return XCircle;
    case 'warning':
      return AlertTriangle;
    case 'info':
      return Info;
    default:
      return CheckCircle2;
  }
};

const getScoreColor = (score: number): string => {
  if (score >= 90) return 'text-green-700';
  if (score >= 70) return 'text-amber-700';
  return 'text-red-700';
};

const getScoreLabel = (score: number): string => {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Needs Review';
  if (score >= 50) return 'Poor';
  return 'Critical Issues';
};

// ─────────────────────────────────────────────────────────────────────────────
// ISSUE CARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface IssueCardProps {
  issue: ConsistencyIssue;
  onResolve: (resolution: string) => void;
}

const IssueCard: React.FC<IssueCardProps> = ({ issue, onResolve }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [resolution, setResolution] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  const SeverityIcon = getSeverityIcon(issue.severity);

  const handleResolve = async () => {
    setIsResolving(true);
    await onResolve(resolution);
    setIsResolving(false);
    setIsExpanded(false);
  };

  return (
    <div className={cn('border rounded-md', getSeverityColor(issue.severity))}>
      <div className="cursor-pointer px-4 py-3" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-start gap-3">
          <SeverityIcon
            className={cn(
              'h-5 w-5 mt-0.5 flex-shrink-0',
              issue.severity === 'critical' && 'text-red-600',
              issue.severity === 'warning' && 'text-amber-600',
              issue.severity === 'info' && 'text-blue-600'
            )}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{issue.title}</span>
              <Badge variant="outline" className="text-[10px]">
                {CATEGORY_LABELS[issue.category]}
              </Badge>
            </div>
            <p className="text-xs text-zinc-500 mt-1">{issue.description}</p>
          </div>
          <ChevronRight
            className={cn('h-4 w-4 text-zinc-400 transition-transform', isExpanded && 'rotate-90')}
          />
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4">
          <div className="space-y-4">
            {/* Source comparison */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-xs font-medium text-zinc-700">
                  <FileText className="h-3 w-3" />
                  {issue.sourceDocument}
                </div>
                <div className="p-2 bg-white rounded border text-xs text-zinc-600 font-mono">
                  "{issue.sourceText}"
                </div>
              </div>
              {issue.ifuText && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1 text-xs font-medium text-zinc-700">
                    <FileCheck className="h-3 w-3" />
                    IFU Document
                  </div>
                  <div className="p-2 bg-white rounded border text-xs text-zinc-600 font-mono">
                    "{issue.ifuText}"
                  </div>
                </div>
              )}
            </div>

            {/* Recommendation */}
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-1 text-xs font-medium text-blue-700 mb-1">
                <Sparkles className="h-3 w-3" />
                RI Recommendation
              </div>
              <p className="text-xs text-blue-600">{issue.recommendation}</p>
            </div>

            {/* Regulatory reference */}
            {issue.regulatoryReference && (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Scale className="h-3 w-3" />
                <span>Reference: {issue.regulatoryReference}</span>
              </div>
            )}

            {/* Resolution input */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-700">Resolution Notes</label>
              <Textarea
                value={resolution}
                onChange={e => setResolution(e.target.value)}
                placeholder="Describe how you resolved this issue..."
                className="text-xs h-20"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleResolve}
                  disabled={!resolution.trim() || isResolving}
                >
                  {isResolving ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                  )}
                  Mark Resolved
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(issue.recommendation)}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy Suggestion
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SCORE CARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface ScoreCardProps {
  result: ConsistencyCheckResult;
}

const ScoreCard: React.FC<ScoreCardProps> = ({ result }) => {
  return (
    <div className="p-4 bg-white rounded-lg border border-zinc-200">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm text-zinc-500">Consistency Score</div>
          <div className={cn('text-3xl font-bold', getScoreColor(result.overallScore))}>
            {result.overallScore}%
          </div>
          <div className={cn('text-sm', getScoreColor(result.overallScore))}>
            {getScoreLabel(result.overallScore)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-zinc-500 mb-1">Issues Found</div>
          <div className="flex items-center gap-2">
            {result.criticalCount > 0 && (
              <Badge className="bg-red-100 text-red-700 border-red-200">
                {result.criticalCount} Critical
              </Badge>
            )}
            {result.warningCount > 0 && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                {result.warningCount} Warnings
              </Badge>
            )}
            {result.infoCount > 0 && (
              <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                {result.infoCount} Info
              </Badge>
            )}
          </div>
        </div>
      </div>

      <Progress
        value={result.overallScore}
        className={cn(
          'h-2',
          result.overallScore >= 90 && '[&>div]:bg-green-500',
          result.overallScore >= 70 && result.overallScore < 90 && '[&>div]:bg-amber-500',
          result.overallScore < 70 && '[&>div]:bg-red-500'
        )}
      />

      <div className="mt-3 text-xs text-zinc-500">
        Checked {result.checkedDocuments.length} documents ·{' '}
        {new Date(result.timestamp).toLocaleString()}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const IFUConsistencyChecker: React.FC<IFUConsistencyCheckerProps> = ({
  project,
  ifuArtifact,
  relatedArtifacts,
  onRunCheck,
  onResolveIssue,
  className,
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<ConsistencyCheckResult | null>(null);

  const handleRunCheck = useCallback(async () => {
    setIsRunning(true);
    try {
      const checkResult = await onRunCheck();
      setResult(checkResult);
    } catch (error) {
      console.error('IFU consistency check failed:', error);
    } finally {
      setIsRunning(false);
    }
  }, [onRunCheck]);

  const groupedIssues =
    result?.issues.reduce(
      (acc, issue) => {
        if (!acc[issue.category]) acc[issue.category] = [];
        acc[issue.category].push(issue);
        return acc;
      },
      {} as Record<string, ConsistencyIssue[]>
    ) || {};

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className={cn('gap-2', className)}>
          <FileCheck className="h-4 w-4" />
          IFU Consistency Check
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-blue-600" />
            IFU Consistency Checker
          </DialogTitle>
          <DialogDescription>
            Verify Instructions for Use alignment with 510(k) summary, labeling claims, and
            promotional materials per FDA 21 CFR 801.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Document selection info */}
          <div className="p-3 bg-zinc-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-zinc-700">Documents to Check</span>
              <span className="text-xs text-zinc-500">
                {relatedArtifacts.length + (ifuArtifact ? 1 : 0)} documents selected
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ifuArtifact && (
                <Badge variant="secondary" className="text-xs">
                  <FileCheck className="h-3 w-3 mr-1" />
                  {ifuArtifact.title} (IFU)
                </Badge>
              )}
              {relatedArtifacts.map(artifact => (
                <Badge key={artifact.id} variant="outline" className="text-xs">
                  <FileText className="h-3 w-3 mr-1" />
                  {artifact.title}
                </Badge>
              ))}
            </div>
          </div>

          {/* Run check button */}
          {!result && (
            <div className="text-center py-8">
              <FileCheck className="h-12 w-12 mx-auto text-zinc-300 mb-4" />
              <p className="text-sm text-zinc-600 mb-4">
                Run a consistency check to identify discrepancies between your IFU and other
                regulatory documents.
              </p>
              <Button onClick={handleRunCheck} disabled={isRunning || !ifuArtifact}>
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing Documents...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Run Consistency Check
                  </>
                )}
              </Button>
              {!ifuArtifact && (
                <p className="text-xs text-amber-600 mt-2">
                  Please create or select an IFU document first.
                </p>
              )}
            </div>
          )}

          {/* Results */}
          {result && (
            <>
              {/* Score card */}
              <ScoreCard result={result} />

              {/* Issues by category */}
              <ScrollArea className="h-[400px]">
                <Accordion type="multiple" className="space-y-2">
                  {Object.entries(groupedIssues).map(([category, issues]) => (
                    <AccordionItem key={category} value={category} className="border rounded-lg">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {CATEGORY_LABELS[category] || category}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {issues.length} issue{issues.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 space-y-3">
                        {issues.map(issue => (
                          <IssueCard
                            key={issue.id}
                            issue={issue}
                            onResolve={resolution => onResolveIssue(issue.id, resolution)}
                          />
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>

                {result.totalIssues === 0 && (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                    <p className="text-lg font-medium text-green-700">All Clear!</p>
                    <p className="text-sm text-zinc-600 mt-1">
                      No consistency issues found between documents.
                    </p>
                  </div>
                )}
              </ScrollArea>

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t">
                <Button variant="outline" size="sm" onClick={handleRunCheck} disabled={isRunning}>
                  <RefreshCw className={cn('h-4 w-4 mr-2', isRunning && 'animate-spin')} />
                  Re-run Check
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export Report
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default IFUConsistencyChecker;
