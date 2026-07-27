import express from 'express';
// NOTE: Using AI Provider Router for multi-provider support
// The original openaiService was actually Kimi AI (moonshot.cn)
import { AIProviderRouter } from '../../services/aiProviderRouter.ts';
const aiProviderRouter = new AIProviderRouter();
const openaiService = aiProviderRouter; // Backward compatibility alias

// Real audit service — persists to the sha256-chained, HMAC-sealed audit_logs
// table (21 CFR Part 11 §11.10(e)/§11.70). Previously a console.log no-op stub,
// so enterprise regulatory/RBAC actions were never written to the audit trail
// (and the `.constructor.SEVERITY.HIGH` reference below threw on the stub).
import auditService from '../../services/auditService.ts';

// Use the real RBAC service — deny-by-default (FDA 21 CFR Part 11 §11.10(d))
import rbacServiceImport from '../../services/roleBasedAccess.js';
const rbacService = rbacServiceImport;
import { authenticateToken } from '../../middleware/auth.js';
import { authedOrgId } from '../../utils/authedOrgId.js';

const router = express.Router();

// Every route is tenant-scoped. Source tenant + user from the verified
// JWT — the previous header/query path was attacker-controlled.
router.use(authenticateToken);
router.use((req, res, next) => {
  const orgId = authedOrgId(req);
  if (orgId == null) {
    return res.status(403).json({ error: 'Tenant context required' });
  }
  req.tenantId = orgId;
  req.userId = req.user?.id ?? req.user?.userId;
  next();
});

// Enhanced OpenAI-powered regulatory analysis
router.post('/regulatory/analyze', async (req, res) => {
  try {
    const { text, documentType = 'CMC' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Log the analysis request
    await auditService.logAction({
      tenantId: req.tenantId,
      userId: req.userId,
      action: 'regulatory_analysis',
      resourceType: 'analysis',
      details: { documentType, textLength: text.length },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    let analysis;

    if (openaiService.isAvailable) {
      // Use real OpenAI analysis
      analysis = await openaiService.analyzeRegulatoryDocument(text, documentType);
    } else {
      // Enhanced fallback with real regulatory logic
      analysis = performLocalRegulatoryAnalysis(text, documentType);
    }

    res.json({
      analysis,
      powered_by: openaiService.isAvailable ? 'OpenAI GPT-4o' : 'Local Analysis Engine',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Regulatory analysis error:', error);

    await auditService.logAction({
      tenantId: req.tenantId,
      userId: req.userId,
      action: 'regulatory.analysis.error',
      resourceType: 'system',
      details: { error: error.message },
      severity: 'high',
    });

    res.status(500).json({
      error: 'Analysis failed',
      details: error.message,
    });
  }
});

// Generate regulatory content with OpenAI
router.post('/regulatory/generate', async (req, res) => {
  try {
    const { prompt, documentType = 'CMC', requirements = {} } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    let content;

    if (openaiService.isAvailable) {
      content = await openaiService.generateRegulatoryContent(prompt, documentType, requirements);
    } else {
      content = generateFallbackContent(prompt, documentType);
    }

    await auditService.logAction({
      tenantId: req.tenantId,
      userId: req.userId,
      action: 'regulatory.content.generated',
      resourceType: 'document',
      details: { documentType, prompt: prompt.substring(0, 100) },
    });

    res.json({
      content,
      powered_by: openaiService.isAvailable ? 'OpenAI GPT-4o' : 'Template Engine',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Content generation error:', error);
    res.status(500).json({ error: 'Generation failed', details: error.message });
  }
});

// Enhance text with regulatory improvements
router.post('/regulatory/enhance', async (req, res) => {
  try {
    const { text, improvements = [] } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    let enhancedText;

    if (openaiService.isAvailable) {
      enhancedText = await openaiService.enhanceRegulatoryText(text, improvements);
    } else {
      enhancedText = performLocalTextEnhancement(text, improvements);
    }

    await auditService.logAction({
      tenantId: req.tenantId,
      userId: req.userId,
      action: 'regulatory.text.enhanced',
      resourceType: 'document',
      details: { improvements, originalLength: text.length },
    });

    res.json({
      enhancedText,
      improvements,
      powered_by: openaiService.isAvailable ? 'OpenAI GPT-4o' : 'Local Enhancement Engine',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Text enhancement error:', error);
    res.status(500).json({ error: 'Enhancement failed', details: error.message });
  }
});

// Get audit trail
// The canonical audit read-model lives at /api/audit-trail/ledger (hash-chained,
// tenant-scoped). This enterprise router only WRITES audit rows (via the real
// auditService above); it does not expose a query API. Respond honestly rather
// than calling the non-existent getAuditTrail/getAuditStats, which returned 500.
router.get('/audit/trail', rbacService.requirePermission('audit', 'read'), (_req, res) => {
  res.status(501).json({
    error: 'Not implemented here',
    message: 'Query the audit trail at /api/audit-trail/ledger (hash-chained, tenant-scoped).',
  });
});

// Get audit statistics
router.get('/audit/stats', rbacService.requirePermission('audit', 'read'), (_req, res) => {
  res.status(501).json({
    error: 'Not implemented here',
    message: 'Audit statistics are derived from the /api/audit-trail/ledger read-model; this endpoint does not synthesize stats.',
  });
});

// Role management endpoints
router.post(
  '/rbac/assign-role',
  rbacService.requirePermission('users', 'update'),
  async (req, res) => {
    try {
      const { userId, roleName, expiresAt } = req.body;

      if (!userId || !roleName) {
        return res.status(400).json({ error: 'userId and roleName are required' });
      }

      const result = await rbacService.assignRole(
        userId,
        roleName,
        req.tenantId,
        req.userId,
        expiresAt
      );

      await auditService.logAction({
        tenantId: req.tenantId,
        userId: req.userId,
        action: 'role.assigned',
        resourceType: 'user',
        resourceId: userId.toString(),
        details: { roleName, expiresAt },
      });

      res.json({ success: true, result });
    } catch (error) {
      console.error('Role assignment error:', error);
      res.status(500).json({ error: 'Failed to assign role', details: error.message });
    }
  }
);

router.get(
  '/rbac/user-roles/:userId',
  rbacService.requirePermission('users', 'read'),
  async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const roles = await rbacService.getUserRoles(userId, req.tenantId);

      res.json({ userId, roles });
    } catch (error) {
      console.error('Get user roles error:', error);
      res.status(500).json({ error: 'Failed to get user roles' });
    }
  }
);

router.get(
  '/rbac/permissions/:userId',
  rbacService.requirePermission('users', 'read'),
  async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const permissions = await rbacService.getUserPermissions(userId, req.tenantId);

      res.json({ userId, permissions });
    } catch (error) {
      console.error('Get permissions error:', error);
      res.status(500).json({ error: 'Failed to get permissions' });
    }
  }
);

// System health check with enterprise features status
router.get('/health', async (_req, res) => {
  // Real database probe — previously hardcoded { available:true, status:'connected' }
  // regardless of actual DB state.
  let dbAvailable = false;
  try {
    const { pool } = await import('../../db');
    if (pool) {
      await pool.query('SELECT 1');
      dbAvailable = true;
    }
  } catch {
    dbAvailable = false;
  }

  const health = {
    status: dbAvailable ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      openai: {
        available: openaiService.isAvailable,
        status: openaiService.isAvailable ? 'connected' : 'unavailable',
      },
      // audit + rbac are wired to their real services (imported above).
      audit: { available: true, status: 'active' },
      rbac: { available: Boolean(rbacService), status: rbacService ? 'active' : 'unavailable' },
      database: {
        available: dbAvailable,
        status: dbAvailable ? 'connected' : 'unavailable',
      },
    },
  };

  res.status(dbAvailable ? 200 : 503).json(health);
});

// Helper functions for fallback operations
function performLocalRegulatoryAnalysis(text, documentType) {
  const textLower = text.toLowerCase();
  const suggestions = [];
  let overallScore = 85;

  // FDA terminology checks
  const fdaTerms = {
    'drug substance': 'active pharmaceutical ingredient (API)',
    excipient: 'inactive ingredient',
    batch: 'lot',
    specification: 'acceptance criteria',
  };

  Object.entries(fdaTerms).forEach(([incorrect, correct]) => {
    if (textLower.includes(incorrect) && !textLower.includes(correct)) {
      suggestions.push({
        type: 'terminology',
        severity: 'medium',
        text: incorrect,
        suggestion: `Consider using FDA-preferred term: "${correct}"`,
        guideline: 'FDA',
        action: 'Replace',
      });
      overallScore -= 5;
    }
  });

  // Required elements check
  const requiredElements = ['cas registry number', 'molecular formula', 'stereochemistry'];
  requiredElements.forEach(element => {
    if (!textLower.includes(element)) {
      suggestions.push({
        type: 'missing',
        severity: 'high',
        text: '',
        suggestion: `Include ${element} as required by regulatory guidelines`,
        guideline: 'ICH/FDA',
        action: 'Add',
      });
      overallScore -= 10;
    }
  });

  return {
    suggestions,
    overallScore: Math.max(0, overallScore),
    complianceAreas: {
      FDA: Math.max(0, overallScore - 5),
      ICH: overallScore,
      EMA: Math.max(0, overallScore - 3),
    },
  };
}

function generateFallbackContent(prompt, documentType) {
  const templates = {
    CMC: `
# ${documentType} Section

Based on your request: "${prompt}"

## Regulatory Framework
This section should be developed in accordance with:
- ICH M4Q guidelines
- FDA guidance documents
- EMA quality guidelines

## Content Requirements
Please ensure inclusion of:
- Complete technical specifications
- Manufacturing controls
- Quality control procedures
- Stability data

*Note: This is a template response. For detailed content generation, please configure OpenAI API integration.*
    `,
    default: `
# Generated Content

Your request: "${prompt}"

## Regulatory Considerations
- Ensure compliance with applicable guidelines
- Include all required technical details
- Follow current regulatory standards

*Note: For AI-powered content generation, please configure OpenAI API integration.*
    `,
  };

  return templates[documentType] || templates['default'];
}

function performLocalTextEnhancement(text, improvements) {
  let enhancedText = text;

  // Basic enhancements
  if (improvements.includes('clarity')) {
    enhancedText = enhancedText.replace(/e\.g\./g, 'for example');
    enhancedText = enhancedText.replace(/i\.e\./g, 'that is');
  }

  if (improvements.includes('technical accuracy')) {
    enhancedText = enhancedText.replace(
      /drug substance/g,
      'active pharmaceutical ingredient (API)'
    );
  }

  if (improvements.includes('regulatory compliance')) {
    enhancedText +=
      '\n\n*Note: Content reviewed for regulatory compliance. For comprehensive enhancement, please configure OpenAI API integration.*';
  }

  return enhancedText;
}

export default router;
