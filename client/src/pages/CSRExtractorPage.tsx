import React from 'react';
import CSRExtractorDashboard from '@/components/CSRExtractorDashboard';
import { Card, CardContent } from '@/components/ui/card';

const CSRExtractorPage: React.FC = () => {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-700 bg-clip-text text-transparent">
          CSR Intelligence Extractor
        </h1>
        <p className="text-lg text-muted-foreground mt-2">
          Extract structured data from Clinical Study Reports for intelligence-powered protocol
          planning
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <Card className="shadow-lg border-blue-100">
          <CardContent className="p-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-blue-700">About CSR Intelligence</h2>
              <p className="text-sm text-muted-foreground">
                Upload CSR documents to extract key data points, then use that intelligence to craft
                better clinical trial protocols with LumenTrialGuide's intelligence engine.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="text-blue-700 font-medium">What CSRs Provide</h3>
                <ul className="text-sm mt-2 space-y-1">
                  <li>• Protocol designs that passed regulatory review</li>
                  <li>• Real-world primary and secondary endpoint selection</li>
                  <li>• Inclusion/exclusion criteria from successful trials</li>
                  <li>• Safety data and outcome distributions</li>
                  <li>• Historical data to improve prediction accuracy</li>
                </ul>
              </div>

              <div className="bg-indigo-50 p-4 rounded-lg">
                <h3 className="text-indigo-700 font-medium">Intelligence Integration</h3>
                <ul className="text-sm mt-2 space-y-1">
                  <li>• Enhances protocol prediction models</li>
                  <li>• Powers the planning recommendation system</li>
                  <li>• Builds assistant knowledge context</li>
                  <li>• Improves regulatory assessment quality</li>
                  <li>• Drives molecule similarity analysis</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <CSRExtractorDashboard />
      </div>
    </div>
  );
};

export default CSRExtractorPage;
