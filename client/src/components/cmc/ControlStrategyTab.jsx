import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Save, Trash2, Plus } from 'lucide-react';

export default function ControlStrategyTab({ processId }) {
  const [paramName, setParam] = useState('');
  const [test, setTest] = useState('');
  const [limit, setLimit] = useState('');
  const [method, setMethod] = useState('');
  const [saving, setSaving] = useState(false);
  const [controlStrategy, setControlStrategy] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchControlStrategy();
  }, [processId]);

  const fetchControlStrategy = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/process/processes/${processId}`);
      if (response.ok) {
        const data = await response.json();
        setControlStrategy(data.control_strategy || {});
      }
    } catch (error) {
      console.error('Error fetching control strategy:', error);
    } finally {
      setLoading(false);
    }
  };

  async function save() {
    if (!paramName.trim()) return;

    setSaving(true);
    try {
      const r = await fetch(`/api/process/processes/${processId}/control-strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paramName, test, limit, methodHint: method }),
      });

      if (r.ok) {
        console.log('✅ Control strategy saved successfully');
        setParam('');
        setTest('');
        setLimit('');
        setMethod('');
        fetchControlStrategy(); // Refresh the list
      } else {
        console.error('❌ Failed to save control strategy');
        alert('Failed to save control strategy');
      }
    } catch (error) {
      console.error('Error saving control strategy:', error);
      alert('Error saving control strategy');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Add New Control */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Control Strategy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Input
              placeholder="Parameter (e.g., Inlet Temp)"
              value={paramName}
              onChange={e => setParam(e.target.value)}
            />
            <Input
              placeholder="Test (e.g., LOD)"
              value={test}
              onChange={e => setTest(e.target.value)}
            />
            <Input
              placeholder="Limit (e.g., ≤ 3.0%)"
              value={limit}
              onChange={e => setLimit(e.target.value)}
            />
            <Input
              placeholder="Method hint (e.g., AM-001)"
              value={method}
              onChange={e => setMethod(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Button
              onClick={save}
              disabled={!paramName.trim() || saving}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Add Control'}
            </Button>
            <div className="text-xs text-slate-500">
              Tip: Use the AI Advisor to auto-propose IPCs and CPV rules.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Existing Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Current Control Strategy</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">Loading control strategy...</div>
          ) : Object.keys(controlStrategy).length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-sm">No control strategy defined yet.</div>
              <div className="text-xs mt-1">
                Add parameters above to build your control strategy.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(controlStrategy).map(([param, control]) => (
                <div key={param} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900">{param}</h4>
                    <Badge variant="outline">Control</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="font-medium text-gray-600">Test:</span>{' '}
                      {control.test || 'Not specified'}
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Limit:</span>{' '}
                      {control.limit || 'Not specified'}
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Method:</span>{' '}
                      {control.methodHint || 'Not specified'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
