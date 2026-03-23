import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

export default function AutoReleasePanel({ batchId }: { batchId: string }) {
  const [rules, setRules] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/quality/batches/${batchId}/auto-release/status`).then(r =>
        r.json()
      );
      setStatus(r);
      setRules(r.rules || []);
    })();
  }, [batchId]);

  async function enableAutoRelease() {
    const r = await fetch(`/api/quality/batches/${batchId}/auto-release/enable`, {
      method: 'POST',
    });
    const d = await r.json();
    if (!r.ok) { toast({ title: 'Error', description: d.error || 'Enable failed', variant: 'destructive' }); return; }
    setStatus({ ...status, enabled: true });
  }

  async function trigger() {
    const r = await fetch(`/api/quality/batches/${batchId}/auto-release/trigger`, {
      method: 'POST',
    });
    const d = await r.json();
    if (!r.ok) { toast({ title: 'Error', description: d.error || 'Trigger failed', variant: 'destructive' }); return; }
    toast({ title: `Auto-release ${d.executed ? 'Executed' : 'Skipped'}`, description: d.decision || 'N/A' });
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
          <span className="text-slate-600">Auto-Release Status</span>
        </div>

        <div className="space-y-2">
          <div className="font-medium">Active Rules ({rules.length}):</div>
          {rules.map((rule: any, i: number) => (
            <div key={i} className="flex justify-between p-2 bg-slate-50 rounded">
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

        <div className="text-xs text-slate-600">
          Automated release executes when all QC tests pass specification limits and regulatory
          rules are satisfied.
        </div>
      </CardContent>
    </Card>
  );
}
