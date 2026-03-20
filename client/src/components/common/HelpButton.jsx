
import React, { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TutorialGuide from '../client-portal/TutorialGuide';

const HelpButton = ({ 
  size = "sm", 
  variant = "outline", 
  position = "fixed",
  className = "" 
}) => {
  const [showHelp, setShowHelp] = useState(false);

  const buttonClasses = position === "fixed" 
    ? "fixed bottom-6 right-6 z-50 shadow-lg hover:shadow-xl transition-all duration-200 bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
    : className;

  return (
    <>
      <Button
        onClick={() => setShowHelp(true)}
        size={size}
        variant={position === "fixed" ? "default" : variant}
        className={buttonClasses}
        title="Get Help & Tutorials"
      >
        <HelpCircle className="h-4 w-4 mr-1" />
        Help
      </Button>

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex justify-between items-center">
              <DialogTitle className="text-xl font-semibold">
                Concept2Cure Platform Guide & Tutorials
              </DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHelp(false)}
                className="hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          
          <div className="mt-4">
            <TutorialGuide embedded={true} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default HelpButton;
