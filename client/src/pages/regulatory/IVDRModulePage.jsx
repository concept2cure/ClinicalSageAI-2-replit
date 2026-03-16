/**
 * IVDR Module Page — EU IVDR 2017/746 Compliance Hub
 *
 * Routes all 4 IVDR sub-modules into a tabbed interface:
 * - Annex VIII Classifier
 * - Analytical Validation Tracker
 * - Clinical Evidence Tracker
 * - CDx Workflow
 */

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Shield, FlaskConical, BarChart3, GitBranch } from 'lucide-react';
import {
  IVDRAnnexVIIIClassifier,
  AnalyticalValidationTracker,
  ClinicalEvidenceTracker,
  CDxWorkflow,
} from '@/concept2cure/components/regulatory';

export default function IVDRModulePage() {
  const [activeTab, setActiveTab] = useState('classifier');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">EU IVDR 2017/746 Module</h1>
          <p className="text-muted-foreground mt-1">
            In Vitro Diagnostic Regulation — Classification, Validation & Evidence
          </p>
        </div>
        <Badge
          variant="outline"
          className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-medium px-3 py-1"
        >
          EU IVDR 2017/746
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl mb-6">
          <TabsTrigger value="classifier" className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Classification
          </TabsTrigger>
          <TabsTrigger value="analytical" className="flex items-center gap-1.5">
            <FlaskConical className="h-3.5 w-3.5" />
            Analytical
          </TabsTrigger>
          <TabsTrigger value="clinical" className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Clinical Evidence
          </TabsTrigger>
          <TabsTrigger value="cdx" className="flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5" />
            CDx Workflow
          </TabsTrigger>
        </TabsList>

        <TabsContent value="classifier">
          <IVDRAnnexVIIIClassifier />
        </TabsContent>
        <TabsContent value="analytical">
          <AnalyticalValidationTracker />
        </TabsContent>
        <TabsContent value="clinical">
          <ClinicalEvidenceTracker />
        </TabsContent>
        <TabsContent value="cdx">
          <CDxWorkflow />
        </TabsContent>
      </Tabs>
    </div>
  );
}
