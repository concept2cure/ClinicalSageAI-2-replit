import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  PlusCircle,
  Users,
  FileText,
  Calendar,
  Clock,
  Filter,
  Bell,
  Folder,
  BarChart4,
  Tag,
  RefreshCw,
  Settings,
  MoreHorizontal,
  ClipboardCheck,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  Clock3,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormattedDate, FormattedRelativeTime } from 'react-intl';
import { useToast } from '@/components/ui/use-toast';

const CerProjectsDashboard = () => {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [filter, setFilter] = useState('all');

  // Mock data for prototyping
  const projectsData = [
    {
      id: 1,
      title: 'CardioFlow Device CER',
      client: {
        id: 1,
        name: 'MedTech Innovations',
        logo: 'https://ui-avatars.com/api/?name=MedTech&background=4338CA&color=fff',
      },
      deviceName: 'CardioFlow Monitoring System',
      deviceClass: 'Class III',
      status: 'in-progress',
      progress: 65,
      regulatoryFrameworks: ['EU MDR', 'FDA', 'ISO 14155'],
      dueDate: new Date('2025-06-15').getTime(),
      createdAt: new Date('2025-04-05').getTime(),
      assignedUsers: [
        {
          id: 1,
          name: 'Sarah Johnson',
          avatar: 'https://ui-avatars.com/api/?name=SJ&background=0369A1&color=fff',
        },
        {
          id: 2,
          name: 'Michael Chen',
          avatar: 'https://ui-avatars.com/api/?name=MC&background=059669&color=fff',
        },
      ],
      priority: 'high',
      recentActivities: [
        {
          id: 1,
          description: 'Technical documentation updated',
          timestamp: new Date('2025-05-05T14:30:00').getTime(),
          user: { name: 'Sarah Johnson' },
        },
        {
          id: 2,
          description: 'Clinical evaluation section completed',
          timestamp: new Date('2025-05-04T11:15:00').getTime(),
          user: { name: 'Michael Chen' },
        },
      ],
    },
    {
      id: 2,
      title: 'NeuraSense Implant CER',
      client: {
        id: 2,
        name: 'NeuroTech Solutions',
        logo: 'https://ui-avatars.com/api/?name=NeuroTech&background=7C3AED&color=fff',
      },
      deviceName: 'NeuraSense Neural Implant',
      deviceClass: 'Class III',
      status: 'review',
      progress: 85,
      regulatoryFrameworks: ['EU MDR', 'PMDA'],
      dueDate: new Date('2025-05-25').getTime(),
      createdAt: new Date('2025-03-10').getTime(),
      assignedUsers: [
        {
          id: 3,
          name: 'Emily Rodriguez',
          avatar: 'https://ui-avatars.com/api/?name=ER&background=DB2777&color=fff',
        },
        {
          id: 4,
          name: 'David Kim',
          avatar: 'https://ui-avatars.com/api/?name=DK&background=D97706&color=fff',
        },
      ],
      priority: 'medium',
      recentActivities: [
        {
          id: 3,
          description: 'Risk analysis section finalized',
          timestamp: new Date('2025-05-06T09:45:00').getTime(),
          user: { name: 'Emily Rodriguez' },
        },
        {
          id: 4,
          description: 'Regulatory review requested',
          timestamp: new Date('2025-05-05T16:20:00').getTime(),
          user: { name: 'David Kim' },
        },
      ],
    },
    {
      id: 3,
      title: 'OrthoFlex Prosthetic CER',
      client: {
        id: 3,
        name: 'OrthoFlex Medical',
        logo: 'https://ui-avatars.com/api/?name=OrthoFlex&background=DC2626&color=fff',
      },
      deviceName: 'OrthoFlex Advanced Prosthetic Knee',
      deviceClass: 'Class IIb',
      status: 'draft',
      progress: 25,
      regulatoryFrameworks: ['EU MDR', 'FDA', 'Health Canada'],
      dueDate: new Date('2025-07-20').getTime(),
      createdAt: new Date('2025-04-25').getTime(),
      assignedUsers: [
        {
          id: 5,
          name: 'James Wilson',
          avatar: 'https://ui-avatars.com/api/?name=JW&background=4F46E5&color=fff',
        },
      ],
      priority: 'low',
      recentActivities: [
        {
          id: 5,
          description: 'Project created and initialized',
          timestamp: new Date('2025-04-25T10:30:00').getTime(),
          user: { name: 'James Wilson' },
        },
        {
          id: 6,
          description: 'Initial device specifications uploaded',
          timestamp: new Date('2025-04-28T14:15:00').getTime(),
          user: { name: 'James Wilson' },
        },
      ],
    },
    {
      id: 4,
      title: 'PulseSync Monitor CER Update',
      client: {
        id: 4,
        name: 'CardioHealth Inc',
        logo: 'https://ui-avatars.com/api/?name=CardioHealth&background=065F46&color=fff',
      },
      deviceName: 'PulseSync Cardiac Monitor v2',
      deviceClass: 'Class IIa',
      status: 'completed',
      progress: 100,
      regulatoryFrameworks: ['EU MDR', 'FDA'],
      dueDate: new Date('2025-04-30').getTime(),
      createdAt: new Date('2025-02-15').getTime(),
      assignedUsers: [
        {
          id: 6,
          name: 'Lisa Chang',
          avatar: 'https://ui-avatars.com/api/?name=LC&background=9D174D&color=fff',
        },
        {
          id: 7,
          name: 'Robert Taylor',
          avatar: 'https://ui-avatars.com/api/?name=RT&background=1E40AF&color=fff',
        },
      ],
      priority: 'medium',
      recentActivities: [
        {
          id: 7,
          description: 'Final CER document approved',
          timestamp: new Date('2025-04-29T15:45:00').getTime(),
          user: { name: 'Lisa Chang' },
        },
        {
          id: 8,
          description: 'Project marked as complete',
          timestamp: new Date('2025-04-30T11:00:00').getTime(),
          user: { name: 'Robert Taylor' },
        },
      ],
    },
  ];

  // Filter projects based on status
  const filteredProjects =
    filter === 'all' ? projectsData : projectsData.filter(project => project.status === filter);

  // Function to get status badge styling
  const getStatusBadge = status => {
    const statusConfig = {
      draft: { label: 'Draft', color: 'bg-blue-100 text-blue-800' },
      'in-progress': { label: 'In Progress', color: 'bg-purple-100 text-purple-800' },
      review: { label: 'Under Review', color: 'bg-amber-100 text-amber-800' },
      completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
    };

    return statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-800' };
  };

  // Function to get priority badge styling
  const getPriorityBadge = priority => {
    const priorityConfig = {
      high: { color: 'bg-red-100 text-red-800' },
      medium: { color: 'bg-amber-100 text-amber-800' },
      low: { color: 'bg-green-100 text-green-800' },
    };

    return priorityConfig[priority] || { color: 'bg-gray-100 text-gray-800' };
  };

  // Handler for creating a new project
  const handleCreateProject = e => {
    e.preventDefault();

    // Here we would typically handle form submission to the backend
    setIsCreateDialogOpen(false);

    toast({
      title: 'Project created',
      description: 'New CER project has been created successfully.',
      variant: 'success',
    });
  };

  // Get days remaining or overdue
  const getDaysRemaining = dueDate => {
    const today = new Date().getTime();
    const diffTime = dueDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { value: diffDays, label: 'days overdue', variant: 'destructive' };
    } else if (diffDays === 0) {
      return { value: 'Today', label: '', variant: 'warning' };
    } else {
      return { value: diffDays, label: 'days remaining', variant: 'default' };
    }
  };

  // Status counts for dashboard stats
  const statusCounts = projectsData.reduce((acc, project) => {
    acc[project.status] = (acc[project.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">CER Projects</h1>
          <p className="text-gray-500 mt-1">Manage your Clinical Evaluation Report projects</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="flex items-center gap-2">
          <PlusCircle className="h-4 w-4" />
          New CER Project
        </Button>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Projects</p>
                <h3 className="text-2xl font-bold">{projectsData.length}</h3>
              </div>
              <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Folder className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-gray-500">In Progress</p>
                <h3 className="text-2xl font-bold">{statusCounts['in-progress'] || 0}</h3>
              </div>
              <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center">
                <RefreshCw className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-gray-500">Under Review</p>
                <h3 className="text-2xl font-bold">{statusCounts['review'] || 0}</h3>
              </div>
              <div className="h-12 w-12 bg-amber-100 rounded-full flex items-center justify-center">
                <ClipboardCheck className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-gray-500">Completed</p>
                <h3 className="text-2xl font-bold">{statusCounts['completed'] || 0}</h3>
              </div>
              <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" />
          <span className="text-sm text-gray-700">Filter:</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge
            variant={filter === 'all' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setFilter('all')}
          >
            All Projects
          </Badge>
          <Badge
            variant={filter === 'draft' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setFilter('draft')}
          >
            Drafts
          </Badge>
          <Badge
            variant={filter === 'in-progress' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setFilter('in-progress')}
          >
            In Progress
          </Badge>
          <Badge
            variant={filter === 'review' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setFilter('review')}
          >
            Under Review
          </Badge>
          <Badge
            variant={filter === 'completed' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setFilter('completed')}
          >
            Completed
          </Badge>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {filteredProjects.map(project => (
          <Card key={project.id} className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={project.client.logo} alt={project.client.name} />
                  <AvatarFallback>{project.client.name.substring(0, 2)}</AvatarFallback>
                </Avatar>
                <div className="overflow-hidden">
                  <p className="text-sm text-gray-500 truncate">{project.client.name}</p>
                </div>
              </div>
              <div className="flex justify-between items-start mt-2">
                <CardTitle className="text-xl truncate" title={project.title}>
                  {project.title}
                </CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Open menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>View Details</DropdownMenuItem>
                    <DropdownMenuItem>Edit Project</DropdownMenuItem>
                    <DropdownMenuItem>Open Latest CER</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-red-600">Archive Project</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <CardDescription className="mt-1">{project.deviceName}</CardDescription>
            </CardHeader>
            <CardContent className="pb-3">
              <div className="flex flex-wrap gap-2 mb-3">
                <Badge className={getStatusBadge(project.status).color} variant="secondary">
                  {getStatusBadge(project.status).label}
                </Badge>
                <Badge className={getPriorityBadge(project.priority).color} variant="secondary">
                  {project.priority.charAt(0).toUpperCase() + project.priority.slice(1)} Priority
                </Badge>
                <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                  {project.deviceClass}
                </Badge>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Progress</span>
                    <span className="font-medium">{project.progress}%</span>
                  </div>
                  <Progress value={project.progress} className="h-2" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {project.regulatoryFrameworks.length} Standards
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      <FormattedDate
                        value={project.dueDate}
                        year="numeric"
                        month="short"
                        day="2-digit"
                      />
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-400" />
                    <div className="flex -space-x-2">
                      {project.assignedUsers.map(user => (
                        <Avatar key={user.id} className="h-6 w-6 border-2 border-white">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback>
                            {user.name
                              .split(' ')
                              .map(n => n[0])
                              .join('')}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {getDaysRemaining(project.dueDate).value !== 'Today'
                        ? `${Math.abs(getDaysRemaining(project.dueDate).value)} ${getDaysRemaining(project.dueDate).label}`
                        : 'Due Today'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-0 border-t">
              <div className="w-full">
                <p className="text-xs text-gray-500 mb-2">Recent Activity</p>
                {project.recentActivities.slice(0, 1).map(activity => (
                  <div key={activity.id} className="flex items-start gap-2">
                    <Clock3 className="h-3 w-3 text-gray-400 mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-700 leading-tight">{activity.description}</p>
                      <p className="text-xs text-gray-500">
                        <FormattedRelativeTime
                          value={(activity.timestamp - new Date().getTime()) / 1000}
                          numeric="auto"
                          updateIntervalInSeconds={60}
                        />
                        {' by '}
                        {activity.user.name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardFooter>
            <div className="px-6 py-3 bg-gray-50 border-t">
              <Button
                size="sm"
                variant="ghost"
                className="w-full flex items-center justify-center gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              >
                Open Project
                <ArrowUpRight className="h-3 w-3" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Create Project Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Create New CER Project</DialogTitle>
            <DialogDescription>
              Fill in the details to create a new Clinical Evaluation Report project.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateProject}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="project-title" className="text-right">
                  Project Title
                </Label>
                <Input
                  id="project-title"
                  placeholder="Enter project title"
                  className="col-span-3"
                  required
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="client" className="text-right">
                  Client
                </Label>
                <Select required>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="medtech">MedTech Innovations</SelectItem>
                    <SelectItem value="neurotech">NeuroTech Solutions</SelectItem>
                    <SelectItem value="orthoflex">OrthoFlex Medical</SelectItem>
                    <SelectItem value="cardiohealth">CardioHealth Inc</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="device-name" className="text-right">
                  Device Name
                </Label>
                <Input
                  id="device-name"
                  placeholder="Enter medical device name"
                  className="col-span-3"
                  required
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="device-class" className="text-right">
                  Device Class
                </Label>
                <Select required>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select device class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="class1">Class I</SelectItem>
                    <SelectItem value="class2a">Class IIa</SelectItem>
                    <SelectItem value="class2b">Class IIb</SelectItem>
                    <SelectItem value="class3">Class III</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="regulatory-frameworks" className="text-right">
                  Regulatory Frameworks
                </Label>
                <div className="col-span-3 flex flex-wrap gap-2">
                  <Badge className="cursor-pointer bg-blue-100 text-blue-800 hover:bg-blue-200">
                    EU MDR
                  </Badge>
                  <Badge className="cursor-pointer bg-blue-100 text-blue-800 hover:bg-blue-200">
                    FDA
                  </Badge>
                  <Badge className="cursor-pointer bg-gray-100 text-gray-800 hover:bg-gray-200 border">
                    ISO 14155
                  </Badge>
                  <Badge className="cursor-pointer bg-gray-100 text-gray-800 hover:bg-gray-200 border">
                    + Add More
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="due-date" className="text-right">
                  Due Date
                </Label>
                <Input id="due-date" type="date" className="col-span-3" required />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="priority" className="text-right">
                  Priority
                </Label>
                <Select defaultValue="medium">
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="assigned-users" className="text-right">
                  Assign Team
                </Label>
                <div className="col-span-3 flex flex-wrap gap-2">
                  <Badge className="cursor-pointer bg-blue-100 text-blue-800 hover:bg-blue-200 flex items-center gap-1">
                    <Avatar className="h-4 w-4">
                      <AvatarFallback>SJ</AvatarFallback>
                    </Avatar>
                    Sarah Johnson
                  </Badge>
                  <Badge className="cursor-pointer bg-gray-100 text-gray-800 hover:bg-gray-200 border">
                    + Add Team Member
                  </Badge>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create Project</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CerProjectsDashboard;
