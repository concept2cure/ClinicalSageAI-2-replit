/**
 * FDA Compliance Command Center
 * Interactive dashboard for managing FDA compliance issues with actionable cards
 * Part of the Global Change Management System
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTenantContext } from '@/contexts/TenantContext';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertCircle,
  AlertTriangle,
  XCircle,
  CheckCircle,
  CheckCircle2,
  Info,
  Clock,
  User,
  Users,
  Zap,
  FileText,
  ChevronRight,
  Filter,
  Search,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart2,
  RefreshCw,
  HelpCircle,
  MessageSquare,
  Wrench,
  Calendar,
  Tag,
  Hash,
  Flag,
  Target,
  Gauge,
  ArrowUp,
  ArrowDown,
  ArrowRight,
} from 'lucide-react';

/**
 * Mock FDA compliance data generator
 */
const generateMockComplianceData = () => {
  const regulations = [
    { ref: '21 CFR Part 11', description: 'Electronic Records and Signatures' },
    { ref: '21 CFR 314.50', description: 'Content and format of an NDA' },
    { ref: '21 CFR 314.70', description: 'Supplements and other changes to an approved NDA' },
    { ref: '21 CFR 312.23', description: 'IND content and format' },
    { ref: '21 CFR 820.30', description: 'Design Controls' },
    { ref: '21 CFR 58', description: 'Good Laboratory Practice' },
    { ref: '21 CFR 211', description: 'Current Good Manufacturing Practice' },
    { ref: '21 CFR 201.56', description: 'Labeling requirements' },
    { ref: '21 CFR 312.32', description: 'IND safety reporting' },
    { ref: '21 CFR 814.20', description: 'PMA application' },
  ];

  const severities = ['critical', 'major', 'minor', 'info'];
  const statuses = ['open', 'in_progress', 'resolved', 'pending_review'];

  const issues = [];
  for (let i = 0; i < 15; i++) {
    const regulation = regulations[Math.floor(Math.random() * regulations.length)];
    const severity = severities[Math.floor(Math.random() * severities.length)];

    issues.push({
      id: `COMP-${1000 + i}`,
      severity,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      cfr: regulation.ref,
      title: regulation.description,
      description: `Non-compliance detected in ${regulation.description} requirements`,
      impact:
        severity === 'critical'
          ? 'High - May delay regulatory approval'
          : severity === 'major'
          ? 'Medium - Requires immediate attention'
          : severity === 'minor'
          ? 'Low - Should be addressed before submission'
          : 'Informational - Best practice recommendation',
      remediation: [
        'Review and update documentation',
        'Implement required controls',
        'Validate changes per SOP',
        'Document rationale for approach',
      ],
      detectedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      assignedTo: Math.random() > 0.5 ? 'John Doe' : null,
      moduleContext: ['Module 3', 'Module 2', 'Module 5'][Math.floor(Math.random() * 3)],
      documentCount: Math.floor(Math.random() * 10) + 1,
      estimatedEffort: `${Math.floor(Math.random() * 8) + 1} hours`,
    });
  }

  return issues;
};

/**
 * Compliance Score Gauge Component
 */
function ComplianceScoreGauge({ score }) {
  const getScoreColor = score => {
    if (score >= 90) return 'text-green-600 dark:text-green-400';
    if (score >= 75) return 'text-yellow-600 dark:text-yellow-400';
    if (score >= 60) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreLabel = score => {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 60) return 'Fair';
    return 'Needs Attention';
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg className="w-32 h-32 transform -rotate-90">
          <circle
            cx="64"
            cy="64"
            r="56"
            stroke="currentColor"
            strokeWidth="12"
            fill="none"
            className="text-slate-200 dark:text-slate-700"
          />
          <circle
            cx="64"
            cy="64"
            r="56"
            stroke="currentColor"
            strokeWidth="12"
            fill="none"
            strokeDasharray={`${(score / 100) * 351.86} 351.86`}
            className={getScoreColor(score)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Gauge className={`h-6 w-6 ${getScoreColor(score)}`} />
          <span className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}%</span>
        </div>
      </div>
      <div className="text-center mt-3">
        <div className={`font-semibold ${getScoreColor(score)}`}>{getScoreLabel(score)}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Compliance Score</div>
      </div>
    </div>
  );
}

/**
 * Compliance Issue Card Component
 */
function ComplianceIssueCard({ issue, onAction }) {
  const [showActions, setShowActions] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState(issue.assignedTo || '');
  const [clarificationText, setClarificationText] = useState('');
  const [showClarificationDialog, setShowClarificationDialog] = useState(false);

  const getSeverityConfig = severity => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return {
          icon: <ShieldX className="h-5 w-5" />,
          color: 'border-red-500 bg-red-50 dark:bg-red-950/30',
          iconColor: 'text-red-600 dark:text-red-400',
          badgeClass:
            'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700',
        };
      case 'major':
        return {
          icon: <ShieldAlert className="h-5 w-5" />,
          color: 'border-orange-500 bg-orange-50 dark:bg-orange-950/30',
          iconColor: 'text-orange-600 dark:text-orange-400',
          badgeClass:
            'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-700',
        };
      case 'minor':
        return {
          icon: <AlertTriangle className="h-5 w-5" />,
          color: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30',
          iconColor: 'text-yellow-600 dark:text-yellow-400',
          badgeClass:
            'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700',
        };
      default:
        return {
          icon: <Info className="h-5 w-5" />,
          color: 'border-stone-500 bg-stone-50',
          iconColor: 'text-stone-600',
          badgeClass: 'bg-stone-100 text-stone-800 border-stone-300',
        };
    }
  };

  const getStatusIcon = status => {
    switch (status) {
      case 'resolved':
        return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-stone-600 dark:text-stone-400" />;
      case 'pending_review':
        return <Activity className="h-4 w-4 text-purple-600 dark:text-purple-400" />;
      default:
        return <AlertCircle className="h-4 w-4 text-slate-600 dark:text-slate-400" />;
    }
  };

  const config = getSeverityConfig(issue.severity);

  const handleFixNow = () => {
    onAction('fix', issue);
  };

  const handleAssignOwner = () => {
    if (selectedOwner) {
      onAction('assign', { ...issue, assignedTo: selectedOwner });
    }
  };

  const handleRequestClarification = () => {
    setShowClarificationDialog(true);
  };

  const handleSubmitClarification = () => {
    onAction('clarify', { ...issue, clarificationRequest: clarificationText });
    setShowClarificationDialog(false);
    setClarificationText('');
  };

  const handleMarkResolved = () => {
    onAction('resolve', issue);
  };

  const timeSince = date => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    const intervals = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60,
    };

    for (const [name, count] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / count);
      if (interval > 0) {
        return `${interval} ${name}${interval !== 1 ? 's' : ''} ago`;
      }
    }
    return 'just now';
  };

  return (
    <>
      <Card
        className={`border-2 ${config.color} hover:shadow-lg transition-all duration-200 cursor-pointer`}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
        data-testid={`card-compliance-issue-${issue.id}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className={config.iconColor}>{config.icon}</div>
              <Badge variant="outline" className={config.badgeClass}>
                {issue.severity.toUpperCase()}
              </Badge>
              {getStatusIcon(issue.status)}
            </div>
            <Badge variant="secondary" className="font-mono text-xs">
              {issue.id}
            </Badge>
          </div>
          <CardTitle className="text-base mt-2 flex items-center gap-2">
            <Shield className="h-4 w-4 text-stone-600 dark:text-stone-400" />
            {issue.cfr}
          </CardTitle>
          <CardDescription className="mt-1">{issue.title}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm text-slate-700 dark:text-slate-300">{issue.description}</div>

            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {timeSince(issue.detectedAt)}
              </div>
              <div className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {issue.documentCount} docs
              </div>
              <div className="flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {issue.moduleContext}
              </div>
            </div>

            <div className="bg-slate-100 dark:bg-slate-800/50 rounded-md p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Impact Assessment
              </div>
              <div className="text-sm text-slate-700 dark:text-slate-300">{issue.impact}</div>
            </div>

            {issue.status === 'resolved' && (
              <div className="flex items-center gap-2 p-2 bg-green-100 dark:bg-green-900/30 rounded-md">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm text-green-800 dark:text-green-200">Issue Resolved</span>
              </div>
            )}

            {issue.assignedTo && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Assigned to: <span className="font-medium">{issue.assignedTo}</span>
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Recommended Remediation
            </div>
            <ul className="space-y-1">
              {issue.remediation.map((step, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400"
                >
                  <ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0 text-slate-400" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>

          {(showActions || issue.status === 'open') && (
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button
                size="sm"
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleFixNow}
                disabled={issue.status === 'resolved'}
                data-testid={`button-fix-now-${issue.id}`}
              >
                <Zap className="h-3 w-3 mr-1" />
                Fix Now
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={handleMarkResolved}
                disabled={issue.status === 'resolved'}
                data-testid={`button-mark-resolved-${issue.id}`}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Mark Resolved
              </Button>

              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={issue.status === 'resolved'}
                    data-testid={`button-assign-owner-${issue.id}`}
                  >
                    <Users className="h-3 w-3 mr-1" />
                    Assign Owner
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Assign Owner</DialogTitle>
                    <DialogDescription>
                      Select a team member to own this compliance issue
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Team Member</Label>
                      <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                        <SelectTrigger data-testid={`select-owner-trigger-${issue.id}`}>
                          <SelectValue placeholder="Select a team member" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="John Doe">John Doe - Regulatory Lead</SelectItem>
                          <SelectItem value="Jane Smith">Jane Smith - QA Manager</SelectItem>
                          <SelectItem value="Mike Johnson">
                            Mike Johnson - Clinical Expert
                          </SelectItem>
                          <SelectItem value="Sarah Williams">
                            Sarah Williams - CMC Specialist
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={handleAssignOwner}
                      data-testid={`button-confirm-assign-${issue.id}`}
                    >
                      Assign
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button
                size="sm"
                variant="outline"
                onClick={handleRequestClarification}
                disabled={issue.status === 'resolved'}
                data-testid={`button-request-clarification-${issue.id}`}
              >
                <MessageSquare className="h-3 w-3 mr-1" />
                Request Clarification
              </Button>
            </div>
          )}

          {issue.estimatedEffort && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
              <span className="text-xs text-slate-500 dark:text-slate-400">Estimated effort:</span>
              <Badge variant="secondary" className="text-xs">
                {issue.estimatedEffort}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showClarificationDialog} onOpenChange={setShowClarificationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Clarification</DialogTitle>
            <DialogDescription>
              Ask questions about this compliance issue ({issue.cfr})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Your Question</Label>
              <Textarea
                value={clarificationText}
                onChange={e => setClarificationText(e.target.value)}
                placeholder="Enter your questions or concerns about this compliance issue..."
                className="min-h-[100px]"
                data-testid={`textarea-clarification-${issue.id}`}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClarificationDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitClarification}
              data-testid={`button-submit-clarification-${issue.id}`}
            >
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Main Compliance Command Center Component
 */
export function ComplianceCommandCenter({ documentId, onClose }) {
  const { toast } = useToast();
  const { currentOrganization } = useTenantContext();

  const [complianceIssues, setComplianceIssues] = useState([]);
  const [filteredIssues, setFilteredIssues] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cfrFilter, setCfrFilter] = useState('all');
  const [sortBy, setSortBy] = useState('severity');
  const [complianceScore, setComplianceScore] = useState(0);

  // Initialize with mock data
  useEffect(() => {
    const mockData = generateMockComplianceData();
    setComplianceIssues(mockData);
    setFilteredIssues(mockData);

    // Calculate compliance score
    const resolved = mockData.filter(i => i.status === 'resolved').length;
    const total = mockData.length;
    const score = total > 0 ? Math.round((resolved / total) * 100) : 100;
    setComplianceScore(100 - Math.round((total - resolved) * 2.5)); // Penalty for open issues
  }, []);

  // Apply filters and sorting
  useEffect(() => {
    let filtered = [...complianceIssues];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        issue =>
          issue.cfr.toLowerCase().includes(searchQuery.toLowerCase()) ||
          issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          issue.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          issue.id.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply severity filter
    if (severityFilter !== 'all') {
      filtered = filtered.filter(issue => issue.severity === severityFilter);
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(issue => issue.status === statusFilter);
    }

    // Apply CFR filter
    if (cfrFilter !== 'all') {
      filtered = filtered.filter(issue => issue.cfr === cfrFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === 'severity') {
        const severityOrder = { critical: 0, major: 1, minor: 2, info: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      if (sortBy === 'date') {
        return new Date(b.detectedAt) - new Date(a.detectedAt);
      }
      if (sortBy === 'cfr') {
        return a.cfr.localeCompare(b.cfr);
      }
      return 0;
    });

    setFilteredIssues(filtered);
  }, [searchQuery, severityFilter, statusFilter, cfrFilter, sortBy, complianceIssues]);

  // Handle issue actions
  const handleIssueAction = async (action, issue) => {
    switch (action) {
      case 'fix':
        toast({
          title: 'Applying Fix',
          description: `Automated remediation initiated for ${issue.cfr}`,
        });
        // Update issue status
        setComplianceIssues(prev =>
          prev.map(i => (i.id === issue.id ? { ...i, status: 'in_progress' } : i))
        );
        break;

      case 'assign':
        toast({
          title: 'Owner Assigned',
          description: `${issue.assignedTo} assigned to ${issue.cfr}`,
        });
        // Update issue
        setComplianceIssues(prev =>
          prev.map(i => (i.id === issue.id ? { ...i, assignedTo: issue.assignedTo } : i))
        );
        break;

      case 'clarify':
        toast({
          title: 'Clarification Requested',
          description: 'Your question has been submitted to the compliance team',
        });
        break;

      case 'resolve':
        toast({
          title: 'Issue Resolved',
          description: `${issue.cfr} marked as resolved`,
        });
        // Update issue status
        setComplianceIssues(prev =>
          prev.map(i => (i.id === issue.id ? { ...i, status: 'resolved' } : i))
        );
        // Recalculate score
        setComplianceScore(prev => Math.min(100, prev + 5));
        break;
    }
  };

  // Calculate statistics
  const stats = useMemo(() => {
    const critical = complianceIssues.filter(i => i.severity === 'critical').length;
    const major = complianceIssues.filter(i => i.severity === 'major').length;
    const minor = complianceIssues.filter(i => i.severity === 'minor').length;
    const info = complianceIssues.filter(i => i.severity === 'info').length;

    const open = complianceIssues.filter(i => i.status === 'open').length;
    const inProgress = complianceIssues.filter(i => i.status === 'in_progress').length;
    const resolved = complianceIssues.filter(i => i.status === 'resolved').length;
    const pendingReview = complianceIssues.filter(i => i.status === 'pending_review').length;

    return {
      bySeverity: { critical, major, minor, info },
      byStatus: { open, inProgress, resolved, pendingReview },
      total: complianceIssues.length,
    };
  }, [complianceIssues]);

  // Get unique CFR references for filter
  const uniqueCFRs = useMemo(() => {
    return [...new Set(complianceIssues.map(i => i.cfr))].sort();
  }, [complianceIssues]);

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-stone-600 dark:text-stone-400" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              FDA Compliance Command Center
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Real-time compliance monitoring and issue resolution
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newData = generateMockComplianceData();
              setComplianceIssues(newData);
            }}
            data-testid="button-refresh-compliance"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Metrics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Compliance Score */}
        <Card className="border-2 border-stone-200 bg-gradient-to-br from-stone-50 to-indigo-50 dark:to-indigo-950/30">
          <CardContent className="p-6 flex items-center justify-center">
            <ComplianceScoreGauge score={complianceScore} />
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              Issue Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldX className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">Critical</span>
                </div>
                <Badge variant="destructive">{stats.bySeverity.critical}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">Major</span>
                </div>
                <Badge className="bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200">
                  {stats.bySeverity.major}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">Minor</span>
                </div>
                <Badge className="bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200">
                  {stats.bySeverity.minor}
                </Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Total
                </span>
                <Badge variant="secondary">{stats.total}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resolution Status */}
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              Resolution Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">Open</span>
                <Badge variant="outline">{stats.byStatus.open}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">In Progress</span>
                <Badge className="bg-stone-100 text-stone-800 ">{stats.byStatus.inProgress}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">Pending Review</span>
                <Badge className="bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200">
                  {stats.byStatus.pendingReview}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">Resolved</span>
                <Badge className="bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200">
                  {stats.byStatus.resolved}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Compliance Trend */}
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              Compliance Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">This Week</span>
                <div className="flex items-center gap-1">
                  <ArrowUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                    +12%
                  </span>
                </div>
              </div>
              <Progress value={complianceScore} className="h-2" />
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {stats.byStatus.resolved} of {stats.total} issues resolved
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Avg. Resolution Time
                </span>
                <Badge variant="secondary" className="text-xs">
                  2.5 days
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by CFR, ID, or description..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-compliance"
                />
              </div>
            </div>

            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-severity-filter">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="major">Major</SelectItem>
                <SelectItem value="minor">Minor</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>

            <Select value={cfrFilter} onValueChange={setCfrFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-cfr-filter">
                <SelectValue placeholder="CFR Section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All CFR Sections</SelectItem>
                {uniqueCFRs.map(cfr => (
                  <SelectItem key={cfr} value={cfr}>
                    {cfr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[140px]" data-testid="select-sort-by">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="severity">Severity</SelectItem>
                <SelectItem value="date">Date Detected</SelectItem>
                <SelectItem value="cfr">CFR Section</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Suggested Action Queue */}
      {filteredIssues.filter(i => i.severity === 'critical' && i.status === 'open').length > 0 && (
        <Alert className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
          <ShieldX className="h-5 w-5 text-red-600 dark:text-red-400" />
          <AlertTitle className="text-red-900 dark:text-red-100">
            Critical Issues Require Immediate Attention
          </AlertTitle>
          <AlertDescription className="text-red-800 dark:text-red-200">
            You have{' '}
            {filteredIssues.filter(i => i.severity === 'critical' && i.status === 'open').length}{' '}
            critical compliance issues that should be addressed immediately to avoid regulatory
            delays.
          </AlertDescription>
        </Alert>
      )}

      {/* Issue Cards Grid */}
      <ScrollArea className="h-[600px] pr-4">
        {filteredIssues.length === 0 ? (
          <Card className="border-slate-200 dark:border-slate-700">
            <CardContent className="p-12 text-center">
              <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                No Compliance Issues Found
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                All compliance requirements are currently being met.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredIssues.map(issue => (
              <ComplianceIssueCard key={issue.id} issue={issue} onAction={handleIssueAction} />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Timeline View (Optional - shows when issues were detected) */}
      {filteredIssues.length > 0 && (
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              Detection Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />
              <div className="space-y-4">
                {filteredIssues.slice(0, 5).map((issue, idx) => (
                  <div key={issue.id} className="flex items-start gap-4">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center">
                        <div className="w-3 h-3 rounded-full bg-stone-800 dark:bg-stone-400" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {issue.cfr}
                        </Badge>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(issue.detectedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        {issue.title}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ComplianceCommandCenter;
