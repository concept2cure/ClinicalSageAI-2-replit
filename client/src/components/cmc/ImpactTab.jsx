import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ImpactGraphTab from './ImpactGraphTab';
import UnitSOPList from './UnitSOPList';
import DOETab from './DOETab';
import SubmissionBuilderTab from './SubmissionBuilderTab';

export default function ImpactTab({ processId }) {
  const [activeTab, setActiveTab] = useState('graph');
  const [units, setUnits] = useState([]);

  useEffect(() => {
    if (processId) {
      fetchUnits();
    }
  }, [processId]);

  const fetchUnits = async () => {
    try {
      const response = await fetch(`/api/process/processes/${processId}/units`);
      if (response.ok) {
        const data = await response.json();
        setUnits(data);
      }
    } catch (error) {
      console.error('Error fetching units:', error);
    }
  };

  return (
    <div className="p-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="impact-tabs">
        <TabsList className="grid w-full grid-cols-4" data-testid="impact-tabs-list">
          <TabsTrigger value="graph" data-testid="tab-impact-graph">
            Impact Graph
          </TabsTrigger>
          <TabsTrigger value="sops" data-testid="tab-unit-sops">
            Unit SOPs
          </TabsTrigger>
          <TabsTrigger value="doe" data-testid="tab-doe">
            DOE
          </TabsTrigger>
          <TabsTrigger value="submission" data-testid="tab-submission">
            Submission
          </TabsTrigger>
        </TabsList>

        <TabsContent value="graph" className="mt-6" data-testid="content-impact-graph">
          <ImpactGraphTab processId={processId} />
        </TabsContent>

        <TabsContent value="sops" className="mt-6" data-testid="content-unit-sops">
          <UnitSOPList units={units} onRefresh={fetchUnits} />
        </TabsContent>

        <TabsContent value="doe" className="mt-6" data-testid="content-doe">
          <DOETab processId={processId} />
        </TabsContent>

        <TabsContent value="submission" className="mt-6" data-testid="content-submission">
          <SubmissionBuilderTab processId={processId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
