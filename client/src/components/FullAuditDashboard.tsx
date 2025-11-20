import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Search, RefreshCw, Filter } from 'lucide-react';

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  user_id: number;
  user_name: string;
  action: string;
  document_id?: number;
  document_title?: string;
  status?: string;
  details?: string;
  ip_address?: string;
  module?: string;
  event_type: 'document' | 'submission' | 'system' | 'authentication' | 'approval';
  severity: 'info' | 'warning' | 'error' | 'success';
  organization_id?: string;
  project_id?: string;
  region?: string;
}

interface FullAuditDashboardProps {
  organizationId?: string;
  projectId?: string;
  region?: string;
}

const ITEMS_PER_PAGE = 10;

// Colors for charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
const SEVERITY_COLORS = {
  info: '#3498db',
  warning: '#f39c12',
  error: '#e74c3c',
  success: '#2ecc71',
};

export const FullAuditDashboard: React.FC<FullAuditDashboardProps> = ({
  organizationId,
  projectId,
  region,
}) => {
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string | undefined>(undefined);
  const [severityFilter, setSeverityFilter] = useState<string | undefined>(undefined);
  const [userFilter, setUserFilter] = useState<string | undefined>(undefined);

  // Fetch audit logs with filters
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      '/api/audit/logs',
      organizationId,
      projectId,
      region,
      startDate,
      endDate,
      eventTypeFilter,
      severityFilter,
      userFilter,
      page,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (organizationId) params.append('org_id', organizationId);
      if (projectId) params.append('project_id', projectId);
      if (region) params.append('region', region);
      if (startDate) params.append('start_date', startDate.toISOString());
      if (endDate) params.append('end_date', endDate.toISOString());
      if (eventTypeFilter) params.append('event_type', eventTypeFilter);
      if (severityFilter) params.append('severity', severityFilter);
      if (userFilter) params.append('user_id', userFilter);
      if (searchTerm) params.append('search', searchTerm);
      params.append('limit', ITEMS_PER_PAGE.toString());
      params.append('offset', ((page - 1) * ITEMS_PER_PAGE).toString());

      const response = await fetch(`/api/audit/logs?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }
      return response.json();
    },
  });

  const auditLogs: AuditLogEntry[] = data?.logs || [];
  const totalItems = data?.total || 0;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  // Generate chart data
  const eventTypeData = React.useMemo(() => {
    if (!auditLogs.length) return [];

    const counts: Record<string, number> = {};
    auditLogs.forEach(log => {
      counts[log.event_type] = (counts[log.event_type] || 0) + 1;
    });

    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [auditLogs]);

  const severityData = React.useMemo(() => {
    if (!auditLogs.length) return [];

    const counts: Record<string, number> = {};
    auditLogs.forEach(log => {
      counts[log.severity] = (counts[log.severity] || 0) + 1;
    });

    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [auditLogs]);

  const activityOverTimeData = React.useMemo(() => {
    if (!auditLogs.length) return [];

    // Group logs by day
    const groupedByDay: Record<string, number> = {};
    auditLogs.forEach(log => {
      const day = new Date(log.timestamp).toLocaleDateString();
      groupedByDay[day] = (groupedByDay[day] || 0) + 1;
    });

    // Convert to array for chart
    return Object.entries(groupedByDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [auditLogs]);

  // Generate unique lists for filters
  const uniqueUsers = React.useMemo(() => {
    if (!auditLogs.length) return [];

    const users = new Set<string>();
    auditLogs.forEach(log => {
      if (log.user_name) users.add(log.user_name);
    });

    return Array.from(users);
  }, [auditLogs]);

  const handleRefresh = () => {
    refetch();
  };

  const clearFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setSearchTerm('');
    setEventTypeFilter(undefined);
    setSeverityFilter(undefined);
    setUserFilter(undefined);
    setPage(1);
  };

  // Handle applying the filters and resetting the page
  const applyFilters = () => {
    setPage(1);
    refetch();
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'info':
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-800">
            Info
          </Badge>
        );
      case 'warning':
        return (
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
            Warning
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="outline" className="bg-red-100 text-red-800">
            Error
          </Badge>
        );
      case 'success':
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800">
            Success
          </Badge>
        );
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getEventTypeBadge = (eventType: string) => {
    switch (eventType) {
      case 'document':
        return (
          <Badge variant="outline" className="bg-purple-100 text-purple-800">
            Document
          </Badge>
        );
      case 'submission':
        return (
          <Badge variant="outline" className="bg-indigo-100 text-indigo-800">
            Submission
          </Badge>
        );
      case 'system':
        return (
          <Badge variant="outline" className="bg-gray-100 text-gray-800">
            System
          </Badge>
        );
      case 'authentication':
        return (
          <Badge variant="outline" className="bg-teal-100 text-teal-800">
            Authentication
          </Badge>
        );
      case 'approval':
        return (
          <Badge variant="outline" className="bg-pink-100 text-pink-800">
            Approval
          </Badge>
        );
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Filters</CardTitle>
          <CardDescription>Refine the audit logs display</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="w-full md:w-auto">
              <div className="flex space-x-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[200px] justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, 'PPP') : 'Start Date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[200px] justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, 'PPP') : 'End Date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="w-full md:w-auto flex-1">
              <div className="flex space-x-2">
                <div className="w-full md:w-1/3">
                  <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Event Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Event Types</SelectItem>
                      <SelectItem value="document">Document</SelectItem>
                      <SelectItem value="submission">Submission</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                      <SelectItem value="authentication">Authentication</SelectItem>
                      <SelectItem value="approval">Approval</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full md:w-1/3">
                  <Select value={severityFilter} onValueChange={setSeverityFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Severities</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full md:w-1/3">
                  <Select value={userFilter} onValueChange={setUserFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="User" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Users</SelectItem>
                      {uniqueUsers.map(user => (
                        <SelectItem key={user} value={user}>
                          {user}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="w-full md:w-auto flex space-x-2">
              <div className="relative flex items-center">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                <Input
                  type="search"
                  placeholder="Search..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <Button variant="default" onClick={applyFilters} className="bg-primary text-white">
                <Filter className="mr-2 h-4 w-4" />
                Apply Filters
              </Button>

              <Button variant="outline" onClick={handleRefresh}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>

              <Button variant="outline" onClick={clearFilters}>
                <Filter className="mr-2 h-4 w-4" />
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dashboard Tabs */}
      <Tabs defaultValue="logs" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="logs">Audit Logs</TabsTrigger>
          <TabsTrigger value="charts">Analytics Charts</TabsTrigger>
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
        </TabsList>

        {/* Logs Table Tab */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Audit Log Entries</CardTitle>
              <CardDescription>
                Complete history of system activities and user actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center p-6">
                  <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
                </div>
              ) : isError ? (
                <div className="flex justify-center p-6 text-red-500">
                  Error loading audit logs. Please try again.
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Document</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Region</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-4">
                            No audit logs found matching the current filters.
                          </TableCell>
                        </TableRow>
                      ) : (
                        auditLogs.map(log => (
                          <TableRow key={log.id}>
                            <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                            <TableCell>{log.user_name}</TableCell>
                            <TableCell>{log.action}</TableCell>
                            <TableCell>{log.document_title || 'N/A'}</TableCell>
                            <TableCell>{getEventTypeBadge(log.event_type)}</TableCell>
                            <TableCell>{getSeverityBadge(log.severity)}</TableCell>
                            <TableCell>{log.region || 'Global'}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  {totalPages > 0 && (
                    <div className="mt-4">
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => setPage(prev => Math.max(1, prev - 1))}
                              disabled={page === 1}
                              className="gap-1"
                            >
                              <PaginationPrevious />
                            </Button>
                          </PaginationItem>

                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            // Show pages around the current page
                            let pageNumber;
                            if (totalPages <= 5) {
                              pageNumber = i + 1;
                            } else if (page <= 3) {
                              pageNumber = i + 1;
                            } else if (page >= totalPages - 2) {
                              pageNumber = totalPages - 4 + i;
                            } else {
                              pageNumber = page - 2 + i;
                            }

                            return (
                              <PaginationItem key={pageNumber}>
                                <PaginationLink
                                  isActive={pageNumber === page}
                                  onClick={() => setPage(pageNumber)}
                                >
                                  {pageNumber}
                                </PaginationLink>
                              </PaginationItem>
                            );
                          })}

                          {totalPages > 5 && page < totalPages - 2 && (
                            <PaginationItem>
                              <PaginationEllipsis />
                            </PaginationItem>
                          )}

                          <PaginationItem>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                              disabled={page === totalPages}
                              className="gap-1"
                            >
                              <PaginationNext />
                            </Button>
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Charts Tab */}
        <TabsContent value="charts">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Event Types Distribution</CardTitle>
                <CardDescription>Breakdown of events by category</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={eventTypeData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {eventTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Severity Breakdown</CardTitle>
                <CardDescription>Distribution of logs by severity level</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={severityData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {severityData.map(entry => (
                        <Cell
                          key={`cell-${entry.name}`}
                          fill={
                            SEVERITY_COLORS[entry.name as keyof typeof SEVERITY_COLORS] || '#999'
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Activity Over Time</CardTitle>
                <CardDescription>Trend of audit log entries over time</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={activityOverTimeData}
                    margin={{
                      top: 5,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" fill="#8884d8" name="Event Count" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Statistics Tab */}
        <TabsContent value="statistics">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Total Log Entries</CardTitle>
                <CardDescription>All audit logs in the system</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{totalItems}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Most Common Event</CardTitle>
                <CardDescription>Most frequent activity type</CardDescription>
              </CardHeader>
              <CardContent>
                {eventTypeData.length > 0 && (
                  <div>
                    <div className="text-2xl font-bold">
                      {eventTypeData.sort((a, b) => b.value - a.value)[0].name}
                    </div>
                    <div className="text-gray-500">
                      {eventTypeData.sort((a, b) => b.value - a.value)[0].value} occurrences
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Error Rate</CardTitle>
                <CardDescription>Percentage of error severity logs</CardDescription>
              </CardHeader>
              <CardContent>
                {severityData.length > 0 && (
                  <div>
                    <div className="text-4xl font-bold">
                      {(() => {
                        const errorCount = severityData.find(d => d.name === 'error')?.value || 0;
                        const total = severityData.reduce((sum, item) => sum + item.value, 0);
                        return total > 0 ? `${((errorCount / total) * 100).toFixed(1)}%` : '0%';
                      })()}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-3">
              <CardHeader>
                <CardTitle>Most Active Users</CardTitle>
                <CardDescription>Users with the most logged activities</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Activity Count</TableHead>
                      <TableHead>Last Action</TableHead>
                      <TableHead>Most Common Event Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      // Group logs by user and count
                      const userCounts: Record<
                        string,
                        {
                          count: number;
                          lastTimestamp: string;
                          eventTypes: Record<string, number>;
                        }
                      > = {};

                      auditLogs.forEach(log => {
                        if (!log.user_name) return;

                        if (!userCounts[log.user_name]) {
                          userCounts[log.user_name] = {
                            count: 0,
                            lastTimestamp: log.timestamp,
                            eventTypes: {},
                          };
                        }

                        userCounts[log.user_name].count++;

                        // Update last timestamp if newer
                        if (
                          new Date(log.timestamp) >
                          new Date(userCounts[log.user_name].lastTimestamp)
                        ) {
                          userCounts[log.user_name].lastTimestamp = log.timestamp;
                        }

                        // Count event types
                        userCounts[log.user_name].eventTypes[log.event_type] =
                          (userCounts[log.user_name].eventTypes[log.event_type] || 0) + 1;
                      });

                      // Convert to array and sort by count
                      return Object.entries(userCounts)
                        .map(([name, data]) => ({
                          name,
                          count: data.count,
                          lastTimestamp: data.lastTimestamp,
                          mostCommonEventType:
                            Object.entries(data.eventTypes).sort((a, b) => b[1] - a[1])[0]?.[0] ||
                            'unknown',
                        }))
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 5)
                        .map(user => (
                          <TableRow key={user.name}>
                            <TableCell>{user.name}</TableCell>
                            <TableCell>{user.count}</TableCell>
                            <TableCell>{new Date(user.lastTimestamp).toLocaleString()}</TableCell>
                            <TableCell>{getEventTypeBadge(user.mostCommonEventType)}</TableCell>
                          </TableRow>
                        ));
                    })()}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FullAuditDashboard;
