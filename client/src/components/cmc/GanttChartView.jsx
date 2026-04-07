import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize,
  GitBranch,
  Clock,
  User,
  AlertTriangle,
  CheckCircle,
  Circle,
  Square,
  Diamond,
} from 'lucide-react';
import { format, addDays, differenceInDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWeekend, parseISO, isSameDay, isAfter, isBefore } from 'date-fns';
import { cn } from '@/lib/utils';

// Task dependency types
const DEPENDENCY_TYPES = {
  'finish-to-start': { label: 'FS', color: '#3B82F6' },
  'start-to-start': { label: 'SS', color: '#10B981' },
  'finish-to-finish': { label: 'FF', color: '#F59E0B' },
  'start-to-finish': { label: 'SF', color: '#EF4444' },
};

// Priority colors
const PRIORITY_COLORS = {
  low: '#94A3B8',
  medium: '#3B82F6',
  high: '#F59E0B',
  urgent: '#EF4444',
};

// Status colors
const STATUS_COLORS = {
  'not-started': '#E2E8F0',
  'pending': '#FEF3C7',
  'in-progress': '#BFDBFE',
  'review': '#DDD6FE',
  'completed': '#BBF7D0',
  'blocked': '#FECACA',
};

const GanttChartView = ({ tasks, dependencies = [], onTaskUpdate, onTaskClick }) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  
  const [zoom, setZoom] = useState('month');
  const [dateRange, setDateRange] = useState({ start: new Date(), end: addDays(new Date(), 90) });
  const [selectedTask, setSelectedTask] = useState(null);
  const [showDependencies, setShowDependencies] = useState(true);
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hoveredTask, setHoveredTask] = useState(null);
  const [viewMode, setViewMode] = useState('all'); // all, milestones, critical
  
  // Calculate date range based on tasks
  useEffect(() => {
    if (tasks.length > 0) {
      const dates = tasks.flatMap(task => [
        parseISO(task.startDate || task.createdAt),
        parseISO(task.deadline),
      ]);
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      setDateRange({
        start: addDays(minDate, -7),
        end: addDays(maxDate, 7),
      });
    }
  }, [tasks]);

  // Calculate chart dimensions
  const chartDimensions = useMemo(() => {
    const days = differenceInDays(dateRange.end, dateRange.start);
    const dayWidth = zoom === 'day' ? 100 : zoom === 'week' ? 20 : zoom === 'month' ? 6 : 2;
    const rowHeight = 40;
    const headerHeight = 100;
    
    return {
      width: days * dayWidth,
      height: (tasks.length * rowHeight) + headerHeight,
      dayWidth,
      rowHeight,
      headerHeight,
    };
  }, [dateRange, tasks.length, zoom]);

  // Calculate critical path
  const criticalPath = useMemo(() => {
    if (!showCriticalPath || tasks.length === 0) return new Set();
    
    // Simplified critical path calculation
    // In production, use a proper CPM algorithm
    const criticalTasks = new Set();
    
    // Find tasks with no slack time
    tasks.forEach(task => {
      const taskDependencies = dependencies.filter(d => d.targetId === task.id);
      if (taskDependencies.length === 0) {
        // Start tasks
        criticalTasks.add(task.id);
      }
    });
    
    // Find end tasks
    const endTasks = tasks.filter(task => 
      !dependencies.some(d => d.sourceId === task.id)
    );
    
    endTasks.forEach(task => criticalTasks.add(task.id));
    
    return criticalTasks;
  }, [tasks, dependencies, showCriticalPath]);

  // Generate timeline headers
  const timelineHeaders = useMemo(() => {
    const headers = [];
    const days = differenceInDays(dateRange.end, dateRange.start);
    
    for (let i = 0; i <= days; i++) {
      const date = addDays(dateRange.start, i);
      const isToday = isSameDay(date, new Date());
      const isWeekendDay = isWeekend(date);
      
      headers.push({
        date,
        label: format(date, zoom === 'day' ? 'EEE dd' : 'dd'),
        month: format(date, 'MMM yyyy'),
        isToday,
        isWeekend: isWeekendDay,
        x: i * chartDimensions.dayWidth,
      });
    }
    
    return headers;
  }, [dateRange, chartDimensions.dayWidth, zoom]);

  // Calculate task positions
  const taskPositions = useMemo(() => {
    return tasks.map((task, index) => {
      const startDate = parseISO(task.startDate || task.createdAt);
      const endDate = parseISO(task.deadline);
      const startOffset = differenceInDays(startDate, dateRange.start);
      const duration = differenceInDays(endDate, startDate) + 1;
      
      return {
        ...task,
        x: startOffset * chartDimensions.dayWidth,
        y: (index * chartDimensions.rowHeight) + chartDimensions.headerHeight,
        width: duration * chartDimensions.dayWidth,
        height: chartDimensions.rowHeight - 8,
        startDate,
        endDate,
        duration,
        isCritical: criticalPath.has(task.id),
        progress: task.completionPercentage || 0,
      };
    });
  }, [tasks, dateRange, chartDimensions, criticalPath]);

  // Handle task dragging
  const handleTaskDragStart = (e, task) => {
    setDraggedTask(task);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleTaskDrag = (e) => {
    if (!draggedTask) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const newX = e.clientX - containerRect.left - dragOffset.x;
    const daysMoved = Math.round(newX / chartDimensions.dayWidth);
    
    // Update task dates
    const newStartDate = addDays(dateRange.start, daysMoved);
    const newEndDate = addDays(newStartDate, draggedTask.duration - 1);
    
    if (onTaskUpdate) {
      onTaskUpdate(draggedTask.id, {
        startDate: format(newStartDate, 'yyyy-MM-dd'),
        deadline: format(newEndDate, 'yyyy-MM-dd'),
      });
    }
  };

  const handleTaskDragEnd = () => {
    setDraggedTask(null);
    setDragOffset({ x: 0, y: 0 });
  };

  // Render dependency lines
  const renderDependencyLines = () => {
    if (!showDependencies) return null;
    
    return dependencies.map(dep => {
      const source = taskPositions.find(t => t.id === dep.sourceId);
      const target = taskPositions.find(t => t.id === dep.targetId);
      
      if (!source || !target) return null;
      
      const depType = DEPENDENCY_TYPES[dep.type] || DEPENDENCY_TYPES['finish-to-start'];
      
      // Calculate connection points
      let x1, y1, x2, y2;
      
      switch (dep.type) {
        case 'start-to-start':
          x1 = source.x;
          y1 = source.y + source.height / 2;
          x2 = target.x;
          y2 = target.y + target.height / 2;
          break;
        case 'finish-to-finish':
          x1 = source.x + source.width;
          y1 = source.y + source.height / 2;
          x2 = target.x + target.width;
          y2 = target.y + target.height / 2;
          break;
        case 'start-to-finish':
          x1 = source.x;
          y1 = source.y + source.height / 2;
          x2 = target.x + target.width;
          y2 = target.y + target.height / 2;
          break;
        default: // finish-to-start
          x1 = source.x + source.width;
          y1 = source.y + source.height / 2;
          x2 = target.x;
          y2 = target.y + target.height / 2;
      }
      
      // Create curved path
      const midX = (x1 + x2) / 2;
      const path = `M ${x1} ${y1} Q ${midX} ${y1} ${midX} ${(y1 + y2) / 2} T ${x2} ${y2}`;
      
      return (
        <g key={`${dep.sourceId}-${dep.targetId}`}>
          <path
            d={path}
            fill="none"
            stroke={depType.color}
            strokeWidth={2}
            strokeDasharray={dep.isBlocking ? '0' : '5,5'}
            opacity={0.6}
            markerEnd="url(#arrowhead)"
          />
          <text
            x={midX}
            y={(y1 + y2) / 2}
            fill={depType.color}
            fontSize="10"
            textAnchor="middle"
          >
            {depType.label}
          </text>
        </g>
      );
    });
  };

  // Render task bars
  const renderTaskBars = () => {
    return taskPositions.map(task => {
      const isSelected = selectedTask?.id === task.id;
      const isHovered = hoveredTask?.id === task.id;
      const isDragging = draggedTask?.id === task.id;
      const isOverdue = isAfter(new Date(), task.endDate) && task.status !== 'completed';
      
      const barColor = task.isCritical ? '#DC2626' : PRIORITY_COLORS[task.priority];
      const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS['not-started'];
      
      if (viewMode === 'milestones' && !task.isMilestone) return null;
      if (viewMode === 'critical' && !task.isCritical) return null;
      
      return (
        <g
          key={task.id}
          transform={`translate(${task.x}, ${task.y})`}
          className={cn(
            'cursor-pointer transition-all',
            isDragging && 'opacity-50'
          )}
          onMouseEnter={() => setHoveredTask(task)}
          onMouseLeave={() => setHoveredTask(null)}
          onClick={() => {
            setSelectedTask(task);
            if (onTaskClick) onTaskClick(task);
          }}
          onMouseDown={(e) => handleTaskDragStart(e, task)}
        >
          {/* Task background */}
          <rect
            x={0}
            y={4}
            width={task.width}
            height={task.height - 8}
            rx={4}
            fill={statusColor}
            stroke={isSelected ? '#d97757' : barColor}
            strokeWidth={isSelected ? 2 : 1}
            opacity={0.9}
          />
          
          {/* Progress bar */}
          {task.progress > 0 && (
            <rect
              x={0}
              y={4}
              width={task.width * (task.progress / 100)}
              height={task.height - 8}
              rx={4}
              fill={barColor}
              opacity={0.6}
            />
          )}
          
          {/* Task label */}
          <text
            x={task.width / 2}
            y={task.height / 2 + 2}
            textAnchor="middle"
            fontSize="12"
            fill="#1F2937"
            fontWeight={isSelected ? '600' : '400'}
          >
            {task.title.length > 20 ? `${task.title.substring(0, 20)}...` : task.title}
          </text>
          
          {/* Icons */}
          {isOverdue && (
            <g transform={`translate(${task.width - 20}, ${task.height / 2 - 8})`}>
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </g>
          )}
          
          {task.isMilestone && (
            <g transform={`translate(${task.width + 5}, ${task.height / 2 - 8})`}>
              <Diamond className="w-4 h-4 text-purple-600" />
            </g>
          )}
        </g>
      );
    });
  };

  // Render today line
  const renderTodayLine = () => {
    const today = new Date();
    if (isBefore(today, dateRange.start) || isAfter(today, dateRange.end)) return null;
    
    const daysFromStart = differenceInDays(today, dateRange.start);
    const x = daysFromStart * chartDimensions.dayWidth;
    
    return (
      <line
        x1={x}
        y1={0}
        x2={x}
        y2={chartDimensions.height}
        stroke="#EF4444"
        strokeWidth={2}
        strokeDasharray="5,5"
        opacity={0.5}
      />
    );
  };

  return (
    <Card className="w-full h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Gantt Chart</CardTitle>
          
          <div className="flex items-center gap-2">
            {/* View mode selector */}
            <Select value={viewMode} onValueChange={setViewMode}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tasks</SelectItem>
                <SelectItem value="milestones">Milestones</SelectItem>
                <SelectItem value="critical">Critical Path</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Zoom controls */}
            <div className="flex items-center gap-1 border rounded-md px-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setZoom('day')}
                className={cn('px-2', zoom === 'day' && 'bg-gray-100')}
              >
                D
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setZoom('week')}
                className={cn('px-2', zoom === 'week' && 'bg-gray-100')}
              >
                W
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setZoom('month')}
                className={cn('px-2', zoom === 'month' && 'bg-gray-100')}
              >
                M
              </Button>
            </div>
            
            {/* Toggle options */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDependencies(!showDependencies)}
              className={cn(showDependencies && 'bg-gray-100')}
            >
              <GitBranch className="w-4 h-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCriticalPath(!showCriticalPath)}
              className={cn(showCriticalPath && 'bg-gray-100')}
            >
              <AlertTriangle className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div
          ref={containerRef}
          className="relative overflow-auto border rounded-md"
          style={{ height: '600px' }}
          onMouseMove={handleTaskDrag}
          onMouseUp={handleTaskDragEnd}
        >
          <svg
            ref={chartRef}
            width={chartDimensions.width}
            height={chartDimensions.height}
            className="select-none"
          >
            {/* Define arrowhead marker */}
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
              >
                <polygon
                  points="0 0, 10 3, 0 6"
                  fill="#3B82F6"
                />
              </marker>
            </defs>
            
            {/* Background grid */}
            <g>
              {timelineHeaders.map((header, index) => (
                <g key={index}>
                  <line
                    x1={header.x}
                    y1={0}
                    x2={header.x}
                    y2={chartDimensions.height}
                    stroke={header.isWeekend ? '#F3F4F6' : '#E5E7EB'}
                    strokeWidth={1}
                  />
                  {header.isWeekend && (
                    <rect
                      x={header.x}
                      y={chartDimensions.headerHeight}
                      width={chartDimensions.dayWidth}
                      height={chartDimensions.height - chartDimensions.headerHeight}
                      fill="#F9FAFB"
                      opacity={0.5}
                    />
                  )}
                </g>
              ))}
              
              {/* Horizontal grid lines */}
              {tasks.map((_, index) => (
                <line
                  key={index}
                  x1={0}
                  y1={chartDimensions.headerHeight + (index * chartDimensions.rowHeight)}
                  x2={chartDimensions.width}
                  y2={chartDimensions.headerHeight + (index * chartDimensions.rowHeight)}
                  stroke="#E5E7EB"
                  strokeWidth={1}
                />
              ))}
            </g>
            
            {/* Timeline header */}
            <g>
              <rect
                x={0}
                y={0}
                width={chartDimensions.width}
                height={chartDimensions.headerHeight}
                fill="white"
                stroke="#E5E7EB"
              />
              
              {/* Month headers */}
              <g>
                {timelineHeaders.filter((h, i) => i === 0 || h.month !== timelineHeaders[i - 1].month).map((header, index) => (
                  <text
                    key={index}
                    x={header.x + 10}
                    y={30}
                    fontSize="14"
                    fontWeight="600"
                    fill="#1F2937"
                  >
                    {header.month}
                  </text>
                ))}
              </g>
              
              {/* Day headers */}
              <g>
                {timelineHeaders.map((header, index) => (
                  <g key={index}>
                    <text
                      x={header.x + (chartDimensions.dayWidth / 2)}
                      y={60}
                      textAnchor="middle"
                      fontSize="11"
                      fill={header.isToday ? '#EF4444' : header.isWeekend ? '#9CA3AF' : '#4B5563'}
                      fontWeight={header.isToday ? '600' : '400'}
                    >
                      {header.label}
                    </text>
                    {header.isToday && (
                      <rect
                        x={header.x}
                        y={70}
                        width={chartDimensions.dayWidth}
                        height={3}
                        fill="#EF4444"
                        rx={1}
                      />
                    )}
                  </g>
                ))}
              </g>
            </g>
            
            {/* Task names sidebar */}
            <g>
              {tasks.map((task, index) => (
                <g key={task.id}>
                  <rect
                    x={0}
                    y={chartDimensions.headerHeight + (index * chartDimensions.rowHeight)}
                    width={200}
                    height={chartDimensions.rowHeight}
                    fill="white"
                    stroke="#E5E7EB"
                  />
                  <text
                    x={10}
                    y={chartDimensions.headerHeight + (index * chartDimensions.rowHeight) + (chartDimensions.rowHeight / 2) + 4}
                    fontSize="12"
                    fill="#1F2937"
                  >
                    {task.title.length > 25 ? `${task.title.substring(0, 25)}...` : task.title}
                  </text>
                </g>
              ))}
            </g>
            
            {/* Render elements */}
            {renderDependencyLines()}
            {renderTodayLine()}
            {renderTaskBars()}
          </svg>
        </div>
        
        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded" />
            <span>In Progress</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded" />
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded" />
            <span>Critical Path</span>
          </div>
          <div className="flex items-center gap-2">
            <Diamond className="w-4 h-4 text-purple-600" />
            <span>Milestone</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span>Overdue</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default GanttChartView;