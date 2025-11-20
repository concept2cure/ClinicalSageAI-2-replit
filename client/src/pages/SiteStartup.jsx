import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function SiteStartup({ siteId }) {
  const [site, setSite] = useState(null);
  const [items, setItems] = useState([]);
  useEffect(() => {
    load();
  }, [siteId]);
  async function load() {
    const { data } = await axios.get(`/api/startup/site/${siteId}`);
    setSite(data.site);
    setItems(data.items);
  }
  async function complete(itemId) {
    await axios.post(`/api/startup/item/${itemId}/complete`);
    load();
  }
  if (!site) return <div className="p-8">Loading site…</div>;
  const pct = items.length
    ? Math.round((items.filter(i => i.status === 'Done').length / items.length) * 100)
    : 0;
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">
        Site Startup – {site.name} ({site.country})
      </h1>
      <p className="text-sm text-gray-600">Checklist completion: {pct}%</p>
      {items.map(it => (
        <Card key={it.id} className="border flex justify-between items-center p-4 mb-2">
          <CardContent className="p-0 m-0 flex-1">{it.label}</CardContent>
          {it.status === 'Pending' ? (
            <Button size="sm" onClick={() => complete(it.id)}>
              Mark Done
            </Button>
          ) : (
            <span className="text-green-600 text-sm">✔</span>
          )}
        </Card>
      ))}
      {pct === 100 && (
        <div className="p-4 bg-green-50 text-green-700 rounded">
          Site startup complete! Ready for activation.
        </div>
      )}
    </div>
  );
}
