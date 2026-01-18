import { Router } from 'express';
import axios from 'axios';
import { db } from '../db';
import { clientWorkspaceSettings, clientWorkspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

const toBase64Url = (input: string) =>
  Buffer.from(input, 'utf8').toString('base64url');

const fromBase64Url = (input: string) =>
  Buffer.from(input, 'base64url').toString('utf8');

const safeRedirect = (value?: string) => {
  if (!value) return '/client-portal/admin-settings';
  if (value.startsWith('/')) return value;
  return '/client-portal/admin-settings';
};

const ensureSettings = async (clientId: number) => {
  if (!db) {
    throw new Error('Database connection unavailable');
  }

  const [existing] = await db
    .select()
    .from(clientWorkspaceSettings)
    .where(eq(clientWorkspaceSettings.clientWorkspaceId, clientId));

  if (existing) {
    return existing;
  }

  const [clientWorkspace] = await db
    .select()
    .from(clientWorkspaces)
    .where(eq(clientWorkspaces.id, clientId));

  if (!clientWorkspace) {
    throw new Error('Client workspace not found');
  }

  const [created] = await db
    .insert(clientWorkspaceSettings)
    .values({
      clientWorkspaceId: clientId,
      organizationId: clientWorkspace.organizationId,
      generalSettings: {},
      quotaSettings: {},
      moduleSettings: {},
      integrationSettings: {},
      appearanceSettings: {},
      notificationSettings: {},
    })
    .returning();

  return created;
};

const updateIntegrationSettings = async (
  clientId: number,
  updater: (current: any) => any
) => {
  if (!db) {
    throw new Error('Database connection unavailable');
  }

  const settings = await ensureSettings(clientId);
  const current = settings.integrationSettings || {};
  const next = updater(current);

  await db
    .update(clientWorkspaceSettings)
    .set({
      integrationSettings: next,
      updatedAt: new Date(),
    })
    .where(eq(clientWorkspaceSettings.clientWorkspaceId, clientId));

  return next;
};

const buildMicrosoftAuthUrl = (params: {
  tenantId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
}) => {
  const base = `https://login.microsoftonline.com/${params.tenantId}/oauth2/v2.0/authorize`;
  const query = new URLSearchParams({
    client_id: params.clientId,
    response_type: 'code',
    redirect_uri: params.redirectUri,
    scope: params.scope,
    response_mode: 'query',
    state: params.state,
  });

  return `${base}?${query.toString()}`;
};

router.get('/:id/integrations/status', async (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (Number.isNaN(clientId)) {
      return res.status(400).json({ success: false, error: 'Invalid client id' });
    }

    const settings = await ensureSettings(clientId);
    const integration = settings.integrationSettings || {};
    const { _private, ...safeIntegration } = integration;

    res.json({ success: true, integration: safeIntegration });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load status' });
  }
});

router.post('/:id/integrations/:provider/auth-url', async (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (Number.isNaN(clientId)) {
      return res.status(400).json({ success: false, error: 'Invalid client id' });
    }

    const provider = req.params.provider;
    const settings = await ensureSettings(clientId);
    const integration = settings.integrationSettings || {};
    const redirectUri = `${req.protocol}://${req.get('host')}/api/clients/${clientId}/integrations/${provider === 'veeva' ? 'veeva' : 'microsoft'}/callback`;
    const redirect = safeRedirect(req.body?.redirect);

    if (provider === 'sharepoint' || provider === 'onedrive') {
      const tenantId =
        provider === 'sharepoint'
          ? integration.sharepointTenantId || process.env.MICROSOFT_TENANT_ID
          : integration.oneDriveTenantId || process.env.MICROSOFT_TENANT_ID;
      const clientIdValue =
        provider === 'sharepoint'
          ? integration.sharepointClientId || process.env.MICROSOFT_CLIENT_ID
          : integration.oneDriveClientId || process.env.MICROSOFT_CLIENT_ID;

      if (!tenantId || !clientIdValue) {
        return res.status(400).json({
          success: false,
          error: 'Microsoft tenant ID and client ID are required.',
        });
      }

      const scope =
        'offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Files.ReadWrite.All https://graph.microsoft.com/Sites.ReadWrite.All';
      const state = toBase64Url(
        JSON.stringify({
          clientId,
          provider,
          redirect,
        })
      );

      const authUrl = buildMicrosoftAuthUrl({
        tenantId,
        clientId: clientIdValue,
        redirectUri,
        scope,
        state,
      });

      return res.json({ success: true, authUrl });
    }

    if (provider === 'veeva') {
      const apiVersion = process.env.VEEVA_API_VERSION || 'v23.1';
      const domain = integration.veevaVaultDomain;
      const apiUrl = integration.veevaVaultApiUrl || (domain ? `https://${domain}/api/${apiVersion}` : null);
      const clientIdValue = integration.veevaVaultClientId || process.env.VEEVA_CLIENT_ID;

      if (!apiUrl || !clientIdValue) {
        return res.status(400).json({
          success: false,
          error: 'Veeva Vault API URL and client ID are required.',
        });
      }

      const scope = process.env.VEEVA_SCOPE || 'vault:docs:read vault:docs:write';
      const state = toBase64Url(
        JSON.stringify({
          clientId,
          provider,
          redirect,
        })
      );

      const authUrl = `${apiUrl}/oauth/authorize?` +
        new URLSearchParams({
          response_type: 'code',
          client_id: clientIdValue,
          redirect_uri: redirectUri,
          scope,
          state,
        }).toString();

      return res.json({ success: true, authUrl });
    }

    return res.status(400).json({ success: false, error: 'Unsupported provider' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to start auth' });
  }
});

router.get('/:id/integrations/microsoft/callback', async (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (Number.isNaN(clientId)) {
      return res.status(400).send('Invalid client id');
    }

    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) {
      return res.status(400).send('Missing authorization code or state');
    }

    const payload = JSON.parse(fromBase64Url(state));
    const provider = payload.provider as 'sharepoint' | 'onedrive';
    const redirect = safeRedirect(payload.redirect);

    const settings = await ensureSettings(clientId);
    const integration = settings.integrationSettings || {};

    const tenantId =
      provider === 'sharepoint'
        ? integration.sharepointTenantId || process.env.MICROSOFT_TENANT_ID
        : integration.oneDriveTenantId || process.env.MICROSOFT_TENANT_ID;
    const clientIdValue =
      provider === 'sharepoint'
        ? integration.sharepointClientId || process.env.MICROSOFT_CLIENT_ID
        : integration.oneDriveClientId || process.env.MICROSOFT_CLIENT_ID;
    const clientSecret =
      provider === 'sharepoint'
        ? integration.sharepointClientSecretRef || process.env.MICROSOFT_CLIENT_SECRET
        : integration.oneDriveClientSecretRef || process.env.MICROSOFT_CLIENT_SECRET;

    if (!tenantId || !clientIdValue || !clientSecret) {
      return res.status(400).send('Missing Microsoft credentials');
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/api/clients/${clientId}/integrations/microsoft/callback`;
    const scope =
      'offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Files.ReadWrite.All https://graph.microsoft.com/Sites.ReadWrite.All';

    const tokenResponse = await axios.post(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: clientIdValue,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const tokenData = tokenResponse.data;
    const expiresAt = Date.now() + tokenData.expires_in * 1000;

    await updateIntegrationSettings(clientId, current => {
      const privateBlock = current._private || {};
      const microsoft = privateBlock.microsoft || {};

      return {
        ...current,
        [`${provider}Connected`]: true,
        [`${provider}ConnectedAt`]: new Date().toISOString(),
        _private: {
          ...privateBlock,
          microsoft: {
            ...microsoft,
            [provider]: {
              accessToken: tokenData.access_token,
              refreshToken: tokenData.refresh_token,
              expiresAt,
              scope: tokenData.scope || scope,
              tenantId,
            },
          },
        },
      };
    });

    res.redirect(redirect);
  } catch (error: any) {
    res.status(500).send(error.message || 'Microsoft integration failed');
  }
});

router.get('/:id/integrations/veeva/callback', async (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (Number.isNaN(clientId)) {
      return res.status(400).send('Invalid client id');
    }

    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) {
      return res.status(400).send('Missing authorization code or state');
    }

    const payload = JSON.parse(fromBase64Url(state));
    const redirect = safeRedirect(payload.redirect);

    const settings = await ensureSettings(clientId);
    const integration = settings.integrationSettings || {};

    const apiVersion = process.env.VEEVA_API_VERSION || 'v23.1';
    const domain = integration.veevaVaultDomain;
    const apiUrl = integration.veevaVaultApiUrl || (domain ? `https://${domain}/api/${apiVersion}` : null);
    const clientIdValue = integration.veevaVaultClientId || process.env.VEEVA_CLIENT_ID;
    const clientSecret = integration.veevaVaultSecretRef || process.env.VEEVA_CLIENT_SECRET;

    if (!apiUrl || !clientIdValue || !clientSecret) {
      return res.status(400).send('Missing Veeva Vault credentials');
    }

    const tokenResponse = await axios.post(
      `${apiUrl}/oauth/token`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: clientIdValue,
        client_secret: clientSecret,
        redirect_uri: `${req.protocol}://${req.get('host')}/api/clients/${clientId}/integrations/veeva/callback`,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const tokenData = tokenResponse.data;
    const expiresAt = tokenData.expires_in
      ? Date.now() + tokenData.expires_in * 1000
      : undefined;

    await updateIntegrationSettings(clientId, current => {
      const privateBlock = current._private || {};
      return {
        ...current,
        veevaVaultConnected: true,
        veevaVaultConnectedAt: new Date().toISOString(),
        _private: {
          ...privateBlock,
          veeva: {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt,
            scope: tokenData.scope,
            apiUrl,
          },
        },
      };
    });

    res.redirect(redirect);
  } catch (error: any) {
    res.status(500).send(error.message || 'Veeva integration failed');
  }
});

export default router;
