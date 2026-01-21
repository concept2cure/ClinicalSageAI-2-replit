import crypto from 'crypto';

export const calculateHash = (buffer: Buffer): string => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

export const redactPHI = (text: string): string => {
  let cleaned = text.replace(/\d{3}-\d{2}-\d{4}/g, '[REDACTED-SSN]');
  cleaned = cleaned.replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, '[REDACTED-DATE]');
  cleaned = cleaned.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    '[REDACTED-EMAIL]'
  );
  return cleaned;
};
