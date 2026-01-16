import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, } from '@/components/ui/dialog';
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';
import {
  RefreshCw, FileText, CheckCircle, AlertTriangle, Search, Download, FileQuestion, BookOpen, Clock, Calendar, User, Users, Activity, BellRing, PlusCircle, XCircle, CheckSquare, MoreHorizontal, Eye, Pencil, Trash2, MessageSquare, Link, FileCheck, FileCog, ArrowRight, ArrowLeft, ArrowUpDown, Calendar as CalendarIcon, CalendarDays, CalendarClock, ClipboardCheck, ClipboardList, Paperclip, Megaphone, ListChecks, Kanban, ListTodo, Timer, BarChart, PieChart, Lightbulb, Brain, Bot, Tag, Tags, Filter, Sparkles, Zap, Play } from 'lucide-react'
import { useToast } from '@/hooks/use-toast';

/**
 * TaskManagementSystem
 *
 * A comprehensive, AI-powered task management system designed specifically
 * for pharmaceutical and clinical documentation teams that need to adhere to
 * regulatory requirements and compliance standards.
 */
const TaskManagementSystem = ({ processId }) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('myTasks');
  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('deadline');
  const [sortDirection, setSortDirection] = useState('asc');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [documentFilter, setDocumentFilter] = useState('all');
  const [showTaskDetails, setShowTaskDetails] = useState(false);
  const [showEditTask, setShowEditTask] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [currentView, setCurrentView] = useState('list');
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [processStage, setProcessStage] = useState('development');
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium',
    deadline: '',
    assignee: '',
    relatedDocuments: [],
    documents: [],
    workflowId: '',
    regulatoryRequirement: false,
    tags: [],
  });

  // Demo/sample team members for assignment
  const teamMembers = [
    { id: 'user1', name: 'Sarah Johnson', role: 'Regulatory Affairs Manager', avatar: '👩‍⚕️' },
    { id: 'user2', name: 'Michael Chen', role: 'CMC Documentation Specialist', avatar: '👨‍💼' },
    { id: 'user3', name: 'Jennifer Williams', role: 'Quality Assurance Lead', avatar: '👩‍🔬' },
    { id: 'user4', name: 'Robert Miller', role: 'Formulation Scientist', avatar: '👨‍🔬' },
    { id: 'user5', name: 'Emily Davis', role: 'Clinical Documentation Writer', avatar: '👩‍💻' },
    { id: 'user6', name: 'David Thompson', role: 'Analytical Method Specialist', avatar: '👨‍🔬' },
    { id: 'user7', name: 'Lisa Roberts', role: 'Regulatory Submission Manager', avatar: '👩‍💼' },
  ];

  // Sample document types for filtering
  const documentTypes = [
    'All Documents',
    'API Specifications',
    'Method Validation',
    'Process Validation',
    'Stability Reports',
    'Analytical Methods',
    'Manufacturing Process',
    'Formulation Development',
    'Risk Assessments',
    'Change Controls',
    'Deviation Reports',
  ];

  // Sample tasks data for demonstration
  const sampleTasks = [
    {
      id: 'task-001',
      title: 'Complete API Specification Review',
      description:
        'Review API specification document for compliance with ICH Q6A guidelines. Check all acceptance criteria and ensure they meet regulatory requirements.',
      status: 'in_progress',
      priority: 'high',
      createdBy: 'Sarah Johnson',
      assignee: 'Michael Chen',
      assignedDate: '2025-04-05T09:30:00Z',
      deadline: '2025-04-26T17:00:00Z',
      completionPercentage: 65,
      estimatedHours: 8,
      hoursLogged: 5.5,
      documents: [
        {
          id: 'doc-123',
          title: 'API Specification',
          version: '1.2',
          type: 'API Specifications',
        },
      ],
      workflowId: 'wf-001',
      workflowName: 'API Specification Document Review',
      regulatoryRequirement: true,
      regulatoryStandards: ['ICH Q6A', '21 CFR Part 211'],
      comments: [
        {
          id: 'comment-001',
          user: 'Michael Chen',
          timestamp: '2025-04-15T10:45:00Z',
          text: 'Completed initial review. Found several acceptance criteria that need additional justification for FDA submission.',
          attachments: [],
        },
        {
          id: 'comment-002',
          user: 'Sarah Johnson',
          timestamp: '2025-04-16T14:20:00Z',
          text: 'Please ensure all acceptance criteria include the appropriate analytical method references.',
          attachments: [],
        },
      ],
      history: [
        {
          action: 'Task Created',
          timestamp: '2025-04-05T09:30:00Z',
          user: 'Sarah Johnson',
        },
        {
          action: 'Task Assigned',
          timestamp: '2025-04-05T09:30:00Z',
          user: 'Sarah Johnson',
          details: 'Assigned to Michael Chen',
        },
        {
          action: 'Task Updated',
          timestamp: '2025-04-15T10:45:00Z',
          user: 'Michael Chen',
          details: 'Updated status to In Progress and added comment',
        },
      ],
      aiRecommendations: {
        similarTasks: ['task-008', 'task-015'],
        prioritySuggestion: 'high',
        estimatedTimeRequired: 9.5,
        potentialIssues: [
          'Analytical method validation may be required',
          'ICH Q6A alignment needs verification',
        ],
      },
      tags: ['API', 'Specification', 'ICH', 'Review'],
    },
    {
      id: 'task-002',
      title: 'Draft Manufacturing Process Change Assessment',
      description:
        'Prepare assessment document for the proposed changes to tablet compression parameters. Include impact analysis on product quality and validation requirements.',
      status: 'not_started',
      priority: 'urgent',
      createdBy: 'Lisa Roberts',
      assignee: 'Robert Miller',
      assignedDate: '2025-04-12T14:15:00Z',
      deadline: '2025-04-22T17:00:00Z',
      completionPercentage: 0,
      estimatedHours: 12,
      hoursLogged: 0,
      documents: [
        {
          id: 'doc-345',
          title: 'Manufacturing Process Description',
          version: '2.3',
          type: 'Manufacturing Process',
        },
        {
          id: 'doc-346',
          title: 'Change Control Form',
          version: '1.0',
          type: 'Change Controls',
        },
      ],
      workflowId: 'wf-002',
      workflowName: 'Manufacturing Process Change Control',
      regulatoryRequirement: true,
      regulatoryStandards: ['ICH Q10', '21 CFR Part 211.100'],
      comments: [],
      history: [
        {
          action: 'Task Created',
          timestamp: '2025-04-12T14:15:00Z',
          user: 'Lisa Roberts',
        },
        {
          action: 'Task Assigned',
          timestamp: '2025-04-12T14:15:00Z',
          user: 'Lisa Roberts',
          details: 'Assigned to Robert Miller',
        },
      ],
      aiRecommendations: {
        similarTasks: ['task-012', 'task-023'],
        prioritySuggestion: 'urgent',
        estimatedTimeRequired: 14,
        potentialIssues: [
          'Process validation may need updating',
          'Stability impact assessment recommended',
        ],
      },
      tags: ['Manufacturing', 'Change Control', 'Impact Assessment'],
    },
    {
      id: 'task-003',
      title: 'Finalize Stability Protocol',
      description:
        'Complete the stability protocol for the new formulation. Include testing schedule, storage conditions, and acceptance criteria according to ICH Q1A(R2) guidelines.',
      status: 'in_progress',
      priority: 'medium',
      createdBy: 'Jennifer Williams',
      assignee: 'Emily Davis',
      assignedDate: '2025-04-08T11:00:00Z',
      deadline: '2025-04-30T17:00:00Z',
      completionPercentage: 75,
      estimatedHours: 10,
      hoursLogged: 7.5,
      documents: [
        {
          id: 'doc-567',
          title: 'Stability Protocol',
          version: '0.8',
          type: 'Stability Reports',
        },
      ],
      workflowId: 'wf-003',
      workflowName: 'Stability Testing Documentation',
      regulatoryRequirement: true,
      regulatoryStandards: ['ICH Q1A(R2)', 'ICH Q1B'],
      comments: [
        {
          id: 'comment-003',
          user: 'Emily Davis',
          timestamp: '2025-04-14T09:20:00Z',
          text: 'Draft protocol is 75% complete. Need input on photo-stability testing requirements.',
          attachments: [],
        },
      ],
      history: [
        {
          action: 'Task Created',
          timestamp: '2025-04-08T11:00:00Z',
          user: 'Jennifer Williams',
        },
        {
          action: 'Task Assigned',
          timestamp: '2025-04-08T11:00:00Z',
          user: 'Jennifer Williams',
          details: 'Assigned to Emily Davis',
        },
        {
          action: 'Task Updated',
          timestamp: '2025-04-14T09:20:00Z',
          user: 'Emily Davis',
          details: 'Updated progress to 75% and added comment',
        },
      ],
      aiRecommendations: {
        similarTasks: ['task-019', 'task-027'],
        prioritySuggestion: 'medium',
        estimatedTimeRequired: 10,
        potentialIssues: [
          'Photo-stability testing requirements need clarification',
          'Consider temperature excursion protocols',
        ],
      },
      tags: ['Stability', 'Protocol', 'ICH', 'Documentation'],
    },
    {
      id: 'task-004',
      title: 'Update Method Validation Report',
      description:
        'Update the HPLC method validation report to include additional specificity data requested by regulatory affairs.',
      status: 'completed',
      priority: 'medium',
      createdBy: 'Jennifer Williams',
      assignee: 'David Thompson',
      assignedDate: '2025-04-02T13:45:00Z',
      deadline: '2025-04-15T17:00:00Z',
      completionPercentage: 100,
      completedDate: '2025-04-14T16:30:00Z',
      estimatedHours: 6,
      hoursLogged: 8,
      documents: [
        {
          id: 'doc-234',
          title: 'HPLC Method Validation Report',
          version: '1.2',
          type: 'Method Validation',
        },
      ],
      workflowId: 'wf-005',
      workflowName: 'Method Validation Documentation',
      regulatoryRequirement: true,
      regulatoryStandards: ['ICH Q2(R1)', 'USP <1225>'],
      comments: [
        {
          id: 'comment-004',
          user: 'David Thompson',
          timestamp: '2025-04-10T11:10:00Z',
          text: 'Additional specificity experiments completed. Drafting updated report sections.',
          attachments: [],
        },
        {
          id: 'comment-005',
          user: 'David Thompson',
          timestamp: '2025-04-14T16:30:00Z',
          text: 'Report updated with all requested specificity data and submitted for review.',
          attachments: [],
        },
      ],
      history: [
        {
          action: 'Task Created',
          timestamp: '2025-04-02T13:45:00Z',
          user: 'Jennifer Williams',
        },
        {
          action: 'Task Assigned',
          timestamp: '2025-04-02T13:45:00Z',
          user: 'Jennifer Williams',
          details: 'Assigned to David Thompson',
        },
        {
          action: 'Task Updated',
          timestamp: '2025-04-10T11:10:00Z',
          user: 'David Thompson',
          details: 'Added progress update comment',
        },
        {
          action: 'Task Completed',
          timestamp: '2025-04-14T16:30:00Z',
          user: 'David Thompson',
        },
      ],
      aiRecommendations: {
        similarTasks: ['task-011', 'task-022'],
        prioritySuggestion: 'medium',
        estimatedTimeRequired: 7,
        potentialIssues: ['Consider system suitability revisions', 'Check robustness parameters'],
      },
      tags: ['Method Validation', 'HPLC', 'ICH', 'Documentation'],
    },
    {
      id: 'task-005',
      title: 'Prepare Risk Assessment for Excipient Change',
      description:
        'Create risk assessment documentation for the proposed change of disintegrant supplier, focusing on product performance and stability impact.',
      status: 'not_started',
      priority: 'high',
      createdBy: 'Sarah Johnson',
      assignee: 'Lisa Roberts',
      assignedDate: '2025-04-18T10:30:00Z',
      deadline: '2025-04-28T17:00:00Z',
      completionPercentage: 0,
      estimatedHours: 14,
      hoursLogged: 0,
      documents: [
        {
          id: 'doc-789',
          title: 'Excipient Change Request',
          version: '1.0',
          type: 'Change Controls',
        },
      ],
      workflowId: 'wf-006',
      workflowName: 'Excipient Supplier Change Control',
      regulatoryRequirement: true,
      regulatoryStandards: ['ICH Q9', 'ICH Q10', '21 CFR Part 211.84'],
      comments: [],
      history: [
        {
          action: 'Task Created',
          timestamp: '2025-04-18T10:30:00Z',
          user: 'Sarah Johnson',
        },
        {
          action: 'Task Assigned',
          timestamp: '2025-04-18T10:30:00Z',
          user: 'Sarah Johnson',
          details: 'Assigned to Lisa Roberts',
        },
      ],
      aiRecommendations: {
        similarTasks: ['task-016', 'task-024'],
        prioritySuggestion: 'high',
        estimatedTimeRequired: 16,
        potentialIssues: [
          'Disintegration testing comparison needed',
          'Stability testing impact assessment required',
        ],
      },
      tags: ['Risk Assessment', 'Excipients', 'Supplier Change', 'ICH Q9'],
    },
    {
      id: 'task-006',
      title: 'Draft Analytical Method Transfer Protocol',
      description:
        'Prepare protocol for transferring the dissolution method to the contract testing laboratory. Include acceptance criteria for successful transfer.',
      status: 'in_progress',
      priority: 'medium',
      createdBy: 'Jennifer Williams',
      assignee: 'David Thompson',
      assignedDate: '2025-04-15T13:00:00Z',
      deadline: '2025-04-29T17:00:00Z',
      completionPercentage: 30,
      estimatedHours: 8,
      hoursLogged: 2.5,
      documents: [
        {
          id: 'doc-456',
          title: 'Dissolution Method SOP',
          version: '2.1',
          type: 'Analytical Methods',
        },
      ],
      workflowId: 'wf-007',
      workflowName: 'Method Transfer to CRO',
      regulatoryRequirement: true,
      regulatoryStandards: ['ICH Q2(R1)', 'USP <1224>'],
      comments: [
        {
          id: 'comment-006',
          user: 'David Thompson',
          timestamp: '2025-04-17T15:40:00Z',
          text: 'Initial draft in progress. Need to clarify comparative testing requirements with CRO.',
          attachments: [],
        },
      ],
      history: [
        {
          action: 'Task Created',
          timestamp: '2025-04-15T13:00:00Z',
          user: 'Jennifer Williams',
        },
        {
          action: 'Task Assigned',
          timestamp: '2025-04-15T13:00:00Z',
          user: 'Jennifer Williams',
          details: 'Assigned to David Thompson',
        },
        {
          action: 'Task Updated',
          timestamp: '2025-04-17T15:40:00Z',
          user: 'David Thompson',
          details: 'Added progress update comment',
        },
      ],
      aiRecommendations: {
        similarTasks: ['task-020', 'task-032'],
        prioritySuggestion: 'medium',
        estimatedTimeRequired: 9,
        potentialIssues: [
          'Consider sample homogeneity requirements',
          'Add reference standard handling section',
        ],
      },
      tags: ['Method Transfer', 'Dissolution', 'Protocol', 'CRO'],
    },
    {
      id: 'task-007',
      title: 'Review Drug Product Stability Data',
      description:
        'Review and analyze 12-month stability data for the drug product. Prepare summary report highlighting any trends or out-of-specification results.',
      status: 'not_started',
      priority: 'urgent',
      createdBy: 'Robert Miller',
      assignee: 'Emily Davis',
      assignedDate: '2025-04-19T09:15:00Z',
      deadline: '2025-04-24T17:00:00Z',
      completionPercentage: 0,
      estimatedHours: 10,
      hoursLogged: 0,
      documents: [
        {
          id: 'doc-678',
          title: '12-Month Stability Report',
          version: '1.0',
          type: 'Stability Reports',
        },
      ],
      workflowId: 'wf-008',
      workflowName: 'Stability Data Review',
      regulatoryRequirement: true,
      regulatoryStandards: ['ICH Q1A(R2)', 'ICH Q1E'],
      comments: [],
      history: [
        {
          action: 'Task Created',
          timestamp: '2025-04-19T09:15:00Z',
          user: 'Robert Miller',
        },
        {
          action: 'Task Assigned',
          timestamp: '2025-04-19T09:15:00Z',
          user: 'Robert Miller',
          details: 'Assigned to Emily Davis',
        },
      ],
      aiRecommendations: {
        similarTasks: ['task-018', 'task-029'],
        prioritySuggestion: 'urgent',
        estimatedTimeRequired: 12,
        potentialIssues: [
          'Check for dissolution trend analysis',
          'Ensure statistical evaluation of data',
        ],
      },
      tags: ['Stability', 'Data Review', 'ICH', 'Drug Product'],
    },
  ];

  // Load sample tasks on component mount
  useEffect(() => {
    setTasks(sampleTasks);
    setFilteredTasks(sampleTasks);
    if (processId) {
      loadProcessStage();
      generateAISuggestions();
    }
  }, [processId]);

  // AI-powered functions
  const loadProcessStage = async () => {
    try {
      const response = await fetch(`/api/process/processes/${processId}`);
      if (response.ok) {
        const processData = await response.json();
        setProcessStage(processData.stage || 'development');
      }
    } catch (error) {
      console.error('Error loading process stage:', error);
    }
  };

  const generateAISuggestions = async () => {
    if (!processId) return;

    setAiLoading(true);
    try {
      const response = await fetch('/api/ai/task-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processId,
          stage: processStage,
          existingTasks: tasks.map(t => ({ id: t.id, title: t.title, status: t.status })),
        }),
      });

      if (response.ok) {
        const suggestions = await response.json();
        setAiSuggestions(suggestions.tasks || []);
      } else {
        // Fallback AI suggestions based on stage
        setAiSuggestions(getStageBasedSuggestions(processStage));
      }
    } catch (error) {
      console.error('Error generating AI suggestions:', error);
      setAiSuggestions(getStageBasedSuggestions(processStage));
    } finally {
      setAiLoading(false);
    }
  };

  const getStageBasedSuggestions = stage => {
    const suggestions = {
      development: [
        {
          id: 'ai-001',
          title: 'Design Characterization Studies',
          description:
            'Establish analytical methods for critical quality attributes (CQAs) and critical process parameters (CPPs)',
          priority: 'high',
          estimatedHours: 40,
          assignmentSuggestion: 'Analytical Method Specialist',
          regulatoryRequirement: true,
          tags: ['CQA', 'CPP', 'Method Development'],
          aiRationale: 'Essential for establishing process understanding per ICH Q8',
        },
        {
          id: 'ai-002',
          title: 'Process Risk Assessment',
          description:
            'Conduct FMEA analysis to identify potential failure modes and control strategies',
          priority: 'high',
          estimatedHours: 24,
          assignmentSuggestion: 'Quality Assurance Lead',
          regulatoryRequirement: true,
          tags: ['FMEA', 'Risk Assessment', 'ICH Q9'],
          aiRationale: 'Required for establishing control strategy per ICH Q9',
        },
      ],
      validation: [
        {
          id: 'ai-003',
          title: 'Process Performance Qualification Protocol',
          description: 'Develop PPQ protocol including acceptance criteria and sampling plan',
          priority: 'urgent',
          estimatedHours: 32,
          assignmentSuggestion: 'Regulatory Affairs Manager',
          regulatoryRequirement: true,
          tags: ['PPQ', 'Protocol', 'Validation'],
          aiRationale:
            'Critical for demonstrating process capability before commercial manufacturing',
        },
      ],
      commercial: [
        {
          id: 'ai-004',
          title: 'Continued Process Verification',
          description: 'Establish CPV plan for ongoing process monitoring and control',
          priority: 'medium',
          estimatedHours: 16,
          assignmentSuggestion: 'Quality Assurance Lead',
          regulatoryRequirement: true,
          tags: ['CPV', 'Monitoring', 'ICH Q10'],
          aiRationale: 'Ensures ongoing process control per ICH Q10',
        },
      ],
    };
    return suggestions[stage] || suggestions.development;
  };

  const assignTask = async (taskId, assigneeId) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeId, processId }),
      });

      if (response.ok) {
        const updatedTask = await response.json();
        setTasks(prev => prev.map(task => (task.id === taskId ? updatedTask : task)));
        toast({
          title: 'Task Assigned',
          description: 'Task has been successfully assigned.',
        });
      } else {
        throw new Error('Failed to assign task');
      }
    } catch (error) {
      console.error('Error assigning task:', error);
      // Fallback - update state locally
      setTasks(prev =>
        prev.map(task =>
          task.id === taskId
            ? { ...task, assignee: teamMembers.find(m => m.id === assigneeId)?.name || assigneeId }
            : task
        )
      );
      toast({
        title: 'Task Assigned (Local)',
        description: 'Task assignment saved locally.',
      });
    }
    setShowAssignDialog(false);
  };

  const moveTaskToStage = async (taskId, newStatus) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, processId }),
      });

      if (response.ok) {
        const updatedTask = await response.json();
        setTasks(prev => prev.map(task => (task.id === taskId ? updatedTask : task)));
        toast({
          title: 'Task Updated',
          description: `Task moved to ${newStatus.replace('_', ' ')}`,
        });
      } else {
        throw new Error('Failed to update task status');
      }
    } catch (error) {
      console.error('Error updating task:', error);
      // Fallback - update state locally
      setTasks(prev =>
        prev.map(task => (task.id === taskId ? { ...task, status: newStatus } : task))
      );
      toast({
        title: 'Task Updated (Local)',
        description: `Task moved to ${newStatus.replace('_', ' ')}`,
      });
    }
  };

  const createTaskFromAISuggestion = async suggestion => {
    const task = {
      title: suggestion.title,
      description: suggestion.description,
      priority: suggestion.priority,
      estimatedHours: suggestion.estimatedHours,
      regulatoryRequirement: suggestion.regulatoryRequirement,
      tags: suggestion.tags,
      processId,
      aiGenerated: true,
      aiRationale: suggestion.aiRationale,
    };

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });

      if (response.ok) {
        const newTask = await response.json();
        setTasks(prev => [...prev, newTask]);
        setAiSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
        toast({
          title: 'AI Task Created',
          description: 'Task created from AI suggestion',
        });
      } else {
        throw new Error('Failed to create task');
      }
    } catch (error) {
      console.error('Error creating AI task:', error);
      // Fallback - add to local state
      const localTask = {
        ...task,
        id: `task-ai-${Date.now()}`,
        status: 'not_started',
        createdBy: 'AI Assistant',
        assignedDate: new Date().toISOString(),
        completionPercentage: 0,
        hoursLogged: 0,
        assignee: teamMembers.find(m => m.role === suggestion.assignmentSuggestion)?.name || '',
      };
      setTasks(prev => [...prev, localTask]);
      setAiSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
      toast({
        title: 'AI Task Created (Local)',
        description: 'Task created from AI suggestion and saved locally',
      });
    }
  };

  // Filter and sort tasks when filter criteria change
  useEffect(() => {
    let filtered = [...tasks];

    // Apply search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        task =>
          task.title.toLowerCase().includes(query) ||
          task.description.toLowerCase().includes(query) ||
          task.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Apply priority filter
    if (priorityFilter !== 'all') {
      filtered = filtered.filter(task => task.priority === priorityFilter);
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(task => task.status === statusFilter);
    }

    // Apply document filter
    if (documentFilter !== 'all' && documentFilter !== 'All Documents') {
      filtered = filtered.filter(task => task.documents.some(doc => doc.type === documentFilter));
    }

    // Apply sorting
    filtered = filtered.sort((a, b) => {
      if (sortField === 'title') {
        return sortDirection === 'asc'
          ? a.title.localeCompare(b.title)
          : b.title.localeCompare(a.title);
      } else if (sortField === 'priority') {
        const priorityRank = { urgent: 3, high: 2, medium: 1, low: 0 };
        return sortDirection === 'asc'
          ? priorityRank[a.priority] - priorityRank[b.priority]
          : priorityRank[b.priority] - priorityRank[a.priority];
      } else if (sortField === 'deadline') {
        return sortDirection === 'asc'
          ? new Date(a.deadline) - new Date(b.deadline)
          : new Date(b.deadline) - new Date(a.deadline);
      } else if (sortField === 'status') {
        const statusRank = { not_started: 0, in_progress: 1, completed: 2 };
        return sortDirection === 'asc'
          ? statusRank[a.status] - statusRank[b.status]
          : statusRank[b.status] - statusRank[a.status];
      }
      return 0;
    });

    setFilteredTasks(filtered);
  }, [tasks, searchQuery, priorityFilter, statusFilter, documentFilter, sortField, sortDirection]);

  // Handle task completion
  const handleCompleteTask = taskId => {
    setLoading(true);

    // Simulate API delay
    setTimeout(() => {
      const updatedTasks = tasks.map(task => {
        if (task.id === taskId) {
          return {
            ...task,
            status: 'completed',
            completedDate: new Date().toISOString(),
            completionPercentage: 100,
            history: [
              ...task.history,
              {
                action: 'Task Completed',
                timestamp: new Date().toISOString(),
                user: 'Current User', // In a real app, this would be the actual user
              },
            ],
          };
        }
        return task;
      });

      setTasks(updatedTasks);
      setLoading(false);

      toast({
        title: 'Task Completed',
        description: 'The task has been marked as completed.',
      });
    }, 1000);
  };

  // Handle comment submission
  const handleAddComment = () => {
    if (!comment.trim()) {
      toast({
        title: 'Comment Required',
        description: 'Please enter a comment.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    // Simulate API delay
    setTimeout(() => {
      const updatedTasks = tasks.map(task => {
        if (task.id === selectedTask.id) {
          const newComment = {
            id: `comment-${Date.now()}`,
            user: 'Current User', // In a real app, this would be the actual user
            timestamp: new Date().toISOString(),
            text: comment,
            attachments: [],
          };

          return {
            ...task,
            comments: [...task.comments, newComment],
            history: [
              ...task.history,
              {
                action: 'Comment Added',
                timestamp: new Date().toISOString(),
                user: 'Current User',
                details: 'Added comment to task',
              },
            ],
          };
        }
        return task;
      });

      setTasks(updatedTasks);
      setComment('');
      setLoading(false);

      // Update the selected task with the new comment for immediate UI update
      const updatedSelectedTask = updatedTasks.find(task => task.id === selectedTask.id);
      setSelectedTask(updatedSelectedTask);

      toast({
        title: 'Comment Added',
        description: 'Your comment has been added to the task.',
      });
    }, 1000);
  };

  // Create a new task
  const handleCreateTask = () => {
    if (!newTask.title || !newTask.priority || !newTask.deadline || !newTask.assignee) {
      toast({
        title: 'Required Fields Missing',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    // Simulate API delay
    setTimeout(() => {
      const taskId = `task-${String(tasks.length + 1).padStart(3, '0')}`;
      const now = new Date().toISOString();

      // Get assignee details
      const assigneeDetails = teamMembers.find(member => member.id === newTask.assignee);

      const newTaskObject = {
        id: taskId,
        title: newTask.title,
        description: newTask.description,
        status: 'not_started',
        priority: newTask.priority,
        createdBy: 'Current User', // In a real app, this would be the actual user
        assignee: assigneeDetails ? assigneeDetails.name : 'Unassigned',
        assignedDate: now,
        deadline: new Date(newTask.deadline).toISOString(),
        completionPercentage: 0,
        estimatedHours: 8, // Default
        hoursLogged: 0,
        documents: [],
        workflowId: newTask.workflowId || null,
        workflowName: newTask.workflowId ? 'Connected Workflow' : null,
        regulatoryRequirement: newTask.regulatoryRequirement,
        regulatoryStandards: newTask.regulatoryRequirement ? ['ICH Q10'] : [],
        comments: [],
        history: [
          {
            action: 'Task Created',
            timestamp: now,
            user: 'Current User',
          },
          {
            action: 'Task Assigned',
            timestamp: now,
            user: 'Current User',
            details: `Assigned to ${assigneeDetails ? assigneeDetails.name : 'Unassigned'}`,
          },
        ],
        aiRecommendations: {
          similarTasks: [],
          prioritySuggestion: newTask.priority,
          estimatedTimeRequired: 8,
          potentialIssues: [],
        },
        tags: newTask.tags,
      };

      setTasks([...tasks, newTaskObject]);

      // Reset form
      setNewTask({
        title: '',
        description: '',
        priority: 'medium',
        deadline: '',
        assignee: '',
        relatedDocuments: [],
        documents: [],
        workflowId: '',
        regulatoryRequirement: false,
        tags: [],
      });

      setShowNewTask(false);
      setLoading(false);

      toast({
        title: 'Task Created',
        description: 'New task has been created successfully.',
      });
    }, 1500);
  };

  // Get priority badge color
  const getPriorityBadge = priority => {
    switch (priority) {
      case 'urgent':
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">
            Urgent
          </Badge>
        );
      case 'high':
        return (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
            High
          </Badge>
        );
      case 'medium':
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
            Medium
          </Badge>
        );
      case 'low':
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            Low
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100">
            {priority}
          </Badge>
        );
    }
  };

  // Get status badge color
  const getStatusBadge = status => {
    switch (status) {
      case 'not_started':
        return (
          <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100">
            Not Started
          </Badge>
        );
      case 'in_progress':
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
            In Progress
          </Badge>
        );
      case 'completed':
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            Completed
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100">
            {status}
          </Badge>
        );
    }
  };

  // Format date for display
  const formatDate = dateString => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Calculate days remaining or overdue
  const getDaysRemaining = deadlineString => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(deadlineString);
    deadline.setHours(0, 0, 0, 0);

    const differenceInTime = deadline.getTime() - today.getTime();
    const differenceInDays = Math.ceil(differenceInTime / (1000 * 3600 * 24));

    if (differenceInDays === 0) {
      return 'Due today';
    } else if (differenceInDays > 0) {
      return `${differenceInDays} day${differenceInDays > 1 ? 's' : ''} remaining`;
    } else {
      return `${Math.abs(differenceInDays)} day${Math.abs(differenceInDays) > 1 ? 's' : ''} overdue`;
    }
  };

  // Handle sort toggle
  const handleSort = field => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get sort indicator
  const getSortIndicator = field => {
    if (sortField === field) {
      return (
        <ArrowUpDown className={`h-4 w-4 ml-1 ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
      );
    }
    return null;
  };

  // Get AI confidence level badge
  const getAIConfidenceBadge = level => {
    if (level >= 90) {
      return (
        <Badge
          variant="outline"
          className="bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300"
        >
          High Confidence
        </Badge>
      );
    } else if (level >= 70) {
      return (
        <Badge
          variant="outline"
          className="bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300"
        >
          Medium Confidence
        </Badge>
      );
    } else {
      return (
        <Badge
          variant="outline"
          className="bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
        >
          Low Confidence
        </Badge>
      );
    }
  };

  return (
    <Card className="w-full shadow-md border-2 border-black dark:border-white">
      <CardHeader className="bg-black text-white dark:bg-white dark:text-black">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              Intelligent Task Management
            </CardTitle>
            <CardDescription className="text-gray-300 dark:text-gray-700">
              AI-powered task management for regulatory compliance and document workflows
            </CardDescription>
          </div>
          <div>
            <Button
              onClick={() => setShowNewTask(true)}
              className="bg-white text-black hover:bg-white/90 dark:bg-black dark:text-white dark:hover:bg-black/90"
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              New Task
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full rounded-none">
            <TabsTrigger value="myTasks" className="flex-1">
              My Tasks
            </TabsTrigger>
            <TabsTrigger value="teamTasks" className="flex-1">
              Team Tasks
            </TabsTrigger>
            <TabsTrigger value="documentTasks" className="flex-1">
              Document Tasks
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex-1">
              Analytics
            </TabsTrigger>
          </TabsList>

          <div className="p-4 border-b flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex-1 w-full sm:max-w-sm">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
                <Input
                  placeholder="Search tasks..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center ml-auto">
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[130px] h-9">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px] h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="not_started">Not Started</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>

              <Select value={documentFilter} onValueChange={setDocumentFilter}>
                <SelectTrigger className="w-[170px] h-9">
                  <SelectValue placeholder="Document Type" />
                </SelectTrigger>
                <SelectContent>
                  {documentTypes.map((type, index) => (
                    <SelectItem key={index} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex rounded-md overflow-hidden border border-gray-200 dark:border-gray-800">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`px-2 h-9 rounded-none ${currentView === 'list' ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                  onClick={() => setCurrentView('list')}
                >
                  <ListTodo className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`px-2 h-9 rounded-none ${currentView === 'kanban' ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                  onClick={() => setCurrentView('kanban')}
                >
                  <Kanban className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <TabsContent value="myTasks" className="p-0">
            {currentView === 'list' ? (
              <div className="border-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        className="w-[300px] cursor-pointer"
                        onClick={() => handleSort('title')}
                      >
                        <div className="flex items-center">
                          <span>Task</span>
                          {getSortIndicator('title')}
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('priority')}>
                        <div className="flex items-center">
                          <span>Priority</span>
                          {getSortIndicator('priority')}
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('status')}>
                        <div className="flex items-center">
                          <span>Status</span>
                          {getSortIndicator('status')}
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('deadline')}>
                        <div className="flex items-center">
                          <span>Deadline</span>
                          {getSortIndicator('deadline')}
                        </div>
                      </TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTasks.map(task => (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <div>{task.title}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {task.documents.length > 0 ? (
                                <div className="flex items-center gap-1">
                                  <FileText className="h-3 w-3" />
                                  {task.documents[0].title}
                                  {task.documents.length > 1 &&
                                    ` +${task.documents.length - 1} more`}
                                </div>
                              ) : (
                                'No documents attached'
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getPriorityBadge(task.priority)}</TableCell>
                        <TableCell>{getStatusBadge(task.status)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <div>{formatDate(task.deadline)}</div>
                            <div
                              className={`text-xs ${
                                new Date(task.deadline) < new Date() && task.status !== 'completed'
                                  ? 'text-red-500 dark:text-red-400'
                                  : 'text-gray-500 dark:text-gray-400'
                              }`}
                            >
                              {getDaysRemaining(task.deadline)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={task.completionPercentage} className="h-2 w-[60px]" />
                            <span className="text-xs">{task.completionPercentage}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setSelectedTask(task);
                                setShowTaskDetails(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>

                            {task.status !== 'completed' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-green-600 dark:text-green-400"
                                onClick={() => handleCompleteTask(task.id)}
                              >
                                <CheckSquare className="h-4 w-4" />
                              </Button>
                            )}

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedTask(task);
                                    setShowEditTask(true);
                                  }}
                                >
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit Task
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedTask(task);
                                    setShowAssignDialog(true);
                                  }}
                                >
                                  <User className="h-4 w-4 mr-2" />
                                  Reassign
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-red-600 dark:text-red-400">
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Task
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}

                    {filteredTasks.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center py-6 text-gray-500 dark:text-gray-400"
                        >
                          No tasks found matching your filters
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : (
              // Kanban board view
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-4">
                    <div className="bg-gray-100 dark:bg-gray-900 p-3 rounded-t-md flex items-center justify-between">
                      <h3 className="font-medium text-sm flex items-center gap-2">
                        <ListTodo className="h-4 w-4" />
                        Not Started
                      </h3>
                      <Badge className="bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                        {filteredTasks.filter(t => t.status === 'not_started').length}
                      </Badge>
                    </div>
                    <div className="p-2 space-y-3 min-h-[300px]">
                      {filteredTasks
                        .filter(t => t.status === 'not_started')
                        .map(task => (
                          <Card
                            key={task.id}
                            className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => {
                              setSelectedTask(task);
                              setShowTaskDetails(true);
                            }}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-medium text-sm line-clamp-2">{task.title}</h4>
                              {getPriorityBadge(task.priority)}
                            </div>
                            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <span>{formatDate(task.deadline)}</span>
                              </div>
                              <div
                                className={
                                  new Date(task.deadline) < new Date()
                                    ? 'text-red-500 dark:text-red-400'
                                    : ''
                                }
                              >
                                {getDaysRemaining(task.deadline)}
                              </div>
                            </div>
                            {task.documents.length > 0 && (
                              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <FileText className="h-3 w-3" />
                                <span className="truncate">{task.documents[0].title}</span>
                              </div>
                            )}
                          </Card>
                        ))}

                      {filteredTasks.filter(t => t.status === 'not_started').length === 0 && (
                        <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
                          No tasks to show
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-blue-100 dark:bg-blue-900 p-3 rounded-t-md flex items-center justify-between">
                      <h3 className="font-medium text-sm flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        In Progress
                      </h3>
                      <Badge className="bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200">
                        {filteredTasks.filter(t => t.status === 'in_progress').length}
                      </Badge>
                    </div>
                    <div className="p-2 space-y-3 min-h-[300px]">
                      {filteredTasks
                        .filter(t => t.status === 'in_progress')
                        .map(task => (
                          <Card
                            key={task.id}
                            className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => {
                              setSelectedTask(task);
                              setShowTaskDetails(true);
                            }}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-medium text-sm line-clamp-2">{task.title}</h4>
                              {getPriorityBadge(task.priority)}
                            </div>
                            <div className="mb-2">
                              <div className="flex justify-between items-center text-xs mb-1">
                                <span className="text-gray-500 dark:text-gray-400">Progress</span>
                                <span>{task.completionPercentage}%</span>
                              </div>
                              <Progress value={task.completionPercentage} className="h-1.5" />
                            </div>
                            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <span>{formatDate(task.deadline)}</span>
                              </div>
                              <div
                                className={
                                  new Date(task.deadline) < new Date()
                                    ? 'text-red-500 dark:text-red-400'
                                    : ''
                                }
                              >
                                {getDaysRemaining(task.deadline)}
                              </div>
                            </div>
                            {task.documents.length > 0 && (
                              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <FileText className="h-3 w-3" />
                                <span className="truncate">{task.documents[0].title}</span>
                              </div>
                            )}
                          </Card>
                        ))}

                      {filteredTasks.filter(t => t.status === 'in_progress').length === 0 && (
                        <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
                          No tasks to show
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-green-100 dark:bg-green-900 p-3 rounded-t-md flex items-center justify-between">
                      <h3 className="font-medium text-sm flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        Completed
                      </h3>
                      <Badge className="bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200">
                        {filteredTasks.filter(t => t.status === 'completed').length}
                      </Badge>
                    </div>
                    <div className="p-2 space-y-3 min-h-[300px]">
                      {filteredTasks
                        .filter(t => t.status === 'completed')
                        .map(task => (
                          <Card
                            key={task.id}
                            className="p-3 cursor-pointer hover:shadow-md transition-shadow bg-gray-50 dark:bg-gray-900"
                            onClick={() => {
                              setSelectedTask(task);
                              setShowTaskDetails(true);
                            }}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-medium text-sm line-clamp-2">{task.title}</h4>
                              {getPriorityBadge(task.priority)}
                            </div>
                            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
                              <div className="flex items-center gap-1">
                                <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
                                <span>Completed</span>
                              </div>
                              <div>{task.completedDate && formatDate(task.completedDate)}</div>
                            </div>
                            {task.documents.length > 0 && (
                              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <FileText className="h-3 w-3" />
                                <span className="truncate">{task.documents[0].title}</span>
                              </div>
                            )}
                          </Card>
                        ))}

                      {filteredTasks.filter(t => t.status === 'completed').length === 0 && (
                        <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
                          No tasks to show
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="teamTasks" className="p-6 space-y-6">
            <Alert className="bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-100 border-blue-200 dark:border-blue-900">
              <Users className="h-4 w-4" />
              <AlertTitle>Team Task Dashboard</AlertTitle>
              <AlertDescription>
                View and manage tasks across your entire team. Tasks are intelligent prioritized
                based on deadlines, regulatory requirements, and dependencies.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ListTodo className="h-4 w-4 text-gray-600" />
                    Total Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="text-3xl font-bold">{tasks.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    Due This Week
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="text-3xl font-bold">5</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    Overdue Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="text-3xl font-bold">2</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Completed This Week
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="text-3xl font-bold">8</div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-medium">Team Workload</h3>
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Team Member</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Active Tasks</TableHead>
                      <TableHead>Completed Tasks</TableHead>
                      <TableHead>Workload</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map(member => {
                      // Count tasks assigned to this member
                      const activeTasks = tasks.filter(
                        t => t.assignee === member.name && t.status !== 'completed'
                      ).length;

                      const completedTasks = tasks.filter(
                        t => t.assignee === member.name && t.status === 'completed'
                      ).length;

                      // Calculate workload (0-100)
                      const workloadPercentage = Math.min(100, activeTasks * 20);

                      return (
                        <TableRow key={member.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                <span>{member.avatar}</span>
                              </div>
                              <div>{member.name}</div>
                            </div>
                          </TableCell>
                          <TableCell>{member.role}</TableCell>
                          <TableCell>{activeTasks}</TableCell>
                          <TableCell>{completedTasks}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={workloadPercentage}
                                className={`h-2 w-[100px] ${
                                  workloadPercentage > 80
                                    ? 'bg-red-600'
                                    : workloadPercentage > 60
                                      ? 'bg-amber-600'
                                      : 'bg-green-600'
                                }`}
                              />
                              <span className="text-xs">{workloadPercentage}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setNewTask({
                                  ...newTask,
                                  assignee: member.id,
                                });
                                setShowNewTask(true);
                              }}
                            >
                              <PlusCircle className="h-4 w-4 mr-1" />
                              Assign Task
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">High Priority Tasks</h3>
                <Select defaultValue="all" className="w-[200px]">
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by regulatory impact" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tasks</SelectItem>
                    <SelectItem value="regulatory">Regulatory Tasks Only</SelectItem>
                    <SelectItem value="nonregulatory">Non-Regulatory Tasks</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Assignee</TableHead>
                      <TableHead>Deadline</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks
                      .filter(t => t.priority === 'urgent' || t.priority === 'high')
                      .sort((a, b) => {
                        // Sort by priority first, then by deadline
                        const priorityRank = { urgent: 1, high: 0 };
                        if (priorityRank[a.priority] !== priorityRank[b.priority]) {
                          return priorityRank[b.priority] - priorityRank[a.priority];
                        }
                        return new Date(a.deadline) - new Date(b.deadline);
                      })
                      .slice(0, 5)
                      .map(task => (
                        <TableRow key={task.id}>
                          <TableCell>
                            <div className="flex items-start gap-2">
                              {task.regulatoryRequirement && (
                                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                              )}
                              <div>
                                <div className="font-medium">{task.title}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {task.workflowName || 'No workflow'}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{task.assignee}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <div>{formatDate(task.deadline)}</div>
                              <div
                                className={`text-xs ${
                                  new Date(task.deadline) < new Date() &&
                                  task.status !== 'completed'
                                    ? 'text-red-500 dark:text-red-400'
                                    : 'text-gray-500 dark:text-gray-400'
                                }`}
                              >
                                {getDaysRemaining(task.deadline)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(task.status)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedTask(task);
                                setShowTaskDetails(true);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View Task
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="documentTasks" className="p-6 space-y-6">
            <Alert className="bg-indigo-50 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-100 border-indigo-200 dark:border-indigo-900">
              <FileText className="h-4 w-4" />
              <AlertTitle>Document-Centric Task View</AlertTitle>
              <AlertDescription>
                This view organizes tasks by associated documents, making it easier to track all
                activities related to specific regulatory documents.
              </AlertDescription>
            </Alert>

            <div className="space-y-6">
              {/* Group tasks by document type */}
              {documentTypes.slice(1).map(documentType => {
                const documentTasks = tasks.filter(task =>
                  task.documents.some(doc => doc.type === documentType)
                );

                if (documentTasks.length === 0) return null;

                return (
                  <Card key={documentType} className="overflow-hidden">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                          <span>{documentType}</span>
                        </div>
                        <Badge variant="outline">
                          {documentTasks.length} Task{documentTasks.length !== 1 ? 's' : ''}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        Tasks associated with {documentType.toLowerCase()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Task</TableHead>
                            <TableHead>Document</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Assignee</TableHead>
                            <TableHead>Deadline</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {documentTasks.map(task => (
                            <TableRow key={task.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {getPriorityBadge(task.priority)}
                                  <span>{task.title}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {task.documents
                                  .filter(doc => doc.type === documentType)
                                  .map(doc => (
                                    <div key={doc.id} className="text-sm">
                                      {doc.title}{' '}
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        v{doc.version}
                                      </span>
                                    </div>
                                  ))}
                              </TableCell>
                              <TableCell>{getStatusBadge(task.status)}</TableCell>
                              <TableCell>{task.assignee}</TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <div>{formatDate(task.deadline)}</div>
                                  <div
                                    className={`text-xs ${
                                      new Date(task.deadline) < new Date() &&
                                      task.status !== 'completed'
                                        ? 'text-red-500 dark:text-red-400'
                                        : 'text-gray-500 dark:text-gray-400'
                                    }`}
                                  >
                                    {getDaysRemaining(task.deadline)}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedTask(task);
                                    setShowTaskDetails(true);
                                  }}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  View
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Document Activity Timeline</CardTitle>
                <CardDescription>
                  A chronological view of all document-related tasks
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {tasks
                    .filter(task => task.documents.length > 0)
                    .sort((a, b) => new Date(b.assignedDate) - new Date(a.assignedDate))
                    .slice(0, 5)
                    .map(task => (
                      <div key={task.id} className="flex gap-4">
                        <div className="mt-1">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                            {task.status === 'completed' ? (
                              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                            ) : task.status === 'in_progress' ? (
                              <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <ListTodo className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                            )}
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{task.title}</h4>
                            {getPriorityBadge(task.priority)}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {task.description.substring(0, 120)}...
                          </p>
                          <div className="mt-2 flex items-center gap-6 text-sm">
                            <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                              <Calendar className="h-4 w-4" />
                              <span>{formatDate(task.assignedDate)}</span>
                            </div>
                            <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                              <User className="h-4 w-4" />
                              <span>{task.assignee}</span>
                            </div>
                            <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                              <FileText className="h-4 w-4" />
                              <span>{task.documents[0].title}</span>
                            </div>
                          </div>
                          <div className="mt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedTask(task);
                                setShowTaskDetails(true);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View Details
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="p-6 space-y-6">
            <Alert className="bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-100 border-blue-200 dark:border-blue-900">
              <Brain className="h-4 w-4" />
              <AlertTitle>AI-Driven Task Analytics</AlertTitle>
              <AlertDescription>
                Leverage AI to gain insights into task patterns, productivity, and regulatory
                compliance metrics. Predictive analytics help optimize workload and identify
                potential bottlenecks.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Task Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-center">
                    <PieChart className="h-48 w-48 text-gray-300 dark:text-gray-700" />
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span className="text-sm">In Progress</span>
                      </div>
                      <span className="text-sm font-medium">
                        {tasks.filter(t => t.status === 'in_progress').length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <span className="text-sm">Completed</span>
                      </div>
                      <span className="text-sm font-medium">
                        {tasks.filter(t => t.status === 'completed').length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                        <span className="text-sm">Not Started</span>
                      </div>
                      <span className="text-sm font-medium">
                        {tasks.filter(t => t.status === 'not_started').length}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Regulatory Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Regulatory Tasks Completion</span>
                        <span>75%</span>
                      </div>
                      <Progress value={75} className="h-2" />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Compliance Score</span>
                        <span>92%</span>
                      </div>
                      <Progress value={92} className="h-2" />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Regulatory Timeliness</span>
                        <span>88%</span>
                      </div>
                      <Progress value={88} className="h-2" />
                    </div>

                    <div className="mt-4">
                      <div className="text-sm font-medium mb-2">Key Compliance Standards</div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">ICH Q6A</Badge>
                        <Badge variant="outline">21 CFR Part 11</Badge>
                        <Badge variant="outline">ICH Q9</Badge>
                        <Badge variant="outline">ICH Q10</Badge>
                        <Badge variant="outline">ICH Q1A(R2)</Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>AI Insights</span>
                    <Sparkles className="h-5 w-5 text-amber-500" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Alert className="bg-amber-50 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900">
                      <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <AlertTitle className="text-amber-800 dark:text-amber-300">
                        Resource Allocation
                      </AlertTitle>
                      <AlertDescription className="text-amber-700 dark:text-amber-400 text-xs">
                        Consider reassigning 2 documentation tasks from Emily Davis to David
                        Thompson to balance workload.
                      </AlertDescription>
                    </Alert>

                    <Alert className="bg-red-50 border-red-100 dark:bg-red-950/30 dark:border-red-900">
                      <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      <AlertTitle className="text-red-800 dark:text-red-300">
                        Risk Detected
                      </AlertTitle>
                      <AlertDescription className="text-red-700 dark:text-red-400 text-xs">
                        Stability testing data review task is approaching deadline with only 0%
                        completion. Immediate attention required.
                      </AlertDescription>
                    </Alert>

                    <Alert className="bg-green-50 border-green-100 dark:bg-green-950/30 dark:border-green-900">
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <AlertTitle className="text-green-800 dark:text-green-300">
                        Efficiency Opportunity
                      </AlertTitle>
                      <AlertDescription className="text-green-700 dark:text-green-400 text-xs">
                        Method validation tasks are consistently completed 15% faster than
                        estimated. Consider adjusting time estimates.
                      </AlertDescription>
                    </Alert>

                    <div className="pt-2">
                      <Button variant="outline" className="w-full">
                        <Sparkles className="h-4 w-4 mr-2" />
                        View All AI Insights
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Productivity Trends</CardTitle>
                <CardDescription>Task completion metrics over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] flex items-center justify-center">
                  <BarChart className="h-64 w-full text-gray-300 dark:text-gray-700" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Task Time Estimates vs. Actual</CardTitle>
                <CardDescription>Compare estimated hours to actual logged time</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task Type</TableHead>
                      <TableHead>Average Estimated</TableHead>
                      <TableHead>Average Actual</TableHead>
                      <TableHead>Variance</TableHead>
                      <TableHead>Accuracy</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Document Review</TableCell>
                      <TableCell>8.5 hours</TableCell>
                      <TableCell>7.2 hours</TableCell>
                      <TableCell className="text-green-600 dark:text-green-400">-15%</TableCell>
                      <TableCell>85%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Protocol Drafting</TableCell>
                      <TableCell>10.0 hours</TableCell>
                      <TableCell>12.3 hours</TableCell>
                      <TableCell className="text-red-600 dark:text-red-400">+23%</TableCell>
                      <TableCell>77%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Risk Assessment</TableCell>
                      <TableCell>14.0 hours</TableCell>
                      <TableCell>15.2 hours</TableCell>
                      <TableCell className="text-amber-600 dark:text-amber-400">+9%</TableCell>
                      <TableCell>91%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Method Validation</TableCell>
                      <TableCell>6.0 hours</TableCell>
                      <TableCell>5.1 hours</TableCell>
                      <TableCell className="text-green-600 dark:text-green-400">-15%</TableCell>
                      <TableCell>85%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Stability Testing</TableCell>
                      <TableCell>9.0 hours</TableCell>
                      <TableCell>8.8 hours</TableCell>
                      <TableCell className="text-green-600 dark:text-green-400">-2%</TableCell>
                      <TableCell>98%</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Task Details Dialog */}
      <Dialog open={showTaskDetails} onOpenChange={setShowTaskDetails}>
        <DialogContent className="max-w-4xl">
          {selectedTask && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    {selectedTask.regulatoryRequirement && (
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                        Regulatory
                      </Badge>
                    )}
                    <span>{selectedTask.title}</span>
                  </div>
                  {getPriorityBadge(selectedTask.priority)}
                </DialogTitle>
                <DialogDescription>
                  {selectedTask.workflowName ? (
                    <div className="flex items-center gap-1">
                      <Link className="h-3.5 w-3.5" />
                      <span>Part of workflow: {selectedTask.workflowName}</span>
                    </div>
                  ) : (
                    'Standalone task'
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Assignee</div>
                    <div className="font-medium">{selectedTask.assignee}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Status</div>
                    <div>{getStatusBadge(selectedTask.status)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Deadline</div>
                    <div className="font-medium">
                      {formatDate(selectedTask.deadline)}
                      <span
                        className={`text-xs ml-2 ${
                          new Date(selectedTask.deadline) < new Date() &&
                          selectedTask.status !== 'completed'
                            ? 'text-red-500 dark:text-red-400'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {getDaysRemaining(selectedTask.deadline)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Description</div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-md text-sm">
                    {selectedTask.description}
                  </div>
                </div>

                {selectedTask.status !== 'completed' && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Progress</div>
                    <div className="flex items-center gap-3">
                      <Progress
                        value={selectedTask.completionPercentage}
                        className="h-2 flex-grow"
                      />
                      <span className="text-sm font-medium">
                        {selectedTask.completionPercentage}%
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="text-sm font-medium">Associated Documents</div>
                  {selectedTask.documents.length > 0 ? (
                    <div className="space-y-2">
                      {selectedTask.documents.map(doc => (
                        <div
                          key={doc.id}
                          className="p-2 border rounded-md flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-900"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                            <div>
                              <div className="font-medium">{doc.title}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {doc.type} • Version {doc.version}
                              </div>
                            </div>
                          </div>
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                      No documents associated with this task
                    </div>
                  )}
                </div>

                <Tabs defaultValue="comments" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="comments">Comments</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                    <TabsTrigger value="ai">AI Insights</TabsTrigger>
                  </TabsList>

                  <TabsContent value="comments" className="space-y-4 pt-4">
                    <div className="space-y-4">
                      {selectedTask.comments && selectedTask.comments.length > 0 ? (
                        selectedTask.comments.map(comment => (
                          <div key={comment.id} className="p-3 border rounded-md">
                            <div className="flex justify-between items-start">
                              <div className="font-medium">{comment.user}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {new Date(comment.timestamp).toLocaleString()}
                              </div>
                            </div>
                            <div className="mt-2 text-sm">{comment.text}</div>
                            {comment.attachments && comment.attachments.length > 0 && (
                              <div className="mt-2 flex items-center gap-2">
                                <Paperclip className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {comment.attachments.length} attachment(s)
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="text-center text-gray-500 dark:text-gray-400 py-6">
                          No comments yet
                        </div>
                      )}
                    </div>

                    {selectedTask.status !== 'completed' && (
                      <div className="space-y-2">
                        <Label htmlFor="new-comment">Add Comment</Label>
                        <Textarea
                          id="new-comment"
                          placeholder="Type your comment here..."
                          rows={3}
                          value={comment}
                          onChange={e => setComment(e.target.value)}
                        />
                        <div className="flex justify-end">
                          <Button onClick={handleAddComment} disabled={!comment.trim() || loading}>
                            {loading ? (
                              <>
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                Submitting...
                              </>
                            ) : (
                              <>
                                <MessageSquare className="mr-2 h-4 w-4" />
                                Add Comment
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="history" className="pt-4">
                    <ScrollArea className="h-[300px] rounded-md border p-4">
                      <div className="space-y-4">
                        {selectedTask.history &&
                          selectedTask.history.map((event, index) => (
                            <div
                              key={index}
                              className="flex gap-3 pb-4 border-b last:border-b-0 last:pb-0"
                            >
                              <div className="mt-0.5">
                                {event.action === 'Task Created' && (
                                  <PlusCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                )}
                                {event.action === 'Task Assigned' && (
                                  <User className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                )}
                                {event.action === 'Task Updated' && (
                                  <Pencil className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                )}
                                {event.action === 'Task Completed' && (
                                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                                )}
                                {event.action === 'Comment Added' && (
                                  <MessageSquare className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                )}
                              </div>

                              <div className="flex-1">
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                                  <div className="font-medium text-sm">{event.action}</div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 sm:text-right">
                                    {new Date(event.timestamp).toLocaleString()}
                                  </div>
                                </div>

                                {event.details && (
                                  <div className="text-sm mt-1 text-gray-600 dark:text-gray-400">
                                    {event.details}
                                  </div>
                                )}

                                <div className="flex items-center gap-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
                                  <User className="h-3.5 w-3.5" />
                                  <span>{event.user}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="ai" className="pt-4">
                    {selectedTask.aiRecommendations ? (
                      <div className="space-y-4">
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                              <Brain className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                              AI Task Analysis
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div>
                              <div className="text-sm font-medium mb-1">Priority Assessment</div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">AI suggested priority:</span>
                                  {getPriorityBadge(
                                    selectedTask.aiRecommendations.prioritySuggestion
                                  )}
                                </div>
                                {getAIConfidenceBadge(85)}
                              </div>
                            </div>

                            <div>
                              <div className="text-sm font-medium mb-1">Time Estimation</div>
                              <div className="flex items-center justify-between">
                                <div className="text-sm">
                                  <span>Estimated time required: </span>
                                  <span className="font-medium">
                                    {selectedTask.aiRecommendations.estimatedTimeRequired} hours
                                  </span>
                                  {selectedTask.status === 'completed' &&
                                    selectedTask.hoursLogged && (
                                      <span className="text-xs ml-2 text-gray-500 dark:text-gray-400">
                                        (Actual: {selectedTask.hoursLogged} hours)
                                      </span>
                                    )}
                                </div>
                                {getAIConfidenceBadge(90)}
                              </div>
                            </div>

                            <div>
                              <div className="text-sm font-medium mb-1">Potential Issues</div>
                              <ul className="list-disc pl-5 text-sm space-y-1">
                                {selectedTask.aiRecommendations.potentialIssues.map(
                                  (issue, index) => (
                                    <li key={index} className="text-gray-700 dark:text-gray-300">
                                      {issue}
                                    </li>
                                  )
                                )}
                              </ul>
                            </div>

                            {selectedTask.aiRecommendations.similarTasks &&
                              selectedTask.aiRecommendations.similarTasks.length > 0 && (
                                <div>
                                  <div className="text-sm font-medium mb-1">Similar Past Tasks</div>
                                  <div className="text-sm">
                                    AI has identified{' '}
                                    {selectedTask.aiRecommendations.similarTasks.length} similar
                                    tasks that might provide useful reference.
                                  </div>
                                  <Button variant="outline" size="sm" className="mt-2">
                                    <Eye className="h-3.5 w-3.5 mr-1" />
                                    View Similar Tasks
                                  </Button>
                                </div>
                              )}
                          </CardContent>
                        </Card>

                        <Alert className="bg-indigo-50 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-100 border-indigo-200 dark:border-indigo-900">
                          <Bot className="h-4 w-4" />
                          <AlertTitle>AI Assistant Available</AlertTitle>
                          <AlertDescription className="text-sm">
                            Need help with this task? The AI assistant can answer questions about
                            regulatory requirements, suggest document templates, or help draft
                            content based on similar past documents.
                          </AlertDescription>
                        </Alert>
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 dark:text-gray-400 py-6">
                        No AI insights available for this task
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>

              <DialogFooter>
                <div className="flex flex-col-reverse sm:flex-row sm:justify-between sm:space-x-2 w-full">
                  <Button variant="outline" onClick={() => setShowTaskDetails(false)}>
                    Close
                  </Button>

                  <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2 mb-2 sm:mb-0">
                    {selectedTask.status !== 'completed' && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowTaskDetails(false);
                            setShowEditTask(true);
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit Task
                        </Button>

                        <Button
                          onClick={() => handleCompleteTask(selectedTask.id)}
                          disabled={loading}
                        >
                          {loading ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <CheckSquare className="h-4 w-4 mr-2" />
                              Mark Complete
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* New Task Dialog */}
      <Dialog open={showNewTask} onOpenChange={setShowNewTask}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
            <DialogDescription>
              Create a new task with regulatory compliance attributes.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="task-title">Task Title</Label>
                <Input
                  id="task-title"
                  placeholder="Enter task title"
                  value={newTask.title}
                  onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-description">Description</Label>
                <Textarea
                  id="task-description"
                  placeholder="Enter task description"
                  rows={3}
                  value={newTask.description}
                  onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="task-priority">Priority</Label>
                  <Select
                    value={newTask.priority}
                    onValueChange={value => setNewTask({ ...newTask, priority: value })}
                  >
                    <SelectTrigger id="task-priority">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="task-deadline">Deadline</Label>
                  <Input
                    id="task-deadline"
                    type="date"
                    value={newTask.deadline}
                    onChange={e => setNewTask({ ...newTask, deadline: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-assignee">Assignee</Label>
                <Select
                  value={newTask.assignee}
                  onValueChange={value => setNewTask({ ...newTask, assignee: value })}
                >
                  <SelectTrigger id="task-assignee">
                    <SelectValue placeholder="Select assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers.map(member => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.avatar} {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-tags">Tags</Label>
                <Input
                  id="task-tags"
                  placeholder="Enter tags separated by commas"
                  value={newTask.tags.join(', ')}
                  onChange={e =>
                    setNewTask({
                      ...newTask,
                      tags: e.target.value
                        .split(',')
                        .map(tag => tag.trim())
                        .filter(tag => tag),
                    })
                  }
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Example: Validation, API, Documentation
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="regulatory-requirement"
                  checked={newTask.regulatoryRequirement}
                  onCheckedChange={checked =>
                    setNewTask({ ...newTask, regulatoryRequirement: checked === true })
                  }
                />
                <Label
                  htmlFor="regulatory-requirement"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  This task is required for regulatory compliance
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTask(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateTask}
              disabled={
                !newTask.title ||
                !newTask.priority ||
                !newTask.deadline ||
                !newTask.assignee ||
                loading
              }
            >
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
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

      {/* AI Assistant Dialog */}
      <Dialog open={showAIAssistant} onOpenChange={setShowAIAssistant}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              AI Task Assistant
              <Badge variant="outline" className="bg-blue-50 text-blue-700">
                Process Stage: {processStage}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Intelligent task suggestions based on your current process stage and workflow
              requirements
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Stage-based Recommendations */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                Recommended Tasks for {processStage} Stage
              </h3>

              {aiLoading ? (
                <div className="flex items-center justify-center p-8">
                  <div className="text-center">
                    <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-gray-500">Generating intelligent task suggestions...</p>
                  </div>
                </div>
              ) : aiSuggestions.length > 0 ? (
                <div className="grid gap-4">
                  {aiSuggestions.map(suggestion => (
                    <Card key={suggestion.id} className="border-l-4 border-l-blue-500">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{suggestion.title}</h4>
                            <Badge
                              variant="outline"
                              className={`${
                                suggestion.priority === 'urgent'
                                  ? 'bg-red-50 text-red-700 border-red-200'
                                  : suggestion.priority === 'high'
                                    ? 'bg-orange-50 text-orange-700 border-orange-200'
                                    : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                              }`}
                            >
                              {suggestion.priority}
                            </Badge>
                            {suggestion.regulatoryRequirement && (
                              <Badge className="bg-amber-50 text-amber-800 border-amber-200">
                                Regulatory
                              </Badge>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => createTaskFromAISuggestion(suggestion)}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <PlusCircle className="h-4 w-4 mr-1" />
                            Create Task
                          </Button>
                        </div>

                        <p className="text-gray-700 mb-3">{suggestion.description}</p>

                        <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                          <span className="flex items-center gap-1">
                            <Timer className="h-4 w-4" />
                            {suggestion.estimatedHours}h estimated
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            Suggested: {suggestion.assignmentSuggestion}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1 mb-3">
                          {suggestion.tags.map((tag, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              <Tag className="h-3 w-3 mr-1" />
                              {tag}
                            </Badge>
                          ))}
                        </div>

                        <div className="bg-blue-50 p-3 rounded-md">
                          <div className="flex items-start gap-2">
                            <Brain className="h-4 w-4 text-blue-600 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-blue-800">AI Rationale</p>
                              <p className="text-sm text-blue-700">{suggestion.aiRationale}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center p-8 text-gray-500">
                  <Brain className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>No AI suggestions available for the current stage.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateAISuggestions()}
                    className="mt-2"
                  >
                    Generate Suggestions
                  </Button>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                Quick Actions
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Button
                  variant="outline"
                  className="h-20 flex-col gap-2"
                  onClick={() => generateAISuggestions()}
                >
                  <RefreshCw className="h-5 w-5" />
                  Refresh Suggestions
                </Button>
                <Button
                  variant="outline"
                  className="h-20 flex-col gap-2"
                  onClick={() => {
                    const urgentTasks = tasks.filter(
                      t => t.priority === 'urgent' && t.status !== 'completed'
                    );
                    if (urgentTasks.length > 0) {
                      setSelectedTask(urgentTasks[0]);
                      setShowTaskDetails(true);
                      setShowAIAssistant(false);
                    }
                  }}
                >
                  <AlertTriangle className="h-5 w-5" />
                  View Urgent Tasks
                </Button>
                <Button
                  variant="outline"
                  className="h-20 flex-col gap-2"
                  onClick={() => {
                    setShowAIAssistant(false);
                    setShowNewTask(true);
                  }}
                >
                  <PlusCircle className="h-5 w-5" />
                  Create Custom Task
                </Button>
                <Button
                  variant="outline"
                  className="h-20 flex-col gap-2"
                  onClick={() => {
                    // Auto-assign tasks based on team member expertise
                    const unassignedTasks = tasks.filter(
                      t => !t.assignee && t.status !== 'completed'
                    );
                    unassignedTasks.forEach(task => {
                      const suggestion = teamMembers.find(member => {
                        if (task.tags.includes('Method') || task.tags.includes('Analytical')) {
                          return member.role.includes('Analytical');
                        }
                        if (task.tags.includes('Regulatory')) {
                          return member.role.includes('Regulatory');
                        }
                        if (task.tags.includes('Quality')) {
                          return member.role.includes('Quality');
                        }
                        return member.role.includes('Manager');
                      });
                      if (suggestion) {
                        assignTask(task.id, suggestion.id);
                      }
                    });
                    toast({
                      title: 'Auto-Assignment Complete',
                      description: `${unassignedTasks.length} tasks automatically assigned based on expertise`,
                    });
                  }}
                >
                  <Users className="h-5 w-5" />
                  Auto-Assign Tasks
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAIAssistant(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enhanced Assignment Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Task</DialogTitle>
            <DialogDescription>
              {selectedTask && `Assign "${selectedTask.title}" to a team member`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-3">
              <Label>Select Team Member</Label>
              {teamMembers.map(member => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  onClick={() => assignTask(selectedTask?.id, member.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{member.avatar}</span>
                    <div>
                      <div className="font-medium">{member.name}</div>
                      <div className="text-sm text-gray-500">{member.role}</div>
                    </div>
                  </div>
                  <Button size="sm" variant="outline">
                    Assign
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default TaskManagementSystem;
