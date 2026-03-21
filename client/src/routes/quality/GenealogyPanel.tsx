import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

export default function GenealogyPanel({ batchId }: { batchId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({
    parent_type: 'RAW',
    parent_code: '',
    parent_lot: '',
    qty: '',
    unit: 'kg',
    note: '',
  });

  async function load() {
    try {
      const r = await fetch(`/api/quality/batches/${batchId}/genealogy`);
      const data = await r.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setItems([]);
    }
  }

  async function add() {
    if (!form.parent_code) { toast({ title: 'Input Required', description: 'Parent code is required', variant: 'destructive' }); return; }
    const r = await fetch(`/api/quality/batches/${batchId}/genealogy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!r.ok) { toast({ title: 'Error', description: 'Failed to add genealogy entry', variant: 'destructive' }); return; }
    setForm({ parent_type: 'RAW', parent_code: '', parent_lot: '', qty: '', unit: 'kg', note: '' });
    load();
  }

  useEffect(() => {
    load();
  }, [batchId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lot Genealogy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={form.parent_type}
            onValueChange={v => setForm({ ...form, parent_type: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RAW">Raw Material</SelectItem>
              <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
              <SelectItem value="BULK">Bulk</SelectItem>
              <SelectItem value="PACK">Packaging</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Parent Code"
            value={form.parent_code}
            onChange={e => setForm({ ...form, parent_code: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Input
            placeholder="Parent Lot"
            value={form.parent_lot}
            onChange={e => setForm({ ...form, parent_lot: e.target.value })}
          />
          <Input
            placeholder="Qty"
            value={form.qty}
            onChange={e => setForm({ ...form, qty: e.target.value })}
          />
          <Input
            placeholder="Unit"
            value={form.unit}
            onChange={e => setForm({ ...form, unit: e.target.value })}
          />
        </div>
        <Input
          placeholder="Note"
          value={form.note}
          onChange={e => setForm({ ...form, note: e.target.value })}
        />
        <Button onClick={add}>Add Genealogy</Button>

        <div className="mt-4 space-y-1 text-sm">
          {items.map(item => (
            <div key={item.edge_id} className="p-2 bg-slate-50 rounded">
              <strong>{item.parent_type}</strong>: {item.parent_code}
              {item.parent_lot && <span> (Lot: {item.parent_lot})</span>}
              {item.qty && (
                <span>
                  {' '}
                  - {item.qty} {item.unit}
                </span>
              )}
              {item.note && <div className="text-slate-600">{item.note}</div>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
