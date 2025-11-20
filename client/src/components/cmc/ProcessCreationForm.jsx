import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Settings, Zap, FileText } from 'lucide-react';
import NewProcessWizard from './NewProcessWizard';

const ProcessCreationForm = ({ onCancel, onSuccess }) => {
  const [showWizard, setShowWizard] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState('DP');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const handleQuickCreate = async () => {
    if (!name.trim()) return;

    setCreating(true);
    try {
      const res = await fetch('/api/process/processes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': localStorage.getItem('role') || 'Admin',
          'x-reviewer': (localStorage.getItem('role') || 'Admin') === 'Viewer' ? '1' : '0',
        },
        body: JSON.stringify({ name: name.trim(), scope }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      onSuccess?.(data);
    } catch (e) {
      console.error(e);
      window.alert(`Create failed: ${e.message || e}`);
    } finally {
      setCreating(false);
    }
  };

  const handleWizardCreate = () => {
    setShowWizard(true);
  };

  if (showWizard) {
    return <NewProcessWizard onClose={() => setShowWizard(false)} onSuccess={onSuccess} />;
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Create New Process</h3>
        <p className="text-gray-600">
          Choose how you'd like to create your new manufacturing process
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Quick Create */}
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 hover:border-blue-300 transition-colors">
          <div className="text-center mb-4">
            <Settings className="h-8 w-8 mx-auto text-gray-400 mb-2" />
            <h4 className="font-medium">Quick Create</h4>
            <p className="text-sm text-gray-600">Basic process with manual setup</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Process Name</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., Tablet Manufacturing"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Scope</label>
              <select
                value={scope}
                onChange={e => setScope(e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="DP">Drug Product (DP)</option>
                <option value="DS">Drug Substance (DS)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief description..."
                rows={2}
              />
            </div>

            <Button
              onClick={handleQuickCreate}
              disabled={!name.trim() || creating}
              className="w-full"
            >
              <Settings className="h-4 w-4 mr-2" />
              {creating ? 'Creating...' : 'Quick Create'}
            </Button>
          </div>
        </div>

        {/* AI-Assisted Wizard */}
        <div className="border-2 border-dashed border-purple-200 rounded-lg p-6 hover:border-purple-300 transition-colors bg-purple-50">
          <div className="text-center mb-4">
            <Zap className="h-8 w-8 mx-auto text-purple-600 mb-2" />
            <h4 className="font-medium text-purple-800">AI-Assisted Wizard</h4>
            <p className="text-sm text-purple-600">Smart setup with AI suggestions</p>
          </div>

          <div className="space-y-3 text-sm text-purple-700">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span>Guided multi-step setup</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              <span>AI-powered process suggestions</span>
            </div>
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span>Save & resume drafts</span>
            </div>
          </div>

          <Button
            onClick={handleWizardCreate}
            className="w-full mt-4 bg-purple-600 hover:bg-purple-700"
          >
            <Zap className="h-4 w-4 mr-2" />
            Start Wizard
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
};

export default ProcessCreationForm;
