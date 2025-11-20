import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export default function PredictivePanel({ batchId }: { batchId: string }) {
  const [predictions, setPredictions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    load();
  }, [batchId]);

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/quality/batches/${batchId}/predictive/analyze`).then(r => r.json());
    setPredictions(r.predictions || []);
    setLoading(false);
  }

  async function runAnalysis() {
    setLoading(true);
    const r = await fetch(`/api/quality/batches/${batchId}/predictive/run`, { method: 'POST' });
    const d = await r.json();
    if (!r.ok) return alert(d.error || 'Analysis failed');
    await load();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Predictive Quality Analytics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between items-center">
          <span className="font-medium">ML Predictions ({predictions.length})</span>
          <Button variant="outline" onClick={runAnalysis} disabled={loading}>
            {loading ? 'Running...' : 'Run Analysis'}
          </Button>
        </div>

        <div className="space-y-3">
          {predictions.map((pred: any, i: number) => (
            <div key={i} className="p-3 bg-slate-50 rounded">
              <div className="flex justify-between items-center mb-2">
                <div className="font-medium">{pred.test_name}</div>
                <div
                  className={
                    pred.risk_level === 'HIGH'
                      ? 'text-red-600'
                      : pred.risk_level === 'MEDIUM'
                        ? 'text-orange-600'
                        : 'text-green-600'
                  }
                >
                  {pred.risk_level} RISK
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>Failure Probability</span>
                  <span>{Math.round(pred.failure_prob * 100)}%</span>
                </div>
                <Progress value={pred.failure_prob * 100} className="h-2" />
              </div>
              <div className="mt-2 text-xs text-slate-600">{pred.recommendation}</div>
            </div>
          ))}
          {predictions.length === 0 && !loading && (
            <div className="text-center py-4 text-slate-500">
              No predictions available. Run analysis to generate ML insights.
            </div>
          )}
          {loading && (
            <div className="text-center py-4 text-slate-500">Generating ML predictions...</div>
          )}
        </div>

        <div className="text-xs text-slate-600">
          Uses machine learning models trained on historical batch data to predict potential quality
          issues.
        </div>
      </CardContent>
    </Card>
  );
}
