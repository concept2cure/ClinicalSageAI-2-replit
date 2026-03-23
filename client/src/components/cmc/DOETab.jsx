import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Download, Calculator, TrendingUp } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function DOETab({ processId }) {
  const [factors, setFactors] = useState('');
  const [generating, setGenerating] = useState(false);

  const downloadTemplate = async () => {
    if (!factors.trim()) {
      toast({ title: 'Please enter factors (comma-separated)' });
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch(
        `/api/process/processes/${processId}/doe/template?factors=${encodeURIComponent(factors)}`,
        { method: 'GET' }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `doe_template_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const error = await response.json();
        toast({ title: error.error || 'Failed to generate template' });
      }
    } catch (error) {
      console.error('Error downloading DOE template:', error);
      toast({ title: 'Failed to download template' });
    } finally {
      setGenerating(false);
    }
  };

  const exampleFactors = [
    'Inlet Temp, Blend Time, Pressure',
    'Feed Rate, Temperature, pH',
    'Compression Force, Dwell Time',
  ];

  return (
    <div className="space-y-6">
      <Card data-testid="card-doe-setup">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Design of Experiments (DOE)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              Process Factors (comma-separated)
            </label>
            <Input
              placeholder="e.g., Inlet Temp, Blend Time, Pressure"
              value={factors}
              onChange={e => setFactors(e.target.value)}
              className="mb-2"
              data-testid="input-doe-factors"
            />
            <div className="text-xs text-slate-500">
              Enter the process parameters you want to study in your DOE
            </div>
          </div>

          <Button
            onClick={downloadTemplate}
            disabled={generating || !factors.trim()}
            data-testid="button-download-template"
          >
            {generating ? (
              'Generating...'
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download DOE Template
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card data-testid="card-doe-examples">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            DOE Workflow
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="font-medium text-sm mb-1">1. Generate Template</div>
              <div className="text-xs text-slate-600">
                Download coded DOE template (±1 levels) for your factors
              </div>
            </div>
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="font-medium text-sm mb-1">2. Run Experiments</div>
              <div className="text-xs text-slate-600">
                Execute experiments and record response data in the CSV
              </div>
            </div>
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <div className="font-medium text-sm mb-1">3. Analyze Results</div>
              <div className="text-xs text-slate-600">
                Fit model to identify significant factors and interactions
              </div>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Example Factor Sets:</div>
            <div className="space-y-1">
              {exampleFactors.map((example, i) => (
                <button
                  key={i}
                  onClick={() => setFactors(example)}
                  className="text-xs text-blue-600 hover:underline block"
                  data-testid={`button-example-${i}`}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="text-sm font-medium mb-2">DOE Benefits:</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[
                'Identifies critical process parameters',
                'Optimizes process conditions',
                'Reduces development time',
                'Supports regulatory submissions',
              ].map((benefit, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-xs">
                    ✓
                  </Badge>
                  {benefit}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
