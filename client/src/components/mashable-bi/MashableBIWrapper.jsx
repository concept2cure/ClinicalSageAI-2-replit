/**
 * MashableBI Wrapper Component
 *
 * This component provides integration with the MashableBI Analytics platform,
 * allowing embedded analytics dashboards within the IND Wizard.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  BarChart2,
  PieChart,
  LineChart,
  RefreshCw,
  Download,
  Share2,
  Filter,
  Maximize2,
  Layers,
  Calendar,
  RotateCw,
  ChevronDown,
  Settings,
  AlertTriangle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import MashableAPIKeyForm from './MashableAPIKeyForm';

export function MashableBIWrapper({
  dashboardId,
  filters = {},
  height = 600,
  fullWidth = true,
  showFilters = true,
  showHeader = true,
  refreshInterval = null,
}) {
  const { toast } = useToast();
  const iframeRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeDashboard, setActiveDashboard] = useState(dashboardId);
  const [filterValues, setFilterValues] = useState(filters);
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  // API configuration states
  const [isConfigured, setIsConfigured] = useState(false);
  const [showConfigForm, setShowConfigForm] = useState(false);

  // Check if MashableBI is configured
  useEffect(() => {
    const checkConfiguration = async () => {
      try {
        const response = await fetch('/api/mashable-bi/status');
        if (!response.ok) {
          throw new Error('Failed to check configuration status');
        }

        const status = await response.json();
        setIsConfigured(status.configured);

        // Show configuration form if not configured
        if (!status.configured) {
          setShowConfigForm(true);
        }
      } catch (error) {
        console.error('Error checking MashableBI configuration:', error);
        setIsConfigured(false);
        setError('Could not verify MashableBI configuration status');
      }
    };

    checkConfiguration();
  }, []);

  // Available dashboards for IND workflow
  const dashboards = {
    'ind-overview': {
      id: 'ind-overview',
      name: 'IND Submission Overview',
      description: 'High-level metrics and KPIs for IND submission progress',
    },
    'ind-timeline': {
      id: 'ind-timeline',
      name: 'Timeline Analytics',
      description: 'Detailed timeline analysis with actual vs. planned metrics',
    },
    'ind-document-analytics': {
      id: 'ind-document-analytics',
      name: 'Document Analytics',
      description: 'Document completion, quality, and progress metrics',
    },
    'ind-regulatory-insights': {
      id: 'ind-regulatory-insights',
      name: 'Regulatory Insights',
      description: 'FDA feedback patterns and submission success rates',
    },
  };

  // Handle dashboard change
  const handleDashboardChange = dashboardId => {
    setActiveDashboard(dashboardId);
    setIsLoading(true);

    // Reset error state
    setError(null);
  };

  // Handle filter change
  const handleFilterChange = (key, value) => {
    setFilterValues(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  // Handle refresh
  const handleRefresh = () => {
    if (iframeRef.current) {
      setIsLoading(true);

      // Send message to iframe to refresh
      iframeRef.current.contentWindow.postMessage(
        {
          action: 'refresh',
          filters: filterValues,
        },
        '*'
      );

      setLastRefreshed(new Date());

      // Show toast notification
      toast({
        title: 'Dashboard Refreshed',
        description: `Data updated as of ${new Date().toLocaleTimeString()}`,
      });
    }
  };

  // Handle download
  const handleDownload = format => {
    // Send message to iframe to trigger download
    if (iframeRef.current) {
      iframeRef.current.contentWindow.postMessage(
        {
          action: 'download',
          format: format,
        },
        '*'
      );

      toast({
        title: 'Download Started',
        description: `Your ${format.toUpperCase()} download will begin shortly`,
      });
    }
  };

  // Handle expand/collapse
  const handleExpandToggle = () => {
    setIsExpanded(!isExpanded);
  };

  // Configuration status was already checked in the first useEffect

  // Handle API key configuration
  const handleApiKeyConfigured = () => {
    setIsConfigured(true);
    setShowConfigForm(false);
    setError(null);
    setIsLoading(true);

    // Reload the iframe
    if (iframeRef.current) {
      iframeRef.current.src = getMashableBIUrl(activeDashboard);
    }

    toast({
      title: 'MashableBI Configured',
      description: 'Your dashboard is being loaded with real data',
    });
  };

  // Format the MashableBI URL with filters
  const getMashableBIUrl = dashboardId => {
    // Base MashableBI embed URL
    const baseUrl = '/api/mashable-bi/embed';

    // Get the dashboard configuration
    const dashboard = dashboards[dashboardId] || dashboards['ind-overview'];

    // Add query parameters for dashboard and filters
    const queryParams = new URLSearchParams();
    queryParams.append('dashboard', dashboard.id);

    // Add filter parameters
    Object.entries(filterValues).forEach(([key, value]) => {
      if (value) {
        queryParams.append(`filter_${key}`, value);
      }
    });

    return `${baseUrl}?${queryParams.toString()}`;
  };

  // Listen for messages from the iframe
  useEffect(() => {
    const handleMessage = event => {
      // Verify origin for security
      if (event.origin !== window.location.origin) return;

      const { type, data } = event.data;

      if (type === 'mashable:loaded') {
        setIsLoading(false);
      } else if (type === 'mashable:error') {
        setError(data.message);
        setIsLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Set up refresh interval if provided
  useEffect(() => {
    if (!refreshInterval) return;

    const intervalId = setInterval(handleRefresh, refreshInterval * 1000);

    return () => clearInterval(intervalId);
  }, [refreshInterval, filterValues]);

  // Reload iframe when dashboard or filters change
  useEffect(() => {
    setIsLoading(true);
    setError(null);

    // Allow a short delay for state to update
    const timer = setTimeout(() => {
      if (iframeRef.current) {
        iframeRef.current.src = getMashableBIUrl(activeDashboard);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [activeDashboard, JSON.stringify(filterValues)]);

  return (
    <div
      className={`mashable-bi-wrapper ${isExpanded ? 'fixed inset-0 z-50 bg-background p-6' : 'w-full'}`}
    >
      <Card className={`w-full ${isExpanded ? 'h-full flex flex-col' : ''}`}>
        {showHeader && (
          <CardHeader className="pb-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center">
                  <BarChart2 className="h-5 w-5 mr-2 text-primary" />
                  <CardTitle>
                    {dashboards[activeDashboard]?.name || 'Analytics Dashboard'}
                  </CardTitle>
                </div>
                <CardDescription>
                  {dashboards[activeDashboard]?.description || 'Loading dashboard...'}
                </CardDescription>
              </div>

              <div className="flex items-center space-x-2">
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>

                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center"
                    onClick={() =>
                      document.getElementById('download-menu').classList.toggle('hidden')
                    }
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Export
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>

                  <div
                    id="download-menu"
                    className="absolute right-0 mt-1 w-36 bg-background border rounded-md shadow-md hidden z-10"
                  >
                    <div className="py-1">
                      <button
                        className="w-full text-left px-4 py-2 text-sm hover:bg-muted"
                        onClick={() => handleDownload('pdf')}
                      >
                        PDF
                      </button>
                      <button
                        className="w-full text-left px-4 py-2 text-sm hover:bg-muted"
                        onClick={() => handleDownload('excel')}
                      >
                        Excel
                      </button>
                      <button
                        className="w-full text-left px-4 py-2 text-sm hover:bg-muted"
                        onClick={() => handleDownload('image')}
                      >
                        Image
                      </button>
                    </div>
                  </div>
                </div>

                <Button variant="ghost" size="sm" onClick={handleExpandToggle}>
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Dashboard selector tabs */}
            <Tabs
              defaultValue={activeDashboard}
              onValueChange={handleDashboardChange}
              className="mt-4"
            >
              <TabsList className="w-full">
                {Object.values(dashboards).map(dashboard => (
                  <TabsTrigger key={dashboard.id} value={dashboard.id} className="flex-1">
                    {dashboard.id === 'ind-overview' && <BarChart2 className="h-4 w-4 mr-2" />}
                    {dashboard.id === 'ind-timeline' && <LineChart className="h-4 w-4 mr-2" />}
                    {dashboard.id === 'ind-document-analytics' && (
                      <Layers className="h-4 w-4 mr-2" />
                    )}
                    {dashboard.id === 'ind-regulatory-insights' && (
                      <PieChart className="h-4 w-4 mr-2" />
                    )}
                    {dashboard.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </CardHeader>
        )}

        {/* Filters section */}
        {showFilters && (
          <div className="px-6 pb-3">
            <div className="bg-muted/30 p-3 rounded-md">
              <div className="flex items-center mb-2">
                <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                <h3 className="text-sm font-medium">Dashboard Filters</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="date-range" className="text-xs">
                    Date Range
                  </Label>
                  <select
                    id="date-range"
                    className="w-full p-2 text-sm rounded-md border"
                    value={filterValues.dateRange || 'last-90-days'}
                    onChange={e => handleFilterChange('dateRange', e.target.value)}
                  >
                    <option value="last-30-days">Last 30 Days</option>
                    <option value="last-90-days">Last 90 Days</option>
                    <option value="last-6-months">Last 6 Months</option>
                    <option value="last-year">Last Year</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="project-status" className="text-xs">
                    Project Status
                  </Label>
                  <select
                    id="project-status"
                    className="w-full p-2 text-sm rounded-md border"
                    value={filterValues.status || 'all'}
                    onChange={e => handleFilterChange('status', e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="not_started">Not Started</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="document-type" className="text-xs">
                    Document Type
                  </Label>
                  <select
                    id="document-type"
                    className="w-full p-2 text-sm rounded-md border"
                    value={filterValues.documentType || 'all'}
                    onChange={e => handleFilterChange('documentType', e.target.value)}
                  >
                    <option value="all">All Documents</option>
                    <option value="protocols">Protocols</option>
                    <option value="forms">FDA Forms</option>
                    <option value="reports">Reports</option>
                    <option value="brochures">Investigator Brochures</option>
                  </select>
                </div>
              </div>

              {filterValues.dateRange === 'custom' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  <div className="space-y-1">
                    <Label htmlFor="start-date" className="text-xs">
                      Start Date
                    </Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={filterValues.startDate || ''}
                      onChange={e => handleFilterChange('startDate', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="end-date" className="text-xs">
                      End Date
                    </Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={filterValues.endDate || ''}
                      onChange={e => handleFilterChange('endDate', e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setFilterValues({})}
                  className="mr-2"
                >
                  Reset Filters
                </Button>
                <Button size="sm" onClick={handleRefresh}>
                  Apply Filters
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard iframe container */}
        <CardContent className={`p-0 ${isExpanded ? 'flex-1' : ''}`}>
          {/* Show API key configuration form when needed */}
          {showConfigForm && (
            <div
              className="flex flex-col items-center justify-center p-10 text-center"
              style={{ height: isExpanded ? '100%' : `${height}px` }}
            >
              <MashableAPIKeyForm onKeyConfigured={handleApiKeyConfigured} />
            </div>
          )}

          {/* Show unconfigured state */}
          {!isConfigured && !showConfigForm && (
            <div
              className="flex flex-col items-center justify-center p-10 text-center"
              style={{ height: isExpanded ? '100%' : `${height}px` }}
            >
              <Settings className="h-14 w-14 text-muted-foreground mb-6 opacity-30" />
              <h3 className="text-xl font-semibold mb-2">MashableBI Not Configured</h3>
              <p className="text-muted-foreground mb-6 max-w-md">
                MashableBI Analytics integration is available but needs to be configured with an API
                key before dashboards can be displayed.
              </p>
              <Button onClick={() => setShowConfigForm(true)}>Configure MashableBI</Button>
            </div>
          )}

          {/* Show error state */}
          {error && isConfigured && !showConfigForm ? (
            <div className="flex flex-col items-center justify-center p-10 text-center">
              <AlertTriangle className="h-10 w-10 text-destructive mb-4" />
              <h3 className="text-lg font-semibold mb-2">Dashboard Error</h3>
              <p className="text-muted-foreground mb-4">{error}</p>
              <div className="flex gap-3">
                <Button onClick={handleRefresh} variant="default">
                  Retry
                </Button>
                <Button onClick={() => setShowConfigForm(true)} variant="outline">
                  Reconfigure API Key
                </Button>
              </div>
            </div>
          ) : (
            /* Show the iframe when configured and no errors */
            isConfigured &&
            !showConfigForm && (
              <div className="relative" style={{ height: isExpanded ? '100%' : `${height}px` }}>
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                    <div className="text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                      <p className="text-muted-foreground">Loading analytics dashboard...</p>
                    </div>
                  </div>
                )}

                <iframe
                  ref={iframeRef}
                  src={getMashableBIUrl(activeDashboard)}
                  className="w-full h-full border-0"
                  title={`MashableBI - ${dashboards[activeDashboard]?.name || 'Dashboard'}`}
                  allow="fullscreen"
                  onLoad={() => setIsLoading(false)}
                  onError={() => {
                    setError('Failed to load dashboard. Please try again later.');
                    setIsLoading(false);
                  }}
                />
              </div>
            )
          )}
        </CardContent>

        {/* Dashboard footer with metadata */}
        <div className="px-6 py-3 border-t text-xs text-muted-foreground flex justify-between items-center">
          <div>Last refreshed: {lastRefreshed.toLocaleString()}</div>
          <div className="flex items-center">
            <Badge variant="outline" className="mr-2">
              MashableBI
            </Badge>
            <span>Powered by Concept2Cure™ Analytics</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default MashableBIWrapper;
