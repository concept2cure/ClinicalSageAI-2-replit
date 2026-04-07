import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

interface SSTResult {
  created_at: string;
  pass: boolean;
  payload_json: Record<string, number>;
}

interface SSTTemplate {
  template_id: string;
  name: string;
  family: string;
}

export default function SSTPanel({ testId }: { testId: string }) {
  const [json, setJson] = useState<string>(
    '{"plates":5000,"tailing":1.2,"r2":0.9999,"rsd":1.2,"temp":37.0}'
  );
  const [latest, setLatest] = useState<SSTResult | null>(null);
  const [tpls, setTpls] = useState<SSTTemplate[]>([]);
  const [tpl, setTpl] = useState<string>('');
  const [family, setFamily] = useState<string>('');

  async function loadLatest() {
    const r = await fetch(`/api/quality/tests/${testId}/sst/latest`);
    setLatest(await r.json());
  }
  async function loadTpls() {
    const r = await fetch(
      `/api/quality/templates/sst${family ? `?family=${encodeURIComponent(family)}` : ''}`
    );
    setTpls(await r.json());
  }
  async function save(pass = true) {
    const payload = JSON.parse(json);
    const r = await fetch(`/api/quality/tests/${testId}/sst`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload_json: payload, pass }),
    });
    const d = await r.json();
    if (!r.ok) {
      toast({ title: 'SST Error', description: d.error || 'SST recording failed', variant: 'destructive' });
      return;
    }
    await loadLatest();
  }
  async function apply() {
    if (!tpl) return;
    const response = await fetch(`/api/quality/tests/${testId}/sst/apply-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: tpl }),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      toast({
        title: 'Template apply failed',
        description: errorText || `Request failed (${response.status})`,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'Template Applied', description: 'SST template applied to test successfully.' });
    loadLatest();
  }

  useEffect(() => {
    loadLatest();
  }, [testId]);
  useEffect(() => {
    loadTpls();
  }, [family]);

  const validity = useMemo(() => {
    if (!latest?.created_at) return null;
    const created = new Date(latest.created_at).getTime();
    const now = Date.now();
    const ageH = (now - created) / 3.6e6;
    // We don't know test's template here; just show timestamp
    return { ageH: Math.round(ageH * 10) / 10 };
  }, [latest]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>SST — Templates & Enforcement</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Select value={family} onValueChange={setFamily}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by family (optional)" />
            </SelectTrigger>
            <SelectContent>
              {[
                'HPLC',
                'UPLC',
                'GC',
                'LCMS',
                'UV',
                'KF',
                'PH',
                'DISSOLUTION',
                'TOC',
                'COND',
                'ENDOTOXIN',
                'MICRO',
                'IR',
                'NMR',
                'BALANCE',
              ].map(f => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tpl} onValueChange={setTpl}>
            <SelectTrigger>
              <SelectValue placeholder="Choose SST template" />
            </SelectTrigger>
            <SelectContent>
              {tpls.map((t) => (
                <SelectItem key={t.template_id} value={t.template_id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button variant="outline" onClick={apply} disabled={!tpl}>
              Apply to Test
            </Button>
          </div>
        </div>

        <div className="text-slate-600">
          Latest SST: {latest ? new Date(latest.created_at).toLocaleString() : '—'}{' '}
          {validity ? `• age ~ ${validity.ageH}h` : ''}
        </div>

        <label htmlFor="sst-json" className="sr-only">SST parameters JSON</label>
        <Textarea
          id="sst-json"
          value={json}
          onChange={e => setJson(e.target.value)}
          className="font-mono"
          rows={6}
          aria-label="SST parameters JSON"
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => save(true)}>
            Record SST (pass)
          </Button>
          <Button variant="outline" onClick={() => save(false)}>
            Record SST (fail)
          </Button>
        </div>
        <div className="text-xs text-slate-500">
          Results entry is blocked unless SST is current and meets template rules. Choose a template
          to enable rule enforcement (e.g., plates, tailing, r², %RSD, temperature window).
        </div>
      </CardContent>
    </Card>
  );
}
