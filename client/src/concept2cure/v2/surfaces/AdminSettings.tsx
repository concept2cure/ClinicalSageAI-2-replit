/**
 * Admin and access → Settings, and the SSO tab's door to the Identity console.
 *
 * Setup folded into Admin and access (D2, 2026-10-29; founder direction: "most
 * 'app' into core functionality"; .design/client-journey/FUNCTION_PARITY.md,
 * "Into administration (`admin-console`) / From `setup`";
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-setup/). Each of Setup's governed
 * settings is its existing card, mounted here, with its own read and its own
 * governed write — nothing is re-implemented:
 *
 *   OrganizationProfileCard   name and client type, under one reason
 *   SessionPolicySetting      idle sign-out and concurrent sessions, under a reason
 *                             (it replaces the read-only "Session timeout" row
 *                             GET /api/mdx/admin used to serve)
 *   GatewayAccountsSetting    whose agency gateway account submissions go out under
 *   PdfARequirementSetting    whether production submissions must be PDF/A
 *   RetentionPeriodCard       the Vault's retention period
 *   LegalHoldsCard            list, place and lift legal holds
 *   ClaudeConnectorSetting    the connector for Claude (already here)
 *   CompanyDocumentSettings   company identity, letterhead and legal documents (already here)
 *
 * Above them, the rows GET /api/mdx/admin derives from the organisation's
 * record (the second factor at sign-in, single sign-on, branding) are shown as
 * they are. They are facts here; the cards are where settings change.
 */
import React from 'react';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { ClaudeConnectorSetting } from './ClaudeConnectorSetting';
import { CompanyDocumentSettings } from './CompanyDocumentSettings';
import { GatewayAccountsSetting } from './GatewayAccountsSetting';
import { LegalHoldsCard } from './LegalHoldsCard';
import { OrganizationProfileCard, saveFailure, type OrganizationProfileContext } from './OrganizationProfileCard';
import { PdfARequirementSetting } from './PdfARequirementSetting';
import { RetentionPeriodCard } from './RetentionPeriodCard';
import { SessionPolicySetting } from '../onboarding/SessionPolicySetting';
import '../styles/translation-v2.css';

/** A row of GET /api/mdx/admin's settings facet. `kind: 'policy'` is a fact about the deployment. */
export interface AdminSettingRow {
  id: string;
  label: string;
  value: string;
  kind?: string;
  desc: string;
}

/** The question the Settings tab hands AnA; AnA answers from admin-console's published context. */
export const SUMMARISE_CONFIGURATION = 'Summarize my org configuration';

interface CardsProps {
  onNav: (id: string) => void;
  /** What the Profile card lets AnA be told; null when it unmounts. */
  onProfileContext?: (context: OrganizationProfileContext | null) => void;
}

/** Every governed organisation setting, each its own card with its own read and write. */
export function OrganizationSettingsCards({ onNav, onProfileContext }: CardsProps) {
  return (
    <div className="txw-settings">
      <OrganizationProfileCard onContext={onProfileContext} />
      <SessionPolicySetting />
      {/* Agency gateway accounts: the platform's or the organisation's own, per
          gateway and environment (D7, founder decision 2026-10-01). */}
      <GatewayAccountsSetting />
      {/* PDF/A only where this organisation's procedures require it (D7, decided 2026-10-01). */}
      <PdfARequirementSetting />
      {/* Records retention (P1-22; ADR-0014 §6): its own route and its own chained audit row. */}
      <RetentionPeriodCard describeFailure={saveFailure} />
      <LegalHoldsCard describeFailure={saveFailure} />
      {/* Its own read and its own door, for the owner or an administrator (P1-47). */}
      <ClaudeConnectorSetting />
      <CompanyDocumentSettings onNav={onNav} />
    </div>
  );
}

interface TabProps extends CardsProps {
  settings: AdminSettingRow[];
  /** The settings facet's read failed on the server (meta.unavailable). */
  settingsDown: boolean;
  onRetry: () => void;
  onAsk?: (text: string) => void;
}

/** The Settings tab: the record's rows as they are, then the governed cards. */
export function AdminSettingsTab({ settings, settingsDown, onRetry, onNav, onAsk, onProfileContext }: TabProps) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>Org settings</h2>
        <span className="section-sub">
          Each card below reads its setting and changes it under a reason, written to the audit trail.
        </span>
        {onAsk && (
          <button type="button" className="btn ghost small adm-key-create" onClick={() => onAsk(SUMMARISE_CONFIGURATION)}>
            {I.sparkles} Ask AnA to summarise this configuration
          </button>
        )}
      </div>
      {settingsDown && (
        <div className="adm-facet-error">
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load org settings"
            hint="The organization's settings could not be read, so single sign-on and branding are not shown. Each card below reads its own setting."
            retry={onRetry}
          />
        </div>
      )}
      {settings.length > 0 && (
        <div className="adm-settings">
          {/* Slice 0: each row sent AnA "Change setting …"; no AnA tool changes an
              organization setting, so a row shows the value and offers nothing. */}
          {settings.map((s) => (
            <div key={s.id} className="adm-setting adm-setting-fixed">
              <div>
                <div className="adm-setting-label">{s.label}</div>
                <div className="adm-setting-desc">{s.desc}</div>
              </div>
              <div className="adm-setting-val">
                <span>{s.value}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <OrganizationSettingsCards onNav={onNav} onProfileContext={onProfileContext} />
    </section>
  );
}

/** The SSO tab's door: SAML, SCIM tokens and the SCIM IP allowlist are governed in the Identity console. */
export function IdentityConsoleDoor({ onNav }: { onNav: (id: string) => void }) {
  return (
    <section className="section" aria-label="Identity console">
      <div className="section-head">
        <h2>Identity console</h2>
        <span className="section-sub">
          SAML endpoints, SCIM provisioning tokens and the SCIM IP allowlist are governed there, not here. A
          switch on this page would be a second copy of that state with nothing to reconcile it.
        </span>
        <button type="button" className="btn ghost small adm-key-create" onClick={() => onNav('identity-console')}>
          {I.lock} Open Identity console
        </button>
      </div>
    </section>
  );
}
