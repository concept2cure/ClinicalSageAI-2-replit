import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// UI Components
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

// Icons
import {
  FileText,
  FileSearch,
  CheckCircle,
  AlertCircle,
  ListFilter,
  ChevronRight,
  Layout,
  FileJson,
  Globe,
  Sparkles,
  Beaker,
  Package,
  Shield,
  Table,
} from 'lucide-react';

/**
 * Smart Template Selector Component
 *
 * This component handles:
 * 1. Selection of report type (CSR, CER, etc.)
 * 2. Renders dynamic section outline in sidebar
 * 3. Injects mapped variables (drug name, indication, endpoints)
 */
const SmartTemplateSelector = ({ onTemplateSelected, documentData }) => {
  const [selectedFramework, setSelectedFramework] = useState('mdr');
  const [selectedDocType, setSelectedDocType] = useState('cer');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [customizationOptions, setCustomizationOptions] = useState({
    includeDevicePerformance: true,
    includePostMarketData: true,
    includeRiskAnalysis: true,
    includeClinicalEvaluation: true,
    includeExecutiveSummary: true,
  });
  const { toast } = useToast();

  // Fetch available templates
  const {
    data: templates,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['/api/cer/templates', selectedFramework, selectedDocType],
    queryFn: async () => {
      const response = await apiRequest(
        'GET',
        `/api/cer/templates?framework=${selectedFramework}&docType=${selectedDocType}`
      );
      return response.json();
    },
  });

  // Framework options
  const frameworks = [
    {
      id: 'mdr',
      name: 'EU MDR',
      description: 'European Medical Device Regulation (MDR 2017/745)',
    },
    {
      id: 'fda',
      name: 'FDA 510(k)',
      description: 'US FDA 510(k) submission format',
    },
    {
      id: 'health_canada',
      name: 'Health Canada',
      description: 'Health Canada Medical Device License submissions',
    },
    {
      id: 'ich',
      name: 'ICH',
      description: 'International Council for Harmonisation guidelines',
    },
  ];

  // Document type options
  const documentTypes = [
    {
      id: 'cer',
      name: 'Clinical Evaluation Report',
      description: 'Comprehensive evaluation of clinical data for medical devices',
      icon: <FileText className="h-5 w-5" />,
    },
    {
      id: 'csr',
      name: 'Clinical Study Report',
      description: 'Complete report of a clinical trial according to ICH E3',
      icon: <FileSearch className="h-5 w-5" />,
    },
    {
      id: 'psur',
      name: 'Periodic Safety Update Report',
      description: 'Regular safety updates for regulatory authorities',
      icon: <Shield className="h-5 w-5" />,
    },
    {
      id: 'ib',
      name: "Investigator's Brochure",
      description: 'Information for investigators conducting clinical trials',
      icon: <Beaker className="h-5 w-5" />,
    },
  ];

  const handleFrameworkChange = value => {
    setSelectedFramework(value);
    setSelectedTemplate(null);
  };

  const handleDocTypeChange = value => {
    setSelectedDocType(value);
    setSelectedTemplate(null);
  };

  const handleTemplateSelect = template => {
    setSelectedTemplate(template);
  };

  const handleCustomizationChange = (option, checked) => {
    setCustomizationOptions(prev => ({
      ...prev,
      [option]: checked,
    }));
  };

  const handleContinue = () => {
    if (!selectedTemplate) {
      toast({
        title: 'Please select a template',
        description: 'You need to select a template to continue',
        variant: 'destructive',
      });
      return;
    }

    onTemplateSelected({
      template: selectedTemplate,
      framework: selectedFramework,
      documentType: selectedDocType,
      customizationOptions,
      mappedVariables: extractMappedVariables(documentData),
    });
  };

  // Extract key variables from document data for mapping
  const extractMappedVariables = data => {
    if (!data) return {};

    // In a real implementation, this would intelligently extract key variables
    // from the processed document data
    const mappedVars = {
      productName: findProductName(data),
      indication: findIndication(data),
      manufacturerName: findManufacturerName(data),
      clinicalEndpoints: findClinicalEndpoints(data),
      studyIdentifier: findStudyIdentifier(data),
    };

    return mappedVars;
  };

  // Helper functions to extract data from documents
  // These would be more sophisticated in a real implementation
  const findProductName = data => {
    // Example implementation
    for (const fileId in data) {
      const content = data[fileId];
      if (content.productInfo?.name) return content.productInfo.name;
      if (content.deviceName) return content.deviceName;
      // Look in sections that might contain product name
      if (content.sections) {
        for (const section of content.sections) {
          if (
            section.title?.toLowerCase().includes('product') ||
            section.title?.toLowerCase().includes('device')
          ) {
            // Simple regex to find potential product names (capitalized terms)
            const matches = section.content?.match(/[A-Z][a-z]+([\s-][A-Z][a-z]+)*/g);
            if (matches && matches.length) return matches[0];
          }
        }
      }
    }
    return 'Product Name';
  };

  const findIndication = data => {
    // Example implementation
    for (const fileId in data) {
      const content = data[fileId];
      if (content.indication) return content.indication;
      if (content.sections) {
        for (const section of content.sections) {
          if (
            section.title?.toLowerCase().includes('indication') ||
            section.title?.toLowerCase().includes('intended use')
          ) {
            return section.content?.substring(0, 100) || 'Indication';
          }
        }
      }
    }
    return 'Intended Use/Indication';
  };

  const findManufacturerName = data => {
    // Example implementation
    for (const fileId in data) {
      const content = data[fileId];
      if (content.manufacturerInfo?.name) return content.manufacturerInfo.name;
      if (content.manufacturer) return content.manufacturer;
    }
    return 'Manufacturer Name';
  };

  const findClinicalEndpoints = data => {
    // Example implementation - would use more sophisticated NLP in real implementation
    for (const fileId in data) {
      const content = data[fileId];
      if (content.endpoints) return content.endpoints;
      if (content.sections) {
        for (const section of content.sections) {
          if (
            section.title?.toLowerCase().includes('endpoint') ||
            section.title?.toLowerCase().includes('outcome')
          ) {
            // Return a placeholder array of endpoints
            return ['Primary Endpoint', 'Secondary Endpoint'];
          }
        }
      }
    }
    return ['Primary Endpoint'];
  };

  const findStudyIdentifier = data => {
    // Example implementation
    for (const fileId in data) {
      const content = data[fileId];
      if (content.studyId) return content.studyId;
      if (content.sections) {
        // Look for patterns like "Study XYZ-123" in the text
        for (const section of content.sections) {
          const matches = section.content?.match(/[Ss]tudy\s+([A-Z0-9]+-[A-Z0-9]+)/);
          if (matches && matches.length > 1) return matches[1];
        }
      }
    }
    return 'Study-001';
  };

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold flex items-center mb-4">
        <Layout className="mr-2 h-5 w-5 text-blue-600" />
        Smart Template Selector
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel: Framework & Document Type */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Select Framework & Type</CardTitle>
              <CardDescription>Choose the regulatory framework and document type</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="mb-3 block">Regulatory Framework</Label>
                <RadioGroup
                  value={selectedFramework}
                  onValueChange={handleFrameworkChange}
                  className="space-y-2"
                >
                  {frameworks.map(framework => (
                    <div key={framework.id} className="flex items-start space-x-2">
                      <RadioGroupItem id={`framework-${framework.id}`} value={framework.id} />
                      <div>
                        <Label
                          htmlFor={`framework-${framework.id}`}
                          className="font-medium flex items-center"
                        >
                          <Globe className="h-4 w-4 mr-2 text-blue-600" />
                          {framework.name}
                        </Label>
                        <p className="text-sm text-gray-500 mt-0.5">{framework.description}</p>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <Separator />

              <div>
                <Label className="mb-3 block">Document Type</Label>
                <RadioGroup
                  value={selectedDocType}
                  onValueChange={handleDocTypeChange}
                  className="space-y-3"
                >
                  {documentTypes.map(docType => (
                    <div key={docType.id} className="flex items-start space-x-2">
                      <RadioGroupItem id={`doctype-${docType.id}`} value={docType.id} />
                      <div>
                        <Label
                          htmlFor={`doctype-${docType.id}`}
                          className="font-medium flex items-center"
                        >
                          {React.cloneElement(docType.icon, {
                            className: 'h-4 w-4 mr-2 text-blue-600',
                          })}
                          {docType.name}
                        </Label>
                        <p className="text-sm text-gray-500 mt-0.5">{docType.description}</p>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Middle Panel: Template Selection */}
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">Select Template</CardTitle>
              <CardDescription>Choose a template that fits your needs</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-64">
                  <svg
                    className="animate-spin h-8 w-8 text-blue-600 mb-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <p className="text-gray-500">Loading available templates...</p>
                </div>
              ) : error ? (
                <Alert variant="destructive" className="my-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Failed to load templates. Please try again.</AlertDescription>
                </Alert>
              ) : (
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-3">
                    {templates?.map(template => (
                      <div
                        key={template.id}
                        className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                          selectedTemplate?.id === template.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'hover:border-blue-200 hover:bg-blue-50/50'
                        }`}
                        onClick={() => handleTemplateSelect(template)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3">
                            <div
                              className={`rounded-md p-2 ${
                                selectedTemplate?.id === template.id
                                  ? 'bg-blue-100 text-blue-600'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {template.type === 'cer' && <FileText className="h-5 w-5" />}
                              {template.type === 'csr' && <FileSearch className="h-5 w-5" />}
                              {template.type === 'psur' && <Shield className="h-5 w-5" />}
                              {template.type === 'ib' && <Beaker className="h-5 w-5" />}
                            </div>
                            <div>
                              <h4 className="font-medium">{template.name}</h4>
                              <p className="text-sm text-gray-500 mt-0.5">{template.description}</p>

                              <div className="flex mt-2 space-x-2">
                                <Badge variant="outline" className="text-xs">
                                  {template.lastUpdated}
                                </Badge>
                                {template.isCompliant && (
                                  <Badge
                                    variant="outline"
                                    className="bg-green-50 text-green-700 border-green-200 text-xs"
                                  >
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Compliant
                                  </Badge>
                                )}
                                {template.useAI && (
                                  <Badge
                                    variant="outline"
                                    className="bg-purple-50 text-purple-700 border-purple-200 text-xs"
                                  >
                                    <Sparkles className="h-3 w-3 mr-1" />
                                    AI-Enhanced
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>

                          {selectedTemplate?.id === template.id && (
                            <CheckCircle className="h-5 w-5 text-blue-600" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Panel: Customization & Preview */}
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">Template Customization</CardTitle>
              <CardDescription>Customize the selected template for your needs</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedTemplate ? (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="font-medium">Optional Sections</h4>

                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="devicePerformance"
                          checked={customizationOptions.includeDevicePerformance}
                          onCheckedChange={checked =>
                            handleCustomizationChange('includeDevicePerformance', checked)
                          }
                        />
                        <Label htmlFor="devicePerformance">Device Performance Data</Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="postMarket"
                          checked={customizationOptions.includePostMarketData}
                          onCheckedChange={checked =>
                            handleCustomizationChange('includePostMarketData', checked)
                          }
                        />
                        <Label htmlFor="postMarket">Post-Market Surveillance</Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="riskAnalysis"
                          checked={customizationOptions.includeRiskAnalysis}
                          onCheckedChange={checked =>
                            handleCustomizationChange('includeRiskAnalysis', checked)
                          }
                        />
                        <Label htmlFor="riskAnalysis">Risk Analysis</Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="clinicalEval"
                          checked={customizationOptions.includeClinicalEvaluation}
                          onCheckedChange={checked =>
                            handleCustomizationChange('includeClinicalEvaluation', checked)
                          }
                        />
                        <Label htmlFor="clinicalEval">Clinical Evaluation</Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="execSummary"
                          checked={customizationOptions.includeExecutiveSummary}
                          onCheckedChange={checked =>
                            handleCustomizationChange('includeExecutiveSummary', checked)
                          }
                        />
                        <Label htmlFor="execSummary">Executive Summary</Label>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-medium mb-3">Document Structure Preview</h4>
                    <Accordion type="single" collapsible>
                      <AccordionItem value="item-1">
                        <AccordionTrigger className="text-sm">Executive Summary</AccordionTrigger>
                        <AccordionContent className="text-xs text-gray-600">
                          High-level overview of key findings, conclusions, and recommendations.
                        </AccordionContent>
                      </AccordionItem>
                      <AccordionItem value="item-2">
                        <AccordionTrigger className="text-sm">Device Description</AccordionTrigger>
                        <AccordionContent className="text-xs text-gray-600">
                          Comprehensive description of the device, its components, and technology.
                        </AccordionContent>
                      </AccordionItem>
                      <AccordionItem value="item-3">
                        <AccordionTrigger className="text-sm">Regulatory Context</AccordionTrigger>
                        <AccordionContent className="text-xs text-gray-600">
                          Applicable regulations, standards, and guidance documents.
                        </AccordionContent>
                      </AccordionItem>
                      <AccordionItem value="item-4">
                        <AccordionTrigger className="text-sm">
                          Clinical Data Analysis
                        </AccordionTrigger>
                        <AccordionContent className="text-xs text-gray-600">
                          Analysis of clinical investigations, clinical experience, and literature.
                        </AccordionContent>
                      </AccordionItem>
                      <AccordionItem value="item-5">
                        <AccordionTrigger className="text-sm">
                          Performance Evaluation
                        </AccordionTrigger>
                        <AccordionContent className="text-xs text-gray-600">
                          Performance data, bench testing, and any other relevant performance
                          metrics.
                        </AccordionContent>
                      </AccordionItem>
                      <AccordionItem value="item-6">
                        <AccordionTrigger className="text-sm">
                          Benefit-Risk Analysis
                        </AccordionTrigger>
                        <AccordionContent className="text-xs text-gray-600">
                          Comprehensive assessment of benefits and risks, including risk mitigation.
                        </AccordionContent>
                      </AccordionItem>
                      <AccordionItem value="item-7">
                        <AccordionTrigger className="text-sm">Conclusion</AccordionTrigger>
                        <AccordionContent className="text-xs text-gray-600">
                          Overall conclusions on clinical safety and performance.
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-medium mb-2">Mapped Variables</h4>
                    <div className="bg-blue-50 p-3 rounded-md border border-blue-100">
                      <ul className="text-sm space-y-1.5">
                        <li className="flex justify-between">
                          <span className="text-gray-600">Product Name:</span>
                          <span className="font-medium">
                            {extractMappedVariables(documentData)?.productName || 'Not found'}
                          </span>
                        </li>
                        <li className="flex justify-between">
                          <span className="text-gray-600">Manufacturer:</span>
                          <span className="font-medium">
                            {extractMappedVariables(documentData)?.manufacturerName || 'Not found'}
                          </span>
                        </li>
                        <li className="flex justify-between">
                          <span className="text-gray-600">Indication:</span>
                          <span className="font-medium">
                            {extractMappedVariables(documentData)?.indication || 'Not found'}
                          </span>
                        </li>
                        <li className="flex justify-between">
                          <span className="text-gray-600">Study ID:</span>
                          <span className="font-medium">
                            {extractMappedVariables(documentData)?.studyIdentifier || 'Not found'}
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <Button onClick={handleContinue} className="w-full">
                    Continue with Selected Template
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <FileJson className="h-12 w-12 text-gray-300 mb-3" />
                  <h3 className="text-gray-500 font-medium mb-1">No Template Selected</h3>
                  <p className="text-sm text-gray-400 max-w-md mx-auto">
                    Please select a template from the middle panel to view and customize its
                    structure.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SmartTemplateSelector;
