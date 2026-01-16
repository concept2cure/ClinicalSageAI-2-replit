import React, { useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { HelpCircle, ChevronRight, ChevronLeft, X, Info } from 'lucide-react'

/**
 * Enhanced tooltip component with multi-step walkthrough capabilities
 * for guiding users through the 510(k) submission process.
 */
const GuidedTooltip = ({
  children,
  content,
  steps = [],
  title = 'Help',
  icon = <HelpCircle className="h-4 w-4" />,
  showDismissible = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Handle multi-step navigation
  const handleNextStep = e => {
    e.stopPropagation();
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setIsOpen(false);
      setCurrentStep(0);
    }
  };

  const handlePrevStep = e => {
    e.stopPropagation();
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Handle dismissing tooltip permanently
  const handleDismiss = e => {
    e.stopPropagation();
    setDismissed(true);
    setIsOpen(false);
  };

  if (dismissed && showDismissible) {
    return children;
  }

  return (
    <TooltipProvider>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger asChild onClick={() => setIsOpen(true)}>
          <span className={`inline-flex cursor-help ${className}`}>
            {children}
            {icon && <span className="ml-1">{icon}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-md p-0 bg-white shadow-lg border border-blue-100 rounded-md">
          <div className="flex flex-col">
            <div className="bg-blue-50 p-3 border-b border-blue-100 flex justify-between items-center">
              <h4 className="font-medium text-blue-700 flex items-center">
                <Info className="h-4 w-4 mr-2 text-blue-600" />
                {steps.length > 0 ? `${title} (${currentStep + 1}/${steps.length})` : title}
              </h4>
              {showDismissible && (
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleDismiss}>
                  <X className="h-4 w-4 text-gray-400" />
                </Button>
              )}
            </div>

            <div className="p-4">{steps.length > 0 ? steps[currentStep].content : content}</div>

            {steps.length > 0 && (
              <div className="p-2 flex justify-between border-t border-blue-100">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePrevStep}
                  disabled={currentStep === 0}
                  className="text-blue-600"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNextStep}
                  className="text-blue-600"
                >
                  {currentStep < steps.length - 1 ? (
                    <>
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  ) : (
                    'Close'
                  )}
                </Button>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default GuidedTooltip;
