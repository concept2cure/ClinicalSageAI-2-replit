import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function DependenciesPanel({ studyId }: { studyId: string }) {
  const [d, setD] = useState<any>(null);
  async function load() {
    try {
      const r = await fetch(`/api/stability/studies/${studyId}/dependencies`);
      if (r.ok) {
        setD(await r.json());
      }
    } catch (err) {
      console.error('[DependenciesPanel] Failed to load dependencies:', err);
    }
  }
  useEffect(() => {
    load();
  }, [studyId]);

  if (!d)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dependencies</CardTitle>
        </CardHeader>
        <CardContent>Loading…</CardContent>
      </Card>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Flow & Dependencies</CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <div>
          <b>Analytical</b>:{' '}
          {d.analytical.ok
            ? 'All methods linked'
            : 'Missing → ' + d.analytical.missingMethods.join(', ')}
        </div>
        <div>
          <b>Authoring</b>: Exports {d.authoring.exports.length}
        </div>
        <div>
          <b>Sign-offs</b>: {d.signoffs.length}
        </div>
      </CardContent>
    </Card>
  );
}
