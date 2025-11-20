/**
 * SharePoint-style Workflow Timeline Component
 * Visual swimlane management for Global Change Management system
 * Implements drag-and-drop change cards across lifecycle stages
 */

import React, { useState, useEffect, useCallback } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantContext } from '@/contexts/TenantContext';
import {
  Plus,
  Filter,
  Calendar,
  User,
  Clock,
  Edit2,
  Trash2,
  MoreVertical,
  ChevronRight,
  CheckSquare,
  Square,
  Circle,
  Users,
  Flag,
  Activity,
  TrendingUp,
  Zap,
  Eye,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  CalendarDays,
  GroupIcon,
  LayoutGrid,
  List,
  ArrowUpDown
} from 'lucide-react';

// SharePoint colors and styles
const sharePointColors = {
  primary: '#0078D4',
  primaryDark: '#106ebe',
  primaryLight: '#2B88D8',
  success: '#107C10',
  warning: '#FFB900',
  error: '#D13438',
  neutral: '#605E5C',
  neutralLight: '#EDEBE9',
  neutralLighter: '#F3F2F1',
  neutralLightest: '#FAF9F8',
  white: '#FFFFFF',
  black: '#000000'
};

// Define the change card item type for drag and drop
const ItemTypes = {
  CHANGE_CARD: 'changeCard'
};

// Swimlane column definitions
const swimlaneColumns = [
  {
    id: 'preview',
    title: 'Preview',
    status: 'pending',
    color: '#605E5C',
    bgColor: '#FAF9F8',
    description: 'Changes being reviewed'
  },
  {
    id: 'validation',
    title: 'Validation',
    status: 'validating',
    color: '#FFB900',
    bgColor: '#FAF9F8',
    description: 'FDA compliance checking'
  },
  {
    id: 'in_review',
    title: 'In Review',
    status: 'pending',
    color: '#0078D4',
    bgColor: '#FAF9F8',
    description: 'Awaiting approval'
  },
  {
    id: 'approved',
    title: 'Approved',
    status: 'approved',
    color: '#107C10',
    bgColor: '#FAF9F8',
    description: 'Ready to apply'
  },
  {
    id: 'applied',
    title: 'Applied',
    status: 'completed',
    color: '#107C10',
    bgColor: '#FAF9F8',
    description: 'Completed changes'
  }
];

/**
 * Get user initials from name or email
 */
function getUserInitials(user) {
  if (!user) return 'U';
  if (user.name) {
    const parts = user.name.split(' ');
    return parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
  }
  if (user.email) {
    return user.email.slice(0, 2).toUpperCase();
  }
  return 'U';
}

/**
 * Get priority color
 */
function getPriorityColor(priority) {
  switch (priority?.toLowerCase()) {
    case 'critical':
      return sharePointColors.error;
    case 'high':
      return '#FF4B4B';
    case 'medium':
      return sharePointColors.warning;
    case 'low':
      return sharePointColors.primary;
    default:
      return sharePointColors.neutral;
  }
}

/**
 * Format date to SharePoint style
 */
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const today = new Date();
  const diffTime = Math.abs(today - d);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  
  return d.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
  });
}

/**
 * Change Card Component
 * SharePoint-style task card with drag functionality
 */
function ChangeCard({ change, columnId, onEdit, onDelete, onSelect, isSelected }) {
  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.CHANGE_CARD,
    item: { change, sourceColumn: columnId },
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    })
  });

  const [showActions, setShowActions] = useState(false);

  // Calculate progress percentage
  const progress = change.status === 'completed' ? 100 : 
                  change.status === 'approved' ? 75 :
                  change.status === 'pending' ? 50 : 25;

  return (
    <div
      ref={drag}
      className={`mb-3 transition-all cursor-move ${
        isDragging ? 'opacity-50 scale-95' : 'hover:shadow-md'
      }`}
      data-testid={`card-change-${change.id}`}
    >
      <Card className="bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700 relative">
        {/* Priority indicator bar */}
        <div 
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l"
          style={{ backgroundColor: getPriorityColor(change.priority) }}
        />
        
        <CardContent className="p-3 pl-4">
          {/* Header with checkbox and actions */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onSelect(change.id)}
                className="mt-0.5"
                data-testid={`checkbox-change-${change.id}`}
              />
              <div className="flex-1">
                <div className="font-medium text-sm text-slate-900 dark:text-slate-100 line-clamp-2">
                  {change.originalValue} → {change.newValue}
                </div>
              </div>
            </div>
            
            <div className="relative">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowActions(!showActions);
                }}
                data-testid={`button-actions-${change.id}`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
              
              {showActions && (
                <div className="absolute right-0 top-8 z-10 w-32 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg py-1">
                  <button
                    onClick={() => {
                      onEdit(change);
                      setShowActions(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                  >
                    <Edit2 className="h-3 w-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      onDelete(change);
                      setShowActions(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 text-red-600"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* User info and metadata */}
          <div className="flex items-center gap-3 mb-2 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-xs" style={{ backgroundColor: sharePointColors.primaryLight }}>
                  {getUserInitials(change.createdBy)}
                </AvatarFallback>
              </Avatar>
              <span>{change.createdBy?.name || change.createdBy?.email || 'Unknown'}</span>
            </div>
            
            {change.targetDate && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{formatDate(change.targetDate)}</span>
              </div>
            )}
          </div>
          
          {/* Component count and progress */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {change.affectedUdis && (
                <Badge 
                  variant="secondary" 
                  className="text-xs bg-slate-100 dark:bg-slate-800"
                  data-testid={`badge-component-count-${change.id}`}
                >
                  {change.affectedUdis.length} components
                </Badge>
              )}
              
              {change.assignee && (
                <Avatar className="h-5 w-5 ring-2 ring-green-500">
                  <AvatarFallback className="text-xs">
                    {getUserInitials(change.assignee)}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
            
            <div className="flex items-center gap-1 text-xs text-slate-600">
              <span>{progress}%</span>
            </div>
          </div>
          
          {/* Progress bar */}
          <Progress value={progress} className="h-1 mt-2" />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Swimlane Column Component
 * Represents a lifecycle stage with droppable area
 */
function SwimlaneColumn({ column, changes, onDrop, onAddNew, onEditChange, onDeleteChange, onSelectChange, selectedChanges }) {
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: ItemTypes.CHANGE_CARD,
    drop: (item) => onDrop(item, column.id),
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop()
    })
  });

  const isActive = isOver && canDrop;
  const columnChanges = changes.filter(c => {
    // Map change status to column
    if (column.id === 'preview') return c.status === 'pending' && !c.reviewedAt;
    if (column.id === 'validation') return c.status === 'validating';
    if (column.id === 'in_review') return c.status === 'pending' && c.reviewedAt;
    if (column.id === 'approved') return c.status === 'approved';
    if (column.id === 'applied') return c.status === 'completed';
    return false;
  });

  return (
    <div 
      ref={drop}
      className={`flex-1 min-w-[280px] max-w-[320px] flex flex-col transition-all ${
        isActive ? 'ring-2 ring-blue-500 ring-opacity-50' : ''
      }`}
      style={{ backgroundColor: column.bgColor }}
      data-testid={`column-${column.id}`}
    >
      {/* Column Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Circle className="h-3 w-3" style={{ color: column.color, fill: column.color }} />
            <h3 className="font-semibold text-sm" style={{ fontFamily: 'Segoe UI, system-ui, sans-serif' }}>
              {column.title}
            </h3>
            <Badge variant="secondary" className="text-xs">
              {columnChanges.length}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {column.description}
        </p>
      </div>
      
      {/* Cards Area */}
      <ScrollArea className="flex-1 p-3">
        <div className="min-h-[100px]">
          {columnChanges.map(change => (
            <ChangeCard
              key={change.id}
              change={change}
              columnId={column.id}
              onEdit={onEditChange}
              onDelete={onDeleteChange}
              onSelect={onSelectChange}
              isSelected={selectedChanges.includes(change.id)}
            />
          ))}
        </div>
      </ScrollArea>
      
      {/* Add Task Button */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          onClick={() => onAddNew(column.id)}
          style={{ color: sharePointColors.primary }}
          data-testid={`button-add-task-${column.id}`}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add task
        </Button>
      </div>
    </div>
  );
}

/**
 * Main Workflow Timeline Component
 */
export function WorkflowTimeline() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useTenantContext();
  
  const [selectedChanges, setSelectedChanges] = useState([]);
  const [filterUser, setFilterUser] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [groupBy, setGroupBy] = useState('none');
  const [viewMode, setViewMode] = useState('board'); // board, timeline, list

  // Fetch change requests
  const { data: changesData, isLoading, refetch } = useQuery({
    queryKey: ['/api/change-management/requests'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/change-management/requests?limit=100');
      return response.json();
    },
    enabled: !!currentOrganization
  });

  const changes = changesData?.data || [];

  // Update change status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ changeId, status }) => {
      const response = await apiRequest('PUT', `/api/change-management/requests/${changeId}/status`, {
        status,
        digitalSignature: 'workflow-update'
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Status Updated",
        description: "Change status has been updated successfully"
      });
      queryClient.invalidateQueries(['/api/change-management/requests']);
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Handle drop event
  const handleDrop = useCallback((item, targetColumn) => {
    const change = item.change;
    const sourceColumn = item.sourceColumn;
    
    if (sourceColumn === targetColumn) return;

    // Map column to status
    let newStatus = 'pending';
    if (targetColumn === 'validation') newStatus = 'validating';
    if (targetColumn === 'approved') newStatus = 'approved';
    if (targetColumn === 'applied') newStatus = 'completed';

    updateStatusMutation.mutate({
      changeId: change.id,
      status: newStatus
    });
  }, [updateStatusMutation]);

  // Handle add new task
  const handleAddNew = (columnId) => {
    toast({
      title: "Add New Change",
      description: `Create a new change request in ${columnId}`
    });
  };

  // Handle edit change
  const handleEditChange = (change) => {
    toast({
      title: "Edit Change",
      description: `Editing change: ${change.id}`
    });
  };

  // Handle delete change
  const handleDeleteChange = (change) => {
    toast({
      title: "Delete Change",
      description: `Are you sure you want to delete this change?`,
      action: (
        <Button 
          variant="destructive" 
          size="sm"
          onClick={() => {
            // Delete logic here
            toast({
              title: "Change Deleted",
              description: "The change has been deleted"
            });
          }}
        >
          Delete
        </Button>
      )
    });
  };

  // Handle select change
  const handleSelectChange = (changeId) => {
    setSelectedChanges(prev => 
      prev.includes(changeId) 
        ? prev.filter(id => id !== changeId)
        : [...prev, changeId]
    );
  };

  // Handle bulk operations
  const handleBulkOperation = (operation) => {
    if (selectedChanges.length === 0) {
      toast({
        title: "No Selection",
        description: "Please select changes to perform bulk operations",
        variant: "destructive"
      });
      return;
    }
    
    toast({
      title: `Bulk ${operation}`,
      description: `Performing ${operation} on ${selectedChanges.length} changes`
    });
  };

  // Filter changes based on filters
  const filteredChanges = changes.filter(change => {
    if (filterUser !== 'all' && change.createdBy?.email !== filterUser) return false;
    if (filterPriority !== 'all' && change.priority !== filterPriority) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex flex-col h-full" style={{ fontFamily: 'Segoe UI, system-ui, sans-serif' }}>
        {/* Toolbar */}
        <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Left side - Filters and View Options */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                <Button
                  size="sm"
                  variant={viewMode === 'board' ? 'default' : 'ghost'}
                  onClick={() => setViewMode('board')}
                  className="h-7 px-2"
                  style={{ backgroundColor: viewMode === 'board' ? sharePointColors.primary : 'transparent' }}
                  data-testid="button-view-board"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === 'timeline' ? 'default' : 'ghost'}
                  onClick={() => setViewMode('timeline')}
                  className="h-7 px-2"
                  style={{ backgroundColor: viewMode === 'timeline' ? sharePointColors.primary : 'transparent' }}
                  data-testid="button-view-timeline"
                >
                  <CalendarDays className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  onClick={() => setViewMode('list')}
                  className="h-7 px-2"
                  style={{ backgroundColor: viewMode === 'list' ? sharePointColors.primary : 'transparent' }}
                  data-testid="button-view-list"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Filters */}
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-32 h-8" data-testid="select-filter-priority">
                  <Flag className="h-3 w-3 mr-1" />
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
              
              {/* Group By */}
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger className="w-32 h-8" data-testid="select-group-by">
                  <ArrowUpDown className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="Group by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Grouping</SelectItem>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="assignee">Assignee</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Right side - Bulk Actions */}
            {selectedChanges.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {selectedChanges.length} selected
                </span>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleBulkOperation('approve')}
                  data-testid="button-bulk-approve"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Approve
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleBulkOperation('reject')}
                  className="text-red-600"
                  data-testid="button-bulk-reject"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={() => setSelectedChanges([])}
                  data-testid="button-clear-selection"
                >
                  Clear
                </Button>
              </div>
            )}
          </div>
        </div>
        
        {/* Swimlane Board */}
        <div 
          className="flex-1 overflow-x-auto p-4" 
          style={{ backgroundColor: sharePointColors.neutralLightest }}
        >
          <div className="flex gap-4 min-h-full">
            {swimlaneColumns.map(column => (
              <SwimlaneColumn
                key={column.id}
                column={column}
                changes={filteredChanges}
                onDrop={handleDrop}
                onAddNew={handleAddNew}
                onEditChange={handleEditChange}
                onDeleteChange={handleDeleteChange}
                onSelectChange={handleSelectChange}
                selectedChanges={selectedChanges}
              />
            ))}
          </div>
        </div>
        
        {/* Status Bar */}
        <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-4">
              <span>{filteredChanges.length} total changes</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Circle className="h-3 w-3 fill-green-500 text-green-500" />
                {filteredChanges.filter(c => c.status === 'completed').length} completed
              </span>
              <span className="flex items-center gap-1">
                <Circle className="h-3 w-3 fill-blue-500 text-blue-500" />
                {filteredChanges.filter(c => c.status === 'pending').length} in progress
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span>Last updated: {formatDate(new Date())}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => refetch()}
                className="h-6 px-2"
                data-testid="button-refresh"
              >
                <Activity className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DndProvider>
  );
}