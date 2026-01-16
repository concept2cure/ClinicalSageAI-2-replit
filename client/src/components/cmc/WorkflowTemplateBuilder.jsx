import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import {
  Plus, Trash2, Save, Copy, Eye, GripVertical, Clock, User, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast';

export function WorkflowTemplateBuilder({ onSave, existingTemplate = null }) {
  const [template, setTemplate] = useState({
    name: existingTemplate?.name || '',
    description: existingTemplate?.description || '',
    estimatedTime: existingTemplate?.estimatedTime || '',
    priority: existingTemplate?.priority || 'medium',
    category: existingTemplate?.category || 'cmc-general',
    regulations: existingTemplate?.regulations || [],
    deliverables: existingTemplate?.deliverables || [],
    tasks: existingTemplate?.tasks || [],
  });

  const [newRegulation, setNewRegulation] = useState('');
  const [newDeliverable, setNewDeliverable] = useState('');
  const [draggedTask, setDraggedTask] = useState(null);
  const { toast } = useToast();

  const addTask = () => {
    const newTask = {
      id: Date.now(),
      name: '',
      duration: '1 day',
      owner: '',
      status: 'pending',
      requirements: [],
      dependencies: [],
    };

    setTemplate(prev => ({
      ...prev,
      tasks: [...prev.tasks, newTask],
    }));
  };

  const updateTask = (taskId, field, value) => {
    setTemplate(prev => ({
      ...prev,
      tasks: prev.tasks.map(task => (task.id === taskId ? { ...task, [field]: value } : task)),
    }));
  };

  const removeTask = taskId => {
    setTemplate(prev => ({
      ...prev,
      tasks: prev.tasks.filter(task => task.id !== taskId),
    }));
  };

  const addRegulation = () => {
    if (newRegulation.trim()) {
      setTemplate(prev => ({
        ...prev,
        regulations: [...prev.regulations, newRegulation.trim()],
      }));
      setNewRegulation('');
    }
  };

  const removeRegulation = index => {
    setTemplate(prev => ({
      ...prev,
      regulations: prev.regulations.filter((_, i) => i !== index),
    }));
  };

  const addDeliverable = () => {
    if (newDeliverable.trim()) {
      setTemplate(prev => ({
        ...prev,
        deliverables: [...prev.deliverables, newDeliverable.trim()],
      }));
      setNewDeliverable('');
    }
  };

  const removeDeliverable = index => {
    setTemplate(prev => ({
      ...prev,
      deliverables: prev.deliverables.filter((_, i) => i !== index),
    }));
  };

  const handleDragStart = (e, taskId) => {
    setDraggedTask(taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetTaskId) => {
    e.preventDefault();

    if (draggedTask && draggedTask !== targetTaskId) {
      const tasks = [...template.tasks];
      const draggedIndex = tasks.findIndex(t => t.id === draggedTask);
      const targetIndex = tasks.findIndex(t => t.id === targetTaskId);

      // Remove dragged task and insert at new position
      const [removed] = tasks.splice(draggedIndex, 1);
      tasks.splice(targetIndex, 0, removed);

      setTemplate(prev => ({ ...prev, tasks }));
    }

    setDraggedTask(null);
  };

  const saveTemplate = async () => {
    if (!template.name.trim()) {
      toast({
        title: 'Name Required',
        description: 'Please enter a template name.',
        variant: 'destructive',
      });
      return;
    }

    if (template.tasks.length === 0) {
      toast({
        title: 'Tasks Required',
        description: 'Please add at least one task to the template.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Validate all tasks have required fields
      const incompleteTask = template.tasks.find(
        task => !task.name.trim() || !task.owner.trim() || !task.duration.trim()
      );

      if (incompleteTask) {
        toast({
          title: 'Incomplete Task',
          description: 'All tasks must have a name, owner, and duration.',
          variant: 'destructive',
        });
        return;
      }

      const templateData = {
        ...template,
        id: existingTemplate?.id || `custom-${Date.now()}`,
        createdAt: existingTemplate?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isCustom: true,
      };

      // Save to backend (simulated)
      await new Promise(resolve => setTimeout(resolve, 1000));

      onSave && onSave(templateData);

      toast({
        title: 'Template Saved',
        description: `${template.name} template has been saved successfully.`,
      });
    } catch (error) {
      toast({
        title: 'Save Failed',
        description: error.message || 'Failed to save template.',
        variant: 'destructive',
      });
    }
  };

  const duplicateTemplate = () => {
    const duplicated = {
      ...template,
      name: `${template.name} (Copy)`,
      id: `custom-${Date.now()}`,
      tasks: template.tasks.map(task => ({ ...task, id: Date.now() + Math.random() })),
    };
    setTemplate(duplicated);

    toast({
      title: 'Template Duplicated',
      description: 'Template has been duplicated. You can now modify it.',
    });
  };

  const previewTemplate = () => {
    // Would open a preview modal in a real implementation
    toast({
      title: 'Preview Mode',
      description: 'Template preview functionality would open here.',
    });
  };

  return (
    <div className="space-y-6">
      {/* Template Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Template Information</CardTitle>
          <CardDescription>Define the basic properties of your workflow template</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Template Name</label>
              <Input
                value={template.name}
                onChange={e => setTemplate(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., IND CMC Package"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Select
                value={template.category}
                onValueChange={value => setTemplate(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cmc-general">CMC General</SelectItem>
                  <SelectItem value="ind-submission">IND Submission</SelectItem>
                  <SelectItem value="nda-submission">NDA Submission</SelectItem>
                  <SelectItem value="stability">Stability Studies</SelectItem>
                  <SelectItem value="analytical">Analytical Development</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="qbd">Quality by Design</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Estimated Time</label>
              <Input
                value={template.estimatedTime}
                onChange={e => setTemplate(prev => ({ ...prev, estimatedTime: e.target.value }))}
                placeholder="e.g., 4-6 weeks"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Priority</label>
              <Select
                value={template.priority}
                onValueChange={value => setTemplate(prev => ({ ...prev, priority: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={template.description}
              onChange={e => setTemplate(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the purpose and scope of this workflow template..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Regulatory Requirements */}
      <Card>
        <CardHeader>
          <CardTitle>Regulatory Requirements</CardTitle>
          <CardDescription>
            Specify the regulatory guidelines and requirements this template addresses
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newRegulation}
              onChange={e => setNewRegulation(e.target.value)}
              placeholder="e.g., FDA 21 CFR 312.23"
              onKeyPress={e => e.key === 'Enter' && addRegulation()}
            />
            <Button onClick={addRegulation} variant="outline">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {template.regulations.map((regulation, index) => (
              <Badge key={index} variant="secondary" className="flex items-center gap-1">
                {regulation}
                <button
                  onClick={() => removeRegulation(index)}
                  className="ml-1 text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Deliverables */}
      <Card>
        <CardHeader>
          <CardTitle>Expected Deliverables</CardTitle>
          <CardDescription>
            Define the key outputs and deliverables for this workflow
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newDeliverable}
              onChange={e => setNewDeliverable(e.target.value)}
              placeholder="e.g., Module 3.2.S summary"
              onKeyPress={e => e.key === 'Enter' && addDeliverable()}
            />
            <Button onClick={addDeliverable} variant="outline">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {template.deliverables.map((deliverable, index) => (
              <Badge key={index} variant="outline" className="flex items-center gap-1">
                {deliverable}
                <button
                  onClick={() => removeDeliverable(index)}
                  className="ml-1 text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tasks */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Workflow Tasks</CardTitle>
              <CardDescription>
                Define the tasks and their sequence for this workflow
              </CardDescription>
            </div>
            <Button onClick={addTask} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {template.tasks.map((task, index) => (
            <div
              key={task.id}
              draggable
              onDragStart={e => handleDragStart(e, task.id)}
              onDragOver={handleDragOver}
              onDrop={e => handleDrop(e, task.id)}
              className="border rounded-lg p-4 space-y-3 hover:bg-gray-50 cursor-move"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-gray-400" />
                  <span className="text-sm font-medium">Task {index + 1}</span>
                  <Badge variant="outline">{task.status || 'pending'}</Badge>
                </div>
                <Button
                  onClick={() => removeTask(task.id)}
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Task Name</label>
                  <Input
                    value={task.name}
                    onChange={e => updateTask(task.id, 'name', e.target.value)}
                    placeholder="e.g., Drug Substance Characterization"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">Duration</label>
                  <Input
                    value={task.duration}
                    onChange={e => updateTask(task.id, 'duration', e.target.value)}
                    placeholder="e.g., 5 days"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">Owner</label>
                  <Input
                    value={task.owner}
                    onChange={e => updateTask(task.id, 'owner', e.target.value)}
                    placeholder="e.g., CMC Lead"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Requirements</label>
                <Textarea
                  value={task.requirements.join(', ')}
                  onChange={e =>
                    updateTask(
                      task.id,
                      'requirements',
                      e.target.value
                        .split(',')
                        .map(r => r.trim())
                        .filter(r => r)
                    )
                  }
                  placeholder="e.g., Physicochemical properties, Structure confirmation"
                  rows={2}
                />
              </div>
            </div>
          ))}

          {template.tasks.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No tasks added yet</p>
              <p className="text-sm">Click "Add Task" to get started</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3 justify-end">
            <Button onClick={previewTemplate} variant="outline">
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button onClick={duplicateTemplate} variant="outline">
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </Button>
            <Button onClick={saveTemplate} className="bg-indigo-600 hover:bg-indigo-700">
              <Save className="h-4 w-4 mr-2" />
              Save Template
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default WorkflowTemplateBuilder;
