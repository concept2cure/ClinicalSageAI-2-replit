import React, { createContext, useContext, useState, useEffect } from 'react';
import * as collaborationService from '../services/collaborationService';

// Create a context for collaboration features
const CollaborationContext = createContext(null);

/**
 * Collaboration Provider Component
 *
 * This provider makes collaboration features available throughout the application,
 * including messaging, tasks, milestones, and approvals.
 */
export const CollaborationProvider = ({ children, initialProjectId, initialModuleType }) => {
  // State variables
  const [projectId, setProjectId] = useState(initialProjectId || null);
  const [moduleType, setModuleType] = useState(initialModuleType || null);
  const [messages, setMessages] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState({
    messages: false,
    tasks: false,
    milestones: false,
    approvals: false,
    team: false,
  });
  const [error, setError] = useState({
    messages: null,
    tasks: null,
    milestones: null,
    approvals: null,
    team: null,
  });

  // Set current user from the session
  const [currentUser, setCurrentUser] = useState({
    id: '0',
    name: 'Current User',
    avatar: '/avatars/user.jpg',
    role: 'Regulatory Affairs Specialist',
  });

  // Effect to load project data when projectId or moduleType changes
  useEffect(() => {
    if (projectId && moduleType) {
      loadProjectData();
    }
  }, [projectId, moduleType]);

  // Load all project collaboration data
  const loadProjectData = async () => {
    await Promise.all([
      fetchMessages(),
      fetchTasks(),
      fetchMilestones(),
      fetchApprovals(),
      fetchTeamMembers(),
    ]);
  };

  // Fetch messages for the project
  const fetchMessages = async () => {
    setLoading(prev => ({ ...prev, messages: true }));
    setError(prev => ({ ...prev, messages: null }));

    try {
      // For demo purposes, we'll use mock data
      // In a real implementation, this would call the API
      const mockMessages = generateMockMessages();
      setMessages(mockMessages);
    } catch (err) {
      setError(prev => ({ ...prev, messages: err.message }));
    } finally {
      setLoading(prev => ({ ...prev, messages: false }));
    }
  };

  // Fetch tasks for the project
  const fetchTasks = async () => {
    setLoading(prev => ({ ...prev, tasks: true }));
    setError(prev => ({ ...prev, tasks: null }));

    try {
      // For demo purposes, we'll use mock data
      // In a real implementation, this would call the API
      const mockTasks = generateMockTasks();
      setTasks(mockTasks);
    } catch (err) {
      setError(prev => ({ ...prev, tasks: err.message }));
    } finally {
      setLoading(prev => ({ ...prev, tasks: false }));
    }
  };

  // Fetch milestones for the project
  const fetchMilestones = async () => {
    setLoading(prev => ({ ...prev, milestones: true }));
    setError(prev => ({ ...prev, milestones: null }));

    try {
      // For demo purposes, we'll use mock data
      // In a real implementation, this would call the API
      const mockMilestones = generateMockMilestones();
      setMilestones(mockMilestones);
    } catch (err) {
      setError(prev => ({ ...prev, milestones: err.message }));
    } finally {
      setLoading(prev => ({ ...prev, milestones: false }));
    }
  };

  // Fetch approvals for the project
  const fetchApprovals = async () => {
    setLoading(prev => ({ ...prev, approvals: true }));
    setError(prev => ({ ...prev, approvals: null }));

    try {
      // For demo purposes, we'll use mock data
      // In a real implementation, this would call the API
      const mockApprovals = generateMockApprovals();
      setApprovals(mockApprovals);
    } catch (err) {
      setError(prev => ({ ...prev, approvals: err.message }));
    } finally {
      setLoading(prev => ({ ...prev, approvals: false }));
    }
  };

  // Fetch team members for the project
  const fetchTeamMembers = async () => {
    setLoading(prev => ({ ...prev, team: true }));
    setError(prev => ({ ...prev, team: null }));

    try {
      // For demo purposes, we'll use mock data
      // In a real implementation, this would call the API
      const mockTeam = generateMockTeam();
      setTeamMembers(mockTeam);
    } catch (err) {
      setError(prev => ({ ...prev, team: err.message }));
    } finally {
      setLoading(prev => ({ ...prev, team: false }));
    }
  };

  // Send a message
  const sendMessage = async content => {
    const message = {
      id: `msg-${Date.now()}`,
      type: 'comment',
      content,
      timestamp: new Date().toISOString(),
      sender: currentUser,
    };

    // In a real implementation, this would call the API
    // const response = await collaborationService.sendMessage(message);

    // For now, just add it to the local state
    setMessages(prev => [...prev, message]);

    // Generate an AI response after a delay
    setTimeout(() => {
      generateAiSuggestion();
    }, 1500);

    return message;
  };

  // Generate AI suggestion
  const generateAiSuggestion = async () => {
    // In a real implementation, this would call the AI API
    // const suggestions = await collaborationService.getAiSuggestions(projectId, moduleType);

    // For demo purposes, generate a mock suggestion
    const aiSuggestion = {
      id: `suggestion-${Date.now()}`,
      type: 'ai-suggestion',
      content:
        'I notice that for the current phase, you might need to verify the device classification according to FDA guidelines. Would you like me to provide more information on this?',
      timestamp: new Date().toISOString(),
      sender: { id: 'ai', name: 'AnA', avatar: '/ai-avatar.png' },
      confidence: 0.91,
      actions: [
        { id: `action-${Date.now()}-1`, label: 'Get More Info', action: 'get-info' },
        { id: `action-${Date.now()}-2`, label: 'Create Task', action: 'create-task' },
        { id: `action-${Date.now()}-3`, label: 'Dismiss', action: 'dismiss' },
      ],
    };

    setMessages(prev => [...prev, aiSuggestion]);

    return aiSuggestion;
  };

  // Create a task
  const createTask = async taskData => {
    const task = {
      id: `task-${Date.now()}`,
      ...taskData,
      createdAt: new Date().toISOString(),
      createdBy: currentUser,
    };

    // In a real implementation, this would call the API
    // const response = await collaborationService.createTask(task);

    // For now, just add it to the local state
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
  };

  // Update a task
  const updateTask = async (taskId, updates) => {
    // In a real implementation, this would call the API
    // const response = await collaborationService.updateTask(taskId, updates);

    // For now, just update the local state
    setTasks(prev => prev.map(task => (task.id === taskId ? { ...task, ...updates } : task)));

    // Add a notification to messages
    const notification = {
      id: `task-update-${Date.now()}`,
      type: 'task-update',
      content: `${currentUser.name} updated task: "${tasks.find(t => t.id === taskId)?.title}"`,
      taskId,
      updates,
      timestamp: new Date().toISOString(),
      sender: currentUser,
    };

    setMessages(prev => [...prev, notification]);

    // Find updated task
    const updatedTask = tasks.find(t => t.id === taskId);
    if (updatedTask) {
      return { ...updatedTask, ...updates };
    }
    return null;
  };

  // Complete a milestone
  const completeMilestone = async milestoneId => {
    // In a real implementation, this would call the API
    // const response = await collaborationService.completeMilestone(milestoneId);

    // For now, just update the local state
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
  };

  // Process an approval request
  const processApproval = async (approvalId, isApproved, note = '') => {
    // In a real implementation, this would call the API
    // const response = await collaborationService.processApprovalRequest(approvalId, { isApproved, note });

    // For now, just update the local state
    setApprovals(prev =>
      prev.map(approval =>
        approval.id === approvalId
          ? {
              ...approval,
              status: isApproved ? 'approved' : 'rejected',
              processedAt: new Date().toISOString(),
              note,
            }
          : approval
      )
    );

    // Find the approval
    const approval = approvals.find(a => a.id === approvalId);

    // Add a notification to messages
    const notification = {
      id: `approval-${Date.now()}`,
      type: isApproved ? 'approval-granted' : 'approval-denied',
      content: `${currentUser.name} has ${isApproved ? 'approved' : 'rejected'} the request: "${approval?.title}"${note ? ` - Note: ${note}` : ''}`,
      approval: {
        ...approval,
        status: isApproved ? 'approved' : 'rejected',
        processedAt: new Date().toISOString(),
        note,
      },
      timestamp: new Date().toISOString(),
      sender: currentUser,
    };

    setMessages(prev => [...prev, notification]);

    return {
      ...approval,
      status: isApproved ? 'approved' : 'rejected',
      processedAt: new Date().toISOString(),
      note,
    };
  };

  // Create an approval request
  const createApprovalRequest = async requestData => {
    const request = {
      id: `approval-${Date.now()}`,
      ...requestData,
      status: 'pending',
      requestedBy: currentUser,
      requestedAt: new Date().toISOString(),
    };

    // In a real implementation, this would call the API
    // const response = await collaborationService.createApprovalRequest(request);

    // For now, just add it to the local state
    setApprovals(prev => [...prev, request]);

    // Add a notification to messages
    const notification = {
      id: `approval-request-${Date.now()}`,
      type: 'approval-request',
      content: `${currentUser.name} requested approval for "${request.title}"`,
      item: request,
      timestamp: new Date().toISOString(),
      sender: currentUser,
    };

    setMessages(prev => [...prev, notification]);

    return request;
  };

  // Mock data generation for demo purposes
  const generateMockMessages = () => {
    const baseDate = new Date();
    baseDate.setHours(baseDate.getHours() - 12);

    return [
      {
        id: 'msg-1',
        type: 'system',
        content: 'Project collaboration initialized for Module: ' + moduleType,
        timestamp: new Date(baseDate.getTime() + 5 * 60000).toISOString(),
        sender: { id: 'system', name: 'System', avatar: '/system-avatar.png' },
      },
      {
        id: 'msg-2',
        type: 'comment',
        content: "I've started working on the device equivalence comparison section.",
        timestamp: new Date(baseDate.getTime() + 15 * 60000).toISOString(),
        sender: {
          id: '1',
          name: 'Sarah Johnson',
          avatar: '/avatars/sarah.jpg',
          role: 'Regulatory Affairs',
        },
      },
      {
        id: 'msg-3',
        type: 'ai-suggestion',
        content:
          "I noticed you're working on device equivalence. The FDA recommends including a detailed comparison table for key parameters including physical characteristics, performance, and electrical safety features.",
        timestamp: new Date(baseDate.getTime() + 20 * 60000).toISOString(),
        sender: { id: 'ai', name: 'AnA', avatar: '/ai-avatar.png' },
        confidence: 0.89,
        actions: [
          { id: 'action-1', label: 'Show Template', action: 'show-template' },
          { id: 'action-2', label: 'Dismiss', action: 'dismiss' },
        ],
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
        priority: 'high',
        status: 'in-progress',
        createdAt: new Date(baseDate.getTime() - 1 * 24 * 60 * 60000).toISOString(),
        createdBy: {
          id: '4',
          name: 'James Wilson',
          avatar: '/avatars/james.jpg',
          role: 'Project Manager',
        },
      },
      {
        id: 'task-2',
        title: 'Draft Intended Use statement',
        description:
          'Create the first draft of the Intended Use statement for the device, following the latest FDA guidelines.',
        assignee: '2',
        dueDate: new Date(baseDate.getTime() + 3 * 24 * 60 * 60000).toISOString(),
        priority: 'medium',
        status: 'todo',
        createdAt: new Date(baseDate.getTime() - 2 * 24 * 60 * 60000).toISOString(),
        createdBy: {
          id: '4',
          name: 'James Wilson',
          avatar: '/avatars/james.jpg',
          role: 'Project Manager',
        },
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
    ];
  };

  const generateMockApprovals = () => {
    const baseDate = new Date();

    return [
      {
        id: 'approval-1',
        title: 'Device Profile and Classification Approval',
        description:
          'Approval request for the finalized device specifications and classification before proceeding to the predicate device comparison phase.',
        type: 'Document Approval',
        status: 'pending',
        requestedBy: {
          id: '1',
          name: 'Sarah Johnson',
          avatar: '/avatars/sarah.jpg',
          role: 'Regulatory Affairs',
        },
        requestedAt: new Date(baseDate.getTime() - 0.5 * 24 * 60 * 60000).toISOString(),
      },
    ];
  };

  const generateMockTeam = () => {
    return [
      { id: '1', name: 'Sarah Johnson', role: 'Regulatory Affairs', avatar: '/avatars/sarah.jpg' },
      { id: '2', name: 'David Chen', role: 'Medical Writer', avatar: '/avatars/david.jpg' },
      { id: '3', name: 'Priya Patel', role: 'Clinical Specialist', avatar: '/avatars/priya.jpg' },
      { id: '4', name: 'James Wilson', role: 'Project Manager', avatar: '/avatars/james.jpg' },
      { id: '5', name: 'Maria Rodriguez', role: 'Quality Assurance', avatar: '/avatars/maria.jpg' },
    ];
  };

  // Context value
  const contextValue = {
    // Project data
    projectId,
    setProjectId,
    moduleType,
    setModuleType,

    // Data
    messages,
    tasks,
    milestones,
    approvals,
    teamMembers,
    currentUser,

    // Status
    loading,
    error,

    // Actions
    sendMessage,
    createTask,
    updateTask,
    completeMilestone,
    processApproval,
    createApprovalRequest,
    generateAiSuggestion,

    // Refetch methods
    refreshMessages: fetchMessages,
    refreshTasks: fetchTasks,
    refreshMilestones: fetchMilestones,
    refreshApprovals: fetchApprovals,
    refreshTeam: fetchTeamMembers,
    refreshAll: loadProjectData,
  };

  return (
    <CollaborationContext.Provider value={contextValue}>{children}</CollaborationContext.Provider>
  );
};

// Custom hook to use the collaboration context
export const useCollaboration = () => {
  const context = useContext(CollaborationContext);

  if (!context) {
    throw new Error('useCollaboration must be used within a CollaborationProvider');
  }

  return context;
};

export default CollaborationContext;
