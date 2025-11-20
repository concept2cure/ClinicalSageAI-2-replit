import React from 'react';
import CERGenerator from '../components/CERGenerator';

export default function CERGeneratorPage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Clinical Evaluation Report Generator</h1>
      <p className="mb-6 text-gray-600">
        Generate comprehensive Clinical Evaluation Reports using the FDA Adverse Event Reporting
        System (FAERS) data. Enter an NDC code to analyze safety information and generate a
        regulatory-compliant narrative.
      </p>
      <CERGenerator />
    </div>
  );
}
