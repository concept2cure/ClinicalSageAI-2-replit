import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, AlertCircle, Clock, FileText, Download, Share2 } from 'lucide-react';

const workflowSteps = [
  { id: 'dataPreparation', name: 'Data Preparation', icon: <FileText size={16} /> },
  {
    id: 'aiAnalysis',
    name: 'AI Analysis',
    icon: <i className="fas fa-brain" style={{ fontSize: '14px' }} />,
  },
  {
    id: 'sectionGeneration',
    name: 'Section Generation',
    icon: <i className="fas fa-file-alt" style={{ fontSize: '14px' }} />,
  },
  { id: 'qualityCheck', name: 'Quality Check', icon: <Check size={16} /> },
  {
    id: 'finalCompilation',
    name: 'Final Compilation',
    icon: <i className="fas fa-file-pdf" style={{ fontSize: '14px' }} />,
  },
];

// Simulated AI metrics
const aiMetrics = {
  confidenceScore: 0.92,
  completionRate: 0.96,
  regulatoryCompliance: 0.89,
  citationCount: 47,
  wordCount: 28506,
  sectionCount: 14,
  processingTime: '3m 42s',
  modelVersion: 'GPT-4o',
};

const CerProgressDashboard = ({ report }) => {
  const [currentReport, setCurrentReport] = useState(
    report || {
      id: 'CER20250501001',
      title: 'CardioMonitor Pro 3000 - EU MDR Clinical Evaluation',
      status: 'processing',
      deviceName: 'CardioMonitor Pro 3000',
      deviceType: 'Patient Monitoring Device',
      manufacturer: 'MedTech Innovations, Inc.',
      templateUsed: 'EU MDR 2017/745 Full Template',
      generatedAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      workflow: {
        status: 'processing',
        progress: 65,
        currentStep: 'sectionGeneration',
        steps: [
          {
            id: 'dataPreparation',
            name: 'Data Preparation',
            status: 'completed',
            completedAt: new Date(Date.now() - 180000).toISOString(),
          },
          {
            id: 'aiAnalysis',
            name: 'AI Analysis',
            status: 'completed',
            completedAt: new Date(Date.now() - 120000).toISOString(),
          },
          {
            id: 'sectionGeneration',
            name: 'Section Generation',
            status: 'processing',
            startedAt: new Date(Date.now() - 60000).toISOString(),
          },
          { id: 'qualityCheck', name: 'Quality Check', status: 'pending' },
          { id: 'finalCompilation', name: 'Final Compilation', status: 'pending' },
        ],
      },
    }
  );

  // Simulate progress updates for the demo
  useEffect(() => {
    if (currentReport.status === 'processing' || currentReport.workflow?.status === 'processing') {
      const timer = setInterval(() => {
        setCurrentReport(prev => {
          const newProgress = Math.min(100, (prev.workflow?.progress || 0) + 5);
          let currentStepIndex = workflowSteps.findIndex(
            step => step.id === prev.workflow?.currentStep
          );
          let newCurrentStep = prev.workflow?.currentStep;
          let newSteps = [...(prev.workflow?.steps || [])];

          // Update step status based on progress
          if (newProgress >= 75 && currentStepIndex < 2) {
            newCurrentStep = 'sectionGeneration';
            newSteps = newSteps.map(step => {
              if (step.id === 'aiAnalysis') {
                return { ...step, status: 'completed', completedAt: new Date().toISOString() };
              } else if (step.id === 'sectionGeneration') {
                return { ...step, status: 'processing', startedAt: new Date().toISOString() };
              }
              return step;
            });
          } else if (newProgress >= 85 && currentStepIndex < 3) {
            newCurrentStep = 'qualityCheck';
            newSteps = newSteps.map(step => {
              if (step.id === 'sectionGeneration') {
                return { ...step, status: 'completed', completedAt: new Date().toISOString() };
              } else if (step.id === 'qualityCheck') {
                return { ...step, status: 'processing', startedAt: new Date().toISOString() };
              }
              return step;
            });
          } else if (newProgress >= 95 && currentStepIndex < 4) {
            newCurrentStep = 'finalCompilation';
            newSteps = newSteps.map(step => {
              if (step.id === 'qualityCheck') {
                return { ...step, status: 'completed', completedAt: new Date().toISOString() };
              } else if (step.id === 'finalCompilation') {
                return { ...step, status: 'processing', startedAt: new Date().toISOString() };
              }
              return step;
            });
          } else if (newProgress >= 100) {
            newSteps = newSteps.map(step => {
              if (step.id === 'finalCompilation') {
                return { ...step, status: 'completed', completedAt: new Date().toISOString() };
              }
              return step;
            });
          }

          const newStatus = newProgress >= 100 ? 'completed' : 'processing';
          const newWorkflowStatus = newProgress >= 100 ? 'completed' : 'processing';

          return {
            ...prev,
            status: newStatus,
            workflow: {
              ...prev.workflow,
              status: newWorkflowStatus,
              progress: newProgress,
              currentStep: newCurrentStep,
              steps: newSteps,
            },
          };
        });
      }, 3000); // Update every 3 seconds

      return () => clearInterval(timer);
    }
  }, [currentReport.status, currentReport.workflow?.status]);

  // Determine status color
  const getStatusColor = status => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'processing':
        return 'bg-blue-500';
      case 'failed':
        return 'bg-red-500';
      case 'pending':
        return 'bg-gray-300';
      default:
        return 'bg-gray-300';
    }
  };

  const getStatusBadge = status => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500">Completed</Badge>;
      case 'processing':
        return <Badge className="bg-blue-500">Processing</Badge>;
      case 'failed':
        return <Badge className="bg-red-500">Failed</Badge>;
      case 'draft':
        return <Badge className="bg-gray-500">Draft</Badge>;
      case 'final':
        return <Badge className="bg-purple-500">Final</Badge>;
      default:
        return <Badge className="bg-gray-300">Pending</Badge>;
    }
  };

  // Format date
  const formatDate = dateString => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">{currentReport.title}</h1>
          <div className="flex items-center space-x-2">
            {getStatusBadge(currentReport.status)}
            <span className="text-sm text-gray-500">
              Last updated: {formatDate(currentReport.lastModified)}
            </span>
          </div>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm" disabled={currentReport.status !== 'completed'}>
            <Download className="h-4 w-4 mr-2" /> Download
          </Button>
          <Button variant="outline" size="sm">
            <Share2 className="h-4 w-4 mr-2" /> Share
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CER Generation Progress</CardTitle>
          <CardDescription>AI-assisted document generation status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium">Generation progress</span>
              <span className="text-sm font-medium">{currentReport.workflow?.progress || 0}%</span>
            </div>
            <Progress value={currentReport.workflow?.progress || 0} className="h-2" />
          </div>

          <div className="space-y-4">
            {currentReport.workflow?.steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center mr-4 ${getStatusColor(step.status)}`}
                >
                  {step.status === 'completed' ? (
                    <Check className="h-5 w-5 text-white" />
                  ) : step.status === 'processing' ? (
                    <Clock className="h-5 w-5 text-white animate-pulse" />
                  ) : step.status === 'failed' ? (
                    <AlertCircle className="h-5 w-5 text-white" />
                  ) : (
                    <span className="text-white font-bold">{index + 1}</span>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="font-medium">{step.name}</span>
                      {step.status === 'processing' && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full animate-pulse">
                          in progress
                        </span>
                      )}
                    </div>
                    {step.completedAt && (
                      <span className="text-xs text-gray-500">
                        Completed at {new Date(step.completedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  {step.status === 'processing' && (
                    <div className="mt-1">
                      <Progress value={Math.random() * 100} className="h-1" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="text-sm text-gray-500">
            {currentReport.status === 'completed'
              ? 'Report generation completed successfully'
              : currentReport.status === 'processing'
                ? 'Estimated completion time: 2 minutes'
                : 'Waiting to start processing'}
          </div>
        </CardFooter>
      </Card>

      <Tabs defaultValue="metrics">
        <TabsList>
          <TabsTrigger value="metrics">AI Metrics</TabsTrigger>
          <TabsTrigger value="details">Report Details</TabsTrigger>
          <TabsTrigger value="compliance">Regulatory Compliance</TabsTrigger>
        </TabsList>
        <TabsContent value="metrics">
          <Card>
            <CardHeader>
              <CardTitle>AI Processing Metrics</CardTitle>
              <CardDescription>
                Performance and quality metrics for the AI-generated report
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">Confidence Score</p>
                  <p className="text-2xl font-bold">{aiMetrics.confidenceScore * 100}%</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">Completion Rate</p>
                  <p className="text-2xl font-bold">{aiMetrics.completionRate * 100}%</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">Regulatory Compliance</p>
                  <p className="text-2xl font-bold">{aiMetrics.regulatoryCompliance * 100}%</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">Citations</p>
                  <p className="text-2xl font-bold">{aiMetrics.citationCount}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">Word Count</p>
                  <p className="text-2xl font-bold">{aiMetrics.wordCount.toLocaleString()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">Sections</p>
                  <p className="text-2xl font-bold">{aiMetrics.sectionCount}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">Processing Time</p>
                  <p className="text-2xl font-bold">{aiMetrics.processingTime}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">AI Model</p>
                  <p className="text-2xl font-bold">{aiMetrics.modelVersion}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>Report Details</CardTitle>
              <CardDescription>Information about the generated report</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Device Name</h3>
                    <p className="text-base">{currentReport.deviceName}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Device Type</h3>
                    <p className="text-base">{currentReport.deviceType}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Manufacturer</h3>
                    <p className="text-base">{currentReport.manufacturer}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Template Used</h3>
                    <p className="text-base">{currentReport.templateUsed}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Generated At</h3>
                    <p className="text-base">{formatDate(currentReport.generatedAt)}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Report ID</h3>
                    <p className="text-base">{currentReport.id}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="compliance">
          <Card>
            <CardHeader>
              <CardTitle>Regulatory Compliance Check</CardTitle>
              <CardDescription>EU MDR 2017/745 compliance verification</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center">
                    <Check className="h-5 w-5 text-green-500 mr-2" />
                    <span>Device Classification Requirements</span>
                  </div>
                  <Badge className="bg-green-500">Passed</Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center">
                    <Check className="h-5 w-5 text-green-500 mr-2" />
                    <span>Clinical Data Requirements</span>
                  </div>
                  <Badge className="bg-green-500">Passed</Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center">
                    <Check className="h-5 w-5 text-green-500 mr-2" />
                    <span>Post-Market Surveillance Requirements</span>
                  </div>
                  <Badge className="bg-green-500">Passed</Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                  <div className="flex items-center">
                    <AlertCircle className="h-5 w-5 text-yellow-500 mr-2" />
                    <span>Risk Management Documentation</span>
                  </div>
                  <Badge className="bg-yellow-500">Needs Review</Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center">
                    <Check className="h-5 w-5 text-green-500 mr-2" />
                    <span>State of the Art Analysis</span>
                  </div>
                  <Badge className="bg-green-500">Passed</Badge>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <div className="text-sm text-gray-500">
                Overall compliance score: <span className="font-bold text-green-600">94%</span>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CerProgressDashboard;
