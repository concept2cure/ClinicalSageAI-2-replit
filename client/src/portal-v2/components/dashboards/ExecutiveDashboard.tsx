/**
 * Concept2Cure Client Portal V2 - Executive Dashboard
 *
 * High-level strategic view for executives with portfolio overview,
 * key metrics, and submission timeline tracking.
 *
 * @version 2.0.0
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
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
  Loader2,
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
      ? 'text-stone-700'
      : metric.trend === 'down'
        ? 'text-stone-700'
        : 'text-stone-500';

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{metric.label}</p>
            <p className="text-3xl font-bold tracking-tight">{metric.value}</p>
          </div>
          {metric.icon && (
            <div className="rounded-lg bg-stone-100 p-2.5">
              <Target className="h-5 w-5 text-stone-600" />
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
              <Briefcase className="h-5 w-5 text-stone-600" />
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
              className="flex items-center justify-between rounded-lg border p-4 hover:bg-stone-50 transition-colors cursor-pointer"
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
                  <AlertTriangle className="h-5 w-5 text-stone-900" />
                )}
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
        {atRiskProjects.length > 0 && (
          <div className="mt-4 rounded-lg bg-stone-100 border border-stone-200 p-3">
            <div className="flex items-center gap-2 text-stone-800">
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
        return 'bg-stone-100 text-stone-800 border-stone-200';
      case 'at_risk':
        return 'bg-stone-100 text-stone-800 border-stone-200';
      case 'delayed':
        return 'bg-stone-100 text-stone-800 border-stone-200';
      default:
        return 'bg-stone-100 text-stone-800';
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
              <Calendar className="h-5 w-5 text-stone-600" />
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
                <div className="rounded-lg bg-stone-100 p-2">
                  <FileText className="h-4 w-4 text-stone-600" />
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
          <Users className="h-5 w-5 text-stone-600" />
          Team Activity
        </CardTitle>
        <CardDescription>Recent platform activity</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map(activity => (
            <div key={activity.id} className="flex items-start gap-3">
              <div className="rounded-full bg-stone-100 p-2">
                <Users className="h-3 w-3 text-stone-600" />
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
  // Fetch projects from submission center
  const { data: projectsData, isLoading: projectsLoading, error: projectsError } = useQuery({
    queryKey: ['submission-center-projects'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/submission-center/projects');
      return res.json();
    },
  });

  // Fetch tasks from submission center
  const { data: tasksData, isLoading: tasksLoading, error: tasksError } = useQuery({
    queryKey: ['submission-center-tasks'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/submission-center/tasks');
      return res.json();
    },
  });

  // Map API projects to ProjectSummary shape
  const apiProjects = projectsData?.data || [];
  const projects: ProjectSummary[] = apiProjects.map((p: any, idx: number) => ({
    id: String(p.id || idx + 1),
    name: p.name || 'Untitled Project',
    productName: p.name?.split(' ')[0] || 'Unknown',
    productType: p.submission_type === '510k' ? 'medical_device' : 'drug',
    indication: p.description || p.submission_type || 'N/A',
    phase: p.stage === 'planning' ? 'preclinical' : p.stage === 'authoring' ? 'phase_1' : 'phase_3',
    status: 'active' as const,
    targetAgencies: [p.target_agency || 'FDA'],
    milestones: p.target_date
      ? [{ id: String(idx), name: `${p.submission_type} Filing`, targetDate: new Date(p.target_date), status: 'in_progress' as const }]
      : [],
    teamSize: p.taskMetrics?.total || 0,
    lastActivity: new Date(p.updated_at || p.created_at || Date.now()),
    progress: p.completionPercentage || (p.taskMetrics?.total > 0 ? Math.round((p.taskMetrics.completed / p.taskMetrics.total) * 100) : 0),
  }));

  // Derive submissions from projects that have target dates
  const submissions = apiProjects
    .filter((p: any) => p.target_date)
    .map((p: any, idx: number) => ({
      id: String(p.id || idx + 1),
      name: p.name || 'Untitled',
      type: p.submission_type || 'IND',
      agency: p.target_agency || 'FDA',
      targetDate: new Date(p.target_date),
      status: (p.stage === 'submission' ? 'on_track' : p.stage === 'review' ? 'at_risk' : 'on_track') as 'on_track' | 'at_risk' | 'delayed',
    }));

  // Derive activities from recent tasks
  const apiTasks = tasksData?.data || [];
  const activities = apiTasks.slice(0, 8).map((t: any, idx: number) => ({
    id: String(t.id || idx + 1),
    user: t.assigned_to || 'System',
    action: t.status === 'completed' ? 'completed' : t.status === 'in-progress' ? 'is working on' : 'created',
    target: t.title || 'Task',
    timestamp: new Date(t.updated_at || t.created_at || Date.now()),
  }));

  // Compute metrics from real data
  const completedTasks = apiTasks.filter((t: any) => t.status === 'completed').length;
  const totalTasks = apiTasks.length;
  const metrics: MetricCard[] = [
    {
      id: '1',
      label: 'Active Programs',
      value: apiProjects.length || 0,
      change: 0,
      trend: 'up' as const,
      changeLabel: 'total projects',
    },
    {
      id: '2',
      label: 'Total Tasks',
      value: totalTasks,
      change: 0,
      trend: 'up' as const,
      changeLabel: 'across all projects',
    },
    {
      id: '3',
      label: 'Completion Rate',
      value: totalTasks > 0 ? `${Math.round((completedTasks / totalTasks) * 100)}%` : '0%',
      change: 0,
      trend: 'up' as const,
      changeLabel: 'tasks completed',
    },
    {
      id: '4',
      label: 'Pending Tasks',
      value: apiTasks.filter((t: any) => t.status === 'pending').length,
      change: 0,
      trend: 'down' as const,
      changeLabel: 'awaiting action',
    },
  ];

  const isLoading = projectsLoading || tasksLoading;
  const hasError = projectsError || tasksError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-stone-600" />
        <span className="ml-2 text-muted-foreground">Loading dashboard data...</span>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="rounded-lg border border-stone-200 bg-stone-100 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-stone-900 mx-auto mb-2" />
        <p className="text-stone-800 font-medium">Failed to load dashboard data</p>
        <p className="text-stone-700 text-sm mt-1">Please try refreshing the page.</p>
      </div>
    );
  }

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
