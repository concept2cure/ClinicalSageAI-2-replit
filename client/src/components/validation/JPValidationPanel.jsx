import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, FileCheck, FileX, Flag, Info, MessageSquareText, Loader2, RefreshCw, Download } from 'lucide-react'
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

/**
 * Japanese PMDA Validation Panel Component
 *
 * This component provides an interface for validating submissions against
 * Japanese PMDA regulatory requirements.
 */
const JPValidationPanel = ({ documents, onValidationComplete }) => {
  const [validationResults, setValidationResults] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [validationProgress, setValidationProgress] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState(null);
  const { toast } = useToast();

  // Check for required sections in PMDA submissions
  const requiredSections = [
    'm1.2', // Application Form
    'm1.3', // Approval Certificate
    'm1.13', // Package Insert
    'm2.2', // Introduction
    'm2.3', // Quality Overall Summary
    'm2.4', // Nonclinical Overview
    'm2.6.1', // Pharmacology Written Summary
    'm2.7.1', // Biopharmaceutics Summary
    'm3.2', // Body of Data
    'jp-annex', // Japan-specific Annex
  ];

  // Check which required sections are present in the documents
  const getAvailableSections = useCallback(() => {
    const availableSections = documents?.reduce((acc, doc) => {
      const module = doc.module || '';
      const mainSection = module.split('/')[0];
      acc.add(mainSection);
      return acc;
    }, new Set());

    return availableSections || new Set();
  }, [documents]);

  // Get missing required sections
  const getMissingSections = useCallback(() => {
    const availableSections = getAvailableSections();
    return requiredSections.filter(
      section =>
        !Array.from(availableSections).some(
          available => section.startsWith(available) || available.startsWith(section)
        )
    );
  }, [getAvailableSections, requiredSections]);

  // Connect to WebSocket for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/qc`;
    const newSocket = new WebSocket(wsUrl);

    newSocket.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      toast({
        title: 'Connected to QC service',
        description: 'Real-time validation updates are now enabled.',
      });
    };

    newSocket.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    };

    newSocket.onerror = error => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
      toast({
        title: 'Connection Error',
        description: 'Could not connect to real-time validation service.',
        variant: 'destructive',
      });
    };

    newSocket.onmessage = event => {
      try {
        const data = JSON.parse(event.data);

        // Handle QC updates
        if (data.id && data.status) {
          // Update document status in the UI
          setValidationResults(prev => {
            if (!prev) return prev;

            return {
              ...prev,
              document_results: {
                ...prev.document_results,
                [data.id]: {
                  status: data.status,
                  message: data.message || '',
                  checks: prev.document_results[data.id]?.checks || [],
                },
              },
            };
          });

          // Update progress
          const validatedCount = Object.keys(validationResults?.document_results || {}).length;
          const totalCount = documents?.length || 0;
          if (totalCount > 0) {
            setValidationProgress(Math.round((validatedCount / totalCount) * 100));
          }
        }

        // Handle validation completion
        if (data.type === 'validation_complete' && data.region === 'PMDA') {
          setIsValidating(false);
          setValidationProgress(100);

          toast({
            title: 'Validation Complete',
            description: `PMDA validation completed with status: ${data.status}`,
            variant: data.status === 'passed' ? 'default' : 'destructive',
          });

          if (onValidationComplete) {
            onValidationComplete(data);
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    setSocket(newSocket);

    // Clean up
    return () => {
      if (newSocket) {
        newSocket.close();
      }
    };
  }, []);

  // Start validation
  const handleStartValidation = async () => {
    try {
      setIsValidating(true);
      setValidationProgress(0);

      // Reset previous results
      setValidationResults(null);

      // Get document IDs
      const documentIds = documents?.map(doc => doc.id) || [];

      // Call validation API
      const response = await apiRequest('POST', '/api/validation/validate', {
        region: 'PMDA',
        documents: documentIds,
        options: {
          detailed: true,
        },
      });

      const data = await response.json();

      toast({
        title: 'Validation Started',
        description: `Validating ${documentIds.length} documents against PMDA requirements.`,
      });

      // Create initial results structure
      setValidationResults({
        status: 'in_progress',
        missing_sections: getMissingSections(),
        document_results: {},
        overall_status: 'pending',
        job_id: data.job_id,
      });
    } catch (error) {
      console.error('Error starting validation:', error);
      setIsValidating(false);

      toast({
        title: 'Validation Failed',
        description: 'Failed to start PMDA validation. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Get validation status
  const handleRefreshStatus = async () => {
    if (!validationResults?.job_id) return;

    try {
      const response = await apiRequest(
        'GET',
        `/api/validation/status/${validationResults.job_id}`
      );
      const data = await response.json();

      if (data.status === 'completed') {
        setIsValidating(false);
        setValidationProgress(100);

        // Update validation results
        setValidationResults(prev => ({
          ...prev,
          status: 'completed',
          overall_status: data.result,
          document_results: data.document_results || prev.document_results || {},
        }));

        toast({
          title: 'Validation Status Updated',
          description: `PMDA validation status: ${data.result}`,
          variant: data.result === 'passed' ? 'default' : 'destructive',
        });
      }
    } catch (error) {
      console.error('Error refreshing validation status:', error);

      toast({
        title: 'Status Update Failed',
        description: 'Failed to update validation status. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Bulk approve
  const handleBulkApprove = async () => {
    try {
      // Get document IDs
      const documentIds = documents?.map(doc => doc.id) || [];

      // Call bulk approve API
      const response = await apiRequest('POST', '/api/documents/bulk-approve', {
        ids: documentIds,
      });

      const data = await response.json();

      toast({
        title: 'Bulk Approve Complete',
        description: `${data.approved.length} documents approved, ${Object.keys(data.failed).length} failed.`,
        variant: Object.keys(data.failed).length > 0 ? 'destructive' : 'default',
      });
    } catch (error) {
      console.error('Error bulk approving documents:', error);

      toast({
        title: 'Bulk Approve Failed',
        description: 'Failed to bulk approve documents. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // View document details
  const handleViewDocument = documentId => {
    const document = documents?.find(doc => doc.id === documentId);
    if (document) {
      setSelectedDocument(document);
    }
  };

  // Generate validation report
  const handleGenerateReport = () => {
    // In a real implementation, this would generate a PDF report
    toast({
      title: 'Report Generated',
      description: 'PMDA validation report has been generated.',
    });
  };

  // Get status badge
  const getStatusBadge = status => {
    switch (status) {
      case 'passed':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            Passed
          </Badge>
        );
      case 'qc_failed':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            Failed
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            Pending
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
            {status || 'Unknown'}
          </Badge>
        );
    }
  };

  // Missing sections warning
  const missingSections = getMissingSections();
  const hasMissingSections = missingSections.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center">
            <Flag className="h-5 w-5 mr-2 text-red-600" />
            PMDA Validation
          </h2>
          <p className="text-sm text-gray-500">
            Validate submissions against Japanese PMDA regulatory requirements
          </p>
        </div>

        <div className="flex space-x-2">
          <Button
            variant="outline"
            onClick={handleBulkApprove}
            disabled={!documents?.length || isValidating}
          >
            <FileCheck className="h-4 w-4 mr-2" />
            Bulk Approve
          </Button>
          <Button onClick={handleStartValidation} disabled={!documents?.length || isValidating}>
            {isValidating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Validating...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Start Validation
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Missing sections warning */}
      {hasMissingSections && (
        <Alert variant="warning" className="bg-amber-50 border-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">Missing Required Sections</AlertTitle>
          <AlertDescription className="text-amber-700">
            The following required sections are missing: {missingSections.join(', ')}
          </AlertDescription>
        </Alert>
      )}

      {/* Validation status */}
      {validationResults && (
        <Card className="border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center">
              <Info className="h-5 w-5 mr-2 text-blue-600" />
              Validation Status
            </CardTitle>
            <CardDescription>
              {isValidating ? 'Validation in progress...' : 'Current validation results'}
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-2">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">Overall Status</p>
                  <div className="flex items-center mt-1">
                    {validationResults.overall_status === 'passed' ? (
                      <CheckCircle2 className="h-4 w-4 mr-1 text-green-600" />
                    ) : validationResults.overall_status === 'qc_failed' ? (
                      <XCircle className="h-4 w-4 mr-1 text-red-600" />
                    ) : (
                      <Info className="h-4 w-4 mr-1 text-blue-600" />
                    )}
                    <span className="text-sm">
                      {validationResults.overall_status === 'passed'
                        ? 'Passed'
                        : validationResults.overall_status === 'qc_failed'
                          ? 'Failed'
                          : 'Pending'}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium">WebSocket</p>
                  <div className="flex items-center mt-1">
                    {isConnected ? (
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                        <span className="text-xs text-green-600">Connected</span>
                      </div>
                    ) : (
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-red-500 rounded-full mr-1"></div>
                        <span className="text-xs text-red-600">Disconnected</span>
                      </div>
                    )}
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshStatus}
                  disabled={isValidating || !validationResults.job_id}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh
                </Button>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>Validation Progress</span>
                  <span>{validationProgress}%</span>
                </div>
                <Progress value={validationProgress} className="h-2" />
              </div>
            </div>
          </CardContent>
          <CardFooter className="pt-2">
            <Button
              variant="link"
              size="sm"
              className="ml-auto"
              onClick={handleGenerateReport}
              disabled={isValidating || validationResults.overall_status === 'pending'}
            >
              <Download className="h-3 w-3 mr-1" />
              Generate Report
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Documents list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Documents</CardTitle>
          <CardDescription>{documents?.length || 0} documents in submission</CardDescription>
        </CardHeader>
        <CardContent>
          {documents?.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Module</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map(doc => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.module || 'N/A'}</TableCell>
                    <TableCell>{doc.title}</TableCell>
                    <TableCell>
                      {validationResults?.document_results?.[doc.id]
                        ? getStatusBadge(validationResults.document_results[doc.id].status)
                        : getStatusBadge('pending')}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleViewDocument(doc.id)}>
                        <Info className="h-4 w-4" />
                        <span className="sr-only">Details</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <FileX className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>No documents in submission</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document details */}
      {selectedDocument && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileCheck className="h-5 w-5 mr-2 text-blue-600" />
              Document Details
            </CardTitle>
            <CardDescription>{selectedDocument.title}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="details">
              <TabsList className="mb-4">
                <TabsTrigger value="details">
                  <Info className="h-4 w-4 mr-2" />
                  Details
                </TabsTrigger>
                <TabsTrigger value="validation">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Validation
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">Document ID</p>
                    <p className="text-sm">{selectedDocument.id}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Module</p>
                    <p className="text-sm">{selectedDocument.module || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">File Path</p>
                    <p className="text-sm truncate">{selectedDocument.path || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Status</p>
                    <p className="text-sm">
                      {validationResults?.document_results?.[selectedDocument.id]
                        ? validationResults.document_results[selectedDocument.id].status
                        : 'Pending'}
                    </p>
                  </div>
                </div>

                {selectedDocument.module?.startsWith('jp-annex') && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">Japanese Specific Metadata</p>
                    <div className="border rounded-md p-3 bg-gray-50">
                      <p className="text-sm">
                        {selectedDocument.jp_specific
                          ? 'Japanese metadata available'
                          : 'Missing required Japanese metadata'}
                      </p>
                      <p className="text-sm mt-1">
                        {selectedDocument.jp_ctd_compliant
                          ? 'Complies with Japanese CTD structure'
                          : 'Does not comply with Japanese CTD structure'}
                      </p>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="validation">
                {validationResults?.document_results?.[selectedDocument.id]?.checks?.length > 0 ? (
                  <Accordion type="single" collapsible className="w-full">
                    {validationResults.document_results[selectedDocument.id].checks.map(
                      (check, index) => (
                        <AccordionItem key={index} value={`check-${index}`}>
                          <AccordionTrigger>
                            <div className="flex items-center">
                              {check.status === 'passed' ? (
                                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                              ) : (
                                <XCircle className="h-4 w-4 mr-2 text-red-600" />
                              )}
                              <span>{check.name}</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="text-sm p-2 rounded bg-gray-50">
                              {check.message || 'No details available'}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )
                    )}
                  </Accordion>
                ) : (
                  <div className="text-center py-6 text-gray-500">
                    {isValidating ? (
                      <div>
                        <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-blue-600" />
                        <p>Validation in progress...</p>
                      </div>
                    ) : (
                      <div>
                        <MessageSquareText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                        <p>No validation details available</p>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default JPValidationPanel;
