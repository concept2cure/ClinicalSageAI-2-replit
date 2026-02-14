import React from 'react';
import { Clock, CheckCircle, AlertCircle, CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

/**
 * NextActionsSidebar Component
 *
 * Displays upcoming tasks and actions required from the user.
 */
const NextActionsSidebar = ({ clientId }) => {
  // Sample next actions data - in a real application, this would come from an API
  const nextActions = [
    {
      id: 'action-1',
      title: 'CER Quality Check Due',
      dueDate: '2025-05-15', // 5 days from today
      priority: 'high',
      status: 'pending',
      project: 'BTX-112 Clinical Trial',
      module: 'cer2v',
      progress: 0,
    },
    {
      id: 'action-2',
      title: 'Review Protocol Amendments',
      dueDate: '2025-05-12', // 2 days from today
      priority: 'medium',
      status: 'in_progress',
      project: 'BTX-112 Clinical Trial',
      module: 'study-architect',
      progress: 35,
    },
    {
      id: 'action-3',
      title: 'CMC Documentation Updates',
      dueDate: '2025-05-20', // 10 days from today
      priority: 'medium',
      status: 'in_progress',
      project: 'BTX-112 Clinical Trial',
      module: 'cmc-module',
      progress: 68,
    },
    {
      id: 'action-4',
      title: 'IND Submission Final Check',
      dueDate: '2025-05-30', // 20 days from today
      priority: 'high',
      status: 'not_started',
      project: 'BTX-112 Clinical Trial',
      module: 'ectd-coauthor',
      progress: 0,
    },
  ];

  // Get prioritized, client-specific next actions
  const getClientActions = () => {
    if (!clientId) return nextActions;

    // In a real app, this would filter based on client ID
    // For demo purposes, we'll just return all actions
    return nextActions;
  };

  const clientActions = getClientActions();

  // Calculate days remaining
  const getDaysRemaining = dueDate => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Get badge variant based on priority and days remaining
  const getBadgeVariant = (priority, dueDate) => {
    const daysRemaining = getDaysRemaining(dueDate);

    if (priority === 'high' && daysRemaining <= 7) {
      return 'destructive';
    }

    if (priority === 'high' || daysRemaining <= 3) {
      return 'destructive';
    }

    if (priority === 'medium' || daysRemaining <= 7) {
      return 'warning';
    }

    return 'outline';
  };

  if (clientActions.length === 0) {
    return (
      <div className="text-center py-4">
        <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-2" />
        <h3 className="text-lg font-medium text-gray-700">All Caught Up!</h3>
        <p className="text-sm text-gray-500">No pending actions at this time.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {clientActions.map(action => (
        <div
          key={action.id}
          className="p-3 bg-white border rounded-lg shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex justify-between items-start">
            <h3 className="font-medium text-gray-800">{action.title}</h3>
            <Badge variant={getBadgeVariant(action.priority, action.dueDate)}>
              {action.priority === 'high'
                ? 'High'
                : action.priority === 'medium'
                  ? 'Medium'
                  : 'Low'}
            </Badge>
          </div>

          <div className="mt-2 flex items-center text-sm text-gray-500">
            <Clock className="h-4 w-4 mr-1 text-gray-400" />
            <span>
              Due:{' '}
              {new Date(action.dueDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            <span className="mx-2">•</span>
            <span>{getDaysRemaining(action.dueDate)} days remaining</span>
          </div>

          {action.progress > 0 && (
            <div className="mt-3">
              <div className="flex justify-between items-center text-xs mb-1">
                <span>Progress</span>
                <span>{action.progress}%</span>
              </div>
              <Progress value={action.progress} className="h-1.5" />
            </div>
          )}

          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-primary border-primary/20 hover:bg-primary/5"
            >
              <div className="flex items-center justify-center w-full">
                {action.status === 'pending' ? (
                  <AlertCircle className="h-3.5 w-3.5 mr-1.5 text-amber-500" />
                ) : action.status === 'in_progress' ? (
                  <CalendarClock className="h-3.5 w-3.5 mr-1.5 text-blue-500" />
                ) : (
                  <CheckCircle className="h-3.5 w-3.5 mr-1.5 text-green-500" />
                )}
                Take Action
              </div>
            </Button>
          </div>
        </div>
      ))}

      <Button variant="ghost" className="w-full text-primary">
        View All Tasks
      </Button>
    </div>
  );
};

export default NextActionsSidebar;
