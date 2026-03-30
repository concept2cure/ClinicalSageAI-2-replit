/**
 * Email Service — Transactional Emails
 *
 * Handles password reset emails and login verification codes (email OTP).
 * Falls back to console logging when SMTP is not configured (development).
 *
 * Environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */

import nodemailer from 'nodemailer';
import { createScopedLogger } from '../utils/logger.js';
const log = createScopedLogger('email-service');

// ---------------------------------------------------------------------------
// SMTP Configuration
// ---------------------------------------------------------------------------

function getTransporter(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const FROM_ADDRESS = process.env.SMTP_FROM || 'noreply@concept2cure.pro';

// ---------------------------------------------------------------------------
// HTML Email Template
// ---------------------------------------------------------------------------

function buildResetEmailHtml(resetUrl: string): string {
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
            <h2 style="margin:0 0 16px;color:#292524;font-size:20px;font-weight:600;">Password Reset Request</h2>
            <p style="margin:0 0 24px;color:#4a4a68;font-size:15px;line-height:1.6;">
              We received a request to reset your password. Click the button below to create a new password. This link will expire in <strong>1 hour</strong>.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:8px 0 32px;">
                <a href="${resetUrl}" style="display:inline-block;background-color:#c15f3c;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;">
                  Reset Password
                </a>
              </td></tr>
            </table>
            <p style="margin:0 0 12px;color:#6b6963;font-size:13px;line-height:1.5;">
              If the button doesn't work, copy and paste this URL into your browser:
            </p>
            <p style="margin:0 0 24px;word-break:break-all;color:#c15f3c;font-size:13px;">
              ${resetUrl}
            </p>
            <hr style="border:none;border-top:1px solid #e8e6dc;margin:24px 0;" />
            <p style="margin:0;color:#9999aa;font-size:12px;line-height:1.5;">
              If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged. This request is logged per FDA 21 CFR Part 11.10(e).
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background-color:#faf9f5;padding:24px 40px;text-align:center;">
            <p style="margin:0 0 8px;color:#8a8880;font-size:11px;font-family:'Poppins',Arial,sans-serif;">
              &copy; ${new Date().getFullYear()} Concept2Cure, Inc. &middot; FDA 21 CFR Part 11 Compliant
            </p>
            <p style="margin:0;font-size:10px;">
              <a href="${process.env.APP_URL || 'https://concept2cure.com'}/concept2cure/legal/privacy" style="color:#b0aea5;text-decoration:none;">Privacy</a>
              &nbsp;&middot;&nbsp;
              <a href="${process.env.APP_URL || 'https://concept2cure.com'}/concept2cure/legal/terms" style="color:#b0aea5;text-decoration:none;">Terms</a>
              &nbsp;&middot;&nbsp;
              <a href="${process.env.APP_URL || 'https://concept2cure.com'}/concept2cure/legal/aup" style="color:#b0aea5;text-decoration:none;">Acceptable Use</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a password reset email.
 *
 * When SMTP is not configured the reset URL is printed to the console so
 * developers can still complete the flow locally.
 */
export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  resetUrl: string
): Promise<void> {
  const transporter = getTransporter();

  if (!transporter) {
    log.warn('SMTP not configured — password reset email not sent', { to: email });
    log.debug('Dev reset link', { to: email, url: resetUrl });
    return;
  }

  await transporter.sendMail({
    from: `"Concept2Cure" <${FROM_ADDRESS}>`,
    to: email,
    subject: 'Password Reset — Concept2Cure',
    text: `You requested a password reset.\n\nClick the link below (expires in 1 hour):\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
    html: buildResetEmailHtml(resetUrl),
  });

  log.info('Password reset email sent', { to: email });
}

// ---------------------------------------------------------------------------
// Login Verification Code (Email OTP)
// ---------------------------------------------------------------------------

function buildOtpEmailHtml(code: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Poppins',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background-color:#292524;padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;font-family:'Poppins',Arial,sans-serif;">Concept2Cure</h1>
            <p style="margin:4px 0 0;color:#b0aea5;font-size:13px;font-family:'Poppins',Arial,sans-serif;">AI-Powered Regulatory Intelligence</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 16px;color:#292524;font-size:20px;font-weight:600;">Your verification code</h2>
            <p style="margin:0 0 24px;color:#4a4a68;font-size:15px;line-height:1.6;">
              Enter this code to complete your sign-in. It expires in <strong>10 minutes</strong>.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:8px 0 32px;">
                <div style="display:inline-block;background-color:#f0f0ff;border:2px solid #4f46e5;border-radius:12px;padding:20px 40px;">
                  <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#292524;font-family:'Courier New',monospace;">${code}</span>
                </div>
              </td></tr>
            </table>
            <hr style="border:none;border-top:1px solid #e8e6dc;margin:24px 0;" />
            <p style="margin:0;color:#8a8880;font-size:12px;line-height:1.5;">
              If you didn't try to sign in, someone may have entered your email by mistake. You can safely ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#faf9f5;padding:24px 40px;text-align:center;">
            <p style="margin:0;color:#8a8880;font-size:11px;font-family:'Poppins',Arial,sans-serif;">
              &copy; ${new Date().getFullYear()} Concept2Cure, Inc. &middot; FDA 21 CFR Part 11 Compliant
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Welcome Email (sent on signup)
// ---------------------------------------------------------------------------

function buildWelcomeEmailHtml(name: string, loginUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Poppins',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background-color:#292524;padding:32px 40px;text-align:center;">
            ${process.env.LOGO_URL ? `<img src="${process.env.LOGO_URL}" alt="Concept2Cure" style="height:48px;width:auto;margin-bottom:12px;border-radius:8px;" />` : ''}
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;font-family:'Poppins',Arial,sans-serif;">Welcome to Concept2Cure</h1>
            <p style="margin:4px 0 0;color:#b0aea5;font-size:13px;font-family:'Poppins',Arial,sans-serif;">AI-Powered Regulatory Intelligence</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 16px;color:#292524;font-size:20px;font-weight:600;">Hi ${name},</h2>
            <p style="margin:0 0 24px;color:#4a4a68;font-size:15px;line-height:1.6;">
              Your Concept2Cure account has been created. You're now ready to transform your regulatory workflow with AI-powered intelligence.
            </p>
            <p style="margin:0 0 16px;color:#4a4a68;font-size:15px;line-height:1.6;font-weight:600;">Here's what you can do:</p>
            <ul style="margin:0 0 24px;padding-left:20px;color:#4a4a68;font-size:14px;line-height:2;">
              <li>Generate regulatory documents with AI copilot</li>
              <li>Build 510(k), CER, and eCTD submissions</li>
              <li>Run compliance analysis and audit readiness checks</li>
              <li>Connect with Veeva, Medidata, SharePoint, and more</li>
            </ul>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:8px 0 32px;">
                <a href="${loginUrl}" style="display:inline-block;background-color:#d97757;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;">
                  Sign In to Your Account
                </a>
              </td></tr>
            </table>
            <hr style="border:none;border-top:1px solid #e8e6dc;margin:24px 0;" />
            <p style="margin:0;color:#8a8880;font-size:12px;line-height:1.5;">
              For questions, contact support@concept2cure.com.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#faf9f5;padding:24px 40px;text-align:center;">
            <p style="margin:0 0 8px;color:#8a8880;font-size:11px;font-family:'Poppins',Arial,sans-serif;">
              &copy; ${new Date().getFullYear()} Concept2Cure, Inc. &middot; FDA 21 CFR Part 11 Compliant
            </p>
            <p style="margin:0;font-size:10px;">
              <a href="${process.env.APP_URL || 'https://concept2cure.com'}/concept2cure/legal/privacy" style="color:#b0aea5;text-decoration:none;">Privacy</a>
              &nbsp;&middot;&nbsp;
              <a href="${process.env.APP_URL || 'https://concept2cure.com'}/concept2cure/legal/terms" style="color:#b0aea5;text-decoration:none;">Terms</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Send a login verification code (email OTP) to the user.
 */
export async function sendLoginOtpEmail(email: string, code: string): Promise<void> {
  const transporter = getTransporter();

  if (!transporter) {
    log.warn('SMTP not configured — login OTP email not sent', { to: email });
    log.debug('Dev OTP code', { to: email, code });
    return;
  }

  await transporter.sendMail({
    from: `"Concept2Cure" <${FROM_ADDRESS}>`,
    to: email,
    subject: `${code} — Your Concept2Cure verification code`,
    text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, ignore this email.`,
    html: buildOtpEmailHtml(code),
  });

  log.info('Login OTP email sent', { to: email });
}

/**
 * Send a welcome email on new account creation.
 */
export async function sendWelcomeEmail(email: string, firstName: string): Promise<void> {
  const transporter = getTransporter();
  const loginUrl = `${process.env.APP_URL || 'https://concept2cure.com'}/concept2cure/login`;
  const name = firstName || email.split('@')[0];

  if (!transporter) {
    log.warn('SMTP not configured — welcome email not sent', { to: email });
    return;
  }

  await transporter.sendMail({
    from: `"Concept2Cure" <${FROM_ADDRESS}>`,
    to: email,
    subject: 'Welcome to Concept2Cure — Your Account is Ready',
    text: `Hi ${name},\n\nWelcome to Concept2Cure! Your account has been created.\n\nSign in: ${loginUrl}\n\n— The Concept2Cure Team`,
    html: buildWelcomeEmailHtml(name, loginUrl),
  });

  log.info('Welcome email sent', { to: email });
}

// ---------------------------------------------------------------------------
// Team Invitation Email
// ---------------------------------------------------------------------------

/**
 * Send an invitation email when an admin adds a team member.
 */
export async function sendInvitationEmail(
  email: string,
  inviterName: string,
  orgName: string
): Promise<void> {
  const transporter = getTransporter();
  const signupUrl = `${process.env.APP_URL || 'https://concept2cure.com'}/concept2cure/signup?invite=${encodeURIComponent(email)}`;

  if (!transporter) {
    log.warn('SMTP not configured — invitation email not sent', { to: email });
    return;
  }

  await transporter.sendMail({
    from: `"Concept2Cure" <${FROM_ADDRESS}>`,
    to: email,
    subject: `${inviterName} invited you to ${orgName} on Concept2Cure`,
    text: `${inviterName} has invited you to join ${orgName} on Concept2Cure.\n\nAccept invitation: ${signupUrl}\n\nThis invitation expires in 21 days.`,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Poppins',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background-color:#292524;padding:32px 40px;text-align:center;">
            ${process.env.LOGO_URL ? `<img src="${process.env.LOGO_URL}" alt="Concept2Cure" style="height:48px;width:auto;margin-bottom:12px;border-radius:8px;" />` : ''}
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;font-family:'Poppins',Arial,sans-serif;">You're Invited</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 24px;color:#4a4a68;font-size:15px;line-height:1.6;">
              <strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on Concept2Cure — an AI-powered regulatory intelligence platform for life sciences professionals.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:8px 0 24px;">
                <a href="${signupUrl}" style="display:inline-block;background-color:#d97757;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;">
                  Accept Invitation
                </a>
              </td></tr>
            </table>
            <p style="margin:0;color:#8a8880;font-size:12px;">This invitation expires in 21 days.</p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#faf9f5;padding:24px 40px;text-align:center;">
            <p style="margin:0;color:#8a8880;font-size:11px;">&copy; ${new Date().getFullYear()} Concept2Cure, Inc.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });

  log.info('Invitation email sent', { to: email });
}
