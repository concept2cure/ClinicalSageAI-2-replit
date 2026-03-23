import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

export default function ErpImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  async function upload() {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(`/api/quality/genealogy/import/erp`, { method: 'POST', body: fd });
    const d = await r.json();
    if (!r.ok) { toast({ title: 'Import Failed', description: d.error || 'ERP import failed', variant: 'destructive' }); return; }
    toast({ title: 'Import Complete', description: `Imported ${d.imported} / failed ${d.failed}` });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>ERP Genealogy Import</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <input
          type="file"
          accept=".csv,.tsv,text/csv"
          onChange={e => setFile(e.target.files?.[0] || null)}
        />
        <Button variant="outline" onClick={upload} disabled={!file}>
          Upload CSV
        </Button>
        <div className="text-xs text-slate-600">
          CSV headers: parent_type,parent_code,parent_lot,qty,unit,note,batch_lot
        </div>
      </CardContent>
    </Card>
  );
}
