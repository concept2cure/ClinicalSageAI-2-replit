import React, { useState, useEffect } from 'react';
import {
 Card,
 CardContent,
 CardDescription,
 CardFooter,
 CardHeader,
 CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
 Clock,
 FileText,
 CheckCircle2,
 XCircle,
 AlertCircle,
 ArrowRight,
 RefreshCw,
 UserCheck,
 ListChecks,
 History,
 MessageCircle,
 ChevronRight,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
 fetchWorkflowTemplates,
 startDocumentWorkflow,
 getDocumentWorkflowStatus,
 transitionWorkflow,
 getDocumentWorkflowHistory,
} from './WorkflowTemplateService';
import { addDocumentComment, getDocumentRegistration } from './registerModuleDocument';

// Status badges for workflow steps
const StatusBadge = ({ status }) => {
 const statusConfig = {
 pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100' },
 in_progress: { label: 'In Progress', color: 'bg-stone-100 text-stone-800 hover:bg-stone-100' },
 approved: { label: 'Approved', color: 'bg-green-100 text-green-800 hover:bg-green-100' },
 rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800 hover:bg-red-100' },
 on_hold: { label: 'On Hold', color: 'bg-orange-100 text-orange-800 hover:bg-orange-100' },
 changes_requested: {
 label: 'Changes Requested',
 color: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
 },
 };

 const config = statusConfig[status] || statusConfig.pending;

 return (
 <Badge variant="outline" className={`${config.color} border-0`}>
 {config.label}
 </Badge>
 );
};

// Module type friendly names
const MODULE_NAMES = {
 medical_device: 'Medical Device',
 cmc: 'CMC Wizard',
 ectd: 'eCTD Co-author',
 study: 'Study Architect',
 vault: 'Vault',
};

const UnifiedWorkflowPanel = ({
 documentData, // Changed from documentId to documentData
 moduleType,
 organizationId,
 userId,
 onWorkflowUpdated, // Changed from onWorkflowAction to match how it's called
 className = '',
}) => {
 // Extract document properties from documentData
 const documentId = documentData?.id;
 const documentTitle = documentData?.title;
 const [activeTab, setActiveTab] = useState('status');
 const [workflowTemplates, setWorkflowTemplates] = useState([]);
 const [selectedTemplateId, setSelectedTemplateId] = useState('');
 const [workflowStarted, setWorkflowStarted] = useState(false);
 const [workflowStatus, setWorkflowStatus] = useState(null);
 const [workflowHistory, setWorkflowHistory] = useState([]);
 const [documentDataState, setDocumentDataState] = useState(null);
 const [commentText, setCommentText] = useState('');
 const [actionComment, setActionComment] = useState('');
 const [isLoading, setIsLoading] = useState({
 templates: false,
 status: false,
 history: false,
 action: false,
 });

 // Fetch workflow templates and document data
 useEffect(() => {
 if (organizationId && moduleType) {
 loadWorkflowTemplates();
 checkDocumentWorkflow();
 loadDocumentData();
 }
 }, [organizationId, moduleType, documentId]);

 // Load workflow templates
 const loadWorkflowTemplates = async () => {
 setIsLoading(prev => ({ ...prev, templates: true }));
 try {
 const templates = await fetchWorkflowTemplates(organizationId, moduleType);
 setWorkflowTemplates(templates);

 // Default to first template if available
 if (templates.length > 0 && !selectedTemplateId) {
 const defaultTemplate = templates.find(t => t.isDefault) || templates[0];
 setSelectedTemplateId(defaultTemplate.id);
 }
 } catch (error) {
 console.error('Error loading workflow templates:', error);
 toast({
 title: 'Error loading templates',
 description: error.message || 'Failed to load workflow templates',
 variant: 'destructive',
 });
 } finally {
 setIsLoading(prev => ({ ...prev, templates: false }));
 }
 };

 // Check if document has an active workflow
 const checkDocumentWorkflow = async () => {
 if (!documentId) return;

 setIsLoading(prev => ({ ...prev, status: true }));
 try {
 const status = await getDocumentWorkflowStatus(documentId);
 setWorkflowStatus(status);
 setWorkflowStarted(!!status.workflowId);

 // Load workflow history if workflow exists
 if (status.workflowId) {
 loadWorkflowHistory();
 }
 } catch (error) {
 console.error('Error checking workflow status:', error);
 // Not showing toast here as this is expected for new documents
 } finally {
 setIsLoading(prev => ({ ...prev, status: false }));
 }
 };

 // Load document data
 const loadDocumentData = async () => {
 if (!documentId) return;

 try {
 const data = await getDocumentRegistration(documentId);
 setDocumentDataState(data);
 } catch (error) {
 console.error('Error loading document data:', error);
 // Not showing toast here as this may be called often
 }
 };

 // Load workflow history
 const loadWorkflowHistory = async () => {
 if (!documentId) return;

 setIsLoading(prev => ({ ...prev, history: true }));
 try {
 const history = await getDocumentWorkflowHistory(documentId);
 setWorkflowHistory(history);
 } catch (error) {
 console.error('Error loading workflow history:', error);
 } finally {
 setIsLoading(prev => ({ ...prev, history: false }));
 }
 };

 // Handle starting a new workflow
 const handleStartWorkflow = async () => {
 if (!selectedTemplateId) {
 toast({
 title: 'Template required',
 description: 'Please select a workflow template to continue',
 variant: 'destructive',
 });
 return;
 }

 setIsLoading(prev => ({ ...prev, action: true }));
 try {
 const result = await startDocumentWorkflow(
 documentId,
 selectedTemplateId,
 userId,
 actionComment
 );

 setWorkflowStarted(true);
 checkDocumentWorkflow(); // Refresh workflow status

 toast({
 title: 'Workflow started',
 description: 'The document workflow has been started successfully',
 });

 if (onWorkflowUpdated) {
 onWorkflowUpdated('start', result.workflowId);
 }

 setActionComment('');
 } catch (error) {
 console.error('Error starting workflow:', error);
 toast({
 title: 'Error starting workflow',
 description: error.message || 'An unexpected error occurred while starting the workflow',
 variant: 'destructive',
 });
 } finally {
 setIsLoading(prev => ({ ...prev, action: false }));
 }
 };

 // Handle workflow transitions (approve, reject, etc.)
 const handleWorkflowAction = async action => {
 if (!workflowStatus?.workflowId) {
 toast({
 title: 'No active workflow',
 description: 'There is no active workflow for this document',
 variant: 'destructive',
 });
 return;
 }

 setIsLoading(prev => ({ ...prev, action: true }));
 try {
 await transitionWorkflow(workflowStatus.workflowId, userId, action, actionComment);

 checkDocumentWorkflow(); // Refresh workflow status

 toast({
 title: 'Workflow updated',
 description: `The workflow step has been ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'updated'}`,
 });

 if (onWorkflowUpdated) {
 onWorkflowUpdated(action, workflowStatus.workflowId);
 }

 setActionComment('');
 } catch (error) {
 console.error('Error updating workflow:', error);
 toast({
 title: 'Error updating workflow',
 description: error.message || 'An unexpected error occurred while updating the workflow',
 variant: 'destructive',
 });
 } finally {
 setIsLoading(prev => ({ ...prev, action: false }));
 }
 };

 // Handle adding a comment
 const handleAddComment = async () => {
 if (!commentText.trim()) {
 toast({
 title: 'Comment text required',
 description: 'Please enter a comment',
 variant: 'destructive',
 });
 return;
 }

 try {
 await addDocumentComment(documentId, userId, commentText);

 toast({
 title: 'Comment added',
 description: 'Your comment has been added successfully',
 });

 setCommentText('');
 loadWorkflowHistory(); // Refresh to show new comment
 } catch (error) {
 console.error('Error adding comment:', error);
 toast({
 title: 'Error adding comment',
 description: error.message || 'An unexpected error occurred while adding your comment',
 variant: 'destructive',
 });
 }
 };

 return (
 <Card className={className}>
 <CardHeader>
 <div className="flex justify-between items-start">
 <div>
 <CardTitle>Document Workflow</CardTitle>
 <CardDescription>
 Manage regulatory workflow for {documentTitle || 'this document'}
 </CardDescription>
 </div>
 <Badge variant="outline" className="bg-stone-50 text-stone-800 border-0">
 {MODULE_NAMES[moduleType] || moduleType}
 </Badge>
 </div>
 </CardHeader>
 <CardContent>
 <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
 <TabsList className="grid w-full grid-cols-3">
 <TabsTrigger value="status">
 <Clock className="h-4 w-4 mr-2" />
 Status
 </TabsTrigger>
 <TabsTrigger value="history">
 <History className="h-4 w-4 mr-2" />
 History
 </TabsTrigger>
 <TabsTrigger value="comments">
 <MessageCircle className="h-4 w-4 mr-2" />
 Comments
 </TabsTrigger>
 </TabsList>

 <div className="py-4">
 {/* Status Tab */}
 <TabsContent value="status">
 {!workflowStarted ? (
 <>
 <Alert variant="info" className="bg-stone-50 mb-4">
 <AlertCircle className="h-4 w-4" />
 <AlertTitle>No Active Workflow</AlertTitle>
 <AlertDescription>
 Start a regulatory workflow to manage document approvals.
 </AlertDescription>
 </Alert>

 <div className="space-y-4">
 <div className="grid gap-2">
 <Label htmlFor="workflow-template">Workflow Template</Label>
 <Select
 value={selectedTemplateId}
 onValueChange={setSelectedTemplateId}
 disabled={isLoading.templates}
 >
 <SelectTrigger id="workflow-template">
 <SelectValue placeholder="Select template" />
 </SelectTrigger>
 <SelectContent>
 {workflowTemplates.map(template => (
 <SelectItem key={template.id} value={template.id}>
 {template.name}
 {template.isDefault && ' (Default)'}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>

 <div className="grid gap-2">
 <Label htmlFor="workflow-comment">Initial Comment (Optional)</Label>
 <Textarea
 id="workflow-comment"
 placeholder="Add a comment about this workflow"
 value={actionComment}
 onChange={e => setActionComment(e.target.value)}
 />
 </div>
 </div>
 </>
 ) : (
 <>
 {isLoading.status ? (
 <div className="flex justify-center py-6">
 <RefreshCw className="h-6 w-6 animate-spin text-primary" />
 </div>
 ) : (
 <>
 <div className="mb-4">
 <h3 className="text-sm font-medium mb-1">Current Status</h3>
 <div className="flex items-center space-x-2">
 <StatusBadge status={workflowStatus?.currentStatus || 'pending'} />
 <span className="text-sm text-muted-foreground">
 {workflowStatus?.currentStepName || 'Unknown Step'}
 </span>
 </div>
 </div>

 <div className="space-y-4">
 {/* Workflow steps visualization */}
 <div className="border rounded-md p-3">
 <h3 className="text-sm font-medium mb-2">Workflow Progress</h3>
 <div className="space-y-2">
 {workflowStatus?.steps?.map((step, index) => (
 <div key={index} className="flex items-center space-x-2">
 {step.status === 'approved' ? (
 <CheckCircle2 className="h-5 w-5 text-green-500" />
 ) : step.status === 'rejected' ? (
 <XCircle className="h-5 w-5 text-red-500" />
 ) : step.status === 'in_progress' ? (
 <Clock className="h-5 w-5 text-stone-500" />
 ) : (
 <div className="h-5 w-5 rounded-full border border-gray-300 flex items-center justify-center text-xs">
 {index + 1}
 </div>
 )}
 <div className="flex-1">
 <div className="flex justify-between">
 <span className="text-sm font-medium">{step.name}</span>
 <StatusBadge status={step.status} />
 </div>
 {step.assignee && (
 <div className="flex items-center mt-1 text-xs text-muted-foreground">
 <UserCheck className="h-3 w-3 mr-1" />
 {step.assignee}
 </div>
 )}
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Action section for current step */}
 {workflowStatus?.canTakeAction && (
 <div className="border rounded-md p-3 bg-muted/50">
 <h3 className="text-sm font-medium mb-2">Action Required</h3>
 <div className="grid gap-2 mb-3">
 <Label htmlFor="action-comment">Comment (Optional)</Label>
 <Textarea
 id="action-comment"
 placeholder="Add a comment for this action"
 value={actionComment}
 onChange={e => setActionComment(e.target.value)}
 />
 </div>
 <div className="flex space-x-2">
 <Button
 variant="default"
 size="sm"
 onClick={() => handleWorkflowAction('approve')}
 disabled={isLoading.action}
 >
 <CheckCircle2 className="h-4 w-4 mr-1" />
 Approve
 </Button>
 <Button
 variant="outline"
 size="sm"
 onClick={() => handleWorkflowAction('request_changes')}
 disabled={isLoading.action}
 >
 Request Changes
 </Button>
 <Button
 variant="destructive"
 size="sm"
 onClick={() => handleWorkflowAction('reject')}
 disabled={isLoading.action}
 >
 <XCircle className="h-4 w-4 mr-1" />
 Reject
 </Button>
 </div>
 </div>
 )}
 </div>
 </>
 )}
 </>
 )}
 </TabsContent>

 {/* History Tab */}
 <TabsContent value="history">
 {isLoading.history ? (
 <div className="flex justify-center py-6">
 <RefreshCw className="h-6 w-6 animate-spin text-primary" />
 </div>
 ) : !workflowStarted ? (
 <Alert className="mb-4">
 <AlertCircle className="h-4 w-4" />
 <AlertTitle>No Workflow History</AlertTitle>
 <AlertDescription>
 Start a workflow to begin tracking document history.
 </AlertDescription>
 </Alert>
 ) : (
 <ScrollArea className="h-[300px] pr-4">
 <div className="space-y-4">
 {workflowHistory && workflowHistory.length > 0 ? (
 workflowHistory.map((entry, index) => (
 <div key={index} className="border rounded-md p-3">
 <div className="flex justify-between items-start mb-1">
 <div className="flex items-center">
 {entry.action === 'start' ? (
 <Clock className="h-4 w-4 text-stone-500 mr-2" />
 ) : entry.action === 'approve' ? (
 <CheckCircle2 className="h-4 w-4 text-green-500 mr-2" />
 ) : entry.action === 'reject' ? (
 <XCircle className="h-4 w-4 text-red-500 mr-2" />
 ) : entry.action === 'comment' ? (
 <MessageCircle className="h-4 w-4 text-gray-500 mr-2" />
 ) : (
 <AlertCircle className="h-4 w-4 text-yellow-500 mr-2" />
 )}
 <span className="font-medium text-sm">
 {entry.action === 'start'
 ? 'Workflow Started'
 : entry.action === 'approve'
 ? `Approved: ${entry.stepName || 'Step'}`
 : entry.action === 'reject'
 ? `Rejected: ${entry.stepName || 'Step'}`
 : entry.action === 'request_changes'
 ? `Changes Requested: ${entry.stepName || 'Step'}`
 : entry.action === 'comment'
 ? 'Comment Added'
 : entry.action}
 </span>
 </div>
 <span className="text-xs text-muted-foreground">
 {new Date(entry.timestamp).toLocaleString()}
 </span>
 </div>
 <div className="text-xs text-muted-foreground mb-1">
 By: {entry.userName || entry.userId}
 </div>
 {entry.comment && (
 <div className="text-sm mt-1 bg-muted/50 p-2 rounded">
 {entry.comment}
 </div>
 )}
 </div>
 ))
 ) : (
 <div className="text-center text-muted-foreground py-6">
 No history entries available
 </div>
 )}
 </div>
 </ScrollArea>
 )}
 </TabsContent>

 {/* Comments Tab */}
 <TabsContent value="comments">
 <div className="space-y-4">
 <div className="grid gap-2">
 <Label htmlFor="comment">Add Comment</Label>
 <Textarea
 id="comment"
 placeholder="Add a comment about this document"
 value={commentText}
 onChange={e => setCommentText(e.target.value)}
 />
 </div>
 <Button
 variant="secondary"
 size="sm"
 onClick={handleAddComment}
 disabled={!commentText.trim()}
 >
 <MessageCircle className="h-4 w-4 mr-2" />
 Add Comment
 </Button>

 <Separator className="my-4" />

 <div>
 <h3 className="text-sm font-medium mb-3">Comments</h3>
 <ScrollArea className="h-[200px] pr-4">
 <div className="space-y-3">
 {workflowHistory
 .filter(h => h.action === 'comment')
 .map((comment, index) => (
 <div key={index} className="border rounded-md p-3">
 <div className="flex justify-between items-start mb-1">
 <span className="font-medium text-sm">
 {comment.userName || comment.userId}
 </span>
 <span className="text-xs text-muted-foreground">
 {new Date(comment.timestamp).toLocaleString()}
 </span>
 </div>
 <div className="text-sm">{comment.comment}</div>
 </div>
 ))}

 {!workflowHistory.some(h => h.action === 'comment') && (
 <div className="text-center text-muted-foreground py-6">
 No comments yet
 </div>
 )}
 </div>
 </ScrollArea>
 </div>
 </div>
 </TabsContent>
 </div>
 </Tabs>
 </CardContent>
 {!workflowStarted && (
 <CardFooter className="flex justify-end">
 <Button onClick={handleStartWorkflow} disabled={!selectedTemplateId || isLoading.action}>
 {isLoading.action ? (
 <>
 <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
 Starting...
 </>
 ) : (
 <>
 <ArrowRight className="h-4 w-4 mr-2" />
 Start Workflow
 </>
 )}
 </Button>
 </CardFooter>
 )}
 </Card>
 );
};

export default UnifiedWorkflowPanel;
