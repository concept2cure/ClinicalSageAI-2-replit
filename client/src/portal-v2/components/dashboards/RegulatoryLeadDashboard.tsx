/**
 * Concept2Cure Client Portal V2 - Regulatory Lead Dashboard
 *
 * Operational dashboard for regulatory affairs professionals with
 * submission tracking, document status, and compliance monitoring.
 *
 * @version 2.0.0
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileStack,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  Send,
  ChevronRight,
  Filter,
  Search,
  MoreHorizontal,
  FileCheck,
  FileClock,
  FileX,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import type { DocumentSummary, DocumentStatus, TaskSummary } from '../../core/portalTypes';

// ─────────────────────────────────────────────────────────────────────────────
// SUBMISSION TRACKER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface Submission {
  id: string;
  name: string;
  type: string;
  agency: string;
  status: 'drafting' | 'review' | 'ready' | 'submitted' | 'pending_response';
  progress: number;
  dueDate: Date;
  assignee: string;
  documentsTotal: number;
  documentsReady: number;
}

interface SubmissionTrackerProps {
  submissions: Submission[];
}

const SubmissionTracker: React.FC<SubmissionTrackerProps> = ({ submissions }) => {
  const getStatusConfig = (status: Submission['status']) => {
    switch (status) {
      case 'drafting':
        return { label: 'Drafting', color: 'bg-stone-100 text-stone-800', icon: FileClock };
      case 'review':
        return { label: 'In Review', color: 'bg-stone-100 text-stone-800', icon: FileText };
      case 'ready':
        return { label: 'Ready', color: 'bg-stone-100 text-stone-800', icon: FileCheck };
      case 'submitted':
        return { label: 'Submitted', color: 'bg-stone-100 text-stone-800', icon: Send };
      case 'pending_response':
        return { label: 'Pending Response', color: 'bg-stone-100 text-stone-800', icon: Clock };
      default:
        return { label: status, color: 'bg-stone-100', icon: FileText };
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(date));
  };

  const getDaysUntil = (date: Date) => {
    const now = new Date();
    const target = new Date(date);
    const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileStack className="h-5 w-5 text-stone-600" />
              Active Submissions
            </CardTitle>
            <CardDescription>Track preparation and filing status</CardDescription>
          </div>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-1" />
            Filter
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {submissions.map(submission => {
            const statusConfig = getStatusConfig(submission.status);
            const StatusIcon = statusConfig.icon;
            const daysUntil = getDaysUntil(submission.dueDate);
            const isUrgent = daysUntil <= 14 && submission.status !== 'submitted';

            return (
              <div
                key={submission.id}
                className="rounded-lg border p-4 hover:shadow-sm transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{submission.name}</span>
                      <Badge className={`text-xs ${statusConfig.color}`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {statusConfig.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {submission.type} • {submission.agency} • {submission.assignee}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">
                      Documents: {submission.documentsReady}/{submission.documentsTotal}
                    </span>
                    <span
                      className={`flex items-center gap-1 ${isUrgent ? 'text-stone-600 font-medium' : 'text-muted-foreground'}`}
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(submission.dueDate)}
                      {isUrgent && ` (${daysUntil}d)`}
                    </span>
                  </div>
                  <span className="text-sm font-medium">{submission.progress}%</span>
                </div>

                <Progress value={submission.progress} className="h-2" />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT STATUS COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface DocumentStatusOverviewProps {
  documents: DocumentSummary[];
}

const DocumentStatusOverview: React.FC<DocumentStatusOverviewProps> = ({ documents }) => {
  const statusCounts = documents.reduce(
    (acc, doc) => {
      acc[doc.status] = (acc[doc.status] || 0) + 1;
      return acc;
    },
    {} as Record<DocumentStatus, number>
  );

  const statusConfig: Record<
    DocumentStatus,
    { label: string; color: string; icon: React.ElementType }
  > = {
    draft: { label: 'Draft', color: 'text-stone-600 bg-stone-100', icon: FileClock },
    in_review: { label: 'In Review', color: 'text-stone-600 bg-stone-100', icon: FileText },
    pending_approval: {
      label: 'Pending Approval',
      color: 'text-stone-600 bg-stone-100',
      icon: Clock,
    },
    approved: { label: 'Approved', color: 'text-stone-700 bg-stone-100', icon: CheckCircle2 },
    rejected: { label: 'Rejected', color: 'text-stone-700 bg-stone-100', icon: FileX },
    superseded: { label: 'Superseded', color: 'text-stone-500 bg-stone-100', icon: FileText },
    archived: { label: 'Archived', color: 'text-stone-500 bg-stone-100', icon: FileText },
    effective: { label: 'Effective', color: 'text-stone-700 bg-stone-100', icon: FileCheck },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-stone-600" />
          Document Status
        </CardTitle>
        <CardDescription>Overview of document workflow status</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(statusCounts).map(([status, count]) => {
            const config = statusConfig[status as DocumentStatus];
            if (!config) return null;
            const Icon = config.icon;

            return (
              <div
                key={status}
                className={`rounded-lg p-3 ${config.color.split(' ')[1]} cursor-pointer hover:opacity-80 transition-opacity`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${config.color.split(' ')[0]}`} />
                    <span className="text-sm font-medium">{config.label}</span>
                  </div>
                  <span className="text-lg font-bold">{count}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t">
          <h4 className="text-sm font-medium mb-3">Requires Your Attention</h4>
          <div className="space-y-2">
            {documents
              .filter(d => d.status === 'pending_approval' || d.status === 'in_review')
              .slice(0, 3)
              .map(doc => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between rounded-lg border p-2 hover:bg-stone-50 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium truncate max-w-48">{doc.name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {statusConfig[doc.status]?.label || doc.status}
                  </Badge>
                </div>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TASK LIST COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface TaskListProps {
  tasks: TaskSummary[];
}

const TaskList: React.FC<TaskListProps> = ({ tasks }) => {
  const getPriorityColor = (priority: TaskSummary['priority']) => {
    switch (priority) {
      case 'critical':
        return 'bg-stone-100 text-stone-800 border-stone-200';
      case 'high':
        return 'bg-stone-100 text-stone-800 border-stone-200';
      case 'medium':
        return 'bg-stone-100 text-stone-800 border-stone-200';
      case 'low':
        return 'bg-stone-100 text-stone-800 border-stone-200';
      default:
        return 'bg-stone-100 text-stone-800';
    }
  };

  const formatDueDate = (date: Date) => {
    const now = new Date();
    const due = new Date(date);
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, urgent: true };
    if (diff === 0) return { text: 'Due today', urgent: true };
    if (diff === 1) return { text: 'Due tomorrow', urgent: true };
    if (diff <= 7) return { text: `Due in ${diff}d`, urgent: false };
    return {
      text: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(due),
      urgent: false,
    };
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-stone-600" />
              My Tasks
            </CardTitle>
            <CardDescription>Pending actions and deadlines</CardDescription>
          </div>
          <Badge variant="secondary">
            {tasks.filter(t => t.status !== 'completed').length} pending
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {tasks
            .filter(t => t.status !== 'completed')
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
            .slice(0, 6)
            .map(task => {
              const dueInfo = formatDueDate(task.dueDate);

              return (
                <div
                  key={task.id}
                  className="flex items-start justify-between rounded-lg border p-3 hover:bg-stone-50 cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-stone-300"
                      onChange={() => {}}
                    />
                    <div className="space-y-1">
                      <div className="font-medium text-sm">{task.title}</div>
                      <div className="text-xs text-muted-foreground">{task.description}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={`text-xs ${getPriorityColor(task.priority)}`}>
                      {task.priority}
                    </Badge>
                    <span
                      className={`text-xs ${dueInfo.urgent ? 'text-stone-700 font-medium' : 'text-muted-foreground'}`}
                    >
                      {dueInfo.text}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
        <Button variant="ghost" className="w-full mt-3">
          View all tasks
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AI INSIGHTS COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface AIInsight {
  id: string;
  type: 'recommendation' | 'alert' | 'opportunity';
  title: string;
  description: string;
  action?: string;
}

interface AIInsightsProps {
  insights: AIInsight[];
}

const AIInsights: React.FC<AIInsightsProps> = ({ insights }) => {
  const getInsightConfig = (type: AIInsight['type']) => {
    switch (type) {
      case 'recommendation':
        return { color: 'border-stone-200 bg-stone-100', icon: Sparkles, iconColor: 'text-stone-600' };
      case 'alert':
        return {
          color: 'border-stone-200 bg-stone-100',
          icon: AlertTriangle,
          iconColor: 'text-stone-600',
        };
      case 'opportunity':
        return {
          color: 'border-stone-200 bg-stone-100',
          icon: ArrowUpRight,
          iconColor: 'text-stone-700',
        };
      default:
        return { color: 'border-stone-200 bg-stone-50', icon: Sparkles, iconColor: 'text-stone-600' };
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-stone-600" />
          AI Insights
        </CardTitle>
        <CardDescription>Intelligent recommendations and alerts</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {insights.map(insight => {
            const config = getInsightConfig(insight.type);
            const Icon = config.icon;

            return (
              <div
                key={insight.id}
                className={`rounded-lg border p-3 ${config.color} cursor-pointer hover:opacity-90 transition-opacity`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`h-5 w-5 mt-0.5 ${config.iconColor}`} />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{insight.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{insight.description}</div>
                    {insight.action && (
                      <Button variant="link" size="sm" className="h-auto p-0 mt-2 text-xs">
                        {insight.action}
                        <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN REGULATORY LEAD DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export const RegulatoryLeadDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('submissions');

  // Mock data
  const submissions: Submission[] = [
    {
      id: '1',
      name: 'BTX-331 IND',
      type: 'IND',
      agency: 'FDA',
      status: 'review',
      progress: 78,
      dueDate: new Date('2026-03-15'),
      assignee: 'Sarah Johnson',
      documentsTotal: 42,
      documentsReady: 33,
    },
    {
      id: '2',
      name: 'MX-201 NDA',
      type: 'NDA',
      agency: 'FDA',
      status: 'drafting',
      progress: 45,
      dueDate: new Date('2026-06-30'),
      assignee: 'Michael Chen',
      documentsTotal: 156,
      documentsReady: 70,
    },
    {
      id: '3',
      name: 'DVX-450 510(k)',
      type: '510(k)',
      agency: 'FDA',
      status: 'ready',
      progress: 95,
      dueDate: new Date('2026-02-01'),
      assignee: 'Emily Davis',
      documentsTotal: 28,
      documentsReady: 27,
    },
  ];

  const documents: DocumentSummary[] = [
    {
      id: '1',
      name: 'Clinical Overview v2.3',
      category: 'clinical',
      status: 'pending_approval',
      version: '2.3',
      author: 'J. Smith',
      createdAt: new Date(),
      updatedAt: new Date(),
      size: 2400000,
      fileType: 'docx',
      tags: ['M2'],
    },
    {
      id: '2',
      name: 'Nonclinical Summary',
      category: 'nonclinical',
      status: 'in_review',
      version: '1.0',
      author: 'M. Chen',
      createdAt: new Date(),
      updatedAt: new Date(),
      size: 1800000,
      fileType: 'docx',
      tags: ['M2'],
    },
    {
      id: '3',
      name: 'Quality Overall Summary',
      category: 'cmc',
      status: 'draft',
      version: '0.9',
      author: 'E. Davis',
      createdAt: new Date(),
      updatedAt: new Date(),
      size: 3200000,
      fileType: 'docx',
      tags: ['M2'],
    },
    {
      id: '4',
      name: 'Protocol BTX-331-001',
      category: 'protocol',
      status: 'approved',
      version: '3.0',
      author: 'S. Johnson',
      createdAt: new Date(),
      updatedAt: new Date(),
      size: 1500000,
      fileType: 'pdf',
      tags: ['clinical'],
    },
    {
      id: '5',
      name: 'Investigator Brochure',
      category: 'clinical',
      status: 'effective',
      version: '5.0',
      author: 'R. Wilson',
      createdAt: new Date(),
      updatedAt: new Date(),
      size: 4500000,
      fileType: 'pdf',
      tags: ['IB'],
    },
    {
      id: '6',
      name: 'CMC Module 3.2.P',
      category: 'cmc',
      status: 'in_review',
      version: '1.2',
      author: 'A. Kumar',
      createdAt: new Date(),
      updatedAt: new Date(),
      size: 8900000,
      fileType: 'pdf',
      tags: ['M3'],
    },
  ];

  const tasks: TaskSummary[] = [
    {
      id: '1',
      title: 'Review Clinical Overview v2.3',
      description: 'Final review before QC',
      type: 'document_review',
      status: 'pending',
      priority: 'critical',
      assignee: 'Me',
      dueDate: new Date(Date.now() + 86400000),
      createdAt: new Date(),
    },
    {
      id: '2',
      title: 'Approve Nonclinical Summary',
      description: 'Pending regulatory approval',
      type: 'document_approval',
      status: 'pending',
      priority: 'high',
      assignee: 'Me',
      dueDate: new Date(Date.now() + 172800000),
      createdAt: new Date(),
    },
    {
      id: '3',
      title: 'Complete 510(k) submission checklist',
      description: 'Final verification',
      type: 'submission_prep',
      status: 'in_progress',
      priority: 'high',
      assignee: 'Me',
      dueDate: new Date(Date.now() + 432000000),
      createdAt: new Date(),
    },
    {
      id: '4',
      title: 'Schedule FDA Type B meeting',
      description: 'Pre-IND meeting for BTX-331',
      type: 'correspondence',
      status: 'pending',
      priority: 'medium',
      assignee: 'Me',
      dueDate: new Date(Date.now() + 604800000),
      createdAt: new Date(),
    },
  ];

  const insights: AIInsight[] = [
    {
      id: '1',
      type: 'alert',
      title: 'Missing Module 2.5',
      description:
        'Clinical Overview section 2.5.4 is referenced but not present in the submission package.',
      action: 'View details',
    },
    {
      id: '2',
      type: 'recommendation',
      title: 'Optimize submission timeline',
      description:
        'Based on current progress, consider prioritizing CMC documentation to meet the March 15 deadline.',
      action: 'See recommendation',
    },
    {
      id: '3',
      type: 'opportunity',
      title: 'Fast Track eligibility',
      description:
        'BTX-331 may qualify for Fast Track designation based on indication and mechanism of action.',
      action: 'Explore options',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Regulatory Dashboard</h1>
          <p className="text-muted-foreground">Manage submissions, documents, and compliance</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Search className="h-4 w-4 mr-1" />
            Search
          </Button>
          <Button size="sm">
            <Send className="h-4 w-4 mr-1" />
            New Submission
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Submissions</p>
                <p className="text-2xl font-bold">{submissions.length}</p>
              </div>
              <FileStack className="h-8 w-8 text-stone-900 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Reviews</p>
                <p className="text-2xl font-bold">
                  {documents.filter(d => d.status === 'in_review').length}
                </p>
              </div>
              <FileText className="h-8 w-8 text-stone-900 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tasks Due This Week</p>
                <p className="text-2xl font-bold">
                  {
                    tasks.filter(t => {
                      const daysUntil = Math.ceil(
                        (new Date(t.dueDate).getTime() - Date.now()) / 86400000
                      );
                      return daysUntil <= 7 && daysUntil >= 0;
                    }).length
                  }
                </p>
              </div>
              <Clock className="h-8 w-8 text-stone-900 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">AI Alerts</p>
                <p className="text-2xl font-bold">
                  {insights.filter(i => i.type === 'alert').length}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-stone-900 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <SubmissionTracker submissions={submissions} />
          <DocumentStatusOverview documents={documents} />
        </div>
        <div className="space-y-6">
          <TaskList tasks={tasks} />
          <AIInsights insights={insights} />
        </div>
      </div>
    </div>
  );
};

export default RegulatoryLeadDashboard;
