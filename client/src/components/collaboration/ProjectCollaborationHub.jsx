import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';
// Only import icons that are used in the initial render
// Other icons will be imported dynamically as needed
import {
 MessageSquare,
 CheckSquare,
 PlayCircle,
 FileCheck,
 ChevronDown,
 Clock,
 Info,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
 Card,
 CardContent,
 CardDescription,
 CardFooter,
 CardHeader,
 CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
 DialogTrigger,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

// Task statuses and priority constants
const TASK_STATUS = {
 TODO: 'todo',
 IN_PROGRESS: 'in-progress',
 REVIEW: 'review',
 APPROVED: 'approved',
 COMPLETED: 'completed',
};

const TASK_PRIORITY = {
 LOW: 'low',
 MEDIUM: 'medium',
 HIGH: 'high',
 CRITICAL: 'critical',
};

// Message types
const MESSAGE_TYPE = {
 COMMENT: 'comment',
 TASK_UPDATE: 'task-update',
 MILESTONE: 'milestone',
 AI_SUGGESTION: 'ai-suggestion',
 APPROVAL_REQUEST: 'approval-request',
 APPROVAL_GRANTED: 'approval-granted',
 APPROVAL_DENIED: 'approval-denied',
 SYSTEM: 'system',
};

/**
 * Project Collaboration Hub Component
 *
 * A central communication and collaboration interface for project teams with AI assistance
 * and workflow management features.
 */
const ProjectCollaborationHub = ({
 projectId,
 moduleName,
 currentUser,
 onTaskSelect,
 onMilestoneComplete,
 isExpanded,
 onCollapse,
}) => {
 // State variables
 const [messages, setMessages] = useState([]);
 const [tasks, setTasks] = useState([]);
 const [milestones, setMilestones] = useState([]);
 const [newMessage, setNewMessage] = useState('');
 const [showAiSuggestions, setShowAiSuggestions] = useState(true);
 const [approvalRequests, setApprovalRequests] = useState([]);
 const [loading, setLoading] = useState(true);
 const [activeView, setActiveView] = useState('feed');
 const [expandedTaskGroups, setExpandedTaskGroups] = useState({});
 const [showApprovalDialog, setShowApprovalDialog] = useState(false);
 const [selectedApproval, setSelectedApproval] = useState(null);
 const [approvalNote, setApprovalNote] = useState('');
 const [projectProgress, setProjectProgress] = useState(0);
 const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
 const [newTask, setNewTask] = useState({
 title: '',
 description: '',
 assignee: '',
 dueDate: '',
 priority: TASK_PRIORITY.MEDIUM,
 status: TASK_STATUS.TODO,
 });

 const messagesEndRef = useRef(null);
 const { toast } = useToast();

 // Mock data for team members
 const teamMembers = [
 { id: 1, name: 'Sarah Johnson', role: 'Regulatory Affairs', avatar: '/avatars/sarah.jpg' },
 { id: 2, name: 'David Chen', role: 'Medical Writer', avatar: '/avatars/david.jpg' },
 { id: 3, name: 'Priya Patel', role: 'Clinical Specialist', avatar: '/avatars/priya.jpg' },
 { id: 4, name: 'James Wilson', role: 'Project Manager', avatar: '/avatars/james.jpg' },
 { id: 5, name: 'Maria Rodriguez', role: 'Quality Assurance', avatar: '/avatars/maria.jpg' },
 ];

 // Effect to fetch initial data
 useEffect(() => {
 fetchProjectData();
 }, [projectId]);

 // Effect to scroll to bottom of messages
 useEffect(() => {
 scrollToBottom();
 }, [messages]);

 // Effect to update project progress
 useEffect(() => {
 if (milestones.length > 0) {
 const completedMilestones = milestones.filter(m => m.status === 'completed').length;
 setProjectProgress(Math.floor((completedMilestones / milestones.length) * 100));
 }
 }, [milestones]);

 // Fetch project data from server
 const fetchProjectData = async () => {
 setLoading(true);
 try {
 // Simulate API call delay
 await new Promise(resolve => setTimeout(resolve, 1000));

 // Mock data - in real implementation, these would be API calls
 setMessages(generateMockMessages());
 setTasks(generateMockTasks());
 setMilestones(generateMockMilestones());
 setApprovalRequests(generateMockApprovalRequests());

 // Request AI suggestions
 generateAiSuggestions();
 } catch (error) {
 console.error('Error fetching project data:', error);
 toast({
 title: 'Error Loading Project Data',
 description: 'Could not load collaboration data. Please try again.',
 variant: 'destructive',
 });
 } finally {
 setLoading(false);
 }
 };

 // Generate AI suggestions based on project status
 const generateAiSuggestions = async () => {
 try {
 // Simulate API call - in real implementation, this would call the AI service
 await new Promise(resolve => setTimeout(resolve, 1500));

 // Add AI suggestions to messages
 const aiSuggestions = [
 {
 id: `suggestion-${Date.now()}-1`,
 type: MESSAGE_TYPE.AI_SUGGESTION,
 content:
 'Based on your clinical evaluation data, consider adding a comparison with the latest similar device (MedTech XR200) that received FDA clearance last month.',
 timestamp: new Date().toISOString(),
 sender: { id: 'ai', name: 'Concept2Cure AI', avatar: '/ai-avatar.png' },
 confidence: 0.92,
 actions: [
 { id: 'action-1', label: 'Add to Tasks', action: 'create-task' },
 { id: 'action-2', label: 'Dismiss', action: 'dismiss' },
 ],
 },
 {
 id: `suggestion-${Date.now()}-2`,
 type: MESSAGE_TYPE.AI_SUGGESTION,
 content:
 'I noticed your predicate device section is missing comparative data for electrical characteristics. This could delay your 510(k) submission approval.',
 timestamp: new Date().toISOString(),
 sender: { id: 'ai', name: 'Concept2Cure AI', avatar: '/ai-avatar.png' },
 confidence: 0.87,
 actions: [
 { id: 'action-3', label: 'View Details', action: 'view-details' },
 { id: 'action-4', label: 'Dismiss', action: 'dismiss' },
 ],
 },
 ];

 setMessages(prevMessages => [...prevMessages, ...aiSuggestions]);
 } catch (error) {
 console.error('Error generating AI suggestions:', error);
 }
 };

 // Scroll to bottom of messages
 const scrollToBottom = () => {
 messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
 };

 // Send a new message
 const sendMessage = () => {
 if (!newMessage.trim()) return;

 const message = {
 id: `msg-${Date.now()}`,
 type: MESSAGE_TYPE.COMMENT,
 content: newMessage,
 timestamp: new Date().toISOString(),
 sender: currentUser,
 };

 setMessages(prevMessages => [...prevMessages, message]);
 setNewMessage('');

 // Trigger AI response after a short delay
 setTimeout(() => generateAiSuggestions(), 2000);
 };

 // Handle task selection
 const handleTaskSelect = task => {
 if (onTaskSelect) {
 onTaskSelect(task);
 }
 };

 // Handle milestone completion
 const handleMilestoneComplete = milestone => {
 setMilestones(prevMilestones =>
 prevMilestones.map(m => (m.id === milestone.id ? { ...m, status: 'completed' } : m))
 );

 // Add milestone completion message
 const message = {
 id: `milestone-${Date.now()}`,
 type: MESSAGE_TYPE.MILESTONE,
 content: `Milestone "${milestone.title}" has been completed!`,
 milestone: milestone,
 timestamp: new Date().toISOString(),
 sender: currentUser,
 };

 setMessages(prevMessages => [...prevMessages, message]);

 if (onMilestoneComplete) {
 onMilestoneComplete(milestone);
 }
 };

 // Handle approval request
 const handleApprovalRequest = item => {
 setSelectedApproval(item);
 setShowApprovalDialog(true);
 };

 // Process approval decision
 const processApproval = approved => {
 if (!selectedApproval) return;

 // Update approval requests
 setApprovalRequests(prevRequests =>
 prevRequests.map(req =>
 req.id === selectedApproval.id
 ? {
 ...req,
 status: approved ? 'approved' : 'rejected',
 processedAt: new Date().toISOString(),
 }
 : req
 )
 );

 // Add approval message
 const message = {
 id: `approval-${Date.now()}`,
 type: approved ? MESSAGE_TYPE.APPROVAL_GRANTED : MESSAGE_TYPE.APPROVAL_DENIED,
 content: `${currentUser.name} has ${approved ? 'approved' : 'rejected'} the request: "${selectedApproval.title}"${approvalNote ? ` - Note: ${approvalNote}` : ''}`,
 item: selectedApproval,
 timestamp: new Date().toISOString(),
 sender: currentUser,
 };

 setMessages(prevMessages => [...prevMessages, message]);

 // Close dialog and reset state
 setShowApprovalDialog(false);
 setSelectedApproval(null);
 setApprovalNote('');

 // Show success toast
 toast({
 title: approved ? 'Approval Granted' : 'Request Rejected',
 description: `You have ${approved ? 'approved' : 'rejected'} the request.`,
 variant: approved ? 'default' : 'secondary',
 });
 };

 // Handle create task
 const handleCreateTask = () => {
 if (!newTask.title.trim()) return;

 const task = {
 id: `task-${Date.now()}`,
 ...newTask,
 createdAt: new Date().toISOString(),
 createdBy: currentUser,
 };

 setTasks(prevTasks => [...prevTasks, task]);

 // Add task creation message
 const message = {
 id: `task-create-${Date.now()}`,
 type: MESSAGE_TYPE.TASK_UPDATE,
 content: `${currentUser.name} created a new task: "${task.title}"`,
 task: task,
 timestamp: new Date().toISOString(),
 sender: currentUser,
 };

 setMessages(prevMessages => [...prevMessages, message]);

 // Reset form and close dialog
 setNewTask({
 title: '',
 description: '',
 assignee: '',
 dueDate: '',
 priority: TASK_PRIORITY.MEDIUM,
 status: TASK_STATUS.TODO,
 });
 setShowCreateTaskDialog(false);

 // Show success toast
 toast({
 title: 'Task Created',
 description: 'New task has been created successfully.',
 variant: 'default',
 });
 };

 // Toggle task group expansion
 const toggleTaskGroup = groupId => {
 setExpandedTaskGroups(prev => ({
 ...prev,
 [groupId]: !prev[groupId],
 }));
 };

 // Handle AI suggestion action
 const handleSuggestionAction = (suggestion, actionId) => {
 const action = suggestion.actions.find(a => a.id === actionId);

 if (!action) return;

 switch (action.action) {
 case 'create-task':
 setNewTask({
 ...newTask,
 title: `AI Suggested: ${suggestion.content.substring(0, 50)}...`,
 description: suggestion.content,
 priority: suggestion.confidence > 0.9 ? TASK_PRIORITY.HIGH : TASK_PRIORITY.MEDIUM,
 });
 setShowCreateTaskDialog(true);
 break;

 case 'view-details':
 // Navigate to relevant section or show details modal
 toast({
 title: 'View Details',
 description: 'Navigating to section details...',
 variant: 'default',
 });
 break;

 case 'dismiss':
 // Remove suggestion from messages
 setMessages(prevMessages => prevMessages.filter(msg => msg.id !== suggestion.id));
 break;

 default:
 console.warn(`Unknown action: ${action.action}`);
 }
 };

 // Render message based on type
 const renderMessage = message => {
 switch (message.type) {
 case MESSAGE_TYPE.COMMENT:
 return (
 <div
 className={`flex gap-2 ${message.sender.id === currentUser.id ? 'justify-end' : 'justify-start'}`}
 >
 <div
 className={`flex gap-2 max-w-[80%] ${message.sender.id === currentUser.id ? 'flex-row-reverse' : 'flex-row'}`}
 >
 <Avatar className="h-8 w-8">
 <AvatarImage src={message.sender.avatar} />
 <AvatarFallback>{message.sender.name.substring(0, 2)}</AvatarFallback>
 </Avatar>
 <div
 className={`p-3 rounded-lg ${message.sender.id === currentUser.id ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
 >
 <p className="text-sm font-medium">{message.sender.name}</p>
 <p className="text-sm mt-1">{message.content}</p>
 <p className="text-xs opacity-70 mt-1">
 {new Date(message.timestamp).toLocaleTimeString([], {
 hour: '2-digit',
 minute: '2-digit',
 })}
 </p>
 </div>
 </div>
 </div>
 );

 case MESSAGE_TYPE.AI_SUGGESTION:
 return (
 <Card className="bg-secondary/50 border-dashed border-primary/30 mt-2 mb-2">
 <CardHeader className="pb-2">
 <div className="flex items-center gap-2">
 <Avatar className="h-8 w-8">
 <AvatarImage src={message.sender.avatar} />
 <AvatarFallback>AI</AvatarFallback>
 </Avatar>
 <div>
 <CardTitle className="text-sm flex items-center gap-1">
 <Lightbulb className="h-4 w-4 text-yellow-500" />
 AI Suggestion
 <Badge variant="outline" className="ml-2 text-xs">
 {Math.round(message.confidence * 100)}% confidence
 </Badge>
 </CardTitle>
 <CardDescription className="text-xs">
 {new Date(message.timestamp).toLocaleString()}
 </CardDescription>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 <p className="text-sm">{message.content}</p>
 </CardContent>
 <CardFooter className="flex justify-end gap-2 pt-0">
 {message.actions.map(action => (
 <Button
 key={action.id}
 variant={action.action === 'dismiss' ? 'outline' : 'default'}
 size="sm"
 onClick={() => handleSuggestionAction(message, action.id)}
 >
 {action.label}
 </Button>
 ))}
 </CardFooter>
 </Card>
 );

 case MESSAGE_TYPE.MILESTONE:
 return (
 <div className="flex justify-center my-3">
 <Badge variant="outline" className="bg-secondary/30 flex items-center gap-2 px-3 py-1">
 <CheckCircle className="h-4 w-4 text-green-500" />
 <span>{message.content}</span>
 <span className="text-xs opacity-70">
 {new Date(message.timestamp).toLocaleString()}
 </span>
 </Badge>
 </div>
 );

 case MESSAGE_TYPE.TASK_UPDATE:
 return (
 <div className="flex justify-center my-3">
 <Badge variant="outline" className="bg-stone-700/10 flex items-center gap-2 px-3 py-1">
 <Clock className="h-4 w-4 text-stone-500" />
 <span>{message.content}</span>
 <span className="text-xs opacity-70">
 {new Date(message.timestamp).toLocaleString()}
 </span>
 </Badge>
 </div>
 );

 case MESSAGE_TYPE.APPROVAL_REQUEST:
 return (
 <Card className="bg-orange-500/10 border-orange-500/30 mt-2 mb-2">
 <CardHeader className="pb-2">
 <div className="flex items-center gap-2">
 <Avatar className="h-8 w-8">
 <AvatarImage src={message.sender.avatar} />
 <AvatarFallback>{message.sender.name.substring(0, 2)}</AvatarFallback>
 </Avatar>
 <div>
 <CardTitle className="text-sm flex items-center gap-1">
 <AlertTriangle className="h-4 w-4 text-orange-500" />
 Approval Request
 </CardTitle>
 <CardDescription className="text-xs">
 {new Date(message.timestamp).toLocaleString()}
 </CardDescription>
 </div>
 </div>
 </CardHeader>
 <CardContent>
 <p className="text-sm font-medium">{message.item.title}</p>
 <p className="text-sm mt-1">{message.content}</p>
 </CardContent>
 <CardFooter className="flex justify-end gap-2 pt-0">
 <Button
 variant="outline"
 size="sm"
 onClick={() => handleApprovalRequest(message.item)}
 >
 View Details
 </Button>
 <Button
 variant="default"
 size="sm"
 onClick={() => handleApprovalRequest(message.item)}
 >
 Review
 </Button>
 </CardFooter>
 </Card>
 );

 case MESSAGE_TYPE.APPROVAL_GRANTED:
 case MESSAGE_TYPE.APPROVAL_DENIED:
 const isApproved = message.type === MESSAGE_TYPE.APPROVAL_GRANTED;
 return (
 <div className="flex justify-center my-3">
 <Badge
 variant="outline"
 className={`${isApproved ? 'bg-green-500/10' : 'bg-red-500/10'} flex items-center gap-2 px-3 py-1`}
 >
 {isApproved ? (
 <CheckCircle className="h-4 w-4 text-green-500" />
 ) : (
 <X className="h-4 w-4 text-red-500" />
 )}
 <span>{message.content}</span>
 <span className="text-xs opacity-70">
 {new Date(message.timestamp).toLocaleString()}
 </span>
 </Badge>
 </div>
 );

 case MESSAGE_TYPE.SYSTEM:
 return (
 <div className="flex justify-center my-3">
 <Badge variant="outline" className="bg-secondary/30 flex items-center gap-2 px-3 py-1">
 <Info className="h-4 w-4" />
 <span>{message.content}</span>
 <span className="text-xs opacity-70">
 {new Date(message.timestamp).toLocaleString()}
 </span>
 </Badge>
 </div>
 );

 default:
 return (
 <div className="p-3 rounded-lg bg-secondary">
 <p className="text-sm">{message.content}</p>
 </div>
 );
 }
 };

 // Render task list
 const renderTasks = () => {
 // Group tasks by status
 const taskGroups = {
 [TASK_STATUS.TODO]: tasks.filter(task => task.status === TASK_STATUS.TODO),
 [TASK_STATUS.IN_PROGRESS]: tasks.filter(task => task.status === TASK_STATUS.IN_PROGRESS),
 [TASK_STATUS.REVIEW]: tasks.filter(task => task.status === TASK_STATUS.REVIEW),
 [TASK_STATUS.APPROVED]: tasks.filter(task => task.status === TASK_STATUS.APPROVED),
 [TASK_STATUS.COMPLETED]: tasks.filter(task => task.status === TASK_STATUS.COMPLETED),
 };

 const statusLabels = {
 [TASK_STATUS.TODO]: 'To Do',
 [TASK_STATUS.IN_PROGRESS]: 'In Progress',
 [TASK_STATUS.REVIEW]: 'Under Review',
 [TASK_STATUS.APPROVED]: 'Approved',
 [TASK_STATUS.COMPLETED]: 'Completed',
 };

 return (
 <div className="space-y-4">
 {Object.entries(taskGroups).map(([status, tasksInGroup]) => (
 <div key={status} className="rounded-lg border">
 <div
 className="p-3 flex items-center justify-between cursor-pointer"
 onClick={() => toggleTaskGroup(status)}
 >
 <div className="flex items-center gap-2">
 {status === TASK_STATUS.COMPLETED ? (
 <CheckCircle className="h-5 w-5 text-green-500" />
 ) : status === TASK_STATUS.IN_PROGRESS ? (
 <Clock className="h-5 w-5 text-stone-500" />
 ) : status === TASK_STATUS.REVIEW ? (
 <FileCheck className="h-5 w-5 text-orange-500" />
 ) : status === TASK_STATUS.APPROVED ? (
 <UserCheck className="h-5 w-5 text-purple-500" />
 ) : (
 <CheckSquare className="h-5 w-5" />
 )}
 <h3 className="font-medium">{statusLabels[status]}</h3>
 <Badge variant="secondary">{tasksInGroup.length}</Badge>
 </div>
 {expandedTaskGroups[status] ? (
 <ChevronDown className="h-5 w-5" />
 ) : (
 <ChevronRight className="h-5 w-5" />
 )}
 </div>

 {expandedTaskGroups[status] && (
 <div className="px-3 pb-3 space-y-2">
 {tasksInGroup.length === 0 ? (
 <p className="text-sm text-muted-foreground p-2 text-center">No tasks</p>
 ) : (
 tasksInGroup.map(task => (
 <Card
 key={task.id}
 className="cursor-pointer hover:border-primary transition-colors"
 onClick={() => handleTaskSelect(task)}
 >
 <CardHeader className="p-3 pb-0">
 <div className="flex items-center justify-between">
 <CardTitle className="text-sm">{task.title}</CardTitle>
 <Badge
 variant={
 task.priority === TASK_PRIORITY.CRITICAL
 ? 'destructive'
 : task.priority === TASK_PRIORITY.HIGH
 ? 'default'
 : task.priority === TASK_PRIORITY.MEDIUM
 ? 'secondary'
 : 'outline'
 }
 className="text-xs"
 >
 {task.priority}
 </Badge>
 </div>
 </CardHeader>
 <CardContent className="p-3 pt-2">
 <p className="text-sm text-muted-foreground line-clamp-2">
 {task.description}
 </p>

 <div className="flex items-center justify-between mt-2">
 <div className="flex items-center">
 <Avatar className="h-6 w-6">
 <AvatarImage
 src={
 teamMembers.find(m => m.id === parseInt(task.assignee))?.avatar
 }
 />
 <AvatarFallback>
 {teamMembers
 .find(m => m.id === parseInt(task.assignee))
 ?.name.substring(0, 2)}
 </AvatarFallback>
 </Avatar>
 </div>
 <div className="text-xs text-muted-foreground">
 {task.dueDate && (
 <div className="flex items-center gap-1">
 <Calendar className="h-3 w-3" />
 {new Date(task.dueDate).toLocaleDateString()}
 </div>
 )}
 </div>
 </div>
 </CardContent>
 </Card>
 ))
 )}
 </div>
 )}
 </div>
 ))}
 </div>
 );
 };

 // Render milestone list
 const renderMilestones = () => {
 return (
 <div className="space-y-3">
 <div className="flex justify-between items-center mb-4">
 <h3 className="font-medium">Project Progress</h3>
 <Badge variant="outline">{projectProgress}%</Badge>
 </div>

 <Progress value={projectProgress} className="h-2 mb-6" />

 {milestones.map((milestone, index) => (
 <Card
 key={milestone.id}
 className={`border-l-4 ${milestone.status === 'completed' ? 'border-l-green-500' : 'border-l-stone-500'}`}
 >
 <CardHeader className="p-3 pb-2">
 <div className="flex items-center justify-between">
 <CardTitle className="text-sm flex items-center gap-2">
 {milestone.status === 'completed' ? (
 <CheckCircle className="h-4 w-4 text-green-500" />
 ) : (
 <span className="flex h-4 w-4 items-center justify-center rounded-full bg-stone-700 text-xs text-white">
 {index + 1}
 </span>
 )}
 {milestone.title}
 </CardTitle>
 {milestone.status === 'completed' ? (
 <Badge variant="outline" className="bg-green-500/10 text-xs">
 Completed
 </Badge>
 ) : milestone.status === 'active' ? (
 <Badge variant="default" className="text-xs">
 Active
 </Badge>
 ) : (
 <Badge variant="outline" className="text-xs">
 Pending
 </Badge>
 )}
 </div>
 </CardHeader>
 <CardContent className="p-3 pt-0">
 <p className="text-sm text-muted-foreground">{milestone.description}</p>

 <div className="flex items-center justify-between mt-2">
 <div className="text-xs text-muted-foreground">
 {milestone.dueDate && (
 <div className="flex items-center gap-1">
 <Calendar className="h-3 w-3" />
 Due: {new Date(milestone.dueDate).toLocaleDateString()}
 </div>
 )}
 </div>

 {milestone.status !== 'completed' && (
 <Button
 variant="outline"
 size="sm"
 disabled={milestone.status !== 'active'}
 onClick={() => handleMilestoneComplete(milestone)}
 >
 Mark Complete
 </Button>
 )}
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 );
 };

 // Render approvals
 const renderApprovals = () => {
 return (
 <div className="space-y-3">
 <h3 className="font-medium mb-3">Pending Approvals</h3>

 {approvalRequests.filter(req => req.status === 'pending').length === 0 ? (
 <p className="text-sm text-muted-foreground p-2 text-center">No pending approvals</p>
 ) : (
 approvalRequests
 .filter(req => req.status === 'pending')
 .map(request => (
 <Card key={request.id} className="bg-orange-500/10 border-orange-500/30">
 <CardHeader className="p-3 pb-2">
 <div className="flex items-center justify-between">
 <CardTitle className="text-sm flex items-center gap-2">
 <AlertTriangle className="h-4 w-4 text-orange-500" />
 {request.title}
 </CardTitle>
 <Badge variant="outline" className="text-xs">
 {request.type}
 </Badge>
 </div>
 </CardHeader>
 <CardContent className="p-3 pt-0">
 <p className="text-sm text-muted-foreground">{request.description}</p>

 <div className="flex items-center justify-between mt-2">
 <div className="flex items-center gap-1">
 <Avatar className="h-6 w-6">
 <AvatarImage src={request.requestedBy.avatar} />
 <AvatarFallback>{request.requestedBy.name.substring(0, 2)}</AvatarFallback>
 </Avatar>
 <span className="text-xs">{request.requestedBy.name}</span>
 </div>
 <div className="text-xs text-muted-foreground">
 {new Date(request.requestedAt).toLocaleDateString()}
 </div>
 </div>
 </CardContent>
 <CardFooter className="flex justify-end gap-2 pt-0 pb-3">
 <Button
 variant="outline"
 size="sm"
 onClick={() => handleApprovalRequest(request)}
 >
 View Details
 </Button>
 <Button
 variant="default"
 size="sm"
 onClick={() => handleApprovalRequest(request)}
 >
 Review
 </Button>
 </CardFooter>
 </Card>
 ))
 )}

 <h3 className="font-medium mt-6 mb-3">Recent Decisions</h3>

 {approvalRequests.filter(req => req.status !== 'pending').length === 0 ? (
 <p className="text-sm text-muted-foreground p-2 text-center">No recent decisions</p>
 ) : (
 approvalRequests
 .filter(req => req.status !== 'pending')
 .map(request => (
 <Card
 key={request.id}
 className={
 request.status === 'approved'
 ? 'bg-green-500/10 border-green-500/30'
 : 'bg-red-500/10 border-red-500/30'
 }
 >
 <CardHeader className="p-3 pb-2">
 <div className="flex items-center justify-between">
 <CardTitle className="text-sm flex items-center gap-2">
 {request.status === 'approved' ? (
 <CheckCircle className="h-4 w-4 text-green-500" />
 ) : (
 <X className="h-4 w-4 text-red-500" />
 )}
 {request.title}
 </CardTitle>
 <Badge
 variant={request.status === 'approved' ? 'default' : 'destructive'}
 className="text-xs"
 >
 {request.status === 'approved' ? 'Approved' : 'Rejected'}
 </Badge>
 </div>
 </CardHeader>
 <CardContent className="p-3 pt-0">
 <p className="text-sm text-muted-foreground">{request.description}</p>

 <div className="flex items-center justify-between mt-2">
 <div className="flex items-center gap-1">
 <Avatar className="h-5 w-5">
 <AvatarImage src={request.requestedBy.avatar} />
 <AvatarFallback>{request.requestedBy.name.substring(0, 2)}</AvatarFallback>
 </Avatar>
 <span className="text-xs">Requested by {request.requestedBy.name}</span>
 </div>
 <div className="text-xs">
 {new Date(request.processedAt).toLocaleDateString()}
 </div>
 </div>
 </CardContent>
 </Card>
 ))
 )}
 </div>
 );
 };

 // Render team members
 const renderTeam = () => {
 return (
 <div className="space-y-3">
 <h3 className="font-medium mb-3">Team Members</h3>

 {teamMembers.map(member => (
 <Card key={member.id} className="p-3 flex items-center gap-3">
 <Avatar className="h-10 w-10">
 <AvatarImage src={member.avatar} />
 <AvatarFallback>{member.name.substring(0, 2)}</AvatarFallback>
 </Avatar>
 <div>
 <h4 className="font-medium">{member.name}</h4>
 <p className="text-sm text-muted-foreground">{member.role}</p>
 </div>
 </Card>
 ))}
 </div>
 );
 };

 // Generate mock data functions for demo purposes
 const generateMockMessages = () => {
 const baseDate = new Date();
 baseDate.setHours(baseDate.getHours() - 12);

 return [
 {
 id: 'msg-1',
 type: MESSAGE_TYPE.SYSTEM,
 content: 'Project collaboration initialized for Module: ' + moduleName,
 timestamp: new Date(baseDate.getTime() + 5 * 60000).toISOString(),
 sender: { id: 'system', name: 'System', avatar: '/system-avatar.png' },
 },
 {
 id: 'msg-2',
 type: MESSAGE_TYPE.COMMENT,
 content:
 "I've started working on the device equivalence comparison section. We need to gather more technical specifications from the product team.",
 timestamp: new Date(baseDate.getTime() + 15 * 60000).toISOString(),
 sender: teamMembers[0],
 },
 {
 id: 'msg-3',
 type: MESSAGE_TYPE.COMMENT,
 content:
 "I'll reach out to engineering for the missing specifications. Should have them by end of day.",
 timestamp: new Date(baseDate.getTime() + 20 * 60000).toISOString(),
 sender: teamMembers[2],
 },
 {
 id: 'msg-4',
 type: MESSAGE_TYPE.TASK_UPDATE,
 content:
 "James Wilson created a new task: 'Gather technical specifications from engineering'",
 timestamp: new Date(baseDate.getTime() + 25 * 60000).toISOString(),
 sender: teamMembers[3],
 task: {
 id: 'task-1',
 title: 'Gather technical specifications from engineering',
 description:
 'Contact engineering team to gather detailed technical specifications needed for the 510(k) submission.',
 assignee: '3',
 dueDate: new Date(baseDate.getTime() + 2 * 24 * 60 * 60000).toISOString(),
 priority: TASK_PRIORITY.HIGH,
 status: TASK_STATUS.IN_PROGRESS,
 },
 },
 {
 id: 'msg-5',
 type: MESSAGE_TYPE.MILESTONE,
 content: "Milestone 'Device Profile Creation' has been completed!",
 timestamp: new Date(baseDate.getTime() + 45 * 60000).toISOString(),
 sender: teamMembers[3],
 milestone: {
 id: 'milestone-1',
 title: 'Device Profile Creation',
 description: 'Create and finalize the device profile with all required specifications.',
 status: 'completed',
 dueDate: new Date(baseDate.getTime() + 1 * 24 * 60 * 60000).toISOString(),
 },
 },
 {
 id: 'msg-6',
 type: MESSAGE_TYPE.AI_SUGGESTION,
 content:
 'I noticed the device classification is set to Class II. Based on the intended use statement, you should verify this classification with the product code database using 21 CFR 880-892.',
 timestamp: new Date(baseDate.getTime() + 60 * 60000).toISOString(),
 sender: { id: 'ai', name: 'Concept2Cure AI', avatar: '/ai-avatar.png' },
 confidence: 0.89,
 actions: [
 { id: 'action-5', label: 'Verify Classification', action: 'verify-classification' },
 { id: 'action-6', label: 'Dismiss', action: 'dismiss' },
 ],
 },
 {
 id: 'msg-7',
 type: MESSAGE_TYPE.COMMENT,
 content: "Good catch! I'll double-check the classification against the FDA database.",
 timestamp: new Date(baseDate.getTime() + 75 * 60000).toISOString(),
 sender: teamMembers[0],
 },
 {
 id: 'msg-8',
 type: MESSAGE_TYPE.APPROVAL_REQUEST,
 content:
 'Requesting approval for device specifications and classification before proceeding to predicate device comparison.',
 timestamp: new Date(baseDate.getTime() + 150 * 60000).toISOString(),
 sender: teamMembers[0],
 item: {
 id: 'approval-1',
 title: 'Device Profile and Classification Approval',
 description:
 'Approval request for the finalized device specifications and classification before proceeding to the predicate device comparison phase.',
 type: 'Document Approval',
 status: 'pending',
 requestedBy: teamMembers[0],
 requestedAt: new Date(baseDate.getTime() + 150 * 60000).toISOString(),
 },
 },
 ];
 };

 const generateMockTasks = () => {
 const baseDate = new Date();

 return [
 {
 id: 'task-1',
 title: 'Gather technical specifications from engineering',
 description:
 'Contact engineering team to gather detailed technical specifications needed for the 510(k) submission.',
 assignee: '3',
 dueDate: new Date(baseDate.getTime() + 2 * 24 * 60 * 60000).toISOString(),
 priority: TASK_PRIORITY.HIGH,
 status: TASK_STATUS.IN_PROGRESS,
 createdAt: new Date(baseDate.getTime() - 1 * 24 * 60 * 60000).toISOString(),
 createdBy: teamMembers[3],
 },
 {
 id: 'task-2',
 title: 'Draft Intended Use statement',
 description:
 'Create the first draft of the Intended Use statement for the device, following the latest FDA guidelines.',
 assignee: '2',
 dueDate: new Date(baseDate.getTime() + 3 * 24 * 60 * 60000).toISOString(),
 priority: TASK_PRIORITY.MEDIUM,
 status: TASK_STATUS.TODO,
 createdAt: new Date(baseDate.getTime() - 2 * 24 * 60 * 60000).toISOString(),
 createdBy: teamMembers[3],
 },
 {
 id: 'task-3',
 title: 'Compare device specifications with predicate devices',
 description:
 'Create a comprehensive comparison table of the device specifications with identified predicate devices.',
 assignee: '1',
 dueDate: new Date(baseDate.getTime() + 5 * 24 * 60 * 60000).toISOString(),
 priority: TASK_PRIORITY.HIGH,
 status: TASK_STATUS.TODO,
 createdAt: new Date(baseDate.getTime() - 1 * 24 * 60 * 60000).toISOString(),
 createdBy: teamMembers[3],
 },
 {
 id: 'task-4',
 title: 'Verify device classification',
 description:
 'Double-check the device classification against the FDA product code database using 21 CFR 880-892.',
 assignee: '1',
 dueDate: new Date(baseDate.getTime() + 1 * 24 * 60 * 60000).toISOString(),
 priority: TASK_PRIORITY.MEDIUM,
 status: TASK_STATUS.IN_PROGRESS,
 createdAt: new Date(baseDate.getTime() - 0.5 * 24 * 60 * 60000).toISOString(),
 createdBy: teamMembers[0],
 },
 {
 id: 'task-5',
 title: 'Review predicate device search results',
 description:
 'Review the AI-generated predicate device suggestions and select the most appropriate ones for comparison.',
 assignee: '5',
 dueDate: new Date(baseDate.getTime() + 2 * 24 * 60 * 60000).toISOString(),
 priority: TASK_PRIORITY.MEDIUM,
 status: TASK_STATUS.REVIEW,
 createdAt: new Date(baseDate.getTime() - 3 * 24 * 60 * 60000).toISOString(),
 createdBy: teamMembers[3],
 },
 {
 id: 'task-6',
 title: 'Prepare initial risk assessment',
 description:
 'Draft the initial risk assessment document based on the device specifications and intended use.',
 assignee: '5',
 dueDate: new Date(baseDate.getTime() + 7 * 24 * 60 * 60000).toISOString(),
 priority: TASK_PRIORITY.HIGH,
 status: TASK_STATUS.TODO,
 createdAt: new Date(baseDate.getTime() - 2 * 24 * 60 * 60000).toISOString(),
 createdBy: teamMembers[3],
 },
 {
 id: 'task-7',
 title: 'Gather performance test data',
 description:
 'Collect all available performance test data from the R&D department for inclusion in the submission.',
 assignee: '3',
 dueDate: new Date(baseDate.getTime() + 4 * 24 * 60 * 60000).toISOString(),
 priority: TASK_PRIORITY.MEDIUM,
 status: TASK_STATUS.TODO,
 createdAt: new Date(baseDate.getTime() - 1 * 24 * 60 * 60000).toISOString(),
 createdBy: teamMembers[3],
 },
 {
 id: 'task-8',
 title: 'Complete device description section',
 description:
 'Finalize the comprehensive device description section for the 510(k) submission.',
 assignee: '2',
 dueDate: new Date(baseDate.getTime() - 1 * 24 * 60 * 60000).toISOString(),
 priority: TASK_PRIORITY.MEDIUM,
 status: TASK_STATUS.COMPLETED,
 createdAt: new Date(baseDate.getTime() - 10 * 24 * 60 * 60000).toISOString(),
 createdBy: teamMembers[3],
 completedAt: new Date(baseDate.getTime() - 2 * 24 * 60 * 60000).toISOString(),
 completedBy: teamMembers[2],
 },
 ];
 };

 const generateMockMilestones = () => {
 const baseDate = new Date();

 return [
 {
 id: 'milestone-1',
 title: 'Device Profile Creation',
 description: 'Create and finalize the device profile with all required specifications.',
 status: 'completed',
 dueDate: new Date(baseDate.getTime() - 1 * 24 * 60 * 60000).toISOString(),
 },
 {
 id: 'milestone-2',
 title: 'Predicate Device Selection',
 description: 'Identify and select appropriate predicate devices for comparison.',
 status: 'active',
 dueDate: new Date(baseDate.getTime() + 3 * 24 * 60 * 60000).toISOString(),
 },
 {
 id: 'milestone-3',
 title: 'Substantial Equivalence Comparison',
 description:
 'Complete the detailed substantial equivalence comparison with predicate devices.',
 status: 'pending',
 dueDate: new Date(baseDate.getTime() + 10 * 24 * 60 * 60000).toISOString(),
 },
 {
 id: 'milestone-4',
 title: 'Performance Testing',
 description: 'Complete all required performance testing and document results.',
 status: 'pending',
 dueDate: new Date(baseDate.getTime() + 15 * 24 * 60 * 60000).toISOString(),
 },
 {
 id: 'milestone-5',
 title: 'Final Submission Package',
 description: 'Prepare and finalize the complete 510(k) submission package.',
 status: 'pending',
 dueDate: new Date(baseDate.getTime() + 25 * 24 * 60 * 60000).toISOString(),
 },
 ];
 };

 const generateMockApprovalRequests = () => {
 const baseDate = new Date();

 return [
 {
 id: 'approval-1',
 title: 'Device Profile and Classification Approval',
 description:
 'Approval request for the finalized device specifications and classification before proceeding to the predicate device comparison phase.',
 type: 'Document Approval',
 status: 'pending',
 requestedBy: teamMembers[0],
 requestedAt: new Date(baseDate.getTime() - 0.5 * 24 * 60 * 60000).toISOString(),
 },
 {
 id: 'approval-2',
 title: 'Intended Use Statement Approval',
 description:
 'Approval request for the final intended use statement draft before inclusion in the submission.',
 type: 'Content Approval',
 status: 'approved',
 requestedBy: teamMembers[2],
 requestedAt: new Date(baseDate.getTime() - 3 * 24 * 60 * 60000).toISOString(),
 processedAt: new Date(baseDate.getTime() - 2 * 24 * 60 * 60000).toISOString(),
 },
 {
 id: 'approval-3',
 title: 'Test Protocol Approval',
 description:
 'Approval request for the performance testing protocol before beginning the testing phase.',
 type: 'Protocol Approval',
 status: 'rejected',
 requestedBy: teamMembers[2],
 requestedAt: new Date(baseDate.getTime() - 5 * 24 * 60 * 60000).toISOString(),
 processedAt: new Date(baseDate.getTime() - 4 * 24 * 60 * 60000).toISOString(),
 },
 ];
 };

 // Main component render - optimized to avoid re-rendering the header
 return (
 <div className="flex-1 flex flex-col h-full">
 {/* Navigation and content - header is now handled by LazyCollaborationHub */}

 {/* Content */}
 {isExpanded && (
 <>
 {/* Navigation */}
 <div className="px-2 py-3 border-b flex gap-1">
 <Button
 variant={activeView === 'feed' ? 'default' : 'ghost'}
 size="sm"
 className="flex-1 h-7"
 onClick={() => setActiveView('feed')}
 >
 <MessageSquare className="h-4 w-4 mr-1" />
 Feed
 </Button>
 <Button
 variant={activeView === 'tasks' ? 'default' : 'ghost'}
 size="sm"
 className="flex-1 h-7"
 onClick={() => setActiveView('tasks')}
 >
 <CheckSquare className="h-4 w-4 mr-1" />
 Tasks
 </Button>
 <Button
 variant={activeView === 'milestones' ? 'default' : 'ghost'}
 size="sm"
 className="flex-1 h-7"
 onClick={() => setActiveView('milestones')}
 >
 <PlayCircle className="h-4 w-4 mr-1" />
 Milestones
 </Button>
 <TooltipProvider>
 <Tooltip>
 <TooltipTrigger asChild>
 <Button
 variant="ghost"
 size="sm"
 className="h-7"
 onClick={() => setActiveView('approvals')}
 >
 <FileCheck className="h-4 w-4" />
 {approvalRequests.filter(req => req.status === 'pending').length > 0 && (
 <Badge
 variant="destructive"
 className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-[11px]"
 >
 {approvalRequests.filter(req => req.status === 'pending').length}
 </Badge>
 )}
 </Button>
 </TooltipTrigger>
 <TooltipContent>
 <p>Approvals</p>
 </TooltipContent>
 </Tooltip>
 </TooltipProvider>
 </div>

 {/* Main content area */}
 <div className="flex-1 overflow-hidden">
 {loading ? (
 <div className="h-full flex flex-col items-center justify-center">
 <Clock className="h-8 w-8 animate-spin text-primary/60" />
 <p className="text-sm mt-2">Loading...</p>
 </div>
 ) : (
 <>
 {activeView === 'feed' && (
 <div className="flex flex-col h-full">
 <div className="p-2 border-b flex items-center gap-2">
 <div className="flex items-center gap-1">
 <Label htmlFor="ai-suggestions" className="text-xs">
 AI Suggestions
 </Label>
 <Switch
 id="ai-suggestions"
 checked={showAiSuggestions}
 onCheckedChange={setShowAiSuggestions}
 />
 </div>
 </div>

 <ScrollArea className="flex-1">
 <div className="p-3 space-y-3">
 {messages
 .filter(
 msg => showAiSuggestions || msg.type !== MESSAGE_TYPE.AI_SUGGESTION
 )
 .map(message => (
 <div key={message.id}>{renderMessage(message)}</div>
 ))}
 <div ref={messagesEndRef} />
 </div>
 </ScrollArea>

 <div className="p-2 border-t">
 <div className="flex gap-2">
 <Textarea
 placeholder="Type a message..."
 className="min-h-[40px] resize-none"
 value={newMessage}
 onChange={e => setNewMessage(e.target.value)}
 onKeyDown={e => {
 if (e.key === 'Enter' && !e.shiftKey) {
 e.preventDefault();
 sendMessage();
 }
 }}
 />
 <Button
 size="sm"
 className="h-auto"
 onClick={sendMessage}
 disabled={!newMessage.trim()}
 >
 Send
 </Button>
 </div>
 </div>
 </div>
 )}

 {activeView === 'tasks' && (
 <div className="flex flex-col h-full">
 <div className="p-2 border-b flex items-center justify-between">
 <h3 className="font-medium text-sm">Tasks</h3>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0"
 onClick={() => setShowCreateTaskDialog(true)}
 >
 <PlusCircle className="h-4 w-4" />
 </Button>
 </div>

 <ScrollArea className="flex-1">
 <div className="p-3">{renderTasks()}</div>
 </ScrollArea>
 </div>
 )}

 {activeView === 'milestones' && (
 <ScrollArea className="h-full">
 <div className="p-3">{renderMilestones()}</div>
 </ScrollArea>
 )}

 {activeView === 'approvals' && (
 <ScrollArea className="h-full">
 <div className="p-3">{renderApprovals()}</div>
 </ScrollArea>
 )}

 {activeView === 'team' && (
 <ScrollArea className="h-full">
 <div className="p-3">{renderTeam()}</div>
 </ScrollArea>
 )}
 </>
 )}
 </div>
 </>
 )}

 {/* Create Task Dialog */}
 <Dialog open={showCreateTaskDialog} onOpenChange={setShowCreateTaskDialog}>
 <DialogContent>
 <DialogHeader>
 <DialogTitle>Create New Task</DialogTitle>
 <DialogDescription>Add a new task to the project.</DialogDescription>
 </DialogHeader>

 <div className="space-y-4 py-2">
 <div className="space-y-2">
 <Label htmlFor="task-title">Title</Label>
 <Input
 id="task-title"
 value={newTask.title}
 onChange={e => setNewTask({ ...newTask, title: e.target.value })}
 placeholder="Task title"
 />
 </div>

 <div className="space-y-2">
 <Label htmlFor="task-description">Description</Label>
 <Textarea
 id="task-description"
 value={newTask.description}
 onChange={e => setNewTask({ ...newTask, description: e.target.value })}
 placeholder="Task description"
 />
 </div>

 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-2">
 <Label htmlFor="task-assignee">Assignee</Label>
 <select
 id="task-assignee"
 className="w-full border rounded-md p-2"
 value={newTask.assignee}
 onChange={e => setNewTask({ ...newTask, assignee: e.target.value })}
 >
 <option value="">Select Assignee</option>
 {teamMembers.map(member => (
 <option key={member.id} value={member.id}>
 {member.name}
 </option>
 ))}
 </select>
 </div>

 <div className="space-y-2">
 <Label htmlFor="task-due-date">Due Date</Label>
 <Input
 id="task-due-date"
 type="date"
 value={
 newTask.dueDate ? new Date(newTask.dueDate).toISOString().split('T')[0] : ''
 }
 onChange={e =>
 setNewTask({
 ...newTask,
 dueDate: e.target.value ? new Date(e.target.value).toISOString() : '',
 })
 }
 />
 </div>
 </div>

 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-2">
 <Label htmlFor="task-priority">Priority</Label>
 <select
 id="task-priority"
 className="w-full border rounded-md p-2"
 value={newTask.priority}
 onChange={e => setNewTask({ ...newTask, priority: e.target.value })}
 >
 <option value={TASK_PRIORITY.LOW}>Low</option>
 <option value={TASK_PRIORITY.MEDIUM}>Medium</option>
 <option value={TASK_PRIORITY.HIGH}>High</option>
 <option value={TASK_PRIORITY.CRITICAL}>Critical</option>
 </select>
 </div>

 <div className="space-y-2">
 <Label htmlFor="task-status">Status</Label>
 <select
 id="task-status"
 className="w-full border rounded-md p-2"
 value={newTask.status}
 onChange={e => setNewTask({ ...newTask, status: e.target.value })}
 >
 <option value={TASK_STATUS.TODO}>To Do</option>
 <option value={TASK_STATUS.IN_PROGRESS}>In Progress</option>
 <option value={TASK_STATUS.REVIEW}>Under Review</option>
 </select>
 </div>
 </div>
 </div>

 <DialogFooter>
 <Button variant="outline" onClick={() => setShowCreateTaskDialog(false)}>
 Cancel
 </Button>
 <Button onClick={handleCreateTask} disabled={!newTask.title.trim()}>
 Create Task
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* Approval Dialog */}
 <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
 <DialogContent>
 {selectedApproval && (
 <>
 <DialogHeader>
 <DialogTitle>Review Approval Request</DialogTitle>
 <DialogDescription>
 Requested by {selectedApproval.requestedBy.name} on{' '}
 {new Date(selectedApproval.requestedAt).toLocaleDateString()}
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-4 py-2">
 <div>
 <h3 className="font-medium">{selectedApproval.title}</h3>
 <p className="text-sm text-muted-foreground mt-1">
 {selectedApproval.description}
 </p>
 </div>

 <div className="space-y-2">
 <Label htmlFor="approval-note">Note (Optional)</Label>
 <Textarea
 id="approval-note"
 value={approvalNote}
 onChange={e => setApprovalNote(e.target.value)}
 placeholder="Add a note with your decision (optional)"
 />
 </div>
 </div>

 <DialogFooter>
 <Button variant="outline" onClick={() => setShowApprovalDialog(false)}>
 Cancel
 </Button>
 <Button variant="destructive" onClick={() => processApproval(false)}>
 Reject
 </Button>
 <Button variant="default" onClick={() => processApproval(true)}>
 Approve
 </Button>
 </DialogFooter>
 </>
 )}
 </DialogContent>
 </Dialog>
 </div>
 );
};

export default ProjectCollaborationHub;
