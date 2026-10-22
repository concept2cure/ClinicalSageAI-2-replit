/** Discover only the administrator-provided slug, then use the canonical SAML browser handoff. */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { computeRedirect } from '../../auth/redirectUtils';
import styles from './styles.module.css';

export function OrganizationSso({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation('auth');
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState('');
  const [configured, setConfigured] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);
  useEffect(() => () => { requestVersion.current += 1; }, []);
  const lookup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || disabled) return;
    const organization = slug.trim();
    if (!/^[a-z0-9_-]{1,128}$/i.test(organization)) {
      setError(t('sso.invalidIdentifier', { defaultValue: 'Enter the organization identifier provided by your administrator.' }));
      return;
    }
    const version = ++requestVersion.current;
    setBusy(true); setConfigured(null); setError('');
    try {
      const response = await fetch(`/api/auth/sso/saml/configuration?org=${encodeURIComponent(organization)}`, { credentials: 'same-origin', cache: 'no-store' });
      const body = await response.json();
      if (version !== requestVersion.current) return;
      if (response.ok && body.success === true && body.configured === true && body.provider === 'saml' && body.organization === organization) {
        setConfigured(organization);
      } else {
        setError(response.status === 404
          ? t('sso.notConfigured', { defaultValue: 'Organization SSO is not configured for this identifier. Ask your administrator or sign in with your account.' })
          : t('sso.unavailable', { defaultValue: 'Organization SSO could not be checked. Try again.' }));
      }
    } catch {
      if (version === requestVersion.current) setError(t('sso.unavailable', { defaultValue: 'Organization SSO could not be checked. Try again.' }));
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  };
  const handoff = configured ? `/api/auth/sso/saml/initiate?${new URLSearchParams({ org: configured, returnTo: computeRedirect() })}` : '';
  return (
    <div className={styles.ssoSection}>
      <button type="button" className={styles.ghost} aria-expanded={open} aria-controls="organization-sso" disabled={disabled || busy} onClick={() => setOpen(value => !value)}>
        {t('sso.open', { defaultValue: 'Use organization SSO' })}
      </button>
      {open && <form id="organization-sso" className={styles.form} onSubmit={lookup}>
        <p className={styles.hint}>{t('sso.hint', { defaultValue: 'Use the organization identifier provided by your administrator. You will continue through your organization’s identity provider, then verify your account.' })}</p>
        <div className={styles.field}>
          <label htmlFor="sso-organization" className={styles.label}>{t('sso.identifier', { defaultValue: 'Organization identifier' })}</label>
          <input id="sso-organization" className={styles.input} value={slug} autoComplete="off" maxLength={128} disabled={disabled || busy} onChange={event => {
            requestVersion.current += 1; setSlug(event.target.value); setConfigured(null); setError(''); setBusy(false);
          }} />
        </div>
        {error && <p className={styles.alert} role="alert">{error}</p>}
        {configured && !disabled
          ? <a className={styles.primary} href={handoff}>{t('sso.continue', { defaultValue: 'Continue with SSO' })}</a>
          : <button type="submit" className={styles.primary} disabled={disabled || busy}>{t('sso.find', { defaultValue: 'Find organization SSO' })}</button>}
      </form>}
    </div>
  );
}
