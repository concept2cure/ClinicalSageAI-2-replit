import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import DocumentIntakePanel from './DocumentIntakePanel';
import { FileText, FileOutput, CheckCircle2, Edit } from 'lucide-react';

/**
 * Document Intelligence Panel Component
 *
 * This component serves as the main container for the document intelligence workflow,
 * managing the overall state and transitions between different stages.
 *
 * @param {Object} props Component props
 * @param {string} props.regulatoryContext The regulatory context ('510k', 'cer', etc.)
 * @param {string} props.deviceProfileId Optional device profile ID
 */
const DocumentIntelligencePanel = ({ regulatoryContext = '510k', deviceProfileId = '' }) => {
  // State for the extracted data
  const [extractedData, setExtractedData] = useState(null);
  // State to track if the data has been applied
  const [dataApplied, setDataApplied] = useState(false);
  // Main workflow step
  const [activeStep, setActiveStep] = useState('intake');
  const { toast } = useToast();

  // Handle data extraction completion
  const handleDataExtracted = data => {
    setExtractedData(data);
    setActiveStep('review');

    toast({
      title: 'Data Extracted',
      description: 'Document data has been successfully extracted.',
    });
  };

  // Apply extracted data to device profile
  const handleApplyData = async () => {
    try {
      // In a real implementation, this would call the document intelligence service
      // to update the device profile with the extracted data

      toast({
        title: 'Data Applied',
        description: 'Document data has been applied to the device profile.',
      });

      setDataApplied(true);
    } catch (error) {
      console.error('Error applying data:', error);

      toast({
        title: 'Application Failed',
        description: error.message || 'Failed to apply data to device profile.',
        variant: 'destructive',
      });
    }
  };

  // Reset the workflow to start over
  const handleReset = () => {
    setExtractedData(null);
    setDataApplied(false);
    setActiveStep('intake');
  };

  // Render the current step
  const renderStep = () => {
    switch (activeStep) {
      case 'intake':
        return (
          <DocumentIntakePanel
            onDataExtracted={handleDataExtracted}
            regulatoryContext={regulatoryContext}
            deviceProfileId={deviceProfileId}
          />
        );

      case 'review':
        return (
          <Card className="w-full shadow-md">
            <CardHeader className="bg-gray-50 border-b">
              <CardTitle className="text-xl font-medium">Review Extracted Data</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-medium">Document Intelligence Results</h3>
                    <p className="text-sm text-gray-500">
                      Review the extracted data and apply it to your device profile.
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReset}
                      disabled={dataApplied}
                    >
                      Start Over
                    </Button>
                    <Button
                      onClick={handleApplyData}
                      disabled={dataApplied}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Apply Data
                    </Button>
                  </div>
                </div>

                {dataApplied && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-4 flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-3" />
                    <div>
                      <h4 className="font-medium text-green-800">Data Applied Successfully</h4>
                      <p className="text-sm text-green-700">
                        The extracted data has been applied to your device profile.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-800 border-b pb-2">Device Information</h4>

                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs text-gray-500">Device Name</Label>
                        <p className="font-medium">
                          {extractedData?.deviceName || 'Not available'}
                        </p>
                      </div>

                      <div>
                        <Label className="text-xs text-gray-500">Manufacturer</Label>
                        <p className="font-medium">
                          {extractedData?.manufacturer || 'Not available'}
                        </p>
                      </div>

                      <div>
                        <Label className="text-xs text-gray-500">Model Number</Label>
                        <p className="font-medium">
                          {extractedData?.modelNumber || 'Not available'}
                        </p>
                      </div>

                      <div>
                        <Label className="text-xs text-gray-500">Device Class</Label>
                        <p className="font-medium">
                          {extractedData?.deviceClass || 'Not available'}
                        </p>
                      </div>

                      <div>
                        <Label className="text-xs text-gray-500">Regulatory Status</Label>
                        <p className="font-medium">
                          {extractedData?.regulatoryStatus || 'Not available'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-800 border-b pb-2">
                      Technical Specifications
                    </h4>

                    <div className="space-y-3">
                      {extractedData?.technicalSpecifications ? (
                        Object.entries(extractedData.technicalSpecifications).map(
                          ([key, value]) => (
                            <div key={key}>
                              <Label className="text-xs text-gray-500">
                                {key.charAt(0).toUpperCase() +
                                  key.slice(1).replace(/([A-Z])/g, ' $1')}
                              </Label>
                              <p className="font-medium">{value}</p>
                            </div>
                          )
                        )
                      ) : (
                        <p className="text-gray-500 italic">
                          No technical specifications available
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium text-gray-800 border-b pb-2">Intended Use</h4>
                  <p className="text-sm">{extractedData?.intendedUse || 'Not available'}</p>
                </div>

                {extractedData?.predicateDevices && extractedData?.predicateDevices.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-800 border-b pb-2">Predicate Devices</h4>
                    <ul className="space-y-2">
                      {extractedData.predicateDevices.map((device, index) => (
                        <li key={index} className="flex items-center space-x-2">
                          <FileOutput className="h-4 w-4 text-gray-400" />
                          <span>
                            {device.name} ({device.manufacturer})
                          </span>
                          {device.k_number && (
                            <span className="text-xs text-gray-500">{device.k_number}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {extractedData?.clinicalData &&
                  Object.keys(extractedData.clinicalData).length > 0 && (
                    <div className="space-y-4">
                      <h4 className="font-medium text-gray-800 border-b pb-2">Clinical Data</h4>
                      <div className="space-y-3">
                        {Object.entries(extractedData.clinicalData).map(([key, value]) => (
                          <div key={key}>
                            <Label className="text-xs text-gray-500">
                              {key.charAt(0).toUpperCase() +
                                key.slice(1).replace(/([A-Z])/g, ' $1')}
                            </Label>
                            <p className="font-medium">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                <div className="flex justify-end space-x-2 mt-8">
                  <Button variant="outline" onClick={handleReset} disabled={dataApplied}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleApplyData}
                    disabled={dataApplied}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {dataApplied ? 'Data Applied' : 'Apply to Device Profile'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      default:
        return <div>Unknown step</div>;
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Document Intelligence System</h2>
        <p className="text-gray-600">
          Upload and analyze regulatory documents to automatically extract device data and
          streamline your submissions.
        </p>
      </div>

      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center space-x-2">
          <div
            className={`flex items-center ${activeStep === 'intake' ? 'text-blue-600' : dataApplied ? 'text-green-600' : 'text-gray-400'}`}
          >
            <div
              className={`flex items-center justify-center h-8 w-8 rounded-full border-2 mr-2 ${activeStep === 'intake' ? 'border-blue-600 bg-blue-50' : dataApplied ? 'border-green-600 bg-green-50' : 'border-gray-300'}`}
            >
              {dataApplied ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
            </div>
            <span
              className={`font-medium ${activeStep === 'intake' ? 'text-blue-600' : dataApplied ? 'text-green-600' : 'text-gray-500'}`}
            >
              Document Upload
            </span>
          </div>

          <div
            className={`flex-1 h-0.5 ${activeStep === 'review' || dataApplied ? 'bg-blue-600' : 'bg-gray-200'}`}
          ></div>

          <div
            className={`flex items-center ${activeStep === 'review' ? 'text-blue-600' : dataApplied ? 'text-green-600' : 'text-gray-400'}`}
          >
            <div
              className={`flex items-center justify-center h-8 w-8 rounded-full border-2 mr-2 ${activeStep === 'review' ? 'border-blue-600 bg-blue-50' : dataApplied ? 'border-green-600 bg-green-50' : 'border-gray-300'}`}
            >
              {dataApplied ? <CheckCircle2 className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
            </div>
            <span
              className={`font-medium ${activeStep === 'review' ? 'text-blue-600' : dataApplied ? 'text-green-600' : 'text-gray-500'}`}
            >
              Review & Apply
            </span>
          </div>
        </div>
      </div>

      {renderStep()}
    </div>
  );
};

export default DocumentIntelligencePanel;
