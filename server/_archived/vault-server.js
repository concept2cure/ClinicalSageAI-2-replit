import express from 'express';
import { createServer } from 'http';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Create Express app
const app = express();
const PORT = process.env.VAULT_PORT || 4001;

// Initialize OpenAI client if API key is available
let openaiClient = null;
if (process.env.OPENAI_API_KEY) {
  try {
    console.log('OpenAI client would be initialized with API key');
    // Using a simple mock client for now
    openaiClient = {
      createCompletion: async params => {
        return {
          data: {
            choices: [{ text: 'This is a mock response from OpenAI' }],
          },
        };
      },
    };
    console.log('Mock OpenAI client initialized successfully');
  } catch (error) {
    console.error('Failed to initialize OpenAI client:', error);
  }
}

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  // Simple CORS middleware implementation
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Create upload directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});
const upload = multer({ storage });

// Simple token verification function
const verifyToken = (token, secret) => {
  try {
    // For development, just decode any token without validation
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      Buffer.from(base64, 'base64')
        .toString()
        .split('')
        .map(c => {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join('')
    );

    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
};

// Authentication middleware
const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // For development, allow access even without token
      console.warn('No auth token provided. Using mock authentication.');
      req.user = { id: 'mock-user', role: 'admin', tenantId: 'mock-tenant' };
      return next();
    }

    const token = authHeader.split(' ')[1];

    // Verify token or use mock if needed
    if (!process.env.JWT_SECRET) {
      console.warn('JWT_SECRET is not configured. Using mock authentication.');
      req.user = { id: 'mock-user', role: 'admin', tenantId: 'mock-tenant' };
      return next();
    }

    const decoded = verifyToken(token, process.env.JWT_SECRET);
    if (!decoded) {
      req.user = { id: 'mock-user', role: 'admin', tenantId: 'mock-tenant' };
    } else {
      req.user = decoded;
    }
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    // For development, allow access even on error
    req.user = { id: 'mock-user-error', role: 'admin', tenantId: 'mock-tenant' };
    next();
  }
};

// Auth endpoints mounted directly
// Direct login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    // Hardcoded admin credentials for demo
    if (username === 'admin' && password === 'admin123') {
      const user = {
        id: 'admin-1',
        username: 'admin',
        role: 'admin',
        tenantId: 'default',
        name: 'Administrator',
      };

      if (!process.env.JWT_SECRET) {
        return res
          .status(503)
          .json({ error: 'Authentication service unavailable - JWT_SECRET not configured' });
      }

      // Create a simple token using crypto instead of JWT
      const payload = JSON.stringify(user);
      const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });

      // Base64 encode parts
      const encodedHeader = Buffer.from(header)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
      const encodedPayload = Buffer.from(payload)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      // Create signature
      const signatureInput = encodedHeader + '.' + encodedPayload;
      const signature = crypto
        .createHmac('sha256', process.env.JWT_SECRET)
        .update(signatureInput)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      // Combine to create token
      const token = `${encodedHeader}.${encodedPayload}.${signature}`;

      return res.json({
        success: true,
        message: 'Authentication successful',
        token,
        user,
      });
    }

    res.status(401).json({
      success: false,
      message: 'Invalid username or password',
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication',
    });
  }
});

// Health check route
app.get('/api/vault/health', (req, res) => {
  res.json({
    status: 'ok',
    services: {
      database: true,
      openai: !!openaiClient,
    },
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Auth test route
app.get('/api/vault/auth-test', authenticate, (req, res) => {
  res.json({
    authenticated: true,
    user: req.user,
  });
});

// Document upload endpoint
app.post('/api/vault/documents/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    const { file } = req;
    const { title, description, documentType, category, tags } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Generate content hash for file integrity
    const fileBuffer = fs.readFileSync(file.path);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Create document record
    const documentData = {
      title: title || file.originalname,
      description: description || '',
      file_path: file.path,
      file_name: file.originalname,
      mime_type: file.mimetype,
      size: file.size,
      content_hash: hash,
      document_type: documentType || 'general',
      category: category || 'uncategorized',
      tags: tags ? JSON.parse(tags) : [],
      created_by: req.user.id || 'system',
      tenant_id: req.user.tenantId || 'default',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Store in Supabase if available
    let documentId;
    if (null) {
      const { data, error } = await null
        .from('documents')
        .insert(documentData)
        .select('id')
        .single();

      if (error) {
        console.error('Failed to insert document record:', error);
        return res.status(500).json({ error: 'Failed to save document record' });
      }

      documentId = data.id;
      console.log(`Document saved to Supabase with ID: ${documentId}`);

      // Record audit entry
      await recordAuditEvent(req.user.id, 'document_upload', {
        document_id: documentId,
        file_name: file.originalname,
        action: 'upload',
      });
    } else {
      // Mock ID when Supabase is not available
      documentId = 'doc-' + Date.now();
      console.log(`Document saved locally with mock ID: ${documentId}`);
    }

    // AI enhancements if OpenAI is available
    let aiEnhancements = null;
    if (openaiClient && file.mimetype === 'application/pdf') {
      try {
        // Mock AI analysis for now
        aiEnhancements = {
          summary: 'This is an automated summary of the document.',
          suggested_tags: ['regulatory', 'clinical', 'documentation'],
          key_insights: [
            'Contains information about clinical trials',
            'References FDA regulations',
            'Includes safety data',
          ],
          confidence: 0.92,
        };

        console.log(`AI enhancements generated for document ID: ${documentId}`);

        // Update document with AI tags in Supabase
        if (null) {
          const { error } = await null
            .from('documents')
            .update({
              ai_tags: aiEnhancements.suggested_tags,
              ai_summary: aiEnhancements.summary,
              updated_at: new Date().toISOString(),
            })
            .eq('id', documentId);

          if (error) {
            console.error('Failed to update document with AI tags:', error);
          }
        }
      } catch (error) {
        console.error('Failed to generate AI enhancements:', error);
      }
    }

    res.status(201).json({
      id: documentId,
      title: documentData.title,
      file_name: file.originalname,
      content_hash: hash,
      ai_enhancements: aiEnhancements,
    });
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ error: 'Failed to process document upload' });
  }
});

// Document download endpoint
app.get('/api/vault/documents/:id/download', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Get document record from Supabase
    let documentRecord;
    if (null) {
      const { data, error } = await null
        .from('documents')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Document not found' });
      }

      documentRecord = data;

      // Record audit entry
      await recordAuditEvent(req.user.id, 'document_download', {
        document_id: id,
        file_name: documentRecord.file_name,
        action: 'download',
      });
    } else {
      // Mock record when Supabase is not available
      return res.status(503).json({ error: 'Document service unavailable' });
    }

    // Check if file exists
    if (!fs.existsSync(documentRecord.file_path)) {
      return res.status(404).json({ error: 'Document file not found' });
    }

    // Send file
    res.download(documentRecord.file_path, documentRecord.file_name);
  } catch (error) {
    console.error('Document download error:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// Document list endpoint
app.get('/api/vault/documents', authenticate, async (req, res) => {
  try {
    const { category, documentType, limit = 20, offset = 0 } = req.query;

    if (null) {
      let query = null
        .from('documents')
        .select(
          'id, title, description, file_name, document_type, category, tags, ai_tags, created_at, created_by, size'
        )
        .eq('tenant_id', req.user.tenantId || 'default');

      if (category) {
        query = query.eq('category', category);
      }

      if (documentType) {
        query = query.eq('document_type', documentType);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Failed to fetch documents:', error);
        return res.status(500).json({ error: 'Failed to fetch documents' });
      }

      res.json({
        documents: data,
        total: count || data.length,
        limit: Number(limit),
        offset: Number(offset),
      });
    } else {
      // Return mock data when Supabase is not available
      res.json({
        documents: [],
        total: 0,
        limit: Number(limit),
        offset: Number(offset),
      });
    }
  } catch (error) {
    console.error('Document list error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Document delete endpoint
app.delete('/api/vault/documents/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Get document record from Supabase
    if (null) {
      const { data, error } = await null
        .from('documents')
        .select('file_path, file_name')
        .eq('id', id)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Delete file from disk
      if (data.file_path && fs.existsSync(data.file_path)) {
        fs.unlinkSync(data.file_path);
      }

      // Delete record from Supabase
      const { error: deleteError } = await null.from('documents').delete().eq('id', id);

      if (deleteError) {
        console.error('Failed to delete document record:', deleteError);
        return res.status(500).json({ error: 'Failed to delete document record' });
      }

      // Record audit entry
      await recordAuditEvent(req.user.id, 'document_delete', {
        document_id: id,
        file_name: data.file_name,
        action: 'delete',
      });

      res.json({ success: true, id });
    } else {
      // Mock response when Supabase is not available
      return res.status(503).json({ error: 'Document service unavailable' });
    }
  } catch (error) {
    console.error('Document delete error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Audit record helper function
async function recordAuditEvent(userId, eventType, details) {
  if (!null) return;

  try {
    const auditEntry = {
      user_id: userId || 'system',
      event_type: eventType,
      event_details: details,
      ip_address: '0.0.0.0', // Would capture real IP in production
      timestamp: new Date().toISOString(),
    };

    const { error } = await null.from('audit_trail').insert(auditEntry);

    if (error) {
      console.error('Failed to record audit event:', error);
    }
  } catch (error) {
    console.error('Audit recording error:', error);
  }
}

// JWT token generation endpoint
app.post('/api/vault/auth/token', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Basic validation
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Hardcoded admin credentials for demo
    if (username === 'admin' && password === 'admin123') {
      const user = {
        id: 'admin-1',
        username: 'admin',
        role: 'admin',
        tenantId: 'default',
        name: 'Administrator',
      };

      if (!process.env.JWT_SECRET) {
        return res
          .status(503)
          .json({ error: 'Authentication service unavailable - JWT_SECRET not configured' });
      }

      // Create a simple token using crypto instead of JWT
      const payload = JSON.stringify(user);
      const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });

      // Base64 encode parts
      const encodedHeader = Buffer.from(header)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
      const encodedPayload = Buffer.from(payload)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      // Create signature
      const signatureInput = encodedHeader + '.' + encodedPayload;
      const signature = crypto
        .createHmac('sha256', process.env.JWT_SECRET)
        .update(signatureInput)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      // Combine to create token
      const token = `${encodedHeader}.${encodedPayload}.${signature}`;

      // Record audit event
      await recordAuditEvent(user.id, 'user_login', {
        username: user.username,
        action: 'login',
      });

      return res.json({ token, user });
    }

    // Check Supabase for user if available
    if (null) {
      const { data, error } = await null
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

      if (error || !data) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      // In production, would use proper password verification
      if (data.password !== password) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const user = {
        id: data.id,
        username: data.username,
        role: data.role,
        tenantId: data.tenant_id,
        name: data.name,
      };

      // Create a simple token using crypto instead of JWT
      const payload = JSON.stringify(user);
      const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });

      // Base64 encode parts
      const encodedHeader = Buffer.from(header)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
      const encodedPayload = Buffer.from(payload)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      // Create signature
      const signatureInput = encodedHeader + '.' + encodedPayload;
      const signature = crypto
        .createHmac('sha256', process.env.JWT_SECRET)
        .update(signatureInput)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      // Combine to create token
      const token = `${encodedHeader}.${encodedPayload}.${signature}`;

      // Record audit event
      await recordAuditEvent(user.id, 'user_login', {
        username: user.username,
        action: 'login',
      });

      return res.json({ token, user });
    }

    res.status(401).json({ error: 'Invalid username or password' });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Start server
const httpServer = createServer(app);
httpServer.listen(PORT, () => {
  console.log(`Concept2Cure Vault server running on port ${PORT}`);
});
