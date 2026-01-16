import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import {
  MessageSquare, Users, Bell, Clock, CheckCircle2, AlertTriangle, Send, AtSign, Calendar, FileText, Eye, Edit, Share, Download, Settings, Zap, Activity, TrendingUp } from 'lucide-react'
import { useToast } from '@/hooks/use-toast';

export function WorkflowCollaboration({ workflowId, currentUser = 'Current User' }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [activeUsers, setActiveUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [taskUpdates, setTaskUpdates] = useState([]);
  const [showMentions, setShowMentions] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const { toast } = useToast();

  // Sample team members for collaboration
  const teamMembers = [
    {
      id: 1,
      name: 'Sarah Chen',
      role: 'CMC Lead',
      avatar: '/avatars/sarah.jpg',
      status: 'online',
      initials: 'SC',
    },
    {
      id: 2,
      name: 'Mike Johnson',
      role: 'Process Engineer',
      avatar: '/avatars/mike.jpg',
      status: 'online',
      initials: 'MJ',
    },
    {
      id: 3,
      name: 'Lisa Wong',
      role: 'Stability Scientist',
      avatar: '/avatars/lisa.jpg',
      status: 'away',
      initials: 'LW',
    },
    {
      id: 4,
      name: 'David Park',
      role: 'Analytical Lead',
      avatar: '/avatars/david.jpg',
      status: 'offline',
      initials: 'DP',
    },
    {
      id: 5,
      name: 'Emily Rodriguez',
      role: 'QC Manager',
      avatar: '/avatars/emily.jpg',
      status: 'online',
      initials: 'ER',
    },
  ];

  // Initialize sample data
  useEffect(() => {
    const sampleComments = [
      {
        id: 1,
        user: 'Sarah Chen',
        avatar: '/avatars/sarah.jpg',
        initials: 'SC',
        role: 'CMC Lead',
        message:
          'The analytical method validation is progressing well. We should be able to complete specificity studies by Friday.',
        timestamp: '2025-08-11T10:30:00Z',
        mentions: [],
        taskId: 2,
        taskName: 'Analytical Methods',
      },
      {
        id: 2,
        user: 'Mike Johnson',
        avatar: '/avatars/mike.jpg',
        initials: 'MJ',
        role: 'Process Engineer',
        message:
          '@Sarah Chen - I noticed some temperature variations in the synthesis process. Should we adjust the control parameters?',
        timestamp: '2025-08-11T11:15:00Z',
        mentions: ['Sarah Chen'],
        taskId: 1,
        taskName: 'Drug Substance Characterization',
      },
      {
        id: 3,
        user: 'Lisa Wong',
        avatar: '/avatars/lisa.jpg',
        initials: 'LW',
        role: 'Stability Scientist',
        message:
          'Stability protocol has been finalized. Starting sample preparation tomorrow. Timeline looks good.',
        timestamp: '2025-08-11T14:22:00Z',
        mentions: [],
        taskId: 4,
        taskName: 'Stability Protocols',
      },
    ];

    const sampleNotifications = [
      {
        id: 1,
        type: 'task_update',
        title: 'Task Status Changed',
        message: 'Container Closure System moved to In Progress',
        timestamp: '2025-08-11T09:45:00Z',
        read: false,
        icon: 'activity',
        user: 'Mike Johnson',
      },
      {
        id: 2,
        type: 'mention',
        title: 'You were mentioned',
        message: 'Mike Johnson mentioned you in a comment',
        timestamp: '2025-08-11T11:15:00Z',
        read: false,
        icon: 'at-sign',
        user: 'Mike Johnson',
      },
      {
        id: 3,
        type: 'deadline',
        title: 'Upcoming Deadline',
        message: 'Analytical Methods task due in 2 days',
        timestamp: '2025-08-11T12:00:00Z',
        read: true,
        icon: 'clock',
        user: 'System',
      },
    ];

    const sampleTaskUpdates = [
      {
        id: 1,
        user: 'Emily Rodriguez',
        initials: 'ER',
        action: 'completed',
        taskName: 'Quality Specifications',
        timestamp: '2025-08-11T16:30:00Z',
        details: 'All acceptance criteria defined and approved',
      },
      {
        id: 2,
        user: 'David Park',
        initials: 'DP',
        action: 'started',
        taskName: 'Analytical Methods',
        timestamp: '2025-08-11T15:15:00Z',
        details: 'Beginning method validation protocol development',
      },
      {
        id: 3,
        user: 'Lisa Wong',
        initials: 'LW',
        action: 'updated',
        taskName: 'Stability Protocols',
        timestamp: '2025-08-11T14:45:00Z',
        details: 'Added ICH Q1A requirements to protocol',
      },
    ];

    setComments(sampleComments);
    setNotifications(sampleNotifications);
    setTaskUpdates(sampleTaskUpdates);
    setActiveUsers(teamMembers.filter(m => m.status === 'online'));
  }, [workflowId]);

  const addComment = async () => {
    if (!newComment.trim()) return;

    const comment = {
      id: Date.now(),
      user: currentUser,
      initials: currentUser
        .split(' ')
        .map(n => n[0])
        .join(''),
      role: 'Current User',
      message: newComment,
      timestamp: new Date().toISOString(),
      mentions: extractMentions(newComment),
      taskId: null,
      taskName: 'General Discussion',
    };

    setComments(prev => [comment, ...prev]);
    setNewComment('');

    toast({
      title: 'Comment Added',
      description: 'Your comment has been added to the workflow discussion.',
    });

    // Simulate real-time collaboration update
    setTimeout(() => {
      const response = {
        id: Date.now() + 1,
        user: 'Sarah Chen',
        initials: 'SC',
        role: 'CMC Lead',
        message: "Thanks for the update! I'll review the changes.",
        timestamp: new Date().toISOString(),
        mentions: [currentUser],
        taskId: null,
        taskName: 'General Discussion',
      };
      setComments(prev => [response, ...prev]);
    }, 3000);
  };

  const extractMentions = text => {
    const mentions = [];
    const mentionPattern = /@([A-Za-z\s]+)/g;
    let match;
    while ((match = mentionPattern.exec(text)) !== null) {
      mentions.push(match[1].trim());
    }
    return mentions;
  };

  const markNotificationRead = notificationId => {
    setNotifications(prev =>
      prev.map(notif => (notif.id === notificationId ? { ...notif, read: true } : notif))
    );
  };

  const getStatusColor = status => {
    switch (status) {
      case 'online':
        return 'bg-green-500';
      case 'away':
        return 'bg-yellow-500';
      case 'offline':
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  };

  const getActionIcon = action => {
    switch (action) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'started':
        return <Zap className="h-4 w-4 text-blue-600" />;
      case 'updated':
        return <Edit className="h-4 w-4 text-orange-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const formatTimeAgo = timestamp => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInMinutes = Math.floor((now - time) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Discussion Panel */}
      <div className="lg:col-span-2 space-y-6">
        {/* Comments Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Team Discussion
            </CardTitle>
            <CardDescription>
              Collaborate with your team on workflow progress and decisions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add Comment */}
            <div className="space-y-3">
              <Textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder="Add a comment... Use @name to mention team members"
                rows={3}
                className="resize-none"
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AtSign className="h-4 w-4" />
                  <span>Use @name to mention team members</span>
                </div>
                <Button onClick={addComment} disabled={!newComment.trim()}>
                  <Send className="h-4 w-4 mr-2" />
                  Send
                </Button>
              </div>
            </div>

            {/* Comments List */}
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {comments.map(comment => (
                <div key={comment.id} className="flex gap-3 p-3 border rounded-lg">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={comment.avatar} />
                    <AvatarFallback className="text-xs">{comment.initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{comment.user}</span>
                      <Badge variant="outline" className="text-xs">
                        {comment.role}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(comment.timestamp)}
                      </span>
                      {comment.taskName && (
                        <Badge variant="secondary" className="text-xs">
                          {comment.taskName}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm">{comment.message}</p>
                    {comment.mentions.length > 0 && (
                      <div className="flex items-center gap-1 text-xs text-blue-600">
                        <AtSign className="h-3 w-3" />
                        Mentioned: {comment.mentions.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Real-time Task Updates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Live updates on task progress and workflow changes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {taskUpdates.map(update => (
                <div key={update.id} className="flex items-center gap-3 p-3 border rounded-lg">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">{update.initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getActionIcon(update.action)}
                      <span className="font-medium text-sm">{update.user}</span>
                      <span className="text-sm">
                        {update.action} <strong>{update.taskName}</strong>
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{update.details}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatTimeAgo(update.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {/* Active Team Members */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members
              <Badge variant="secondary">{activeUsers.length} online</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {teamMembers.map(member => (
                <div key={member.id} className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={member.avatar} />
                      <AvatarFallback className="text-xs">{member.initials}</AvatarFallback>
                    </Avatar>
                    <div
                      className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white ${getStatusColor(member.status)}`}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.role}</p>
                  </div>
                  <span className="text-xs text-muted-foreground capitalize">{member.status}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
              {notifications.filter(n => !n.read).length > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {notifications.filter(n => !n.read).length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    notification.read ? 'bg-gray-50' : 'bg-blue-50 border-blue-200'
                  }`}
                  onClick={() => markNotificationRead(notification.id)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-1 ${notification.read ? 'text-gray-400' : 'text-blue-600'}`}
                    >
                      {notification.icon === 'activity' && <Activity className="h-4 w-4" />}
                      {notification.icon === 'at-sign' && <AtSign className="h-4 w-4" />}
                      {notification.icon === 'clock' && <Clock className="h-4 w-4" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{notification.title}</p>
                      <p className="text-xs text-muted-foreground">{notification.message}</p>
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(notification.timestamp)}
                      </span>
                    </div>
                    {!notification.read && (
                      <div className="h-2 w-2 bg-blue-600 rounded-full mt-2" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" size="sm">
              <Share className="h-4 w-4 mr-2" />
              Share Workflow
            </Button>
            <Button variant="outline" className="w-full justify-start" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export Progress Report
            </Button>
            <Button variant="outline" className="w-full justify-start" size="sm">
              <Calendar className="h-4 w-4 mr-2" />
              Schedule Review Meeting
            </Button>
            <Button variant="outline" className="w-full justify-start" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Workflow Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default WorkflowCollaboration;
