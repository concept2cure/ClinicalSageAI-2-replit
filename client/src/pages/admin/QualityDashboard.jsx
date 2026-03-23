import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';

function Stat({ label, value }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 text-center">
        <p className="text-3xl font-bold text-blue-700">{value}</p>
        <p className="text-sm text-gray-600">{label}</p>
      </CardContent>
    </Card>
  );
}
export default function QualityDashboard() {
  const [stats, setStats] = useState({});
  useEffect(() => {
    axios.get('/api/quality/dashboard').then(r => setStats(r.data));
  }, []);
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Quality Events</h1>
      <div className="grid grid-cols-2 gap-4 max-w-md">
        <Stat label="Open Deviations" value={stats.deviationsOpen ?? 0} />
        <Stat label="Open CAPAs" value={stats.capasOpen ?? 0} />
      </div>
      <Button className="mt-6" onClick={() => toast({ title: 'Open Deviation Form' })}>
        Log New Deviation
      </Button>
    </div>
  );
}
