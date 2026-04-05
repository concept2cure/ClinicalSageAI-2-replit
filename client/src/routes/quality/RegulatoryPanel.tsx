import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export default function RegulatoryPanel({ batchId }: { batchId: string }) {
  const [compliance, setCompliance] = useState<any>(null);
  const [region, setRegion] = useState<string>('FDA');

  useEffect(() => {
    load();
  }, [batchId, region]);

  async function load() {
    try {
      const r = await apiRequest('GET', `/api/quality/batches/${batchId}/regulatory/compliance?region=${region}`);
      setCompliance(await r.json());
    } catch { setCompliance(null); }
  }

  async function generateReport() {
    try {
      const r = await apiRequest('POST', `/api/quality/batches/${batchId}/regulatory/report?region=${region}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `regulatory_report_${batchId}_${region}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Report generation failed', variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regulatory Compliance Monitor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-3">
          <span className="font-medium">Region:</span>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FDA">FDA</SelectItem>
              <SelectItem value="EMA">EMA</SelectItem>
              <SelectItem value="PMDA">PMDA</SelectItem>
              <SelectItem value="HC">Health Canada</SelectItem>
              <SelectItem value="WHO">WHO</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {compliance && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-medium">Compliance Score</span>
              <Badge
                variant={
                  compliance.score >= 95
                    ? 'default'
                    : compliance.score >= 85
                      ? 'secondary'
                      : 'destructive'
                }
              >
                {compliance.score}%
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="font-medium">Requirements ({compliance.checks?.length || 0}):</div>
              {(compliance.checks || []).map((check: any, i: number) => (
                <div key={i} className="flex justify-between items-center p-2 bg-slate-50 rounded">
                  <span>{check.requirement}</span>
                  <Badge variant={check.status === 'PASS' ? 'default' : 'destructive'}>
                    {check.status}
                  </Badge>
                </div>
              ))}
            </div>

            {compliance.warnings?.length > 0 && (
              <div className="p-2 bg-stone-100 border border-stone-200 rounded">
                <div className="font-medium text-stone-800 mb-1">Warnings:</div>
                {compliance.warnings.map((w: string, i: number) => (
                  <div key={i} className="text-xs text-stone-700">
                    • {w}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Button variant="outline" onClick={generateReport}>
          Generate Compliance Report
        </Button>

        <div className="text-xs text-slate-600">
          Real-time compliance monitoring across global regulatory requirements.
        </div>
      </CardContent>
    </Card>
  );
}
