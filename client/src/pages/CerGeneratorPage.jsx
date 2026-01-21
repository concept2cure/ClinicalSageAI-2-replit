import React, { useState, useEffect } from 'react';
import CerProgressDashboard from '../components/cer/CerProgressDashboard';
import { FaersReportDisplay } from '../components/cer/FaersReportDisplay';
import { FaersDemographicsCharts } from '../components/cer/FaersDemographicsCharts';
import { FaersReportExporter } from '../components/cer/FaersReportExporter';
import { FaersComparativeChart } from '../components/cer/FaersComparativeChart';
import { CerPreviewPanel } from '../components/cer/CerPreviewPanel';
import { AiSectionGenerator } from '../components/cer/AiSectionGenerator';
import { CerBuilderPanel } from '../components/cer/CerBuilderPanel';
import { useFetchFAERS } from '../hooks/useFetchFAERS';
import { useExportFAERS } from '../hooks/useExportFAERS';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import {
  FileUpload,
  Search,
  FileCheck,
  BookOpen,
  Brain,
  Shield,
  BarChart4,
  Settings,
  AlertCircle,
  Database,
  Sparkles,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { toast } from '../ui/use-toast';

const CerGeneratorPage = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [templateSelection, setTemplateSelection] = useState('eu-mdr-full');
  const [literatureCount, setLiteratureCount] = useState(42);
  const [aiEnhancementEnabled, setAiEnhancementEnabled] = useState(true);
  const [fdaDataEnabled, setFdaDataEnabled] = useState(true);
  const [isLiteratureSearching, setIsLiteratureSearching] = useState(false);
  const [isFdaDataSearching, setIsFdaDataSearching] = useState(false);

  // Template list
  const templates = [
    {
      id: 'eu-mdr-full',
      name: 'EU MDR 2017/745 Full Template',
      description: 'Complete template for EU MDR 2017/745 compliance',
      regulatoryFramework: 'EU MDR',
      sectionCount: 14,
    },
    {
      id: 'meddev-rev4',
      name: 'MEDDEV 2.7/1 Rev 4 Template',
      description: 'Template following MEDDEV 2.7/1 Rev 4 guidelines',
      regulatoryFramework: 'MEDDEV',
      sectionCount: 12,
    },
    {
      id: 'fda-510k',
      name: 'FDA 510(k) Template',
      description: 'Template for FDA 510(k) clinical evaluation',
      regulatoryFramework: 'FDA',
      sectionCount: 10,
    },
  ];

  // Simulate literature search
  const handleLiteratureSearch = () => {
    setIsLiteratureSearching(true);
    setTimeout(() => {
      setLiteratureCount(Math.floor(Math.random() * 30) + 30);
      setIsLiteratureSearching(false);
    }, 2500);
  };

  // FAERS integration states
  const [productName, setProductName] = useState('CardioMonitor Pro 3000');
  const [cerId, setCerId] = useState('cer-' + Math.random().toString(36).substring(2, 10));
  const [showFaersDialog, setShowFaersDialog] = useState(false);
  const [selectedFaersTab, setSelectedFaersTab] = useState('reports');

  // Use custom hooks for FAERS functionality
  const {
    fetchFAERS,
    isLoading: isFaersLoading,
    data: faersData,
    error: faersError,
  } = useFetchFAERS();
  const { exportToPDF, exportToWord, integrateWithCER, exporting, exportError } = useExportFAERS();

  // FDA/FAERS data search handler
  const handleFdaDataSearch = () => {
    setIsFdaDataSearching(true);

    // Get device name from input field
    const deviceNameInput = document.getElementById('deviceName');
    const currentDeviceName = deviceNameInput ? deviceNameInput.value : productName;
    setProductName(currentDeviceName);

    // Fetch FAERS data
    fetchFAERS({ productName: currentDeviceName, cerId });

    // Show the FAERS dialog after a short delay
    setTimeout(() => {
      setIsFdaDataSearching(false);
      setShowFaersDialog(true);
    }, 1200);
  };

  // Handle export completion
  const handleExportCompleted = result => {
    console.log('Export completed:', result);
    toast({
      title: 'Export Complete',
      description:
        result.message || `Export completed successfully as ${result.format.toUpperCase()}`,
      variant: result.success ? 'default' : 'destructive',
    });
  };

  // Handle AI section generation
  const handleSectionGenerated = sectionData => {
    console.log('Section generated:', sectionData);
    toast({
      title: 'Section Generated',
      description: `${sectionData.sectionType} section was generated successfully`,
    });
  };

  // FAERS modal content based on selected tab
  const renderFaersModalContent = () => {
    if (!faersData) {
      return (
        <div className="flex flex-col items-center justify-center p-12">
          <p className="text-gray-500 mb-4">
            No FAERS data available. Please search for a product first.
          </p>
        </div>
      );
    }

    // Render different content based on selected tab
    switch (selectedFaersTab) {
      case 'reports':
        return <FaersReportDisplay faersData={faersData} />;
      case 'charts':
        return <FaersDemographicsCharts faersData={faersData} />;
      case 'comparisons':
        return <FaersComparativeChart productName={productName} faersData={faersData} />;
      default:
        return <FaersReportDisplay faersData={faersData} />;
    }
  };

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold mb-1">Medical Device & Diagnostics Regulatory Module</h1>
            <p className="text-gray-600">
              AI-powered Clinical Evaluation Report generator with automated workflows
            </p>
          </div>
          <div>
            <Button
              variant="outline"
              onClick={() => (window.location.href = '/cerv2/info')}
              className="text-indigo-600 border-indigo-300 hover:bg-indigo-50"
            >
              <Brain className="h-4 w-4 mr-2" /> Learn More About Medical Device & Diagnostics
            </Button>
          </div>
        </div>

        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <Brain className="h-5 w-5 text-blue-600" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                Create a Regulatory Submission in 3 Simple Steps
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <ol className="list-decimal list-inside space-y-1">
                  <li>Choose a section type and provide context in the Regulatory Builder</li>
                  <li>Generate and add each needed section to your report</li>
                  <li>Export your completed report as PDF or DOCX format</li>
                </ol>
              </div>
              <div className="mt-3 flex space-x-3">
                <Button
                  onClick={() => {
                    setActiveTab('generator');
                    setTimeout(() => {
                      const element = document.getElementById('generate-cer-button');
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth' });
                      }
                    }, 100);
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Brain className="h-4 w-4 mr-2" /> Start Creating Now
                </Button>
                <Button
                  variant="outline"
                  onClick={() => (window.location.href = '/cerv2/info')}
                  className="border-blue-300 text-blue-700 hover:bg-blue-100"
                >
                  Learn More
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="dashboard" className="flex items-center">
            <BarChart4 className="h-4 w-4 mr-2" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="generator" className="flex items-center">
            <Brain className="h-4 w-4 mr-2" /> Regulatory Builder
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center">
            <Settings className="h-4 w-4 mr-2" /> Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <CerProgressDashboard />
        </TabsContent>

        <TabsContent value="generator" className="space-y-4">
          {/* New CerBuilderPanel Component - comprehensive UI for building CERs */}
          <CerBuilderPanel faersData={faersData} productName={productName} />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Module Settings</CardTitle>
              <CardDescription>
                Configure your preferences for the Medical Device & Diagnostics Regulatory Module
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-md font-semibold">Template Settings</h3>
                <div className="space-y-2">
                  <Label htmlFor="default-template">Default Template</Label>
                  <Select defaultValue="eu-mdr-full">
                    <SelectTrigger id="default-template">
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eu-mdr-full">EU MDR 2017/745 Full Template</SelectItem>
                      <SelectItem value="meddev-rev4">MEDDEV 2.7/1 Rev 4 Template</SelectItem>
                      <SelectItem value="fda-510k">FDA 510(k) Template</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="citation-style">Citation Style</Label>
                  <Select defaultValue="vancouver">
                    <SelectTrigger id="citation-style">
                      <SelectValue placeholder="Citation style" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vancouver">Vancouver</SelectItem>
                      <SelectItem value="harvard">Harvard</SelectItem>
                      <SelectItem value="apa">APA</SelectItem>
                      <SelectItem value="chicago">Chicago</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4 border-t pt-4">
                <h3 className="text-md font-semibold">AI Settings</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="ai-enhancement">AI Enhancement</Label>
                    <p className="text-sm text-muted-foreground">
                      Use AI to improve CER content quality
                    </p>
                  </div>
                  <Switch id="ai-enhancement" defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="auto-citations">Automatic Citations</Label>
                    <p className="text-sm text-muted-foreground">
                      AI will add relevant citations automatically
                    </p>
                  </div>
                  <Switch id="auto-citations" defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="regulatory-check">Regulatory Compliance Check</Label>
                    <p className="text-sm text-muted-foreground">
                      Verify content against regulatory requirements
                    </p>
                  </div>
                  <Switch id="regulatory-check" defaultChecked />
                </div>
              </div>

              <div className="space-y-4 border-t pt-4">
                <h3 className="text-md font-semibold">Document Settings</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="executive-summary">Include Executive Summary</Label>
                    <p className="text-sm text-muted-foreground">
                      Add an executive summary to your reports
                    </p>
                  </div>
                  <Switch id="executive-summary" defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="glossary">Include Glossary</Label>
                    <p className="text-sm text-muted-foreground">
                      Add a glossary of terms to your reports
                    </p>
                  </div>
                  <Switch id="glossary" defaultChecked />
                </div>
              </div>

              <div className="space-y-4 border-t pt-4">
                <h3 className="text-md font-semibold">Data Sources</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="pubmed-integration">PubMed Integration</Label>
                    <p className="text-sm text-muted-foreground">
                      Use PubMed as a literature source
                    </p>
                  </div>
                  <Switch id="pubmed-integration" defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="fda-integration">FDA MAUDE Integration</Label>
                    <p className="text-sm text-muted-foreground">Include FDA adverse event data</p>
                  </div>
                  <Switch id="fda-integration" defaultChecked />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline">Reset to Defaults</Button>
              <Button>Save Settings</Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>

      {/* FAERS Data Dialog */}
      <Dialog open={showFaersDialog} onOpenChange={setShowFaersDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>FAERS Adverse Event Data for {productName}</DialogTitle>
            <DialogDescription>
              FDA Adverse Event Reporting System data analysis and visualization
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            <Tabs value={selectedFaersTab} onValueChange={setSelectedFaersTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="reports">Reports</TabsTrigger>
                <TabsTrigger value="charts">Demographics</TabsTrigger>
                <TabsTrigger value="comparisons">Comparisons</TabsTrigger>
              </TabsList>

              <TabsContent value={selectedFaersTab}>
                {isFaersLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
                  </div>
                ) : faersError ? (
                  <div className="text-center py-12">
                    <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                    <p className="text-lg font-medium">Error retrieving FAERS data</p>
                    <p className="text-gray-500 mt-2">
                      {faersError.message || 'An unexpected error occurred'}
                    </p>
                  </div>
                ) : (
                  renderFaersModalContent()
                )}
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex justify-between items-center mt-4 pt-4 border-t">
            <div className="flex-1">
              <p className="text-sm text-gray-500">
                Data sourced from FDA Adverse Event Reporting System (FAERS)
              </p>
            </div>
            <div className="flex space-x-2">
              <FaersReportExporter
                productName={productName}
                data={faersData}
                onExport={handleExportCompleted}
              />
              <Button
                onClick={() => {
                  setShowFaersDialog(false);
                  integrateWithCER(faersData, productName);
                  toast({
                    title: 'FAERS Data Integrated',
                    description: 'Successfully integrated FDA adverse event data with your CER',
                  });
                }}
              >
                <Database className="h-4 w-4 mr-2" />
                Integrate with CER
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CerGeneratorPage;
