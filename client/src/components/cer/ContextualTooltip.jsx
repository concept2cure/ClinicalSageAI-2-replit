import React, { useState, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  HelpCircle, X, Info, LightbulbIcon, CheckCircle, ChevronRight, ChevronLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge';

/**
 * ContextualTooltip Component for CERV2
 *
 * Provides context-aware tooltips with enhanced features:
 * - Multi-step walkthroughs
 * - Persistent dismissal options
 * - Progress tracking
 * - Regulatory context
 */
const ContextualTooltip = ({
  id, // Unique identifier
  children, // Trigger element (what users interact with)
  title, // Tooltip title
  content, // Tooltip content (string or JSX)
  steps = [], // Array of steps for multi-step tooltip
  relevantRegulations = [], // Array of regulatory references
  featureArea = 'general', // Feature area (for tracking)
  expertise = 1, // Required expertise level (1-5)
  placement = 'top', // Tooltip placement
  className = '', // Additional CSS classes
  width = 'md', // Width: sm, md, lg, xl
  onDismiss, // Callback when dismissed
  showIndicator = true, // Whether to show the help indicator
  persistDismissal = true, // Whether to remember dismissal between sessions
}) => {
  // State
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPermanentlyDismissed, setIsPermanentlyDismissed] = useState(false);
  const [hasBeenSeen, setHasBeenSeen] = useState(false);

  // Determine if we're in multi-step mode
  const isMultiStep = steps && steps.length > 0;

  // Content to display (from steps array if multi-step, or direct content prop)
  const displayContent = isMultiStep ? steps[currentStep]?.content : content;

  const displayTitle = isMultiStep ? steps[currentStep]?.title || title : title;

  // Check local storage for dismissed state on mount
  useEffect(() => {
    if (persistDismissal && id) {
      const dismissedTooltips = JSON.parse(localStorage.getItem('cerv2DismissedTooltips') || '{}');
      if (dismissedTooltips[id]) {
        setIsPermanentlyDismissed(true);
      }

      const seenTooltips = JSON.parse(localStorage.getItem('cerv2SeenTooltips') || '{}');
      if (seenTooltips[id]) {
        setHasBeenSeen(true);
      }
    }
  }, [id, persistDismissal]);

  // Handle permanent dismissal
  const handlePermanentDismiss = () => {
    setIsOpen(false);
    setIsPermanentlyDismissed(true);

    if (persistDismissal && id) {
      const dismissedTooltips = JSON.parse(localStorage.getItem('cerv2DismissedTooltips') || '{}');
      dismissedTooltips[id] = true;
      localStorage.setItem('cerv2DismissedTooltips', JSON.stringify(dismissedTooltips));
    }

    if (onDismiss) {
      onDismiss(id, true);
    }
  };

  // Handle opening the tooltip
  const handleOpen = () => {
    if (isPermanentlyDismissed) return;

    setIsOpen(true);

    if (!hasBeenSeen && id) {
      setHasBeenSeen(true);
      const seenTooltips = JSON.parse(localStorage.getItem('cerv2SeenTooltips') || '{}');
      seenTooltips[id] = true;
      localStorage.setItem('cerv2SeenTooltips', JSON.stringify(seenTooltips));
    }
  };

  // Handle closing the tooltip
  const handleClose = () => {
    setIsOpen(false);
    if (onDismiss) {
      onDismiss(id, false);
    }
  };

  // Navigate to next step
  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleClose();
    }
  };

  // Navigate to previous step
  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Reset to first step when tooltip closes
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  // Set tooltip width based on prop
  const widthClasses = {
    sm: 'max-w-[200px]',
    md: 'max-w-[300px]',
    lg: 'max-w-[400px]',
    xl: 'max-w-[500px]',
  };

  if (isPermanentlyDismissed) {
    // If permanently dismissed, just render the children without tooltip
    return children;
  }

  // Determine indicator type
  const Indicator = showIndicator ? (
    <div className="relative inline-flex">
      <HelpCircle
        size={16}
        className={`text-blue-500 cursor-help ${hasBeenSeen ? 'opacity-70' : 'animate-pulse'}`}
      />
      {!hasBeenSeen && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
        </span>
      )}
    </div>
  ) : null;

  return (
    <TooltipProvider>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger onClick={handleOpen} className={className} asChild={!showIndicator}>
          {showIndicator ? Indicator : children}
        </TooltipTrigger>
        <TooltipContent
          side={placement}
          className={`${widthClasses[width]} p-0 overflow-hidden bg-white border-blue-100 shadow-lg`}
        >
          <div className="flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between bg-blue-50 p-2 border-b border-blue-100">
              <div className="flex items-center gap-1.5">
                <Info size={14} className="text-blue-500" />
                <span className="font-medium text-sm text-blue-700">{displayTitle}</span>
              </div>
              <div className="flex items-center gap-1">
                {expertise > 1 && (
                  <Badge variant="secondary" className="text-xs h-5 bg-blue-100 text-blue-700">
                    Level {expertise}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-gray-500 hover:text-gray-700"
                  onClick={handleClose}
                >
                  <X size={12} />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="p-3 text-sm text-gray-700">
              {displayContent}

              {relevantRegulations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <span className="text-xs font-medium text-gray-500">Relevant Regulations:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {relevantRegulations.map((reg, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {reg}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-2 bg-gray-50 border-t border-gray-100">
              {isMultiStep ? (
                <div className="flex items-center justify-between w-full">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={prevStep}
                    disabled={currentStep === 0}
                    className="h-7 px-2 text-xs"
                  >
                    <ChevronLeft size={14} className="mr-1" />
                    Back
                  </Button>

                  <div className="text-xs text-gray-500">
                    {currentStep + 1} of {steps.length}
                  </div>

                  <Button variant="ghost" size="sm" onClick={nextStep} className="h-7 px-2 text-xs">
                    {currentStep < steps.length - 1 ? (
                      <>
                        Next
                        <ChevronRight size={14} className="ml-1" />
                      </>
                    ) : (
                      <>
                        Done
                        <CheckCircle size={14} className="ml-1" />
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handlePermanentDismiss}
                    className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700"
                  >
                    Don't show again
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClose}
                    className="h-7 px-2 text-xs"
                  >
                    Got it
                  </Button>
                </>
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ContextualTooltip;
