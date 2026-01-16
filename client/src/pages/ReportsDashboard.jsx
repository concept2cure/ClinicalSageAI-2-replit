import React, { useState } from 'react';
import { BarChart, FileBarChart, PieChart, TrendingUp, Calendar, Download, RefreshCw, Filter, Search, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocation } from 'wouter';

/**
 * ReportsDashboard Page
 *
 * Comprehensive reports dashboard showing all generated reports,
 * analytics, and report generation capabilities across all modules.
 */
const ReportsDashboard = () => {
  const [, setLocation] = useLocation();
  const [filterType, setFilterType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  // Mock comprehensive reports data
  const allReports = [
    {
      id: 'report-1',
      title: 'BTX-112 IND Readiness Assessment',
      type: 'regulatory',
      category: 'IND Submission',
      date: '2025-05-08T14:30:00Z',
      status: 'complete',
      size: '2.4 MB',
      downloadCount: 12,
      module: 'IND Wizard',
    },
    {
      id: 'report-2',
      title: 'CMC Documentation Quality Audit',
      type: 'quality',
      category: 'Quality Assessment',
      date: '2025-05-05T09:15:00Z',
      status: 'complete',
      size: '1.8 MB',
      downloadCount: 8,
      module: 'CMC Module',
    },
    {
      id: 'report-3',
      title: 'Clinical Trial Enrollment Analytics',
      type: 'clinical',
      category: 'Trial Management',
      date: '2025-05-01T11:45:00Z',
      status: 'complete',
      size: '3.1 MB',
      downloadCount: 15,
      module: 'Study Architect',
    },
    {
      id: 'report-4',
      title: 'Multi-Agency Compliance Report',
      type: 'regulatory',
      category: 'Compliance',
      date: '2025-04-28T16:20:00Z',
      status: 'complete',
      size: '4.2 MB',
      downloadCount: 23,
      module: 'CoAuthor',
    },
    {
      id: 'report-5',
      title: 'CER Safety Analysis Report',
      type: 'clinical',
      category: 'Safety Assessment',
      date: '2025-04-25T13:10:00Z',
      status: 'complete',
      size: '2.9 MB',
      downloadCount: 7,
      module: 'CER Module',
    },
    {
      id: 'report-6',
      title: 'Manufacturing Batch Quality Report',
      type: 'cmc',
      category: 'Manufacturing',
      date: '2025-04-22T10:30:00Z',
      status: 'complete',
      size: '1.6 MB',
      downloadCount: 11,
      module: 'CMC Module',
    },
  ];

  // Analytics data
  const analyticsData = {
    totalReports: allReports.length,
    thisMonth: 4,
    totalDownloads: allReports.reduce((sum, report) => sum + report.downloadCount, 0),
    averageSize: '2.5 MB',
    reportsByType: {
      regulatory: allReports.filter(r => r.type === 'regulatory').length,
      clinical: allReports.filter(r => r.type === 'clinical').length,
      quality: allReports.filter(r => r.type === 'quality').length,
      cmc: allReports.filter(r => r.type === 'cmc').length,
    },
  };

  // Filter reports based on type and search term
  const filteredReports = allReports.filter(report => {
    const matchesType = filterType === 'all' || report.type === filterType;
    const matchesSearch =
      report.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.module.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  // Format date
  const formatDate = dateString => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get report type icon and color
  const getReportTypeInfo = type => {
    switch (type) {
      case 'regulatory':
        return {
          icon: BarChart,
          color: 'text-blue-600',
          bgColor: 'bg-blue-100',
          label: 'Regulatory',
        };
      case 'clinical':
        return {
          icon: TrendingUp,
          color: 'text-purple-600',
          bgColor: 'bg-purple-100',
          label: 'Clinical',
        };
      case 'quality':
        return {
          icon: PieChart,
          color: 'text-green-600',
          bgColor: 'bg-green-100',
          label: 'Quality',
        };
      case 'cmc':
        return {
          icon: FileBarChart,
          color: 'text-orange-600',
          bgColor: 'bg-orange-100',
          label: 'CMC',
        };
      default:
        return {
          icon: FileBarChart,
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          label: 'Other',
        };
    }
  };

  // Handle download simulation
  const handleDownload = (reportId, reportTitle) => {
    console.log(`Downloading report: ${reportTitle}`);
    // In a real app, this would trigger actual file download
  };

  // Generate new report
  const handleGenerateReport = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setLocation('/client-portal'); // Navigate back to portal with reports module active
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/client-portal')}
              className="mr-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Portal
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Reports Dashboard</h1>
              <p className="text-gray-600 mt-1">Comprehensive reporting across all modules</p>
            </div>
          </div>
          <Button
            className="bg-pink-600 hover:bg-pink-700"
            onClick={handleGenerateReport}
            disabled={loading}
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileBarChart className="h-4 w-4 mr-2" />
                Generate New Report
              </>
            )}
          </Button>
        </div>

        {/* Analytics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Reports</CardDescription>
              <CardTitle className="text-2xl">{analyticsData.totalReports}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">+{analyticsData.thisMonth} this month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Downloads</CardDescription>
              <CardTitle className="text-2xl">{analyticsData.totalDownloads}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Across all reports</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Report Types</CardDescription>
              <CardTitle className="text-2xl">4</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Regulatory, Clinical, Quality, CMC</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Average Size</CardDescription>
              <CardTitle className="text-2xl">{analyticsData.averageSize}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Per report file</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filter & Search Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search reports by title, category, or module..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full md:w-48">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="regulatory">Regulatory</SelectItem>
                  <SelectItem value="clinical">Clinical</SelectItem>
                  <SelectItem value="quality">Quality</SelectItem>
                  <SelectItem value="cmc">CMC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Reports List */}
        <Card>
          <CardHeader>
            <CardTitle>All Reports ({filteredReports.length})</CardTitle>
            <CardDescription>Generated reports from all modules and workflows</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredReports.map(report => {
                const typeInfo = getReportTypeInfo(report.type);
                const IconComponent = typeInfo.icon;

                return (
                  <div
                    key={report.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`p-2 rounded-lg ${typeInfo.bgColor}`}>
                        <IconComponent className={`h-5 w-5 ${typeInfo.color}`} />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{report.title}</h3>
                        <div className="flex items-center space-x-4 mt-1">
                          <Badge variant="outline">{typeInfo.label}</Badge>
                          <span className="text-sm text-gray-500">{report.category}</span>
                          <span className="text-sm text-gray-500">•</span>
                          <span className="text-sm text-gray-500">{report.module}</span>
                        </div>
                        <div className="flex items-center space-x-4 mt-1 text-xs text-gray-400">
                          <div className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {formatDate(report.date)}
                          </div>
                          <span>•</span>
                          <span>{report.size}</span>
                          <span>•</span>
                          <span>{report.downloadCount} downloads</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(report.id, report.title)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                );
              })}

              {filteredReports.length === 0 && (
                <div className="text-center py-8">
                  <FileBarChart className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No reports found</h3>
                  <p className="text-gray-500">
                    {searchTerm || filterType !== 'all'
                      ? 'Try adjusting your search or filter criteria.'
                      : 'Generate your first report to get started.'}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ReportsDashboard;
