/**
 * SignupVerifyStep — what the sign-up form shows once the account exists and
 * is waiting on its e-mail link (security audit 2026-09-24, IAM-17; plan P1-2).
 * The form no longer hands out a session at this point; the person opens the
 * link, then signs in.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface SignupVerifyStepProps {
  email: string;
  /** Ask the server to send the link again. Resolves when the request is answered, whatever the answer. */
  onResend: () => Promise<void>;
  onSignIn: () => void;
  /** Seconds before the link may be requested again (default 60). */
  cooldownSeconds?: number;
}

export const SignupVerifyStep: React.FC<SignupVerifyStepProps> = ({ email, onResend, onSignIn, cooldownSeconds = 60 }) => {
  const { t } = useTranslation('auth');
  const [remaining, setRemaining] = useState(cooldownSeconds);
  const [sending, setSending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = window.setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => window.clearTimeout(id);
  }, [remaining]);

  const resend = async () => {
    if (remaining > 0 || sending) return;
    setSending(true);
    try {
      await onResend();
      setResent(true);
    } finally {
      setSending(false);
      setRemaining(cooldownSeconds);
    }
  };

  return (
    <div className="text-center space-y-6" role="status" aria-live="polite">
      <div className="space-y-2">
        <h3 className="text-base font-medium text-stone-900">{t('signup.verify.title')}</h3>
        <p className="text-stone-600">{t('signup.verify.body', { email })}</p>
      </div>
      <p className="text-sm text-stone-600">{t('signup.verify.validity')}</p>
      {resent && <p className="text-sm text-stone-700">{t('signup.verify.resent')}</p>}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => void resend()}
          disabled={remaining > 0 || sending}
          className="w-full py-3 px-4 text-base font-medium text-stone-800 bg-white border border-stone-200 hover:bg-stone-50 rounded-xl transition-all duration-150 disabled:opacity-50"
        >
          {remaining > 0 ? t('signup.verify.resendIn', { count: remaining }) : t('signup.verify.resend')}
        </button>
        <button
          type="button"
          onClick={onSignIn}
          className="w-full py-3 px-4 text-base font-medium text-white bg-stone-800 hover:bg-stone-900 rounded-xl transition-all duration-150"
        >
          {t('signup.verify.signIn')}
        </button>
      </div>
    </div>
  );
};

export default SignupVerifyStep;
