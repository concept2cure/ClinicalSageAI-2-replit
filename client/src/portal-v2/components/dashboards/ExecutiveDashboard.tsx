/**
 * TrialSage Client Portal V2 - Executive Dashboard
 *
 * High-level strategic view for executives with portfolio overview,
 * key metrics, and submission timeline tracking.
 *
 * @version 2.0.0
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Target,
  Briefcase,
  BarChart3,
  Calendar,
  FileText,
  Users,
  ArrowUpRight,
} from 'lucide-react';
import type { MetricCard, ProjectSummary } from '../../core/portalTypes';

// ─────────────────────────────────────────────────────────────────────────────
// METRIC CARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface MetricCardProps {
  metric: MetricCard;
}

const MetricCardDisplay: React.FC<MetricCardProps> = ({ metric }) => {
  const TrendIcon =
    metric.trend === 'up' ? TrendingUp : metric.trend === 'down' ? TrendingDown : null;
  const trendColor =
    metric.trend === 'up'
      ? 'text-green-600'
      : metric.trend === 'down'
        ? 'text-red-600'
        : 'text-gray-500';

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{metric.label}</p>
            <p className="text-3xl font-bold tracking-tight">{metric.value}</p>
          </div>
          {metric.icon && (
            <div className="rounded-lg bg-blue-50 p-2.5">
              <Target className="h-5 w-5 text-blue-600" />
            </div>
          )}
        </div>
        {(metric.change !== undefined || metric.changeLabel) && (
          <div className={`mt-3 flex items-center gap-1 text-sm ${trendColor}`}>
            {TrendIcon && <TrendIcon className="h-4 w-4" />}
            <span>
              {metric.change !== undefined
                ? `${metric.change > 0 ? '+' : ''}${metric.change}%`
                : ''}
            </span>
            {metric.changeLabel && (
              <span className="text-muted-foreground ml-1">{metric.changeLabel}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PORTFOLIO SUMMARY COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface PortfolioSummaryProps {
  projects: ProjectSummary[];
}

const PortfolioSummary: React.FC<PortfolioSummaryProps> = ({ projects }) => {
  const activeProjects = projects.filter(p => p.status === 'active');
  const atRiskProjects = projects.filter(p =>
    p.milestones.some(m => m.status === 'at_risk' || m.status === 'overdue')
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-blue-600" />
              Portfolio Overview
            </CardTitle>
            <CardDescription>Active programs and submissions</CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">
            {activeProjects.length} Active
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {projects.slice(0, 5).map(project => (
            <div
              key={project.id}
              className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{project.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {project.phase.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {project.productName} • {project.indication}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm font-medium">{project.progress}%</div>
                  <Progress value={project.progress} className="w-20 h-2" />
                </div>
                {project.milestones.some(m => m.status === 'at_risk') && (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                )}
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
        {atRiskProjects.length > 0 && (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <div className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">
                {atRiskProjects.length} project{atRiskProjects.length !== 1 ? 's' : ''} with at-risk
                milestones
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SUBMISSION TIMELINE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface SubmissionTimelineProps {
  submissions: Array<{
    id: string;
    name: string;
    type: string;
    agency: string;
    targetDate: Date;
    status: 'on_track' | 'at_risk' | 'delayed';
  }>;
}

const SubmissionTimeline: React.FC<SubmissionTimelineProps> = ({ submissions }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on_track':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'at_risk':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'delayed':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(date));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              Upcoming Submissions
            </CardTitle>
            <CardDescription>Next 6 months regulatory submissions</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {submissions.map(submission => (
            <div
              key={submission.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-50 p-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <div className="font-medium text-sm">{submission.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {submission.type} • {submission.agency}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className={`text-xs ${getStatusColor(submission.status)}`}>
                  {submission.status.replace('_', ' ')}
                </Badge>
                <div className="text-sm font-medium text-muted-foreground">
                  {formatDate(submission.targetDate)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TEAM ACTIVITY COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface TeamActivityProps {
  activities: Array<{
    id: string;
    user: string;
    action: string;
    target: string;
    timestamp: Date;
  }>;
}

const TeamActivity: React.FC<TeamActivityProps> = ({ activities }) => {
  const timeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-600" />
          Team Activity
        </CardTitle>
        <CardDescription>Recent platform activity</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map(activity => (
            <div key={activity.id} className="flex items-start gap-3">
              <div className="rounded-full bg-gray-100 p-2">
                <Users className="h-3 w-3 text-gray-600" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm">
                  <span className="font-medium">{activity.user}</span>{' '}
                  <span className="text-muted-foreground">{activity.action}</span>{' '}
                  <span className="font-medium">{activity.target}</span>
                </p>
                <p className="text-xs text-muted-foreground">{timeAgo(activity.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXECUTIVE DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export const ExecutiveDashboard: React.FC = () => {
  // Mock data - in production, this would come from API
  const metrics: MetricCard[] = [
    {
      id: '1',
      label: 'Active Programs',
      value: 12,
      change: 8,
      trend: 'up',
      changeLabel: 'vs last quarter',
    },
    {
      id: '2',
      label: 'Submissions This Year',
      value: 7,
      change: 40,
      trend: 'up',
      changeLabel: 'vs last year',
    },
    {
      id: '3',
      label: 'Approval Rate',
      value: '92%',
      change: 5,
      trend: 'up',
      changeLabel: 'vs target',
    },
    {
      id: '4',
      label: 'At-Risk Milestones',
      value: 3,
      change: -25,
      trend: 'down',
      changeLabel: 'vs last month',
    },
  ];

  const projects: ProjectSummary[] = [
    {
      id: '1',
      name: 'BTX-331 IND Preparation',
      productName: 'BTX-331',
      productType: 'biologic',
      indication: 'Solid Tumors',
      phase: 'phase_1',
      status: 'active',
      targetAgencies: ['FDA'],
      milestones: [
        { id: '1', name: 'IND Filing', targetDate: new Date('2026-03-15'), status: 'in_progress' },
      ],
      teamSize: 12,
      lastActivity: new Date(),
      progress: 68,
    },
    {
      id: '2',
      name: 'MX-201 Phase 3 CSR',
      productName: 'MX-201',
      productType: 'drug',
      indication: 'Type 2 Diabetes',
      phase: 'phase_3',
      status: 'active',
      targetAgencies: ['FDA', 'EMA'],
      milestones: [
        { id: '2', name: 'CSR Completion', targetDate: new Date('2026-02-28'), status: 'at_risk' },
      ],
      teamSize: 24,
      lastActivity: new Date(),
      progress: 85,
    },
    {
      id: '3',
      name: 'DVX-450 510(k) Submission',
      productName: 'DVX-450',
      productType: 'medical_device',
      indication: 'Diagnostic',
      phase: 'preclinical',
      status: 'active',
      targetAgencies: ['FDA'],
      milestones: [
        { id: '3', name: '510(k) Filing', targetDate: new Date('2026-04-01'), status: 'pending' },
      ],
      teamSize: 8,
      lastActivity: new Date(),
      progress: 45,
    },
  ];

  const submissions = [
    {
      id: '1',
      name: 'BTX-331 IND',
      type: 'IND',
      agency: 'FDA',
      targetDate: new Date('2026-03-15'),
      status: 'on_track' as const,
    },
    {
      id: '2',
      name: 'MX-201 NDA',
      type: 'NDA',
      agency: 'FDA',
      targetDate: new Date('2026-06-30'),
      status: 'at_risk' as const,
    },
    {
      id: '3',
      name: 'DVX-450 510(k)',
      type: '510(k)',
      agency: 'FDA',
      targetDate: new Date('2026-04-01'),
      status: 'on_track' as const,
    },
    {
      id: '4',
      name: 'MX-201 MAA',
      type: 'MAA',
      agency: 'EMA',
      targetDate: new Date('2026-07-15'),
      status: 'on_track' as const,
    },
  ];

  const activities = [
    {
      id: '1',
      user: 'Sarah Johnson',
      action: 'approved',
      target: 'Protocol Amendment v3.2',
      timestamp: new Date(Date.now() - 3600000),
    },
    {
      id: '2',
      user: 'Michael Chen',
      action: 'uploaded',
      target: 'CMC Module 3.2.P',
      timestamp: new Date(Date.now() - 7200000),
    },
    {
      id: '3',
      user: 'Emily Davis',
      action: 'completed review of',
      target: 'CSR Draft Section 14',
      timestamp: new Date(Date.now() - 14400000),
    },
    {
      id: '4',
      user: 'Robert Wilson',
      action: 'submitted',
      target: 'Safety Update Report Q4',
      timestamp: new Date(Date.now() - 28800000),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Executive Dashboard</h1>
          <p className="text-muted-foreground">Strategic overview of regulatory programs</p>
        </div>
        <Badge variant="outline" className="text-xs">
          Last updated: Just now
        </Badge>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map(metric => (
          <MetricCardDisplay key={metric.id} metric={metric} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PortfolioSummary projects={projects} />
        <SubmissionTimeline submissions={submissions} />
      </div>

      {/* Team Activity */}
      <TeamActivity activities={activities} />
    </div>
  );
};

export default ExecutiveDashboard;
