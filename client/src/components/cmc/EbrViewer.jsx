import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
 FileSpreadsheet,
 Search,
 RefreshCw,
 AlertTriangle,
 CheckCircle2,
 Clock,
 ArrowRight,
 FileText,
 Download,
 Eye,
 Printer,
 Filter,
 Calendar,
 User,
 ClipboardCheck,
 AlertCircle,
 Timer,
 BarChart3,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const batchStatusColors = {
 'in-progress': 'bg-stone-100 text-stone-700',
 completed: 'bg-green-100 text-green-700',
 'under-review': 'bg-purple-100 text-purple-700',
 released: 'bg-emerald-100 text-emerald-700',
 rejected: 'bg-red-100 text-red-700',
 'on-hold': 'bg-yellow-100 text-yellow-700',
};

const stepStatusIcons = {
 completed: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
 'in-progress': <Clock className="h-3.5 w-3.5 text-stone-500" />,
 pending: <Clock className="h-3.5 w-3.5 text-gray-400" />,
 deviation: <AlertCircle className="h-3.5 w-3.5 text-red-500" />,
};

export default function EbrViewer() {
 const [activeTab, setActiveTab] = useState('records');
 const [searchTerm, setSearchTerm] = useState('');
 const [statusFilter, setStatusFilter] = useState('all');
 const [selectedBatch, setSelectedBatch] = useState(null);

 const { data, isLoading, error, refetch } = useQuery({
 queryKey: ['cmc-ebr', statusFilter],
 queryFn: async () => {
 const params = new URLSearchParams();
 if (statusFilter !== 'all') params.append('status', statusFilter);
 const response = await fetch(`/api/cmc/electronic-batch-records?${params}`);
 if (!response.ok) throw new Error('Failed to fetch EBR data');
 return response.json();
 },
 refetchInterval: 30000,
 });

 const { data: batchDetail } = useQuery({
 queryKey: ['cmc-ebr-detail', selectedBatch],
 queryFn: async () => {
 const response = await fetch(`/api/cmc/electronic-batch-records/${selectedBatch}`);
 if (!response.ok) throw new Error('Failed to fetch batch detail');
 return response.json();
 },
 enabled: !!selectedBatch,
 });

 const records = data?.records || [];
 const summary = data?.summary || { total: 0, inProgress: 0, completed: 0, released: 0, deviations: 0 };

 const filtered = records.filter((r) =>
 !searchTerm ||
 r.batchNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
 r.product?.toLowerCase().includes(searchTerm.toLowerCase())
 );

 return (
 <div className="space-y-4">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div>
 <h2 className="text-lg font-semibold flex items-center gap-2">
 <FileSpreadsheet className="h-5 w-5 text-teal-600" />
 Electronic Batch Record Viewer
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 View and review executed batch records with real-time status tracking
 </p>
 </div>
 <div className="flex gap-2">
 <Button variant="outline" size="sm" onClick={() => refetch()}>
 <RefreshCw className="h-4 w-4 mr-1" /> Refresh
 </Button>
 <Button variant="outline" size="sm">
 <Download className="h-4 w-4 mr-1" /> Export
 </Button>
 </div>
 </div>

 {/* Summary Cards */}
 <div className="grid grid-cols-5 gap-3">
 <Card>
 <CardContent className="p-3 text-center">
 <div className="text-2xl font-bold">{summary.total}</div>
 <div className="text-xs text-muted-foreground">Total Records</div>
 </CardContent>
 </Card>
 <Card className="border-stone-200">
 <CardContent className="p-3 text-center">
 <div className="text-2xl font-bold text-stone-600">{summary.inProgress}</div>
 <div className="text-xs text-muted-foreground">In Progress</div>
 </CardContent>
 </Card>
 <Card className="border-green-200">
 <CardContent className="p-3 text-center">
 <div className="text-2xl font-bold text-green-600">{summary.completed}</div>
 <div className="text-xs text-muted-foreground">Completed</div>
 </CardContent>
 </Card>
 <Card className="border-emerald-200">
 <CardContent className="p-3 text-center">
 <div className="text-2xl font-bold text-emerald-600">{summary.released}</div>
 <div className="text-xs text-muted-foreground">Released</div>
 </CardContent>
 </Card>
 <Card className="border-red-200">
 <CardContent className="p-3 text-center">
 <div className="text-2xl font-bold text-red-600">{summary.deviations}</div>
 <div className="text-xs text-muted-foreground">Deviations</div>
 </CardContent>
 </Card>
 </div>

 {/* Tabs */}
 <Tabs value={activeTab} onValueChange={setActiveTab}>
 <div className="flex items-center justify-between">
 <TabsList>
 <TabsTrigger value="records">Batch Records</TabsTrigger>
 <TabsTrigger value="detail" disabled={!selectedBatch}>
 Record Detail
 </TabsTrigger>
 <TabsTrigger value="review">Review Queue</TabsTrigger>
 </TabsList>
 <div className="flex gap-2">
 <div className="relative">
 <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder="Search batches..."
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
 <option value="in-progress">In Progress</option>
 <option value="completed">Completed</option>
 <option value="under-review">Under Review</option>
 <option value="released">Released</option>
 <option value="rejected">Rejected</option>
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
 ) : activeTab === 'detail' && selectedBatch ? (
 <Card>
 <CardHeader className="pb-3">
 <div className="flex items-center justify-between">
 <div>
 <CardTitle className="text-base">
 Batch: {batchDetail?.batchNumber || selectedBatch}
 </CardTitle>
 <CardDescription>{batchDetail?.product || 'Loading...'}</CardDescription>
 </div>
 <div className="flex gap-2">
 <Button variant="outline" size="sm">
 <Printer className="h-4 w-4 mr-1" /> Print
 </Button>
 <Button variant="outline" size="sm">
 <Download className="h-4 w-4 mr-1" /> Export PDF
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 {/* Batch info grid */}
 <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
 <div>
 <div className="text-xs text-muted-foreground">Start Date</div>
 <div className="font-medium">{batchDetail?.startDate || '—'}</div>
 </div>
 <div>
 <div className="text-xs text-muted-foreground">End Date</div>
 <div className="font-medium">{batchDetail?.endDate || '—'}</div>
 </div>
 <div>
 <div className="text-xs text-muted-foreground">Operator</div>
 <div className="font-medium">{batchDetail?.operator || '—'}</div>
 </div>
 <div>
 <div className="text-xs text-muted-foreground">Yield</div>
 <div className="font-medium">{batchDetail?.yield ? `${batchDetail.yield}%` : '—'}</div>
 </div>
 </div>

 {/* Steps */}
 <div className="border-t pt-3">
 <div className="text-sm font-medium mb-2">Manufacturing Steps</div>
 {batchDetail?.steps && batchDetail.steps.length > 0 ? (
 <div className="space-y-2">
 {batchDetail.steps.map((step, idx) => (
 <div key={idx} className="flex items-center gap-3 p-2 rounded-md bg-muted/30">
 {stepStatusIcons[step.status] || <Clock className="h-3.5 w-3.5 text-gray-400" />}
 <div className="flex-1">
 <div className="text-sm font-medium">{step.name || `Step ${idx + 1}`}</div>
 {step.notes && <div className="text-xs text-muted-foreground">{step.notes}</div>}
 </div>
 <div className="text-xs text-muted-foreground">{step.completedAt || ''}</div>
 </div>
 ))}
 </div>
 ) : (
 <div className="text-sm text-muted-foreground">No step data available</div>
 )}
 </div>
 </CardContent>
 </Card>
 ) : filtered.length === 0 ? (
 <Card>
 <CardContent className="p-8 text-center text-muted-foreground">
 <FileSpreadsheet className="h-8 w-8 mx-auto mb-3 text-gray-300" />
 <p className="font-medium">No batch records found</p>
 <p className="text-sm mt-1">
 {searchTerm ? 'Adjust your search or filters' : 'Batch records will appear once manufacturing begins'}
 </p>
 </CardContent>
 </Card>
 ) : (
 <div className="border rounded-lg overflow-hidden">
 <table className="w-full text-sm">
 <thead>
 <tr className="bg-muted/50 border-b">
 <th className="text-left font-medium p-3">Batch Number</th>
 <th className="text-left font-medium p-3">Product</th>
 <th className="text-left font-medium p-3">Status</th>
 <th className="text-left font-medium p-3">Progress</th>
 <th className="text-left font-medium p-3">Start Date</th>
 <th className="text-left font-medium p-3">Yield</th>
 <th className="text-left font-medium p-3">Deviations</th>
 <th className="text-left font-medium p-3">Actions</th>
 </tr>
 </thead>
 <tbody>
 {filtered.map((record, idx) => (
 <tr key={record.id || idx} className="border-t hover:bg-muted/30 transition-colors">
 <td className="p-3">
 <span className="font-mono text-xs font-medium">{record.batchNumber || `B-${idx + 1}`}</span>
 </td>
 <td className="p-3">
 <div className="font-medium">{record.product || 'N/A'}</div>
 {record.dosageForm && (
 <div className="text-xs text-muted-foreground">{record.dosageForm}</div>
 )}
 </td>
 <td className="p-3">
 <Badge className={`text-xs ${batchStatusColors[record.status] || 'bg-gray-100'}`}>
 {record.status || 'N/A'}
 </Badge>
 </td>
 <td className="p-3">
 <div className="w-20">
 <Progress value={record.progress || 0} className="h-1.5" />
 <div className="text-xs text-right text-muted-foreground mt-0.5">{record.progress || 0}%</div>
 </div>
 </td>
 <td className="p-3 text-xs text-muted-foreground">{record.startDate || '—'}</td>
 <td className="p-3 text-xs">
 {record.yield ? `${record.yield}%` : '—'}
 </td>
 <td className="p-3">
 {(record.deviationCount || 0) > 0 ? (
 <Badge variant="outline" className="text-xs bg-red-50 text-red-700">
 {record.deviationCount}
 </Badge>
 ) : (
 <span className="text-xs text-muted-foreground">0</span>
 )}
 </td>
 <td className="p-3">
 <div className="flex items-center gap-1">
 <Button
 variant="ghost"
 size="sm"
 title="View"
 onClick={() => {
 setSelectedBatch(record.id || record.batchNumber);
 setActiveTab('detail');
 }}
 >
 <Eye className="h-4 w-4" />
 </Button>
 <Button variant="ghost" size="sm" title="Download">
 <Download className="h-4 w-4" />
 </Button>
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 </Tabs>
 </div>
 );
}
