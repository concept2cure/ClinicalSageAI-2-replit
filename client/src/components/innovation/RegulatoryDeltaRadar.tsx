/**
 * Regulatory Delta Radar Component
 * 
 * Surfaces auto-generated change suggestions by comparing draft submissions
 * against the latest agency guidance documents.
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
import {
  AlertTriangle, CheckCircle, Clock, FileText, Radar,
  Search, Filter, RefreshCw, ExternalLink, ChevronRight,
  AlertCircle, Info, TrendingUp, Shield
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Types
interface DeltaFinding {
  id: string;
  guidanceDocumentId: string;
  guidanceTitle: string;
  section: string;
  severity: 'high' | 'medium' | 'low';
  deltaType: string;
  description: string;
  submissionExcerpt?: string;
  guidanceExcerpt?: string;
  recommendation?: string;
  status: 'new' | 'reviewed' | 'accepted' | 'dismissed';
  createdAt: string;
}

interface DeltaScan {
  id: string;
  scanType: string;
  status: 'running' | 'completed' | 'failed';
  totalFindings: number;
  highSeverity: number;
  mediumSeverity: number;
  lowSeverity: number;
  completedAt?: string;
}

interface GuidanceDocument {
  id: string;
  agency: string;
  documentType: string;
  title: string;
  version: string;
  effectiveDate: string;
  isActive: boolean;
}

interface DeltaStatistics {
  totalScans: number;
  totalFindings: number;
  resolvedFindings: number;
  avgFindingsPerScan: number;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  recentTrend: number;
}

export function RegulatoryDeltaRadar({ programId }: { programId: string }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('findings');
  const [findings, setFindings] = useState<DeltaFinding[]>([]);
  const [scans, setScans] = useState<DeltaScan[]>([]);
  const [guidance, setGuidance] = useState<GuidanceDocument[]>([]);
  const [statistics, setStatistics] = useState<DeltaStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Load data
  useEffect(() => {
    loadData();
  }, [programId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [findingsRes, statsRes, guidanceRes] = await Promise.all([
        fetch(`/api/innovation/delta-radar/scan/latest/findings?programId=${programId}`),
        fetch(`/api/innovation/delta-radar/statistics/${programId}`),
        fetch('/api/innovation/delta-radar/guidance')
      ]);

      if (findingsRes.ok) {
        const data = await findingsRes.json();
        setFindings(data.data || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStatistics(data.data);
      }
      if (guidanceRes.ok) {
        const data = await guidanceRes.json();
        setGuidance(data.data || []);
      }
    } catch (error) {
      console.error('Error loading delta radar data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load delta radar data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const runScan = async () => {
    setScanning(true);
    try {
      const response = await fetch('/api/innovation/delta-radar/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId,
          scanType: 'full'
        })
      });

      if (response.ok) {
        toast({
          title: 'Scan Started',
          description: 'Delta scan is running. Results will appear shortly.'
        });
        // Poll for results
        setTimeout(loadData, 5000);
      } else {
        throw new Error('Scan failed');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to start delta scan',
        variant: 'destructive'
      });
    } finally {
      setScanning(false);
    }
  };

  const updateFindingStatus = async (findingId: string, status: string, resolution?: string) => {
    try {
      const response = await fetch(`/api/innovation/delta-radar/findings/${findingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolution })
      });

      if (response.ok) {
        setFindings(prev => prev.map(f => 
          f.id === findingId ? { ...f, status: status as any } : f
        ));
        toast({
          title: 'Updated',
          description: 'Finding status updated successfully'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update finding',
        variant: 'destructive'
      });
    }
  };

  // Filter findings
  const filteredFindings = findings.filter(f => {
    if (searchTerm && !f.description.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (severityFilter !== 'all' && f.severity !== severityFilter) {
      return false;
    }
    if (statusFilter !== 'all' && f.status !== statusFilter) {
      return false;
    }
    return true;
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'destructive';
      case 'medium': return 'warning';
      case 'low': return 'secondary';
      default: return 'default';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high': return <AlertTriangle className="h-4 w-4" />;
      case 'medium': return <AlertCircle className="h-4 w-4" />;
      case 'low': return <Info className="h-4 w-4" />;
      default: return null;
    }
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
          <div className="p-2 rounded-lg bg-primary/10">
            <Radar className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Regulatory Delta Radar</h2>
            <p className="text-muted-foreground">
              Auto-detect guidance gaps and alignment issues
            </p>
          </div>
        </div>
        <Button onClick={runScan} disabled={scanning}>
          {scanning ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Radar className="h-4 w-4 mr-2" />
          )}
          Run Delta Scan
        </Button>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Findings</p>
                  <p className="text-3xl font-bold">{statistics.totalFindings}</p>
                </div>
                <FileText className="h-8 w-8 text-muted-foreground/20" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">High Severity</p>
                  <p className="text-3xl font-bold text-destructive">
                    {statistics.bySeverity?.high || 0}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-destructive/20" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Resolved</p>
                  <p className="text-3xl font-bold text-green-600">
                    {statistics.resolvedFindings}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600/20" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Trend</p>
                  <p className="text-3xl font-bold">
                    {statistics.recentTrend > 0 ? '+' : ''}{statistics.recentTrend}%
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-muted-foreground/20" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="findings">
            Findings ({filteredFindings.length})
          </TabsTrigger>
          <TabsTrigger value="guidance">
            Guidance Library ({guidance.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            Scan History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="findings" className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search findings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Findings List */}
          <div className="space-y-3">
            {filteredFindings.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Shield className="h-12 w-12 text-green-500 mb-4" />
                  <p className="text-lg font-medium">No Delta Findings</p>
                  <p className="text-muted-foreground">
                    Your submission aligns well with current guidance
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredFindings.map((finding) => (
                <Card key={finding.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg ${
                        finding.severity === 'high' ? 'bg-destructive/10' :
                        finding.severity === 'medium' ? 'bg-yellow-500/10' :
                        'bg-blue-500/10'
                      }`}>
                        {getSeverityIcon(finding.severity)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={getSeverityColor(finding.severity) as any}>
                            {finding.severity}
                          </Badge>
                          <Badge variant="outline">{finding.deltaType}</Badge>
                          <Badge variant={
                            finding.status === 'new' ? 'default' :
                            finding.status === 'accepted' ? 'success' as any :
                            'secondary'
                          }>
                            {finding.status}
                          </Badge>
                        </div>
                        <h4 className="font-medium">{finding.description}</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Source: {finding.guidanceTitle} - {finding.section}
                        </p>
                        {finding.recommendation && (
                          <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                            <p className="text-sm font-medium mb-1">Recommendation:</p>
                            <p className="text-sm">{finding.recommendation}</p>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateFindingStatus(finding.id, 'reviewed')}
                          >
                            Mark Reviewed
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateFindingStatus(finding.id, 'accepted')}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => updateFindingStatus(finding.id, 'dismissed')}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="guidance" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {guidance.map((doc) => (
              <Card key={doc.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <Badge variant="outline" className="mb-2">{doc.agency}</Badge>
                      <h4 className="font-medium">{doc.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        Version {doc.version} • Effective {new Date(doc.effectiveDate).toLocaleDateString()}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center py-8">
                Scan history will appear here
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default RegulatoryDeltaRadar;
