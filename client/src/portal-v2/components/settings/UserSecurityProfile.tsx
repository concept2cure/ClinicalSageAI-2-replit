import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Shield,
  Smartphone,
  User,
} from 'lucide-react';
import {
  authService,
  type AuthSession,
  type MfaMethod,
  type PasswordChangeRequest,
} from '../../services/authService';

type SecurityPreferences = {
  allowSessionPersistence: boolean;
  notifyOnNewSignIn: boolean;
  strictSessionTimeout: boolean;
  maskSensitiveFieldsByDefault: boolean;
};

const SECURITY_PREFS_KEY = 'client_portal_security_preferences_v1';

function sanitizeName(value: string): string {
  return value.replace(/[^a-zA-Z\s'.-]/g, '').replace(/\s{2,}/g, ' ').trim().slice(0, 64);
}

function sanitizePhone(value: string): string {
  return value.replace(/[^\d+()\-\s]/g, '').trim().slice(0, 24);
}

function loadPreferences(): SecurityPreferences {
  try {
    const raw = localStorage.getItem(SECURITY_PREFS_KEY);
    if (!raw) {
      return {
        allowSessionPersistence: false,
        notifyOnNewSignIn: true,
        strictSessionTimeout: true,
        maskSensitiveFieldsByDefault: true,
      };
    }

    const parsed = JSON.parse(raw) as Partial<SecurityPreferences>;
    return {
      allowSessionPersistence: Boolean(parsed.allowSessionPersistence),
      notifyOnNewSignIn: parsed.notifyOnNewSignIn !== false,
      strictSessionTimeout: parsed.strictSessionTimeout !== false,
      maskSensitiveFieldsByDefault: parsed.maskSensitiveFieldsByDefault !== false,
    };
  } catch {
    return {
      allowSessionPersistence: false,
      notifyOnNewSignIn: true,
      strictSessionTimeout: true,
      maskSensitiveFieldsByDefault: true,
    };
  }
}

function savePreferences(preferences: SecurityPreferences): void {
  localStorage.setItem(SECURITY_PREFS_KEY, JSON.stringify(preferences));
}

const UserSecurityProfile: React.FC = () => {
  const queryClient = useQueryClient();
  const user = authService.getUser();
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpBootstrap, setTotpBootstrap] = useState<{ qrCode: string; secret: string } | null>(null);
  const [preferences, setPreferences] = useState<SecurityPreferences>(() => loadPreferences());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetFeedback = () => {
    setErrorMessage(null);
    setStatusMessage(null);
  };

  const passwordPolicyChecks = useMemo(
    () => ({
      length: newPassword.length >= 12,
      upper: /[A-Z]/.test(newPassword),
      lower: /[a-z]/.test(newPassword),
      number: /\d/.test(newPassword),
      symbol: /[^A-Za-z0-9]/.test(newPassword),
    }),
    [newPassword]
  );

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: async () => {
      const result = await authService.getSessions();
      return result.success && result.data ? result.data : [];
    },
  });

  const { data: mfaMethods = [], isLoading: mfaLoading } = useQuery({
    queryKey: ['auth', 'mfa-methods'],
    queryFn: async () => {
      const result = await authService.getMfaMethods();
      return result.success && result.data ? result.data : [];
    },
  });

  const updateProfile = useMutation({
    mutationFn: async () => {
      const result = await authService.updateProfile({
        firstName: sanitizeName(firstName),
        lastName: sanitizeName(lastName),
      });
      if (!result.success) throw new Error(result.error?.message || 'Failed to update profile');
      return result;
    },
    onSuccess: () => setStatusMessage('Profile updated securely.'),
    onError: (error: Error) => setErrorMessage(error.message),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) {
        throw new Error('New password and confirmation must match.');
      }
      const isStrong = Object.values(passwordPolicyChecks).every(Boolean);
      if (!isStrong) {
        throw new Error('Password does not meet minimum complexity requirements.');
      }
      const payload: PasswordChangeRequest = {
        currentPassword,
        newPassword,
        terminateOtherSessions: true,
      };
      const result = await authService.changePassword(payload);
      if (!result.success) throw new Error(result.error?.message || 'Failed to change password');
      return result;
    },
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setStatusMessage('Password changed and other sessions revoked.');
    },
    onError: (error: Error) => setErrorMessage(error.message),
  });

  const revokeSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const result = await authService.terminateSession(sessionId);
      if (!result.success) throw new Error(result.error?.message || 'Unable to revoke session');
      return result;
    },
    onSuccess: async () => {
      setStatusMessage('Session revoked.');
      await queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
  });

  const revokeOtherSessions = useMutation({
    mutationFn: async () => {
      const result = await authService.terminateAllOtherSessions();
      if (!result.success) throw new Error(result.error?.message || 'Unable to revoke other sessions');
      return result;
    },
    onSuccess: async () => {
      setStatusMessage('All other sessions revoked.');
      await queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
  });

  const enableTotp = useMutation({
    mutationFn: async () => {
      if (!/^\d{6}$/.test(totpCode)) {
        throw new Error('Authenticator code must be a 6-digit number.');
      }
      const result = await authService.verifyTotpSetup(totpCode);
      if (!result.success) throw new Error(result.error?.message || 'MFA verification failed');
      return result;
    },
    onSuccess: async () => {
      setTotpCode('');
      setTotpBootstrap(null);
      setStatusMessage('MFA configured successfully.');
      await queryClient.invalidateQueries({ queryKey: ['auth', 'mfa-methods'] });
    },
    onError: (error: Error) => setErrorMessage(error.message),
  });

  const disableMfa = useMutation({
    mutationFn: async (method: MfaMethod['type']) => {
      const enabledMethods = mfaMethods.filter(item => item.isEnabled);
      if (enabledMethods.length <= 1) {
        throw new Error('At least one MFA method must remain enabled.');
      }
      const result = await authService.disableMfaMethod(method);
      if (!result.success) throw new Error(result.error?.message || 'Unable to disable MFA method');
      return result;
    },
    onSuccess: async () => {
      setStatusMessage('MFA method disabled.');
      await queryClient.invalidateQueries({ queryKey: ['auth', 'mfa-methods'] });
    },
    onError: (error: Error) => setErrorMessage(error.message),
  });

  const bootstrapTotp = useMutation({
    mutationFn: async () => {
      const result = await authService.setupTotp();
      if (!result.success || !result.data) {
        throw new Error(result.error?.message || 'Unable to initiate TOTP setup');
      }
      return result.data;
    },
    onSuccess: data => {
      setTotpBootstrap(data);
      setStatusMessage('Scan QR code with your authenticator app, then verify with a 6-digit code.');
    },
    onError: (error: Error) => setErrorMessage(error.message),
  });

  const isMfaEnabled = useMemo(() => mfaMethods.some(m => m.isEnabled), [mfaMethods]);

  const persistPreferences = () => {
    const sanitizedPhone = sanitizePhone(phone);
    setPhone(sanitizedPhone);
    savePreferences(preferences);
    setStatusMessage('Security preferences saved locally for this browser.');
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Client Profile & Security</h1>
          <p className="mt-1 text-sm text-stone-500">
            Manage account identity, authentication, and active sessions using secure defaults.
          </p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2 text-xs text-stone-600">
          <div className="flex items-center gap-2 font-medium">
            <Shield className="h-4 w-4 text-stone-700" /> Security posture
          </div>
          <div className="mt-1">{isMfaEnabled ? 'Strong (MFA enabled)' : 'Moderate (enable MFA)'}</div>
        </div>
      </header>

      {statusMessage && (
        <div className="rounded-lg border border-stone-200 bg-stone-100 px-4 py-3 text-sm text-stone-800">
          {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div className="rounded-lg border border-stone-200 bg-stone-100 px-4 py-3 text-sm text-stone-800">
          {errorMessage}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-stone-900">
            <User className="h-5 w-5" /> Identity
          </h2>
          <div className="space-y-3">
            <input
              value={firstName}
              onChange={e => setFirstName(sanitizeName(e.target.value))}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="First name"
            />
            <input
              value={lastName}
              onChange={e => setLastName(sanitizeName(e.target.value))}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Last name"
            />
            <input
              value={phone}
              onChange={e => setPhone(sanitizePhone(e.target.value))}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Phone (optional)"
            />
            <button
              onClick={() => updateProfile.mutate()}
              disabled={updateProfile.isPending}
              className="inline-flex items-center rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save profile
            </button>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-stone-900">
            <Lock className="h-5 w-5" /> Password hardening
          </h2>
          <div className="space-y-3">
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Current password"
              autoComplete="current-password"
            />
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              onFocus={resetFeedback}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="New password (12+ chars)"
              autoComplete="new-password"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              onFocus={resetFeedback}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Confirm new password"
              autoComplete="new-password"
            />
            <ul className="rounded-md border bg-stone-50 p-2 text-xs text-stone-600">
              <li className={passwordPolicyChecks.length ? 'text-stone-800' : ''}>• 12+ characters</li>
              <li className={passwordPolicyChecks.upper ? 'text-stone-800' : ''}>• One uppercase letter</li>
              <li className={passwordPolicyChecks.lower ? 'text-stone-800' : ''}>• One lowercase letter</li>
              <li className={passwordPolicyChecks.number ? 'text-stone-800' : ''}>• One number</li>
              <li className={passwordPolicyChecks.symbol ? 'text-stone-800' : ''}>• One special symbol</li>
            </ul>
            <button
              onClick={() => changePassword.mutate()}
              disabled={changePassword.isPending}
              className="inline-flex items-center rounded-md bg-stone-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <KeyRound className="mr-2 h-4 w-4" /> Rotate password & revoke sessions
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-stone-900">
            <Smartphone className="h-5 w-5" /> Multi-factor authentication
          </h2>
          {mfaLoading ? (
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading MFA methods...
            </div>
          ) : (
            <>
              <ul className="mb-3 space-y-2 text-sm">
                {mfaMethods.length === 0 && (
                  <li className="rounded-md border border-stone-200 bg-stone-100 px-3 py-2 text-stone-800">
                    <AlertTriangle className="mr-2 inline h-4 w-4" /> No MFA methods are enrolled.
                  </li>
                )}
                {mfaMethods.map(method => (
                  <li key={method.type} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span>
                      {method.type} {method.isPrimary ? '(primary)' : ''}
                    </span>
                    {method.isEnabled ? (
                      <button
                        onClick={() => disableMfa.mutate(method.type)}
                        className="text-xs font-medium text-stone-700"
                      >
                        Disable
                      </button>
                    ) : (
                      <span className="text-xs text-stone-500">Disabled</span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => bootstrapTotp.mutate()}
                  className="rounded-md border border-stone-200 bg-stone-100 px-3 py-2 text-sm font-medium text-stone-800"
                >
                  Start TOTP setup
                </button>
              </div>
              {totpBootstrap && (
                <div className="rounded-md border bg-stone-50 p-3 text-xs text-stone-700">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium">TOTP Secret</span>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(totpBootstrap.secret);
                          setStatusMessage('TOTP secret copied to clipboard.');
                        } catch {
                          setErrorMessage('Unable to copy automatically. Please copy the secret manually.');
                        }
                      }}
                      className="inline-flex items-center gap-1 text-xs text-stone-600 hover:text-stone-900"
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                  </div>
                  <p className="mb-2 break-all rounded bg-white p-2 font-mono">{totpBootstrap.secret}</p>
                  <a
                    href={totpBootstrap.qrCode}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-stone-700 hover:underline"
                  >
                    Open QR code <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit authenticator code"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
                <button
                  onClick={() => enableTotp.mutate()}
                  className="rounded-md bg-stone-800 px-3 py-2 text-sm font-medium text-white"
                >
                  Verify
                </button>
              </div>
            </>
          )}
        </div>

        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-stone-900">
            <Clock className="h-5 w-5" /> Security preferences
          </h2>
          <div className="space-y-3 text-sm">
            <label className="flex items-center justify-between rounded border px-3 py-2">
              Allow persistent sign-in on this device
              <input
                type="checkbox"
                checked={preferences.allowSessionPersistence}
                onChange={e =>
                  setPreferences(prev => ({ ...prev, allowSessionPersistence: e.target.checked }))
                }
              />
            </label>
            <label className="flex items-center justify-between rounded border px-3 py-2">
              Notify on new sign-in
              <input
                type="checkbox"
                checked={preferences.notifyOnNewSignIn}
                onChange={e =>
                  setPreferences(prev => ({ ...prev, notifyOnNewSignIn: e.target.checked }))
                }
              />
            </label>
            <label className="flex items-center justify-between rounded border px-3 py-2">
              Strict session timeout behavior
              <input
                type="checkbox"
                checked={preferences.strictSessionTimeout}
                onChange={e =>
                  setPreferences(prev => ({ ...prev, strictSessionTimeout: e.target.checked }))
                }
              />
            </label>
            <label className="flex items-center justify-between rounded border px-3 py-2">
              Mask sensitive fields by default
              <input
                type="checkbox"
                checked={preferences.maskSensitiveFieldsByDefault}
                onChange={e =>
                  setPreferences(prev => ({ ...prev, maskSensitiveFieldsByDefault: e.target.checked }))
                }
              />
            </label>
            <button
              onClick={persistPreferences}
              className="rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white"
            >
              Save preferences
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-stone-900">
            <LogOut className="h-5 w-5" /> Active sessions
          </h2>
          <button
            onClick={() => revokeOtherSessions.mutate()}
            className="rounded-md border border-stone-200 bg-stone-100 px-3 py-2 text-sm font-medium text-stone-800"
          >
            Revoke all other sessions
          </button>
        </div>

        {sessionsLoading ? (
          <div className="text-sm text-stone-500">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="rounded-md border border-stone-200 bg-stone-100 px-3 py-2 text-sm text-stone-800">
            No active sessions were returned.
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((session: AuthSession) => (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium text-stone-900">
                    {session.deviceInfo.name} • {session.deviceInfo.browser} on {session.deviceInfo.os}
                  </div>
                  <div className="text-stone-500">{session.ipAddress}</div>
                </div>
                {session.isCurrent ? (
                  <span className="inline-flex items-center gap-1 text-stone-800">
                    <CheckCircle2 className="h-4 w-4" /> Current
                  </span>
                ) : (
                  <button
                    onClick={() => revokeSession.mutate(session.id)}
                    disabled={revokeSession.isPending}
                    className="text-stone-700 hover:underline"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default UserSecurityProfile;
