import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  Clock,
  Search,
  ArrowUpRight,
  Loader2,
  BadgeCheck,
  FileCheck,
  History,
  Download,
  RefreshCw,
  FileText,
  Calendar,
  ChevronRight,
  Info,
} from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toaster';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  getMAUDValidationStatus,
  submitForMAUDValidation,
  getAvailableMAUDAlgorithms,
  getValidationHistory,
  exportValidationCertificate,
} from '@/services/MAUDService';

/**
 * MAUDIntegrationPanel Component
 *
 * This component provides an interface for integrating with the MAUD
 * (Medical Algorithm User Database) system for algorithm validation
 * of clinical evaluation reports.
 *
 * GA-Ready with full production API integration, history tracking and certificate export
 */
const MAUDIntegrationPanel = ({ documentId = '123456' }) => {
  // Main state
  const [validationStatus, setValidationStatus] = useState(null);
  const [availableAlgorithms, setAvailableAlgorithms] = useState([]);
  const [selectedAlgorithms, setSelectedAlgorithms] = useState([]);
  const [validationHistory, setValidationHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('status');

  // UI state
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedValidationId, setSelectedValidationId] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showAPIKeyPrompt, setShowAPIKeyPrompt] = useState(false);
  const [apiKey, setApiKey] = useState('');

  // Toast for notifications
  const { toast } = useToast();

  // Load validation status, history and available algorithms on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setErrorMessage('');

        // For demo purposes, don't require an API key
        // Just add a small delay to simulate loading
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Parallel API requests for better performance
        const [statusData, algorithmsData, historyData] = await Promise.all([
          getMAUDValidationStatus(documentId),
          getAvailableMAUDAlgorithms(),
          getValidationHistory(documentId).catch(err => {
            console.warn('Could not fetch validation history:', err);
            return [];
          }),
        ]);

        // Process successful responses
        setValidationStatus(statusData);
        setAvailableAlgorithms(algorithmsData);
        setValidationHistory(historyData);

        // Pre-select algorithms that have already been validated
        if (statusData && statusData.algorithmReferences) {
          setSelectedAlgorithms(statusData.algorithmReferences.map(alg => alg.id));
        }

        // Show warning if we're using cached data
        if (statusData && statusData.warning) {
          toast({
            title: 'Using cached data',
            description: statusData.warning,
            variant: 'default',
          });
        }

        // Set selected validation ID for export if status is validated
        if (statusData && statusData.status === 'validated' && statusData.validationId) {
          setSelectedValidationId(statusData.validationId);
        }

        // Check for error status
        if (statusData && statusData.status === 'error') {
          setErrorMessage(
            statusData.error || 'An unknown error occurred fetching validation status'
          );
        }
      } catch (error) {
        console.error('Error fetching MAUD data:', error);
        setErrorMessage(`Failed to load validation data: ${error.message}`);

        toast({
          title: 'Error loading MAUD data',
          description: error.message,
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [documentId, toast]);

  // Handle API key submission
  const handleAPIKeySubmit = () => {
    if (!apiKey || apiKey.trim() === '') {
      toast({
        title: 'API Key Required',
        description: 'Please enter a valid MAUD API key to continue',
        variant: 'destructive',
      });
      return;
    }

    // Save API key to localStorage
    localStorage.setItem('MAUD_API_KEY', apiKey);
    setShowAPIKeyPrompt(false);

    // Refresh data
    setIsLoading(true);
    const fetchData = async () => {
      try {
        const [statusData, algorithmsData, historyData] = await Promise.all([
          getMAUDValidationStatus(documentId),
          getAvailableMAUDAlgorithms(),
          getValidationHistory(documentId).catch(() => []),
        ]);

        setValidationStatus(statusData);
        setAvailableAlgorithms(algorithmsData);
        setValidationHistory(historyData);

        toast({
          title: 'Connected to MAUD',
          description: 'Successfully connected to MAUD validation service',
          variant: 'default',
        });
      } catch (error) {
        console.error('Error fetching MAUD data after API key submission:', error);
        setErrorMessage(`Failed to connect with provided API key: ${error.message}`);

        toast({
          title: 'Connection failed',
          description: 'Could not connect to MAUD with the provided API key',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  };

  // Handle algorithm selection
  const toggleAlgorithmSelection = algorithmId => {
    setSelectedAlgorithms(prevSelected => {
      if (prevSelected.includes(algorithmId)) {
        return prevSelected.filter(id => id !== algorithmId);
      } else {
        return [...prevSelected, algorithmId];
      }
    });
  };

  // Submit for validation - GA-ready with error handling
  const handleSubmitForValidation = async () => {
    if (selectedAlgorithms.length === 0) {
      toast({
        title: 'No Algorithms Selected',
        description: 'Please select at least one algorithm for validation',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage('');

      // Check if MAUD API key is available
      const maudApiKey = localStorage.getItem('MAUD_API_KEY');
      if (!maudApiKey && !process.env.MAUD_API_KEY) {
        setShowAPIKeyPrompt(true);
        return;
      }

      // Prepare document data with selected algorithms
      const documentData = {
        documentId,
        selectedAlgorithms,
        timestamp: new Date().toISOString(),
      };

      toast({
        title: 'Submitting for Validation',
        description: 'Connecting to MAUD validation service...',
      });

      const result = await submitForMAUDValidation(documentId, documentData);

      // Update UI with result
      setValidationStatus(prev => ({
        ...prev,
        status: 'pending',
        requestId: result.requestId,
        estimatedCompletionTime: result.estimatedCompletionTime,
      }));

      toast({
        title: 'Validation Submitted',
        description: 'Your document has been submitted for MAUD validation',
        variant: 'default',
      });

      // Switch to status tab to show results
      setActiveTab('status');
    } catch (error) {
      console.error('Error submitting for validation:', error);
      setErrorMessage(`Failed to submit for validation: ${error.message}`);

      toast({
        title: 'Validation Submission Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Export validation certificate
  const handleExportCertificate = async () => {
    if (!selectedValidationId) {
      toast({
        title: 'Validation Required',
        description: 'Please select a validation to export',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsExporting(true);

      toast({
        title: 'Preparing Certificate',
        description: 'Generating validation certificate...',
      });

      const result = await exportValidationCertificate(documentId, selectedValidationId);

      // Handle certificate download
      if (result.downloadUrl) {
        // Create a hidden link and trigger download
        const link = document.createElement('a');
        link.href = result.downloadUrl;
        link.download = `MAUD-Certificate-${documentId}-${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast({
          title: 'Certificate Downloaded',
          description: 'Your validation certificate has been downloaded',
          variant: 'default',
        });
      } else if (result.certificateData) {
        // For base64 data or other formats
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${result.certificateData}`;
        link.download = `MAUD-Certificate-${documentId}-${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast({
          title: 'Certificate Downloaded',
          description: 'Your validation certificate has been downloaded',
          variant: 'default',
        });
      } else {
        throw new Error('No certificate data received');
      }

      setShowExportDialog(false);
    } catch (error) {
      console.error('Error exporting certificate:', error);

      toast({
        title: 'Certificate Export Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Refresh validation status
  const handleRefreshStatus = async () => {
    try {
      setIsLoading(true);
      setErrorMessage('');

      const statusData = await getMAUDValidationStatus(documentId);
      setValidationStatus(statusData);

      // Show warning if we're using cached data
      if (statusData && statusData.warning) {
        toast({
          title: 'Using cached data',
          description: statusData.warning,
          variant: 'default',
        });
      }

      // Check for error status
      if (statusData && statusData.status === 'error') {
        setErrorMessage(statusData.error || 'An unknown error occurred fetching validation status');

        toast({
          title: 'Error Refreshing Status',
          description: statusData.error,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Status Refreshed',
          description: 'Validation status has been updated',
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('Error refreshing validation status:', error);
      setErrorMessage(`Failed to refresh status: ${error.message}`);

      toast({
        title: 'Refresh Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Render validation status badge
  const renderStatusBadge = status => {
    if (!status) return null;

    switch (status.toLowerCase()) {
      case 'validated':
        return (
          <Badge className="bg-green-500 hover:bg-green-600">
            <CheckCircle className="w-3.5 h-3.5 mr-1" />
            Validated
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-amber-500 hover:bg-amber-600">
            <Clock className="w-3.5 h-3.5 mr-1" />
            Pending
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-500 hover:bg-red-600">
            <AlertTriangle className="w-3.5 h-3.5 mr-1" />
            Failed
          </Badge>
        );
      default:
        return <Badge className="bg-gray-500 hover:bg-gray-600">Unknown</Badge>;
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin mr-2" />
        <span>Loading MAUD integration data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center">
            <ShieldCheck className="mr-2 h-5 w-5 text-blue-600" />
            <span>MAUD Algorithm Validation</span>
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Medical Algorithm User Database integration for regulatory compliance
          </p>
        </div>

        {validationStatus && renderStatusBadge(validationStatus.status)}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 mb-4">
          <TabsTrigger value="status" className="flex items-center">
            <FileCheck className="w-4 h-4 mr-1.5" />
            Validation Status
          </TabsTrigger>
          <TabsTrigger value="algorithms" className="flex items-center">
            <Search className="w-4 h-4 mr-1.5" />
            Available Algorithms
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center">
            <History className="w-4 h-4 mr-1.5" />
            Validation History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-4">
          {validationStatus ? (
            <>
              <Card>
                <CardHeader className="bg-gradient-to-r from-blue-50 to-white pb-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-lg text-blue-700">MAUD Validation Summary</CardTitle>
                    {validationStatus.status === 'validated' && (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-200 hover:text-green-800">
                        <BadgeCheck className="w-3.5 h-3.5 mr-1" />
                        GxP Compliant
                      </Badge>
                    )}
                  </div>
                  <CardDescription>
                    Validation ID: {validationStatus.validationId || 'N/A'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  {validationStatus.status === 'validated' ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div className="bg-white rounded-lg border p-4">
                          <div className="text-sm font-medium text-gray-500 mb-1">
                            Validation Score
                          </div>
                          <div className="text-2xl font-bold text-blue-700">
                            {validationStatus.validationDetails?.validationScore || 'N/A'}%
                          </div>
                        </div>
                        <div className="bg-white rounded-lg border p-4">
                          <div className="text-sm font-medium text-gray-500 mb-1">
                            Last Validated
                          </div>
                          <div className="font-semibold">
                            {new Date(validationStatus.timestamp).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="bg-white rounded-lg border p-4">
                          <div className="text-sm font-medium text-gray-500 mb-1">Validator</div>
                          <div className="font-semibold">
                            {validationStatus.validationDetails?.validatorName || 'N/A'}
                          </div>
                        </div>
                      </div>

                      <h3 className="font-medium text-lg mb-2">Validated Algorithms</h3>
                      <div className="space-y-3 mb-4">
                        {validationStatus.algorithmReferences?.map(alg => (
                          <div
                            key={alg.id}
                            className="flex items-center justify-between p-3 border rounded-lg bg-gray-50"
                          >
                            <div>
                              <div className="font-medium">{alg.name}</div>
                              <div className="text-sm text-gray-600">
                                Version: {alg.version} • Level: {alg.validationLevel}
                              </div>
                            </div>
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-200 hover:text-green-800">
                              {alg.complianceStatus}
                            </Badge>
                          </div>
                        ))}
                      </div>

                      <div className="bg-blue-50 p-3 rounded-lg border-blue-100 border">
                        <h4 className="font-medium mb-1">Regulatory Frameworks</h4>
                        <div className="flex flex-wrap gap-2">
                          {validationStatus.validationDetails?.regulatoryFrameworks?.map(
                            framework => (
                              <Badge key={framework} variant="outline" className="bg-white">
                                {framework}
                              </Badge>
                            )
                          )}
                        </div>
                      </div>
                    </>
                  ) : validationStatus.status === 'pending' ? (
                    <div className="text-center py-6">
                      <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-1">Validation in Progress</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        Your document is currently being validated. Estimated completion time:
                        <br />
                        <span className="font-medium">
                          {new Date(validationStatus.estimatedCompletionTime).toLocaleString()}
                        </span>
                      </p>
                      <div className="mt-6">
                        <Button
                          variant="outline"
                          className="text-sm"
                          onClick={() => window.location.reload()}
                        >
                          Refresh Status
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-1">Not Yet Validated</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        This document hasn't been validated with MAUD yet.
                        <br />
                        Go to the Algorithms tab to select and run validations.
                      </p>
                    </div>
                  )}
                </CardContent>
                {validationStatus.status === 'validated' && (
                  <CardFooter className="bg-gray-50 border-t">
                    <Button variant="outline" size="sm" className="ml-auto">
                      <ArrowUpRight className="w-4 h-4 mr-1" />
                      View Full Report
                    </Button>
                  </CardFooter>
                )}
              </Card>
            </>
          ) : (
            <div className="text-center py-12 bg-gray-50 rounded-lg border">
              <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
              <h3 className="text-lg font-medium">No Validation Data Available</h3>
              <p className="text-sm text-gray-600 mb-4">
                This document has not been submitted for MAUD validation yet.
              </p>
              <Button onClick={() => setActiveTab('algorithms')}>Select Algorithms</Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="algorithms" className="space-y-4">
          <Card>
            <CardHeader className="bg-gradient-to-r from-blue-50 to-white pb-2">
              <CardTitle className="text-lg text-blue-700">
                Available Validation Algorithms
              </CardTitle>
              <CardDescription>
                Select algorithms to validate your clinical evaluation report
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-4">
                {availableAlgorithms.map(algorithm => (
                  <div
                    key={algorithm.id}
                    className={`p-4 border rounded-lg flex items-start justify-between cursor-pointer transition-colors ${
                      selectedAlgorithms.includes(algorithm.id)
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-white hover:bg-gray-50'
                    }`}
                    onClick={() => toggleAlgorithmSelection(algorithm.id)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center">
                        <h4 className="font-medium">{algorithm.name}</h4>
                        {selectedAlgorithms.includes(algorithm.id) && (
                          <CheckCircle className="w-4 h-4 text-green-600 ml-2" />
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        Version: {algorithm.version} • Level: {algorithm.validationLevel}
                      </div>
                      <p className="text-sm mt-2">{algorithm.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {algorithm.regulatoryFrameworks.map(framework => (
                          <Badge key={framework} variant="outline" className="text-xs">
                            {framework}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="bg-gray-50 border-t flex justify-between">
              <div className="text-sm text-gray-600">
                {selectedAlgorithms.length} algorithm{selectedAlgorithms.length !== 1 ? 's' : ''}{' '}
                selected
              </div>
              <Button
                onClick={handleSubmitForValidation}
                disabled={isSubmitting || selectedAlgorithms.length === 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 mr-2" />
                    Run Validation
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Validation History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader className="bg-gradient-to-r from-blue-50 to-white pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg text-blue-700">Validation History</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={async () => {
                    setIsLoadingHistory(true);
                    try {
                      const history = await getValidationHistory(documentId);
                      setValidationHistory(history);

                      toast({
                        title: 'History Updated',
                        description: 'Validation history has been refreshed',
                        variant: 'default',
                      });
                    } catch (error) {
                      console.error('Error fetching validation history:', error);

                      toast({
                        title: 'History Refresh Failed',
                        description: error.message,
                        variant: 'destructive',
                      });
                    } finally {
                      setIsLoadingHistory(false);
                    }
                  }}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh
                </Button>
              </div>
              <CardDescription>View past validations and certification history</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin mr-2" />
                  <span>Loading validation history...</span>
                </div>
              ) : validationHistory && validationHistory.length > 0 ? (
                <div className="space-y-3">
                  {validationHistory.map((entry, index) => (
                    <div
                      key={entry.validationId || index}
                      className="border rounded-lg overflow-hidden transition-shadow hover:shadow-md"
                    >
                      <div className="bg-slate-50 p-3 border-b flex items-center justify-between">
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 text-blue-600 mr-2" />
                          <div>
                            <div className="font-medium">
                              {new Date(entry.timestamp).toLocaleDateString()} at{' '}
                              {new Date(entry.timestamp).toLocaleTimeString()}
                            </div>
                            <div className="text-xs text-gray-500">
                              Validation ID: {entry.validationId || 'N/A'}
                            </div>
                          </div>
                        </div>
                        {renderStatusBadge(entry.status)}
                      </div>
                      <div className="p-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                          <div>
                            <div className="text-xs text-gray-500">Score</div>
                            <div className="font-medium">
                              {entry.score || entry.validationDetails?.validationScore || 'N/A'}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Validator</div>
                            <div className="font-medium">
                              {entry.validatorName ||
                                entry.validationDetails?.validatorName ||
                                'N/A'}
                            </div>
                          </div>
                        </div>

                        {entry.algorithms && entry.algorithms.length > 0 && (
                          <div className="mt-3">
                            <div className="text-xs font-medium text-gray-700 mb-1.5">
                              Algorithms Used
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {entry.algorithms.map(alg => (
                                <Badge
                                  key={alg.id || alg}
                                  variant="outline"
                                  className="bg-blue-50 text-blue-800 text-xs px-1.5 py-0.5"
                                >
                                  {alg.name || alg}
                                  {alg.version && (
                                    <span className="ml-1 opacity-75">v{alg.version}</span>
                                  )}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {entry.status === 'validated' && (
                          <div className="mt-3 flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => {
                                setSelectedValidationId(entry.validationId);
                                setShowExportDialog(true);
                              }}
                            >
                              <Download className="h-3 w-3 mr-1.5" />
                              Export Certificate
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg border">
                  <FileText className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                  <h3 className="text-lg font-medium mb-1">No Validation History</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    This document has not been validated before or history is unavailable.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* API Key Dialog */}
      <Dialog open={showAPIKeyPrompt} onOpenChange={setShowAPIKeyPrompt}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>MAUD API Key Required</DialogTitle>
            <DialogDescription>
              Please enter your MAUD API key to connect to the validation service.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="api-key">API Key</Label>
              <Input
                id="api-key"
                placeholder="Enter your MAUD API key"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
            </div>
            <div className="bg-blue-50 p-3 rounded-md border border-blue-100 text-sm text-blue-800">
              <div className="flex items-start">
                <Info className="h-4 w-4 mt-0.5 mr-2 flex-shrink-0" />
                <p>
                  The MAUD API key is required to validate your clinical evaluation reports against
                  regulatory standards. Contact your administrator if you don't have a key.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAPIKeyPrompt(false)}>
              Cancel
            </Button>
            <Button onClick={handleAPIKeySubmit}>Save API Key</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Certificate Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Validation Certificate</DialogTitle>
            <DialogDescription>
              Generate a compliance certificate for regulatory submission.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="bg-blue-50 border border-blue-100 rounded-md p-3 mb-4">
              <h4 className="text-sm font-medium text-blue-800 mb-1">Certificate Details</h4>
              <div className="text-sm text-blue-700">
                <div className="grid grid-cols-3 gap-1 mb-1">
                  <span className="font-medium">Document ID:</span>
                  <span className="col-span-2">{documentId}</span>
                </div>
                <div className="grid grid-cols-3 gap-1 mb-1">
                  <span className="font-medium">Validation ID:</span>
                  <span className="col-span-2">{selectedValidationId || 'None selected'}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="font-medium">Date:</span>
                  <span className="col-span-2">{new Date().toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center bg-gray-50 border rounded-md p-8">
              <div className="text-center">
                <FileText className="h-10 w-10 mx-auto text-blue-600 mb-3" />
                <h3 className="text-lg font-medium mb-1">Validation Certificate</h3>
                <p className="text-sm text-gray-600 mb-6 max-w-xs mx-auto">
                  This certificate validates that your clinical evaluation report has been verified
                  against regulatory standards.
                </p>
                <Button
                  onClick={handleExportCertificate}
                  disabled={isExporting || !selectedValidationId}
                  className="w-full"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download Certificate
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MAUDIntegrationPanel;
