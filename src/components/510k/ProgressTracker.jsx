import React, { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  FileSearch,
  Search,
  Database,
  BarChart,
  FileText,
  PenTool,
  BookOpen,
  Loader2,
  Cpu,
  LucideFeather,
} from 'lucide-react';

/**
 * Enhanced progress tracker for 510(k) submission steps
 * Provides detailed feedback, error recovery, and step-by-step guidance
 */
const ProgressTracker = ({
  currentStep,
  totalSteps,
  progress,
  status = 'idle', // idle, processing, complete, error, stuck
  steps = [],
  errors = [],
  logs = [],
  onRetry = () => {},
  onContinue = () => {},
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  // Reset showLogs when status changes
  useEffect(() => {
    if (status === 'error' || status === 'stuck') {
      setShowLogs(true);
    }
  }, [status]);

  // Get appropriate status label and color
  const getStatusInfo = () => {
    switch (status) {
      case 'idle':
        return { label: 'Ready', color: 'bg-gray-100 text-gray-800 border-gray-200' };
      case 'processing':
        return { label: 'Processing', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'complete':
        return { label: 'Complete', color: 'bg-green-100 text-green-800 border-green-200' };
      case 'error':
        return { label: 'Error', color: 'bg-red-100 text-red-800 border-red-200' };
      case 'stuck':
        return { label: 'Stalled', color: 'bg-amber-100 text-amber-800 border-amber-200' };
      default:
        return { label: 'Unknown', color: 'bg-gray-100 text-gray-800 border-gray-200' };
    }
  };

  // Format timestamp for logs
  const formatTime = timestamp => {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Get icon for step based on status
  const getStepIcon = step => {
    switch (step.status) {
      case 'complete':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'waiting':
        return <Clock className="h-5 w-5 text-gray-400" />;
      case 'stuck':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  // Get icon based on step type
  const getStepTypeIcon = type => {
    switch (type) {
      case 'file':
        return <FileSearch className="h-4 w-4" />;
      case 'search':
        return <Search className="h-4 w-4" />;
      case 'database':
        return <Database className="h-4 w-4" />;
      case 'analysis':
        return <BarChart className="h-4 w-4" />;
      case 'report':
        return <FileText className="h-4 w-4" />;
      case 'review':
        return <PenTool className="h-4 w-4" />;
      case 'literature':
        return <BookOpen className="h-4 w-4" />;
      case 'ai':
        return <Cpu className="h-4 w-4" />;
      case 'document':
        return <LucideFeather className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  // Get color for step
  const getStepColor = step => {
    switch (step.status) {
      case 'complete':
        return 'bg-green-50 border-green-100';
      case 'error':
        return 'bg-red-50 border-red-100';
      case 'processing':
        return 'bg-blue-50 border-blue-100';
      case 'waiting':
        return 'bg-gray-50 border-gray-100';
      case 'stuck':
        return 'bg-amber-50 border-amber-100';
      default:
        return 'bg-gray-50 border-gray-100';
    }
  };

  // Show a detailed status badge
  const statusInfo = getStatusInfo();

  // Calculate overall status indicators
  const completedSteps = steps.filter(s => s.status === 'complete').length;
  const hasErrors = errors.length > 0 || steps.some(s => s.status === 'error');
  const isStuck = status === 'stuck';

  return (
    <div className="bg-white rounded-md border border-gray-200 shadow-sm">
      <div className="p-4">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h3 className="font-medium text-gray-800">510(k) Submission Progress</h3>
            <p className="text-sm text-gray-500 mt-1">
              Step {currentStep} of {totalSteps}
              {status === 'complete' && ' • All steps complete'}
            </p>
          </div>
          <Badge variant="outline" className={statusInfo.color}>
            {statusInfo.label}
          </Badge>
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{progress}%</span>
            <span>
              {completedSteps}/{totalSteps} steps
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {(hasErrors || isStuck) && (
          <Alert variant={isStuck ? 'warning' : 'destructive'} className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{isStuck ? 'Process Stalled' : 'Error Encountered'}</AlertTitle>
            <AlertDescription>
              {isStuck
                ? "The process appears to be stuck. Click 'Show Details' for more information or retry the operation."
                : errors.length > 0
                  ? errors[0].message
                  : 'An error occurred during processing. Please check the logs for details.'}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-between">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-blue-600 text-sm flex items-center hover:text-blue-800 focus:outline-none"
          >
            {isOpen ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" /> Hide Details
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" /> Show Details
              </>
            )}
          </button>

          <div className="space-x-2">
            {(status === 'error' || status === 'stuck') && (
              <button
                onClick={onRetry}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
              >
                Retry
              </button>
            )}

            {status === 'complete' && (
              <button
                onClick={onContinue}
                className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
              >
                Continue
              </button>
            )}
          </div>
        </div>

        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleContent className="mt-4 space-y-3">
            {steps.map((step, index) => (
              <div
                key={index}
                className={`border rounded-md overflow-hidden ${getStepColor(step)}`}
              >
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center">
                    <div className="mr-3">{getStepIcon(step)}</div>
                    <div>
                      <div className="flex items-center">
                        <span className="font-medium text-gray-800">{step.name}</span>
                        {step.type && (
                          <Badge
                            variant="outline"
                            className="ml-2 bg-white border-gray-200 text-gray-600 flex items-center"
                          >
                            {getStepTypeIcon(step.type)}
                            <span className="ml-1">{step.type}</span>
                          </Badge>
                        )}
                      </div>
                      {step.description && (
                        <p className="text-xs text-gray-500 mt-1">{step.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center">
                    {step.progress !== undefined &&
                      step.progress < 100 &&
                      step.status === 'processing' && (
                        <div className="mr-3 w-16 bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full"
                            style={{ width: `${step.progress}%` }}
                          />
                        </div>
                      )}
                    {step.timestamp && (
                      <span className="text-xs text-gray-500">{formatTime(step.timestamp)}</span>
                    )}
                  </div>
                </div>

                {step.error && (
                  <div className="px-3 py-2 border-t border-red-100 bg-red-50">
                    <p className="text-xs text-red-600">Error: {step.error}</p>
                  </div>
                )}
              </div>
            ))}

            {logs.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => setShowLogs(!showLogs)}
                  className="text-gray-600 text-sm flex items-center hover:text-gray-800 focus:outline-none mb-2"
                >
                  {showLogs ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-1" /> Hide Process Logs
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-1" /> Show Process Logs ({logs.length})
                    </>
                  )}
                </button>

                {showLogs && (
                  <div className="bg-gray-50 rounded-md border border-gray-200 p-3 max-h-60 overflow-y-auto font-mono text-xs">
                    {logs.map((log, index) => (
                      <div key={index} className="mb-1 last:mb-0 flex">
                        <span className="text-gray-500 mr-2">[{formatTime(log.timestamp)}]</span>
                        <span
                          className={`${log.level === 'error' ? 'text-red-600' : log.level === 'warning' ? 'text-amber-600' : 'text-gray-800'}`}
                        >
                          {log.message}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
};

export default ProgressTracker;
