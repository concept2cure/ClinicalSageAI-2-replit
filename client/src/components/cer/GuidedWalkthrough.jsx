import React, { useState, useEffect } from 'react';
import { PlayCircle, PauseCircle, CheckCircle, XCircle, ArrowRight, RefreshCw, HelpCircle, Info, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

/**
 * Guided Walkthrough Component
 *
 * Provides interactive step-by-step guidance through key CERV2 workflows.
 * This component shows a tour-style interface that highlights elements on the page
 * and provides contextual information about regulatory requirements.
 */
const GuidedWalkthrough = ({
  scenarioId, // Identifier for the specific walkthrough
  title = 'Guided Tour', // Title of the walkthrough
  description, // Description of the walkthrough
  steps = [], // Array of steps with element selectors and content
  difficulty = 'beginner', // Difficulty level: beginner, intermediate, expert
  duration = '5 min', // Estimated duration
  category = 'general', // Category: general, regulatory, clinical, technical
  onComplete, // Callback when walkthrough is completed
  onCancel, // Callback when walkthrough is cancelled
  children, // Trigger element
}) => {
  // State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [hasCompletedBefore, setHasCompletedBefore] = useState(false);

  // Current step
  const currentStep = steps[currentStepIndex] || null;

  // Progress percentage
  const progressPercentage =
    steps.length > 0 ? Math.round((currentStepIndex / steps.length) * 100) : 0;

  // Load completion status from localStorage on mount
  useEffect(() => {
    if (scenarioId) {
      try {
        const savedWalkthroughs = JSON.parse(
          localStorage.getItem('cerv2CompletedWalkthroughs') || '{}'
        );
        setHasCompletedBefore(!!savedWalkthroughs[scenarioId]);
      } catch (error) {
        console.error('Error loading walkthrough status:', error);
      }
    }
  }, [scenarioId]);

  // Save completion status to localStorage when completed
  useEffect(() => {
    if (completedSteps.length === steps.length && steps.length > 0 && scenarioId) {
      try {
        const savedWalkthroughs = JSON.parse(
          localStorage.getItem('cerv2CompletedWalkthroughs') || '{}'
        );
        savedWalkthroughs[scenarioId] = {
          completedAt: new Date().toISOString(),
          title,
        };
        localStorage.setItem('cerv2CompletedWalkthroughs', JSON.stringify(savedWalkthroughs));
        setHasCompletedBefore(true);
      } catch (error) {
        console.error('Error saving walkthrough status:', error);
      }
    }
  }, [completedSteps, steps.length, scenarioId, title]);

  // Start walkthrough
  const startWalkthrough = () => {
    setIsDialogOpen(false);
    setIsActive(true);
    setCurrentStepIndex(0);
    setCompletedSteps([]);
  };

  // End walkthrough
  const endWalkthrough = (completed = false) => {
    setIsActive(false);

    if (completed) {
      if (onComplete) {
        onComplete();
      }
    } else {
      if (onCancel) {
        onCancel();
      }
    }
  };

  // Move to next step
  const nextStep = () => {
    // Mark current step as completed
    setCompletedSteps(prev => [...prev, currentStepIndex]);

    // Check if we're at the last step
    if (currentStepIndex >= steps.length - 1) {
      endWalkthrough(true);
    } else {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  // Move to previous step
  const prevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  // Render tooltip for active walkthrough step
  const renderActiveStep = () => {
    if (!isActive || !currentStep) return null;

    // Find element by selector
    let targetElement = null;
    if (currentStep.selector) {
      targetElement = document.querySelector(currentStep.selector);
    }

    // If no element found, use a default position
    if (!targetElement) {
      return (
        <div
          className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50"
          style={{ maxWidth: '400px' }}
        >
          {renderStepContent()}
        </div>
      );
    }

    // Get element position
    const rect = targetElement.getBoundingClientRect();

    // Determine position
    const position = currentStep.position || 'bottom';

    // Calculate position
    let top, left;
    switch (position) {
      case 'top':
        top = rect.top - 10;
        left = rect.left + rect.width / 2;
        break;
      case 'bottom':
        top = rect.bottom + 10;
        left = rect.left + rect.width / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left - 10;
        break;
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right + 10;
        break;
      default:
        top = rect.bottom + 10;
        left = rect.left + rect.width / 2;
    }

    // Add highlight to target element
    targetElement.classList.add('highlight-element');

    // Remove highlight when step changes
    return () => {
      if (targetElement) {
        targetElement.classList.remove('highlight-element');
      }
    };
  };

  // Render step content
  const renderStepContent = () => {
    if (!currentStep) return null;

    return (
      <div className="p-4 bg-white rounded-lg shadow-lg border border-blue-100">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-sm flex items-center gap-1.5">
            <Info size={14} className="text-blue-500" />
            {currentStep.title}
          </h4>
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="text-xs h-5">
              Step {currentStepIndex + 1} of {steps.length}
            </Badge>
          </div>
        </div>

        <div className="text-sm text-gray-700 mb-4">
          {currentStep.content}

          {currentStep.regulatoryReference && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <Badge variant="outline" className="text-xs">
                {currentStep.regulatoryReference}
              </Badge>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => endWalkthrough(false)}
            className="h-8 text-xs gap-1"
          >
            <XCircle size={14} />
            Exit Tour
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={prevStep}
              disabled={currentStepIndex === 0}
              className="h-8 text-xs"
            >
              Back
            </Button>

            <Button variant="default" size="sm" onClick={nextStep} className="h-8 text-xs gap-1">
              {currentStepIndex < steps.length - 1 ? (
                <>
                  Next
                  <ArrowRight size={14} />
                </>
              ) : (
                <>
                  Finish
                  <CheckCircle size={14} />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Get difficulty badge color
  const getDifficultyColor = () => {
    switch (difficulty) {
      case 'beginner':
        return 'bg-green-50 text-green-700';
      case 'intermediate':
        return 'bg-blue-50 text-blue-700';
      case 'expert':
        return 'bg-purple-50 text-purple-700';
      default:
        return 'bg-gray-50 text-gray-700';
    }
  };

  return (
    <>
      {/* Dialog trigger */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          {children || (
            <Button variant="ghost" size="sm" className="h-8 gap-1">
              <PlayCircle size={14} />
              {hasCompletedBefore ? 'Replay' : 'Start'} {title}
              {hasCompletedBefore && <CheckCircle size={14} className="text-green-500 ml-1" />}
            </Button>
          )}
        </DialogTrigger>

        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen size={18} />
              {title}
              {hasCompletedBefore && (
                <Badge variant="secondary" className="ml-2 bg-green-50 text-green-700">
                  Completed
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={`${getDifficultyColor()}`}>
                  {difficulty}
                </Badge>
                <Badge variant="outline" className="bg-gray-50">
                  {duration}
                </Badge>
                <Badge variant="outline" className="bg-blue-50 text-blue-700">
                  {category}
                </Badge>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-medium">You'll learn:</h4>
                <ul className="space-y-1">
                  {steps.slice(0, 3).map((step, index) => (
                    <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                      <ArrowRight size={14} className="mt-1 flex-shrink-0 text-blue-500" />
                      {step.title}
                    </li>
                  ))}
                  {steps.length > 3 && (
                    <li className="text-sm text-gray-700 flex items-start gap-2">
                      <Info size={14} className="mt-1 flex-shrink-0 text-blue-500" />
                      And {steps.length - 3} more steps...
                    </li>
                  )}
                </ul>
              </div>

              {currentStep?.screenshot && (
                <div className="rounded-md overflow-hidden border border-gray-200">
                  <img
                    src={currentStep.screenshot}
                    alt={`${title} preview`}
                    className="w-full h-auto"
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={startWalkthrough} className="gap-1">
              {hasCompletedBefore ? (
                <>
                  <RefreshCw size={14} />
                  Replay Walkthrough
                </>
              ) : (
                <>
                  <PlayCircle size={14} />
                  Start Walkthrough
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Active walkthrough */}
      {isActive && renderActiveStep()}

      {/* Progress indicator when walkthrough is active */}
      {isActive && (
        <div className="fixed bottom-4 right-4 z-50 bg-white rounded-lg shadow-lg p-4 border border-blue-100 w-64">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-medium flex items-center gap-1.5">
              <BookOpen size={14} className="text-blue-500" />
              {title}
            </h4>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => endWalkthrough(false)}
              className="h-6 w-6"
            >
              <XCircle size={12} />
            </Button>
          </div>

          <div className="space-y-2">
            <Progress value={progressPercentage} className="h-1.5" />
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                Step {currentStepIndex + 1} of {steps.length}
              </span>
              <span>{progressPercentage}% complete</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Pre-defined walkthrough scenarios
export const walkthroughScenarios = {
  cerBasics: {
    id: 'cer_basics',
    title: 'CER Fundamentals',
    description: 'Learn the basics of creating a compliant Clinical Evaluation Report',
    difficulty: 'beginner',
    duration: '5 min',
    category: 'regulatory',
    steps: [
      {
        title: 'Device Profile',
        content:
          'Start by creating a detailed device profile. This establishes the scope of your CER and determines which regulations apply.',
        selector: '#device-profile-section',
        position: 'bottom',
        regulatoryReference: 'MDR Annex II, Section 1',
      },
      {
        title: 'Literature Search',
        content:
          'Conduct a systematic literature search to gather relevant clinical evidence for your device or equivalent devices.',
        selector: '#literature-search-section',
        position: 'right',
        regulatoryReference: 'MEDDEV 2.7/1 Rev4, Section 8',
      },
      {
        title: 'Equivalence Assessment',
        content:
          'Establish equivalence with similar devices to leverage their clinical data in your evaluation.',
        selector: '#equivalence-section',
        position: 'left',
        regulatoryReference: 'MDR Annex XIV, Part A',
      },
      {
        title: 'Clinical Data Analysis',
        content: 'Analyze the clinical data to evaluate device performance and safety.',
        selector: '#clinical-data-section',
        position: 'top',
        regulatoryReference: 'MEDDEV 2.7/1 Rev4, Section 9',
      },
      {
        title: 'Benefit-Risk Analysis',
        content: "Perform a thorough benefit-risk analysis to justify your device's use.",
        selector: '#benefit-risk-section',
        position: 'right',
        regulatoryReference: 'MDR Annex I',
      },
    ],
  },

  literatureReview: {
    id: 'literature_review',
    title: 'Literature Review Process',
    description: 'Master the literature review process for CER creation',
    difficulty: 'intermediate',
    duration: '8 min',
    category: 'clinical',
    steps: [
      {
        title: 'Search Strategy',
        content:
          'Develop a comprehensive search strategy with carefully defined search terms and inclusion/exclusion criteria.',
        selector: '#literature-search-strategy',
        position: 'bottom',
        regulatoryReference: 'MEDDEV 2.7/1 Rev4, Section 8.2',
      },
      {
        title: 'Database Selection',
        content:
          'Select appropriate scientific databases for your search, including PubMed, Embase, and Cochrane Library.',
        selector: '#database-selection',
        position: 'right',
        regulatoryReference: 'MEDDEV 2.7/1 Rev4, Section 8.3',
      },
      {
        title: 'Study Selection',
        content: 'Screen and select relevant studies based on your predefined criteria.',
        selector: '#study-selection',
        position: 'bottom',
        regulatoryReference: 'MEDDEV 2.7/1 Rev4, Section 8.5',
      },
      {
        title: 'Data Extraction',
        content: 'Extract relevant data from selected studies in a systematic manner.',
        selector: '#data-extraction',
        position: 'left',
        regulatoryReference: 'MEDDEV 2.7/1 Rev4, Section 8.6',
      },
      {
        title: 'Quality Assessment',
        content: 'Assess the methodological quality of included studies using recognized tools.',
        selector: '#quality-assessment',
        position: 'top',
        regulatoryReference: 'MEDDEV 2.7/1 Rev4, Section 9.3.1',
      },
      {
        title: 'Data Synthesis',
        content:
          'Synthesize the extracted data to draw conclusions about device safety and performance.',
        selector: '#data-synthesis',
        position: 'right',
        regulatoryReference: 'MEDDEV 2.7/1 Rev4, Section 9.3.2',
      },
    ],
  },

  reportGeneration: {
    id: 'report_generation',
    title: 'CER Report Generation',
    description: 'Learn how to generate a compliant CER document',
    difficulty: 'beginner',
    duration: '3 min',
    category: 'technical',
    steps: [
      {
        title: 'Report Structure',
        content: 'Understand the required structure of a CER according to regulatory guidelines.',
        selector: '#report-structure',
        position: 'bottom',
        regulatoryReference: 'MEDDEV 2.7/1 Rev4, Section 10',
      },
      {
        title: 'Format Selection',
        content:
          'Choose the appropriate format for your CER based on your submission requirements.',
        selector: '#format-selection',
        position: 'right',
        regulatoryReference: 'MEDDEV 2.7/1 Rev4, Appendix A9',
      },
      {
        title: 'Document Generation',
        content: 'Generate your CER document with all required sections and proper formatting.',
        selector: '#document-generation',
        position: 'top',
        regulatoryReference: 'MEDDEV 2.7/1 Rev4, Section 10.2',
      },
      {
        title: 'Review and Export',
        content: 'Review your generated CER for completeness and export it in the desired format.',
        selector: '#export-options',
        position: 'left',
        regulatoryReference: 'MEDDEV 2.7/1 Rev4, Section 10.3',
      },
    ],
  },
};

export default GuidedWalkthrough;
