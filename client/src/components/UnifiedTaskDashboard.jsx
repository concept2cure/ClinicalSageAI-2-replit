/**
 * Unified Task Dashboard Component
 * 
 * Production-ready dashboard that connects ALL modules in the Regulatory Submission Center.
 * Shows tasks from Protocol Design, CMC, Medical Device, IND Wizard, eCTD Co-Author, and Vault.
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import UnifiedTaskCreationModal from './UnifiedTaskCreationModal';
import {
  FlaskConical, FileText, Activity, BookOpen, Archive, Clipboard, ChevronRight, AlertCircle, CheckCircle, Clock, Users, Link2, Filter, ArrowUpDown, Target, TrendingUp, AlertTriangle, Loader2, RefreshCw, ChevronDown, ChevronUp, Circle, CheckCircle2, XCircle, Timer, PauseCircle, Plus } from 'lucide-react'

// Module configuration with colors and icons
const MODULE_CONFIG = {
  CMC: {
    name: 'CMC Module',
    color: 'bg-blue-500',
    lightColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-500',
    icon: FlaskConical,
    route: '/cmc',
  },
  IND: {
    name: 'IND Wizard',
    color: 'bg-green-500',
    lightColor: 'bg-green-100',
    textColor: 'text-green-700',
    borderColor: 'border-green-500',
    icon: FileText,
    route: '/ind-wizard',
  },
  MedicalDevice: {
    name: 'Medical Device',
    color: 'bg-purple-500',
    lightColor: 'bg-purple-100',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-500',
    icon: Activity,
    route: '/510k-preparation',
  },
  eCTD: {
    name: 'eCTD Co-Author',
    color: 'bg-amber-500',
    lightColor: 'bg-amber-100',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-500',
    icon: BookOpen,
    route: '/ectd-coauthor',
  },
  Vault: {
    name: 'Trial Vault',
    color: 'bg-pink-500',
    lightColor: 'bg-pink-100',
    textColor: 'text-pink-700',
    borderColor: 'border-pink-500',
    icon: Archive,
    route: '/vault',
  },
  ProtocolDesign: {
    name: 'Protocol Design',
    color: 'bg-cyan-500',
    lightColor: 'bg-cyan-100',
    textColor: 'text-cyan-700',
    borderColor: 'border-cyan-500',
    icon: Clipboard,
    route: '/protocol-design',
  },
};

// Task status icons
const STATUS_ICONS = {
  pending: Circle,
  'in-progress': Timer,
  review: PauseCircle,
  completed: CheckCircle2,
  blocked: XCircle,
  cancelled: XCircle,
};

// Priority colors
const PRIORITY_COLORS = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export default function UnifiedTaskDashboard({ organizationId = 7, projectId }) {
  const [selectedModule, setSelectedModule] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState('all');
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch unified dashboard metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['/api/regulatory/dashboard/unified', organizationId, projectId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('organizationId', organizationId);
      if (projectId) params.append('projectId', projectId);
      
      const response = await fetch(`/api/regulatory/dashboard/unified?${params}`);
      if (!response.ok) throw new Error('Failed to fetch dashboard metrics');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch all tasks
  const { data: tasksData, isLoading: tasksLoading, refetch: refetchTasks } = useQuery({
    queryKey: ['/api/regulatory/tasks/all', organizationId, projectId, selectedModule, selectedStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('organizationId', organizationId);
      if (projectId) params.append('projectId', projectId);
      if (selectedModule !== 'all') params.append('moduleType', selectedModule);
      if (selectedStatus !== 'all') params.append('status', selectedStatus);
      params.append('limit', '100');
      
      const response = await fetch(`/api/regulatory/tasks/all?${params}`);
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
  });

  // Sync tasks from module mutation
  const syncTasksMutation = useMutation({
    mutationFn: async (module) => {
      const response = await fetch(`/api/regulatory/tasks/sync/${module}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });
      if (!response.ok) throw new Error('Failed to sync tasks');
      return response.json();
    },
    onSuccess: (data, module) => {
      toast({
        title: 'Tasks Synced Successfully',
        description: `Synced ${data.syncResult.synced} tasks from ${MODULE_CONFIG[module].name}`,
      });
      queryClient.invalidateQueries(['/api/regulatory/tasks/all']);
      queryClient.invalidateQueries(['/api/regulatory/dashboard/unified']);
    },
    onError: (error) => {
      toast({
        title: 'Sync Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Update task status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }) => {
      const response = await fetch(`/api/regulatory/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Failed to update task status');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['/api/regulatory/tasks/all']);
      queryClient.invalidateQueries(['/api/regulatory/dashboard/unified']);
    },
  });

  // Filter tasks based on selected filters
  const filteredTasks = useMemo(() => {
    if (!tasksData?.tasks) return [];
    
    let filtered = [...tasksData.tasks];
    
    if (selectedPriority !== 'all') {
      filtered = filtered.filter(task => task.priority === selectedPriority);
    }
    
    return filtered.sort((a, b) => {
      // Sort by priority first, then by due date
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Then by due date
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate) - new Date(b.dueDate);
      }
      return 0;
    });
  }, [tasksData, selectedPriority]);

  // Handle task click - navigate to appropriate module
  const handleTaskClick = (task) => {
    const moduleConfig = MODULE_CONFIG[task.moduleType];
    if (moduleConfig?.route) {
      navigate(moduleConfig.route);
    }
  };

  // Toggle task expansion
  const toggleTaskExpansion = (taskId) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  // Sync all modules
  const syncAllModules = async () => {
    setIsLoading(true);
    try {
      for (const module of Object.keys(MODULE_CONFIG)) {
        await syncTasksMutation.mutateAsync(module);
      }
      toast({
        title: 'All Modules Synced',
        description: 'Successfully synced tasks from all modules',
      });
    } catch (error) {
      console.error('Error syncing modules:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (metricsLoading || tasksLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const metricsData = metrics?.metrics || {};

  return (
    <div className="space-y-6">
      {/* Header with sync and create buttons */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Unified Task Management</h2>
          <p className="text-gray-600 mt-1">
            Comprehensive view of all tasks across all regulatory modules
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2"
            variant="default"
          >
            <Plus className="h-4 w-4" />
            Create Task
          </Button>
          <Button
            onClick={syncAllModules}
            disabled={isLoading}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Sync All Modules
          </Button>
        </div>
      </div>

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricsData.totalTasks || 0}</div>
            <Progress value={metricsData.overallProgress || 0} className="mt-2" />
            <p className="text-xs text-gray-500 mt-1">
              {Math.round(metricsData.overallProgress || 0)}% Complete
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Readiness Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">
                {Math.round(metricsData.readinessScore || 0)}%
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Submission readiness</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">High Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              <span className="text-2xl font-bold">
                {metricsData.highPriorityTasks || 0}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Require attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <span className="text-2xl font-bold text-red-600">
                {metricsData.overdueTasks || 0}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Need immediate action</p>
          </CardContent>
        </Card>
      </div>

      {/* Module Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Module Progress</CardTitle>
          <CardDescription>Progress across all regulatory modules</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Object.entries(MODULE_CONFIG).map(([key, config]) => {
              const progress = metricsData.moduleProgress?.[key] || 0;
              const Icon = config.icon;
              
              return (
                <div
                  key={key}
                  className="flex flex-col items-center space-y-2 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setSelectedModule(key)}
                >
                  <div className={`p-2 rounded-full ${config.lightColor}`}>
                    <Icon className={`h-5 w-5 ${config.textColor}`} />
                  </div>
                  <span className="text-xs font-medium text-gray-700">
                    {config.name}
                  </span>
                  <Progress value={progress} className="w-full" />
                  <span className="text-xs text-gray-500">
                    {Math.round(progress)}%
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Critical Alerts */}
      {metricsData.criticalAlerts?.length > 0 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Critical Alerts</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              {metricsData.criticalAlerts.map((alert, index) => (
                <li key={index} className="text-sm">{alert}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Task Queue</CardTitle>
          <CardDescription>All tasks across modules with filtering</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <Select value={selectedModule} onValueChange={setSelectedModule}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by module" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modules</SelectItem>
                {Object.entries(MODULE_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="review">Under Review</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedPriority} onValueChange={setSelectedPriority}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Task List */}
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {filteredTasks.map((task) => {
                const moduleConfig = MODULE_CONFIG[task.moduleType];
                const StatusIcon = STATUS_ICONS[task.status];
                const isExpanded = expandedTasks.has(task.taskId || task.id);
                
                return (
                  <div
                    key={task.taskId || task.id}
                    className={`border rounded-lg p-4 hover:bg-gray-50 transition-colors ${
                      task.status === 'blocked' ? 'border-red-200 bg-red-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {/* Module Badge */}
                          <Badge
                            className={`${moduleConfig.lightColor} ${moduleConfig.textColor} border-0`}
                          >
                            <moduleConfig.icon className="h-3 w-3 mr-1" />
                            {moduleConfig.name}
                          </Badge>
                          
                          {/* Priority Badge */}
                          <Badge className={PRIORITY_COLORS[task.priority]}>
                            {task.priority}
                          </Badge>
                          
                          {/* Status Icon */}
                          <div className="flex items-center gap-1">
                            <StatusIcon className={`h-4 w-4 ${
                              task.status === 'completed' ? 'text-green-500' :
                              task.status === 'blocked' ? 'text-red-500' :
                              task.status === 'in-progress' ? 'text-blue-500' :
                              'text-gray-400'
                            }`} />
                            <span className="text-xs text-gray-600 capitalize">
                              {task.status.replace('-', ' ')}
                            </span>
                          </div>
                        </div>
                        
                        <h4 className="font-medium text-gray-900 mb-1">
                          {task.title}
                        </h4>
                        
                        {task.description && (
                          <p className="text-sm text-gray-600 mb-2">
                            {task.description}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          {task.assigneeName && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {task.assigneeName}
                            </span>
                          )}
                          {task.dueDate && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(task.dueDate).toLocaleDateString()}
                            </span>
                          )}
                          {task.linkedTasks?.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Link2 className="h-3 w-3" />
                              {task.linkedTasks.length} linked
                            </span>
                          )}
                        </div>
                        
                        {/* Expandable Details */}
                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="font-medium">Progress:</span>
                                <Progress value={task.progress || 0} className="mt-1" />
                              </div>
                              <div>
                                <span className="font-medium">Estimated Hours:</span>
                                <span className="ml-2">{task.estimatedHours || 'N/A'}</span>
                              </div>
                            </div>
                            
                            {task.blockedBy?.length > 0 && (
                              <Alert className="mt-3 border-orange-200 bg-orange-50">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>
                                  Blocked by {task.blockedBy.length} task(s)
                                </AlertDescription>
                              </Alert>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleTaskExpansion(task.taskId || task.id)}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTaskClick(task)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {filteredTasks.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Target className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No tasks found matching your filters</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Next Milestones */}
      {metricsData.nextMilestones?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Next Milestones</CardTitle>
            <CardDescription>Upcoming key deliverables across modules</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metricsData.nextMilestones.map((milestone, index) => {
                const config = MODULE_CONFIG[milestone.module];
                const Icon = config?.icon || Target;
                
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${config?.lightColor || 'bg-gray-100'}`}>
                        <Icon className={`h-4 w-4 ${config?.textColor || 'text-gray-700'}`} />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{milestone.name}</p>
                        <p className="text-sm text-gray-500">
                          {milestone.remainingTasks} tasks remaining
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Progress value={milestone.progress} className="w-24" />
                      <p className="text-xs text-gray-500 mt-1">
                        {milestone.progress}% complete
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Task Creation Modal */}
      <UnifiedTaskCreationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        organizationId={organizationId}
        projectId={projectId}
        onTaskCreated={() => {
          refetchTasks();
          queryClient.invalidateQueries(['/api/regulatory/dashboard/unified']);
        }}
      />
    </div>
  );
}