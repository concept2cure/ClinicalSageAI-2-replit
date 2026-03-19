import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input as BaseInput } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
// Document Intelligence components and services moved to combined import below
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

// Custom Input component that prevents form submission on Enter key
const Input = React.forwardRef((props, ref) => {
  return (
    <BaseInput
      {...props}
      ref={ref}
      onKeyDown={e => {
        // Prevent form submission when pressing Enter
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
        }
        // Call original onKeyDown if it was provided
        if (props.onKeyDown) {
          props.onKeyDown(e);
        }
      }}
    />
  );
});
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Info,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  FileText,
  FileQuestion,
  FilePlus,
} from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext.tsx';
import { useToast } from '@/components/ui/toaster';
import DocumentUploader from '@/components/document-intelligence/DocumentUploader';
import { documentIntelligenceService } from '@/concept2cure/services/documentIntelligenceService';

// Highly structured schema following FDA 510(k) requirements for device intake
const fdaDeviceIntakeSchema = z.object({
  // Administrative Information - Section A
  deviceName: z
    .string()
    .min(2, 'Device name must be at least 2 characters')
    .max(200, 'Device name must not exceed 200 characters'),
  modelNumber: z.string().max(100, 'Model number must not exceed 100 characters').optional(),
  manufacturer: z
    .string()
    .min(2, 'Manufacturer name is required')
    .max(200, 'Manufacturer name must not exceed 200 characters'),
  manufacturerAddress: z
    .string()
    .min(5, 'Manufacturer address is required')
    .max(500, 'Address must not exceed 500 characters'),
  contactPerson: z
    .string()
    .min(2, 'Contact person is required')
    .max(200, 'Contact name must not exceed 200 characters'),
  contactEmail: z.string().email('Valid email address is required'),
  contactPhone: z.string().min(10, 'Valid phone number is required'),

  // Device Classification - Section B
  deviceClass: z.enum(['I', 'II', 'III'], {
    message: 'Please select a valid device class (I, II, or III).',
  }),
  submissionType: z.enum(['Traditional', 'Abbreviated', 'Special'], {
    message: 'Please select a 510(k) submission type.',
  }),
  isExempt: z.boolean().default(false),
  productCode: z
    .string()
    .min(2, 'FDA product code is required')
    .max(50, 'Product code must not exceed 50 characters'),
  regulationNumber: z
    .string()
    .regex(/^[0-9]{3}\.[0-9]{4}$/, 'Regulation number must be in format XXX.XXXX'),
  panel: z.string().min(2, 'FDA medical specialty is required'),

  // Device Information - Section C
  intendedUse: z
    .string()
    .min(10, 'Intended use must be at least 10 characters')
    .max(2000, 'Intended use must not exceed 2000 characters'),
  indications: z
    .string()
    .min(10, 'Indications for use must be at least 10 characters')
    .max(2000, 'Indications for use must not exceed 2000 characters'),
  deviceDescription: z
    .string()
    .min(10, 'Device description must be at least 10 characters')
    .max(5000, 'Device description must not exceed 5000 characters'),
  principlesOfOperation: z
    .string()
    .min(10, 'Principles of operation must be at least 10 characters')
    .max(2000, 'Principles of operation must not exceed 2000 characters'),

  // Technical Characteristics - Section D
  keyFeatures: z
    .string()
    .min(5, 'Key features are required')
    .max(2000, 'Key features must not exceed 2000 characters'),
  mainComponents: z
    .string()
    .min(5, 'Main components are required')
    .max(2000, 'Main components must not exceed 2000 characters'),
  materials: z
    .string()
    .min(5, 'Materials information is required')
    .max(2000, 'Materials information must not exceed 2000 characters'),

  // Special Controls - Section E
  sterilization: z.boolean().default(false),
  sterilizationMethod: z
    .string()
    .max(500, 'Sterilization method must not exceed 500 characters')
    .optional(),
  software: z.boolean().default(false),
  softwareLevel: z.enum(['minor', 'moderate', 'major']).optional(),
  cybersecurity: z.boolean().default(false),
  clinicalData: z.boolean().default(false),
  biocompatibility: z.boolean().default(false),
  contactType: z.enum(['none', 'external', 'implant', 'blood_path']).default('none'),

  // Predicate Information - Section F
  predicateDeviceName: z
    .string()
    .max(200, 'Predicate device name must not exceed 200 characters')
    .optional(),
  predicateManufacturer: z
    .string()
    .max(200, 'Predicate manufacturer must not exceed 200 characters')
    .optional(),
  predicateK510Number: z
    .string()
    .regex(/^K[0-9]{6}$/, 'K number must be in format KXXXXXX')
    .optional(),

  // Additional Information - Section G
  previousSubmissions: z.boolean().default(false),
  previousK510Number: z
    .string()
    .max(100, 'Previous K number must not exceed 100 characters')
    .optional(),
  marketHistory: z.string().max(1000, 'Market history must not exceed 1000 characters').optional(),
  recalls: z.boolean().default(false),
  recallDescription: z
    .string()
    .max(1000, 'Recall description must not exceed 1000 characters')
    .optional(),
});

const DeviceIntakeForm = ({ initialData, onSubmit, onCancel }) => {
  const { toast } = useToast();
  const { currentOrganization, currentClientWorkspace } = useTenant();
  const [activeTab, setActiveTab] = useState('admin');
  const [isProcessingDocuments, setIsProcessingDocuments] = useState(false);
  const [documentExtractionResults, setDocumentExtractionResults] = useState([]);

  // FDA device specialty panels for the dropdown
  const specialtyPanels = [
    { value: 'AN', label: 'Anesthesiology' },
    { value: 'CV', label: 'Cardiovascular' },
    { value: 'DE', label: 'Dental' },
    { value: 'EN', label: 'Ear, Nose, and Throat' },
    { value: 'GU', label: 'Gastroenterology & Urology' },
    { value: 'HE', label: 'Hematology' },
    { value: 'HO', label: 'General Hospital' },
    { value: 'IM', label: 'Immunology' },
    { value: 'MI', label: 'Microbiology' },
    { value: 'NE', label: 'Neurology' },
    { value: 'OB', label: 'Obstetrics/Gynecology' },
    { value: 'OP', label: 'Ophthalmic' },
    { value: 'OR', label: 'Orthopedic' },
    { value: 'PA', label: 'Pathology' },
    { value: 'PM', label: 'Physical Medicine' },
    { value: 'RA', label: 'Radiology' },
    { value: 'SU', label: 'General & Plastic Surgery' },
    { value: 'TX', label: 'Clinical Toxicology' },
  ];

  // Configure form with react-hook-form and Zod validation
  const form = useForm({
    resolver: zodResolver(fdaDeviceIntakeSchema),
    defaultValues: initialData || {
      deviceName: '',
      modelNumber: '',
      manufacturer: '',
      manufacturerAddress: '',
      contactPerson: '',
      contactEmail: '',
      contactPhone: '',
      deviceClass: 'II',
      submissionType: 'Traditional',
      isExempt: false,
      productCode: '',
      regulationNumber: '',
      panel: '',
      intendedUse: '',
      indications: '',
      deviceDescription: '',
      principlesOfOperation: '',
      keyFeatures: '',
      mainComponents: '',
      materials: '',
      sterilization: false,
      sterilizationMethod: '',
      software: false,
      softwareLevel: 'moderate',
      cybersecurity: false,
      clinicalData: false,
      biocompatibility: false,
      contactType: 'none',
      predicateDeviceName: '',
      predicateManufacturer: '',
      predicateK510Number: '',
      previousSubmissions: false,
      previousK510Number: '',
      marketHistory: '',
      recalls: false,
      recallDescription: '',
    },
  });

  // Watch values for conditional fields
  const isExempt = form.watch('isExempt');
  const deviceClass = form.watch('deviceClass');
  const submissionType = form.watch('submissionType');
  const sterilization = form.watch('sterilization');
  const software = form.watch('software');
  const cybersecurity = form.watch('cybersecurity');
  const clinicalData = form.watch('clinicalData');
  const contactType = form.watch('contactType');
  const previousSubmissions = form.watch('previousSubmissions');
  const recalls = form.watch('recalls');

  // Handle form submission
  const handleSubmit = data => {
    console.log('Persisting device profile:', data.deviceName);

    // Save to localStorage for immediate persistence
    localStorage.setItem('510k_deviceProfile', JSON.stringify(data));
    localStorage.setItem('510k_workflowStep', '1');
    console.log('Saved device profile to localStorage:', data.deviceName);
    console.log('Saved workflow step 1 to localStorage');

    // Add tenant context data if available
    if (currentOrganization?.id) {
      data.organizationId = currentOrganization.id;
    }

    if (currentClientWorkspace?.id) {
      data.clientWorkspaceId = currentClientWorkspace.id;
    }

    // Ensure database persistence by sending to FDA510kService
    try {
      // Use the API service to save to database
      FDA510kService.DeviceProfileAPI.create(data)
        .then(result => {
          console.log('Device profile saved to database:', result);
        })
        .catch(error => {
          console.error('Error saving to database:', error);
        });
    } catch (error) {
      console.error('Failed to persist device profile to database:', error);
    }

    // Additional validation based on conditionals
    if (sterilization && !data.sterilizationMethod) {
      toast({
        title: 'Missing information',
        description: 'Please provide the sterilization method for your device',
        variant: 'destructive',
      });
      setActiveTab('technical');
      return;
    }

    if (software && !data.softwareLevel) {
      toast({
        title: 'Missing information',
        description: 'Please select a software level of concern',
        variant: 'destructive',
      });
      setActiveTab('technical');
      return;
    }

    if (previousSubmissions && !data.previousK510Number) {
      toast({
        title: 'Missing information',
        description: 'Please provide the previous K number',
        variant: 'destructive',
      });
      setActiveTab('additional');
      return;
    }

    if (recalls && !data.recallDescription) {
      toast({
        title: 'Missing information',
        description: 'Please provide the recall description',
        variant: 'destructive',
      });
      setActiveTab('additional');
      return;
    }

    onSubmit(data);
  };

  // Helper to navigate between tabs
  const navigateToNextTab = () => {
    if (activeTab === 'admin') setActiveTab('classification');
    else if (activeTab === 'classification') setActiveTab('device');
    else if (activeTab === 'device') setActiveTab('technical');
    else if (activeTab === 'technical') setActiveTab('predicate');
    else if (activeTab === 'predicate') setActiveTab('additional');
  };

  const navigateToPreviousTab = () => {
    if (activeTab === 'classification') setActiveTab('admin');
    else if (activeTab === 'device') setActiveTab('classification');
    else if (activeTab === 'technical') setActiveTab('device');
    else if (activeTab === 'predicate') setActiveTab('technical');
    else if (activeTab === 'additional') setActiveTab('predicate');
  };

  // Handle document data extraction and apply to form
  const handleExtractedData = async extractedFields => {
    try {
      setIsProcessingDocuments(true);
      setDocumentExtractionResults(extractedFields);

      // Map the extracted fields to form data structure
      const formData = documentIntelligenceService.mapExtractedFieldsToFormData(extractedFields);

      // Update form with extracted data
      Object.entries(formData).forEach(([fieldName, value]) => {
        // Only update if the field exists in our form schema
        if (form.getValues(fieldName) !== undefined) {
          form.setValue(fieldName, value, {
            shouldValidate: true,
            shouldDirty: true,
            shouldTouch: true,
          });
        }
      });

      // Show success message
      toast({
        title: 'Data Extraction Complete',
        description: `Successfully applied ${Object.keys(formData).length} extracted fields to your device profile.`,
        variant: 'default',
      });

      // Navigate to appropriate tab based on extracted data
      if (formData.deviceClass && formData.productCode) {
        setActiveTab('classification');
      } else if (formData.intendedUse || formData.indications) {
        setActiveTab('device');
      }

      setIsProcessingDocuments(false);
    } catch (error) {
      console.error('Error applying extracted data:', error);
      setIsProcessingDocuments(false);

      toast({
        title: 'Data Application Error',
        description:
          'There was an error applying the extracted data to your form. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const isCurrentTabValid = () => {
    if (activeTab === 'admin') {
      return (
        form.getFieldState('deviceName').invalid === false &&
        form.getFieldState('manufacturer').invalid === false &&
        form.getFieldState('manufacturerAddress').invalid === false &&
        form.getFieldState('contactPerson').invalid === false &&
        form.getFieldState('contactEmail').invalid === false &&
        form.getFieldState('contactPhone').invalid === false
      );
    } else if (activeTab === 'classification') {
      return (
        form.getFieldState('deviceClass').invalid === false &&
        form.getFieldState('productCode').invalid === false &&
        form.getFieldState('regulationNumber').invalid === false &&
        form.getFieldState('panel').invalid === false
      );
    } else if (activeTab === 'device') {
      return (
        form.getFieldState('intendedUse').invalid === false &&
        form.getFieldState('indications').invalid === false &&
        form.getFieldState('deviceDescription').invalid === false
      );
    } else if (activeTab === 'technical') {
      return (
        form.getFieldState('keyFeatures').invalid === false &&
        form.getFieldState('mainComponents').invalid === false &&
        form.getFieldState('materials').invalid === false
      );
    }

    return true;
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="w-full space-y-6">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
          <h2 className="text-blue-800 font-medium flex items-center">
            <Info className="h-5 w-5 mr-2" />
            FDA 510(k) Device Intake Form
          </h2>
          <p className="text-sm text-blue-700 mt-1">
            This form collects the essential information required by the FDA for your 510(k)
            submission. Fields marked with * are required.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-6 mb-4">
            <TabsTrigger value="admin" className="text-xs">
              A. Administrative
            </TabsTrigger>
            <TabsTrigger value="classification" className="text-xs">
              B. Classification
            </TabsTrigger>
            <TabsTrigger value="device" className="text-xs">
              C. Device Info
            </TabsTrigger>
            <TabsTrigger value="technical" className="text-xs">
              D. Technical
            </TabsTrigger>
            <TabsTrigger value="predicate" className="text-xs">
              E. Predicate
            </TabsTrigger>
            <TabsTrigger value="additional" className="text-xs">
              F. Additional
            </TabsTrigger>
          </TabsList>

          {/* Section A: Administrative Information */}
          <TabsContent value="admin" className="space-y-4">
            {/* Document Intelligence Panel */}
            <div className="bg-white p-4 rounded-md border border-blue-100 border-l-4">
              <div className="flex items-center mb-3">
                <FilePlus className="h-5 w-5 text-blue-500 mr-2" />
                <h3 className="font-medium text-blue-800">Intelligent Document Import</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Upload existing documentation to automatically extract device data and populate the
                form. Our AI will analyze your documents and extract relevant regulatory
                information.
              </p>

              {/* Document Uploader Component */}
              <DocumentUploader
                onExtractedData={handleExtractedData}
                allowedFileTypes={['.pdf', '.docx', '.doc']}
                maxFileSize={20}
                documentTypes={[
                  { value: '510k', label: '510(k) Submission' },
                  { value: 'technical', label: 'Technical File' },
                  { value: 'ifu', label: 'Instructions for Use' },
                  { value: 'dhf', label: 'Design History File' },
                ]}
              />
            </div>

            <div className="bg-white p-4 rounded-md border border-gray-200">
              <div className="flex items-center mb-3">
                <FileText className="h-5 w-5 text-blue-500 mr-2" />
                <h3 className="font-medium text-blue-800">Administrative Information</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                This section captures the basic administrative information about your device and
                company as required by FDA 510(k) form.
              </p>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="deviceName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Device Name*</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. CardioMonitor 3000" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500 mt-1">
                        The official commercial name of the device
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="modelNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Model Number</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. CM3000-X" {...field} />
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500 mt-1">
                          Device model or catalog number
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="manufacturer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Manufacturer*</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. MedTech Industries" {...field} />
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500 mt-1">
                          Legal manufacturer of the device
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="manufacturerAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Manufacturer Address*</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Full address including city, state, zip, country"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500 mt-1">
                        Complete manufacturer address as registered with the FDA
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="contactPerson"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Person*</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. John Smith" {...field} />
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500 mt-1">
                          Primary contact for this submission
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Email*</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. contact@company.com" {...field} />
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500 mt-1">
                          Email for FDA correspondence
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contactPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Phone*</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 123-456-7890" {...field} />
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500 mt-1">
                          Phone number for FDA correspondence
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={navigateToNextTab}
                disabled={!isCurrentTabValid()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Continue to Classification
              </Button>
            </div>
          </TabsContent>

          {/* Section B: Device Classification */}
          <TabsContent value="classification" className="space-y-4">
            <div className="bg-white p-4 rounded-md border border-gray-200">
              <div className="flex items-center mb-3">
                <FileText className="h-5 w-5 text-blue-500 mr-2" />
                <h3 className="font-medium text-blue-800">Device Classification</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                This section identifies your device's regulatory classification under FDA
                guidelines, which determines the submission pathway and requirements.
              </p>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="deviceClass"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Device Class*</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select device class" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-white border border-gray-200 shadow-md z-50">
                          <SelectItem value="I" className="hover:bg-blue-50">
                            Class I
                          </SelectItem>
                          <SelectItem value="II" className="hover:bg-blue-50">
                            Class II
                          </SelectItem>
                          <SelectItem value="III" className="hover:bg-blue-50">
                            Class III
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs text-gray-500 mt-1">
                        FDA regulatory classification of the device
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="submissionType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>510(k) Submission Type*</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white" data-testid="select-submission-type">
                            <SelectValue placeholder="Select submission type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-white border border-gray-200 shadow-md z-50">
                          <SelectItem value="Traditional" className="hover:bg-blue-50">
                            Traditional 510(k)
                          </SelectItem>
                          <SelectItem value="Abbreviated" className="hover:bg-blue-50">
                            Abbreviated 510(k)
                          </SelectItem>
                          <SelectItem value="Special" className="hover:bg-blue-50">
                            Special 510(k)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs text-gray-500 mt-1">
                        Type of 510(k) submission - Traditional (most common), Abbreviated (consensus standards), or Special (device modification)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isExempt"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>510(k) Exempt</FormLabel>
                        <FormDescription className="text-xs">
                          Check if your device is exempt from 510(k) requirements (rare for new
                          submissions)
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                {!isExempt && (
                  <div className="bg-amber-50 p-3 border border-amber-100 rounded-md">
                    <div className="flex items-start">
                      <AlertCircle className="h-5 w-5 text-amber-500 mr-2 mt-0.5" />
                      <div>
                        <p className="text-sm text-amber-800 font-medium">Important Note</p>
                        <p className="text-xs text-amber-700 mt-1">
                          Most Class II and Class III devices require a 510(k) submission. Only
                          select "exempt" if your device is specifically listed in the FDA exempt
                          database.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="productCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Code*</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. DQA" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500 mt-1 flex items-center">
                        <span>FDA product code (3-letter code)</span>
                        <a
                          href="https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfPCD/classification.cfm"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline ml-1 inline-flex items-center"
                        >
                          <HelpCircle className="h-3 w-3 ml-1" />
                          <span className="ml-0.5">Look up</span>
                        </a>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="regulationNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Regulation Number*</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 870.2300" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500 mt-1 flex items-center">
                        <span>21 CFR regulation number (format: XXX.XXXX)</span>
                        <a
                          href="https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfcfr/cfrsearch.cfm"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline ml-1 inline-flex items-center"
                        >
                          <HelpCircle className="h-3 w-3 ml-1" />
                          <span className="ml-0.5">Look up</span>
                        </a>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="panel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Medical Specialty Panel*</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select medical specialty" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-white border border-gray-200 shadow-md z-50 max-h-[200px]">
                          <SelectGroup>
                            <SelectLabel>FDA Medical Specialty Panels</SelectLabel>
                            {specialtyPanels.map(panel => (
                              <SelectItem
                                key={panel.value}
                                value={panel.value}
                                className="hover:bg-blue-50"
                              >
                                {panel.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs text-gray-500 mt-1">
                        FDA medical specialty panel for your device
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex justify-between space-x-2">
              <Button type="button" variant="outline" onClick={navigateToPreviousTab}>
                Back to Administrative
              </Button>
              <Button
                type="button"
                onClick={navigateToNextTab}
                disabled={!isCurrentTabValid()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Continue to Device Information
              </Button>
            </div>
          </TabsContent>

          {/* Section C: Device Information */}
          <TabsContent value="device" className="space-y-4">
            <div className="bg-white p-4 rounded-md border border-gray-200">
              <div className="flex items-center mb-3">
                <FileText className="h-5 w-5 text-blue-500 mr-2" />
                <h3 className="font-medium text-blue-800">Device Information</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                This section captures essential information about your device's purpose, function,
                and operation, which is critical for the FDA's substantial equivalence
                determination.
              </p>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="intendedUse"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Intended Use*</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe the general purpose of the device..."
                          className="min-h-20"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500 mt-1">
                        General purpose statement describing what the device does - critical for
                        510(k) substantial equivalence
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="indications"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Indications for Use*</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe specific conditions, populations, or use cases..."
                          className="min-h-20"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500 mt-1">
                        Specific conditions, patient populations, and use cases for the device (will
                        be used in FDA Form 3881)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {deviceClass === 'II' && (
                  <div className="bg-blue-50 p-3 border border-blue-100 rounded-md">
                    <div className="flex items-start">
                      <Info className="h-5 w-5 text-blue-500 mr-2 mt-0.5" />
                      <p className="text-xs text-blue-700">
                        For Class II devices, the intended use and indications for use must align
                        with those of predicate devices for substantial equivalence. The FDA
                        evaluates if any differences affect safety and effectiveness.
                      </p>
                    </div>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="deviceDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Device Description*</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Provide a detailed description of the device including appearance, parts, components..."
                          className="min-h-24"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500 mt-1">
                        Comprehensive description of device appearance, components, and how it
                        functions
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="principlesOfOperation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Principles of Operation*</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Explain how the device works..."
                          className="min-h-20"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500 mt-1">
                        Explanation of the scientific principles governing how the device works
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex justify-between space-x-2">
              <Button type="button" variant="outline" onClick={navigateToPreviousTab}>
                Back to Classification
              </Button>
              <Button
                type="button"
                onClick={navigateToNextTab}
                disabled={!isCurrentTabValid()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Continue to Technical Characteristics
              </Button>
            </div>
          </TabsContent>

          {/* Section D: Technical Characteristics */}
          <TabsContent value="technical" className="space-y-4">
            <div className="bg-white p-4 rounded-md border border-gray-200">
              <div className="flex items-center mb-3">
                <FileText className="h-5 w-5 text-blue-500 mr-2" />
                <h3 className="font-medium text-blue-800">Technical Characteristics</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                This section details the technical specifications and special controls for your
                device, which are essential for the FDA's evaluation of safety and effectiveness.
              </p>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="keyFeatures"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Key Features*</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="List the key features of your device..."
                          className="min-h-16"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500 mt-1">
                        Main features and capabilities of the device
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="mainComponents"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Main Components*</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="List the main components and sub-assemblies..."
                          className="min-h-16"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500 mt-1">
                        Major components, sub-assemblies, and materials used in the device
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="materials"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Materials*</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe materials that come into contact with the patient or user..."
                          className="min-h-16"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500 mt-1">
                        List of materials, especially those with patient contact
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="bg-white p-4 rounded-md border border-gray-200">
                  <h4 className="text-sm font-medium mb-3">Special Controls</h4>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="sterilization"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Device Requires Sterilization</FormLabel>
                            <FormDescription className="text-xs">
                              Device is provided sterile or requires sterilization prior to use
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />

                    {sterilization && (
                      <FormField
                        control={form.control}
                        name="sterilizationMethod"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sterilization Method</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. EtO, Steam, Radiation" {...field} />
                            </FormControl>
                            <FormDescription className="text-xs text-gray-500 mt-1">
                              Method used to sterilize the device
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="software"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Contains Software/Firmware</FormLabel>
                            <FormDescription className="text-xs">
                              Device includes software or firmware components
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />

                    {software && (
                      <FormField
                        control={form.control}
                        name="softwareLevel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Software Level of Concern</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger className="bg-white">
                                  <SelectValue placeholder="Select level of concern" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="bg-white border border-gray-200 shadow-md z-50">
                                <SelectItem value="minor" className="hover:bg-blue-50">
                                  Minor Level of Concern
                                </SelectItem>
                                <SelectItem value="moderate" className="hover:bg-blue-50">
                                  Moderate Level of Concern
                                </SelectItem>
                                <SelectItem value="major" className="hover:bg-blue-50">
                                  Major Level of Concern
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription className="text-xs text-gray-500 mt-1">
                              FDA software level of concern based on potential to harm
                              patients/users
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="cybersecurity"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-cybersecurity" />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Cybersecurity Considerations Required</FormLabel>
                            <FormDescription className="text-xs">
                              Device is a cyber device requiring cybersecurity documentation (connectivity, data exchange, networked functions)
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="clinicalData"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-clinical-data" />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Clinical Data Required</FormLabel>
                            <FormDescription className="text-xs">
                              Device requires clinical data (human clinical trials, literature, or real-world evidence)
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="biocompatibility"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Requires Biocompatibility Testing</FormLabel>
                            <FormDescription className="text-xs">
                              Device requires biocompatibility testing per ISO 10993
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="contactType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Patient Contact Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-white">
                                <SelectValue placeholder="Select contact type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-white border border-gray-200 shadow-md z-50">
                              <SelectItem value="none" className="hover:bg-blue-50">
                                No patient contact
                              </SelectItem>
                              <SelectItem value="external" className="hover:bg-blue-50">
                                Surface contact
                              </SelectItem>
                              <SelectItem value="implant" className="hover:bg-blue-50">
                                Implant contact
                              </SelectItem>
                              <SelectItem value="blood_path" className="hover:bg-blue-50">
                                Blood path contact
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-xs text-gray-500 mt-1">
                            Type of patient contact, which determines biocompatibility requirements
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between space-x-2">
              <Button type="button" variant="outline" onClick={navigateToPreviousTab}>
                Back to Device Information
              </Button>
              <Button
                type="button"
                onClick={navigateToNextTab}
                disabled={!isCurrentTabValid()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Continue to Predicate Information
              </Button>
            </div>
          </TabsContent>

          {/* Section E: Predicate Information */}
          <TabsContent value="predicate" className="space-y-4">
            <div className="bg-white p-4 rounded-md border border-gray-200">
              <div className="flex items-center mb-3">
                <FileText className="h-5 w-5 text-blue-500 mr-2" />
                <h3 className="font-medium text-blue-800">Predicate Device Information</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                This section identifies the predicate device(s) that you're claiming substantial
                equivalence to. Predicate devices are legally marketed devices with similar intended
                use and technological characteristics.
              </p>

              <div className="space-y-4">
                <div className="bg-amber-50 p-3 border border-amber-100 rounded-md mb-4">
                  <div className="flex items-start">
                    <AlertCircle className="h-5 w-5 text-amber-500 mr-2 mt-0.5" />
                    <div>
                      <p className="text-sm text-amber-800 font-medium">Important Note</p>
                      <p className="text-xs text-amber-700 mt-1">
                        If you don't know your predicate device yet, you can leave this section
                        blank. Our system will help you identify potential predicate devices based
                        on your device profile.
                      </p>
                    </div>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="predicateDeviceName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Predicate Device Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. CardioMonitor 2000" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500 mt-1">
                        Commercial name of the predicate device
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="predicateManufacturer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Predicate Manufacturer</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. MedTech Industries" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500 mt-1">
                        Manufacturer of the predicate device
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="predicateK510Number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Predicate 510(k) Number</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. K123456" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500 mt-1 flex items-center">
                        <span>FDA K-number for the predicate device (format: KXXXXXX)</span>
                        <a
                          href="https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline ml-1 inline-flex items-center"
                        >
                          <HelpCircle className="h-3 w-3 ml-1" />
                          <span className="ml-0.5">Look up</span>
                        </a>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="bg-blue-50 p-3 border border-blue-100 rounded-md">
                  <div className="flex items-start">
                    <FileQuestion className="h-5 w-5 text-blue-500 mr-2 mt-0.5" />
                    <div>
                      <p className="text-sm text-blue-800 font-medium">
                        Need Help Finding a Predicate?
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        Our predicate finder tool can help you identify potential predicate devices
                        by analyzing the FDA 510(k) database for devices with similar intended use
                        and technological characteristics.
                      </p>
                      <p className="text-xs text-blue-700 mt-2">
                        You'll be able to use this tool in the next steps of the submission process.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between space-x-2">
              <Button type="button" variant="outline" onClick={navigateToPreviousTab}>
                Back to Technical Characteristics
              </Button>
              <Button
                type="button"
                onClick={navigateToNextTab}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Continue to Additional Information
              </Button>
            </div>
          </TabsContent>

          {/* Section F: Additional Information */}
          <TabsContent value="additional" className="space-y-4">
            <div className="bg-white p-4 rounded-md border border-gray-200">
              <div className="flex items-center mb-3">
                <FileText className="h-5 w-5 text-blue-500 mr-2" />
                <h3 className="font-medium text-blue-800">Additional Information</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                This section captures supplementary information about your device's regulatory
                history, market experience, and any additional factors that may influence the FDA's
                review.
              </p>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="previousSubmissions"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Previous FDA Submission</FormLabel>
                        <FormDescription className="text-xs">
                          Has this device (or a previous version) been subject to prior FDA
                          submission?
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                {previousSubmissions && (
                  <FormField
                    control={form.control}
                    name="previousK510Number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Previous Submission Number</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. K123456" {...field} />
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500 mt-1">
                          FDA submission number for previous submissions
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="marketHistory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Market History</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe the device's market history in the US or other countries..."
                          className="min-h-16"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-gray-500 mt-1">
                        Summary of marketing history in the US or internationally
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="recalls"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Previous Recalls or Safety Issues</FormLabel>
                        <FormDescription className="text-xs">
                          Has this device (or a previous version) been subject to recalls or safety
                          issues?
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                {recalls && (
                  <FormField
                    control={form.control}
                    name="recallDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recall Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe the recall event, actions taken, and resolution..."
                            className="min-h-16"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription className="text-xs text-gray-500 mt-1">
                          Details of recalls, corrective actions, and resolution
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="bg-green-50 p-4 border border-green-100 rounded-md">
                  <div className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                    <div>
                      <p className="text-sm text-green-800 font-medium">Almost Complete!</p>
                      <p className="text-xs text-green-700 mt-1">
                        You've completed the device intake form. After submission, you'll proceed to
                        the 510(k) workflow process where you can upload supporting documentation
                        and build your substantial equivalence demonstration.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between space-x-2">
              <Button type="button" variant="outline" onClick={navigateToPreviousTab}>
                Back to Predicate Information
              </Button>
              <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white">
                Submit Device Profile
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </form>
    </Form>
  );
};

export default DeviceIntakeForm;
