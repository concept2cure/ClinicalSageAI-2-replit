import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, Calendar, User, Activity, FileText, Download, Search } from 'lucide-react';

/**
 * Audit Trail Page - Track and review user activities and document changes
 */
const AuditPage = () => {
  // Audit log state
  const [auditLogs, setAuditLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [userFilter, setUserFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [componentFilter, setComponentFilter] = useState('');
  const [exportFormat, setExportFormat] = useState('csv');
  const [activeTab, setActiveTab] = useState('activities');

  // Get unique users from logs for filter dropdown
  const uniqueUsers = [...new Set(auditLogs.map(log => log.userName))];

  // Get unique actions from logs for filter dropdown
  const uniqueActions = [...new Set(auditLogs.map(log => log.action))];

  // Get unique components from logs for filter dropdown
  const uniqueComponents = [...new Set(auditLogs.map(log => log.component))];

  // Load audit logs
  useEffect(() => {
    const fetchAuditLogs = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/audit/logs');
        if (response.ok) {
          const data = await response.json();
          setAuditLogs(data.logs || []);
          setFilteredLogs(data.logs || []);
        }
      } catch (error) {
        console.error('Error fetching audit logs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAuditLogs();
  }, []);

  // Apply filters whenever filter options change
  useEffect(() => {
    filterLogs();
  }, [searchQuery, dateRange, userFilter, actionFilter, componentFilter, auditLogs]);

  // Filter logs based on search query and filters
  const filterLogs = () => {
    let filtered = [...auditLogs];

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        log =>
          log.userName.toLowerCase().includes(query) ||
          log.action.toLowerCase().includes(query) ||
          log.component.toLowerCase().includes(query) ||
          log.details.toLowerCase().includes(query)
      );
    }

    // Filter by date range
    if (dateRange.start) {
      const startDate = new Date(dateRange.start);
      filtered = filtered.filter(log => new Date(log.timestamp) >= startDate);
    }

    if (dateRange.end) {
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59, 999); // End of the selected day
      filtered = filtered.filter(log => new Date(log.timestamp) <= endDate);
    }

    // Filter by user
    if (userFilter) {
      filtered = filtered.filter(log => log.userName === userFilter);
    }

    // Filter by action
    if (actionFilter) {
      filtered = filtered.filter(log => log.action === actionFilter);
    }

    // Filter by component
    if (componentFilter) {
      filtered = filtered.filter(log => log.component === componentFilter);
    }

    setFilteredLogs(filtered);
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setDateRange({ start: '', end: '' });
    setUserFilter('');
    setActionFilter('');
    setComponentFilter('');
  };

  // Export logs
  const exportLogs = () => {
    let exportData;

    if (exportFormat === 'csv') {
      // Generate CSV
      const headers = ['Timestamp', 'User', 'Action', 'Component', 'Details', 'IP Address'];
      const rows = filteredLogs.map(log => [
        log.timestamp,
        log.userName,
        log.action,
        log.component,
        log.details,
        log.ipAddress,
      ]);

      exportData = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      // Download file
      const blob = new Blob([exportData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (exportFormat === 'json') {
      // Generate JSON
      exportData = JSON.stringify(filteredLogs, null, 2);

      // Download file
      const blob = new Blob([exportData], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit_logs_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Format date for display
  const formatDate = dateString => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  // Get action color class based on action type
  const getActionColorClass = action => {
    switch (action.toLowerCase()) {
      case 'create':
        return 'bg-blue-100 text-blue-800';
      case 'update':
        return 'bg-green-100 text-green-800';
      case 'delete':
        return 'bg-red-100 text-red-800';
      case 'access':
        return 'bg-purple-100 text-purple-800';
      case 'export':
        return 'bg-yellow-100 text-yellow-800';
      case 'login':
        return 'bg-indigo-100 text-indigo-800';
      case 'logout':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="audit-page-container p-4">
      <h1 className="text-2xl font-bold mb-6">Audit Trail</h1>

      <Tabs defaultValue="activities" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="activities">
            <Activity className="h-4 w-4 mr-2" />
            User Activities
          </TabsTrigger>
          <TabsTrigger value="document">
            <FileText className="h-4 w-4 mr-2" />
            Document Changes
          </TabsTrigger>
        </TabsList>

        {/* User Activities Tab */}
        <TabsContent value="activities">
          <div className="space-y-6">
            {/* Filter Card */}
            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
                <CardDescription>Filter audit logs by various criteria</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex">
                    <input
                      type="text"
                      className="w-full p-2 border rounded-l"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search by user, action, component, or details"
                    />
                    <Button className="rounded-l-none">
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block mb-1 text-sm">Date Range From</label>
                      <input
                        type="date"
                        className="w-full p-2 border rounded"
                        value={dateRange.start}
                        onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                      />
                    </div>

                    <div>
                      <label className="block mb-1 text-sm">Date Range To</label>
                      <input
                        type="date"
                        className="w-full p-2 border rounded"
                        value={dateRange.end}
                        onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                      />
                    </div>

                    <div>
                      <label className="block mb-1 text-sm">User</label>
                      <select
                        className="w-full p-2 border rounded"
                        value={userFilter}
                        onChange={e => setUserFilter(e.target.value)}
                      >
                        <option value="">All Users</option>
                        {uniqueUsers.map((user, index) => (
                          <option key={index} value={user}>
                            {user}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block mb-1 text-sm">Action</label>
                      <select
                        className="w-full p-2 border rounded"
                        value={actionFilter}
                        onChange={e => setActionFilter(e.target.value)}
                      >
                        <option value="">All Actions</option>
                        {uniqueActions.map((action, index) => (
                          <option key={index} value={action}>
                            {action}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={clearFilters}>
                      Clear Filters
                    </Button>

                    <div className="flex items-center space-x-2">
                      <select
                        className="p-2 border rounded"
                        value={exportFormat}
                        onChange={e => setExportFormat(e.target.value)}
                      >
                        <option value="csv">CSV</option>
                        <option value="json">JSON</option>
                      </select>
                      <Button onClick={exportLogs} className="flex items-center">
                        <Download className="h-4 w-4 mr-2" />
                        Export
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Audit Logs Card */}
            <Card>
              <CardHeader>
                <CardTitle>Audit Logs</CardTitle>
                <CardDescription>
                  Showing {filteredLogs.length} of {auditLogs.length} total logs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded overflow-auto">
                  {loading ? (
                    <div className="flex justify-center items-center h-40">
                      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                    </div>
                  ) : filteredLogs.length > 0 ? (
                    <table className="min-w-full">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="text-left p-3">Timestamp</th>
                          <th className="text-left p-3">User</th>
                          <th className="text-left p-3">Action</th>
                          <th className="text-left p-3">Component</th>
                          <th className="text-left p-3">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredLogs.map((log, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="p-3 whitespace-nowrap">
                              <div className="flex items-center">
                                <Calendar className="h-4 w-4 mr-2 text-gray-500" />
                                {formatDate(log.timestamp)}
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center">
                                <User className="h-4 w-4 mr-2 text-gray-500" />
                                {log.userName}
                              </div>
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${getActionColorClass(log.action)}`}
                              >
                                {log.action}
                              </span>
                            </td>
                            <td className="p-3">{log.component}</td>
                            <td className="p-3">
                              <div className="max-w-md truncate" title={log.details}>
                                {log.details}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-40 text-center p-4">
                      <AlertCircle className="h-8 w-8 text-gray-400 mb-2" />
                      <p className="text-gray-500">
                        {auditLogs.length > 0
                          ? 'No logs match your filter criteria. Try adjusting your filters.'
                          : 'No audit logs available.'}
                      </p>
                      {auditLogs.length > 0 && (
                        <Button variant="link" onClick={clearFilters} className="mt-2">
                          Clear all filters
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Document Changes Tab */}
        <TabsContent value="document">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Document Change History</CardTitle>
                <CardDescription>Track changes made to documents in the system</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block mb-1 text-sm">Document Type</label>
                    <select
                      className="w-full p-2 border rounded"
                      value={componentFilter}
                      onChange={e => setComponentFilter(e.target.value)}
                    >
                      <option value="">All Documents</option>
                      {uniqueComponents.map((component, index) => (
                        <option key={index} value={component}>
                          {component}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block mb-1 text-sm">Date Range From</label>
                    <input
                      type="date"
                      className="w-full p-2 border rounded"
                      value={dateRange.start}
                      onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="block mb-1 text-sm">Date Range To</label>
                    <input
                      type="date"
                      className="w-full p-2 border rounded"
                      value={dateRange.end}
                      onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="border rounded overflow-auto">
                  {loading ? (
                    <div className="flex justify-center items-center h-40">
                      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                    </div>
                  ) : filteredLogs.filter(log =>
                      ['create', 'update', 'delete'].includes(log.action.toLowerCase())
                    ).length > 0 ? (
                    <table className="min-w-full">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="text-left p-3">Document</th>
                          <th className="text-left p-3">Action</th>
                          <th className="text-left p-3">User</th>
                          <th className="text-left p-3">Timestamp</th>
                          <th className="text-left p-3">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredLogs
                          .filter(log =>
                            ['create', 'update', 'delete'].includes(log.action.toLowerCase())
                          )
                          .map((log, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="p-3">
                                <div className="flex items-center">
                                  <FileText className="h-4 w-4 mr-2 text-gray-500" />
                                  {log.component}
                                </div>
                              </td>
                              <td className="p-3">
                                <span
                                  className={`px-2 py-1 rounded text-xs font-medium ${getActionColorClass(log.action)}`}
                                >
                                  {log.action}
                                </span>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center">
                                  <User className="h-4 w-4 mr-2 text-gray-500" />
                                  {log.userName}
                                </div>
                              </td>
                              <td className="p-3 whitespace-nowrap">{formatDate(log.timestamp)}</td>
                              <td className="p-3">
                                <div className="max-w-md truncate" title={log.details}>
                                  {log.details}
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-40 text-center p-4">
                      <AlertCircle className="h-8 w-8 text-gray-400 mb-2" />
                      <p className="text-gray-500">No document change logs found.</p>
                      {componentFilter || dateRange.start || dateRange.end ? (
                        <Button variant="link" onClick={clearFilters} className="mt-2">
                          Clear all filters
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AuditPage;
