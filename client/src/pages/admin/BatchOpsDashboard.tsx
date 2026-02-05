/**
 * Batch Operations Dashboard
 *
 * Ops control plane UI for managing batch review jobs.
 * Filter by status, see claimed_by/attempts/heartbeat/errors,
 * Cancel or Requeue batches, and view admin details.
 *
 * @module pages/admin/BatchOpsDashboard
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Activity,
  Search,
  RefreshCw,
  XCircle,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle,
  AlertTriangle,
  Pause,
  Info,
  User,
  ShieldAlert,
  LogOut,
  Lock,
} from 'lucide-react';

// Types
interface BatchJob {
  id: number;
  program_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  claimed_by: string | null;
  claim_expires_at: string | null;
  attempts: number;
  last_heartbeat_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface BatchListResponse {
  batches: BatchJob[];
  total: number;
  limit: number;
  offset: number;
}

interface BatchAdminDetails {
  batch: BatchJob;
  history: Array<{
    timestamp: string;
    action: string;
    actor: string;
    details: string;
  }>;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_CONFIG: Record<
  string,
  { color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  queued: { color: 'bg-blue-100 text-blue-800', icon: Clock },
  processing: { color: 'bg-yellow-100 text-yellow-800', icon: Activity },
  completed: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
  failed: { color: 'bg-red-100 text-red-800', icon: AlertTriangle },
  cancelled: { color: 'bg-gray-100 text-gray-800', icon: Pause },
};

const PAGE_SIZE = 20;

// Session storage key for admin token
const ADMIN_TOKEN_KEY = 'ops_admin_token';

// Get admin token from sessionStorage
const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
};

// Store admin token in sessionStorage
const storeToken = (token: string): void => {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
};

// Clear admin token from sessionStorage
const clearToken = (): void => {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
};

// Get headers with admin token
const getAdminHeaders = (token: string): HeadersInit => ({
  'Content-Type': 'application/json',
  'X-Admin-Token': token,
});

export default function BatchOpsDashboard() {
  const queryClient = useQueryClient();

  // Admin token state
  const [adminToken, setAdminToken] = useState<string | null>(getStoredToken);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenError, setTokenError] = useState('');

  // Filter and pagination state
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [programIdFilter, setProgramIdFilter] = useState('');
  const [page, setPage] = useState(0);

  // Dialog state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showRequeueDialog, setShowRequeueDialog] = useState(false);
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<BatchJob | null>(null);

  // Cancel form state
  const [cancelReason, setCancelReason] = useState('');

  // Requeue form state
  const [resetAttempts, setResetAttempts] = useState(false);
  const [forceRequeue, setForceRequeue] = useState(false);

  // Fetch batches
  const {
    data: batchData,
    isLoading,
    refetch,
  } = useQuery<BatchListResponse>({
    queryKey: ['batches', statusFilter, programIdFilter, page, adminToken],
    queryFn: async () => {
      if (!adminToken) throw new Error('Admin token required');
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (programIdFilter) params.append('program_id', programIdFilter);
      params.append('limit', String(PAGE_SIZE));
      params.append('offset', String(page * PAGE_SIZE));

      const response = await fetch(`/review/batches?${params.toString()}`, {
        headers: getAdminHeaders(adminToken),
      });
      if (response.status === 403) {
        clearToken();
        setAdminToken(null);
        throw new Error('Invalid admin token');
      }
      if (!response.ok) throw new Error('Failed to fetch batches');
      return response.json();
    },
    enabled: !!adminToken,
  });

  // Fetch admin details
  const { data: adminDetails, isLoading: adminLoading } = useQuery<BatchAdminDetails>({
    queryKey: ['batch-admin', selectedBatch?.id, adminToken],
    queryFn: async () => {
      if (!selectedBatch) throw new Error('No batch selected');
      if (!adminToken) throw new Error('Admin token required');
      const response = await fetch(`/review/batch/${selectedBatch.id}/admin`, {
        headers: getAdminHeaders(adminToken),
      });
      if (!response.ok) throw new Error('Failed to fetch admin details');
      return response.json();
    },
    enabled: showAdminDialog && !!selectedBatch && !!adminToken,
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async ({ batchId, reason }: { batchId: number; reason: string }) => {
      if (!adminToken) throw new Error('Admin token required');
      const response = await fetch(`/review/batch/${batchId}/cancel`, {
        method: 'POST',
        headers: getAdminHeaders(adminToken),
        body: JSON.stringify({ reason, requested_by: 'ops_dashboard' }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to cancel batch');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      setShowCancelDialog(false);
      setSelectedBatch(null);
      setCancelReason('');
    },
  });

  // Requeue mutation
  const requeueMutation = useMutation({
    mutationFn: async ({
      batchId,
      resetAttempts,
      force,
    }: {
      batchId: number;
      resetAttempts: boolean;
      force: boolean;
    }) => {
      if (!adminToken) throw new Error('Admin token required');
      const response = await fetch(`/review/batch/${batchId}/requeue`, {
        method: 'POST',
        headers: getAdminHeaders(adminToken),
        body: JSON.stringify({ reset_attempts: resetAttempts, force }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to requeue batch');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      setShowRequeueDialog(false);
      setSelectedBatch(null);
      setResetAttempts(false);
      setForceRequeue(false);
    },
  });

  const batches = batchData?.batches || [];
  const total = batchData?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || { color: 'bg-gray-100 text-gray-800', icon: Info };
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {status}
      </Badge>
    );
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const openCancelDialog = (batch: BatchJob) => {
    setSelectedBatch(batch);
    setCancelReason('');
    setShowCancelDialog(true);
  };

  const openRequeueDialog = (batch: BatchJob) => {
    setSelectedBatch(batch);
    setResetAttempts(false);
    setForceRequeue(false);
    setShowRequeueDialog(true);
  };

  const openAdminDialog = (batch: BatchJob) => {
    setSelectedBatch(batch);
    setShowAdminDialog(true);
  };

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenInput.trim()) {
      setTokenError(null);
      storeToken(tokenInput.trim());
      setAdminToken(tokenInput.trim());
      setTokenInput('');
    }
  };

  const handleLogout = () => {
    clearToken();
    setAdminToken(null);
    setTokenError(null);
  };

  // Token prompt screen - shown when not authenticated
  if (!adminToken) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <Lock className="h-6 w-6 text-amber-600" />
            </div>
            <CardTitle className="text-xl">Admin Authentication Required</CardTitle>
            <CardDescription>
              Enter your admin token to access the Batch Operations Dashboard.
              This area is restricted to authorized personnel only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTokenSubmit} className="space-y-4">
              <div>
                <Input
                  type="password"
                  placeholder="Enter admin token..."
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  className="w-full"
                  autoFocus
                />
              </div>
              {tokenError && (
                <div className="text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  {tokenError}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={!tokenInput.trim()}>
                <ShieldAlert className="h-4 w-4 mr-2" />
                Authenticate
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      {/* Security Warning Banner */}
      <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
        <ShieldAlert className="h-5 w-5 text-amber-600 flex-shrink-0" />
        <div className="flex-1 text-sm text-amber-800">
          <strong>Internal Admin Area</strong> — Actions taken here affect production batch jobs.
          All operations are logged and audited.
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="text-amber-700 hover:text-amber-900 hover:bg-amber-100"
        >
          <LogOut className="h-4 w-4 mr-1" />
          Logout
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Activity className="h-6 w-6" />
                Batch Operations Dashboard
              </CardTitle>
              <CardDescription className="mt-1">
                Monitor and manage batch review jobs across all programs
              </CardDescription>
            </div>
            <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-500" />
              <Input
                placeholder="Filter by Program ID..."
                value={programIdFilter}
                onChange={e => {
                  setProgramIdFilter(e.target.value);
                  setPage(0);
                }}
                className="w-64"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={value => {
                setStatusFilter(value);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Program ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Claimed By</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Last Heartbeat</TableHead>
                  <TableHead>Last Error</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Loading batches...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : batches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                      No batches found matching your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  batches.map(batch => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-mono text-sm">{batch.id}</TableCell>
                      <TableCell className="font-medium">{batch.program_id}</TableCell>
                      <TableCell>{getStatusBadge(batch.status)}</TableCell>
                      <TableCell>
                        {batch.claimed_by ? (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {batch.claimed_by}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{batch.attempts}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {formatRelativeTime(batch.last_heartbeat_at)}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        {batch.last_error ? (
                          <span
                            className="text-sm text-red-600 truncate block"
                            title={batch.last_error}
                          >
                            {batch.last_error.slice(0, 50)}
                            {batch.last_error.length > 50 ? '...' : ''}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openAdminDialog(batch)}
                            title="View Details"
                          >
                            <Info className="h-4 w-4" />
                          </Button>
                          {['queued', 'processing'].includes(batch.status) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openCancelDialog(batch)}
                              title="Cancel Batch"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                          {['failed', 'cancelled'].includes(batch.status) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openRequeueDialog(batch)}
                              title="Requeue Batch"
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-600">
                Showing {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, total)} of{' '}
                {total} batches
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-gray-600">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              Cancel Batch
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel batch #{selectedBatch?.id} for program{' '}
              <strong>{selectedBatch?.program_id}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="cancel-reason">Reason for cancellation</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Enter reason for cancellation..."
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Keep Running
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                selectedBatch &&
                cancelMutation.mutate({ batchId: selectedBatch.id, reason: cancelReason })
              }
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Batch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Requeue Dialog */}
      <Dialog open={showRequeueDialog} onOpenChange={setShowRequeueDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-blue-600" />
              Requeue Batch
            </DialogTitle>
            <DialogDescription>
              Re-queue batch #{selectedBatch?.id} for program{' '}
              <strong>{selectedBatch?.program_id}</strong> to retry processing.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="reset-attempts"
                checked={resetAttempts}
                onCheckedChange={(checked: boolean) => setResetAttempts(checked)}
              />
              <Label htmlFor="reset-attempts" className="cursor-pointer">
                Reset attempt counter to 0
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="force-requeue"
                checked={forceRequeue}
                onCheckedChange={(checked: boolean) => setForceRequeue(checked)}
              />
              <Label htmlFor="force-requeue" className="cursor-pointer">
                Force requeue (even if max attempts reached)
              </Label>
            </div>
            {selectedBatch && (
              <p className="text-sm text-gray-600">
                Current attempts: <strong>{selectedBatch.attempts}</strong>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequeueDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                selectedBatch &&
                requeueMutation.mutate({
                  batchId: selectedBatch.id,
                  resetAttempts,
                  force: forceRequeue,
                })
              }
              disabled={requeueMutation.isPending}
            >
              {requeueMutation.isPending ? 'Requeuing...' : 'Requeue Batch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Details Dialog */}
      <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              Batch Details
            </DialogTitle>
            <DialogDescription>
              Administrative details for batch #{selectedBatch?.id}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {adminLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin" />
              </div>
            ) : adminDetails ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-500">Program ID</Label>
                    <p className="font-medium">{adminDetails.batch.program_id}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">Status</Label>
                    <div className="mt-1">{getStatusBadge(adminDetails.batch.status)}</div>
                  </div>
                  <div>
                    <Label className="text-gray-500">Claimed By</Label>
                    <p className="font-medium">{adminDetails.batch.claimed_by || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">Claim Expires</Label>
                    <p className="font-medium">{formatDate(adminDetails.batch.claim_expires_at)}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">Attempts</Label>
                    <p className="font-medium">{adminDetails.batch.attempts}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">Last Heartbeat</Label>
                    <p className="font-medium">
                      {formatDate(adminDetails.batch.last_heartbeat_at)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-gray-500">Created</Label>
                    <p className="font-medium">{formatDate(adminDetails.batch.created_at)}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">Updated</Label>
                    <p className="font-medium">{formatDate(adminDetails.batch.updated_at)}</p>
                  </div>
                </div>
                {adminDetails.batch.last_error && (
                  <div>
                    <Label className="text-gray-500">Last Error</Label>
                    <pre className="mt-1 p-3 bg-red-50 text-red-800 rounded text-sm overflow-x-auto">
                      {adminDetails.batch.last_error}
                    </pre>
                  </div>
                )}
                {adminDetails.history && adminDetails.history.length > 0 && (
                  <div>
                    <Label className="text-gray-500">History</Label>
                    <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                      {adminDetails.history.map((entry, idx) => (
                        <div key={idx} className="p-2 bg-gray-50 rounded text-sm">
                          <div className="flex justify-between">
                            <span className="font-medium">{entry.action}</span>
                            <span className="text-gray-500">{formatDate(entry.timestamp)}</span>
                          </div>
                          <p className="text-gray-600">{entry.details}</p>
                          <p className="text-gray-400 text-xs">by {entry.actor}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">Failed to load details</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdminDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
