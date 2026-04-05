/**
 * Concept2Cure - Post-Market Surveillance & Vigilance Management
 *
 * Comprehensive post-market surveillance supporting:
 * - Periodic Safety Update Reports (PSUR)
 * - Periodic Benefit-Risk Evaluation Reports (PBRER)
 * - Post-Market Clinical Follow-up (PMCF)
 * - Vigilance reporting (MDR, MedWatch)
 * - Signal detection and management
 * - Risk-benefit analysis
 *
 * @module components/regulatory/PostMarketSurveillance
 * @version 1.0.0
 */

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Search,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertCircle,
  Calendar,
  BarChart3,
  Globe,
  Shield,
  Heart,
  Sparkles,
  Eye,
  FileWarning,
  Send,
  Download,
  RefreshCw,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type ReportType = 'PSUR' | 'PBRER' | 'PMCF' | 'DSUR' | 'PMS_REPORT' | 'TREND_REPORT';

type ReportStatus = 'planned' | 'in_progress' | 'under_review' | 'approved' | 'submitted';

type SignalStatus = 'new' | 'under_evaluation' | 'confirmed' | 'refuted' | 'closed';

type VigilanceType =
  | 'SAE' // Serious Adverse Event
  | 'SUSAR' // Suspected Unexpected Serious Adverse Reaction
  | 'MDR' // Medical Device Report
  | 'FSN' // Field Safety Notice
  | 'FSCA'; // Field Safety Corrective Action

interface SafetySignal {
  id: string;
  name: string;
  product: string;
  category: 'efficacy' | 'safety' | 'quality' | 'use_error';
  description: string;
  status: SignalStatus;
  priority: 'high' | 'medium' | 'low';
  detectedDate: string;
  sourceData: string[];
  caseCount: number;
  expectedCount: number;
  riskScore: number;
  assignedTo: string;
  assessments: SignalAssessment[];
}

interface SignalAssessment {
  date: string;
  assessor: string;
  conclusion: string;
  recommendation: string;
  nextReviewDate?: string;
}

interface PeriodicReport {
  id: string;
  type: ReportType;
  product: string;
  reportingPeriod: { start: string; end: string };
  status: ReportStatus;
  dueDate: string;
  submissionDate?: string;
  author: string;
  reviewer?: string;
  sections: ReportSection[];
  healthAuthorities: string[];
}

interface ReportSection {
  id: string;
  name: string;
  status: 'not_started' | 'in_progress' | 'complete' | 'approved';
  assignee: string;
  content?: string;
}

interface VigilanceCase {
  id: string;
  type: VigilanceType;
  product: string;
  eventDate: string;
  reportDate: string;
  description: string;
  seriousness:
    | 'death'
    | 'life_threatening'
    | 'hospitalization'
    | 'disability'
    | 'other_serious'
    | 'non_serious';
  outcome: 'recovered' | 'recovering' | 'not_recovered' | 'fatal' | 'unknown';
  reportedTo: string[];
  status: 'received' | 'assessment' | 'reported' | 'closed';
  reportingDeadline: string;
  causality: 'certain' | 'probable' | 'possible' | 'unlikely' | 'unassessable' | 'pending';
}

interface RiskBenefitAnalysis {
  product: string;
  lastUpdated: string;
  overallConclusion: 'favorable' | 'unfavorable' | 'conditional';
  benefits: { description: string; weight: number }[];
  risks: { description: string; weight: number; mitigation: string }[];
  uncertainties: string[];
  recommendation: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const REPORT_TYPE_LABELS: Record<
  ReportType,
  { label: string; description: string; icon: React.ReactNode }
> = {
  PSUR: {
    label: 'PSUR',
    description: 'Periodic Safety Update Report',
    icon: <Shield className="w-4 h-4" />,
  },
  PBRER: {
    label: 'PBRER',
    description: 'Periodic Benefit-Risk Evaluation Report',
    icon: <Activity className="w-4 h-4" />,
  },
  PMCF: {
    label: 'PMCF',
    description: 'Post-Market Clinical Follow-up',
    icon: <Heart className="w-4 h-4" />,
  },
  DSUR: {
    label: 'DSUR',
    description: 'Development Safety Update Report',
    icon: <FileText className="w-4 h-4" />,
  },
  PMS_REPORT: {
    label: 'PMS Report',
    description: 'Post-Market Surveillance Report',
    icon: <Eye className="w-4 h-4" />,
  },
  TREND_REPORT: {
    label: 'Trend Report',
    description: 'Safety Trend Analysis Report',
    icon: <TrendingUp className="w-4 h-4" />,
  },
};

const VIGILANCE_TIMELINES: Record<
  VigilanceType,
  { label: string; deadline: string; icon: React.ReactNode }
> = {
  SAE: {
    label: 'Serious Adverse Event',
    deadline: '15 days',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  SUSAR: { label: 'SUSAR', deadline: '7-15 days', icon: <AlertCircle className="w-4 h-4" /> },
  MDR: {
    label: 'Medical Device Report',
    deadline: '30 days',
    icon: <FileWarning className="w-4 h-4" />,
  },
  FSN: { label: 'Field Safety Notice', deadline: 'Immediate', icon: <Send className="w-4 h-4" /> },
  FSCA: {
    label: 'Field Safety Corrective Action',
    deadline: 'Immediate',
    icon: <RefreshCw className="w-4 h-4" />,
  },
};

// Mock Data
const MOCK_SIGNALS: SafetySignal[] = [
  {
    id: 'SIG-2025-001',
    name: 'Elevated Hepatic Enzymes',
    product: 'CardioGuard 50mg',
    category: 'safety',
    description: 'Signal detected for elevated ALT/AST in patients over 65 years',
    status: 'under_evaluation',
    priority: 'high',
    detectedDate: '2025-01-10',
    sourceData: ['Clinical Trial', 'Spontaneous Reports', 'Literature'],
    caseCount: 15,
    expectedCount: 5,
    riskScore: 78,
    assignedTo: 'Dr. Sarah Kim',
    assessments: [
      {
        date: '2025-01-12',
        assessor: 'Dr. Sarah Kim',
        conclusion: 'Signal requires further evaluation',
        recommendation: 'Request additional data from clinical sites',
        nextReviewDate: '2025-02-01',
      },
    ],
  },
  {
    id: 'SIG-2025-002',
    name: 'Injection Site Reactions',
    product: 'BioPure Injectable',
    category: 'safety',
    description: 'Increased reporting of severe injection site reactions',
    status: 'confirmed',
    priority: 'medium',
    detectedDate: '2025-01-05',
    sourceData: ['Spontaneous Reports'],
    caseCount: 8,
    expectedCount: 3,
    riskScore: 62,
    assignedTo: 'Dr. Michael Chen',
    assessments: [
      {
        date: '2025-01-15',
        assessor: 'Dr. Michael Chen',
        conclusion: 'Signal confirmed - update labeling recommended',
        recommendation: 'Initiate labeling update and healthcare provider communication',
      },
    ],
  },
];

const MOCK_REPORTS: PeriodicReport[] = [
  {
    id: 'RPT-2025-001',
    type: 'PBRER',
    product: 'CardioGuard 50mg',
    reportingPeriod: { start: '2024-07-01', end: '2024-12-31' },
    status: 'in_progress',
    dueDate: '2025-03-01',
    author: 'Dr. Lisa Park',
    sections: [
      { id: 's1', name: 'Executive Summary', status: 'complete', assignee: 'Dr. Lisa Park' },
      { id: 's2', name: 'Worldwide Marketing Status', status: 'complete', assignee: 'RA Team' },
      { id: 's3', name: 'Estimated Exposure', status: 'in_progress', assignee: 'Epidemiology' },
      { id: 's4', name: 'Summary Tabulations', status: 'in_progress', assignee: 'PV Team' },
      { id: 's5', name: 'Signal Evaluation', status: 'not_started', assignee: 'Dr. Sarah Kim' },
      { id: 's6', name: 'Benefit-Risk Analysis', status: 'not_started', assignee: 'Dr. Lisa Park' },
    ],
    healthAuthorities: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
  },
  {
    id: 'RPT-2025-002',
    type: 'PMCF',
    product: 'SmartStent Pro',
    reportingPeriod: { start: '2024-01-01', end: '2024-12-31' },
    status: 'under_review',
    dueDate: '2025-02-15',
    author: 'Dr. Robert Chen',
    reviewer: 'Clinical Director',
    sections: [
      {
        id: 's1',
        name: 'Clinical Evaluation Update',
        status: 'approved',
        assignee: 'Dr. Robert Chen',
      },
      { id: 's2', name: 'Complaint Analysis', status: 'complete', assignee: 'QA Team' },
      { id: 's3', name: 'Literature Review', status: 'complete', assignee: 'Medical Affairs' },
      { id: 's4', name: 'Registry Data Analysis', status: 'complete', assignee: 'Biostatistics' },
    ],
    healthAuthorities: ['EMA (Notified Body)'],
  },
];

const MOCK_VIGILANCE: VigilanceCase[] = [
  {
    id: 'VIG-2025-0023',
    type: 'SAE',
    product: 'CardioGuard 50mg',
    eventDate: '2025-01-18',
    reportDate: '2025-01-20',
    description: 'Patient hospitalized with severe hypotension after dose increase',
    seriousness: 'hospitalization',
    outcome: 'recovering',
    reportedTo: ['FDA'],
    status: 'reported',
    reportingDeadline: '2025-02-04',
    causality: 'probable',
  },
  {
    id: 'VIG-2025-0024',
    type: 'MDR',
    product: 'SmartStent Pro',
    eventDate: '2025-01-15',
    reportDate: '2025-01-16',
    description: 'Device migration detected during follow-up imaging',
    seriousness: 'other_serious',
    outcome: 'not_recovered',
    reportedTo: [],
    status: 'assessment',
    reportingDeadline: '2025-02-15',
    causality: 'pending',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dashboard Metrics Component
 */
function PMSMetrics({
  signals,
  reports,
  vigilance,
}: {
  signals: SafetySignal[];
  reports: PeriodicReport[];
  vigilance: VigilanceCase[];
}) {
  const activeSignals = signals.filter(s => !['closed', 'refuted'].includes(s.status)).length;
  const highPrioritySignals = signals.filter(
    s => s.priority === 'high' && s.status === 'under_evaluation'
  ).length;
  const pendingReports = reports.filter(r => r.status !== 'submitted').length;
  const overdueReports = reports.filter(
    r => new Date(r.dueDate) < new Date() && r.status !== 'submitted'
  ).length;
  const openVigilance = vigilance.filter(v => v.status !== 'closed').length;
  const urgentVigilance = vigilance.filter(v => {
    const deadline = new Date(v.reportingDeadline);
    const daysRemaining = (deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysRemaining <= 7 && v.status !== 'closed';
  }).length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Active Signals</p>
              <p className="text-base font-semibold">{activeSignals}</p>
            </div>
            <Activity className="w-8 h-8 text-stone-900" />
          </div>
        </div>
      </div>

      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">High Priority</p>
              <p className="text-base font-semibold text-stone-700">{highPrioritySignals}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-stone-900" />
          </div>
        </div>
      </div>

      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Pending Reports</p>
              <p className="text-base font-semibold">{pendingReports}</p>
            </div>
            <FileText className="w-8 h-8 text-stone-900" />
          </div>
        </div>
      </div>

      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Overdue</p>
              <p className="text-base font-semibold text-stone-600">{overdueReports}</p>
            </div>
            <Clock className="w-8 h-8 text-stone-900" />
          </div>
        </div>
      </div>

      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Open Vigilance</p>
              <p className="text-base font-semibold">{openVigilance}</p>
            </div>
            <Shield className="w-8 h-8 text-stone-500" />
          </div>
        </div>
      </div>

      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Urgent Cases</p>
              <p className="text-base font-semibold text-stone-700">{urgentVigilance}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-stone-900" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Signal Management Tab
 */
function SignalManagement({ signals }: { signals: SafetySignal[] }) {
  const [selectedSignal, setSelectedSignal] = useState<SafetySignal | null>(null);

  if (selectedSignal) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => setSelectedSignal(null)}>
          ← Back to Signals
        </Button>

        <div className="border border-border/40 rounded-sm bg-background">
          <div className="px-3 py-2 border-b border-border/30">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  {selectedSignal.name}
                  <Badge variant={selectedSignal.priority === 'high' ? 'destructive' : 'outline'}>
                    {selectedSignal.priority}
                  </Badge>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedSignal.product}</p>
              </div>
              <Badge
                variant={
                  selectedSignal.status === 'confirmed'
                    ? 'default'
                    : selectedSignal.status === 'refuted'
                      ? 'secondary'
                      : 'outline'
                }
              >
                {selectedSignal.status.replace('_', ' ')}
              </Badge>
            </div>
          </div>
          <div className="px-3 py-2 space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="border border-border/40 rounded-sm bg-background">
                <div className="px-3 py-2 p-4">
                  <p className="text-sm text-muted-foreground">Observed Cases</p>
                  <p className="text-base font-semibold">{selectedSignal.caseCount}</p>
                </div>
              </div>
              <div className="border border-border/40 rounded-sm bg-background">
                <div className="px-3 py-2 p-4">
                  <p className="text-sm text-muted-foreground">Expected Cases</p>
                  <p className="text-base font-semibold">{selectedSignal.expectedCount}</p>
                </div>
              </div>
              <div className="border border-border/40 rounded-sm bg-background">
                <div className="px-3 py-2 p-4">
                  <p className="text-sm text-muted-foreground">Risk Score</p>
                  <p
                    className={`text-base font-semibold ${
                      selectedSignal.riskScore >= 70
                        ? 'text-stone-700'
                        : selectedSignal.riskScore >= 50
                          ? 'text-stone-600'
                          : 'text-stone-700'
                    }`}
                  >
                    {selectedSignal.riskScore}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">Description</Label>
              <p className="mt-1">{selectedSignal.description}</p>
            </div>

            <div>
              <Label className="text-muted-foreground">Data Sources</Label>
              <div className="flex gap-2 mt-1">
                {selectedSignal.sourceData.map(source => (
                  <Badge key={source} variant="outline">
                    {source}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">Assessment History</Label>
              <div className="mt-2 space-y-3">
                {selectedSignal.assessments.map((assessment, idx) => (
                  <div key={idx} className="border border-border/40 rounded-sm bg-background">
                    <div className="px-3 py-2 p-4">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-medium">{assessment.assessor}</span>
                        <span className="text-sm text-muted-foreground">{assessment.date}</span>
                      </div>
                      <p className="text-sm mb-2">
                        <strong>Conclusion:</strong> {assessment.conclusion}
                      </p>
                      <p className="text-sm">
                        <strong>Recommendation:</strong> {assessment.recommendation}
                      </p>
                      {assessment.nextReviewDate && (
                        <p className="text-sm text-muted-foreground mt-2">
                          Next review: {assessment.nextReviewDate}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button>Add Assessment</Button>
              <Button variant="outline">Request Data</Button>
              <Button variant="outline">Generate Report</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Safety Signal Detection</h3>
          <p className="text-sm text-muted-foreground">
            Monitor and evaluate potential safety signals across products
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Signal
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Signal ID</TableHead>
            <TableHead>Signal Name</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Cases</TableHead>
            <TableHead>Risk Score</TableHead>
            <TableHead>Assignee</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {signals.map(signal => (
            <TableRow
              key={signal.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => setSelectedSignal(signal)}
            >
              <TableCell className="font-mono">{signal.id}</TableCell>
              <TableCell className="font-medium">{signal.name}</TableCell>
              <TableCell>{signal.product}</TableCell>
              <TableCell>
                <Badge variant={signal.priority === 'high' ? 'destructive' : 'outline'}>
                  {signal.priority}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    signal.status === 'confirmed'
                      ? 'default'
                      : signal.status === 'refuted'
                        ? 'secondary'
                        : 'outline'
                  }
                >
                  {signal.status.replace('_', ' ')}
                </Badge>
              </TableCell>
              <TableCell>
                <span
                  className={
                    signal.caseCount > signal.expectedCount * 2 ? 'text-stone-700 font-medium' : ''
                  }
                >
                  {signal.caseCount}
                </span>
                <span className="text-muted-foreground"> / {signal.expectedCount} exp</span>
              </TableCell>
              <TableCell>
                <span
                  className={`font-medium ${
                    signal.riskScore >= 70
                      ? 'text-stone-700'
                      : signal.riskScore >= 50
                        ? 'text-stone-600'
                        : 'text-stone-700'
                  }`}
                >
                  {signal.riskScore}
                </span>
              </TableCell>
              <TableCell>{signal.assignedTo}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* RI Signal Detection */}
      <div className="border border-border/40 rounded-sm bg-background border-stone-200 bg-stone-50">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-stone-200 rounded-full">
              <Sparkles className="w-6 h-6 text-stone-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-stone-900">RI Signal Detection</h3>
              <p className="text-sm text-stone-700">
                Automated signal detection using disproportionality analysis, machine learning, and
                natural language processing of case narratives.
              </p>
            </div>
            <Button className="bg-stone-600 hover:bg-stone-700">Run Analysis</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Periodic Reports Tab
 */
function PeriodicReports({ reports }: { reports: PeriodicReport[] }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Periodic Reports</h3>
          <p className="text-sm text-muted-foreground">
            PSUR, PBRER, PMCF, and other periodic safety reporting
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Report
        </Button>
      </div>

      <div className="grid gap-4">
        {reports.map(report => {
          const completedSections = report.sections.filter(
            s => s.status === 'complete' || s.status === 'approved'
          ).length;
          const progress = (completedSections / report.sections.length) * 100;
          const daysRemaining = Math.floor(
            (new Date(report.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );
          const isOverdue = daysRemaining < 0;

          return (
            <div key={report.id} className={`border border-border/40 rounded-sm bg-background ${isOverdue ? 'border-stone-300' : ''}`}>
              <div className="px-3 py-2 p-4">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-stone-100 rounded-lg">
                      {REPORT_TYPE_LABELS[report.type].icon}
                    </div>
                    <div>
                      <h4 className="font-semibold flex items-center gap-2">
                        {report.id}
                        <Badge variant="outline">{REPORT_TYPE_LABELS[report.type].label}</Badge>
                      </h4>
                      <p className="text-sm text-muted-foreground">{report.product}</p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      report.status === 'submitted'
                        ? 'default'
                        : report.status === 'approved'
                          ? 'secondary'
                          : 'outline'
                    }
                  >
                    {report.status.replace('_', ' ')}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Reporting Period</p>
                    <p className="text-sm">
                      {report.reportingPeriod.start} to {report.reportingPeriod.end}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Due Date</p>
                    <p className={`text-sm ${isOverdue ? 'text-stone-700 font-medium' : ''}`}>
                      {report.dueDate}
                      {isOverdue && ' (Overdue)'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Health Authorities</p>
                    <div className="flex gap-1 flex-wrap">
                      {report.healthAuthorities.map(ha => (
                        <Badge key={ha} variant="outline" className="text-xs">
                          {ha}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Section Progress</span>
                    <span>
                      {completedSections}/{report.sections.length} complete
                    </span>
                  </div>
                  <Progress value={progress} />
                </div>

                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline">
                    View Details
                  </Button>
                  <Button size="sm" variant="outline">
                    <Download className="w-4 h-4 mr-1" />
                    Export
                  </Button>
                  {report.status === 'approved' && (
                    <Button size="sm">
                      <Send className="w-4 h-4 mr-1" />
                      Submit
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reporting Calendar */}
      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 border-b border-border/30">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Reporting Calendar
          </h3>
        </div>
        <div className="px-3 py-2">
          <div className="text-center text-muted-foreground py-8">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Interactive reporting calendar showing upcoming deadlines</p>
            <Button variant="outline" className="mt-4">
              View Full Calendar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Vigilance Reporting Tab
 */
function VigilanceReporting({ cases }: { cases: VigilanceCase[] }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Vigilance Cases</h3>
          <p className="text-sm text-muted-foreground">
            Track and report serious adverse events and device incidents
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Case
        </Button>
      </div>

      {/* Timeline Alerts */}
      <div className="grid grid-cols-5 gap-2">
        {Object.entries(VIGILANCE_TIMELINES).map(([type, config]) => (
          <div key={type} className="border border-border/40 rounded-sm bg-background p-3">
            <div className="flex items-center gap-2 text-sm">
              {config.icon}
              <div>
                <p className="font-medium">{config.label}</p>
                <p className="text-xs text-muted-foreground">{config.deadline}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Case ID</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Seriousness</TableHead>
            <TableHead>Causality</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Deadline</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cases.map(c => {
            const daysToDeadline = Math.floor(
              (new Date(c.reportingDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );
            const isUrgent = daysToDeadline <= 7;

            return (
              <TableRow key={c.id} className={isUrgent ? 'bg-stone-100' : ''}>
                <TableCell className="font-mono">{c.id}</TableCell>
                <TableCell>
                  <Badge variant="outline">{VIGILANCE_TIMELINES[c.type].label}</Badge>
                </TableCell>
                <TableCell>{c.product}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      c.seriousness === 'death'
                        ? 'destructive'
                        : c.seriousness === 'life_threatening'
                          ? 'destructive'
                          : 'outline'
                    }
                  >
                    {c.seriousness.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      c.causality === 'certain'
                        ? 'destructive'
                        : c.causality === 'probable'
                          ? 'default'
                          : 'outline'
                    }
                  >
                    {c.causality}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={c.status === 'reported' ? 'default' : 'outline'}>
                    {c.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className={isUrgent ? 'text-stone-700 font-medium' : ''}>
                    {c.reportingDeadline}
                    {isUrgent && daysToDeadline > 0 && ` (${daysToDeadline}d)`}
                    {daysToDeadline <= 0 && ' (Overdue!)'}
                  </span>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline">
                    {c.status === 'assessment' ? 'Complete Assessment' : 'View'}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Risk-Benefit Analysis Tab
 */
function RiskBenefitTab() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Benefit-Risk Analysis</h3>
          <p className="text-sm text-muted-foreground">
            Structured benefit-risk evaluation for marketed products
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Analysis
        </Button>
      </div>

      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 border-b border-border/30">
          <h3 className="text-sm font-semibold">CardioGuard 50mg - Benefit-Risk Summary</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Last updated: 2025-01-15</p>
        </div>
        <div className="px-3 py-2">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Benefits */}
            <div>
              <h4 className="font-semibold text-stone-800 flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5" />
                Benefits
              </h4>
              <div className="space-y-3">
                <div className="p-3 bg-stone-100 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium">Cardiovascular Event Reduction</span>
                    <span className="text-sm text-stone-800">Weight: 40%</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    32% reduction in major cardiovascular events vs placebo
                  </p>
                </div>
                <div className="p-3 bg-stone-100 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium">Mortality Benefit</span>
                    <span className="text-sm text-stone-800">Weight: 35%</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    18% reduction in all-cause mortality
                  </p>
                </div>
                <div className="p-3 bg-stone-100 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium">Quality of Life</span>
                    <span className="text-sm text-stone-800">Weight: 25%</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Significant improvement in functional capacity
                  </p>
                </div>
              </div>
            </div>

            {/* Risks */}
            <div>
              <h4 className="font-semibold text-stone-800 flex items-center gap-2 mb-3">
                <TrendingDown className="w-5 h-5" />
                Risks
              </h4>
              <div className="space-y-3">
                <div className="p-3 bg-stone-100 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium">Hepatotoxicity Risk</span>
                    <span className="text-sm text-stone-800">Weight: 30%</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    0.5% incidence of elevated liver enzymes &gt; 3x ULN
                  </p>
                  <p className="text-xs text-stone-600 mt-1">
                    Mitigation: Liver function monitoring
                  </p>
                </div>
                <div className="p-3 bg-stone-100 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium">Hypotension</span>
                    <span className="text-sm text-stone-800">Weight: 25%</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    5% incidence of symptomatic hypotension
                  </p>
                  <p className="text-xs text-stone-600 mt-1">Mitigation: Gradual dose titration</p>
                </div>
                <div className="p-3 bg-stone-100 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium">Drug Interactions</span>
                    <span className="text-sm text-stone-700">Weight: 20%</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    CYP3A4 inhibitor interactions require monitoring
                  </p>
                  <p className="text-xs text-stone-600 mt-1">
                    Mitigation: Contraindication labeling
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Conclusion */}
          <div className="mt-6 p-4 bg-stone-100 rounded-lg">
            <h4 className="font-semibold text-stone-800 mb-2">Overall Conclusion</h4>
            <div className="flex items-center gap-3">
              <Badge className="bg-stone-700">Favorable</Badge>
              <p className="text-sm text-stone-700">
                The benefit-risk balance remains favorable for the approved indication when used in
                accordance with the prescribing information.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* RI Assistance */}
      <div className="border border-border/40 rounded-sm bg-background border-stone-200 bg-stone-50">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-stone-200 rounded-full">
              <Sparkles className="w-6 h-6 text-stone-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-stone-900">RI Risk-Benefit Analysis</h3>
              <p className="text-sm text-stone-700">
                Generate structured benefit-risk analysis using the PrOACT-URL framework,
                incorporating latest safety data and literature evidence.
              </p>
            </div>
            <Button className="bg-stone-600 hover:bg-stone-700">Generate Analysis</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Main Post-Market Surveillance Component
 */
export function PostMarketSurveillance() {
  const [signals] = useState<SafetySignal[]>(MOCK_SIGNALS);
  const [reports] = useState<PeriodicReport[]>(MOCK_REPORTS);
  const [vigilance] = useState<VigilanceCase[]>(MOCK_VIGILANCE);

  return (
    <div className="p-6 space-y-6">
      {/* Beta Banner */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-stone-50 border border-stone-200 text-stone-600 text-xs">
        <span className="font-semibold px-1.5 py-0.5 bg-stone-200 text-stone-700 rounded text-xs uppercase tracking-wider">Beta</span>
        <span>This module is in beta. Data shown may be illustrative while integration is finalized.</span>
      </div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold flex items-center gap-3">
            <Shield className="w-8 h-8 text-stone-600" />
            Post-Market Surveillance
          </h1>
          <p className="text-muted-foreground">
            Safety monitoring, signal detection, and periodic reporting
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Globe className="w-4 h-4 mr-2" />
            Global Dashboard
          </Button>
          <Button variant="outline">
            <BarChart3 className="w-4 h-4 mr-2" />
            Analytics
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <PMSMetrics signals={signals} reports={reports} vigilance={vigilance} />

      {/* Main Content Tabs */}
      <Tabs defaultValue="signals">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="signals">Signal Detection</TabsTrigger>
          <TabsTrigger value="reports">Periodic Reports</TabsTrigger>
          <TabsTrigger value="vigilance">Vigilance</TabsTrigger>
          <TabsTrigger value="benefit-risk">Benefit-Risk</TabsTrigger>
        </TabsList>

        <TabsContent value="signals" className="mt-6">
          <SignalManagement signals={signals} />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <PeriodicReports reports={reports} />
        </TabsContent>

        <TabsContent value="vigilance" className="mt-6">
          <VigilanceReporting cases={vigilance} />
        </TabsContent>

        <TabsContent value="benefit-risk" className="mt-6">
          <RiskBenefitTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default PostMarketSurveillance;
