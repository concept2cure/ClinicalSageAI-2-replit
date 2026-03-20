import express, { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import { PgDatabase } from '../storage';
import { getSocketServer } from '../socketServer';
import { z } from 'zod';

const router = express.Router();

// Notification schemas
const NotificationSchema = z.object({
  type: z.enum(['email', 'sms', 'in-app']),
  recipient: z.string(),
  subject: z.string(),
  message: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  template: z.string().optional(),
  templateData: z.record(z.any()).optional(),
  scheduledFor: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const PreferencesSchema = z.object({
  userId: z.string(),
  email: z.boolean().default(true),
  sms: z.boolean().default(false),
  inApp: z.boolean().default(true),
  dailyDigest: z.boolean().default(false),
  taskAssignment: z.boolean().default(true),
  deadlineReminder: z.boolean().default(true),
  statusUpdates: z.boolean().default(true),
  quietHours: z.object({
    enabled: z.boolean().default(false),
    start: z.string().default('18:00'),
    end: z.string().default('09:00'),
  }).optional(),
});

// Email transporter configuration
const createEmailTransporter = () => {
  // Use environment variables for production
  const config = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  };

  // Return null if not configured (development mode)
  if (!config.auth.user || !config.auth.pass) {
    console.log('📧 Email notifications disabled - SMTP not configured');
    return null;
  }

  return nodemailer.createTransporter(config);
};

// Notification templates
const NOTIFICATION_TEMPLATES = {
  taskAssigned: {
    subject: 'New Task Assigned: {{taskTitle}}',
    message: `
      <h2>Task Assignment</h2>
      <p>You have been assigned a new task:</p>
      <ul>
        <li><strong>Title:</strong> {{taskTitle}}</li>
        <li><strong>Priority:</strong> {{priority}}</li>
        <li><strong>Due Date:</strong> {{dueDate}}</li>
        <li><strong>Assigned By:</strong> {{assignedBy}}</li>
      </ul>
      <p>{{description}}</p>
      <a href="{{taskUrl}}">View Task</a>
    `,
  },
  deadlineApproaching: {
    subject: 'Task Deadline Approaching: {{taskTitle}}',
    message: `
      <h2>Deadline Reminder</h2>
      <p>The following task is due soon:</p>
      <ul>
        <li><strong>Title:</strong> {{taskTitle}}</li>
        <li><strong>Due Date:</strong> {{dueDate}}</li>
        <li><strong>Time Remaining:</strong> {{timeRemaining}}</li>
        <li><strong>Completion Status:</strong> {{completionPercent}}%</li>
      </ul>
      <a href="{{taskUrl}}">Complete Task</a>
    `,
  },
  statusChange: {
    subject: 'Task Status Updated: {{taskTitle}}',
    message: `
      <h2>Status Update</h2>
      <p>Task status has changed:</p>
      <ul>
        <li><strong>Title:</strong> {{taskTitle}}</li>
        <li><strong>Previous Status:</strong> {{oldStatus}}</li>
        <li><strong>New Status:</strong> {{newStatus}}</li>
        <li><strong>Updated By:</strong> {{updatedBy}}</li>
        <li><strong>Comment:</strong> {{comment}}</li>
      </ul>
      <a href="{{taskUrl}}">View Task</a>
    `,
  },
  complianceAlert: {
    subject: 'Compliance Issue Detected: {{taskTitle}}',
    message: `
      <h2>Compliance Alert</h2>
      <p>A compliance issue requires your attention:</p>
      <ul>
        <li><strong>Task:</strong> {{taskTitle}}</li>
        <li><strong>Issue Type:</strong> {{issueType}}</li>
        <li><strong>Severity:</strong> {{severity}}</li>
        <li><strong>Details:</strong> {{details}}</li>
        <li><strong>Recommended Action:</strong> {{action}}</li>
      </ul>
      <a href="{{taskUrl}}">Resolve Issue</a>
    `,
  },
  dailyDigest: {
    subject: 'Daily Task Digest - {{date}}',
    message: `
      <h2>Your Daily Task Summary</h2>
      <h3>Tasks Due Today ({{dueTodayCount}})</h3>
      {{dueTodayList}}
      
      <h3>Upcoming Tasks ({{upcomingCount}})</h3>
      {{upcomingList}}
      
      <h3>Overdue Tasks ({{overdueCount}})</h3>
      {{overdueList}}
      
      <h3>Recent Updates</h3>
      {{recentUpdatesList}}
      
      <a href="{{dashboardUrl}}">View Dashboard</a>
    `,
  },
};

// Apply template with data
const applyTemplate = (template: string, data: Record<string, any>): string => {
  let result = template;
  Object.keys(data).forEach((key) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, data[key] || '');
  });
  return result;
};

// In-memory notification queue (use Redis or database queue in production)
const notificationQueue: any[] = [];
let isProcessingQueue = false;

// Process notification queue
const processNotificationQueue = async () => {
  if (isProcessingQueue || notificationQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;
  const batch = notificationQueue.splice(0, 10); // Process 10 at a time

  for (const notification of batch) {
    try {
      await sendNotification(notification);
    } catch (error) {
      console.error('Failed to send notification:', error);
      // In production, implement retry logic
    }
  }

  isProcessingQueue = false;
  
  // Continue processing if more in queue
  if (notificationQueue.length > 0) {
    setTimeout(processNotificationQueue, 1000);
  }
};

// Send notification based on type
const sendNotification = async (notification: any) => {
  const { type, recipient, subject, message, priority, metadata } = notification;

  switch (type) {
    case 'email':
      const transporter = createEmailTransporter();
      if (transporter) {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@trialsage.com',
          to: recipient,
          subject,
          html: message,
          priority: priority === 'urgent' ? 'high' : 'normal',
        });
      } else {
        console.log('📧 Email notification (dev mode):', { recipient, subject });
      }
      break;

    case 'sms':
      // Stub for SMS - implement Twilio integration in production
      console.log('📱 SMS notification:', { recipient, message: message.substring(0, 160) });
      break;

    case 'in-app':
      // Send via WebSocket to connected clients
      const io = getSocketServer();
      if (io) {
        io.emit('notification-received', {
          id: `notif-${Date.now()}`,
          userId: recipient,
          subject,
          message,
          priority,
          timestamp: new Date().toISOString(),
          read: false,
          metadata,
        });
      }
      break;
  }

  // Store notification in database
  const storage = PgDatabase.getInstance();
  await storage.createNotificationLog({
    type,
    recipient,
    subject,
    message,
    priority,
    sentAt: new Date().toISOString(),
    metadata,
  });
};

// Routes

// Send single notification
router.post('/send', async (req: Request, res: Response) => {
  try {
    const notification = NotificationSchema.parse(req.body);
    
    // Apply template if specified
    if (notification.template && notification.templateData) {
      const template = NOTIFICATION_TEMPLATES[notification.template as keyof typeof NOTIFICATION_TEMPLATES];
      if (template) {
        notification.subject = applyTemplate(template.subject, notification.templateData);
        notification.message = applyTemplate(template.message, notification.templateData);
      }
    }

    // Check user preferences
    const storage = PgDatabase.getInstance();
    const preferences = await storage.getUserNotificationPreferences(notification.recipient);
    
    if (preferences) {
      // Filter based on preferences
      if (notification.type === 'email' && !preferences.email) {
        return res.status(200).json({ message: 'Notification skipped due to user preferences' });
      }
      if (notification.type === 'sms' && !preferences.sms) {
        return res.status(200).json({ message: 'Notification skipped due to user preferences' });
      }
      if (notification.type === 'in-app' && !preferences.inApp) {
        return res.status(200).json({ message: 'Notification skipped due to user preferences' });
      }

      // Check quiet hours
      if (preferences.quietHours?.enabled) {
        const now = new Date();
        const currentTime = `${now.getHours()}:${now.getMinutes()}`;
        if (currentTime >= preferences.quietHours.start || currentTime < preferences.quietHours.end) {
          // Queue for later unless urgent
          if (notification.priority !== 'urgent') {
            notification.scheduledFor = preferences.quietHours.end;
            notificationQueue.push(notification);
            return res.status(200).json({ message: 'Notification queued for quiet hours' });
          }
        }
      }
    }

    // Add to queue or send immediately based on priority
    if (notification.priority === 'urgent') {
      await sendNotification(notification);
      res.status(200).json({ message: 'Notification sent immediately' });
    } else {
      notificationQueue.push(notification);
      processNotificationQueue(); // Start processing
      res.status(200).json({ message: 'Notification queued for processing' });
    }
  } catch (error) {
    console.error('Notification error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Send bulk notifications
router.post('/bulk', async (req: Request, res: Response) => {
  try {
    const { recipients, notification } = req.body;
    
    for (const recipient of recipients) {
      const notif = { ...notification, recipient };
      notificationQueue.push(notif);
    }
    
    processNotificationQueue();
    res.status(200).json({ 
      message: `${recipients.length} notifications queued`,
      queueSize: notificationQueue.length 
    });
  } catch (error) {
    console.error('Bulk notification error:', error);
    res.status(500).json({ error: 'Failed to queue bulk notifications' });
  }
});

// Get user notification preferences
router.get('/preferences/:userId', async (req: Request, res: Response) => {
  try {
    const storage = PgDatabase.getInstance();
    const preferences = await storage.getUserNotificationPreferences(req.params.userId);
    res.status(200).json(preferences || {
      userId: req.params.userId,
      email: true,
      sms: false,
      inApp: true,
      dailyDigest: false,
      taskAssignment: true,
      deadlineReminder: true,
      statusUpdates: true,
    });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// Update user notification preferences
router.put('/preferences/:userId', async (req: Request, res: Response) => {
  try {
    const preferences = PreferencesSchema.parse({
      userId: req.params.userId,
      ...req.body,
    });
    
    const storage = PgDatabase.getInstance();
    await storage.updateUserNotificationPreferences(preferences);
    
    res.status(200).json({ message: 'Preferences updated', preferences });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Get notification history
router.get('/history/:userId', async (req: Request, res: Response) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const storage = PgDatabase.getInstance();
    const history = await storage.getNotificationHistory(
      req.params.userId,
      parseInt(limit as string),
      parseInt(offset as string)
    );
    
    res.status(200).json(history);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to get notification history' });
  }
});

// Mark notification as read
router.put('/read/:notificationId', async (req: Request, res: Response) => {
  try {
    const storage = PgDatabase.getInstance();
    await storage.markNotificationAsRead(req.params.notificationId);
    
    // Broadcast via WebSocket
    const io = getSocketServer();
    if (io) {
      io.emit('notification-read', { id: req.params.notificationId });
    }
    
    res.status(200).json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Get unread count
router.get('/unread/:userId', async (req: Request, res: Response) => {
  try {
    const storage = PgDatabase.getInstance();
    const count = await storage.getUnreadNotificationCount(req.params.userId);
    res.status(200).json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// Send test notification
router.post('/test', async (req: Request, res: Response) => {
  try {
    const notification = {
      type: 'in-app' as const,
      recipient: req.body.userId || 'test-user',
      subject: 'Test Notification',
      message: 'This is a test notification from the Concept2Cure notification system.',
      priority: 'medium' as const,
    };
    
    await sendNotification(notification);
    res.status(200).json({ message: 'Test notification sent', notification });
  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// Schedule daily digest
router.post('/schedule-digest', async (req: Request, res: Response) => {
  try {
    // This would be handled by a cron job in production
    const { userId } = req.body;
    
    // Gather data for digest
    const storage = PgDatabase.getInstance();
    const tasks = await storage.getTasksForUser(userId);
    
    const today = new Date();
    const dueToday = tasks.filter(t => {
      const dueDate = new Date(t.dueDate);
      return dueDate.toDateString() === today.toDateString();
    });
    
    const upcoming = tasks.filter(t => {
      const dueDate = new Date(t.dueDate);
      return dueDate > today && dueDate <= new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    });
    
    const overdue = tasks.filter(t => {
      const dueDate = new Date(t.dueDate);
      return dueDate < today && t.status !== 'completed';
    });
    
    const digestData = {
      date: today.toLocaleDateString(),
      dueTodayCount: dueToday.length,
      dueTodayList: dueToday.map(t => `<li>${t.title} - ${t.priority}</li>`).join(''),
      upcomingCount: upcoming.length,
      upcomingList: upcoming.map(t => `<li>${t.title} - Due ${new Date(t.dueDate).toLocaleDateString()}</li>`).join(''),
      overdueCount: overdue.length,
      overdueList: overdue.map(t => `<li>${t.title} - Overdue by ${Math.floor((today.getTime() - new Date(t.dueDate).getTime()) / (1000 * 60 * 60 * 24))} days</li>`).join(''),
      recentUpdatesList: '<li>5 tasks updated today</li>',
      dashboardUrl: `${process.env.APP_URL || 'http://localhost:5000'}/dashboard`,
    };
    
    const notification = {
      type: 'email' as const,
      recipient: userId,
      subject: applyTemplate(NOTIFICATION_TEMPLATES.dailyDigest.subject, digestData),
      message: applyTemplate(NOTIFICATION_TEMPLATES.dailyDigest.message, digestData),
      priority: 'low' as const,
      template: 'dailyDigest',
      templateData: digestData,
    };
    
    notificationQueue.push(notification);
    processNotificationQueue();
    
    res.status(200).json({ message: 'Daily digest scheduled', data: digestData });
  } catch (error) {
    console.error('Schedule digest error:', error);
    res.status(500).json({ error: 'Failed to schedule digest' });
  }
});

export default router;