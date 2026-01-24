import React, { useState } from 'react';
// Using shadcn components instead of MUI
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ICHComplianceChecker from '../components/cmc/ICHComplianceChecker';
import RegulatoryIntelligence from '../components/cmc/RegulatoryIntelligence';
import QualityRiskAssessment from '../components/cmc/QualityRiskAssessment';
import withAuthGuard from '../utils/withAuthGuard';

function SimpleCMCModule() {
  const [value, setValue] = useState('0');

  return (
    <div className="max-w-7xl mx-auto mt-8 mb-8">
      <Card className="p-4 flex flex-col">
        <CardHeader>
          <CardTitle className="text-3xl text-primary">CMC Compliance Assistant</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4">
            Review and ensure compliance with ICH guidelines and regulatory requirements for
            Chemistry, Manufacturing, and Controls.
          </p>

          <Tabs value={value} onValueChange={setValue}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="0">ICH Compliance</TabsTrigger>
              <TabsTrigger value="1">Regulatory Intelligence</TabsTrigger>
              <TabsTrigger value="2">Quality Risk Assessment</TabsTrigger>
            </TabsList>

            <TabsContent value="0" className="mt-6">
              <ICHComplianceChecker />
            </TabsContent>

            <TabsContent value="1" className="mt-6">
              <RegulatoryIntelligence />
            </TabsContent>

            <TabsContent value="2" className="mt-6">
              <QualityRiskAssessment />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default withAuthGuard(SimpleCMCModule);
