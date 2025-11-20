import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toaster';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Clock, FileSymlink, Plus, RefreshCw } from 'lucide-react';
import DeviceProfileForm from './DeviceProfileForm';
import { FDA510kService } from '@/services/FDA510kService';

const DeviceProfileDialog = ({
  buttonText = 'Create Device Profile',
  buttonVariant = 'default',
  buttonClassName = '',
  buttonIcon = null,
  existingData = null,
  onSuccessfulSubmit = () => {},
  dialogTitle = 'Device Profile',
  dialogDescription = 'Enter the details for your medical device to begin the 510(k) submission process.',
  showBadge = false,
  isStartingPoint = false,
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async data => {
    setLoading(true);
    try {
      // Use the DeviceProfileAPI's validation to ensure data consistency
      // This will filter out fields that aren't in the database schema
      const filteredData = FDA510kService.DeviceProfileAPI.validateDeviceProfile(data);

      // Add any additional processing needed for UI-specific fields
      if (data.projectId) {
        filteredData.projectId = data.projectId;
      } else if (isStartingPoint) {
        filteredData.projectId = `510K-${Math.floor(100000 + Math.random() * 900000)}`;
      }

      console.log('Submitting filtered device profile data:', filteredData);

      let result;

      if (existingData?.id) {
        // Update existing profile using unified DeviceProfileAPI
        result = await FDA510kService.DeviceProfileAPI.update(existingData.id, filteredData);
        toast({
          title: 'Device Profile updated',
          description: 'Your Device Profile has been successfully updated.',
        });
      } else {
        // Create new profile using unified DeviceProfileAPI
        result = await FDA510kService.DeviceProfileAPI.create(filteredData);
        toast({
          title: 'Device Profile created',
          description: 'Your Device Profile has been successfully created.',
        });
      }

      setOpen(false);
      onSuccessfulSubmit(result);
    } catch (error) {
      console.error('Error saving Device Profile:', error);
      toast({
        title: 'Error',
        description:
          error.response?.data?.message || 'Failed to save Device Profile. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Generate a dynamic button with appropriate icon based on context
  const getButtonIcon = () => {
    if (buttonIcon) return buttonIcon;
    if (existingData) return <RefreshCw className="h-4 w-4 mr-2" />;
    return <Plus className="h-4 w-4 mr-2" />;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="relative inline-block">
          <Button
            variant={buttonVariant}
            disabled={loading}
            className={`${buttonClassName} ${isStartingPoint ? 'relative px-6 py-6 h-auto text-md font-medium shadow-md hover:shadow-lg transition-all duration-200' : ''}`}
          >
            {getButtonIcon()}
            {buttonText}
            {isStartingPoint && (
              <div className="absolute -top-3 -right-3">
                <Badge className="bg-green-600 text-white text-xs px-2 py-1 rounded-full">
                  FIRST STEP
                </Badge>
              </div>
            )}
          </Button>
          {showBadge && !isStartingPoint && (
            <div className="absolute -top-2 -right-2">
              <Badge className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
                Step 1
              </Badge>
            </div>
          )}
        </div>
      </DialogTrigger>
      <DialogContent className="w-full sm:max-w-[80%] max-w-3xl md:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="sticky top-0 z-10 bg-white px-6 pt-6 pb-4 border-b">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <DialogTitle className="text-xl font-semibold text-blue-900">{dialogTitle}</DialogTitle>
            {existingData && (
              <Badge
                variant="outline"
                className="flex items-center gap-1 text-blue-600 border-blue-200 px-2 py-1 w-fit"
              >
                <Clock className="h-3 w-3" />
                <span className="text-xs">
                  Last updated: {new Date(existingData.updatedAt).toLocaleDateString()}
                </span>
              </Badge>
            )}
          </div>
          <DialogDescription className="mt-2 text-blue-700">{dialogDescription}</DialogDescription>
          {existingData && (
            <div className="flex items-center mt-2 text-xs text-gray-500">
              <FileSymlink className="h-3 w-3 mr-1" />
              <span>Profile ID: {existingData.id}</span>
            </div>
          )}
        </DialogHeader>
        <div className="overflow-y-auto flex-grow px-4 sm:px-6">
          <DeviceProfileForm
            initialData={existingData}
            onSubmit={handleSubmit}
            onCancel={() => setOpen(false)}
          />
        </div>
        {loading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-50">
            <div className="flex flex-col items-center">
              <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mb-2"></div>
              <p className="text-blue-800 font-medium">Saving device profile...</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DeviceProfileDialog;
