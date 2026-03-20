/**
 * Concept2Cure Client Portal V2 - Compliance Dashboard
 *
 * Real-time compliance monitoring with:
 * - Regulatory compliance status
 * - Part 11 checklist tracking
 * - Compliance score metrics
 * - Finding and remediation tracking
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11, EU Annex 11, ICH E6(R2)
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  CheckCircle,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Clock,
  Calendar,
  TrendingUp,
  TrendingDown,
  Target,
  FileText,
  FileCheck,
  FileClock,
  ClipboardCheck,
  ClipboardList,
  Eye,
  RefreshCw,
  Loader2,
  Download,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info,
  HelpCircle,
  Award,
  BarChart,
  Activity,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

type ComplianceStatus = 'compliant' | 'partial' | 'non_compliant' | 'not_assessed';
type FindingSeverity = 'critical' | 'major' | 'minor' | 'observation';
type FindingStatus = 'open' | 'in_progress' | 'remediated' | 'verified';

interface ComplianceArea {
  id: string;
  name: string;
  regulation: string;
  description: string;
  status: ComplianceStatus;
  score: number;
  requirements: ComplianceRequirement[];
  lastAssessed: Date;
  nextAssessment: Date;
}

interface ComplianceRequirement {
  id: string;
  reference: string;
  title: string;
  description: string;
  status: ComplianceStatus;
  evidence: string[];
  notes?: string;
}

interface ComplianceFinding {
  id: string;
  title: string;
  description: string;
  regulation: string;
  reference: string;
  severity: FindingSeverity;
  status: FindingStatus;
  identifiedDate: Date;
  dueDate: Date;
  remediatedDate?: Date;
  owner: string;
  remediationPlan?: string;
}

interface ComplianceMetric {
  label: string;
  value: number;
  previousValue: number;
  target: number;
  unit: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ComplianceStatus,
  { label: string; color: string; bgColor: string; icon: React.ComponentType<{ className?: string }> }
> = {
  compliant: { label: 'Compliant', color: 'text-green-700', bgColor: 'bg-green-100', icon: ShieldCheck },
  partial: { label: 'Partial', color: 'text-amber-700', bgColor: 'bg-amber-100', icon: ShieldAlert },
  non_compliant: { label: 'Non-Compliant', color: 'text-red-700', bgColor: 'bg-red-100', icon: ShieldX },
  not_assessed: { label: 'Not Assessed', color: 'text-gray-700', bgColor: 'bg-gray-100', icon: Shield },
};

const SEVERITY_CONFIG: Record<
  FindingSeverity,
  { label: string; color: string; bgColor: string; priority: number }
> = {
  critical: { label: 'Critical', color: 'text-red-700', bgColor: 'bg-red-100', priority: 1 },
  major: { label: 'Major', color: 'text-orange-700', bgColor: 'bg-orange-100', priority: 2 },
  minor: { label: 'Minor', color: 'text-amber-700', bgColor: 'bg-amber-100', priority: 3 },
  observation: { label: 'Observation', color: 'text-blue-700', bgColor: 'bg-blue-100', priority: 4 },
};

const FINDING_STATUS_CONFIG: Record<
  FindingStatus,
  { label: string; color: string; bgColor: string }
> = {
  open: { label: 'Open', color: 'text-red-600', bgColor: 'bg-red-100' },
  in_progress: { label: 'In Progress', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  remediated: { label: 'Remediated', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  verified: { label: 'Verified', color: 'text-green-600', bgColor: 'bg-green-100' },
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

// Compliance areas data fetched via useQuery in ComplianceDashboard

const MOCK_FINDINGS: ComplianceFinding[] = [
  {
    id: 'find_001',
    title: 'User Role Matrix Incomplete',
    description: 'The user role matrix does not include recently added features and their corresponding access levels.',
    regulation: 'FDA 21 CFR Part 11',
    reference: '11.10(g)',
    severity: 'major',
    status: 'in_progress',
    identifiedDate: new Date('2025-01-10'),
    dueDate: new Date('2025-02-15'),
    owner: 'John Smith',
    remediationPlan: 'Update role matrix to include all new features, review with QA, obtain approval',
  },
  {
    id: 'find_002',
    title: 'Overdue Training Records',
    description: '12 users have overdue Part 11 compliance training that requires immediate attention.',
    regulation: 'FDA 21 CFR Part 11',
    reference: '11.10(i)',
    severity: 'minor',
    status: 'open',
    identifiedDate: new Date('2025-01-15'),
    dueDate: new Date('2025-02-01'),
    owner: 'Sarah Johnson',
  },
  {
    id: 'find_003',
    title: 'Audit Trail Gap During Migration',
    description: 'Minor gap in audit trail continuity identified during data migration review.',
    regulation: 'FDA 21 CFR Part 11',
    reference: '11.10(e)',
    severity: 'observation',
    status: 'remediated',
    identifiedDate: new Date('2024-12-20'),
    dueDate: new Date('2025-01-20'),
    remediatedDate: new Date('2025-01-18'),
    owner: 'Mike Chen',
    remediationPlan: 'Created manual audit log entry to document gap with appropriate justification',
  },
  {
    id: 'find_004',
    title: 'Password Complexity Enhancement',
    description: 'Current password policy meets minimum requirements but should be strengthened per NIST 800-63B.',
    regulation: 'FDA 21 CFR Part 11',
    reference: '11.300',
    severity: 'minor',
    status: 'verified',
    identifiedDate: new Date('2024-11-15'),
    dueDate: new Date('2024-12-31'),
    remediatedDate: new Date('2024-12-15'),
    owner: 'Alex Rivera',
    remediationPlan: 'Implemented enhanced password policy with increased complexity requirements',
  },
];

const MOCK_METRICS: ComplianceMetric[] = [
  { label: 'Overall Compliance Score', value: 92, previousValue: 88, target: 95, unit: '%' },
  { label: 'Open Findings', value: 2, previousValue: 5, target: 0, unit: '' },
  { label: 'Training Compliance', value: 87, previousValue: 91, target: 100, unit: '%' },
  { label: 'Documents Pending Review', value: 8, previousValue: 12, target: 0, unit: '' },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE SCORE GAUGE
// ─────────────────────────────────────────────────────────────────────────────

const ComplianceScoreGauge: React.FC<{ score: number; target: number }> = ({ score, target }) => {
  const getScoreColor = (s: number) => {
    if (s >= 90) return 'text-green-600';
    if (s >= 75) return 'text-amber-600';
    return 'text-red-600';
  };

  const getScoreBg = (s: number) => {
    if (s >= 90) return 'bg-green-500';
    if (s >= 75) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Overall Compliance</h3>
          <Badge variant={score >= target ? 'default' : 'secondary'}>
            Target: {target}%
          </Badge>
        </div>
        <div className="relative">
          <div className="text-center mb-4">
            <span className={`text-5xl font-bold ${getScoreColor(score)}`}>{score}</span>
            <span className="text-2xl text-muted-foreground">%</span>
          </div>
          <Progress value={score} className="h-3" />
          <div className="absolute -top-1 left-0 w-full">
            <div
              className="absolute h-5 w-1 bg-gray-400"
              style={{ left: `${target}%`, transform: 'translateX(-50%)' }}
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
          <div>
            <p className="text-green-600 font-semibold">90-100%</p>
            <p className="text-muted-foreground">Compliant</p>
          </div>
          <div>
            <p className="text-amber-600 font-semibold">75-89%</p>
            <p className="text-muted-foreground">Partial</p>
          </div>
          <div>
            <p className="text-red-600 font-semibold">&lt;75%</p>
            <p className="text-muted-foreground">At Risk</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// METRIC CARD
// ─────────────────────────────────────────────────────────────────────────────

const MetricCard: React.FC<{ metric: ComplianceMetric }> = ({ metric }) => {
  const change = metric.value - metric.previousValue;
  const isPositive = metric.label.includes('Score') || metric.label.includes('Compliance')
    ? change > 0
    : change < 0;
  const changeText = change > 0 ? `+${change}` : `${change}`;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-muted-foreground">{metric.label}</p>
          {change !== 0 && (
            <div className={`flex items-center text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )}
              {changeText}
            </div>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold">{metric.value}</span>
          <span className="text-muted-foreground">{metric.unit}</span>
        </div>
        {metric.target > 0 && (
          <Progress
            value={(metric.value / metric.target) * 100}
            className="h-1 mt-2"
          />
        )}
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE AREA CARD
// ─────────────────────────────────────────────────────────────────────────────

const ComplianceAreaCard: React.FC<{
  area: ComplianceArea;
  onViewDetails: () => void;
}> = ({ area, onViewDetails }) => {
  const [expanded, setExpanded] = useState(false);
  const statusConfig = STATUS_CONFIG[area.status];
  const StatusIcon = statusConfig.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${statusConfig.bgColor}`}>
              <StatusIcon className={`h-5 w-5 ${statusConfig.color}`} />
            </div>
            <div>
              <CardTitle className="text-lg">{area.name}</CardTitle>
              <CardDescription>{area.regulation}</CardDescription>
            </div>
          </div>
          <Badge className={`${statusConfig.bgColor} ${statusConfig.color} border-0`}>
            {statusConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">{area.description}</p>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Compliance Score</span>
            <span className="font-semibold">{area.score}%</span>
          </div>
          <Progress value={area.score} className="h-2" />
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
          <div>
            <p className="text-muted-foreground">Last Assessed</p>
            <p className="font-medium">{area.lastAssessed.toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Next Assessment</p>
            <p className="font-medium">{area.nextAssessment.toLocaleDateString()}</p>
          </div>
        </div>

        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full mt-4">
              {expanded ? (
                <>
                  <ChevronUp className="mr-2 h-4 w-4" />
                  Hide Requirements
                </>
              ) : (
                <>
                  <ChevronDown className="mr-2 h-4 w-4" />
                  View {area.requirements.length} Requirements
                </>
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 space-y-2">
            {area.requirements.map((req) => {
              const reqStatus = STATUS_CONFIG[req.status];
              return (
                <div
                  key={req.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${reqStatus.bgColor.replace('bg-', 'bg-').replace('100', '500')}`} />
                    <div>
                      <p className="font-medium text-sm">{req.reference}</p>
                      <p className="text-xs text-muted-foreground">{req.title}</p>
                    </div>
                  </div>
                  <Badge className={`${reqStatus.bgColor} ${reqStatus.color} border-0 text-xs`}>
                    {reqStatus.label}
                  </Badge>
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
      <CardFooter className="border-t pt-4">
        <Button variant="outline" className="w-full" onClick={onViewDetails}>
          <Eye className="mr-2 h-4 w-4" />
          View Full Details
        </Button>
      </CardFooter>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FINDING CARD
// ─────────────────────────────────────────────────────────────────────────────

const FindingCard: React.FC<{
  finding: ComplianceFinding;
  onViewDetails: () => void;
}> = ({ finding, onViewDetails }) => {
  const severityConfig = SEVERITY_CONFIG[finding.severity];
  const statusConfig = FINDING_STATUS_CONFIG[finding.status];

  const daysUntilDue = Math.ceil(
    (finding.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  const isOverdue = finding.status !== 'verified' && finding.status !== 'remediated' && daysUntilDue < 0;

  return (
    <Card className={isOverdue ? 'border-red-300' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={`${severityConfig.bgColor} ${severityConfig.color} border-0`}>
                {severityConfig.label}
              </Badge>
              <Badge className={`${statusConfig.bgColor} ${statusConfig.color} border-0`}>
                {statusConfig.label}
              </Badge>
              {isOverdue && (
                <Badge variant="destructive">Overdue</Badge>
              )}
            </div>
            <h4 className="font-semibold">{finding.title}</h4>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {finding.description}
            </p>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span>{finding.regulation} - {finding.reference}</span>
              <span>•</span>
              <span>Owner: {finding.owner}</span>
              <span>•</span>
              <span className={isOverdue ? 'text-red-600' : ''}>
                {isOverdue ? `${Math.abs(daysUntilDue)} days overdue` : `Due: ${finding.dueDate.toLocaleDateString()}`}
              </span>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onViewDetails}>
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPLIANCE DASHBOARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const ComplianceDashboard: React.FC = () => {
  const { data: areas = [], isLoading: areasLoading } = useQuery<ComplianceArea[]>({
    queryKey: ['compliance', 'areas'],
    queryFn: async () => {
      const res = await fetch('/api/compliance/areas');
      if (!res.ok) throw new Error('Failed to fetch compliance areas');
      const data = await res.json();
      return data.map((area: any) => ({
        ...area,
        lastAssessed: new Date(area.lastAssessed),
        nextAssessment: new Date(area.nextAssessment),
      }));
    },
  });
  const [findings] = useState<ComplianceFinding[]>(MOCK_FINDINGS);
  const [metrics] = useState<ComplianceMetric[]>(MOCK_METRICS);
  const isLoading = areasLoading;
  const [activeTab, setActiveTab] = useState('overview');

  // Calculate stats
  const stats = useMemo(() => {
    const openFindings = findings.filter((f) => f.status === 'open' || f.status === 'in_progress');
    const criticalFindings = openFindings.filter((f) => f.severity === 'critical');
    const overdueFindings = openFindings.filter((f) => {
      const daysUntilDue = Math.ceil((f.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return daysUntilDue < 0;
    });

    return {
      overallScore: metrics[0]?.value || 0,
      compliantAreas: areas.filter((a) => a.status === 'compliant').length,
      totalAreas: areas.length,
      openFindings: openFindings.length,
      criticalFindings: criticalFindings.length,
      overdueFindings: overdueFindings.length,
    };
  }, [areas, findings, metrics]);

  const handleRefresh = async () => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 500));
    setIsLoading(false);
  };

  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" />
            Compliance Dashboard
          </h1>
          <p className="text-muted-foreground">
            Real-time regulatory compliance monitoring
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Critical Alerts */}
      {(stats.criticalFindings > 0 || stats.overdueFindings > 0) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Attention Required</AlertTitle>
          <AlertDescription>
            {stats.criticalFindings > 0 && (
              <span>
                {stats.criticalFindings} critical finding{stats.criticalFindings !== 1 ? 's' : ''} require
                immediate attention.{' '}
              </span>
            )}
            {stats.overdueFindings > 0 && (
              <span>
                {stats.overdueFindings} finding{stats.overdueFindings !== 1 ? 's are' : ' is'} overdue.
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, index) => (
          <MetricCard key={index} metric={metric} />
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="areas">Compliance Areas</TabsTrigger>
          <TabsTrigger value="findings">
            Findings
            {stats.openFindings > 0 && (
              <Badge variant="destructive" className="ml-2">
                {stats.openFindings}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="checklist">Part 11 Checklist</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Score Gauge */}
            <ComplianceScoreGauge score={stats.overallScore} target={95} />

            {/* Summary Stats */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Compliance Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <ShieldCheck className="h-8 w-8 mx-auto text-green-600 mb-2" />
                    <p className="text-2xl font-bold">{stats.compliantAreas}</p>
                    <p className="text-sm text-muted-foreground">Compliant Areas</p>
                  </div>
                  <div className="text-center">
                    <Shield className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                    <p className="text-2xl font-bold">{stats.totalAreas}</p>
                    <p className="text-sm text-muted-foreground">Total Areas</p>
                  </div>
                  <div className="text-center">
                    <AlertCircle className="h-8 w-8 mx-auto text-amber-600 mb-2" />
                    <p className="text-2xl font-bold">{stats.openFindings}</p>
                    <p className="text-sm text-muted-foreground">Open Findings</p>
                  </div>
                  <div className="text-center">
                    <AlertTriangle className="h-8 w-8 mx-auto text-red-600 mb-2" />
                    <p className="text-2xl font-bold">{stats.overdueFindings}</p>
                    <p className="text-sm text-muted-foreground">Overdue</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick View - Top Findings */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Findings</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('findings')}>
                  View All <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {findings
                .filter((f) => f.status === 'open' || f.status === 'in_progress')
                .slice(0, 3)
                .map((finding) => (
                  <FindingCard
                    key={finding.id}
                    finding={finding}
                    onViewDetails={() => {}}
                  />
                ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="areas" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {areas.map((area) => (
              <ComplianceAreaCard
                key={area.id}
                area={area}
                onViewDetails={() => {}}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="findings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Findings</CardTitle>
              <CardDescription>
                Track and manage compliance findings and remediation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {findings.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  onViewDetails={() => {}}
                />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checklist" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5" />
                FDA 21 CFR Part 11 Compliance Checklist
              </CardTitle>
              <CardDescription>
                Self-assessment checklist for electronic records and signatures
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {areas
                  .filter((a) => a.regulation.includes('Part 11'))
                  .flatMap((a) => a.requirements)
                  .map((req) => {
                    const status = STATUS_CONFIG[req.status];
                    return (
                      <div
                        key={req.id}
                        className="flex items-start gap-4 p-4 rounded-lg border"
                      >
                        <div className={`p-1 rounded ${status.bgColor}`}>
                          {req.status === 'compliant' ? (
                            <CheckCircle className={`h-5 w-5 ${status.color}`} />
                          ) : req.status === 'partial' ? (
                            <AlertCircle className={`h-5 w-5 ${status.color}`} />
                          ) : (
                            <XCircle className={`h-5 w-5 ${status.color}`} />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium">
                              {req.reference}
                            </span>
                            <span className="font-medium">{req.title}</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {req.description}
                          </p>
                          {req.evidence.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {req.evidence.map((ev) => (
                                <Badge key={ev} variant="outline" className="text-xs">
                                  <FileCheck className="mr-1 h-3 w-3" />
                                  {ev}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {req.notes && (
                            <p className="text-sm text-amber-600 mt-2">
                              Note: {req.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ComplianceDashboard;
