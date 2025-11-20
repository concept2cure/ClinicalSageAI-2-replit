/**
 * Unified Task Creation Modal
 * 
 * Production-ready modal for creating tasks from any module in the system.
 * Includes proper form validation, module selection, and API integration.
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';
import {
  FlaskConical,
  FileText,
  Activity,
  BookOpen,
  Archive,
  Clipboard,
  CalendarIcon,
  Loader2,
  Plus,
  AlertCircle,
} from 'lucide-react';

// Module configuration
const MODULES = [
  {
    id: 'CMC',
    name: 'CMC Module',
    icon: FlaskConical,
    color: 'bg-blue-500',
    textColor: 'text-blue-700',
    categories: ['Manufacturing', 'Analytical', 'Quality', 'Stability', 'Process'],
  },
  {
    id: 'IND',
    name: 'IND Wizard',
    icon: FileText,
    color: 'bg-green-500',
    textColor: 'text-green-700',
    categories: ['Regulatory', 'Documentation', 'Submission', 'Review'],
  },
  {
    id: 'MedicalDevice',
    name: 'Medical Device',
    icon: Activity,
    color: 'bg-purple-500',
    textColor: 'text-purple-700',
    categories: ['510(k)', 'PMA', 'Device Testing', 'Clinical'],
  },
  {
    id: 'eCTD',
    name: 'eCTD Co-Author',
    icon: BookOpen,
    color: 'bg-amber-500',
    textColor: 'text-amber-700',
    categories: ['Assembly', 'Publishing', 'Validation', 'Review'],
  },
  {
    id: 'Vault',
    name: 'Trial Vault',
    icon: Archive,
    color: 'bg-pink-500',
    textColor: 'text-pink-700',
    categories: ['Document Management', 'Approval', 'Storage', 'Archival'],
  },
  {
    id: 'ProtocolDesign',
    name: 'Protocol Design',
    icon: Clipboard,
    color: 'bg-cyan-500',
    textColor: 'text-cyan-700',
    categories: ['Study Design', 'Protocol', 'Clinical Trial', 'Review'],
  },
];

const PRIORITIES = [
  { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-700' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-700' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-700' },
  { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-700' },
];

const TASK_TYPES = [
  { value: 'action', label: 'Action Item' },
  { value: 'review', label: 'Review' },
  { value: 'approval', label: 'Approval' },
  { value: 'milestone', label: 'Milestone' },
  { value: 'document', label: 'Document' },
  { value: 'analysis', label: 'Analysis' },
];

export default function UnifiedTaskCreationModal({
  isOpen,
  onClose,
  defaultModule = null,
  organizationId = 7, // Default organization
  projectId = null,
  onTaskCreated = null,
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    moduleType: defaultModule || '',
    title: '',
    description: '',
    category: '',
    taskType: 'action',
    priority: 'medium',
    dueDate: null,
    estimatedHours: '',
    assigneeName: '',
    tags: [],
    metadata: {},
  });

  const [currentTag, setCurrentTag] = useState('');
  const [errors, setErrors] = useState({});

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (data) => {
      return apiRequest('/api/regulatory/tasks/unified', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          organizationId,
          projectId,
          dueDate: data.dueDate ? format(data.dueDate, 'yyyy-MM-dd') : undefined,
          estimatedHours: data.estimatedHours ? parseFloat(data.estimatedHours) : undefined,
        }),
      });
    },
    onSuccess: (data) => {
      toast({
        title: 'Task Created Successfully',
        description: `Task "${formData.title}" has been added to ${formData.moduleType} module`,
      });
      
      // Invalidate queries to refresh the dashboard
      queryClient.invalidateQueries({ queryKey: ['/api/regulatory/tasks/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/regulatory/dashboard/unified'] });
      
      // Call callback if provided
      if (onTaskCreated) {
        onTaskCreated(data.task);
      }
      
      // Reset form and close
      resetForm();
      onClose();
    },
    onError: (error) => {
      toast({
        title: 'Failed to Create Task',
        description: error.message || 'Please check your input and try again',
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setFormData({
      moduleType: defaultModule || '',
      title: '',
      description: '',
      category: '',
      taskType: 'action',
      priority: 'medium',
      dueDate: null,
      estimatedHours: '',
      assigneeName: '',
      tags: [],
      metadata: {},
    });
    setErrors({});
    setCurrentTag('');
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.moduleType) {
      newErrors.moduleType = 'Please select a module';
    }
    
    if (!formData.title || formData.title.trim().length < 3) {
      newErrors.title = 'Title must be at least 3 characters';
    }
    
    if (formData.estimatedHours && isNaN(parseFloat(formData.estimatedHours))) {
      newErrors.estimatedHours = 'Must be a valid number';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) {
      return;
    }
    
    createTaskMutation.mutate(formData);
  };

  const handleAddTag = () => {
    if (currentTag && !formData.tags.includes(currentTag)) {
      setFormData({
        ...formData,
        tags: [...formData.tags, currentTag],
      });
      setCurrentTag('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter(tag => tag !== tagToRemove),
    });
  };

  const selectedModule = MODULES.find(m => m.id === formData.moduleType);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Create New Task
          </DialogTitle>
          <DialogDescription>
            Add a new task to any module in the Regulatory Submission Center
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Module Selection */}
          <div className="space-y-2">
            <Label htmlFor="module">Module *</Label>
            <Select
              value={formData.moduleType}
              onValueChange={(value) => {
                setFormData({ ...formData, moduleType: value, category: '' });
                setErrors({ ...errors, moduleType: undefined });
              }}
            >
              <SelectTrigger className={errors.moduleType ? 'border-red-500' : ''}>
                <SelectValue placeholder="Select a module">
                  {selectedModule && (
                    <div className="flex items-center gap-2">
                      <selectedModule.icon className="w-4 h-4" />
                      {selectedModule.name}
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MODULES.map((module) => (
                  <SelectItem key={module.id} value={module.id}>
                    <div className="flex items-center gap-2">
                      <module.icon className="w-4 h-4" />
                      {module.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.moduleType && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.moduleType}
              </p>
            )}
          </div>

          {/* Task Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Task Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => {
                setFormData({ ...formData, title: e.target.value });
                setErrors({ ...errors, title: undefined });
              }}
              placeholder="Enter task title..."
              className={errors.title ? 'border-red-500' : ''}
            />
            {errors.title && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.title}
              </p>
            )}
          </div>

          {/* Category (based on module) */}
          {selectedModule && (
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {selectedModule.categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Provide task details..."
              rows={3}
            />
          </div>

          {/* Task Type and Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="taskType">Task Type</Label>
              <Select
                value={formData.taskType}
                onValueChange={(value) => setFormData({ ...formData, taskType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) => setFormData({ ...formData, priority: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((priority) => (
                    <SelectItem key={priority.value} value={priority.value}>
                      <span className={`px-2 py-1 rounded-full text-xs ${priority.color}`}>
                        {priority.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Due Date and Estimated Hours */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.dueDate ? format(formData.dueDate, 'PPP') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.dueDate}
                    onSelect={(date) => setFormData({ ...formData, dueDate: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimatedHours">Estimated Hours</Label>
              <Input
                id="estimatedHours"
                type="number"
                value={formData.estimatedHours}
                onChange={(e) => {
                  setFormData({ ...formData, estimatedHours: e.target.value });
                  setErrors({ ...errors, estimatedHours: undefined });
                }}
                placeholder="e.g., 8"
                className={errors.estimatedHours ? 'border-red-500' : ''}
              />
              {errors.estimatedHours && (
                <p className="text-sm text-red-500">{errors.estimatedHours}</p>
              )}
            </div>
          </div>

          {/* Assignee */}
          <div className="space-y-2">
            <Label htmlFor="assignee">Assignee</Label>
            <Input
              id="assignee"
              value={formData.assigneeName}
              onChange={(e) => setFormData({ ...formData, assigneeName: e.target.value })}
              placeholder="Enter assignee name..."
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={currentTag}
                onChange={(e) => setCurrentTag(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add tags..."
              />
              <Button type="button" onClick={handleAddTag} variant="secondary">
                Add
              </Button>
            </div>
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    {tag} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={createTaskMutation.isPending}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={createTaskMutation.isPending}
          >
            {createTaskMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
      </DialogContent>
    </Dialog>
  );
}