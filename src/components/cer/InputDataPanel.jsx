import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  FileType2,
  RefreshCw,
  Database,
} from 'lucide-react';
import FdaFaersDataPanel from './FdaFaersDataPanel';
import { FaersRiskBadge } from './FaersRiskBadge';

export default function InputDataPanel({ jobId }) {
  const [activeTab, setActiveTab] = useState('basic-info');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [formData, setFormData] = useState({
    deviceName: '',
    deviceType: '',
    manufacturer: '',
    modelNumber: '',
    regulationType: 'eu-mdr',
    classificationEU: 'class-iia',
    classificationUS: 'class-ii',
    clinicalData: '',
    clinicalHistory: '',
    deviceDescription: '',
    intendedUse: '',
    riskCategory: 'medium',
    riskScore: 65,
    primaryEndpoints: '',
    secondaryEndpoints: '',
  });

  // FAERS data state
  const [faersStatus, setFaersStatus] = useState({
    loaded: false,
    severity: null,
    score: null,
    reportCount: 0,
    resolvedName: null,
  });

  const handleInputChange = e => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSelectChange = (name, value) => {
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSliderChange = value => {
    setFormData({
      ...formData,
      riskScore: value[0],
    });
  };

  const handleFileChange = e => {
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      alert('Please select at least one file to upload');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    // Simulate upload progress
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 10;
      });
    }, 300);

    // Simulate file upload completion
    setTimeout(() => {
      clearInterval(interval);
      setUploadProgress(100);
      setUploading(false);

      // In a real app, we would send the files to a server
      console.log('Files to upload:', selectedFiles);
      console.log('Form data:', formData);

      // Clear the file input after "upload"
      setSelectedFiles([]);
      document.getElementById('file-upload').value = '';

      alert('Files uploaded successfully');
    }, 3000);
  };

  const saveFormData = () => {
    // In a real app, we would save the data to the server
    console.log('Saving form data:', formData);
    alert('Device information saved successfully');
  };

  /**
   * Handler for FAERS data updates from the FdaFaersDataPanel
   */
  const handleFaersDataUpdate = faersData => {
    if (!faersData) return;

    // Extract severity assessment from FAERS data if it exists
    if (faersData.analysis && faersData.analysis.summary) {
      const { severityAssessment, eventsPerTenThousand, totalReports } = faersData.analysis.summary;

      setFaersStatus({
        loaded: true,
        severity: severityAssessment,
        score: eventsPerTenThousand,
        reportCount: totalReports,
        resolvedName: faersData.resolvedInfo?.substanceName || formData.deviceName,
      });
    } else if (faersData.totalReports) {
      // Fallback to raw data if analysis is not available
      const seriousEventsCount = faersData.seriousEvents?.length || 0;
      const severityLevel =
        seriousEventsCount / faersData.totalReports > 0.2
          ? 'High'
          : seriousEventsCount / faersData.totalReports > 0.05
            ? 'Medium'
            : 'Low';

      setFaersStatus({
        loaded: true,
        severity: severityLevel,
        score: null,
        reportCount: faersData.totalReports,
        resolvedName: faersData.resolvedInfo?.substanceName || formData.deviceName,
      });
    }
  };

  const getRiskLevelText = score => {
    if (score < 40) return 'Low Risk';
    if (score < 70) return 'Medium Risk';
    return 'High Risk';
  };

  const getRiskLevelClass = score => {
    if (score < 40) return 'text-green-600';
    if (score < 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="basic-info">Basic Information</TabsTrigger>
          <TabsTrigger value="clinical-data">Clinical Data</TabsTrigger>
          <TabsTrigger value="fda-data">FDA FAERS Data</TabsTrigger>
          <TabsTrigger value="risk-assessment">Risk Assessment</TabsTrigger>
          <TabsTrigger value="documents">Supporting Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="basic-info" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4">Device Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="deviceName">Device Name*</Label>
                    <Input
                      id="deviceName"
                      name="deviceName"
                      value={formData.deviceName}
                      onChange={handleInputChange}
                      placeholder="Enter device name"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="deviceType">Device Type*</Label>
                    <Input
                      id="deviceType"
                      name="deviceType"
                      value={formData.deviceType}
                      onChange={handleInputChange}
                      placeholder="Enter device type"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="modelNumber">Model Number</Label>
                    <Input
                      id="modelNumber"
                      name="modelNumber"
                      value={formData.modelNumber}
                      onChange={handleInputChange}
                      placeholder="Enter model number"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="manufacturer">Manufacturer*</Label>
                    <Input
                      id="manufacturer"
                      name="manufacturer"
                      value={formData.manufacturer}
                      onChange={handleInputChange}
                      placeholder="Enter manufacturer name"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="regulationType">Regulatory Type*</Label>
                    <Select
                      value={formData.regulationType}
                      onValueChange={value => handleSelectChange('regulationType', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select regulatory type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="eu-mdr">EU MDR 2017/745</SelectItem>
                        <SelectItem value="fda-510k">FDA 510(k)</SelectItem>
                        <SelectItem value="fda-pma">FDA PMA</SelectItem>
                        <SelectItem value="ivdr">EU IVDR</SelectItem>
                        <SelectItem value="iso-14155">ISO 14155</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="classificationEU">EU Class*</Label>
                      <Select
                        value={formData.classificationEU}
                        onValueChange={value => handleSelectChange('classificationEU', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select EU class" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="class-i">Class I</SelectItem>
                          <SelectItem value="class-is">Class Is</SelectItem>
                          <SelectItem value="class-im">Class Im</SelectItem>
                          <SelectItem value="class-iia">Class IIa</SelectItem>
                          <SelectItem value="class-iib">Class IIb</SelectItem>
                          <SelectItem value="class-iii">Class III</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="classificationUS">US Class*</Label>
                      <Select
                        value={formData.classificationUS}
                        onValueChange={value => handleSelectChange('classificationUS', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select US class" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="class-i">Class I</SelectItem>
                          <SelectItem value="class-ii">Class II</SelectItem>
                          <SelectItem value="class-iii">Class III</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="deviceDescription">Device Description*</Label>
                  <Textarea
                    id="deviceDescription"
                    name="deviceDescription"
                    value={formData.deviceDescription}
                    onChange={handleInputChange}
                    placeholder="Provide a detailed description of the device..."
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="intendedUse">Intended Use / Indications*</Label>
                  <Textarea
                    id="intendedUse"
                    name="intendedUse"
                    value={formData.intendedUse}
                    onChange={handleInputChange}
                    placeholder="Describe the intended use and indications for use..."
                    rows={4}
                  />
                </div>
              </div>

              {/* FAERS Risk Status */}
              {faersStatus.loaded && (
                <div className="mt-6 p-4 border rounded-md bg-slate-50">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">FDA FAERS Risk Assessment</h4>
                    <FaersRiskBadge severity={faersStatus.severity} score={faersStatus.score} />
                  </div>
                  <div className="text-sm text-gray-600">
                    <p>
                      Based on {faersStatus.reportCount} adverse event reports for{' '}
                      {faersStatus.resolvedName || formData.deviceName}
                    </p>
                    <p className="mt-1 text-xs">
                      To view detailed analysis, visit the FDA FAERS Data tab
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-between">
                {!faersStatus.loaded && formData.deviceName && (
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab('fda-data')}
                    className="flex items-center"
                  >
                    <Database className="mr-2 h-4 w-4" />
                    Check FDA FAERS Data
                  </Button>
                )}
                <div className="ml-auto">
                  <Button onClick={saveFormData}>Save Information</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clinical-data" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4">Clinical Data</h3>
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="clinicalData">Clinical Performance Data*</Label>
                  <Textarea
                    id="clinicalData"
                    name="clinicalData"
                    value={formData.clinicalData}
                    onChange={handleInputChange}
                    placeholder="Provide details about clinical performance data..."
                    rows={5}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="clinicalHistory">Clinical History</Label>
                  <Textarea
                    id="clinicalHistory"
                    name="clinicalHistory"
                    value={formData.clinicalHistory}
                    onChange={handleInputChange}
                    placeholder="Provide historical clinical data if applicable..."
                    rows={5}
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="primaryEndpoints">Primary Endpoints</Label>
                  <Textarea
                    id="primaryEndpoints"
                    name="primaryEndpoints"
                    value={formData.primaryEndpoints}
                    onChange={handleInputChange}
                    placeholder="List primary endpoints from clinical studies..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="secondaryEndpoints">Secondary Endpoints</Label>
                  <Textarea
                    id="secondaryEndpoints"
                    name="secondaryEndpoints"
                    value={formData.secondaryEndpoints}
                    onChange={handleInputChange}
                    placeholder="List secondary endpoints from clinical studies..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <Button onClick={saveFormData}>Save Clinical Data</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fda-data" className="space-y-4">
          <FdaFaersDataPanel onDataFetched={handleFaersDataUpdate} />
        </TabsContent>

        <TabsContent value="risk-assessment" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4">Risk Assessment</h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="riskCategory">Risk Category</Label>
                  <Select
                    value={formData.riskCategory}
                    onValueChange={value => handleSelectChange('riskCategory', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select risk category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low Risk</SelectItem>
                      <SelectItem value="medium">Medium Risk</SelectItem>
                      <SelectItem value="high">High Risk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label htmlFor="riskScore">Risk Score: {formData.riskScore}</Label>
                    <span className={getRiskLevelClass(formData.riskScore)}>
                      {getRiskLevelText(formData.riskScore)}
                    </span>
                  </div>
                  <Slider
                    id="riskScore"
                    value={[formData.riskScore]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={handleSliderChange}
                    className="my-4"
                  />
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Low (0)</span>
                    <span>Medium (50)</span>
                    <span>High (100)</span>
                  </div>
                </div>

                <div className="p-4 border rounded-md bg-yellow-50">
                  <h4 className="font-semibold mb-2">Risk Assessment Generated Content</h4>
                  <p className="text-sm text-gray-700">
                    Based on the information provided, the AI will generate a comprehensive risk
                    assessment section for your CER. This will include an evaluation of known and
                    foreseeable risks, undesirable side effects, and a benefit-risk analysis in
                    accordance with regulatory requirements.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <Button onClick={saveFormData}>Save Risk Assessment</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4">Supporting Documents</h3>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <div className="space-y-2">
                  <div className="flex justify-center">
                    <Upload className="h-12 w-12 text-gray-400" />
                  </div>
                  <h4 className="text-lg font-medium">Upload Documents</h4>
                  <p className="text-sm text-gray-500">
                    Upload clinical data, technical documentation, post-market surveillance data,
                    and other relevant documents to support your CER.
                  </p>

                  <input
                    id="file-upload"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  <div className="mt-4">
                    <label htmlFor="file-upload">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById('file-upload').click()}
                        className="mr-2"
                      >
                        Select Files
                      </Button>
                    </label>
                    <Button
                      onClick={handleUpload}
                      disabled={selectedFiles.length === 0 || uploading}
                    >
                      {uploading ? 'Uploading...' : 'Upload Files'}
                    </Button>
                  </div>
                </div>
              </div>

              {selectedFiles.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-medium mb-2">Selected Files ({selectedFiles.length})</h4>
                  <div className="border rounded-md divide-y">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="p-3 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <FileText className="h-5 w-5 text-blue-500" />
                          <div>
                            <p className="font-medium">{file.name}</p>
                            <p className="text-xs text-gray-500">
                              {(file.size / 1024).toFixed(2)} KB
                            </p>
                          </div>
                        </div>
                        {uploading ? (
                          <div className="flex items-center">
                            <span className="text-xs text-gray-500 mr-2">{uploadProgress}%</span>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const newFiles = [...selectedFiles];
                              newFiles.splice(index, 1);
                              setSelectedFiles(newFiles);
                            }}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6">
                <h4 className="font-medium mb-2">Document Requirements</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start">
                    <div className="flex-shrink-0 mr-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    </div>
                    <p>Technical documentation related to the device</p>
                  </div>
                  <div className="flex items-start">
                    <div className="flex-shrink-0 mr-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    </div>
                    <p>Clinical evaluation plan</p>
                  </div>
                  <div className="flex items-start">
                    <div className="flex-shrink-0 mr-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    </div>
                    <p>Clinical investigation reports</p>
                  </div>
                  <div className="flex items-start">
                    <div className="flex-shrink-0 mr-2">
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                    </div>
                    <p>Post-market surveillance data (if available)</p>
                  </div>
                  <div className="flex items-start">
                    <div className="flex-shrink-0 mr-2">
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                    </div>
                    <p>Risk management documentation</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
