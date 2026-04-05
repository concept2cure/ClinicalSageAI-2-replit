import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiRequest } from '@/lib/queryClient';

export default function KnowledgeGraphPanel() {
  const [data, setData] = useState<any>({ nodes: [], edges: [] });
  const [kind, setKind] = useState('released_oos_30d');

  async function query() {
    try {
      const r = await apiRequest('GET', `/api/quality/graph/query?kind=${encodeURIComponent(kind)}`);

      const contentType = r.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        setData({ nodes: [], edges: [], error: 'Quality graph feature not available' });
        return;
      }

      const jsonData = await r.json();
      setData(jsonData);
    } catch {
      setData({ nodes: [], edges: [], error: 'Unable to load quality graph data' });
    }
  }
  useEffect(() => {
    query();
  }, [kind]);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Knowledge Graph Query</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="released_oos_30d">Released + OOS (30d)</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={query}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        {data.error ? (
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="text-stone-600 font-medium mb-2">⚠️ Feature Not Available</div>
              <div className="text-stone-600 text-sm">{data.error}</div>
              <div className="text-xs text-stone-500 mt-2">
                Contact your administrator to enable advanced quality features
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="font-medium mb-2">Nodes ({data.nodes?.length || 0})</div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {(data.nodes || []).map((n: any, i: number) => (
                    <div key={i} className="p-1 bg-stone-50 rounded text-xs">
                      <span
                        className={
                          n.type === 'BATCH'
                            ? 'text-stone-600'
                            : n.type === 'ALERT'
                              ? 'text-stone-700'
                              : 'text-stone-700'
                        }
                      >
                        {n.type}
                      </span>
                      : {n.label}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-medium mb-2">Edges ({data.edges?.length || 0})</div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {(data.edges || []).map((e: any, i: number) => (
                    <div key={i} className="p-1 bg-stone-50 rounded text-xs">
                      {e.source} → {e.target}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="text-xs text-stone-600 pt-2 border-t">
              Knowledge graph shows relationships between batches, quality alerts, and stability
              studies.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
