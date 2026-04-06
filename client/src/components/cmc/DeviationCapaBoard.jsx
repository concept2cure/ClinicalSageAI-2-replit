import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
 AlertTriangle,
 Search,
 Plus,
 Filter,
 Clock,
 CheckCircle2,
 XCircle,
 AlertOctagon,
 FileText,
 ArrowRight,
 RefreshCw,
 ShieldAlert,
 ClipboardList,
 RotateCcw,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const statusColors = {
 open: 'bg-red-100 text-red-800',
 'in-progress': 'bg-yellow-100 text-yellow-800',
 'under-review': 'bg-stone-100 text-stone-800',
 closed: 'bg-green-100 text-green-800',
 pending: 'bg-orange-100 text-orange-800',
};

const priorityColors = {
 critical: 'bg-red-600 text-white',
 major: 'bg-orange-500 text-white',
 minor: 'bg-yellow-500 text-white',
 low: 'bg-gray-400 text-white',
};

const typeIcons = {
 deviation: <AlertTriangle className="h-4 w-4" />,
 investigation: <Search className="h-4 w-4" />,
 capa: <ShieldAlert className="h-4 w-4" />,
 'change-control': <ClipboardList className="h-4 w-4" />,
};

export default function DeviationCapaBoard() {
 const [activeTab, setActiveTab] = useState('all');
 const [searchTerm, setSearchTerm] = useState('');
 const [statusFilter, setStatusFilter] = useState('all');

 const { data, isLoading, error, refetch } = useQuery({
 queryKey: ['cmc-deviations', activeTab, statusFilter],
 queryFn: async () => {
 const params = new URLSearchParams();
 if (activeTab !== 'all') params.append('type', activeTab);
 if (statusFilter !== 'all') params.append('status', statusFilter);
 const response = await fetch(`/api/cmc/deviations?${params}`);
 if (!response.ok) throw new Error('Failed to fetch deviations');
 return response.json();
 },
 refetchInterval: 30000,
 });

 const records = data?.records || [];
 const summary = data?.summary || { open: 0, inProgress: 0, closed: 0, overdue: 0 };

 const filteredRecords = records.filter((r) =>
 !searchTerm ||
 r.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
 r.id?.toLowerCase().includes(searchTerm.toLowerCase())
 );

 return (
 <div className="space-y-4">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div>
 <h2 className="text-lg font-semibold flex items-center gap-2">
 <AlertOctagon className="h-5 w-5 text-red-600" />
 Deviations, Investigations, CAPA &amp; Change Control
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 Track quality events from identification through resolution
 </p>
 </div>
 <div className="flex gap-2">
 <Button variant="outline" size="sm" onClick={() => refetch()}>
 <RefreshCw className="h-4 w-4 mr-1" /> Refresh
 </Button>
 <Button size="sm">
 <Plus className="h-4 w-4 mr-1" /> New Record
 </Button>
 </div>
 </div>

 {/* Summary Cards */}
 <div className="grid grid-cols-4 gap-3">
 <Card className="border-red-200">
 <CardContent className="p-3 text-center">
 <div className="text-2xl font-bold text-red-600">{summary.open}</div>
 <div className="text-xs text-muted-foreground">Open</div>
 </CardContent>
 </Card>
 <Card className="border-yellow-200">
 <CardContent className="p-3 text-center">
 <div className="text-2xl font-bold text-yellow-600">{summary.inProgress}</div>
 <div className="text-xs text-muted-foreground">In Progress</div>
 </CardContent>
 </Card>
 <Card className="border-green-200">
 <CardContent className="p-3 text-center">
 <div className="text-2xl font-bold text-green-600">{summary.closed}</div>
 <div className="text-xs text-muted-foreground">Closed</div>
 </CardContent>
 </Card>
 <Card className="border-orange-200">
 <CardContent className="p-3 text-center">
 <div className="text-2xl font-bold text-orange-600">{summary.overdue}</div>
 <div className="text-xs text-muted-foreground">Overdue</div>
 </CardContent>
 </Card>
 </div>

 {/* Tabs and Filters */}
 <Tabs value={activeTab} onValueChange={setActiveTab}>
 <div className="flex items-center justify-between">
 <TabsList>
 <TabsTrigger value="all">All Records</TabsTrigger>
 <TabsTrigger value="deviation">Deviations</TabsTrigger>
 <TabsTrigger value="investigation">Investigations</TabsTrigger>
 <TabsTrigger value="capa">CAPA</TabsTrigger>
 <TabsTrigger value="change-control">Change Control</TabsTrigger>
 </TabsList>
 <div className="flex gap-2">
 <div className="relative">
 <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder="Search records..."
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 className="pl-8 h-9 w-64"
 />
 </div>
 <select
 value={statusFilter}
 onChange={(e) => setStatusFilter(e.target.value)}
 className="h-9 rounded-md border border-input bg-background px-3 text-sm"
 >
 <option value="all">All Statuses</option>
 <option value="open">Open</option>
 <option value="in-progress">In Progress</option>
 <option value="under-review">Under Review</option>
 <option value="closed">Closed</option>
 </select>
 </div>
 </div>

 {/* Content */}
 <div className="mt-4">
 {isLoading ? (
 <Card>
 <CardContent className="p-8 text-center text-muted-foreground">
 <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
 Loading records...
 </CardContent>
 </Card>
 ) : error ? (
 <Card>
 <CardContent className="p-8 text-center text-muted-foreground">
 <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-yellow-500" />
 Unable to load records. Please try again.
 </CardContent>
 </Card>
 ) : filteredRecords.length === 0 ? (
 <Card>
 <CardContent className="p-8 text-center text-muted-foreground">
 <FileText className="h-8 w-8 mx-auto mb-3 text-gray-300" />
 <p className="font-medium">No records found</p>
 <p className="text-sm mt-1">
 {searchTerm ? 'Try adjusting your search criteria' : 'Create a new record to get started'}
 </p>
 </CardContent>
 </Card>
 ) : (
 <div className="border rounded-lg overflow-hidden">
 <table className="w-full text-sm">
 <thead>
 <tr className="bg-muted/50 border-b">
 <th className="text-left font-medium p-3">ID</th>
 <th className="text-left font-medium p-3">Type</th>
 <th className="text-left font-medium p-3">Title</th>
 <th className="text-left font-medium p-3">Priority</th>
 <th className="text-left font-medium p-3">Status</th>
 <th className="text-left font-medium p-3">Assigned To</th>
 <th className="text-left font-medium p-3">Due Date</th>
 <th className="text-left font-medium p-3">Actions</th>
 </tr>
 </thead>
 <tbody>
 {filteredRecords.map((record, idx) => (
 <tr key={record.id || idx} className="border-t hover:bg-muted/30 transition-colors">
 <td className="p-3 font-mono text-xs">{record.id || `REC-${idx + 1}`}</td>
 <td className="p-3">
 <span className="flex items-center gap-1.5 capitalize">
 {typeIcons[record.type] || <FileText className="h-4 w-4" />}
 {record.type || 'N/A'}
 </span>
 </td>
 <td className="p-3 max-w-xs truncate">{record.title || 'Untitled'}</td>
 <td className="p-3">
 <Badge className={`text-xs ${priorityColors[record.priority] || 'bg-gray-200 text-gray-700'}`}>
 {record.priority || 'N/A'}
 </Badge>
 </td>
 <td className="p-3">
 <Badge variant="outline" className={`text-xs ${statusColors[record.status] || ''}`}>
 {record.status || 'N/A'}
 </Badge>
 </td>
 <td className="p-3 text-muted-foreground">{record.assignee || 'Unassigned'}</td>
 <td className="p-3 text-muted-foreground">{record.dueDate || '—'}</td>
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
 )}
 </div>
 </Tabs>

 {/* CAPA Effectiveness Tracking */}
 <Card>
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <RotateCcw className="h-4 w-4" />
 CAPA Effectiveness Tracking
 </CardTitle>
 <CardDescription>Monitor closure rates and recurrence prevention</CardDescription>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-3 gap-4">
 <div>
 <div className="text-xs text-muted-foreground mb-1">Avg Time to Close (days)</div>
 <div className="text-xl font-semibold">{data?.metrics?.avgCloseTime || '—'}</div>
 </div>
 <div>
 <div className="text-xs text-muted-foreground mb-1">Effectiveness Rate</div>
 <div className="text-xl font-semibold">{data?.metrics?.effectivenessRate ? `${data.metrics.effectivenessRate}%` : '—'}</div>
 {data?.metrics?.effectivenessRate && (
 <Progress value={data.metrics.effectivenessRate} className="h-1.5 mt-1" />
 )}
 </div>
 <div>
 <div className="text-xs text-muted-foreground mb-1">Recurrence Rate</div>
 <div className="text-xl font-semibold">{data?.metrics?.recurrenceRate ? `${data.metrics.recurrenceRate}%` : '—'}</div>
 </div>
 </div>
 </CardContent>
 </Card>
 </div>
 );
}
