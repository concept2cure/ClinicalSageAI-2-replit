import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Package,
  Search,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  QrCode,
  Barcode,
  ScanLine,
  ArrowRight,
  FileText,
  Layers,
  Shield,
  Globe,
  Box,
  Tag,
  AlertCircle,
  Settings,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const lineStatusColors = {
  running: 'bg-green-100 text-green-700',
  idle: 'bg-gray-100 text-gray-700',
  maintenance: 'bg-yellow-100 text-yellow-700',
  error: 'bg-red-100 text-red-700',
};

const complianceColors = {
  compliant: 'bg-green-100 text-green-700',
  'partial': 'bg-yellow-100 text-yellow-700',
  'non-compliant': 'bg-red-100 text-red-700',
  pending: 'bg-blue-100 text-blue-700',
};

export default function PackagingSerializationPanel() {
  const [activeTab, setActiveTab] = useState('packaging');
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['cmc-packaging'],
    queryFn: async () => {
      const response = await fetch('/api/cmc/packaging-serialization');
      if (!response.ok) throw new Error('Failed to fetch packaging data');
      return response.json();
    },
    refetchInterval: 30000,
  });

  const packagingLines = data?.packagingLines || [];
  const serialization = data?.serialization || { totalSerialized: 0, aggregated: 0, commissioned: 0, rejected: 0 };
  const complianceChecks = data?.complianceChecks || [];
  const summary = data?.summary || { activeLines: 0, totalBatches: 0, serializationRate: 0 };

  const filteredLines = packagingLines.filter((l) =>
    !searchTerm ||
    l.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.product?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredChecks = complianceChecks.filter((c) =>
    !searchTerm ||
    c.market?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.regulation?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Package className="h-5 w-5 text-purple-600" />
            Packaging &amp; Serialization
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Track packaging operations, serialization compliance, and DSCSA readiness
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" /> New Batch
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <Box className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{summary.activeLines}</div>
                <div className="text-xs text-muted-foreground">Active Lines</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <QrCode className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{serialization.totalSerialized?.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Units Serialized</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
                <Layers className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{serialization.aggregated?.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Aggregated</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{serialization.rejected}</div>
                <div className="text-xs text-muted-foreground">Rejected</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Serialization Rate */}
      {summary.serializationRate > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Overall Serialization Rate</span>
              <span className="text-sm font-bold">{summary.serializationRate}%</span>
            </div>
            <Progress value={summary.serializationRate} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="packaging">Packaging Lines</TabsTrigger>
            <TabsTrigger value="serialization">Serialization</TabsTrigger>
            <TabsTrigger value="compliance">Compliance Checks</TabsTrigger>
          </TabsList>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-9 w-56"
            />
          </div>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                Loading packaging data...
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-yellow-500" />
                Unable to load data. Please try again.
              </CardContent>
            </Card>
          ) : activeTab === 'compliance' ? (
            filteredChecks.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Shield className="h-8 w-8 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No compliance checks found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left font-medium p-3">Market</th>
                      <th className="text-left font-medium p-3">Regulation</th>
                      <th className="text-left font-medium p-3">Requirement</th>
                      <th className="text-left font-medium p-3">Status</th>
                      <th className="text-left font-medium p-3">Deadline</th>
                      <th className="text-left font-medium p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredChecks.map((check, idx) => (
                      <tr key={check.id || idx} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                            {check.market || 'N/A'}
                          </div>
                        </td>
                        <td className="p-3 font-medium">{check.regulation || 'N/A'}</td>
                        <td className="p-3 text-muted-foreground max-w-xs truncate">{check.requirement || '—'}</td>
                        <td className="p-3">
                          <Badge className={`text-xs ${complianceColors[check.status] || 'bg-gray-100'}`}>
                            {check.status || 'N/A'}
                          </Badge>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{check.deadline || '—'}</td>
                        <td className="p-3">
                          <Button variant="ghost" size="sm">
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : filteredLines.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No packaging lines found</p>
                <p className="text-sm mt-1">
                  {searchTerm ? 'Adjust your search criteria' : 'Configure packaging lines to get started'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredLines.map((line, idx) => (
                <Card key={line.id || idx} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium">{line.name || `Line ${idx + 1}`}</div>
                      <Badge className={`text-xs ${lineStatusColors[line.status] || 'bg-gray-100'}`}>
                        {line.status || 'N/A'}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mb-3">{line.product || 'No product assigned'}</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Speed:</span>{' '}
                        <span className="font-medium">{line.speed || '—'} units/hr</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Yield:</span>{' '}
                        <span className="font-medium">{line.yield || '—'}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Batch:</span>{' '}
                        <span className="font-mono">{line.currentBatch || '—'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Serialized:</span>{' '}
                        <span className="font-medium">{line.serialized?.toLocaleString() || '0'}</span>
                      </div>
                    </div>
                    {line.progress !== undefined && (
                      <div className="mt-2">
                        <Progress value={line.progress} className="h-1.5" />
                        <div className="text-xs text-right text-muted-foreground mt-0.5">{line.progress}%</div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
}
