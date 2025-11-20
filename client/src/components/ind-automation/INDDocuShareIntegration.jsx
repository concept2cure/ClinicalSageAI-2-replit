import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import EnhancedDocuSharePanel from './EnhancedDocuSharePanel';
import { Badge } from '@/components/ui/badge';
import {
  ArrowUpDown,
  FileText,
  Folder,
  Info,
  Download,
  Upload,
  Sparkles,
  Database,
  BarChart,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { getDocuShareStatus } from '@/services/DocuShareService';

/**
 * INDDocuShareIntegration
 *
 * Enterprise-grade document management interface specifically designed for the IND Module
 * with Microsoft 365-style UI, AI document summarization, and submission management.
 */
export default function INDDocuShareIntegration() {
  const [activeTab, setActiveTab] = useState('document-manager');
  const [submissionStatus, setSubmissionStatus] = useState({
    inProgress: false,
    percentComplete: 0,
    currentStep: '',
    nextStep: '',
  });
  const [stats, setStats] = useState({
    totalDocuments: 0,
    byModule: [],
    byStatus: [],
    recentActivity: [],
  });
  const [connectionStatus, setConnectionStatus] = useState({
    active: false,
    serverId: 'TrialSAGE-DS7',
    timestamp: new Date().toISOString(),
  });
  const [loading, setLoading] = useState(true);

  // Load dashboard data on mount and when active tab changes
  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchDashboardData();
    }
  }, [activeTab]);

  // Fetch dashboard data from the server
  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const data = await getDocuShareStatus();

      // Update connection status
      setConnectionStatus({
        active: data.status?.connectionActive || false,
        serverId: data.status?.serverId || 'TrialSAGE-DS7',
        timestamp: data.status?.timestamp || new Date().toISOString(),
      });

      // Convert statistics to the format expected by the dashboard
      const moduleStats = Object.entries(data.statistics?.byModule || {}).map(([name, count]) => ({
        name,
        count,
        complete: Math.floor(count * 0.8), // Simulate completion status
      }));

      // Generate status breakdown
      const statusBreakdown = [
        { status: 'Approved', count: 0 },
        { status: 'Pending Review', count: 0 },
        { status: 'Rejected', count: 0 },
      ];

      // Format recent activity
      const formattedActivity = (data.recentActivity || []).map(activity => ({
        action:
          activity.action === 'upload'
            ? 'Upload'
            : activity.action === 'download'
              ? 'Download'
              : activity.action === 'delete'
                ? 'Delete'
                : 'View',
        user: activity.user || 'Unknown User',
        document: activity.documentId || 'Unknown Document',
        timestamp: activity.timestamp || new Date().toISOString(),
      }));

      setStats({
        totalDocuments: data.statistics?.totalDocuments || 0,
        byModule:
          moduleStats.length > 0
            ? moduleStats
            : [
                { name: 'Module 1', count: 12, complete: 9 },
                { name: 'Module 2', count: 8, complete: 7 },
                { name: 'Module 3', count: 15, complete: 12 },
                { name: 'Module 4', count: 5, complete: 4 },
                { name: 'Module 5', count: 8, complete: 6 },
              ],
        byStatus: [
          { status: 'Approved', count: 38 },
          { status: 'Pending Review', count: 7 },
          { status: 'Rejected', count: 3 },
        ],
        recentActivity:
          formattedActivity.length > 0
            ? formattedActivity
            : [
                {
                  action: 'Upload',
                  user: 'Michael Chen',
                  document: 'Clinical Study Report 301.pdf',
                  timestamp: '2025-04-25T14:30:00Z',
                },
                {
                  action: 'Approval',
                  user: 'Sarah Johnson',
                  document: 'Module 3 CMC.pdf',
                  timestamp: '2025-04-25T11:15:00Z',
                },
                {
                  action: 'Review',
                  user: 'David Lee',
                  document: 'Protocol Amendment 2.pdf',
                  timestamp: '2025-04-24T16:45:00Z',
                },
                {
                  action: 'Upload',
                  user: 'Jennifer Wilson',
                  document: 'FDA Form 1571.pdf',
                  timestamp: '2025-04-24T09:20:00Z',
                },
              ],
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Start the submission process
  const startSubmissionProcess = () => {
    setSubmissionStatus({
      inProgress: true,
      percentComplete: 0,
      currentStep: 'Validating documents',
      nextStep: 'Assembling eCTD structure',
    });

    // Simulate the submission process
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;

      let currentStep = 'Validating documents';
      let nextStep = 'Assembling eCTD structure';

      if (progress > 20) {
        currentStep = 'Assembling eCTD structure';
        nextStep = 'Generating XML backbone';
      }

      if (progress > 40) {
        currentStep = 'Generating XML backbone';
        nextStep = 'Creating submission package';
      }

      if (progress > 60) {
        currentStep = 'Creating submission package';
        nextStep = 'Validating submission package';
      }

      if (progress > 80) {
        currentStep = 'Validating submission package';
        nextStep = 'Finalizing';
      }

      setSubmissionStatus({
        inProgress: true,
        percentComplete: progress,
        currentStep,
        nextStep,
      });

      if (progress >= 100) {
        clearInterval(interval);
        setSubmissionStatus({
          inProgress: false,
          percentComplete: 100,
          currentStep: 'Submission package ready',
          nextStep: '',
        });
      }
    }, 400);
  };

  // Get appropriate icon for activity
  const getActivityIcon = action => {
    switch (action) {
      case 'Upload':
        return <Upload className="w-4 h-4 text-blue-500" />;
      case 'Approval':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'Review':
        return <FileText className="w-4 h-4 text-amber-500" />;
      case 'Download':
        return <Download className="w-4 h-4 text-purple-500" />;
      case 'AI Analysis':
        return <Sparkles className="w-4 h-4 text-violet-500" />;
      default:
        return <Info className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border shadow-sm">
        <CardHeader className="bg-white border-b pb-3">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-xl text-gray-800">
                IND Document Management System
              </CardTitle>
              <CardDescription className="text-gray-500">
                Manage and organize documents for FDA IND submission
              </CardDescription>
            </div>
            <Badge
              variant={connectionStatus.active ? 'success' : 'secondary'}
              className="px-3 py-1"
            >
              <span
                className={`w-2 h-2 ${connectionStatus.active ? 'bg-green-500' : 'bg-amber-500'} rounded-full inline-block mr-2`}
              ></span>
              {connectionStatus.active ? 'Connected' : 'Limited Connection'} •{' '}
              {connectionStatus.serverId}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Tabs
            defaultValue="document-manager"
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <div className="border-b px-6">
              <TabsList className="bg-transparent h-10">
                <TabsTrigger
                  value="document-manager"
                  className="data-[state=active]:bg-background rounded-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700"
                >
                  Document Manager
                </TabsTrigger>
                <TabsTrigger
                  value="dashboard"
                  className="data-[state=active]:bg-background rounded-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700"
                >
                  Analytics Dashboard
                </TabsTrigger>
                <TabsTrigger
                  value="submission"
                  className="data-[state=active]:bg-background rounded-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700"
                >
                  Submission Manager
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="document-manager" className="mt-0">
              <div className="h-full min-h-[650px]">
                <EnhancedDocuSharePanel />
              </div>
            </TabsContent>

            <TabsContent value="dashboard" className="mt-0 p-6">
              {loading ? (
                <div className="flex justify-center items-center h-64">
                  <div className="flex flex-col items-center">
                    <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full"></div>
                    <p className="mt-4 text-gray-600">Loading analytics...</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center">
                        <Database className="w-4 h-4 mr-2 text-blue-600" />
                        Document Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {stats.byStatus.map((item, i) => (
                          <div key={i} className="flex justify-between items-center">
                            <span className="text-sm">{item.status}</span>
                            <Badge
                              variant={
                                item.status === 'Approved'
                                  ? 'outline'
                                  : item.status === 'Pending Review'
                                    ? 'secondary'
                                    : 'destructive'
                              }
                            >
                              {item.count}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="col-span-1 md:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center">
                        <BarChart className="w-4 h-4 mr-2 text-blue-600" />
                        Module Completion
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {stats.byModule.map((module, i) => (
                          <div key={i} className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium">{module.name}</span>
                              <span className="text-sm text-gray-500">
                                {module.complete} of {module.count} documents
                              </span>
                            </div>
                            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-600 rounded-full"
                                style={{ width: `${(module.complete / module.count) * 100}%` }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="col-span-1 md:col-span-3">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center">
                        <Clock className="w-4 h-4 mr-2 text-blue-600" />
                        Recent Activity
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        {stats.recentActivity.map((activity, i) => (
                          <div
                            key={i}
                            className="flex items-center p-2 hover:bg-gray-50 rounded-md"
                          >
                            {getActivityIcon(activity.action)}

                            <div className="flex-1 ml-2">
                              <div className="flex flex-col sm:flex-row sm:items-baseline">
                                <span className="font-medium text-gray-900">
                                  {activity.document}
                                </span>
                                <span className="sm:ml-2 text-sm text-gray-500">
                                  {activity.action} by {activity.user}
                                </span>
                              </div>
                              <div className="text-xs text-gray-400">
                                {new Date(activity.timestamp).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="submission" className="mt-0 p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="col-span-1 md:col-span-3">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">IND Submission Wizard</CardTitle>
                    <CardDescription>Prepare your IND documents for FDA submission</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {submissionStatus.inProgress ? (
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span>Progress</span>
                              <span>{submissionStatus.percentComplete}%</span>
                            </div>
                            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-600 rounded-full"
                                style={{ width: `${submissionStatus.percentComplete}%` }}
                              ></div>
                            </div>
                          </div>

                          <div className="p-4 bg-gray-50 border rounded-md">
                            <div className="mb-2">
                              <span className="font-medium">Current Step:</span>{' '}
                              {submissionStatus.currentStep}
                            </div>
                            {submissionStatus.nextStep && (
                              <div>
                                <span className="font-medium">Next Step:</span>{' '}
                                {submissionStatus.nextStep}
                              </div>
                            )}
                          </div>

                          {submissionStatus.percentComplete >= 100 && (
                            <div className="flex justify-center">
                              <Button className="w-full md:w-auto">
                                <Download className="mr-2 h-4 w-4" /> Download Submission Package
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2 border p-4 rounded-md">
                              <div className="font-medium flex items-center">
                                <ArrowUpDown className="mr-2 h-4 w-4" />
                                <span>eCTD Sequence Number</span>
                              </div>
                              <input
                                type="text"
                                className="w-full border rounded-md px-3 py-1"
                                placeholder="0000"
                                defaultValue="0001"
                              />
                            </div>

                            <div className="space-y-2 border p-4 rounded-md">
                              <div className="font-medium flex items-center">
                                <Folder className="mr-2 h-4 w-4" />
                                <span>Target Submission Folder</span>
                              </div>
                              <select className="w-full border rounded-md px-3 py-1">
                                <option value="original">Original Submission</option>
                                <option value="amendment">Amendment</option>
                                <option value="response">Response to FDA</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <h3 className="font-medium mb-2">Required Documents</h3>
                            <div className="space-y-2">
                              {[
                                { name: 'FDA Form 1571', status: 'complete' },
                                { name: 'FDA Form 1572', status: 'complete' },
                                { name: 'Investigator Brochure', status: 'complete' },
                                { name: 'Clinical Protocol', status: 'complete' },
                                {
                                  name: 'Chemistry, Manufacturing and Controls',
                                  status: 'warning',
                                },
                                { name: 'Pharmacology/Toxicology', status: 'error' },
                              ].map((doc, i) => (
                                <div
                                  key={i}
                                  className="flex items-center justify-between border-b pb-1"
                                >
                                  <div className="flex items-center">
                                    <FileText className="h-4 w-4 mr-2" />
                                    <span>{doc.name}</span>
                                  </div>
                                  <Badge
                                    variant={
                                      doc.status === 'complete'
                                        ? 'outline'
                                        : doc.status === 'warning'
                                          ? 'secondary'
                                          : 'destructive'
                                    }
                                  >
                                    {doc.status === 'complete'
                                      ? 'Ready'
                                      : doc.status === 'warning'
                                        ? 'Review Needed'
                                        : 'Missing'}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="flex justify-center pt-4">
                            <Button
                              onClick={startSubmissionProcess}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-6"
                            >
                              Prepare Submission Package
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
