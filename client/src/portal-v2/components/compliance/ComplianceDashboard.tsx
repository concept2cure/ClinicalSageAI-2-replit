/**
 * Compliance Dashboard Component
 *
 * Real-time regulatory compliance monitoring dashboard with:
 * - 21 CFR Part 11 compliance status
 * - EU Annex 11 validation metrics
 * - ICH E6 GCP adherence tracking
 * - ALCOA+ data integrity scores
 *
 * @version 1.0.0
 * @compliance FDA 21 CFR Part 11, EU Annex 11, ICH E6 GCP
 */

import React, { useState, useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
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
  Minus,
  FileText,
  Users,
  Lock,
  Key,
  Eye,
  Database,
  Server,
  Activity,
  BarChart3,
  PieChart,
  RefreshCw,
  Download,
  ExternalLink,
  ChevronRight,
  Info,
  Zap,
  Target,
  Award,
  Fingerprint,
  History,
  ClipboardCheck,
  BookOpen,
  Settings,
  Globe,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ComplianceFramework {
  id: string;
  name: string;
  shortName: string;
  description: string;
  region: string;
  overallScore: number;
  status: ComplianceStatus;
  categories: ComplianceCategory[];
  lastAuditDate: Date;
  nextAuditDate: Date;
  certificationExpiry?: Date;
}

interface ComplianceCategory {
  id: string;
  name: string;
  description: string;
  score: number;
  status: ComplianceStatus;
  requirements: ComplianceRequirement[];
  weight: number;
}

interface ComplianceRequirement {
  id: string;
  code: string;
  title: string;
  description: string;
  status: ComplianceStatus;
  evidence: string[];
  lastVerified: Date;
  findings?: ComplianceFinding[];
}

interface ComplianceFinding {
  id: string;
  severity: 'critical' | 'major' | 'minor' | 'observation';
  description: string;
  remediation: string;
  dueDate: Date;
  status: 'open' | 'in_progress' | 'resolved' | 'overdue';
  assignee?: string;
}

interface ComplianceMetric {
  id: string;
  name: string;
  value: number;
  target: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  trendValue: number;
  status: ComplianceStatus;
}

interface ALCOAPlusScore {
  principle: string;
  code: string;
  description: string;
  score: number;
  maxScore: number;
  indicators: { name: string; status: 'pass' | 'fail' | 'warning' }[];
}

type ComplianceStatus =
  | 'compliant'
  | 'partial'
  | 'non_compliant'
  | 'not_applicable'
  | 'pending_review';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ComplianceStatus,
  { label: string; color: string; bgColor: string; icon: React.ComponentType<any> }
> = {
  compliant: { label: 'Compliant', color: '#647746', bgColor: '#e4ebd8', icon: CheckCircle },
  partial: { label: 'Partial', color: '#d97706', bgColor: '#fef3c7', icon: AlertTriangle },
  non_compliant: { label: 'Non-Compliant', color: '#dc2626', bgColor: '#fee2e2', icon: XCircle },
  not_applicable: { label: 'N/A', color: '#8a8880', bgColor: '#f4f3ee', icon: Minus },
  pending_review: { label: 'Pending Review', color: '#57534e', bgColor: '#f5f5f4', icon: Clock },
};

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', color: '#dc2626', bgColor: '#fee2e2' },
  major: { label: 'Major', color: '#ea580c', bgColor: '#ffedd5' },
  minor: { label: 'Minor', color: '#ca8a04', bgColor: '#fef9c3' },
  observation: { label: 'Observation', color: '#8a8880', bgColor: '#f4f3ee' },
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_FRAMEWORKS: ComplianceFramework[] = [
  {
    id: 'cfr-11',
    name: 'FDA 21 CFR Part 11',
    shortName: 'CFR Part 11',
    description: 'Electronic Records; Electronic Signatures',
    region: 'United States',
    overallScore: 94,
    status: 'compliant',
    lastAuditDate: new Date('2025-12-15'),
    nextAuditDate: new Date('2026-06-15'),
    categories: [
      {
        id: 'esig',
        name: 'Electronic Signatures',
        description: '21 CFR 11.50 - 11.200',
        score: 96,
        status: 'compliant',
        weight: 30,
        requirements: [
          {
            id: 'esig-1',
            code: '11.50',
            title: 'Signature Manifestations',
            description:
              'Signed electronic records shall contain information associated with the signing',
            status: 'compliant',
            evidence: ['Signature audit trail implemented', 'Timestamp verification active'],
            lastVerified: new Date('2026-01-20'),
          },
          {
            id: 'esig-2',
            code: '11.70',
            title: 'Signature/Record Linking',
            description:
              'Electronic signatures shall be linked to their respective electronic records',
            status: 'compliant',
            evidence: ['Cryptographic linking enabled', 'Hash chain verification'],
            lastVerified: new Date('2026-01-20'),
          },
        ],
      },
      {
        id: 'controls',
        name: 'Controls for Closed Systems',
        description: '21 CFR 11.10',
        score: 92,
        status: 'compliant',
        weight: 40,
        requirements: [
          {
            id: 'ctrl-1',
            code: '11.10(a)',
            title: 'Validation',
            description: 'System validation to ensure accuracy, reliability, and consistency',
            status: 'compliant',
            evidence: ['IQ/OQ/PQ completed', 'Validation report approved'],
            lastVerified: new Date('2026-01-15'),
          },
          {
            id: 'ctrl-2',
            code: '11.10(d)',
            title: 'Audit Trails',
            description: 'Computer-generated, time-stamped audit trails',
            status: 'compliant',
            evidence: ['Immutable audit logs', 'WORM storage enabled'],
            lastVerified: new Date('2026-01-20'),
          },
          {
            id: 'ctrl-3',
            code: '11.10(g)',
            title: 'Authority Checks',
            description:
              'Authority checks to ensure only authorized individuals can use the system',
            status: 'partial',
            evidence: ['RBAC implemented'],
            lastVerified: new Date('2026-01-18'),
            findings: [
              {
                id: 'find-1',
                severity: 'minor',
                description: 'Some legacy accounts lack explicit role assignment',
                remediation: 'Review and update all user accounts with explicit roles',
                dueDate: new Date('2026-02-15'),
                status: 'in_progress',
                assignee: 'IT Admin Team',
              },
            ],
          },
        ],
      },
      {
        id: 'security',
        name: 'Security Controls',
        description: '21 CFR 11.10(c), 11.300',
        score: 95,
        status: 'compliant',
        weight: 30,
        requirements: [
          {
            id: 'sec-1',
            code: '11.10(c)',
            title: 'Operational System Checks',
            description: 'Protection of records from unauthorized use',
            status: 'compliant',
            evidence: ['Encryption at rest', 'TLS 1.3 in transit', 'Access logging'],
            lastVerified: new Date('2026-01-20'),
          },
          {
            id: 'sec-2',
            code: '11.300',
            title: 'Controls for Identification Codes/Passwords',
            description: 'Maintaining the uniqueness and confidentiality of identification codes',
            status: 'compliant',
            evidence: ['Password policy enforced', 'MFA required', 'Session management'],
            lastVerified: new Date('2026-01-20'),
          },
        ],
      },
    ],
  },
  {
    id: 'annex-11',
    name: 'EU Annex 11',
    shortName: 'Annex 11',
    description: 'Computerised Systems',
    region: 'European Union',
    overallScore: 91,
    status: 'compliant',
    lastAuditDate: new Date('2025-11-20'),
    nextAuditDate: new Date('2026-05-20'),
    categories: [
      {
        id: 'validation',
        name: 'Validation',
        description: 'Annex 11.3-11.5',
        score: 93,
        status: 'compliant',
        weight: 35,
        requirements: [],
      },
      {
        id: 'data',
        name: 'Data Management',
        description: 'Annex 11.7-11.9',
        score: 89,
        status: 'compliant',
        weight: 35,
        requirements: [],
      },
      {
        id: 'security-eu',
        name: 'Security',
        description: 'Annex 11.12',
        score: 92,
        status: 'compliant',
        weight: 30,
        requirements: [],
      },
    ],
  },
  {
    id: 'ich-e6',
    name: 'ICH E6(R2) GCP',
    shortName: 'ICH E6 GCP',
    description: 'Good Clinical Practice',
    region: 'International',
    overallScore: 96,
    status: 'compliant',
    lastAuditDate: new Date('2025-10-10'),
    nextAuditDate: new Date('2026-04-10'),
    categories: [
      {
        id: 'investigator',
        name: 'Investigator Responsibilities',
        description: 'Section 4',
        score: 97,
        status: 'compliant',
        weight: 30,
        requirements: [],
      },
      {
        id: 'sponsor',
        name: 'Sponsor Responsibilities',
        description: 'Section 5',
        score: 95,
        status: 'compliant',
        weight: 35,
        requirements: [],
      },
      {
        id: 'essential-docs',
        name: 'Essential Documents',
        description: 'Section 8',
        score: 96,
        status: 'compliant',
        weight: 35,
        requirements: [],
      },
    ],
  },
];

const MOCK_ALCOA_PLUS: ALCOAPlusScore[] = [
  {
    principle: 'Attributable',
    code: 'A',
    description: 'Data is attributable to the person generating it',
    score: 98,
    maxScore: 100,
    indicators: [
      { name: 'User identification', status: 'pass' },
      { name: 'Electronic signatures', status: 'pass' },
      { name: 'Audit trail attribution', status: 'pass' },
    ],
  },
  {
    principle: 'Legible',
    code: 'L',
    description: 'Data is readable and permanent',
    score: 95,
    maxScore: 100,
    indicators: [
      { name: 'Clear formatting', status: 'pass' },
      { name: 'Permanent storage', status: 'pass' },
      { name: 'Readable exports', status: 'pass' },
    ],
  },
  {
    principle: 'Contemporaneous',
    code: 'C',
    description: 'Data is recorded at the time of activity',
    score: 96,
    maxScore: 100,
    indicators: [
      { name: 'Real-time timestamps', status: 'pass' },
      { name: 'NTP synchronization', status: 'pass' },
      { name: 'No backdating', status: 'pass' },
    ],
  },
  {
    principle: 'Original',
    code: 'O',
    description: 'Data is the first recording or certified copy',
    score: 94,
    maxScore: 100,
    indicators: [
      { name: 'Source data capture', status: 'pass' },
      { name: 'Certified copies', status: 'pass' },
      { name: 'Version control', status: 'warning' },
    ],
  },
  {
    principle: 'Accurate',
    code: 'A',
    description: 'Data is correct and truthful',
    score: 97,
    maxScore: 100,
    indicators: [
      { name: 'Validation rules', status: 'pass' },
      { name: 'Edit checks', status: 'pass' },
      { name: 'Error detection', status: 'pass' },
    ],
  },
  {
    principle: 'Complete',
    code: 'C',
    description: 'All data is present, including repeat/retest results',
    score: 93,
    maxScore: 100,
    indicators: [
      { name: 'Required field enforcement', status: 'pass' },
      { name: 'Audit trail completeness', status: 'pass' },
      { name: 'No orphan records', status: 'warning' },
    ],
  },
  {
    principle: 'Consistent',
    code: 'C',
    description: 'Data follows expected patterns and sequences',
    score: 95,
    maxScore: 100,
    indicators: [
      { name: 'Timestamp sequences', status: 'pass' },
      { name: 'Logical consistency', status: 'pass' },
      { name: 'Cross-reference integrity', status: 'pass' },
    ],
  },
  {
    principle: 'Enduring',
    code: 'E',
    description: 'Data is preserved for required retention period',
    score: 98,
    maxScore: 100,
    indicators: [
      { name: 'WORM storage', status: 'pass' },
      { name: 'Backup verification', status: 'pass' },
      { name: 'Retention policy', status: 'pass' },
    ],
  },
  {
    principle: 'Available',
    code: 'A',
    description: 'Data is accessible when needed',
    score: 96,
    maxScore: 100,
    indicators: [
      { name: 'Search capability', status: 'pass' },
      { name: 'Export functions', status: 'pass' },
      { name: 'Audit response time', status: 'pass' },
    ],
  },
];

const MOCK_METRICS: ComplianceMetric[] = [
  {
    id: 'audit-coverage',
    name: 'Audit Trail Coverage',
    value: 99.8,
    target: 100,
    unit: '%',
    trend: 'up',
    trendValue: 0.3,
    status: 'compliant',
  },
  {
    id: 'esig-adoption',
    name: 'E-Signature Adoption',
    value: 97.5,
    target: 95,
    unit: '%',
    trend: 'up',
    trendValue: 2.1,
    status: 'compliant',
  },
  {
    id: 'training-compliance',
    name: 'Training Compliance',
    value: 94.2,
    target: 100,
    unit: '%',
    trend: 'down',
    trendValue: 1.8,
    status: 'partial',
  },
  {
    id: 'access-review',
    name: 'Access Reviews Completed',
    value: 100,
    target: 100,
    unit: '%',
    trend: 'stable',
    trendValue: 0,
    status: 'compliant',
  },
  {
    id: 'incident-response',
    name: 'Incident Response Time',
    value: 2.4,
    target: 4,
    unit: 'hours',
    trend: 'up',
    trendValue: 0.6,
    status: 'compliant',
  },
  {
    id: 'finding-closure',
    name: 'Finding Closure Rate',
    value: 87,
    target: 90,
    unit: '%',
    trend: 'up',
    trendValue: 5,
    status: 'partial',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

const ComplianceOverview: React.FC<{ frameworks: ComplianceFramework[] }> = ({ frameworks }) => {
  const overallScore = useMemo(() => {
    const total = frameworks.reduce((sum, f) => sum + f.overallScore, 0);
    return Math.round(total / frameworks.length);
  }, [frameworks]);

  const getScoreColor = (score: number) => {
    if (score >= 95) return '#647746';
    if (score >= 85) return '#d97706';
    return '#dc2626';
  };

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-stone-100 rounded-lg">
              <Shield className="h-6 w-6 text-stone-600" />
            </div>
            <div>
              <CardTitle>Regulatory Compliance Overview</CardTitle>
              <CardDescription>
                Multi-framework compliance status across all regulatory requirements
              </CardDescription>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-stone-500">Overall Score</p>
            <p className="text-4xl font-bold" style={{ color: getScoreColor(overallScore) }}>
              {overallScore}%
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {frameworks.map(framework => {
            const StatusIcon = STATUS_CONFIG[framework.status].icon;
            return (
              <Card key={framework.id} className="border">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{framework.shortName}</h3>
                      <p className="text-xs text-stone-500">{framework.region}</p>
                    </div>
                    <Badge
                      style={{
                        backgroundColor: STATUS_CONFIG[framework.status].bgColor,
                        color: STATUS_CONFIG[framework.status].color,
                      }}
                    >
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {STATUS_CONFIG[framework.status].label}
                    </Badge>
                  </div>

                  <div className="mb-3">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-stone-500">Compliance Score</span>
                      <span
                        className="font-semibold"
                        style={{ color: getScoreColor(framework.overallScore) }}
                      >
                        {framework.overallScore}%
                      </span>
                    </div>
                    <Progress value={framework.overallScore} className="h-2" />
                  </div>

                  <div className="flex items-center justify-between text-xs text-stone-500">
                    <span>Last Audit: {framework.lastAuditDate.toLocaleDateString()}</span>
                    <span>Next: {framework.nextAuditDate.toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

const ALCOAPlusScorecard: React.FC<{ scores: ALCOAPlusScore[] }> = ({ scores }) => {
  const totalScore = useMemo(() => {
    const total = scores.reduce((sum, s) => sum + s.score, 0);
    const max = scores.reduce((sum, s) => sum + s.maxScore, 0);
    return Math.round((total / max) * 100);
  }, [scores]);

  const getStatusColor = (status: 'pass' | 'fail' | 'warning') => {
    switch (status) {
      case 'pass':
        return '#647746';
      case 'warning':
        return '#d97706';
      case 'fail':
        return '#dc2626';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-stone-100 rounded-lg">
              <Award className="h-6 w-6 text-stone-600" />
            </div>
            <div>
              <CardTitle>ALCOA+ Data Integrity</CardTitle>
              <CardDescription>FDA data integrity principles compliance</CardDescription>
            </div>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-stone-600">{totalScore}%</p>
            <p className="text-xs text-stone-500">Overall Score</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {scores.map(score => (
            <div
              key={score.principle}
              className="p-3 bg-stone-50 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 flex items-center justify-center bg-stone-100 text-stone-600 rounded text-xs font-bold">
                    {score.code}
                  </span>
                  <span className="text-sm font-medium">{score.principle}</span>
                </div>
                <span className="text-sm font-semibold text-stone-600">{score.score}%</span>
              </div>
              <div className="flex gap-1">
                {score.indicators.map((ind, i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getStatusColor(ind.status) }}
                    title={`${ind.name}: ${ind.status}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const MetricsGrid: React.FC<{ metrics: ComplianceMetric[] }> = ({ metrics }) => {
  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4" />;
      case 'down':
        return <TrendingDown className="h-4 w-4" />;
      case 'stable':
        return <Minus className="h-4 w-4" />;
    }
  };

  const getTrendColor = (metric: ComplianceMetric) => {
    // For metrics where lower is better (like response time), invert the color logic
    const isInverted = metric.unit === 'hours';
    if (metric.trend === 'stable') return '#8a8880';
    if (isInverted) {
      return metric.trend === 'up' ? '#dc2626' : '#647746';
    }
    return metric.trend === 'up' ? '#647746' : '#dc2626';
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {metrics.map(metric => {
        const StatusIcon = STATUS_CONFIG[metric.status].icon;
        return (
          <Card key={metric.id}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <StatusIcon
                  className="h-4 w-4"
                  style={{ color: STATUS_CONFIG[metric.status].color }}
                />
                <div
                  className="flex items-center gap-1 text-xs"
                  style={{ color: getTrendColor(metric) }}
                >
                  {getTrendIcon(metric.trend)}
                  <span>
                    {metric.trendValue > 0 ? '+' : ''}
                    {metric.trendValue}
                    {metric.unit === '%' ? '%' : ''}
                  </span>
                </div>
              </div>
              <p className="text-2xl font-bold">
                {metric.value}
                <span className="text-sm text-stone-500 font-normal">{metric.unit}</span>
              </p>
              <p className="text-xs text-stone-500 mt-1">{metric.name}</p>
              <div className="mt-2">
                <Progress
                  value={
                    metric.unit === 'hours'
                      ? Math.max(0, 100 - (metric.value / metric.target) * 100)
                      : (metric.value / metric.target) * 100
                  }
                  className="h-1"
                />
                <p className="text-xs text-stone-400 mt-1">
                  Target: {metric.target}
                  {metric.unit}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

const FindingsOverview: React.FC<{ frameworks: ComplianceFramework[] }> = ({ frameworks }) => {
  const findings = useMemo(() => {
    const allFindings: (ComplianceFinding & { framework: string; requirement: string })[] = [];
    frameworks.forEach(f => {
      f.categories.forEach(c => {
        c.requirements.forEach(r => {
          r.findings?.forEach(finding => {
            allFindings.push({
              ...finding,
              framework: f.shortName,
              requirement: `${r.code} - ${r.title}`,
            });
          });
        });
      });
    });
    return allFindings;
  }, [frameworks]);

  const openFindings = findings.filter(f => f.status !== 'resolved');
  const overdueFindings = findings.filter(f => f.status === 'overdue');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-stone-100 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-stone-600" />
            </div>
            <div>
              <CardTitle>Compliance Findings</CardTitle>
              <CardDescription>Active findings requiring remediation</CardDescription>
            </div>
          </div>
          <div className="flex gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-stone-600">{openFindings.length}</p>
              <p className="text-xs text-stone-500">Open</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-stone-700">{overdueFindings.length}</p>
              <p className="text-xs text-stone-500">Overdue</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {openFindings.length === 0 ? (
          <div className="text-center py-8 text-stone-500">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-stone-900" />
            <p className="font-medium">No Open Findings</p>
            <p className="text-sm">All compliance findings have been resolved</p>
          </div>
        ) : (
          <div className="space-y-3">
            {openFindings.map(finding => (
              <div
                key={finding.id}
                className="p-4 border rounded-lg hover:bg-stone-50 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      style={{
                        backgroundColor: SEVERITY_CONFIG[finding.severity].bgColor,
                        color: SEVERITY_CONFIG[finding.severity].color,
                      }}
                    >
                      {SEVERITY_CONFIG[finding.severity].label}
                    </Badge>
                    <span className="text-sm text-stone-500">{finding.framework}</span>
                  </div>
                  <Badge variant={finding.status === 'overdue' ? 'destructive' : 'outline'}>
                    {finding.status.replace('_', ' ')}
                  </Badge>
                </div>
                <p className="font-medium mb-1">{finding.description}</p>
                <p className="text-sm text-stone-500 mb-2">{finding.requirement}</p>
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span>Due: {finding.dueDate.toLocaleDateString()}</span>
                  {finding.assignee && <span>Assignee: {finding.assignee}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full">
          <FileText className="mr-2 h-4 w-4" />
          View All Findings
        </Button>
      </CardFooter>
    </Card>
  );
};

const FrameworkDetails: React.FC<{ framework: ComplianceFramework }> = ({ framework }) => {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{framework.name}</CardTitle>
            <CardDescription>{framework.description}</CardDescription>
          </div>
          <Badge
            style={{
              backgroundColor: STATUS_CONFIG[framework.status].bgColor,
              color: STATUS_CONFIG[framework.status].color,
            }}
          >
            {framework.overallScore}% Compliant
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {framework.categories.map(category => {
            const StatusIcon = STATUS_CONFIG[category.status].icon;
            const isExpanded = expandedCategory === category.id;

            return (
              <div key={category.id} className="border rounded-lg overflow-hidden">
                <button
                  className="w-full p-4 flex items-center justify-between hover:bg-stone-50 transition-colors"
                  onClick={() => setExpandedCategory(isExpanded ? null : category.id)}
                >
                  <div className="flex items-center gap-3">
                    <StatusIcon
                      className="h-5 w-5"
                      style={{ color: STATUS_CONFIG[category.status].color }}
                    />
                    <div className="text-left">
                      <p className="font-medium">{category.name}</p>
                      <p className="text-xs text-stone-500">{category.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-semibold">{category.score}%</p>
                      <p className="text-xs text-stone-500">Weight: {category.weight}%</p>
                    </div>
                    {isExpanded ? (
                      <ChevronRight className="h-5 w-5 rotate-90 text-stone-400" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-stone-400" />
                    )}
                  </div>
                </button>

                {isExpanded && category.requirements.length > 0 && (
                  <div className="border-t bg-stone-50 p-4">
                    <div className="space-y-3">
                      {category.requirements.map(req => {
                        const ReqStatusIcon = STATUS_CONFIG[req.status].icon;
                        return (
                          <div key={req.id} className="p-3 bg-white rounded-lg border">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <ReqStatusIcon
                                  className="h-4 w-4"
                                  style={{ color: STATUS_CONFIG[req.status].color }}
                                />
                                <span className="font-medium text-sm">
                                  {req.code}: {req.title}
                                </span>
                              </div>
                              <span className="text-xs text-stone-500">
                                Verified: {req.lastVerified.toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm text-stone-600 mb-2">{req.description}</p>
                            {req.evidence.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {req.evidence.map((e, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {e}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {req.findings && req.findings.length > 0 && (
                              <div className="mt-3 p-2 bg-stone-100 rounded border border-stone-200">
                                <p className="text-xs font-medium text-stone-700 mb-1">
                                  {req.findings.length} Finding(s)
                                </p>
                                {req.findings.map(f => (
                                  <p key={f.id} className="text-xs text-stone-600">
                                    • {f.description}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const ComplianceDashboard: React.FC = () => {
  const [frameworks] = useState<ComplianceFramework[]>(MOCK_FRAMEWORKS);
  const [alcoa] = useState<ALCOAPlusScore[]>(MOCK_ALCOA_PLUS);
  const [metrics] = useState<ComplianceMetric[]>(MOCK_METRICS);
  const [selectedFramework, setSelectedFramework] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('overview');

  const selectedFrameworkData = frameworks.find(f => f.id === selectedFramework);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" />
            Compliance Dashboard
          </h1>
          <p className="text-stone-500">Real-time regulatory compliance monitoring and reporting</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedFramework} onValueChange={setSelectedFramework}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select framework" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Frameworks</SelectItem>
              {frameworks.map(f => (
                <SelectItem key={f.id} value={f.id}>
                  {f.shortName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button>
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Alert Banner */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Compliance Status: Operational</AlertTitle>
        <AlertDescription>
          All critical compliance controls are functioning. Next scheduled audit:{' '}
          {frameworks[0]?.nextAuditDate.toLocaleDateString()}
        </AlertDescription>
      </Alert>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="mr-2 h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="frameworks">
            <Globe className="mr-2 h-4 w-4" />
            Frameworks
          </TabsTrigger>
          <TabsTrigger value="alcoa">
            <Award className="mr-2 h-4 w-4" />
            ALCOA+
          </TabsTrigger>
          <TabsTrigger value="findings">
            <AlertTriangle className="mr-2 h-4 w-4" />
            Findings
          </TabsTrigger>
          <TabsTrigger value="reports">
            <FileText className="mr-2 h-4 w-4" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <ComplianceOverview frameworks={frameworks} />
          <MetricsGrid metrics={metrics} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ALCOAPlusScorecard scores={alcoa} />
            <FindingsOverview frameworks={frameworks} />
          </div>
        </TabsContent>

        <TabsContent value="frameworks" className="space-y-6 mt-6">
          {selectedFramework === 'all' ? (
            frameworks.map(f => <FrameworkDetails key={f.id} framework={f} />)
          ) : selectedFrameworkData ? (
            <FrameworkDetails framework={selectedFrameworkData} />
          ) : null}
        </TabsContent>

        <TabsContent value="alcoa" className="space-y-6 mt-6">
          <ALCOAPlusScorecard scores={alcoa} />
          <Card>
            <CardHeader>
              <CardTitle>ALCOA+ Principle Details</CardTitle>
              <CardDescription>Detailed breakdown of data integrity compliance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {alcoa.map(principle => (
                  <div key={principle.principle} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 flex items-center justify-center bg-stone-100 text-stone-600 rounded-lg text-lg font-bold">
                          {principle.code}
                        </span>
                        <div>
                          <h3 className="font-semibold">{principle.principle}</h3>
                          <p className="text-sm text-stone-500">{principle.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-stone-600">{principle.score}%</p>
                        <Progress value={principle.score} className="w-24 h-2 mt-1" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {principle.indicators.map((ind, i) => (
                        <div
                          key={i}
                          className={`p-2 rounded text-xs flex items-center gap-2 ${
                            ind.status === 'pass'
                              ? 'bg-stone-100 text-stone-800'
                              : ind.status === 'warning'
                                ? 'bg-stone-100 text-stone-700'
                                : 'bg-stone-100 text-stone-800'
                          }`}
                        >
                          {ind.status === 'pass' ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : ind.status === 'warning' ? (
                            <AlertTriangle className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          {ind.name}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="findings" className="mt-6">
          <FindingsOverview frameworks={frameworks} />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Compliance Reports</CardTitle>
              <CardDescription>Generate and download compliance reports</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { name: 'FDA 21 CFR Part 11 Assessment', type: 'PDF', date: '2026-01-20' },
                  { name: 'EU Annex 11 Compliance Report', type: 'PDF', date: '2025-12-15' },
                  { name: 'ICH E6 GCP Audit Report', type: 'PDF', date: '2025-11-10' },
                  { name: 'ALCOA+ Data Integrity Report', type: 'XLSX', date: '2026-01-18' },
                  { name: 'Training Compliance Summary', type: 'PDF', date: '2026-01-15' },
                  { name: 'Access Control Review', type: 'PDF', date: '2026-01-10' },
                ].map((report, i) => (
                  <div key={i} className="p-4 border rounded-lg hover:bg-stone-50">
                    <div className="flex items-start justify-between mb-2">
                      <FileText className="h-8 w-8 text-stone-600" />
                      <Badge variant="outline">{report.type}</Badge>
                    </div>
                    <h3 className="font-medium mb-1">{report.name}</h3>
                    <p className="text-xs text-stone-500 mb-3">Generated: {report.date}</p>
                    <Button variant="outline" size="sm" className="w-full">
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ComplianceDashboard;
