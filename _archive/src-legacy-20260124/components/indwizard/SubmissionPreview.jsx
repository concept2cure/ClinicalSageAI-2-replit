import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Download,
  Eye,
  CheckCircle,
  Clock,
  FileSearch,
  Printer,
  Share2,
} from 'lucide-react';
import indWizardService from '@/services/indWizardService';

export default function SubmissionPreview({ submissionId }) {
  const [loading, setLoading] = useState(true);
  const [previewData, setPreviewData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (submissionId) {
      setLoading(true);

      indWizardService
        .getSubmissionPreview(submissionId)
        .then(data => {
          setPreviewData(data);
          setLoading(false);
        })
        .catch(error => {
          console.error('Failed to load submission preview:', error);
          setLoading(false);
        });
    }
  }, [submissionId]);

  if (loading) {
    return (
      <Card className="shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center">
            <FileText className="h-5 w-5 mr-2 text-blue-600" />
            Submission Preview
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-12">
          <div className="flex flex-col items-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mb-3"></div>
            <p className="text-sm text-gray-500">Generating preview...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!previewData) {
    return (
      <Card className="shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center">
            <FileText className="h-5 w-5 mr-2 text-blue-600" />
            Submission Preview
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-12">
          <div className="text-center">
            <FileSearch className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 mb-4">Submission preview not available yet</p>
            <Button onClick={() => setLoading(true)}>Generate Preview</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center">
          <FileText className="h-5 w-5 mr-2 text-blue-600" />
          Submission Preview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex border-b">
            <button
              className={`px-4 py-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              className={`px-4 py-2 font-medium text-sm ${
                activeTab === 'forms'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('forms')}
            >
              Forms
            </button>
            <button
              className={`px-4 py-2 font-medium text-sm ${
                activeTab === 'documents'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('documents')}
            >
              Documents
            </button>
          </div>

          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="border rounded-md p-3">
                  <div className="text-sm text-gray-500 mb-1">IND Number</div>
                  <div className="font-semibold">{previewData.indNumber || 'To be assigned'}</div>
                </div>
                <div className="border rounded-md p-3">
                  <div className="text-sm text-gray-500 mb-1">Submission Type</div>
                  <div className="font-semibold">{previewData.submissionType}</div>
                </div>
                <div className="border rounded-md p-3">
                  <div className="text-sm text-gray-500 mb-1">Status</div>
                  <div className="flex items-center">
                    {previewData.status === 'ready' ? (
                      <CheckCircle className="h-4 w-4 text-green-600 mr-1" />
                    ) : (
                      <Clock className="h-4 w-4 text-amber-600 mr-1" />
                    )}
                    <span className="font-semibold">
                      {previewData.status === 'ready' ? 'Ready for Submission' : 'In Preparation'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border rounded-md">
                <div className="bg-gray-50 p-2 border-b flex justify-between items-center">
                  <span className="font-medium">Submission Package</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                      <Eye className="h-3.5 w-3.5" />
                      <span>Preview</span>
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                      <Download className="h-3.5 w-3.5" />
                      <span>Download</span>
                    </Button>
                  </div>
                </div>
                <div className="p-3">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Total File Size:</span>
                    <span className="text-sm">{previewData.totalSize}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Generated On:</span>
                    <span className="text-sm">{previewData.generatedDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Format:</span>
                    <span className="text-sm">{previewData.format}</span>
                  </div>

                  <div className="mt-4 pt-4 border-t border-dashed">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Printer className="h-4 w-4" />
                        <span>Print Cover Letter</span>
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Share2 className="h-4 w-4" />
                        <span>Share for Review</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'forms' && (
            <div className="space-y-2">
              <ScrollArea className="h-[250px]">
                <div className="space-y-2">
                  {previewData.forms.map((form, index) => (
                    <div key={index} className="border rounded-md p-3 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
                          <div>
                            <h4 className="font-medium text-sm">{form.name}</h4>
                            <p className="text-xs text-gray-500">{form.description}</p>
                          </div>
                        </div>
                        <div>
                          {form.status === 'complete' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Complete
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                              <Clock className="h-3 w-3 mr-1" />
                              In Progress
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-end mt-2">
                        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                          <Eye className="h-3.5 w-3.5" />
                          <span>View</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="space-y-2">
              <ScrollArea className="h-[250px]">
                <div className="space-y-2">
                  {previewData.documents.map((document, index) => (
                    <div key={index} className="border rounded-md p-3 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
                          <div>
                            <h4 className="font-medium text-sm">{document.name}</h4>
                            <div className="flex items-center text-xs text-gray-500 mt-0.5">
                              <span>{document.type}</span>
                              <span className="mx-1">•</span>
                              <span>{document.size}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button className="gap-1.5">
              <FileText className="h-4 w-4" />
              <span>Submit to FDA</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
