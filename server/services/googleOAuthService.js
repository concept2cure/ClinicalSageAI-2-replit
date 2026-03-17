/**
 * Google OAuth Service for Google Docs Integration
 * Handles OAuth 2.0 flow for accessing Google Docs API
 */

import { google } from 'googleapis';
import { db } from '../db.js';
import { coauthorDocuments, integrationTokens } from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';

// OAuth2 configuration
const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

// Get OAuth2 client
export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/coauthor/google/callback';

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Get authorization URL for user consent
 */
export function getAuthorizationUrl(state) {
  const oauth2Client = getOAuth2Client();
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: state, // Pass state for CSRF protection
    prompt: 'consent' // Force consent to get refresh token
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokensFromCode(code) {
  const oauth2Client = getOAuth2Client();
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    
    return {
      tokens,
      userInfo: {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture
      }
    };
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    throw new Error('Failed to exchange authorization code');
  }
}

/**
 * Store or update user tokens in database
 */
export async function storeTokens(organizationId, userId, tokens, userInfo) {
  try {
    // Check if tokens already exist
    const existing = await db
      .select()
      .from(integrationTokens)
      .where(and(
        eq(integrationTokens.organizationId, organizationId),
        eq(integrationTokens.userId, userId),
        eq(integrationTokens.provider, 'google')
      ))
      .limit(1);

    // Correctly handle expiry_date - it's already an absolute timestamp if present
    const tokenData = {
      organizationId,
      userId,
      provider: 'google',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expiry_date 
        ? new Date(tokens.expiry_date) 
        : new Date(Date.now() + (tokens.expires_in * 1000)),
      metadata: {
        scope: tokens.scope,
        tokenType: tokens.token_type,
        userInfo: userInfo
      },
      updatedAt: new Date()
    };

    if (existing.length > 0) {
      // Update existing tokens
      await db
        .update(integrationTokens)
        .set(tokenData)
        .where(eq(integrationTokens.id, existing[0].id));
    } else {
      // Insert new tokens
      await db
        .insert(integrationTokens)
        .values({
          ...tokenData,
          createdAt: new Date()
        });
    }

    return { success: true };
  } catch (error) {
    console.error('Error storing tokens:', error);
    throw new Error('Failed to store authentication tokens');
  }
}

/**
 * Get authenticated client for a user
 */
export async function getAuthenticatedClient(organizationId, userId) {
  try {
    // Get stored tokens
    const [tokenRecord] = await db
      .select()
      .from(integrationTokens)
      .where(and(
        eq(integrationTokens.organizationId, organizationId),
        eq(integrationTokens.userId, userId),
        eq(integrationTokens.provider, 'google')
      ))
      .limit(1);

    if (!tokenRecord) {
      throw new Error('No Google authentication found. Please connect your Google account first.');
    }

    const oauth2Client = getOAuth2Client();
    
    // Set credentials
    oauth2Client.setCredentials({
      access_token: tokenRecord.accessToken,
      refresh_token: tokenRecord.refreshToken
    });

    // Check if token is expired
    const now = new Date();
    if (tokenRecord.expiresAt < now) {
      // Refresh the token
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      // Update stored tokens - correctly handle expiry_date
      await db
        .update(integrationTokens)
        .set({
          accessToken: credentials.access_token,
          expiresAt: credentials.expiry_date 
            ? new Date(credentials.expiry_date)
            : new Date(Date.now() + (credentials.expires_in * 1000)),
          updatedAt: new Date()
        })
        .where(eq(integrationTokens.id, tokenRecord.id));
      
      oauth2Client.setCredentials(credentials);
    }

    return oauth2Client;
  } catch (error) {
    console.error('Error getting authenticated client:', error);
    throw error;
  }
}

/**
 * Create a new Google Doc
 */
export async function createGoogleDoc(organizationId, userId, title, content = '') {
  const auth = await getAuthenticatedClient(organizationId, userId);
  const docs = google.docs({ version: 'v1', auth });
  
  try {
    // Create document
    const { data: doc } = await docs.documents.create({
      requestBody: {
        title: title
      }
    });

    // If content is provided, insert it
    if (content) {
      const requests = [{
        insertText: {
          location: { index: 1 },
          text: content
        }
      }];

      await docs.documents.batchUpdate({
        documentId: doc.documentId,
        requestBody: { requests }
      });
    }

    return {
      documentId: doc.documentId,
      title: doc.title,
      revisionId: doc.revisionId,
      url: `https://docs.google.com/document/d/${doc.documentId}/edit`
    };
  } catch (error) {
    console.error('Error creating Google Doc:', error);
    throw new Error('Failed to create Google Doc');
  }
}

/**
 * Get Google Doc content
 */
export async function getGoogleDocContent(organizationId, userId, documentId) {
  const auth = await getAuthenticatedClient(organizationId, userId);
  const docs = google.docs({ version: 'v1', auth });
  
  try {
    const { data: doc } = await docs.documents.get({
      documentId: documentId
    });

    // Extract text content
    let content = '';
    const extractText = (element) => {
      if (element.paragraph) {
        element.paragraph.elements.forEach(el => {
          if (el.textRun) {
            content += el.textRun.content;
          }
        });
      }
    };

    if (doc.body && doc.body.content) {
      doc.body.content.forEach(extractText);
    }

    return {
      documentId: doc.documentId,
      title: doc.title,
      content: content,
      revisionId: doc.revisionId,
      lastModified: doc.revisionId // Google doesn't provide modification time directly
    };
  } catch (error) {
    console.error('Error getting Google Doc:', error);
    throw new Error('Failed to retrieve Google Doc');
  }
}

/**
 * Update Google Doc content
 */
export async function updateGoogleDoc(organizationId, userId, documentId, content, replaceAll = false) {
  const auth = await getAuthenticatedClient(organizationId, userId);
  const docs = google.docs({ version: 'v1', auth });
  
  try {
    let requests = [];

    if (replaceAll) {
      // Get current document to find content range
      const { data: doc } = await docs.documents.get({ documentId });
      const endIndex = doc.body.content[doc.body.content.length - 1].endIndex || 1;

      requests = [
        {
          deleteContentRange: {
            range: {
              startIndex: 1,
              endIndex: endIndex - 1
            }
          }
        },
        {
          insertText: {
            location: { index: 1 },
            text: content
          }
        }
      ];
    } else {
      // Append content
      requests = [{
        insertText: {
          location: { index: 1 },
          text: content
        }
      }];
    }

    const { data: result } = await docs.documents.batchUpdate({
      documentId: documentId,
      requestBody: { requests }
    });

    return {
      success: true,
      documentId: documentId,
      replies: result.replies
    };
  } catch (error) {
    console.error('Error updating Google Doc:', error);
    throw new Error('Failed to update Google Doc');
  }
}

/**
 * List user's Google Docs
 */
export async function listGoogleDocs(organizationId, userId, query = '') {
  const auth = await getAuthenticatedClient(organizationId, userId);
  const drive = google.drive({ version: 'v3', auth });
  
  try {
    let q = "mimeType='application/vnd.google-apps.document'";
    if (query) {
      q += ` and name contains '${query}'`;
    }

    const { data } = await drive.files.list({
      q: q,
      fields: 'files(id, name, modifiedTime, createdTime, webViewLink)',
      orderBy: 'modifiedTime desc',
      pageSize: 100
    });

    return data.files.map(file => ({
      documentId: file.id,
      title: file.name,
      url: file.webViewLink,
      modifiedTime: file.modifiedTime,
      createdTime: file.createdTime
    }));
  } catch (error) {
    console.error('Error listing Google Docs:', error);
    throw new Error('Failed to list Google Docs');
  }
}

/**
 * Check if user has Google authentication
 */
export async function hasGoogleAuth(organizationId, userId) {
  const tokens = await db
    .select()
    .from(integrationTokens)
    .where(and(
      eq(integrationTokens.organizationId, organizationId),
      eq(integrationTokens.userId, userId),
      eq(integrationTokens.provider, 'google')
    ))
    .limit(1);

  return tokens.length > 0;
}

/**
 * Revoke Google authentication
 */
export async function revokeGoogleAuth(organizationId, userId) {
  try {
    // Get tokens
    const [tokenRecord] = await db
      .select()
      .from(integrationTokens)
      .where(and(
        eq(integrationTokens.organizationId, organizationId),
        eq(integrationTokens.userId, userId),
        eq(integrationTokens.provider, 'google')
      ))
      .limit(1);

    if (tokenRecord) {
      // Revoke token with Google
      const oauth2Client = getOAuth2Client();
      oauth2Client.setCredentials({
        access_token: tokenRecord.accessToken,
        refresh_token: tokenRecord.refreshToken
      });
      
      await oauth2Client.revokeCredentials();

      // Delete from database
      await db
        .delete(integrationTokens)
        .where(eq(integrationTokens.id, tokenRecord.id));
    }

    return { success: true };
  } catch (error) {
    console.error('Error revoking Google auth:', error);
    throw new Error('Failed to revoke Google authentication');
  }
}

export default {
  getAuthorizationUrl,
  getTokensFromCode,
  storeTokens,
  getAuthenticatedClient,
  createGoogleDoc,
  getGoogleDocContent,
  updateGoogleDoc,
  listGoogleDocs,
  hasGoogleAuth,
  revokeGoogleAuth
};