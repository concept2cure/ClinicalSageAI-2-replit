import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { apiRequest } from '@/lib/queryClient';

export default function DecisionsPanel({ batchId }: { batchId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const r = await apiRequest('GET', `/api/quality/batches/${batchId}/decisions`);
        const data = await r.json();
        setLogs(Array.isArray(data) ? data : []);
      } catch (e) {
        setLogs([]);
      }
    })();
  }, [batchId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Decision Logs</CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2 max-h-80 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="text-slate-600">No decisions logged yet</div>
        ) : (
          logs.map((log: any, i: number) => (
            <div key={i} className="p-2 bg-slate-50 rounded border-l-4 border-blue-500">
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium">{log.kind}</span>
                <span className="text-xs text-slate-500">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
              {log.explain && <div className="text-xs text-slate-600 mb-1">{log.explain}</div>}
              <details className="text-xs">
                <summary className="cursor-pointer text-blue-600">View details</summary>
                <pre className="mt-1 p-1 bg-slate-100 rounded text-xs overflow-x-auto">
                  Input: {JSON.stringify(log.input_json, null, 1)}
                  {'\n'}
                  Output: {JSON.stringify(log.output_json, null, 1)}
                </pre>
              </details>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
