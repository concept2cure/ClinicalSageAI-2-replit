/**
 * Email Service - Password Reset Emails
 *
 * Sends password reset emails via SMTP (nodemailer).
 * Falls back to console logging when SMTP is not configured (development).
 *
 * Environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */

import nodemailer from 'nodemailer';

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
        <!-- Header -->
        <tr>
          <td style="background-color:#292524;padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">Concept2Cure</h1>
            <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">TrialSage Platform</p>
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
            <p style="margin:0;color:#9999aa;font-size:11px;">
              &copy; ${new Date().getFullYear()} Concept2Cure Inc. &middot; FDA 21 CFR Part 11 Compliant
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
  resetUrl: string,
): Promise<void> {
  const transporter = getTransporter();

  if (!transporter) {
    console.log('──────────────────────────────────────────────');
    console.log('[Email Service] SMTP not configured — logging reset link');
    console.log(`  To:    ${email}`);
    console.log(`  Token: ${resetToken}`);
    console.log(`  URL:   ${resetUrl}`);
    console.log('──────────────────────────────────────────────');
    return;
  }

  await transporter.sendMail({
    from: `"Concept2Cure" <${FROM_ADDRESS}>`,
    to: email,
    subject: 'Password Reset — Concept2Cure TrialSage',
    text: `You requested a password reset.\n\nClick the link below (expires in 1 hour):\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
    html: buildResetEmailHtml(resetUrl),
  });

  console.log(`[Email Service] Password reset email sent to ${email}`);
}
