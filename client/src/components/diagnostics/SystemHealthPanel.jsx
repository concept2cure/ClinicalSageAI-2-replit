import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Activity, Cpu, HardDrive, Network, AlertCircle, Code, CheckCircle, XCircle, RefreshCw, DownloadCloud } from 'lucide-react'

/**
 * SystemHealthPanel - Client-friendly system diagnostics panel
 *
 * Replaces the developer-oriented DEBUG panel with a user-friendly
 * system diagnostics tool that can be accessed on demand.
 */
const SystemHealthPanel = () => {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [systemHealth, setSystemHealth] = useState({
    memory: {
      used: 0,
      total: 0,
      percentage: 0,
    },
    performance: {
      score: 0,
    },
    api: {
      status: 'unknown',
      latency: 0,
    },
    lastChecked: null,
  });
  const [errorLogs, setErrorLogs] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Collect system health information
  const refreshSystemHealth = async () => {
    setIsRefreshing(true);

    try {
      // Get memory information from the browser
      const memoryInfo = window.performance?.memory || {
        usedJSHeapSize: 0,
        totalJSHeapSize: 2000000000,
      };

      // Get performance score
      const performanceNow = window.performance?.now() || 0;

      // Check API health
      const apiStartTime = Date.now();
      const apiResponse = await fetch('/api/health');
      const apiLatency = Date.now() - apiStartTime;
      const apiStatus = apiResponse.ok ? 'healthy' : 'unhealthy';

      // Get error logs from console (if available in localStorage)
      const storedErrors = JSON.parse(localStorage.getItem('errorLogs') || '[]');

      // Update state
      setSystemHealth({
        memory: {
          used: Math.round(memoryInfo.usedJSHeapSize / 1000000),
          total: Math.round(memoryInfo.totalJSHeapSize / 1000000),
          percentage: Math.round((memoryInfo.usedJSHeapSize / memoryInfo.totalJSHeapSize) * 100),
        },
        performance: {
          score: Math.min(100, Math.max(0, Math.round(100 - performanceNow / 100))),
        },
        api: {
          status: apiStatus,
          latency: apiLatency,
        },
        lastChecked: new Date().toISOString(),
      });

      setErrorLogs(storedErrors);
    } catch (error) {
      console.error('Error refreshing system health:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Run on initial mount
  useEffect(() => {
    if (open) {
      refreshSystemHealth();
    }
  }, [open]);

  // Generate performance rating
  const getPerformanceRating = () => {
    const { memory, performance, api } = systemHealth;

    if (memory.percentage > 90 || api.latency > 1000 || performance.score < 30) {
      return { label: 'Poor', color: 'bg-red-100 text-red-800 border-red-200' };
    } else if (memory.percentage > 70 || api.latency > 500 || performance.score < 60) {
      return { label: 'Fair', color: 'bg-amber-100 text-amber-800 border-amber-200' };
    } else {
      return { label: 'Good', color: 'bg-green-100 text-green-800 border-green-200' };
    }
  };

  // Format date for display
  const formatDate = isoString => {
    if (!isoString) return 'Never';

    const date = new Date(isoString);
    return date.toLocaleTimeString();
  };

  // Generate a report to download
  const generateReport = () => {
    const report = {
      systemHealth,
      errorLogs,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `system-health-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const performanceRating = getPerformanceRating();

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="flex items-center gap-1.5">
            <Activity className="h-4 w-4" />
            <span>System Health</span>
          </Button>
        </DialogTrigger>

        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Health Dashboard
              <Badge variant="outline" className={performanceRating.color}>
                {performanceRating.label}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              View system performance metrics and diagnostics information
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 overflow-hidden flex flex-col"
          >
            <TabsList className="mb-4">
              <TabsTrigger value="overview" className="flex items-center gap-1.5">
                <Activity className="h-4 w-4" />
                <span>Overview</span>
              </TabsTrigger>
              <TabsTrigger value="resources" className="flex items-center gap-1.5">
                <Cpu className="h-4 w-4" />
                <span>Resources</span>
              </TabsTrigger>
              <TabsTrigger value="connectivity" className="flex items-center gap-1.5">
                <Network className="h-4 w-4" />
                <span>Connectivity</span>
              </TabsTrigger>
              <TabsTrigger value="errors" className="flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" />
                <span>Issues</span>
                {errorLogs.length > 0 && (
                  <Badge className="ml-1 bg-red-100 text-red-800 border-red-200 h-5 px-1.5">
                    {errorLogs.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1">
              <TabsContent value="overview" className="mt-0 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Memory Usage</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="text-2xl font-bold">{systemHealth.memory.percentage}%</div>
                        <div className="text-sm text-muted-foreground">
                          {systemHealth.memory.used} MB / {systemHealth.memory.total} MB
                        </div>
                      </div>
                      <div className="mt-2 h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            systemHealth.memory.percentage > 80
                              ? 'bg-red-500'
                              : systemHealth.memory.percentage > 60
                                ? 'bg-amber-500'
                                : 'bg-green-500'
                          }`}
                          style={{ width: `${systemHealth.memory.percentage}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Performance Score</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="text-2xl font-bold">
                          {systemHealth.performance.score}/100
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {systemHealth.performance.score > 80
                            ? 'Excellent'
                            : systemHealth.performance.score > 60
                              ? 'Good'
                              : systemHealth.performance.score > 40
                                ? 'Fair'
                                : 'Poor'}
                        </div>
                      </div>
                      <div className="mt-2 h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            systemHealth.performance.score > 80
                              ? 'bg-green-500'
                              : systemHealth.performance.score > 60
                                ? 'bg-emerald-500'
                                : systemHealth.performance.score > 40
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                          }`}
                          style={{ width: `${systemHealth.performance.score}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">API Health</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {systemHealth.api.status === 'healthy' ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                          <span className="text-lg font-medium capitalize">
                            {systemHealth.api.status}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {systemHealth.api.latency}ms latency
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">System Info</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm space-y-1">
                        <div className="flex justify-between">
                          <span>Last checked:</span>
                          <span>{formatDate(systemHealth.lastChecked)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Browser:</span>
                          <span>{navigator.userAgent.split(' ').slice(-1)[0]}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Issues detected:</span>
                          <span>{errorLogs.length}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="resources" className="mt-0 space-y-4">
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Memory Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Heap Memory Used:</span>
                          <span>{systemHealth.memory.used} MB</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Total Heap Allocated:</span>
                          <span>{systemHealth.memory.total} MB</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Available Memory:</span>
                          <span>{systemHealth.memory.total - systemHealth.memory.used} MB</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Usage Percentage:</span>
                          <span>{systemHealth.memory.percentage}%</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Storage</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>LocalStorage:</span>
                          <span>{localStorage.length} items</span>
                        </div>
                        <div className="flex justify-between">
                          <span>SessionStorage:</span>
                          <span>{sessionStorage.length} items</span>
                        </div>
                        <div className="flex justify-between">
                          <span>IndexedDB Status:</span>
                          <span>{window.indexedDB ? 'Available' : 'Not Available'}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="connectivity" className="mt-0 space-y-4">
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Network Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Connection:</span>
                          <span className="capitalize">
                            {navigator.onLine ? 'Online' : 'Offline'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>API Endpoint Status:</span>
                          <span className="capitalize flex items-center gap-1">
                            {systemHealth.api.status === 'healthy' ? (
                              <>
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                Healthy
                              </>
                            ) : (
                              <>
                                <XCircle className="h-4 w-4 text-red-500" />
                                {systemHealth.api.status}
                              </>
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>API Response Time:</span>
                          <span>{systemHealth.api.latency} ms</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="errors" className="mt-0 space-y-4">
                {errorLogs.length > 0 ? (
                  <div className="space-y-3">
                    {errorLogs.map((log, index) => (
                      <Card key={index} className="border-red-200">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <AlertCircle className="h-4 w-4 text-red-500" />
                              {log.message || 'Error occurred'}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        {log.details && (
                          <CardContent className="pt-0 pb-3">
                            <div className="text-sm text-muted-foreground bg-gray-50 p-2 rounded overflow-auto max-h-40">
                              <code className="whitespace-pre-wrap font-mono text-xs">
                                {log.details}
                              </code>
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <CheckCircle className="h-16 w-16 text-green-100 mb-4" />
                    <h3 className="text-lg font-medium">No Issues Detected</h3>
                    <p className="text-sm text-muted-foreground max-w-md mt-1">
                      The system is currently running smoothly without any detected errors or
                      issues.
                    </p>
                  </div>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>

          <DialogFooter className="flex items-center justify-between mt-4 sm:justify-between">
            <div>
              <Button
                onClick={refreshSystemHealth}
                variant="outline"
                size="sm"
                disabled={isRefreshing}
                className="mr-2"
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button onClick={generateReport} variant="outline" size="sm">
                <DownloadCloud className="h-4 w-4 mr-1" />
                Export Report
              </Button>
            </div>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SystemHealthPanel;
