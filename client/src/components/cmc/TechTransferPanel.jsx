import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  ArrowRightLeft,
  Search,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  FlaskConical,
  ArrowRight,
  FileText,
  Scale,
  Milestone,
  Factory,
  Microscope,
  Target,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const scaleLabels = {
  lab: { label: 'Lab Scale', color: 'bg-blue-100 text-blue-700' },
  pilot: { label: 'Pilot Scale', color: 'bg-indigo-100 text-indigo-700' },
  'registration': { label: 'Registration', color: 'bg-purple-100 text-purple-700' },
  commercial: { label: 'Commercial', color: 'bg-green-100 text-green-700' },
};

const statusConfig = {
  planning: { label: 'Planning', color: 'bg-gray-100 text-gray-700', icon: Clock },
  active: { label: 'Active', color: 'bg-blue-100 text-blue-700', icon: ArrowRightLeft },
  'on-hold': { label: 'On Hold', color: 'bg-yellow-100 text-yellow-700', icon: AlertTriangle },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
};

export default function TechTransferPanel() {
  const [activeTab, setActiveTab] = useState('transfers');
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['cmc-tech-transfers'],
    queryFn: async () => {
      const response = await fetch('/api/cmc/tech-transfers');
      if (!response.ok) throw new Error('Failed to fetch tech transfer data');
      return response.json();
    },
    refetchInterval: 60000,
  });

  const transfers = data?.transfers || [];
  const summary = data?.summary || { active: 0, completed: 0, planned: 0, total: 0 };

  const filtered = transfers.filter((t) =>
    !searchTerm ||
    t.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.product?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
            Technology Transfer &amp; Scale-Up
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage process transfers across sites and manufacturing scales
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" /> New Transfer
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{summary.total}</div>
                <div className="text-xs text-muted-foreground">Total Transfers</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">{summary.active}</div>
                <div className="text-xs text-muted-foreground">Active</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{summary.completed}</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gray-50 flex items-center justify-center">
                <Milestone className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-600">{summary.planned}</div>
                <div className="text-xs text-muted-foreground">Planned</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="transfers">Transfer Projects</TabsTrigger>
            <TabsTrigger value="scale-up">Scale-Up Studies</TabsTrigger>
            <TabsTrigger value="comparability">Comparability</TabsTrigger>
          </TabsList>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search transfers..."
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
                Loading transfer data...
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-yellow-500" />
                Unable to load transfer data. Please try again.
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Factory className="h-8 w-8 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No tech transfers found</p>
                <p className="text-sm mt-1">
                  {searchTerm ? 'Adjust your search criteria' : 'Initiate a new technology transfer to get started'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((transfer, idx) => (
                <Card key={transfer.id || idx} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{transfer.title || 'Untitled Transfer'}</span>
                          <Badge className={`text-xs ${statusConfig[transfer.status]?.color || 'bg-gray-100'}`}>
                            {statusConfig[transfer.status]?.label || transfer.status || 'N/A'}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mb-2">
                          {transfer.product || 'No product specified'}
                        </div>

                        {/* Transfer route */}
                        <div className="flex items-center gap-2 text-sm">
                          <div className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" />
                            <span>{transfer.sendingSite || 'Source TBD'}</span>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <div className="flex items-center gap-1">
                            <Factory className="h-3.5 w-3.5" />
                            <span>{transfer.receivingSite || 'Destination TBD'}</span>
                          </div>
                        </div>

                        {/* Scale info */}
                        {transfer.scale && (
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className={`text-xs ${scaleLabels[transfer.scale]?.color || ''}`}>
                              <Scale className="h-3 w-3 mr-1" />
                              {scaleLabels[transfer.scale]?.label || transfer.scale}
                            </Badge>
                            {transfer.batchSize && (
                              <span className="text-xs text-muted-foreground">Batch: {transfer.batchSize}</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2 ml-4">
                        {transfer.progress !== undefined && (
                          <div className="w-32">
                            <div className="flex items-center justify-between text-xs mb-0.5">
                              <span className="text-muted-foreground">Progress</span>
                              <span className="font-medium">{transfer.progress}%</span>
                            </div>
                            <Progress value={transfer.progress} className="h-1.5" />
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {transfer.targetDate ? `Target: ${transfer.targetDate}` : ''}
                        </div>
                        <Button variant="outline" size="sm">
                          View Details <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </div>
                    </div>

                    {/* Milestones */}
                    {transfer.milestones && transfer.milestones.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="flex gap-4">
                          {transfer.milestones.map((m, mIdx) => (
                            <div key={mIdx} className="flex items-center gap-1.5 text-xs">
                              {m.completed ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              ) : (
                                <Clock className="h-3.5 w-3.5 text-gray-400" />
                              )}
                              <span className={m.completed ? 'text-green-700' : 'text-muted-foreground'}>
                                {m.name}
                              </span>
                            </div>
                          ))}
                        </div>
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
