import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  GitBranch,
  AlertTriangle,
  CheckCircle,
  FileEdit,
  Loader2,
  Plus,
  Clock,
  TrendingUp,
  Eye,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

// Types
interface Change {
  change_id: number;
  product_id: number;
  title: string;
  change_json: {
    scope?: string;
    description?: string;
    reason?: string;
    details?: any;
  };
  status: string;
  regions_json?: {
    FDA?: { class: string };
    EMA?: { class: string };
    regions?: string[];
    risk?: string;
    impact?: string;
  };
  eta_weeks?: number;
  risk_score?: number;
  checklist_json?: Array<{
    id: string;
    title: string;
    owner: string;
    dueOffsetDays: number;
  }>;
  impacted_json?: any[];
  created_at: string;
}

interface ChangeEvent {
  event_id: number;
  change_id: number;
  event: string;
  by_user: string;
  payload_json?: any;
  created_at: string;
}

interface ChangeImpact {
  impact_id: number;
  change_id: number;
  sub_id?: number;
  entity: string;
  entity_id: number;
  code?: string;
  meta_json?: any;
  created_at: string;
}

// Form validation schema
const newChangeSchema = z.object({
  product_id: z.string().min(1, 'Product ID is required'),
  title: z.string().min(1, 'Description is required'),
  scope: z.enum(['Process', 'Spec', 'Method', 'Stability']),
  reason: z.string().min(1, 'Reason is required'),
  description: z.string().optional(),
});

type NewChangeForm = z.infer<typeof newChangeSchema>;

export default function ChangeControlManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newChangeDialogOpen, setNewChangeDialogOpen] = useState(false);
  const [selectedChange, setSelectedChange] = useState<Change | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterProduct, setFilterProduct] = useState<string>('all');

  const form = useForm<NewChangeForm>({
    resolver: zodResolver(newChangeSchema),
    defaultValues: {
      product_id: '',
      title: '',
      scope: 'Spec',
      reason: '',
      description: '',
    },
  });

  // Fetch changes
  const { data: changes = [], isLoading: changesLoading } = useQuery<Change[]>({
    queryKey: ['/api/reg/changes'],
  });

  // Fetch impacts for selected change
  const { data: impacts = [], isLoading: impactsLoading } = useQuery<ChangeImpact[]>({
    queryKey: ['/api/reg/changes', selectedChange?.change_id, 'impacts'],
    enabled: !!selectedChange,
  });

  // Fetch events for selected change
  const { data: events = [], isLoading: eventsLoading } = useQuery<ChangeEvent[]>({
    queryKey: ['/api/reg/changes', selectedChange?.change_id, 'events'],
    enabled: !!selectedChange,
  });

  // Create change mutation
  const createChangeMutation = useMutation({
    mutationFn: async (data: NewChangeForm) => {
      const response = await apiRequest('POST', '/api/reg/changes', {
        product_id: parseInt(data.product_id),
        title: data.title,
        change_json: {
          scope: data.scope,
          description: data.description || data.title,
          reason: data.reason,
        },
      });
      return response.json();
    },
    onSuccess: async (newChange) => {
      toast({
        title: 'Change Created',
        description: 'Change record has been created successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/reg/changes'] });
      setNewChangeDialogOpen(false);
      form.reset();
      
      // Auto-classify the change
      classifyChangeMutation.mutate(newChange.change_id);
    },
    onError: (error: Error) => {
      toast({
        title: 'Creation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Classify change mutation (AI)
  const classifyChangeMutation = useMutation({
    mutationFn: async (changeId: number) => {
      const response = await apiRequest('POST', `/api/reg/changes/${changeId}/classify`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Classification Complete',
        description: 'AI has classified the change type and regions.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/reg/changes'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Classification Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Assess impact mutation
  const assessImpactMutation = useMutation({
    mutationFn: async (changeId: number) => {
      const response = await apiRequest('POST', `/api/reg/changes/${changeId}/assess`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Impact Assessment Complete',
        description: 'Impact assessment has been computed and saved.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/reg/changes'] });
      if (selectedChange) {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/reg/changes', selectedChange.change_id, 'impacts'] 
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Assessment Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Filter changes
  const filteredChanges = changes.filter((change) => {
    if (filterStatus !== 'all' && change.status !== filterStatus) return false;
    if (filterProduct !== 'all' && change.product_id !== parseInt(filterProduct)) return false;
    if (filterType !== 'all') {
      const scope = change.change_json?.scope;
      if (filterType !== scope) return false;
    }
    return true;
  });

  // Get unique products for filter
  const uniqueProducts = Array.from(new Set(changes.map((c) => c.product_id))).sort();

  // Helper functions
  const getChangeTypeBadge = (change: Change) => {
    const scope = change.change_json?.scope || 'Unknown';
    const colors = {
      Process: 'bg-stone-100 text-stone-800 dark:bg-stone-900 dark:text-stone-300',
      Spec: 'bg-stone-100 text-stone-700 dark:bg-stone-900 dark:text-stone-300',
      Method: 'bg-stone-100 text-stone-700 dark:bg-stone-900 dark:text-stone-300',
      Stability: 'bg-stone-100 text-stone-700 dark:bg-stone-900 dark:text-stone-300',
    };
    return (
      <Badge className={colors[scope as keyof typeof colors] || 'bg-stone-100 text-stone-700'} data-testid={`badge-type-${change.change_id}`}>
        {scope}
      </Badge>
    );
  };

  const getRiskBadge = (riskScore?: number) => {
    if (!riskScore) return <Badge variant="secondary" data-testid="badge-risk-unknown">Unknown</Badge>;
    
    if (riskScore >= 60) {
      return <Badge className="bg-stone-100 text-stone-800 dark:bg-stone-900 dark:text-stone-300" data-testid="badge-risk-high">High</Badge>;
    } else if (riskScore >= 30) {
      return <Badge className="bg-stone-100 text-stone-700 dark:bg-stone-900 dark:text-stone-300" data-testid="badge-risk-medium">Medium</Badge>;
    } else {
      return <Badge className="bg-stone-100 text-stone-800 dark:bg-stone-900 dark:text-stone-300" data-testid="badge-risk-low">Low</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      DRAFT: 'bg-stone-100 text-stone-700',
      CLASSIFIED: 'bg-stone-100 text-stone-700',
      ASSESSED: 'bg-stone-100 text-stone-700',
      APPROVED: 'bg-stone-100 text-stone-800',
      IMPLEMENTED: 'bg-stone-100 text-stone-800',
    };
    return (
      <Badge className={colors[status as keyof typeof colors] || 'bg-stone-100 text-stone-700'} data-testid={`badge-status-${status.toLowerCase()}`}>
        {status}
      </Badge>
    );
  };

  const getEventIcon = (event: string) => {
    switch (event) {
      case 'CREATED':
        return <Plus className="w-4 h-4 text-stone-1000" />;
      case 'CLASSIFIED':
        return <GitBranch className="w-4 h-4 text-stone-1000" />;
      case 'IMPACTED':
        return <TrendingUp className="w-4 h-4 text-stone-1000" />;
      case 'TASKS_OPENED':
        return <CheckCircle className="w-4 h-4 text-stone-1000" />;
      default:
        return <Clock className="w-4 h-4 text-stone-500" />;
    }
  };

  const handleViewDetails = (change: Change) => {
    setSelectedChange(change);
    setDetailsDialogOpen(true);
  };

  const onSubmit = (data: NewChangeForm) => {
    createChangeMutation.mutate(data);
  };

  return (
    <div className="space-y-6" data-testid="change-control-management">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold" data-testid="heading-title">Change Control Management</h2>
          <p className="text-stone-600 dark:text-stone-400" data-testid="text-description">
            Manage regulatory change control with AI classification and impact assessment
          </p>
        </div>
        <Button onClick={() => setNewChangeDialogOpen(true)} data-testid="button-new-change">
          <Plus className="w-4 h-4 mr-2" />
          New Change
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg" data-testid="heading-filters">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="filter-type" data-testid="label-filter-type">Change Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger id="filter-type" data-testid="select-filter-type">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Process">Process</SelectItem>
                  <SelectItem value="Spec">Spec</SelectItem>
                  <SelectItem value="Method">Method</SelectItem>
                  <SelectItem value="Stability">Stability</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="filter-status" data-testid="label-filter-status">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger id="filter-status" data-testid="select-filter-status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="CLASSIFIED">Classified</SelectItem>
                  <SelectItem value="ASSESSED">Assessed</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="IMPLEMENTED">Implemented</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="filter-product" data-testid="label-filter-product">Product</Label>
              <Select value={filterProduct} onValueChange={setFilterProduct}>
                <SelectTrigger id="filter-product" data-testid="select-filter-product">
                  <SelectValue placeholder="All products" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Products</SelectItem>
                  {uniqueProducts.map((productId) => (
                    <SelectItem key={productId} value={productId.toString()}>
                      Product {productId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Changes List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center" data-testid="heading-changes-list">
            <GitBranch className="w-5 h-5 mr-2" />
            Changes List
          </CardTitle>
          <CardDescription data-testid="text-changes-count">
            {filteredChanges.length} change{filteredChanges.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {changesLoading ? (
            <div className="flex items-center justify-center py-8" data-testid="loading-changes">
              <Loader2 className="w-6 h-6 animate-spin text-stone-400 mr-2" />
              <span className="text-stone-600">Loading changes...</span>
            </div>
          ) : filteredChanges.length === 0 ? (
            <div className="text-center py-8 text-stone-500" data-testid="empty-changes">
              <GitBranch className="w-12 h-12 mx-auto mb-3 text-stone-300" />
              <p className="font-medium">No changes found</p>
              <p className="text-sm">Create your first change to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead data-testid="header-id">ID</TableHead>
                  <TableHead data-testid="header-description">Description</TableHead>
                  <TableHead data-testid="header-type">Type</TableHead>
                  <TableHead data-testid="header-status">Status</TableHead>
                  <TableHead data-testid="header-product">Product</TableHead>
                  <TableHead data-testid="header-risk">Risk</TableHead>
                  <TableHead data-testid="header-eta">ETA</TableHead>
                  <TableHead data-testid="header-actions">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredChanges.map((change) => (
                  <TableRow key={change.change_id} data-testid={`row-change-${change.change_id}`}>
                    <TableCell data-testid={`cell-id-${change.change_id}`}>{change.change_id}</TableCell>
                    <TableCell data-testid={`cell-description-${change.change_id}`}>
                      <div className="max-w-xs truncate">{change.title}</div>
                      {change.change_json?.reason && (
                        <div className="text-sm text-stone-500 max-w-xs truncate">
                          {change.change_json.reason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell data-testid={`cell-type-${change.change_id}`}>{getChangeTypeBadge(change)}</TableCell>
                    <TableCell data-testid={`cell-status-${change.change_id}`}>{getStatusBadge(change.status)}</TableCell>
                    <TableCell data-testid={`cell-product-${change.change_id}`}>Product {change.product_id}</TableCell>
                    <TableCell data-testid={`cell-risk-${change.change_id}`}>{getRiskBadge(change.risk_score)}</TableCell>
                    <TableCell data-testid={`cell-eta-${change.change_id}`}>
                      {change.eta_weeks ? `${change.eta_weeks} weeks` : '-'}
                    </TableCell>
                    <TableCell data-testid={`cell-actions-${change.change_id}`}>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetails(change)}
                          data-testid={`button-view-${change.change_id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {!change.regions_json && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => classifyChangeMutation.mutate(change.change_id)}
                            disabled={classifyChangeMutation.isPending}
                            data-testid={`button-classify-${change.change_id}`}
                          >
                            <GitBranch className="w-4 h-4" />
                          </Button>
                        )}
                        {change.regions_json && !change.impacted_json?.length && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => assessImpactMutation.mutate(change.change_id)}
                            disabled={assessImpactMutation.isPending}
                            data-testid={`button-assess-${change.change_id}`}
                          >
                            <TrendingUp className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Change Dialog */}
      <Dialog open={newChangeDialogOpen} onOpenChange={setNewChangeDialogOpen}>
        <DialogContent data-testid="dialog-new-change">
          <DialogHeader>
            <DialogTitle data-testid="heading-new-change">Create New Change</DialogTitle>
            <DialogDescription data-testid="text-new-change-description">
              Enter change details. AI will automatically classify the change type and regions.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="product_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel data-testid="label-product-id">Product ID</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        placeholder="Enter product ID"
                        data-testid="input-product-id"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel data-testid="label-description">Change Description</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Brief description of the change"
                        data-testid="input-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="scope"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel data-testid="label-scope">Change Scope</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-scope">
                          <SelectValue placeholder="Select change scope" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Process">Process Change</SelectItem>
                        <SelectItem value="Spec">Specification Change</SelectItem>
                        <SelectItem value="Method">Method Change</SelectItem>
                        <SelectItem value="Stability">Stability Change</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel data-testid="label-reason">Reason for Change</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Explain the reason for this change"
                        rows={3}
                        data-testid="textarea-reason"
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
                  onClick={() => setNewChangeDialogOpen(false)}
                  data-testid="button-cancel-change"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createChangeMutation.isPending}
                  data-testid="button-create-change"
                >
                  {createChangeMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Create Change
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Change Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" data-testid="dialog-change-details">
          <DialogHeader>
            <DialogTitle data-testid="heading-change-details">
              Change Details - {selectedChange?.title}
            </DialogTitle>
            <DialogDescription data-testid="text-change-id">
              Change ID: {selectedChange?.change_id}
            </DialogDescription>
          </DialogHeader>

          {selectedChange && (
            <div className="space-y-6">
              {/* Classification */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center" data-testid="heading-classification">
                    <GitBranch className="w-5 h-5 mr-2" />
                    Classification
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-stone-500" data-testid="label-type">Type</Label>
                      <div data-testid="text-type">{getChangeTypeBadge(selectedChange)}</div>
                    </div>
                    <div>
                      <Label className="text-sm text-stone-500" data-testid="label-risk-level">Risk Level</Label>
                      <div data-testid="text-risk-level">{getRiskBadge(selectedChange.risk_score)}</div>
                    </div>
                    {selectedChange.regions_json?.regions && (
                      <div className="col-span-2">
                        <Label className="text-sm text-stone-500" data-testid="label-regions">Affected Regions</Label>
                        <div className="flex gap-2 mt-1" data-testid="text-regions">
                          {selectedChange.regions_json.regions.map((region: string) => (
                            <Badge key={region} variant="outline">{region}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedChange.eta_weeks && (
                      <div>
                        <Label className="text-sm text-stone-500" data-testid="label-eta">Estimated Timeline</Label>
                        <div className="font-medium" data-testid="text-eta-value">{selectedChange.eta_weeks} weeks</div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Impact Assessment */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center" data-testid="heading-impact">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    Impact Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {impactsLoading ? (
                    <div className="flex items-center justify-center py-4" data-testid="loading-impacts">
                      <Loader2 className="w-6 h-6 animate-spin text-stone-400 mr-2" />
                      <span className="text-stone-600">Loading impacts...</span>
                    </div>
                  ) : impacts.length === 0 ? (
                    <div className="text-center py-4 text-stone-500" data-testid="empty-impacts">
                      <p className="text-sm">No impact assessment available.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => assessImpactMutation.mutate(selectedChange.change_id)}
                        disabled={assessImpactMutation.isPending}
                        data-testid="button-compute-impacts"
                      >
                        {assessImpactMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Compute Impacts
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {impacts.map((impact) => (
                        <div
                          key={impact.impact_id}
                          className="border rounded-lg p-3"
                          data-testid={`impact-${impact.impact_id}`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-medium" data-testid={`impact-entity-${impact.impact_id}`}>
                                {impact.entity} {impact.code && `- ${impact.code}`}
                              </div>
                              {impact.meta_json?.reason && (
                                <div className="text-sm text-stone-600 mt-1" data-testid={`impact-reason-${impact.impact_id}`}>
                                  {impact.meta_json.reason}
                                </div>
                              )}
                            </div>
                            <Badge variant="outline" data-testid={`impact-badge-${impact.impact_id}`}>
                              {impact.entity}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Change Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center" data-testid="heading-timeline">
                    <Clock className="w-5 h-5 mr-2" />
                    Change Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {eventsLoading ? (
                    <div className="flex items-center justify-center py-4" data-testid="loading-events">
                      <Loader2 className="w-6 h-6 animate-spin text-stone-400 mr-2" />
                      <span className="text-stone-600">Loading timeline...</span>
                    </div>
                  ) : events.length === 0 ? (
                    <div className="text-center py-4 text-stone-500" data-testid="empty-events">
                      <p className="text-sm">No timeline events available.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {events.map((event) => (
                        <div
                          key={event.event_id}
                          className="flex items-start gap-3 border-l-2 border-stone-200 pl-3"
                          data-testid={`event-${event.event_id}`}
                        >
                          <div className="mt-1">{getEventIcon(event.event)}</div>
                          <div className="flex-1">
                            <div className="font-medium" data-testid={`event-type-${event.event_id}`}>
                              {event.event.replace('_', ' ')}
                            </div>
                            <div className="text-sm text-stone-600" data-testid={`event-user-${event.event_id}`}>
                              by {event.by_user}
                            </div>
                            <div className="text-xs text-stone-500" data-testid={`event-time-${event.event_id}`}>
                              {new Date(event.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Checklist */}
              {selectedChange.checklist_json && selectedChange.checklist_json.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center" data-testid="heading-checklist">
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Checklist
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {selectedChange.checklist_json.map((item, index) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between border rounded-lg p-3"
                          data-testid={`checklist-item-${index}`}
                        >
                          <div>
                            <div className="font-medium" data-testid={`checklist-title-${index}`}>{item.title}</div>
                            <div className="text-sm text-stone-600" data-testid={`checklist-owner-${index}`}>
                              Owner: {item.owner}
                            </div>
                          </div>
                          <div className="text-sm text-stone-500" data-testid={`checklist-due-${index}`}>
                            Due: {item.dueOffsetDays} days
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDetailsDialogOpen(false)}
              data-testid="button-close-details"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
