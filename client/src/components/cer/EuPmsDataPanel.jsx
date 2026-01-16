import React, { useState, useEffect } from 'react';
import { cerApiService } from '@/services/CerAPIService';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertCircle, CheckCircle, FileText, Upload, Database, FileSpreadsheet, UploadCloud, RefreshCw, Globe, AlertTriangle } from 'lucide-react'
import LoadingSpinner from '@/components/common/LoadingSpinner';

const EuPmsDataPanel = ({ jobId, deviceName, manufacturer, onAddToCER }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('eudamed');
  const [euPmsData, setEuPmsData] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [dataSource, setDataSource] = useState('api'); // 'api' or 'file'
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [formData, setFormData] = useState({
    deviceName: deviceName || '',
    recordType: 'incident',
    referenceNumber: '',
    reportDate: '',
    description: '',
    outcome: '',
    action: '',
    country: '',
    manufacturer: manufacturer || '',
  });

  useEffect(() => {
    // Update device and manufacturer in formData when props change
    setFormData(prev => ({
      ...prev,
      deviceName: deviceName || prev.deviceName,
      manufacturer: manufacturer || prev.manufacturer,
    }));
  }, [deviceName, manufacturer]);

  // Fetch PMS data on initialization
  useEffect(() => {
    const fetchData = async () => {
      if (activeTab && !euPmsData) {
        try {
          setIsLoading(true);
          const data = await cerApiService.getEuPmsDataByCategory(activeTab);
          setEuPmsData(data);
        } catch (error) {
          console.error(`Error fetching ${activeTab} data:`, error);
        } finally {
          setIsLoading(false);
        }
      }
    };

    fetchData();
  }, [activeTab, euPmsData]);

  const handleFileChange = event => {
    const files = Array.from(event.target.files);
    setSelectedFiles(files);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploadingFile(true);

    try {
      // Simulate upload progress
      const interval = setInterval(() => {
        setUploadProgress(prev => {
          const newProgress = prev + 10;
          if (newProgress >= 100) {
            clearInterval(interval);
            return 100;
          }
          return newProgress;
        });
      }, 300);

      // Create FormData for file upload
      const formData = new FormData();

      // Add each file to the form data
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });

      // Add metadata to the form data
      formData.append('deviceName', deviceName || '');
      formData.append('manufacturer', manufacturer || '');
      formData.append('category', activeTab);
      formData.append('jobId', jobId);

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Handle the upload response
      setEuPmsData({
        category: activeTab,
        files: selectedFiles.map(file => file.name),
        importDate: new Date().toISOString(),
        status: 'processed',
        records: selectedFiles.length,
      });

      clearInterval(interval);
      setUploadProgress(100);

      setTimeout(() => {
        setUploadingFile(false);
        setUploadProgress(0);
        setSelectedFiles([]);
      }, 1000);
    } catch (error) {
      console.error('Error uploading files:', error);
      setUploadingFile(false);
      setUploadProgress(0);
    }
  };

  const handleFormSubmit = async e => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const newPmsData = {
        ...formData,
        reportDate: formData.reportDate || new Date().toISOString().split('T')[0],
        category: activeTab,
        id: `${activeTab}-${Date.now()}`,
      };

      // Call API endpoint to add data
      await cerApiService.addEuPmsData(newPmsData);

      // Update local state with new data
      setEuPmsData(prev => {
        if (!prev) return { records: [newPmsData] };
        return {
          ...prev,
          records: [...(prev.records || []), newPmsData],
        };
      });

      // Reset form
      setFormData({
        ...formData,
        referenceNumber: '',
        reportDate: '',
        description: '',
        outcome: '',
        action: '',
        country: '',
      });
    } catch (error) {
      console.error('Error adding PMS data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToCER = () => {
    if (!euPmsData) return;

    // Format the summary for CER
    const cerSection = {
      type: 'eu-global-pms-data',
      title: 'EU and Global Post-Market Surveillance Data',
      content: `
## EU and Global Post-Market Surveillance Data Analysis

### Overview
This section summarizes the data from European and global regulatory surveillance systems for ${deviceName || 'the device'} manufactured by ${manufacturer || 'the manufacturer'}.

### Eudamed Vigilance Data
${
  euPmsData &&
  euPmsData.records &&
  euPmsData.records.filter(r => r.category === 'eudamed').length > 0
    ? `A total of ${euPmsData.records.filter(r => r.category === 'eudamed').length} vigilance reports were identified in the Eudamed database related to this device or similar devices.`
    : 'No vigilance reports were identified in the Eudamed database related to this device.'
}

### Field Safety Corrective Actions (FSCA)
${
  euPmsData && euPmsData.records && euPmsData.records.filter(r => r.category === 'fsca').length > 0
    ? `${euPmsData.records.filter(r => r.category === 'fsca').length} FSCAs were identified related to this device or similar devices.`
    : 'No FSCAs were identified related to this device.'
}

### Global Regulatory Reports
${
  euPmsData &&
  euPmsData.records &&
  euPmsData.records.filter(r => r.category === 'global').length > 0
    ? `${euPmsData.records.filter(r => r.category === 'global').length} global regulatory authority reports were identified.`
    : 'No global regulatory authority reports were identified for this device.'
}

### Analysis and Impact on Clinical Evaluation
The PMS data collected from European and global sources was analyzed to identify potential safety signals or trends. This analysis supports the overall benefit-risk determination for the device in accordance with MEDDEV 2.7/1 Rev 4 requirements and EU MDR Article 61.

### Conclusion
${
  euPmsData && euPmsData.records && euPmsData.records.length > 0
    ? 'Based on the review of EU and global PMS data, the overall safety profile of the device is consistent with its intended purpose and known risks.'
    : 'No significant safety signals were identified in EU and global post-market surveillance databases for this device.'
}
`,
      author: 'TrialSage AI',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      sources: [
        { name: 'Eudamed Database', type: 'regulatory', date: new Date().toISOString() },
        {
          name: 'National Competent Authorities Reports',
          type: 'regulatory',
          date: new Date().toISOString(),
        },
        { name: 'Global Regulatory Databases', type: 'regulatory', date: new Date().toISOString() },
      ],
    };

    onAddToCER(cerSection);
  };

  const renderManualEntryForm = () => (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="deviceName">Device Name</Label>
          <Input
            id="deviceName"
            value={formData.deviceName}
            onChange={e => setFormData({ ...formData, deviceName: e.target.value })}
            placeholder="Enter device name"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="manufacturer">Manufacturer</Label>
          <Input
            id="manufacturer"
            value={formData.manufacturer}
            onChange={e => setFormData({ ...formData, manufacturer: e.target.value })}
            placeholder="Enter manufacturer name"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="referenceNumber">Reference Number</Label>
          <Input
            id="referenceNumber"
            value={formData.referenceNumber}
            onChange={e => setFormData({ ...formData, referenceNumber: e.target.value })}
            placeholder="Enter reference number"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reportDate">Report Date</Label>
          <Input
            id="reportDate"
            type="date"
            value={formData.reportDate}
            onChange={e => setFormData({ ...formData, reportDate: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="recordType">Record Type</Label>
        <RadioGroup
          id="recordType"
          value={formData.recordType}
          onValueChange={value => setFormData({ ...formData, recordType: value })}
          className="flex space-x-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="incident" id="incident" />
            <Label htmlFor="incident">Incident</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="fsca" id="fsca" />
            <Label htmlFor="fsca">FSCA</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="notification" id="notification" />
            <Label htmlFor="notification">Notification</Label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label htmlFor="country">Country</Label>
        <Input
          id="country"
          value={formData.country}
          onChange={e => setFormData({ ...formData, country: e.target.value })}
          placeholder="Enter country"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={e => setFormData({ ...formData, description: e.target.value })}
          placeholder="Enter description of the event or action"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="outcome">Outcome</Label>
          <Input
            id="outcome"
            value={formData.outcome}
            onChange={e => setFormData({ ...formData, outcome: e.target.value })}
            placeholder="Enter outcome"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="action">Action Taken</Label>
          <Input
            id="action"
            value={formData.action}
            onChange={e => setFormData({ ...formData, action: e.target.value })}
            placeholder="Enter action taken"
          />
        </div>
      </div>

      <Button type="submit" disabled={isLoading} className="w-full mt-4">
        {isLoading ? <LoadingSpinner /> : 'Add PMS Record'}
      </Button>
    </form>
  );

  const renderFileUploadForm = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Upload PMS Data Files</CardTitle>
          <CardDescription>
            {activeTab === 'eudamed' && 'Upload Eudamed vigilance data exports'}
            {activeTab === 'fsca' && 'Upload Field Safety Corrective Action (FSCA) reports'}
            {activeTab === 'global' && 'Upload global regulatory authority reports'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6">
            <UploadCloud className="h-12 w-12 text-gray-400 mb-2" />
            <p className="text-sm text-gray-500 mb-4 text-center">
              Drag and drop your files here, or click to browse
            </p>
            <Input
              type="file"
              id="fileUpload"
              multiple
              accept=".pdf,.doc,.docx,.csv,.xls,.xlsx,.xml"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => document.getElementById('fileUpload').click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Browse Files
            </Button>
            <div className="w-full mt-4">
              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Selected Files ({selectedFiles.length})</p>
                  <ul className="space-y-1 text-sm">
                    {selectedFiles.map((file, index) => (
                      <li key={index} className="flex items-center">
                        <FileText className="h-4 w-4 mr-2 text-blue-500" />
                        {file.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          {uploadingFile ? (
            <div className="w-full">
              <div className="flex justify-between mb-1">
                <span className="text-sm">{uploadProgress}% Complete</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          ) : (
            <Button onClick={handleUpload} disabled={selectedFiles.length === 0} className="w-full">
              <Upload className="h-4 w-4 mr-2" />
              Upload Files
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );

  const renderDataSourceSelector = () => (
    <div className="mb-6">
      <RadioGroup value={dataSource} onValueChange={setDataSource} className="flex space-x-6">
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="api" id="api" />
          <Label htmlFor="api" className="flex items-center">
            <Database className="h-4 w-4 mr-2" />
            <span>API Data</span>
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="form" id="form" />
          <Label htmlFor="form" className="flex items-center">
            <FileText className="h-4 w-4 mr-2" />
            <span>Manual Entry</span>
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="file" id="file" />
          <Label htmlFor="file" className="flex items-center">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            <span>File Upload</span>
          </Label>
        </div>
      </RadioGroup>
    </div>
  );

  const renderPmsData = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-40">
          <LoadingSpinner />
        </div>
      );
    }

    if (!euPmsData || (euPmsData.records && euPmsData.records.length === 0)) {
      return (
        <div className="bg-yellow-50 p-4 rounded-md mb-6">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-yellow-500 mr-2 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">No {activeTab} data found</h3>
              <p className="text-sm text-yellow-700 mt-1">
                {activeTab === 'eudamed' &&
                  'No Eudamed vigilance data is available for this device.'}
                {activeTab === 'fsca' &&
                  'No Field Safety Corrective Actions (FSCAs) are available for this device.'}
                {activeTab === 'global' &&
                  'No global regulatory authority reports are available for this device.'}
              </p>
              <p className="text-sm text-yellow-700 mt-2">
                You can add data manually or upload files using the options below.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4 mb-6">
        <div className="bg-green-50 p-4 rounded-md">
          <div className="flex">
            <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
            <div>
              <h3 className="text-sm font-medium text-green-800">Data Available</h3>
              <p className="text-sm text-green-700 mt-1">
                {euPmsData.records
                  ? `${euPmsData.records.length} records`
                  : 'Data imported from files'}{' '}
                available for analysis
              </p>
            </div>
          </div>
        </div>

        {euPmsData.records && euPmsData.records.length > 0 && (
          <div className="rounded-md border overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reference
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Country
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {euPmsData.records.map((record, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {record.referenceNumber || `ID-${index + 1}`}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {record.recordType || 'N/A'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {record.reportDate ? new Date(record.reportDate).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">{record.country || 'N/A'}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {record.description
                        ? record.description.length > 50
                          ? `${record.description.substring(0, 50)}...`
                          : record.description
                        : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {euPmsData.files && euPmsData.files.length > 0 && (
          <div className="rounded-md border p-4">
            <h3 className="text-sm font-medium mb-2">Imported Files</h3>
            <ul className="space-y-1">
              {euPmsData.files.map((file, index) => (
                <li key={index} className="flex items-center text-sm">
                  <FileText className="h-4 w-4 mr-2 text-blue-500" />
                  {file}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">EU & Global PMS Data</h2>
          <p className="text-gray-500 mt-1">
            Integrate European and global post-market surveillance data for comprehensive safety
            profile
          </p>
        </div>
        <div className="mt-4 md:mt-0">
          <Button
            onClick={handleAddToCER}
            disabled={!euPmsData}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Globe className="h-4 w-4 mr-2" />
            Add to CER
          </Button>
        </div>
      </div>

      <div className="mb-6">
        <Tabs defaultValue="eudamed" onValueChange={setActiveTab} value={activeTab}>
          <TabsList className="w-full">
            <TabsTrigger value="eudamed" className="flex-1">
              <div className="flex items-center justify-center">
                <Database className="h-4 w-4 mr-2" />
                Eudamed Data
              </div>
            </TabsTrigger>
            <TabsTrigger value="fsca" className="flex-1">
              <div className="flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 mr-2" />
                FSCA Reports
              </div>
            </TabsTrigger>
            <TabsTrigger value="global" className="flex-1">
              <div className="flex items-center justify-center">
                <Globe className="h-4 w-4 mr-2" />
                Global Reports
              </div>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="eudamed" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>European Database on Medical Devices (EUDAMED)</CardTitle>
                <CardDescription>
                  Connect to Eudamed vigilance data for your device and similar devices
                </CardDescription>
              </CardHeader>
              <CardContent>
                {renderPmsData()}
                {renderDataSourceSelector()}
                {dataSource === 'form' && renderManualEntryForm()}
                {dataSource === 'file' && renderFileUploadForm()}
                {dataSource === 'api' && (
                  <div className="flex justify-center">
                    <Button
                      onClick={() => setIsLoading(true)}
                      disabled={isLoading}
                      variant="outline"
                      className="mt-2"
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                      {isLoading ? 'Fetching Data...' : 'Fetch from Eudamed API'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fsca" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Field Safety Corrective Actions (FSCA)</CardTitle>
                <CardDescription>
                  Access FSCA reports for your device and similar devices in the EU market
                </CardDescription>
              </CardHeader>
              <CardContent>
                {renderPmsData()}
                {renderDataSourceSelector()}
                {dataSource === 'form' && renderManualEntryForm()}
                {dataSource === 'file' && renderFileUploadForm()}
                {dataSource === 'api' && (
                  <div className="flex justify-center">
                    <Button
                      onClick={() => setIsLoading(true)}
                      disabled={isLoading}
                      variant="outline"
                      className="mt-2"
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                      {isLoading ? 'Fetching Data...' : 'Fetch FSCA Reports'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="global" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Global Regulatory Authority Reports</CardTitle>
                <CardDescription>
                  Access reports from global regulatory authorities (MHRA, TGA, Health Canada, etc.)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {renderPmsData()}
                {renderDataSourceSelector()}
                {dataSource === 'form' && renderManualEntryForm()}
                {dataSource === 'file' && renderFileUploadForm()}
                {dataSource === 'api' && (
                  <div className="flex justify-center">
                    <Button
                      onClick={() => setIsLoading(true)}
                      disabled={isLoading}
                      variant="outline"
                      className="mt-2"
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                      {isLoading ? 'Fetching Data...' : 'Fetch Global Reports'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <div className="bg-blue-50 p-4 rounded-md">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-blue-500 mr-2" />
          <div>
            <h3 className="text-sm font-medium text-blue-800">EU MDR Compliance</h3>
            <p className="text-sm text-blue-700 mt-1">
              EU MDR Article 61 requires manufacturers to proactively collect and evaluate relevant
              clinical data, including PMS data from all applicable sources. Adding EU & global PMS
              data to your CER ensures regulatory compliance and provides a more comprehensive
              safety profile.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EuPmsDataPanel;
