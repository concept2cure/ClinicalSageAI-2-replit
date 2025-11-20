import React, { useState } from 'react';
import { BarChart, FileBarChart, PieChart, RefreshCw, Download } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

/**
 * ReportsQuickWidget Component
 *
 * Provides a quick interface for accessing and generating reports across all modules.
 * This component is designed to be GLOBALLY CONNECTED to all other modules.
 */
const ReportsQuickWidget = ({ clientId }) => {
  const [reportType, setReportType] = useState('regulatory');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Mock recent reports that would come from API
  const recentReports = [
    {
      id: 'report-1',
      title: 'BTX-112 IND Readiness',
      type: 'regulatory',
      date: '2025-05-08T14:30:00Z',
      status: 'complete',
    },
    {
      id: 'report-2',
      title: 'CMC Documentation Quality',
      type: 'quality',
      date: '2025-05-05T09:15:00Z',
      status: 'complete',
    },
    {
      id: 'report-3',
      title: 'Clinical Trial Enrollment Trends',
      type: 'clinical',
      date: '2025-05-01T11:45:00Z',
      status: 'complete',
    },
  ];

  // Mock available reports
  const availableReports = {
    regulatory: [
      { id: 'reg-1', name: 'Submission Status Report' },
      { id: 'reg-2', name: 'Regulatory Timeline Analysis' },
      { id: 'reg-3', name: 'Compliance Status Report' },
    ],
    quality: [
      { id: 'qual-1', name: 'Document Quality Assessment' },
      { id: 'qual-2', name: 'SOP Adherence Report' },
      { id: 'qual-3', name: 'Risk Management Analysis' },
    ],
    clinical: [
      { id: 'clin-1', name: 'Trial Enrollment Report' },
      { id: 'clin-2', name: 'Protocol Adherence Analysis' },
      { id: 'clin-3', name: 'Adverse Event Summary' },
    ],
    cmc: [
      { id: 'cmc-1', name: 'Stability Data Report' },
      { id: 'cmc-2', name: 'Manufacturing Batch Analysis' },
      { id: 'cmc-3', name: 'Analytical Method Performance' },
    ],
  };

  // Format dates for display
  const formatDate = dateString => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Simulate generating a report
  const handleGenerateReport = () => {
    setLoading(true);

    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      // Show success notification
      toast({
        title: 'Report Generated Successfully',
        description: 'Your report has been generated and is ready for download.',
        variant: 'default',
      });
      console.log('Report generated successfully');
    }, 1500);
  };

  // Navigate to reports dashboard
  const handleViewDashboard = () => {
    setLocation('/reports-dashboard');
  };

  return (
    <Card className="border-pink-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <BarChart className="h-5 w-5 mr-2 text-pink-600" />
            <CardTitle className="text-lg font-medium">Reports Module</CardTitle>
          </div>
          <Badge className="bg-pink-100 text-pink-800 hover:bg-pink-200">Global</Badge>
        </div>
        <CardDescription className="text-gray-600">
          Generate reports across all modules
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="space-y-4">
          {/* Report Generator */}
          <div className="bg-pink-50 p-3 rounded-lg border border-pink-100">
            <h3 className="text-sm font-medium text-pink-800 mb-2">Quick Report Generator</h3>
            <div className="space-y-3">
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="w-full bg-white border-pink-200">
                  <SelectValue placeholder="Select report category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regulatory">Regulatory Reports</SelectItem>
                  <SelectItem value="quality">Quality Reports</SelectItem>
                  <SelectItem value="clinical">Clinical Reports</SelectItem>
                  <SelectItem value="cmc">CMC Reports</SelectItem>
                </SelectContent>
              </Select>

              <Select>
                <SelectTrigger className="w-full bg-white border-pink-200">
                  <SelectValue placeholder="Select specific report" />
                </SelectTrigger>
                <SelectContent>
                  {availableReports[reportType].map(report => (
                    <SelectItem key={report.id} value={report.id}>
                      {report.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                className="w-full bg-pink-600 hover:bg-pink-700"
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
                    Generate Report
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Recent Reports */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Recent Reports</h3>
            <div className="space-y-2">
              {recentReports.map(report => (
                <div
                  key={report.id}
                  className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md"
                >
                  <div className="flex items-center">
                    {report.type === 'regulatory' ? (
                      <div className="bg-blue-100 p-1.5 rounded-md mr-2">
                        <BarChart className="h-3.5 w-3.5 text-blue-600" />
                      </div>
                    ) : report.type === 'quality' ? (
                      <div className="bg-green-100 p-1.5 rounded-md mr-2">
                        <PieChart className="h-3.5 w-3.5 text-green-600" />
                      </div>
                    ) : (
                      <div className="bg-purple-100 p-1.5 rounded-md mr-2">
                        <FileBarChart className="h-3.5 w-3.5 text-purple-600" />
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-medium">{report.title}</p>
                      <p className="text-xs text-gray-500">{formatDate(report.date)}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Download className="h-3.5 w-3.5 text-gray-500" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-0">
        <Button
          variant="outline"
          className="w-full mt-2 border-pink-200 text-pink-700 hover:bg-pink-50"
          size="sm"
          onClick={handleViewDashboard}
        >
          View Reports Dashboard
        </Button>
      </CardFooter>
    </Card>
  );
};

export default ReportsQuickWidget;
