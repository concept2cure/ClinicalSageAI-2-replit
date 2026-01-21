import React from 'react';
import CERGenerator from '@/components/CERGenerator';

export default function SimpleCERGeneratorPage() {
  return (
    <div className="container py-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Interactive Regulatory Builder</h1>
          <p className="text-muted-foreground">
            Quickly generate regulatory evaluation reports by entering an NDC code. The system uses
            FDA FAERS data and advanced AI to create comprehensive, regulatory-compliant outputs.
          </p>
        </div>

        <CERGenerator />

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="border p-6 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold mb-2">Comprehensive Analysis</h3>
            <p className="text-sm text-muted-foreground">
              Reports include detailed adverse event analysis, patient demographics, and
              benefit-risk assessments.
            </p>
          </div>

          <div className="border p-6 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold mb-2">Real-Time FAERS Data</h3>
            <p className="text-sm text-muted-foreground">
              All reports use real-time FDA Adverse Event Reporting System data for the most current
              safety information.
            </p>
          </div>

          <div className="border p-6 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold mb-2">Regulatory Compliant</h3>
            <p className="text-sm text-muted-foreground">
              Generated reports follow regulatory guidelines and are formatted for inclusion in
              submissions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
