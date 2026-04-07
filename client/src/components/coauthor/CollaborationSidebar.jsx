import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Users,
  MessageSquare,
  Activity,
  Circle,
  Edit3,
  Clock,
  Check,
  AtSign,
  Send,
  Lock,
  Unlock,
  Eye,
  ChevronRight,
  UserCheck,
  MessageCircle,
  FileEdit,
  GitBranch,
  Save,
  CircleOff
} from 'lucide-react';

const CollaborationSidebar = ({ 
  collaborators = [], 
  activities = [], 
  comments = [], 
  onAddComment = () => {},
  onResolveComment = () => {},
  currentUser = null,
  typingUsers = [],
  locks = [],
  isConnected = true
}) => {
  const [activeTab, setActiveTab] = useState('collaborators');
  const [commentText, setCommentText] = useState('');
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentionList, setShowMentionList] = useState(false);
  const [selectedCommentId, setSelectedCommentId] = useState(null);
  const [replyText, setReplyText] = useState('');
  const commentsEndRef = useRef(null);
  const activitiesEndRef = useRef(null);

  useEffect(() => {
    // Auto-scroll to latest comment
    if (activeTab === 'comments' && commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [comments, activeTab]);

  useEffect(() => {
    // Auto-scroll to latest activity
    if (activeTab === 'activity' && activitiesEndRef.current) {
      activitiesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activities, activeTab]);

  const handleCommentSubmit = () => {
    if (commentText.trim()) {
      // Extract mentions from comment text
      const mentions = [];
      const mentionRegex = /@(\w+)/g;
      let match;
      while ((match = mentionRegex.exec(commentText)) !== null) {
        const username = match[1];
        const user = collaborators.find(c => 
          c.name.toLowerCase().includes(username.toLowerCase())
        );
        if (user) {
          mentions.push(user.id);
        }
      }

      onAddComment({
        content: commentText,
        mentions,
        parentId: selectedCommentId
      });
      
      setCommentText('');
      setSelectedCommentId(null);
      setReplyText('');
    }
  };

  const handleMention = (user) => {
    const lastAtIndex = commentText.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const newText = commentText.substring(0, lastAtIndex) + `@${user.name} `;
      setCommentText(newText);
    }
    setShowMentionList(false);
    setMentionSearch('');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'editing': return 'bg-blue-500';
      case 'idle': return 'bg-yellow-500';
      default: return 'bg-gray-400';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'online': return <Circle className="h-3 w-3 fill-current" />;
      case 'editing': return <Edit3 className="h-3 w-3" />;
      case 'idle': return <Clock className="h-3 w-3" />;
      default: return <CircleOff className="h-3 w-3" />;
    }
  };

  const getActivityIcon = (action) => {
    switch (action) {
      case 'edit': return <FileEdit className="h-4 w-4" />;
      case 'comment': return <MessageCircle className="h-4 w-4" />;
      case 'join': return <UserCheck className="h-4 w-4" />;
      case 'leave': return <CircleOff className="h-4 w-4" />;
      case 'lock': return <Lock className="h-4 w-4" />;
      case 'unlock': return <Unlock className="h-4 w-4" />;
      case 'save': return <Save className="h-4 w-4" />;
      case 'status_change': return <GitBranch className="h-4 w-4" />;
      case 'mention': return <AtSign className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  const getActivityDescription = (activity) => {
    switch (activity.action) {
      case 'edit':
        return `edited ${activity.details?.section || 'the document'}`;
      case 'comment':
        return 'added a comment';
      case 'join':
        return 'joined the document';
      case 'leave':
        return 'left the document';
      case 'lock':
        return `locked ${activity.details?.section || 'a section'}`;
      case 'unlock':
        return `unlocked ${activity.details?.section || 'a section'}`;
      case 'save':
        return 'saved the document';
      case 'status_change':
        return `changed status from ${activity.details?.from} to ${activity.details?.to}`;
      default:
        return activity.details?.message || 'performed an action';
    }
  };

  return (
    <Card className="h-full flex flex-col">
      {/* Connection Status */}
      {!isConnected && (
        <div className="bg-red-50 border-b border-red-200 p-2">
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <StatusOffline className="h-4 w-4" />
            <span>Disconnected - Reconnecting...</span>
          </div>
        </div>
      )}

      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" />
          Collaboration
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-3 mx-4" style={{ width: 'calc(100% - 2rem)' }}>
            <TabsTrigger value="collaborators" className="text-xs">
              Users ({collaborators.length})
            </TabsTrigger>
            <TabsTrigger value="activity" className="text-xs">
              Activity
            </TabsTrigger>
            <TabsTrigger value="comments" className="text-xs">
              Comments ({comments.filter(c => !c.resolved).length})
            </TabsTrigger>
          </TabsList>

          {/* Collaborators Tab */}
          <TabsContent value="collaborators" className="flex-1 mt-0">
            <ScrollArea className="h-[calc(100vh-250px)]">
              <div className="p-4 space-y-3">
                {collaborators.map((collaborator) => {
                  const isTyping = typingUsers.some(u => u.userId === collaborator.id);
                  const userLocks = locks.filter(l => l.userId === collaborator.id);
                  
                  return (
                    <div key={collaborator.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50">
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={collaborator.avatar} />
                          <AvatarFallback style={{ backgroundColor: collaborator.color }}>
                            {collaborator.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${getStatusColor(collaborator.status)}`}>
                          {getStatusIcon(collaborator.status)}
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {collaborator.name}
                            {collaborator.id === currentUser?.id && ' (You)'}
                          </span>
                          {collaborator.status === 'editing' && collaborator.currentSection && (
                            <Badge variant="secondary" className="text-xs">
                              {collaborator.currentSection}
                            </Badge>
                          )}
                        </div>
                        
                        {isTyping && (
                          <div className="flex items-center gap-1 mt-1">
                            <Edit3 className="h-3 w-3 text-blue-500 animate-pulse" />
                            <span className="text-xs text-blue-500">Typing...</span>
                          </div>
                        )}
                        
                        {userLocks.length > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            <Lock className="h-3 w-3 text-orange-500" />
                            <span className="text-xs text-orange-500">
                              Editing {userLocks.length} section{userLocks.length > 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                        
                        <span className="text-xs text-gray-500">
                          Last active {formatTime(collaborator.lastActivity)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                
                {collaborators.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="h-12 w-12 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No collaborators yet</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="flex-1 mt-0">
            <ScrollArea className="h-[calc(100vh-250px)]">
              <div className="p-4 space-y-2">
                {activities.map((activity, index) => (
                  <div key={activity.id || index} className="flex gap-3 p-2 rounded hover:bg-gray-50">
                    <div className={`mt-1 p-1.5 rounded-full bg-gray-100 text-gray-600`}>
                      {getActivityIcon(activity.action)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm">
                          <span className="font-medium">{activity.userName}</span>
                          <span className="text-gray-600 ml-1">
                            {getActivityDescription(activity)}
                          </span>
                        </p>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {formatTime(activity.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                
                {activities.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No activity yet</p>
                  </div>
                )}
                <div ref={activitiesEndRef} />
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Comments Tab */}
          <TabsContent value="comments" className="flex-1 mt-0 flex flex-col">
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {comments.filter(c => !c.resolved).map((comment) => (
                  <div key={comment.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={comment.userAvatar} />
                        <AvatarFallback>
                          {comment.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{comment.userName}</span>
                          <span className="text-xs text-gray-500">{formatTime(comment.timestamp)}</span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1">{comment.content}</p>
                        {comment.position && (
                          <Badge variant="outline" className="mt-1 text-xs">
                            {comment.position.section}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-10">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setSelectedCommentId(comment.id)}
                      >
                        Reply
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => onResolveComment(comment.id)}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Resolve
                      </Button>
                    </div>
                    {selectedCommentId === comment.id && (
                      <div className="ml-10 mt-2">
                        <Textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Write a reply..."
                          className="min-h-[60px] text-sm"
                        />
                      </div>
                    )}
                  </div>
                ))}
                
                {comments.filter(c => !c.resolved).length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No comments yet</p>
                    <p className="text-xs mt-1">Start a discussion!</p>
                  </div>
                )}
                <div ref={commentsEndRef} />
              </div>
            </ScrollArea>
            
            {/* Comment Input */}
            <div className="border-t p-4">
              <div className="relative">
                <Textarea
                  value={commentText}
                  onChange={(e) => {
                    setCommentText(e.target.value);
                    // Detect @ mentions
                    const text = e.target.value;
                    const lastChar = text[text.length - 1];
                    if (lastChar === '@') {
                      setShowMentionList(true);
                      setMentionSearch('');
                    } else if (showMentionList) {
                      const lastAtIndex = text.lastIndexOf('@');
                      if (lastAtIndex !== -1) {
                        setMentionSearch(text.substring(lastAtIndex + 1));
                      } else {
                        setShowMentionList(false);
                      }
                    }
                  }}
                  placeholder="Add a comment... Use @ to mention"
                  className="min-h-[80px] pr-10 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                      handleCommentSubmit();
                    }
                  }}
                />
                <Button
                  size="icon"
                  className="absolute bottom-2 right-2 h-8 w-8"
                  onClick={handleCommentSubmit}
                  disabled={!commentText.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
                
                {/* Mention Dropdown */}
                {showMentionList && (
                  <Card className="absolute bottom-full mb-2 left-0 w-full max-h-32 overflow-y-auto z-50">
                    <CardContent className="p-2">
                      {collaborators
                        .filter(c => 
                          c.name.toLowerCase().includes(mentionSearch.toLowerCase())
                        )
                        .map(user => (
                          <button
                            key={user.id}
                            className="w-full text-left px-2 py-1 hover:bg-gray-100 rounded flex items-center gap-2"
                            onClick={() => handleMention(user)}
                          >
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={user.avatar} />
                              <AvatarFallback style={{ backgroundColor: user.color }}>
                                {user.name[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{user.name}</span>
                          </button>
                        ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default CollaborationSidebar;