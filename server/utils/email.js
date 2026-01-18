import nodemailer from 'nodemailer';

const createTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    auth: { user, pass },
  });
};

const sendEmail = async ({ to, subject, html }) => {
  const transporter = createTransporter();
  if (!transporter) {
    console.log('📧 Email skipped (SMTP not configured):', { to, subject });
    return;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'Concept2Cure <noreply@concept2cure.com>',
    to,
    subject,
    html,
  });
};

export async function sendWelcomeEmail(userEmail, orgName, tempPassword) {
  const portalUrl = process.env.CLIENT_URL || process.env.APP_URL || 'http://localhost:5173';
  await sendEmail({
    to: userEmail,
    subject: 'Welcome to Concept2Cure - Account Created',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
        <h1 style="color: #2563eb;">Welcome to Concept2Cure!</h1>
        <p>Your account for <strong>${orgName}</strong> has been created.</p>
        <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Temporary Password:</strong> ${tempPassword}</p>
          <p><strong>Login URL:</strong> <a href="${portalUrl}/login">${portalUrl}/login</a></p>
        </div>
        <p>Please change your password after first login.</p>
      </div>
    `,
  });
}

export async function sendApprovalEmail(adminEmail, { org, user }) {
  const portalUrl = process.env.CLIENT_URL || process.env.APP_URL || 'http://localhost:5173';
  await sendEmail({
    to: adminEmail,
    subject: `New Access Request: ${org.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
        <h1>New Access Request</h1>
        <p><strong>Company:</strong> ${org.name}</p>
        <p><strong>Industry:</strong> ${org.settings?.industry || 'Unknown'}</p>
        <p><strong>Admin:</strong> ${user.name} (${user.email})</p>
        <div style="margin: 24px 0;">
          <a href="${portalUrl}/admin/onboarding" style="background:#2563eb;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px;">
            Review in Admin Portal
          </a>
        </div>
        <p>Use Case: ${org.settings?.useCase || 'Not provided'}</p>
      </div>
    `,
  });
}

export async function sendRequestConfirmation(userEmail, name) {
  await sendEmail({
    to: userEmail,
    subject: 'Access Request Received - Concept2Cure',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h1>Hi ${name},</h1>
        <p>We have received your access request.</p>
        <p>Our team will review it within 24 hours and notify you once approved.</p>
      </div>
    `,
  });
}

export async function sendApprovalNotification(userEmail, orgName) {
  const portalUrl = process.env.CLIENT_URL || process.env.APP_URL || 'http://localhost:5173';
  await sendEmail({
    to: userEmail,
    subject: `Access Approved - ${orgName}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
        <h1 style="color: #2563eb;">You're approved to join ${orgName}</h1>
        <p>Your request has been approved. You can now sign in to the Concept2Cure portal.</p>
        <div style="margin: 24px 0;">
          <a href="${portalUrl}/login" style="background:#059669;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px;">
            Sign in to Concept2Cure
          </a>
        </div>
        <p>If you need help getting started, reply to this email or reach out to support.</p>
      </div>
    `,
  });
}
