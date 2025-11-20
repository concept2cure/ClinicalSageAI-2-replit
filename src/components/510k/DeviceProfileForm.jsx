import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { useState } from 'react';
import FDA510kService from '../../services/FDA510kService';

// Define the form validation schema using zod
const deviceProfileSchema = z.object({
  deviceName: z.string().min(2, {
    message: 'Device name must be at least 2 characters.',
  }),
  deviceType: z.string().min(2, {
    message: 'Device type is required.',
  }),
  productCode: z.string().optional(),
  deviceClass: z.enum(['I', 'II', 'III'], {
    message: 'Please select a valid device class.',
  }),
  description: z.string().min(10, {
    message: 'Description must be at least 10 characters.',
  }),
  intendedUse: z.string().min(10, {
    message: 'Intended use statement must be at least 10 characters.',
  }),
  technicalCharacteristics: z.string().optional(),
  sterilization: z.enum(['Sterile', 'Non-sterile'], {
    message: 'Please select if the device is sterile or non-sterile.',
  }),
  singleUse: z.boolean(),
  implantable: z.boolean(),
  contactDuration: z.enum(['Limited', 'Prolonged', 'Permanent'], {
    message: 'Please select a valid contact duration.',
  }),
  tissueContact: z.enum(['None', 'Surface', 'External Communicating', 'Implant'], {
    message: 'Please select a valid tissue contact type.',
  }),
  manufacturingProcess: z.string().optional(),
  materials: z.string().optional(),
  performanceData: z.string().optional(),
  specialControls: z.string().optional(),
  regulatoryHistory: z.string().optional(),
  companyName: z.string().min(2, {
    message: 'Company name is required.',
  }),
  companyAddress: z.string().optional(),
  contactPerson: z.string().optional(),
  contactEmail: z
    .string()
    .email({
      message: 'Please enter a valid email address.',
    })
    .optional(),
});

/**
 * DeviceProfileForm Component
 *
 * This component provides a form for collecting detailed information about a medical device
 * for use in 510(k) submissions and regulatory pathway determination.
 *
 * @param {Object} props - Component props
 * @param {Object} props.initialData - Initial form data (optional)
 * @param {Function} props.onSubmit - Function called when form is submitted
 * @param {boolean} props.isEditing - Whether the form is in editing mode
 */
const DeviceProfileForm = ({ initialData = {}, onSubmit, isEditing = false }) => {
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  // Initialize the form with react-hook-form and zod validation
  const form = useForm({
    resolver: zodResolver(deviceProfileSchema),
    defaultValues: {
      deviceName: initialData.deviceName || '',
      deviceType: initialData.deviceType || '',
      productCode: initialData.productCode || '',
      deviceClass: initialData.deviceClass || 'II',
      description: initialData.description || '',
      intendedUse: initialData.intendedUse || '',
      technicalCharacteristics: initialData.technicalCharacteristics || '',
      sterilization: initialData.sterilization || 'Non-sterile',
      singleUse: initialData.singleUse || false,
      implantable: initialData.implantable || false,
      contactDuration: initialData.contactDuration || 'Limited',
      tissueContact: initialData.tissueContact || 'Surface',
      manufacturingProcess: initialData.manufacturingProcess || '',
      materials: initialData.materials || '',
      performanceData: initialData.performanceData || '',
      specialControls: initialData.specialControls || '',
      regulatoryHistory: initialData.regulatoryHistory || '',
      companyName: initialData.companyName || '',
      companyAddress: initialData.companyAddress || '',
      contactPerson: initialData.contactPerson || '',
      contactEmail: initialData.contactEmail || '',
    },
  });

  // Handle form submission
  const handleSubmit = async data => {
    if (onSubmit) {
      // Pass the raw form data. The parent component's onSubmit will ensure
      // all necessary fields are properly formatted and structured
      onSubmit(data);
    }
  };

  // Validate the current form data against FDA requirements
  const validateDeviceProfile = async () => {
    setIsValidating(true);
    setValidationResult(null);

    try {
      const data = form.getValues();
      const result = await FDA510kService.validateDeviceProfile(data);
      setValidationResult(result);
    } catch (error) {
      setValidationResult({
        isValid: false,
        errors: ['An error occurred during validation. Please try again.'],
        suggestions: [],
      });
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? 'Edit Device Profile' : 'New Device Profile'}</CardTitle>
          <CardDescription>
            Enter detailed information about your medical device for 510(k) submission and
            regulatory pathway determination.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
              {/* Basic Device Information */}
              <div>
                <h3 className="text-lg font-medium mb-4">Basic Device Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="deviceName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Device Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., CardioFlow ECG Monitor" {...field} />
                        </FormControl>
                        <FormDescription>The commercial name of your device</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="deviceType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Device Type *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Electrocardiograph" {...field} />
                        </FormControl>
                        <FormDescription>
                          The general category or type of your device
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="productCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product Code</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., DPS" {...field} />
                        </FormControl>
                        <FormDescription>FDA product code, if known</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="deviceClass"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Device Class *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select device class" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="I">Class I</SelectItem>
                            <SelectItem value="II">Class II</SelectItem>
                            <SelectItem value="III">Class III</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          FDA device classification based on risk level
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              {/* Device Description and Use */}
              <div>
                <h3 className="text-lg font-medium mb-4">Device Description and Use</h3>
                <div className="space-y-6">
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Device Description *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Provide a detailed description of your device, including its components, principle of operation, and key features."
                            className="min-h-[120px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="intendedUse"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Intended Use Statement *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe the indications for use, including the specific conditions or diseases the device is intended to diagnose, treat, prevent, or mitigate."
                            className="min-h-[120px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="technicalCharacteristics"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Technical Characteristics</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe the technical specifications, dimensions, operating parameters, etc."
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              {/* Device Characteristics */}
              <div>
                <h3 className="text-lg font-medium mb-4">Device Characteristics</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="sterilization"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Sterilization *</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="flex flex-col space-y-1"
                          >
                            <FormItem className="flex items-center space-x-3 space-y-0">
                              <FormControl>
                                <RadioGroupItem value="Sterile" />
                              </FormControl>
                              <FormLabel className="font-normal">Sterile</FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0">
                              <FormControl>
                                <RadioGroupItem value="Non-sterile" />
                              </FormControl>
                              <FormLabel className="font-normal">Non-sterile</FormLabel>
                            </FormItem>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="singleUse"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="h-4 w-4 mt-1"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Single Use Device</FormLabel>
                            <FormDescription>
                              Device is intended for one-time use only
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="implantable"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="h-4 w-4 mt-1"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Implantable Device</FormLabel>
                            <FormDescription>
                              Device is intended to be implanted in the body
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="contactDuration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Duration *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select contact duration" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Limited">Limited (≤24 hours)</SelectItem>
                            <SelectItem value="Prolonged">
                              Prolonged (more than 24 hours to 30 days)
                            </SelectItem>
                            <SelectItem value="Permanent">Permanent (more than 30 days)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>Duration of contact with the patient</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="tissueContact"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tissue Contact *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select tissue contact" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="None">No tissue contact</SelectItem>
                            <SelectItem value="Surface">Surface contact</SelectItem>
                            <SelectItem value="External Communicating">
                              External communicating
                            </SelectItem>
                            <SelectItem value="Implant">Implant</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>Type of tissue contact</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              {/* Manufacturing and Materials */}
              <div>
                <h3 className="text-lg font-medium mb-4">Manufacturing and Materials</h3>
                <div className="space-y-6">
                  <FormField
                    control={form.control}
                    name="materials"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Materials</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="List the materials used in the device, especially those in direct contact with the patient."
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="manufacturingProcess"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Manufacturing Process</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe key manufacturing processes relevant to device function or safety."
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              {/* Performance and Regulatory */}
              <div>
                <h3 className="text-lg font-medium mb-4">Performance and Regulatory</h3>
                <div className="space-y-6">
                  <FormField
                    control={form.control}
                    name="performanceData"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Performance Data</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Summarize key performance data, testing results, or clinical data available for the device."
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="specialControls"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Special Controls</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="List any special controls applicable to the device type (for Class II devices)."
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="regulatoryHistory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Regulatory History</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe any prior submissions, clearances, or approvals for this or similar devices."
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              {/* Manufacturer Information */}
              <div>
                <h3 className="text-lg font-medium mb-4">Manufacturer Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., MedTech Innovations, Inc." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="companyAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Address</FormLabel>
                        <FormControl>
                          <Input placeholder="Full company address" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contactPerson"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Person</FormLabel>
                        <FormControl>
                          <Input placeholder="Name of contact person" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Email</FormLabel>
                        <FormControl>
                          <Input placeholder="Email address" type="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex justify-between pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={validateDeviceProfile}
                  disabled={isValidating}
                >
                  {isValidating ? 'Validating...' : 'Validate Profile'}
                </Button>
                <Button type="submit">{isEditing ? 'Update Profile' : 'Save Profile'}</Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Validation Results Card */}
      {validationResult && (
        <Card className={validationResult.isValid ? 'border-green-500' : 'border-red-500'}>
          <CardHeader>
            <CardTitle className={validationResult.isValid ? 'text-green-600' : 'text-red-600'}>
              {validationResult.isValid ? 'Validation Successful' : 'Validation Issues'}
            </CardTitle>
            <CardDescription>
              {validationResult.isValid
                ? 'Your device profile meets the basic requirements for a 510(k) submission.'
                : 'Please address the following issues to improve your device profile.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {validationResult.isValid ? (
              <div className="text-green-600">
                <p>All required fields are complete and valid.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <h4 className="font-medium">Issues to Address:</h4>
                <ul className="list-disc pl-5 space-y-2">
                  {validationResult.errors.map((error, index) => (
                    <li key={index} className="text-red-600">
                      {error}
                    </li>
                  ))}
                </ul>

                {validationResult.suggestions && validationResult.suggestions.length > 0 && (
                  <>
                    <h4 className="font-medium mt-4">Suggestions:</h4>
                    <ul className="list-disc pl-5 space-y-2">
                      {validationResult.suggestions.map((suggestion, index) => (
                        <li key={index} className="text-blue-600">
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DeviceProfileForm;
