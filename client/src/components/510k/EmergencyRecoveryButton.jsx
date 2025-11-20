import React from 'react';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';
import { useToast } from '@/components/ui/toaster';

/**
 * Emergency Recovery Button Component for 510(k) workflow
 * This component provides a direct way to bypass workflow issues
 */
const EmergencyRecoveryButton = ({
  onFixWorkflow,
  showAlways = true,
  isPredicateStep = false,
  className = '',
}) => {
  const { toast } = useToast();

  const handleFixClick = () => {
    if (onFixWorkflow) {
      onFixWorkflow();

      toast({
        title: '510(k) Workflow Recovery',
        description: 'Applying emergency recovery. You will be advanced to the next step.',
        variant: 'default',
        duration: 5000,
      });
    } else {
      toast({
        title: 'Recovery Function Missing',
        description: 'Unable to apply fix - recovery function not available.',
        variant: 'destructive',
        duration: 3000,
      });
    }
  };

  if (!showAlways && !isPredicateStep) {
    return null;
  }

  return (
    <div
      className={`bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded shadow-md ${className}`}
    >
      <div className="flex items-center justify-between flex-wrap">
        <div className="flex items-center">
          <ShieldAlert className="h-5 w-5 mr-2" />
          <span className="font-medium">510(k) Workflow Recovery</span>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleFixClick}
          className="animate-pulse border border-red-700 mt-2 sm:mt-0"
        >
          <ShieldAlert className="h-4 w-4 mr-1" />
          Fix Workflow and Continue
        </Button>
      </div>
      <p className="text-sm mt-2">
        If you're stuck at the Predicate Search step (30% progress), click the button above to fix
        the workflow issue and proceed to the next step.
      </p>
    </div>
  );
};

export default EmergencyRecoveryButton;
