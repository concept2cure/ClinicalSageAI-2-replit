import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  Package, Building2, Target, Shield, FlaskConical, Heart, Cpu, FileText, Users, AlertTriangle, CheckCircle, Info, Save, Send, ChevronRight } from 'lucide-react'
import { DEVICE_TEMPLATES } from '../../services/ProjectTemplates';

const DATA_COLLECTION_SECTIONS = [
  { id: 'device_info', label: 'Device Information', icon: <Package className="h-4 w-4" />, required: true },
  { id: 'manufacturer', label: 'Manufacturer Details', icon: <Building2 className="h-4 w-4" />, required: true },
  { id: 'intended_use', label: 'Intended Use & Indications', icon: <Target className="h-4 w-4" />, required: true },
  { id: 'classification', label: 'Classification & Regulatory', icon: <Shield className="h-4 w-4" />, required: true },
  { id: 'predicate', label: 'Predicate Device', icon: <FileText className="h-4 w-4" />, required: false },
  { id: 'testing', label: 'Testing Requirements', icon: <FlaskConical className="h-4 w-4" />, required: false },
  { id: 'biocompat', label: 'Biocompatibility', icon: <Heart className="h-4 w-4" />, required: false },
  { id: 'software', label: 'Software/AI', icon: <Cpu className="h-4 w-4" />, required: false },
  { id: 'clinical', label: 'Clinical Data', icon: <Users className="h-4 w-4" />, required: false }
];

export default function InitialDataCollectionForms({ 
  projectId, 
  templateId, 
  onComplete, 
  initialData = {} 
}) {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState('device_info');
  const [formData, setFormData] = useState({
    device_info: {
      deviceName: '',
      commonName: '',
      modelNumber: '',
      catalogNumber: '',
      deviceDescription: '',
      physicalCharacteristics: '',
      dimensions: '',
      weight: '',
      materials: [],
      componentsIncluded: '',
      ...initialData.device_info
    },
    manufacturer: {
      companyName: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'United States',
      contactPerson: '',
      contactEmail: '',
      contactPhone: '',
      establishmentNumber: '',
      dunsNumber: '',
      ...initialData.manufacturer
    },
    intended_use: {
      intendedUse: '',
      indicationsForUse: '',
      patientPopulation: '',
      useEnvironment: 'professional_healthcare',
      operatingPrinciple: '',
      durationOfUse: 'temporary',
      bodyContact: 'surface',
      tissueType: '',
      ...initialData.intended_use
    },
    classification: {
      deviceClass: 'II',
      productCode: '',
      regulationNumber: '',
      panelCode: '',
      reviewPanel: '',
      submissionType: 'traditional',
      guidanceDocuments: [],
      consensusStandards: [],
      ...initialData.classification
    },
    predicate: {
      hasPredicateDevice: true,
      predicateName: '',
      predicateManufacturer: '',
      predicateKNumber: '',
      predicateClearanceDate: '',
      comparisonBasis: 'substantial_equivalence',
      similarities: '',
      differences: '',
      ...initialData.predicate
    },
    testing: {
      performanceTesting: [],
      benchTesting: false,
      animalTesting: false,
      cadaverTesting: false,
      testStandards: [],
      testProtocols: '',
      acceptanceCriteria: '',
      ...initialData.testing
    },
    biocompat: {
      patientContact: true,
      contactDuration: 'limited',
      contactType: 'surface',
      iso10993Testing: [],
      materialsOfConcern: '',
      previousTestingAvailable: false,
      ...initialData.biocompat
    },
    software: {
      containsSoftware: false,
      softwareType: 'simd',
      levelOfConcern: 'moderate',
      hasAI: false,
      aiType: '',
      cybersecurityRequired: false,
      connectivityType: '',
      dataTypes: [],
      ...initialData.software
    },
    clinical: {
      clinicalDataRequired: false,
      studyType: '',
      numberOfPatients: '',
      studyDuration: '',
      primaryEndpoints: '',
      secondaryEndpoints: '',
      adverseEvents: '',
      ...initialData.clinical
    }
  });

  const [completionStatus, setCompletionStatus] = useState({});
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    // Apply template defaults if templateId is provided
    if (templateId && DEVICE_TEMPLATES[templateId]) {
      const template = DEVICE_TEMPLATES[templateId];
      const templateDefaults = template.defaultValues;
      
      setFormData(prev => ({
        ...prev,
        classification: {
          ...prev.classification,
          deviceClass: template.deviceClassification,
          submissionType: template.submissionType
        },
        testing: {
          ...prev.testing,
          benchTesting: templateDefaults.hasClinicalData
        },
        biocompat: {
          ...prev.biocompat,
          patientContact: templateDefaults.hasBiocompatibility
        },
        software: {
          ...prev.software,
          containsSoftware: templateDefaults.hasSoftware,
          hasAI: templateDefaults.hasAI,
          cybersecurityRequired: templateDefaults.hasCybersecurity
        },
        clinical: {
          ...prev.clinical,
          clinicalDataRequired: templateDefaults.hasClinicalData
        }
      }));
    }
  }, [templateId]);

  useEffect(() => {
    validateSection(activeSection);
  }, [formData, activeSection]);

  const handleInputChange = (section, field, value) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const handleArrayChange = (section, field, value, checked) => {
    setFormData(prev => {
      const currentArray = prev[section][field] || [];
      const updatedArray = checked 
        ? [...currentArray, value]
        : currentArray.filter(item => item !== value);
      
      return {
        ...prev,
        [section]: {
          ...prev[section],
          [field]: updatedArray
        }
      };
    });
  };

  const validateSection = (sectionId) => {
    const section = formData[sectionId];
    const errors = {};
    
    switch (sectionId) {
      case 'device_info':
        if (!section.deviceName) errors.deviceName = 'Device name is required';
        if (!section.deviceDescription) errors.deviceDescription = 'Device description is required';
        break;
      case 'manufacturer':
        if (!section.companyName) errors.companyName = 'Company name is required';
        if (!section.address) errors.address = 'Address is required';
        if (!section.contactPerson) errors.contactPerson = 'Contact person is required';
        break;
      case 'intended_use':
        if (!section.intendedUse) errors.intendedUse = 'Intended use is required';
        if (!section.indicationsForUse) errors.indicationsForUse = 'Indications for use is required';
        break;
      case 'classification':
        if (!section.productCode || section.productCode.length !== 3) {
          errors.productCode = 'Product code must be 3 letters';
        }
        break;
      case 'predicate':
        if (section.hasPredicateDevice) {
          if (!section.predicateKNumber) errors.predicateKNumber = 'Predicate K number is required';
        }
        break;
    }
    
    setValidationErrors(prev => ({ ...prev, [sectionId]: errors }));
    setCompletionStatus(prev => ({
      ...prev,
      [sectionId]: Object.keys(errors).length === 0
    }));
    
    return Object.keys(errors).length === 0;
  };

  const handleSaveProgress = async () => {
    try {
      const response = await fetch(`/api/510k/projects/${projectId}/initial-data`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-organization-id': localStorage.getItem('organizationId') || '1',
          'x-user-id': localStorage.getItem('userId') || '1'
        },
        body: JSON.stringify({
          collectedData: formData,
          completionStatus,
          lastUpdated: new Date().toISOString()
        })
      });

      if (response.ok) {
        toast({
          title: 'Progress Saved',
          description: 'Your data collection progress has been saved',
        });
      }
    } catch (error) {
      toast({
        title: 'Save Failed',
        description: 'Failed to save progress',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async () => {
    // Validate all required sections
    const requiredSections = DATA_COLLECTION_SECTIONS.filter(s => s.required);
    let allValid = true;
    
    for (const section of requiredSections) {
      if (!validateSection(section.id)) {
        allValid = false;
      }
    }
    
    if (!allValid) {
      toast({
        title: 'Validation Error',
        description: 'Please complete all required fields',
        variant: 'destructive',
      });
      return;
    }

    await handleSaveProgress();
    onComplete(formData);
  };

  const renderDeviceInfoForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="deviceName" data-testid="label-deviceName">
            Device Trade/Proprietary Name *
          </Label>
          <Input
            id="deviceName"
            data-testid="input-deviceName"
            value={formData.device_info.deviceName}
            onChange={(e) => handleInputChange('device_info', 'deviceName', e.target.value)}
            placeholder="Enter device trade name"
            className={validationErrors.device_info?.deviceName ? 'border-red-500' : ''}
          />
          {validationErrors.device_info?.deviceName && (
            <p className="text-xs text-red-500 mt-1">{validationErrors.device_info.deviceName}</p>
          )}
        </div>

        <div>
          <Label htmlFor="commonName" data-testid="label-commonName">Common/Usual Name</Label>
          <Input
            id="commonName"
            data-testid="input-commonName"
            value={formData.device_info.commonName}
            onChange={(e) => handleInputChange('device_info', 'commonName', e.target.value)}
            placeholder="Enter common device name"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="modelNumber" data-testid="label-modelNumber">Model Number</Label>
          <Input
            id="modelNumber"
            data-testid="input-modelNumber"
            value={formData.device_info.modelNumber}
            onChange={(e) => handleInputChange('device_info', 'modelNumber', e.target.value)}
            placeholder="Enter model number"
          />
        </div>

        <div>
          <Label htmlFor="catalogNumber" data-testid="label-catalogNumber">Catalog Number</Label>
          <Input
            id="catalogNumber"
            data-testid="input-catalogNumber"
            value={formData.device_info.catalogNumber}
            onChange={(e) => handleInputChange('device_info', 'catalogNumber', e.target.value)}
            placeholder="Enter catalog number"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="deviceDescription" data-testid="label-deviceDescription">
          Device Description *
        </Label>
        <Textarea
          id="deviceDescription"
          data-testid="textarea-deviceDescription"
          value={formData.device_info.deviceDescription}
          onChange={(e) => handleInputChange('device_info', 'deviceDescription', e.target.value)}
          placeholder="Provide a detailed description of the device, its components, and how it works"
          rows={4}
          className={validationErrors.device_info?.deviceDescription ? 'border-red-500' : ''}
        />
        {validationErrors.device_info?.deviceDescription && (
          <p className="text-xs text-red-500 mt-1">{validationErrors.device_info.deviceDescription}</p>
        )}
      </div>

      <div>
        <Label htmlFor="physicalCharacteristics" data-testid="label-physicalCharacteristics">
          Physical Characteristics
        </Label>
        <Textarea
          id="physicalCharacteristics"
          data-testid="textarea-physicalCharacteristics"
          value={formData.device_info.physicalCharacteristics}
          onChange={(e) => handleInputChange('device_info', 'physicalCharacteristics', e.target.value)}
          placeholder="Describe size, shape, color, and other physical properties"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="dimensions" data-testid="label-dimensions">Dimensions</Label>
          <Input
            id="dimensions"
            data-testid="input-dimensions"
            value={formData.device_info.dimensions}
            onChange={(e) => handleInputChange('device_info', 'dimensions', e.target.value)}
            placeholder="e.g., 10cm x 5cm x 2cm"
          />
        </div>

        <div>
          <Label htmlFor="weight" data-testid="label-weight">Weight</Label>
          <Input
            id="weight"
            data-testid="input-weight"
            value={formData.device_info.weight}
            onChange={(e) => handleInputChange('device_info', 'weight', e.target.value)}
            placeholder="e.g., 500g"
          />
        </div>
      </div>
    </div>
  );

  const renderManufacturerForm = () => (
    <div className="space-y-4">
      <div>
        <Label htmlFor="companyName" data-testid="label-companyName">Company Name *</Label>
        <Input
          id="companyName"
          data-testid="input-companyName"
          value={formData.manufacturer.companyName}
          onChange={(e) => handleInputChange('manufacturer', 'companyName', e.target.value)}
          placeholder="Enter manufacturer company name"
          className={validationErrors.manufacturer?.companyName ? 'border-red-500' : ''}
        />
      </div>

      <div>
        <Label htmlFor="address" data-testid="label-address">Address *</Label>
        <Input
          id="address"
          data-testid="input-address"
          value={formData.manufacturer.address}
          onChange={(e) => handleInputChange('manufacturer', 'address', e.target.value)}
          placeholder="Street address"
          className={validationErrors.manufacturer?.address ? 'border-red-500' : ''}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="city" data-testid="label-city">City</Label>
          <Input
            id="city"
            data-testid="input-city"
            value={formData.manufacturer.city}
            onChange={(e) => handleInputChange('manufacturer', 'city', e.target.value)}
            placeholder="City"
          />
        </div>

        <div>
          <Label htmlFor="state" data-testid="label-state">State</Label>
          <Input
            id="state"
            data-testid="input-state"
            value={formData.manufacturer.state}
            onChange={(e) => handleInputChange('manufacturer', 'state', e.target.value)}
            placeholder="State"
          />
        </div>

        <div>
          <Label htmlFor="zipCode" data-testid="label-zipCode">ZIP Code</Label>
          <Input
            id="zipCode"
            data-testid="input-zipCode"
            value={formData.manufacturer.zipCode}
            onChange={(e) => handleInputChange('manufacturer', 'zipCode', e.target.value)}
            placeholder="ZIP"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="contactPerson" data-testid="label-contactPerson">Contact Person *</Label>
        <Input
          id="contactPerson"
          data-testid="input-contactPerson"
          value={formData.manufacturer.contactPerson}
          onChange={(e) => handleInputChange('manufacturer', 'contactPerson', e.target.value)}
          placeholder="Full name of primary contact"
          className={validationErrors.manufacturer?.contactPerson ? 'border-red-500' : ''}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="contactEmail" data-testid="label-contactEmail">Contact Email</Label>
          <Input
            id="contactEmail"
            data-testid="input-contactEmail"
            type="email"
            value={formData.manufacturer.contactEmail}
            onChange={(e) => handleInputChange('manufacturer', 'contactEmail', e.target.value)}
            placeholder="email@company.com"
          />
        </div>

        <div>
          <Label htmlFor="contactPhone" data-testid="label-contactPhone">Contact Phone</Label>
          <Input
            id="contactPhone"
            data-testid="input-contactPhone"
            value={formData.manufacturer.contactPhone}
            onChange={(e) => handleInputChange('manufacturer', 'contactPhone', e.target.value)}
            placeholder="(555) 123-4567"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="establishmentNumber" data-testid="label-establishmentNumber">
            FDA Establishment Number
          </Label>
          <Input
            id="establishmentNumber"
            data-testid="input-establishmentNumber"
            value={formData.manufacturer.establishmentNumber}
            onChange={(e) => handleInputChange('manufacturer', 'establishmentNumber', e.target.value)}
            placeholder="10-digit FEI number"
          />
        </div>

        <div>
          <Label htmlFor="dunsNumber" data-testid="label-dunsNumber">DUNS Number</Label>
          <Input
            id="dunsNumber"
            data-testid="input-dunsNumber"
            value={formData.manufacturer.dunsNumber}
            onChange={(e) => handleInputChange('manufacturer', 'dunsNumber', e.target.value)}
            placeholder="9-digit DUNS"
          />
        </div>
      </div>
    </div>
  );

  const getCompletionPercentage = () => {
    const totalSections = DATA_COLLECTION_SECTIONS.length;
    const completedSections = Object.values(completionStatus).filter(status => status).length;
    return Math.round((completedSections / totalSections) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Initial Data Collection</CardTitle>
          <CardDescription>
            Complete device specifications and regulatory information for your 510(k) submission
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Overall Completion</span>
              <span>{getCompletionPercentage()}%</span>
            </div>
            <Progress value={getCompletionPercentage()} />
          </div>
        </CardContent>
      </Card>

      {/* Section Tabs */}
      <Card className="min-h-[500px]">
        <CardContent className="p-0">
          <Tabs value={activeSection} onValueChange={setActiveSection} className="h-full">
            <TabsList className="w-full justify-start rounded-none border-b px-4 h-auto flex-wrap">
              {DATA_COLLECTION_SECTIONS.map(section => (
                <TabsTrigger
                  key={section.id}
                  value={section.id}
                  className="data-[state=active]:bg-blue-50 flex items-center gap-2"
                  data-testid={`tab-${section.id}`}
                >
                  {section.icon}
                  {section.label}
                  {section.required && <span className="text-red-500">*</span>}
                  {completionStatus[section.id] && (
                    <CheckCircle className="h-3 w-3 text-green-600 ml-1" />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="p-6">
              <TabsContent value="device_info">
                {renderDeviceInfoForm()}
              </TabsContent>

              <TabsContent value="manufacturer">
                {renderManufacturerForm()}
              </TabsContent>

              {/* Add other form sections similarly */}
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handleSaveProgress}
          data-testid="button-save-progress"
        >
          <Save className="h-4 w-4 mr-2" />
          Save Progress
        </Button>

        <Button
          onClick={handleSubmit}
          disabled={getCompletionPercentage() < 100}
          data-testid="button-submit-data"
        >
          <Send className="h-4 w-4 mr-2" />
          Complete Data Collection
        </Button>
      </div>
    </div>
  );
}