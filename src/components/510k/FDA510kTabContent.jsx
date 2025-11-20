import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Search,
  FileText,
  GitCompare,
  CheckSquare,
  Archive,
  ArrowRight,
  Database,
  CheckCircle,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import PredicateFinderPanel from '@/components/510k/PredicateFinderPanel';
import EquivalenceBuilderPanel from '@/components/cer/EquivalenceBuilderPanel';
import ComplianceScorePanel from '@/components/cer/ComplianceScorePanel';
import ReportGenerator from '@/components/510k/ReportGenerator';
import WorkflowPanel from '@/components/510k/WorkflowPanel';

/**
 * The FDA510kTabContent component serves as the container for all 510(k) submission
 * related functionality, organized as a card-based pipeline workflow.
 */
function FDA510kTabContent({
  deviceProfile,
  activeTab,
  onTabChange,
  onComplianceChange,
  onComplianceStatusChange,
  isComplianceRunning,
  setIsComplianceRunning,
  compliance,
  sections,
}) {
  const { toast } = useToast();
  const [workflowStep, setWorkflowStep] = useState(1);
  const [workflowProgress, setWorkflowProgress] = useState(0);
  const [predicatesFound, setPredicatesFound] = useState(false);
  const [equivalenceCompleted, setEquivalenceCompleted] = useState(false);
  const [complianceScore, setComplianceScore] = useState(null);
  const [submissionReady, setSubmissionReady] = useState(false);

  // Function to handle tab change
  const handleTabChange = tab => {
    if (typeof onTabChange === 'function') {
      onTabChange(tab);
    }
  };

  // Update workflow progress when steps change
  useEffect(() => {
    // Calculate progress based on workflow step
    const progressMap = {
      1: deviceProfile ? 25 : 5,
      2: predicatesFound ? 50 : 30,
      3: equivalenceCompleted ? 75 : 55,
      4: complianceScore ? 90 : 80,
      5: submissionReady ? 100 : 95,
    };

    setWorkflowProgress(progressMap[workflowStep] || 0);
  }, [
    workflowStep,
    deviceProfile,
    predicatesFound,
    equivalenceCompleted,
    complianceScore,
    submissionReady,
  ]);

  // Set active tab when workflow step changes
  useEffect(() => {
    const tabMap = {
      1: 'predicates', // Device Profile (displayed in Predicate Finder)
      2: 'predicates', // Predicate Finder
      3: 'equivalence', // Substantial Equivalence
      4: 'compliance', // Compliance Check
      5: 'submission', // Final Submission
    };

    handleTabChange(tabMap[workflowStep]);
  }, [workflowStep]);

  // Navigation functions
  const goToStep = step => {
    if (step >= 1 && step <= 5) {
      setWorkflowStep(step);
    }
  };

  const nextStep = () => {
    if (workflowStep < 5) {
      setWorkflowStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    if (workflowStep > 1) {
      setWorkflowStep(prev => prev - 1);
    }
  };

  // Create a completed handler for predicate finder
  const handlePredicatesComplete = data => {
    setPredicatesFound(true);
    toast({
      title: 'Predicate Devices Found',
      description: `Found ${data?.length || 'multiple'} potential predicate devices that match your criteria.`,
      variant: 'success',
    });

    // Automatically advance to next step after short delay
    setTimeout(() => {
      nextStep();
    }, 500);
  };

  // Create a completed handler for equivalence builder
  const handleEquivalenceComplete = data => {
    setEquivalenceCompleted(true);
    toast({
      title: 'Equivalence Analysis Complete',
      description: 'Substantial equivalence documentation has been prepared.',
      variant: 'success',
    });
  };

  // Create a completed handler for compliance check
  const handleComplianceComplete = score => {
    setComplianceScore(score);
    toast({
      title: 'Compliance Check Complete',
      description: `Your 510(k) submission is ${score}% compliant with FDA requirements.`,
      variant: score > 80 ? 'success' : 'warning',
    });
  };

  // Create a completed handler for final submission
  const handleSubmissionReady = () => {
    setSubmissionReady(true);
    toast({
      title: 'Submission Package Ready',
      description: 'Your 510(k) submission package is now ready for final review.',
      variant: 'success',
    });
  };

  // Render the workflow progress bar
  const renderProgressBar = () => (
    <div className="mb-8 bg-white p-6 rounded-lg shadow-sm border border-blue-100">
      <div className="flex justify-between mb-3 items-center">
        <h3 className="text-lg font-medium text-blue-800">510(k) Submission Pipeline</h3>
        <div className="flex items-center">
          <span className="text-sm font-medium text-blue-700 mr-2">
            {workflowProgress}% Complete
          </span>
        </div>
      </div>

      <Progress value={workflowProgress} className="h-2 mb-4" />

      <div className="grid grid-cols-5 gap-2">
        <div
          className={`p-3 rounded-lg text-center cursor-pointer transition-all
            ${
              workflowStep === 1
                ? 'bg-blue-100 ring-2 ring-blue-400 shadow-md'
                : deviceProfile
                  ? 'bg-blue-50 text-blue-800'
                  : 'bg-gray-100 text-gray-600'
            }
            ${deviceProfile ? 'hover:bg-blue-100' : 'hover:bg-gray-200'}`}
          onClick={() => goToStep(1)}
        >
          <div
            className={`rounded-full h-8 w-8 flex items-center justify-center mx-auto mb-1 
            ${deviceProfile ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}
          >
            {deviceProfile ? <CheckCircle className="h-4 w-4" /> : '1'}
          </div>
          <div className="text-xs font-medium">Device Profile</div>
          {deviceProfile && (
            <div className="text-xs mt-1 truncate max-w-full">{deviceProfile.deviceName}</div>
          )}
        </div>

        <div
          className={`p-3 rounded-lg text-center cursor-pointer transition-all
            ${
              workflowStep === 2
                ? 'bg-blue-100 ring-2 ring-blue-400 shadow-md'
                : predicatesFound
                  ? 'bg-blue-50 text-blue-800'
                  : 'bg-gray-100 text-gray-600'
            }
            ${deviceProfile ? 'hover:bg-blue-100' : 'hover:bg-gray-200'}`}
          onClick={() => deviceProfile && goToStep(2)}
        >
          <div
            className={`rounded-full h-8 w-8 flex items-center justify-center mx-auto mb-1 
            ${predicatesFound ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}
          >
            {predicatesFound ? <CheckCircle className="h-4 w-4" /> : '2'}
          </div>
          <div className="text-xs font-medium">Predicate Search</div>
        </div>

        <div
          className={`p-3 rounded-lg text-center cursor-pointer transition-all
            ${
              workflowStep === 3
                ? 'bg-blue-100 ring-2 ring-blue-400 shadow-md'
                : equivalenceCompleted
                  ? 'bg-blue-50 text-blue-800'
                  : 'bg-gray-100 text-gray-600'
            }
            ${predicatesFound ? 'hover:bg-blue-100' : 'hover:bg-gray-200'}`}
          onClick={() => predicatesFound && goToStep(3)}
        >
          <div
            className={`rounded-full h-8 w-8 flex items-center justify-center mx-auto mb-1 
            ${equivalenceCompleted ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}
          >
            {equivalenceCompleted ? <CheckCircle className="h-4 w-4" /> : '3'}
          </div>
          <div className="text-xs font-medium">Equivalence</div>
        </div>

        <div
          className={`p-3 rounded-lg text-center cursor-pointer transition-all
            ${
              workflowStep === 4
                ? 'bg-blue-100 ring-2 ring-blue-400 shadow-md'
                : complianceScore
                  ? 'bg-blue-50 text-blue-800'
                  : 'bg-gray-100 text-gray-600'
            }
            ${equivalenceCompleted ? 'hover:bg-blue-100' : 'hover:bg-gray-200'}`}
          onClick={() => equivalenceCompleted && goToStep(4)}
        >
          <div
            className={`rounded-full h-8 w-8 flex items-center justify-center mx-auto mb-1 
            ${complianceScore ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}
          >
            {complianceScore ? <CheckCircle className="h-4 w-4" /> : '4'}
          </div>
          <div className="text-xs font-medium">Compliance</div>
          {complianceScore && <div className="text-xs mt-1">{complianceScore}% Ready</div>}
        </div>

        <div
          className={`p-3 rounded-lg text-center cursor-pointer transition-all
            ${
              workflowStep === 5
                ? 'bg-blue-100 ring-2 ring-blue-400 shadow-md'
                : submissionReady
                  ? 'bg-blue-50 text-blue-800'
                  : 'bg-gray-100 text-gray-600'
            }
            ${complianceScore ? 'hover:bg-blue-100' : 'hover:bg-gray-200'}`}
          onClick={() => complianceScore && goToStep(5)}
        >
          <div
            className={`rounded-full h-8 w-8 flex items-center justify-center mx-auto mb-1 
            ${submissionReady ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'}`}
          >
            {submissionReady ? <CheckCircle className="h-4 w-4" /> : '5'}
          </div>
          <div className="text-xs font-medium">Final Submission</div>
        </div>
      </div>

      <div className="flex justify-between mt-4">
        <Button variant="outline" size="sm" onClick={prevStep} disabled={workflowStep === 1}>
          Previous Step
        </Button>

        <Button
          variant="default"
          size="sm"
          onClick={nextStep}
          disabled={
            (workflowStep === 1 && !deviceProfile) ||
            (workflowStep === 2 && !predicatesFound) ||
            (workflowStep === 3 && !equivalenceCompleted) ||
            (workflowStep === 4 && !complianceScore) ||
            workflowStep === 5
          }
        >
          Next Step
        </Button>
      </div>
    </div>
  );

  // Render the content panels
  const renderStepContent = () => {
    switch (workflowStep) {
      case 1:
      case 2:
        return (
          <div className="space-y-4">
            <PredicateFinderPanel
              deviceProfile={deviceProfile}
              setDeviceProfile={newProfile => {
                // Pass the updated device profile back to parent if needed
              }}
              documentId={deviceProfile?.id}
              onPredicatesFound={handlePredicatesComplete}
            />
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <EquivalenceBuilderPanel
              deviceProfile={deviceProfile}
              setDeviceProfile={newProfile => {
                // Pass the updated device profile back to parent if needed
              }}
              documentId={deviceProfile?.id}
              onComplete={handleEquivalenceComplete}
            />
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <ComplianceScorePanel
              deviceProfile={deviceProfile}
              setDeviceProfile={newProfile => {
                // Pass the updated device profile back to parent if needed
              }}
              documentId={deviceProfile?.id}
              compliance={compliance}
              setCompliance={complianceData => {
                onComplianceChange(complianceData);
                if (complianceData?.score) {
                  handleComplianceComplete(Math.round(complianceData.score * 100));
                }
              }}
              isLoading={isComplianceRunning}
              setIsLoading={setIsComplianceRunning}
            />
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <ReportGenerator
              deviceProfile={deviceProfile}
              documentId={deviceProfile?.id}
              exportTimestamp={new Date().toISOString()}
              draftStatus={compliance?.status || 'draft'}
              setDraftStatus={onComplianceStatusChange}
              sections={sections}
              onSubmissionReady={handleSubmissionReady}
            />
          </div>
        );

      default:
        return (
          <div className="text-center p-8">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium">Invalid Step</h3>
            <p className="text-gray-600 mt-2">Please navigate to a valid workflow step</p>
            <Button onClick={() => setWorkflowStep(1)} className="mt-4">
              Return to Start
            </Button>
          </div>
        );
    }
  };

  // Use the new WorkflowPanel component instead of the manual progression
  return (
    <div className="p-4 space-y-4">
      <WorkflowPanel
        deviceProfile={deviceProfile}
        predicates={[]}
        activeStep={workflowStep}
        onStepChange={setWorkflowStep}
        onPredicatesFound={handlePredicatesComplete}
        onEquivalenceComplete={handleEquivalenceComplete}
        onComplianceComplete={handleComplianceComplete}
        onSubmissionReady={handleSubmissionReady}
        complianceStatus={compliance?.status || 'draft'}
        sections={sections}
      />
    </div>
  );
}

export default FDA510kTabContent;
