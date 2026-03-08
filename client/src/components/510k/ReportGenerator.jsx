import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { toast } from '@/hooks/use-toast';
import { useTenantContext } from '@/contexts/TenantContext';
import FDA510kService from '@/services/FDA510kService';
import {
  FileText,
  CheckCircle,
  AlertTriangle,
  FileDown,
  Loader2,
  ArrowRight,
  FileCheck,
  Download,
  Calendar,
  RefreshCw,
} from 'lucide-react';

/**
 * Report Generator for 510(k) submissions
 *
 * This component generates the final 510(k) report and eSTAR documents
 * for submission to the FDA.
 */
const ReportGenerator = ({
  deviceProfile,
  documentId,
  exportTimestamp,
  draftStatus = 'draft',
  setDraftStatus,
  sections,
  onSubmissionReady,
}) => {
  const { currentOrganization } = useTenantContext();
  const orgId = String(currentOrganization?.id || '1');
  const [activeTab, setActiveTab] = useState('preview');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reportData, setReportData] = useState(null);
  const [generatedDocs, setGeneratedDocs] = useState({
    pdf: null,
    eSTAR: null,
    attachments: null,
  });

  // Load any existing report data on mount
  useEffect(() => {
    const loadReportData = async () => {
      if (documentId && deviceProfile?.folderStructure?.reportsFolderId) {
        try {
          // Try to load any existing report data from Document Vault
          const existingReport = await FDA510kService.getLatestReportData(
            deviceProfile.folderStructure,
            documentId
          );

          if (existingReport?.success && existingReport.report) {
            setReportData(existingReport.report);

            // Check if any documents were already generated
            if (existingReport.report.generatedDocuments) {
              setGeneratedDocs(existingReport.report.generatedDocuments);
            }
          }
        } catch (error) {
          console.error('Error loading report data:', error);
        }
      }
    };

    loadReportData();
  }, [documentId, deviceProfile]);

  // Generate final report for 510(k) submission
  const generateReport = async (format = 'PDF') => {
    if (!deviceProfile?.id) {
      toast({
        title: 'Cannot Generate Report',
        description: 'Missing device profile.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    setProgress(10);

    try {
      // Check if we have a submission ID stored
      const submissionId =
        deviceProfile.submissionId || localStorage.getItem(`510k_submission_${deviceProfile.id}`);

      if (!submissionId) {
        // Create a new 510(k) submission if one doesn't exist
        const createResponse = await fetch('/api/medical-device/510k', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-organization-id': orgId,
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          },
          body: JSON.stringify({
            deviceId: deviceProfile.id,
            submissionType: 'Traditional',
            deviceName: deviceProfile.deviceName,
            intendedUse: deviceProfile.intendedUse,
            indicationsForUse: deviceProfile.indicationsForUse,
            predicateDevices: deviceProfile.predicateDevices || [],
            submissionData: {
              administrativeInfo: {
                organizationName: deviceProfile.manufacturer,
                contactPerson: deviceProfile.contactPerson || 'Not specified',
                email: deviceProfile.contactEmail || 'Not specified',
                phone: deviceProfile.contactPhone || 'Not specified',
                address: deviceProfile.manufacturerAddress || 'Not specified',
              },
              deviceDescription: {
                physical: deviceProfile.deviceDescription || '',
                principleOfOperation: deviceProfile.principleOfOperation || '',
                materials: deviceProfile.materials || '',
              },
              performanceData: deviceProfile.performanceData || {},
              biocompatibility: deviceProfile.biocompatibility || {},
              labeling: deviceProfile.labeling || {},
            },
          }),
        });

        if (!createResponse.ok) {
          throw new Error('Failed to create 510(k) submission');
        }

        const { submission } = await createResponse.json();
        localStorage.setItem(`510k_submission_${deviceProfile.id}`, submission.id);
        deviceProfile.submissionId = submission.id;
      }

      setProgress(30);

      // Generate the 510(k) document using the new backend API
      const generateResponse = await fetch(
        `/api/medical-device/510k/${deviceProfile.submissionId}/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-organization-id': orgId,
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          },
          body: JSON.stringify({ format }),
        }
      );

      if (!generateResponse.ok) {
        throw new Error('Failed to generate 510(k) document');
      }

      const generateResult = await generateResponse.json();

      setProgress(70);

      // Store the generated document information
      const newGeneratedDocs = {
        ...generatedDocs,
        [format.toLowerCase()]: {
          url: generateResult.result.path,
          filename: generateResult.result.filename,
          generatedAt: generateResult.result.generatedAt,
          format: format,
          validationStatus: generateResult.result.validationStatus,
        },
      };

      setGeneratedDocs(newGeneratedDocs);

      // Store report data
      const reportData = {
        deviceProfile: deviceProfile,
        generatedDocuments: newGeneratedDocs,
        validationStatus: generateResult.result.validationStatus,
        sections: generateResult.result.sections,
        options: {
          includeESTAR: true,
          includeSummary: true,
          includeAttachments: true,
        },
      };

      setProgress(80);

      setReportData(reportData);

      // Check validation status
      const validation = generateResult.result.validationStatus;
      if (validation && !validation.isComplete) {
        toast({
          title: '510(k) Document Generated with Warnings',
          description: `Document generated but has ${validation.missingItems?.length || 0} missing items and ${validation.warnings?.length || 0} warnings.`,
          variant: 'default',
        });
      } else {
        toast({
          title: '510(k) Document Generated Successfully',
          description: `Your ${format} document has been created and is ready for download.`,
          variant: 'default',
        });
      }

      setProgress(100);

      // Update draft status based on validation
      if (setDraftStatus) {
        setDraftStatus(validation?.isComplete ? 'ready_for_submission' : 'draft');
      }

      // Notify parent component that submission is ready
      if (onSubmissionReady && validation?.isComplete) {
        onSubmissionReady(reportData);
      }
    } catch (error) {
      console.error('Error generating 510(k) report:', error);
      toast({
        title: 'Report Generation Failed',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
      setProgress(100);

      // Reset progress after delay
      setTimeout(() => setProgress(0), 500);
    }
  };

  // Submit 510(k) to FDA
  const submitToFDA = async (isTestSubmission = false) => {
    if (!deviceProfile?.submissionId) {
      toast({
        title: 'Cannot Submit',
        description: 'No 510(k) submission found. Please generate a document first.',
        variant: 'destructive',
      });
      return;
    }

    // Check if eStar document has been generated
    if (!generatedDocs?.estar) {
      toast({
        title: 'eStar Required',
        description: 'Please generate the eStar XML document before submitting to FDA.',
        variant: 'default',
      });
      return;
    }

    try {
      const submitResponse = await fetch(
        `/api/medical-device/510k/${deviceProfile.submissionId}/submit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-organization-id': orgId,
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          },
          body: JSON.stringify({ testSubmission: isTestSubmission }),
        }
      );

      if (!submitResponse.ok) {
        const error = await submitResponse.json();
        throw new Error(error.details || 'Failed to submit to FDA');
      }

      const submitResult = await submitResponse.json();

      toast({
        title: isTestSubmission ? 'Test Submission Successful' : '510(k) Submitted to FDA',
        description: `Tracking Number: ${submitResult.fdaResponse.submissionTrackingNumber}. ${submitResult.fdaResponse.estimatedReviewTime}`,
        variant: 'default',
      });

      // Update submission status
      if (setDraftStatus) {
        setDraftStatus(isTestSubmission ? 'test_submitted' : 'submitted');
      }

      return submitResult;
    } catch (error) {
      console.error('Error submitting to FDA:', error);
      toast({
        title: 'Submission Failed',
        description: error.message || 'Failed to submit 510(k) to FDA',
        variant: 'destructive',
      });
    }
  };

  // Download generated documents
  const downloadDocument = docType => {
    if (!generatedDocs?.[docType]?.url) {
      toast({
        title: 'Document Not Available',
        description: `The ${docType.toUpperCase()} document has not been generated yet.`,
        variant: 'default',
      });
      return;
    }

    // Create a temporary anchor element to trigger download
    const link = document.createElement('a');
    link.href = generatedDocs[docType].url;
    link.setAttribute('download', generatedDocs[docType].filename || `510k-${docType}.pdf`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render the report preview
  const renderReportPreview = () => {
    if (!reportData) {
      return (
        <div className="text-center p-8 space-y-4">
          <FileText className="h-12 w-12 text-blue-500 mx-auto" />
          <h3 className="text-lg font-medium">Generate Report</h3>
          <p className="text-gray-600 mt-2 max-w-md mx-auto">
            Generate your final 510(k) submission package including eSTAR documents and attachments
            for FDA submission.
          </p>
          <div className="flex flex-col gap-3 items-center">
            <Button onClick={() => generateReport('PDF')} disabled={isGenerating} className="mt-4">
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <FileCheck className="mr-2 h-4 w-4" />
                  Generate PDF Document
                </>
              )}
            </Button>
            <div className="flex gap-3">
              <Button
                onClick={() => generateReport('DOCX')}
                disabled={isGenerating}
                variant="outline"
                size="sm"
              >
                Generate DOCX
              </Button>
              <Button
                onClick={() => generateReport('ESTAR')}
                disabled={isGenerating}
                variant="outline"
                size="sm"
              >
                Generate eStar
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <Alert variant="default" className="bg-blue-50 border-blue-200">
          <FileCheck className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-700">510(k) Submission Package</AlertTitle>
          <AlertDescription className="text-blue-600">
            Your 510(k) submission documents have been generated and are ready for review.
          </AlertDescription>
        </Alert>

        <div className="grid md:grid-cols-3 gap-4">
          {/* PDF Report */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center">
                <FileText className="mr-2 h-4 w-4 text-blue-600" />
                510(k) Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-xs text-gray-500">
                Complete 510(k) summary document as required by the FDA.
              </p>
            </CardContent>
            <CardFooter className="pt-2 border-t">
              <Button
                onClick={() => downloadDocument('pdf')}
                size="sm"
                variant="outline"
                className="w-full text-xs"
                disabled={!generatedDocs?.pdf?.url}
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                Download PDF
              </Button>
            </CardFooter>
          </Card>

          {/* eSTAR Package */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center">
                <FileText className="mr-2 h-4 w-4 text-purple-600" />
                eSTAR Package
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-xs text-gray-500">
                Complete eSTAR (electronic Submission Template And Resource) file for FDA
                submission.
              </p>
            </CardContent>
            <CardFooter className="pt-2 border-t">
              <Button
                onClick={() => downloadDocument('eSTAR')}
                size="sm"
                variant="outline"
                className="w-full text-xs"
                disabled={!generatedDocs?.eSTAR?.url}
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                Download eSTAR
              </Button>
            </CardFooter>
          </Card>

          {/* Attachments */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center">
                <FileText className="mr-2 h-4 w-4 text-amber-600" />
                Attachments
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-xs text-gray-500">
                Supporting documentation, test results, and evidence for your submission.
              </p>
            </CardContent>
            <CardFooter className="pt-2 border-t">
              <Button
                onClick={() => downloadDocument('attachments')}
                size="sm"
                variant="outline"
                className="w-full text-xs"
                disabled={!generatedDocs?.attachments?.url}
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                Download ZIP
              </Button>
            </CardFooter>
          </Card>
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="text-md font-medium">Report Sections</h3>

          <Accordion type="multiple" className="border rounded-md">
            {(reportData?.sections || []).map((section, index) => (
              <AccordionItem value={section.key || `section-${index}`} key={index} className="px-4">
                <AccordionTrigger className="text-sm">
                  <div className="flex items-center">
                    <span className="mr-2">{String(section.title || '')}</span>
                    {section.status === 'complete' && (
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                    )}
                    {section.status === 'warning' && (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-xs text-gray-600">
                  {String(section.description || '')}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {reportData.submissionDate && (
          <div className="flex items-center mt-6 text-sm text-gray-600">
            <Calendar className="h-4 w-4 mr-2" />
            <span>Generated on {new Date(reportData.submissionDate).toLocaleDateString()}</span>
          </div>
        )}

        <div className="flex justify-end space-x-4 mt-6">
          <Button variant="outline" onClick={() => generateReport('PDF')} disabled={isGenerating}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Regenerate
          </Button>

          <Button
            variant="primary"
            onClick={() => {
              if (onSubmissionReady) {
                onSubmissionReady(reportData);
              }
            }}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            Complete 510(k) Submission
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  // Render document checklist
  const renderDocumentChecklist = () => {
    return (
      <div className="space-y-6">
        <Alert variant="default" className="bg-blue-50 border-blue-200">
          <CheckCircle className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-700">Submission Checklist</AlertTitle>
          <AlertDescription className="text-blue-600">
            Verify all required documents for your 510(k) submission.
          </AlertDescription>
        </Alert>

        <ScrollArea className="h-[calc(100vh-350px)] pr-4">
          <div className="space-y-6">
            {/* Required Form Components */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Required FDA Forms</CardTitle>
                <CardDescription>
                  Forms that must be included in every 510(k) submission
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { name: 'FDA Form 3514', completed: true },
                    { name: 'Cover Letter', completed: true },
                    { name: 'Indications for Use Form (FDA Form 3881)', completed: true },
                    { name: 'Truthful and Accuracy Statement', completed: true },
                    { name: '510(k) Summary or 510(k) Statement', completed: true },
                    {
                      name: 'Class III Summary and Certification',
                      completed: deviceProfile?.deviceClass !== 'Class III',
                    },
                  ].map((form, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 border-b last:border-b-0"
                    >
                      <span className="text-sm">{form.name}</span>
                      {form.completed ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Device Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Device Information</CardTitle>
                <CardDescription>Technical information about your device</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { name: 'Device Description', completed: true },
                    { name: 'Design Controls', completed: true },
                    { name: 'Substantial Equivalence Discussion', completed: true },
                    { name: 'Proposed Labeling', completed: true },
                    {
                      name: 'Sterilization Information',
                      completed: deviceProfile?.sterilizationMethod !== 'None',
                    },
                    { name: 'Shelf Life', completed: true },
                  ].map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 border-b last:border-b-0"
                    >
                      <span className="text-sm">{item.name}</span>
                      {item.completed ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Performance Testing */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Performance Testing</CardTitle>
                <CardDescription>Test results and performance data</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    {
                      name: 'Biocompatibility',
                      completed: deviceProfile?.biocompatibilityTesting !== 'Not Required',
                    },
                    {
                      name: 'Software Documentation',
                      completed: deviceProfile?.softwareLevel !== 'None',
                    },
                    {
                      name: 'Electromagnetic Compatibility',
                      completed: deviceProfile?.emcTesting !== 'Not Required',
                    },
                    { name: 'Performance Testing - Bench', completed: true },
                    {
                      name: 'Performance Testing - Animal',
                      completed: deviceProfile?.animalTesting === 'Completed',
                    },
                    {
                      name: 'Performance Testing - Clinical',
                      completed: deviceProfile?.clinicalTesting === 'Completed',
                    },
                  ].map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 border-b last:border-b-0"
                    >
                      <span className="text-sm">{item.name}</span>
                      {item.completed ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </div>
    );
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="bg-blue-50 border-b">
        <CardTitle className="text-blue-800 flex items-center">
          <FileText className="mr-2 h-5 w-5 text-blue-600" />
          510(k) Submission Package
        </CardTitle>
        <CardDescription>
          Generate and review your final 510(k) submission package for FDA clearance
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-6">
        <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="preview">Report Preview</TabsTrigger>
            <TabsTrigger value="checklist">Document Checklist</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="space-y-4">
            {renderReportPreview()}
          </TabsContent>

          <TabsContent value="checklist" className="space-y-4">
            {renderDocumentChecklist()}
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="flex justify-between border-t bg-gray-50 px-6 py-4">
        <div className="flex items-center text-sm text-gray-600">
          {isGenerating && (
            <div className="mr-4 flex items-center">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span>Processing...</span>
            </div>
          )}
          {progress > 0 && (
            <div className="w-32">
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </div>
      </CardFooter>
    </Card>
  );
};

export default ReportGenerator;
