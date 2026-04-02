import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Microscope, AlertTriangle, CheckCircle } from 'lucide-react';
import InfoTip from '@/components/InfoTip';
import { toast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface MicrobiologyPanelProps {
  testId: string;
}

export default function MicrobiologyPanel({ testId }: MicrobiologyPanelProps) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function evaluate() {
    if (!value.trim()) return;

    try {
      setLoading(true);
      const response = await apiRequest('POST', `/api/quality/tests/${testId}/micro/evaluate`, { value });
      const data = await response.json();
      setResult(data);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to evaluate microbiology result', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card data-tour="quality.microbiology">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="flex items-center gap-2">
            <Microscope className="w-5 h-5 text-purple-600" />
            Microbiology Evaluation
          </CardTitle>
          <InfoTip>
            <div>
              Evaluate presence/absence (e.g., E. coli) or numeric limits. Rules from{' '}
              <code>qc_rules</code>.
            </div>
          </InfoTip>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            placeholder="Enter result (e.g., '150 CFU/g' or 'Absent')"
            value={value}
            onChange={e => setValue(e.target.value)}
          />
          <Button
            onClick={evaluate}
            disabled={loading || !value.trim()}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {loading ? 'Evaluating...' : 'Evaluate'}
          </Button>
          <div className="flex items-center">
            {result && (
              <Badge
                variant={result.evaluation?.pass === true ? 'default' : 'destructive'}
                className="flex items-center gap-1"
              >
                {result.evaluation?.pass === true ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <AlertTriangle className="w-3 h-3" />
                )}
                {result.evaluation?.pass === true ? 'PASS' : 'FAIL'}
              </Badge>
            )}
          </div>
        </div>

        {result && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <h4 className="font-medium mb-2">Evaluation Result</h4>
            <div className="text-sm text-gray-700">
              <p>
                <strong>Status:</strong> {result.evaluation?.pass === true ? 'PASS' : 'FAIL'}
              </p>
              <p>
                <strong>Reason:</strong> {result.evaluation?.reason}
              </p>
            </div>

            {result.evaluation?.pass === false && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
                <p className="text-sm text-red-800">
                  <strong>Alert Generated:</strong> Quality alert has been automatically created.
                  This result requires investigation and may trigger OOS procedures.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="text-xs text-gray-600 space-y-2">
          <p>
            <strong>Supported Formats:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Numeric:</strong> "150 CFU/g", "1000", "500 CFU/mL"
            </li>
            <li>
              <strong>Absence/Presence:</strong> "Absent", "Detected", "Positive", "Negative"
            </li>
          </ul>
          <p className="text-amber-600">
            <strong>Note:</strong> Evaluation rules are configured per test. Contact QA if
            microbiology rules need updating.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
