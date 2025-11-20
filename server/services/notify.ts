import * as nodemailer from 'nodemailer';

const QA_EMAILS = process.env.QA_NOTIF_EMAILS || ''; // "qa1@x.com,qa2@x.com"
const SLACK_WEBHOOK = process.env.QA_SLACK_WEBHOOK || ''; // Slack incoming webhook URL
const MAIL_FROM = process.env.MAIL_FROM || 'no-reply@yourapp.local';

const transporter =
  process.env.SMTP_HOST && process.env.SMTP_USER
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST!,
        port: +(process.env.SMTP_PORT || 587),
        secure: !!process.env.SMTP_SECURE, // "true" to force TLS
        auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
      })
    : null;

export async function notifyOverride(opts: {
  productId: string;
  methodCode: string;
  methodTitle: string;
  actor: string;
  reason: string;
  acceptanceSummary: string;
  link?: string;
}) {
  const subject = `Override used: ${opts.methodCode} — ${opts.methodTitle}`;
  const text = `An approval override was used.

Product: ${opts.productId}
Method:  ${opts.methodCode} — ${opts.methodTitle}
By:      ${opts.actor}
Reason:  ${opts.reason}

Acceptance summary:
${opts.acceptanceSummary}

${opts.link ? `Open: ${opts.link}` : ''}`;

  // Email
  if (transporter && QA_EMAILS) {
    await transporter
      .sendMail({
        from: MAIL_FROM,
        to: QA_EMAILS,
        subject,
        text,
      })
      .catch((err: any) => console.error('Email notif failed', err));
  } else {
    console.log('[QA EMAIL NOTIF] (skipped config)\n', { subject, text });
  }

  // Slack
  if (SLACK_WEBHOOK) {
    await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `:warning: *Override used* for *${opts.methodCode}* — ${opts.methodTitle}\n*By:* ${opts.actor}\n*Reason:* ${opts.reason}\n*Acceptance:*\n${opts.acceptanceSummary}\n${opts.link ? `<${opts.link}|Open method>` : ''}`,
      }),
    }).catch((err: any) => console.error('Slack notif failed', err));
  } else {
    console.log('[QA SLACK NOTIF] (skipped config)\n', { subject, text });
  }
}
