import React, { useState } from 'react';
import { AlertTriangle, FileText, ChevronRight, Search, Settings, Gauge, RefreshCw, Filter, Clock, CheckCircle2, Upload, FileUp, Download, Sparkles, HelpCircle, FilePlus, Lightbulb } from 'lucide-react'
import { useParams, useLocation } from 'wouter';
import { useDocumentRiskAnalysis } from '@/hooks/useDocumentRiskAnalysis';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import RiskAnalysisScorecard from '@/components/risk/RiskAnalysisScorecard';
import RiskItemList from '@/components/risk/RiskItemList';
import RiskDetailPanel from '@/components/risk/RiskDetailPanel';
import { useToast } from '@/hooks/use-toast';

/**
 * DocumentRiskPrediction Page
 *
 * Main page for the document risk prediction feature that showcases
 * AI-powered risk analysis, insights, and mitigation suggestions.
 */
const DocumentRiskPrediction = () => {
  const [location, setLocation] = useLocation();
  const params = useParams();
  const documentId = params?.id || 'doc-123'; // Default ID for demo/development
  const { toast } = useToast();

  // Use the document risk analysis hook
  const {
    riskAnalysis,
    documentContent,
    riskInsights,
    selectedRiskId,
    isLoadingAnalysis,
    isLoadingDocument,
    isLoadingInsights,
    isUpdatingStatus,
    isRunningAnalysis,
    isApplyingSuggestion,
    setSelectedRiskId,
    updateRiskStatus,
    runAnalysis,
    applySuggestion,
    refetchAnalysis,
    refetchInsights,
  } = useDocumentRiskAnalysis(documentId);

  // State for document list (for document selection dropdown)
  const [documents, setDocuments] = useState([
    {
      id: 'doc-123',
      title: 'Clinical Study Report - Protocol XYZ-123',
      type: 'CSR',
      date: '2025-03-15',
    },
    { id: 'doc-456', title: 'Investigator Brochure v2.0', type: 'IB', date: '2025-02-28' },
    {
      id: 'doc-789',
      title: 'Clinical Evaluation Report - Device ABC',
      type: 'CER',
      date: '2025-04-10',
    },
  ]);

  // Get selected risk
  const selectedRisk = riskAnalysis?.risks?.find(r => r.id === selectedRiskId);

  // Handle risk status update
  const handleUpdateRiskStatus = (riskId, status, resolution = '') => {
    updateRiskStatus({
      riskId,
      status,
      resolution,
    });
  };

  // Handle applying a suggestion
  const handleApplySuggestion = data => {
    applySuggestion(data);

    toast({
      title: 'Changes Applied',
      description: 'The suggested changes have been applied to the document.',
    });
  };

  // Handle document upload
  const handleDocumentUpload = e => {
    e.preventDefault();

    toast({
      title: 'Document Uploaded',
      description: 'Your document has been uploaded and is being analyzed.',
    });
  };

  return (
    <div className="container mx-auto py-6">
      {/* Header */}
      <div className="mb-6">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/documents">Documents</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Risk Analysis</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">Document Risk Prediction</h1>
            <p className="text-gray-500 mt-1">
              AI-powered risk analysis and mitigation suggestions for regulatory documents
            </p>
          </div>

          <div className="flex gap-2">
            <div className="w-[300px]">
              <Select
                value={documentId}
                onValueChange={value => setLocation(`/document-risk/${value}`)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select document" />
                </SelectTrigger>
                <SelectContent>
                  {documents.map(doc => (
                    <SelectItem key={doc.id} value={doc.id}>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <span className="truncate">{doc.title}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload Document for Analysis</DialogTitle>
                  <DialogDescription>
                    Upload a document to analyze for regulatory risks and get AI-powered
                    suggestions.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleDocumentUpload}>
                  <div className="space-y-4 py-4">
                    <div className="border-2 border-dashed rounded-md p-6 flex flex-col items-center justify-center">
                      <FileUp className="h-8 w-8 text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500 mb-2">
                        Drag and drop files here or click to browse
                      </p>
                      <Input id="file" type="file" className="hidden" />
                      <Button
                        variant="outline"
                        onClick={() => document.getElementById('file').click()}
                      >
                        Select File
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="document-type" className="text-sm font-medium">
                        Document Type
                      </label>
                      <Select defaultValue="csr">
                        <SelectTrigger id="document-type">
                          <SelectValue placeholder="Select document type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="csr">Clinical Study Report (CSR)</SelectItem>
                          <SelectItem value="ib">Investigator Brochure (IB)</SelectItem>
                          <SelectItem value="cer">Clinical Evaluation Report (CER)</SelectItem>
                          <SelectItem value="protocol">Protocol</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button type="submit">Upload & Analyze</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => runAnalysis()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Run New Analysis
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Download className="h-4 w-4 mr-2" />
                  Export Risk Report
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <HelpCircle className="h-4 w-4 mr-2" />
                  Help & Documentation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Document Title & Info */}
      <Card className="mb-6">
        <CardHeader className="py-4">
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div>
              <CardTitle className="text-xl">
                {documentContent?.title || 'Loading document...'}
              </CardTitle>
              <CardDescription>Document ID: {documentId}</CardDescription>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 text-sm text-gray-500">
                <Clock className="h-4 w-4" />
                <span>
                  Last updated:{' '}
                  {documentContent
                    ? new Date().toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : 'Unknown'}
                </span>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <FileText className="h-4 w-4 mr-2" />
                  View Document
                </Button>
                <Button size="sm">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Run Analysis
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Risk Analysis Dashboard */}
      <div className="mb-6">
        <RiskAnalysisScorecard
          analysis={riskAnalysis}
          isLoading={isLoadingAnalysis}
          onRunAnalysis={() => runAnalysis()}
        />
      </div>

      {/* Risk Detail View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk List */}
        <div>
          <RiskItemList
            risks={riskAnalysis?.risks}
            isLoading={isLoadingAnalysis}
            selectedRiskId={selectedRiskId}
            onSelectRisk={riskId => setSelectedRiskId(riskId)}
            onUpdateStatus={(riskId, status) => handleUpdateRiskStatus(riskId, status)}
          />
        </div>

        {/* Risk Detail */}
        <div>
          <RiskDetailPanel
            risk={selectedRisk}
            riskInsights={riskInsights}
            isLoadingInsights={isLoadingInsights}
            onUpdateStatus={handleUpdateRiskStatus}
            onApplySuggestion={handleApplySuggestion}
          />
        </div>
      </div>

      {/* AI Recommendations Summary */}
      {riskAnalysis && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              AI-Powered Document Recommendations
            </CardTitle>
            <CardDescription>
              Based on our analysis of {riskAnalysis.risks?.length} identified risks, here are the
              top recommendations:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 border rounded-md bg-blue-50">
                <h3 className="font-medium text-blue-800 mb-2">Primary Recommendations</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="font-medium">Address inconsistent adverse event reporting</p>
                      <p className="text-sm text-gray-700">
                        Inconsistency in adverse event reporting across sites is the highest risk
                        item. Conduct a full reconciliation of SAE data and provide detailed
                        methodology explanation.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div>
                      <p className="font-medium">Improve statistical analysis section</p>
                      <p className="text-sm text-gray-700">
                        Add detailed explanation of outlier definition criteria and include
                        sensitivity analysis with and without outliers to prevent information
                        requests.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium">Enhance randomization procedure description</p>
                      <p className="text-sm text-gray-700">
                        While currently acceptable, enhancing the randomization description with
                        specific details about block sizes and stratification factors would align
                        with recent FDA feedback.
                      </p>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500">Overall Document Health</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end justify-between">
                      <span className="text-2xl font-bold">
                        {Math.round((1 - riskAnalysis.overallRiskScore) * 100)}%
                      </span>
                      <Gauge className="h-6 w-6 text-blue-500" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500">Open Issues</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end justify-between">
                      <span className="text-2xl font-bold">
                        {riskAnalysis.risks?.filter(r => r.mitigationStatus === 'open')?.length ||
                          0}
                      </span>
                      <AlertTriangle className="h-6 w-6 text-amber-500" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500">Completed Mitigations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end justify-between">
                      <span className="text-2xl font-bold">
                        {riskAnalysis.risks?.filter(r => r.mitigationStatus === 'resolved')
                          ?.length || 0}
                      </span>
                      <CheckCircle2 className="h-6 w-6 text-green-500" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DocumentRiskPrediction;
