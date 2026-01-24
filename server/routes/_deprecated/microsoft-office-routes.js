/**
 * Microsoft Office Integration API
 *
 * This module provides the backend support for Microsoft Office integration,
 * handling authentication, file operations, and Office embedding.
 */

import express from 'express';
import axios from 'axios';
import { db } from '../db.js';
const router = express.Router();

// Microsoft Graph API base URL
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * Get Microsoft authentication URL
 */
router.get('/auth-url', (req, res) => {
  try {
    // Get configuration from environment variables
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const tenantId = process.env.MICROSOFT_TENANT_ID;

    if (!clientId || !tenantId) {
      return res.status(500).json({ error: 'Microsoft authentication not configured' });
    }

    // Create redirect URI
    const redirectUri = `${req.protocol}://${req.get('host')}/auth-callback`;

    // Define required scopes for Office integration
    const scopes = [
      'User.Read',
      'Files.ReadWrite.All',
      'Sites.ReadWrite.All',
      'offline_access',
    ].join(' ');

    // Create Microsoft OAuth URL
    const authUrl =
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
      `client_id=${clientId}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `response_mode=query&` +
      `state=${Math.random().toString(36).substring(2, 15)}`;

    res.json({ authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate authentication URL' });
  }
});

/**
 * Exchange authorization code for tokens
 */
router.post('/token', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Get configuration from environment variables
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const tenantId = process.env.MICROSOFT_TENANT_ID;

    if (!clientId || !clientSecret || !tenantId) {
      return res.status(500).json({ error: 'Microsoft authentication not configured' });
    }

    // Create redirect URI - must match the one used for authorization
    const redirectUri = `${req.protocol}://${req.get('host')}/auth-callback`;

    // Exchange code for tokens
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    params.append('grant_type', 'authorization_code');

    const response = await axios.post(tokenUrl, params);

    // Return tokens to client
    res.json(response.data);
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    res.status(500).json({ error: 'Failed to exchange code for token' });
  }
});

/**
 * Refresh access token
 */
router.post('/refresh-token', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    // Get configuration from environment variables
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const tenantId = process.env.MICROSOFT_TENANT_ID;

    if (!clientId || !clientSecret || !tenantId) {
      return res.status(500).json({ error: 'Microsoft authentication not configured' });
    }

    // Refresh the token
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('refresh_token', refresh_token);
    params.append('grant_type', 'refresh_token');

    const response = await axios.post(tokenUrl, params);

    // Return new tokens to client
    res.json(response.data);
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

/**
 * Get current user information
 */
router.get('/me', async (req, res) => {
  try {
    // Get access token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access token is required' });
    }

    const token = authHeader.substring(7);

    // Get user information from Microsoft Graph
    const response = await axios.get(`${GRAPH_API_BASE}/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error getting user information:', error);
    res.status(500).json({ error: 'Failed to get user information' });
  }
});

/**
 * Get document from vault and create or retrieve Microsoft Graph file
 */
router.get('/document/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get access token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access token is required' });
    }

    const token = authHeader.substring(7);

    // Get document from vault
    const document = await db.query('SELECT * FROM documents WHERE id = $1', [id]);

    if (!document.rows.length) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = document.rows[0];

    // Check if document already has a Microsoft Graph file ID
    if (doc.ms_graph_file_id) {
      // Document already has a Microsoft Graph file, return it
      return res.json({
        document: doc,
        graphFileUrl: `${GRAPH_API_BASE}/me/drive/items/${doc.ms_graph_file_id}`,
      });
    }

    // Document doesn't have a Microsoft Graph file, create one

    // First, check if user's OneDrive has TrialSage folder
    let folderResponse;
    try {
      folderResponse = await axios.get(`${GRAPH_API_BASE}/me/drive/root:/TrialSage`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (err) {
      // Folder doesn't exist, create it
      folderResponse = await axios.post(
        `${GRAPH_API_BASE}/me/drive/root/children`,
        {
          name: 'TrialSage',
          folder: {},
          '@microsoft.graph.conflictBehavior': 'rename',
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const folderId = folderResponse.data.id;

    // Create file in OneDrive
    const fileResponse = await axios.post(
      `${GRAPH_API_BASE}/me/drive/items/${folderId}/children`,
      {
        name: `${doc.name || 'Document'}.docx`,
        file: {},
        '@microsoft.graph.conflictBehavior': 'rename',
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const fileId = fileResponse.data.id;

    // Upload content to file
    await axios.put(`${GRAPH_API_BASE}/me/drive/items/${fileId}/content`, doc.content || '', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    });

    // Update document with Microsoft Graph file ID
    await db.query('UPDATE documents SET ms_graph_file_id = $1 WHERE id = $2', [fileId, id]);

    // Return document with Microsoft Graph file URL
    res.json({
      document: {
        ...doc,
        ms_graph_file_id: fileId,
      },
      graphFileUrl: `${GRAPH_API_BASE}/me/drive/items/${fileId}`,
    });
  } catch (error) {
    console.error('Error getting document:', error);
    res.status(500).json({ error: 'Failed to get document' });
  }
});

export default router;
