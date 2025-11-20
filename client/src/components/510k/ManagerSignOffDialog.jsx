import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toaster';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle2, ClipboardSignature, AlertTriangle, User, CalendarClock } from 'lucide-react';

/**
 * Manager Sign-Off Dialog Component
 *
 * This component provides a standardized dialog for capturing manager approvals
 * at key workflow transition points in the 510K submission process.
 */
const ManagerSignOffDialog = ({
  isOpen,
  onClose,
  onApprove,
  stageName,
  deviceName,
  requirements = [],
  approvalNotes = '',
}) => {
  const [managerName, setManagerName] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [notes, setNotes] = useState(approvalNotes);
  const [checkedRequirements, setCheckedRequirements] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Initialize checked requirements
  React.useEffect(() => {
    const initialChecked = {};
    requirements.forEach(req => {
      initialChecked[req.id] = false;
    });
    setCheckedRequirements(initialChecked);
  }, [requirements]);

  const allRequirementsMet = () => {
    if (requirements.length === 0) return true;
    return Object.values(checkedRequirements).every(checked => checked);
  };

  const isFormValid = () => {
    return (
      managerName.trim() !== '' &&
      managerEmail.trim() !== '' &&
      managerEmail.includes('@') &&
      allRequirementsMet()
    );
  };

  const handleApprove = async () => {
    if (!isFormValid()) {
      toast({
        title: 'Form Incomplete',
        description: 'Please fill all required fields and confirm all requirements',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Create the approval record
      const approvalRecord = {
        stageName,
        deviceName,
        managerName,
        managerEmail,
        notes,
        requirementsChecked: checkedRequirements,
        timestamp: new Date().toISOString(),
      };

      // Call the onApprove callback with the approval data
      await onApprove(approvalRecord);

      toast({
        title: 'Approval Recorded',
        description: `Manager sign-off for ${stageName} has been recorded`,
        variant: 'default',
      });

      // Close the dialog
      onClose();
    } catch (error) {
      console.error('Error recording manager approval:', error);
      toast({
        title: 'Approval Error',
        description: error.message || 'Failed to record manager sign-off',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <ClipboardSignature className="h-5 w-5 mr-2 text-purple-600" />
            Manager Sign-Off: {stageName}
          </DialogTitle>
          <DialogDescription>
            Manager approval is required to proceed from this stage. This sign-off will be recorded
            in the audit trail.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {deviceName && (
            <div className="bg-blue-50 p-3 rounded-md">
              <p className="text-sm font-medium text-blue-900">Device: {deviceName}</p>
            </div>
          )}

          <div className="space-y-3">
            <Label htmlFor="manager-name">Manager Name</Label>
            <Input
              id="manager-name"
              value={managerName}
              onChange={e => setManagerName(e.target.value)}
              placeholder="Enter full name"
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="manager-email">Manager Email</Label>
            <Input
              id="manager-email"
              type="email"
              value={managerEmail}
              onChange={e => setManagerEmail(e.target.value)}
              placeholder="Enter email address"
            />
          </div>

          {requirements.length > 0 && (
            <div className="space-y-3">
              <Label>Requirements Confirmation</Label>
              <div className="space-y-2 bg-slate-50 p-3 rounded-md">
                {requirements.map(req => (
                  <div key={req.id} className="flex items-start space-x-2">
                    <Checkbox
                      id={`req-${req.id}`}
                      checked={checkedRequirements[req.id] || false}
                      onCheckedChange={checked =>
                        setCheckedRequirements(prev => ({
                          ...prev,
                          [req.id]: !!checked,
                        }))
                      }
                    />
                    <Label
                      htmlFor={`req-${req.id}`}
                      className="text-sm font-normal leading-tight cursor-pointer"
                    >
                      {req.text}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Label htmlFor="notes">Additional Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Enter any additional notes or comments"
              rows={3}
            />
          </div>

          <div className="pt-2 flex items-center text-sm text-gray-500">
            <CalendarClock className="h-4 w-4 mr-1" />
            <span>Approval timestamp: {new Date().toLocaleString()}</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            disabled={!isFormValid() || isSubmitting}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting ? 'Processing...' : 'Approve & Sign-Off'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ManagerSignOffDialog;
