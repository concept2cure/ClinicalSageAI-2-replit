import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import { Loader2, AlertCircle, CheckCircle, Calendar, ArrowRight } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { StaticTypeBreadcrumb } from './TypeBreadcrumb';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

/**
 * Periodic Review Dashboard Component
 *
 * Displays documents due for periodic review, with ability to mark reviews as completed.
 * Shows upcoming reviews and review history.
 */
export default function PeriodicReviewDashboard() {
  const [activeTab, setActiveTab] = useState('due');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch periodic review tasks
  const {
    data: reviewTasks,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['/api/reference-model/review-tasks'],
    staleTime: 60 * 1000, // 1 minute
  });

  // Group tasks by status
  const dueTasks = reviewTasks?.filter(task => task.status === 'Due' || task.status === 'Open');
  const upcomingTasks = reviewTasks?.filter(
    task => task.status === 'Scheduled' && new Date(task.due_date) > new Date()
  );
  const completedTasks = reviewTasks?.filter(task => task.status === 'Completed');

  // Complete review mutation
  const completeReviewMutation = useMutation({
    mutationFn: async ({ taskId, comments }) => {
      const res = await apiRequest('POST', `/api/reference-model/complete-review/${taskId}`, {
        comments,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Review Completed',
        description: 'The document review has been marked as completed.',
        variant: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/reference-model/review-tasks'] });
    },
    onError: error => {
      toast({
        title: 'Failed to Complete Review',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        <span>Loading periodic review tasks...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          {error.message || 'Failed to load periodic review tasks'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Periodic Document Reviews</CardTitle>
        <CardDescription>Manage document reviews required by the reference model</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="due">
              Due Reviews
              {dueTasks?.length > 0 && (
                <Badge className="ml-2 bg-red-500" variant="secondary">
                  {dueTasks.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="upcoming">
              Upcoming
              {upcomingTasks?.length > 0 && (
                <Badge className="ml-2" variant="outline">
                  {upcomingTasks.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>

          <TabsContent value="due">
            <ReviewTasksTable
              tasks={dueTasks}
              emptyMessage="No reviews currently due. You're all caught up!"
              showCompleteAction
              completeReviewMutation={completeReviewMutation}
            />
          </TabsContent>

          <TabsContent value="upcoming">
            <ReviewTasksTable tasks={upcomingTasks} emptyMessage="No upcoming reviews scheduled." />
          </TabsContent>

          <TabsContent value="completed">
            <ReviewTasksTable
              tasks={completedTasks}
              emptyMessage="No completed reviews found."
              showComments
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ReviewTasksTable({
  tasks,
  emptyMessage,
  showCompleteAction = false,
  showComments = false,
  completeReviewMutation,
}) {
  if (!tasks || tasks.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">{emptyMessage}</div>;
  }

  return (
    <Table>
      <TableCaption>List of periodic review tasks</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Document</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Due Date</TableHead>
          <TableHead>Status</TableHead>
          {showComments && <TableHead>Comments</TableHead>}
          {showCompleteAction && <TableHead className="text-right">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map(task => (
          <TableRow key={task.id}>
            <TableCell className="font-medium">
              <a href={`/documents/${task.document_id}`} className="text-primary hover:underline">
                {task.document?.title || `Document #${task.document_id}`}
              </a>
            </TableCell>
            <TableCell>
              {task.document?.document_subtypes && (
                <StaticTypeBreadcrumb
                  typeName={task.document.document_subtypes.document_types.name}
                  subtypeName={task.document.document_subtypes.name}
                />
              )}
            </TableCell>
            <TableCell>
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-1 text-muted-foreground" />
                {format(new Date(task.due_date), 'MMM d, yyyy')}
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge status={task.status} />
            </TableCell>
            {showComments && (
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {task.comments || 'No comments'}
                </span>
              </TableCell>
            )}
            {showCompleteAction && (
              <TableCell className="text-right">
                <CompleteReviewDialog task={task} completeReviewMutation={completeReviewMutation} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function StatusBadge({ status }) {
  switch (status) {
    case 'Due':
      return <Badge className="bg-red-500">Due</Badge>;
    case 'Open':
      return (
        <Badge variant="outline" className="border-amber-500 text-amber-500">
          Upcoming
        </Badge>
      );
    case 'Completed':
      return (
        <Badge className="bg-green-500">
          <CheckCircle className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    case 'Scheduled':
      return <Badge variant="outline">Scheduled</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function CompleteReviewDialog({ task, completeReviewMutation }) {
  const [comments, setComments] = useState('');
  const [open, setOpen] = useState(false);

  const handleSubmit = e => {
    e.preventDefault();
    completeReviewMutation.mutate(
      {
        taskId: task.id,
        comments,
      },
      {
        onSuccess: () => setOpen(false),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Complete Review
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete Document Review</DialogTitle>
          <DialogDescription>
            Mark this document review as completed. Add any review comments below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="document">Document</Label>
            <Input
              id="document"
              value={task.document?.title || `Document #${task.document_id}`}
              disabled
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="comments">Review Comments</Label>
            <Textarea
              id="comments"
              placeholder="Add any comments about the review..."
              value={comments}
              onChange={e => setComments(e.target.value)}
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={completeReviewMutation.isPending}>
              {completeReviewMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Completing...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Mark Review Complete
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
