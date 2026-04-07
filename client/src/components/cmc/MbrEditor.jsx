import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  FileEdit,
  Search,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  FileText,
  Copy,
  Download,
  Lock,
  Unlock,
  History,
  Eye,
  Layers,
  ListChecks,
  Printer,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const statusConfig = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700', icon: FileEdit },
  'in-review': { label: 'In Review', color: 'bg-blue-100 text-blue-700', icon: Eye },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  effective: { label: 'Effective', color: 'bg-emerald-100 text-emerald-700', icon: Lock },
  superseded: { label: 'Superseded', color: 'bg-yellow-100 text-yellow-700', icon: History },
  retired: { label: 'Retired', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
};

export default function MbrEditor() {
  const [activeTab, setActiveTab] = useState('records');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['cmc-mbr', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      const response = await fetch(`/api/cmc/master-batch-records?${params}`);
      if (!response.ok) throw new Error('Failed to fetch MBR data');
      return response.json();
    },
    refetchInterval: 60000,
  });

  const records = data?.records || [];
  const summary = data?.summary || { total: 0, draft: 0, approved: 0, effective: 0 };

  const filtered = records.filter((r) =>
    !searchTerm ||
    r.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.mbrNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.product?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileEdit className="h-5 w-5 text-blue-600" />
            Master Batch Record Editor
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Author, review, and manage master batch records with version control
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" /> New MBR
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Layers className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{summary.total}</div>
              <div className="text-xs text-muted-foreground">Total MBRs</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gray-50 flex items-center justify-center">
              <FileEdit className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-600">{summary.draft}</div>
              <div className="text-xs text-muted-foreground">In Draft</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{summary.approved}</div>
              <div className="text-xs text-muted-foreground">Approved</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Lock className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-600">{summary.effective}</div>
              <div className="text-xs text-muted-foreground">Effective</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs & Filters */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="records">Batch Records</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="versions">Version History</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search MBRs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-9 w-56"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All Statuses</option>
              {Object.entries(statusConfig).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                Loading batch records...
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-yellow-500" />
                Unable to load batch records. Please try again.
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No batch records found</p>
                <p className="text-sm mt-1">
                  {searchTerm ? 'Adjust your search or filters' : 'Create a new master batch record to begin'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left font-medium p-3">MBR Number</th>
                    <th className="text-left font-medium p-3">Product / Title</th>
                    <th className="text-left font-medium p-3">Version</th>
                    <th className="text-left font-medium p-3">Status</th>
                    <th className="text-left font-medium p-3">Sections</th>
                    <th className="text-left font-medium p-3">Last Modified</th>
                    <th className="text-left font-medium p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((record, idx) => {
                    const sc = statusConfig[record.status] || {};
                    return (
                      <tr key={record.id || idx} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <span className="font-mono text-xs font-medium">{record.mbrNumber || `MBR-${idx + 1}`}</span>
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{record.title || record.product || 'Untitled'}</div>
                          {record.dosageForm && (
                            <div className="text-xs text-muted-foreground">{record.dosageForm}</div>
                          )}
                        </td>
                        <td className="p-3 font-mono text-xs">v{record.version || '1.0'}</td>
                        <td className="p-3">
                          <Badge className={`text-xs ${sc.color || 'bg-gray-100'}`}>
                            {sc.label || record.status || 'N/A'}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs">{record.sectionCount || 0} sections</span>
                          </div>
                          {record.completeness !== undefined && (
                            <Progress value={record.completeness} className="h-1 mt-1 w-20" />
                          )}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {record.lastModified || '—'}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" title="Edit">
                              <FileEdit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" title="Clone">
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" title="Export">
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Tabs>

      {/* MBR Section Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            Standard MBR Sections
          </CardTitle>
          <CardDescription>Typical sections required for a complete master batch record</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {[
              'Header & Product Info',
              'Bill of Materials',
              'Equipment List',
              'Manufacturing Instructions',
              'In-Process Controls',
              'Packaging Instructions',
              'Yield Calculations',
              'Sampling Plan',
              'Signatures & Approvals',
            ].map((section) => (
              <div key={section} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{section}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
