export interface PasswordRuleStatus {
  id: string;
  label: string;
  met: boolean;
}

export const evaluatePasswordPolicy = (password: string): PasswordRuleStatus[] => [
  {
    id: 'min-length',
    label: 'At least 12 characters',
    met: password.length >= 12,
  },
  {
    id: 'uppercase',
    label: 'One uppercase letter',
    met: /[A-Z]/.test(password),
  },
  {
    id: 'lowercase',
    label: 'One lowercase letter',
    met: /[a-z]/.test(password),
  },
  {
    id: 'number',
    label: 'One number',
    met: /\d/.test(password),
  },
  {
    id: 'symbol',
    label: 'One symbol',
    met: /[^A-Za-z0-9]/.test(password),
  },
];

export const isPasswordPolicySatisfied = (password: string): boolean =>
  evaluatePasswordPolicy(password).every(rule => rule.met);
