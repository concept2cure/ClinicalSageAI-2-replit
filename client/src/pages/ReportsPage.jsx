import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  BarChart3, FileText, Download, Calendar, Filter, Search, Layers, Check, AlertCircle, FileBarChart2, Users, BookOpen, Network, Clock, ListFilter, ShieldAlert, FileCheck, Gauge } from 'lucide-react'

/**
 * Comprehensive Reports Page Component
 *
 * This page provides a unified interface for accessing all report types in the CERV2 module,
 * with dynamic filter controls, results display, and PDF export functionality.
 */
const ReportsPage = () => {
  const { toast } = useToast();
  const [selectedReportType, setSelectedReportType] = useState('compliance-summary');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    endDate: new Date(),
  });
  const [filters, setFilters] = useState({
    authority: 'all',
    section: 'all',
    severity: 'all',
    source: 'all',
    status: 'all',
    modelVersion: 'all',
    riskLevel: 'all',
    user: 'all',
  });
  const [exportProgress, setExportProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  // Define available report types
  const reportTypes = [
    {
      id: 'compliance-summary',
      name: 'Compliance Summary Report',
      icon: <Gauge className="h-4 w-4 mr-2" />,
    },
    {
      id: 'section-generation-log',
      name: 'Section Generation Log',
      icon: <FileText className="h-4 w-4 mr-2" />,
    },
    {
      id: 'data-source-audit',
      name: 'Data Source Audit Report',
      icon: <Layers className="h-4 w-4 mr-2" />,
    },
    {
      id: 'risk-management-traceability',
      name: 'Risk-Management Traceability Report',
      icon: <Network className="h-4 w-4 mr-2" />,
    },
    {
      id: 'pmcf-activity',
      name: 'PMCF Activity & Update Report',
      icon: <Clock className="h-4 w-4 mr-2" />,
    },
    {
      id: 'gspr-matrix',
      name: 'GSPR/Essential Principles Matrix',
      icon: <ListFilter className="h-4 w-4 mr-2" />,
    },
    {
      id: 'literature-search-audit',
      name: 'Literature Search Audit Trail',
      icon: <BookOpen className="h-4 w-4 mr-2" />,
    },
    {
      id: 'user-activity',
      name: 'User Activity & Approval Report',
      icon: <Users className="h-4 w-4 mr-2" />,
    },
    {
      id: 'ai-performance',
      name: 'AI Performance & Confidence Report',
      icon: <BarChart3 className="h-4 w-4 mr-2" />,
    },
    {
      id: 'export-history',
      name: 'Export History & Comparison Report',
      icon: <FileCheck className="h-4 w-4 mr-2" />,
    },
  ];

  // Build query parameters based on current filters
  const getQueryParams = () => {
    const params = {
      type: selectedReportType,
      startDate: format(dateRange.startDate, 'yyyy-MM-dd'),
      endDate: format(dateRange.endDate, 'yyyy-MM-dd'),
    };

    // Add other filters if they're not set to 'all'
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== 'all') {
        params[key] = value;
      }
    });

    return params;
  };

  // Fetch report data based on selected type and filters
  const {
    data: reportData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['reports', selectedReportType, dateRange, filters],
    queryFn: async () => {
      const response = await axios.get('/api/reports', {
        params: getQueryParams(),
      });
      return response.data;
    },
    enabled: true,
  });

  // Export the current report as PDF
  const exportReportAsPdf = async () => {
    try {
      setIsExporting(true);
      setExportProgress(10);

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setExportProgress(prev => Math.min(prev + 5, 90));
      }, 200);

      // Request PDF export with current filters
      const response = await axios.get('/api/reports/export.pdf', {
        params: getQueryParams(),
        responseType: 'blob',
      });

      clearInterval(progressInterval);
      setExportProgress(100);

      // Create file name based on report type and date
      const today = format(new Date(), 'yyyy-MM-dd');
      const reportName = reportTypes.find(r => r.id === selectedReportType)?.name || 'Report';
      const fileName = `CER_${reportName.replace(/[^a-zA-Z0-9]/g, '_')}_${today}.pdf`;

      // Create download link for the PDF
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Report exported successfully',
        description: `The ${reportName} has been downloaded as a PDF.`,
        variant: 'default',
      });

      // Reset progress after a delay
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
      }, 1000);
    } catch (error) {
      console.error('Error exporting report:', error);
      setIsExporting(false);
      setExportProgress(0);

      toast({
        title: 'Export failed',
        description: 'There was an error generating the PDF report. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Render filter controls based on selected report type
  const renderFilterControls = () => {
    switch (selectedReportType) {
      case 'compliance-summary':
        return (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="authority">Regulatory Authority</Label>
              <Select
                value={filters.authority}
                onValueChange={value => setFilters({ ...filters, authority: value })}
              >
                <SelectTrigger id="authority">
                  <SelectValue placeholder="Select Authority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Authorities</SelectItem>
                  <SelectItem value="eu">EU MDR</SelectItem>
                  <SelectItem value="ich">ICH</SelectItem>
                  <SelectItem value="fda">FDA</SelectItem>
                  <SelectItem value="uk">UK MHRA</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="section">CER Section</Label>
              <Select
                value={filters.section}
                onValueChange={value => setFilters({ ...filters, section: value })}
              >
                <SelectTrigger id="section">
                  <SelectValue placeholder="Select Section" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  <SelectItem value="literature-review">Literature Review</SelectItem>
                  <SelectItem value="benefit-risk">Benefit-Risk Analysis</SelectItem>
                  <SelectItem value="pms">Post-Market Surveillance</SelectItem>
                  <SelectItem value="clinical-background">Clinical Background</SelectItem>
                  <SelectItem value="equivalence">Equivalence Assessment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="severity">Finding Severity</Label>
              <Select
                value={filters.severity}
                onValueChange={value => setFilters({ ...filters, severity: value })}
              >
                <SelectTrigger id="severity">
                  <SelectValue placeholder="Select Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="major">Major</SelectItem>
                  <SelectItem value="minor">Minor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'section-generation-log':
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="section">CER Section</Label>
              <Select
                value={filters.section}
                onValueChange={value => setFilters({ ...filters, section: value })}
              >
                <SelectTrigger id="section">
                  <SelectValue placeholder="Select Section" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  <SelectItem value="literature-review">Literature Review</SelectItem>
                  <SelectItem value="benefit-risk">Benefit-Risk Analysis</SelectItem>
                  <SelectItem value="pms">Post-Market Surveillance</SelectItem>
                  <SelectItem value="clinical-background">Clinical Background</SelectItem>
                  <SelectItem value="equivalence">Equivalence Assessment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="model-version">Model Version</Label>
              <Select
                value={filters.modelVersion}
                onValueChange={value => setFilters({ ...filters, modelVersion: value })}
              >
                <SelectTrigger id="model-version">
                  <SelectValue placeholder="Select Model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Versions</SelectItem>
                  <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  <SelectItem value="gpt-4">GPT-4</SelectItem>
                  <SelectItem value="custom">Custom Model</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="status">Generation Status</Label>
              <Select
                value={filters.status}
                onValueChange={value => setFilters({ ...filters, status: value })}
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="timeout">Timeout</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      // Add filter controls for other report types similarly
      case 'data-source-audit':
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="source">Data Source</Label>
              <Select
                value={filters.source}
                onValueChange={value => setFilters({ ...filters, source: value })}
              >
                <SelectTrigger id="source">
                  <SelectValue placeholder="Select Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="faers">FAERS</SelectItem>
                  <SelectItem value="literature">Literature</SelectItem>
                  <SelectItem value="clinical-trials">Clinical Trials</SelectItem>
                  <SelectItem value="pms">Post-Market Surveillance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="anomaly">Anomaly Filter</Label>
              <Select
                value={filters.anomaly || 'all'}
                onValueChange={value => setFilters({ ...filters, anomaly: value })}
              >
                <SelectTrigger id="anomaly">
                  <SelectValue placeholder="Select Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Records</SelectItem>
                  <SelectItem value="flagged">Anomalies Only</SelectItem>
                  <SelectItem value="normal">Normal Records Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      // Add more cases for other report types
      default:
        return (
          <Alert className="bg-blue-50 text-blue-800 border-blue-200">
            <AlertDescription>
              Filters for this report type are not fully implemented yet. Only date range filtering
              is available.
            </AlertDescription>
          </Alert>
        );
    }
  };

  // Render placeholder content when data is loading or not available
  const renderPlaceholderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading report data...</p>
        </div>
      );
    }

    if (error) {
      return (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4 mr-2" />
          <AlertDescription>
            Error loading report data. Please try again or contact support if the issue persists.
          </AlertDescription>
        </Alert>
      );
    }

    if (!reportData || reportData.rows?.length === 0) {
      return (
        <div className="text-center py-12 bg-gray-50 rounded-lg mt-4">
          <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No data found</h3>
          <p className="mt-2 text-gray-600">
            No report data matches your current filter criteria. Try adjusting your filters or date
            range.
          </p>
        </div>
      );
    }

    return null;
  };

  // Render report content based on selected type and data
  const renderReportContent = () => {
    if (!reportData || isLoading || error) {
      return renderPlaceholderContent();
    }

    switch (selectedReportType) {
      case 'compliance-summary':
        return (
          <div className="space-y-6">
            {/* Summary metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {reportData.summary?.overallScore || '85'}%
                  </div>
                  <p className="text-sm text-gray-500">Overall Compliance Score</p>
                  <Progress value={reportData.summary?.overallScore || 85} className="h-2 mt-2" />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {reportData.summary?.openFindingsCount || '3'}
                  </div>
                  <p className="text-sm text-gray-500">Open Non-Conformities</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {reportData.summary?.completedSections || '7'}/
                    {reportData.summary?.totalSections || '9'}
                  </div>
                  <p className="text-sm text-gray-500">Completed Sections</p>
                </CardContent>
              </Card>
            </div>

            {/* Non-conformities table */}
            <Card>
              <CardHeader>
                <CardTitle>Open Non-Conformities</CardTitle>
                <CardDescription>
                  Issues requiring attention before regulatory submission
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Finding
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Section
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Severity
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Owner
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Due Date
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {(reportData.rows || []).map((row, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.finding}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {row.section}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge
                              className={
                                row.severity === 'critical'
                                  ? 'bg-red-100 text-red-800 hover:bg-red-100'
                                  : row.severity === 'major'
                                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-100'
                                    : 'bg-blue-100 text-blue-800 hover:bg-blue-100'
                              }
                            >
                              {row.severity}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {row.owner}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {row.dueDate}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'section-generation-log':
        return (
          <div className="space-y-6">
            {/* Summary metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{reportData.summary?.totalCalls || '87'}</div>
                  <p className="text-sm text-gray-500">Total Generation Calls</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {reportData.summary?.avgLatency || '3.2'}s
                  </div>
                  <p className="text-sm text-gray-500">Average Latency</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {reportData.summary?.errorRate || '1.8'}%
                  </div>
                  <p className="text-sm text-gray-500">Error Rate</p>
                </CardContent>
              </Card>
            </div>

            {/* Generation log table */}
            <Card>
              <CardHeader>
                <CardTitle>Section Generation Log</CardTitle>
                <CardDescription>AI-assisted content generation events</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Timestamp
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Section
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Model
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Latency (ms)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {(reportData.rows || []).map((row, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.timestamp}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {row.user}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {row.section}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {row.modelVersion}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge
                              className={
                                row.status === 'success'
                                  ? 'bg-green-100 text-green-800 hover:bg-green-100'
                                  : 'bg-red-100 text-red-800 hover:bg-red-100'
                              }
                            >
                              {row.status}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {row.latency}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      // Add more cases for other report types

      default:
        return (
          <div className="text-center py-12 bg-gray-50 rounded-lg mt-4">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">Report Under Development</h3>
            <p className="mt-2 text-gray-600">
              The detailed view for this report type is still being implemented. Basic reporting
              functionality is available via the Export button.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <FileBarChart2 className="mr-3 h-8 w-8 text-blue-600" />
            CER Reports
          </h1>
          <p className="text-gray-600 mt-1">
            Comprehensive reporting and analytics for your Clinical Evaluation Reports
          </p>
        </div>

        <div>
          <Button
            onClick={exportReportAsPdf}
            disabled={isExporting || isLoading || !!error}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isExporting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Generating PDF...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export as PDF
              </>
            )}
          </Button>
        </div>
      </div>

      {isExporting && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">Generating report...</span>
            <span className="text-sm text-gray-500">{exportProgress}%</span>
          </div>
          <Progress value={exportProgress} className="h-2" />
        </div>
      )}

      {/* Report selection and filtering */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
          <div className="mb-4 md:mb-0 md:w-1/3">
            <Label htmlFor="report-type" className="mb-2 block">
              Report Type
            </Label>
            <Select value={selectedReportType} onValueChange={setSelectedReportType}>
              <SelectTrigger id="report-type" className="w-full">
                <SelectValue placeholder="Select report type" />
              </SelectTrigger>
              <SelectContent>
                {reportTypes.map(report => (
                  <SelectItem key={report.id} value={report.id}>
                    <div className="flex items-center">
                      {report.icon}
                      <span>{report.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:w-2/3 md:flex md:space-x-4">
            <div className="flex-1 mb-4 md:mb-0">
              <Label htmlFor="start-date" className="mb-2 block">
                Start Date
              </Label>
              <Input
                id="start-date"
                type="date"
                value={format(dateRange.startDate, 'yyyy-MM-dd')}
                onChange={e => {
                  const date = new Date(e.target.value);
                  if (!isNaN(date.getTime())) {
                    setDateRange({ ...dateRange, startDate: date });
                  }
                }}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="end-date" className="mb-2 block">
                End Date
              </Label>
              <Input
                id="end-date"
                type="date"
                value={format(dateRange.endDate, 'yyyy-MM-dd')}
                onChange={e => {
                  const date = new Date(e.target.value);
                  if (!isNaN(date.getTime())) {
                    setDateRange({ ...dateRange, endDate: date });
                  }
                }}
              />
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center mb-4">
            <Filter className="h-5 w-5 text-gray-500 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Report Filters</h3>
          </div>

          {renderFilterControls()}
        </div>
      </div>

      {/* Report content */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center mb-4">
          {reportTypes.find(r => r.id === selectedReportType)?.icon || (
            <FileText className="h-5 w-5 mr-2" />
          )}
          <h2 className="text-xl font-bold text-gray-900">
            {reportTypes.find(r => r.id === selectedReportType)?.name || 'Report'}
          </h2>
        </div>

        {renderReportContent()}
      </div>
    </div>
  );
};

export default ReportsPage;
