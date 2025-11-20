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
  Repeat,
  Mail,
  Phone,
  BellOff,
  Hash,
  Pause,
  Smartphone,
  Monitor,
  Tablet,
  GitBranch,
  GitCommit,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  TimerReset,
  TimerOff,
  Inbox,
  SendHorizontal,
  RotateCcw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import io from 'socket.io-client';
import { format, addDays, differenceInDays, isAfter, isBefore, parseISO, startOfDay, endOfDay, addWeeks, addMonths, formatDistanceToNow, formatDistance } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import GanttChartView from './GanttChartView';

// Initialize Socket.io connection for real-time updates
const socket = io('/', {
  path: '/socket.io/',
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
});

// Enhanced Task Templates with more options
const TASK_TEMPLATES = {
  'IND_SUBMISSION': {
    name: 'IND Submission Package',
    description: 'Standard tasks for preparing an IND submission',
    icon: Package,
    color: 'from-blue-500 to-purple-600',
    tasks: [
      { title: 'Prepare Form FDA 1571', priority: 'high', estimatedHours: 4, tags: ['IND', 'FDA', 'Form'], requiredFields: ['sponsor', 'protocol'], complianceLevel: 'critical' },
      { title: 'Compile Clinical Protocol', priority: 'high', estimatedHours: 12, tags: ['IND', 'Clinical', 'Protocol'], requiredFields: ['objectives', 'design'], complianceLevel: 'critical' },
      { title: 'Complete Chemistry Manufacturing Controls', priority: 'high', estimatedHours: 24, tags: ['IND', 'CMC'], requiredFields: ['substance', 'product'], complianceLevel: 'critical' },
      { title: 'Prepare Investigator Brochure', priority: 'medium', estimatedHours: 16, tags: ['IND', 'Documentation'], complianceLevel: 'standard' },
      { title: 'Compile Preclinical Data', priority: 'medium', estimatedHours: 20, tags: ['IND', 'Preclinical'], complianceLevel: 'standard' },
    ],
  },
  'CMC_REVIEW': {
    name: 'CMC Review Checklist',
    description: 'Standard review tasks for CMC documentation',
    icon: FileCheck,
    color: 'from-purple-500 to-pink-600',
    tasks: [
      { title: 'Review Drug Substance Specifications', priority: 'high', estimatedHours: 6, tags: ['CMC', 'Review'], requiredFields: ['specs'], complianceLevel: 'critical' },
      { title: 'Validate Analytical Methods', priority: 'high', estimatedHours: 8, tags: ['CMC', 'Analytical'], requiredFields: ['validation'], complianceLevel: 'critical' },
      { title: 'Check Stability Data Completeness', priority: 'medium', estimatedHours: 4, tags: ['CMC', 'Stability'], complianceLevel: 'standard' },
      { title: 'Verify Manufacturing Process', priority: 'high', estimatedHours: 10, tags: ['CMC', 'Manufacturing'], requiredFields: ['process'], complianceLevel: 'critical' },
      { title: 'Review Batch Records', priority: 'medium', estimatedHours: 6, tags: ['CMC', 'Batch'], complianceLevel: 'standard' },
    ],
  },
  'STABILITY_STUDY': {
    name: 'Stability Study Setup',
    description: 'Tasks for initiating a new stability study',
    icon: Timer,
    color: 'from-green-500 to-teal-600',
    tasks: [
      { title: 'Draft Stability Protocol', priority: 'high', estimatedHours: 8, tags: ['Stability', 'Protocol'], complianceLevel: 'critical' },
      { title: 'Prepare Sample Pull Schedule', priority: 'high', estimatedHours: 2, tags: ['Stability', 'Schedule'], complianceLevel: 'standard' },
      { title: 'Set Up Stability Chambers', priority: 'medium', estimatedHours: 4, tags: ['Stability', 'Equipment'], complianceLevel: 'standard' },
      { title: 'Create Sample Tracking System', priority: 'medium', estimatedHours: 3, tags: ['Stability', 'Tracking'], complianceLevel: 'standard' },
      { title: 'Define Testing Parameters', priority: 'high', estimatedHours: 5, tags: ['Stability', 'Testing'], complianceLevel: 'critical' },
    ],
  },
};

// Enhanced notification types
const NOTIFICATION_TYPES = {
  EMAIL: { icon: Mail, label: 'Email', color: 'text-blue-500' },
  SMS: { icon: Phone, label: 'SMS', color: 'text-green-500' },
  IN_APP: { icon: Bell, label: 'In-App', color: 'text-purple-500' },
  PUSH: { icon: SendHorizontal, label: 'Push', color: 'text-orange-500' },
};

// Recurrence patterns
const RECURRENCE_PATTERNS = {
  NONE: { label: 'No Recurrence', value: 'none' },
  DAILY: { label: 'Daily', value: 'daily' },
  WEEKLY: { label: 'Weekly', value: 'weekly' },
  BIWEEKLY: { label: 'Bi-Weekly', value: 'biweekly' },
  MONTHLY: { label: 'Monthly', value: 'monthly' },
  QUARTERLY: { label: 'Quarterly', value: 'quarterly' },
  CUSTOM: { label: 'Custom', value: 'custom' },
};

// Compliance levels
const COMPLIANCE_LEVELS = {
  CRITICAL: { label: 'Critical', color: 'bg-red-500', icon: ShieldAlert },
  STANDARD: { label: 'Standard', color: 'bg-yellow-500', icon: Shield },
  LOW: { label: 'Low', color: 'bg-green-500', icon: ShieldCheck },
  NONE: { label: 'None', color: 'bg-gray-500', icon: ShieldOff },
};

// Modern Task Management System Component
const ModernTaskManagementSystem = ({ projectId = 'default', organizationId = 'org1', clientWorkspaceId = 'ws1', userRole = 'admin' }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State Management
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [viewMode, setViewMode] = useState('kanban'); // kanban, list, calendar, gantt
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    assignee: 'all',
    tags: [],
    dateRange: null,
    complianceLevel: 'all',
  });
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [showTimeTracking, setShowTimeTracking] = useState(false);
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  const [activeTimer, setActiveTimer] = useState(null);
  const [timerElapsed, setTimerElapsed] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [taskHistory, setTaskHistory] = useState([]);
  
  // Notification preferences
  const [notificationPrefs, setNotificationPrefs] = useState({
    email: {
      enabled: true,
      assignments: true,
      updates: true,
      deadlines: true,
      digest: 'daily', // daily, weekly, none
    },
    sms: {
      enabled: false,
      criticalOnly: true,
    },
    inApp: {
      enabled: true,
      sound: true,
      desktop: true,
    },
    push: {
      enabled: true,
      mobile: true,
    },
  });

  // Recurrence settings state
  const [recurringTasks, setRecurringTasks] = useState([]);
  const [showRecurrenceModal, setShowRecurrenceModal] = useState(false);
  const [recurrenceSettings, setRecurrenceSettings] = useState({
    pattern: 'none',
    interval: 1,
    endDate: null,
    daysOfWeek: [],
    dayOfMonth: 1,
  });

  // Time tracking state
  const [timeEntries, setTimeEntries] = useState([]);
  const [showTimesheetModal, setShowTimesheetModal] = useState(false);
  
  // Compliance state
  const [complianceChecks, setComplianceChecks] = useState([]);
  const [complianceScore, setComplianceScore] = useState(85);
  
  // Version history state
  const [taskVersions, setTaskVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  
  // Timer effect
  useEffect(() => {
    let interval;
    if (activeTimer) {
      interval = setInterval(() => {
        setTimerElapsed(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeTimer]);

  // Real-time updates effect
  useEffect(() => {
    socket.on('taskUpdate', (data) => {
      handleRealTimeUpdate(data);
    });
    
    socket.on('notification', (notification) => {
      handleNewNotification(notification);
    });
    
    return () => {
      socket.off('taskUpdate');
      socket.off('notification');
    };
  }, []);

  // Handle real-time updates
  const handleRealTimeUpdate = (data) => {
    if (data.type === 'taskUpdated') {
      setTasks(prev => prev.map(task => 
        task.id === data.taskId ? { ...task, ...data.updates } : task
      ));
      
      // Add to history
      addToHistory(data.taskId, 'update', data.updates);
    }
  };

  // Handle new notification
  const handleNewNotification = (notification) => {
    setNotifications(prev => [notification, ...prev]);
    
    // Show toast for important notifications
    if (notification.priority === 'high') {
      toast({
        title: notification.title,
        description: notification.message,
        variant: notification.type === 'error' ? 'destructive' : 'default',
      });
    }
    
    // Play sound if enabled
    if (notificationPrefs.inApp.sound) {
      playNotificationSound();
    }
  };

  // Play notification sound
  const playNotificationSound = () => {
    const audio = new Audio('/notification.mp3');
    audio.play().catch(e => console.log('Could not play notification sound'));
  };

  // Add to task history
  const addToHistory = (taskId, action, changes) => {
    const historyEntry = {
      id: Date.now().toString(),
      taskId,
      action,
      changes,
      user: 'Current User', // Replace with actual user
      timestamp: new Date().toISOString(),
    };
    
    setTaskHistory(prev => [historyEntry, ...prev]);
    setTaskVersions(prev => [...prev, { ...tasks.find(t => t.id === taskId), versionId: historyEntry.id }]);
  };

  // Clone task function
  const cloneTask = (task) => {
    const clonedTask = {
      ...task,
      id: Date.now().toString(),
      title: `${task.title} (Copy)`,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timeSpent: 0,
    };
    
    setTasks(prev => [...prev, clonedTask]);
    
    toast({
      title: 'Task Cloned',
      description: `Successfully cloned "${task.title}"`,
    });
    
    addToHistory(clonedTask.id, 'clone', { originalTaskId: task.id });
  };

  // Create recurring task
  const createRecurringTask = (baseTask, settings) => {
    const instances = [];
    let currentDate = new Date();
    const endDate = settings.endDate ? new Date(settings.endDate) : addMonths(currentDate, 12);
    
    while (currentDate <= endDate) {
      const instance = {
        ...baseTask,
        id: `${baseTask.id}-${currentDate.getTime()}`,
        dueDate: currentDate.toISOString(),
        recurringTaskId: baseTask.id,
        recurrencePattern: settings.pattern,
      };
      
      instances.push(instance);
      
      // Calculate next occurrence
      switch (settings.pattern) {
        case 'daily':
          currentDate = addDays(currentDate, settings.interval);
          break;
        case 'weekly':
          currentDate = addWeeks(currentDate, settings.interval);
          break;
        case 'monthly':
          currentDate = addMonths(currentDate, settings.interval);
          break;
        default:
          break;
      }
    }
    
    setRecurringTasks(prev => [...prev, { baseTask, settings, instances }]);
    setTasks(prev => [...prev, ...instances]);
    
    toast({
      title: 'Recurring Task Created',
      description: `Created ${instances.length} recurring instances`,
    });
  };

  // Start/stop timer
  const toggleTimer = (taskId) => {
    if (activeTimer === taskId) {
      // Stop timer
      const entry = {
        id: Date.now().toString(),
        taskId,
        startTime: new Date(Date.now() - timerElapsed * 1000).toISOString(),
        endTime: new Date().toISOString(),
        duration: timerElapsed,
        description: 'Timer session',
      };
      
      setTimeEntries(prev => [...prev, entry]);
      
      // Update task time spent
      setTasks(prev => prev.map(task =>
        task.id === taskId
          ? { ...task, timeSpent: (task.timeSpent || 0) + timerElapsed }
          : task
      ));
      
      setActiveTimer(null);
      setTimerElapsed(0);
      
      toast({
        title: 'Timer Stopped',
        description: `Logged ${formatDuration(timerElapsed)} to task`,
      });
    } else {
      // Start timer
      setActiveTimer(taskId);
      setTimerElapsed(0);
      
      toast({
        title: 'Timer Started',
        description: 'Time tracking is active',
      });
    }
  };

  // Format duration helper
  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m ${secs}s`;
  };

  // Check compliance
  const checkCompliance = (task) => {
    const checks = [];
    
    // Check required fields
    if (task.requiredFields) {
      task.requiredFields.forEach(field => {
        checks.push({
          field,
          passed: !!task[field],
          message: `${field} is required`,
          severity: 'error',
        });
      });
    }
    
    // Check deadline
    if (task.dueDate && new Date(task.dueDate) < new Date()) {
      checks.push({
        field: 'dueDate',
        passed: false,
        message: 'Task is overdue',
        severity: 'warning',
      });
    }
    
    // Check compliance level requirements
    if (task.complianceLevel === 'critical' && !task.approvedBy) {
      checks.push({
        field: 'approval',
        passed: false,
        message: 'Critical task requires approval',
        severity: 'error',
      });
    }
    
    setComplianceChecks(checks);
    
    // Calculate compliance score
    const passedChecks = checks.filter(c => c.passed).length;
    const score = checks.length > 0 ? (passedChecks / checks.length) * 100 : 100;
    setComplianceScore(score);
    
    return checks;
  };

  // Send notification
  const sendNotification = async (type, recipient, message) => {
    switch (type) {
      case 'email':
        // Simulate email sending
        console.log('Sending email to', recipient, message);
        break;
      case 'sms':
        // Simulate SMS sending
        console.log('Sending SMS to', recipient, message);
        break;
      case 'in_app':
        handleNewNotification({
          id: Date.now().toString(),
          type: 'info',
          title: 'Task Notification',
          message,
          timestamp: new Date().toISOString(),
          priority: 'normal',
        });
        break;
      default:
        break;
    }
  };

  // Restore task version
  const restoreVersion = (versionId) => {
    const version = taskVersions.find(v => v.versionId === versionId);
    if (version) {
      setTasks(prev => prev.map(task =>
        task.id === version.id ? { ...version, versionId: undefined } : task
      ));
      
      addToHistory(version.id, 'restore', { versionId });
      
      toast({
        title: 'Version Restored',
        description: 'Task has been restored to selected version',
      });
    }
  };

  // Render main view based on viewMode
  const renderMainView = () => {
    switch (viewMode) {
      case 'kanban':
        return <KanbanView tasks={tasks} onTaskUpdate={handleTaskUpdate} />;
      case 'list':
        return <ListView tasks={tasks} onTaskUpdate={handleTaskUpdate} />;
      case 'calendar':
        return <CalendarView tasks={tasks} onTaskUpdate={handleTaskUpdate} />;
      case 'gantt':
        return <GanttChartView tasks={tasks} onTaskUpdate={handleTaskUpdate} />;
      default:
        return null;
    }
  };

  // Handle task update
  const handleTaskUpdate = (taskId, updates) => {
    setTasks(prev => prev.map(task =>
      task.id === taskId ? { ...task, ...updates, updatedAt: new Date().toISOString() } : task
    ));
    
    addToHistory(taskId, 'update', updates);
    
    // Check compliance after update
    const updatedTask = tasks.find(t => t.id === taskId);
    if (updatedTask) {
      checkCompliance({ ...updatedTask, ...updates });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 relative">
      {/* Animated background mesh */}
      <div className="fixed inset-0 opacity-5 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-purple-500 to-teal-500 animate-gradient" />
      </div>

      {/* Main Container */}
      <div className="relative z-10 p-6 space-y-6">
        {/* Modern Header with Glass Effect */}
        <div className="glass-panel rounded-2xl p-6 animate-slideUp">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Modern Task Management
              </h1>
              <p className="text-gray-600 mt-1">
                Streamline your workflow with advanced task tracking
              </p>
            </div>
            
            {/* Notification Center */}
            <div className="flex items-center gap-4">
              {/* Compliance Score */}
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white shadow-sm">
                <ShieldCheck className="w-5 h-5 text-green-500" />
                <span className="text-sm font-semibold">{complianceScore}%</span>
              </div>
              
              {/* Active Timer Display */}
              {activeTimer && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white animate-pulse">
                  <Timer className="w-5 h-5" />
                  <span className="font-mono font-semibold">{formatDuration(timerElapsed)}</span>
                </div>
              )}
              
              {/* Notification Bell */}
              <button
                className="relative p-2 rounded-xl bg-white shadow-sm hover:shadow-md transition-all notification-badge"
                data-count={notifications.filter(n => !n.read).length || ''}
                onClick={() => setShowNotificationSettings(true)}
              >
                <Bell className="w-5 h-5 text-gray-700" />
              </button>
              
              {/* Create New Task Button */}
              <Button
                onClick={() => setShowCreateModal(true)}
                className="btn-gradient flex items-center gap-2"
              >
                <PlusCircle className="w-5 h-5" />
                Create Task
              </Button>
            </div>
          </div>
          
          {/* View Mode Switcher */}
          <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-xl w-fit">
            {[
              { value: 'kanban', icon: Kanban, label: 'Kanban' },
              { value: 'list', icon: ListTodo, label: 'List' },
              { value: 'calendar', icon: Calendar, label: 'Calendar' },
              { value: 'gantt', icon: GanttChart, label: 'Gantt' },
            ].map((mode) => (
              <button
                key={mode.value}
                onClick={() => setViewMode(mode.value)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg transition-all',
                  viewMode === mode.value
                    ? 'bg-white shadow-sm text-blue-600'
                    : 'text-gray-600 hover:bg-white/50'
                )}
              >
                <mode.icon className="w-4 h-4" />
                <span className="text-sm font-medium">{mode.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Filters Bar */}
        <div className="glass-panel rounded-2xl p-4 animate-slideUp" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-4 flex-wrap">
            <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={filters.priority} onValueChange={(value) => setFilters(prev => ({ ...prev, priority: value }))}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={filters.complianceLevel} onValueChange={(value) => setFilters(prev => ({ ...prev, complianceLevel: value }))}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Compliance" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Quick Actions */}
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTimesheetModal(true)}
                className="flex items-center gap-2"
              >
                <FileBarChart className="w-4 h-4" />
                Timesheet
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowComplianceModal(true)}
                className="flex items-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                Compliance
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistoryModal(true)}
                className="flex items-center gap-2"
              >
                <History className="w-4 h-4" />
                History
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="animate-slideUp" style={{ animationDelay: '0.2s' }}>
          {renderMainView()}
        </div>

        {/* Floating Action Button */}
        <div className="fab">
          <PlusCircle className="w-6 h-6" />
        </div>
      </div>

      {/* Modals will be added here */}
    </div>
  );
};

// Kanban View Component
const KanbanView = ({ tasks, onTaskUpdate }) => {
  const columns = ['pending', 'in_progress', 'review', 'completed'];
  const columnConfig = {
    pending: { label: 'To Do', color: 'from-gray-400 to-gray-500' },
    in_progress: { label: 'In Progress', color: 'from-blue-400 to-blue-600' },
    review: { label: 'Review', color: 'from-purple-400 to-purple-600' },
    completed: { label: 'Done', color: 'from-green-400 to-green-600' },
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {columns.map((column) => (
        <div key={column} className="space-y-4">
          <div className="glass-panel rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-700">{columnConfig[column].label}</h3>
              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gradient-to-r text-white ${columnConfig[column].color}">
                {tasks.filter(t => t.status === column).length}
              </span>
            </div>
            
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {tasks
                  .filter(task => task.status === column)
                  .map(task => (
                    <TaskCard key={task.id} task={task} onUpdate={onTaskUpdate} />
                  ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      ))}
    </div>
  );
};

// Task Card Component
const TaskCard = ({ task, onUpdate }) => {
  return (
    <div className="card-3d bg-white p-4 rounded-xl cursor-pointer hover:shadow-lg transition-all">
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-medium text-gray-800 line-clamp-2">{task.title}</h4>
        <Badge
          className={cn(
            'text-xs',
            task.priority === 'urgent' && 'bg-red-100 text-red-700',
            task.priority === 'high' && 'bg-orange-100 text-orange-700',
            task.priority === 'medium' && 'bg-yellow-100 text-yellow-700',
            task.priority === 'low' && 'bg-green-100 text-green-700'
          )}
        >
          {task.priority}
        </Badge>
      </div>
      
      {task.description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{task.description}</p>
      )}
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {task.assignee && (
            <Avatar className="w-6 h-6">
              <AvatarFallback>{task.assignee[0]}</AvatarFallback>
            </Avatar>
          )}
          {task.dueDate && (
            <span className="text-xs text-gray-500">
              {formatDistanceToNow(new Date(task.dueDate), { addSuffix: true })}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          {task.timeTracking && (
            <Timer className="w-4 h-4 text-gray-400" />
          )}
          {task.hasAttachments && (
            <Paperclip className="w-4 h-4 text-gray-400" />
          )}
          {task.comments > 0 && (
            <MessageSquare className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>
    </div>
  );
};

// ListView Component (placeholder)
const ListView = ({ tasks, onTaskUpdate }) => {
  return <div>List View - To be implemented</div>;
};

// CalendarView Component (placeholder)
const CalendarView = ({ tasks, onTaskUpdate }) => {
  return <div>Calendar View - To be implemented</div>;
};

export default ModernTaskManagementSystem;