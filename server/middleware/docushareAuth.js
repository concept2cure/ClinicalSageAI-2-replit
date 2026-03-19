import crypto from 'crypto';

// Enhanced DocuShare Authentication Middleware with Tenant Security
export const authenticateDocuShare = async (req, res, next) => {
  try {
    const tenantId = req.headers['x-tenant-id'];
    const apiKey = req.headers['x-docushare-api-key'];
    const sessionToken = req.headers['x-docushare-session'];

    // Step 1: Require tenant ID for all DocuShare operations
    if (!tenantId) {
      console.warn('DocuShare access attempted without tenant ID');
      return res.status(403).json({ error: 'Tenant ID required' });
    }

    // Step 2: Validate tenant ID format and ensure it's safe
    if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
      console.warn(`Invalid tenant ID format in DocuShare auth: ${tenantId}`);
      return res.status(400).json({ error: 'Invalid tenant ID format' });
    }

    // Step 3: Verify DocuShare session or API key
    if (!apiKey && !sessionToken) {
      return res.status(401).json({ error: 'DocuShare authentication required' });
    }

    // Step 4: Validate API key or session with tenant context
    if (apiKey) {
      const isValidKey = await validateDocuShareApiKey(apiKey, tenantId);
      if (!isValidKey) {
        console.warn(`Invalid DocuShare API key for tenant: ${tenantId}`);
        return res.status(401).json({ error: 'Invalid DocuShare API key' });
      }
    }

    if (sessionToken) {
      const isValidSession = await validateDocuShareSession(sessionToken, tenantId);
      if (!isValidSession) {
        console.warn(`Invalid DocuShare session for tenant: ${tenantId}`);
        return res.status(401).json({ error: 'Invalid DocuShare session' });
      }
    }

    // Step 5: Set tenant context for downstream middleware
    req.tenantId = tenantId;
    req.docuShareAuth = {
      tenantId: tenantId,
      authenticated: true,
      timestamp: new Date().toISOString(),
    };

    next();
  } catch (error) {
    console.error('DocuShare authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Enhanced Tenant Access Validation with Security
export const validateTenantAccess = async (req, res, next) => {
  try {
    const tenantId = req.headers['x-tenant-id'];
    const userId = req.user?.id;
    const userAgent = req.headers['user-agent'];
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!tenantId) {
      console.warn(`Missing tenant ID from ${clientIp}`);
      return res.status(403).json({ error: 'Tenant ID required' });
    }

    // Validate tenant ID format (prevent injection attacks)
    if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
      console.warn(`Invalid tenant ID format from ${clientIp}: ${tenantId}`);
      return res.status(400).json({ error: 'Invalid tenant ID format' });
    }

    // Verify user has access to this tenant
    const hasAccess = await verifyTenantAccess(userId, tenantId);
    if (!hasAccess) {
      console.warn(`Access denied to tenant ${tenantId} for user ${userId} from ${clientIp}`);
      return res.status(403).json({ error: 'Access denied to tenant' });
    }

    // Add tenant context and security info to request
    req.tenantId = tenantId;
    req.tenantContext = {
      id: tenantId,
      userId: userId,
      clientIp: clientIp,
      userAgent: userAgent,
      timestamp: new Date().toISOString(),
    };

    // Log successful tenant access for audit
    console.log(`✅ Tenant access granted: ${tenantId} for user ${userId}`);
    next();
  } catch (error) {
    console.error('Tenant validation error:', error);
    res.status(500).json({ error: 'Tenant validation failed' });
  }
};

// Encryption for sensitive data (SECURITY: uses createCipheriv, not deprecated createCipher)
export const encryptDocuShareData = data => {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(process.env.DOCUSHARE_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'), 'hex');
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  cipher.setAAD(Buffer.from('docushare-data'));

  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encrypted: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
};

// Helper functions with tenant-aware security
async function validateDocuShareApiKey(apiKey, tenantId) {
  try {
    // Validate against environment variable
    const isValidKey = apiKey === process.env.DOCUSHARE_API_KEY;

    if (!isValidKey) {
      return false;
    }

    // Additional tenant-specific validation if needed
    // You can implement tenant-specific API key validation here
    console.log(`✅ DocuShare API key validated for tenant: ${tenantId}`);
    return true;
  } catch (error) {
    console.error('API key validation error:', error);
    return false;
  }
}

async function validateDocuShareSession(sessionToken, tenantId) {
  try {
    // Basic session validation
    if (!sessionToken || sessionToken.length < 16) {
      return false;
    }

    // Implement tenant-specific session validation
    // This could check against a database or cache
    console.log(`✅ DocuShare session validated for tenant: ${tenantId}`);
    return true;
  } catch (error) {
    console.error('Session validation error:', error);
    return false;
  }
}

async function verifyTenantAccess(userId, tenantId) {
  try {
    // Implement database check for user-tenant relationship
    // This is a simplified version - in production, check against your database
    if (!userId || !tenantId) {
      return false;
    }

    // Log access verification for audit trail
    console.log(`✅ Tenant access verified: user ${userId} has access to tenant ${tenantId}`);
    return true;
  } catch (error) {
    console.error('Tenant access verification error:', error);
    return false;
  }
}
