import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function PlaybooksTab({ processId }) {
  const [playbooks, setPlaybooks] = useState([]);
  const [running, setRunning] = useState(null);

  async function loadPlaybooks() {
    try {
      const r = await fetch(`/api/process/processes/${processId}/playbooks`);
      const data = await r.json();
      setPlaybooks(data);
    } catch (error) {
      console.error('Error loading playbooks:', error);
    }
  }

  useEffect(() => {
    loadPlaybooks();
  }, [processId]);

  async function runPlaybook(playbookId, dryRun) {
    setRunning(playbookId);

    try {
      const r = await fetch(
        `/api/process/processes/${processId}/playbooks/${playbookId}/run?dryRun=${dryRun ? '1' : '0'}`,
        { method: 'POST' }
      );

      const data = await r.json();

      if (!r.ok) {
        alert(data.error || 'Playbook failed');
        return;
      }

      const message =
        (dryRun ? 'Preview' : 'Applied') + ':\n' + JSON.stringify(data.summary, null, 2);
      alert(message);

      if (!dryRun) {
        location.reload();
      }
    } catch (error) {
      console.error('Error running playbook:', error);
      alert('Failed to run playbook');
    } finally {
      setRunning(null);
    }
  }

  return (
    <Card data-testid="card-playbooks">
      <CardHeader>
        <CardTitle>AI Playbooks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {playbooks.map(pb => (
          <div
            key={pb.playbook_id}
            className="rounded border p-3"
            data-testid={`playbook-${pb.playbook_id}`}
          >
            <div className="flex items-center justify-between">
              <div className="font-medium" data-testid={`text-playbook-name-${pb.playbook_id}`}>
                {pb.name}
              </div>
              <Badge variant="secondary" data-testid={`badge-actions-${pb.playbook_id}`}>
                {(pb.actions_json || []).length} actions
              </Badge>
            </div>
            <div
              className="mt-1 text-sm text-slate-600"
              data-testid={`text-playbook-description-${pb.playbook_id}`}
            >
              {pb.description || ''}
            </div>
            <div className="mt-2 flex gap-2">
              <Button
                variant="outline"
                disabled={running === pb.playbook_id}
                onClick={() => runPlaybook(pb.playbook_id, true)}
                data-testid={`button-preview-${pb.playbook_id}`}
              >
                Preview
              </Button>
              <Button
                disabled={running === pb.playbook_id}
                onClick={() => runPlaybook(pb.playbook_id, false)}
                data-testid={`button-apply-${pb.playbook_id}`}
              >
                Apply
              </Button>
            </div>
          </div>
        ))}
        {playbooks.length === 0 && (
          <div className="text-sm text-slate-500" data-testid="text-no-playbooks">
            No playbooks available.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
