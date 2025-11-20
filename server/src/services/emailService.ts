// Optional nodemailer import - gracefully degrades if not available
let nodemailer: any = null;
let nodemailerLoaded = false;

async function loadNodemailer() {
  if (nodemailerLoaded) return nodemailer;
  
  try {
    const module = await import('nodemailer');
    nodemailer = module.default;
    nodemailerLoaded = true;
  } catch (e) {
    // nodemailer not available - email features will be disabled
    console.log('[EMAIL] nodemailer not available - email features disabled');
    nodemailer = null;
    nodemailerLoaded = true;
  }
  return nodemailer;
}

let cachedTransporter: any = null;

export async function createTransporter(): Promise<any> {
  const nm = await loadNodemailer();
  
  // If nodemailer not available, return null
  if (!nm) {
    return null;
  }
  
  // Return cached transporter if available
  if (cachedTransporter) {
    return cachedTransporter;
  }

  // Check if SMTP configuration is available
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, MAIL_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log('[EMAIL] SMTP not configured - skipping email setup');
    return null;
  }

  try {
    const config = {
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587'),
      secure: SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
    };

    cachedTransporter = nodemailer.createTransport(config);

    // Verify connection configuration
    if (cachedTransporter) {
      cachedTransporter.verify(error => {
        if (error) {
          console.error('[EMAIL] SMTP verification failed:', error);
          cachedTransporter = null;
        } else {
          console.log('[EMAIL] SMTP server ready for email notifications');
        }
      });
    }

    return cachedTransporter;
  } catch (error) {
    console.error('[EMAIL] Failed to create transporter:', error);
    return null;
  }
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  priority?: 'high' | 'normal' | 'low';
}): Promise<boolean> {
  const transporter = createTransporter();
  if (!transporter) {
    console.log('[EMAIL] Transporter not available, skipping email');
    return false;
  }

  try {
    const result = await transporter.sendMail({
      from: process.env.MAIL_FROM || 'noreply@trialsage.com',
      ...options,
    });

    console.log(`[EMAIL] Sent successfully: ${result.messageId}`);
    return true;
  } catch (error) {
    console.error('[EMAIL] Send failed:', error);
    return false;
  }
}
