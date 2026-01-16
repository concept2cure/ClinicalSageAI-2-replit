/**
 * Next Actions Sidebar Component
 *
 * This component displays a prioritized list of next actions for the user
 * based on their projects, deadlines, and regulatory requirements.
 * It integrates with the RegulatoryProjectMap brain to provide intelligent task suggestions.
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertCircle, ArrowRight, Calendar, CheckCircle, ClipboardList, FileText, LayoutList } from 'lucide-react'

// Import project service
import ProjectService from '../../services/ProjectService';

/**
 * Next Actions Sidebar Component
 *
 * @param {Object} props Component props
 * @param {string} props.userId Current user ID
 * @param {string} props.orgId Current organization ID
 * @param {number} props.maxItems Maximum number of actions to display (default: 8)
 */
const NextActionsSidebar = ({ userId, orgId, maxItems = 8 }) => {
  const [actions, setActions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load actions when component mounts
  useEffect(() => {
    const init = async () => {
      try {
        const response = await fetch('/api/next-actions');
        const data = await response.json();
        setActions(data.data.slice(0, maxItems));
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading next actions:', error);
        setIsLoading(false);
      }
    };
    init();
  }, [maxItems]);

  // Helper to format due date
  const formatDueDate = dateStr => {
    const dueDate = new Date(dateStr);
    const now = new Date();
    const diffTime = dueDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: 'Overdue', variant: 'destructive' };
    } else if (diffDays === 0) {
      return { text: 'Today', variant: 'destructive' };
    } else if (diffDays === 1) {
      return { text: 'Tomorrow', variant: 'destructive' };
    } else if (diffDays <= 7) {
      return { text: `${diffDays} days`, variant: 'warning' };
    } else {
      return { text: `${diffDays} days`, variant: 'secondary' };
    }
  };

  // Helper to get action icon
  const getActionIcon = actionType => {
    switch (actionType) {
      case 'document':
        return <FileText className="h-4 w-4" />;
      case 'phase':
        return <ClipboardList className="h-4 w-4" />;
      case 'issue':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <CheckCircle className="h-4 w-4" />;
    }
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="bg-white p-4 rounded-lg shadow-md">
        <h2 className="text-lg font-semibold mb-2">My Next Actions</h2>
        <p>Loading tasks...</p>
      </div>
    );
  }

  // Render empty state if no actions
  if (actions.length === 0) {
    return (
      <Card className="min-h-[300px]">
        <CardHeader>
          <CardTitle className="flex items-center">
            <LayoutList className="h-5 w-5 mr-2" />
            Next Actions
          </CardTitle>
          <CardDescription>Your prioritized task list</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <CheckCircle className="h-10 w-10 text-green-500 mb-2" />
          <h3 className="text-lg font-medium">All Caught Up!</h3>
          <p className="text-sm text-muted-foreground mt-1">
            You have no pending tasks at the moment
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="min-h-[300px]">
      <CardHeader>
        <CardTitle className="flex items-center">
          <LayoutList className="h-5 w-5 mr-2" />
          Next Actions
        </CardTitle>
        <CardDescription>Your prioritized task list</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[380px]">
          <div className="px-6">
            {actions.map((action, index) => {
              const dueInfo = formatDueDate(action.dueDate);
              const moduleLink = ProjectService.getProjectModuleLink(action.projectType);

              return (
                <div key={action.id} className="py-3">
                  {index > 0 && <Separator className="mb-3" />}

                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex">
                        <div className="mr-2 mt-0.5">{getActionIcon(action.actionType)}</div>
                        <div>
                          <p className="font-medium text-sm">{action.description}</p>
                          <p className="text-xs text-muted-foreground">{action.projectName}</p>
                        </div>
                      </div>
                      <Badge variant={dueInfo.variant}>{dueInfo.text}</Badge>
                    </div>

                    <Button asChild variant="outline" size="sm" className="w-full">
                      <Link to={moduleLink}>
                        Work Now
                        <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="border-t bg-muted/50 px-6 py-3">
        <Button asChild variant="ghost" size="sm" className="w-full">
          <Link to="/tasks">View All Tasks</Link>
        </Button>
      </CardFooter>
    </Card>
  );
};

export default NextActionsSidebar;
