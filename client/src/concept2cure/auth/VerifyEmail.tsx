/**
 * VerifyEmail — the page the sign-up e-mail's link opens (security audit
 * 2026-09-24, IAM-17; plan P1-2).
 *
 * The token arrives in the URL fragment, is dropped from the address bar
 * before anything else, and is posted to POST /api/auth/verify-email. The page
 * says one of three things: confirming, confirmed (sign in), or the link is not
 * valid (request a new one by e-mail address). It never signs the person in:
 * the link proves the address, the password and second factor prove the person.
 */
import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';

import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

type State = 'verifying' | 'done' | 'failed' | 'missing';

/** The token in `#token=` (preferred) or `?token=`; null when neither is there. */
export function tokenFromLocation(hash: string, search: string): string | null {
  const fromHash = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  const fromSearch = new URLSearchParams(search).get('token');
  const token = fromHash || fromSearch || '';
  return /^[A-Za-z0-9._-]{20,4096}$/.test(token) ? token : null;
}

export const VerifyEmail: React.FC = () => {
  const [, setLocation] = useLocation();
  const { t } = useTranslation('auth');
  const [state, setState] = useState<State>('verifying');
  const [email, setEmail] = useState('');
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = tokenFromLocation(window.location.hash, window.location.search);
    window.history.replaceState(null, '', window.location.pathname);
    if (!token) {
      setState('missing');
      return;
    }
    let cancelled = false;
    void fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(res => {
        if (!cancelled) setState(res.ok ? 'done' : 'failed');
      })
      .catch(() => {
        if (!cancelled) setState('failed');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const requestNewLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      /* the answer is the same either way: the page says a link is on its way if the address qualifies */
    } finally {
      setBusy(false);
      setRequested(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf9f5] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
        <div className="w-full max-w-lg">
          <div className="flex justify-end mb-2">
            <LanguageSwitcher variant="auth" />
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-8 text-center space-y-6" role="status" aria-live="polite">
            <h1 className="text-base font-semibold text-stone-900">{t('verifyEmail.title')}</h1>
            {state === 'verifying' && <p className="text-stone-600">{t('verifyEmail.verifying')}</p>}
            {state === 'done' && (
              <>
                <p className="text-stone-600">{t('verifyEmail.done')}</p>
                <button
                  type="button"
                  onClick={() => setLocation('/concept2cure/login')}
                  className="w-full py-3 px-4 text-base font-medium text-white bg-stone-800 hover:bg-stone-900 rounded-xl transition-all duration-150"
                >
                  {t('verifyEmail.signIn')}
                </button>
              </>
            )}
            {(state === 'failed' || state === 'missing') && (
              <>
                <p className="text-stone-600">{t('verifyEmail.failed')}</p>
                {requested ? (
                  <p className="text-sm text-stone-600">{t('verifyEmail.requested')}</p>
                ) : (
                  <form onSubmit={requestNewLink} className="space-y-3 text-left">
                    <label className="block text-sm font-medium text-stone-700" htmlFor="verify-email-address">
                      {t('verifyEmail.emailLabel')}
                    </label>
                    <input
                      id="verify-email-address"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
                    />
                    <button
                      type="submit"
                      disabled={busy || !email.trim()}
                      className="w-full py-3 px-4 text-base font-medium text-white bg-stone-800 hover:bg-stone-900 rounded-xl transition-all duration-150 disabled:opacity-50"
                    >
                      {t('verifyEmail.requestNew')}
                    </button>
                  </form>
                )}
                <button type="button" onClick={() => setLocation('/concept2cure/login')} className="text-sm text-blue-600 hover:text-stone-700 font-medium">
                  {t('verifyEmail.signIn')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
