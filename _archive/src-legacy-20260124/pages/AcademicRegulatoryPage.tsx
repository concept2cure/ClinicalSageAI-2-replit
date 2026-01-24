import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AcademicUploader } from '@/components/academic/AcademicUploader';
import { RegulatoryIntelligence } from '@/components/regulatory/RegulatoryIntelligence';

export default function AcademicRegulatoryPage() {
  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold tracking-tight mb-1">Academic & Regulatory Intelligence</h1>
      <p className="text-muted-foreground mb-6">
        Enhance TrialSage's knowledge with academic resources and access regulatory intelligence.
      </p>

      <Tabs defaultValue="academic" className="w-full">
        <TabsList className="w-full max-w-md mb-6">
          <TabsTrigger value="academic">Academic Resources</TabsTrigger>
          <TabsTrigger value="regulatory">Regulatory Intelligence</TabsTrigger>
        </TabsList>

        <TabsContent value="academic">
          <AcademicUploader />
        </TabsContent>

        <TabsContent value="regulatory">
          <RegulatoryIntelligence />
        </TabsContent>
      </Tabs>
    </div>
  );
}
