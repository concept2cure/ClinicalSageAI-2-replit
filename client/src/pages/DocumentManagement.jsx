import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { FileText, Folders, FileCheck, Database, Layout, FileStack, Rocket } from 'lucide-react'

import CTDTemplateManager from '../components/document/CTDTemplateManager';
import ECTDSubmissionBuilder from '../components/document/ECTDSubmissionBuilder';
import FactBasedValidator from '../components/document/FactBasedValidator';

/**
 * Document Management Page
 *
 * This page provides a comprehensive interface for managing regulatory documents:
 * - Browse and create documents from CTD templates
 * - Build and validate eCTD submissions
 * - Verify document contents using fact-based validation
 */
const DocumentManagement = () => {
  const [activeTab, setActiveTab] = useState('templates');
  const [demoContent, setDemoContent] = useState(`
# Clinical Study Report for Protocol XYZ-12345

## Introduction
This clinical study was designed to evaluate the efficacy and safety of Compound ABC in patients with condition XYZ. The study was conducted according to ICH GCP guidelines.

## Study Design
This was a randomized, double-blind, placebo-controlled study with 240 participants across 15 clinical sites. Patients were randomized in a 2:1 ratio to receive either Compound ABC or placebo.

## Efficacy Results
The primary endpoint was achieved with statistical significance (p<0.001). The treatment group showed a 45% improvement compared to placebo.

## Safety Results
The most common adverse events were headache (15%), nausea (12%), and fatigue (8%). No serious adverse events were attributed to the study drug.

## Conclusions
Compound ABC demonstrated both efficacy and an acceptable safety profile in the treatment of condition XYZ. These results support further development and potential registration.
  `);

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Regulatory Document Management</h1>
          <p className="text-gray-500 mt-1">
            Create, manage, and validate regulatory documents and submissions
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">
            ICH v3.2.2 Compliant
          </Badge>
          <Badge className="bg-green-100 text-green-800 hover:bg-green-200">FDA Validated</Badge>
          <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200">AI Enhanced</Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>CTD Templates</span>
          </TabsTrigger>
          <TabsTrigger value="submissions" className="flex items-center gap-2">
            <Folders className="h-4 w-4" />
            <span>eCTD Submissions</span>
          </TabsTrigger>
          <TabsTrigger value="validation" className="flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            <span>Document Validation</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <CTDTemplateManager />
        </TabsContent>

        <TabsContent value="submissions">
          <ECTDSubmissionBuilder />
        </TabsContent>

        <TabsContent value="validation">
          <div className="space-y-8">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Fact-Based Document Validation</CardTitle>
                    <CardDescription>
                      Validate document content against factual sources to prevent hallucination
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <FactBasedValidator
                  content={demoContent}
                  documentType="Clinical Study Report"
                  ctdSection="5.3.5.1"
                  onValidated={results => console.log('Validation results:', results)}
                />
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Database className="h-5 w-5 text-blue-500" />
                    Vector Database Grounding
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    Validates document content against a comprehensive vector database of regulatory
                    documents, clinical trial reports, and scientific literature to ensure accuracy.
                  </p>
                  <Button variant="link" className="text-blue-600 p-0 h-auto mt-2 text-sm">
                    Learn more about our vector database
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Layout className="h-5 w-5 text-purple-500" />
                    Statistical Verification
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    Automatically verifies statistical claims and calculations in documents,
                    flagging any values that fall outside of expected ranges for the study type.
                  </p>
                  <Button variant="link" className="text-blue-600 p-0 h-auto mt-2 text-sm">
                    View statistical verification methods
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileStack className="h-5 w-5 text-orange-500" />
                    Regulatory Compliance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    Checks document content against relevant ICH guidelines and regulatory
                    requirements to ensure compliance with submission standards.
                  </p>
                  <Button variant="link" className="text-blue-600 p-0 h-auto mt-2 text-sm">
                    Explore regulatory compliance rules
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DocumentManagement;
