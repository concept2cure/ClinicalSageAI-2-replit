import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import DocumentUploader from './DocumentUploader';
import { FileText, Database, CheckCircle, AlertCircle } from 'lucide-react';

/**
 * Document Intake Panel Component
 *
 * This component provides a UI for uploading and processing documents,
 * as well as reviewing processed documents before data extraction.
 *
 * @param {Object} props Component props
 * @param {Function} props.onDataExtracted Callback when data is extracted
 * @param {string} props.regulatoryContext The regulatory context for processing ('510k', 'cer', etc.)
 * @param {string} props.deviceProfileId Optional device profile ID for auto-fill
 */
const DocumentIntakePanel = ({
  onDataExtracted,
  regulatoryContext = '510k',
  deviceProfileId = '',
}) => {
  const [processedDocuments, setProcessedDocuments] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const { toast } = useToast();

  // Handle document upload completion
  const handleDocumentsProcessed = documents => {
    setProcessedDocuments(prev => [...prev, ...documents]);

    toast({
      title: 'Documents Processed',
      description: `${documents.length} document(s) added successfully.`,
    });
  };

  // Remove a document from the list
  const removeDocument = docId => {
    setProcessedDocuments(processedDocuments.filter(doc => doc.id !== docId));
  };

  // Clear all documents
  const clearDocuments = () => {
    setProcessedDocuments([]);
  };

  // Extract data from processed documents
  const handleExtractData = async () => {
    if (processedDocuments.length === 0) {
      toast({
        title: 'No Documents Available',
        description: 'Please upload and process documents first.',
        variant: 'destructive',
      });
      return;
    }

    setExtracting(true);

    try {
      // In a real implementation, this would call the document intelligence service
      // to extract data from the processed documents

      // Mock extraction for now
      const extractedData = {
        deviceName: 'Sample Medical Device',
        manufacturer: 'MedTech Innovations, Inc.',
        modelNumber: 'MD-100',
        intendedUse: 'For diagnostic use in clinical settings',
        deviceClass: 'Class II',
        regulatoryStatus: 'Pending FDA Clearance',
        technicalSpecifications: {
          dimensions: '10 x 8 x 3 cm',
          weight: '250g',
          powerSupply: 'Rechargeable Li-ion battery',
        },
        extractionTimestamp: new Date().toISOString(),
      };

      // Call the callback with the extracted data
      if (onDataExtracted) {
        onDataExtracted(extractedData);
      }

      toast({
        title: 'Data Extraction Complete',
        description: 'Successfully extracted data from the documents.',
      });

      // Clear the processed documents after successful extraction
      clearDocuments();
    } catch (error) {
      console.error('Error extracting data:', error);

      toast({
        title: 'Extraction Failed',
        description: error.message || 'Failed to extract data from documents.',
        variant: 'destructive',
      });
    } finally {
      setExtracting(false);
    }
  };

  return (
    <Card className="w-full shadow-md">
      <CardHeader className="bg-gray-50 border-b">
        <CardTitle className="text-xl font-medium">Document Intelligence</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Upload Documents
            </TabsTrigger>
            <TabsTrigger value="processed" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Processed Documents ({processedDocuments.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="pt-2">
            <DocumentUploader
              onDocumentsProcessed={handleDocumentsProcessed}
              regulatoryContext={regulatoryContext}
            />
          </TabsContent>

          <TabsContent value="processed" className="pt-2">
            {processedDocuments.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Document Analysis</h3>
                  <Button variant="outline" size="sm" onClick={clearDocuments}>
                    Clear All
                  </Button>
                </div>

                <div className="space-y-3 max-h-[400px] overflow-y-auto p-1">
                  {processedDocuments.map(doc => (
                    <Card key={doc.id} className="overflow-hidden">
                      <div className="flex items-center p-4 bg-gray-50 border-b">
                        <div className="flex-1">
                          <h4 className="font-medium">{doc.name}</h4>
                          <p className="text-sm text-gray-500">
                            {doc.recognizedType || 'Unknown Document Type'}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeDocument(doc.id)}
                          className="h-8 w-8 p-0 rounded-full"
                        >
                          <span className="sr-only">Remove</span>
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center text-sm text-gray-500 mb-2">
                          <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                          <span>Processing complete</span>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">
                          Document has been processed and is ready for data extraction.
                        </p>
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              toast({
                                title: 'Document Preview',
                                description: `${
                                  doc.name || 'Document'
                                } — processed and ready for extraction. Use the Extract Data button to proceed.`,
                              });
                            }}
                          >
                            Preview
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                <div className="flex justify-end mt-6">
                  <Button
                    onClick={handleExtractData}
                    disabled={extracting || processedDocuments.length === 0}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {extracting ? 'Extracting Data...' : 'Extract Device Data'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 px-4">
                <Database className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Processed Documents</h3>
                <p className="text-gray-500 mb-6 max-w-md mx-auto">
                  Upload documents in the "Upload Documents" tab to process them for data
                  extraction.
                </p>
                <Button
                  variant="outline"
                  onClick={() => document.querySelector('button[value="upload"]').click()}
                >
                  Upload Documents
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default DocumentIntakePanel;
