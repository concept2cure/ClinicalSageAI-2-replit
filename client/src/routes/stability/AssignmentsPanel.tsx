import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AssignmentsPanel({ studyId }: { studyId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  async function load() {
    try {
      const r = await fetch(`/api/stability/studies/${studyId}/assignments`);
      if (r.ok) {
        setRows(await r.json());
      }
    } catch (err) {
      console.error('Failed to load assignments:', err);
    }
  }
  useEffect(() => {
    load();
  }, [studyId]);

  async function markDone(id: string) {
    try {
      const r = await fetch(`/api/stability/assignments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DONE' }),
      });
      if (r.ok) load();
    } catch (err) {
      console.error('Failed to mark done:', err);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assignments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {!rows.length ? (
          <div className="text-slate-600">None.</div>
        ) : (
          rows.map(a => (
            <div key={a.assign_id} className="rounded border p-2 flex items-center justify-between">
              <div>
                {a.role} — {a.name} ({a.email}) • due {a.due_date || '—'} • {a.status}
              </div>
              {a.status === 'OPEN' && (
                <Button variant="outline" onClick={() => markDone(a.assign_id)}>
                  Mark Done
                </Button>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
