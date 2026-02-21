// --- TrialSage Admin Audit Trail Dashboard (Enterprise Level: Drill Down, Anomaly Detection, Admin Actions) ---

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import { Badge } from '@/components/ui/badge';
import {
  DownloadCloud,
  RefreshCw,
  AlertTriangle,
  Trash2,
  Download,
  Clock,
  Shield,
  Filter,
  ChevronLeft,
  ChevronRight,
  CalendarIcon,
  ShieldCheck,
  Link2,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

export default function AuditTrailDashboard() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTenant, setFilterTenant] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const pageSize = 9;
  const [selectedLog, setSelectedLog] = useState(null);
  const [activeView, setActiveView] = useState('all');
  const { toast } = useToast();

  // Part 11 chain integrity state
  const [chainIntegrity, setChainIntegrity] = useState(null);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);

  // Verify Part 11 audit trail chain integrity (cryptographic hash chain)
  const verifyChainIntegrity = async () => {
    setCheckingIntegrity(true);
    try {
      const res = await fetch('/api/part11/audit-trail/chain-integrity');
      if (res.ok) {
        const data = await res.json();
        setChainIntegrity(data);
        toast({
          title: data.integrityValid ? 'Chain Verified' : 'Integrity Issue',
          description: data.integrityValid
            ? `All ${data.totalEntries} audit entries verified — no tampering detected.`
            : `Chain integrity check found issues. Review required.`,
          variant: data.integrityValid ? 'default' : 'destructive',
        });
      } else {
        toast({
          title: 'Verification Failed',
          description: `Chain integrity endpoint returned ${res.status}. Contact support.`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.warn('Part 11 chain integrity check unavailable:', error.message);
    } finally {
      setCheckingIntegrity(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [page, activeView]);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (filterTenant) params.append('tenantId', filterTenant);
      if (filterUser) params.append('userId', filterUser);
      if (filterAction) params.append('actionType', filterAction);
      if (filterDateFrom) params.append('startDate', filterDateFrom);
      if (filterDateTo) params.append('endDate', filterDateTo);
      params.append('page', page);
      params.append('limit', pageSize);

      // Add anomaly filter
      if (activeView === 'anomalies') {
        params.append('anomaliesOnly', 'true');
      }

      const res = await fetch(`/api/audit?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Error fetching audit logs: ${res.statusText}`);
      }

      const data = await res.json();
      setLogs(data.logs || []);
      setTotalPages(data.pagination?.pages || 1);
      setTotalLogs(data.pagination?.total || 0);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load audit logs. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    setPage(1); // Reset page when applying new filters
    fetchAuditLogs();
  };

  const resetFilters = () => {
    setFilterTenant('');
    setFilterUser('');
    setFilterAction('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setPage(1);
    fetchAuditLogs();
  };

  const exportCSV = async () => {
    try {
      // Build query parameters for export (same as current filters)
      const params = new URLSearchParams();
      if (filterTenant) params.append('tenantId', filterTenant);
      if (filterUser) params.append('userId', filterUser);
      if (filterAction) params.append('actionType', filterAction);
      if (filterDateFrom) params.append('startDate', filterDateFrom);
      if (filterDateTo) params.append('endDate', filterDateTo);

      if (activeView === 'anomalies') {
        params.append('anomaliesOnly', 'true');
      }

      // Use fetch with server-side CSV generation
      const response = await fetch(`/api/audit/export?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to export audit logs');
      }

      // Create blob from response
      const blob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;

      // Use the current date in the filename
      const date = new Date().toISOString().split('T')[0];
      a.download = `audit_logs_${date}.csv`;

      document.body.appendChild(a);
      a.click();

      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Export Successful',
        description: 'Audit logs have been exported to CSV.',
      });
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast({
        title: 'Export Failed',
        description: 'Failed to export audit logs to CSV.',
        variant: 'destructive',
      });
    }
  };

  // Audit trail records are immutable per 21 CFR Part 11 §11.10(e)
  // Bulk delete functionality has been intentionally removed for regulatory compliance

  const detectAnomaly = log => {
    // Define criteria for anomaly detection
    const suspiciousActions = ['Delete', 'Update', 'BulkDelete'];
    const suspiciousKeywords = ['error', 'fail', 'denied', 'unauthorized', 'suspicious'];

    // Check if action type is suspicious
    if (suspiciousActions.includes(log.actionType)) {
      return true;
    }

    // Check if description contains suspicious keywords
    if (
      log.description &&
      suspiciousKeywords.some(keyword => log.description.toLowerCase().includes(keyword))
    ) {
      return true;
    }

    // Check for multiple failed attempts
    if (log.success === false) {
      return true;
    }

    return false;
  };

  // Get icon for action type
  const getActionIcon = actionType => {
    switch (actionType) {
      case 'Upload':
        return <DownloadCloud className="h-4 w-4 text-blue-500" />;
      case 'Download':
        return <Download className="h-4 w-4 text-green-500" />;
      case 'Delete':
        return <Trash2 className="h-4 w-4 text-red-500" />;
      case 'Update':
        return <RefreshCw className="h-4 w-4 text-amber-500" />;
      case 'Login':
        return <Shield className="h-4 w-4 text-purple-500" />;
      case 'AI_Summarize':
        return <Download className="h-4 w-4 text-violet-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  // Render loading state
  if (loading && page === 1) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="flex flex-col items-center">
          <div className="h-12 w-12 border-4 border-t-blue-600 border-blue-200 rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600">Loading audit logs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Audit Trail Dashboard</h1>
            <p className="text-gray-500">Track and manage all system activities</p>
          </div>

          <div className="mt-4 md:mt-0 flex items-center space-x-2">
            <Tabs value={activeView} onValueChange={setActiveView} className="w-[400px]">
              <TabsList>
                <TabsTrigger value="all">All Logs</TabsTrigger>
                <TabsTrigger value="anomalies" className="flex items-center">
                  <AlertTriangle className="h-4 w-4 mr-1 text-red-500" />
                  Anomalies
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={verifyChainIntegrity}
                    disabled={checkingIntegrity}
                    className={
                      chainIntegrity?.integrityValid === true
                        ? 'border-emerald-300 text-emerald-700'
                        : ''
                    }
                  >
                    {checkingIntegrity ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                    {chainIntegrity?.integrityValid === true && (
                      <ShieldCheck className="h-3.5 w-3.5 ml-1 text-emerald-600" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Verify Part 11 chain integrity</p>
                  {chainIntegrity && (
                    <p className="text-xs opacity-75">
                      {chainIntegrity.totalEntries} entries verified
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Tenant ID</label>
              <Input
                placeholder="Filter by Tenant ID"
                value={filterTenant}
                onChange={e => setFilterTenant(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">User</label>
              <Input
                placeholder="Filter by User ID"
                value={filterUser}
                onChange={e => setFilterUser(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Action Type</label>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger>
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Actions</SelectItem>
                  <SelectItem value="Upload">Upload</SelectItem>
                  <SelectItem value="Download">Download</SelectItem>
                  <SelectItem value="Delete">Delete</SelectItem>
                  <SelectItem value="Update">Update</SelectItem>
                  <SelectItem value="Login">Login</SelectItem>
                  <SelectItem value="AI_Summarize">AI Summarize</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Date Range</label>
              <div className="flex space-x-2">
                <Input
                  type="date"
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                  className="w-full"
                />
                <span className="flex items-center text-gray-500">to</span>
                <Input
                  type="date"
                  value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex items-end space-x-2">
              <Button onClick={applyFilters} className="flex-1">
                <Filter className="h-4 w-4 mr-1" /> Apply Filters
              </Button>
              <Button variant="outline" onClick={resetFilters}>
                Reset
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-2">
          <div className="text-sm text-gray-500">
            Showing {logs.length} of {totalLogs} logs{' '}
            {filterTenant && `for tenant "${filterTenant}"`}
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
                  <Shield className="h-3.5 w-3.5" />
                  Immutable Audit Trail
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Audit records cannot be deleted per 21 CFR Part 11 §11.10(e)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {loading && page > 1 ? (
          <div className="flex justify-center my-12">
            <div className="h-10 w-10 border-4 border-t-blue-600 border-blue-200 rounded-full animate-spin"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="flex justify-center">
              <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center">
                <Clock className="h-8 w-8 text-gray-400" />
              </div>
            </div>
            <h3 className="mt-4 text-lg font-medium text-gray-900">No audit logs found</h3>
            <p className="mt-2 text-gray-500">
              Try adjusting your filters or select a different time period
            </p>
            <Button className="mt-4" onClick={resetFilters}>
              Clear Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
            {logs.map((log, index) => (
              <Card
                key={index}
                className={`shadow-sm hover:shadow-md transition-shadow cursor-pointer ${
                  detectAnomaly(log) ? 'border-red-500 border-2' : ''
                }`}
                onClick={() => setSelectedLog(log)}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center">
                      {getActionIcon(log.actionType)}
                      <span className="ml-2 font-medium text-gray-800">{log.actionType}</span>
                    </div>

                    {detectAnomaly(log) && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="destructive" className="ml-2">
                              <AlertTriangle className="h-3 w-3 mr-1" /> Anomaly
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Suspicious activity detected</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>

                  <p className="text-gray-600 text-sm mt-2">{log.description}</p>

                  <div className="text-xs text-gray-500 mt-4 space-y-1">
                    <p>
                      <strong>Tenant:</strong> {log.tenantId}
                    </p>
                    <p>
                      <strong>User:</strong> {log.username || log.user}
                    </p>
                    <p>
                      <strong>Time:</strong> {new Date(log.timestamp).toLocaleString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination controls */}
        <div className="flex justify-between items-center my-6">
          <div className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </div>

          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(page - 1, 1))}
              disabled={page <= 1 || loading}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages || loading}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Detailed log view dialog */}
      <Dialog open={!!selectedLog} onOpenChange={open => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              {selectedLog && getActionIcon(selectedLog.actionType)}
              <span className="ml-2">{selectedLog?.actionType} Activity Details</span>
            </DialogTitle>
            <DialogDescription>Complete information about this audit log</DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">User Information</h3>
                  <p className="text-gray-900 mt-1">
                    <strong>User ID:</strong> {selectedLog.user}
                  </p>
                  <p className="text-gray-900">
                    <strong>Username:</strong> {selectedLog.username || 'N/A'}
                  </p>
                  <p className="text-gray-900">
                    <strong>Email:</strong> {selectedLog.email || 'N/A'}
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500">Action Details</h3>
                  <p className="text-gray-900 mt-1">
                    <strong>Action Type:</strong> {selectedLog.actionType}
                  </p>
                  <p className="text-gray-900">
                    <strong>Description:</strong> {selectedLog.description}
                  </p>
                  <p className="text-gray-900">
                    <strong>Status:</strong> {selectedLog.success !== false ? 'Success' : 'Failed'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">System Information</h3>
                  <p className="text-gray-900 mt-1">
                    <strong>Tenant ID:</strong> {selectedLog.tenantId}
                  </p>
                  <p className="text-gray-900">
                    <strong>IP Address:</strong> {selectedLog.ipAddress}
                  </p>
                  <p className="text-gray-900">
                    <strong>User Agent:</strong> {selectedLog.userAgent || 'Not recorded'}
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500">Resource Information</h3>
                  <p className="text-gray-900 mt-1">
                    <strong>Resource ID:</strong> {selectedLog.resourceId || 'N/A'}
                  </p>
                  <p className="text-gray-900">
                    <strong>Resource Type:</strong> {selectedLog.resourceType || 'N/A'}
                  </p>
                  <p className="text-gray-900">
                    <strong>Timestamp:</strong> {new Date(selectedLog.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>

              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div className="col-span-1 md:col-span-2">
                  <h3 className="text-sm font-medium text-gray-500">Additional Metadata</h3>
                  <pre className="bg-gray-50 p-3 rounded-md text-sm mt-1 overflow-auto max-h-32">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}

              {detectAnomaly(selectedLog) && (
                <div className="col-span-1 md:col-span-2 bg-red-50 p-4 rounded-md border border-red-200">
                  <h3 className="text-sm font-medium text-red-800 flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-1" />
                    Anomaly Detected
                  </h3>
                  <p className="text-red-700 text-sm mt-1">
                    This activity has been flagged as potentially suspicious because:
                  </p>
                  <ul className="list-disc ml-5 mt-1 text-sm text-red-700">
                    {selectedLog.actionType === 'Delete' && (
                      <li>Delete operations are sensitive and high-risk</li>
                    )}
                    {selectedLog.description &&
                      selectedLog.description.toLowerCase().includes('error') && (
                        <li>Error detected in the operation</li>
                      )}
                    {selectedLog.success === false && <li>The operation failed</li>}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedLog(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
