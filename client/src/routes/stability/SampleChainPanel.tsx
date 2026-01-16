import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Upload, Download, Plus, Eye } from 'lucide-react'
import { useToast } from '@/hooks/use-toast';
import InfoTip from '@/components/InfoTip';

interface ChainEntry {
  chain_id: string;
  action: string;
  actor: string;
  ts: string;
  notes?: string;
  attachment_url?: string;
}

interface SampleChainPanelProps {
  sampleId: string;
  sampleCode?: string;
}

export default function SampleChainPanel({ sampleId, sampleCode }: SampleChainPanelProps) {
  const [chain, setChain] = useState<ChainEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [newAction, setNewAction] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const loadChain = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/stability/samples/${sampleId}/chain`);
      const data = await response.json();
      setChain(data || []);
    } catch (error) {
      console.error('Error loading chain:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sampleId) loadChain();
  }, [sampleId]);

  const addChainEntry = async () => {
    if (!newAction) return;

    try {
      const response = await fetch(`/api/stability/samples/${sampleId}/chain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: newAction,
          notes: newNotes || undefined,
        }),
      });

      if (response.ok) {
        toast({ title: 'Chain Entry Added', description: `${newAction} event recorded` });
        setNewAction('');
        setNewNotes('');
        loadChain();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to add entry',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    }
  };

  const uploadAttachment = async (file: File) => {
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/stability/samples/${sampleId}/chain/upload`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        toast({ title: 'Attachment Uploaded', description: `File uploaded: ${file.name}` });
        loadChain();
      } else {
        const error = await response.json();
        toast({
          title: 'Upload Failed',
          description: error.error || 'Failed to upload',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({ title: 'Upload Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATED':
        return 'bg-blue-100 text-blue-800';
      case 'COLLECTED':
        return 'bg-green-100 text-green-800';
      case 'RECEIVED':
        return 'bg-purple-100 text-purple-800';
      case 'OPENED':
        return 'bg-orange-100 text-orange-800';
      case 'SEALED':
        return 'bg-gray-100 text-gray-800';
      case 'TRANSFERRED':
        return 'bg-yellow-100 text-yellow-800';
      case 'DISPOSED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Chain of Custody
            {sampleCode && (
              <span className="text-sm font-normal text-gray-600">({sampleCode})</span>
            )}
            <InfoTip aria-label="Chain of Custody help">
              <div className="space-y-1">
                <div>
                  Record <b>events</b> (RECEIVED/OPENED/SEALED/TRANSFERRED/DISPOSED) with
                  timestamps.
                </div>
                <div>
                  Upload <b>attachments</b> (photos, receipts, seals) to keep evidence centrally.
                </div>
                <div>
                  All entries are <b>audited</b> and linked to the sample and study.
                </div>
              </div>
            </InfoTip>
          </CardTitle>
          <Button onClick={loadChain} disabled={loading} size="sm" variant="outline">
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add New Entry */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 p-3 bg-slate-50 rounded-lg">
          <Select value={newAction} onValueChange={setNewAction}>
            <SelectTrigger>
              <SelectValue placeholder="Select action..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RECEIVED">RECEIVED</SelectItem>
              <SelectItem value="OPENED">OPENED</SelectItem>
              <SelectItem value="SEALED">SEALED</SelectItem>
              <SelectItem value="TRANSFERRED">TRANSFERRED</SelectItem>
              <SelectItem value="DISPOSED">DISPOSED</SelectItem>
              <SelectItem value="OTHER">OTHER</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Notes (optional)"
            value={newNotes}
            onChange={e => setNewNotes(e.target.value)}
            className="md:col-span-2"
          />

          <Button onClick={addChainEntry} disabled={!newAction}>
            <Plus className="w-4 h-4 mr-1" />
            Add Entry
          </Button>
        </div>

        {/* File Upload */}
        <div className="flex items-center gap-2">
          <input
            type="file"
            id="chain-upload"
            className="hidden"
            accept="image/*,.pdf,.doc,.docx"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) uploadAttachment(file);
            }}
          />
          <label htmlFor="chain-upload">
            <Button variant="outline" disabled={uploading} asChild>
              <span>
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? 'Uploading...' : 'Upload Evidence'}
              </span>
            </Button>
          </label>
        </div>

        {/* Chain Entries */}
        <div className="space-y-2">
          {chain.length === 0 ? (
            <div className="text-center py-4 text-gray-500">No chain of custody entries yet</div>
          ) : (
            chain.map(entry => (
              <div key={entry.chain_id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge className={getActionColor(entry.action)}>{entry.action}</Badge>
                    <span className="text-sm text-gray-600">
                      by {entry.actor} • {new Date(entry.ts).toLocaleString()}
                    </span>
                  </div>
                  {entry.attachment_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(entry.attachment_url, '_blank')}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View
                    </Button>
                  )}
                </div>
                {entry.notes && (
                  <div className="text-sm text-gray-700 bg-gray-50 p-2 rounded">{entry.notes}</div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
