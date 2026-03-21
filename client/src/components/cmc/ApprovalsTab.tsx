import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';

export default function ApprovalsTab({ processId }: { processId: string }) {
  type ApprovalStage = 'QUAL' | 'VALIDATED';
  const [stage, setStage] = useState<ApprovalStage>('QUAL');
  const [reason, setReason] = useState('');

  async function sign() {
    const role = localStorage.getItem('role') || 'QA';
    const r = await fetch(`/api/process/processes/${processId}/approvals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': role,
        'x-user-name': 'QA User',
      },
      body: JSON.stringify({ stage, reason }),
    });

    const d = await r.json();
    if (r.ok) {
      toast({ title: 'Approval Recorded', description: 'Electronic signature has been recorded successfully.' });
      setReason('');
    } else {
      toast({ title: 'Approval Failed', description: d.error || 'Failed to record approval', variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>21 CFR Part 11 Approvals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 items-center">
          <label className="text-sm font-medium">Stage:</label>
          <select
            className="border rounded px-2 py-1"
            value={stage}
            onChange={e => setStage(e.target.value as ApprovalStage)}
          >
            <option value="QUAL">QUAL</option>
            <option value="VALIDATED">VALIDATED</option>
          </select>
          <Input
            className="w-80"
            placeholder="Reason (optional)"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
          <Button onClick={sign} variant="default">
            Sign Approval
          </Button>
        </div>
        <div className="text-xs text-slate-500 bg-blue-50 p-2 rounded">
          <strong>Note:</strong> An approval must be recorded within 24h prior to changing to the
          selected stage. This provides auditable electronic signatures for stage changes per 21 CFR
          Part 11 requirements.
        </div>
      </CardContent>
    </Card>
  );
}
