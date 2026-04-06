/**
 * SharePoint-style Activity Feed Component
 * Real-time activity tracking with reactions and following
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useTenantContext } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuLabel,
 DropdownMenuSeparator,
 DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
 FileText,
 Package,
 MessageSquare,
 GitBranch,
 CheckCircle,
 AlertCircle,
 User,
 Users,
 Clock,
 RefreshCw,
 Filter,
 Heart,
 ThumbsUp,
 Smile,
 Star,
 Award,
 MoreVertical,
 Link,
 Eye,
 Calendar,
 Hash,
 Folder,
 Shield,
 Share2,
 Edit,
 Trash2,
 UserPlus,
 Bell,
 BellOff,
 Activity,
 X,
 Table,
 Presentation,
} from 'lucide-react';

/**
 * Get icon for entity type
 */
function getEntityIcon(entityType, entityIcon) {
 if (entityIcon === 'word') return <FileText className="h-4 w-4 text-stone-600 dark:text-stone-400" />;
 if (entityIcon === 'excel') return <Table className="h-4 w-4 text-green-600 dark:text-green-400" />;
 if (entityIcon === 'powerpoint') return <Presentation className="h-4 w-4 text-orange-600 dark:text-orange-400" />;
 if (entityIcon === 'pdf') return <FileText className="h-4 w-4 text-red-600 dark:text-red-400" />;

 switch (entityType) {
 case 'document':
 return <FileText className="h-4 w-4 text-stone-600 dark:text-stone-400" />;
 case 'component':
 return <Package className="h-4 w-4 text-purple-600 dark:text-purple-400" />;
 case 'comment':
 return <MessageSquare className="h-4 w-4 text-green-600 dark:text-green-400" />;
 case 'project':
 return <Folder className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
 case 'user':
 return <User className="h-4 w-4 text-slate-600 dark:text-slate-400" />;
 case 'compliance':
 return <Shield className="h-4 w-4 text-red-600 dark:text-red-400" />;
 default:
 return <Activity className="h-4 w-4 text-slate-600 dark:text-slate-400" />;
 }
}

/**
 * Get action color based on type
 */
function getActionColor(action) {
 switch (action) {
 case 'created':
 return 'text-green-600 dark:text-green-400';
 case 'modified':
 case 'updated':
 return 'text-stone-600 dark:text-stone-400';
 case 'deleted':
 return 'text-red-600 dark:text-red-400';
 case 'shared':
 return 'text-purple-600 dark:text-purple-400';
 case 'approved':
 return 'text-emerald-600 dark:text-emerald-400';
 case 'rejected':
 return 'text-rose-600 dark:text-rose-400';
 case 'commented':
 return 'text-amber-600 dark:text-amber-400';
 default:
 return 'text-slate-600 dark:text-slate-400';
 }
}

/**
 * Activity Item Component
 */
function ActivityItem({ activity, onReaction, onFollow, isFollowing }) {
 const [showReactions, setShowReactions] = useState(false);
 const [userReaction, setUserReaction] = useState(null);

 const handleReaction = async (reactionType) => {
 if (userReaction === reactionType) {
 // Remove reaction
 await onReaction(activity.activityId, reactionType, 'remove');
 setUserReaction(null);
 } else {
 // Add or change reaction
 if (userReaction) {
 await onReaction(activity.activityId, userReaction, 'remove');
 }
 await onReaction(activity.activityId, reactionType, 'add');
 setUserReaction(reactionType);
 }
 setShowReactions(false);
 };

 const reactionEmojis = {
 like: '👍',
 love: '❤️',
 celebrate: '🎉',
 insightful: '💡',
 curious: '🤔',
 };

 return (
 <div className="group relative flex gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
 {/* User Avatar */}
 <Avatar className="h-10 w-10 flex-shrink-0">
 <AvatarImage src={activity.userAvatar} alt={activity.userName} />
 <AvatarFallback className="bg-gradient-to-br from-stone-600 to-purple-600 text-white">
 {activity.userName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
 </AvatarFallback>
 </Avatar>

 {/* Activity Content */}
 <div className="flex-1 space-y-1">
 {/* Header */}
 <div className="flex items-start justify-between">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="font-semibold text-sm">{activity.userName}</span>
 <span className={`text-sm font-medium ${getActionColor(activity.action)}`}>
 {activity.action}
 </span>
 <span className="text-sm text-slate-600 dark:text-slate-400">
 {activity.entityType}
 </span>
 </div>
 
 {/* More Options */}
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button
 variant="ghost"
 size="sm"
 className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
 data-testid={`button-more-activity-${activity.activityId}`}
 >
 <MoreVertical className="h-4 w-4" />
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end">
 <DropdownMenuItem onClick={() => onFollow(activity)}>
 {isFollowing ? (
 <>
 <BellOff className="h-4 w-4 mr-2" />
 Unfollow {activity.entityType}
 </>
 ) : (
 <>
 <Bell className="h-4 w-4 mr-2" />
 Follow {activity.entityType}
 </>
 )}
 </DropdownMenuItem>
 <DropdownMenuItem>
 <Link className="h-4 w-4 mr-2" />
 Copy link
 </DropdownMenuItem>
 <DropdownMenuItem>
 <Eye className="h-4 w-4 mr-2" />
 View {activity.entityType}
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>

 {/* Entity Name with Icon */}
 <div className="flex items-center gap-2">
 {getEntityIcon(activity.entityType, activity.entityIcon)}
 <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
 {activity.entityName}
 </span>
 </div>

 {/* Description */}
 {activity.description && (
 <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
 {activity.description}
 </p>
 )}

 {/* Preview Snippet */}
 {activity.previewSnippet && (
 <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-800/50 rounded text-xs text-slate-600 dark:text-slate-400 line-clamp-3">
 {activity.previewSnippet}
 </div>
 )}

 {/* Footer */}
 <div className="flex items-center gap-4 mt-2">
 {/* Timestamp */}
 <span className="text-xs text-slate-500 dark:text-slate-500">
 {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
 </span>

 {/* Reactions */}
 <div className="flex items-center gap-1">
 {/* Reaction Button */}
 <div className="relative">
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
 onClick={() => setShowReactions(!showReactions)}
 data-testid={`button-react-${activity.activityId}`}
 >
 {userReaction ? (
 <span className="text-base mr-1">{reactionEmojis[userReaction]}</span>
 ) : (
 <Heart className="h-3 w-3 mr-1" />
 )}
 React
 </Button>

 {/* Reaction Picker */}
 {showReactions && (
 <div className="absolute bottom-full left-0 mb-1 p-1 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 flex gap-1 z-10">
 {Object.entries(reactionEmojis).map(([type, emoji]) => (
 <button
 key={type}
 className={`p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors ${
 userReaction === type ? 'bg-slate-100 dark:bg-slate-800' : ''
 }`}
 onClick={() => handleReaction(type)}
 title={type}
 >
 <span className="text-lg">{emoji}</span>
 </button>
 ))}
 </div>
 )}
 </div>

 {/* Reaction Count */}
 {activity.likes > 0 && (
 <span className="text-xs text-slate-500 dark:text-slate-500">
 {activity.likes} {activity.likes === 1 ? 'reaction' : 'reactions'}
 </span>
 )}

 {/* Show Reaction Types */}
 {activity.reactions && Object.keys(activity.reactions).length > 0 && (
 <div className="flex gap-0.5">
 {Object.entries(activity.reactions).slice(0, 3).map(([type, count]) => (
 <span key={type} className="text-sm" title={`${count} ${type}`}>
 {reactionEmojis[type]}
 </span>
 ))}
 {Object.keys(activity.reactions).length > 3 && (
 <span className="text-xs text-slate-500">+{Object.keys(activity.reactions).length - 3}</span>
 )}
 </div>
 )}
 </div>

 {/* Comment Button */}
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
 data-testid={`button-comment-${activity.activityId}`}
 >
 <MessageSquare className="h-3 w-3 mr-1" />
 Comment
 </Button>

 {/* Share Button */}
 <Button
 variant="ghost"
 size="sm"
 className="h-7 px-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
 data-testid={`button-share-${activity.activityId}`}
 >
 <Share2 className="h-3 w-3 mr-1" />
 Share
 </Button>
 </div>
 </div>
 </div>
 );
}

/**
 * Main Activity Feed Component
 */
export function ActivityFeed({ 
 className = '', 
 maxHeight = '600px',
 showHeader = true,
 filters = {},
 onClose
}) {
 const { currentOrganization } = useTenantContext();
 const { toast } = useToast();
 const [localFilters, setLocalFilters] = useState({
 activityType: '',
 userId: '',
 entityType: '',
 dateRange: '7days',
 ...filters
 });
 const [following, setFollowing] = useState(new Set());
 const scrollRef = useRef(null);
 const [isAutoRefresh, setIsAutoRefresh] = useState(true);

 // Fetch activities
 const { data: activitiesData, isLoading, refetch } = useQuery({
 queryKey: ['/api/activities', currentOrganization?.id, localFilters],
 enabled: !!currentOrganization?.id,
 queryFn: async () => {
 const params = new URLSearchParams();
 if (localFilters.activityType) params.append('activityType', localFilters.activityType);
 if (localFilters.userId) params.append('userId', localFilters.userId);
 if (localFilters.entityType) params.append('entityType', localFilters.entityType);
 
 // Calculate date range
 const now = new Date();
 let dateFrom;
 switch (localFilters.dateRange) {
 case '1day':
 dateFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
 break;
 case '7days':
 dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
 break;
 case '30days':
 dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
 break;
 default:
 dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
 }
 params.append('dateFrom', dateFrom.toISOString());

 const response = await apiRequest('GET', `/api/activities?${params.toString()}`);
 return response.json();
 },
 refetchInterval: isAutoRefresh ? 30000 : false, // Auto-refresh every 30 seconds
 });

 // Fetch user's following list
 const { data: followingData } = useQuery({
 queryKey: ['/api/following', currentOrganization?.id],
 enabled: !!currentOrganization?.id,
 queryFn: async () => {
 const response = await apiRequest('GET', '/api/following');
 return response.json();
 },
 });

 // Update following set when data changes
 useEffect(() => {
 if (followingData) {
 const followingSet = new Set(
 followingData.map(f => `${f.entityType}-${f.entityId}`)
 );
 setFollowing(followingSet);
 }
 }, [followingData]);

 // Reaction mutation
 const reactionMutation = useMutation({
 mutationFn: async ({ activityId, reactionType, action }) => {
 if (action === 'add') {
 const response = await apiRequest('POST', `/api/activities/${activityId}/reactions`, {
 reactionType
 });
 return response.json();
 } else {
 const response = await apiRequest('DELETE', `/api/activities/${activityId}/reactions/${reactionType}`);
 return response.json();
 }
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
 },
 onError: (error) => {
 toast({
 title: 'Reaction Failed',
 description: error.message,
 variant: 'destructive',
 });
 },
 });

 // Follow mutation
 const followMutation = useMutation({
 mutationFn: async ({ entityType, entityId, entityName, action }) => {
 if (action === 'follow') {
 const response = await apiRequest('POST', '/api/follow', {
 entityType,
 entityId,
 entityName,
 });
 return response.json();
 } else {
 const response = await apiRequest('DELETE', '/api/follow', {
 entityType,
 entityId,
 });
 return response.json();
 }
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ['/api/following'] });
 },
 onError: (error) => {
 toast({
 title: 'Follow Action Failed',
 description: error.message,
 variant: 'destructive',
 });
 },
 });

 const handleReaction = (activityId, reactionType, action) => {
 reactionMutation.mutate({ activityId, reactionType, action });
 };

 const handleFollow = (activity) => {
 const key = `${activity.entityType}-${activity.entityId}`;
 const isFollowing = following.has(key);
 
 followMutation.mutate({
 entityType: activity.entityType,
 entityId: activity.entityId,
 entityName: activity.entityName,
 action: isFollowing ? 'unfollow' : 'follow',
 });
 };

 const activities = activitiesData || [];

 return (
 <div className={`flex flex-col bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 ${className}`}>
 {/* Header */}
 {showHeader && (
 <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
 <div className="flex items-center gap-2">
 <Activity className="h-5 w-5 text-slate-600 dark:text-slate-400" />
 <h3 className="font-semibold text-lg">Activity</h3>
 {activities.length > 0 && (
 <Badge variant="secondary" className="ml-2">
 {activities.length} {activities.length === 1 ? 'item' : 'items'}
 </Badge>
 )}
 </div>
 <div className="flex items-center gap-2">
 {/* Auto Refresh Toggle */}
 <Button
 variant={isAutoRefresh ? 'default' : 'outline'}
 size="sm"
 onClick={() => setIsAutoRefresh(!isAutoRefresh)}
 data-testid="button-auto-refresh"
 title={isAutoRefresh ? 'Auto-refresh enabled' : 'Auto-refresh disabled'}
 >
 <RefreshCw className={`h-4 w-4 ${isAutoRefresh ? 'animate-spin' : ''}`} />
 </Button>
 
 {/* Manual Refresh */}
 <Button
 variant="ghost"
 size="sm"
 onClick={() => refetch()}
 data-testid="button-refresh"
 title="Refresh now"
 >
 <RefreshCw className="h-4 w-4" />
 </Button>

 {/* Close Button */}
 {onClose && (
 <Button
 variant="ghost"
 size="sm"
 onClick={onClose}
 data-testid="button-close-activity"
 >
 <X className="h-4 w-4" />
 </Button>
 )}
 </div>
 </div>
 )}

 {/* Filters */}
 <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
 <div className="flex gap-2 flex-wrap">
 {/* Date Range */}
 <Select
 value={localFilters.dateRange}
 onValueChange={(value) => setLocalFilters({ ...localFilters, dateRange: value })}
 >
 <SelectTrigger className="w-[140px] h-8">
 <Calendar className="h-3 w-3 mr-1" />
 <SelectValue placeholder="Date range" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="1day">Last 24 hours</SelectItem>
 <SelectItem value="7days">Last 7 days</SelectItem>
 <SelectItem value="30days">Last 30 days</SelectItem>
 <SelectItem value="all">All time</SelectItem>
 </SelectContent>
 </Select>

 {/* Activity Type */}
 <Select
 value={localFilters.activityType}
 onValueChange={(value) => setLocalFilters({ ...localFilters, activityType: value })}
 >
 <SelectTrigger className="w-[140px] h-8">
 <Filter className="h-3 w-3 mr-1" />
 <SelectValue placeholder="All activities" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="">All activities</SelectItem>
 <SelectItem value="document_modified">Documents</SelectItem>
 <SelectItem value="component_updated">Components</SelectItem>
 <SelectItem value="comment_added">Comments</SelectItem>
 <SelectItem value="approval_granted">Approvals</SelectItem>
 <SelectItem value="compliance_alert">Compliance</SelectItem>
 </SelectContent>
 </Select>

 {/* Entity Type */}
 <Select
 value={localFilters.entityType}
 onValueChange={(value) => setLocalFilters({ ...localFilters, entityType: value })}
 >
 <SelectTrigger className="w-[140px] h-8">
 <Hash className="h-3 w-3 mr-1" />
 <SelectValue placeholder="All types" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="">All types</SelectItem>
 <SelectItem value="document">Documents</SelectItem>
 <SelectItem value="component">Components</SelectItem>
 <SelectItem value="project">Projects</SelectItem>
 <SelectItem value="comment">Comments</SelectItem>
 <SelectItem value="user">Users</SelectItem>
 </SelectContent>
 </Select>

 {/* Clear Filters */}
 {(localFilters.activityType || localFilters.entityType || localFilters.dateRange !== '7days') && (
 <Button
 variant="ghost"
 size="sm"
 onClick={() => setLocalFilters({ activityType: '', entityType: '', userId: '', dateRange: '7days' })}
 className="h-8"
 >
 <X className="h-3 w-3 mr-1" />
 Clear
 </Button>
 )}
 </div>
 </div>

 {/* Activity List */}
 <ScrollArea 
 ref={scrollRef}
 className="flex-1"
 style={{ maxHeight }}
 >
 {isLoading ? (
 <div className="p-4 space-y-4">
 {[...Array(5)].map((_, i) => (
 <div key={i} className="flex gap-3">
 <Skeleton className="h-10 w-10 rounded-full" />
 <div className="flex-1 space-y-2">
 <Skeleton className="h-4 w-3/4" />
 <Skeleton className="h-3 w-1/2" />
 </div>
 </div>
 ))}
 </div>
 ) : activities.length === 0 ? (
 <div className="p-8 text-center">
 <Activity className="h-12 w-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
 <p className="text-sm text-slate-500 dark:text-slate-500">No activities found</p>
 <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">
 Activities will appear here as you and your team work
 </p>
 </div>
 ) : (
 <div className="divide-y divide-slate-200 dark:divide-slate-800">
 {activities.map((activity) => (
 <ActivityItem
 key={activity.activityId}
 activity={activity}
 onReaction={handleReaction}
 onFollow={handleFollow}
 isFollowing={following.has(`${activity.entityType}-${activity.entityId}`)}
 />
 ))}
 </div>
 )}
 </ScrollArea>

 {/* Footer with active users count */}
 {activities.length > 0 && (
 <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
 <span>Showing {activities.length} activities</span>
 <Button
 variant="ghost"
 size="sm"
 className="h-7 text-xs"
 onClick={() => refetch()}
 >
 Load more
 </Button>
 </div>
 )}
 </div>
 );
}

export default ActivityFeed;