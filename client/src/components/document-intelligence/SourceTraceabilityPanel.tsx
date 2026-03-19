/**
 * Source Traceability Panel
 *
 * Displays claim-to-source linkages for regulatory documents.
 * Connects to /api/documents/:id/sources endpoints.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Link2, Unlink, Search, RefreshCw, FileText, Shield,
  BookOpen, Database, FlaskConical, Trash2, Plus, ChevronDown, ChevronUp, Download,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Types matching server-side SourceCitation
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

const SOURCE_TYPE_CONFIG = {
  trial_data: { label: 'Clinical Trial', icon: FlaskConical, color: 'bg-blue-100 text-blue-800' },
  literature: { label: 'Literature', icon: BookOpen, color: 'bg-green-100 text-green-800' },
  regulatory_guidance: { label: 'Regulatory', icon: Shield, color: 'bg-purple-100 text-purple-800' },
  internal_data: { label: 'Internal Data', icon: Database, color: 'bg-gray-100 text-gray-800' },
};

interface SourceTraceabilityPanelProps {
  documentId: number;
  organizationId: number;
  readOnly?: boolean;
}

export default function SourceTraceabilityPanel({
  documentId,
  organizationId,
  readOnly = false,
}: SourceTraceabilityPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const queryKey = ['source-citations', documentId];

  // Fetch existing source citations
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/sources`, {
        headers: { 'x-organization-id': String(organizationId) },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load source citations');
      return res.json() as Promise<{ sources: SourceCitation[]; total: number }>;
    },
    enabled: !!documentId && !!organizationId,
  });

  // Analyze document for sources
  const analyzeMutation = useMutation({
    mutationFn: async (autoSave: boolean) => {
      const res = await fetch(`/api/documents/${documentId}/sources/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': String(organizationId),
        },
        credentials: 'include',
        body: JSON.stringify({ autoSave }),
      });
      if (!res.ok) throw new Error('Analysis failed');
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: 'Source Analysis Complete',
        description: `Found ${result.claimsFound} claims. ${result.saved ? 'All saved.' : 'Review results below.'}`,
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Analysis Failed', description: err.message, variant: 'destructive' });
    },
  });

  // Delete a source citation
  const deleteMutation = useMutation({
    mutationFn: async (linkId: number) => {
      const res = await fetch(`/api/documents/${documentId}/sources/${linkId}`, {
        method: 'DELETE',
        headers: { 'x-organization-id': String(organizationId) },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Delete failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Source Link Removed' });
    },
    onError: (err: Error) => {
      toast({ title: 'Delete Failed', description: err.message, variant: 'destructive' });
    },
  });

  const toggleRow = (id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sources = data?.sources || [];
  const traceabilityScore = sources.length > 0
    ? Math.round((sources.filter(s => s.confidence >= 0.7).length / sources.length) * 100)
    : 0;

  // Group by source type
  const byType = sources.reduce<Record<string, number>>((acc, s) => {
    acc[s.sourceType] = (acc[s.sourceType] || 0) + 1;
    return acc;
  }, {});

  // Export source citations as CSV
  const handleExportCSV = () => {
    if (!sources || sources.length === 0) return;
    const escapeCSV = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const header = ['Claim ID', 'Sentence', 'Source Type', 'Source ID', 'Source Title', 'Confidence', 'Created'];
    const rows = sources.map(s => [
      escapeCSV(s.id),
      escapeCSV(s.sentenceText),
      escapeCSV(s.sourceType),
      escapeCSV(s.sourceId),
      escapeCSV(s.sourceTitle),
      escapeCSV(Math.round(s.confidence * 100) + '%'),
      escapeCSV(s.createdAt),
    ].join(','));
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `source_traceability_doc_${documentId}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Source Traceability
            </CardTitle>
            <CardDescription>
              Claim-to-source linkages for regulatory compliance
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {sources.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
              >
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
            )}
            {!readOnly && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => analyzeMutation.mutate(false)}
                  disabled={analyzeMutation.isPending}
                >
                  <Search className="h-4 w-4 mr-1" />
                  {analyzeMutation.isPending ? 'Analyzing...' : 'Analyze'}
                </Button>
                <Button
                  size="sm"
                  onClick={() => analyzeMutation.mutate(true)}
                  disabled={analyzeMutation.isPending}
                >
                  <Search className="h-4 w-4 mr-1" />
                  Analyze & Save
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold">{sources.length}</div>
            <div className="text-xs text-muted-foreground">Total Claims</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold">{traceabilityScore}%</div>
            <div className="text-xs text-muted-foreground">High Confidence</div>
          </div>
          {Object.entries(byType).map(([type, count]) => {
            const config = SOURCE_TYPE_CONFIG[type as keyof typeof SOURCE_TYPE_CONFIG];
            return (
              <div key={type} className="text-center p-2 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-xs text-muted-foreground">{config?.label || type}</div>
              </div>
            );
          })}
        </div>

        {/* Traceability score bar */}
        {sources.length > 0 && (
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Traceability Score</span>
              <span className="font-medium">{traceabilityScore}%</span>
            </div>
            <Progress value={traceabilityScore} className="h-2" />
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            Loading source citations...
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-center py-8 text-destructive">
            Failed to load source citations. Check document access.
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && sources.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Unlink className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No source citations found.</p>
            <p className="text-sm">Click "Analyze & Save" to discover claim-to-source linkages.</p>
          </div>
        )}

        {/* Source citations table */}
        {sources.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Claim</TableHead>
                  <TableHead className="w-32">Source Type</TableHead>
                  <TableHead className="w-28">Source ID</TableHead>
                  <TableHead className="w-24 text-center">Confidence</TableHead>
                  {!readOnly && <TableHead className="w-16"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map(source => {
                  const config = SOURCE_TYPE_CONFIG[source.sourceType];
                  const Icon = config?.icon || FileText;
                  const isExpanded = expandedRows.has(source.id);
                  return (
                    <React.Fragment key={source.id}>
                      <TableRow className="cursor-pointer" onClick={() => toggleRow(source.id)}>
                        <TableCell>
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="max-w-md">
                          <span className="line-clamp-2 text-sm">{source.sentenceText}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`text-xs ${config?.color || ''}`}>
                            <Icon className="h-3 w-3 mr-1" />
                            {config?.label || source.sourceType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {source.sourceId.length > 20 ? `${source.sourceId.slice(0, 20)}...` : source.sourceId}
                          </code>
                        </TableCell>
                        <TableCell className="text-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant={source.confidence >= 0.7 ? 'default' : source.confidence >= 0.5 ? 'secondary' : 'outline'}>
                                  {Math.round(source.confidence * 100)}%
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                Confidence: {source.confidence.toFixed(2)}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        {!readOnly && (
                          <TableCell>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => e.stopPropagation()}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove Source Link?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove the traceability link between this claim and its source.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteMutation.mutate(source.id)}>
                                    Remove
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        )}
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={readOnly ? 5 : 6} className="bg-muted/30 px-8 py-3">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="font-medium text-muted-foreground">Source Title:</span>
                                <p>{source.sourceTitle}</p>
                              </div>
                              <div>
                                <span className="font-medium text-muted-foreground">Source ID:</span>
                                <p className="font-mono text-xs">{source.sourceId}</p>
                              </div>
                              <div>
                                <span className="font-medium text-muted-foreground">Sentence Index:</span>
                                <p>#{source.sentenceIndex}</p>
                              </div>
                              {source.sourceUrl && (
                                <div>
                                  <span className="font-medium text-muted-foreground">URL:</span>
                                  <p><a href={source.sourceUrl} className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">{source.sourceUrl}</a></p>
                                </div>
                              )}
                              <div className="col-span-2">
                                <span className="font-medium text-muted-foreground">Full Text:</span>
                                <p className="mt-1 text-xs leading-relaxed">{source.sentenceText}</p>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
