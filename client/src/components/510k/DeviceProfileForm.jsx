import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle, ArrowRightLeft, Globe, FileCheck, AlertTriangle } from 'lucide-react'
import FDA510kService from '../../services/FDA510kService';

// Cross-Format Harmonizer: Regional format mappings
const REGIONAL_FORMATS = {
  FDA_510K: {
    name: 'FDA 510(k)',
    region: 'United States',
    fields: ['deviceName', 'deviceType', 'productCode', 'deviceClass', 'description', 'intendedUse', 'technicalCharacteristics', 'sterilization', 'singleUse', 'implantable', 'contactDuration', 'tissueContact', 'manufacturingProcess', 'materials', 'performanceData', 'specialControls', 'regulatoryHistory', 'companyName', 'companyAddress', 'contactPerson', 'contactEmail'],
    requiredFields: ['deviceName', 'deviceType', 'deviceClass', 'description', 'intendedUse', 'sterilization', 'contactDuration', 'tissueContact', 'companyName'],
    classificationSystem: 'FDA Risk Classes (I, II, III)'
  },
  EU_MDR: {
    name: 'EU MDR',
    region: 'European Union',
    fields: ['deviceName', 'deviceType', 'mdrClassification', 'gmdn', 'description', 'intendedPurpose', 'technicalCharacteristics', 'sterilization', 'singleUse', 'implantable', 'contactDuration', 'tissueContact', 'manufacturingProcess', 'materials', 'clinicalEvidence', 'postMarketSurveillance', 'riskManagement', 'authorizedRepresentative', 'manufacturerAddress', 'contactPerson', 'contactEmail'],
    requiredFields: ['deviceName', 'deviceType', 'mdrClassification', 'description', 'intendedPurpose', 'sterilization', 'contactDuration', 'tissueContact', 'authorizedRepresentative'],
    classificationSystem: 'MDR Risk Classes (I, IIa, IIb, III)'
  },
  HEALTH_CANADA: {
    name: 'Health Canada',
    region: 'Canada',
    fields: ['deviceName', 'deviceType', 'healthCanadaClass', 'deviceLicenseNumber', 'description', 'intendedUse', 'technicalCharacteristics', 'sterilization', 'singleUse', 'implantable', 'contactDuration', 'tissueContact', 'manufacturingProcess', 'materials', 'performanceData', 'qualityAssurance', 'regulatoryHistory', 'licenseeInformation', 'manufacturerAddress', 'contactPerson', 'contactEmail'],
    requiredFields: ['deviceName', 'deviceType', 'healthCanadaClass', 'description', 'intendedUse', 'sterilization', 'contactDuration', 'tissueContact', 'licenseeInformation'],
    classificationSystem: 'Health Canada Classes (I, II, III, IV)'
  }
};

// Cross-Format Field Mapping
const FIELD_MAPPINGS = {
  'intendedUse': ['intendedPurpose', 'intendedUse'], // FDA/HC -> EU
  'deviceClass': ['mdrClassification', 'healthCanadaClass'], // Convert between classification systems
  'productCode': ['gmdn', 'deviceLicenseNumber'], // Different identification systems
  'specialControls': ['postMarketSurveillance', 'qualityAssurance'], // Different control mechanisms
  'performanceData': ['clinicalEvidence', 'performanceData'], // Different evidence requirements
  'companyName': ['authorizedRepresentative', 'licenseeInformation'] // Different business entity types
};

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
  // Cross-Format Harmonizer fields
  selectedFormat: z.enum(['FDA_510K', 'EU_MDR', 'HEALTH_CANADA'], {
    message: 'Please select a valid regulatory format.',
  }).optional().default('FDA_510K'),
  targetMarkets: z.array(z.string()).optional().default([]),
  // EU MDR specific fields
  mdrClassification: z.enum(['I', 'IIa', 'IIb', 'III']).optional(),
  gmdn: z.string().optional(),
  intendedPurpose: z.string().optional(),
  clinicalEvidence: z.string().optional(),
  postMarketSurveillance: z.string().optional(),
  riskManagement: z.string().optional(),
  authorizedRepresentative: z.string().optional(),
  // Health Canada specific fields
  healthCanadaClass: z.enum(['I', 'II', 'III', 'IV']).optional(),
  deviceLicenseNumber: z.string().optional(),
  qualityAssurance: z.string().optional(),
  licenseeInformation: z.string().optional(),
  // Harmonization metadata
  harmonizationStatus: z.string().optional(),
  complianceGaps: z.array(z.string()).optional().default([]),
  lastHarmonized: z.string().optional(),
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
  
  // Cross-Format Harmonizer state
  const [selectedFormat, setSelectedFormat] = useState(initialData.selectedFormat || 'FDA_510K');
  const [targetMarkets, setTargetMarkets] = useState(initialData.targetMarkets || ['FDA_510K']);
  const [isHarmonizing, setIsHarmonizing] = useState(false);
  const [harmonizationResult, setHarmonizationResult] = useState(null);
  const [complianceGaps, setComplianceGaps] = useState(initialData.complianceGaps || []);
  const [formatMappings, setFormatMappings] = useState({});

  // Cross-Format Harmonizer: Format conversion utility
  const convertBetweenFormats = (data, fromFormat, toFormat) => {
    const converted = { ...data };
    
    // Classification system conversion
    if (fromFormat === 'FDA_510K' && toFormat === 'EU_MDR') {
      // FDA Class I -> MDR Class I, FDA Class II -> MDR Class IIa/IIb, FDA Class III -> MDR Class III
      const classMap = { 'I': 'I', 'II': 'IIa', 'III': 'III' };
      converted.mdrClassification = classMap[data.deviceClass] || 'IIa';
      converted.intendedPurpose = data.intendedUse;
      converted.clinicalEvidence = data.performanceData;
      converted.postMarketSurveillance = data.specialControls;
    } else if (fromFormat === 'FDA_510K' && toFormat === 'HEALTH_CANADA') {
      // FDA to Health Canada mapping
      const classMap = { 'I': 'I', 'II': 'II', 'III': 'III' };
      converted.healthCanadaClass = classMap[data.deviceClass] || 'II';
      converted.qualityAssurance = data.specialControls;
      converted.licenseeInformation = data.companyName;
    } else if (fromFormat === 'EU_MDR' && toFormat === 'FDA_510K') {
      // EU MDR to FDA mapping
      const classMap = { 'I': 'I', 'IIa': 'II', 'IIb': 'II', 'III': 'III' };
      converted.deviceClass = classMap[data.mdrClassification] || 'II';
      converted.intendedUse = data.intendedPurpose;
      converted.performanceData = data.clinicalEvidence;
      converted.specialControls = data.postMarketSurveillance;
    }
    
    return converted;
  };
  
  // Cross-Format Harmonizer: Compliance gap detection
  const detectComplianceGaps = (data, targetFormat) => {
    const gaps = [];
    const requiredFields = REGIONAL_FORMATS[targetFormat].requiredFields;
    
    requiredFields.forEach(field => {
      if (!data[field] || data[field].trim() === '') {
        gaps.push(`Missing required field for ${REGIONAL_FORMATS[targetFormat].name}: ${field}`);
      }
    });
    
    // Format-specific gap detection
    if (targetFormat === 'EU_MDR') {
      if (!data.clinicalEvidence) gaps.push('Clinical evidence documentation required for EU MDR');
      if (!data.riskManagement) gaps.push('Risk management documentation required for EU MDR');
      if (!data.authorizedRepresentative) gaps.push('Authorized representative required for EU market');
    } else if (targetFormat === 'HEALTH_CANADA') {
      if (!data.qualityAssurance) gaps.push('Quality assurance documentation required for Health Canada');
      if (!data.licenseeInformation) gaps.push('Canadian licensee information required');
    }
    
    return gaps;
  };

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
      // Cross-Format Harmonizer fields
      selectedFormat: selectedFormat,
      targetMarkets: targetMarkets,
      mdrClassification: initialData.mdrClassification || '',
      gmdn: initialData.gmdn || '',
      intendedPurpose: initialData.intendedPurpose || '',
      clinicalEvidence: initialData.clinicalEvidence || '',
      postMarketSurveillance: initialData.postMarketSurveillance || '',
      riskManagement: initialData.riskManagement || '',
      authorizedRepresentative: initialData.authorizedRepresentative || '',
      healthCanadaClass: initialData.healthCanadaClass || '',
      deviceLicenseNumber: initialData.deviceLicenseNumber || '',
      qualityAssurance: initialData.qualityAssurance || '',
      licenseeInformation: initialData.licenseeInformation || '',
      harmonizationStatus: initialData.harmonizationStatus || 'pending',
      complianceGaps: complianceGaps,
      lastHarmonized: initialData.lastHarmonized || '',
    },
  });

  // Cross-Format Harmonizer: Auto-harmonize across target markets
  const handleFormatHarmonization = async () => {
    setIsHarmonizing(true);
    setHarmonizationResult(null);
    
    try {
      const currentData = form.getValues();
      const harmonizedData = {};
      const allGaps = [];
      
      // Harmonize for each target market
      for (const targetFormat of targetMarkets) {
        if (targetFormat !== selectedFormat) {
          harmonizedData[targetFormat] = convertBetweenFormats(currentData, selectedFormat, targetFormat);
          const gaps = detectComplianceGaps(harmonizedData[targetFormat], targetFormat);
          allGaps.push(...gaps.map(gap => `${targetFormat}: ${gap}`));
        }
      }
      
      setComplianceGaps(allGaps);
      setHarmonizationResult({
        harmonizedData,
        totalGaps: allGaps.length,
        status: allGaps.length === 0 ? 'compliant' : 'gaps_detected',
        timestamp: new Date().toISOString()
      });
      
      // Update form with harmonization metadata
      form.setValue('complianceGaps', allGaps);
      form.setValue('harmonizationStatus', allGaps.length === 0 ? 'compliant' : 'gaps_detected');
      form.setValue('lastHarmonized', new Date().toISOString());
      
    } catch (error) {
      setHarmonizationResult({
        status: 'error',
        message: 'Failed to harmonize formats. Please check your data and try again.',
        timestamp: new Date().toISOString()
      });
    } finally {
      setIsHarmonizing(false);
    }
  };
  
  // Handle target market selection
  const handleTargetMarketChange = (market, checked) => {
    let newTargets;
    if (checked) {
      newTargets = [...targetMarkets, market];
    } else {
      newTargets = targetMarkets.filter(t => t !== market);
    }
    setTargetMarkets(newTargets);
    form.setValue('targetMarkets', newTargets);
  };
  
  // Handle format change
  const handleFormatChange = (newFormat) => {
    setSelectedFormat(newFormat);
    form.setValue('selectedFormat', newFormat);
    
    // Auto-convert current data to new format
    const currentData = form.getValues();
    const convertedData = convertBetweenFormats(currentData, selectedFormat, newFormat);
    
    // Update form fields based on conversion
    Object.keys(convertedData).forEach(key => {
      if (form.getValues()[key] !== undefined) {
        form.setValue(key, convertedData[key]);
      }
    });
  };
  
  // Use effect to update harmonization when format or targets change
  useEffect(() => {
    if (targetMarkets.length > 1) {
      // Auto-detect gaps when target markets change
      const currentData = form.getValues();
      const allGaps = [];
      
      targetMarkets.forEach(targetFormat => {
        if (targetFormat !== selectedFormat) {
          const gaps = detectComplianceGaps(currentData, targetFormat);
          allGaps.push(...gaps.map(gap => `${targetFormat}: ${gap}`));
        }
      });
      
      setComplianceGaps(allGaps);
      form.setValue('complianceGaps', allGaps);
    }
  }, [selectedFormat, targetMarkets, form]);

  // Handle form submission
  const handleSubmit = async data => {
    if (onSubmit) {
      // Include harmonization data in submission
      const submissionData = {
        ...data,
        selectedFormat,
        targetMarkets,
        complianceGaps,
        harmonizationResult,
        lastHarmonized: new Date().toISOString()
      };
      onSubmit(submissionData);
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
      {/* Cross-Format Harmonizer Header */}
      <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <ArrowRightLeft className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-blue-900">Cross-Format Harmonizer</CardTitle>
                <CardDescription className="text-blue-700">
                  Configure multi-regional device profile with automatic format conversion
                </CardDescription>
              </div>
            </div>
            <Badge 
              variant={harmonizationResult?.status === 'compliant' ? 'default' : 'secondary'}
              className={harmonizationResult?.status === 'compliant' ? 'bg-green-600' : ''}
            >
              {harmonizationResult?.status === 'compliant' ? (
                <><CheckCircle className="h-3 w-3 mr-1" />Harmonized</>
              ) : (
                <><Globe className="h-3 w-3 mr-1" />Multi-Regional</>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Primary Format Selection */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Primary Regulatory Format
              </label>
              <Select value={selectedFormat} onValueChange={handleFormatChange} data-testid="select-primary-format">
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FDA_510K">🇺🇸 FDA 510(k) - United States</SelectItem>
                  <SelectItem value="EU_MDR">🇪🇺 EU MDR - European Union</SelectItem>
                  <SelectItem value="HEALTH_CANADA">🇨🇦 Health Canada - Canada</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                {REGIONAL_FORMATS[selectedFormat]?.classificationSystem}
              </p>
            </div>
            
            {/* Target Markets */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Target Markets
              </label>
              <div className="space-y-2">
                {Object.entries(REGIONAL_FORMATS).map(([key, format]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`market-${key}`}
                      checked={targetMarkets.includes(key)}
                      onChange={(e) => handleTargetMarketChange(key, e.target.checked)}
                      className="h-4 w-4 text-blue-600 rounded"
                      data-testid={`checkbox-market-${key}`}
                    />
                    <label htmlFor={`market-${key}`} className="text-sm text-gray-700">
                      {format.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Harmonization Status */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Harmonization Status
              </label>
              <div className="space-y-3">
                <Button
                  onClick={handleFormatHarmonization}
                  disabled={isHarmonizing || targetMarkets.length <= 1}
                  variant="outline"
                  className="w-full"
                  data-testid="button-harmonize"
                >
                  {isHarmonizing ? (
                    <>Processing...</>
                  ) : (
                    <><ArrowRightLeft className="h-4 w-4 mr-2" />Harmonize Formats</>
                  )}
                </Button>
                
                {complianceGaps.length > 0 && (
                  <Alert className="bg-amber-50 border-amber-200">
                    <AlertTitle className="text-amber-800 text-sm">
                      {complianceGaps.length} Compliance Gap{complianceGaps.length > 1 ? 's' : ''} Detected
                    </AlertTitle>
                    <AlertDescription className="text-amber-700 text-xs mt-1">
                      Review the form to address regulatory requirements
                    </AlertDescription>
                  </Alert>
                )}
                
                {harmonizationResult?.status === 'compliant' && (
                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircle className="h-4 w-4" />
                    <AlertTitle className="text-green-800 text-sm">Fully Harmonized</AlertTitle>
                    <AlertDescription className="text-green-700 text-xs mt-1">
                      Ready for all target markets
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{isEditing ? 'Edit Device Profile' : 'New Device Profile'}</CardTitle>
              <CardDescription>
                Enter detailed information about your medical device for regulatory submission and
                pathway determination across multiple markets.
              </CardDescription>
            </div>
            <Badge variant="outline" className="ml-2">
              <FileCheck className="h-3 w-3 mr-1" />
              {REGIONAL_FORMATS[selectedFormat]?.name}
            </Badge>
          </div>
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
              
              {/* Cross-Format Harmonizer: Format-Specific Fields */}
              {selectedFormat === 'EU_MDR' && (
                <>
                  <div>
                    <h3 className="text-lg font-medium mb-4 flex items-center">
                      <span className="text-blue-600 mr-2">🇪🇺</span>
                      EU MDR Specific Requirements
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="mdrClassification"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>MDR Classification *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-mdr-classification">
                                  <SelectValue placeholder="Select MDR class" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="I">Class I (Low Risk)</SelectItem>
                                <SelectItem value="IIa">Class IIa (Low-Medium Risk)</SelectItem>
                                <SelectItem value="IIb">Class IIb (Medium-High Risk)</SelectItem>
                                <SelectItem value="III">Class III (High Risk)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>EU MDR device classification based on risk</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="gmdn"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>GMDN Code</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., 35396" {...field} data-testid="input-gmdn" />
                            </FormControl>
                            <FormDescription>Global Medical Device Nomenclature code</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="intendedPurpose"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>Intended Purpose (EU MDR) *</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Describe the intended purpose according to EU MDR requirements..."
                                className="min-h-[100px]"
                                {...field}
                                data-testid="textarea-intended-purpose"
                              />
                            </FormControl>
                            <FormDescription>EU MDR specific intended purpose statement</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="clinicalEvidence"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>Clinical Evidence</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Describe clinical evidence requirements and available data..."
                                className="min-h-[100px]"
                                {...field}
                                data-testid="textarea-clinical-evidence"
                              />
                            </FormControl>
                            <FormDescription>Clinical evaluation and evidence documentation</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="authorizedRepresentative"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Authorized Representative *</FormLabel>
                            <FormControl>
                              <Input placeholder="EU Authorized Representative details" {...field} data-testid="input-auth-rep" />
                            </FormControl>
                            <FormDescription>Required for non-EU manufacturers</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="riskManagement"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Risk Management</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="ISO 14971 risk management documentation..."
                                className="min-h-[80px]"
                                {...field}
                                data-testid="textarea-risk-management"
                              />
                            </FormControl>
                            <FormDescription>Risk management file per ISO 14971</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  <Separator />
                </>
              )}
              
              {selectedFormat === 'HEALTH_CANADA' && (
                <>
                  <div>
                    <h3 className="text-lg font-medium mb-4 flex items-center">
                      <span className="text-red-600 mr-2">🇨🇦</span>
                      Health Canada Specific Requirements
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="healthCanadaClass"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Health Canada Classification *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-hc-classification">
                                  <SelectValue placeholder="Select HC class" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="I">Class I (Low Risk)</SelectItem>
                                <SelectItem value="II">Class II (Medium Risk)</SelectItem>
                                <SelectItem value="III">Class III (Medium-High Risk)</SelectItem>
                                <SelectItem value="IV">Class IV (High Risk)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>Health Canada device classification</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="deviceLicenseNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Device License Number</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., 12345" {...field} data-testid="input-license-number" />
                            </FormControl>
                            <FormDescription>Health Canada device license number if available</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="licenseeInformation"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>Canadian Licensee Information *</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Provide details of the Canadian licensee or representative..."
                                className="min-h-[100px]"
                                {...field}
                                data-testid="textarea-licensee-info"
                              />
                            </FormControl>
                            <FormDescription>Required Canadian business entity information</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="qualityAssurance"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>Quality Assurance</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Describe quality assurance and manufacturing quality system..."
                                className="min-h-[100px]"
                                {...field}
                                data-testid="textarea-quality-assurance"
                              />
                            </FormControl>
                            <FormDescription>Quality system documentation and compliance</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  <Separator />
                </>
              )}

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
      
      {/* Cross-Format Harmonizer: Compliance Gaps Display */}
      {complianceGaps.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-800 flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Compliance Gaps Detected
            </CardTitle>
            <CardDescription className="text-amber-700">
              Address these gaps to ensure compliance across all target markets
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {complianceGaps.map((gap, index) => (
                <div key={index} className="flex items-start space-x-3 p-3 bg-white rounded-md border border-amber-200">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-grow">
                    <p className="text-sm text-amber-800 font-medium">{gap}</p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 p-3 bg-white rounded-md border border-amber-200">
              <h4 className="text-sm font-medium text-amber-800 mb-2">Quick Actions</h4>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleFormatHarmonization}
                  disabled={isHarmonizing}
                  className="text-amber-700 border-amber-300 hover:bg-amber-100"
                  data-testid="button-retry-harmonization"
                >
                  <ArrowRightLeft className="h-3 w-3 mr-1" />
                  Re-analyze
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setComplianceGaps([])}
                  className="text-amber-700 border-amber-300 hover:bg-amber-100"
                  data-testid="button-dismiss-gaps"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Cross-Format Harmonizer: Success Status */}
      {harmonizationResult?.status === 'compliant' && complianceGaps.length === 0 && targetMarkets.length > 1 && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-600 rounded-full">
                <CheckCircle className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-medium text-green-800">Multi-Regional Compliance Achieved</h3>
                <p className="text-sm text-green-700">
                  Your device profile is harmonized across {targetMarkets.length} regulatory formats.
                  Last updated: {harmonizationResult.timestamp ? new Date(harmonizationResult.timestamp).toLocaleString() : 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DeviceProfileForm;
