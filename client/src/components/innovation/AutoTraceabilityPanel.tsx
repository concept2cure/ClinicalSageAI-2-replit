/**
 * Auto-Traceability Panel Component
 * 
 * Enables automatic generation of traceability links during drafting
 * without manual tagging, using semantic analysis to detect relationships.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  ArrowRight, CheckCircle, FileText, GitBranch, Link2,
  Network, RefreshCw, Search, Settings, Shield, Unlink,
  Zap, AlertTriangle, ExternalLink, ChevronRight, Link
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Types
interface TraceLink {
  id: string;
  sourceDocumentId: string;
  sourceDocumentTitle: string;
  sourceLocation?: string;
  targetDocumentId: string;
  targetDocumentTitle: string;
  targetLocation?: string;
  linkType: 'SUPPORTS' | 'DERIVES_FROM' | 'REFERENCES' | 'CONTRADICTS' | 'SUPERSEDES' | 'DEFINES' | 'VALIDATES' | 'IMPLEMENTS';
  confidenceScore: number;
  status: 'pending' | 'validated' | 'rejected' | 'auto_accepted';
  createdAt: string;
  validatedBy?: string;
  validatedAt?: string;
}

interface MatrixSnapshot {
  id: string;
  programId: string;
  documentIds: string[];
  totalLinks: number;
  linkTypeCounts: Record<string, number>;
  createdAt: string;
}

interface TraceStatistics {
  totalLinks: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  avgConfidence: number;
  documentsTracked: number;
  coveragePercentage: number;
}

const LINK_TYPE_COLORS: Record<string, string> = {
  SUPPORTS: 'bg-green-500',
  DERIVES_FROM: 'bg-blue-500',
  REFERENCES: 'bg-purple-500',
  CONTRADICTS: 'bg-red-500',
  SUPERSEDES: 'bg-orange-500',
  DEFINES: 'bg-cyan-500',
  VALIDATES: 'bg-emerald-500',
  IMPLEMENTS: 'bg-indigo-500'
};

const LINK_TYPE_DESCRIPTIONS: Record<string, string> = {
  SUPPORTS: 'Provides evidence for',
  DERIVES_FROM: 'Based on or derived from',
  REFERENCES: 'References or cites',
  CONTRADICTS: 'Conflicts with',
  SUPERSEDES: 'Replaces or updates',
  DEFINES: 'Defines or specifies',
  VALIDATES: 'Validates or confirms',
  IMPLEMENTS: 'Implements or follows'
};

export function AutoTraceabilityPanel({ programId }: { programId: string }) {
  const { toast } = useToast();
  const [links, setLinks] = useState<TraceLink[]>([]);
  const [statistics, setStatistics] = useState<TraceStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [activeTab, setActiveTab] = useState('links');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [autoDetectEnabled, setAutoDetectEnabled] = useState(true);

  // Load data
  useEffect(() => {
    loadData();
  }, [programId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [linksRes, statsRes] = await Promise.all([
        fetch(`/api/innovation/traceability/links?programId=${programId}`),
        fetch(`/api/innovation/traceability/statistics/${programId}`)
      ]);

      if (linksRes.ok) {
        const data = await linksRes.json();
        setLinks(data.data || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStatistics(data.data);
      }
    } catch (error) {
      console.error('Error loading traceability data:', error);
    } finally {
      setLoading(false);
    }
  };

  const runDetection = async () => {
    setDetecting(true);
    try {
      const response = await fetch('/api/innovation/traceability/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId })
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: 'Detection Complete',
          description: `Found ${data.data?.length || 0} new trace links`
        });
        await loadData();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to run trace detection',
        variant: 'destructive'
      });
    } finally {
      setDetecting(false);
    }
  };

  const validateLink = async (linkId: string) => {
    try {
      const response = await fetch(`/api/innovation/traceability/links/${linkId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validatedBy: 'user' })
      });

      if (response.ok) {
        setLinks(prev => prev.map(l =>
          l.id === linkId ? { ...l, status: 'validated' as const } : l
        ));
        toast({ title: 'Link Validated' });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to validate link',
        variant: 'destructive'
      });
    }
  };

  const rejectLink = async (linkId: string) => {
    setLinks(prev => prev.map(l =>
      l.id === linkId ? { ...l, status: 'rejected' as const } : l
    ));
  };

  const generateMatrix = async () => {
    try {
      const response = await fetch('/api/innovation/traceability/matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId,
          documentIds: [...new Set(links.flatMap(l => [l.sourceDocumentId, l.targetDocumentId]))],
          createdBy: 'user'
        })
      });

      if (response.ok) {
        toast({
          title: 'Matrix Generated',
          description: 'Traceability matrix snapshot created'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate matrix',
        variant: 'destructive'
      });
    }
  };

  // Filter links
  const filteredLinks = links.filter(l => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (!l.sourceDocumentTitle.toLowerCase().includes(term) &&
          !l.targetDocumentTitle.toLowerCase().includes(term)) {
        return false;
      }
    }
    if (typeFilter !== 'all' && l.linkType !== typeFilter) {
      return false;
    }
    if (statusFilter !== 'all' && l.status !== statusFilter) {
      return false;
    }
    return true;
  });

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-500';
    if (score >= 0.6) return 'text-yellow-500';
    return 'text-orange-500';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500/10 to-blue-500/10">
            <Network className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Auto-Traceability</h2>
            <p className="text-muted-foreground">
              Automatic link detection during drafting
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="auto-detect"
              checked={autoDetectEnabled}
              onCheckedChange={setAutoDetectEnabled}
            />
            <Label htmlFor="auto-detect">Auto-detect</Label>
          </div>
          <Button onClick={runDetection} disabled={detecting}>
            {detecting ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Run Detection
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <Link2 className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-3xl font-bold">{statistics.totalLinks}</p>
              <p className="text-sm text-muted-foreground">Total Links</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <FileText className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-3xl font-bold">{statistics.documentsTracked}</p>
              <p className="text-sm text-muted-foreground">Documents</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Shield className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-3xl font-bold">{statistics.byStatus?.validated || 0}</p>
              <p className="text-sm text-muted-foreground">Validated</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-3xl font-bold">{statistics.byStatus?.pending || 0}</p>
              <p className="text-sm text-muted-foreground">Pending Review</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Network className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-3xl font-bold">{statistics.coveragePercentage?.toFixed(0) || 0}%</p>
              <p className="text-sm text-muted-foreground">Coverage</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="links">
              <Link2 className="h-4 w-4 mr-2" />
              Links ({filteredLinks.length})
            </TabsTrigger>
            <TabsTrigger value="matrix">
              <GitBranch className="h-4 w-4 mr-2" />
              Matrix View
            </TabsTrigger>
            <TabsTrigger value="types">
              <Settings className="h-4 w-4 mr-2" />
              Link Types
            </TabsTrigger>
          </TabsList>

          {activeTab === 'matrix' && (
            <Button onClick={generateMatrix} variant="outline" size="sm">
              Generate Snapshot
            </Button>
          )}
        </div>

        <TabsContent value="links" className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Link Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.keys(LINK_TYPE_COLORS).map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="validated">Validated</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Links List */}
          <div className="space-y-3">
            {filteredLinks.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Network className="h-12 w-12 text-muted-foreground/20 mb-4" />
                  <p className="text-lg font-medium">No Trace Links</p>
                  <p className="text-muted-foreground">
                    Run detection to discover document relationships
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredLinks.map((link) => (
                <Card key={link.id} className={`transition-all ${
                  link.status === 'rejected' ? 'opacity-50' : ''
                }`}>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-4">
                      {/* Source */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium truncate">
                            {link.sourceDocumentTitle}
                          </span>
                        </div>
                        {link.sourceLocation && (
                          <p className="text-sm text-muted-foreground ml-6 truncate">
                            {link.sourceLocation}
                          </p>
                        )}
                      </div>

                      {/* Link Type */}
                      <div className="flex flex-col items-center gap-1 px-4">
                        <div className={`px-3 py-1 rounded-full text-xs font-medium text-white ${LINK_TYPE_COLORS[link.linkType]}`}>
                          {link.linkType}
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <span className={`text-sm font-medium ${getConfidenceColor(link.confidenceScore)}`}>
                          {(link.confidenceScore * 100).toFixed(0)}%
                        </span>
                      </div>

                      {/* Target */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium truncate">
                            {link.targetDocumentTitle}
                          </span>
                        </div>
                        {link.targetLocation && (
                          <p className="text-sm text-muted-foreground ml-6 truncate">
                            {link.targetLocation}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 ml-4">
                        {link.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => validateLink(link.id)}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Validate
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => rejectLink(link.id)}
                            >
                              <Unlink className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                        {link.status === 'validated' && (
                          <Badge variant="success" className="bg-green-500/10 text-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Validated
                          </Badge>
                        )}
                        {link.status === 'rejected' && (
                          <Badge variant="secondary">Rejected</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="matrix">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <GitBranch className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
                <p className="text-lg font-medium">Traceability Matrix</p>
                <p className="text-muted-foreground mb-4">
                  Visual matrix of all document relationships
                </p>
                <Button onClick={generateMatrix}>
                  Generate Matrix Snapshot
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="types">
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(LINK_TYPE_DESCRIPTIONS).map(([type, description]) => (
              <Card key={type}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-3 h-3 rounded-full mt-1.5 ${LINK_TYPE_COLORS[type]}`} />
                    <div>
                      <h4 className="font-medium">{type}</h4>
                      <p className="text-sm text-muted-foreground">{description}</p>
                      <p className="text-sm mt-2">
                        <span className="font-medium">
                          {statistics?.byType?.[type] || 0}
                        </span>{' '}
                        links
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AutoTraceabilityPanel;
