import React, { useRef, useState } from 'react';
import { AccountPanel } from '../AccountPanel';
import { useLiveData } from '../dataConnect';
import { DiscoveryQuestions } from './DiscoveryQuestions';
import type { useOnboardingDiscovery } from '../useOnboardingDiscovery';
import { useAuthUser } from '@/services/portal/authService';
import { SessionPolicySetting } from '../onboarding/SessionPolicySetting';

interface AccountSession {
  authenticated?: boolean;
  user?: { mfaEnabled?: boolean; mustChangePassword?: boolean; signing?: { authenticatorRequired?: boolean } };
}

function accountSecurityText(session: ReturnType<typeof useLiveData<AccountSession>>) {
  if (session.loading) return 'Reading your account…';
  if (session.data?.authenticated !== true || typeof session.data.user?.mfaEnabled !== 'boolean') return 'Could not verify account security.';
  return session.data.user.mfaEnabled ? 'Enrolled.' : 'Not enrolled. Sign-in uses an email code.';
}

function needsAuthenticator(account: AccountSession['user']) {
  return account?.signing?.authenticatorRequired && !account.mfaEnabled;
}

function AccountSecurityStatus({ session }: { session: ReturnType<typeof useLiveData<AccountSession>> }) {
  const accountKnown = session.data?.authenticated === true && typeof session.data.user?.mfaEnabled === 'boolean';
  const account = session.data?.user;
  return <>
    <div className="ob-rev-row">
      <span className="k">Your authenticator app</span>
      <span className="v">{accountSecurityText(session)}</span>
    </div>
    {accountKnown && account?.mustChangePassword && <p className="scaf-note">Your account requires a password change. Complete it in Account.</p>}
    {accountKnown && needsAuthenticator(account) && <p className="scaf-note">This account needs an authenticator app for electronic signatures.</p>}
    {(session.error || (!session.loading && !accountKnown)) && <p className="scaf-note" role="status">Open Account to read and configure your security before relying on it.</p>}
  </>;
}

/** Requested controls and observed account security are intentionally separate records. */
export function OnboardingSecurity({ discovery, onNav }: {
  discovery: ReturnType<typeof useOnboardingDiscovery>;
  onNav: (id: string) => void;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const accountButton = useRef<HTMLButtonElement>(null);
  const user = useAuthUser();
  const admin = user?.roles?.some(role => ['admin', 'owner', 'super_admin', 'platform_admin', 'business_admin'].includes(String(role).toLowerCase())) ?? false;
  const [refresh, setRefresh] = useState(0);
  const session = useLiveData<AccountSession>(
    '/api/v1/auth/session', [refresh],
  );
  return (
    <div>
      <DiscoveryQuestions discovery={discovery} section="security" />
      <div className="ob-discovery-summary">
        <div className="pj-seclbl">Account and administrator setup</div>
        <AccountSecurityStatus session={session} />
        <div className="ob-discovery-actions">
          <button ref={accountButton} type="button" className="sp-ask" onClick={() => setAccountOpen(true)}>Open Account and security</button>
          <button type="button" className="sp-ask" onClick={() => setRefresh((v) => v + 1)} disabled={session.loading}>Recheck account</button>
        </div>
        <p className="scaf-note">Account includes password and authenticator setup, membership invitations, and your personal reporting role.</p>
        {admin && <SessionPolicySetting />}
        <div className="ob-discovery-actions">
          <button type="button" className="sp-ask" onClick={() => onNav('setup')}>Organization setup</button>
          <button type="button" className="sp-ask" onClick={() => onNav('admin-console')}>Roles and access</button>
          {discovery.answers.securityNeeds.includes('sso') && <button type="button" className="sp-ask" onClick={() => onNav('identity-console')}>Identity configuration</button>}
        </div>
        <p className="scaf-note">Opening organization, access or identity setup saves any changed discovery answers first. Other wizard choices are saved during activation. Organization and identity configuration require the appropriate administrator role. Retention, residency and SSO requirements need administrator review.</p>
      </div>
      {accountOpen && <AccountPanel onClose={() => { setAccountOpen(false); setRefresh((v) => v + 1); accountButton.current?.focus(); }} />}
    </div>
  );
}
