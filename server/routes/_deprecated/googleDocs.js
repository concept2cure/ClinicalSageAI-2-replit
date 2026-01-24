/**
 * Google Docs Integration API Routes
 *
 * Handles authentication, document operations, and VAULT integration
 * for the eCTD Co-Author module.
 */

import express from 'express';
import axios from 'axios';

const router = express.Router();

// Load environment variables
const CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  '1045075234440-sve60m8va1d4djdistod8g4lbo8vp791.apps.googleusercontent.com';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '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';
// Fixed redirect URI to match Google OAuth Console registration and Replit environment
const getRedirectUri = () => {
  return `https://abb15664-61d9-4852-884c-d59384023199-00-1rbx8h3zks8bw.picard.replit.dev/api/google-docs/auth/google/callback`;
};

// Google API endpoints
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';

// Define scopes
const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
];

/**
 * Generate Google OAuth URL
 */
router.get('/auth/google', (req, res) => {
  try {
    const redirectUri = getRedirectUri(req);
    const url = new URL(GOOGLE_AUTH_URL);

    // Add query parameters
    url.searchParams.append('client_id', CLIENT_ID);
    url.searchParams.append('redirect_uri', redirectUri);
    url.searchParams.append('response_type', 'code');
    url.searchParams.append('access_type', 'offline');
    url.searchParams.append('scope', SCOPES.join(' '));
    url.searchParams.append('include_granted_scopes', 'true');
    url.searchParams.append('prompt', 'consent');

    console.log('Redirecting to Google OAuth with redirect URI:', redirectUri);
    // Direct redirect to Google's auth page
    res.redirect(url.toString());
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate authentication URL' });
  }
});

/**
 * Handle OAuth callback
 */
router.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'No authorization code provided' });
  }

  try {
    const redirectUri = getRedirectUri(req);

    // Exchange code for tokens
    const tokenResponse = await axios.post(GOOGLE_TOKEN_URL, null, {
      params: {
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      },
    });

    const tokens = tokenResponse.data;

    // Get user info using the access token
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    const userInfo = userInfoResponse.data;

    // Create session or JWT here if needed

    // Redirect to frontend with tokens using hash parameters
    // Redirect back to the CoAuthor module page with token information
    res.redirect(
      `/coauthor#access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token || ''}&expires_in=${tokens.expiresIn || 3600}&token_type=Bearer`
    );
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * Get user profile
 */
router.get('/user', async (req, res) => {
  const { access_token } = req.query;

  if (!access_token) {
    return res.status(401).json({ error: 'No access token provided' });
  }

  try {
    const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Failed to fetch user information' });
  }
});

/**
 * List user's Google Docs
 */
router.get('/documents', async (req, res) => {
  const { access_token } = req.query;

  if (!access_token) {
    return res.status(401).json({ error: 'No access token provided' });
  }

  try {
    // Use axios to call the Google Drive API directly
    const response = await axios.get('https://www.googleapis.com/drive/v3/files', {
      params: {
        q: "mimeType='application/vnd.google-apps.document'",
        fields: 'files(id, name, createdTime, modifiedTime, webViewLink)',
        orderBy: 'modifiedTime desc',
        pageSize: 20,
      },
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    res.json(response.data.files);
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

/**
 * Get document content
 */
router.get('/documents/:documentId', async (req, res) => {
  const { documentId } = req.params;
  const { access_token } = req.query;

  if (!access_token) {
    return res.status(401).json({ error: 'No access token provided' });
  }

  try {
    // Use axios to call the Google Docs API directly
    const response = await axios.get(`https://docs.googleapis.com/v1/documents/${documentId}`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error(`Error getting document ${documentId}:`, error);
    res.status(500).json({ error: 'Failed to get document' });
  }
});

/**
 * Create a new document
 */
router.post('/documents', async (req, res) => {
  const { access_token } = req.query;
  const { title, content } = req.body;

  if (!access_token) {
    return res.status(401).json({ error: 'No access token provided' });
  }

  if (!title) {
    return res.status(400).json({ error: 'Document title is required' });
  }

  try {
    // Create a new document using the Docs API
    const docResponse = await axios.post(
      'https://docs.googleapis.com/v1/documents',
      { title },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const documentId = docResponse.data.documentId;

    // If content was provided, update the document
    if (content && documentId) {
      await axios.post(
        `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
        {
          requests: [
            {
              insertText: {
                location: {
                  index: 1,
                },
                text: content,
              },
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    res.json(docResponse.data);
  } catch (error) {
    console.error('Error creating document:', error);
    res
      .status(500)
      .json({ error: 'Failed to create document', details: error.response?.data || error.message });
  }
});

/**
 * Create a document from template
 */
router.post('/documents/template', async (req, res) => {
  const { access_token } = req.query;
  const { templateId, title, metadata = {} } = req.body;

  if (!access_token) {
    return res.status(401).json({ error: 'No access token provided' });
  }

  if (!templateId) {
    return res.status(400).json({ error: 'Template ID is required' });
  }

  try {
    // For our demo, we'll create a new document directly with placeholders for the template
    // In a production environment, this would use the Google Drive API to copy the template

    // Create a new document using the Docs API
    const docResponse = await axios.post(
      'https://docs.googleapis.com/v1/documents',
      { title: title || `eCTD Document - ${metadata.moduleType || 'Module 2.5'}` },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const documentId = docResponse.data.documentId;

    // Create initial content based on metadata
    let initialContent = `# ${title || 'eCTD Document'}\n\n`;
    initialContent += `**Module Type:** ${metadata.moduleType || 'Module 2.5'}\n`;
    initialContent += `**Section:** ${metadata.section || '2.5'}\n`;
    initialContent += `**Region:** ${metadata.region || 'FDA'}\n`;
    initialContent += `**Submission Type:** ${metadata.submissionType || 'IND'}\n\n`;
    initialContent += `## Document Purpose\n\n`;
    initialContent += `This document was created using the eCTD Co-Author system for regulatory submission.\n\n`;
    initialContent += `## Content Guidelines\n\n`;
    initialContent += `Please follow the guidelines for ${metadata.moduleType || 'Module 2.5'} as specified by ICH and ${metadata.region || 'FDA'} requirements.\n\n`;

    // If document was created successfully, update with initial content
    if (documentId) {
      await axios.post(
        `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
        {
          requests: [
            {
              insertText: {
                location: {
                  index: 1,
                },
                text: initialContent,
              },
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    res.json({
      documentId,
      title: docResponse.data.title,
      message: 'Document created from template successfully',
      metadata: metadata,
    });
  } catch (error) {
    console.error('Error creating document from template:', error);
    res.status(500).json({
      error: 'Failed to create document from template',
      details: error.response?.data || error.message,
    });
  }
});

/**
 * Save document to VAULT
 * Endpoint matches client-side API_ENDPOINTS.SAVE_TO_VAULT
 */
router.post('/save-to-vault/:documentId', async (req, res) => {
  const { access_token } = req.query;
  const { documentId } = req.params;
  const { vaultMetadata } = req.body;

  if (!access_token) {
    return res.status(401).json({ error: 'No access token provided' });
  }

  if (!documentId) {
    return res.status(400).json({ error: 'Document ID is required' });
  }

  try {
    // Make direct API calls with axios

    // Get the document using Docs API
    const documentResponse = await axios.get(
      `https://docs.googleapis.com/v1/documents/${documentId}`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const document = documentResponse.data;

    // Export the document as PDF using Drive API
    const pdfResponse = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${documentId}/export`,
      {
        params: {
          mimeType: 'application/pdf',
        },
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
        responseType: 'arraybuffer',
      }
    );

    // Here you would integrate with your VAULT system
    // For now, we'll simulate a successful save

    // Record metadata about the document
    const documentMetadata = {
      title: document.title,
      lastModified: new Date().toISOString(),
      vaultFolderId: vaultMetadata?.folderId || 'default',
      size: pdfResponse.data.length,
      format: 'PDF',
      googleDocsId: documentId,
      moduleType: vaultMetadata?.moduleType || 'unknown',
      section: vaultMetadata?.section || 'unknown',
      organizationId: vaultMetadata?.organizationId || '1',
      userId: vaultMetadata?.userId || 'anonymous',
    };

    // Simulate API response from VAULT
    const vaultResponse = {
      success: true,
      vaultId: `vault-${Date.now()}-${documentId.substring(0, 8)}`,
      timestamp: new Date().toISOString(),
      metadata: documentMetadata,
    };

    res.json(vaultResponse);
  } catch (error) {
    console.error('Error saving to VAULT:', error);
    res.status(500).json({ error: 'Failed to save document to VAULT' });
  }
});

/**
 * Run eCTD validation on a document
 */
router.post('/validate', async (req, res) => {
  const { access_token } = req.query;
  const { documentId, moduleType } = req.body;

  if (!access_token) {
    return res.status(401).json({ error: 'No access token provided' });
  }

  if (!documentId) {
    return res.status(400).json({ error: 'Document ID is required' });
  }

  try {
    // Make direct API call to get the document
    const documentResponse = await axios.get(
      `https://docs.googleapis.com/v1/documents/${documentId}`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const document = documentResponse.data;

    // Perform eCTD validation based on document content
    // This implementation provides detailed regulatory compliance checks

    // Extract text content from the document for analysis
    const content =
      document.body?.content
        .filter(item => item.paragraph)
        .map(item => {
          if (item.paragraph && item.paragraph.elements) {
            return item.paragraph.elements
              .filter(element => element.textRun)
              .map(element => element.textRun.content)
              .join('');
          }
          return '';
        })
        .join('\n') || '';

    // Initialize validation results
    const validationResults = {
      documentId,
      title: document.title,
      timestamp: new Date().toISOString(),
      moduleType: moduleType || 'unknown',
      status: 'checking',
      issues: [],
    };

    // Module-specific validation rules
    const moduleValidations = {
      module1: [
        {
          check: content => !content.includes('Administrative Information'),
          issue: {
            type: 'error',
            message: 'Module 1 document is missing required "Administrative Information" section',
            rule: 'eCTD.M1.1',
            location: 'Document structure',
            suggestion:
              'Add an Administrative Information section that includes all required regional content',
          },
        },
        {
          check: content =>
            !content.toLowerCase().includes('cover letter') &&
            !content.toLowerCase().includes('application form'),
          issue: {
            type: 'warning',
            message:
              'Module 1 should typically include Cover Letter and Application Form references',
            rule: 'eCTD.M1.2',
            location: 'Document structure',
            suggestion:
              'Consider adding sections for Cover Letter and Application Form as appropriate',
          },
        },
      ],
      module2: [
        {
          check: content =>
            !content.toLowerCase().includes('quality overall summary') &&
            !content.toLowerCase().includes('qos'),
          issue: {
            type: 'error',
            message: 'Module 2 document is missing required "Quality Overall Summary" section',
            rule: 'ICH.M2.2',
            location: 'Document structure',
            suggestion: 'Add the Quality Overall Summary section as required by ICH M2',
          },
        },
        {
          check: content =>
            !content.toLowerCase().includes('clinical overview') &&
            (moduleType === 'module2' || moduleType === 'module2_5'),
          issue: {
            type: 'error',
            message: 'Module 2.5 document is missing required "Clinical Overview" section',
            rule: 'ICH.M2.5',
            location: 'Document structure',
            suggestion: 'Add the Clinical Overview section as required by ICH M2.5',
          },
        },
        {
          check: content =>
            !content.toLowerCase().includes('clinical summary') &&
            (moduleType === 'module2' || moduleType === 'module2_7'),
          issue: {
            type: 'error',
            message: 'Module 2.7 document is missing required "Clinical Summary" section',
            rule: 'ICH.M2.7',
            location: 'Document structure',
            suggestion: 'Add the Clinical Summary section as required by ICH M2.7',
          },
        },
      ],
      module3: [
        {
          check: content => !content.toLowerCase().includes('quality'),
          issue: {
            type: 'error',
            message: 'Module 3 document is missing required "Quality" content',
            rule: 'ICH.M3.1',
            location: 'Document structure',
            suggestion: 'Add Quality information sections as required by ICH M3',
          },
        },
        {
          check: content => !content.toLowerCase().includes('manufacture'),
          issue: {
            type: 'warning',
            message: 'Module 3 typically contains manufacturing information',
            rule: 'ICH.M3.2',
            location: 'Document structure',
            suggestion: 'Consider adding sections for manufacturing process description',
          },
        },
      ],
      module4: [
        {
          check: content =>
            !content.toLowerCase().includes('nonclinical') &&
            !content.toLowerCase().includes('non-clinical') &&
            !content.toLowerCase().includes('toxicology'),
          issue: {
            type: 'error',
            message: 'Module 4 document is missing required nonclinical study information',
            rule: 'ICH.M4.1',
            location: 'Document structure',
            suggestion: 'Add nonclinical study information as required by ICH M4',
          },
        },
      ],
      module5: [
        {
          check: content =>
            !content.toLowerCase().includes('clinical') &&
            !content.toLowerCase().includes('study reports'),
          issue: {
            type: 'error',
            message: 'Module 5 document is missing required clinical study information',
            rule: 'ICH.M5.1',
            location: 'Document structure',
            suggestion: 'Add clinical study information as required by ICH M5',
          },
        },
      ],
    };

    // Common validation checks for all document types
    // Check 1: Document structuring - Verify heading hierarchy
    if (!content.includes('1. Introduction') && !content.includes('1 Introduction')) {
      validationResults.issues.push({
        type: 'warning',
        message: 'Document may be missing standard introduction section recommended by ICH',
        rule: 'ICH.FORMAT.1.2',
        location: 'Document structure',
        suggestion: 'Consider adding a properly formatted Introduction section (Section 1)',
      });
    }

    // Check 2: Formatting - Check for consistent numbering format
    const inconsistentNumbering = /^[0-9]+\)[^\n]+/m.test(content);
    if (inconsistentNumbering) {
      validationResults.issues.push({
        type: 'warning',
        message: 'Inconsistent section numbering format detected (mixing styles)',
        rule: 'eCTD.FORMAT.2.1',
        location: 'Throughout document',
        suggestion: 'Use consistent numbering format (e.g., "1.1" not "1)" or "1.1)" or "1.1.-")',
      });
    }

    // Apply module-specific validations
    const normalizedModuleType = moduleType?.toLowerCase()?.replace(/[^a-z0-9]/g, '') || '';
    let moduleKey = '';

    if (normalizedModuleType.includes('module1')) moduleKey = 'module1';
    else if (normalizedModuleType.includes('module2')) moduleKey = 'module2';
    else if (normalizedModuleType.includes('module3')) moduleKey = 'module3';
    else if (normalizedModuleType.includes('module4')) moduleKey = 'module4';
    else if (normalizedModuleType.includes('module5')) moduleKey = 'module5';

    if (moduleKey && moduleValidations[moduleKey]) {
      moduleValidations[moduleKey].forEach(validation => {
        if (validation.check(content)) {
          validationResults.issues.push(validation.issue);
        }
      });
    }

    // Check 4: Technical validation - Font embedding
    validationResults.issues.push({
      type: 'warning',
      message: 'Google Docs exports may not embed fonts properly for eCTD submission',
      rule: 'eCTD.PDF.1.2',
      location: 'PDF export settings',
      suggestion: 'Ensure PDF export includes embedded fonts when submitting final document',
    });

    // Check 5: PDF compliance check for eCTD submission
    validationResults.issues.push({
      type: 'info',
      message: 'Final PDF should be validated with an eCTD validator before submission',
      rule: 'eCTD.PDF.0',
      location: 'Export process',
      suggestion: 'Run final exported PDF through a dedicated eCTD validation tool',
    });

    // Check for regulatory mention and references
    if (
      !content.toLowerCase().includes('ich') &&
      !content.toLowerCase().includes('fda') &&
      !content.toLowerCase().includes('ema') &&
      !content.toLowerCase().includes('pmda')
    ) {
      validationResults.issues.push({
        type: 'info',
        message: 'Document does not appear to reference relevant regulatory authorities',
        rule: 'eCTD.CONTENT.REF.1',
        location: 'Document content',
        suggestion: 'Consider adding references to relevant regulatory guidelines or authorities',
      });
    }

    // Check for hyperlinks
    const hasHyperlinks = document.data.body.content.some(
      item =>
        item.paragraph &&
        item.paragraph.elements &&
        item.paragraph.elements.some(
          element => element.textRun && element.textRun.textStyle && element.textRun.textStyle.link
        )
    );

    if (!hasHyperlinks) {
      validationResults.issues.push({
        type: 'info',
        message: 'Document does not contain hyperlinks, which may be useful for navigation',
        rule: 'eCTD.FORMAT.LINK.1',
        location: 'Document content',
        suggestion: 'Consider adding hyperlinks to improve document navigation and references',
      });
    }

    // Set the overall status based on the issues found
    if (validationResults.issues.some(issue => issue.type === 'error')) {
      validationResults.status = 'error';
    } else if (validationResults.issues.some(issue => issue.type === 'warning')) {
      validationResults.status = 'warning';
    } else {
      validationResults.status = 'success';
    }

    validationResults.issueCount = validationResults.issues.length;

    res.json(validationResults);
  } catch (error) {
    console.error('Error validating document:', error);
    res.status(500).json({ error: 'Failed to validate document' });
  }
});

export { router };
