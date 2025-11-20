import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  Copy, Repeat, Timer, Play, Pause, StopCircle, Clock,
  Calendar, History, GitBranch, Shield, ShieldCheck, ShieldAlert,
  BellRing, BellOff, CheckCircle, AlertTriangle, Info, Hash,
  FileText, ArrowUpDown, Smartphone, Monitor, RotateCcw,
  GitCommit, MessageSquare, User, FileCheck, Save, TrendingUp
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, addDays, addWeeks, addMonths, differenceInMinutes, isWeekend } from 'date-fns';

// Task Cloning Component
export const TaskCloneDialog = ({ task, onClone, open, onClose }) => {
  const [cloneData, setCloneData] = useState({
    title: `${task?.title || ''} (Copy)`,
    description: task?.description || '',
    dueDate: addDays(new Date(), 7).toISOString().split('T')[0],
    assignee: task?.assignee || '',
    priority: task?.priority || 'medium',
    tags: task?.tags || [],
    preserveAttachments: true,
    preserveComments: false,
  });

  const handleClone = () => {
    const clonedTask = {
      ...task,
      ...cloneData,
      id: undefined, // Let the system generate a new ID
      clonedFrom: task?.id,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    onClone(clonedTask);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5" />
            Clone Task
          </DialogTitle>
          <DialogDescription>
            Create a copy of this task with new dates and settings
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Task Title</Label>
            <Input
              value={cloneData.title}
              onChange={(e) => setCloneData({ ...cloneData, title: e.target.value })}
              placeholder="Enter task title"
            />
          </div>
          <div className="space-y-2">
            <Label>Due Date</Label>
            <Input
              type="date"
              value={cloneData.dueDate}
              onChange={(e) => setCloneData({ ...cloneData, dueDate: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Preserve Attachments</Label>
            <Switch
              checked={cloneData.preserveAttachments}
              onCheckedChange={(checked) => 
                setCloneData({ ...cloneData, preserveAttachments: checked })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Preserve Comments</Label>
            <Switch
              checked={cloneData.preserveComments}
              onCheckedChange={(checked) => 
                setCloneData({ ...cloneData, preserveComments: checked })
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleClone} className="gap-2">
            <Copy className="w-4 h-4" />
            Clone Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Recurring Task Settings Component
export const RecurringTaskDialog = ({ task, onSave, open, onClose }) => {
  const [recurrence, setRecurrence] = useState({
    enabled: task?.recurrence?.enabled || false,
    pattern: task?.recurrence?.pattern || 'daily',
    interval: task?.recurrence?.interval || 1,
    daysOfWeek: task?.recurrence?.daysOfWeek || [],
    dayOfMonth: task?.recurrence?.dayOfMonth || 1,
    endType: task?.recurrence?.endType || 'never',
    endDate: task?.recurrence?.endDate || '',
    occurrences: task?.recurrence?.occurrences || 10,
    skipWeekends: task?.recurrence?.skipWeekends || false,
    autoCreate: task?.recurrence?.autoCreate || true,
  });

  const patterns = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'custom', label: 'Custom' },
  ];

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="w-5 h-5" />
            Recurring Task Settings
          </DialogTitle>
          <DialogDescription>
            Configure how this task should repeat over time
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <Label>Enable Recurrence</Label>
            <Switch
              checked={recurrence.enabled}
              onCheckedChange={(checked) => 
                setRecurrence({ ...recurrence, enabled: checked })
              }
            />
          </div>
          
          {recurrence.enabled && (
            <>
              <div className="space-y-2">
                <Label>Pattern</Label>
                <Select
                  value={recurrence.pattern}
                  onValueChange={(value) => setRecurrence({ ...recurrence, pattern: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {patterns.map(p => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {recurrence.pattern === 'weekly' && (
                <div className="space-y-2">
                  <Label>Days of Week</Label>
                  <div className="flex gap-2 flex-wrap">
                    {daysOfWeek.map(day => (
                      <Button
                        key={day}
                        variant={recurrence.daysOfWeek.includes(day) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          const days = recurrence.daysOfWeek.includes(day)
                            ? recurrence.daysOfWeek.filter(d => d !== day)
                            : [...recurrence.daysOfWeek, day];
                          setRecurrence({ ...recurrence, daysOfWeek: days });
                        }}
                      >
                        {day}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Repeat Every</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={recurrence.interval}
                    onChange={(e) => setRecurrence({ ...recurrence, interval: parseInt(e.target.value) })}
                    className="w-20"
                  />
                  <span className="text-sm text-gray-600">
                    {recurrence.pattern === 'daily' ? 'day(s)' : 
                     recurrence.pattern === 'weekly' ? 'week(s)' : 'month(s)'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label>Skip Weekends</Label>
                <Switch
                  checked={recurrence.skipWeekends}
                  onCheckedChange={(checked) => 
                    setRecurrence({ ...recurrence, skipWeekends: checked })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>End Recurrence</Label>
                <Select
                  value={recurrence.endType}
                  onValueChange={(value) => setRecurrence({ ...recurrence, endType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">Never</SelectItem>
                    <SelectItem value="date">On Date</SelectItem>
                    <SelectItem value="occurrences">After Occurrences</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {recurrence.endType === 'date' && (
                <Input
                  type="date"
                  value={recurrence.endDate}
                  onChange={(e) => setRecurrence({ ...recurrence, endDate: e.target.value })}
                />
              )}

              {recurrence.endType === 'occurrences' && (
                <Input
                  type="number"
                  min="1"
                  value={recurrence.occurrences}
                  onChange={(e) => setRecurrence({ ...recurrence, occurrences: parseInt(e.target.value) })}
                  placeholder="Number of occurrences"
                />
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave(recurrence); onClose(); }}>
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Time Tracking Component
export const TimeTracker = ({ task, onTimeUpdate }) => {
  const [isTracking, setIsTracking] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(task?.timeSpent || 0);
  const [estimatedTime, setEstimatedTime] = useState(task?.estimatedHours || 0);
  const [manualEntry, setManualEntry] = useState(false);
  const [manualHours, setManualHours] = useState('');
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isTracking) {
      startTimeRef.current = Date.now() - elapsedTime * 3600000;
      intervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 3600000;
        setElapsedTime(elapsed);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isTracking]);

  const handleStartStop = () => {
    if (isTracking) {
      // Stop tracking
      onTimeUpdate({
        timeSpent: elapsedTime,
        lastTracked: new Date().toISOString(),
      });
      toast({
        title: 'Time Tracked',
        description: `Added ${elapsedTime.toFixed(2)} hours to task`,
      });
    }
    setIsTracking(!isTracking);
  };

  const handleManualEntry = () => {
    const hours = parseFloat(manualHours);
    if (!isNaN(hours) && hours > 0) {
      const newTotal = elapsedTime + hours;
      setElapsedTime(newTotal);
      onTimeUpdate({
        timeSpent: newTotal,
        lastTracked: new Date().toISOString(),
        manualEntry: true,
      });
      toast({
        title: 'Time Added',
        description: `Added ${hours} hours manually`,
      });
      setManualHours('');
      setManualEntry(false);
    }
  };

  const formatTime = (hours) => {
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    const s = Math.floor(((hours - h) * 60 - m) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = estimatedTime > 0 ? (elapsedTime / estimatedTime) * 100 : 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Timer className="w-5 h-5" />
            Time Tracking
          </span>
          <Badge variant={isTracking ? 'destructive' : 'secondary'}>
            {isTracking ? 'Tracking' : 'Stopped'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Timer Display */}
        <div className="text-center">
          <div className="text-4xl font-mono font-bold text-gray-800">
            {formatTime(elapsedTime)}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Estimated: {estimatedTime}h
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span className={progress > 100 ? 'text-red-600 font-semibold' : ''}>
              {progress.toFixed(0)}%
            </span>
          </div>
          <Progress 
            value={Math.min(progress, 100)} 
            className={progress > 100 ? 'bg-red-100' : ''}
          />
          {progress > 100 && (
            <p className="text-xs text-red-600">
              ⚠️ Exceeded estimate by {(elapsedTime - estimatedTime).toFixed(2)} hours
            </p>
          )}
        </div>

        {/* Control Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleStartStop}
            className="flex-1"
            variant={isTracking ? 'destructive' : 'default'}
          >
            {isTracking ? (
              <>
                <Pause className="w-4 h-4 mr-2" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Start
              </>
            )}
          </Button>
          <Button
            onClick={() => setManualEntry(!manualEntry)}
            variant="outline"
          >
            <Clock className="w-4 h-4" />
          </Button>
        </div>

        {/* Manual Entry */}
        {manualEntry && (
          <div className="flex gap-2">
            <Input
              type="number"
              step="0.5"
              placeholder="Hours"
              value={manualHours}
              onChange={(e) => setManualHours(e.target.value)}
            />
            <Button onClick={handleManualEntry}>Add</Button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <div className="text-center">
            <div className="text-xs text-gray-600">Today</div>
            <div className="font-semibold">{task?.todayHours || 0}h</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-600">This Week</div>
            <div className="font-semibold">{task?.weekHours || 0}h</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-600">Total</div>
            <div className="font-semibold">{elapsedTime.toFixed(1)}h</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Compliance Checker Component
export const ComplianceChecker = ({ task, rules, onComplianceUpdate }) => {
  const [complianceStatus, setComplianceStatus] = useState('pending');
  const [violations, setViolations] = useState([]);
  const [validating, setValidating] = useState(false);
  const { toast } = useToast();

  const checkCompliance = async () => {
    setValidating(true);
    const issues = [];

    // Check required fields
    if (rules?.requiredFields) {
      rules.requiredFields.forEach(field => {
        if (!task[field]) {
          issues.push({
            type: 'missing_field',
            field,
            severity: 'high',
            message: `Required field "${field}" is missing`,
          });
        }
      });
    }

    // Check document requirements
    if (rules?.requiredDocuments) {
      rules.requiredDocuments.forEach(doc => {
        if (!task.attachments?.some(a => a.type === doc)) {
          issues.push({
            type: 'missing_document',
            document: doc,
            severity: 'high',
            message: `Required document "${doc}" is not attached`,
          });
        }
      });
    }

    // Check approval chain
    if (rules?.approvalChain) {
      const pendingApprovals = rules.approvalChain.filter(
        approver => !task.approvals?.includes(approver)
      );
      if (pendingApprovals.length > 0) {
        issues.push({
          type: 'pending_approval',
          approvers: pendingApprovals,
          severity: 'medium',
          message: `Pending approvals from: ${pendingApprovals.join(', ')}`,
        });
      }
    }

    // Check deadline compliance
    if (task.dueDate) {
      const daysUntilDue = differenceInMinutes(new Date(task.dueDate), new Date()) / (60 * 24);
      if (daysUntilDue < 0) {
        issues.push({
          type: 'overdue',
          severity: 'critical',
          message: `Task is overdue by ${Math.abs(Math.floor(daysUntilDue))} days`,
        });
      } else if (daysUntilDue < 2) {
        issues.push({
          type: 'deadline_approaching',
          severity: 'medium',
          message: `Deadline approaching in ${Math.floor(daysUntilDue)} days`,
        });
      }
    }

    setViolations(issues);
    const status = issues.length === 0 ? 'compliant' : 
                   issues.some(i => i.severity === 'critical') ? 'critical' :
                   issues.some(i => i.severity === 'high') ? 'non-compliant' : 
                   'warning';
    
    setComplianceStatus(status);
    setValidating(false);

    // Notify about compliance status
    onComplianceUpdate({
      taskId: task.id,
      status,
      violations: issues,
      checkedAt: new Date().toISOString(),
    });

    toast({
      title: status === 'compliant' ? 'Compliance Check Passed' : 'Compliance Issues Found',
      description: status === 'compliant' ? 'Task meets all compliance requirements' : 
                   `Found ${issues.length} compliance issue(s)`,
      variant: status === 'compliant' ? 'default' : 'destructive',
    });
  };

  const statusIcons = {
    compliant: <ShieldCheck className="w-5 h-5 text-green-600" />,
    warning: <Shield className="w-5 h-5 text-yellow-600" />,
    'non-compliant': <ShieldAlert className="w-5 h-5 text-red-600" />,
    critical: <ShieldAlert className="w-5 h-5 text-red-700" />,
    pending: <Shield className="w-5 h-5 text-gray-400" />,
  };

  const statusColors = {
    compliant: 'bg-green-50 border-green-200',
    warning: 'bg-yellow-50 border-yellow-200',
    'non-compliant': 'bg-red-50 border-red-200',
    critical: 'bg-red-100 border-red-300',
    pending: 'bg-gray-50 border-gray-200',
  };

  return (
    <Card className={cn('transition-colors', statusColors[complianceStatus])}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {statusIcons[complianceStatus]}
            Compliance Status
          </span>
          <Badge 
            variant={complianceStatus === 'compliant' ? 'success' : 
                    complianceStatus === 'pending' ? 'secondary' : 'destructive'}
          >
            {complianceStatus}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {violations.length > 0 && (
          <div className="space-y-2">
            {violations.map((violation, index) => (
              <div 
                key={index} 
                className="flex items-start gap-2 p-2 rounded bg-white/50"
              >
                {violation.severity === 'critical' ? (
                  <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
                ) : violation.severity === 'high' ? (
                  <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5" />
                ) : (
                  <Info className="w-4 h-4 text-yellow-600 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">{violation.message}</p>
                  <p className="text-xs text-gray-600">Type: {violation.type}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {violations.length === 0 && complianceStatus === 'compliant' && (
          <div className="text-center py-4 text-green-700">
            <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-600" />
            <p className="font-medium">Fully Compliant</p>
            <p className="text-sm text-gray-600">All requirements met</p>
          </div>
        )}

        <Button 
          onClick={checkCompliance} 
          className="w-full"
          disabled={validating}
        >
          {validating ? 'Validating...' : 'Run Compliance Check'}
        </Button>

        {/* Compliance Report */}
        <div className="pt-3 border-t">
          <Button variant="outline" size="sm" className="w-full">
            <FileCheck className="w-4 h-4 mr-2" />
            Generate Compliance Report
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Version History Component
export const TaskVersionHistory = ({ task, versions = [], onRevert }) => {
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [showDiff, setShowDiff] = useState(false);

  const formatChange = (field, oldValue, newValue) => {
    if (field === 'status') {
      return (
        <span>
          Status: <Badge variant="outline">{oldValue}</Badge> → 
          <Badge variant="default" className="ml-1">{newValue}</Badge>
        </span>
      );
    }
    return `${field}: ${oldValue} → ${newValue}`;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-5 h-5" />
          Version History
        </CardTitle>
        <CardDescription>
          Track all changes made to this task
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          <div className="space-y-3">
            {versions.map((version, index) => (
              <div
                key={version.id}
                className={cn(
                  'p-3 rounded-lg border cursor-pointer transition-colors',
                  selectedVersion?.id === version.id 
                    ? 'bg-blue-50 border-blue-300' 
                    : 'hover:bg-gray-50'
                )}
                onClick={() => setSelectedVersion(version)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <GitCommit className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-mono">v{versions.length - index}</span>
                    <Badge variant="outline" className="text-xs">
                      {version.changeType}
                    </Badge>
                  </div>
                  <span className="text-xs text-gray-500">
                    {format(new Date(version.timestamp), 'MMM d, HH:mm')}
                  </span>
                </div>
                
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-3 h-3" />
                    <span className="font-medium">{version.user}</span>
                  </div>
                  
                  {version.changes && (
                    <div className="text-sm text-gray-600">
                      {Object.entries(version.changes).map(([field, change]) => (
                        <div key={field} className="flex items-center gap-1">
                          <span className="text-gray-400">•</span>
                          {formatChange(field, change.old, change.new)}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {version.comment && (
                    <div className="flex items-start gap-2 mt-2 p-2 bg-gray-100 rounded">
                      <MessageSquare className="w-3 h-3 mt-0.5 text-gray-500" />
                      <p className="text-xs text-gray-700">{version.comment}</p>
                    </div>
                  )}
                </div>

                {selectedVersion?.id === version.id && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDiff(!showDiff);
                      }}
                    >
                      <GitBranch className="w-3 h-3 mr-1" />
                      View Diff
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRevert(version);
                      }}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Revert to This
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

// Mobile Responsive Task Card
export const MobileTaskCard = ({ task, onAction }) => {
  const [expanded, setExpanded] = useState(false);
  const [startX, setStartX] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const handleTouchStart = (e) => {
    setStartX(e.touches[0].clientX);
    setSwiping(true);
  };

  const handleTouchMove = (e) => {
    if (!swiping) return;
    setCurrentX(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!swiping) return;
    const diff = currentX - startX;
    
    if (Math.abs(diff) > 100) {
      if (diff > 0) {
        onAction('complete', task);
      } else {
        onAction('archive', task);
      }
    }
    
    setCurrentX(0);
    setStartX(0);
    setSwiping(false);
  };

  const swipeOffset = swiping ? currentX - startX : 0;
  const bgColor = swipeOffset > 100 ? 'bg-green-100' : 
                  swipeOffset < -100 ? 'bg-red-100' : 'bg-white';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border p-4 transition-all',
        bgColor,
        'touch-pan-y'
      )}
      style={{
        transform: `translateX(${swipeOffset}px)`,
        transition: swiping ? 'none' : 'transform 0.3s',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={() => !swiping && setExpanded(!expanded)}
    >
      {/* Swipe indicators */}
      {swipeOffset > 50 && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2">
          <CheckCircle className="w-6 h-6 text-green-600" />
        </div>
      )}
      {swipeOffset < -50 && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <Archive className="w-6 h-6 text-red-600" />
        </div>
      )}

      {/* Task content */}
      <div className="space-y-2">
        <div className="flex items-start justify-between">
          <h3 className="font-semibold text-lg">{task.title}</h3>
          <Badge variant={task.priority === 'high' ? 'destructive' : 'default'}>
            {task.priority}
          </Badge>
        </div>

        {expanded && (
          <>
            <p className="text-sm text-gray-600">{task.description}</p>
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => onAction('edit', task)}>
                Edit
              </Button>
              <Button size="sm" onClick={() => onAction('track', task)}>
                Track Time
              </Button>
            </div>
          </>
        )}

        <div className="flex items-center justify-between text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {format(new Date(task.dueDate), 'MMM d')}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {task.timeSpent || 0}h
          </span>
        </div>
      </div>
    </div>
  );
};

export default {
  TaskCloneDialog,
  RecurringTaskDialog,
  TimeTracker,
  ComplianceChecker,
  TaskVersionHistory,
  MobileTaskCard
};