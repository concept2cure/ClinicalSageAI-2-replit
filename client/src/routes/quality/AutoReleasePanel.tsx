import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export default function AutoReleasePanel({ batchId }: { batchId: string }) {
  const [rules, setRules] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiRequest('GET', `/api/quality/batches/${batchId}/auto-release/status`).then(r =>
          r.json()
        );
        setStatus(r);
        setRules(r.rules || []);
      } catch { /* handled by apiRequest */ }
    })();
  }, [batchId]);

  async function enableAutoRelease() {
    try {
      await apiRequest('POST', `/api/quality/batches/${batchId}/auto-release/enable`);
      setStatus({ ...status, enabled: true });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Enable failed', variant: 'destructive' });
    }
  }

  async function trigger() {
    try {
      const r = await apiRequest('POST', `/api/quality/batches/${batchId}/auto-release/trigger`);
      const d = await r.json();
      toast({ title: `Auto-release ${d.executed ? 'Executed' : 'Skipped'}`, description: d.decision || 'N/A' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Trigger failed', variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Automated Release Decision Engine</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-3">
          <Badge variant={status?.enabled ? 'default' : 'secondary'}>
            {status?.enabled ? 'ENABLED' : 'DISABLED'}
          </Badge>
          <span className="text-stone-600">Auto-Release Status</span>
        </div>

        <div className="space-y-2">
          <div className="font-medium">Active Rules ({rules.length}):</div>
          {rules.map((rule: any, i: number) => (
            <div key={i} className="flex justify-between p-2 bg-stone-50 rounded">
              <span>{rule.name}</span>
              <Badge variant={rule.active ? 'default' : 'outline'}>
                {rule.active ? 'ACTIVE' : 'INACTIVE'}
              </Badge>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={enableAutoRelease} disabled={status?.enabled}>
            Enable Auto-Release
          </Button>
          <Button variant="outline" onClick={trigger}>
            Trigger Now
          </Button>
        </div>

        <div className="text-xs text-stone-600">
          Automated release executes when all QC tests pass specification limits and regulatory
          rules are satisfied.
        </div>
      </CardContent>
    </Card>
  );
}
