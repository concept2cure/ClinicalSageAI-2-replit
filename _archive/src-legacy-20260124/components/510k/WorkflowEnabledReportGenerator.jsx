import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle,
  Download,
  FileText,
  Check,
  Clock,
  RefreshCw,
  FileUp,
  PackageCheck,
  ShieldCheck,
  Gauge,
  CheckSquare,
  AlertTriangle,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

import UnifiedWorkflowPanel from '../unified-workflow/UnifiedWorkflowPanel';
import { registerModuleDocument } from '../unified-workflow/registerModuleDocument';
import FDA510kService from '../../services/FDA510kService';

const REPORT_FORMATS = [
  { value: 'pdf', label: 'PDF (.pdf)' },
  { value: 'docx', label: 'Microsoft Word (.docx)' },
];

const WorkflowEnabledReportGenerator = ({
  organizationId,
  userId,
  deviceData,
  predicateData,
  reportType = '510k',
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState('generator');
  const [reportFormat, setReportFormat] = useState('pdf');
  const [reportTitle, setReportTitle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReportId, setGeneratedReportId] = useState(null);
  const [generatedReportUrl, setGeneratedReportUrl] = useState(null);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [documentRegistered, setDocumentRegistered] = useState(false);
  const [workflowStarted, setWorkflowStarted] = useState(false);
  const [generateESTARPackage, setGenerateESTARPackage] = useState(true);
  const [validateBeforeGeneration, setValidateBeforeGeneration] = useState(true);
  const [estarStatus, setEstarStatus] = useState({
    packageGenerated: false,
    validated: false,
    downloadUrl: null,
    validationIssues: [],
  });

  // Compliance tracking state
  const [complianceData, setComplianceData] = useState(null);
  const [loadingCompliance, setLoadingCompliance] = useState(false);
  const [isProcessingESTAR, setIsProcessingESTAR] = useState(false);

  // Set default report title based on device data
  useEffect(() => {
    if (deviceData?.deviceName) {
      setReportTitle(`510(k) Submission for ${deviceData.deviceName}`);
    }
  }, [deviceData]);

  // Fetch FDA compliance status
  const fetchComplianceStatus = async () => {
    setLoadingCompliance(true);
    try {
      // Call the FDA510kService to get compliance data
      const result = await FDA510kService.getComplianceStatus();

      if (result.success) {
        setComplianceData(result);

        // Show success toast
        toast({
          title: 'Compliance data loaded',
          description: `FDA 510(k) implementation status: ${result.progressSummary.overallPercentage}% complete.`,
        });
      } else {
        toast({
          title: 'Warning',
          description:
            'Could not load compliance data: ' + (result.errorMessage || 'Unknown error'),
          variant: 'warning',
        });
      }
    } catch (error) {
      console.error('Error fetching compliance status:', error);
      toast({
        title: 'Error',
        description: 'Failed to load compliance data: ' + (error.message || 'Unknown error'),
        variant: 'destructive',
      });
    } finally {
      setLoadingCompliance(false);
    }
  };

  // Load compliance data on component mount
  useEffect(() => {
    fetchComplianceStatus();
  }, []);

  // Generate the regulatory report
  const handleGenerateReport = async () => {
    if (!reportTitle.trim()) {
      toast({
        title: 'Report title required',
        description: 'Please provide a title for the report.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsGenerating(true);

      // Make API call to generate the report
      const response = await fetch('/api/module-integration/510k-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId,
          userId,
          deviceData,
          predicateData,
          reportTitle,
          reportFormat,
          additionalNotes,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate report');
      }

      const data = await response.json();

      setGeneratedReportId(data.reportId);
      setGeneratedReportUrl(data.reportUrl);

      toast({
        title: 'Report generated successfully',
        description: 'Your report has been generated and is ready for review.',
      });

      // Register the document in the workflow system
      await registerReportInWorkflow(data.reportId);

      // Switch to the workflow tab
      setActiveTab('workflow');
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: 'Error generating report',
        description: error.message || 'An unexpected error occurred while generating the report.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Register the generated report in the workflow system
  const registerReportInWorkflow = async reportId => {
    try {
      const documentMetadata = {
        title: reportTitle,
        description: `510(k) submission report for ${deviceData?.deviceName || 'Unknown Device'}`,
        documentType: '510k_submission',
        reportId: reportId,
        deviceId: deviceData?.id,
        predicateDeviceId: predicateData?.id,
        format: reportFormat,
        createdAt: new Date().toISOString(),
      };

      const registeredDocument = await registerModuleDocument(
        organizationId,
        userId,
        'medical_device',
        documentMetadata
      );

      setDocumentRegistered(true);

      toast({
        title: 'Document registered',
        description: 'The report has been registered in the workflow system.',
      });

      return registeredDocument;
    } catch (error) {
      console.error('Error registering document in workflow:', error);
      toast({
        title: 'Error registering document',
        description:
          error.message ||
          'An unexpected error occurred while registering the document in the workflow system.',
        variant: 'destructive',
      });
    }
  };

  // Handle workflow actions (from UnifiedWorkflowPanel)
  const handleWorkflowAction = (action, id) => {
    console.log(`Workflow action: ${action} for ID: ${id}`);

    if (action === 'start') {
      setWorkflowStarted(true);
      toast({
        title: 'Workflow started',
        description: 'The document workflow has been started successfully.',
      });

      // If eSTAR package generation is enabled, proceed with integration
      if (generateESTARPackage && generatedReportId) {
        handleESTARIntegration();
      }
    }
  };

  // Handle eSTAR package integration with the workflow
  const handleESTARIntegration = async () => {
    if (!generatedReportId) {
      toast({
        title: 'Error',
        description: 'No report has been generated yet. Please generate a report first.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessingESTAR(true);
    try {
      // Use the FDA510kService to integrate with eSTAR
      const projectId = deviceData?.id || 'default-project-id';

      // First validate the eSTAR package if requested
      let validationResult = null;
      if (validateBeforeGeneration) {
        try {
          validationResult = await FDA510kService.validateESTARPackage(projectId, false);

          // If validation failed with critical errors, show alert but continue unless strict mode
          if (validationResult && !validationResult.valid) {
            const criticalErrors = validationResult.issues.filter(
              issue => issue.severity === 'error'
            ).length;

            toast({
              title: criticalErrors > 0 ? 'eSTAR Validation Failed' : 'eSTAR Validation Warnings',
              description: `Package validated with ${criticalErrors} critical issues and ${validationResult.issues.length - criticalErrors} warnings.`,
              variant: criticalErrors > 0 ? 'destructive' : 'warning',
            });

            if (criticalErrors > 0) {
              // Store validation issues but don't abort
              setEstarStatus({
                ...estarStatus,
                validated: true,
                validationIssues: validationResult.issues || [],
              });
            }
          }
        } catch (validationError) {
          console.warn('Validation error, but continuing with integration:', validationError);
        }
      }

      // Now proceed with integration
      const result = await FDA510kService.integrateWithESTAR(generatedReportId, projectId, {
        validateFirst: validateBeforeGeneration,
        strictValidation: false, // Default to non-strict validation
      });

      // Update eSTAR status
      setEstarStatus({
        packageGenerated: result.packageGenerated || false,
        validated: result.validated || false,
        downloadUrl: result.downloadUrl || null,
        validationIssues: result.validationResult?.issues || [],
      });

      // Show appropriate toast message
      if (result.success) {
        toast({
          title: 'eSTAR Package Generated',
          description:
            'FDA-compliant eSTAR package has been successfully generated and integrated with the workflow.',
        });
      } else if (result.validated && result.validationResult && !result.validationResult.valid) {
        toast({
          title: 'eSTAR Integration Issues',
          description:
            'The eSTAR package was generated but has compliance issues that should be addressed.',
          variant: 'warning',
        });
      } else {
        toast({
          title: 'eSTAR Integration Error',
          description: result.message || 'An error occurred during eSTAR integration.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error in eSTAR integration:', error);
      toast({
        title: 'eSTAR Integration Error',
        description: error.message || 'An unexpected error occurred during eSTAR integration.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessingESTAR(false);
    }
  };

  return (
    <div className={className}>
      <Card className="shadow-md border-0 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 text-white">
          <h3 className="text-lg font-medium flex items-center">
            <FileText className="h-5 w-5 mr-2" />
            FDA 510(k) eSTAR Generator
          </h3>
          <p className="text-blue-100 text-sm mt-1">
            Step 4: Generate FDA-compliant 510(k) eSTAR packages for regulatory submission
          </p>
        </div>

        <CardContent className="p-6 bg-white">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-blue-50 p-1">
              <TabsTrigger value="generator" className="data-[state=active]:bg-white">
                <FileText className="h-4 w-4 mr-2" />
                eSTAR Configuration
              </TabsTrigger>
              <TabsTrigger
                value="workflow"
                disabled={!generatedReportId}
                className="data-[state=active]:bg-white"
              >
                <Clock className="h-4 w-4 mr-2" />
                FDA Submission Workflow
              </TabsTrigger>
            </TabsList>

            <TabsContent value="generator" className="py-4">
              <div className="space-y-6">
                <Alert className="bg-blue-50 border-blue-200">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertTitle className="text-blue-700">FDA Compliance Note</AlertTitle>
                  <AlertDescription className="text-blue-600">
                    This generator creates FDA-compliant 510(k) documentation following the latest
                    regulatory guidelines.
                  </AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="report-title">Report Title</Label>
                    <Input
                      id="report-title"
                      placeholder="Enter report title"
                      value={reportTitle}
                      onChange={e => setReportTitle(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="report-format">Report Format</Label>
                    <Select value={reportFormat} onValueChange={setReportFormat}>
                      <SelectTrigger id="report-format">
                        <SelectValue placeholder="Select format" />
                      </SelectTrigger>
                      <SelectContent>
                        {REPORT_FORMATS.map(format => (
                          <SelectItem key={format.value} value={format.value}>
                            {format.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="additional-notes">Additional Notes</Label>
                    <Textarea
                      id="additional-notes"
                      placeholder="Enter any additional notes for the report"
                      value={additionalNotes}
                      onChange={e => setAdditionalNotes(e.target.value)}
                      className="min-h-[100px]"
                    />
                  </div>

                  <div className="bg-muted p-4 rounded-md">
                    <h3 className="font-medium mb-2">Device Information</h3>
                    <div className="text-sm">
                      <p>
                        <span className="font-medium">Device Name:</span>{' '}
                        {deviceData?.deviceName || 'Not specified'}
                      </p>
                      <p>
                        <span className="font-medium">Device Class:</span>{' '}
                        {deviceData?.deviceClass || 'Not specified'}
                      </p>
                      <p>
                        <span className="font-medium">Manufacturer:</span>{' '}
                        {deviceData?.manufacturer || 'Not specified'}
                      </p>
                    </div>

                    <Separator className="my-3" />

                    <h3 className="font-medium mb-2">Predicate Device</h3>
                    <div className="text-sm">
                      <p>
                        <span className="font-medium">Predicate Name:</span>{' '}
                        {predicateData?.deviceName || 'Not specified'}
                      </p>
                      <p>
                        <span className="font-medium">Predicate 510(k) Number:</span>{' '}
                        {predicateData?.k510Number || 'Not specified'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-md border border-blue-200 mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <PackageCheck className="h-5 w-5 text-blue-600" />
                      <h3 className="font-medium text-blue-800">FDA eSTAR Package Configuration</h3>
                    </div>

                    <div className="mb-3">
                      <p className="text-blue-800 text-sm">
                        <strong>Step 2:</strong> Configure and generate an FDA-compliant eSTAR
                        (electronic Submission Template And Resource) package for your 510(k)
                        submission.
                      </p>
                      <p className="text-blue-700 text-sm mt-2">
                        The eSTAR system is the FDA's preferred format for 510(k) submissions and
                        ensures your application follows all current regulatory requirements.
                      </p>
                    </div>

                    <div className="space-y-4 mt-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="generate-estar" className="text-sm font-medium">
                            Enable eSTAR Generation
                          </Label>
                          <p className="text-xs text-blue-700">
                            Automatically generate an FDA-compliant eSTAR package during the
                            workflow
                          </p>
                        </div>
                        <Switch
                          id="generate-estar"
                          checked={generateESTARPackage}
                          onCheckedChange={setGenerateESTARPackage}
                        />
                      </div>

                      {generateESTARPackage && (
                        <div className="flex items-center justify-between pl-4 border-l-2 border-blue-300 ml-2 py-3">
                          <div className="space-y-0.5">
                            <Label
                              htmlFor="validate-estar"
                              className="text-sm font-medium flex items-center"
                            >
                              <CheckSquare className="h-4 w-4 mr-1 text-blue-600" />
                              Pre-Validate Package
                            </Label>
                            <p className="text-xs text-blue-700">
                              Automatically validate against FDA requirements before generating the
                              eSTAR package (recommended)
                            </p>
                          </div>
                          <Switch
                            id="validate-estar"
                            checked={validateBeforeGeneration}
                            onCheckedChange={setValidateBeforeGeneration}
                          />
                        </div>
                      )}

                      {estarStatus.packageGenerated && (
                        <div className="mt-3 pt-3 border-t border-slate-200">
                          <div className="flex items-center gap-2 text-sm text-green-700">
                            <Check className="h-4 w-4" />
                            <span>eSTAR package successfully generated</span>
                          </div>
                          {estarStatus.downloadUrl && (
                            <Button variant="outline" size="sm" className="mt-2" asChild>
                              <a
                                href={estarStatus.downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Download className="h-4 w-4 mr-1" /> Download eSTAR Package
                              </a>
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* FDA Compliance Status */}
                  <div className="bg-slate-50 p-4 rounded-md border border-slate-200 mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldCheck className="h-5 w-5 text-green-600" />
                      <h3 className="font-medium">FDA Compliance Status</h3>
                      {!loadingCompliance && complianceData && (
                        <Badge className="ml-auto" variant="outline">
                          {complianceData.progressSummary.overallPercentage}% Complete
                        </Badge>
                      )}
                    </div>

                    {loadingCompliance ? (
                      <div className="text-center py-4">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Loading compliance data...</p>
                      </div>
                    ) : complianceData ? (
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <Label className="text-sm">Implementation Progress</Label>
                            <span className="text-xs font-medium">
                              {complianceData.progressSummary.steps.percentage}%
                            </span>
                          </div>
                          <Progress
                            value={complianceData.progressSummary.steps.percentage}
                            className="h-2"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            {complianceData.progressSummary.steps.completed} of{' '}
                            {complianceData.progressSummary.steps.total} implementation steps
                            completed
                          </p>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <Label className="text-sm">Validation Rules</Label>
                            <span className="text-xs font-medium">
                              {complianceData.progressSummary.validationRules.percentage}%
                            </span>
                          </div>
                          <Progress
                            value={complianceData.progressSummary.validationRules.percentage}
                            className="h-2"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            {complianceData.progressSummary.validationRules.implemented} of{' '}
                            {complianceData.progressSummary.validationRules.total} validation rules
                            implemented
                          </p>
                        </div>

                        {complianceData.nextSteps && complianceData.nextSteps.length > 0 && (
                          <div className="mt-3">
                            <Label className="text-sm mb-2 block">Next Steps</Label>
                            <ul className="space-y-1">
                              {complianceData.nextSteps.map(step => (
                                <li key={step.id} className="text-xs flex items-start gap-2">
                                  <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                                  <span>
                                    {step.title}: {step.description}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="flex justify-end">
                          <Button variant="ghost" size="sm" onClick={fetchComplianceStatus}>
                            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <AlertCircle className="h-5 w-5 mx-auto mb-2 text-amber-500" />
                        <p className="text-sm text-muted-foreground">
                          Could not load compliance data
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2"
                          onClick={fetchComplianceStatus}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" /> Retry
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="workflow" className="py-4">
              {generatedReportId ? (
                <>
                  <div className="bg-blue-50 p-3 rounded-md mb-4 border border-blue-100">
                    <div className="flex items-start">
                      <div className="flex-grow">
                        <h3 className="text-sm font-medium flex items-center">
                          <PackageCheck className="h-4 w-4 mr-2 text-blue-600" />
                          FDA eSTAR Package Generation
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          Generate an FDA-compliant eSTAR package for this 510(k) submission
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <Button
                          size="sm"
                          variant={estarStatus.packageGenerated ? 'outline' : 'default'}
                          onClick={handleESTARIntegration}
                          disabled={isProcessingESTAR || !workflowStarted}
                        >
                          {isProcessingESTAR ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              Processing...
                            </>
                          ) : estarStatus.packageGenerated ? (
                            <>
                              <Check className="h-3.5 w-3.5 mr-1.5" />
                              Package Generated
                            </>
                          ) : (
                            <>
                              <FileUp className="h-3.5 w-3.5 mr-1.5" />
                              Generate eSTAR Package
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {estarStatus.packageGenerated && estarStatus.downloadUrl && (
                      <div className="mt-2 pt-2 border-t border-blue-100 text-sm">
                        <a
                          href={estarStatus.downloadUrl}
                          className="text-blue-600 hover:underline flex items-center"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Download className="h-3.5 w-3.5 mr-1" />
                          Download eSTAR Package
                        </a>
                      </div>
                    )}

                    {estarStatus.validationIssues.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-blue-100">
                        <p className="text-sm text-red-600 font-medium">Validation Issues:</p>
                        <ul className="text-xs text-red-600 mt-1 list-disc list-inside">
                          {estarStatus.validationIssues.slice(0, 3).map((issue, idx) => (
                            <li key={idx}>{issue.message || issue}</li>
                          ))}
                          {estarStatus.validationIssues.length > 3 && (
                            <li>...and {estarStatus.validationIssues.length - 3} more issues</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>

                  <UnifiedWorkflowPanel
                    organizationId={organizationId}
                    userId={userId}
                    moduleType="medical_device"
                    documentData={{
                      id: generatedReportId,
                      title: reportTitle,
                    }}
                    onWorkflowUpdated={handleWorkflowAction}
                  />
                </>
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No Report Generated</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Generate a report first to manage its regulatory workflow.
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className={activeTab === 'generator' ? 'flex justify-between' : 'hidden'}>
          <div className="flex items-center">
            {generatedReportUrl && (
              <Button variant="outline" size="sm" className="mr-2" asChild>
                <a href={generatedReportUrl} target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4 mr-1" /> Download Report
                </a>
              </Button>
            )}
          </div>
          <Button onClick={handleGenerateReport} disabled={isGenerating || !reportTitle.trim()}>
            {isGenerating ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : generatedReportId ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate Report
              </>
            ) : (
              <>
                <FileUp className="h-4 w-4 mr-2" />
                Generate Report
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default WorkflowEnabledReportGenerator;
