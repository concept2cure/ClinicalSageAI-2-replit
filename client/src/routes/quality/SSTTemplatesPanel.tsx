import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { TestTube, Settings, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export default function SSTTemplatesPanel() {
  const [rows, setRows] = useState<any[]>([]);
  const [test, setTest] = useState('Assay');
  const [hours, setHours] = useState('8');
  const [json, setJson] = useState(
    '{"plates":{"min":3000},"tailing":{"max":2.0},"r2":{"min":0.999}}'
  );
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      const r = await apiRequest('GET', `/api/quality/sst/templates`);
      const data = await r.json();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    }
  }

  async function save() {
    try {
      setLoading(true);
      const thr = JSON.parse(json);
      await apiRequest('POST', `/api/quality/sst/templates`, {
        test_name: test,
        valid_hours: Number(hours || 8),
        thresholds_json: thr,
      });
      load();
      setTest('');
      setJson('{"plates":{"min":3000},"tailing":{"max":2.0},"r2":{"min":0.999}}');
    } catch (e: any) {
      toast({ title: 'Save Failed', description: e.message || 'Please enter valid JSON format', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-600" />
            SST Templates & Auto-Enforcement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              placeholder="Test name (e.g., Assay)"
              value={test}
              onChange={e => setTest(e.target.value)}
            />
            <Input
              placeholder="Valid hours"
              value={hours}
              onChange={e => setHours(e.target.value)}
            />
            <Button
              onClick={save}
              disabled={loading || !test.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? 'Saving...' : 'Save Template'}
            </Button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Thresholds JSON:</label>
            <Textarea
              placeholder='{"plates":{"min":3000},"tailing":{"max":2.0},"r2":{"min":0.999}}'
              value={json}
              onChange={e => setJson(e.target.value)}
              rows={3}
              className="font-mono text-xs"
            />
            <p className="text-xs text-gray-600 mt-1">
              Define min/max limits for SST parameters. System will auto-evaluate against these
              thresholds.
            </p>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Current Templates</h4>
            {rows.length === 0 ? (
              <div className="text-center py-6 text-gray-500">
                <TestTube className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No SST templates configured</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map(row => (
                  <div key={row.tpl_id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="font-medium">{row.test_name}</h5>
                      <Badge variant="outline">{row.valid_hours}h validity</Badge>
                    </div>
                    <div className="text-xs text-gray-600">
                      <strong>Thresholds:</strong> {JSON.stringify(row.thresholds_json)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
              <div className="text-xs">
                <p className="font-medium text-amber-800 mb-1">Auto-Enforcement Active</p>
                <p className="text-amber-700">
                  When SST data is recorded, the system automatically evaluates against these
                  templates. Failed SST triggers quality alerts and blocks result entry until
                  resolved.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
