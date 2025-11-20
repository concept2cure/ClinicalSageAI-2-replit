/**
 * Microsoft Graph API Integration
 *
 * Production-grade Microsoft Graph API endpoints for OneDrive file access
 * This replaces mock implementations with real Microsoft 365 integration
 */

import express from 'express';
import axios from 'axios';
const router = express.Router();

// Microsoft Graph API Configuration
const MICROSOFT_CONFIG = {
  clientId: process.env.MICROSOFT_CLIENT_ID || process.env.AZURE_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET,
  tenantId: process.env.MICROSOFT_TENANT_ID || process.env.AZURE_TENANT_ID || 'common',
  redirectUri:
    process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:5000/auth/microsoft/callback',
  scope:
    'https://graph.microsoft.com/Files.Read https://graph.microsoft.com/Files.Read.All https://graph.microsoft.com/Sites.Read.All https://graph.microsoft.com/User.Read',
  graphApiUrl: 'https://graph.microsoft.com/v1.0',
  authority: 'https://login.microsoftonline.com',
};

/**
 * Exchange authorization code for access token
 */
router.post('/token', async (req, res) => {
  try {
    const { code, state } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code is required',
      });
    }

    // Exchange code for access token
    const tokenResponse = await axios.post(
      `${MICROSOFT_CONFIG.authority}/${MICROSOFT_CONFIG.tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: MICROSOFT_CONFIG.clientId,
        client_secret: MICROSOFT_CONFIG.clientSecret,
        code: code,
        redirect_uri: MICROSOFT_CONFIG.redirectUri,
        grant_type: 'authorization_code',
        scope: MICROSOFT_CONFIG.scope,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const tokenData = tokenResponse.data;

    // Store token securely (in production, use secure session storage)
    req.session.microsoftToken = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      expires_at: Date.now() + tokenData.expires_in * 1000,
      scope: tokenData.scope,
    };

    res.json({
      success: true,
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
    });
  } catch (error) {
    console.error(
      '❌ Microsoft Graph token exchange error:',
      error.response?.data || error.message
    );
    res.status(500).json({
      success: false,
      message: 'Failed to exchange authorization code for access token',
      error: error.response?.data?.error_description || error.message,
    });
  }
});

/**
 * Get OneDrive files using Microsoft Graph API
 */
router.get('/onedrive/files', async (req, res) => {
  try {
    const { folderId = 'root', search } = req.query;

    // Get access token from session
    const tokenData = req.session.microsoftToken;
    if (!tokenData || Date.now() >= tokenData.expires_at) {
      return res.status(401).json({
        success: false,
        message: 'Microsoft Graph access token expired or not found',
        requiresAuth: true,
      });
    }

    let graphUrl = `${MICROSOFT_CONFIG.graphApiUrl}/me/drive/items/${folderId}/children`;

    // Add search if provided
    if (search) {
      graphUrl = `${MICROSOFT_CONFIG.graphApiUrl}/me/drive/search(q='${encodeURIComponent(search)}')`;
    }

    // Query Microsoft Graph API
    const response = await axios.get(graphUrl, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const files = response.data.value.map(item => ({
      id: item.id,
      name: item.name,
      type: item.folder ? 'folder' : 'file',
      size: item.size,
      lastModified: item.lastModifiedDateTime,
      downloadUrl: item['@microsoft.graph.downloadUrl'],
      webUrl: item.webUrl,
      mimeType: item.file?.mimeType,
      isDocument:
        item.file &&
        (item.name.endsWith('.pdf') ||
          item.name.endsWith('.docx') ||
          item.name.endsWith('.doc') ||
          item.name.endsWith('.txt') ||
          item.name.endsWith('.xml')),
      metadata: {
        createdBy: item.createdBy?.user?.displayName,
        lastModifiedBy: item.lastModifiedBy?.user?.displayName,
        parentReference: item.parentReference,
      },
    }));

    // Filter for regulatory documents if not searching
    const documentFiles = search
      ? files
      : files.filter(file => file.type === 'folder' || file.isDocument);

    res.json({
      success: true,
      data: {
        files: documentFiles,
        totalCount: documentFiles.length,
        currentFolder: folderId,
        hasMore: response.data['@odata.nextLink'] ? true : false,
      },
    });
  } catch (error) {
    console.error(
      '❌ Microsoft Graph OneDrive files error:',
      error.response?.data || error.message
    );

    if (error.response?.status === 401) {
      return res.status(401).json({
        success: false,
        message: 'Microsoft Graph authentication expired',
        requiresAuth: true,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to fetch OneDrive files',
      error: error.response?.data?.error?.message || error.message,
    });
  }
});

/**
 * Download OneDrive file content
 */
router.get('/onedrive/files/:fileId/content', async (req, res) => {
  try {
    const { fileId } = req.params;

    // Get access token from session
    const tokenData = req.session.microsoftToken;
    if (!tokenData || Date.now() >= tokenData.expires_at) {
      return res.status(401).json({
        success: false,
        message: 'Microsoft Graph access token expired or not found',
        requiresAuth: true,
      });
    }

    // Get file metadata first
    const fileResponse = await axios.get(
      `${MICROSOFT_CONFIG.graphApiUrl}/me/drive/items/${fileId}`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const fileMetadata = fileResponse.data;

    // Get download URL
    const downloadUrl = fileMetadata['@microsoft.graph.downloadUrl'];
    if (!downloadUrl) {
      return res.status(400).json({
        success: false,
        message: 'File download URL not available',
      });
    }

    // Download file content
    const contentResponse = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
    });

    res.json({
      success: true,
      data: {
        fileId: fileId,
        fileName: fileMetadata.name,
        mimeType: fileMetadata.file?.mimeType,
        size: fileMetadata.size,
        content: Buffer.from(contentResponse.data).toString('base64'),
        lastModified: fileMetadata.lastModifiedDateTime,
      },
    });
  } catch (error) {
    console.error('❌ Microsoft Graph file download error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to download file content',
      error: error.response?.data?.error?.message || error.message,
    });
  }
});

/**
 * Refresh Microsoft Graph access token
 */
router.post('/refresh-token', async (req, res) => {
  try {
    const tokenData = req.session.microsoftToken;

    if (!tokenData || !tokenData.refresh_token) {
      return res.status(401).json({
        success: false,
        message: 'No refresh token available',
        requiresAuth: true,
      });
    }

    // Refresh the access token
    const refreshResponse = await axios.post(
      `${MICROSOFT_CONFIG.authority}/${MICROSOFT_CONFIG.tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: MICROSOFT_CONFIG.clientId,
        client_secret: MICROSOFT_CONFIG.clientSecret,
        refresh_token: tokenData.refresh_token,
        grant_type: 'refresh_token',
        scope: MICROSOFT_CONFIG.scope,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const newTokenData = refreshResponse.data;

    // Update stored token
    req.session.microsoftToken = {
      access_token: newTokenData.access_token,
      refresh_token: newTokenData.refresh_token || tokenData.refresh_token,
      expires_in: newTokenData.expires_in,
      expires_at: Date.now() + newTokenData.expires_in * 1000,
      scope: newTokenData.scope,
    };

    res.json({
      success: true,
      access_token: newTokenData.access_token,
      expires_in: newTokenData.expires_in,
    });
  } catch (error) {
    console.error('❌ Microsoft Graph token refresh error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh access token',
      error: error.response?.data?.error_description || error.message,
      requiresAuth: true,
    });
  }
});

/**
 * Get user profile information
 */
router.get('/user/profile', async (req, res) => {
  try {
    const tokenData = req.session.microsoftToken;
    if (!tokenData || Date.now() >= tokenData.expires_at) {
      return res.status(401).json({
        success: false,
        message: 'Microsoft Graph access token expired or not found',
        requiresAuth: true,
      });
    }

    const userResponse = await axios.get(`${MICROSOFT_CONFIG.graphApiUrl}/me`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const user = userResponse.data;

    res.json({
      success: true,
      data: {
        id: user.id,
        displayName: user.displayName,
        email: user.mail || user.userPrincipalName,
        jobTitle: user.jobTitle,
        department: user.department,
        companyName: user.companyName,
        businessPhones: user.businessPhones,
        country: user.country,
      },
    });
  } catch (error) {
    console.error('❌ Microsoft Graph user profile error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile',
      error: error.response?.data?.error?.message || error.message,
    });
  }
});

/**
 * Microsoft OAuth callback handler
 */
router.get('/callback', (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error('❌ Microsoft OAuth error:', error, error_description);
    return res.redirect(`/auth/error?error=${encodeURIComponent(error_description || error)}`);
  }

  if (code) {
    // Redirect to frontend with authorization code
    res.redirect(`/regulatory-intelligence-hub?auth_code=${code}&state=${state || ''}`);
  } else {
    res.redirect('/auth/error?error=no_authorization_code');
  }
});

/**
 * Get Microsoft Graph authentication URL
 */
router.get('/auth-url', (req, res) => {
  const state = req.query.state || 'regulatory-intelligence-hub';

  const authUrl =
    `${MICROSOFT_CONFIG.authority}/${MICROSOFT_CONFIG.tenantId}/oauth2/v2.0/authorize?` +
    `client_id=${MICROSOFT_CONFIG.clientId}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(MICROSOFT_CONFIG.redirectUri)}&` +
    `scope=${encodeURIComponent(MICROSOFT_CONFIG.scope)}&` +
    `response_mode=query&` +
    `state=${encodeURIComponent(state)}`;

  res.json({
    success: true,
    authUrl: authUrl,
    redirectUri: MICROSOFT_CONFIG.redirectUri,
  });
});

export default router;
