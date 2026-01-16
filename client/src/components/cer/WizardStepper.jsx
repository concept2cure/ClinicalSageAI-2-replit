import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, ChevronRight, AlertCircle, Info } from 'lucide-react'
import { useToast } from '@/components/ui/toaster';
import CerTooltipWrapper from './CerTooltipWrapper';

/**
 * WizardStepper Component
 *
 * A Microsoft 365-style wizard stepper component for guiding users through the CER creation process.
 * Provides visual progress tracking and ensures users complete each step in the correct order.
 */
export default function WizardStepper({
  steps,
  currentStep,
  onStepChange,
  completedSteps = [],
  className = '',
  children,
}) {
  // Map currentStep string to index if needed
  const currentStepIndex =
    typeof currentStep === 'string' && steps
      ? steps.findIndex(step => step.id === currentStep)
      : currentStep || 0;
  const { toast } = useToast();
  const [stepsState, setStepsState] = useState([]);

  // Initialize steps with completion state
  useEffect(() => {
    setStepsState(
      steps.map((step, index) => ({
        ...step,
        isCompleted: completedSteps.includes(index),
        isCurrent: index === currentStepIndex,
      }))
    );
  }, [steps, currentStepIndex, completedSteps]);

  // Handle step click
  const handleStepClick = index => {
    // Only allow clicking on completed steps or the next available step
    if (index <= currentStepIndex || completedSteps.includes(index - 1) || index === 0) {
      onStepChange(index);
    } else {
      // Show toast when user tries to skip steps
      toast({
        title: 'Complete previous steps first',
        description: `Please complete "${steps[currentStepIndex].label}" before moving to "${steps[index].label}".`,
        variant: 'default',
      });
    }
  };

  return (
    <div className="w-full">
      {/* Stepper Navigation */}
      <div className="mb-4 border border-[#E1DFDD] rounded-md bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-[#323130]">CER Builder Wizard</h3>
          <div className="text-xs text-[#616161]">
            Step {currentStepIndex + 1} of {steps.length}
          </div>
        </div>

        {/* Steps */}
        <div className="flex flex-wrap items-center">
          {stepsState.map((step, index) => (
            <React.Fragment key={index}>
              {/* Step button */}
              <div
                className={`flex items-center cursor-pointer transition-colors ${
                  index === currentStepIndex
                    ? 'text-[#0F6CBD] font-medium'
                    : step.isCompleted
                      ? 'text-[#107C10]'
                      : 'text-[#616161]'
                }`}
                onClick={() => handleStepClick(index)}
              >
                <CerTooltipWrapper
                  content={
                    <div className="max-w-xs">
                      <p className="font-semibold mb-1">{step.label}</p>
                      <p>{step.description}</p>
                      {step.isCompleted && <p className="mt-1 text-green-600">Completed</p>}
                      {step.validationErrors && step.validationErrors.length > 0 && (
                        <div className="mt-1 text-amber-600">
                          <p className="font-medium">Required actions:</p>
                          <ul className="list-disc pl-4 mt-1">
                            {step.validationErrors.map((error, i) => (
                              <li key={i}>{error}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  }
                >
                  <div className="flex items-center">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 ${
                        step.isCompleted
                          ? 'bg-[#DFF6DD] text-[#107C10]'
                          : index === currentStepIndex
                            ? 'bg-[#E5F2FF] text-[#0F6CBD]'
                            : 'bg-[#F3F2F1] text-[#616161]'
                      }`}
                    >
                      {step.isCompleted ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : step.validationErrors && step.validationErrors.length > 0 ? (
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                      ) : (
                        <Info className="w-4 h-4" />
                      )}
                    </div>
                    <span className="text-sm">{step.label}</span>
                  </div>
                </CerTooltipWrapper>
              </div>

              {/* Divider, except after the last step */}
              {index < steps.length - 1 && <ChevronRight className="mx-2 text-[#C8C6C4] w-4 h-4" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="rounded-md border border-[#E1DFDD] bg-white">{children}</div>

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-4">
        <Button
          variant="outline"
          onClick={() => handleStepClick(Math.max(0, currentStepIndex - 1))}
          disabled={currentStepIndex === 0}
          className="text-[#323130] border-[#8A8886] hover:bg-[#F3F2F1]"
        >
          Previous
        </Button>

        <Button
          onClick={() => handleStepClick(Math.min(steps.length - 1, currentStepIndex + 1))}
          disabled={currentStepIndex === steps.length - 1}
          className="bg-[#0F6CBD] hover:bg-[#115EA3] text-white"
        >
          {currentStepIndex === steps.length - 2 ? 'Complete' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
