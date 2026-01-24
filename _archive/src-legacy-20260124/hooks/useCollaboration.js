import { useState, useEffect } from 'react';
import * as collaborationService from '@/services/collaborationService';

/**
 * Custom hook for efficient collaboration data loading
 *
 * This hook handles loading collaboration data on demand to improve performance.
 * It only loads data when needed and uses a cached approach to minimize API calls.
 */
export const useCollaboration = (projectId, moduleType, options = {}) => {
  const {
    loadOnMount = false,
    initialMessages = [],
    initialTasks = [],
    initialMilestones = [],
    initialApprovals = [],
  } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState(initialMessages);
  const [tasks, setTasks] = useState(initialTasks);
  const [milestones, setMilestones] = useState(initialMilestones);
  const [approvals, setApprovals] = useState(initialApprovals);

  // Load data when component mounts if loadOnMount is true
  useEffect(() => {
    if (loadOnMount && projectId && moduleType) {
      loadData();
    }
  }, [projectId, moduleType, loadOnMount]);

  // Function to load all data
  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // For demonstration, we'll use mock data
      // In a real app, these would be API calls

      const mockMessages = [
        {
          id: 'msg-1',
          type: 'system',
          content: `Project collaboration initialized for Module: ${moduleType}`,
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          sender: { id: 'system', name: 'System', avatar: '/system-avatar.png' },
        },
        {
          id: 'msg-2',
          type: 'comment',
          content: "I've started working on the device equivalence comparison section.",
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          sender: {
            id: '1',
            name: 'Sarah Johnson',
            avatar: '/avatars/sarah.jpg',
            role: 'Regulatory Affairs',
          },
        },
      ];

      const mockTasks = [
        {
          id: 'task-1',
          title: 'Gather technical specifications from engineering',
          description:
            'Contact engineering team to gather detailed technical specifications needed for the submission.',
          assignee: '3',
          dueDate: new Date(Date.now() + 172800000).toISOString(), // +2 days
          priority: 'high',
          status: 'in-progress',
        },
      ];

      const mockMilestones = [
        {
          id: 'milestone-1',
          title: 'Device Profile Creation',
          description: 'Create and finalize the device profile with all required specifications.',
          status: 'completed',
          dueDate: new Date(Date.now() - 86400000).toISOString(), // -1 day
        },
        {
          id: 'milestone-2',
          title: 'Predicate Device Selection',
          description: 'Identify and select appropriate predicate devices for comparison.',
          status: 'active',
          dueDate: new Date(Date.now() + 259200000).toISOString(), // +3 days
        },
      ];

      const mockApprovals = [
        {
          id: 'approval-1',
          title: 'Device Profile and Classification Approval',
          description:
            'Approval request for the finalized device specifications and classification before proceeding to the next phase.',
          type: 'Document Approval',
          status: 'pending',
          requestedBy: {
            id: '1',
            name: 'Sarah Johnson',
            avatar: '/avatars/sarah.jpg',
            role: 'Regulatory Affairs',
          },
          requestedAt: new Date(Date.now() - 43200000).toISOString(), // -12 hours
        },
      ];

      setMessages(mockMessages);
      setTasks(mockTasks);
      setMilestones(mockMilestones);
      setApprovals(mockApprovals);
    } catch (err) {
      console.error('Error loading collaboration data:', err);
      setError(err.message || 'Error loading collaboration data');
    } finally {
      setIsLoading(false);
    }
  };

  // Function to send a message
  const sendMessage = async (content, currentUser) => {
    try {
      const message = {
        id: `msg-${Date.now()}`,
        type: 'comment',
        content,
        timestamp: new Date().toISOString(),
        sender: currentUser,
      };

      // In a real implementation, this would call an API
      // const response = await collaborationService.sendMessage(message);

      setMessages(prev => [...prev, message]);
      return message;
    } catch (err) {
      console.error('Error sending message:', err);
      throw err;
    }
  };

  // Function to create a task
  const createTask = async (taskData, currentUser) => {
    try {
      const task = {
        id: `task-${Date.now()}`,
        ...taskData,
        createdAt: new Date().toISOString(),
        createdBy: currentUser,
      };

      // In a real implementation, this would call an API
      // const response = await collaborationService.createTask(task);

      setTasks(prev => [...prev, task]);

      // Add a notification to messages
      const notification = {
        id: `task-create-${Date.now()}`,
        type: 'task-update',
        content: `${currentUser.name} created a new task: "${task.title}"`,
        task,
        timestamp: new Date().toISOString(),
        sender: currentUser,
      };

      setMessages(prev => [...prev, notification]);

      return task;
    } catch (err) {
      console.error('Error creating task:', err);
      throw err;
    }
  };

  // Function to complete a milestone
  const completeMilestone = async (milestoneId, currentUser) => {
    try {
      // In a real implementation, this would call an API
      // const response = await collaborationService.completeMilestone(milestoneId);

      // Update milestone in state
      setMilestones(prev =>
        prev.map(milestone =>
          milestone.id === milestoneId ? { ...milestone, status: 'completed' } : milestone
        )
      );

      // Find the milestone
      const milestone = milestones.find(m => m.id === milestoneId);

      // Add a notification to messages
      const notification = {
        id: `milestone-${Date.now()}`,
        type: 'milestone',
        content: `Milestone "${milestone?.title}" has been completed!`,
        milestone: { ...milestone, status: 'completed' },
        timestamp: new Date().toISOString(),
        sender: currentUser,
      };

      setMessages(prev => [...prev, notification]);

      return { ...milestone, status: 'completed' };
    } catch (err) {
      console.error('Error completing milestone:', err);
      throw err;
    }
  };

  // Allow manual refresh of data
  const refreshData = async () => {
    return loadData();
  };

  return {
    isLoading,
    error,
    messages,
    tasks,
    milestones,
    approvals,
    sendMessage,
    createTask,
    completeMilestone,
    refreshData,
  };
};

export default useCollaboration;
