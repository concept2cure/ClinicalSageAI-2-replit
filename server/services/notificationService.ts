import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function notifyUpload(userEmail: string, docId: string) {
  await transporter.sendMail({
    from: '"TrialSage Vault" <noreply@yourdomain.com>',
    to: userEmail,
    subject: 'New document ingested',
    text: `Your document (ID: ${docId}) was successfully processed and is ready for review.`,
  });
}
