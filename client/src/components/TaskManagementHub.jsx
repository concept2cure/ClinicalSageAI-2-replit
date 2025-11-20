import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useQuery, useMutation } from '@tanstack/react-query';
import queryClient, { apiRequest } from '@/lib/queryClient';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Clock,
  Users,
  AlertCircle,
  CheckCircle,
  XCircle,
  PlayCircle,
  PauseCircle,
  GitBranch,
  GitMerge,
  BarChart3,
  Target,
  Zap,
  Filter,
  Plus,
  Edit3,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Maximize2,
  Grid3X3,
  List,
  Activity,
  TrendingUp,
  Bell,
  Settings,
  User,
  UserPlus,
  Package,
  FileText,
  Shield,
  Archive,
  Brain,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Area, AreaChart, Treemap, Sankey } from 'recharts';
import { format, addDays, differenceInDays, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isAfter, isBefore } from 'date-fns';
import { cn } from '@/lib/utils';
import * as d3 from 'd3';

// Constants
const TASK_STATUS_COLORS = {
  pending: '#94A3B8',
  'in-progress': '#3B82F6',
  review: '#F59E0B',
  completed: '#10B981',
  blocked: '#EF4444',
  cancelled: '#6B7280',
};

const PRIORITY_COLORS = {
  low: '#10B981',
  medium: '#F59E0B',
  high: '#F97316',
  critical: '#EF4444',
};

const MODULE_ICONS = {
  eCTD: FileText,
  CMC: Package,
  Clinical: Activity,
  Quality: Shield,
  Vault: Archive,
  Risk: AlertCircle,
  Analytics: BarChart3,
};

// Draggable Task Card Component
const DraggableTaskCard = ({ task, onStatusChange, onAssigneeChange }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'task',
    item: { id: task.taskId, task },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const ModuleIcon = MODULE_ICONS[task.moduleType] || Package;

  return (
    <div
      ref={drag}
      className={cn(
        'p-3 bg-white dark:bg-gray-800 rounded-lg border cursor-move transition-all',
        isDragging ? 'opacity-50 scale-95' : 'hover:shadow-md'
      )}
      data-testid={`task-card-${task.taskId}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <ModuleIcon className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-medium text-gray-500">{task.moduleType}</span>
        </div>
        <Badge variant={task.priority === 'critical' ? 'destructive' : 'secondary'}>
          {task.priority}
        </Badge>
      </div>
      <h4 className="text-sm font-semibold mb-1 line-clamp-2">{task.title}</h4>
      {task.description && (
        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
          {task.description}
        </p>
      )}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1">
          {task.assigneeName ? (
            <Avatar className="w-6 h-6">
              <AvatarFallback className="text-xs">
                {task.assigneeName.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
          ) : (
            <UserPlus className="w-4 h-4 text-gray-400" />
          )}
          {task.dueDate && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="w-3 h-3" />
              <span>{format(parseISO(task.dueDate), 'MMM d')}</span>
            </div>
          )}
        </div>
        <Progress value={task.completionPercentage || 0} className="w-16 h-1" />
      </div>
    </div>
  );
};

// Kanban Column Component
const KanbanColumn = ({ status, tasks, onStatusChange }) => {
  const [{ isOver }, drop] = useDrop({
    accept: 'task',
    drop: (item) => {
      if (item.task.status !== status) {
        onStatusChange(item.task.taskId, status);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  const statusConfig = {
    pending: { label: 'Pending', icon: Clock, color: 'text-gray-500' },
    'in-progress': { label: 'In Progress', icon: PlayCircle, color: 'text-blue-500' },
    review: { label: 'Review', icon: AlertCircle, color: 'text-amber-500' },
    completed: { label: 'Completed', icon: CheckCircle, color: 'text-green-500' },
    blocked: { label: 'Blocked', icon: XCircle, color: 'text-red-500' },
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <div
      ref={drop}
      className={cn(
        'flex-1 min-w-[300px] bg-gray-50 dark:bg-gray-900 rounded-lg p-4',
        isOver && 'ring-2 ring-blue-400 ring-opacity-50 bg-blue-50 dark:bg-blue-950'
      )}
      data-testid={`kanban-column-${status}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <StatusIcon className={cn('w-5 h-5', config.color)} />
          <h3 className="font-semibold">{config.label}</h3>
          <Badge variant="secondary">{tasks.length}</Badge>
        </div>
      </div>
      <ScrollArea className="h-[600px]">
        <div className="space-y-3 pr-4">
          {tasks.map((task) => (
            <DraggableTaskCard
              key={task.taskId}
              task={task}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

// Gantt Chart Component
const GanttChart = ({ tasks, onTaskUpdate }) => {
  const svgRef = useRef(null);
  const [selectedTask, setSelectedTask] = useState(null);

  useEffect(() => {
    if (!tasks || tasks.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 40, right: 40, bottom: 40, left: 200 };
    const width = 1200 - margin.left - margin.right;
    const height = tasks.length * 40 + margin.top + margin.bottom;

    // Parse dates
    const taskData = tasks.map(t => ({
      ...t,
      startDate: t.startDate ? parseISO(t.startDate) : new Date(),
      endDate: t.dueDate ? parseISO(t.dueDate) : addDays(new Date(), 7),
    }));

    // Calculate date range
    const minDate = d3.min(taskData, d => d.startDate);
    const maxDate = d3.max(taskData, d => d.endDate);
    const dateRange = [minDate, maxDate];

    // Scales
    const xScale = d3.scaleTime()
      .domain(dateRange)
      .range([0, width]);

    const yScale = d3.scaleBand()
      .domain(taskData.map(d => d.taskId))
      .range([0, height - margin.top - margin.bottom])
      .padding(0.2);

    // Create main group
    const g = svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add x-axis
    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height - margin.top - margin.bottom})`)
      .call(d3.axisBottom(xScale).tickFormat(d3.timeFormat('%b %d')));

    // Add y-axis (task names)
    g.append('g')
      .attr('class', 'y-axis')
      .call(d3.axisLeft(yScale).tickFormat(d => {
        const task = taskData.find(t => t.taskId === d);
        return task ? task.title.substring(0, 25) + '...' : '';
      }));

    // Add task bars
    const bars = g.selectAll('.task-bar')
      .data(taskData)
      .enter()
      .append('g')
      .attr('class', 'task-bar');

    bars.append('rect')
      .attr('x', d => xScale(d.startDate))
      .attr('y', d => yScale(d.taskId))
      .attr('width', d => xScale(d.endDate) - xScale(d.startDate))
      .attr('height', yScale.bandwidth())
      .attr('fill', d => TASK_STATUS_COLORS[d.status])
      .attr('rx', 4)
      .attr('ry', 4)
      .style('cursor', 'pointer')
      .on('click', (event, d) => setSelectedTask(d));

    // Add progress bars
    bars.append('rect')
      .attr('x', d => xScale(d.startDate))
      .attr('y', d => yScale(d.taskId))
      .attr('width', d => (xScale(d.endDate) - xScale(d.startDate)) * (d.completionPercentage || 0) / 100)
      .attr('height', yScale.bandwidth())
      .attr('fill', d => d3.color(TASK_STATUS_COLORS[d.status]).darker(1))
      .attr('rx', 4)
      .attr('ry', 4)
      .style('opacity', 0.7)
      .style('pointer-events', 'none');

    // Add dependencies
    const dependencies = [];
    taskData.forEach(task => {
      if (task.dependencies && Array.isArray(task.dependencies)) {
        task.dependencies.forEach(depId => {
          const depTask = taskData.find(t => t.taskId === depId);
          if (depTask) {
            dependencies.push({ source: depTask, target: task });
          }
        });
      }
    });

    const link = g.selectAll('.dependency-link')
      .data(dependencies)
      .enter()
      .append('path')
      .attr('class', 'dependency-link')
      .attr('d', d => {
        const x1 = xScale(d.source.endDate);
        const y1 = yScale(d.source.taskId) + yScale.bandwidth() / 2;
        const x2 = xScale(d.target.startDate);
        const y2 = yScale(d.target.taskId) + yScale.bandwidth() / 2;
        return `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
      })
      .attr('stroke', '#94A3B8')
      .attr('stroke-width', 2)
      .attr('fill', 'none')
      .attr('marker-end', 'url(#arrowhead)');

    // Add arrow marker
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('svg:path')
      .attr('d', 'M 0,-5 L 10,0 L 0,5')
      .attr('fill', '#94A3B8');

    // Add today line
    const today = new Date();
    if (today >= minDate && today <= maxDate) {
      g.append('line')
        .attr('class', 'today-line')
        .attr('x1', xScale(today))
        .attr('y1', 0)
        .attr('x2', xScale(today))
        .attr('y2', height - margin.top - margin.bottom)
        .attr('stroke', '#EF4444')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5');
    }
  }, [tasks]);

  return (
    <div className="overflow-x-auto">
      <svg ref={svgRef}></svg>
      {selectedTask && (
        <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedTask.title}</DialogTitle>
              <DialogDescription>{selectedTask.description}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Status</Label>
                <Select value={selectedTask.status} onValueChange={(value) => onTaskUpdate(selectedTask.taskId, { status: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Progress</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[selectedTask.completionPercentage || 0]}
                    onValueChange={(value) => onTaskUpdate(selectedTask.taskId, { completionPercentage: value[0] })}
                    max={100}
                    step={5}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium w-12">{selectedTask.completionPercentage || 0}%</span>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

// Workload Heatmap Component
const WorkloadHeatmap = ({ workloadData }) => {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!workloadData || workloadData.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 50, right: 30, bottom: 30, left: 100 };
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    // Process data
    const users = [...new Set(workloadData.map(d => d.userName))];
    const weeks = [...new Set(workloadData.map(d => d.week))];

    // Scales
    const xScale = d3.scaleBand()
      .domain(weeks)
      .range([0, width])
      .padding(0.05);

    const yScale = d3.scaleBand()
      .domain(users)
      .range([0, height])
      .padding(0.05);

    const colorScale = d3.scaleSequential(d3.interpolateRdYlGn)
      .domain([100, 0]); // Inverted for workload (red = high, green = low)

    // Create main group
    const g = svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add heatmap cells
    g.selectAll('.heatmap-cell')
      .data(workloadData)
      .enter()
      .append('rect')
      .attr('x', d => xScale(d.week))
      .attr('y', d => yScale(d.userName))
      .attr('width', xScale.bandwidth())
      .attr('height', yScale.bandwidth())
      .attr('fill', d => colorScale(d.workloadScore))
      .attr('rx', 4)
      .attr('ry', 4);

    // Add text labels
    g.selectAll('.workload-text')
      .data(workloadData)
      .enter()
      .append('text')
      .attr('x', d => xScale(d.week) + xScale.bandwidth() / 2)
      .attr('y', d => yScale(d.userName) + yScale.bandwidth() / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', d => d.workloadScore > 50 ? 'white' : 'black')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .text(d => d.workloadScore);

    // Add x-axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale));

    // Add y-axis
    g.append('g')
      .call(d3.axisLeft(yScale));

    // Add title
    g.append('text')
      .attr('x', width / 2)
      .attr('y', -20)
      .attr('text-anchor', 'middle')
      .attr('font-size', '16px')
      .attr('font-weight', 'bold')
      .text('Team Workload Distribution');

    // Add legend
    const legendWidth = 200;
    const legendHeight = 20;
    const legend = g.append('g')
      .attr('transform', `translate(${width - legendWidth}, -40)`);

    const legendScale = d3.scaleLinear()
      .domain([0, 100])
      .range([0, legendWidth]);

    const legendAxis = d3.axisBottom(legendScale)
      .ticks(5)
      .tickFormat(d => d + '%');

    legend.selectAll('.legend-cell')
      .data(d3.range(0, 100, 1))
      .enter()
      .append('rect')
      .attr('x', d => legendScale(d))
      .attr('y', 0)
      .attr('width', legendWidth / 100)
      .attr('height', legendHeight)
      .attr('fill', d => colorScale(d));

    legend.append('g')
      .attr('transform', `translate(0,${legendHeight})`)
      .call(legendAxis);
  }, [workloadData]);

  return <svg ref={svgRef}></svg>;
};

// Main Task Management Hub Component
export default function TaskManagementHub() {
  const [viewMode, setViewMode] = useState('kanban'); // kanban, gantt, list, analytics
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    module: 'all',
    assignee: 'all',
  });

  // Fetch tasks
  const { data: tasksData, isLoading: tasksLoading, refetch: refetchTasks } = useQuery({
    queryKey: ['/api/task-management/tasks', filters],
    queryFn: () => apiRequest('/api/task-management/tasks', 'GET', null, filters),
  });

  // Fetch task analytics
  const { data: analyticsData } = useQuery({
    queryKey: ['/api/task-management/tasks/analytics'],
  });

  // Fetch templates
  const { data: templatesData } = useQuery({
    queryKey: ['/api/task-management/templates'],
  });

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, ...data }) => 
      apiRequest(`/api/task-management/tasks/${taskId}`, 'PUT', data),
    onSuccess: () => {
      refetchTasks();
      toast({
        title: 'Task Updated',
        description: 'Task has been updated successfully.',
      });
    },
  });

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: (data) => 
      apiRequest('/api/task-management/tasks/bulk-update', 'POST', data),
    onSuccess: () => {
      refetchTasks();
      setSelectedTasks([]);
      setShowBulkActions(false);
      toast({
        title: 'Bulk Update Complete',
        description: `${selectedTasks.length} tasks have been updated.`,
      });
    },
  });

  // Auto-assign mutation
  const autoAssignMutation = useMutation({
    mutationFn: (taskIds) => 
      apiRequest('/api/task-management/tasks/auto-assign', 'POST', { taskIds }),
    onSuccess: () => {
      refetchTasks();
      toast({
        title: 'Auto-Assignment Complete',
        description: 'Tasks have been optimally assigned based on workload.',
      });
    },
  });

  // Generate from template mutation
  const generateFromTemplateMutation = useMutation({
    mutationFn: ({ templateId, ...data }) => 
      apiRequest(`/api/task-management/tasks/from-template/${templateId}`, 'POST', data),
    onSuccess: () => {
      refetchTasks();
      setShowTemplateDialog(false);
      toast({
        title: 'Tasks Generated',
        description: 'Tasks have been generated from the template.',
      });
    },
  });

  // Group tasks by status for kanban view
  const tasksByStatus = useMemo(() => {
    const tasks = tasksData?.data || [];
    return {
      pending: tasks.filter(t => t.status === 'pending'),
      'in-progress': tasks.filter(t => t.status === 'in-progress'),
      review: tasks.filter(t => t.status === 'review'),
      completed: tasks.filter(t => t.status === 'completed'),
      blocked: tasks.filter(t => t.status === 'blocked'),
    };
  }, [tasksData]);

  // Generate workload data for heatmap
  const workloadData = useMemo(() => {
    // This would be calculated from actual task data
    // For now, using mock data
    const users = ['John Smith', 'Jane Doe', 'Bob Johnson', 'Alice Williams'];
    const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    const data = [];
    
    users.forEach(user => {
      weeks.forEach(week => {
        data.push({
          userName: user,
          week,
          workloadScore: Math.floor(Math.random() * 100),
        });
      });
    });
    
    return data;
  }, []);

  const handleStatusChange = (taskId, newStatus) => {
    updateTaskMutation.mutate({ taskId, status: newStatus });
  };

  const handleBulkAction = (action) => {
    if (selectedTasks.length === 0) return;
    
    switch (action) {
      case 'assign':
        autoAssignMutation.mutate(selectedTasks);
        break;
      case 'update-status':
        // Show status update dialog
        break;
      case 'delete':
        // Show confirmation dialog
        break;
      default:
        break;
    }
  };

  const handleTaskSelection = (taskId) => {
    setSelectedTasks(prev => 
      prev.includes(taskId) 
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 shadow-sm border-b">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Task Management Hub</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Central command for all regulatory submission tasks
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchTasks()}
                  data-testid="button-refresh-tasks"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTemplateDialog(true)}
                  data-testid="button-use-template"
                >
                  <Package className="w-4 h-4 mr-2" />
                  Use Template
                </Button>
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  data-testid="button-create-task"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Task
                </Button>
              </div>
            </div>

            {/* View Mode Tabs */}
            <div className="flex items-center justify-between mt-4">
              <Tabs value={viewMode} onValueChange={setViewMode}>
                <TabsList>
                  <TabsTrigger value="kanban" data-testid="tab-kanban">
                    <Grid3X3 className="w-4 h-4 mr-2" />
                    Kanban
                  </TabsTrigger>
                  <TabsTrigger value="gantt" data-testid="tab-gantt">
                    <GitBranch className="w-4 h-4 mr-2" />
                    Gantt Chart
                  </TabsTrigger>
                  <TabsTrigger value="list" data-testid="tab-list">
                    <List className="w-4 h-4 mr-2" />
                    List View
                  </TabsTrigger>
                  <TabsTrigger value="analytics" data-testid="tab-analytics">
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Analytics
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Filters */}
              <div className="flex items-center gap-2">
                <Select
                  value={filters.module}
                  onValueChange={(value) => setFilters(prev => ({ ...prev, module: value }))}
                >
                  <SelectTrigger className="w-32" data-testid="filter-module">
                    <SelectValue placeholder="Module" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Modules</SelectItem>
                    <SelectItem value="eCTD">eCTD</SelectItem>
                    <SelectItem value="CMC">CMC</SelectItem>
                    <SelectItem value="Clinical">Clinical</SelectItem>
                    <SelectItem value="Quality">Quality</SelectItem>
                    <SelectItem value="Vault">Vault</SelectItem>
                    <SelectItem value="Risk">Risk</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={filters.priority}
                  onValueChange={(value) => setFilters(prev => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger className="w-32" data-testid="filter-priority">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>

                <Button variant="outline" size="sm">
                  <Filter className="w-4 h-4 mr-2" />
                  More Filters
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {selectedTasks.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-950 border-b border-blue-200 dark:border-blue-800 px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedTasks.length === tasksData?.data?.length}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedTasks(tasksData.data.map(t => t.taskId));
                    } else {
                      setSelectedTasks([]);
                    }
                  }}
                />
                <span className="text-sm font-medium">
                  {selectedTasks.length} task{selectedTasks.length !== 1 ? 's' : ''} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkAction('assign')}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Auto-Assign
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkAction('update-status')}
                >
                  <Edit3 className="w-4 h-4 mr-2" />
                  Update Status
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkAction('delete')}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="p-6">
          {/* Kanban View */}
          {viewMode === 'kanban' && (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {Object.entries(tasksByStatus).map(([status, tasks]) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  tasks={tasks}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
          )}

          {/* Gantt Chart View */}
          {viewMode === 'gantt' && (
            <Card>
              <CardHeader>
                <CardTitle>Project Timeline</CardTitle>
                <CardDescription>
                  Visual representation of task schedules and dependencies
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GanttChart
                  tasks={tasksData?.data || []}
                  onTaskUpdate={(taskId, updates) => 
                    updateTaskMutation.mutate({ taskId, ...updates })
                  }
                />
              </CardContent>
            </Card>
          )}

          {/* Analytics View */}
          {viewMode === 'analytics' && (
            <div className="space-y-6">
              {/* Metrics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Total Tasks</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analyticsData?.data?.taskStats?.totalTasks || 0}</div>
                    <Progress 
                      value={(analyticsData?.data?.taskStats?.completedTasks / analyticsData?.data?.taskStats?.totalTasks) * 100 || 0} 
                      className="mt-2"
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Completion Rate</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {Math.round((analyticsData?.data?.taskStats?.completedTasks / analyticsData?.data?.taskStats?.totalTasks) * 100 || 0)}%
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <TrendingUp className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-green-500">+12% from last month</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Overdue Tasks</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-500">
                      {analyticsData?.data?.overdueTasks || 0}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      <span className="text-sm text-red-500">Requires immediate attention</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Average Completion Time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">4.2 days</div>
                    <div className="flex items-center gap-2 mt-2">
                      <Clock className="w-4 h-4 text-blue-500" />
                      <span className="text-sm text-gray-500">Within target</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Workload Heatmap */}
              <Card>
                <CardHeader>
                  <CardTitle>Team Workload Distribution</CardTitle>
                  <CardDescription>
                    Visualize team capacity and workload balance
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <WorkloadHeatmap workloadData={workloadData} />
                </CardContent>
              </Card>

              {/* Task Distribution Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Tasks by Module</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={analyticsData?.data?.tasksByModule || []}
                          dataKey="count"
                          nameKey="moduleType"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label
                        >
                          {(analyticsData?.data?.tasksByModule || []).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Task Priority Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={analyticsData?.data?.tasksByPriority || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="priority" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#3B82F6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Team Productivity */}
              <Card>
                <CardHeader>
                  <CardTitle>Team Productivity Metrics</CardTitle>
                  <CardDescription>
                    Individual performance and contribution analysis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analyticsData?.data?.teamProductivity?.map((member) => (
                      <div key={member.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {member.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-semibold">{member.name}</div>
                            <div className="text-sm text-gray-500">
                              {member.completedTasks} completed / {member.totalTasks} total
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Progress 
                            value={(member.completedTasks / member.totalTasks) * 100} 
                            className="w-32"
                          />
                          <Badge variant="outline">
                            {Math.round(member.avgCompletion)}% avg
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </DndProvider>
  );
}