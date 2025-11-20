import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function GenealogyGraph({ batchId }: { batchId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  async function load() {
    const r = await fetch(`/api/quality/batches/${batchId}/genealogy`);
    setRows(await r.json());
  }
  useEffect(() => {
    load();
  }, [batchId]);

  const { nodes, edges } = useMemo(() => {
    const center = {
      id: `B:${batchId}`,
      position: { x: 300, y: 200 },
      data: { label: `Batch ${batchId.slice(0, 8)}…` },
      style: { border: '1px solid #94a3b8', padding: 6, borderRadius: 6, background: '#fff' },
    };
    const parents = rows.map((g: any, i: number) => ({
      id: `P:${g.edge_id}`,
      position: { x: 50 + (i % 4) * 150, y: 40 + Math.floor(i / 4) * 100 },
      data: {
        label: `${g.parent_type}: ${g.parent_code}${g.parent_lot ? ` (${g.parent_lot})` : ''}`,
      },
      style: { border: '1px solid #94a3b8', padding: 6, borderRadius: 6, background: '#f8fafc' },
    }));
    const es = rows.map((g: any) => ({
      id: `E:${g.edge_id}`,
      source: `P:${g.edge_id}`,
      target: `B:${batchId}`,
      label: g.qty ? `${g.qty} ${g.unit || ''}` : '',
      animated: false,
    }));
    return { nodes: [center, ...parents], edges: es };
  }, [rows, batchId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Genealogy Graph</CardTitle>
      </CardHeader>
      <CardContent style={{ height: 420 }}>
        <div className="flex items-center justify-center h-full border-2 border-dashed border-gray-300 rounded-lg">
          <div className="text-center">
            <div className="text-lg font-medium">Genealogy Visualization</div>
            <div className="text-sm text-gray-500 mt-2">
              Batch relationships and material flow visualization
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
              {rows.map((g: any, i: number) => (
                <div key={i} className="p-2 border rounded">
                  <div className="font-medium">
                    {g.parent_type}: {g.parent_code}
                  </div>
                  {g.parent_lot && <div>Lot: {g.parent_lot}</div>}
                  {g.qty && (
                    <div>
                      Qty: {g.qty} {g.unit}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
