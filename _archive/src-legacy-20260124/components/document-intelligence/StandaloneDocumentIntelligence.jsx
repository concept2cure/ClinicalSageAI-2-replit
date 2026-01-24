import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Brain, FileText, Microscope, ExternalLink, AlertTriangle } from 'lucide-react';
import DocumentUploader from './DocumentUploader';
import DocumentAnalyzer from './DocumentAnalyzer';
import DocumentIntakeForm from './DocumentIntakeForm';

/**
 * Standalone Document Intelligence Component
 *
 * This version is specifically designed to work in fullscreen mode
 * without modal conflicts by using a higher z-index and ensuring
 * all UI components are rendered within this container.
 *
 * @param {Object} props
 * @param {string} props.regulatoryContext - The regulatory context (510k, cer, etc.)
 * @param {Object} props.deviceProfile - The current device profile
 * @param {Function} props.onDeviceProfileUpdate - Callback for when device profile is updated
 * @param {Function} props.onClose - Callback when the user wants to close the UI
 */
const StandaloneDocumentIntelligence = ({
  regulatoryContext = '510k',
  deviceProfile,
  onDeviceProfileUpdate,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState('upload');
  const [processedDocuments, setProcessedDocuments] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [extractedData, setExtractedData] = useState(null);

  // On mount, add CSS to disable conflicting modals
  useEffect(() => {
    // Create and add style element
    const styleEl = document.createElement('style');
    styleEl.id = 'di-modal-fix';
    styleEl.textContent = `
      /* Fix for modal conflicts - hide any dialogs not part of our component */
      [role="dialog"]:not(#doc-intelligence-root *),
      [aria-modal="true"]:not(#doc-intelligence-root *) {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      
      /* Lock body scroll */
      body {
        overflow: hidden !important;
      }
    `;
    document.head.appendChild(styleEl);

    // Cleanup function
    return () => {
      if (styleEl && styleEl.parentNode) {
        styleEl.parentNode.removeChild(styleEl);
      }
    };
  }, []);

  // Handle when documents are processed
  const handleDocumentsProcessed = (documents, types) => {
    setProcessedDocuments(documents);
    setDocumentTypes(types);

    // If no documents, reset the state
    if (documents.length === 0) {
      setExtractedData(null);
    }

    // If documents are processed and we're on the upload tab, advance to analysis tab
    if (documents.length > 0 && activeTab === 'upload') {
      setActiveTab('analyze');
    }
  };

  // Handle when document analysis is complete
  const handleAnalysisComplete = data => {
    setExtractedData(data);

    // Advance to intake tab
    setActiveTab('intake');
  };

  // Handle when data is applied to device profile
  const handleApplyData = dataToApply => {
    // Create updated device profile with applied data
    const updatedProfile = {
      ...deviceProfile,
      ...dataToApply,
      updatedAt: new Date().toISOString(),
    };

    // Call callback with updated profile
    if (onDeviceProfileUpdate) {
      onDeviceProfileUpdate(updatedProfile);
    }
  };

  // Render workflow status
  const renderWorkflowStatus = () => {
    const steps = [
      { id: 'upload', label: 'Document Upload', icon: FileText },
      { id: 'analyze', label: 'Document Analysis', icon: Microscope },
      {
        id: 'intake',
        label: 'Data Review & Application',
        icon: () => (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          </svg>
        ),
      },
    ];

    return (
      <div className="flex items-center justify-between mb-6 px-2">
        {steps.map((step, index) => {
          const StepIcon = step.icon;
          const isActive = step.id === activeTab;
          const isComplete = getStepCompletionStatus(step.id);
          const isDisabled = !canAccessStep(step.id);

          return (
            <React.Fragment key={step.id}>
              {index > 0 && (
                <div
                  className={`h-1 flex-1 mx-2 ${
                    isComplete ||
                    (index === 1 && processedDocuments.length > 0) ||
                    (index === 2 && extractedData)
                      ? 'bg-primary/60'
                      : 'bg-muted'
                  }`}
                />
              )}

              <div className="flex flex-col items-center">
                <div
                  className={`
                    flex items-center justify-center rounded-full w-10 h-10 mb-1
                    ${
                      isActive
                        ? 'bg-primary text-white'
                        : isComplete
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground'
                    }
                  `}
                >
                  <StepIcon className="h-5 w-5" />
                </div>
                <span className={`text-xs ${isActive ? 'font-medium' : 'text-muted-foreground'}`}>
                  {step.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  // Determine if a step is complete
  const getStepCompletionStatus = stepId => {
    switch (stepId) {
      case 'upload':
        return processedDocuments.length > 0;
      case 'analyze':
        return extractedData !== null;
      case 'intake':
        return false; // Intake is the final step
      default:
        return false;
    }
  };

  // Determine if a step can be accessed
  const canAccessStep = stepId => {
    switch (stepId) {
      case 'upload':
        return true; // Always accessible
      case 'analyze':
        return processedDocuments.length > 0;
      case 'intake':
        return extractedData !== null;
      default:
        return false;
    }
  };

  return (
    <div
      id="doc-intelligence-root"
      className="fixed inset-0 z-[9999] bg-white/80 backdrop-blur-sm flex flex-col"
    >
      {/* Header */}
      <div className="bg-primary shadow-md p-4 text-white flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Brain className="h-6 w-6" />
          <div>
            <h1 className="text-xl font-semibold">Document Intelligence</h1>
            <p className="text-sm text-primary-foreground/80">
              Extract and apply data from regulatory documents
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="text-white border-white/20 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4 mr-1" />
          Close
        </Button>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight flex items-center">
                Document Intelligence
              </h2>
              <p className="text-muted-foreground">
                Upload regulatory documents to automatically extract and apply device data.
              </p>
            </div>

            <Badge variant="outline" className="flex items-center">
              <AlertTriangle className="h-3.5 w-3.5 mr-1 text-yellow-500" />
              <span>Beta Feature</span>
            </Badge>
          </div>

          {renderWorkflowStatus()}

          <Card className="shadow-xl border-2 border-gray-100">
            <CardHeader>
              <CardTitle>Document Processing Workflow</CardTitle>
              <CardDescription>
                Follow the steps below to extract and apply data from your regulatory documents.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="upload" disabled={false}>
                    <FileText className="h-4 w-4 mr-2" />
                    Upload
                  </TabsTrigger>
                  <TabsTrigger value="analyze" disabled={!canAccessStep('analyze')}>
                    <Microscope className="h-4 w-4 mr-2" />
                    Analyze
                  </TabsTrigger>
                  <TabsTrigger value="intake" disabled={!canAccessStep('intake')}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4 mr-2"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                    </svg>
                    Review & Apply
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="upload" className="pt-4">
                  <DocumentUploader
                    regulatoryContext={regulatoryContext}
                    onDocumentsProcessed={handleDocumentsProcessed}
                  />
                </TabsContent>

                <TabsContent value="analyze" className="pt-4">
                  <DocumentAnalyzer
                    processedDocuments={processedDocuments}
                    documentTypes={documentTypes}
                    regulatoryContext={regulatoryContext}
                    onAnalysisComplete={handleAnalysisComplete}
                  />
                </TabsContent>

                <TabsContent value="intake" className="pt-4">
                  <DocumentIntakeForm
                    extractedData={extractedData}
                    regulatoryContext={regulatoryContext}
                    onApplyData={handleApplyData}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-4">
            <div className="flex items-start">
              <AlertTriangle className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5 text-yellow-500" />
              <p>
                <span className="font-medium">Beta Feature Notice:</span> The Document Intelligence
                system is currently in beta. Results may vary depending on document quality and
                format. Always review extracted data carefully before applying it to your device
                profile.
                <a href="#" className="text-primary inline-flex items-center ml-2 hover:underline">
                  Learn more
                  <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StandaloneDocumentIntelligence;
