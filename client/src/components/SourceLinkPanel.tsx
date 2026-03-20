/**
 * SourceLinkPanel
 *
 * Side panel component for viewing and managing sentence-level source citations
 * on regulatory documents. Supports viewing, adding, analyzing, and removing
 * source attributions for traceability.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SourceCitation {
  id: number;
  documentId: number;
  sectionId: number | null;
  sentenceIndex: number;
  sentenceText: string;
  sourceType: 'trial_data' | 'literature' | 'regulatory_guidance' | 'internal_data';
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string | null;
  confidence: number;
  organizationId: number;
  createdBy: number | null;
  createdAt: string;
}

interface SourceLinkPanelProps {
  documentId: number;
  onClose?: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SOURCE_TYPE_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  trial_data: { label: 'Trial Data', variant: 'default' },
  literature: { label: 'Literature', variant: 'secondary' },
  regulatory_guidance: { label: 'Regulatory', variant: 'destructive' },
  internal_data: { label: 'Internal', variant: 'outline' },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function SourceLinkPanel({ documentId, onClose }: SourceLinkPanelProps) {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    sentenceIndex: 0,
    sentenceText: '',
    sourceType: 'literature' as SourceCitation['sourceType'],
    sourceId: '',
    sourceTitle: '',
    sourceUrl: '',
    confidence: 0.8,
  });

  const queryKey = ['source-citations', documentId];

  // Fetch existing source citations
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/documents/${documentId}/sources`);
      return res.json();
    },
    enabled: !!documentId,
  });

  const sources: SourceCitation[] = data?.sources ?? [];

  // Add source mutation
  const addMutation = useMutation({
    mutationFn: async (body: typeof formData) => {
      const res = await apiRequest('POST', `/api/documents/${documentId}/sources`, {
        ...body,
        sourceUrl: body.sourceUrl || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setShowAddForm(false);
      resetForm();
    },
  });

  // Remove source mutation
  const removeMutation = useMutation({
    mutationFn: async (linkId: number) => {
      const res = await apiRequest('DELETE', `/api/documents/${documentId}/sources/${linkId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Analyze document mutation
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/documents/${documentId}/sources/analyze`, {
        autoSave: true,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  function resetForm() {
    setFormData({
      sentenceIndex: 0,
      sentenceText: '',
      sourceType: 'literature',
      sourceId: '',
      sourceTitle: '',
      sourceUrl: '',
      confidence: 0.8,
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    addMutation.mutate(formData);
  }

  // ─── Confidence indicator ──────────────────────────────────────────────────

  function ConfidenceBar({ value }: { value: number }) {
    const pct = Math.round(value * 100);
    let color = 'bg-red-500';
    if (pct >= 80) color = 'bg-green-500';
    else if (pct >= 60) color = 'bg-yellow-500';
    else if (pct >= 40) color = 'bg-orange-500';

    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{pct}%</span>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-background border-l">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h3 className="text-sm font-semibold">Source Citations</h3>
          <p className="text-xs text-muted-foreground">
            {sources.length} source{sources.length !== 1 ? 's' : ''} linked
          </p>
        </div>
        <div className="flex gap-1">
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex gap-2 px-4 py-2 border-b">
        <Button
          variant="outline"
          size="sm"
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending}
        >
          {analyzeMutation.isPending ? 'Analyzing...' : 'Auto-Analyze'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? 'Cancel' : 'Add Source'}
        </Button>
      </div>

      {/* Analysis result banner */}
      {analyzeMutation.isSuccess && analyzeMutation.data && (
        <div className="px-4 py-2 bg-green-50 border-b text-xs text-green-800">
          Analysis complete: {analyzeMutation.data.claimsFound} claim{analyzeMutation.data.claimsFound !== 1 ? 's' : ''} identified and saved.
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="px-4 py-3 border-b bg-muted/30">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label htmlFor="sentenceText" className="text-xs">Sentence Text</Label>
              <Textarea
                id="sentenceText"
                value={formData.sentenceText}
                onChange={e => setFormData(d => ({ ...d, sentenceText: e.target.value }))}
                placeholder="Paste the sentence to attribute..."
                className="text-xs mt-1"
                rows={2}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="sourceType" className="text-xs">Source Type</Label>
                <Select
                  value={formData.sourceType}
                  onValueChange={(v) => setFormData(d => ({ ...d, sourceType: v as SourceCitation['sourceType'] }))}
                >
                  <SelectTrigger className="text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial_data">Trial Data</SelectItem>
                    <SelectItem value="literature">Literature</SelectItem>
                    <SelectItem value="regulatory_guidance">Regulatory Guidance</SelectItem>
                    <SelectItem value="internal_data">Internal Data</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="sentenceIndex" className="text-xs">Sentence Index</Label>
                <Input
                  id="sentenceIndex"
                  type="number"
                  min={0}
                  value={formData.sentenceIndex}
                  onChange={e => setFormData(d => ({ ...d, sentenceIndex: parseInt(e.target.value, 10) || 0 }))}
                  className="text-xs mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="sourceTitle" className="text-xs">Source Title</Label>
              <Input
                id="sourceTitle"
                value={formData.sourceTitle}
                onChange={e => setFormData(d => ({ ...d, sourceTitle: e.target.value }))}
                placeholder="e.g. ICH E6(R2) Guideline"
                className="text-xs mt-1"
                required
              />
            </div>

            <div>
              <Label htmlFor="sourceId" className="text-xs">Source ID</Label>
              <Input
                id="sourceId"
                value={formData.sourceId}
                onChange={e => setFormData(d => ({ ...d, sourceId: e.target.value }))}
                placeholder="e.g. NCT12345678 or ISO 14971"
                className="text-xs mt-1"
                required
              />
            </div>

            <div>
              <Label htmlFor="sourceUrl" className="text-xs">Source URL (optional)</Label>
              <Input
                id="sourceUrl"
                value={formData.sourceUrl}
                onChange={e => setFormData(d => ({ ...d, sourceUrl: e.target.value }))}
                placeholder="https://..."
                className="text-xs mt-1"
              />
            </div>

            <div>
              <Label htmlFor="confidence" className="text-xs">Confidence ({Math.round(formData.confidence * 100)}%)</Label>
              <input
                id="confidence"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={formData.confidence}
                onChange={e => setFormData(d => ({ ...d, confidence: parseFloat(e.target.value) }))}
                className="w-full mt-1"
              />
            </div>

            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={addMutation.isPending}
            >
              {addMutation.isPending ? 'Saving...' : 'Save Source Link'}
            </Button>
          </form>
        </div>
      )}

      {/* Sources list */}
      <ScrollArea className="flex-1">
        {isLoading && (
          <div className="p-4 text-center text-xs text-muted-foreground">Loading sources...</div>
        )}

        {error && (
          <div className="p-4 text-center text-xs text-red-600">Failed to load sources.</div>
        )}

        {!isLoading && sources.length === 0 && (
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">No source citations yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Use "Auto-Analyze" to scan this document for claims, or add sources manually.
            </p>
          </div>
        )}

        <div className="divide-y">
          {sources.map((source) => {
            const typeConfig = SOURCE_TYPE_CONFIG[source.sourceType] || SOURCE_TYPE_CONFIG.internal_data;
            const isExpanded = expandedId === source.id;

            return (
              <div
                key={source.id}
                className="px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : source.id)}
              >
                {/* Top line: type badge + title */}
                <div className="flex items-start gap-2 mb-1">
                  <Badge variant={typeConfig.variant} className="text-[11px] shrink-0 mt-0.5">
                    {typeConfig.label}
                  </Badge>
                  <span className="text-xs font-medium leading-tight line-clamp-1">
                    {source.sourceTitle}
                  </span>
                </div>

                {/* Sentence preview */}
                <p className="text-[11px] text-muted-foreground line-clamp-2 mb-1.5">
                  "{source.sentenceText}"
                </p>

                {/* Confidence bar */}
                <ConfidenceBar value={source.confidence} />

                {/* Expanded details */}
                {isExpanded && (
                  <div className="mt-3 space-y-2">
                    <Separator />

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">Source ID:</span>
                        <span className="ml-1 font-mono">{source.sourceId}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Sentence #:</span>
                        <span className="ml-1">{source.sentenceIndex}</span>
                      </div>
                      {source.sectionId && (
                        <div>
                          <span className="text-muted-foreground">Section:</span>
                          <span className="ml-1">{source.sectionId}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Added:</span>
                        <span className="ml-1">
                          {new Date(source.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {source.sourceUrl && (
                      <a
                        href={source.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-blue-600 hover:underline block"
                        onClick={e => e.stopPropagation()}
                      >
                        View Source
                      </a>
                    )}

                    <div className="flex justify-end pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-red-600 hover:text-red-700 h-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeMutation.mutate(source.id);
                        }}
                        disabled={removeMutation.isPending}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer summary */}
      {sources.length > 0 && (
        <div className="px-4 py-2 border-t bg-muted/20">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>
              {Object.entries(
                sources.reduce<Record<string, number>>((acc, s) => {
                  acc[s.sourceType] = (acc[s.sourceType] || 0) + 1;
                  return acc;
                }, {})
              )
                .map(([type, count]) => `${SOURCE_TYPE_CONFIG[type]?.label || type}: ${count}`)
                .join(' | ')}
            </span>
            <span>
              Avg confidence:{' '}
              {Math.round(
                (sources.reduce((sum, s) => sum + s.confidence, 0) / sources.length) * 100
              )}
              %
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
