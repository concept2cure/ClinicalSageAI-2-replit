import React, { useMemo, useState, useEffect } from 'react';
import {
 Activity,
 ArrowLeft,
 BarChart3,
 BellRing,
 CheckCircle2,
 Clock3,
 Download,
 Eye,
 FileBarChart2,
 Filter,
 Layers3,
 RefreshCw,
 Search,
 ShieldAlert,
 SquareChartGantt,
 Users,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';

const reportModules = [
 { id: 'executive', label: 'Executive Intelligence', icon: BarChart3 },
 { id: 'project', label: 'Project Performance', icon: SquareChartGantt },
 { id: 'risk', label: 'Risk & Controls (KRI)', icon: ShieldAlert },
 { id: 'operations', label: 'Task & Delivery Ops', icon: CheckCircle2 },
 { id: 'client', label: 'Client Reporting Packs', icon: Users },
];

const paidPersonaReports = {
 startup: [
 'Burn-down vs milestone confidence report',
 'Investor update snapshot (weekly)',
 'Regulatory readiness trendline',
 ],
 growth: [
 'Program portfolio KPI dashboard',
 'Vendor/cost variance report',
 'Audit readiness and CAPA closure report',
 ],
 enterprise: [
 'Cross-program PMO command center report',
 'KRI heatmap + corrective action pack',
 'Board-level operating rhythm report',
 ],
};

const starterProjects = [
 { id: 'PJT-401', name: 'BTX-112 IND', health: 87, tasksDone: 138, tasksTotal: 161, risk: 'Low' },
 { id: 'PJT-577', name: 'OncoLead CER v2', health: 71, tasksDone: 92, tasksTotal: 128, risk: 'Medium' },
 { id: 'PJT-812', name: 'CMC Tech Transfer', health: 58, tasksDone: 64, tasksTotal: 123, risk: 'High' },
];

const starterTaskLedger = [
 { stream: 'Clinical', completed: 42, inProgress: 10, blocked: 3 },
 { stream: 'Regulatory', completed: 37, inProgress: 8, blocked: 2 },
 { stream: 'CMC', completed: 24, inProgress: 7, blocked: 5 },
 { stream: 'Quality', completed: 18, inProgress: 5, blocked: 1 },
];

const ReportsDashboard = () => {
 const [, setLocation] = useLocation();
 const [module, setModule] = useState('executive');
 const [query, setQuery] = useState('');
 const [persona, setPersona] = useState('growth');
 const [liveMode, setLiveMode] = useState(true);
 const [showKPI, setShowKPI] = useState(true);
 const [showKRI, setShowKRI] = useState(true);
 const [showProjectReports, setShowProjectReports] = useState(true);
 const [pulse, setPulse] = useState(0);

 useEffect(() => {
 if (!liveMode) return undefined;
 const timer = window.setInterval(() => {
 setPulse(prev => prev + 1);
 }, 3500);
 return () => window.clearInterval(timer);
 }, [liveMode]);

 const projects = useMemo(
 () =>
 starterProjects.map((project, index) => {
 if (!liveMode) return project;
 const healthShift = ((pulse + index) % 3) - 1;
 return {
 ...project,
 health: Math.max(42, Math.min(96, project.health + healthShift)),
 };
 }),
 [pulse, liveMode],
 );

 const filteredProjects = useMemo(
 () =>
 projects.filter(
 p =>
 p.name.toLowerCase().includes(query.toLowerCase()) ||
 p.id.toLowerCase().includes(query.toLowerCase()),
 ),
 [projects, query],
 );

 const summary = useMemo(() => {
 const totalDone = starterTaskLedger.reduce((sum, row) => sum + row.completed, 0);
 const totalInProgress = starterTaskLedger.reduce((sum, row) => sum + row.inProgress, 0);
 const totalBlocked = starterTaskLedger.reduce((sum, row) => sum + row.blocked, 0);
 return {
 totalDone,
 totalInProgress,
 totalBlocked,
 completionRate: Math.round((totalDone / (totalDone + totalInProgress + totalBlocked)) * 100),
 };
 }, []);

 return (
 <div className="min-h-screen bg-neutral-100 p-4 md:p-6">
 <div className="mx-auto flex w-full max-w-[1400px] gap-4 md:gap-6">
 <aside className="hidden w-72 shrink-0 rounded-2xl border border-neutral-200 bg-white p-4 lg:block">
 <div className="mb-5 flex items-center justify-between">
 <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">Reports</h2>
 <Badge variant="outline" className="gap-1">
 <BellRing className="h-3 w-3" />
 Live
 </Badge>
 </div>

 <div className="space-y-2">
 {reportModules.map(item => {
 const Icon = item.icon;
 const isActive = module === item.id;
 return (
 <button
 key={item.id}
 type="button"
 onClick={() => setModule(item.id)}
 className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
 isActive
 ? 'border-neutral-900 bg-neutral-900 text-white'
 : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'
 }`}
 >
 <Icon className="h-4 w-4" />
 {item.label}
 </button>
 );
 })}
 </div>

 <Card className="mt-5 border-neutral-200 bg-neutral-50">
 <CardHeader className="pb-2">
 <CardTitle className="text-sm">Persona Report Library</CardTitle>
 <CardDescription>Starter examples for paid plans</CardDescription>
 </CardHeader>
 <CardContent className="space-y-3">
 <Select value={persona} onValueChange={setPersona}>
 <SelectTrigger>
 <SelectValue placeholder="Select user type" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="startup">Startup Plan</SelectItem>
 <SelectItem value="growth">Growth Plan</SelectItem>
 <SelectItem value="enterprise">Enterprise Plan</SelectItem>
 </SelectContent>
 </Select>
 <div className="space-y-2 text-xs text-neutral-700">
 {paidPersonaReports[persona].map(example => (
 <p key={example} className="rounded-lg border border-neutral-200 bg-white px-2.5 py-2">
 {example}
 </p>
 ))}
 </div>
 </CardContent>
 </Card>
 </aside>

 <main className="flex-1 space-y-4 md:space-y-6">
 <Card className="rounded-2xl border-neutral-200 bg-white">
 <CardHeader>
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <div className="mb-3 flex items-center gap-2">
 <Button variant="ghost" size="sm" onClick={() => setLocation('/client-portal')}>
 <ArrowLeft className="mr-2 h-4 w-4" />
 Back
 </Button>
 <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700">
 <Activity className="h-3 w-3" />
 {liveMode ? 'Live updates: ON' : 'Live updates: OFF'}
 </Badge>
 </div>
 <CardTitle className="text-2xl">Unified Reports Command Center</CardTitle>
 <CardDescription>
 Claude-style single surface for KPI, KRI, project, and task-reporting with built-in examples.
 </CardDescription>
 </div>
 <div className="flex flex-wrap gap-2">
 <Button variant="outline">
 <Eye className="mr-2 h-4 w-4" />
 Preview Pack
 </Button>
 <Button className="bg-neutral-900 text-white hover:bg-black">
 <Download className="mr-2 h-4 w-4" />
 Export Client Report
 </Button>
 </div>
 </div>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
 <Card className="border-neutral-200">
 <CardHeader className="pb-1">
 <CardDescription>KPI Completion</CardDescription>
 <CardTitle>{summary.completionRate}%</CardTitle>
 </CardHeader>
 <CardContent>
 <Progress value={summary.completionRate} />
 </CardContent>
 </Card>
 <Card className="border-neutral-200">
 <CardHeader className="pb-1">
 <CardDescription>Tasks Completed</CardDescription>
 <CardTitle>{summary.totalDone}</CardTitle>
 </CardHeader>
 <CardContent className="text-xs text-neutral-500">Across all active streams</CardContent>
 </Card>
 <Card className="border-neutral-200">
 <CardHeader className="pb-1">
 <CardDescription>Tasks In Progress</CardDescription>
 <CardTitle>{summary.totalInProgress}</CardTitle>
 </CardHeader>
 <CardContent className="text-xs text-neutral-500">Auto-refreshed every ~3.5s in live mode</CardContent>
 </Card>
 <Card className="border-neutral-200">
 <CardHeader className="pb-1">
 <CardDescription>Blocked Tasks / KRI</CardDescription>
 <CardTitle className="text-red-600">{summary.totalBlocked}</CardTitle>
 </CardHeader>
 <CardContent className="text-xs text-neutral-500">Escalation-ready blockers</CardContent>
 </Card>
 </div>

 <div className="grid gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 md:grid-cols-2 xl:grid-cols-5">
 <div className="flex items-center gap-2 xl:col-span-2">
 <Search className="h-4 w-4 text-neutral-500" />
 <Input
 value={query}
 onChange={e => setQuery(e.target.value)}
 placeholder="Search project reports"
 className="bg-white"
 />
 </div>
 <div className="flex items-center gap-2">
 <Filter className="h-4 w-4 text-neutral-500" />
 <Select defaultValue="weekly">
 <SelectTrigger className="bg-white">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="daily">Daily</SelectItem>
 <SelectItem value="weekly">Weekly</SelectItem>
 <SelectItem value="monthly">Monthly</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2">
 <Label htmlFor="toggle-kpi">KPI</Label>
 <Switch id="toggle-kpi" checked={showKPI} onCheckedChange={setShowKPI} />
 </div>
 <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2">
 <Label htmlFor="toggle-kri">KRI</Label>
 <Switch id="toggle-kri" checked={showKRI} onCheckedChange={setShowKRI} />
 </div>
 <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2">
 <Label htmlFor="toggle-project">Projects</Label>
 <Switch
 id="toggle-project"
 checked={showProjectReports}
 onCheckedChange={setShowProjectReports}
 />
 </div>
 <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2">
 <Label htmlFor="toggle-live">Live Feed</Label>
 <Switch id="toggle-live" checked={liveMode} onCheckedChange={setLiveMode} />
 </div>
 </div>
 </CardContent>
 </Card>

 {showProjectReports && (
 <Card className="rounded-2xl border-neutral-200 bg-white">
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-lg">
 <Layers3 className="h-5 w-5" />
 Project Reports (Live)
 </CardTitle>
 <CardDescription>
 Pre-populated examples with real-time health drift simulation to mimic a live command center.
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-3">
 {filteredProjects.map(project => (
 <div
 key={project.id}
 className="grid gap-3 rounded-xl border border-neutral-200 p-3 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center"
 >
 <div>
 <p className="text-sm font-semibold text-neutral-900">{project.name}</p>
 <p className="text-xs text-neutral-500">{project.id}</p>
 </div>
 {showKPI && (
 <div>
 <p className="mb-1 text-xs text-neutral-500">KPI Project Health</p>
 <Progress value={project.health} />
 <p className="mt-1 text-xs font-medium text-neutral-700">{project.health}%</p>
 </div>
 )}
 {showKRI && (
 <div className="text-sm">
 <p className="text-xs text-neutral-500">KRI Risk Status</p>
 <Badge
 className={
 project.risk === 'High'
 ? 'bg-red-100 text-red-700'
 : project.risk === 'Medium'
 ? 'bg-amber-100 text-amber-700'
 : 'bg-emerald-100 text-emerald-700'
 }
 >
 {project.risk}
 </Badge>
 </div>
 )}
 <div className="flex items-center gap-2">
 <Button size="sm" variant="outline">
 <FileBarChart2 className="mr-1.5 h-4 w-4" />
 Open
 </Button>
 <Button size="sm" variant="outline">
 <Download className="mr-1.5 h-4 w-4" />
 PDF
 </Button>
 </div>
 </div>
 ))}
 </CardContent>
 </Card>
 )}

 <Card className="rounded-2xl border-neutral-200 bg-white">
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-lg">
 <Clock3 className="h-5 w-5" />
 Task Completion Status Report
 </CardTitle>
 <CardDescription>
 Completed, in-progress, and blocked task reporting with examples included by default.
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="overflow-x-auto">
 <table className="w-full min-w-[640px] text-sm">
 <thead>
 <tr className="border-b text-left text-neutral-500">
 <th className="pb-2 font-medium">Workstream</th>
 <th className="pb-2 font-medium">Completed</th>
 <th className="pb-2 font-medium">In Progress</th>
 <th className="pb-2 font-medium">Blocked</th>
 <th className="pb-2 font-medium">Status</th>
 </tr>
 </thead>
 <tbody>
 {starterTaskLedger.map(item => {
 const statusLabel = item.blocked > 3 ? 'Needs attention' : 'On track';
 return (
 <tr key={item.stream} className="border-b last:border-b-0">
 <td className="py-3 font-medium text-neutral-800">{item.stream}</td>
 <td className="py-3">{item.completed}</td>
 <td className="py-3">{item.inProgress}</td>
 <td className="py-3">{item.blocked}</td>
 <td className="py-3">
 <Badge variant="outline">{statusLabel}</Badge>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
 <RefreshCw className="h-3.5 w-3.5" />
 Last refreshed: {new Date().toLocaleTimeString('en-US')}
 </div>
 </CardContent>
 </Card>
 </main>
 </div>
 </div>
 );
};

export default ReportsDashboard;
