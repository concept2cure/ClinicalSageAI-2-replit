import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function MethodsPicker({ test, onLinked }: { test: any; onLinked: () => void }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);

  async function search() {
    try {
      const r = await fetch(`/api/stability/methods?q=${encodeURIComponent(q)}`);
      setRows(await r.json());
    } catch (error) {
      console.error('Search failed:', error);
    }
  }

  async function link(method_id: string) {
    try {
      const r = await fetch(`/api/stability/tests/${test.test_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method_id }),
      });
      if (r.ok) onLinked();
      else alert('Link failed');
    } catch (error) {
      console.error('Link failed:', error);
      alert('Link failed');
    }
  }

  useEffect(() => {
    search();
  }, []);

  return (
    <div className="rounded border p-2 space-y-2">
      <div className="text-sm font-medium">Link Analytical Method — {test.name}</div>
      <div className="flex items-center gap-2">
        <Input
          className="w-72"
          placeholder="search 'Assay', 'Dissolution'…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <Button variant="outline" onClick={search}>
          Search
        </Button>
      </div>
      <div className="text-xs text-slate-600">{rows.length} methods</div>
      {rows.slice(0, 8).map(m => (
        <div key={m.method_id} className="flex items-center justify-between text-sm">
          <div>
            {m.name} — {m.status || '—'}
          </div>
          <Button variant="outline" onClick={() => link(m.method_id)}>
            Link
          </Button>
        </div>
      ))}
    </div>
  );
}
