import React from 'react';
import TrialSuccessPredictorV2 from '@/components/TrialSuccessPredictorV2';
import { Beaker, Brain, TrendingUp, BarChart3 } from 'lucide-react';

export default function TrialPredictorPage() {
  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Trial Success Predictor</h1>
        </div>
        <p className="text-muted-foreground mb-6">
          Evaluate your clinical trial design with AI-powered success prediction, CSR benchmarking,
          and strategic recommendations
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-card rounded-lg border p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <Beaker className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">ML-Powered</h3>
              <p className="text-sm text-muted-foreground">Predictive analytics</p>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">CSR Benchmarking</h3>
              <p className="text-sm text-muted-foreground">Comparative analysis</p>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">Strategic Insights</h3>
              <p className="text-sm text-muted-foreground">AI recommendations</p>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <div className="py-4">
          <TrialSuccessPredictorV2 />
        </div>
      </div>
    </div>
  );
}
