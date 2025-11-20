import crypto from 'crypto';

export function hashApproval(payload: any) {
  const s = JSON.stringify(payload || {});
  return crypto.createHash('sha256').update(s).digest('hex');
}
