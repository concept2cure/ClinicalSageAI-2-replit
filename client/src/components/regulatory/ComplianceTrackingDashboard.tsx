import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CheckCircle,
  AlertCircle,
  Clock,
  TrendingUp,
  Calendar,
  FileText,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

// Type Definitions
interface RegSubmission {
  sub_id: string;
  product_id: string;
  sub_type: string;
  region: string;
  status: string;
  title: string;
  description: string;
  target_date: string;
  created_at: string;
  updated_at: string;
}

interface RegObligation {
  obl_id: string;
  sub_id: string;
  product_id: string;
  region: string;
  title: string;
  source: string;
  severity: string;
  status: string;
  due_date: string;
  priority: string;
  created_at: string;
  updated_at: string;
  due_state?: string;
}

interface DashboardStats {
  summary: {
    total: number;
    open: number;
    completed: number;
    overdue: number;
    due_soon: number;
    critical: number;
    major: number;
    minor: number;
  };
}

export default function ComplianceTrackingDashboard() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedObligation, setSelectedObligation] = useState<RegObligation | null>(null);
  const [newStatus, setNewStatus] = useState<string>('');
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);

  // Fetch submissions for deadlines
  const { data: submissions = [], isLoading: submissionsLoading } = useQuery<RegSubmission[]>({
    queryKey: ['/api/reg/submissions'],
  });

  // Fetch dashboard statistics
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/obligations/dashboard/stats'],
  });

  // Fetch all obligations across submissions
  const { data: allObligations = [], isLoading: obligationsLoading } = useQuery<RegObligation[]>({
    queryKey: ['/api/obligations/all'],
    queryFn: async () => {
      if (!submissions || submissions.length === 0) return [];
      
      // Fetch obligations for all submissions
      const obligationPromises = submissions.map(sub =>
        fetch(`/api/obligations/${sub.sub_id}/obligations`).then(res => res.json())
      );
      
      const results = await Promise.all(obligationPromises);
      const allObs: RegObligation[] = [];
      
      results.forEach(result => {
        if (result.success && result.data) {
          allObs.push(...result.data);
        }
      });
      
      return allObs;
    },
    enabled: !!submissions && submissions.length > 0,
  });

  // Update obligation status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ oblId, subId, status }: { oblId: string; subId: string; status: string }) => {
      return apiRequest('PUT', `/api/obligations/${subId}/obligations/${oblId}`, { status, updatedBy: 'user' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/obligations/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/obligations/dashboard/stats'] });
      toast({
        title: 'Status Updated',
        description: 'Obligation status has been updated successfully.',
      });
      setIsStatusDialogOpen(false);
      setSelectedObligation(null);
    },
    onError: () => {
      toast({
        title: 'Update Failed',
        description: 'Failed to update obligation status.',
        variant: 'destructive',
      });
    },
  });

  // Calculate compliance metrics
  const complianceMetrics = useMemo(() => {
    if (!submissions || submissions.length === 0) {
      return {
        complianceScore: 0,
        activeObligations: 0,
        upcomingDeadlines: 0,
        overdueItems: 0,
      };
    }

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Calculate compliance score from submissions
    const completedOnTime = submissions.filter(sub => {
      if (sub.status === 'approved' && sub.target_date) {
        const targetDate = new Date(sub.target_date);
        const updatedDate = new Date(sub.updated_at);
        return updatedDate <= targetDate;
      }
      return false;
    }).length;

    const totalCompleted = submissions.filter(sub => sub.status === 'approved').length;
    const complianceScore = totalCompleted > 0 ? Math.round((completedOnTime / totalCompleted) * 100) : 0;

    // Active obligations
    const activeObligations = allObligations.filter(
      obl => obl.status === 'OPEN' || obl.status === 'IN_PROGRESS'
    ).length;

    // Upcoming deadlines (next 30 days)
    const upcomingDeadlines = submissions.filter(sub => {
      if (!sub.target_date) return false;
      const targetDate = new Date(sub.target_date);
      return targetDate >= now && targetDate <= thirtyDaysFromNow && sub.status !== 'approved';
    }).length;

    // Overdue items
    const overdueItems = stats?.summary?.overdue || 0;

    return {
      complianceScore,
      activeObligations,
      upcomingDeadlines,
      overdueItems,
    };
  }, [submissions, allObligations, stats]);

  // Filter obligations based on status
  const filteredObligations = useMemo(() => {
    if (statusFilter === 'all') return allObligations;
    
    if (statusFilter === 'pending') {
      return allObligations.filter(obl => obl.status === 'OPEN' || obl.status === 'IN_PROGRESS');
    }
    
    if (statusFilter === 'completed') {
      return allObligations.filter(obl => obl.status === 'COMPLETED');
    }
    
    if (statusFilter === 'overdue') {
      return allObligations.filter(obl => {
        if (!obl.due_date) return false;
        const dueDate = new Date(obl.due_date);
        const now = new Date();
        return dueDate < now && obl.status !== 'COMPLETED';
      });
    }
    
    return allObligations;
  }, [allObligations, statusFilter]);

  // Calculate deadline urgency color
  const getDeadlineColor = (targetDate: string) => {
    if (!targetDate) return 'gray';
    
    const now = new Date();
    const target = new Date(targetDate);
    const daysUntil = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntil < 0) return 'red'; // Overdue
    if (daysUntil <= 7) return 'red'; // <7 days
    if (daysUntil <= 30) return 'yellow'; // 7-30 days
    return 'green'; // >30 days
  };

  const handleUpdateStatus = (obligation: RegObligation) => {
    setSelectedObligation(obligation);
    setNewStatus(obligation.status);
    setIsStatusDialogOpen(true);
  };

  const confirmStatusUpdate = () => {
    if (selectedObligation && newStatus) {
      updateStatusMutation.mutate({
        oblId: selectedObligation.obl_id,
        subId: selectedObligation.sub_id,
        status: newStatus,
      });
    }
  };

  const isLoading = submissionsLoading || statsLoading || obligationsLoading;

  return (
    <div className="space-y-6" data-testid="compliance-tracking-dashboard">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-compliance-score">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliance Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" data-testid="loading-compliance-score" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="value-compliance-score">
                  {complianceMetrics.complianceScore}%
                </div>
                <p className="text-xs text-muted-foreground">On-time submissions</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-active-obligations">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Obligations</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" data-testid="loading-active-obligations" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="value-active-obligations">
                  {complianceMetrics.activeObligations}
                </div>
                <p className="text-xs text-muted-foreground">Open & in progress</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-upcoming-deadlines">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Deadlines</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" data-testid="loading-upcoming-deadlines" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="value-upcoming-deadlines">
                  {complianceMetrics.upcomingDeadlines}
                </div>
                <p className="text-xs text-muted-foreground">Next 30 days</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-overdue-items">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Items</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" data-testid="loading-overdue-items" />
            ) : (
              <>
                <div className="text-2xl font-bold text-red-600" data-testid="value-overdue-items">
                  {complianceMetrics.overdueItems}
                </div>
                <p className="text-xs text-muted-foreground">Requires attention</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Commitments Table */}
      <Card data-testid="card-commitments-table">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Regulatory Commitments</CardTitle>
              <CardDescription>Track and manage all regulatory obligations</CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {obligationsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-12 w-full" data-testid={`loading-obligation-${i}`} />
              ))}
            </div>
          ) : filteredObligations.length === 0 ? (
            <div className="text-center py-12" data-testid="empty-obligations">
              <FileText className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">No obligations found</p>
              <p className="text-sm text-gray-400">
                {statusFilter !== 'all' 
                  ? 'Try changing the filter to see more obligations' 
                  : 'Create your first regulatory obligation to get started'}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Commitment</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Submission ID</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredObligations.map((obligation) => (
                    <TableRow key={obligation.obl_id} data-testid={`row-obligation-${obligation.obl_id}`}>
                      <TableCell className="font-medium max-w-md">
                        {obligation.title}
                      </TableCell>
                      <TableCell>
                        {obligation.due_date ? (
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-gray-400" />
                            {new Date(obligation.due_date).toLocaleDateString()}
                          </div>
                        ) : (
                          <span className="text-gray-400">No date set</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            obligation.status === 'COMPLETED'
                              ? 'default'
                              : obligation.status === 'OPEN'
                                ? 'secondary'
                                : 'outline'
                          }
                          data-testid={`badge-status-${obligation.obl_id}`}
                        >
                          {obligation.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            obligation.severity === 'CRITICAL'
                              ? 'destructive'
                              : obligation.severity === 'MAJOR'
                                ? 'default'
                                : 'secondary'
                          }
                        >
                          {obligation.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-gray-600">
                        {obligation.sub_id.substring(0, 8)}...
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUpdateStatus(obligation)}
                          data-testid={`button-update-status-${obligation.obl_id}`}
                        >
                          Update Status
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deadlines Timeline */}
      <Card data-testid="card-deadlines-timeline">
        <CardHeader>
          <CardTitle>Submission Deadlines Timeline</CardTitle>
          <CardDescription>Visual timeline of upcoming regulatory submissions</CardDescription>
        </CardHeader>
        <CardContent>
          {submissionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" data-testid={`loading-deadline-${i}`} />
              ))}
            </div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-12" data-testid="empty-deadlines">
              <Calendar className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">No submission deadlines</p>
              <p className="text-sm text-gray-400">Submission deadlines will appear here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {submissions
                .filter(sub => sub.target_date)
                .sort((a, b) => new Date(a.target_date).getTime() - new Date(b.target_date).getTime())
                .slice(0, 10)
                .map((submission) => {
                  const color = getDeadlineColor(submission.target_date);
                  const now = new Date();
                  const target = new Date(submission.target_date);
                  const daysUntil = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  
                  return (
                    <div
                      key={submission.sub_id}
                      className={`p-4 border-l-4 rounded-lg ${
                        color === 'red'
                          ? 'border-red-500 bg-red-50'
                          : color === 'yellow'
                            ? 'border-yellow-500 bg-yellow-50'
                            : 'border-green-500 bg-green-50'
                      }`}
                      data-testid={`deadline-${submission.sub_id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {color === 'red' && <AlertTriangle className="h-4 w-4 text-red-600" />}
                            {color === 'yellow' && <Clock className="h-4 w-4 text-yellow-600" />}
                            {color === 'green' && <CheckCircle className="h-4 w-4 text-green-600" />}
                            <h4 className="font-medium">{submission.title}</h4>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">{submission.description}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span>Region: {submission.region}</span>
                            <span>Type: {submission.sub_type}</span>
                            <span>Product: {submission.product_id}</span>
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <div className="text-sm font-medium">
                            {new Date(submission.target_date).toLocaleDateString()}
                          </div>
                          <div
                            className={`text-xs mt-1 ${
                              color === 'red'
                                ? 'text-red-600'
                                : color === 'yellow'
                                  ? 'text-yellow-600'
                                  : 'text-green-600'
                            }`}
                          >
                            {daysUntil < 0
                              ? `${Math.abs(daysUntil)} days overdue`
                              : `${daysUntil} days remaining`}
                          </div>
                          <Badge
                            variant="outline"
                            className="mt-2"
                          >
                            {submission.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Update Status Dialog */}
      <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <DialogContent data-testid="dialog-update-status">
          <DialogHeader>
            <DialogTitle>Update Obligation Status</DialogTitle>
            <DialogDescription>
              Change the status of: {selectedObligation?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger data-testid="select-new-status">
                <SelectValue placeholder="Select new status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="DEFERRED">Deferred</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsStatusDialogOpen(false)}
              data-testid="button-cancel-status-update"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmStatusUpdate}
              disabled={updateStatusMutation.isPending}
              data-testid="button-confirm-status-update"
            >
              {updateStatusMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
