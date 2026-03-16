/**
 * Concept2Cure - CAPA (Corrective and Preventive Action) Management
 *
 * Comprehensive CAPA workflow supporting:
 * - Complaint-driven CAPAs
 * - Audit finding CAPAs
 * - Internal nonconformance CAPAs
 * - Risk-based prioritization
 * - Effectiveness verification
 * - Root cause analysis (5 Why, Fishbone)
 *
 * @module components/regulatory/CAPAManagement
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileWarning,
  Plus,
  Search,
  TrendingUp,
  XCircle,
  Brain,
  GitBranch,
  ClipboardList,
  Users,
  Calendar,
  BarChart3,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type CAPASource =
  | 'complaint'
  | 'audit_internal'
  | 'audit_external'
  | 'deviation'
  | 'nonconformance'
  | 'risk_assessment'
  | 'management_review'
  | 'regulatory_observation';

type CAPAType = 'corrective' | 'preventive' | 'both';

type CAPAPriority = 'critical' | 'major' | 'minor';

type CAPAStatus =
  | 'open'
  | 'investigation'
  | 'root_cause_identified'
  | 'action_planning'
  | 'implementation'
  | 'verification'
  | 'effectiveness_check'
  | 'closed'
  | 'closed_ineffective';

interface RootCauseAnalysis {
  method: '5why' | 'fishbone' | 'fmea' | 'other';
  findings: string[];
  rootCause: string;
  contributingFactors: string[];
  performedBy: string;
  date: string;
}

interface CAPAAction {
  id: string;
  description: string;
  assignee: string;
  dueDate: string;
  completedDate?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  evidence?: string;
}

interface EffectivenessCheck {
  id: string;
  checkDate: string;
  method: string;
  result: 'effective' | 'partially_effective' | 'ineffective';
  evidence: string;
  performedBy: string;
  notes: string;
}

interface CAPA {
  id: string;
  title: string;
  description: string;
  source: CAPASource;
  sourceReference: string; // e.g., complaint number, audit finding ID
  type: CAPAType;
  priority: CAPAPriority;
  status: CAPAStatus;
  product?: string;
  department: string;
  owner: string;
  initiatedDate: string;
  targetCloseDate: string;
  actualCloseDate?: string;
  rootCauseAnalysis?: RootCauseAnalysis;
  actions: CAPAAction[];
  effectivenessChecks: EffectivenessCheck[];
  relatedCAPAs: string[];
  riskScore?: number;
  regulatoryImpact: boolean;
  customerImpact: boolean;
  history: { date: string; action: string; user: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<CAPASource, string> = {
  complaint: 'Customer Complaint',
  audit_internal: 'Internal Audit',
  audit_external: 'External Audit / Inspection',
  deviation: 'Process Deviation',
  nonconformance: 'Nonconformance',
  risk_assessment: 'Risk Assessment',
  management_review: 'Management Review',
  regulatory_observation: 'Regulatory Observation',
};

const STATUS_CONFIG: Record<CAPAStatus, { label: string; color: string; icon: React.ReactNode }> = {
  open: {
    label: 'Open',
    color: 'bg-blue-100 text-blue-800',
    icon: <FileWarning className="w-4 h-4" />,
  },
  investigation: {
    label: 'Investigation',
    color: 'bg-yellow-100 text-yellow-800',
    icon: <Search className="w-4 h-4" />,
  },
  root_cause_identified: {
    label: 'Root Cause Identified',
    color: 'bg-purple-100 text-purple-800',
    icon: <GitBranch className="w-4 h-4" />,
  },
  action_planning: {
    label: 'Action Planning',
    color: 'bg-indigo-100 text-indigo-800',
    icon: <ClipboardList className="w-4 h-4" />,
  },
  implementation: {
    label: 'Implementation',
    color: 'bg-orange-100 text-orange-800',
    icon: <ArrowRight className="w-4 h-4" />,
  },
  verification: {
    label: 'Verification',
    color: 'bg-cyan-100 text-cyan-800',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  effectiveness_check: {
    label: 'Effectiveness Check',
    color: 'bg-teal-100 text-teal-800',
    icon: <TrendingUp className="w-4 h-4" />,
  },
  closed: {
    label: 'Closed',
    color: 'bg-green-100 text-green-800',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  closed_ineffective: {
    label: 'Closed - Ineffective',
    color: 'bg-red-100 text-red-800',
    icon: <XCircle className="w-4 h-4" />,
  },
};

const PRIORITY_CONFIG: Record<CAPAPriority, { label: string; color: string; daysToClose: number }> =
  {
    critical: { label: 'Critical', color: 'bg-red-500 text-white', daysToClose: 30 },
    major: { label: 'Major', color: 'bg-orange-500 text-white', daysToClose: 60 },
    minor: { label: 'Minor', color: 'bg-yellow-500 text-white', daysToClose: 90 },
  };

// Mock data
const MOCK_CAPAS: CAPA[] = [
  {
    id: 'CAPA-2025-001',
    title: 'Label Error - Incorrect Dosing Instructions',
    description:
      'Customer complaint reported incorrect dosing frequency on product labeling for SKU-12345',
    source: 'complaint',
    sourceReference: 'COMP-2025-0142',
    type: 'corrective',
    priority: 'critical',
    status: 'implementation',
    product: 'CardioGuard 50mg',
    department: 'Quality Assurance',
    owner: 'Sarah Chen',
    initiatedDate: '2025-01-15',
    targetCloseDate: '2025-02-15',
    rootCauseAnalysis: {
      method: '5why',
      findings: [
        'Why was the label incorrect? Template not updated after formulation change',
        "Why wasn't template updated? Change control process not followed",
        "Why wasn't change control followed? Training incomplete for new staff",
        'Why was training incomplete? Training matrix not current',
        "Why wasn't training matrix current? QA resource constraints",
      ],
      rootCause: 'Inadequate training program for change control process',
      contributingFactors: ['Resource constraints', 'Document control gaps'],
      performedBy: 'Michael Torres',
      date: '2025-01-18',
    },
    actions: [
      {
        id: 'ACT-001',
        description: 'Update all affected label templates',
        assignee: 'Jennifer Lee',
        dueDate: '2025-01-25',
        completedDate: '2025-01-24',
        status: 'completed',
        evidence: 'DOC-REV-456',
      },
      {
        id: 'ACT-002',
        description: 'Conduct change control training for all QA staff',
        assignee: 'Training Dept',
        dueDate: '2025-02-01',
        status: 'in_progress',
      },
      {
        id: 'ACT-003',
        description: 'Update training matrix and SOP',
        assignee: 'Sarah Chen',
        dueDate: '2025-02-05',
        status: 'pending',
      },
    ],
    effectivenessChecks: [],
    relatedCAPAs: [],
    riskScore: 85,
    regulatoryImpact: true,
    customerImpact: true,
    history: [
      { date: '2025-01-15', action: 'CAPA Initiated', user: 'Sarah Chen' },
      { date: '2025-01-18', action: 'Root Cause Analysis Completed', user: 'Michael Torres' },
      { date: '2025-01-20', action: 'Action Plan Approved', user: 'David Kim' },
    ],
  },
  {
    id: 'CAPA-2025-002',
    title: 'Sterility Test Failure Trend',
    description:
      'Trending increase in sterility test failures in cleanroom area C over past 3 months',
    source: 'deviation',
    sourceReference: 'DEV-2025-0089',
    type: 'preventive',
    priority: 'major',
    status: 'root_cause_identified',
    product: 'BioPure Injectable',
    department: 'Manufacturing',
    owner: 'Robert Martinez',
    initiatedDate: '2025-01-10',
    targetCloseDate: '2025-03-10',
    rootCauseAnalysis: {
      method: 'fishbone',
      findings: [
        'Equipment: HVAC filter replacement overdue',
        'Method: Gowning procedure not consistently followed',
        'Environment: Seasonal humidity variations affecting controls',
      ],
      rootCause: 'HVAC preventive maintenance schedule not adequate for high-use area',
      contributingFactors: ['Personnel training gaps', 'Environmental monitoring frequency'],
      performedBy: 'Technical Services',
      date: '2025-01-22',
    },
    actions: [],
    effectivenessChecks: [],
    relatedCAPAs: ['CAPA-2024-089'],
    riskScore: 72,
    regulatoryImpact: true,
    customerImpact: false,
    history: [
      { date: '2025-01-10', action: 'CAPA Initiated', user: 'Robert Martinez' },
      { date: '2025-01-22', action: 'Root Cause Analysis Completed', user: 'Technical Services' },
    ],
  },
  {
    id: 'CAPA-2025-003',
    title: 'FDA 483 Observation - Document Control',
    description: 'FDA inspection observation regarding outdated SOPs found in production area',
    source: 'regulatory_observation',
    sourceReference: '483-2025-01',
    type: 'both',
    priority: 'critical',
    status: 'action_planning',
    department: 'Document Control',
    owner: 'Lisa Park',
    initiatedDate: '2025-01-20',
    targetCloseDate: '2025-02-20',
    actions: [],
    effectivenessChecks: [],
    relatedCAPAs: [],
    riskScore: 92,
    regulatoryImpact: true,
    customerImpact: false,
    history: [{ date: '2025-01-20', action: 'CAPA Initiated from 483', user: 'Lisa Park' }],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CAPA Dashboard Metrics
 */
function CAPAMetrics({ capas }: { capas: CAPA[] }) {
  const metrics = useMemo(() => {
    const open = capas.filter(c => !c.status.startsWith('closed')).length;
    const overdue = capas.filter(c => {
      if (c.status.startsWith('closed')) return false;
      return new Date(c.targetCloseDate) < new Date();
    }).length;
    const critical = capas.filter(
      c => c.priority === 'critical' && !c.status.startsWith('closed')
    ).length;
    const regulatory = capas.filter(
      c => c.regulatoryImpact && !c.status.startsWith('closed')
    ).length;
    const avgDaysOpen =
      capas
        .filter(c => !c.status.startsWith('closed'))
        .reduce((acc, c) => {
          const days = Math.floor(
            (Date.now() - new Date(c.initiatedDate).getTime()) / (1000 * 60 * 60 * 24)
          );
          return acc + days;
        }, 0) / (open || 1);

    return { open, overdue, critical, regulatory, avgDaysOpen: Math.round(avgDaysOpen) };
  }, [capas]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Open CAPAs</p>
              <p className="text-2xl font-bold">{metrics.open}</p>
            </div>
            <FileWarning className="w-8 h-8 text-blue-500" />
          </div>
        </div>
      </div>

      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Overdue</p>
              <p className="text-2xl font-bold text-red-600">{metrics.overdue}</p>
            </div>
            <Clock className="w-8 h-8 text-red-500" />
          </div>
        </div>
      </div>

      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Critical</p>
              <p className="text-2xl font-bold text-orange-600">{metrics.critical}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Regulatory</p>
              <p className="text-2xl font-bold text-purple-600">{metrics.regulatory}</p>
            </div>
            <FileWarning className="w-8 h-8 text-purple-500" />
          </div>
        </div>
      </div>

      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Avg Days Open</p>
              <p className="text-2xl font-bold">{metrics.avgDaysOpen}</p>
            </div>
            <Calendar className="w-8 h-8 text-gray-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * CAPA Status Badge
 */
function StatusBadge({ status }: { status: CAPAStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge className={`${config.color} flex items-center gap-1`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}

/**
 * Priority Badge
 */
function PriorityBadge({ priority }: { priority: CAPAPriority }) {
  const config = PRIORITY_CONFIG[priority];
  return <Badge className={config.color}>{config.label}</Badge>;
}

/**
 * Root Cause Analysis Panel
 */
function RootCausePanel({
  capa,
  onUpdate,
}: {
  capa: CAPA;
  onUpdate: (rca: RootCauseAnalysis) => void;
}) {
  const [method, setMethod] = useState<RootCauseAnalysis['method']>('5why');
  const [findings, setFindings] = useState<string[]>(['', '', '', '', '']);
  const [rootCause, setRootCause] = useState('');

  const handleSave = () => {
    onUpdate({
      method,
      findings: findings.filter(f => f.trim()),
      rootCause,
      contributingFactors: [],
      performedBy: 'Current User',
      date: new Date().toISOString().split('T')[0],
    });
  };

  return (
    <div className="border border-border/40 rounded-sm bg-background">
      <div className="px-3 py-2 border-b border-border/30">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Brain className="w-5 h-5" />
          Root Cause Analysis
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Perform structured root cause analysis to identify the underlying issue
        </p>
      </div>
      <div className="px-3 py-2 space-y-4">
        <div>
          <Label>Analysis Method</Label>
          <Select value={method} onValueChange={v => setMethod(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5why">5 Why Analysis</SelectItem>
              <SelectItem value="fishbone">Fishbone (Ishikawa) Diagram</SelectItem>
              <SelectItem value="fmea">FMEA</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {method === '5why' && (
          <div className="space-y-3">
            <Label>5 Why Questions</Label>
            {findings.map((finding, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-sm font-medium w-16">Why {idx + 1}:</span>
                <Input
                  value={finding}
                  onChange={e => {
                    const newFindings = [...findings];
                    newFindings[idx] = e.target.value;
                    setFindings(newFindings);
                  }}
                  placeholder={`Enter why statement ${idx + 1}...`}
                />
              </div>
            ))}
          </div>
        )}

        {method === 'fishbone' && (
          <div className="grid grid-cols-2 gap-4">
            {['People', 'Process', 'Equipment', 'Materials', 'Environment', 'Measurement'].map(
              category => (
                <div key={category}>
                  <Label>{category}</Label>
                  <Textarea placeholder={`${category} factors...`} className="h-20" />
                </div>
              )
            )}
          </div>
        )}

        <div>
          <Label>Root Cause Statement</Label>
          <Textarea
            value={rootCause}
            onChange={e => setRootCause(e.target.value)}
            placeholder="Based on the analysis, the root cause is..."
            className="h-24"
          />
        </div>

        <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg">
          <Sparkles className="w-5 h-5 text-purple-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-purple-800">RI Analysis</p>
            <p className="text-xs text-purple-600">
              Analyze similar CAPAs and suggest potential root causes based on historical data
            </p>
          </div>
          <Button variant="outline" size="sm">
            Analyze
          </Button>
        </div>

        <Button onClick={handleSave} className="w-full">
          Save Root Cause Analysis
        </Button>
      </div>
    </div>
  );
}

/**
 * Action Items Panel
 */
function ActionsPanel({ capa }: { capa: CAPA }) {
  const [newAction, setNewAction] = useState({ description: '', assignee: '', dueDate: '' });

  return (
    <div className="border border-border/40 rounded-sm bg-background">
      <div className="px-3 py-2 border-b border-border/30">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ClipboardList className="w-5 h-5" />
          Corrective/Preventive Actions
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Track actions to address root cause and prevent recurrence
        </p>
      </div>
      <div className="px-3 py-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {capa.actions.map(action => (
              <TableRow key={action.id}>
                <TableCell className="font-medium">{action.description}</TableCell>
                <TableCell>{action.assignee}</TableCell>
                <TableCell>{action.dueDate}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      action.status === 'completed'
                        ? 'default'
                        : action.status === 'overdue'
                          ? 'destructive'
                          : 'outline'
                    }
                  >
                    {action.status.replace('_', ' ')}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="mt-4 p-4 border rounded-lg space-y-3">
          <h4 className="font-medium">Add New Action</h4>
          <div className="grid grid-cols-3 gap-3">
            <Input
              placeholder="Action description"
              value={newAction.description}
              onChange={e => setNewAction({ ...newAction, description: e.target.value })}
            />
            <Input
              placeholder="Assignee"
              value={newAction.assignee}
              onChange={e => setNewAction({ ...newAction, assignee: e.target.value })}
            />
            <Input
              type="date"
              value={newAction.dueDate}
              onChange={e => setNewAction({ ...newAction, dueDate: e.target.value })}
            />
          </div>
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Add Action
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Effectiveness Check Panel
 */
function EffectivenessPanel({ capa }: { capa: CAPA }) {
  return (
    <div className="border border-border/40 rounded-sm bg-background">
      <div className="px-3 py-2 border-b border-border/30">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Effectiveness Verification
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Verify that corrective actions have been effective in addressing the root cause
        </p>
      </div>
      <div className="px-3 py-2">
        {capa.effectivenessChecks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No effectiveness checks recorded yet</p>
            <p className="text-sm">
              Effectiveness checks should be performed after all actions are complete
            </p>
            <Button className="mt-4" variant="outline">
              <Plus className="w-4 h-4 mr-1" />
              Schedule Effectiveness Check
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Check Date</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Performed By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {capa.effectivenessChecks.map(check => (
                <TableRow key={check.id}>
                  <TableCell>{check.checkDate}</TableCell>
                  <TableCell>{check.method}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        check.result === 'effective'
                          ? 'default'
                          : check.result === 'ineffective'
                            ? 'destructive'
                            : 'outline'
                      }
                    >
                      {check.result.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>{check.performedBy}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

/**
 * CAPA Detail View
 */
function CAPADetail({ capa, onClose }: { capa: CAPA; onClose: () => void }) {
  const daysOpen = Math.floor(
    (Date.now() - new Date(capa.initiatedDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysRemaining = Math.floor(
    (new Date(capa.targetCloseDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  const isOverdue = daysRemaining < 0;

  const completedActions = capa.actions.filter(a => a.status === 'completed').length;
  const totalActions = capa.actions.length;
  const progress = totalActions > 0 ? (completedActions / totalActions) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">{capa.id}</h2>
          <p className="text-lg text-muted-foreground">{capa.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <PriorityBadge priority={capa.priority} />
          <StatusBadge status={capa.status} />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="border border-border/40 rounded-sm bg-background">
          <div className="px-3 py-2 p-4">
            <p className="text-sm text-muted-foreground">Days Open</p>
            <p className="text-2xl font-bold">{daysOpen}</p>
          </div>
        </div>
        <div className="border border-border/40 rounded-sm bg-background">
          <div className="px-3 py-2 p-4">
            <p className="text-sm text-muted-foreground">
              {isOverdue ? 'Days Overdue' : 'Days Remaining'}
            </p>
            <p className={`text-2xl font-bold ${isOverdue ? 'text-red-600' : ''}`}>
              {Math.abs(daysRemaining)}
            </p>
          </div>
        </div>
        <div className="border border-border/40 rounded-sm bg-background">
          <div className="px-3 py-2 p-4">
            <p className="text-sm text-muted-foreground">Actions Progress</p>
            <div className="flex items-center gap-2">
              <Progress value={progress} className="flex-1" />
              <span className="text-sm">
                {completedActions}/{totalActions}
              </span>
            </div>
          </div>
        </div>
        <div className="border border-border/40 rounded-sm bg-background">
          <div className="px-3 py-2 p-4">
            <p className="text-sm text-muted-foreground">Risk Score</p>
            <p
              className={`text-2xl font-bold ${
                (capa.riskScore || 0) >= 80
                  ? 'text-red-600'
                  : (capa.riskScore || 0) >= 50
                    ? 'text-orange-600'
                    : 'text-green-600'
              }`}
            >
              {capa.riskScore || 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 border-b border-border/30">
          <h3 className="text-sm font-semibold">CAPA Details</h3>
        </div>
        <div className="px-3 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Description</Label>
              <p className="mt-1">{capa.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Source</Label>
                <p className="mt-1">{SOURCE_LABELS[capa.source]}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Source Ref</Label>
                <p className="mt-1">{capa.sourceReference}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Owner</Label>
                <p className="mt-1">{capa.owner}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Department</Label>
                <p className="mt-1">{capa.department}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Type</Label>
                <p className="mt-1 capitalize">{capa.type}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Product</Label>
                <p className="mt-1">{capa.product || 'N/A'}</p>
              </div>
            </div>
          </div>
          <div className="flex gap-4 mt-4">
            {capa.regulatoryImpact && (
              <Badge variant="outline" className="border-red-500 text-red-600">
                Regulatory Impact
              </Badge>
            )}
            {capa.customerImpact && (
              <Badge variant="outline" className="border-orange-500 text-orange-600">
                Customer Impact
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Tabs for RCA, Actions, Effectiveness */}
      <Tabs defaultValue="rca">
        <TabsList>
          <TabsTrigger value="rca">Root Cause Analysis</TabsTrigger>
          <TabsTrigger value="actions">Actions ({capa.actions.length})</TabsTrigger>
          <TabsTrigger value="effectiveness">Effectiveness</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="rca">
          {capa.rootCauseAnalysis ? (
            <div className="border border-border/40 rounded-sm bg-background">
              <div className="px-3 py-2 border-b border-border/30">
                <h3 className="text-sm font-semibold">
                  Root Cause Analysis - {capa.rootCauseAnalysis.method.toUpperCase()}
                </h3>
              </div>
              <div className="px-3 py-2 space-y-4">
                <div>
                  <Label className="text-muted-foreground">Analysis Findings</Label>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    {capa.rootCauseAnalysis.findings.map((finding, idx) => (
                      <li key={idx}>{finding}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <Label className="text-muted-foreground">Root Cause</Label>
                  <p className="mt-1 p-3 bg-red-50 rounded-lg text-red-800">
                    {capa.rootCauseAnalysis.rootCause}
                  </p>
                </div>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>Performed by: {capa.rootCauseAnalysis.performedBy}</span>
                  <span>Date: {capa.rootCauseAnalysis.date}</span>
                </div>
              </div>
            </div>
          ) : (
            <RootCausePanel capa={capa} onUpdate={() => {}} />
          )}
        </TabsContent>

        <TabsContent value="actions">
          <ActionsPanel capa={capa} />
        </TabsContent>

        <TabsContent value="effectiveness">
          <EffectivenessPanel capa={capa} />
        </TabsContent>

        <TabsContent value="history">
          <div className="border border-border/40 rounded-sm bg-background">
            <div className="px-3 py-2 border-b border-border/30">
              <h3 className="text-sm font-semibold">CAPA History</h3>
            </div>
            <div className="px-3 py-2">
              <div className="space-y-4">
                {capa.history.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-3 border-l-2 border-blue-500">
                    <div className="text-sm text-muted-foreground w-24">{entry.date}</div>
                    <div className="flex-1">{entry.action}</div>
                    <div className="text-sm text-muted-foreground">{entry.user}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * New CAPA Form Dialog
 */
function NewCAPADialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New CAPA
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Initiate New CAPA</DialogTitle>
          <DialogDescription>
            Create a corrective or preventive action to address a quality issue
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div>
            <Label>Title</Label>
            <Input placeholder="Brief description of the issue" />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea placeholder="Detailed description of the issue and its impact" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Source</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Source Reference</Label>
              <Input placeholder="e.g., COMP-2025-001" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Type</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="corrective">Corrective</SelectItem>
                  <SelectItem value="preventive">Preventive</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical (30 days)</SelectItem>
                  <SelectItem value="major">Major (60 days)</SelectItem>
                  <SelectItem value="minor">Minor (90 days)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Department</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qa">Quality Assurance</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="rd">R&D</SelectItem>
                  <SelectItem value="regulatory">Regulatory Affairs</SelectItem>
                  <SelectItem value="clinical">Clinical Operations</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Owner</Label>
              <Input placeholder="CAPA owner name" />
            </div>
            <div>
              <Label>Product (if applicable)</Label>
              <Input placeholder="Product name or N/A" />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span className="text-sm">Regulatory Impact</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span className="text-sm">Customer Impact</span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => setOpen(false)}>Create CAPA</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Main CAPA Management Component
 */
export function CAPAManagement() {
  const [capas] = useState<CAPA[]>(MOCK_CAPAS);
  const [selectedCAPA, setSelectedCAPA] = useState<CAPA | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCAPAs = useMemo(() => {
    return capas.filter(capa => {
      if (filterStatus !== 'all' && capa.status !== filterStatus) return false;
      if (filterPriority !== 'all' && capa.priority !== filterPriority) return false;
      if (
        searchTerm &&
        !capa.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !capa.id.toLowerCase().includes(searchTerm.toLowerCase())
      )
        return false;
      return true;
    });
  }, [capas, filterStatus, filterPriority, searchTerm]);

  if (selectedCAPA) {
    return (
      <div className="p-6">
        <Button variant="outline" onClick={() => setSelectedCAPA(null)} className="mb-4">
          ← Back to CAPA List
        </Button>
        <CAPADetail capa={selectedCAPA} onClose={() => setSelectedCAPA(null)} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">CAPA Management</h1>
          <p className="text-muted-foreground">
            Corrective and Preventive Action tracking for quality management
          </p>
        </div>
        <NewCAPADialog />
      </div>

      {/* Metrics */}
      <CAPAMetrics capas={capas} />

      {/* Filters */}
      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search CAPAs..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([value, config]) => (
                  <SelectItem key={value} value={value}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter by priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="major">Major</SelectItem>
                <SelectItem value="minor">Minor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* CAPA List */}
      <div className="border border-border/40 rounded-sm bg-background">
        <div className="px-3 py-2 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CAPA ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCAPAs.map(capa => {
                const isOverdue =
                  new Date(capa.targetCloseDate) < new Date() && !capa.status.startsWith('closed');
                return (
                  <TableRow
                    key={capa.id}
                    className={`cursor-pointer hover:bg-muted/50 ${isOverdue ? 'bg-red-50' : ''}`}
                    onClick={() => setSelectedCAPA(capa)}
                  >
                    <TableCell className="font-mono font-medium">{capa.id}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{capa.title}</p>
                        {capa.product && (
                          <p className="text-xs text-muted-foreground">{capa.product}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{SOURCE_LABELS[capa.source]}</Badge>
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={capa.priority} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={capa.status} />
                    </TableCell>
                    <TableCell>{capa.owner}</TableCell>
                    <TableCell>
                      <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
                        {capa.targetCloseDate}
                        {isOverdue && ' (Overdue)'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {capa.actions.filter(a => a.status === 'completed').length}/
                        {capa.actions.length}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* RI Integration */}
      <div className="border border-border/40 rounded-sm bg-background border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50">
        <div className="px-3 py-2 p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-full">
              <Sparkles className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-purple-900">RI CAPA Insights</h3>
              <p className="text-sm text-purple-700">
                Analyze CAPA trends, identify recurring issues, and get RI-powered recommendations
                for root cause analysis and preventive actions.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-purple-300 text-purple-700 hover:bg-purple-100"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              View Trends
            </Button>
            <Button className="bg-purple-600 hover:bg-purple-700">
              <Brain className="w-4 h-4 mr-2" />
              RI Analysis
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CAPAManagement;
