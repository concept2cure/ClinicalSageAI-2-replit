import React, { useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { HelpCircle, X, Info, CheckCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge';

/**
 * SimpleTooltip Component for CERV2
 *
 * A lightweight contextual tooltip that doesn't require the full context provider.
 * Can be used directly in any part of the CERV2 interface.
 */
const SimpleTooltip = ({
  children, // Trigger element (what users interact with)
  title, // Tooltip title
  content, // Tooltip content (string or JSX)
  placement = 'top', // Tooltip placement
  width = 'md', // Width: sm, md, lg, xl
  showIndicator = true, // Whether to show the help indicator
  regulations = [], // Array of regulatory references
}) => {
  // State
  const [isOpen, setIsOpen] = useState(false);

  // Set tooltip width based on prop
  const widthClasses = {
    sm: 'max-w-[200px]',
    md: 'max-w-[300px]',
    lg: 'max-w-[400px]',
    xl: 'max-w-[500px]',
  };

  // Determine indicator type
  const Indicator = showIndicator ? (
    <div className="relative inline-flex">
      <HelpCircle size={16} className="text-blue-500 cursor-help" />
    </div>
  ) : null;

  return (
    <TooltipProvider>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger
          onClick={() => setIsOpen(true)}
          className="inline-flex"
          asChild={!showIndicator}
        >
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
                <span className="font-medium text-sm text-blue-700">{title}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-gray-500 hover:text-gray-700"
                onClick={() => setIsOpen(false)}
              >
                <X size={12} />
              </Button>
            </div>

            {/* Content */}
            <div className="p-3 text-sm text-gray-700">
              {content}

              {regulations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <span className="text-xs font-medium text-gray-500">Relevant Regulations:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {regulations.map((reg, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {reg}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end p-2 bg-gray-50 border-t border-gray-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-7 px-2 text-xs gap-1"
              >
                <CheckCircle size={14} className="mr-1" />
                Got it
              </Button>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default SimpleTooltip;
