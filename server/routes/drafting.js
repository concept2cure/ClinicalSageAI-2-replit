import express from 'express';

const router = express.Router();

// Dev-only debugging helper (kept lightweight)
router.post('/debug/echo', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.json({
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
    },
    bodyType: typeof req.body,
    body: req.body,
  });
});

function normalizeBody(body) {
  if (!body) return null;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString('utf8'));
    } catch {
      return null;
    }
  }

  // Some clients wrap payloads.
  if (typeof body === 'object' && body !== null) {
    if (body.data && typeof body.data === 'object') return body.data;
    if (body.payload && typeof body.payload === 'object') return body.payload;
  }

  return body;
}

/**
 * POST /api/v1/drafting/start_task - Start an AI drafting task
 */
router.post('/start_task', async (req, res) => {
  try {
    const body = normalizeBody(req.body) || {};

    // Compatibility mode: CoAuthor.jsx uses { project_id, ectd_section, document_title, template }
    // and expects a 202 response with { task_id }.
    const coauthorProjectId = body?.project_id ?? body?.projectId;
    const coauthorSection = body?.ectd_section ?? body?.ectdSection;
    const coauthorTitle = body?.document_title ?? body?.documentTitle;
    const coauthorTemplate = body?.template;

    if (coauthorProjectId && coauthorSection && coauthorTitle) {
      const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      const draftContent = `# ${coauthorTitle}

Module/Section: ${coauthorSection}
Template: ${coauthorTemplate || 'default'}

This is a demo drafting result generated in NO_DB mode.
Replace with real generation when AI services are enabled.`;

      global.draftingTasks = global.draftingTasks || {};
      global.draftingTasks[taskId] = {
        id: taskId,
        project_id: coauthorProjectId,
        ectd_section: coauthorSection,
        document_title: coauthorTitle,
        template: coauthorTemplate,
        status: 'COMPLETED',
        draft_content: draftContent,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      return res.status(202).json({ task_id: taskId });
    }

    const {
      documentType,
      module,
      section,
      requirements,
      context,
      prompt,
      language = 'en',
      tone = 'formal',
      length = 'standard'
    } = body;
    
    if (!documentType || !module) {
      const debug = req.query && String(req.query.debug || '') === '1';
      return res.status(400).json({
        error: 'Missing required fields: documentType, module',
        ...(debug
          ? {
              received: {
                bodyType: typeof req.body,
                normalizedBodyType: typeof body,
                normalizedKeys: body && typeof body === 'object' ? Object.keys(body) : null,
                normalizedBody: body,
              },
            }
          : null),
      });
    }
    
    // Create a drafting task
    const task = {
      id: `draft-task-${Date.now()}`,
      status: 'processing',
      documentType,
      module,
      section: section || null,
      requirements: requirements || {},
      context: context || '',
      prompt: prompt || '',
      language,
      tone,
      length,
      createdAt: new Date().toISOString(),
      estimatedCompletion: new Date(Date.now() + 30000).toISOString() // 30 seconds
    };
    
    // Simulate async processing
    setTimeout(async () => {
      // In production, this would call OpenAI or another AI service
      const draftContent = generateDraftContent(task);
      
      // Store the result (in production, this would be in a database)
      task.status = 'completed';
      task.result = draftContent;
      task.completedAt = new Date().toISOString();
    }, 5000); // Simulate 5 second processing
    
    res.json({
      success: true,
      message: 'Drafting task started',
      taskId: task.id,
      estimatedCompletion: task.estimatedCompletion,
      status: task.status
    });
    
  } catch (error) {
    console.error('Error starting drafting task:', error);
    res.status(500).json({ 
      error: 'Failed to start drafting task',
      details: error.message 
    });
  }
});

/**
 * GET /api/v1/drafting/task/:taskId - Get drafting task status
 */
router.get('/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    // Mock task status - in production, fetch from database
    const mockTask = {
      id: taskId,
      status: 'completed',
      documentType: 'clinical-overview',
      module: '2.5',
      section: '2.5.4',
      result: {
        content: generateDraftContent({
          documentType: 'clinical-overview',
          module: '2.5',
          section: '2.5.4'
        }),
        metadata: {
          wordCount: 850,
          language: 'en',
          tone: 'formal',
          confidence: 0.92
        }
      },
      createdAt: new Date(Date.now() - 60000).toISOString(),
      completedAt: new Date(Date.now() - 30000).toISOString()
    };
    
    res.json({
      success: true,
      task: mockTask
    });
    
  } catch (error) {
    console.error('Error fetching drafting task:', error);
    res.status(500).json({ 
      error: 'Failed to fetch drafting task',
      details: error.message 
    });
  }
});

/**
 * POST /api/v1/drafting/revise - Revise drafted content
 */
router.post('/revise', async (req, res) => {
  try {
    const { 
      content, 
      instructions,
      revisionType = 'improve' // improve, shorten, expand, simplify
    } = req.body;
    
    if (!content || !instructions) {
      return res.status(400).json({ 
        error: 'Missing required fields: content, instructions' 
      });
    }
    
    // Generate revised content based on revision type
    let revisedContent = content;
    
    switch (revisionType) {
      case 'shorten':
        revisedContent = content.substring(0, Math.floor(content.length * 0.7)) + '...';
        break;
      case 'expand':
        revisedContent = content + '\n\nAdditional context: ' + instructions;
        break;
      case 'simplify':
        revisedContent = content.replace(/\b\w{10,}\b/g, 'simplified term');
        break;
      default:
        revisedContent = `[Revised based on: ${instructions}]\n\n${content}`;
    }
    
    res.json({
      success: true,
      original: content,
      revised: revisedContent,
      revisionType,
      changes: {
        originalLength: content.length,
        revisedLength: revisedContent.length,
        changeRatio: (revisedContent.length - content.length) / content.length
      }
    });
    
  } catch (error) {
    console.error('Error revising content:', error);
    res.status(500).json({ 
      error: 'Failed to revise content',
      details: error.message 
    });
  }
});

/**
 * POST /api/v1/drafting/validate - Validate drafted content for regulatory compliance
 */
router.post('/validate', async (req, res) => {
  try {
    const { content, documentType, module, region = 'FDA' } = req.body;
    
    if (!content || !documentType || !module) {
      return res.status(400).json({ 
        error: 'Missing required fields: content, documentType, module' 
      });
    }
    
    // Mock validation results
    const validationResults = {
      isValid: true,
      complianceScore: 0.89,
      issues: [
        {
          severity: 'warning',
          type: 'terminology',
          message: 'Consider using ICH-compliant terminology for "drug product"',
          line: 5,
          suggestion: 'Replace with "investigational medicinal product"'
        },
        {
          severity: 'info',
          type: 'formatting',
          message: 'Section numbering should follow CTD format',
          line: 12,
          suggestion: 'Use format: 2.5.4.1 instead of 2.5.4.a'
        }
      ],
      strengths: [
        'Clear structure and organization',
        'Comprehensive coverage of required topics',
        'Appropriate regulatory language'
      ],
      recommendations: [
        'Add cross-references to supporting documents',
        'Include summary tables for key data',
        'Review region-specific requirements for ' + region
      ]
    };
    
    res.json({
      success: true,
      validation: validationResults,
      documentType,
      module,
      region,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error validating content:', error);
    res.status(500).json({ 
      error: 'Failed to validate content',
      details: error.message 
    });
  }
});

// Helper function to generate draft content
function generateDraftContent(task) {
  const templates = {
    'clinical-overview': {
      '2.5': `## Module 2.5: Clinical Overview

### 1. Product Development Rationale
The development of [PRODUCT NAME] was initiated to address the unmet medical need in [INDICATION]. Current treatment options are limited by [LIMITATIONS], and our product offers [KEY ADVANTAGES].

### 2. Overview of Biopharmaceutics
Biopharmaceutical studies demonstrate that [PRODUCT NAME] exhibits [KEY PROPERTIES]. The formulation has been optimized to ensure [BENEFITS].

### 3. Overview of Clinical Pharmacology
Clinical pharmacology studies have established the pharmacokinetic and pharmacodynamic profile of [PRODUCT NAME]. Key findings include:
- [FINDING 1]
- [FINDING 2]
- [FINDING 3]

### 4. Overview of Efficacy
The efficacy of [PRODUCT NAME] has been demonstrated in [NUMBER] pivotal clinical trials involving [PATIENT NUMBER] patients. Primary endpoint results show [RESULTS].

### 5. Overview of Safety
The safety profile of [PRODUCT NAME] is well-characterized based on [EXPOSURE DATA]. The most common adverse events include [AE LIST].`,
      
      '2.5.4': `## Section 2.5.4: Overview of Efficacy

### Introduction
This section provides a critical analysis of the clinical efficacy data for [PRODUCT NAME] in the treatment of [INDICATION].

### Study Design and Conduct
The efficacy evaluation is based on:
- Phase 2 dose-ranging study (Study XXX-201)
- Two Phase 3 pivotal trials (Studies XXX-301 and XXX-302)
- Long-term extension study (Study XXX-303)

### Efficacy Endpoints
Primary Endpoint: [DESCRIBE PRIMARY ENDPOINT]
Key Secondary Endpoints:
1. [SECONDARY ENDPOINT 1]
2. [SECONDARY ENDPOINT 2]
3. [SECONDARY ENDPOINT 3]

### Results Summary
Across all studies, [PRODUCT NAME] demonstrated:
- Statistically significant improvement in [PRIMARY ENDPOINT]
- Clinically meaningful benefits in [KEY MEASURES]
- Consistent efficacy across subgroups

### Conclusions
The efficacy data support the use of [PRODUCT NAME] for [INDICATION] at the proposed dose of [DOSE].`
    },
    'quality': {
      '3.2': `## Module 3.2.S: Drug Substance

### 3.2.S.1 General Information
#### Nomenclature
- INN: [INTERNATIONAL NONPROPRIETARY NAME]
- Chemical Name: [IUPAC NAME]
- Code Name: [COMPANY CODE]

#### Structure
[DESCRIBE MOLECULAR STRUCTURE]

#### General Properties
- Molecular Formula: [FORMULA]
- Molecular Weight: [MW]
- Physical Form: [DESCRIPTION]

### 3.2.S.2 Manufacture
#### Manufacturers
[LIST OF MANUFACTURERS AND SITES]

#### Description of Manufacturing Process
[DETAILED PROCESS DESCRIPTION]

#### Control of Critical Steps
[CRITICAL PROCESS PARAMETERS]`
    }
  };
  
  const documentType = task.documentType || 'clinical-overview';
  const module = task.module || '2.5';
  const section = task.section;
  
  // Return appropriate template or generic content
  if (templates[documentType]) {
    if (section && templates[documentType][section]) {
      return templates[documentType][section];
    }
    return templates[documentType][module] || templates[documentType]['2.5'];
  }
  
  return `## ${documentType} - Module ${module}${section ? ' Section ' + section : ''}

### Overview
This section provides comprehensive documentation for ${documentType} as required by regulatory guidelines.

### Content
[Placeholder for ${documentType} content following ICH CTD format]

### Requirements
- Follow ICH M4 guidelines
- Include all required subsections
- Provide supporting data and references
- Ensure regulatory compliance for target regions

### Conclusion
[Summary and conclusions for this section]`;
}

export default router;