import React from 'react';
import { Separator } from '@/components/ui/separator';
import SmartProtocolPanel from '@/components/strategic/SmartProtocolPanel';

const SmartProtocolPage: React.FC = () => {
  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col space-y-1.5 mb-6">
        <h1 className="text-3xl font-bold">Smart Protocol Draft</h1>
        <p className="text-muted-foreground">
          Generate CSR evidence-based protocol drafts with strategic insights
        </p>
      </div>
      <Separator className="my-4" />

      <div className="my-8">
        <SmartProtocolPanel />
      </div>

      <div className="bg-muted p-4 rounded-md mt-12">
        <h2 className="text-xl font-semibold mb-2">About Smart Protocol Draft</h2>
        <p className="text-sm mb-4">
          The Smart Protocol Draft feature uses CSR intelligence to generate evidence-based protocol
          designs. Key benefits include:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-card p-3 rounded-md">
            <h3 className="font-medium mb-1">Data-Driven Design</h3>
            <p>
              Leverages real CSR data to inform protocol design decisions with historical
              benchmarks.
            </p>
          </div>
          <div className="bg-card p-3 rounded-md">
            <h3 className="font-medium mb-1">Strategic Intelligence</h3>
            <p>
              Incorporates competitive intelligence and strategic insights for optimal positioning.
            </p>
          </div>
          <div className="bg-card p-3 rounded-md">
            <h3 className="font-medium mb-1">Comprehensive Bundle</h3>
            <p>
              Generates a full bundle including protocol draft, strategic summary, and statistical
              analysis plan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmartProtocolPage;
