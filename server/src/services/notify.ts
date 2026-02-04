import { createTransporter } from './emailService';
import fetch from 'node-fetch';

interface GuardFailureOptions {
  processName: string;
  productId: string;
  guard: 'PPQ' | 'FMEA';
  details: string;
  link?: string;
}

export async function notifyGuardFailure(opts: GuardFailureOptions): Promise<void> {
  const subject = `PROCESS GUARD BLOCKED: ${opts.guard} — ${opts.processName}`;
  const text = `A process stage change was blocked by ${opts.guard} guard.

Process: ${opts.processName}
Product: ${opts.productId}
Details: ${opts.details}
${opts.link ? `Open: ${opts.link}` : ''}`;

  // Email notifications
  const QA_EMAILS = process.env.QA_NOTIF_EMAILS;
  if (QA_EMAILS) {
    try {
      const transporter = await createTransporter();
      if (transporter) {
        await transporter.sendMail({
          from: process.env.MAIL_FROM || 'noreply@trialsage.com',
          to: QA_EMAILS,
          subject,
          text,
          priority: 'high',
        });
        console.log(`[EMAIL SENT] Guard failure notification to ${QA_EMAILS}`);
      } else {
        console.log('[EMAIL SKIPPED] Transporter not configured', { subject, text });
      }
    } catch (error) {
      console.error('[EMAIL ERROR] Failed to send guard notification:', error);
    }
  } else {
    console.log('[EMAIL SKIPPED] QA_NOTIF_EMAILS not configured', { subject });
  }

  // Slack notifications
  const SLACK_WEBHOOK = process.env.QA_SLACK_WEBHOOK;
  if (SLACK_WEBHOOK) {
    try {
      const response = await fetch(SLACK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `:no_entry: *PROCESS GUARD BLOCKED* — *${opts.guard}* for *${opts.processName}*\n*Details:* ${opts.details}\n${opts.link ? `<${opts.link}|Open process>` : ''}`,
          username: 'TrialSage CMC',
          icon_emoji: ':warning:',
        }),
      });

      if (response.ok) {
        console.log(`[SLACK SENT] Guard failure notification`);
      } else {
        console.error(`[SLACK ERROR] HTTP ${response.status}: ${await response.text()}`);
      }
    } catch (error) {
      console.error('[SLACK ERROR] Failed to send guard notification:', error);
    }
  } else {
    console.log('[SLACK SKIPPED] QA_SLACK_WEBHOOK not configured', { subject });
  }
}

// Generic notification functions for Quality Step 3
const slackWebhook = process.env.QA_SLACK_WEBHOOK || '';
const emailTo = process.env.QA_NOTIF_EMAILS || '';

export async function notifySlack(text: string) {
  if (!slackWebhook) return { ok: false, reason: 'no webhook' };
  try {
    await fetch(slackWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e.message || String(e) };
  }
}

export async function notifyEmail(subject: string, body: string) {
  console.log('[EMAIL]', subject, '\n', body, '\nTO:', emailTo || '(unset)');
  return { ok: !!emailTo };
}
