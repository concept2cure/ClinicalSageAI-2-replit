import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import queryClient, { apiRequest } from '@/lib/queryClient';
import { motion, AnimatePresence } from 'framer-motion';
import { useTenant } from '../../contexts/TenantContext';
import { OrganizationSwitcher } from '../../components/tenant/OrganizationSwitcher';
import { ClientWorkspaceSwitcher } from '../../components/tenant/ClientWorkspaceSwitcher';
import {
  FileText,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Calendar,
  Activity,
  Shield,
  Briefcase,
  Settings,
  Plus,
  ChevronRight,
  ArrowRight,
  BarChart3,
  Target,
  Zap,
  Brain,
  Package,
  GitBranch,
  MessageSquare,
  Bell,
  Search,
  Filter,
  Download,
  Upload,
  RefreshCw,
  Info,
  Edit3,
  Trash2,
  Eye,
  PlayCircle,
  PauseCircle,
  CheckSquare,
  XCircle,
  AlertCircle,
  Database,
  Layers,
  Grid3X3,
  List,
  Kanban,
  Network,
  Workflow,
  FlaskConical,
  BookOpen,
  Archive,
  Award,
  Cpu,
  Globe,
  Inbox,
  Send,
  UserCheck,
  UserPlus,
  Hash,
  Tag,
  FolderOpen,
  FileCheck,
  FileClock,
  FileX,
  Navigation,
  Map,
  Compass,
  Gauge,
  Sparkles,
  Rocket,
  Timer,
  TrendingDown,
  CircleDot,
  LayoutDashboard,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Area,
  AreaChart,
} from 'recharts';
import { format, addDays, differenceInDays, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

// Color palette for charts and visualizations
const COLORS = {
  primary: '#3B82F6', // Blue
  success: '#10B981', // Green
  warning: '#F59E0B', // Amber
  danger: '#EF4444', // Red
  purple: '#8B5CF6',
  indigo: '#6366F1',
  pink: '#EC4899',
  teal: '#14B8A6',
};

const CHART_COLORS = [
  COLORS.primary,
  COLORS.success,
  COLORS.purple,
  COLORS.warning,
  COLORS.teal,
  COLORS.indigo,
  COLORS.pink,
  COLORS.danger,
];

// Module definitions with icons and colors
const MODULES = {
  eCTD: { icon: FileText, color: COLORS.primary, label: 'eCTD Co-Author' },
  CMC: { icon: FlaskConical, color: COLORS.purple, label: 'CMC Dashboard' },
  Clinical: { icon: Activity, color: COLORS.success, label: 'Clinical Studies' },
  Quality: { icon: Shield, color: COLORS.warning, label: 'Quality Control' },
  Vault: { icon: Archive, color: COLORS.indigo, label: 'Document Vault' },
  Protocol: { icon: BookOpen, color: COLORS.teal, label: 'Protocol Design' },
  Risk: { icon: AlertTriangle, color: COLORS.danger, label: 'Risk Assessment' },
  Analytics: { icon: BarChart3, color: COLORS.pink, label: 'Analytics Hub' },
};

// Main Component
export default function UnifiedSubmissionCenter() {
  const [, setLocation] = useLocation();
  const { currentOrganization, currentClientWorkspace } = useTenant();
  const [selectedProject, setSelectedProject] = useState(null);
  const [viewMode, setViewMode] = useState('dashboard'); // dashboard, kanban, timeline, pipeline
  const [showCreateProjectDialog, setShowCreateProjectDialog] = useState(false);
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterModule, setFilterModule] = useState('all');

  // Agent Swarm state
  const [activeSwarm, setActiveSwarm] = useState(null);
  const [swarmLoading, setSwarmLoading] = useState(false);
  const [hitlTasks, setHitlTasks] = useState([]);
  const swarmPollRef = useRef(null);
  const swarmTimeoutRef = useRef(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (swarmPollRef.current) clearInterval(swarmPollRef.current);
      if (swarmTimeoutRef.current) clearTimeout(swarmTimeoutRef.current);
    };
  }, []);

  // Launch an AI Agent Swarm for a project
  const launchAgentSwarm = async project => {
    if (!project) {
      toast({
        title: 'No Project Selected',
        description: 'Select a project before launching a swarm.',
        variant: 'destructive',
      });
      return;
    }
    setSwarmLoading(true);
    try {
      const res = await apiRequest('/api/agent-swarm/swarms', 'POST', {
        submissionId: project.id || 'sub-' + Date.now(),
        agents: ['regulatory-reviewer', 'medical-writer', 'statistics-analyst', 'quality-checker'],
        config: { strategy: 'parallel', maxConcurrency: 4, hitlRequired: true },
      });
      const swarm = typeof res === 'object' ? res : (await res.json?.()) || res;
      setActiveSwarm(swarm);
      // Start the swarm execution
      await apiRequest(`/api/agent-swarm/swarms/${swarm.id}/start`, 'POST');
      toast({
        title: 'AI Swarm Launched',
        description: `${swarm.agents?.length || 4} agents working on "${project.name || project.title}"`,
      });
      pollSwarmStatus(swarm.id);
    } catch (err) {
      console.error('Swarm launch error:', err);
      toast({
        title: 'Swarm Launch Failed',
        description: 'Could not start the AI agent swarm. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSwarmLoading(false);
    }
  };

  // Poll swarm status for HITL tasks and completion
  const pollSwarmStatus = swarmId => {
    if (swarmPollRef.current) clearInterval(swarmPollRef.current);
    if (swarmTimeoutRef.current) clearTimeout(swarmTimeoutRef.current);

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/agent-swarm/swarms/${swarmId}`, { credentials: 'include' });
        if (!res.ok) {
          clearInterval(interval);
          swarmPollRef.current = null;
          return;
        }
        const data = await res.json();
        setActiveSwarm(data);
        // Collect HITL-pending tasks
        const pending = (data.tasks || []).filter(t => t.status === 'needs-human-review');
        setHitlTasks(pending);
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(interval);
          swarmPollRef.current = null;
          toast({
            title: data.status === 'completed' ? 'Swarm Complete' : 'Swarm Failed',
            description: `Agent swarm finished with status: ${data.status}`,
          });
        }
      } catch {
        clearInterval(interval);
        swarmPollRef.current = null;
      }
    }, 3000);
    swarmPollRef.current = interval;
    // Auto-stop polling after 5 minutes
    swarmTimeoutRef.current = setTimeout(() => {
      clearInterval(interval);
      swarmPollRef.current = null;
    }, 300000);
  };

  // Approve a HITL task
  const approveHitlTask = async taskId => {
    if (!activeSwarm) return;
    try {
      await apiRequest(`/api/agent-swarm/swarms/${activeSwarm.id}/hitl/${taskId}/approve`, 'POST', {
        approved: true,
        feedback: 'Approved by submission manager',
      });
      setHitlTasks(prev => prev.filter(t => t.id !== taskId));
      toast({ title: 'Task Approved', description: 'Agent will continue processing.' });
    } catch (err) {
      toast({ title: 'Approval Failed', description: String(err), variant: 'destructive' });
    }
  };

  // Fetch projects
  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ['/api/submission-center/projects'],
  });

  // Fetch tasks
  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['/api/submission-center/tasks'],
  });

  // Fetch regulatory intelligence
  const { data: intelligenceData } = useQuery({
    queryKey: ['/api/submission-center/regulatory-intelligence'],
  });

  // Fetch pipeline data
  const { data: pipelineData } = useQuery({
    queryKey: ['/api/submission-center/pipeline'],
  });

  // Navigate to module helper
  const navigateToModule = moduleKey => {
    switch (moduleKey) {
      case 'eCTD':
        setLocation('/coauthor'); // Fixed: correct route for eCTD Co-Author
        break;
      case 'CMC':
        setLocation('/cmc-blueprint');
        break;
      case 'Clinical':
        setLocation('/clinical-trials');
        break;
      case 'Quality':
        setLocation('/quality');
        break;
      case 'Vault':
        setLocation('/vault');
        break;
      default:
        toast({
          title: 'Module Navigation',
          description: `Navigating to ${moduleKey} module`,
        });
    }
  };

  // Create project mutation
  const createProjectMutation = useMutation({
    mutationFn: data => apiRequest('/api/submission-center/projects', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['/api/submission-center/projects']);
      setShowCreateProjectDialog(false);
      toast({
        title: 'Project Created',
        description: 'New submission project has been created successfully.',
      });
    },
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: data => apiRequest('/api/submission-center/tasks', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['/api/submission-center/tasks']);
      setShowCreateTaskDialog(false);
      toast({
        title: 'Task Created',
        description: 'New task has been added to the project.',
      });
    },
  });

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: ({ id, ...data }) => apiRequest(`/api/submission-center/tasks/${id}`, 'PUT', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['/api/submission-center/tasks']);
      toast({
        title: 'Task Updated',
        description: 'Task has been updated successfully.',
      });
    },
  });

  // Calculate dashboard metrics
  const metrics = useMemo(() => {
    const projects = projectsData?.data || [];
    const tasks = tasksData?.data || [];

    return {
      activeProjects: projects.filter(p => p.status === 'active').length,
      totalProjects: projects.length,
      completedProjects: projects.filter(p => p.status === 'completed').length,
      totalTasks: tasks.length,
      pendingTasks: tasks.filter(t => t.status === 'pending').length,
      inProgressTasks: tasks.filter(t => t.status === 'in-progress').length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      blockedTasks: tasks.filter(t => t.status === 'blocked').length,
      overdueTasks: tasks.filter(
        t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed'
      ).length,
      upcomingDeadlines: projects.filter(
        p =>
          p.submissionDeadline &&
          differenceInDays(new Date(p.submissionDeadline), new Date()) <= 30 &&
          differenceInDays(new Date(p.submissionDeadline), new Date()) >= 0
      ).length,
      averageCompletion:
        projects.length > 0
          ? Math.round(
              projects.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / projects.length
            )
          : 0,
      criticalTasks: tasks.filter(t => t.priority === 'critical').length,
      highRiskProjects: projects.filter(p => (p.riskScore || 0) > 70).length,
      complianceScore:
        projects.length > 0
          ? Math.round(
              projects.reduce((sum, p) => sum + (p.complianceScore || 100), 0) / projects.length
            )
          : 100,
    };
  }, [projectsData, tasksData]);

  // Filter projects and tasks based on search and filters
  const filteredProjects = useMemo(() => {
    let projects = projectsData?.data || [];

    if (searchQuery) {
      projects = projects.filter(
        p =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.type?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (filterStatus !== 'all') {
      projects = projects.filter(p => p.status === filterStatus);
    }

    return projects;
  }, [projectsData, searchQuery, filterStatus]);

  const filteredTasks = useMemo(() => {
    let tasks = tasksData?.data || [];

    if (searchQuery) {
      tasks = tasks.filter(
        t =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (filterStatus !== 'all') {
      tasks = tasks.filter(t => t.status === filterStatus);
    }

    if (filterPriority !== 'all') {
      tasks = tasks.filter(t => t.priority === filterPriority);
    }

    if (filterModule !== 'all') {
      tasks = tasks.filter(t => t.moduleType === filterModule);
    }

    if (selectedProject) {
      tasks = tasks.filter(t => t.projectId === selectedProject.id);
    }

    return tasks;
  }, [tasksData, searchQuery, filterStatus, filterPriority, filterModule, selectedProject]);

  // Prepare chart data
  const taskStatusData = [
    { name: 'Pending', value: metrics.pendingTasks, color: COLORS.warning },
    { name: 'In Progress', value: metrics.inProgressTasks, color: COLORS.primary },
    { name: 'Completed', value: metrics.completedTasks, color: COLORS.success },
    { name: 'Blocked', value: metrics.blockedTasks, color: COLORS.danger },
  ];

  const projectTimelineData = useMemo(() => {
    const projects = filteredProjects.slice(0, 10);
    return projects.map(p => ({
      name: p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name,
      completion: p.completionPercentage || 0,
      risk: p.riskScore || 0,
      compliance: p.complianceScore || 100,
    }));
  }, [filteredProjects]);

  const moduleActivityData = Object.keys(MODULES).map(module => ({
    module,
    tasks: filteredTasks.filter(t => t.moduleType === module).length,
    active: filteredTasks.filter(t => t.moduleType === module && t.status === 'in-progress').length,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/20 to-purple-50/20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/client-portal">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ChevronRight className="h-4 w-4 rotate-180" />
                  Back to Portal
                </Button>
              </Link>
              <Separator orientation="vertical" className="h-8" />
              <div className="flex items-center gap-2">
                <LayoutDashboard className="h-6 w-6 text-blue-600" />
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-700 to-purple-700 bg-clip-text text-transparent">
                  Submission Center
                </h1>
              </div>
              <Badge variant="outline" className="border-blue-200 text-blue-700">
                {currentClientWorkspace?.name || currentClientWorkspace || 'Mission Control'}
              </Badge>
            </div>

            <div className="flex items-center gap-3">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search projects, tasks..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>

              {/* View Mode Selector */}
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                <Button
                  size="sm"
                  variant={viewMode === 'dashboard' ? 'default' : 'ghost'}
                  onClick={() => setViewMode('dashboard')}
                  className="gap-1"
                >
                  <Grid3X3 className="h-4 w-4" />
                  Dashboard
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === 'kanban' ? 'default' : 'ghost'}
                  onClick={() => setViewMode('kanban')}
                  className="gap-1"
                >
                  <Kanban className="h-4 w-4" />
                  Kanban
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === 'timeline' ? 'default' : 'ghost'}
                  onClick={() => setViewMode('timeline')}
                  className="gap-1"
                >
                  <Calendar className="h-4 w-4" />
                  Timeline
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === 'pipeline' ? 'default' : 'ghost'}
                  onClick={() => setViewMode('pipeline')}
                  className="gap-1"
                >
                  <GitBranch className="h-4 w-4" />
                  Pipeline
                </Button>
              </div>

              {/* Quick Actions */}
              <Button
                size="sm"
                className="gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                onClick={() => setShowCreateProjectDialog(true)}
              >
                <Plus className="h-4 w-4" />
                New Project
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
                onClick={() => setShowCreateTaskDialog(true)}
              >
                <Plus className="h-4 w-4" />
                New Task
              </Button>

              {/* Notifications */}
              <Button size="icon" variant="ghost" className="relative">
                <Bell className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full animate-pulse" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        {viewMode === 'dashboard' && (
          <div className="space-y-6">
            {/* Metrics Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                title="Active Projects"
                value={metrics.activeProjects}
                total={metrics.totalProjects}
                icon={Briefcase}
                color={COLORS.primary}
                trend={+12}
              />
              <MetricCard
                title="Tasks In Progress"
                value={metrics.inProgressTasks}
                total={metrics.totalTasks}
                icon={CheckSquare}
                color={COLORS.success}
                trend={+8}
              />
              <MetricCard
                title="Upcoming Deadlines"
                value={metrics.upcomingDeadlines}
                subtitle="Within 30 days"
                icon={Clock}
                color={COLORS.warning}
                alert
              />
              <MetricCard
                title="Compliance Score"
                value={metrics.complianceScore}
                suffix="%"
                icon={Shield}
                color={COLORS.purple}
                progress
              />
            </div>

            {/* Main Dashboard Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Projects & Pipeline */}
              <div className="lg:col-span-2 space-y-6">
                {/* Global Project Dashboard */}
                <Card className="border-gray-200 shadow-sm">
                  <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">Active Submission Projects</CardTitle>
                        <CardDescription>
                          {metrics.activeProjects} active • {metrics.completedProjects} completed
                        </CardDescription>
                      </div>
                      <Button size="sm" variant="outline" className="gap-2">
                        <Filter className="h-4 w-4" />
                        Filter
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[400px]">
                      <div className="p-4 space-y-3">
                        {projectsLoading ? (
                          <div className="flex items-center justify-center h-32">
                            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                          </div>
                        ) : filteredProjects.length === 0 ? (
                          <div className="text-center py-8 text-gray-500">
                            <FolderOpen className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                            <p>No projects found</p>
                          </div>
                        ) : (
                          filteredProjects
                            .slice(0, 5)
                            .map(project => (
                              <ProjectCard
                                key={project.id}
                                project={project}
                                onSelect={() => setSelectedProject(project)}
                                selected={selectedProject?.id === project.id}
                              />
                            ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Submission Pipeline View */}
                <Card className="border-gray-200 shadow-sm">
                  <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">Submission Pipeline</CardTitle>
                        <CardDescription>Workflow stages across all projects</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                          disabled={swarmLoading || !selectedProject}
                          onClick={() => launchAgentSwarm(selectedProject)}
                        >
                          {swarmLoading ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <Cpu className="h-3 w-3" />
                          )}
                          Launch AI Swarm
                        </Button>
                        <Badge variant="outline" className="border-purple-200 text-purple-700">
                          <Workflow className="h-3 w-3 mr-1" />
                          Live
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <PipelineView projects={filteredProjects.slice(0, 3)} />

                    {/* Active Agent Swarm Status */}
                    {activeSwarm && (
                      <div className="mt-4 border rounded-lg p-3 bg-indigo-50/50 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Cpu className="h-4 w-4 text-indigo-600" />
                            <span className="text-sm font-medium text-indigo-800">Agent Swarm</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-xs',
                                activeSwarm.status === 'completed'
                                  ? 'border-green-300 text-green-700'
                                  : activeSwarm.status === 'running'
                                    ? 'border-blue-300 text-blue-700'
                                    : activeSwarm.status === 'failed'
                                      ? 'border-red-300 text-red-700'
                                      : 'border-gray-300 text-gray-700'
                              )}
                            >
                              {activeSwarm.status || 'pending'}
                            </Badge>
                          </div>
                          <span className="text-xs text-gray-500">
                            {activeSwarm.agents?.length || 0} agents
                          </span>
                        </div>

                        {/* Progress */}
                        {activeSwarm.tasks && (
                          <Progress
                            value={Math.round(
                              (activeSwarm.tasks.filter(t => t.status === 'completed').length /
                                Math.max(activeSwarm.tasks.length, 1)) *
                                100
                            )}
                            className="h-2"
                          />
                        )}

                        {/* HITL Approval Cards */}
                        {hitlTasks.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Human Review Required ({hitlTasks.length})
                            </p>
                            {hitlTasks.slice(0, 3).map(task => (
                              <div
                                key={task.id}
                                className="flex items-center justify-between bg-white rounded-md border border-amber-200 p-2"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">
                                    {task.description || task.type}
                                  </p>
                                  <p className="text-[10px] text-gray-500">
                                    {task.agentId || 'Agent'}
                                  </p>
                                </div>
                                <div className="flex gap-1 ml-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-xs text-green-700 border-green-200"
                                    onClick={() => approveHitlTask(task.id)}
                                  >
                                    <CheckCircle className="h-3 w-3 mr-1" /> Approve
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Module Integration Hub */}
                <Card className="border-gray-200 shadow-sm">
                  <CardHeader className="bg-gradient-to-r from-teal-50 to-cyan-50 border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">Module Integration Hub</CardTitle>
                        <CardDescription>Quick access to all regulatory modules</CardDescription>
                      </div>
                      <Button size="sm" variant="outline" className="gap-2">
                        <Grid3X3 className="h-4 w-4" />
                        View All
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(MODULES).map(([key, module]) => (
                        <ModuleCard
                          key={key}
                          name={module.label}
                          icon={module.icon}
                          color={module.color}
                          taskCount={moduleActivityData.find(m => m.module === key)?.tasks || 0}
                          activeCount={moduleActivityData.find(m => m.module === key)?.active || 0}
                          onClick={() => navigateToModule(key)}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column - Tasks & Intelligence */}
              <div className="space-y-6">
                {/* Central Task Management Hub */}
                <Card className="border-gray-200 shadow-sm">
                  <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">Task Management</CardTitle>
                        <CardDescription>{metrics.totalTasks} total tasks</CardDescription>
                      </div>
                      <Badge className="bg-green-100 text-green-700">
                        {metrics.inProgressTasks} Active
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="p-4">
                      {/* Task Status Chart */}
                      <div className="h-48 mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={taskStatusData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {taskStatusData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Task Quick Stats */}
                      <div className="space-y-2">
                        <TaskStatRow
                          label="Critical Tasks"
                          count={metrics.criticalTasks}
                          color={COLORS.danger}
                        />
                        <TaskStatRow
                          label="Overdue Tasks"
                          count={metrics.overdueTasks}
                          color={COLORS.warning}
                        />
                        <TaskStatRow
                          label="Blocked Tasks"
                          count={metrics.blockedTasks}
                          color={COLORS.danger}
                        />
                        <TaskStatRow label="Completed Today" count={3} color={COLORS.success} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Regulatory Intelligence Feed */}
                <Card className="border-gray-200 shadow-sm">
                  <CardHeader className="bg-gradient-to-r from-indigo-50 to-blue-50 border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">Regulatory Intelligence</CardTitle>
                        <CardDescription>Latest updates & changes</CardDescription>
                      </div>
                      <Brain className="h-5 w-5 text-indigo-600" />
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[300px]">
                      <div className="p-4 space-y-3">
                        {intelligenceData?.data?.map((item, index) => (
                          <IntelligenceItem key={index} item={item} />
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Compliance Monitoring */}
                <Card className="border-gray-200 shadow-sm">
                  <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50 border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">Compliance Monitor</CardTitle>
                        <CardDescription>Real-time compliance tracking</CardDescription>
                      </div>
                      <Shield className="h-5 w-5 text-amber-600" />
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <ComplianceMetric label="21 CFR Part 11" score={98} status="compliant" />
                      <ComplianceMetric label="ICH Guidelines" score={95} status="compliant" />
                      <ComplianceMetric label="Data Integrity" score={88} status="warning" />
                      <ComplianceMetric label="Audit Readiness" score={92} status="compliant" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Bottom Section - Analytics & Collaboration */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Project Timeline Chart */}
              <Card className="border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Project Performance</CardTitle>
                  <CardDescription>Completion, risk, and compliance metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={projectTimelineData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="completion" fill={COLORS.success} name="Completion %" />
                      <Bar dataKey="compliance" fill={COLORS.primary} name="Compliance %" />
                      <Bar dataKey="risk" fill={COLORS.danger} name="Risk Score" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Real-time Collaboration Center */}
              <Card className="border-gray-200 shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">Collaboration Center</CardTitle>
                      <CardDescription>Active team members & recent activities</CardDescription>
                    </div>
                    <Badge className="bg-green-100 text-green-700">
                      <CircleDot className="h-3 w-3 mr-1 animate-pulse" />
                      12 Online
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Online Users */}
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        {[1, 2, 3, 4, 5].map(i => (
                          <Avatar key={i} className="h-8 w-8 border-2 border-white">
                            <AvatarFallback className="text-xs">U{i}</AvatarFallback>
                          </Avatar>
                        ))}
                      </div>
                      <span className="text-sm text-gray-600">+7 more online</span>
                    </div>

                    <Separator />

                    {/* Recent Activities */}
                    <div className="space-y-2">
                      <ActivityItem
                        user="Sarah Chen"
                        action="completed task"
                        target="CMC Section 3.2.S.1"
                        time="2 min ago"
                      />
                      <ActivityItem
                        user="Dr. Thompson"
                        action="approved"
                        target="Protocol Amendment v2"
                        time="15 min ago"
                      />
                      <ActivityItem
                        user="Mike Roberts"
                        action="submitted for review"
                        target="IND Module 5"
                        time="1 hour ago"
                      />
                    </div>

                    <Button size="sm" variant="outline" className="w-full">
                      View All Activities
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {viewMode === 'kanban' && (
          <KanbanBoard tasks={filteredTasks} onTaskUpdate={updateTaskMutation.mutate} />
        )}

        {viewMode === 'timeline' && (
          <TimelineView projects={filteredProjects} tasks={filteredTasks} />
        )}

        {viewMode === 'pipeline' && <PipelineDetailView projects={filteredProjects} />}
      </div>

      {/* Create Project Dialog */}
      <CreateProjectDialog
        open={showCreateProjectDialog}
        onOpenChange={setShowCreateProjectDialog}
        onCreate={createProjectMutation.mutate}
        isLoading={createProjectMutation.isLoading}
      />

      {/* Create Task Dialog */}
      <CreateTaskDialog
        open={showCreateTaskDialog}
        onOpenChange={setShowCreateTaskDialog}
        onCreate={createTaskMutation.mutate}
        isLoading={createTaskMutation.isLoading}
        projects={filteredProjects}
      />
    </div>
  );
}

// Component: Metric Card
function MetricCard({
  title,
  value,
  total,
  suffix,
  subtitle,
  icon: Icon,
  color,
  trend,
  alert,
  progress,
}) {
  return (
    <Card className="border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}20` }}>
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
          {alert && (
            <Badge variant="destructive" className="animate-pulse">
              Alert
            </Badge>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-sm text-gray-600">{title}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">
              {value}
              {suffix}
            </span>
            {total && <span className="text-sm text-gray-500">/ {total}</span>}
          </div>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600">+{trend}%</span>
            </div>
          )}
          {progress && <Progress value={value} className="h-2 mt-2" />}
        </div>
      </CardContent>
    </Card>
  );
}

// Component: Project Card
function ProjectCard({ project, onSelect, selected }) {
  const statusColors = {
    planning: 'bg-gray-100 text-gray-700',
    active: 'bg-green-100 text-green-700',
    'on-hold': 'bg-yellow-100 text-yellow-700',
    completed: 'bg-blue-100 text-blue-700',
  };

  const priorityColors = {
    low: 'text-gray-500',
    medium: 'text-yellow-500',
    high: 'text-orange-500',
    critical: 'text-red-500',
  };

  return (
    <div
      className={cn(
        'p-4 rounded-lg border transition-all cursor-pointer hover:shadow-sm',
        selected ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200 bg-white'
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-start gap-2">
            <h4 className="font-semibold text-sm">{project.name}</h4>
            <Badge className={statusColors[project.status] || 'bg-gray-100'}>
              {project.status}
            </Badge>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {project.type} • {project.agency}
          </p>
        </div>
        <AlertCircle className={cn('h-4 w-4', priorityColors[project.priority])} />
      </div>

      <div className="space-y-2">
        <Progress value={project.completionPercentage || 0} className="h-2" />

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <CheckSquare className="h-3 w-3" />
              {project.taskMetrics?.completed || 0}/{project.taskMetrics?.total || 0} tasks
            </span>
            {project.submissionDeadline && (
              <span className="flex items-center gap-1 text-gray-500">
                <Clock className="h-3 w-3" />
                {format(new Date(project.submissionDeadline), 'MMM dd')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {project.riskScore > 70 && (
              <Badge variant="destructive" className="text-xs px-1 py-0">
                High Risk
              </Badge>
            )}
          </div>
        </div>

        {project.modules && (
          <div className="flex flex-wrap gap-1 mt-2">
            {project.modules.slice(0, 3).map(module => (
              <Badge key={module} variant="outline" className="text-xs">
                {module}
              </Badge>
            ))}
            {project.modules.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{project.modules.length - 3}
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Component: Module Card
function ModuleCard({ name, icon: Icon, color, taskCount, activeCount, onClick }) {
  return (
    <div
      className="p-4 rounded-lg border border-gray-200 bg-white hover:shadow-md transition-all cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="p-2 rounded-lg transition-transform group-hover:scale-110"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
      </div>
      <h4 className="font-medium text-sm mb-1">{name}</h4>
      <div className="flex items-center gap-2 text-xs text-gray-600">
        <span>{taskCount} tasks</span>
        {activeCount > 0 && (
          <>
            <span>•</span>
            <span className="text-green-600">{activeCount} active</span>
          </>
        )}
      </div>
    </div>
  );
}

// Component: Pipeline View
function PipelineView({ projects }) {
  const stages = ['Planning', 'Authoring', 'Review', 'Submission', 'Agency Review', 'Approved'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
        {stages.map((stage, index) => (
          <div key={stage} className="flex-1 text-center">
            <div className="flex items-center justify-center mb-1">
              <div
                className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center font-semibold',
                  index === 0
                    ? 'bg-blue-100 text-blue-700'
                    : index === stages.length - 1
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-700'
                )}
              >
                {index + 1}
              </div>
            </div>
            <span>{stage}</span>
          </div>
        ))}
      </div>

      {projects.map(project => (
        <div key={project.id} className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all"
                style={{ width: `${project.completionPercentage || 0}%` }}
              />
            </div>
          </div>
          <div className="relative flex items-center justify-between">
            {stages.map((_, index) => (
              <div
                key={index}
                className={cn(
                  'h-4 w-4 rounded-full border-2 bg-white',
                  index <= Math.floor((project.completionPercentage || 0) / (100 / stages.length))
                    ? 'border-blue-500'
                    : 'border-gray-300'
                )}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-medium">{project.name}</span>
            <span className="text-xs text-gray-500">{project.completionPercentage || 0}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Component: Task Stat Row
function TaskStatRow({ label, count, color }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-semibold" style={{ color }}>
          {count}
        </span>
      </div>
    </div>
  );
}

// Component: Intelligence Item
function IntelligenceItem({ item }) {
  const impactColors = {
    low: 'bg-gray-100 text-gray-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  };

  // Safely parse and format the date
  const formatDate = dateValue => {
    if (!dateValue) return 'Unknown date';
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return 'Unknown date';
      return format(date, 'MMM dd, yyyy');
    } catch (error) {
      return 'Unknown date';
    }
  };

  return (
    <div className="p-3 rounded-lg border border-gray-200 bg-white hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <Badge variant="outline" className="text-xs">
          {item.source || item.category || 'News'}
        </Badge>
        <Badge className={impactColors[item.impactLevel || 'medium']}>
          {item.impactLevel || 'medium'}
        </Badge>
      </div>
      <h5 className="font-medium text-sm mb-1">{item.title}</h5>
      <p className="text-xs text-gray-600 line-clamp-2">{item.summary || item.description}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-500">
          {formatDate(item.publishedDate || item.published_date)}
        </span>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
          View Details
        </Button>
      </div>
    </div>
  );
}

// Component: Compliance Metric
function ComplianceMetric({ label, score, status }) {
  const statusColors = {
    compliant: 'text-green-600',
    warning: 'text-yellow-600',
    'non-compliant': 'text-red-600',
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <Progress value={score} className="w-24 h-2" />
        <span className={cn('text-sm font-medium', statusColors[status])}>{score}%</span>
      </div>
    </div>
  );
}

// Component: Activity Item
function ActivityItem({ user, action, target, time }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Avatar className="h-6 w-6">
        <AvatarFallback className="text-xs">{user[0]}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-medium">{user}</span>{' '}
          <span className="text-gray-600">{action}</span>{' '}
          <span className="font-medium">{target}</span>
        </p>
        <p className="text-xs text-gray-500">{time}</p>
      </div>
    </div>
  );
}

// Component: Kanban Board
function KanbanBoard({ tasks, onTaskUpdate }) {
  const columns = [
    { id: 'pending', title: 'To Do', color: COLORS.warning },
    { id: 'in-progress', title: 'In Progress', color: COLORS.primary },
    { id: 'review', title: 'Review', color: COLORS.purple },
    { id: 'completed', title: 'Completed', color: COLORS.success },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {columns.map(column => (
        <div key={column.id} className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-100">
            <h3 className="font-semibold text-sm">{column.title}</h3>
            <Badge style={{ backgroundColor: `${column.color}20`, color: column.color }}>
              {tasks.filter(t => t.status === column.id).length}
            </Badge>
          </div>
          <div className="space-y-2">
            {tasks
              .filter(t => t.status === column.id)
              .map(task => (
                <KanbanTaskCard key={task.id} task={task} onUpdate={onTaskUpdate} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Component: Kanban Task Card
function KanbanTaskCard({ task, onUpdate }) {
  const priorityColors = {
    low: 'border-gray-300',
    medium: 'border-yellow-300',
    high: 'border-orange-300',
    critical: 'border-red-300',
  };

  return (
    <Card
      className={cn(
        'p-3 cursor-move hover:shadow-md transition-shadow border-l-4',
        priorityColors[task.priority]
      )}
    >
      <div className="space-y-2">
        <h4 className="font-medium text-sm line-clamp-2">{task.title}</h4>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Badge variant="outline" className="text-xs">
            {task.moduleType}
          </Badge>
          {task.dueDate && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(new Date(task.dueDate), 'MMM dd')}
            </span>
          )}
        </div>
        {task.assigneeName && (
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs">{task.assigneeName[0]}</AvatarFallback>
            </Avatar>
            <span className="text-xs text-gray-600">{task.assigneeName}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

// Component: Timeline View
function TimelineView({ projects, tasks }) {
  return (
    <div className="space-y-6">
      <Card className="border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle>Project Timeline</CardTitle>
          <CardDescription>Visual timeline of all submission milestones</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {/* Timeline implementation */}
            <div className="text-center text-gray-500 py-12">
              <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>Interactive timeline view coming soon</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Component: Pipeline Detail View
function PipelineDetailView({ projects }) {
  return (
    <div className="space-y-6">
      <Card className="border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle>Submission Pipeline Details</CardTitle>
          <CardDescription>Detailed view of all project stages and transitions</CardDescription>
        </CardHeader>
        <CardContent>
          <PipelineView projects={projects} />
        </CardContent>
      </Card>
    </div>
  );
}

// Component: Create Project Dialog
function CreateProjectDialog({ open, onOpenChange, onCreate, isLoading }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'IND',
    agency: 'FDA',
    priority: 'medium',
    submissionDeadline: '',
    modules: [],
  });

  const handleSubmit = e => {
    e.preventDefault();
    onCreate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Submission Project</DialogTitle>
          <DialogDescription>
            Start a new regulatory submission project with automated workflow setup
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Drug XYZ NDA Submission"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Submission Type</Label>
              <Select
                value={formData.type}
                onValueChange={value => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IND">IND - Investigational New Drug</SelectItem>
                  <SelectItem value="NDA">NDA - New Drug Application</SelectItem>
                  <SelectItem value="ANDA">ANDA - Abbreviated New Drug</SelectItem>
                  <SelectItem value="BLA">BLA - Biologics License</SelectItem>
                  <SelectItem value="510k">510(k) - Medical Device</SelectItem>
                  <SelectItem value="PMA">PMA - Premarket Approval</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agency">Regulatory Agency</Label>
              <Select
                value={formData.agency}
                onValueChange={value => setFormData({ ...formData, agency: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FDA">FDA - US</SelectItem>
                  <SelectItem value="EMA">EMA - Europe</SelectItem>
                  <SelectItem value="PMDA">PMDA - Japan</SelectItem>
                  <SelectItem value="HC">Health Canada</SelectItem>
                  <SelectItem value="TGA">TGA - Australia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority Level</Label>
              <Select
                value={formData.priority}
                onValueChange={value => setFormData({ ...formData, priority: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deadline">Submission Deadline</Label>
              <Input
                id="deadline"
                type="date"
                value={formData.submissionDeadline}
                onChange={e => setFormData({ ...formData, submissionDeadline: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the submission project..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Enable Modules</Label>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(MODULES).map(([key, module]) => (
                <div key={key} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={key}
                    checked={formData.modules.includes(key)}
                    onChange={e => {
                      if (e.target.checked) {
                        setFormData({ ...formData, modules: [...formData.modules, key] });
                      } else {
                        setFormData({
                          ...formData,
                          modules: formData.modules.filter(m => m !== key),
                        });
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor={key} className="text-sm font-normal cursor-pointer">
                    {module.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Project
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Component: Create Task Dialog
function CreateTaskDialog({ open, onOpenChange, onCreate, isLoading, projects }) {
  const [formData, setFormData] = useState({
    projectId: '',
    title: '',
    description: '',
    category: 'authoring',
    type: 'task',
    priority: 'medium',
    moduleId: '',
    assignee: '',
    assigneeEmail: '',
    dueDate: '',
    estimatedHours: '',
  });

  const handleSubmit = e => {
    e.preventDefault();
    onCreate({
      ...formData,
      projectId: parseInt(formData.projectId),
      estimatedHours: formData.estimatedHours ? parseFloat(formData.estimatedHours) : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>Add a new task to the submission workflow</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="project">Project</Label>
              <Select
                value={formData.projectId}
                onValueChange={value => setFormData({ ...formData, projectId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="module">Module</Label>
              <Select
                value={formData.moduleId}
                onValueChange={value => setFormData({ ...formData, moduleId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select module" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="General">General</SelectItem>
                  {Object.entries(MODULES).map(([key, module]) => (
                    <SelectItem key={key} value={key}>
                      {module.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Task Title</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Review CMC Section 3.2.S.4"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={value => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="authoring">Authoring</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="approval">Approval</SelectItem>
                  <SelectItem value="submission">Submission</SelectItem>
                  <SelectItem value="data-entry">Data Entry</SelectItem>
                  <SelectItem value="analysis">Analysis</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select
                value={formData.type}
                onValueChange={value => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">Task</SelectItem>
                  <SelectItem value="milestone">Milestone</SelectItem>
                  <SelectItem value="deliverable">Deliverable</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="approval">Approval</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={value => setFormData({ ...formData, priority: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="assignee">Assignee</Label>
              <Input
                id="assignee"
                value={formData.assignee}
                onChange={e => setFormData({ ...formData, assignee: e.target.value })}
                placeholder="Name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="assigneeEmail">Assignee Email</Label>
              <Input
                id="assigneeEmail"
                type="email"
                value={formData.assigneeEmail}
                onChange={e => setFormData({ ...formData, assigneeEmail: e.target.value })}
                placeholder="email@example.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimatedHours">Estimated Hours</Label>
              <Input
                id="estimatedHours"
                type="number"
                step="0.5"
                value={formData.estimatedHours}
                onChange={e => setFormData({ ...formData, estimatedHours: e.target.value })}
                placeholder="8"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="Task description and requirements..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Task
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Navigation helper
function navigateToModule(module) {
  const moduleRoutes = {
    eCTD: '/coauthor',
    CMC: '/cmc-blueprint',
    Clinical: '/csr-intelligence',
    Quality: '/quality-control',
    Vault: '/vault',
    Protocol: '/study-architect',
    Risk: '/regulatory-risk-dashboard',
    Analytics: '/analytics',
  };

  window.location.href = moduleRoutes[module] || '/';
}
