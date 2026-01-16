import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, ArrowRight, Shield, RotateCw } from 'lucide-react'

/**
 * Error Recovery UI Component
 *
 * A resilient, reusable component that provides error recovery UI for critical workflow
 * failures across the entire application, with specialized handling for the CERV2 module.
 *
 * @param {Object} props Component props
 * @param {string} props.errorType The type of error that occurred
 * @param {Function} props.onRetry Function to call when user clicks retry
 * @param {Function} props.onContinue Function to call when user chooses to continue with fallback data
 * @param {Function} props.onReset Function to call when user wants to reset the workflow
 * @param {string} props.title Custom error title
 * @param {string} props.description Custom error description
 * @param {Object} props.errorDetails Additional error details
 * @param {boolean} props.compact Whether to show a compact version of the UI
 * @param {React.ReactNode} props.children Optional additional content
 */
const ErrorRecoveryUI = ({
  errorType = 'general',
  onRetry,
  onContinue,
  onReset,
  title,
  description,
  errorDetails,
  compact = false,
  children,
}) => {
  // Determine error content based on type
  const getErrorContent = () => {
    switch (errorType) {
      case 'predicate-search':
        return {
          title: title || 'Predicate Device Search Error',
          description:
            description ||
            'We encountered an issue while searching for predicate devices. Emergency recovery measures have been applied.',
          retryText: 'Try Searching Again',
          continueText: 'Continue with Recovery Data',
          resetText: 'Reset Workflow',
        };
      case 'literature-search':
        return {
          title: title || 'Literature Search Error',
          description:
            description ||
            'We encountered an issue while searching for literature. Emergency recovery measures have been applied.',
          retryText: 'Try Searching Again',
          continueText: 'Continue with Recovery Data',
          resetText: 'Reset Workflow',
        };
      case 'equivalence-builder':
        return {
          title: title || 'Equivalence Builder Error',
          description:
            description ||
            'We encountered an issue in the equivalence builder. Emergency recovery measures have been applied.',
          retryText: 'Retry Loading Equivalence Data',
          continueText: 'Continue with Recovery Data',
          resetText: 'Reset Workflow',
        };
      case 'compliance-check':
        return {
          title: title || 'Compliance Check Error',
          description:
            description ||
            'We encountered an issue during the compliance check. Emergency recovery measures have been applied.',
          retryText: 'Retry Compliance Check',
          continueText: 'Continue with Recovery Data',
          resetText: 'Reset Workflow',
        };
      case 'estar-generation':
        return {
          title: title || 'eSTAR Generation Error',
          description:
            description ||
            'We encountered an issue while generating the eSTAR document. Emergency recovery measures have been applied.',
          retryText: 'Retry eSTAR Generation',
          continueText: 'Continue with Recovery Data',
          resetText: 'Reset Workflow',
        };
      case 'workflow-transition':
        return {
          title: title || 'Workflow Transition Error',
          description:
            description ||
            'We encountered an issue while transitioning between workflow steps. Emergency recovery measures have been applied.',
          retryText: 'Retry Transition',
          continueText: 'Continue with Recovery',
          resetText: 'Reset Workflow',
        };
      default:
        return {
          title: title || 'System Error',
          description:
            description ||
            'We encountered an issue. Emergency recovery measures have been applied.',
          retryText: 'Retry Operation',
          continueText: 'Continue with Recovery',
          resetText: 'Reset',
        };
    }
  };

  const errorContent = getErrorContent();

  if (compact) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{errorContent.title}</AlertTitle>
        <AlertDescription className="mt-2">
          {errorContent.description}

          <div className="flex flex-row gap-2 mt-3">
            {onRetry && (
              <Button onClick={onRetry} variant="default" size="sm" className="h-8">
                <RefreshCw className="mr-1 h-3 w-3" />
                <span className="text-xs">{errorContent.retryText}</span>
              </Button>
            )}

            {onContinue && (
              <Button onClick={onContinue} variant="outline" size="sm" className="h-8">
                <ArrowRight className="mr-1 h-3 w-3" />
                <span className="text-xs">Continue</span>
              </Button>
            )}
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="border-red-200 shadow-md">
      <CardHeader className="bg-red-50 dark:bg-red-900/20">
        <div className="flex items-center">
          <Shield className="h-5 w-5 mr-2 text-red-500" />
          <CardTitle className="text-red-700 dark:text-red-300">{errorContent.title}</CardTitle>
        </div>
        <CardDescription className="text-red-600/80 dark:text-red-400/80">
          Error Recovery System Active
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-4">
        <p className="mb-4 text-sm">{errorContent.description}</p>

        {errorDetails && (
          <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-md text-xs font-mono mt-2 mb-2 border border-slate-200 dark:border-slate-800">
            <p className="text-slate-500 dark:text-slate-400">Error details:</p>
            <pre className="whitespace-pre-wrap overflow-auto max-h-24">
              {typeof errorDetails === 'string'
                ? errorDetails
                : JSON.stringify(errorDetails, null, 2)}
            </pre>
          </div>
        )}

        {children}
      </CardContent>

      <CardFooter className="flex flex-col sm:flex-row gap-2 bg-slate-50 dark:bg-slate-900/50 rounded-b-lg">
        {onRetry && (
          <Button onClick={onRetry} variant="default" className="w-full sm:w-auto">
            <RefreshCw className="mr-2 h-4 w-4" />
            {errorContent.retryText}
          </Button>
        )}

        {onContinue && (
          <Button onClick={onContinue} variant="outline" className="w-full sm:w-auto">
            <ArrowRight className="mr-2 h-4 w-4" />
            {errorContent.continueText}
          </Button>
        )}

        {onReset && (
          <Button onClick={onReset} variant="ghost" className="w-full sm:w-auto">
            <RotateCw className="mr-2 h-4 w-4" />
            {errorContent.resetText}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default ErrorRecoveryUI;
