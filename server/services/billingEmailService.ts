/**
 * Billing Email Service - Automated billing notifications
 *
 * Sends billing-related emails: budget alerts, invoice notifications,
 * payment failures, plan changes, and usage summaries.
 *
 * Follows the same SMTP transport pattern as emailService.ts.
 * Falls back to console logging when SMTP is not configured (development).
 *
 * Environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */

import nodemailer from 'nodemailer';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('billing-email');

// ---------------------------------------------------------------------------
// SMTP Configuration (same pattern as emailService.ts)
// ---------------------------------------------------------------------------

let _transporter: nodemailer.Transporter | null | undefined; // undefined = not yet initialized

function getTransporter(): nodemailer.Transporter | null {
  if (_transporter !== undefined) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    _transporter = null;
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return _transporter;
}

const FROM_ADDRESS = process.env.SMTP_FROM || 'noreply@concept2cure.pro';
const DASHBOARD_URL = process.env.APP_URL || 'https://concept2cure.pro';
const BILLING_PATH = '/concept2cure/billing';

// ---------------------------------------------------------------------------
// HTML escape for user-supplied values interpolated into templates
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Shared HTML helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function wrapEmailHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Poppins',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header with logo -->
        <tr>
          <td style="background-color:#292524;padding:32px 40px;text-align:center;">
            ${process.env.LOGO_URL ? `<img src="${process.env.LOGO_URL}" alt="Concept2Cure" style="height:48px;width:auto;margin-bottom:12px;border-radius:8px;" />` : ''}
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;font-family:'Poppins',Arial,sans-serif;">Concept2Cure</h1>
            <p style="margin:4px 0 0;color:#b0aea5;font-size:13px;font-family:'Poppins',Arial,sans-serif;">AI-Powered Regulatory Intelligence</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background-color:#faf9f5;padding:24px 40px;text-align:center;">
            <p style="margin:0 0 8px;color:#9999aa;font-size:11px;">
              &copy; ${new Date().getFullYear()} Concept2Cure Inc. &middot; FDA 21 CFR Part 11 Compliant
            </p>
            <p style="margin:0;color:#b0b0bb;font-size:10px;">
              This is an automated billing notification. All actions are logged per FDA 21 CFR Part 11.10(e).
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(label: string, href: string, color: string = '#c15f3c'): string {
  return `<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:8px 0 32px;">
    <a href="${href}" style="display:inline-block;background-color:${color};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;">
      ${label}
    </a>
  </td></tr>
</table>`;
}

function dashboardButton(): string {
  return ctaButton('View in Dashboard', `${DASHBOARD_URL}${BILLING_PATH}`);
}

function alertBanner(text: string, bgColor: string, textColor: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
  <tr><td style="background-color:${bgColor};color:${textColor};padding:14px 20px;border-radius:6px;font-size:14px;font-weight:600;text-align:center;">
    ${text}
  </td></tr>
</table>`;
}

// ---------------------------------------------------------------------------
// Helper to send or log
// ---------------------------------------------------------------------------

async function sendOrLog(
  to: string,
  subject: string,
  html: string,
  plainText: string,
): Promise<void> {
  const transporter = getTransporter();

  if (!transporter) {
    log.debug('----------------------------------------------');
    log.debug('[Billing Email] SMTP not configured - logging email');
    log.debug(`  To:      ${to}`);
    log.debug(`  Subject: ${subject}`);
    log.debug(`  Body:    ${plainText.substring(0, 200)}...`);
    log.debug('----------------------------------------------');
    return;
  }

  await transporter.sendMail({
    from: `"Concept2Cure Billing" <${FROM_ADDRESS}>`,
    to,
    subject,
    text: plainText,
    html,
  });

  log.debug(`[Billing Email] Sent "${subject}" to ${to}`);
}

// ---------------------------------------------------------------------------
// 1. Budget Alert Email (50%, 75%, 90%)
// ---------------------------------------------------------------------------

export async function sendBudgetAlertEmail(
  email: string,
  orgName: string,
  threshold: number,
  currentSpendCents: number,
  budgetCents: number,
): Promise<void> {
  const subject = `Budget Alert: ${threshold}% of monthly budget used - ${orgName}`;

  const bannerBg = threshold >= 90 ? '#fff3e0' : '#fff8e1';
  const bannerText = threshold >= 90 ? '#e65100' : '#f57f17';

  const body = wrapEmailHtml(`
    ${alertBanner(`&#9888; Budget Alert: ${threshold}% Used`, bannerBg, bannerText)}
    <h2 style="margin:0 0 16px;color:#292524;font-size:20px;font-weight:600;">Spending Alert for ${escapeHtml(orgName)}</h2>
    <p style="margin:0 0 24px;color:#4a4a68;font-size:15px;line-height:1.6;">
      Your organization has used <strong>${threshold}%</strong> of its monthly API budget.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e8e6dc;border-radius:6px;overflow:hidden;">
      <tr>
        <td style="padding:12px 16px;background:#faf9f5;color:#6b6963;font-size:13px;border-bottom:1px solid #e8e6dc;width:50%;">Current Spend</td>
        <td style="padding:12px 16px;background:#faf9f5;color:#292524;font-size:13px;font-weight:600;border-bottom:1px solid #e8e6dc;">${formatCents(currentSpendCents)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#6b6963;font-size:13px;width:50%;">Monthly Budget</td>
        <td style="padding:12px 16px;color:#292524;font-size:13px;font-weight:600;">${formatCents(budgetCents)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background:#faf9f5;color:#6b6963;font-size:13px;width:50%;">Remaining</td>
        <td style="padding:12px 16px;background:#faf9f5;color:#292524;font-size:13px;font-weight:600;">${formatCents(budgetCents - currentSpendCents)}</td>
      </tr>
    </table>
    <p style="margin:0 0 24px;color:#4a4a68;font-size:14px;line-height:1.6;">
      You can adjust your budget limits or notification thresholds in the billing dashboard.
    </p>
    ${dashboardButton()}
    <hr style="border:none;border-top:1px solid #e8e6dc;margin:24px 0;" />
    <p style="margin:0;color:#9999aa;font-size:12px;line-height:1.5;">
      This alert was triggered because spending reached the ${threshold}% threshold configured for ${escapeHtml(orgName)}. To change alert preferences, visit your billing settings.
    </p>
  `);

  const plainText = `Budget Alert: ${threshold}% Used - ${orgName}\n\nYour organization has used ${threshold}% of its monthly API budget.\n\nCurrent Spend: ${formatCents(currentSpendCents)}\nMonthly Budget: ${formatCents(budgetCents)}\nRemaining: ${formatCents(budgetCents - currentSpendCents)}\n\nManage your budget: ${DASHBOARD_URL}${BILLING_PATH}\n\nThis is an automated billing notification from Concept2Cure. All actions are logged per FDA 21 CFR Part 11.10(e).`;

  await sendOrLog(email, subject, body, plainText);
}

// ---------------------------------------------------------------------------
// 2. Budget Exceeded Email (100%)
// ---------------------------------------------------------------------------

export async function sendBudgetExceededEmail(
  email: string,
  orgName: string,
  currentSpendCents: number,
  budgetCents: number,
  hardLimitEnabled: boolean,
): Promise<void> {
  const subject = `Budget Exceeded: Monthly limit reached - ${orgName}`;

  const hardLimitNotice = hardLimitEnabled
    ? '<p style="margin:0 0 24px;color:#c62828;font-size:14px;line-height:1.6;font-weight:600;">&#9888; Hard limit is enabled. API usage has been paused to prevent further charges. To resume, increase your budget or disable the hard limit.</p>'
    : '<p style="margin:0 0 24px;color:#4a4a68;font-size:14px;line-height:1.6;">Your organization does not have a hard limit enabled, so API usage will continue. Consider enabling a hard limit if you want to cap spending automatically.</p>';

  const body = wrapEmailHtml(`
    ${alertBanner('&#9888; Budget Exceeded: 100% Used', '#ffebee', '#c62828')}
    <h2 style="margin:0 0 16px;color:#292524;font-size:20px;font-weight:600;">Budget Exceeded for ${escapeHtml(orgName)}</h2>
    <p style="margin:0 0 24px;color:#4a4a68;font-size:15px;line-height:1.6;">
      Your organization has reached <strong>100%</strong> of its monthly API budget.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e8e6dc;border-radius:6px;overflow:hidden;">
      <tr>
        <td style="padding:12px 16px;background:#faf9f5;color:#6b6963;font-size:13px;border-bottom:1px solid #e8e6dc;width:50%;">Current Spend</td>
        <td style="padding:12px 16px;background:#faf9f5;color:#c62828;font-size:13px;font-weight:600;border-bottom:1px solid #e8e6dc;">${formatCents(currentSpendCents)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#6b6963;font-size:13px;width:50%;">Monthly Budget</td>
        <td style="padding:12px 16px;color:#292524;font-size:13px;font-weight:600;">${formatCents(budgetCents)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background:#faf9f5;color:#6b6963;font-size:13px;width:50%;">Overage</td>
        <td style="padding:12px 16px;background:#faf9f5;color:#c62828;font-size:13px;font-weight:600;">${formatCents(currentSpendCents - budgetCents)}</td>
      </tr>
    </table>
    ${hardLimitNotice}
    ${dashboardButton()}
    <hr style="border:none;border-top:1px solid #e8e6dc;margin:24px 0;" />
    <p style="margin:0;color:#9999aa;font-size:12px;line-height:1.5;">
      To adjust your budget or hard limit settings, visit your billing dashboard. All billing events are logged per FDA 21 CFR Part 11.10(e).
    </p>
  `);

  const hardLimitText = hardLimitEnabled
    ? 'Hard limit is enabled. API usage has been paused to prevent further charges.'
    : 'No hard limit is set. API usage will continue beyond your budget.';

  const plainText = `Budget Exceeded - ${orgName}\n\nYour organization has reached 100% of its monthly API budget.\n\nCurrent Spend: ${formatCents(currentSpendCents)}\nMonthly Budget: ${formatCents(budgetCents)}\nOverage: ${formatCents(currentSpendCents - budgetCents)}\n\n${hardLimitText}\n\nManage your budget: ${DASHBOARD_URL}${BILLING_PATH}\n\nThis is an automated billing notification from Concept2Cure. All actions are logged per FDA 21 CFR Part 11.10(e).`;

  await sendOrLog(email, subject, body, plainText);
}

// ---------------------------------------------------------------------------
// 3. Invoice Ready Email
// ---------------------------------------------------------------------------

export async function sendInvoiceReadyEmail(
  email: string,
  orgName: string,
  invoiceNumber: string,
  amountCents: number,
  dueDate: string,
  paymentUrl: string,
): Promise<void> {
  const subject = `Invoice ${invoiceNumber} Ready - ${orgName}`;

  const body = wrapEmailHtml(`
    <h2 style="margin:0 0 16px;color:#292524;font-size:20px;font-weight:600;">Invoice Ready</h2>
    <p style="margin:0 0 24px;color:#4a4a68;font-size:15px;line-height:1.6;">
      A new invoice has been generated for <strong>${escapeHtml(orgName)}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e8e6dc;border-radius:6px;overflow:hidden;">
      <tr>
        <td style="padding:12px 16px;background:#faf9f5;color:#6b6963;font-size:13px;border-bottom:1px solid #e8e6dc;width:50%;">Invoice Number</td>
        <td style="padding:12px 16px;background:#faf9f5;color:#292524;font-size:13px;font-weight:600;border-bottom:1px solid #e8e6dc;">${escapeHtml(invoiceNumber)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#6b6963;font-size:13px;width:50%;">Amount Due</td>
        <td style="padding:12px 16px;color:#292524;font-size:13px;font-weight:600;">${formatCents(amountCents)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background:#faf9f5;color:#6b6963;font-size:13px;width:50%;">Due Date</td>
        <td style="padding:12px 16px;background:#faf9f5;color:#292524;font-size:13px;font-weight:600;">${dueDate}</td>
      </tr>
    </table>
    ${ctaButton('Pay Invoice', paymentUrl, '#16a34a')}
    ${dashboardButton()}
    <hr style="border:none;border-top:1px solid #e8e6dc;margin:24px 0;" />
    <p style="margin:0;color:#9999aa;font-size:12px;line-height:1.5;">
      If you have automatic payments enabled, this invoice will be charged to your payment method on file. All billing events are logged per FDA 21 CFR Part 11.10(e).
    </p>
  `);

  const plainText = `Invoice ${invoiceNumber} Ready - ${orgName}\n\nA new invoice has been generated.\n\nInvoice Number: ${invoiceNumber}\nAmount Due: ${formatCents(amountCents)}\nDue Date: ${dueDate}\n\nPay now: ${paymentUrl}\nView in dashboard: ${DASHBOARD_URL}${BILLING_PATH}\n\nThis is an automated billing notification from Concept2Cure. All actions are logged per FDA 21 CFR Part 11.10(e).`;

  await sendOrLog(email, subject, body, plainText);
}

// ---------------------------------------------------------------------------
// 4. Payment Failed Email
// ---------------------------------------------------------------------------

export async function sendPaymentFailedEmail(
  email: string,
  orgName: string,
  amountCents: number,
  retryDate: string,
  updatePaymentUrl: string,
): Promise<void> {
  const subject = `Payment Failed - Action Required - ${orgName}`;

  const body = wrapEmailHtml(`
    ${alertBanner('&#9888; Payment Failed', '#ffebee', '#c62828')}
    <h2 style="margin:0 0 16px;color:#292524;font-size:20px;font-weight:600;">Payment Failed for ${escapeHtml(orgName)}</h2>
    <p style="margin:0 0 24px;color:#4a4a68;font-size:15px;line-height:1.6;">
      We were unable to process your payment of <strong>${formatCents(amountCents)}</strong>. Please update your payment method to avoid service interruption.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e8e6dc;border-radius:6px;overflow:hidden;">
      <tr>
        <td style="padding:12px 16px;background:#faf9f5;color:#6b6963;font-size:13px;border-bottom:1px solid #e8e6dc;width:50%;">Amount</td>
        <td style="padding:12px 16px;background:#faf9f5;color:#c62828;font-size:13px;font-weight:600;border-bottom:1px solid #e8e6dc;">${formatCents(amountCents)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#6b6963;font-size:13px;width:50%;">Next Retry</td>
        <td style="padding:12px 16px;color:#292524;font-size:13px;font-weight:600;">${retryDate}</td>
      </tr>
    </table>
    ${ctaButton('Update Payment Method', updatePaymentUrl, '#c62828')}
    ${dashboardButton()}
    <hr style="border:none;border-top:1px solid #e8e6dc;margin:24px 0;" />
    <p style="margin:0;color:#9999aa;font-size:12px;line-height:1.5;">
      If the payment continues to fail, your account may be restricted. Please update your payment method before ${retryDate}. All billing events are logged per FDA 21 CFR Part 11.10(e).
    </p>
  `);

  const plainText = `Payment Failed - ${orgName}\n\nWe were unable to process your payment of ${formatCents(amountCents)}.\n\nNext Retry: ${retryDate}\n\nPlease update your payment method: ${updatePaymentUrl}\nView in dashboard: ${DASHBOARD_URL}${BILLING_PATH}\n\nThis is an automated billing notification from Concept2Cure. All actions are logged per FDA 21 CFR Part 11.10(e).`;

  await sendOrLog(email, subject, body, plainText);
}

// ---------------------------------------------------------------------------
// 5. Plan Change Email
// ---------------------------------------------------------------------------

export async function sendPlanChangeEmail(
  email: string,
  orgName: string,
  oldTier: string,
  newTier: string,
  effectiveDate: string,
): Promise<void> {
  const isUpgrade = ['Enterprise', 'Scale'].includes(newTier) || (newTier === 'Scale' && oldTier === 'Starter');
  const direction = isUpgrade ? 'Upgrade' : 'Change';
  const subject = `Plan ${direction}: ${oldTier} to ${newTier} - ${orgName}`;

  const bannerBg = isUpgrade ? '#e8f5e9' : '#e3f2fd';
  const bannerColor = isUpgrade ? '#2e7d32' : '#1565c0';

  const body = wrapEmailHtml(`
    ${alertBanner(`Plan ${direction} Confirmed`, bannerBg, bannerColor)}
    <h2 style="margin:0 0 16px;color:#292524;font-size:20px;font-weight:600;">Plan ${direction} for ${escapeHtml(orgName)}</h2>
    <p style="margin:0 0 24px;color:#4a4a68;font-size:15px;line-height:1.6;">
      Your subscription plan has been ${isUpgrade ? 'upgraded' : 'changed'} successfully.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e8e6dc;border-radius:6px;overflow:hidden;">
      <tr>
        <td style="padding:12px 16px;background:#faf9f5;color:#6b6963;font-size:13px;border-bottom:1px solid #e8e6dc;width:50%;">Previous Plan</td>
        <td style="padding:12px 16px;background:#faf9f5;color:#292524;font-size:13px;font-weight:600;border-bottom:1px solid #e8e6dc;">${escapeHtml(oldTier)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#6b6963;font-size:13px;width:50%;">New Plan</td>
        <td style="padding:12px 16px;color:#292524;font-size:13px;font-weight:600;">${escapeHtml(newTier)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background:#faf9f5;color:#6b6963;font-size:13px;width:50%;">Effective Date</td>
        <td style="padding:12px 16px;background:#faf9f5;color:#292524;font-size:13px;font-weight:600;">${effectiveDate}</td>
      </tr>
    </table>
    <p style="margin:0 0 24px;color:#4a4a68;font-size:14px;line-height:1.6;">
      ${isUpgrade
        ? 'Your new plan features are now active. Enjoy your expanded capabilities!'
        : 'Your plan change will take effect on the date shown above. Current features will remain available until then.'}
    </p>
    ${dashboardButton()}
    <hr style="border:none;border-top:1px solid #e8e6dc;margin:24px 0;" />
    <p style="margin:0;color:#9999aa;font-size:12px;line-height:1.5;">
      If you did not request this change, please contact support immediately. All billing events are logged per FDA 21 CFR Part 11.10(e).
    </p>
  `);

  const plainText = `Plan ${direction} - ${orgName}\n\nYour subscription plan has been ${isUpgrade ? 'upgraded' : 'changed'}.\n\nPrevious Plan: ${oldTier}\nNew Plan: ${newTier}\nEffective Date: ${effectiveDate}\n\nView in dashboard: ${DASHBOARD_URL}${BILLING_PATH}\n\nThis is an automated billing notification from Concept2Cure. All actions are logged per FDA 21 CFR Part 11.10(e).`;

  await sendOrLog(email, subject, body, plainText);
}

// ---------------------------------------------------------------------------
// 6. Usage Summary Email (weekly/monthly digest)
// ---------------------------------------------------------------------------

export async function sendUsageSummaryEmail(
  email: string,
  orgName: string,
  period: string,
  totalCostCents: number,
  topModules: Array<{ module: string; costCents: number; requests: number }>,
  budgetUsedPct: number | null,
): Promise<void> {
  const subject = `Usage Summary: ${period} - ${orgName}`;

  const moduleRows = topModules
    .map(
      (m) => `<tr>
        <td style="padding:10px 16px;color:#292524;font-size:13px;border-bottom:1px solid #e8e6dc;">${escapeHtml(m.module)}</td>
        <td style="padding:10px 16px;color:#292524;font-size:13px;border-bottom:1px solid #e8e6dc;text-align:right;">${m.requests.toLocaleString()}</td>
        <td style="padding:10px 16px;color:#292524;font-size:13px;border-bottom:1px solid #e8e6dc;text-align:right;">${formatCents(m.costCents)}</td>
      </tr>`,
    )
    .join('');

  const budgetRow =
    budgetUsedPct !== null
      ? `<tr>
        <td style="padding:12px 16px;background:#faf9f5;color:#6b6963;font-size:13px;width:50%;">Budget Used</td>
        <td style="padding:12px 16px;background:#faf9f5;color:#292524;font-size:13px;font-weight:600;">${budgetUsedPct}%</td>
      </tr>`
      : '';

  const body = wrapEmailHtml(`
    <h2 style="margin:0 0 16px;color:#292524;font-size:20px;font-weight:600;">Usage Summary</h2>
    <p style="margin:0 0 8px;color:#6b6963;font-size:13px;">${escapeHtml(orgName)} &middot; ${escapeHtml(period)}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e8e6dc;border-radius:6px;overflow:hidden;">
      <tr>
        <td style="padding:12px 16px;background:#faf9f5;color:#6b6963;font-size:13px;border-bottom:1px solid #e8e6dc;width:50%;">Total Cost</td>
        <td style="padding:12px 16px;background:#faf9f5;color:#292524;font-size:15px;font-weight:700;border-bottom:1px solid #e8e6dc;">${formatCents(totalCostCents)}</td>
      </tr>
      ${budgetRow}
    </table>
    <h3 style="margin:0 0 12px;color:#292524;font-size:16px;font-weight:600;">Top Modules</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e8e6dc;border-radius:6px;overflow:hidden;">
      <tr>
        <td style="padding:10px 16px;background:#f4f3ee;color:#6b6963;font-size:12px;font-weight:600;border-bottom:1px solid #e8e6dc;">Module</td>
        <td style="padding:10px 16px;background:#f4f3ee;color:#6b6963;font-size:12px;font-weight:600;border-bottom:1px solid #e8e6dc;text-align:right;">Requests</td>
        <td style="padding:10px 16px;background:#f4f3ee;color:#6b6963;font-size:12px;font-weight:600;border-bottom:1px solid #e8e6dc;text-align:right;">Cost</td>
      </tr>
      ${moduleRows}
    </table>
    ${dashboardButton()}
    <hr style="border:none;border-top:1px solid #e8e6dc;margin:24px 0;" />
    <p style="margin:0;color:#9999aa;font-size:12px;line-height:1.5;">
      This is your ${period.toLowerCase().includes('week') ? 'weekly' : 'monthly'} usage digest. All billing events are logged per FDA 21 CFR Part 11.10(e).
    </p>
  `);

  const moduleText = topModules
    .map((m) => `  ${m.module}: ${m.requests} requests, ${formatCents(m.costCents)}`)
    .join('\n');
  const budgetText = budgetUsedPct !== null ? `Budget Used: ${budgetUsedPct}%\n` : '';

  const plainText = `Usage Summary: ${period} - ${orgName}\n\nTotal Cost: ${formatCents(totalCostCents)}\n${budgetText}\nTop Modules:\n${moduleText}\n\nView in dashboard: ${DASHBOARD_URL}${BILLING_PATH}\n\nThis is an automated billing notification from Concept2Cure. All actions are logged per FDA 21 CFR Part 11.10(e).`;

  await sendOrLog(email, subject, body, plainText);
}
