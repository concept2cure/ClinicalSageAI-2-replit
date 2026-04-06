import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
 CheckCircle2,
 Clock,
 AlertTriangle,
 Search,
 RefreshCw,
 ArrowRight,
 FileText,
 Beaker,
 ShieldCheck,
 TrendingUp,
 Plus,
 Calendar,
 BarChart3,
 Target,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const phaseConfig = {
 iq: { label: 'IQ', color: 'bg-stone-100 text-stone-800' },
 oq: { label: 'OQ', color: 'bg-indigo-100 text-indigo-800' },
 pq: { label: 'PQ', color: 'bg-purple-100 text-purple-800' },
 ppq: { label: 'PPQ', color: 'bg-violet-100 text-violet-800' },
 cpv: { label: 'CPV', color: 'bg-green-100 text-green-800' },
 tmv: { label: 'TMV', color: 'bg-cyan-100 text-cyan-800' },
 csv: { label: 'CSV', color: 'bg-teal-100 text-teal-800' },
};

const statusColors = {
 planned: 'bg-gray-100 text-gray-700',
 'in-progress': 'bg-stone-100 text-stone-700',
 completed: 'bg-green-100 text-green-700',
 failed: 'bg-red-100 text-red-700',
 'on-hold': 'bg-yellow-100 text-yellow-700',
};

export default function ValidationLifecyclePanel() {
 const [activeTab, setActiveTab] = useState('overview');
 const [searchTerm, setSearchTerm] = useState('');
 const [phaseFilter, setPhaseFilter] = useState('all');

 const { data, isLoading, error, refetch } = useQuery({
 queryKey: ['cmc-validations', phaseFilter],
 queryFn: async () => {
 const params = new URLSearchParams();
 if (phaseFilter !== 'all') params.append('phase', phaseFilter);
 const response = await fetch(`/api/cmc/validations?${params}`);
 if (!response.ok) throw new Error('Failed to fetch validation data');
 return response.json();
 },
 refetchInterval: 60000,
 });

 const validations = data?.validations || [];
 const summary = data?.summary || { total: 0, completed: 0, inProgress: 0, planned: 0, failed: 0 };
 const completionRate = summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0;

 const filtered = validations.filter((v) =>
 !searchTerm ||
 v.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
 v.protocol?.toLowerCase().includes(searchTerm.toLowerCase())
 );

 return (
 <div className="space-y-4">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div>
 <h2 className="text-lg font-semibold flex items-center gap-2">
 <ShieldCheck className="h-5 w-5 text-green-600" />
 Validation Lifecycle Management
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 Process validation from PPQ through ongoing CPV monitoring
 </p>
 </div>
 <div className="flex gap-2">
 <Button variant="outline" size="sm" onClick={() => refetch()}>
 <RefreshCw className="h-4 w-4 mr-1" /> Refresh
 </Button>
 <Button size="sm">
 <Plus className="h-4 w-4 mr-1" /> New Protocol
 </Button>
 </div>
 </div>

 {/* Phase Progress Pipeline */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm">Validation Pipeline</CardTitle>
 <CardDescription>Overall validation phase progress</CardDescription>
 </CardHeader>
 <CardContent>
 <div className="flex items-center gap-1">
 {['iq', 'oq', 'pq', 'ppq', 'cpv'].map((phase, idx) => {
 const phaseData = data?.phaseProgress?.[phase] || { completed: 0, total: 0 };
 const pct = phaseData.total > 0 ? Math.round((phaseData.completed / phaseData.total) * 100) : 0;
 return (
 <React.Fragment key={phase}>
 <div className="flex-1 text-center">
 <div className={`rounded-lg p-3 ${phaseConfig[phase]?.color || 'bg-gray-100'}`}>
 <div className="text-xs font-semibold uppercase">{phaseConfig[phase]?.label}</div>
 <div className="text-lg font-bold">{pct}%</div>
 <div className="text-xs opacity-70">{phaseData.completed}/{phaseData.total}</div>
 </div>
 <Progress value={pct} className="h-1 mt-1" />
 </div>
 {idx < 4 && <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
 </React.Fragment>
 );
 })}
 </div>
 </CardContent>
 </Card>

 {/* Summary Stats */}
 <div className="grid grid-cols-4 gap-3">
 <Card>
 <CardContent className="p-3">
 <div className="flex items-center justify-between">
 <div>
 <div className="text-2xl font-bold">{summary.total}</div>
 <div className="text-xs text-muted-foreground">Total Protocols</div>
 </div>
 <FileText className="h-8 w-8 text-gray-300" />
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-3">
 <div className="flex items-center justify-between">
 <div>
 <div className="text-2xl font-bold text-green-600">{completionRate}%</div>
 <div className="text-xs text-muted-foreground">Completion Rate</div>
 </div>
 <Target className="h-8 w-8 text-green-200" />
 </div>
 <Progress value={completionRate} className="h-1.5 mt-2" />
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-3">
 <div className="flex items-center justify-between">
 <div>
 <div className="text-2xl font-bold text-stone-600">{summary.inProgress}</div>
 <div className="text-xs text-muted-foreground">In Progress</div>
 </div>
 <Clock className="h-8 w-8 text-stone-300" />
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-3">
 <div className="flex items-center justify-between">
 <div>
 <div className="text-2xl font-bold text-red-600">{summary.failed}</div>
 <div className="text-xs text-muted-foreground">Failed / On Hold</div>
 </div>
 <AlertTriangle className="h-8 w-8 text-red-200" />
 </div>
 </CardContent>
 </Card>
 </div>

 {/* Tabs */}
 <Tabs value={activeTab} onValueChange={setActiveTab}>
 <div className="flex items-center justify-between">
 <TabsList>
 <TabsTrigger value="overview">All Protocols</TabsTrigger>
 <TabsTrigger value="ppq">PPQ Stage</TabsTrigger>
 <TabsTrigger value="cpv">CPV Monitoring</TabsTrigger>
 <TabsTrigger value="equipment">Equipment Qual</TabsTrigger>
 </TabsList>
 <div className="flex gap-2">
 <div className="relative">
 <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder="Search protocols..."
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 className="pl-8 h-9 w-56"
 />
 </div>
 <select
 value={phaseFilter}
 onChange={(e) => setPhaseFilter(e.target.value)}
 className="h-9 rounded-md border border-input bg-background px-3 text-sm"
 >
 <option value="all">All Phases</option>
 {Object.entries(phaseConfig).map(([key, cfg]) => (
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
 Loading validation data...
 </CardContent>
 </Card>
 ) : error ? (
 <Card>
 <CardContent className="p-8 text-center text-muted-foreground">
 <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-yellow-500" />
 Unable to load validation data. Please try again.
 </CardContent>
 </Card>
 ) : filtered.length === 0 ? (
 <Card>
 <CardContent className="p-8 text-center text-muted-foreground">
 <Beaker className="h-8 w-8 mx-auto mb-3 text-gray-300" />
 <p className="font-medium">No validation protocols found</p>
 <p className="text-sm mt-1">
 {searchTerm ? 'Adjust your search or filters' : 'Create a new validation protocol to begin'}
 </p>
 </CardContent>
 </Card>
 ) : (
 <div className="space-y-2">
 {filtered.map((v, idx) => (
 <Card key={v.id || idx} className="hover:shadow-sm transition-shadow">
 <CardContent className="p-4">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3 flex-1 min-w-0">
 <div className={`rounded-md px-2 py-1 text-xs font-semibold ${phaseConfig[v.phase]?.color || 'bg-gray-100'}`}>
 {phaseConfig[v.phase]?.label || v.phase || 'N/A'}
 </div>
 <div className="min-w-0">
 <div className="font-medium truncate">{v.title || 'Untitled Protocol'}</div>
 <div className="text-xs text-muted-foreground">
 {v.protocol || 'No protocol ID'} {v.product ? `• ${v.product}` : ''}
 </div>
 </div>
 </div>
 <div className="flex items-center gap-3">
 {v.progress !== undefined && (
 <div className="w-24">
 <div className="text-xs text-right text-muted-foreground mb-0.5">{v.progress}%</div>
 <Progress value={v.progress} className="h-1.5" />
 </div>
 )}
 <Badge className={`text-xs ${statusColors[v.status] || 'bg-gray-100'}`}>
 {v.status || 'N/A'}
 </Badge>
 <div className="text-xs text-muted-foreground whitespace-nowrap">
 {v.targetDate || '—'}
 </div>
 <Button variant="ghost" size="sm">
 <ArrowRight className="h-4 w-4" />
 </Button>
 </div>
 </div>
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
