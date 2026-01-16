import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, CheckCircle, AlertCircle, Save, Send, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function EnhancedDeviceProfileForm({ onComplete, initialData = null }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState(initialData || {
    deviceName: '',
    manufacturer: '',
    deviceClass: 'II',
    productCode: '',
    modelNumber: '',
    intendedUse: '',
    technicalDescription: '',
    regulatoryHistory: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [completionScore, setCompletionScore] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate completion score
  React.useEffect(() => {
    const requiredFields = ['deviceName', 'manufacturer', 'deviceClass', 'productCode', 'intendedUse'];
    const optionalFields = ['modelNumber', 'technicalDescription', 'regulatoryHistory', 'contactName', 'contactEmail'];
    
    const requiredComplete = requiredFields.filter(field => formData[field]?.trim()).length;
    const optionalComplete = optionalFields.filter(field => formData[field]?.trim()).length;
    
    const requiredScore = (requiredComplete / requiredFields.length) * 70;
    const optionalScore = (optionalComplete / optionalFields.length) * 30;
    
    setCompletionScore(Math.round(requiredScore + optionalScore));
  }, [formData]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear validation error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.deviceName?.trim()) errors.deviceName = 'Device name is required';
    if (!formData.manufacturer?.trim()) errors.manufacturer = 'Manufacturer is required';
    if (!formData.deviceClass) errors.deviceClass = 'Device class is required';
    if (!formData.productCode?.trim()) errors.productCode = 'Product code is required';
    if (!formData.intendedUse?.trim()) errors.intendedUse = 'Intended use is required';
    if (formData.intendedUse && formData.intendedUse.length < 50) {
      errors.intendedUse = 'Intended use should be at least 50 characters for adequate detail';
    }
    if (formData.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail)) {
      errors.contactEmail = 'Invalid email format';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveDraft = async () => {
    setIsSubmitting(true);
    try {
      // Save to local storage as draft
      localStorage.setItem('device-profile-draft', JSON.stringify(formData));
      
      toast({
        title: 'Draft Saved',
        description: 'Your device profile has been saved as a draft.',
      });
    } catch (error) {
      toast({
        title: 'Save Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields correctly.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/510k/device-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Failed to create device profile');

      const result = await response.json();

      toast({
        title: 'Device Profile Created',
        description: `${formData.deviceName} profile has been created successfully.`,
      });

      // Clear draft from local storage
      localStorage.removeItem('device-profile-draft');

      if (onComplete) {
        onComplete(result.device);
      }
    } catch (error) {
      toast({
        title: 'Submission Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Progress Indicator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Device Profile Completion
          </CardTitle>
          <CardDescription>
            {completionScore}% complete
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={completionScore} className="h-3" />
          <div className="mt-2 flex gap-2">
            {completionScore >= 70 && (
              <Badge variant="default" className="bg-green-500">
                <CheckCircle className="w-3 h-3 mr-1" />
                Ready to Submit
              </Badge>
            )}
            {completionScore < 70 && (
              <Badge variant="secondary">
                <AlertCircle className="w-3 h-3 mr-1" />
                {100 - completionScore}% to minimum required
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basic">Basic Information</TabsTrigger>
          <TabsTrigger value="technical">Technical Details</TabsTrigger>
          <TabsTrigger value="contact">Contact Info</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="deviceName">Device Name *</Label>
              <Input
                id="deviceName"
                value={formData.deviceName}
                onChange={(e) => handleChange('deviceName', e.target.value)}
                placeholder="e.g., CardioMonitor Pro"
                className={validationErrors.deviceName ? 'border-red-500' : ''}
              />
              {validationErrors.deviceName && (
                <p className="text-sm text-red-500">{validationErrors.deviceName}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="manufacturer">Manufacturer *</Label>
              <Input
                id="manufacturer"
                value={formData.manufacturer}
                onChange={(e) => handleChange('manufacturer', e.target.value)}
                placeholder="e.g., MedTech Innovations Inc."
                className={validationErrors.manufacturer ? 'border-red-500' : ''}
              />
              {validationErrors.manufacturer && (
                <p className="text-sm text-red-500">{validationErrors.manufacturer}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="deviceClass">Device Class *</Label>
              <Select value={formData.deviceClass} onValueChange={(value) => handleChange('deviceClass', value)}>
                <SelectTrigger className={validationErrors.deviceClass ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Select device class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="I">Class I</SelectItem>
                  <SelectItem value="II">Class II</SelectItem>
                  <SelectItem value="III">Class III</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="productCode">Product Code *</Label>
              <Input
                id="productCode"
                value={formData.productCode}
                onChange={(e) => handleChange('productCode', e.target.value)}
                placeholder="e.g., DQK"
                className={validationErrors.productCode ? 'border-red-500' : ''}
                maxLength={3}
              />
              {validationErrors.productCode && (
                <p className="text-sm text-red-500">{validationErrors.productCode}</p>
              )}
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="modelNumber">Model Number</Label>
              <Input
                id="modelNumber"
                value={formData.modelNumber}
                onChange={(e) => handleChange('modelNumber', e.target.value)}
                placeholder="e.g., CM-2000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="intendedUse">Intended Use *</Label>
            <Textarea
              id="intendedUse"
              value={formData.intendedUse}
              onChange={(e) => handleChange('intendedUse', e.target.value)}
              placeholder="Describe the intended use of the device in detail (minimum 50 characters)..."
              rows={4}
              className={validationErrors.intendedUse ? 'border-red-500' : ''}
            />
            <div className="flex justify-between items-center">
              {validationErrors.intendedUse && (
                <p className="text-sm text-red-500">{validationErrors.intendedUse}</p>
              )}
              <p className="text-sm text-gray-500 ml-auto">
                {formData.intendedUse.length} characters
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="technical" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="technicalDescription">Technical Description</Label>
            <Textarea
              id="technicalDescription"
              value={formData.technicalDescription}
              onChange={(e) => handleChange('technicalDescription', e.target.value)}
              placeholder="Provide technical details including materials, components, and operating principles..."
              rows={6}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="regulatoryHistory">Regulatory History</Label>
            <Textarea
              id="regulatoryHistory"
              value={formData.regulatoryHistory}
              onChange={(e) => handleChange('regulatoryHistory', e.target.value)}
              placeholder="Any previous regulatory submissions, clearances, or approvals..."
              rows={4}
            />
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Including detailed technical information and regulatory history will improve the quality of predicate matching and equivalence analysis.
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="contact" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="contactName">Contact Name</Label>
            <Input
              id="contactName"
              value={formData.contactName}
              onChange={(e) => handleChange('contactName', e.target.value)}
              placeholder="Primary regulatory contact"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactEmail">Contact Email</Label>
            <Input
              id="contactEmail"
              type="email"
              value={formData.contactEmail}
              onChange={(e) => handleChange('contactEmail', e.target.value)}
              placeholder="regulatory@company.com"
              className={validationErrors.contactEmail ? 'border-red-500' : ''}
            />
            {validationErrors.contactEmail && (
              <p className="text-sm text-red-500">{validationErrors.contactEmail}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactPhone">Contact Phone</Label>
            <Input
              id="contactPhone"
              type="tel"
              value={formData.contactPhone}
              onChange={(e) => handleChange('contactPhone', e.target.value)}
              placeholder="+1 (555) 123-4567"
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={handleSaveDraft}
          disabled={isSubmitting}
        >
          <Save className="w-4 h-4 mr-2" />
          Save Draft
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || completionScore < 70}
        >
          <Send className="w-4 h-4 mr-2" />
          {isSubmitting ? 'Creating Profile...' : 'Create Device Profile'}
        </Button>
      </div>
    </form>
  );
}
