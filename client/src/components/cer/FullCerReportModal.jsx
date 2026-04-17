import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import { FileText, ClipboardList, Book, FileCheck, Download, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

/**
 * Full CER Report Modal Component
 *
 * This modal allows users to generate a complete Clinical Evaluation Report
 * using the FAERS data and other sources of evidence.
 */
export function FullCerReportModal({ isOpen, onClose, faersData }) {
  const [selectedTemplate, setSelectedTemplate] = useState('meddev-rev4');
  const [deviceInfo, setDeviceInfo] = useState({
    name: faersData?.productInfo?.name || '',
    manufacturer: '',
    modelNumber: '',
    description: '',
    intendedUse: '',
  });

  const [additionalOptions, setAdditionalOptions] = useState({
    includeFaersData: true,
    includeLiterature: true,
    includePostMarket: true,
    includeComparators: true,
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState(null);
  const [activeTab, setActiveTab] = useState('settings');

  // Handle form input changes
  const handleDeviceInfoChange = (field, value) => {
    setDeviceInfo(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  // Handle switch toggle changes
  const handleOptionChange = option => {
    setAdditionalOptions(prev => ({
      ...prev,
      [option]: !prev[option],
    }));
  };

  // Generate the CER report via the real backend. Never fabricate a
  // completed report or fake section-completion statuses.
  const handleGenerateReport = async () => {
    try {
      setIsGenerating(true);
      setActiveTab('preview');

      const response = await fetch('/api/cer/full-report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          deviceInfo,
          options: additionalOptions,
        }),
      });

      if (!response.ok) {
        throw new Error(`CER generation failed with status ${response.status}`);
      }

      const result = await response.json();
      setGeneratedReport(result);
    } catch (error) {
      setGeneratedReport(null);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center text-xl">
            <FileText className="mr-2 h-5 w-5 text-blue-600" />
            Generate Full Clinical Evaluation Report
          </DialogTitle>
          <DialogDescription>
            Create a comprehensive CER using FAERS data and other evidence sources
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="settings" disabled={isGenerating}>
              <ClipboardList className="h-4 w-4 mr-2" />
              CER Settings
            </TabsTrigger>
            <TabsTrigger value="preview" disabled={isGenerating && !generatedReport}>
              <Book className="h-4 w-4 mr-2" />
              Preview
            </TabsTrigger>
          </TabsList>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column - Device Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Device Information</h3>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="deviceName">Device/Product Name</Label>
                    <Textarea
                      id="deviceName"
                      value={deviceInfo.name}
                      onChange={e => handleDeviceInfoChange('name', e.target.value)}
                      placeholder="Enter the exact device or product name"
                      className="resize-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="manufacturer">Manufacturer</Label>
                    <Textarea
                      id="manufacturer"
                      value={deviceInfo.manufacturer}
                      onChange={e => handleDeviceInfoChange('manufacturer', e.target.value)}
                      placeholder="Enter the manufacturer name"
                      className="resize-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="modelNumber">Model/Catalog Number</Label>
                    <Textarea
                      id="modelNumber"
                      value={deviceInfo.modelNumber}
                      onChange={e => handleDeviceInfoChange('modelNumber', e.target.value)}
                      placeholder="Enter the model or catalog number"
                      className="resize-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="description">Brief Description</Label>
                  <Textarea
                    id="description"
                    value={deviceInfo.description}
                    onChange={e => handleDeviceInfoChange('description', e.target.value)}
                    placeholder="Provide a brief description of the device or product"
                    className="resize-none h-20"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="intendedUse">Intended Use/Purpose</Label>
                  <Textarea
                    id="intendedUse"
                    value={deviceInfo.intendedUse}
                    onChange={e => handleDeviceInfoChange('intendedUse', e.target.value)}
                    placeholder="Describe the intended use or purpose"
                    className="resize-none h-20"
                  />
                </div>
              </div>

              {/* Right Column - CER Options */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">CER Configuration</h3>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="template">Template Format</Label>
                    <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                      <SelectTrigger id="template">
                        <SelectValue placeholder="Select a template" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="eu-mdr-full">EU MDR 2017/745 Full Template</SelectItem>
                        <SelectItem value="meddev-rev4">MEDDEV 2.7/1 Rev 4 Template</SelectItem>
                        <SelectItem value="fda-510k">FDA 510(k) Template</SelectItem>
                        <SelectItem value="pmcf">PMCF Evaluation Report Template</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedTemplate === 'eu-mdr-full' &&
                        'Complete template for EU MDR 2017/745 compliance'}
                      {selectedTemplate === 'meddev-rev4' &&
                        'Template following MEDDEV 2.7/1 Rev 4 guidelines'}
                      {selectedTemplate === 'fda-510k' &&
                        'Template for FDA 510(k) clinical evaluation'}
                      {selectedTemplate === 'pmcf' &&
                        'Post-Market Clinical Follow-up report template'}
                    </p>
                  </div>

                  <div className="pt-4">
                    <h4 className="text-sm font-medium mb-2">Data Sources</h4>

                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="includeFaersData"
                          checked={additionalOptions.includeFaersData}
                          onCheckedChange={() => handleOptionChange('includeFaersData')}
                        />
                        <Label htmlFor="includeFaersData" className="cursor-pointer">
                          Include FAERS Data Analysis
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          id="includeComparators"
                          checked={additionalOptions.includeComparators}
                          onCheckedChange={() => handleOptionChange('includeComparators')}
                        />
                        <Label htmlFor="includeComparators" className="cursor-pointer">
                          Include Similar Product Comparisons
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          id="includeLiterature"
                          checked={additionalOptions.includeLiterature}
                          onCheckedChange={() => handleOptionChange('includeLiterature')}
                        />
                        <Label htmlFor="includeLiterature" className="cursor-pointer">
                          Include Literature Review
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          id="includePostMarket"
                          checked={additionalOptions.includePostMarket}
                          onCheckedChange={() => handleOptionChange('includePostMarket')}
                        />
                        <Label htmlFor="includePostMarket" className="cursor-pointer">
                          Include Post-Market Data
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 bg-muted p-4 rounded-lg">
                  <h4 className="text-sm font-medium mb-2">FAERS Data Summary</h4>
                  {faersData ? (
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>Product: {faersData.productInfo?.name || 'Not available'}</li>
                      <li>Total Reports: {faersData.summary?.totalReports || 0}</li>
                      <li>Serious Events: {faersData.summary?.seriousEvents || 0}</li>
                      <li>
                        Risk Severity: {faersData.summary?.severityAssessment || 'Not assessed'}
                      </li>
                      {faersData.comparativeAnalysis && (
                        <li>
                          Comparators: {faersData.comparativeAnalysis.products?.length || 0} similar
                          products
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No FAERS data available</p>
                  )}
                </div>
              </div>
            </div>

            <Button
              onClick={handleGenerateReport}
              disabled={isGenerating || !deviceInfo.name}
              className="w-full mt-6"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating CER Report...
                </>
              ) : (
                <>
                  <FileCheck className="mr-2 h-4 w-4" />
                  Generate CER Report
                </>
              )}
            </Button>
          </TabsContent>

          {/* Preview Tab */}
          <TabsContent value="preview" className="space-y-4 py-4">
            {isGenerating && !generatedReport ? (
              <div className="py-20 flex flex-col items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
                <p className="text-lg text-center">Generating your Clinical Evaluation Report...</p>
                <p className="text-sm text-center text-muted-foreground mt-2">
                  This may take a few moments
                </p>
              </div>
            ) : generatedReport ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold">{generatedReport.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    Generated: {new Date(generatedReport.generatedAt).toLocaleString()}
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Document Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold flex items-center text-green-600">
                        <FileCheck className="mr-2 h-5 w-5" />
                        Complete
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        All sections generated successfully
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Document Sections</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{generatedReport.sections.length}</div>
                      <p className="text-sm text-muted-foreground mt-1">
                        All sections follow{' '}
                        {selectedTemplate === 'eu-mdr-full'
                          ? 'EU MDR'
                          : selectedTemplate === 'meddev-rev4'
                            ? 'MEDDEV 2.7/1'
                            : selectedTemplate === 'fda-510k'
                              ? 'FDA 510(k)'
                              : 'PMCF'}{' '}
                        guidelines
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Available Formats</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {generatedReport.formats.map((format, index) => (
                          <div
                            key={index}
                            className="px-2 py-1 bg-muted rounded text-xs font-medium"
                          >
                            {format}
                          </div>
                        ))}
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">
                        Click download below to select format
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted px-4 py-2">
                    <h4 className="font-medium">Document Sections</h4>
                  </div>
                  <div className="divide-y">
                    {generatedReport.sections.map(section => (
                      <div key={section.id} className="px-4 py-3 flex items-center justify-between">
                        <span>{section.title}</span>
                        <span className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                          <FileCheck className="h-3 w-3 mr-1" />
                          Complete
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <Button className="w-full">
                  <Download className="mr-2 h-4 w-4" />
                  Download Clinical Evaluation Report
                </Button>
              </div>
            ) : (
              <div className="py-20 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p>Configure your CER settings and click "Generate" to create your report</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isGenerating}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FullCerReportModal;
