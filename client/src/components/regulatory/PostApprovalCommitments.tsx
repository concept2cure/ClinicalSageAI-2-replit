import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, } from '@/components/ui/dialog';
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ClipboardList, Calendar, AlertCircle, CheckCircle, Clock, Plus, Loader2, TrendingUp, FileText } from 'lucide-react'
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';

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
  note: string;
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

// Form validation schema for new commitment
const newCommitmentSchema = z.object({
  sub_id: z.string().min(1, 'Submission is required'),
  title: z.string().min(1, 'Description is required'),
  due_date: z.string().min(1, 'Due date is required'),
  priority: z.enum(['High', 'Medium', 'Low']),
  severity: z.enum(['CRITICAL', 'MAJOR', 'MINOR']),
  note: z.string().optional(),
  region: z.string().optional(),
});

// Form validation schema for update commitment
const updateCommitmentSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'DEFERRED', 'CANCELLED']),
  due_date: z.string().optional(),
  note: z.string().optional(),
});

type NewCommitmentForm = z.infer<typeof newCommitmentSchema>;
type UpdateCommitmentForm = z.infer<typeof updateCommitmentSchema>;

export default function PostApprovalCommitments() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedObligation, setSelectedObligation] = useState<RegObligation | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);

  // Fetch submissions for dropdown
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

  // Form for adding new commitment
  const newCommitmentForm = useForm<NewCommitmentForm>({
    resolver: zodResolver(newCommitmentSchema),
    defaultValues: {
      sub_id: '',
      title: '',
      due_date: '',
      priority: 'High',
      severity: 'MAJOR',
      note: '',
      region: '',
    },
  });

  // Form for updating commitment
  const updateCommitmentForm = useForm<UpdateCommitmentForm>({
    resolver: zodResolver(updateCommitmentSchema),
    defaultValues: {
      status: 'OPEN',
      due_date: '',
      note: '',
    },
  });

  // Create new commitment mutation
  const createCommitmentMutation = useMutation({
    mutationFn: async (data: NewCommitmentForm) => {
      return apiRequest('POST', `/api/obligations/${data.sub_id}/obligations`, {
        title: data.title,
        dueDate: data.due_date,
        priority: data.priority,
        severity: data.severity,
        note: data.note,
        region: data.region || undefined,
        source: 'POST_APPROVAL',
        status: 'OPEN',
        productId: 'default',
        createdBy: 'user',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/obligations/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/obligations/dashboard/stats'] });
      toast({
        title: 'Commitment Created',
        description: 'Post-approval commitment has been created successfully.',
      });
      setIsAddDialogOpen(false);
      newCommitmentForm.reset();
    },
    onError: () => {
      toast({
        title: 'Creation Failed',
        description: 'Failed to create commitment.',
        variant: 'destructive',
      });
    },
  });

  // Update commitment mutation
  const updateCommitmentMutation = useMutation({
    mutationFn: async ({ oblId, subId, data }: { oblId: string; subId: string; data: UpdateCommitmentForm }) => {
      return apiRequest('PUT', `/api/obligations/${subId}/obligations/${oblId}`, {
        status: data.status,
        due_date: data.due_date,
        note: data.note,
        updatedBy: 'user',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/obligations/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/obligations/dashboard/stats'] });
      toast({
        title: 'Commitment Updated',
        description: 'Commitment has been updated successfully.',
      });
      setIsUpdateDialogOpen(false);
      setSelectedObligation(null);
    },
    onError: () => {
      toast({
        title: 'Update Failed',
        description: 'Failed to update commitment.',
        variant: 'destructive',
      });
    },
  });

  // Calculate dashboard metrics
  const dashboardMetrics = useMemo(() => {
    const total = allObligations.length;
    const pending = allObligations.filter(
      obl => obl.status === 'OPEN' || obl.status === 'IN_PROGRESS'
    ).length;
    const completed = allObligations.filter(obl => obl.status === 'COMPLETED').length;
    
    const now = new Date();
    const overdue = allObligations.filter(obl => {
      if (!obl.due_date || obl.status === 'COMPLETED') return false;
      const dueDate = new Date(obl.due_date);
      return dueDate < now;
    }).length;

    return { total, pending, completed, overdue };
  }, [allObligations]);

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
      const now = new Date();
      return allObligations.filter(obl => {
        if (!obl.due_date || obl.status === 'COMPLETED') return false;
        const dueDate = new Date(obl.due_date);
        return dueDate < now;
      });
    }
    
    return allObligations;
  }, [allObligations, statusFilter]);

  // Calculate deadline urgency color
  const getDeadlineColor = (dueDate: string, status: string) => {
    if (status === 'COMPLETED') return 'gray';
    if (!dueDate) return 'gray';
    
    const now = new Date();
    const due = new Date(dueDate);
    const daysUntil = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntil < 0) return 'red'; // Overdue
    if (daysUntil <= 7) return 'red'; // <7 days
    if (daysUntil <= 30) return 'yellow'; // 7-30 days
    return 'green'; // >30 days
  };

  // Get status badge variant
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'default';
      case 'IN_PROGRESS':
        return 'secondary';
      case 'DEFERRED':
      case 'CANCELLED':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  // Get priority badge variant
  const getPriorityBadgeVariant = (priority: string) => {
    switch (priority) {
      case 'High':
        return 'destructive';
      case 'Medium':
        return 'default';
      case 'Low':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const handleEditCommitment = (obligation: RegObligation) => {
    setSelectedObligation(obligation);
    updateCommitmentForm.reset({
      status: obligation.status as any,
      due_date: obligation.due_date || '',
      note: obligation.note || '',
    });
    setIsUpdateDialogOpen(true);
  };

  const handleNewCommitmentSubmit = (data: NewCommitmentForm) => {
    createCommitmentMutation.mutate(data);
  };

  const handleUpdateCommitmentSubmit = (data: UpdateCommitmentForm) => {
    if (selectedObligation) {
      updateCommitmentMutation.mutate({
        oblId: selectedObligation.obl_id,
        subId: selectedObligation.sub_id,
        data,
      });
    }
  };

  const isLoading = submissionsLoading || statsLoading || obligationsLoading;

  return (
    <div className="space-y-6" data-testid="post-approval-commitments">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            Post-Approval Commitments
          </h2>
          <p className="text-gray-600">
            Manage regulatory obligations and post-approval commitments
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-commitment">
              <Plus className="h-4 w-4 mr-2" />
              Add Commitment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl" data-testid="dialog-add-commitment">
            <DialogHeader>
              <DialogTitle>Add New Commitment</DialogTitle>
              <DialogDescription>
                Create a new post-approval regulatory commitment or obligation
              </DialogDescription>
            </DialogHeader>
            <Form {...newCommitmentForm}>
              <form onSubmit={newCommitmentForm.handleSubmit(handleNewCommitmentSubmit)} className="space-y-4">
                <FormField
                  control={newCommitmentForm.control}
                  name="sub_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Submission</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-submission">
                            <SelectValue placeholder="Select submission" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {submissions.map(sub => (
                            <SelectItem key={sub.sub_id} value={sub.sub_id}>
                              {sub.title || sub.sub_id} - {sub.region}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={newCommitmentForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe the commitment or obligation..."
                          data-testid="input-description"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={newCommitmentForm.control}
                    name="due_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Due Date</FormLabel>
                        <FormControl>
                          <Input type="date" data-testid="input-due-date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={newCommitmentForm.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-priority">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="High">High</SelectItem>
                            <SelectItem value="Medium">Medium</SelectItem>
                            <SelectItem value="Low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={newCommitmentForm.control}
                  name="severity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Severity</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-severity">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="CRITICAL">Critical</SelectItem>
                          <SelectItem value="MAJOR">Major</SelectItem>
                          <SelectItem value="MINOR">Minor</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={newCommitmentForm.control}
                  name="note"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Additional notes or context..."
                          data-testid="input-notes"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddDialogOpen(false)}
                    data-testid="button-cancel-add"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createCommitmentMutation.isPending}
                    data-testid="button-submit-add"
                  >
                    {createCommitmentMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create Commitment
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Dashboard Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-total-commitments">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Commitments</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" data-testid="loading-total" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="value-total">
                  {dashboardMetrics.total}
                </div>
                <p className="text-xs text-muted-foreground">All post-approval obligations</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-pending-commitments">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" data-testid="loading-pending" />
            ) : (
              <>
                <div className="text-2xl font-bold text-blue-600" data-testid="value-pending">
                  {dashboardMetrics.pending}
                </div>
                <p className="text-xs text-muted-foreground">Open & in progress</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-completed-commitments">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" data-testid="loading-completed" />
            ) : (
              <>
                <div className="text-2xl font-bold text-green-600" data-testid="value-completed">
                  {dashboardMetrics.completed}
                </div>
                <p className="text-xs text-muted-foreground">Successfully fulfilled</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-overdue-commitments">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" data-testid="loading-overdue" />
            ) : (
              <>
                <div className="text-2xl font-bold text-red-600" data-testid="value-overdue">
                  {dashboardMetrics.overdue}
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
              <CardTitle>Commitment Tracking</CardTitle>
              <CardDescription>Monitor and manage all post-approval obligations</CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="select-filter-status">
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
                <Skeleton key={i} className="h-12 w-full" data-testid={`loading-row-${i}`} />
              ))}
            </div>
          ) : filteredObligations.length === 0 ? (
            <div className="text-center py-12" data-testid="empty-commitments">
              <ClipboardList className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">No commitments found</p>
              <p className="text-sm text-gray-400">
                {statusFilter !== 'all' 
                  ? 'Try changing the filter to see more commitments' 
                  : 'Add your first post-approval commitment to get started'}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Commitment ID</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Submission</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredObligations.map((obligation) => {
                    const deadlineColor = getDeadlineColor(obligation.due_date, obligation.status);
                    const submission = submissions.find(s => s.sub_id === obligation.sub_id);

                    return (
                      <TableRow 
                        key={obligation.obl_id} 
                        data-testid={`row-commitment-${obligation.obl_id}`}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => handleEditCommitment(obligation)}
                      >
                        <TableCell className="font-mono text-sm" data-testid={`id-${obligation.obl_id}`}>
                          {obligation.obl_id.slice(0, 8)}...
                        </TableCell>
                        <TableCell className="max-w-md">
                          <div className="truncate" data-testid={`desc-${obligation.obl_id}`}>
                            {obligation.title}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`submission-${obligation.obl_id}`}>
                          <div className="text-sm">
                            {submission?.title || obligation.sub_id.slice(0, 8)}
                          </div>
                          <div className="text-xs text-gray-500">{obligation.region}</div>
                        </TableCell>
                        <TableCell data-testid={`due-date-${obligation.obl_id}`}>
                          {obligation.due_date ? (
                            <div className="flex items-center gap-2">
                              <Calendar className={`h-4 w-4 ${
                                deadlineColor === 'red' ? 'text-red-500' :
                                deadlineColor === 'yellow' ? 'text-yellow-500' :
                                deadlineColor === 'green' ? 'text-green-500' :
                                'text-gray-400'
                              }`} />
                              <span className={
                                deadlineColor === 'red' ? 'text-red-600 font-medium' :
                                deadlineColor === 'yellow' ? 'text-yellow-600 font-medium' :
                                ''
                              }>
                                {format(new Date(obligation.due_date), 'MMM d, yyyy')}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400">No date set</span>
                          )}
                        </TableCell>
                        <TableCell data-testid={`status-${obligation.obl_id}`}>
                          <Badge variant={getStatusBadgeVariant(obligation.status)}>
                            {obligation.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`priority-${obligation.obl_id}`}>
                          <Badge variant={getPriorityBadgeVariant(obligation.priority)}>
                            {obligation.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditCommitment(obligation);
                            }}
                            data-testid={`button-edit-${obligation.obl_id}`}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Update Commitment Dialog */}
      <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
        <DialogContent data-testid="dialog-update-commitment">
          <DialogHeader>
            <DialogTitle>Update Commitment</DialogTitle>
            <DialogDescription>
              Update the status, deadline, or add notes to this commitment
            </DialogDescription>
          </DialogHeader>
          {selectedObligation && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium mb-2">{selectedObligation.title}</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <p>ID: {selectedObligation.obl_id}</p>
                <p>Region: {selectedObligation.region}</p>
                <p>Severity: {selectedObligation.severity}</p>
              </div>
            </div>
          )}
          <Form {...updateCommitmentForm}>
            <form onSubmit={updateCommitmentForm.handleSubmit(handleUpdateCommitmentSubmit)} className="space-y-4">
              <FormField
                control={updateCommitmentForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-update-status">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="OPEN">Open</SelectItem>
                        <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                        <SelectItem value="DEFERRED">Deferred</SelectItem>
                        <SelectItem value="CANCELLED">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={updateCommitmentForm.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Extend Deadline (Optional)</FormLabel>
                    <FormControl>
                      <Input type="date" data-testid="input-update-due-date" {...field} />
                    </FormControl>
                    <FormDescription>Leave empty to keep current due date</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={updateCommitmentForm.control}
                name="note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Add Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Update notes or provide status explanation..."
                        data-testid="input-update-notes"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsUpdateDialogOpen(false)}
                  data-testid="button-cancel-update"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateCommitmentMutation.isPending}
                  data-testid="button-submit-update"
                >
                  {updateCommitmentMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Update Commitment
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
