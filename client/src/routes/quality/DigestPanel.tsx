import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export default function DigestPanel() {
  const [result, setResult] = useState<any>(null);

  async function trigger() {
    try {
      const r = await apiRequest('GET', `/api/quality/digest/daily`);
      const d = await r.json();
      setResult(d);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Digest generation failed', variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily QC Digest</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Button variant="outline" onClick={trigger}>
          Trigger Daily Digest
        </Button>
        {result && (
          <div className="mt-4 p-3 bg-stone-50 rounded">
            <div className="font-bold">Digest Generated:</div>
            <div>Batches processed: {result.lines}</div>
            <div className="text-xs text-stone-600 mt-2">
              Notifications sent to configured Slack/Email channels
            </div>
          </div>
        )}
        <div className="text-xs text-stone-600">
          Sends QC summary with OOS alerts, pending reviews, and recent releases.
        </div>
      </CardContent>
    </Card>
  );
}
