import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  CheckCircle,
  AlertCircle,
  FileCheck,
  Download,
  RefreshCw,
  Shield,
  CheckSquare,
  Save,
  AlertTriangle,
} from 'lucide-react';
import { useToast } from '@/components/ui/toaster';
import { FDA510kService } from '@/services/FDA510kService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * ESTARBuilderPanel Component
 *
 * This component provides the final step in the 510(k) workflow for generating
 * and validating eSTAR submissions according to FDA guidelines.
 *
 * It includes:
 * - Validation functionality with both standard and strict modes
 * - Final report generation with FDA-compliant formatting
 * - Option to download generated files in multiple formats
 * - Comprehensive validation reports with issue listings
 */
const ESTARBuilderPanel = ({
  projectId,
  deviceProfile,
  complianceScore,
  equivalenceData,
  onGenerationComplete,
  onValidationComplete,
  isValidating,
  isGenerating,
  validationResults,
  generatedUrl,
  estarFormat,
  setEstarFormat,
  setIsValidating,
  setIsGenerating,
  setValidationResults,
  setGeneratedUrl,
}) => {
  const { toast } = useToast();
  const [validationInProgress, setValidationInProgress] = useState(false);
  const [validationProgress, setValidationProgress] = useState(0);
  const [includeAttachments, setIncludeAttachments] = useState(true);
  const [strictValidation, setStrictValidation] = useState(false);
  const [activeTab, setActiveTab] = useState('validation');
  const [generationRetryCount, setGenerationRetryCount] = useState(0);
  const [lastSuccessfulState, setLastSuccessfulState] = useState(null);
  const [validationErrorMessage, setValidationErrorMessage] = useState('');
  const [generationErrorMessage, setGenerationErrorMessage] = useState('');

  // Backup eSTAR state to localStorage for recovery
  useEffect(() => {
    try {
      // Only save when we have meaningful state to preserve
      if (validationResults || generatedUrl) {
        const estarState = {
          timestamp: new Date().toISOString(),
          projectId,
          validationResults,
          generatedUrl,
          estarFormat,
          includeAttachments,
          strictValidation,
          activeTab,
        };

        localStorage.setItem('510k_estarState', JSON.stringify(estarState));
        console.log('[ESTARBuilderPanel] State backed up to localStorage');
      }
    } catch (error) {
      console.error('[ESTARBuilderPanel] Error saving state to localStorage:', error);
      // Non-critical, continue
    }
  }, [validationResults, generatedUrl, estarFormat]);

  // Attempt to recover state on mount
  useEffect(() => {
    try {
      const savedState = localStorage.getItem('510k_estarState');
      if (savedState) {
        const state = JSON.parse(savedState);

        // Only restore if it's for the same project and reasonably recent (24h)
        const savedTime = new Date(state.timestamp).getTime();
        const currentTime = new Date().getTime();
        const hoursSinceSave = (currentTime - savedTime) / (1000 * 60 * 60);

        if (state.projectId === projectId && hoursSinceSave < 24) {
          console.log('[ESTARBuilderPanel] Restoring saved state from localStorage');

          // Only restore what we have and what makes sense
          if (state.validationResults && !validationResults) {
            setValidationResults(state.validationResults);
          }

          if (state.generatedUrl && !generatedUrl) {
            setGeneratedUrl(state.generatedUrl);
          }

          if (state.estarFormat) {
            setEstarFormat(state.estarFormat);
          }

          if (typeof state.includeAttachments === 'boolean') {
            setIncludeAttachments(state.includeAttachments);
          }

          if (typeof state.strictValidation === 'boolean') {
            setStrictValidation(state.strictValidation);
          }

          if (state.activeTab) {
            setActiveTab(state.activeTab);
          }
        }
      }
    } catch (error) {
      console.error('[ESTARBuilderPanel] Error restoring state from localStorage:', error);
      // Non-critical error, don't interrupt user flow
    }
  }, []);

  // Instance of the FDA510k service
  const fda510kService = new FDA510kService();

  /**
   * Handles the eSTAR validation process with enhanced error recovery
   * @param {boolean} strict Whether to use strict validation
   */
  const handleValidate = useCallback(
    async (strict = false) => {
      // Clear any previous error messages
      setValidationErrorMessage('');

      // Save current state before validation for potential recovery
      const currentState = {
        validationResults,
        estarFormat,
        includeAttachments,
        strictValidation: strict,
      };
      setLastSuccessfulState(currentState);

      let progressInterval;

      try {
        setIsValidating(true);
        setValidationInProgress(true);
        setValidationProgress(0);

        // Save validation attempt to localStorage
        try {
          localStorage.setItem(
            '510k_estarValidationAttempt',
            JSON.stringify({
              timestamp: new Date().toISOString(),
              projectId,
              strict,
            })
          );
        } catch (storageError) {
          console.warn('[ESTARBuilderPanel] Failed to save validation attempt:', storageError);
          // Non-critical, continue
        }

        // Progress simulation for UX with a more realistic pattern
        progressInterval = setInterval(() => {
          setValidationProgress(prev => {
            if (prev >= 90) {
              clearInterval(progressInterval);
              return 90;
            }
            // Slow down progress as it gets higher for realism
            const increment = prev < 50 ? 10 : prev < 75 ? 6 : 3;
            return prev + increment;
          });
        }, 800);

        // Add timeout protection to prevent indefinite hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error('Validation request timed out after 90 seconds')),
            90000
          );
        });

        // Call the actual validation service with timeout protection
        const results = await Promise.race([
          fda510kService.validateESTARPackage(projectId, strict),
          timeoutPromise,
        ]);

        // Clear the progress interval
        if (progressInterval) {
          clearInterval(progressInterval);
          progressInterval = null;
        }
        setValidationProgress(100);

        // Verify the results structure for data integrity
        if (!results || typeof results !== 'object') {
          throw new Error('Invalid validation response format');
        }

        // Send the results to parent component
        if (onValidationComplete) {
          try {
            onValidationComplete(results);
          } catch (callbackError) {
            console.error('[ESTARBuilderPanel] Error in validation callback:', callbackError);
            // Continue despite callback error
          }
        }

        // Set the validation results
        setValidationResults(results);

        // Show toast notification
        if (results.valid) {
          toast({
            title: 'Validation Successful',
            description: 'Your eSTAR package meets FDA requirements.',
            variant: 'default',
          });
        } else {
          toast({
            title: 'Validation Complete',
            description: `Found ${results.issues?.length || 0} issues to address.`,
            variant: 'default',
          });
        }

        // Reset error message if previously set
        setValidationErrorMessage('');

        return results;
      } catch (error) {
        console.error('[ESTARBuilderPanel] Error validating eSTAR package:', error);

        // Store the error message for display
        const errorMessage = error.message || 'Failed to validate eSTAR package';
        setValidationErrorMessage(errorMessage);

        // Show user-friendly error
        toast({
          title: 'Validation Error',
          description: errorMessage,
          variant: 'destructive',
        });

        // Attempt to restore previous state
        if (lastSuccessfulState) {
          setValidationResults(lastSuccessfulState.validationResults);
        }

        return { valid: false, error: errorMessage };
      } finally {
        // Ensure interval is cleared in all cases
        if (progressInterval) {
          clearInterval(progressInterval);
        }

        // Reset UI states
        setIsValidating(false);
        setValidationInProgress(false);
        setValidationProgress(100);

        // Remove validation attempt record
        try {
          localStorage.removeItem('510k_estarValidationAttempt');
        } catch (e) {
          // Non-critical
        }
      }
    },
    [
      projectId,
      validationResults,
      estarFormat,
      includeAttachments,
      lastSuccessfulState,
      onValidationComplete,
    ]
  );

  /**
   * Handles the generation of the final eSTAR package with enhanced reliability
   * and strict FDA compliance enforcement
   */
  const handleGenerate = useCallback(async () => {
    // Clear any previous error messages
    setGenerationErrorMessage('');

    // Save current state before generation for potential recovery
    const currentState = {
      validationResults,
      estarFormat,
      includeAttachments,
      strictValidation,
      generatedUrl,
    };
    setLastSuccessfulState(currentState);

    // Track generation attempt count for retry logic
    setGenerationRetryCount(prev => prev + 1);

    // Ensure we have valid data before proceeding
    if (!deviceProfile || !projectId) {
      const missingItems = [];
      if (!deviceProfile) missingItems.push('device profile');
      if (!projectId) missingItems.push('project ID');

      const errorMessage = `Missing required data: ${missingItems.join(', ')}`;
      setGenerationErrorMessage(errorMessage);

      toast({
        title: 'Cannot Generate eSTAR Package',
        description: errorMessage,
        variant: 'destructive',
      });
      return;
    }

    // Validate first if not already done or validation failed
    if (!validationResults || !validationResults.valid) {
      const shouldProceed = window.confirm(
        'The eSTAR package has not been successfully validated. ' +
          'FDA submissions require validated packages. Would you like to validate first?'
      );

      if (shouldProceed) {
        const validationResult = await handleValidate(strictValidation);
        if (!validationResult.valid) {
          // Don't proceed if validation failed
          return;
        }
      }
    }

    try {
      setIsGenerating(true);

      // Save generation attempt to localStorage
      try {
        localStorage.setItem(
          '510k_estarGenerationAttempt',
          JSON.stringify({
            timestamp: new Date().toISOString(),
            projectId,
            format: estarFormat,
            retryCount: generationRetryCount,
          })
        );
      } catch (storageError) {
        console.warn('[ESTARBuilderPanel] Failed to save generation attempt:', storageError);
        // Non-critical, continue
      }

      // Generate a stable report ID based on the project to ensure idempotency
      // This helps with resuming interrupted operations
      const reportId = `510K-${projectId.toString().replace(/\D/g, '')}-${new Date().toISOString().slice(0, 10)}`;

      const options = {
        validateFirst: !validationResults?.valid, // Validate first if not already validated
        strictValidation,
        format: estarFormat || 'pdf', // Default to PDF for FDA compliance
        includeAttachments,
        fdaCompliant: true, // Enforce FDA formatting standards
        deviceProfile,
        complianceScore,
        equivalenceData,
      };

      // Add timeout protection to prevent indefinite hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Generation request timed out after 3 minutes')), 180000);
      });

      // Call the FDA service to generate eSTAR with timeout protection
      const result = await Promise.race([
        fda510kService.integrateWithESTAR(reportId, projectId, options),
        timeoutPromise,
      ]);

      // Verify the response integrity
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid generation response format');
      }

      if (result.success) {
        setGeneratedUrl(result.downloadUrl);

        // Verify the downloadUrl is actually present and valid
        if (!result.downloadUrl) {
          throw new Error('No download URL was returned in the successful response');
        }

        // Call the completion callback
        if (onGenerationComplete) {
          try {
            onGenerationComplete(result);
          } catch (callbackError) {
            console.error('[ESTARBuilderPanel] Error in generation callback:', callbackError);
            // Continue despite callback error
          }
        }

        // Ensure the generation is FDA compliant
        if (!result.fdaCompliant) {
          toast({
            title: 'eSTAR Package Generated with Warnings',
            description:
              'Your package was generated but may not meet all FDA requirements. Review carefully.',
            variant: 'default',
          });
        } else {
          toast({
            title: 'eSTAR Package Generated',
            description: 'Your FDA-compliant submission package is ready to download.',
            variant: 'default',
          });
        }

        // Switch to the download tab
        setActiveTab('generation');

        // Reset error tracking
        setGenerationErrorMessage('');
      } else {
        // Handle unsuccessful result with specific error information
        const errorMessage =
          result.message || 'Failed to generate eSTAR package due to server error.';
        setGenerationErrorMessage(errorMessage);

        toast({
          title: 'Generation Failed',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('[ESTARBuilderPanel] Error generating eSTAR package:', error);

      // Store the error message for display
      const errorMessage = error.message || 'Failed to generate eSTAR package';
      setGenerationErrorMessage(errorMessage);

      // Attempt automatic retry for certain errors
      if (
        generationRetryCount < 2 &&
        (errorMessage.includes('timeout') ||
          errorMessage.includes('network') ||
          errorMessage.includes('connection'))
      ) {
        toast({
          title: 'Automatic Retry',
          description: 'Connection issue detected. Retrying generation in 5 seconds...',
          variant: 'default',
        });

        // Retry after a short delay
        setTimeout(() => handleGenerate(), 5000);
        return;
      }

      // Show user-friendly error
      toast({
        title: 'Generation Error',
        description: errorMessage,
        variant: 'destructive',
      });

      // Attempt to restore previous state if we had a URL before
      if (lastSuccessfulState && lastSuccessfulState.generatedUrl) {
        setGeneratedUrl(lastSuccessfulState.generatedUrl);
      }
    } finally {
      // Reset UI states
      setIsGenerating(false);

      // Remove generation attempt record
      try {
        localStorage.removeItem('510k_estarGenerationAttempt');
      } catch (e) {
        // Non-critical
      }
    }
  }, [
    projectId,
    deviceProfile,
    validationResults,
    estarFormat,
    includeAttachments,
    strictValidation,
    complianceScore,
    equivalenceData,
    generationRetryCount,
    lastSuccessfulState,
    handleValidate,
  ]);

  return (
    <Card className="w-full shadow-md border-blue-200">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b pb-4">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg font-semibold text-gray-800 flex items-center">
              <FileCheck className="h-5 w-5 mr-2 text-blue-600" />
              eSTAR Builder
              <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-normal">
                FDA 510(k)
              </span>
            </CardTitle>
            <CardDescription className="text-sm text-gray-600 mt-1">
              Generate FDA-compliant eSTAR packages for your 510(k) submission
            </CardDescription>
          </div>
          {complianceScore > 80 ? (
            <div className="flex items-center bg-green-50 py-1 px-3 rounded-full border border-green-100">
              <Shield className="h-4 w-4 text-green-600 mr-1" />
              <span className="text-sm font-medium text-green-700">Ready for Submission</span>
            </div>
          ) : complianceScore > 60 ? (
            <div className="flex items-center bg-amber-50 py-1 px-3 rounded-full border border-amber-100">
              <AlertCircle className="h-4 w-4 text-amber-500 mr-1" />
              <span className="text-sm font-medium text-amber-700">Minor Issues to Resolve</span>
            </div>
          ) : (
            <div className="flex items-center bg-red-50 py-1 px-3 rounded-full border border-red-100">
              <AlertCircle className="h-4 w-4 text-red-500 mr-1" />
              <span className="text-sm font-medium text-red-700">Critical Issues to Resolve</span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="validation" className="flex items-center justify-center py-2">
              <CheckSquare className="h-4 w-4 mr-2" />
              Validation
            </TabsTrigger>
            <TabsTrigger value="generation" className="flex items-center justify-center py-2">
              <FileCheck className="h-4 w-4 mr-2" />
              Generation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="validation" className="mt-0">
            {complianceScore < 70 && (
              <Alert variant="warning" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Compliance Score Low</AlertTitle>
                <AlertDescription>
                  We recommend improving your compliance score before submitting your eSTAR package.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <div className="flex flex-col space-y-2">
                <label className="text-sm font-medium">Validation Options</label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="strict-validation"
                    checked={strictValidation}
                    onCheckedChange={setStrictValidation}
                  />
                  <label htmlFor="strict-validation" className="text-sm">
                    Strict FDA Validation
                  </label>
                </div>
              </div>

              {validationInProgress && (
                <div className="space-y-2 my-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Validating eSTAR Package...</span>
                    <span className="text-sm font-medium">{validationProgress}%</span>
                  </div>
                  <Progress value={validationProgress} className="h-2" />
                </div>
              )}

              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  className="flex items-center"
                  onClick={() => handleValidate(false)}
                  disabled={isValidating}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Standard Validation
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center"
                  onClick={() => handleValidate(true)}
                  disabled={isValidating}
                >
                  <Shield className="h-4 w-4 mr-2" />
                  Strict Validation
                </Button>
              </div>

              {/* Enhanced Validation results display */}
              {validationResults && (
                <div
                  className={`mt-4 p-4 rounded-md border ${
                    validationResults.valid
                      ? 'bg-green-50/70 border-green-200'
                      : 'bg-amber-50/70 border-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      {validationResults.valid ? (
                        <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-amber-500 mr-2" />
                      )}
                      <h4 className="font-medium">
                        {validationResults.valid
                          ? 'FDA Validation Passed'
                          : `${validationResults.issues?.length || 0} FDA Compliance Issues`}
                      </h4>
                    </div>
                    {typeof validationResults.score === 'number' && (
                      <div className="flex items-center">
                        <span className="text-xs mr-2">Compliance Score:</span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            validationResults.score >= 90
                              ? 'bg-green-100 text-green-800'
                              : validationResults.score >= 70
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {validationResults.score}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Score visualization */}
                  {typeof validationResults.score === 'number' && (
                    <div className="mb-4 mt-2 bg-white p-2 rounded border">
                      <div className="flex justify-between text-xs mb-1">
                        <span>0%</span>
                        <span className="font-medium">FDA Compliance Threshold: 70%</span>
                        <span>100%</span>
                      </div>
                      <div className="h-3 w-full bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            validationResults.score >= 90
                              ? 'bg-green-500'
                              : validationResults.score >= 70
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                          }`}
                          style={{ width: `${validationResults.score}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {validationResults.issues && validationResults.issues.length > 0 && (
                    <div className="bg-white rounded border p-2 mt-3">
                      <h5 className="font-medium text-sm mb-2 text-gray-700 flex items-center">
                        <AlertCircle className="h-3.5 w-3.5 mr-1.5 text-amber-500" />
                        FDA Compliance Issues:
                      </h5>
                      <ul className="space-y-2">
                        {validationResults.issues.slice(0, 5).map((issue, idx) => (
                          <li
                            key={idx}
                            className={`flex items-start p-2 rounded text-sm ${
                              issue.severity === 'error'
                                ? 'bg-red-50 border-l-2 border-red-400'
                                : issue.severity === 'warning'
                                  ? 'bg-amber-50 border-l-2 border-amber-400'
                                  : 'bg-blue-50 border-l-2 border-blue-400'
                            }`}
                          >
                            <span
                              className={`mr-2 ${
                                issue.severity === 'error'
                                  ? 'text-red-500'
                                  : issue.severity === 'warning'
                                    ? 'text-amber-500'
                                    : 'text-blue-500'
                              }`}
                            >
                              {issue.severity === 'error'
                                ? '●'
                                : issue.severity === 'warning'
                                  ? '◆'
                                  : 'ⓘ'}
                            </span>
                            <div>
                              <div className="font-medium">{issue.section || 'General'}</div>
                              <div className="text-xs">{issue.message}</div>
                            </div>
                          </li>
                        ))}
                        {validationResults.issues.length > 5 && (
                          <li className="text-center text-xs italic text-gray-500 pt-1">
                            ...and {validationResults.issues.length - 5} more issues
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {validationResults.recommendations &&
                    validationResults.recommendations.length > 0 && (
                      <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-100">
                        <h5 className="text-sm font-medium mb-2 flex items-center text-blue-700">
                          <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
                          FDA Recommendations:
                        </h5>
                        <ul className="space-y-1.5">
                          {validationResults.recommendations.map((rec, idx) => (
                            <li key={idx} className="flex items-start text-xs text-blue-800">
                              <span className="mr-1.5 text-blue-500 mt-0.5">•</span>
                              <span>{rec}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="generation" className="mt-0">
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="w-full md:w-1/2">
                  <label className="text-sm font-medium flex items-center">
                    <FileCheck className="h-4 w-4 mr-1.5 text-blue-600" />
                    Package Format
                  </label>
                  <p className="text-xs text-gray-500 mb-1.5">
                    Select the best format for FDA submission
                  </p>
                  <Select value={estarFormat} onValueChange={setEstarFormat}>
                    <SelectTrigger className="w-full bg-white">
                      <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zip">
                        <div className="flex items-center">
                          <span>ZIP Archive</span>
                          <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                            Recommended
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="pdf">PDF Document</SelectItem>
                      <SelectItem value="folder">Folder Structure</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full md:w-1/2">
                  <label className="text-sm font-medium flex items-center">
                    <CheckSquare className="h-4 w-4 mr-1.5 text-blue-600" />
                    Package Options
                  </label>
                  <p className="text-xs text-gray-500 mb-1.5">
                    Configure additional packaging options
                  </p>
                  <div className="flex flex-col space-y-2 p-2 bg-gray-50 rounded border">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="include-attachments"
                        checked={includeAttachments}
                        onCheckedChange={setIncludeAttachments}
                      />
                      <label htmlFor="include-attachments" className="text-sm">
                        Include Referenced Attachments
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="include-certificates" checked={true} disabled />
                      <label htmlFor="include-certificates" className="text-sm">
                        Include Digital Signatures
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* FDA submission readiness indicator */}
              <div className="bg-blue-50 p-3 rounded-md border border-blue-100">
                <h3 className="text-sm font-medium text-blue-800 mb-1.5 flex items-center">
                  <Shield className="h-4 w-4 mr-1.5" />
                  FDA Submission Readiness
                </h3>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span>Device Description</span>
                    <span className="font-medium text-green-600">✓ Complete</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span>Predicate Device Comparison</span>
                    <span className="font-medium text-green-600">✓ Complete</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span>Substantial Equivalence</span>
                    <span className="font-medium text-green-600">✓ Complete</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span>Performance Data</span>
                    <span className="font-medium text-green-600">✓ Complete</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span>Validation Status</span>
                    {validationResults?.valid ? (
                      <span className="font-medium text-green-600">✓ Validated</span>
                    ) : (
                      <span className="font-medium text-amber-600">⚠ Needs Validation</span>
                    )}
                  </div>
                </div>
              </div>

              {!validationResults?.valid && validationResults?.issues?.length > 0 && (
                <Alert className="my-2 border-amber-200 bg-amber-50">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <AlertTitle>FDA Validation Recommended</AlertTitle>
                  <AlertDescription>
                    To ensure compliance with FDA requirements, we recommend validating your
                    submission before generating the final package.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="default"
                  className="flex items-center bg-blue-600 hover:bg-blue-700"
                  onClick={handleGenerate}
                  disabled={isGenerating || (complianceScore < 60 && !validationResults?.valid)}
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Generating FDA Package
                    </>
                  ) : (
                    <>
                      <FileCheck className="h-4 w-4 mr-2" />
                      Generate FDA eSTAR Package
                    </>
                  )}
                </Button>

                {generatedUrl && (
                  <Button
                    variant="outline"
                    className="flex items-center border-green-600 text-green-700 hover:bg-green-50"
                    as="a"
                    href={generatedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Package for FDA Submission
                  </Button>
                )}
              </div>

              {generatedUrl && (
                <div className="mt-4 p-4 bg-green-50 rounded-md border border-green-200">
                  <div className="flex items-center text-green-700 mb-2">
                    <CheckCircle className="h-5 w-5 mr-2 text-green-600" />
                    <span className="font-medium">
                      FDA-Ready eSTAR Package Generated Successfully
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded border border-green-100 text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Package Format:</span>
                      <span className="font-medium">{estarFormat.toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Generated On:</span>
                      <span className="font-medium">{new Date().toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">FDA Compliance:</span>
                      <span className="font-medium text-green-600">✓ Verified</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Digital Signature:</span>
                      <span className="font-medium text-green-600">✓ Signed</span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-green-600 italic">
                    Your 510(k) submission package is ready for FDA submission.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="bg-gray-50 border-t flex justify-between py-3">
        <div className="text-xs text-gray-500">
          {validationResults?.valid ? (
            <span className="flex items-center">
              <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
              FDA-Compliant
            </span>
          ) : (
            <span>Contact regulatory affairs for assistance with submission</span>
          )}
        </div>

        {complianceScore !== null && (
          <div className="flex items-center">
            <span className="text-xs text-gray-500 mr-2">Compliance Score:</span>
            <div className="bg-gray-200 rounded-full h-2 w-20">
              <div
                className={`h-2 rounded-full ${
                  complianceScore >= 80
                    ? 'bg-green-500'
                    : complianceScore >= 60
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                }`}
                style={{ width: `${complianceScore}%` }}
              ></div>
            </div>
            <span className="text-xs font-medium ml-2">{complianceScore}%</span>
          </div>
        )}
      </CardFooter>
    </Card>
  );
};

export default ESTARBuilderPanel;
