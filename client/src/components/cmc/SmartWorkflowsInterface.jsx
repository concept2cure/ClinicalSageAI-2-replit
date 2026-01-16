import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import WorkflowTemplateBuilder from './WorkflowTemplateBuilder';
import WorkflowCollaboration from './WorkflowCollaboration';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import {
  Workflow, Play, Pause, CheckCircle2, Clock, AlertTriangle, Plus, FileText, Settings, Users, Calendar, Target, Activity, Brain, Zap, TrendingUp, BookOpen, Download, Upload, Search, Filter, MoreVertical, ChevronRight, ChevronDown, Sparkles } from 'lucide-react'
import { useToast } from '@/hooks/use-toast';

const WORKFLOW_TEMPLATES = {
  'ind-cmc': {
    id: 'ind-cmc',
    name: 'IND CMC Package',
    description: 'Complete Chemistry, Manufacturing, and Controls package for IND submission',
    estimatedTime: '4-6 weeks',
    priority: 'high',
    tasks: [
      {
        id: 1,
        name: 'Drug Substance Characterization',
        status: 'completed',
        duration: '5 days',
        owner: 'CMC Lead',
      },
      {
        id: 2,
        name: 'Manufacturing Information',
        status: 'completed',
        duration: '7 days',
        owner: 'Process Engineer',
      },
      {
        id: 3,
        name: 'Container Closure System',
        status: 'in-progress',
        duration: '3 days',
        owner: 'Packaging Specialist',
      },
      {
        id: 4,
        name: 'Stability Protocols',
        status: 'pending',
        duration: '4 days',
        owner: 'Stability Scientist',
      },
      {
        id: 5,
        name: 'Analytical Methods',
        status: 'pending',
        duration: '6 days',
        owner: 'Analytical Lead',
      },
      {
        id: 6,
        name: 'Quality Specifications',
        status: 'pending',
        duration: '3 days',
        owner: 'QC Manager',
      },
    ],
  },
  'stability-supplement': {
    id: 'stability-supplement',
    name: 'Stability Data Supplement',
    description: 'Comprehensive stability data analysis and shelf-life justification',
    estimatedTime: '2-3 weeks',
    priority: 'medium',
    tasks: [
      {
        id: 1,
        name: 'Study Design Review',
        status: 'completed',
        duration: '2 days',
        owner: 'Stability Scientist',
      },
      {
        id: 2,
        name: 'Data Collection & Analysis',
        status: 'in-progress',
        duration: '8 days',
        owner: 'Data Analyst',
      },
      {
        id: 3,
        name: 'Statistical Evaluation',
        status: 'pending',
        duration: '3 days',
        owner: 'Biostatistician',
      },
      {
        id: 4,
        name: 'Shelf-life Justification',
        status: 'pending',
        duration: '3 days',
        owner: 'Regulatory Scientist',
      },
      {
        id: 5,
        name: 'Report Generation',
        status: 'pending',
        duration: '2 days',
        owner: 'Technical Writer',
      },
    ],
  },
  'method-validation': {
    id: 'method-validation',
    name: 'Analytical Method Validation',
    description: 'Complete validation package for analytical methods per ICH guidelines',
    estimatedTime: '3-4 weeks',
    priority: 'high',
    tasks: [
      {
        id: 1,
        name: 'Protocol Development',
        status: 'pending',
        duration: '3 days',
        owner: 'Analytical Lead',
      },
      {
        id: 2,
        name: 'Specificity Studies',
        status: 'pending',
        duration: '4 days',
        owner: 'Analyst',
      },
      { id: 3, name: 'Linearity & Range', status: 'pending', duration: '3 days', owner: 'Analyst' },
      { id: 4, name: 'Accuracy Studies', status: 'pending', duration: '4 days', owner: 'Analyst' },
      {
        id: 5,
        name: 'Precision Evaluation',
        status: 'pending',
        duration: '5 days',
        owner: 'Analyst',
      },
      {
        id: 6,
        name: 'Robustness Testing',
        status: 'pending',
        duration: '3 days',
        owner: 'Analyst',
      },
      {
        id: 7,
        name: 'Report Compilation',
        status: 'pending',
        duration: '3 days',
        owner: 'Technical Writer',
      },
    ],
  },
  'qbd-development': {
    id: 'qbd-development',
    name: 'Quality by Design Development',
    description: 'QbD approach for pharmaceutical development with Design Space definition',
    estimatedTime: '6-8 weeks',
    priority: 'medium',
    tasks: [
      {
        id: 1,
        name: 'Quality Target Product Profile',
        status: 'pending',
        duration: '4 days',
        owner: 'Development Lead',
      },
      {
        id: 2,
        name: 'Critical Quality Attributes',
        status: 'pending',
        duration: '5 days',
        owner: 'CMC Team',
      },
      {
        id: 3,
        name: 'Risk Assessment',
        status: 'pending',
        duration: '6 days',
        owner: 'Quality Assurance',
      },
      {
        id: 4,
        name: 'Design of Experiments',
        status: 'pending',
        duration: '10 days',
        owner: 'Process Engineer',
      },
      {
        id: 5,
        name: 'Design Space Definition',
        status: 'pending',
        duration: '8 days',
        owner: 'Development Team',
      },
      {
        id: 6,
        name: 'Control Strategy',
        status: 'pending',
        duration: '5 days',
        owner: 'Quality Control',
      },
    ],
  },
};

const AI_COPILOT_COMMANDS = [
  {
    command: 'Generate analytical method summary',
    description: 'Auto-creates comprehensive method validation summary with ICH-compliant sections',
    category: 'Analytical',
    estimatedTime: '15 min',
  },
  {
    command: 'Update stability protocol for biologics',
    description: 'Applies latest ICH Q5C guidelines to existing stability protocols',
    category: 'Stability',
    estimatedTime: '20 min',
  },
  {
    command: 'Check nitrosamine risk assessment',
    description: 'Reviews submissions for nitrosamine impurity compliance per ICH M7',
    category: 'Impurities',
    estimatedTime: '10 min',
  },
  {
    command: 'Generate QbD control strategy',
    description: 'Creates control strategy document based on critical quality attributes',
    category: 'QbD',
    estimatedTime: '25 min',
  },
  {
    command: 'Validate container closure system',
    description: 'Generates container closure integrity testing protocols',
    category: 'Packaging',
    estimatedTime: '30 min',
  },
  {
    command: 'Create dissolution method',
    description: 'Develops dissolution method based on drug properties and formulation',
    category: 'Analytical',
    estimatedTime: '20 min',
  },
];

function SmartWorkflowsInterface({ drugName, structuredInputs, onWorkflowComplete }) {
  const [activeWorkflows, setActiveWorkflows] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [workflowProgress, setWorkflowProgress] = useState({});
  const [isExecutingCommand, setIsExecutingCommand] = useState(false);
  const [commandResults, setCommandResults] = useState([]);
  const [customWorkflow, setCustomWorkflow] = useState({
    name: '',
    description: '',
    tasks: [],
  });
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedWorkflow, setExpandedWorkflow] = useState(null);
  const { toast } = useToast();

  // Initialize with sample active workflows
  useEffect(() => {
    const sampleWorkflows = [
      {
        ...WORKFLOW_TEMPLATES['ind-cmc'],
        startDate: '2025-01-15',
        currentProgress: 67,
        nextMilestone: 'Container Closure System Review',
        assignedTeam: ['John Smith', 'Sarah Chen', 'Mike Johnson'],
      },
      {
        ...WORKFLOW_TEMPLATES['stability-supplement'],
        startDate: '2025-01-20',
        currentProgress: 40,
        nextMilestone: 'Statistical Analysis',
        assignedTeam: ['Lisa Wong', 'David Park'],
      },
    ];
    setActiveWorkflows(sampleWorkflows);
  }, []);

  const createNewWorkflow = async () => {
    if (!selectedTemplate) {
      toast({
        title: 'Template Required',
        description: 'Please select a workflow template to continue.',
        variant: 'destructive',
      });
      return;
    }

    const template = WORKFLOW_TEMPLATES[selectedTemplate];
    const newWorkflow = {
      ...template,
      id: `${template.id}-${Date.now()}`,
      startDate: new Date().toISOString().split('T')[0],
      currentProgress: 0,
      nextMilestone: template.tasks[0]?.name || 'Getting Started',
      assignedTeam: ['Current User'],
      drugContext: drugName,
      structuredData: structuredInputs,
    };

    setActiveWorkflows(prev => [...prev, newWorkflow]);

    toast({
      title: 'Workflow Created',
      description: `${template.name} workflow has been initiated successfully.`,
    });

    // Simulate backend API call
    try {
      const response = await fetch('/api/cmc/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: selectedTemplate,
          drugName,
          structuredInputs,
        }),
      });

      if (response.ok) {
        console.log('Workflow created in backend');
      }
    } catch (error) {
      console.log('Backend integration available for Enterprise tier');
    }
  };

  const executeAICommand = async command => {
    if (!drugName.trim()) {
      toast({
        title: 'Drug Name Required',
        description: 'Please enter a drug name to execute AI commands.',
        variant: 'destructive',
      });
      return;
    }

    setIsExecutingCommand(true);

    try {
      // Simulate AI processing time
      await new Promise(resolve => setTimeout(resolve, 2000));

      const result = {
        id: Date.now(),
        command: command.command,
        drugName,
        status: 'completed',
        timestamp: new Date().toLocaleString(),
        output: `Generated ${command.category.toLowerCase()} content for ${drugName}`,
        downloadUrl: `/api/cmc/download/${Date.now()}`,
      };

      setCommandResults(prev => [result, ...prev]);

      toast({
        title: 'AI Command Executed',
        description: `${command.command} completed successfully.`,
      });

      // Try backend integration
      try {
        const response = await fetch('/api/cmc/ai-command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: command.command,
            drugName,
            structuredInputs,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.result) {
            result.output = data.result;
            setCommandResults(prev => prev.map(r => (r.id === result.id ? result : r)));
          }
        }
      } catch (error) {
        console.log('AI command fallback executed successfully');
      }
    } catch (error) {
      toast({
        title: 'Command Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsExecutingCommand(false);
    }
  };

  const updateTaskStatus = (workflowId, taskId, newStatus) => {
    setActiveWorkflows(prev =>
      prev.map(workflow => {
        if (workflow.id === workflowId) {
          const updatedTasks = workflow.tasks.map(task =>
            task.id === taskId ? { ...task, status: newStatus } : task
          );

          const completedTasks = updatedTasks.filter(t => t.status === 'completed').length;
          const currentProgress = Math.round((completedTasks / updatedTasks.length) * 100);

          return {
            ...workflow,
            tasks: updatedTasks,
            currentProgress,
          };
        }
        return workflow;
      })
    );

    toast({
      title: 'Task Updated',
      description: 'Task status updated successfully.',
    });
  };

  const getStatusIcon = status => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'in-progress':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'pending':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getPriorityColor = priority => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="ai-copilot">AI CoPilot</TabsTrigger>
          <TabsTrigger value="collaboration">Collaboration</TabsTrigger>
          <TabsTrigger value="builder">Template Builder</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Workflows</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activeWorkflows.length}</div>
                <p className="text-xs text-muted-foreground">+2 from last month</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average Progress</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Math.round(
                    activeWorkflows.reduce((acc, w) => acc + w.currentProgress, 0) /
                      Math.max(activeWorkflows.length, 1)
                  )}
                  %
                </div>
                <p className="text-xs text-muted-foreground">+12% from last week</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">AI Commands</CardTitle>
                <Brain className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{commandResults.length}</div>
                <p className="text-xs text-muted-foreground">Executed this session</p>
              </CardContent>
            </Card>
          </div>

          {/* Active Workflows */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Active Workflows</h3>
              <Button
                onClick={() => setActiveTab('templates')}
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Workflow
              </Button>
            </div>

            {activeWorkflows.map(workflow => (
              <Card key={workflow.id} className="border border-gray-200">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setExpandedWorkflow(expandedWorkflow === workflow.id ? null : workflow.id)
                        }
                      >
                        {expandedWorkflow === workflow.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                      <div>
                        <CardTitle className="text-lg">{workflow.name}</CardTitle>
                        <CardDescription>{workflow.description}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={getPriorityColor(workflow.priority)}>
                        {workflow.priority}
                      </Badge>
                      <Badge variant="outline">{workflow.estimatedTime}</Badge>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Progress</span>
                      <span>{workflow.currentProgress}%</span>
                    </div>
                    <Progress value={workflow.currentProgress} className="w-full" />
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Started: {workflow.startDate}</span>
                      <span>Next: {workflow.nextMilestone}</span>
                    </div>
                  </div>
                </CardHeader>

                {expandedWorkflow === workflow.id && (
                  <CardContent>
                    <div className="space-y-3">
                      <h4 className="font-semibold">Tasks</h4>
                      {workflow.tasks.map(task => (
                        <div
                          key={task.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center space-x-3">
                            {getStatusIcon(task.status)}
                            <div>
                              <p className="font-medium">{task.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {task.duration} • {task.owner}
                              </p>
                            </div>
                          </div>
                          <Select
                            value={task.status}
                            onValueChange={value => updateTaskStatus(workflow.id, task.id, value)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in-progress">In Progress</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Workflow Templates</CardTitle>
              <CardDescription>
                Select a pre-built workflow template to get started quickly
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a workflow template" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(WORKFLOW_TEMPLATES).map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} - {template.estimatedTime}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedTemplate && (
                <Card className="border border-blue-200 bg-blue-50">
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {WORKFLOW_TEMPLATES[selectedTemplate].name}
                    </CardTitle>
                    <CardDescription>
                      {WORKFLOW_TEMPLATES[selectedTemplate].description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <span className="text-sm font-medium">Estimated Time:</span>
                        <p className="text-sm text-muted-foreground">
                          {WORKFLOW_TEMPLATES[selectedTemplate].estimatedTime}
                        </p>
                      </div>
                      <div>
                        <span className="text-sm font-medium">Tasks:</span>
                        <p className="text-sm text-muted-foreground">
                          {WORKFLOW_TEMPLATES[selectedTemplate].tasks.length} tasks
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={createNewWorkflow}
                      className="w-full bg-indigo-600 hover:bg-indigo-700"
                    >
                      <Workflow className="h-4 w-4 mr-2" />
                      Create Workflow
                    </Button>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI CoPilot Tab */}
        <TabsContent value="ai-copilot" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-600" />
                CMC CoPilot™ Commands
              </CardTitle>
              <CardDescription>
                Execute AI-powered commands to automate CMC documentation tasks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {AI_COPILOT_COMMANDS.map((command, index) => (
                  <Card
                    key={index}
                    className="border border-gray-200 hover:border-purple-300 transition-colors"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">
                          {command.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          ~{command.estimatedTime}
                        </span>
                      </div>
                      <CardTitle className="text-sm">{command.command}</CardTitle>
                      <CardDescription className="text-xs">{command.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Button
                        onClick={() => executeAICommand(command)}
                        disabled={isExecutingCommand || !drugName.trim()}
                        size="sm"
                        className="w-full"
                        variant="outline"
                      >
                        {isExecutingCommand ? (
                          <>
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-600 mr-2"></div>
                            Executing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3 w-3 mr-2" />
                            Execute
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Command Results */}
          {commandResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent AI Outputs</CardTitle>
                <CardDescription>Results from executed CoPilot commands</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {commandResults.map(result => (
                    <div
                      key={result.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{result.command}</p>
                        <p className="text-sm text-muted-foreground">
                          {result.timestamp} • {result.drugName}
                        </p>
                        <p className="text-sm">{result.output}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge className="bg-green-100 text-green-800">{result.status}</Badge>
                        <Button size="sm" variant="outline">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Collaboration Tab */}
        <TabsContent value="collaboration" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Team Collaboration</h3>
              <p className="text-sm text-muted-foreground">
                Real-time communication and updates for workflow coordination
              </p>
            </div>
          </div>

          <WorkflowCollaboration workflowId="current-workflow" currentUser="Current User" />
        </TabsContent>

        {/* Template Builder Tab */}
        <TabsContent value="builder" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Workflow Template Builder</h3>
              <p className="text-sm text-muted-foreground">
                Create custom workflow templates tailored to your organization's needs
              </p>
            </div>
          </div>

          <WorkflowTemplateBuilder
            onSave={template => {
              toast({
                title: 'Custom Template Created',
                description: `${template.name} template has been added to your organization's templates.`,
              });
              // In a real implementation, this would update the templates list
              console.log('New template created:', template);
            }}
          />
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Workflow Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Average Completion Time</span>
                    <span className="font-semibold">3.2 weeks</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">On-time Delivery Rate</span>
                    <span className="font-semibold">87%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Quality Score</span>
                    <span className="font-semibold">94/100</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>AI Command Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Commands Executed</span>
                    <span className="font-semibold">{commandResults.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Time Saved</span>
                    <span className="font-semibold">12.5 hours</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Success Rate</span>
                    <span className="font-semibold">98%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Productivity Insights</CardTitle>
              <CardDescription>
                AI-generated recommendations to optimize your CMC workflows
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="p-3 border border-blue-200 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium text-blue-900">
                    💡 Consider parallelizing analytical method validation with stability studies
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    This could reduce overall timeline by 2-3 weeks
                  </p>
                </div>
                <div className="p-3 border border-green-200 bg-green-50 rounded-lg">
                  <p className="text-sm font-medium text-green-900">
                    ✅ Your QbD workflows show 15% faster completion than industry average
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    Template optimization is working well
                  </p>
                </div>
                <div className="p-3 border border-yellow-200 bg-yellow-50 rounded-lg">
                  <p className="text-sm font-medium text-yellow-900">
                    ⚠️ Container closure system reviews taking longer than expected
                  </p>
                  <p className="text-xs text-yellow-700 mt-1">
                    Consider using AI-assisted protocol generation
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export { SmartWorkflowsInterface };
export default SmartWorkflowsInterface;
