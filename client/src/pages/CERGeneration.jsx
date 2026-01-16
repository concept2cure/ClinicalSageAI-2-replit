import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, Database, BarChart2, PlusCircle, AlertTriangle, Loader2, Microscope, FileDown } from 'lucide-react'
import CERStreamingGenerator from '@/components/cer/CERStreamingGenerator';
import { FAERSIntegration } from '@/components/cer/FAERSIntegration';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

/**
 * CER Generation Page
 *
 * This page provides the full interface for creating Clinical Evaluation Reports
 * using OpenAI GPT-4o Turbo with evidence retrieval from pgvector.
 */
export function CERGeneration() {
  const [activeTab, setActiveTab] = useState('generator');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [reportId, setReportId] = useState(null);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 year ago
    endDate: new Date().toISOString().split('T')[0], // today
  });

  const { toast } = useToast();

  // Fetch available devices
  const { data: devices, isLoading: loadingDevices } = useQuery({
    queryKey: ['/api/cer/devices'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/cer/devices');
        return await response.json();
      } catch (error) {
        console.error('Error fetching devices:', error);
        return [];
      }
    },
  });

  // Fetch available templates
  const { data: templates, isLoading: loadingTemplates } = useQuery({
    queryKey: ['/api/cer/templates'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/cer/templates');
        return await response.json();
      } catch (error) {
        console.error('Error fetching templates:', error);
        return [];
      }
    },
  });

  // Handle report completion
  const handleReportComplete = async reportContent => {
    try {
      // Save the generated report
      const response = await apiRequest('POST', '/api/cer/generate', {
        device_id: selectedDevice,
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
        content: reportContent,
      });

      const data = await response.json();
      setReportId(data.report_id);

      toast({
        title: 'Report Saved',
        description: 'Your Clinical Evaluation Report has been saved successfully.',
      });

      // Switch to dashboard tab to view the completed report
      setActiveTab('dashboard');
    } catch (error) {
      console.error('Error saving report:', error);
      toast({
        title: 'Save Failed',
        description: 'Failed to save the report. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Handle downloading the report as PDF
  const handleDownloadPDF = async () => {
    if (!reportId) return;

    try {
      window.open(`/api/cer/reports/${reportId}/pdf`, '_blank');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({
        title: 'Download Failed',
        description: 'Failed to download the report as PDF. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Get the selected device details
  const selectedDeviceDetails = selectedDevice ? devices?.find(d => d.id === selectedDevice) : null;

  // Get the selected template details
  const selectedTemplateDetails = selectedTemplate
    ? templates?.find(t => t.id === selectedTemplate)
    : null;

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-3xl font-bold mb-6">Clinical Evaluation Report Generator</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4">
          <TabsList>
            <TabsTrigger value="generator">
              <FileText className="h-4 w-4 mr-2" />
              Generator
            </TabsTrigger>
            <TabsTrigger value="dashboard">
              <BarChart2 className="h-4 w-4 mr-2" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="data">
              <Database className="h-4 w-4 mr-2" />
              Data Integration
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap gap-2">
            <Select
              value={selectedDevice}
              onValueChange={setSelectedDevice}
              disabled={loadingDevices}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select a device" />
              </SelectTrigger>
              <SelectContent>
                {loadingDevices ? (
                  <SelectItem value="" disabled>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading devices...
                  </SelectItem>
                ) : (
                  devices?.map(device => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.name} ({device.device_class})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <Select
              value={selectedTemplate}
              onValueChange={setSelectedTemplate}
              disabled={loadingTemplates}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {loadingTemplates ? (
                  <SelectItem value="" disabled>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading templates...
                  </SelectItem>
                ) : (
                  templates?.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="generator" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <CERStreamingGenerator
                deviceId={selectedDevice}
                deviceName={selectedDeviceDetails?.name}
                templateId={selectedTemplate}
                reportId={reportId}
                onComplete={handleReportComplete}
              />
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Microscope className="h-5 w-5 mr-2 text-blue-600" />
                    Device Information
                  </CardTitle>
                  <CardDescription>
                    View and edit information about the selected device
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedDeviceDetails ? (
                    <>
                      <div>
                        <Label className="text-sm font-medium">Device Name</Label>
                        <p className="text-sm mt-1">{selectedDeviceDetails.name}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Device Code</Label>
                        <p className="text-sm mt-1">{selectedDeviceDetails.device_code}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Manufacturer</Label>
                        <p className="text-sm mt-1">{selectedDeviceDetails.manufacturer}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Device Class</Label>
                        <p className="text-sm mt-1">{selectedDeviceDetails.device_class}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Date Range</Label>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <div>
                            <Input
                              type="date"
                              value={dateRange.startDate}
                              onChange={e =>
                                setDateRange({ ...dateRange, startDate: e.target.value })
                              }
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <Input
                              type="date"
                              value={dateRange.endDate}
                              onChange={e =>
                                setDateRange({ ...dateRange, endDate: e.target.value })
                              }
                              className="text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="py-6 text-center text-gray-500">
                      <Microscope className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p>Select a device to view its details</p>
                    </div>
                  )}
                </CardContent>
                <CardFooter>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!selectedDeviceDetails}
                    className="w-full"
                  >
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Edit Device Info
                  </Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <FileText className="h-5 w-5 mr-2 text-blue-600" />
                    Template Structure
                  </CardTitle>
                  <CardDescription>Sections included in the selected template</CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedTemplateDetails ? (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-medium">Framework</Label>
                        <p className="text-sm mt-1">
                          {selectedTemplateDetails.framework.toUpperCase()}
                        </p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Description</Label>
                        <p className="text-sm mt-1">{selectedTemplateDetails.description}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Sections</Label>
                        <ul className="mt-2 space-y-1">
                          {[
                            'Executive Summary',
                            'Device Description',
                            'State of the Art',
                            'Risk Assessment',
                            'Clinical Evaluation',
                            'Post-Market Surveillance',
                            'Conclusion',
                          ].map((section, idx) => (
                            <li key={idx} className="text-sm flex items-center">
                              <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mr-2"></div>
                              {section}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 text-center text-gray-500">
                      <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p>Select a template to view its structure</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="dashboard">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Reports Dashboard</h2>
              <Button onClick={handleDownloadPDF} disabled={!reportId}>
                <FileDown className="h-4 w-4 mr-2" />
                Download Latest Report
              </Button>
            </div>

            {reportId ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>CER Insights</CardTitle>
                      <CardDescription>
                        AI-powered insights from your Clinical Evaluation Report
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <Card>
                            <CardHeader className="py-3">
                              <CardTitle className="text-sm">Total Adverse Events</CardTitle>
                            </CardHeader>
                            <CardContent className="py-3">
                              <div className="text-3xl font-bold">42</div>
                              <p className="text-xs text-gray-500">Last 12 months</p>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardHeader className="py-3">
                              <CardTitle className="text-sm">Serious Events</CardTitle>
                            </CardHeader>
                            <CardContent className="py-3">
                              <div className="text-3xl font-bold">7</div>
                              <p className="text-xs text-gray-500">16.7% of total</p>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardHeader className="py-3">
                              <CardTitle className="text-sm">Literature References</CardTitle>
                            </CardHeader>
                            <CardContent className="py-3">
                              <div className="text-3xl font-bold">15</div>
                              <p className="text-xs text-gray-500">From PubMed</p>
                            </CardContent>
                          </Card>
                        </div>

                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">Common Adverse Events</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="h-64 flex items-center justify-center">
                              <BarChart2 className="h-32 w-32 text-gray-300" />
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div>
                  <Card>
                    <CardHeader>
                      <CardTitle>Generated Reports</CardTitle>
                      <CardDescription>Recently generated CER reports</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <Card className="border-primary">
                          <CardHeader className="py-3">
                            <CardTitle className="text-sm flex items-center">
                              <FileText className="h-4 w-4 mr-2 text-primary" />
                              {selectedDeviceDetails?.name || 'Device'} CER
                            </CardTitle>
                            <CardDescription className="text-xs">
                              Generated {new Date().toLocaleDateString()}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="py-2 border-t text-xs">
                            <div className="flex justify-between">
                              <span>Framework:</span>
                              <span className="font-medium">
                                {selectedTemplateDetails?.framework.toUpperCase() || 'MDR'}
                              </span>
                            </div>
                            <div className="flex justify-between mt-1">
                              <span>Status:</span>
                              <span className="font-medium">Complete</span>
                            </div>
                          </CardContent>
                          <CardFooter className="py-2 border-t">
                            <Button variant="ghost" size="sm" className="w-full text-xs">
                              <FileDown className="h-3 w-3 mr-1" />
                              Download
                            </Button>
                          </CardFooter>
                        </Card>

                        {/* Placeholder for additional reports */}
                        <div className="text-center text-sm text-gray-500 py-4">
                          No additional reports available
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="border-t pt-3">
                      <Button variant="outline" size="sm" className="w-full">
                        <PlusCircle className="h-4 w-4 mr-2" />
                        Create New Report
                      </Button>
                    </CardFooter>
                  </Card>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="mx-auto h-24 w-24 text-gray-300 mb-4">
                  <FileText className="h-24 w-24" />
                </div>
                <h3 className="text-lg font-medium mb-2">No Reports Generated Yet</h3>
                <p className="text-gray-500 mb-6">
                  Use the Generator tab to create your first Clinical Evaluation Report
                </p>
                <Button onClick={() => setActiveTab('generator')}>
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Create New Report
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="data">
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Data Integration</h2>

            <FAERSIntegration
              productName={selectedDeviceDetails?.name}
              productId={selectedDevice}
              onDataSelected={data => {
                toast({
                  title: 'Data Selected',
                  description: `Selected ${data.data.length} events from FAERS`,
                });
              }}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default CERGeneration;
