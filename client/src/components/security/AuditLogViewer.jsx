import React, { useState, useEffect } from 'react';
import { LinkIcon } from 'lucide-react'


// Simple clock icon
const ClockIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);

// Simple user icon
const UserIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

// Simple file icon
const FileIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
  </svg>
);

// Simple filter icon
const FilterIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
  </svg>
);

// Simple download icon
const DownloadIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);

// Simple search icon
const SearchIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const AuditLogViewer = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    eventType: [],
    user: [],
    dateRange: 'all',
  });

  // Fetch audit logs from API
  useEffect(() => {
    const fetchAuditLogs = async () => {
      try {
        const queryParams = new URLSearchParams();
        queryParams.append('page', 1);
        queryParams.append('limit', 50);

        if (filters.eventType.length > 0) {
          queryParams.append('eventType', filters.eventType.join(','));
        }

        if (filters.user.length > 0) {
          queryParams.append('user', filters.user.join(','));
        }

        if (filters.dateRange !== 'all') {
          let fromDate;
          const now = new Date();

          switch (filters.dateRange) {
            case 'today':
              fromDate = new Date(now.setHours(0, 0, 0, 0));
              break;
            case 'week':
              fromDate = new Date(now.setDate(now.getDate() - 7));
              break;
            case 'month':
              fromDate = new Date(now.setMonth(now.getMonth() - 1));
              break;
            default:
              fromDate = null;
          }

          if (fromDate) {
            queryParams.append('fromDate', fromDate.toISOString());
          }
        }

        if (searchQuery.trim() !== '') {
          queryParams.append('search', searchQuery);
        }

        const response = await fetch(`/api/fda-compliance/audit-logs?${queryParams.toString()}`);

        if (response.ok) {
          const data = await response.json();
          setLogs(data.logs);
          setFilteredLogs(data.logs);
        } else {
          console.error('Failed to fetch audit logs');
        }
      } catch (error) {
        console.error('Error fetching audit logs:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAuditLogs();
  }, [filters, searchQuery]);

  // Apply client-side filtering if needed (for quick filtering without API calls)
  useEffect(() => {
    // If we're using client-side filtering, uncomment this code
    /*
    let results = [...logs];
    
    // Filter by event type
    if (filters.eventType.length > 0) {
      results = results.filter(log => filters.eventType.includes(log.eventType));
    }
    
    // Filter by user
    if (filters.user.length > 0) {
      results = results.filter(log => filters.user.includes(log.user));
    }
    
    // Filter by date range
    if (filters.dateRange !== 'all') {
      const now = new Date();
      let startDate;
      
      switch (filters.dateRange) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        default:
          startDate = null;
      }
      
      if (startDate) {
        results = results.filter(log => new Date(log.timestamp) >= startDate);
      }
    }
    
    // Apply search query
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      results = results.filter(
        log => 
          log.eventType.toLowerCase().includes(query) ||
          log.user.toLowerCase().includes(query) ||
          log.resourceId.toLowerCase().includes(query) ||
          log.description.toLowerCase().includes(query)
      );
    }
    
    setFilteredLogs(results);
    */
  }, [logs]);

  // Get unique event types and users for filter options
  const getEventTypes = () => [...new Set(logs.map(log => log.eventType))];
  const getUsers = () => [...new Set(logs.map(log => log.user))];

  const handleFilterChange = (filterType, value) => {
    setFilters(prev => {
      if (filterType === 'dateRange') {
        return { ...prev, dateRange: value };
      } else {
        const currentValues = [...prev[filterType]];
        const index = currentValues.indexOf(value);

        if (index === -1) {
          currentValues.push(value);
        } else {
          currentValues.splice(index, 1);
        }

        return { ...prev, [filterType]: currentValues };
      }
    });
  };

  const handleClearFilters = () => {
    setFilters({
      eventType: [],
      user: [],
      dateRange: 'all',
    });
    setSearchQuery('');
  };

  const handleLogSelection = log => {
    setSelectedLog(log);
  };

  const handleCloseDetails = () => {
    setSelectedLog(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Audit Log Viewer</h2>
          <p className="text-gray-600">
            FDA 21 CFR Part 11 compliant audit trail with blockchain verification
          </p>
        </div>
        <div className="flex space-x-2">
          <button className="flex items-center px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50">
            <FilterIcon />
            <span className="ml-2">Filter</span>
          </button>
          <button className="flex items-center px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50">
            <DownloadIcon />
            <span className="ml-2">Export</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow-md rounded-lg p-4">
            <div className="mb-4">
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="search"
                  className="block w-full pr-10 pl-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm"
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <SearchIcon />
                </div>
              </div>
            </div>

            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Event Type</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {getEventTypes().map(eventType => (
                  <div key={eventType} className="flex items-center">
                    <input
                      id={`event-${eventType}`}
                      type="checkbox"
                      className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                      checked={filters.eventType.includes(eventType)}
                      onChange={() => handleFilterChange('eventType', eventType)}
                    />
                    <label htmlFor={`event-${eventType}`} className="ml-2 text-sm text-gray-700">
                      {eventType}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">User</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {getUsers().map(user => (
                  <div key={user} className="flex items-center">
                    <input
                      id={`user-${user}`}
                      type="checkbox"
                      className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                      checked={filters.user.includes(user)}
                      onChange={() => handleFilterChange('user', user)}
                    />
                    <label htmlFor={`user-${user}`} className="ml-2 text-sm text-gray-700">
                      {user}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Date Range</h3>
              <div className="space-y-2">
                {[
                  { id: 'all', label: 'All Time' },
                  { id: 'today', label: 'Today' },
                  { id: 'week', label: 'Last 7 Days' },
                  { id: 'month', label: 'Last 30 Days' },
                ].map(option => (
                  <div key={option.id} className="flex items-center">
                    <input
                      id={`date-${option.id}`}
                      type="radio"
                      className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300"
                      checked={filters.dateRange === option.id}
                      onChange={() => handleFilterChange('dateRange', option.id)}
                    />
                    <label htmlFor={`date-${option.id}`} className="ml-2 text-sm text-gray-700">
                      {option.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <button
              className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-pink-700 bg-pink-100 hover:bg-pink-200"
              onClick={handleClearFilters}
            >
              Clear Filters
            </button>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg mt-4 border border-gray-200">
            <div className="flex items-center justify-between text-gray-700 mb-2">
              <span className="font-medium">Total Logs</span>
              <span>{logs.length}</span>
            </div>
            <div className="flex items-center justify-between text-gray-700 mb-2">
              <span className="font-medium">Filtered Logs</span>
              <span>{filteredLogs.length}</span>
            </div>
            <div className="flex items-center justify-between text-green-700">
              <span className="font-medium">Blockchain Verified</span>
              <span>
                {logs.filter(log => log.blockchainVerified).length} / {logs.length}
              </span>
            </div>
          </div>
        </div>

        {/* Log List and Details */}
        <div className="lg:col-span-3">
          {selectedLog ? (
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-4 border-b border-gray-200 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Audit Log Details</h3>
                  <p className="text-sm text-gray-500">ID: {selectedLog.id}</p>
                </div>
                <button className="text-gray-400 hover:text-gray-500" onClick={handleCloseDetails}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Event Type</h4>
                    <p className="text-sm text-gray-900">{selectedLog.eventType}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Timestamp</h4>
                    <p className="text-sm text-gray-900">
                      {new Date(selectedLog.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">User</h4>
                    <p className="text-sm text-gray-900">{selectedLog.user}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Resource ID</h4>
                    <p className="text-sm text-gray-900">{selectedLog.resourceId}</p>
                  </div>
                </div>

                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-500 mb-1">Description</h4>
                  <p className="text-sm text-gray-900">{selectedLog.description}</p>
                </div>

                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-500 mb-2">Additional Details</h4>
                  <div className="bg-gray-50 p-4 rounded-md">
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-medium text-gray-500">IP Address</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {selectedLog.details.ipAddress}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-gray-500">Action Result</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {selectedLog.details.actionResult}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-gray-500">Access Rights</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {selectedLog.details.accessRights}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-gray-500">Session ID</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {selectedLog.details.sessionId}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-medium text-gray-500">User Agent</dt>
                        <dd className="mt-1 text-sm text-gray-900 truncate">
                          {selectedLog.details.userAgent}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                {selectedLog.blockchainVerified && selectedLog.details.hashValue && (
                  <div className="bg-green-50 p-4 rounded-md border border-green-100">
                    <div className="flex items-center text-green-800 mb-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5 mr-2"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <h4 className="font-semibold">Blockchain Verification</h4>
                    </div>
                    <p className="text-sm text-green-700 mb-2">
                      This audit log entry has been cryptographically verified and recorded on the
                      blockchain.
                    </p>
                    <div className="flex items-center">
                      <span className="text-xs font-mono text-green-800 truncate">
                        {selectedLog.details.hashValue}
                      </span>
                      <button className="ml-2 text-pink-600" title="Copy hash">
                        <LinkIcon />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-700">
                    Audit Logs ({filteredLogs.length})
                  </h3>
                  <span className="text-xs text-gray-500">
                    Showing {Math.min(filteredLogs.length, 20)} of {filteredLogs.length} logs
                  </span>
                </div>
              </div>

              {filteredLogs.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-gray-500">No logs found matching the current filters.</p>
                  <button
                    className="mt-2 text-sm text-pink-600 hover:text-pink-800"
                    onClick={handleClearFilters}
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {filteredLogs.slice(0, 20).map(log => (
                    <div
                      key={log.id}
                      className="px-4 py-3 hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleLogSelection(log)}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="text-sm font-medium text-gray-900">{log.eventType}</h4>
                        <div className="flex items-center">
                          {log.blockchainVerified && (
                            <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full mr-2">
                              Verified
                            </span>
                          )}
                          <span className="text-xs text-gray-500 flex items-center">
                            <ClockIcon />
                            <span className="ml-1">{new Date(log.timestamp).toLocaleString()}</span>
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 truncate mb-1">{log.description}</p>
                      <div className="flex items-center text-xs text-gray-500">
                        <span className="flex items-center mr-3">
                          <UserIcon />
                          <span className="ml-1">{log.user}</span>
                        </span>
                        <span className="flex items-center">
                          <FileIcon />
                          <span className="ml-1">{log.resourceId}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {filteredLogs.length > 20 && (
                <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 text-right">
                  <button className="text-sm text-pink-600 hover:text-pink-800">
                    Load more logs
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditLogViewer;
