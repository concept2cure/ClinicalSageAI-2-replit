import sgMail from '@sendgrid/mail';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { createScopedLogger } from './utils/logger.js';

const log = createScopedLogger('notification');

// Configure SendGrid if API key is available
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Ensure notification logs directory exists
const LOG_DIR = path.join(process.cwd(), 'data', 'logs');
const NOTIFICATION_LOG_PATH = path.join(LOG_DIR, 'notifications.jsonl');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

interface EmailNotificationOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface SlackNotificationOptions {
  text: string;
  blocks?: any[];
}

export class NotificationService {
  /**
   * Log notification to JSONL file
   */
  private logNotification(
    protocolId: string,
    reportLink: string,
    emailSentTo?: string,
    slackSent: boolean = false
  ): void {
    try {
      const entry = {
        timestamp: new Date().toISOString(),
        protocol_id: protocolId,
        report_link: reportLink,
        email_sent_to: emailSentTo || null,
        slack_sent: slackSent,
      };

      fs.appendFileSync(NOTIFICATION_LOG_PATH, JSON.stringify(entry) + '\n');
    } catch (error) {
      log.error('Error logging notification:', error);
    }
  }

  /**
   * Add a general notification to the log
   */
  addNotification(notification: {
    type: string;
    message: string;
    timestamp: string;
    details?: any;
  }): void {
    try {
      fs.appendFileSync(NOTIFICATION_LOG_PATH, JSON.stringify(notification) + '\n');
    } catch (error) {
      log.error('Error adding notification:', error);
    }
  }

  /**
   * Retrieve notification logs
   */
  getNotificationLogs(): any[] {
    try {
      if (!fs.existsSync(NOTIFICATION_LOG_PATH)) {
        return [];
      }

      const logs = fs
        .readFileSync(NOTIFICATION_LOG_PATH, 'utf8')
        .split('\n')
        .filter(line => line.trim() !== '')
        .map(line => JSON.parse(line));

      return logs;
    } catch (error) {
      log.error('Error retrieving notification logs:', error);
      return [];
    }
  }

  /**
   * Send an email notification using SendGrid
   */
  async sendEmailNotification(options: EmailNotificationOptions): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      log.warn('SendGrid API key not configured. Email notification skipped.');
      return false;
    }

    try {
      const msg = {
        to: options.to,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@trialsage.ai',
        subject: options.subject,
        text: options.text,
        html: options.html || options.text,
      };

      await sgMail.send(msg);
      return true;
    } catch (error) {
      log.error('Error sending email notification:', error);
      return false;
    }
  }

  /**
   * Send a notification to a Slack channel using webhooks
   */
  async sendSlackNotification(options: SlackNotificationOptions): Promise<boolean> {
    if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_CHANNEL_ID) {
      log.warn('Slack credentials not configured. Slack notification skipped.');
      return false;
    }

    try {
      const message: any = {
        channel: process.env.SLACK_CHANNEL_ID,
        text: options.text,
      };

      if (options.blocks) {
        message.blocks = options.blocks;
      }

      await axios.post('https://slack.com/api/chat.postMessage', message, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        },
      });

      return true;
    } catch (error) {
      log.error('Error sending Slack notification:', error);
      return false;
    }
  }

  /**
   * Send a strategic report notification via all configured channels
   */
  async sendStrategicReportNotification(
    protocolId: string,
    reportUrl: string,
    recipientEmail?: string
  ): Promise<{ email: boolean; slack: boolean }> {
    const results = {
      email: false,
      slack: false,
    };

    // Email notification
    if (recipientEmail) {
      const emailOptions: EmailNotificationOptions = {
        to: recipientEmail,
        subject: `Concept2Cure Strategic Report Ready for Review`,
        text: `Your full strategic intelligence report for protocol [${protocolId}] is ready.

Download here:
${reportUrl}

Includes:
- Protocol benchmarking
- Endpoint success rates
- AI-powered design suggestions

Best,
Concept2Cure`,
        html: `<p>Your full strategic intelligence report for protocol <strong>${protocolId}</strong> is ready.</p>
<p><a href="${reportUrl}">Download Report</a></p>
<p>Includes:</p>
<ul>
  <li>Protocol benchmarking</li>
  <li>Endpoint success rates</li>
  <li>AI-powered design suggestions</li>
</ul>
<p>Best,<br>Concept2Cure</p>`,
      };

      results.email = await this.sendEmailNotification(emailOptions);
    }

    // Slack notification
    const slackOptions: SlackNotificationOptions = {
      text: `📄 New Strategic Report Ready — ${protocolId}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `📄 New Strategic Report Ready — ${protocolId}`,
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `A new strategic intelligence report has been generated and is ready for review.`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*<${reportUrl}|View Report>*`,
          },
        },
      ],
    };

    results.slack = await this.sendSlackNotification(slackOptions);

    // Log the notification
    this.logNotification(protocolId, reportUrl, recipientEmail, results.slack);

    return results;
  }
}

// Export a singleton instance
export const notificationService = new NotificationService();
