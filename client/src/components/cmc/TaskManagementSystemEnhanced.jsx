import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
  RefreshCw,
  FileText,
  CheckCircle,
  AlertTriangle,
  Search,
  Download,
  Clock,
  Calendar,
  User,
  Users,
  Activity,
  BellRing,
  PlusCircle,
  XCircle,
  CheckSquare,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  MessageSquare,
  Link,
  FileCheck,
  FileCog,
  ArrowRight,
  ArrowLeft,
  ArrowUpDown,
  CalendarClock,
  ClipboardCheck,
  Paperclip,
  ListChecks,
  Kanban,
  ListTodo,
  Timer,
  BarChart,
  PieChart,
  Lightbulb,
  Brain,
  Bot,
  Tag,
  Tags,
  Filter,
  Sparkles,
  Zap,
  Play,
  Copy,
  ChevronRight,
  ChevronDown,
  GanttChart,
  Wifi,
  WifiOff,
  Bell,
  Archive,
  Upload,
  Send,
  Package,
  Layers,
  Scale,
  TrendingUp,
  AlertCircle,
  Shield,
  UserPlus,
  Settings,
  History,
  Target,
  Award,
  Gauge,
  FileBarChart,
  Save,
  Template,
  FolderOpen,
  ChevronLeft,
  Database,
  Loader2,
  CheckCircle2,
  XOctagon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import io from 'socket.io-client';
import { format, addDays, differenceInDays, isAfter, isBefore, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import GanttChartView from './GanttChartView';

// Initialize Socket.io connection
const socket = io('/', {
  path: '/socket.io/',
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
});

// Task Templates
const TASK_TEMPLATES = {
  'IND_SUBMISSION': {
    name: 'IND Submission Package',
    description: 'Standard tasks for preparing an IND submission',
    icon: Package,
    tasks: [
      { title: 'Prepare Form FDA 1571', priority: 'high', estimatedHours: 4, tags: ['IND', 'FDA', 'Form'] },
      { title: 'Compile Clinical Protocol', priority: 'high', estimatedHours: 12, tags: ['IND', 'Clinical', 'Protocol'] },
      { title: 'Complete Chemistry Manufacturing Controls', priority: 'high', estimatedHours: 24, tags: ['IND', 'CMC'] },
      { title: 'Prepare Investigator Brochure', priority: 'medium', estimatedHours: 16, tags: ['IND', 'Documentation'] },
      { title: 'Compile Preclinical Data', priority: 'medium', estimatedHours: 20, tags: ['IND', 'Preclinical'] },
    ],
  },
  'CMC_REVIEW': {
    name: 'CMC Review Checklist',
    description: 'Standard review tasks for CMC documentation',
    icon: FileCheck,
    tasks: [
      { title: 'Review Drug Substance Specifications', priority: 'high', estimatedHours: 6, tags: ['CMC', 'Review'] },
      { title: 'Validate Analytical Methods', priority: 'high', estimatedHours: 8, tags: ['CMC', 'Analytical'] },
      { title: 'Check Stability Data Completeness', priority: 'medium', estimatedHours: 4, tags: ['CMC', 'Stability'] },
      { title: 'Verify Manufacturing Process', priority: 'high', estimatedHours: 10, tags: ['CMC', 'Manufacturing'] },
      { title: 'Review Batch Records', priority: 'medium', estimatedHours: 6, tags: ['CMC', 'Batch'] },
    ],
  },
  'STABILITY_STUDY': {
    name: 'Stability Study Setup',
    description: 'Tasks for initiating a new stability study',
    icon: Timer,
    tasks: [
      { title: 'Draft Stability Protocol', priority: 'high', estimatedHours: 8, tags: ['Stability', 'Protocol'] },
      { title: 'Prepare Sample Pull Schedule', priority: 'high', estimatedHours: 2, tags: ['Stability', 'Schedule'] },
      { title: 'Set Up Stability Chambers', priority: 'medium', estimatedHours: 4, tags: ['Stability', 'Equipment'] },
      { title: 'Create Sample Tracking System', priority: 'medium', estimatedHours: 3, tags: ['Stability', 'Tracking'] },
      { title: 'Define Testing Parameters', priority: 'high', estimatedHours: 5, tags: ['Stability', 'Testing'] },
    ],
  },
  'REGULATORY_RESPONSE': {
    name: 'Regulatory Response Package',
    description: 'Tasks for responding to regulatory inquiries',
    icon: Send,
    tasks: [
      { title: 'Analyze Regulatory Query', priority: 'urgent', estimatedHours: 3, tags: ['Regulatory', 'Analysis'] },
      { title: 'Gather Supporting Documentation', priority: 'high', estimatedHours: 8, tags: ['Regulatory', 'Documentation'] },
      { title: 'Draft Response Document', priority: 'high', estimatedHours: 12, tags: ['Regulatory', 'Response'] },
      { title: 'Internal Review and Approval', priority: 'high', estimatedHours: 6, tags: ['Regulatory', 'Review'] },
      { title: 'Format and Submit Response', priority: 'medium', estimatedHours: 4, tags: ['Regulatory', 'Submission'] },
    ],
  },
};

// Role definitions
const ROLES = {
  ADMIN: { name: 'Administrator', permissions: ['all'] },
  MANAGER: { name: 'Manager', permissions: ['create', 'edit', 'delete', 'assign', 'approve'] },
  CONTRIBUTOR: { name: 'Contributor', permissions: ['create', 'edit', 'comment'] },
  VIEWER: { name: 'Viewer', permissions: ['view', 'comment'] },
};

// Team members with roles
const TEAM_MEMBERS = [
  { id: 'user1', name: 'Sarah Johnson', role: 'Regulatory Affairs Manager', avatar: '👩‍⚕️', systemRole: 'MANAGER', capacity: 40 },
  { id: 'user2', name: 'Michael Chen', role: 'CMC Documentation Specialist', avatar: '👨‍💼', systemRole: 'CONTRIBUTOR', capacity: 35 },
  { id: 'user3', name: 'Jennifer Williams', role: 'Quality Assurance Lead', avatar: '👩‍🔬', systemRole: 'MANAGER', capacity: 38 },
  { id: 'user4', name: 'Robert Miller', role: 'Formulation Scientist', avatar: '👨‍🔬', systemRole: 'CONTRIBUTOR', capacity: 40 },
  { id: 'user5', name: 'Emily Davis', role: 'Clinical Documentation Writer', avatar: '👩‍💻', systemRole: 'CONTRIBUTOR', capacity: 36 },
  { id: 'user6', name: 'David Thompson', role: 'Analytical Method Specialist', avatar: '👨‍🔬', systemRole: 'CONTRIBUTOR', capacity: 40 },
  { id: 'user7', name: 'Lisa Roberts', role: 'Regulatory Submission Manager', avatar: '👩‍💼', systemRole: 'ADMIN', capacity: 42 },
];

/**
 * Enhanced Task Management System with all production features
 */
const TaskManagementSystemEnhanced = ({ processId, moduleType = 'CMC' }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State Management
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentView, setCurrentView] = useState('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [advancedFilters, setAdvancedFilters] = useState({
    status: 'all',
    priority: 'all',
    assignee: 'all',
    dateRange: { start: null, end: null },
    tags: [],
    module: 'all',
  });
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [showBatchOperationsDialog, setShowBatchOperationsDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showAnalyticsDialog, setShowAnalyticsDialog] = useState(false);
  const [showRoleManagementDialog, setShowRoleManagementDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [ganttZoom, setGanttZoom] = useState('month');
  const [socketConnected, setSocketConnected] = useState(false);
  const [currentUser, setCurrentUser] = useState(TEAM_MEMBERS[6]); // Default to admin user
  const [savedSearches, setSavedSearches] = useState([]);
  const [escalationSettings, setEscalationSettings] = useState({
    enabled: true,
    warningHours: 24,
    autoEscalate: true,
    notifyManager: true,
  });

  // New task form state with proper defaults
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium',
    deadline: '',
    assignee: '',
    moduleType: moduleType,
    estimatedHours: 8,
    tags: [],
    regulatoryRequirement: false,
    dependencies: [],
  });

  // Socket.io connection management
  useEffect(() => {
    socket.on('connect', () => {
      setSocketConnected(true);
      console.log('WebSocket connected');
      socket.emit('join-room', { room: `tasks-${processId || 'global'}` });
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
      console.log('WebSocket disconnected');
    });

    socket.on('task-created', (task) => {
      queryClient.invalidateQueries(['tasks']);
      toast({
        title: 'New Task Created',
        description: `${task.title} has been created by ${task.createdBy}`,
      });
    });

    socket.on('task-updated', (task) => {
      queryClient.invalidateQueries(['tasks']);
      toast({
        title: 'Task Updated',
        description: `${task.title} has been updated`,
      });
    });

    socket.on('task-deleted', (taskId) => {
      queryClient.invalidateQueries(['tasks']);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('task-created');
      socket.off('task-updated');
      socket.off('task-deleted');
    };
  }, [processId, queryClient, toast]);

  // Fetch tasks from API
  const { data: tasksData, isLoading, error } = useQuery({
    queryKey: ['tasks', moduleType, advancedFilters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (moduleType) params.append('moduleType', moduleType);
      if (advancedFilters.status !== 'all') params.append('status', advancedFilters.status);
      if (advancedFilters.priority !== 'all') params.append('priority', advancedFilters.priority);
      if (advancedFilters.assignee !== 'all') params.append('assigneeId', advancedFilters.assignee);
      
      const response = await fetch(`/api/regulatory/tasks/all?${params}`);
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const tasks = tasksData?.tasks || [];

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (taskData) => {
      const response = await fetch('/api/regulatory/tasks/unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...taskData,
          organizationId: 1, // TODO: Get from context
          createdBy: currentUser.name,
        }),
      });
      if (!response.ok) throw new Error('Failed to create task');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['tasks']);
      socket.emit('task-created', data.task);
      toast({
        title: 'Task Created',
        description: 'Task has been successfully created',
      });
      setShowNewTaskDialog(false);
      resetNewTaskForm();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create task',
        variant: 'destructive',
      });
    },
  });

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }) => {
      const response = await fetch(`/api/regulatory/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update task');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['tasks']);
      socket.emit('task-updated', data.task);
      toast({
        title: 'Task Updated',
        description: 'Task has been successfully updated',
      });
    },
  });

  // Batch operations mutation
  const batchUpdateMutation = useMutation({
    mutationFn: async ({ taskIds, updates }) => {
      const promises = taskIds.map(taskId =>
        fetch(`/api/regulatory/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['tasks']);
      toast({
        title: 'Batch Update Complete',
        description: `${selectedTasks.size} tasks have been updated`,
      });
      setSelectedTasks(new Set());
      setShowBatchOperationsDialog(false);
    },
  });

  // Helper functions
  const resetNewTaskForm = () => {
    setNewTask({
      title: '',
      description: '',
      priority: 'medium',
      deadline: '',
      assignee: '',
      moduleType: moduleType,
      estimatedHours: 8,
      tags: [],
      regulatoryRequirement: false,
      dependencies: [],
    });
  };

  const handleCreateTask = () => {
    createTaskMutation.mutate(newTask);
  };

  const isTaskFormValid = () => {
    return newTask.title && newTask.priority && newTask.deadline && newTask.assignee;
  };

  const handleBatchOperation = (operation, value) => {
    const taskIds = Array.from(selectedTasks);
    
    switch (operation) {
      case 'assign':
        batchUpdateMutation.mutate({ taskIds, updates: { assignee: value } });
        break;
      case 'status':
        batchUpdateMutation.mutate({ taskIds, updates: { status: value } });
        break;
      case 'priority':
        batchUpdateMutation.mutate({ taskIds, updates: { priority: value } });
        break;
      case 'delete':
        if (window.confirm(`Delete ${taskIds.length} tasks?`)) {
          taskIds.forEach(taskId => {
            fetch(`/api/regulatory/tasks/${taskId}`, { method: 'DELETE' });
          });
          queryClient.invalidateQueries(['tasks']);
          setSelectedTasks(new Set());
        }
        break;
    }
  };

  const applyTemplate = (templateKey) => {
    const template = TASK_TEMPLATES[templateKey];
    if (!template) return;

    const tasksToCreate = template.tasks.map(task => ({
      ...task,
      moduleType: moduleType,
      assignee: '',
      deadline: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      organizationId: 1,
      createdBy: currentUser.name,
    }));

    Promise.all(tasksToCreate.map(task => 
      fetch('/api/regulatory/tasks/unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      })
    )).then(() => {
      queryClient.invalidateQueries(['tasks']);
      toast({
        title: 'Template Applied',
        description: `${tasksToCreate.length} tasks created from ${template.name}`,
      });
      setShowTemplateDialog(false);
    });
  };

  const checkEscalations = useCallback(() => {
    if (!escalationSettings.enabled) return;

    const now = new Date();
    const warningTime = addDays(now, -1); // 24 hours before deadline

    tasks.forEach(task => {
      if (task.status === 'completed') return;
      
      const deadline = parseISO(task.deadline);
      const isOverdue = isBefore(deadline, now);
      const needsWarning = isBefore(deadline, warningTime) && isAfter(deadline, now);

      if (isOverdue && escalationSettings.autoEscalate) {
        // Auto-escalate overdue tasks
        updateTaskMutation.mutate({
          taskId: task.id,
          updates: { priority: 'urgent', escalated: true }
        });
        
        if (escalationSettings.notifyManager) {
          // Send notification to manager
          toast({
            title: 'Task Escalated',
            description: `${task.title} is overdue and has been escalated`,
            variant: 'destructive',
          });
        }
      } else if (needsWarning) {
        toast({
          title: 'Task Deadline Warning',
          description: `${task.title} is due in less than 24 hours`,
          variant: 'warning',
        });
      }
    });
  }, [tasks, escalationSettings, updateTaskMutation, toast]);

  // Run escalation check every 5 minutes
  useEffect(() => {
    const interval = setInterval(checkEscalations, 5 * 60 * 1000);
    checkEscalations(); // Run immediately
    return () => clearInterval(interval);
  }, [checkEscalations]);

  // Calculate workload for team members
  const teamWorkload = useMemo(() => {
    const workload = {};
    TEAM_MEMBERS.forEach(member => {
      workload[member.id] = {
        ...member,
        assignedTasks: tasks.filter(t => t.assignee === member.id).length,
        totalHours: tasks
          .filter(t => t.assignee === member.id && t.status !== 'completed')
          .reduce((sum, t) => sum + (t.estimatedHours || 0), 0),
      };
    });
    return workload;
  }, [tasks]);

  // Generate analytics data
  const analyticsData = useMemo(() => {
    const statusCounts = tasks.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {});

    const priorityCounts = tasks.reduce((acc, task) => {
      acc[task.priority] = (acc[task.priority] || 0) + 1;
      return acc;
    }, {});

    const moduleProgress = tasks.reduce((acc, task) => {
      if (!acc[task.moduleType]) {
        acc[task.moduleType] = { total: 0, completed: 0 };
      }
      acc[task.moduleType].total++;
      if (task.status === 'completed') {
        acc[task.moduleType].completed++;
      }
      return acc;
    }, {});

    const overdueTasks = tasks.filter(task => 
      task.status !== 'completed' && isBefore(parseISO(task.deadline), new Date())
    ).length;

    const avgCompletionTime = tasks
      .filter(t => t.status === 'completed' && t.completedAt)
      .reduce((acc, task) => {
        const created = parseISO(task.createdAt);
        const completed = parseISO(task.completedAt);
        return acc + differenceInDays(completed, created);
      }, 0) / tasks.filter(t => t.status === 'completed').length || 0;

    return {
      statusCounts,
      priorityCounts,
      moduleProgress,
      overdueTasks,
      avgCompletionTime,
      totalTasks: tasks.length,
      completionRate: (statusCounts.completed || 0) / tasks.length * 100,
    };
  }, [tasks]);

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text('Task Management Report', 20, 10);
    doc.text(`Generated: ${format(new Date(), 'PPP')}`, 20, 20);
    
    const tableData = tasks.map(task => [
      task.title,
      task.status,
      task.priority,
      task.assignee,
      format(parseISO(task.deadline), 'PP'),
    ]);

    doc.autoTable({
      head: [['Title', 'Status', 'Priority', 'Assignee', 'Deadline']],
      body: tableData,
      startY: 30,
    });

    doc.save('task-report.pdf');
  };

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(tasks);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tasks');
    XLSX.writeFile(workbook, 'tasks.xlsx');
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Task Management System
            </h1>
            <Badge variant={socketConnected ? 'default' : 'destructive'}>
              {socketConnected ? (
                <>
                  <Wifi className="h-3 w-3 mr-1" />
                  Live
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 mr-1" />
                  Offline
                </>
              )}
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Actions */}
            <Button
              onClick={() => setShowTemplateDialog(true)}
              variant="outline"
              size="sm"
            >
              <Template className="h-4 w-4 mr-2" />
              Templates
            </Button>

            <Button
              onClick={() => setShowAnalyticsDialog(true)}
              variant="outline"
              size="sm"
            >
              <BarChart className="h-4 w-4 mr-2" />
              Analytics
            </Button>

            {selectedTasks.size > 0 && (
              <Button
                onClick={() => setShowBatchOperationsDialog(true)}
                variant="outline"
                size="sm"
              >
                <Layers className="h-4 w-4 mr-2" />
                Batch ({selectedTasks.size})
              </Button>
            )}

            <Button
              onClick={() => setShowNewTaskDialog(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              size="sm"
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              New Task
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mt-4 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search tasks..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Select
            value={advancedFilters.status}
            onValueChange={(value) => setAdvancedFilters({...advancedFilters, status: value})}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in-progress">In Progress</SelectItem>
              <SelectItem value="review">Review</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={advancedFilters.priority}
            onValueChange={(value) => setAdvancedFilters({...advancedFilters, priority: value})}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Advanced
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="mx-6 mt-4">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="gantt">Gantt Chart</TabsTrigger>
          <TabsTrigger value="workload">Workload</TabsTrigger>
          <TabsTrigger value="escalations">Escalations</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="flex-1 px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analyticsData.totalTasks}</div>
                <p className="text-xs text-muted-foreground">
                  {analyticsData.completionRate.toFixed(1)}% complete
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Overdue Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{analyticsData.overdueTasks}</div>
                <p className="text-xs text-muted-foreground">
                  Requires immediate attention
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Avg. Completion</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analyticsData.avgCompletionTime.toFixed(1)}</div>
                <p className="text-xs text-muted-foreground">
                  Days to complete
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Team Capacity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Object.values(teamWorkload).reduce((sum, m) => sum + m.totalHours, 0)}h
                </div>
                <p className="text-xs text-muted-foreground">
                  Total workload
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Task List */}
          <Card>
            <CardHeader>
              <CardTitle>Tasks Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        checked={selectedTasks.size === tasks.length && tasks.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedTasks(new Set(tasks.map(t => t.id)));
                          } else {
                            setSelectedTasks(new Set());
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedTasks.has(task.id)}
                          onCheckedChange={(checked) => {
                            const newSelected = new Set(selectedTasks);
                            if (checked) {
                              newSelected.add(task.id);
                            } else {
                              newSelected.delete(task.id);
                            }
                            setSelectedTasks(newSelected);
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{task.title}</TableCell>
                      <TableCell>
                        <Badge variant={task.status === 'completed' ? 'default' : 'secondary'}>
                          {task.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            task.priority === 'urgent' ? 'destructive' :
                            task.priority === 'high' ? 'warning' :
                            'outline'
                          }
                        >
                          {task.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>{task.assignee}</TableCell>
                      <TableCell>{task.deadline}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem>View Details</DropdownMenuItem>
                            <DropdownMenuItem>Edit</DropdownMenuItem>
                            <DropdownMenuItem>Assign</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gantt" className="flex-1 px-6">
          <GanttChartView
            tasks={tasks.map(task => ({
              ...task,
              startDate: task.createdAt || format(new Date(), 'yyyy-MM-dd'),
              completionPercentage: task.progress || 0,
              isMilestone: task.tags?.includes('milestone'),
            }))}
            dependencies={tasks.flatMap(task => 
              (task.dependencies || []).map(depId => ({
                sourceId: depId,
                targetId: task.id,
                type: 'finish-to-start',
                isBlocking: true,
              }))
            )}
            onTaskUpdate={updateTaskMutation.mutate}
            onTaskClick={(task) => {
              // Handle task click in Gantt
              console.log('Task clicked in Gantt:', task);
            }}
          />
        </TabsContent>

        <TabsContent value="workload" className="flex-1 px-6">
          <div className="grid gap-4">
            {Object.values(teamWorkload).map((member) => (
              <Card key={member.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{member.avatar}</div>
                      <div>
                        <CardTitle className="text-base">{member.name}</CardTitle>
                        <CardDescription>{member.role}</CardDescription>
                      </div>
                    </div>
                    <Badge variant={member.totalHours > member.capacity ? 'destructive' : 'default'}>
                      {member.totalHours}h / {member.capacity}h
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Progress
                    value={(member.totalHours / member.capacity) * 100}
                    className={cn(
                      "h-2",
                      member.totalHours > member.capacity && "bg-red-200"
                    )}
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    {member.assignedTasks} tasks assigned
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="escalations" className="flex-1 px-6">
          <div className="space-y-4">
            {/* Escalation Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Escalation Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="auto-escalate">Automatic Escalation</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically escalate overdue tasks to managers
                    </p>
                  </div>
                  <Switch
                    id="auto-escalate"
                    checked={escalationSettings.autoEscalate}
                    onCheckedChange={(checked) =>
                      setEscalationSettings({...escalationSettings, autoEscalate: checked})
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="notify-manager">Manager Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Send notifications to managers for escalated tasks
                    </p>
                  </div>
                  <Switch
                    id="notify-manager"
                    checked={escalationSettings.notifyManager}
                    onCheckedChange={(checked) =>
                      setEscalationSettings({...escalationSettings, notifyManager: checked})
                    }
                  />
                </div>

                <div>
                  <Label>Warning Period (hours before deadline)</Label>
                  <Slider
                    value={[escalationSettings.warningHours]}
                    onValueChange={(value) =>
                      setEscalationSettings({...escalationSettings, warningHours: value[0]})
                    }
                    max={72}
                    step={1}
                    className="mt-2"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {escalationSettings.warningHours} hours
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Escalated Tasks */}
            <Card>
              <CardHeader>
                <CardTitle>Escalated Tasks</CardTitle>
                <CardDescription>
                  Tasks that have been escalated or are at risk
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {tasks
                    .filter(task => {
                      const deadline = parseISO(task.deadline);
                      const now = new Date();
                      const hoursUntilDeadline = differenceInDays(deadline, now) * 24;
                      return (
                        task.status !== 'completed' &&
                        (isBefore(deadline, now) || hoursUntilDeadline < escalationSettings.warningHours)
                      );
                    })
                    .map(task => {
                      const deadline = parseISO(task.deadline);
                      const isOverdue = isBefore(deadline, new Date());
                      return (
                        <Card key={task.id} className="border-l-4 border-l-red-500">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-semibold">{task.title}</h4>
                                <p className="text-sm text-muted-foreground">
                                  Assigned to: {task.assignee}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {isOverdue ? (
                                  <Badge variant="destructive">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    Overdue
                                  </Badge>
                                ) : (
                                  <Badge variant="warning">
                                    <Clock className="h-3 w-3 mr-1" />
                                    Due Soon
                                  </Badge>
                                )}
                                <Button size="sm" variant="outline">
                                  Escalate Now
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Task Dialog */}
      <Dialog open={showNewTaskDialog} onOpenChange={setShowNewTaskDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
            <DialogDescription>
              Add a new task to the system with all required details.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Task Title *</Label>
              <Input
                id="title"
                value={newTask.title}
                onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                placeholder="Enter task title"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={newTask.description}
                onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                placeholder="Enter task description"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="priority">Priority *</Label>
                <Select
                  value={newTask.priority}
                  onValueChange={(value) => setNewTask({...newTask, priority: value})}
                >
                  <SelectTrigger id="priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="deadline">Deadline *</Label>
                <Input
                  id="deadline"
                  type="date"
                  value={newTask.deadline}
                  onChange={(e) => setNewTask({...newTask, deadline: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="assignee">Assignee *</Label>
                <Select
                  value={newTask.assignee}
                  onValueChange={(value) => setNewTask({...newTask, assignee: value})}
                >
                  <SelectTrigger id="assignee">
                    <SelectValue placeholder="Select assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_MEMBERS.map(member => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.avatar} {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="hours">Estimated Hours</Label>
                <Input
                  id="hours"
                  type="number"
                  value={newTask.estimatedHours}
                  onChange={(e) => setNewTask({...newTask, estimatedHours: parseInt(e.target.value)})}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={newTask.tags.join(', ')}
                onChange={(e) => setNewTask({
                  ...newTask,
                  tags: e.target.value.split(',').map(t => t.trim()).filter(t => t)
                })}
                placeholder="Enter tags separated by commas"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="regulatory"
                checked={newTask.regulatoryRequirement}
                onCheckedChange={(checked) => 
                  setNewTask({...newTask, regulatoryRequirement: checked === true})
                }
              />
              <Label htmlFor="regulatory" className="text-sm font-medium">
                This task is required for regulatory compliance
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTaskDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateTask}
              disabled={!isTaskFormValid() || createTaskMutation.isPending}
            >
              {createTaskMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create Task
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analytics Dashboard Dialog */}
      <Dialog open={showAnalyticsDialog} onOpenChange={setShowAnalyticsDialog}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Analytics Dashboard</DialogTitle>
            <DialogDescription>
              Comprehensive task management metrics and insights
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            {/* Summary Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Completion Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {analyticsData.completionRate.toFixed(1)}%
                  </div>
                  <Progress value={analyticsData.completionRate} className="mt-2" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Average Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {analyticsData.avgCompletionTime.toFixed(1)} days
                  </div>
                  <p className="text-xs text-muted-foreground">To complete tasks</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Overdue Tasks</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {analyticsData.overdueTasks}
                  </div>
                  <p className="text-xs text-muted-foreground">Requires attention</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Team Efficiency</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {Object.values(teamWorkload).reduce((acc, m) => 
                      acc + (m.totalHours / m.capacity), 0
                    ) / TEAM_MEMBERS.length * 100 | 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">Capacity utilization</p>
                </CardContent>
              </Card>
            </div>

            {/* Status Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(analyticsData.statusCounts).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={status === 'completed' ? 'default' : 'secondary'}>
                          {status}
                        </Badge>
                        <span className="text-sm">{count} tasks</span>
                      </div>
                      <Progress 
                        value={(count / analyticsData.totalTasks) * 100} 
                        className="w-32"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Module Progress */}
            <Card>
              <CardHeader>
                <CardTitle>Module Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(analyticsData.moduleProgress).map(([module, data]) => (
                    <div key={module}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{module}</span>
                        <span className="text-sm text-muted-foreground">
                          {data.completed} / {data.total}
                        </span>
                      </div>
                      <Progress 
                        value={(data.completed / data.total) * 100} 
                        className="h-2"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Priority Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Priority Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(analyticsData.priorityCounts).map(([priority, count]) => (
                    <div key={priority} className="flex items-center gap-2">
                      <Badge 
                        variant={
                          priority === 'urgent' ? 'destructive' :
                          priority === 'high' ? 'warning' :
                          'outline'
                        }
                      >
                        {priority}
                      </Badge>
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={exportToExcel}>
              <Download className="mr-2 h-4 w-4" />
              Export Excel
            </Button>
            <Button variant="outline" onClick={exportToPDF}>
              <FileBarChart className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
            <Button onClick={() => setShowAnalyticsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Task Templates</DialogTitle>
            <DialogDescription>
              Select a template to quickly create multiple related tasks.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {Object.entries(TASK_TEMPLATES).map(([key, template]) => {
              const Icon = template.icon;
              return (
                <Card
                  key={key}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => setSelectedTemplate(key)}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5 text-blue-600" />
                        <div>
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          <CardDescription>{template.description}</CardDescription>
                        </div>
                      </div>
                      {selectedTemplate === key && (
                        <CheckCircle2 className="h-5 w-5 text-blue-600" />
                      )}
                    </div>
                  </CardHeader>
                  {selectedTemplate === key && (
                    <CardContent>
                      <div className="space-y-2">
                        {template.tasks.map((task, index) => (
                          <div key={index} className="flex items-center justify-between text-sm">
                            <span>{task.title}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{task.priority}</Badge>
                              <span className="text-muted-foreground">{task.estimatedHours}h</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedTemplate && applyTemplate(selectedTemplate)}
              disabled={!selectedTemplate}
            >
              <Template className="mr-2 h-4 w-4" />
              Apply Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TaskManagementSystemEnhanced;