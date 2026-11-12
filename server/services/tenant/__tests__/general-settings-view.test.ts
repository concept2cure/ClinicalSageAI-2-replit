/**
 * What a settings read returns, and to whom (role walk, 2026-11-12).
 *
 * GET /api/organizations/:id/settings answered every member and viewer with the stored settings less three
 * internal keys: an integration's API key, webhook URL or client secret, and the network allowlist, were readable
 * by any role, and by AnA's settings read. generalSettingsView is the one view both use.
 */
import { describe, expect, it } from 'vitest';
import { generalSettingsView } from '../tenant-settings-writer';

const stored = {
  general: { organizationName: 'Bright Bio' },
  security: { sessionTimeoutMinutes: 30, passwordPolicy: { minLength: 12 }, ipWhitelist: ['203.0.113.7'], ipRestrictions: ['203.0.113.0/24'] },
  integrations: {
    docusign: { enabled: true, apiKey: 'dsk-live-1234567890' },
    slack: { enabled: true, webhookUrl: 'https://hooks.slack.example/services/T0/B0/secret' },
    microsoftOffice: { enabled: false, tenantId: 'tenant-guid', clientId: 'client-guid', clientSecret: 'ms-secret', accessToken: '' },
  },
  companyDocuments: { letterhead: {} },
};

describe('generalSettingsView', () => {
  it('never returns a stored credential, to an administrator either: the field stays, empty, and says one is stored', () => {
    const view = generalSettingsView(stored) as typeof stored & Record<string, any>;
    const text = JSON.stringify(view);
    for (const secret of ['dsk-live-1234567890', 'hooks.slack.example', 'ms-secret']) expect(text).not.toContain(secret);
    expect(view.integrations.docusign).toEqual({ enabled: true, apiKey: '', apiKeyConfigured: true });
    expect(view.integrations.slack).toEqual({ enabled: true, webhookUrl: '', webhookUrlConfigured: true });
    // An identifier is not a credential; an empty credential is not "configured".
    expect(view.integrations.microsoftOffice).toEqual({ enabled: false, tenantId: 'tenant-guid', clientId: 'client-guid', clientSecret: '', clientSecretConfigured: true, accessToken: '' });
  });

  it('gives an administrator the network posture and the policies; a policy object under a credential-like name is read as it is', () => {
    expect((generalSettingsView(stored) as typeof stored).security).toEqual(stored.security);
  });

  it('gives a reader who is not an administrator the settings their screens read, without integrations or the allowlist', () => {
    const view = generalSettingsView(stored, { administrator: false });
    expect(view.general).toEqual(stored.general);
    expect(view.security).toEqual({ sessionTimeoutMinutes: 30, passwordPolicy: { minLength: 12 } });
    expect(view).not.toHaveProperty('integrations');
    expect(JSON.stringify(view)).not.toContain('203.0.113');
  });

  it('still withholds the project-scoped and custody settings from every reader, and does not change what is stored', () => {
    expect(generalSettingsView(stored)).not.toHaveProperty('companyDocuments');
    expect(stored.integrations.docusign.apiKey).toBe('dsk-live-1234567890');
  });
});
