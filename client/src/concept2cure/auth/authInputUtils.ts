import type { MfaMethod } from '@/services/portal/authService';

export const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const MFA_METHOD_LABELS: Record<MfaMethod['type'], string> = {
  totp: 'Authenticator app',
  sms: 'SMS',
  email: 'Email code',
  hardware_key: 'Security key',
  biometric: 'Biometric',
  backup_code: 'Recovery code',
};

export const getMfaMethodLabel = (type: MfaMethod['type']): string =>
  MFA_METHOD_LABELS[type] || type.replace('_', ' ');
