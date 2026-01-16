import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Clock, Brain, Target, FileText } from 'lucide-react'

export default function ChangesBoard({ productId }: { productId: string }) {
  const [changes, setChanges] = React.useState<any[]>([]);
  const [title, setTitle] = React.useState('');
  const [scope, setScope] = React.useState('Spec');
  const [details, setDetails] = React.useState('');

  async function load() {
    const r = await fetch(`/api/reg/changes?productId=${productId}`).then(r => r.json());
    setChanges(r);
  }

  React.useEffect(() => {
    load();
  }, [productId]);

  async function create() {
    const payload = {
      product_id: productId,
      title,
      change_json: { scope, details, specAttributes: [] },
    };
    await fetch(`/api/reg/changes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setTitle('');
    setDetails('');
    load();
  }

  async function classify(changeId: string) {
    await fetch(`/api/reg/changes/${changeId}/classify`, { method: 'POST' });
    load();
  }

  async function computeImpact(changeId: string) {
    await fetch(`/api/reg/changes/${changeId}/impact`, { method: 'POST' });
    load();
  }

  async function openTasks(changeId: string) {
    await fetch(`/api/reg/changes/${changeId}/tasks`, { method: 'POST' });
    load();
  }

  const getRiskBadge = (score: number) => {
    if (score >= 70) return <Badge variant="destructive">High Risk</Badge>;
    if (score >= 40) return <Badge className="bg-orange-500">Medium Risk</Badge>;
    return <Badge className="bg-green-600">Low Risk</Badge>;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <Clock className="w-4 h-4 text-gray-500" />;
      case 'CLASSIFIED':
        return <Brain className="w-4 h-4 text-blue-500" />;
      case 'IMPACTED':
        return <Target className="w-4 h-4 text-purple-500" />;
      case 'SUBMITTED':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    }
  };

  return (
    <div className="space-y-6" data-testid="changes-board">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-semibold">Q12 Change Control</h3>
          <p className="text-gray-600">
            AI-powered regulatory change classification and impact analysis
          </p>
        </div>
      </div>

      {/* Create New Change */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            New Change Request
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Change Title</label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g., Update dissolution specification limit"
                data-testid="change-title-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Change Scope</label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger data-testid="change-scope-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Process">Process</SelectItem>
                  <SelectItem value="Spec">Specification</SelectItem>
                  <SelectItem value="Method">Analytical Method</SelectItem>
                  <SelectItem value="Stability">Stability</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Change Details</label>
            <Textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder="Describe the proposed change and rationale..."
              rows={3}
              data-testid="change-details-textarea"
            />
          </div>
          <Button onClick={create} disabled={!title} data-testid="create-change-btn">
            Create Change
          </Button>
        </CardContent>
      </Card>

      {/* Changes List */}
      <div className="grid grid-cols-1 gap-4">
        {changes.map(change => (
          <Card key={change.change_id} data-testid={`change-${change.change_id}`}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  {getStatusIcon(change.status)}
                  <div>
                    <CardTitle className="text-lg">{change.title}</CardTitle>
                    <p className="text-sm text-gray-600">
                      {change.change_json?.scope} • Created{' '}
                      {new Date(change.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline">{change.status}</Badge>
                  {change.risk_score && getRiskBadge(change.risk_score)}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Regional Classifications */}
                {change.regions_json && Object.keys(change.regions_json).length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Regional Classifications</h4>
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(change.regions_json).map(([region, data]: [string, any]) => (
                        <Badge key={region} variant="secondary">
                          {region}: {data.class}
                        </Badge>
                      ))}
                    </div>
                    {change.eta_weeks && (
                      <p className="text-sm text-gray-600 mt-2">
                        Estimated timeline: {change.eta_weeks} weeks
                      </p>
                    )}
                  </div>
                )}

                {/* Impacted Entities */}
                {change.impacted_json && change.impacted_json.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Impacted M3 Sections</h4>
                    <div className="flex gap-2 flex-wrap">
                      {change.impacted_json.map((impact: any, idx: number) => (
                        <Badge key={idx} variant="outline">
                          {impact.code} ({impact.entity})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Checklist Items */}
                {change.checklist_json && change.checklist_json.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Checklist Items</h4>
                    <div className="space-y-1">
                      {change.checklist_json.map((item: any, idx: number) => (
                        <div key={idx} className="text-sm text-gray-600">
                          • {item.title} ({item.owner})
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 flex-wrap">
                  {change.status === 'DRAFT' && (
                    <Button
                      size="sm"
                      onClick={() => classify(change.change_id)}
                      data-testid={`classify-${change.change_id}`}
                    >
                      <Brain className="w-3 h-3 mr-1" />
                      AI Classify
                    </Button>
                  )}
                  {(change.status === 'CLASSIFIED' ||
                    Object.keys(change.regions_json || {}).length > 0) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => computeImpact(change.change_id)}
                      data-testid={`impact-${change.change_id}`}
                    >
                      <Target className="w-3 h-3 mr-1" />
                      Compute Impact
                    </Button>
                  )}
                  {change.checklist_json && change.checklist_json.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openTasks(change.change_id)}
                      data-testid={`tasks-${change.change_id}`}
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Open Tasks
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {changes.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600">
              No changes created yet. Create your first change request above.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
