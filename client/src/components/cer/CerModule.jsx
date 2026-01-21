import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import {
  FileText,
  BookOpen,
  BarChart3,
  FileOutput,
  History,
  Settings,
  CheckSquare,
  Database,
} from 'lucide-react';

import GenerateFullCerButton from './GenerateFullCerButton';
import InputDataPanel from './InputDataPanel';
import LitReviewPanel from './LitReviewPanel';
import GeneratedReportPanel from './GeneratedReportPanel';
import DocumentVaultPanel from './DocumentVaultPanel';
import CerHistoryPanel from './CerHistoryPanel';
import TemplateSettingsPanel from './TemplateSettingsPanel';
import ApprovalsPanel from './ApprovalsPanel';
import InternalClinicalDataPanel from './InternalClinicalDataPanel';

export default function CerModule() {
  const [activeTab, setActiveTab] = useState('input');
  const [currentJobId, setCurrentJobId] = useState(null);

  // Handler for when a CER is successfully generated
  const handleCerGenerated = jobId => {
    setCurrentJobId(jobId);
    setActiveTab('generated-report');
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-t-4 border-blue-500">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-bold text-blue-800">
                Medical Device & Diagnostics Regulatory Module
              </CardTitle>
              <CardDescription className="text-blue-700">
                Generate regulatory evaluation reports with advanced AI assistance
              </CardDescription>
            </div>
            <div className="flex space-x-4">
              <Button variant="outline">Help Guide</Button>
              <GenerateFullCerButton onCompletion={handleCerGenerated} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-blue-700 mb-4">
            TrialSage's Medical Device & Diagnostics Regulatory Module automatically creates
            regulatory evaluation reports that follow EU MDR, FDA, and international guidelines.
            Upload your device data, select literature, customize templates, and generate
            professional reports.
          </p>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
              <TabsTrigger value="input" className="flex items-center">
                <FileText className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Input Data</span>
                <span className="sm:hidden">Data</span>
              </TabsTrigger>
              <TabsTrigger value="lit-review" className="flex items-center">
                <BookOpen className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Literature Review</span>
                <span className="sm:hidden">Lit Review</span>
              </TabsTrigger>
              <TabsTrigger value="internal-data" className="flex items-center">
                <Database className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Internal Clinical Data</span>
                <span className="sm:hidden">Internal</span>
              </TabsTrigger>
              <TabsTrigger value="generated-report" className="flex items-center">
                <FileOutput className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Generated Report</span>
                <span className="sm:hidden">Report</span>
              </TabsTrigger>
              <TabsTrigger value="document-vault" className="flex items-center">
                <BarChart3 className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Document Vault</span>
                <span className="sm:hidden">Vault</span>
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center">
                <History className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Generation History</span>
                <span className="sm:hidden">History</span>
              </TabsTrigger>
              <TabsTrigger value="template-settings" className="flex items-center">
                <Settings className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Template Settings</span>
                <span className="sm:hidden">Templates</span>
              </TabsTrigger>
              <TabsTrigger value="approvals" className="flex items-center">
                <CheckSquare className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Approvals</span>
                <span className="sm:hidden">Approve</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="input" className="space-y-4">
              <InputDataPanel jobId={currentJobId} />
            </TabsContent>

            <TabsContent value="lit-review" className="space-y-4">
              <LitReviewPanel />
            </TabsContent>

            <TabsContent value="internal-data" className="space-y-4">
              <InternalClinicalDataPanel jobId={currentJobId} />
            </TabsContent>

            <TabsContent value="generated-report" className="space-y-4">
              <GeneratedReportPanel jobId={currentJobId} />
            </TabsContent>

            <TabsContent value="document-vault" className="space-y-4">
              <DocumentVaultPanel jobId={currentJobId} />
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              <CerHistoryPanel />
            </TabsContent>

            <TabsContent value="template-settings" className="space-y-4">
              <TemplateSettingsPanel />
            </TabsContent>

            <TabsContent value="approvals" className="space-y-4">
              <ApprovalsPanel />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regulatory Compliance Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-lg">EU MDR 2017/745 Compliance</h3>
              <p className="text-gray-600">
                Reports generated using this module are designed to meet the requirements of EU
                Medical Device Regulation 2017/745, including Annex XIV and related MDCG guidance
                documents.
              </p>
            </div>
            <Separator />
            <div>
              <h3 className="font-semibold text-lg">FDA Compliance</h3>
              <p className="text-gray-600">
                Templates and generation logic are aligned with FDA guidance for clinical evaluation
                and medical device reporting requirements.
              </p>
            </div>
            <Separator />
            <div>
              <h3 className="font-semibold text-lg">ISO 14155:2020 Alignment</h3>
              <p className="text-gray-600">
                The methodology used for clinical data assessment follows best practices outlined in
                ISO 14155:2020 for clinical investigations of medical devices.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
