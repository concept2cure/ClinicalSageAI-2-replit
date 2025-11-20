import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, FileText, FilePlus, Check, RefreshCw, Download } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { registerModuleDocument } from '../unified-workflow/registerModuleDocument';

const DEVICE_TYPES = [
  { value: 'cardio', label: 'Cardiovascular' },
  { value: 'orthopedic', label: 'Orthopedic' },
  { value: 'neuro', label: 'Neurological' },
  { value: 'diagnostic', label: 'Diagnostic' },
  { value: 'general', label: 'General Hospital' },
  { value: 'dental', label: 'Dental' },
  { value: 'ophthalmic', label: 'Ophthalmic' },
  { value: 'ear_nose_throat', label: 'Ear, Nose, and Throat' },
  { value: 'radiology', label: 'Radiology' },
];

const RISK_CLASSIFICATIONS = [
  { value: 'class_i', label: 'Class I' },
  { value: 'class_ii', label: 'Class II' },
  { value: 'class_iii', label: 'Class III' },
];

const SUBMISSION_TYPES = [
  { value: 'traditional', label: 'Traditional 510(k)' },
  { value: 'abbreviated', label: 'Abbreviated 510(k)' },
  { value: 'special', label: 'Special 510(k)' },
];

const OneClick510kDraft = ({
  organizationId,
  userId,
  deviceData,
  predicateData,
  onDraftCreated,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState('device-info');
  const [deviceType, setDeviceType] = useState('cardio');
  const [riskClass, setRiskClass] = useState('class_ii');
  const [submissionType, setSubmissionType] = useState('traditional');
  const [title, setTitle] = useState(
    deviceData?.deviceName ? `${deviceData.deviceName} 510(k) Draft` : ''
  );
  const [description, setDescription] = useState('');
  const [intendedUse, setIntendedUse] = useState(deviceData?.intendedUse || '');
  const [technicalCharacteristics, setTechnicalCharacteristics] = useState('');
  const [predicateComparison, setPredicateComparison] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStandards, setIsStandards] = useState(true);
  const [isSoftware, setIsSoftware] = useState(false);
  const [isAnimalTesting, setIsAnimalTesting] = useState(false);
  const [isClinicalData, setIsClinicalData] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [draftUrl, setDraftUrl] = useState(null);

  // Set default values based on device data
  React.useEffect(() => {
    if (deviceData?.deviceName) {
      setTitle(`${deviceData.deviceName} 510(k) Draft`);
    }
    if (deviceData?.intendedUse) {
      setIntendedUse(deviceData.intendedUse);
    }
    if (deviceData?.description) {
      setDescription(deviceData.description);
    }
    if (deviceData?.deviceClass) {
      const classMapping = {
        'Class I': 'class_i',
        'Class II': 'class_ii',
        'Class III': 'class_iii',
      };
      if (classMapping[deviceData.deviceClass]) {
        setRiskClass(classMapping[deviceData.deviceClass]);
      }
    }

    // Generate technical characteristics based on device data
    if (deviceData?.technicalSpecifications) {
      const specs = deviceData.technicalSpecifications;
      let techSpecs = '';
      for (const [key, value] of Object.entries(specs)) {
        // Convert camelCase to Title Case
        const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        techSpecs += `${formattedKey}: ${value}\n`;
      }
      setTechnicalCharacteristics(techSpecs);
    }

    // Generate predicate comparison if predicate data exists
    if (predicateData?.deviceName) {
      setPredicateComparison(
        `The ${deviceData?.deviceName || 'subject device'} is substantially equivalent to ${predicateData.deviceName} (${predicateData.k510Number || 'K-number pending'}) in terms of intended use, technological characteristics, and safety profile.`
      );
    }
  }, [deviceData, predicateData]);

  const handleGenerate510kDraft = async () => {
    if (!title.trim()) {
      toast({
        title: 'Title required',
        description: 'Please provide a title for the 510(k) draft.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);

    try {
      // Collect all draft data
      const draftData = {
        organizationId,
        userId,
        title,
        description,
        deviceType,
        riskClass,
        submissionType,
        intendedUse,
        technicalCharacteristics,
        predicateComparison,
        deviceData,
        predicateData,
        sections: {
          isStandards,
          isSoftware,
          isAnimalTesting,
          isClinicalData,
        },
      };

      // Make API call to generate the draft
      const response = await fetch('/api/module-integration/510k-draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(draftData),
      });

      if (!response.ok) {
        throw new Error('Failed to generate 510(k) draft');
      }

      const data = await response.json();

      setDraftId(data.draftId);
      setDraftUrl(data.draftUrl);

      // Register the document in the workflow system
      await registerDraftInWorkflow(data.draftId);

      toast({
        title: '510(k) draft generated',
        description: 'Your draft has been created and is ready for review.',
      });

      // Notify parent component
      if (onDraftCreated) {
        onDraftCreated(data.draftId);
      }
    } catch (error) {
      console.error('Error generating draft:', error);
      toast({
        title: 'Error generating draft',
        description:
          error.message || 'An unexpected error occurred while generating the 510(k) draft.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const registerDraftInWorkflow = async draftId => {
    try {
      const documentMetadata = {
        title,
        description: `510(k) draft for ${deviceData?.deviceName || 'new device'}`,
        documentType: '510k_draft',
        draftId,
        deviceId: deviceData?.id,
        predicateDeviceId: predicateData?.id,
        submissionType,
        riskClass,
        createdAt: new Date().toISOString(),
      };

      await registerModuleDocument(organizationId, userId, 'medical_device', documentMetadata);

      toast({
        title: 'Document registered',
        description: 'The 510(k) draft has been registered in the document workflow system.',
      });
    } catch (error) {
      console.error('Error registering document in workflow:', error);
      toast({
        title: 'Registration warning',
        description: 'The draft was created but could not be registered in the workflow system.',
        variant: 'warning',
      });
    }
  };

  const nextTab = () => {
    if (activeTab === 'device-info') {
      setActiveTab('technical-details');
    } else if (activeTab === 'technical-details') {
      setActiveTab('predicate-comparison');
    } else if (activeTab === 'predicate-comparison') {
      setActiveTab('sections');
    }
  };

  const prevTab = () => {
    if (activeTab === 'sections') {
      setActiveTab('predicate-comparison');
    } else if (activeTab === 'predicate-comparison') {
      setActiveTab('technical-details');
    } else if (activeTab === 'technical-details') {
      setActiveTab('device-info');
    }
  };

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle>One-Click 510(k) Draft Generator</CardTitle>
          <CardDescription>
            Create a structured 510(k) submission draft with AI-enhanced content generation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="device-info">Device Info</TabsTrigger>
              <TabsTrigger value="technical-details">Technical Details</TabsTrigger>
              <TabsTrigger value="predicate-comparison">Predicate Comparison</TabsTrigger>
              <TabsTrigger value="sections">Sections</TabsTrigger>
            </TabsList>

            <div className="py-4">
              <TabsContent value="device-info">
                <div className="space-y-4">
                  <Alert variant="info" className="bg-blue-50">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Device Information</AlertTitle>
                    <AlertDescription>
                      Enter basic information about your medical device for the 510(k) submission.
                    </AlertDescription>
                  </Alert>

                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="title">Draft Title</Label>
                      <Input
                        id="title"
                        placeholder="Enter a title for your 510(k) draft"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="description">Device Description</Label>
                      <Textarea
                        id="description"
                        placeholder="Provide a brief description of the device"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        className="min-h-[100px]"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="device-type">Device Type</Label>
                      <Select value={deviceType} onValueChange={setDeviceType}>
                        <SelectTrigger id="device-type">
                          <SelectValue placeholder="Select device type" />
                        </SelectTrigger>
                        <SelectContent>
                          {DEVICE_TYPES.map(type => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="risk-class">Risk Classification</Label>
                      <Select value={riskClass} onValueChange={setRiskClass}>
                        <SelectTrigger id="risk-class">
                          <SelectValue placeholder="Select risk classification" />
                        </SelectTrigger>
                        <SelectContent>
                          {RISK_CLASSIFICATIONS.map(riskClass => (
                            <SelectItem key={riskClass.value} value={riskClass.value}>
                              {riskClass.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="submission-type">Submission Type</Label>
                      <Select value={submissionType} onValueChange={setSubmissionType}>
                        <SelectTrigger id="submission-type">
                          <SelectValue placeholder="Select submission type" />
                        </SelectTrigger>
                        <SelectContent>
                          {SUBMISSION_TYPES.map(type => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="technical-details">
                <div className="space-y-4">
                  <Alert variant="info" className="bg-blue-50">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Technical Details</AlertTitle>
                    <AlertDescription>
                      Provide technical specifications and intended use information for your device.
                    </AlertDescription>
                  </Alert>

                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="intended-use">Intended Use</Label>
                      <Textarea
                        id="intended-use"
                        placeholder="Describe the intended use of the device"
                        value={intendedUse}
                        onChange={e => setIntendedUse(e.target.value)}
                        className="min-h-[100px]"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="technical-characteristics">Technical Characteristics</Label>
                      <Textarea
                        id="technical-characteristics"
                        placeholder="List the technical characteristics of the device"
                        value={technicalCharacteristics}
                        onChange={e => setTechnicalCharacteristics(e.target.value)}
                        className="min-h-[150px]"
                      />
                      <p className="text-xs text-muted-foreground">
                        Include dimensions, materials, operating parameters, etc.
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="predicate-comparison">
                <div className="space-y-4">
                  <Alert variant="info" className="bg-blue-50">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Predicate Device Comparison</AlertTitle>
                    <AlertDescription>
                      Describe how your device compares to the predicate device(s).
                    </AlertDescription>
                  </Alert>

                  <div className="bg-muted p-4 rounded-md mb-4">
                    <h3 className="font-medium mb-2">Selected Predicate Device</h3>
                    <div className="text-sm">
                      <p>
                        <span className="font-medium">Name:</span>{' '}
                        {predicateData?.deviceName || 'Not specified'}
                      </p>
                      <p>
                        <span className="font-medium">510(k) Number:</span>{' '}
                        {predicateData?.k510Number || 'Not specified'}
                      </p>
                      <p>
                        <span className="font-medium">Manufacturer:</span>{' '}
                        {predicateData?.manufacturer || 'Not specified'}
                      </p>
                      <p>
                        <span className="font-medium">Clearance Date:</span>{' '}
                        {predicateData?.clearanceDate || 'Not specified'}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="predicate-comparison">Substantial Equivalence Rationale</Label>
                    <Textarea
                      id="predicate-comparison"
                      placeholder="Describe how your device is substantially equivalent to the predicate device"
                      value={predicateComparison}
                      onChange={e => setPredicateComparison(e.target.value)}
                      className="min-h-[150px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Explain similarities and differences in intended use, technological
                      characteristics, and performance.
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="sections">
                <div className="space-y-4">
                  <Alert variant="info" className="bg-blue-50">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>510(k) Sections</AlertTitle>
                    <AlertDescription>
                      Select the sections to include in your 510(k) draft.
                    </AlertDescription>
                  </Alert>

                  <div className="grid gap-4">
                    <div className="flex items-center justify-between space-x-2">
                      <Label htmlFor="standards">Standards</Label>
                      <Switch
                        id="standards"
                        checked={isStandards}
                        onCheckedChange={setIsStandards}
                      />
                    </div>
                    <Separator />

                    <div className="flex items-center justify-between space-x-2">
                      <Label htmlFor="software">Software Documentation</Label>
                      <Switch id="software" checked={isSoftware} onCheckedChange={setIsSoftware} />
                    </div>
                    <Separator />

                    <div className="flex items-center justify-between space-x-2">
                      <Label htmlFor="animal-testing">Animal Testing</Label>
                      <Switch
                        id="animal-testing"
                        checked={isAnimalTesting}
                        onCheckedChange={setIsAnimalTesting}
                      />
                    </div>
                    <Separator />

                    <div className="flex items-center justify-between space-x-2">
                      <Label htmlFor="clinical-data">Clinical Data</Label>
                      <Switch
                        id="clinical-data"
                        checked={isClinicalData}
                        onCheckedChange={setIsClinicalData}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>

          {draftId && (
            <div className="mt-4 p-4 bg-green-50 rounded-md">
              <div className="flex items-center">
                <Check className="h-5 w-5 text-green-600 mr-2" />
                <h3 className="font-medium text-green-800">Draft Generated Successfully</h3>
              </div>
              <p className="text-sm text-green-700 mt-1">
                Your 510(k) draft document has been created and is ready for review.
              </p>
              {draftUrl && (
                <Button variant="link" size="sm" className="p-0 mt-2 text-green-700" asChild>
                  <a href={draftUrl} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4 mr-1" /> Download Draft
                  </a>
                </Button>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <div>
            {activeTab !== 'device-info' && (
              <Button variant="outline" onClick={prevTab}>
                Previous
              </Button>
            )}
          </div>

          <div>
            {activeTab !== 'sections' ? (
              <Button onClick={nextTab}>Next</Button>
            ) : (
              <Button onClick={handleGenerate510kDraft} disabled={isGenerating || !title.trim()}>
                {isGenerating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : draftId ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Regenerate Draft
                  </>
                ) : (
                  <>
                    <FilePlus className="h-4 w-4 mr-2" />
                    Generate Draft
                  </>
                )}
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default OneClick510kDraft;
