import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { cerApiService } from '@/services/CerAPIService';
import {
  BookMarked,
  RefreshCw,
  Download,
  FileText,
  AlertCircle,
  CheckCircle,
  GitCompare,
  Plus,
  X,
} from 'lucide-react';
import { useToast } from '@/components/ui/toaster';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

export default function StateOfArtPanel({ onSectionGenerated }) {
  const [deviceName, setDeviceName] = useState('');
  const [deviceType, setDeviceType] = useState('');
  const [indication, setIndication] = useState('');
  const [regulatoryFramework, setRegulatoryFramework] = useState('EU MDR');
  const [isGenerating, setIsGenerating] = useState(false);
  const [sotaContent, setSotaContent] = useState('');
  const [validationErrors, setValidationErrors] = useState({});
  const [activeTab, setActiveTab] = useState('standard');

  // New fields for comparative SOTA
  const [competitorDevices, setCompetitorDevices] = useState([]);
  const [newCompetitorDevice, setNewCompetitorDevice] = useState('');
  const [manufacturers, setManufacturers] = useState([]);
  const [newManufacturer, setNewManufacturer] = useState('');
  const [outcomeMetrics, setOutcomeMetrics] = useState([]);
  const [newOutcomeMetric, setNewOutcomeMetric] = useState('');
  const [commonMetrics, setCommonMetrics] = useState({
    safetyProfile: false,
    efficacy: false,
    patientSatisfaction: false,
    survivalRate: false,
    complicationRate: false,
    functionalOutcomes: false,
    rehabilitationTime: false,
  });

  const { toast } = useToast();

  // Device type options
  const deviceTypes = [
    'Class I Medical Device',
    'Class II Medical Device',
    'Class III Medical Device',
    'Implantable Device',
    'Software as Medical Device',
    'Diagnostic Device',
    'Therapeutic Device',
    'Monitoring Device',
    'Surgical Instrument',
    'Orthopedic Device',
  ];

  // Regulatory framework options
  const regulatoryFrameworks = [
    'EU MDR',
    'FDA 510(k)',
    'FDA PMA',
    'ISO 14155',
    'MEDDEV 2.7/1 Rev 4',
    'EU IVDR',
  ];

  const validateInputs = () => {
    const errors = {};

    if (!deviceName.trim()) {
      errors.deviceName = 'Device name is required';
    }

    if (!deviceType) {
      errors.deviceType = 'Device type is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleGenerateSOTA = async () => {
    if (!validateInputs()) return;

    try {
      setIsGenerating(true);

      const sotaSection = await cerApiService.generateStateOfArt({
        deviceName,
        deviceType,
        indication,
        regulatoryFramework,
      });

      setSotaContent(sotaSection.content);

      // Pass the generated section up to the parent component
      if (onSectionGenerated) {
        onSectionGenerated(sotaSection);
      }

      toast({
        title: 'State of Art Analysis Generated',
        description: 'SOTA section has been successfully created and added to your CER',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error generating SOTA:', error);
      toast({
        title: 'Error Generating SOTA Analysis',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateComparativeSOTA = async () => {
    if (!validateInputs()) return;

    try {
      setIsGenerating(true);

      // Combine checked common metrics with custom metrics
      const allOutcomeMetrics = [
        ...outcomeMetrics,
        ...Object.entries(commonMetrics)
          .filter(([_, isChecked]) => isChecked)
          .map(([metricName, _]) => {
            // Convert camelCase to readable format (e.g., safetyProfile -> Safety Profile)
            return metricName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          }),
      ];

      const sotaSection = await cerApiService.generateComparativeSOTA({
        deviceName,
        deviceType,
        indication,
        regulatoryFramework,
        manufacturers,
        competitorDevices,
        outcomeMetrics: allOutcomeMetrics,
      });

      setSotaContent(sotaSection.content);

      // Pass the generated section up to the parent component
      if (onSectionGenerated) {
        onSectionGenerated(sotaSection);
      }

      toast({
        title: 'Comparative SOTA Analysis Generated',
        description: 'Enhanced comparative SOTA section has been generated and added to your CER',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error generating comparative SOTA:', error);
      toast({
        title: 'Error Generating Comparative Analysis',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper function to add items to arrays
  const addItemToArray = (setter, newItem, currentItems, setNewItem) => {
    if (newItem.trim() && !currentItems.includes(newItem.trim())) {
      setter([...currentItems, newItem.trim()]);
      setNewItem('');
    }
  };

  // Helper function to remove items from arrays
  const removeItemFromArray = (setter, currentItems, index) => {
    setter(currentItems.filter((_, i) => i !== index));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sota-panel">
      {/* Input panel - Using MS365-inspired design */}
      <div className="lg:col-span-2">
        <Card className="shadow-sm border-[#e8e6dc]">
          <CardHeader className="bg-[#F5F5F5] pb-3 pt-3">
            <CardTitle className="text-[#141413] text-lg flex items-center">
              <BookMarked className="h-5 w-5 mr-2 text-[#292524]" />
              State of the Art Analysis
            </CardTitle>
            <CardDescription className="text-[#616161]">
              Generate a comprehensive analysis of the current state of the art
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full cer-tabs">
              <TabsList className="bg-[#F5F5F5] mb-4 w-full grid grid-cols-2 cer-tabs-list">
                <TabsTrigger
                  value="standard"
                  className="cer-tab-trigger rounded-none border-b-2 border-transparent data-[state=active]:border-[#292524] data-[state=active]:text-[#292524]"
                >
                  <BookMarked className="h-3.5 w-3.5 mr-1.5" />
                  <span>Standard</span>
                </TabsTrigger>
                <TabsTrigger
                  value="comparative"
                  className="cer-tab-trigger rounded-none border-b-2 border-transparent data-[state=active]:border-[#292524] data-[state=active]:text-[#292524]"
                >
                  <GitCompare className="h-3.5 w-3.5 mr-1.5" />
                  <span>Comparative</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="standard" className="space-y-4 mt-0 cer-tabs-content">
                {/* Standard SOTA fields */}
                <div className="space-y-2">
                  <Label htmlFor="device-name" className="text-[#141413]">
                    Device Name <span className="text-[#1c1917]">*</span>
                  </Label>
                  <Input
                    id="device-name"
                    value={deviceName}
                    onChange={e => setDeviceName(e.target.value)}
                    placeholder="e.g., Arthrosurface Shoulder Arthroplasty System"
                    className="border-[#e8e6dc]"
                  />
                  {validationErrors.deviceName && (
                    <p className="text-xs text-[#1c1917] mt-1 flex items-center">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {validationErrors.deviceName}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="device-type" className="text-[#141413]">
                    Device Type <span className="text-[#1c1917]">*</span>
                  </Label>
                  <Select value={deviceType} onValueChange={setDeviceType}>
                    <SelectTrigger id="device-type" className="border-[#e8e6dc]">
                      <SelectValue placeholder="Select device type" />
                    </SelectTrigger>
                    <SelectContent>
                      {deviceTypes.map(type => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {validationErrors.deviceType && (
                    <p className="text-xs text-[#1c1917] mt-1 flex items-center">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {validationErrors.deviceType}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="indication" className="text-[#141413]">
                    Intended Use/Indication
                  </Label>
                  <Textarea
                    id="indication"
                    value={indication}
                    onChange={e => setIndication(e.target.value)}
                    placeholder="e.g., Treatment of shoulder joint pathologies like osteoarthritis or rotator cuff deficiency"
                    className="border-[#e8e6dc] min-h-[80px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="regulatory-framework" className="text-[#141413]">
                    Regulatory Framework
                  </Label>
                  <Select value={regulatoryFramework} onValueChange={setRegulatoryFramework}>
                    <SelectTrigger id="regulatory-framework" className="border-[#e8e6dc]">
                      <SelectValue placeholder="Select regulatory framework" />
                    </SelectTrigger>
                    <SelectContent>
                      {regulatoryFrameworks.map(framework => (
                        <SelectItem key={framework} value={framework}>
                          {framework}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleGenerateSOTA}
                  disabled={isGenerating}
                  className="w-full bg-[#292524] hover:bg-[#1c1917] text-white"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <BookMarked className="h-4 w-4 mr-2" />
                      Generate Standard SOTA
                    </>
                  )}
                </Button>
              </TabsContent>

              <TabsContent value="comparative" className="space-y-4 mt-0 cer-tabs-content">
                {/* Comparative SOTA fields */}
                <div className="space-y-2">
                  <Label htmlFor="comp-device-name" className="text-[#141413]">
                    Device Name <span className="text-[#1c1917]">*</span>
                  </Label>
                  <Input
                    id="comp-device-name"
                    value={deviceName}
                    onChange={e => setDeviceName(e.target.value)}
                    placeholder="e.g., Arthrosurface Shoulder Arthroplasty System"
                    className="border-[#e8e6dc]"
                  />
                  {validationErrors.deviceName && (
                    <p className="text-xs text-[#1c1917] mt-1 flex items-center">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {validationErrors.deviceName}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="comp-device-type" className="text-[#141413]">
                    Device Type <span className="text-[#1c1917]">*</span>
                  </Label>
                  <Select value={deviceType} onValueChange={setDeviceType}>
                    <SelectTrigger id="comp-device-type" className="border-[#e8e6dc]">
                      <SelectValue placeholder="Select device type" />
                    </SelectTrigger>
                    <SelectContent>
                      {deviceTypes.map(type => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {validationErrors.deviceType && (
                    <p className="text-xs text-[#1c1917] mt-1 flex items-center">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {validationErrors.deviceType}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="comp-indication" className="text-[#141413]">
                    Intended Use/Indication
                  </Label>
                  <Textarea
                    id="comp-indication"
                    value={indication}
                    onChange={e => setIndication(e.target.value)}
                    placeholder="e.g., Treatment of shoulder joint pathologies like osteoarthritis or rotator cuff deficiency"
                    className="border-[#e8e6dc] min-h-[80px]"
                  />
                </div>

                {/* Competitor Devices */}
                <div className="space-y-2">
                  <Label className="text-[#141413]">Competitor Devices</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newCompetitorDevice}
                      onChange={e => setNewCompetitorDevice(e.target.value)}
                      placeholder="e.g., Zimmer Biomet Comprehensive Shoulder"
                      className="border-[#e8e6dc] flex-1"
                    />
                    <Button
                      type="button"
                      onClick={() =>
                        addItemToArray(
                          setCompetitorDevices,
                          newCompetitorDevice,
                          competitorDevices,
                          setNewCompetitorDevice
                        )
                      }
                      variant="outline"
                      className="border-[#292524] text-[#292524]"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {competitorDevices.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {competitorDevices.map((device, index) => (
                        <Badge
                          key={index}
                          variant="outline"
                          className="bg-[#F5F5F5] border-[#e8e6dc] text-[#141413] flex items-center gap-1 px-2 py-1"
                        >
                          {device}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 ml-1 text-[#616161] hover:bg-transparent hover:text-[#1c1917]"
                            onClick={() =>
                              removeItemFromArray(setCompetitorDevices, competitorDevices, index)
                            }
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Manufacturers */}
                <div className="space-y-2">
                  <Label className="text-[#141413]">Manufacturers in the Space</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newManufacturer}
                      onChange={e => setNewManufacturer(e.target.value)}
                      placeholder="e.g., Stryker"
                      className="border-[#e8e6dc] flex-1"
                    />
                    <Button
                      type="button"
                      onClick={() =>
                        addItemToArray(
                          setManufacturers,
                          newManufacturer,
                          manufacturers,
                          setNewManufacturer
                        )
                      }
                      variant="outline"
                      className="border-[#292524] text-[#292524]"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {manufacturers.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {manufacturers.map((manufacturer, index) => (
                        <Badge
                          key={index}
                          variant="outline"
                          className="bg-[#F5F5F5] border-[#e8e6dc] text-[#141413] flex items-center gap-1 px-2 py-1"
                        >
                          {manufacturer}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 ml-1 text-[#616161] hover:bg-transparent hover:text-[#1c1917]"
                            onClick={() =>
                              removeItemFromArray(setManufacturers, manufacturers, index)
                            }
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Common Outcome Metrics */}
                <div className="space-y-2">
                  <Label className="text-[#141413]">Common Outcome Metrics</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="safety-profile"
                        checked={commonMetrics.safetyProfile}
                        onCheckedChange={checked =>
                          setCommonMetrics({ ...commonMetrics, safetyProfile: checked })
                        }
                      />
                      <label
                        htmlFor="safety-profile"
                        className="text-sm font-medium leading-none text-[#141413] cursor-pointer"
                      >
                        Safety Profile
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="efficacy"
                        checked={commonMetrics.efficacy}
                        onCheckedChange={checked =>
                          setCommonMetrics({ ...commonMetrics, efficacy: checked })
                        }
                      />
                      <label
                        htmlFor="efficacy"
                        className="text-sm font-medium leading-none text-[#141413] cursor-pointer"
                      >
                        Efficacy
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="patient-satisfaction"
                        checked={commonMetrics.patientSatisfaction}
                        onCheckedChange={checked =>
                          setCommonMetrics({ ...commonMetrics, patientSatisfaction: checked })
                        }
                      />
                      <label
                        htmlFor="patient-satisfaction"
                        className="text-sm font-medium leading-none text-[#141413] cursor-pointer"
                      >
                        Patient Satisfaction
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="survival-rate"
                        checked={commonMetrics.survivalRate}
                        onCheckedChange={checked =>
                          setCommonMetrics({ ...commonMetrics, survivalRate: checked })
                        }
                      />
                      <label
                        htmlFor="survival-rate"
                        className="text-sm font-medium leading-none text-[#141413] cursor-pointer"
                      >
                        Survival Rate
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="complication-rate"
                        checked={commonMetrics.complicationRate}
                        onCheckedChange={checked =>
                          setCommonMetrics({ ...commonMetrics, complicationRate: checked })
                        }
                      />
                      <label
                        htmlFor="complication-rate"
                        className="text-sm font-medium leading-none text-[#141413] cursor-pointer"
                      >
                        Complication Rate
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="functional-outcomes"
                        checked={commonMetrics.functionalOutcomes}
                        onCheckedChange={checked =>
                          setCommonMetrics({ ...commonMetrics, functionalOutcomes: checked })
                        }
                      />
                      <label
                        htmlFor="functional-outcomes"
                        className="text-sm font-medium leading-none text-[#141413] cursor-pointer"
                      >
                        Functional Outcomes
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="rehabilitation-time"
                        checked={commonMetrics.rehabilitationTime}
                        onCheckedChange={checked =>
                          setCommonMetrics({ ...commonMetrics, rehabilitationTime: checked })
                        }
                      />
                      <label
                        htmlFor="rehabilitation-time"
                        className="text-sm font-medium leading-none text-[#141413] cursor-pointer"
                      >
                        Rehabilitation Time
                      </label>
                    </div>
                  </div>
                </div>

                {/* Custom Outcome Metrics */}
                <div className="space-y-2">
                  <Label className="text-[#141413]">Custom Outcome Metrics</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newOutcomeMetric}
                      onChange={e => setNewOutcomeMetric(e.target.value)}
                      placeholder="e.g., Range of Motion"
                      className="border-[#e8e6dc] flex-1"
                    />
                    <Button
                      type="button"
                      onClick={() =>
                        addItemToArray(
                          setOutcomeMetrics,
                          newOutcomeMetric,
                          outcomeMetrics,
                          setNewOutcomeMetric
                        )
                      }
                      variant="outline"
                      className="border-[#292524] text-[#292524]"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {outcomeMetrics.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {outcomeMetrics.map((metric, index) => (
                        <Badge
                          key={index}
                          variant="outline"
                          className="bg-[#F5F5F5] border-[#e8e6dc] text-[#141413] flex items-center gap-1 px-2 py-1"
                        >
                          {metric}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 ml-1 text-[#616161] hover:bg-transparent hover:text-[#1c1917]"
                            onClick={() =>
                              removeItemFromArray(setOutcomeMetrics, outcomeMetrics, index)
                            }
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleGenerateComparativeSOTA}
                  disabled={isGenerating}
                  className="w-full bg-[#292524] hover:bg-[#1c1917] text-white"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <GitCompare className="h-4 w-4 mr-2" />
                      Generate Comparative Analysis
                    </>
                  )}
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Information panel about SOTA */}
        <Card className="shadow-sm border-[#e8e6dc] mt-4">
          <CardHeader className="bg-[#F5F5F5] pb-3 pt-3">
            <CardTitle className="text-[#141413] text-lg">Analysis Guidance</CardTitle>
          </CardHeader>

          <CardContent className="pt-4">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="regulatory" className="border-[#e8e6dc]">
                <AccordionTrigger className="text-[#141413] hover:text-[#292524] hover:no-underline">
                  <span className="text-sm font-medium">Regulatory Requirements</span>
                </AccordionTrigger>
                <AccordionContent className="text-[#616161] text-sm">
                  <p>
                    Per MEDDEV 2.7/1 Rev 4, a "State of the Art" section is required in Clinical
                    Evaluation Reports to establish the current knowledge and technical capabilities
                    for similar devices and treatment alternatives.
                  </p>
                  <p className="mt-2">
                    This section must include current knowledge, available standards, and
                    alternative treatments to establish a performance baseline.
                  </p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="content" className="border-[#e8e6dc]">
                <AccordionTrigger className="text-[#141413] hover:text-[#292524] hover:no-underline">
                  <span className="text-sm font-medium">Content Requirements</span>
                </AccordionTrigger>
                <AccordionContent className="text-[#616161] text-sm">
                  <ul className="list-disc ml-5 space-y-1">
                    <li>Description of medical conditions being addressed</li>
                    <li>Current standard treatments and alternative technologies</li>
                    <li>Relevant published standards and guidance documents</li>
                    <li>Safety & performance benchmarks for similar devices</li>
                    <li>Expected benefits and clinical outcomes</li>
                    <li>Known risks and complications within the device category</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="comparative" className="border-[#e8e6dc]">
                <AccordionTrigger className="text-[#141413] hover:text-[#292524] hover:no-underline">
                  <span className="text-sm font-medium">Comparative Analysis</span>
                </AccordionTrigger>
                <AccordionContent className="text-[#616161] text-sm">
                  <p>
                    The comparative analysis provides an enhanced SOTA section that directly
                    compares your device against standard of care treatments and competitor devices
                    based on key performance and safety metrics.
                  </p>
                  <p className="mt-2">
                    According to BSI Group, this comparative assessment is essential for EU/UK
                    regulatory benefit-risk discussions and provides critical context for clinical
                    evaluation.
                  </p>
                  <p className="mt-2">Key requirements include:</p>
                  <ul className="list-disc ml-5 space-y-1 mt-1">
                    <li>Objective comparison of safety profiles</li>
                    <li>Comparative analysis of performance metrics</li>
                    <li>Identification of clinically significant differences</li>
                    <li>Referenced evidence for all comparative claims</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="data" className="border-[#e8e6dc]">
                <AccordionTrigger className="text-[#141413] hover:text-[#292524] hover:no-underline">
                  <span className="text-sm font-medium">Data Sources</span>
                </AccordionTrigger>
                <AccordionContent className="text-[#616161] text-sm">
                  <p>The analysis generator connects to authentic sources including:</p>
                  <ul className="list-disc ml-5 space-y-1 mt-2">
                    <li>Scientific literature databases (PubMed, Embase)</li>
                    <li>Clinical practice guidelines</li>
                    <li>Regulatory standards databases (ISO, ASTM)</li>
                    <li>Medical technology position papers</li>
                    <li>Professional society consensus statements</li>
                    <li>Post-market surveillance databases</li>
                    <li>Clinical trial registries</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>

      {/* Results panel */}
      <div className="lg:col-span-3">
        <Card className="shadow-sm border-[#e8e6dc] h-full">
          <CardHeader className="bg-[#F5F5F5] pb-3 pt-3 flex-row justify-between items-center">
            <div>
              <CardTitle className="text-[#141413] text-lg flex items-center">
                <FileText className="h-5 w-5 mr-2 text-[#292524]" />
                {activeTab === 'comparative'
                  ? 'Comparative SOTA Analysis'
                  : 'Standard SOTA Analysis'}
              </CardTitle>
              <CardDescription className="text-[#616161]">
                This content will be included in your CER
              </CardDescription>
            </div>

            {sotaContent && (
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  className="h-8 px-2 text-[#292524] border-[#292524] bg-white"
                  onClick={() => {
                    const blob = new Blob([sotaContent], { type: 'text/plain' });
                    const fileType =
                      activeTab === 'comparative' ? 'comparative_sota' : 'sota_analysis';
                    cerApiService.downloadBlob(
                      blob,
                      `${fileType}_${deviceName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.md`
                    );
                  }}
                >
                  <Download className="h-4 w-4 mr-1" />
                  <span className="text-xs">Export</span>
                </Button>
              </div>
            )}
          </CardHeader>

          <CardContent className="pt-4 h-[calc(100%-64px)] overflow-auto">
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center h-full space-y-4 text-[#616161]">
                <RefreshCw className="h-8 w-8 animate-spin text-[#292524]" />
                <p>
                  Generating {activeTab === 'comparative' ? 'Comparative' : 'State of the Art'}{' '}
                  analysis...
                </p>
                <p className="text-sm text-center max-w-md">
                  Connecting to authentic scientific literature and regulatory databases to compile
                  a comprehensive analysis.
                </p>
              </div>
            ) : sotaContent ? (
              <div className="prose max-w-none">
                <div
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(
                      sotaContent
                        .replace(/# /g, '<h1>')
                        .replace(/\n## /g, '</h1><h2>')
                        .replace(/\n### /g, '</h2><h3>')
                        .replace(/\n#### /g, '</h3><h4>')
                        .replace(
                          /<h(\d)>([^<]+)/g,
                          '<h$1 class="text-[#141413] font-semibold mb-3 mt-5">$2'
                        )
                        .replace(/\n/g, '<br/>')
                        .replace(/- ([^\n]+)/g, '<li>$1</li>')
                    ),
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full space-y-2 text-[#616161]">
                {activeTab === 'comparative' ? (
                  <>
                    <GitCompare className="h-16 w-16 text-[#e8e6dc]" />
                    <p className="text-lg">No comparative analysis generated yet</p>
                    <p className="text-sm text-center max-w-md">
                      Enter your device information and competitor details to generate a comparative
                      analysis against standard of care and competitor devices.
                    </p>
                    <div className="bg-[#F0F8FF] text-[#292524] border border-[#292524] p-3 rounded-md mt-4 text-sm">
                      <p className="flex items-center">
                        <CheckCircle className="h-4 w-4 mr-2 text-[#292524]" />
                        <span>
                          Comparative analysis is essential for EU/UK regulatory benefit-risk
                          discussions (BSI Group guidelines).
                        </span>
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <BookMarked className="h-16 w-16 text-[#e8e6dc]" />
                    <p className="text-lg">No SOTA analysis generated yet</p>
                    <p className="text-sm text-center max-w-md">
                      Enter your device information and generate a State of the Art analysis to
                      include in your Clinical Evaluation Report.
                    </p>
                    <div className="bg-[#F0F8FF] text-[#292524] border border-[#292524] p-3 rounded-md mt-4 text-sm">
                      <p className="flex items-center">
                        <CheckCircle className="h-4 w-4 mr-2 text-[#292524]" />
                        <span>
                          The SOTA section is required for regulatory compliance with MEDDEV 2.7/1
                          Rev 4 (Section 8).
                        </span>
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
