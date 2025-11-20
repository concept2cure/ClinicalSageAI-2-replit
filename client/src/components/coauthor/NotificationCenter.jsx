/**
 * SharePoint-style Notification Center Component
 * Bell icon with dropdown panel showing notifications
 */

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useTenantContext } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Bell,
  BellOff,
  Settings,
  Check,
  CheckCheck,
  X,
  AlertCircle,
  Info,
  CheckCircle,
  XCircle,
  AlertTriangle,
  MessageSquare,
  Share2,
  UserPlus,
  FileText,
  Package,
  Shield,
  Clock,
  Trash2,
  Archive,
  Eye,
  EyeOff,
  Mail,
  Volume2,
  VolumeX,
  RefreshCw,
  Filter,
  Circle,
} from 'lucide-react';

/**
 * Get notification icon based on type
 */
function getNotificationIcon(type, category) {
  switch (type) {
    case 'mention':
      return <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
    case 'share':
      return <Share2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />;
    case 'approval_request':
      return <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
    case 'compliance_alert':
      return <Shield className="h-4 w-4 text-red-600 dark:text-red-400" />;
    case 'system_alert':
      return <AlertCircle className="h-4 w-4 text-slate-600 dark:text-slate-400" />;
    case 'activity':
      return <Bell className="h-4 w-4 text-green-600 dark:text-green-400" />;
    default:
      return <Info className="h-4 w-4 text-slate-600 dark:text-slate-400" />;
  }
}

/**
 * Get priority color based on level
 */
function getPriorityColor(priority) {
  switch (priority) {
    case 'critical':
      return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
    case 'high':
      return 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30';
    case 'normal':
      return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30';
    case 'low':
      return 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/30';
    default:
      return 'text-slate-600 dark:text-slate-400';
  }
}

/**
 * Notification Item Component
 */
function NotificationItem({ notification, onRead, onDismiss }) {
  const handleClick = () => {
    if (!notification.isRead) {
      onRead(notification.notificationId);
    }
    // Navigate to action URL if provided
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl;
    }
  };

  return (
    <div
      className={`group relative p-3 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors cursor-pointer ${
        !notification.isRead ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
      }`}
      onClick={handleClick}
      data-testid={`notification-item-${notification.notificationId}`}
    >
      {/* Unread Indicator */}
      {!notification.isRead && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400" />
      )}

      <div className="flex gap-3 ml-2">
        {/* Icon */}
        <div className={`flex-shrink-0 p-2 rounded-lg ${getPriorityColor(notification.priority)}`}>
          {getNotificationIcon(notification.type, notification.category)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-1">
                {notification.title}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mt-0.5">
                {notification.message}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!notification.isRead && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRead(notification.notificationId);
                  }}
                  title="Mark as read"
                  data-testid={`button-mark-read-${notification.notificationId}`}
                >
                  <Check className="h-3 w-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(notification.notificationId);
                }}
                title="Dismiss"
                data-testid={`button-dismiss-${notification.notificationId}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Notification Settings Panel
 */
function NotificationSettings({ preferences, onUpdate, onClose }) {
  const [localPrefs, setLocalPrefs] = useState(preferences || {});

  const handleSave = () => {
    onUpdate(localPrefs);
    onClose();
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Notification Settings</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          data-testid="button-close-settings"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      {/* Email Notifications */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Email Notifications</h4>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm text-slate-600 dark:text-slate-400">Mentions</label>
            <Switch
              checked={localPrefs.emailMentions !== false}
              onCheckedChange={(checked) => 
                setLocalPrefs({ ...localPrefs, emailMentions: checked })
              }
            />
          </div>
          
          <div className="flex items-center justify-between">
            <label className="text-sm text-slate-600 dark:text-slate-400">Shares</label>
            <Switch
              checked={localPrefs.emailShares !== false}
              onCheckedChange={(checked) => 
                setLocalPrefs({ ...localPrefs, emailShares: checked })
              }
            />
          </div>
          
          <div className="flex items-center justify-between">
            <label className="text-sm text-slate-600 dark:text-slate-400">Approvals</label>
            <Switch
              checked={localPrefs.emailApprovals !== false}
              onCheckedChange={(checked) => 
                setLocalPrefs({ ...localPrefs, emailApprovals: checked })
              }
            />
          </div>
          
          <div className="flex items-center justify-between">
            <label className="text-sm text-slate-600 dark:text-slate-400">Compliance Alerts</label>
            <Switch
              checked={localPrefs.emailCompliance !== false}
              onCheckedChange={(checked) => 
                setLocalPrefs({ ...localPrefs, emailCompliance: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm text-slate-600 dark:text-slate-400">Daily Digest</label>
            <Switch
              checked={localPrefs.emailDigest === 'daily'}
              onCheckedChange={(checked) => 
                setLocalPrefs({ ...localPrefs, emailDigest: checked ? 'daily' : 'none' })
              }
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* In-App Notifications */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">In-App Notifications</h4>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm text-slate-600 dark:text-slate-400">Toast Notifications</label>
            <Switch
              checked={localPrefs.toastEnabled !== false}
              onCheckedChange={(checked) => 
                setLocalPrefs({ ...localPrefs, toastEnabled: checked })
              }
            />
          </div>
          
          <div className="flex items-center justify-between">
            <label className="text-sm text-slate-600 dark:text-slate-400">Sound</label>
            <Switch
              checked={localPrefs.soundEnabled === true}
              onCheckedChange={(checked) => 
                setLocalPrefs({ ...localPrefs, soundEnabled: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm text-slate-600 dark:text-slate-400">Auto-follow on interaction</label>
            <Switch
              checked={localPrefs.autoFollowOnInteraction !== false}
              onCheckedChange={(checked) => 
                setLocalPrefs({ ...localPrefs, autoFollowOnInteraction: checked })
              }
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Quiet Hours */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Quiet Hours</h4>
        
        <div className="flex items-center justify-between">
          <label className="text-sm text-slate-600 dark:text-slate-400">Enable quiet hours</label>
          <Switch
            checked={localPrefs.quietHoursEnabled === true}
            onCheckedChange={(checked) => 
              setLocalPrefs({ ...localPrefs, quietHoursEnabled: checked })
            }
          />
        </div>

        {localPrefs.quietHoursEnabled && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500">Start time</label>
              <input
                type="time"
                value={localPrefs.quietHoursStart || '22:00'}
                onChange={(e) => 
                  setLocalPrefs({ ...localPrefs, quietHoursStart: e.target.value })
                }
                className="w-full mt-1 px-2 py-1 text-sm border rounded"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">End time</label>
              <input
                type="time"
                value={localPrefs.quietHoursEnd || '08:00'}
                onChange={(e) => 
                  setLocalPrefs({ ...localPrefs, quietHoursEnd: e.target.value })
                }
                className="w-full mt-1 px-2 py-1 text-sm border rounded"
              />
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave}>
          Save Settings
        </Button>
      </div>
    </div>
  );
}

/**
 * Main Notification Center Component
 */
export function NotificationCenter() {
  const { currentOrganization, currentUser } = useTenantContext();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [filter, setFilter] = useState('all');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioRef = useRef(null);

  // Fetch notifications
  const { data: notificationsData, isLoading, refetch } = useQuery({
    queryKey: ['/api/notifications', currentUser?.id, filter],
    enabled: !!currentUser?.id,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter === 'unread') params.append('unreadOnly', 'true');
      if (filter === 'mentions') params.append('type', 'mention');
      if (filter === 'approvals') params.append('type', 'approval_request');

      const response = await apiRequest('GET', `/api/notifications?${params.toString()}`);
      return response.json();
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  // Fetch preferences
  const { data: preferences } = useQuery({
    queryKey: ['/api/preferences', currentUser?.id],
    enabled: !!currentUser?.id,
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/preferences');
      return response.json();
    },
  });

  // Update preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: async (prefs) => {
      const response = await apiRequest('PUT', '/api/preferences', prefs);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/preferences'] });
      toast({
        title: 'Settings Updated',
        description: 'Your notification preferences have been saved.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mark as read mutation
  const markReadMutation = useMutation({
    mutationFn: async (notificationId) => {
      const response = await apiRequest('PUT', `/api/notifications/${notificationId}/read`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
  });

  // Mark all as read mutation
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('PUT', '/api/notifications/read-all');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      toast({
        title: 'All Marked as Read',
        description: 'All notifications have been marked as read.',
      });
    },
  });

  // Clear all mutation
  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', '/api/notifications/clear-all');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      toast({
        title: 'Notifications Cleared',
        description: 'All notifications have been cleared.',
      });
    },
  });

  const notifications = notificationsData?.notifications || [];
  const unreadCount = notificationsData?.unreadCount || 0;

  // Play notification sound for new notifications
  useEffect(() => {
    if (soundEnabled && preferences?.soundEnabled && unreadCount > 0) {
      // Play sound (would need to add audio file)
      audioRef.current?.play();
    }
  }, [unreadCount, soundEnabled, preferences]);

  // Update sound preference
  useEffect(() => {
    setSoundEnabled(preferences?.soundEnabled === true);
  }, [preferences]);

  return (
    <>
      {/* Notification Bell Button */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="relative h-9 w-9 p-0"
            data-testid="button-notification-bell"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-5 min-w-[20px] rounded-full p-0 flex items-center justify-center text-[10px] font-bold"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[400px] p-0"
          align="end"
          sideOffset={5}
        >
          {showSettings ? (
            <NotificationSettings
              preferences={preferences}
              onUpdate={updatePreferencesMutation.mutate}
              onClose={() => setShowSettings(false)}
            />
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  <h3 className="font-semibold">Notifications</h3>
                  {unreadCount > 0 && (
                    <Badge variant="secondary">{unreadCount} new</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refetch()}
                    data-testid="button-refresh-notifications"
                    title="Refresh"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSettings(true)}
                    data-testid="button-notification-settings"
                    title="Settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Filter Tabs */}
              <Tabs value={filter} onValueChange={setFilter} className="w-full">
                <TabsList className="w-full rounded-none border-b">
                  <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
                  <TabsTrigger value="unread" className="flex-1">
                    Unread {unreadCount > 0 && `(${unreadCount})`}
                  </TabsTrigger>
                  <TabsTrigger value="mentions" className="flex-1">Mentions</TabsTrigger>
                  <TabsTrigger value="approvals" className="flex-1">Approvals</TabsTrigger>
                </TabsList>

                <TabsContent value={filter} className="mt-0">
                  {/* Notifications List */}
                  <ScrollArea className="h-[400px]">
                    {isLoading ? (
                      <div className="p-4 space-y-3">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="flex gap-3">
                            <Skeleton className="h-8 w-8 rounded" />
                            <div className="flex-1 space-y-2">
                              <Skeleton className="h-4 w-3/4" />
                              <Skeleton className="h-3 w-1/2" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="p-8 text-center">
                        <Bell className="h-12 w-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                        <p className="text-sm text-slate-500 dark:text-slate-500">
                          {filter === 'unread' ? 'No unread notifications' : 'No notifications'}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">
                          You're all caught up!
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200 dark:divide-slate-800">
                        {notifications.map((notification) => (
                          <NotificationItem
                            key={notification.notificationId}
                            notification={notification}
                            onRead={markReadMutation.mutate}
                            onDismiss={clearAllMutation.mutate}
                          />
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              </Tabs>

              {/* Footer Actions */}
              {notifications.length > 0 && (
                <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markAllReadMutation.mutate()}
                    disabled={unreadCount === 0}
                    className="text-xs"
                    data-testid="button-mark-all-read"
                  >
                    <CheckCheck className="h-3 w-3 mr-1" />
                    Mark all read
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => clearAllMutation.mutate()}
                    className="text-xs"
                    data-testid="button-clear-all"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Clear all
                  </Button>
                </div>
              )}
            </>
          )}
        </PopoverContent>
      </Popover>

      {/* Hidden audio element for notification sound */}
      <audio ref={audioRef} preload="none">
        <source src="/notification.mp3" type="audio/mpeg" />
      </audio>
    </>
  );
}

export default NotificationCenter;