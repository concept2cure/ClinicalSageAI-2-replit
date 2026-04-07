/**
 * Notification Center
 *
 * This component provides a notification center for the Concept2Cure platform.
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { X, Bell, CheckCircle, AlertTriangle, Info, Clock, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Notification types
const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  INFO: 'info',
  REMINDER: 'reminder',
};

// Mock notifications for demo
const MOCK_NOTIFICATIONS = [
  {
    id: 1,
    type: NOTIFICATION_TYPES.SUCCESS,
    title: 'CSR Draft Approved',
    message: 'Your Clinical Study Report draft has been approved by the regulatory team.',
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 minutes ago
    read: false,
    module: 'csr-intelligence',
    link: '/csr-intelligence/documents/123',
  },
  {
    id: 2,
    type: NOTIFICATION_TYPES.WARNING,
    title: 'IND Submission Approaching',
    message: 'The IND submission deadline is in 3 days. Please ensure all documents are ready.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
    read: false,
    module: 'ind-wizard',
    link: '/ind-wizard/submissions/456',
  },
  {
    id: 3,
    type: NOTIFICATION_TYPES.INFO,
    title: 'New Team Member Added',
    message: 'Sarah Johnson has been added to your project team.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(), // 3 hours ago
    read: true,
    module: 'admin',
    link: '/admin/team',
  },
  {
    id: 4,
    type: NOTIFICATION_TYPES.REMINDER,
    title: 'Weekly Status Meeting',
    message: 'Remember to attend the weekly status meeting today at 2:00 PM.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    read: true,
    module: 'home',
    link: '/calendar',
  },
  {
    id: 5,
    type: NOTIFICATION_TYPES.ERROR,
    title: 'Document Upload Failed',
    message: 'The upload of "Protocol_v2.1.docx" failed. Please try again.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), // 2 days ago
    read: true,
    module: 'trial-vault',
    link: '/trial-vault/documents/upload',
  },
];

const NotificationCenter = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [, setLocation] = useLocation();

  // Initialize notifications (in a real app, would fetch from API)
  useEffect(() => {
    // For demo purposes, using mock data
    setNotifications(MOCK_NOTIFICATIONS);

    // Calculate unread count
    setUnreadCount(MOCK_NOTIFICATIONS.filter(notification => !notification.read).length);

    // Listen for new notifications (would be a websocket in real app)
    const notificationInterval = setInterval(() => {
      // Simulating a new notification every 30 seconds (not active in this demo)
      /*
      const newNotification = {
        id: Date.now(),
        type: Object.values(NOTIFICATION_TYPES)[Math.floor(Math.random() * Object.values(NOTIFICATION_TYPES).length)],
        title: 'New Notification',
        message: 'This is a new notification for demo purposes.',
        timestamp: new Date().toISOString(),
        read: false,
        module: 'home',
        link: '/'
      };
      
      setNotifications(prev => [newNotification, ...prev]);
      setUnreadCount(prev => prev + 1);
      */
    }, 30000);

    return () => {
      clearInterval(notificationInterval);
    };
  }, []);

  // Toggle notification center
  const toggleNotificationCenter = () => {
    setIsOpen(prev => !prev);
  };

  // Mark notification as read
  const markAsRead = notificationId => {
    setNotifications(prev =>
      prev.map(notification =>
        notification.id === notificationId ? { ...notification, read: true } : notification
      )
    );

    // Update unread count
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  // Mark all notifications as read
  const markAllAsRead = () => {
    setNotifications(prev => prev.map(notification => ({ ...notification, read: true })));

    // Reset unread count
    setUnreadCount(0);
  };

  // Handle notification click
  const handleNotificationClick = notification => {
    // Mark as read
    if (!notification.read) {
      markAsRead(notification.id);
    }

    // Navigate to linked page
    setLocation(notification.link);

    // Close notification center
    setIsOpen(false);
  };

  // Format timestamp for display
  const formatTimestamp = timestamp => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.round(diffMs / 1000);
    const diffMin = Math.round(diffSec / 60);
    const diffHr = Math.round(diffMin / 60);
    const diffDays = Math.round(diffHr / 24);

    if (diffSec < 60) {
      return 'Just now';
    } else if (diffMin < 60) {
      return `${diffMin}m ago`;
    } else if (diffHr < 24) {
      return `${diffHr}h ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      const options = { month: 'short', day: 'numeric' };
      return date.toLocaleDateString(undefined, options);
    }
  };

  // Get notification icon based on type
  const getNotificationIcon = type => {
    switch (type) {
      case NOTIFICATION_TYPES.SUCCESS:
        return <CheckCircle size={18} className="text-green-500" />;
      case NOTIFICATION_TYPES.WARNING:
        return <AlertTriangle size={18} className="text-yellow-500" />;
      case NOTIFICATION_TYPES.ERROR:
        return <X size={18} className="text-red-500" />;
      case NOTIFICATION_TYPES.INFO:
        return <Info size={18} className="text-blue-500" />;
      case NOTIFICATION_TYPES.REMINDER:
        return <Clock size={18} className="text-purple-500" />;
      default:
        return <Info size={18} className="text-gray-500" />;
    }
  };

  // Hide button if no notifications
  if (notifications.length === 0) {
    return null;
  }

  return (
    <>
      {/* Floating notification button */}
      <button
        className="fixed bottom-6 right-24 z-40 flex items-center justify-center w-14 h-14 rounded-full bg-white shadow-lg hover:shadow-xl focus:outline-none border"
        onClick={toggleNotificationCenter}
        aria-label={isOpen ? 'Close notifications' : 'Open notifications'}
      >
        <Bell size={24} className="text-primary" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black opacity-50"
              onClick={() => setIsOpen(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-96 bg-white shadow-xl border-l flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center">
                  <Bell size={20} className="text-primary mr-2" />
                  <h2 className="font-semibold text-lg">Notifications</h2>
                  {unreadCount > 0 && (
                    <span className="ml-2 bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button className="text-sm text-primary hover:underline" onClick={markAllAsRead}>
                    Mark all as read
                  </button>
                  <button
                    className="p-1 text-gray-500 hover:text-gray-700"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close notifications"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Notification list */}
              <div className="flex-1 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <Bell size={40} className="mx-auto text-gray-300 mb-3" />
                    <p>No notifications</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {notifications.map(notification => (
                      <div
                        key={notification.id}
                        className={`p-4 hover:bg-gray-50 cursor-pointer ${!notification.read ? 'bg-blue-50' : ''}`}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <div className="flex items-start space-x-3">
                          <div className="flex-shrink-0 mt-0.5">
                            {getNotificationIcon(notification.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <p
                                className={`font-medium text-gray-900 ${!notification.read ? 'font-semibold' : ''}`}
                              >
                                {notification.title}
                              </p>
                              <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                                {formatTimestamp(notification.timestamp)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                            {notification.link && (
                              <div className="mt-2 flex items-center text-xs text-primary hover:underline">
                                <ExternalLink size={12} className="mr-1" />
                                View details
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t p-3 text-center">
                <button
                  className="text-sm text-primary hover:underline"
                  onClick={() => {
                    setIsOpen(false);
                    setLocation('/notifications');
                  }}
                >
                  View all notifications
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default NotificationCenter;
