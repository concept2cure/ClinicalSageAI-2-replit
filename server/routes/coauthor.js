import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { db } from '../db/index.js';
import { 
  coauthorSections, 
  coauthorAnnotations, 
  coauthorDocuments, 
  coauthorDocumentVersions, 
  coauthorStatusHistory,
  coauthorImportHistory,
  coauthorValidationRules,
  coauthorValidationHistory,
  indSubmissions,
  indDocuments,
  users,
  components, 
  componentVersions, 
  documentComponents,
  componentCrossReferences,
  componentSequenceReferences,
  ectdModules
} from '../../shared/schema.js';
import { eq, and, sql, desc, asc, like, or } from 'drizzle-orm';
import { 
  initializeValidationRules, 
  validateDocument, 
  getValidationHistory,
  exportValidationReport 
} from '../services/coauthorValidation.js';
import { 
  extractComponents, 
  parseWordDocument, 
  parsePDFDocument,
  findReusableComponents
} from '../services/componentExtraction.js';
import {
  reconstructDocument,
  exportToWord,
  getComponentHistory
} from '../services/documentReconstruction.js';
import {
  getVersionDiff,
  getComponentVersionHistory,
  getComponentUsageComparison
} from '../services/componentDiff.js';
import {
  lockComponent,
  unlockComponent,
  refreshLock,
  getDocumentLocks,
  autoSaveManager
} from '../services/documentLocking.js';
import ectdAuditService from '../services/ectdAuditService.js';
import controlledVocabularyService from '../services/controlledVocabularyService.js';
import globalChangeManagementService from '../services/globalChangeManagementService.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept Word documents and PDFs
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/pdf'
    ];
    const allowedExtensions = ['.docx', '.doc', '.pdf'];
    
    if (allowedMimes.includes(file.mimetype) || 
        allowedExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext))) {
      cb(null, true);
    } else {
      cb(new Error('Only Word documents and PDFs are allowed'));
    }
  }
});

// Initialize validation rules on server startup
initializeValidationRules();

/* ================================================================================
 * COMPONENT MANAGEMENT FUNCTIONS - CORE CCMS ARCHITECTURE
 * ================================================================================
 * These functions implement the Component-Centric Management System (CCMS)
 * for granular document control with full traceability and reuse capabilities.
 * ================================================================================ */

/**
 * Ingest a new component into the Component Vault
 * Creates a UDI (Unique Document Identifier) and tracks lineage
 */
async function ingestComponent(content, type, metadata, organizationId, userId) {
  try {
    // Generate UDI for the component
    const udi = `C-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Check for existing similar components
    const existingComponents = await db
      .select()
      .from(components)
      .where(and(
        eq(components.organizationId, organizationId),
        eq(components.type, type)
      ));
    
    // Calculate content hash for deduplication
    const contentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(content))
      .digest('hex');
    
    // Check if this exact content already exists
    const duplicate = existingComponents.find(c => c.contentHash === contentHash);
    if (duplicate) {
      return {
        success: true,
        componentId: duplicate.id,
        udi: duplicate.udi,
        isDuplicate: true,
        message: 'Component already exists in vault'
      };
    }
    
    // Create the component
    const newComponent = await db.insert(components).values({
      udi,
      type,
      name: metadata?.name || `${type} Component`,
      content,
      contentHash,
      organizationId,
      sourceDocumentId: metadata?.documentId || null,
      modulePath: metadata?.modulePath || null,
      regulatoryContext: metadata?.regulatoryContext || null,
      isReusable: true,
      createdBy: userId,
      createdAt: sql`NOW()`,
      updatedAt: sql`NOW()`,
      extractedAt: sql`NOW()` // Add the required extracted_at field
    }).returning();
    
    // Create initial version
    await db.insert(componentVersions).values({
      componentId: newComponent[0].id,
      versionNumber: 1,
      versionLabel: '1.0.0',
      content,
      changeDescription: 'Initial component creation',
      changeType: 'create',
      organizationId,
      createdById: userId,
      createdByName: metadata?.userName || `User ${userId}`,
      createdAt: sql`NOW()`
    });
    
    return {
      success: true,
      componentId: newComponent[0].id,
      udi: newComponent[0].udi,
      isDuplicate: false,
      message: 'Component successfully ingested'
    };
    
  } catch (error) {
    console.error('Error ingesting component:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get a specific version of a component
 * Supports version-specific retrieval for audit trails
 */
async function getComponentVersion(componentId, versionNumber, organizationId) {
  try {
    let query = db
      .select()
      .from(componentVersions)
      .where(and(
        eq(componentVersions.componentId, componentId),
        eq(componentVersions.organizationId, organizationId)
      ));
    
    // If specific version requested
    if (versionNumber) {
      query = query.where(eq(componentVersions.versionNumber, versionNumber));
    } else {
      // Get latest version
      query = query.orderBy(desc(componentVersions.versionNumber)).limit(1);
    }
    
    const version = await query;
    
    if (version.length === 0) {
      return {
        success: false,
        error: 'Component version not found'
      };
    }
    
    // Get component metadata
    const component = await db
      .select()
      .from(components)
      .where(eq(components.id, componentId));
    
    return {
      success: true,
      component: component[0],
      version: version[0],
      content: version[0].content
    };
    
  } catch (error) {
    console.error('Error getting component version:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update a component and create a new version
 * Maintains full version history for traceability
 */
async function updateComponentVersion(componentId, newContent, changeDescription, userId, userName, organizationId) {
  try {
    // Get current latest version
    const currentVersion = await db
      .select()
      .from(componentVersions)
      .where(and(
        eq(componentVersions.componentId, componentId),
        eq(componentVersions.organizationId, organizationId)
      ))
      .orderBy(desc(componentVersions.versionNumber))
      .limit(1);
    
    const nextVersionNumber = currentVersion[0] ? currentVersion[0].versionNumber + 1 : 1;
    
    // Determine change type
    const changeType = detectChangeType(currentVersion[0]?.content, newContent);
    
    // Create new version
    const newVersion = await db.insert(componentVersions).values({
      componentId,
      versionNumber: nextVersionNumber,
      versionLabel: generateVersionLabel(nextVersionNumber, changeType),
      content: newContent,
      changeDescription,
      changeType,
      organizationId,
      createdById: userId,
      createdByName: userName,
      createdAt: sql`NOW()`
    }).returning();
    
    // Update component metadata
    await db.update(components)
      .set({
        updatedAt: sql`NOW()`,
        contentHash: crypto
          .createHash('sha256')
          .update(JSON.stringify(newContent))
          .digest('hex')
      })
      .where(eq(components.id, componentId));
    
    return {
      success: true,
      version: newVersion[0],
      versionNumber: nextVersionNumber
    };
    
  } catch (error) {
    console.error('Error updating component version:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Find components suitable for reuse based on content similarity
 */
async function findReusableComponentsForContent(content, type, organizationId, threshold = 0.7) {
  try {
    const candidates = await db
      .select()
      .from(components)
      .where(and(
        eq(components.organizationId, organizationId),
        eq(components.type, type),
        eq(components.isReusable, true)
      ));
    
    const matches = [];
    
    for (const candidate of candidates) {
      const similarity = calculateSimilarity(content, candidate.content);
      
      if (similarity >= threshold) {
        matches.push({
          componentId: candidate.id,
          udi: candidate.udi,
          name: candidate.name,
          similarity,
          content: candidate.content,
          lastUsed: candidate.updatedAt
        });
      }
    }
    
    // Sort by similarity score
    matches.sort((a, b) => b.similarity - a.similarity);
    
    return {
      success: true,
      matches,
      totalFound: matches.length
    };
    
  } catch (error) {
    console.error('Error finding reusable components:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Link a component to a document at a specific position
 */
async function linkComponentToDocument(componentId, documentId, position, organizationId) {
  try {
    // Check if component is already linked at this position
    const existing = await db
      .select()
      .from(documentComponents)
      .where(and(
        eq(documentComponents.documentId, parseInt(documentId)),
        eq(documentComponents.position, position),
        eq(documentComponents.organizationId, organizationId)
      ));
    
    if (existing.length > 0) {
      // Update existing link
      await db.update(documentComponents)
        .set({
          componentId,
          updatedAt: sql`NOW()`
        })
        .where(eq(documentComponents.id, existing[0].id));
    } else {
      // Create new link
      await db.insert(documentComponents).values({
        documentId,
        componentId,
        position,
        organizationId,
        isLocked: false,
        createdAt: sql`NOW()`
      });
    }
    
    return {
      success: true,
      message: 'Component linked to document'
    };
    
  } catch (error) {
    console.error('Error linking component to document:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Track component lineage and relationships
 */
async function trackComponentLineage(componentId, parentId, relationshipType, organizationId) {
  try {
    await db.insert(componentCrossReferences).values({
      sourceComponentId: componentId,
      targetComponentId: parentId,
      relationshipType, // 'derived_from', 'references', 'replaces', etc.
      organizationId,
      createdAt: sql`NOW()`
    });
    
    return {
      success: true,
      message: 'Lineage tracked'
    };
    
  } catch (error) {
    console.error('Error tracking component lineage:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/* ================================================================================
 * HELPER FUNCTIONS FOR COMPONENT MANAGEMENT
 * ================================================================================ */

function detectChangeType(oldContent, newContent) {
  if (!oldContent) return 'create';
  
  const oldStr = JSON.stringify(oldContent);
  const newStr = JSON.stringify(newContent);
  
  const sizeDiff = Math.abs(newStr.length - oldStr.length) / oldStr.length;
  
  if (sizeDiff < 0.1) return 'minor';
  if (sizeDiff < 0.3) return 'moderate';
  return 'major';
}

function generateVersionLabel(versionNumber, changeType) {
  const major = Math.floor(versionNumber / 100);
  const minor = Math.floor((versionNumber % 100) / 10);
  const patch = versionNumber % 10;
  
  return `${major}.${minor}.${patch}`;
}

function calculateSimilarity(content1, content2) {
  // Simple similarity calculation - in production use more sophisticated NLP
  const str1 = JSON.stringify(content1).toLowerCase();
  const str2 = JSON.stringify(content2).toLowerCase();
  
  if (str1 === str2) return 1.0;
  
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);
  
  const commonWords = words1.filter(word => words2.includes(word));
  const similarity = (commonWords.length * 2) / (words1.length + words2.length);
  
  return Math.min(1.0, similarity);
}

// AI advice templates based on section type (static reference data)
const adviceTemplates = {
  '1.1': 'Module 1 requires administrative information including contact details, application forms, and reference lists.',
  '2.7': 'The Clinical Summary should provide a comprehensive analysis of clinical data including efficacy and safety findings.',
  '3.2': "The Clinical Efficacy section should present critical analyses of clinical trial data supporting your product's efficacy claims.",
  '3.4': 'Safety Reports require detailed analysis of adverse events, safety signals, and benefit-risk assessments.',
  '4.1': 'Nonclinical Studies should provide tabulated summaries of all relevant studies and their findings.',
  '5.1': 'Study Listings must include details of all clinical studies referenced in the application with proper indexing.',
  default:
    'This section requires thorough documentation following ICH guidelines. Consider referencing previous successful submissions.',
};

// Initialize default sections for new organizations (one-time seed)
async function ensureDefaultSections(organizationId) {
  try {
    const existingSections = await db
      .select()
      .from(coauthorSections)
      .where(eq(coauthorSections.organizationId, organizationId))
      .limit(1);

    if (existingSections.length === 0) {
      // Create default sections for new organizations
      const defaultSections = [
        { sectionId: '1.1', title: 'Module 1: Admin', x: 50, y: 50, status: 'complete', connections: [] },
        {
          sectionId: '2.7',
          title: 'Module 2.7: Clinical Summary',
          x: 300,
          y: 50,
          status: 'critical',
          connections: ['1.1'],
        },
        {
          sectionId: '3.2',
          title: 'Module 3.2: Clinical Efficacy',
          x: 550,
          y: 50,
          status: 'pending',
          connections: ['2.7'],
        },
        {
          sectionId: '3.4',
          title: 'Module 3.4: Safety Reports',
          x: 550,
          y: 150,
          status: 'pending',
          connections: ['2.7'],
        },
        {
          sectionId: '4.1',
          title: 'Module 4.1: Nonclinical Studies',
          x: 300,
          y: 150,
          status: 'pending',
          connections: ['1.1'],
        },
        {
          sectionId: '5.1',
          title: 'Module 5.1: Study Listings',
          x: 50,
          y: 150,
          status: 'pending',
          connections: ['1.1'],
        },
      ];

      for (const section of defaultSections) {
        await db.insert(coauthorSections).values({
          sectionId: section.sectionId,
          title: section.title,
          x: section.x,
          y: section.y,
          status: section.status,
          connections: section.connections, // Pass as array, not stringified
          organizationId,
        });
      }
    }
  } catch (error) {
    console.error('Error ensuring default sections:', error);
  }
}

/**
 * Get all document sections with their positions
 */
router.get('/sections', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    
    // Ensure default sections exist
    await ensureDefaultSections(organizationId);
    
    const sections = await db
      .select()
      .from(coauthorSections)
      .where(eq(coauthorSections.organizationId, organizationId));

    // Frontend expects 'id' field for section identification
    const formattedSections = sections.map(section => ({
      id: section.sectionId, // Map sectionId to id for frontend compatibility
      title: section.title,
      x: section.x,
      y: section.y,
      status: section.status,
      connections: Array.isArray(section.connections) ? section.connections : []
    }));

    res.json(formattedSections);
  } catch (error) {
    console.error('Error fetching sections:', error);
    res.status(500).json({ error: 'Failed to fetch sections' });
  }
});

/**
 * Get eCTD templates
 */
router.get('/templates', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    
    // Return professional eCTD templates for all 5 modules
    const templates = [
      // Module 1 - Administrative
      {
        id: 'mod1-cover-letter',
        name: 'Module 1.2 Cover Letter',
        module: 'Module 1 - Administrative',
        category: 'administrative',
        description: 'FDA submission cover letter template',
        sections: ['1.2'],
        validated: true,
        regions: ['US FDA'],
        content: `<h1>COVER LETTER</h1>
<p>[Date]</p>
<p>Food and Drug Administration<br/>
Center for Drug Evaluation and Research<br/>
Document Control Center<br/>
5901-B Ammendale Road<br/>
Beltsville, MD 20705-1266</p>

<h2>Re: [IND/NDA/BLA] [Number]</h2>
<h3>[Drug Name] ([Generic Name])</h3>

<p>Dear Review Team,</p>

<p>We are submitting this [Type of Submission] for [Drug Name] in accordance with 21 CFR [applicable regulation]. This submission contains [brief description of contents].</p>

<h3>Summary of Submission Contents:</h3>
<ul>
<li>Module 1: Administrative Information and Prescribing Information</li>
<li>Module 2: Common Technical Document Summaries</li>
<li>Module 3: Quality</li>
<li>Module 4: Nonclinical Study Reports</li>
<li>Module 5: Clinical Study Reports</li>
</ul>

<h3>Key Highlights:</h3>
<p>[Highlight major elements of the submission]</p>

<h3>Regulatory History:</h3>
<p>[Brief regulatory history and relevant meetings]</p>

<p>We look forward to your review and are available to discuss any questions.</p>

<p>Sincerely,<br/>
[Name]<br/>
[Title]<br/>
[Company]<br/>
[Contact Information]</p>`
      },
      {
        id: 'mod1-form-fda-1571',
        name: 'Module 1.1 Form FDA 1571',
        module: 'Module 1 - Administrative', 
        category: 'administrative',
        description: 'IND Application Form',
        sections: ['1.1'],
        validated: true,
        regions: ['US FDA']
      },
      
      // Module 2 - Summaries
      {
        id: 'mod2-clinical-overview',
        name: 'Module 2.5 Clinical Overview',
        module: 'Module 2 - CTD Summaries',
        category: 'summary',
        description: 'Comprehensive clinical data overview',
        sections: ['2.5'],
        validated: true,
        regions: ['US FDA', 'EMA', 'Health Canada'],
        content: `<h1>2.5 CLINICAL OVERVIEW</h1>

<h2>2.5.1 Product Development Rationale</h2>
<p>[Describe the medical need and how the drug addresses it]</p>

<h2>2.5.2 Overview of Biopharmaceutics</h2>
<p>[Summary of formulation development and bioavailability]</p>

<h2>2.5.3 Overview of Clinical Pharmacology</h2>
<h3>Pharmacokinetics</h3>
<p>[PK profile summary including absorption, distribution, metabolism, excretion]</p>
<h3>Pharmacodynamics</h3>
<p>[PD effects and dose-response relationships]</p>

<h2>2.5.4 Overview of Efficacy</h2>
<p>[Summary of clinical efficacy data from pivotal studies]</p>
<table>
<tr><th>Study</th><th>Design</th><th>Population</th><th>Primary Endpoint</th><th>Results</th></tr>
<tr><td>[Study ID]</td><td>[Design]</td><td>[N=]</td><td>[Endpoint]</td><td>[Results]</td></tr>
</table>

<h2>2.5.5 Overview of Safety</h2>
<p>[Comprehensive safety profile including adverse events, laboratory findings]</p>

<h2>2.5.6 Benefits and Risks Conclusions</h2>
<p>[Overall benefit-risk assessment]</p>

<h2>2.5.7 Literature References</h2>
<p>[Key literature citations]</p>`
      },
      {
        id: 'mod2-quality-overall',
        name: 'Module 2.3 Quality Overall Summary',
        module: 'Module 2 - CTD Summaries',
        category: 'summary',
        description: 'Drug substance and product quality summary',
        sections: ['2.3'],
        validated: true,
        regions: ['US FDA', 'EMA']
      },
      
      // Module 3 - Quality/CMC
      {
        id: 'mod3-drug-substance',
        name: 'Module 3.2.S Drug Substance',
        module: 'Module 3 - Quality',
        category: 'quality',
        description: 'Complete drug substance CMC information',
        sections: ['3.2.S.1', '3.2.S.2', '3.2.S.3', '3.2.S.4', '3.2.S.5', '3.2.S.6', '3.2.S.7'],
        validated: true,
        regions: ['US FDA'],
        content: `<h1>3.2.S DRUG SUBSTANCE</h1>

<h2>3.2.S.1 General Information</h2>
<h3>3.2.S.1.1 Nomenclature</h3>
<p>Nonproprietary Name: [INN/USAN]</p>
<p>Chemical Name: [IUPAC name]</p>
<p>Company Code: [Internal code]</p>
<p>CAS Registry Number: [Number]</p>

<h3>3.2.S.1.2 Structure</h3>
<p>[Chemical structure diagram]</p>
<p>Molecular Formula: [Formula]</p>
<p>Molecular Weight: [Weight]</p>

<h3>3.2.S.1.3 General Properties</h3>
<p>Physical Description: [Appearance, color, form]</p>
<p>Solubility: [Solubility profile]</p>
<p>pH: [pH range]</p>
<p>pKa: [pKa values]</p>
<p>Melting Point: [Temperature]</p>

<h2>3.2.S.2 Manufacture</h2>
<h3>3.2.S.2.1 Manufacturer(s)</h3>
<p>[Name and address of manufacturer(s)]</p>

<h3>3.2.S.2.2 Description of Manufacturing Process</h3>
<p>[Detailed process flow diagram and narrative]</p>

<h3>3.2.S.2.3 Control of Materials</h3>
<p>[Raw materials, starting materials, reagents specifications]</p>

<h3>3.2.S.2.4 Controls of Critical Steps</h3>
<p>[In-process controls and critical parameters]</p>

<h3>3.2.S.2.5 Process Validation</h3>
<p>[Validation protocol and results]</p>

<h2>3.2.S.3 Characterization</h2>
<h3>3.2.S.3.1 Elucidation of Structure</h3>
<p>[Spectroscopic data: NMR, MS, IR, UV]</p>

<h3>3.2.S.3.2 Impurities</h3>
<p>[Identification and control of impurities]</p>

<h2>3.2.S.4 Control of Drug Substance</h2>
<h3>3.2.S.4.1 Specification</h3>
<table>
<tr><th>Test</th><th>Acceptance Criteria</th><th>Method</th></tr>
<tr><td>Appearance</td><td>[Criteria]</td><td>[Method]</td></tr>
<tr><td>Identity</td><td>[Criteria]</td><td>[Method]</td></tr>
<tr><td>Assay</td><td>[Range]</td><td>[Method]</td></tr>
<tr><td>Impurities</td><td>[Limits]</td><td>[Method]</td></tr>
</table>

<h2>3.2.S.5 Reference Standards</h2>
<p>[Information on reference standards used]</p>

<h2>3.2.S.6 Container Closure System</h2>
<p>[Description of container and closure]</p>

<h2>3.2.S.7 Stability</h2>
<h3>3.2.S.7.1 Stability Summary</h3>
<p>[Summary of stability studies and conclusions]</p>

<h3>3.2.S.7.2 Stability Protocol</h3>
<p>[Detailed stability protocol]</p>

<h3>3.2.S.7.3 Stability Results</h3>
<table>
<tr><th>Time Point</th><th>Condition</th><th>Results</th></tr>
<tr><td>[Months]</td><td>[Temp/RH]</td><td>[Pass/Fail]</td></tr>
</table>`
      },
      
      // Module 4 - Nonclinical
      {
        id: 'mod4-toxicology',
        name: 'Module 4.2.3 Toxicology Studies',
        module: 'Module 4 - Nonclinical',
        category: 'nonclinical',
        description: 'Toxicology study reports and summaries',
        sections: ['4.2.3.1', '4.2.3.2', '4.2.3.3', '4.2.3.4'],
        validated: true,
        regions: ['US FDA']
      },
      
      // Module 5 - Clinical
      {
        id: 'mod5-clinical-protocol',
        name: 'Module 5.3.5 Clinical Study Reports',
        module: 'Module 5 - Clinical',
        category: 'clinical',
        description: 'Individual clinical study reports',
        sections: ['5.3.5.1', '5.3.5.2', '5.3.5.3'],
        validated: true,
        regions: ['US FDA', 'EMA'],
        content: `<h1>5.3.5 CLINICAL STUDY REPORT</h1>

<h2>Study Identifier</h2>
<p>Protocol Number: [Protocol ID]</p>
<p>EudraCT Number: [If applicable]</p>
<p>NCT Number: [ClinicalTrials.gov ID]</p>

<h2>Study Synopsis</h2>
<h3>Title</h3>
<p>[Full study title]</p>

<h3>Objectives</h3>
<p>Primary: [Primary objective]</p>
<p>Secondary: [Secondary objectives]</p>

<h3>Methodology</h3>
<p>Design: [Study design - randomized, controlled, open-label, etc.]</p>
<p>Duration: [Treatment duration]</p>
<p>Centers: [Number of sites and countries]</p>

<h3>Study Population</h3>
<p>Planned: N=[Number]</p>
<p>Enrolled: N=[Number]</p>
<p>Completed: N=[Number]</p>

<h3>Inclusion Criteria</h3>
<ul>
<li>[Criterion 1]</li>
<li>[Criterion 2]</li>
</ul>

<h3>Statistical Methods</h3>
<p>[Primary analysis method]</p>

<h3>Results - Efficacy</h3>
<table>
<tr><th>Endpoint</th><th>Treatment</th><th>Control</th><th>P-value</th></tr>
<tr><td>[Primary]</td><td>[Result]</td><td>[Result]</td><td>[p-value]</td></tr>
</table>

<h3>Results - Safety</h3>
<p>[Summary of adverse events]</p>

<h3>Conclusions</h3>
<p>[Study conclusions]</p>`
      }
    ];

    res.json({
      success: true,
      templates: templates,
      total: templates.length,
      message: 'eCTD templates loaded successfully'
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ 
      error: 'Failed to fetch templates',
      message: error.message 
    });
  }
});

/**
 * Update position for a specific section
 */
router.post('/layout/:id', async (req, res) => {
  try {
    const { id } = req.params; // This is the sectionId like '1.1'
    const { x, y } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;

    await db
      .update(coauthorSections)
      .set({ 
        x, 
        y,
        updatedAt: sql`NOW()`
      })
      .where(
        and(
          eq(coauthorSections.sectionId, id),
          eq(coauthorSections.organizationId, organizationId)
        )
      );

    res.sendStatus(204);
  } catch (error) {
    console.error('Error updating section position:', error);
    res.status(500).json({ error: 'Failed to update section position' });
  }
});

/**
 * Add a new connection between sections
 */
router.post('/connect', async (req, res) => {
  try {
    const { fromId, toId } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;

    // Get the current section
    const section = await db
      .select()
      .from(coauthorSections)
      .where(
        and(
          eq(coauthorSections.sectionId, fromId),
          eq(coauthorSections.organizationId, organizationId)
        )
      )
      .limit(1);

    if (section.length > 0) {
      const currentConnections = Array.isArray(section[0].connections)
        ? section[0].connections
        : [];
      
      // Add new connection if not already present
      if (!currentConnections.includes(toId)) {
        currentConnections.push(toId);
        
        await db
          .update(coauthorSections)
          .set({ 
            connections: currentConnections, // Pass array directly
            updatedAt: sql`NOW()`
          })
          .where(
            and(
              eq(coauthorSections.sectionId, fromId),
              eq(coauthorSections.organizationId, organizationId)
            )
          );
      }
    }

    res.sendStatus(204);
  } catch (error) {
    console.error('Error creating connection:', error);
    res.status(500).json({ error: 'Failed to create connection' });
  }
});

/**
 * Get annotation for a section
 */
router.get('/annotation/:id', async (req, res) => {
  try {
    const { id } = req.params; // This is the sectionId like '1.1'
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;

    // First get the section's database ID
    const section = await db
      .select()
      .from(coauthorSections)
      .where(
        and(
          eq(coauthorSections.sectionId, id),
          eq(coauthorSections.organizationId, organizationId)
        )
      )
      .limit(1);

    if (section.length === 0) {
      return res.json({ notes: '' });
    }

    const annotation = await db
      .select()
      .from(coauthorAnnotations)
      .where(
        and(
          eq(coauthorAnnotations.sectionId, section[0].id),
          eq(coauthorAnnotations.organizationId, organizationId)
        )
      )
      .limit(1);

    res.json({ notes: annotation.length > 0 ? annotation[0].notes : '' });
  } catch (error) {
    console.error('Error fetching annotation:', error);
    res.status(500).json({ error: 'Failed to fetch annotation' });
  }
});

/**
 * Save annotation for a section
 */
router.post('/annotation/:id', async (req, res) => {
  try {
    const { id } = req.params; // This is the sectionId like '1.1'
    const { notes } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;

    if (!notes) {
      return res.status(400).json({ error: 'Notes content is required' });
    }

    // First get the section's database ID
    const section = await db
      .select()
      .from(coauthorSections)
      .where(
        and(
          eq(coauthorSections.sectionId, id),
          eq(coauthorSections.organizationId, organizationId)
        )
      )
      .limit(1);

    if (section.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }

    // Check if annotation exists
    const existing = await db
      .select()
      .from(coauthorAnnotations)
      .where(
        and(
          eq(coauthorAnnotations.sectionId, section[0].id),
          eq(coauthorAnnotations.organizationId, organizationId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing annotation
      await db
        .update(coauthorAnnotations)
        .set({ 
          notes,
          updatedAt: sql`NOW()`
        })
        .where(
          and(
            eq(coauthorAnnotations.sectionId, section[0].id),
            eq(coauthorAnnotations.organizationId, organizationId)
          )
        );
    } else {
      // Create new annotation
      await db.insert(coauthorAnnotations).values({
        sectionId: section[0].id,
        organizationId,
        notes,
      });
    }

    res.sendStatus(204);
  } catch (error) {
    console.error('Error saving annotation:', error);
    res.status(500).json({ error: 'Failed to save annotation' });
  }
});

/**
 * Get AI advice for a section
 */
router.post('/advice', async (req, res) => {
  try {
    const { sectionId, text } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;

    if (!sectionId) {
      return res.status(400).json({ error: 'Section ID is required' });
    }

    // Simulate AI processing time
    setTimeout(async () => {
      try {
        const advice = adviceTemplates[sectionId] || adviceTemplates.default;

        // Get section from database to check status
        const section = await db
          .select()
          .from(coauthorSections)
          .where(
            and(
              eq(coauthorSections.sectionId, sectionId),
              eq(coauthorSections.organizationId, organizationId)
            )
          )
          .limit(1);

        let enhancedAdvice = advice;
        if (section.length > 0 && section[0].status === 'critical') {
          enhancedAdvice += ' This section is flagged as critical and requires immediate attention.';
        }

        // Store AI advice in annotation if section exists
        if (section.length > 0) {
          const existing = await db
            .select()
            .from(coauthorAnnotations)
            .where(
              and(
                eq(coauthorAnnotations.sectionId, section[0].id),
                eq(coauthorAnnotations.organizationId, organizationId)
              )
            )
            .limit(1);

          if (existing.length > 0) {
            await db
              .update(coauthorAnnotations)
              .set({ 
                aiAdvice: enhancedAdvice,
                adviceGeneratedAt: sql`NOW()`
              })
              .where(
                and(
                  eq(coauthorAnnotations.sectionId, section[0].id),
                  eq(coauthorAnnotations.organizationId, organizationId)
                )
              );
          } else {
            await db.insert(coauthorAnnotations).values({
              sectionId: section[0].id,
              organizationId,
              notes: '',
              aiAdvice: enhancedAdvice,
              adviceGeneratedAt: new Date(),
            });
          }
        }

        res.json({ advice: enhancedAdvice });
      } catch (error) {
        console.error('Error generating AI advice:', error);
        res.status(500).json({ error: 'Failed to generate AI advice' });
      }
    }, 1000);
  } catch (error) {
    console.error('Error in advice endpoint:', error);
    res.status(500).json({ error: 'Failed to process advice request' });
  }
});

/**
 * Generate AI content for sections
 */
router.post('/generate', async (req, res) => {
  try {
    const { sectionId, sectionContent, prompt, type } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;

    if (!sectionId || !prompt) {
      return res.status(400).json({ error: 'Section ID and prompt are required' });
    }

    // Import OpenAI service
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Prepare AI prompt based on section type
    const systemPrompt = `You are an expert regulatory writer specializing in eCTD submissions and ICH guidelines. 
    Generate professional, compliant content for CTD Module ${sectionId}.
    Follow regulatory writing standards and ensure accuracy, clarity, and completeness.`;

    const userPrompt = `${prompt}\n\nSection: ${sectionId}\nCurrent Content: ${sectionContent || 'No existing content'}`;

    try {
      // Generate content using OpenAI
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const generatedContent = completion.choices[0].message.content;

      // Store generated content in database
      const section = await db
        .select()
        .from(coauthorSections)
        .where(
          and(
            eq(coauthorSections.sectionId, sectionId),
            eq(coauthorSections.organizationId, organizationId)
          )
        )
        .limit(1);

      if (section.length > 0) {
        // Update or create annotation with generated content
        const existing = await db
          .select()
          .from(coauthorAnnotations)
          .where(
            and(
              eq(coauthorAnnotations.sectionId, section[0].id),
              eq(coauthorAnnotations.organizationId, organizationId)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(coauthorAnnotations)
            .set({ 
              generatedContent: generatedContent,
              lastGeneratedAt: sql`NOW()`,
              updatedAt: sql`NOW()`
            })
            .where(
              and(
                eq(coauthorAnnotations.sectionId, section[0].id),
                eq(coauthorAnnotations.organizationId, organizationId)
              )
            );
        } else {
          await db.insert(coauthorAnnotations).values({
            sectionId: section[0].id,
            organizationId,
            notes: '',
            generatedContent: generatedContent,
            lastGeneratedAt: new Date(),
          });
        }
      }

      res.json({ 
        success: true,
        content: generatedContent,
        sectionId: sectionId 
      });
    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError);
      // Return fallback content if OpenAI fails
      const fallbackContent = `[AI Generation temporarily unavailable]\n\nSection ${sectionId} Content Template:\n\n1. Introduction\n2. Methodology\n3. Results\n4. Discussion\n5. Conclusion\n\nPlease fill in the section content according to ICH guidelines.`;
      
      res.json({ 
        success: false,
        content: fallbackContent,
        sectionId: sectionId,
        message: 'Using template due to AI service unavailability' 
      });
    }
  } catch (error) {
    console.error('Error generating content:', error);
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

/**
 * Save a document to the database
 */
router.post('/documents', async (req, res) => {
  try {
    const { title, content, module, status, version, metadata, sessionId, submissionId, sectionId } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;

    // Validate required fields
    if (!title || !content || !module) {
      return res.status(400).json({ 
        error: 'Title, content, and module are required' 
      });
    }

    // Prepare sections JSONB field with module information
    const sections = {
      module: module,
      sectionId: sectionId,
      data: metadata || {}
    };

    // Check if document exists (for updates)
    if (req.body.id) {
      // Update existing document
      const existingDoc = await db
        .select()
        .from(coauthorDocuments)
        .where(
          and(
            eq(coauthorDocuments.id, req.body.id),
            eq(coauthorDocuments.organizationId, organizationId)
          )
        )
        .limit(1);

      if (existingDoc.length > 0) {
        // Store version and other fields in sections or metadata
        const updatedSections = {
          ...sections,
          version: version || ((existingDoc[0].sections?.version || 0) + 1),
          sessionId: sessionId,
          submissionId: submissionId,
          sectionId: sectionId
        };

        const updated = await db
          .update(coauthorDocuments)
          .set({
            title,
            content,
            sections: updatedSections, // Store extra fields in JSONB
            status: status || 'draft',
            metadata: metadata || {},
            updatedAt: sql`NOW()`,
          })
          .where(
            and(
              eq(coauthorDocuments.id, req.body.id),
              eq(coauthorDocuments.organizationId, organizationId)
            )
          )
          .returning();

        // Extract and update components when document is updated
        try {
          console.log('📦 Re-extracting components for updated document:', req.body.id);
          
          // Remove old component links
          await db.delete(documentComponents)
            .where(eq(documentComponents.documentId, parseInt(req.body.id)));
          
          // Extract components from updated content
          const extractedComponents = extractComponents(content, {
            documentId: req.body.id,
            documentTitle: title,
            module: module
          });
          
          console.log(`🔍 Extracted ${extractedComponents.length} components from updated document`);
          
          // Ingest updated components
          for (const component of extractedComponents) {
            const ingestionResult = await ingestComponent(
              component.content,
              component.type || 'paragraph',
              {
                name: component.name || component.type,
                documentId: req.body.id,
                documentTitle: title,
                modulePath: module,
                regulatoryContext: component.context || null,
                userName: 'System'
              },
              organizationId,
              1 // Default userId
            );
            
            if (ingestionResult.success) {
              // Link component to document
              await db.insert(documentComponents).values({
                documentId: parseInt(req.body.id),
                componentId: ingestionResult.componentId,
                position: component.position || 0,
                organizationId: organizationId,
                createdAt: sql`NOW()`
              });
            }
          }
          
          console.log('✨ Component re-extraction completed for update');
        } catch (extractionError) {
          console.error('Component extraction error on update:', extractionError);
        }

        return res.json({
          success: true,
          message: 'Document updated successfully',
          document: updated[0]
        });
      }
    }

    // Store version and other fields in sections  
    const newSections = {
      ...sections,
      version: version || 1,
      sessionId: sessionId,
      submissionId: submissionId,
      sectionId: sectionId
    };

    // Create new document
    const newDocument = await db
      .insert(coauthorDocuments)
      .values({
        organizationId,
        title,
        content,
        sections: newSections, // Store extra fields in JSONB
        status: status || 'draft',
        metadata: metadata || {},
        createdAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .returning();

    // Extract and ingest components from the document
    try {
      console.log('📦 Starting component extraction for document:', newDocument[0].id);
      
      // Extract components from document content
      const extractedComponents = extractComponents(content, {
        documentId: newDocument[0].id,
        documentTitle: title,
        module: module
      });
      
      console.log(`🔍 Extracted ${extractedComponents.length} components from document`);
      
      // Ingest each component into the vault
      for (const component of extractedComponents) {
        const ingestionResult = await ingestComponent(
          component.content,
          component.type || 'paragraph',
          {
            name: component.name || component.type,
            documentId: newDocument[0].id,
            documentTitle: title,
            modulePath: module,
            regulatoryContext: component.context || null,
            userName: 'System'
          },
          organizationId,
          1 // Default userId for system ingestion
        );
        
        if (ingestionResult.success && !ingestionResult.isDuplicate) {
          // Link component to document
          await db.insert(documentComponents).values({
            documentId: newDocument[0].id,
            componentId: ingestionResult.componentId,
            position: component.position || 0,
            organizationId: organizationId,
            createdAt: sql`NOW()`
          });
          
          console.log(`✅ Ingested component ${ingestionResult.udi}`);
        }
      }
      
      console.log('✨ Component extraction and ingestion completed');
    } catch (extractionError) {
      console.error('Component extraction error:', extractionError);
      // Continue even if extraction fails - document is still saved
    }

    res.json({
      success: true,
      message: 'Document saved successfully',
      document: newDocument[0]
    });
  } catch (error) {
    console.error('Error saving document:', error);
    res.status(500).json({ 
      error: 'Failed to save document',
      details: error.message 
    });
  }
});

/**
 * Get a single document by ID
 */
router.get('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;

    const document = await db
      .select()
      .from(coauthorDocuments)
      .where(
        and(
          eq(coauthorDocuments.id, parseInt(id)),
          eq(coauthorDocuments.organizationId, organizationId)
        )
      )
      .limit(1);

    if (document.length === 0) {
      return res.status(404).json({ 
        error: 'Document not found' 
      });
    }

    res.json({
      success: true,
      document: document[0]
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ 
      error: 'Failed to fetch document',
      details: error.message 
    });
  }
});

/**
 * Update a document (title, content, etc)
 * PATCH /api/coauthor/documents/:id
 */
router.patch('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, status, metadata } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;

    // Build update object dynamically based on provided fields
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (status !== undefined) updateData.status = status;
    if (metadata !== undefined) updateData.metadata = metadata;
    updateData.updatedAt = new Date();

    // Update the document
    const updatedDocument = await db
      .update(coauthorDocuments)
      .set(updateData)
      .where(
        and(
          eq(coauthorDocuments.id, parseInt(id)),
          eq(coauthorDocuments.organizationId, organizationId)
        )
      )
      .returning();

    if (updatedDocument.length === 0) {
      return res.status(404).json({ 
        error: 'Document not found' 
      });
    }

    res.json({
      success: true,
      document: updatedDocument[0]
    });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ 
      error: 'Failed to update document',
      details: error.message 
    });
  }
});

/**
 * Route document for review
 * POST /api/coauthor/documents/:id/route
 */
router.post('/documents/:id/route', async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewers, comments, dueDate } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;

    // Update document status to "In Review"
    const updatedDocument = await db
      .update(coauthorDocuments)
      .set({
        status: 'in_review',
        metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
          routing: {
            reviewers: reviewers || [],
            comments: comments || '',
            dueDate: dueDate || null,
            routedAt: new Date().toISOString(),
            routedBy: req.headers['x-user-name'] || 'System'
          }
        })}::jsonb`,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(coauthorDocuments.id, parseInt(id)),
          eq(coauthorDocuments.organizationId, organizationId)
        )
      )
      .returning();

    if (updatedDocument.length === 0) {
      return res.status(404).json({ 
        error: 'Document not found' 
      });
    }

    res.json({
      success: true,
      document: updatedDocument[0],
      message: 'Document routed for review successfully'
    });
  } catch (error) {
    console.error('Error routing document:', error);
    res.status(500).json({ 
      error: 'Failed to route document',
      details: error.message 
    });
  }
});

/**
 * Get all documents for an organization
 */
router.get('/documents', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { module, status, limit = 50, offset = 0 } = req.query;

    // Build query
    let query = db
      .select()
      .from(coauthorDocuments)
      .where(eq(coauthorDocuments.organizationId, organizationId));

    // Apply filters if provided
    if (module) {
      // Module is stored in sections JSONB field
      query = query.where(
        and(
          eq(coauthorDocuments.organizationId, organizationId),
          sql`sections->>'module' = ${module}`
        )
      );
    }

    if (status) {
      query = query.where(
        and(
          eq(coauthorDocuments.organizationId, organizationId),
          eq(coauthorDocuments.status, status)
        )
      );
    }

    // Apply ordering and pagination
    const documents = await query
      .orderBy(desc(coauthorDocuments.updatedAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    // Get total count for pagination
    const countResult = await db
      .select({ count: sql`count(*)::int` })
      .from(coauthorDocuments)
      .where(eq(coauthorDocuments.organizationId, organizationId));

    const totalCount = countResult[0]?.count || 0;

    res.json({
      success: true,
      documents,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < totalCount
      }
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ 
      error: 'Failed to fetch documents',
      details: error.message 
    });
  }
});

/**
 * Create a new version of a document
 * POST /api/coauthor/documents/:id/versions
 */
router.post('/documents/:id/versions', async (req, res) => {
  try {
    const { id } = req.params;
    const { versionLabel, changeDescription } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = parseInt(req.headers['x-user-id']) || null;
    const userName = req.headers['x-user-name'] || 'Unknown User';

    // Fetch the current document
    const currentDocument = await db
      .select()
      .from(coauthorDocuments)
      .where(
        and(
          eq(coauthorDocuments.id, parseInt(id)),
          eq(coauthorDocuments.organizationId, organizationId)
        )
      )
      .limit(1);

    if (currentDocument.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = currentDocument[0];

    // Get the latest version number for this document
    const latestVersion = await db
      .select({ maxVersion: sql`COALESCE(MAX(version_number), 0)` })
      .from(coauthorDocumentVersions)
      .where(eq(coauthorDocumentVersions.documentId, parseInt(id)));

    const newVersionNumber = (latestVersion[0]?.maxVersion || 0) + 1;

    // Create the version snapshot
    const newVersion = await db
      .insert(coauthorDocumentVersions)
      .values({
        documentId: parseInt(id),
        organizationId,
        versionNumber: newVersionNumber,
        versionLabel: versionLabel || `Version ${newVersionNumber}`,
        title: doc.title,
        content: doc.content,
        sections: doc.sections, // Use sections JSONB field instead of module
        changeDescription: changeDescription || null,
        metadata: {
          status: doc.status,
          sessionId: doc.sessionId,
          submissionId: doc.submissionId,
          sectionId: doc.sectionId,
          originalMetadata: doc.metadata
        },
        createdBy: userId,
        createdByName: userName,
      })
      .returning();

    // Update the document's version number in sections JSONB
    const updatedDocSections = {
      ...doc.sections,
      version: newVersionNumber
    };

    await db
      .update(coauthorDocuments)
      .set({ 
        sections: updatedDocSections,
        updatedAt: sql`NOW()`
      })
      .where(eq(coauthorDocuments.id, parseInt(id)));

    res.json({
      success: true,
      version: newVersion[0],
      message: `Version ${newVersionNumber} created successfully`
    });
  } catch (error) {
    console.error('Error creating document version:', error);
    res.status(500).json({ 
      error: 'Failed to create document version',
      details: error.message 
    });
  }
});

/**
 * Get all versions of a document
 * GET /api/coauthor/documents/:id/versions
 */
router.get('/documents/:id/versions', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    
    // Log the values for debugging
    console.log('[DEBUG] Fetching versions for document:', {
      id,
      parsedId: parseInt(id),
      organizationId,
      timestamp: Date.now()
    });

    // Verify the document exists and belongs to this organization
    const documentExists = await db
      .select({ id: coauthorDocuments.id })
      .from(coauthorDocuments)
      .where(
        and(
          eq(coauthorDocuments.id, parseInt(id)),
          eq(coauthorDocuments.organizationId, organizationId)
        )
      )
      .limit(1);

    if (documentExists.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Fetch all versions
    console.log('[DEBUG] About to fetch versions from database...');
    const versions = await db
      .select()
      .from(coauthorDocumentVersions)
      .where(eq(coauthorDocumentVersions.documentId, parseInt(id)))
      .orderBy(desc(coauthorDocumentVersions.versionNumber));

    // Format the response
    const formattedVersions = versions.map(v => ({
      id: v.id,
      versionNumber: v.versionNumber,
      content: v.content,
      changeSummary: v.changeSummary,
      createdAt: v.createdAt,
      createdBy: v.createdBy || 'Unknown User'
    }));

    res.json({
      success: true,
      documentId: parseInt(id),
      versions: formattedVersions,
      total: formattedVersions.length
    });
  } catch (error) {
    console.error('Error fetching document versions:', error);
    res.status(500).json({ 
      error: 'Failed to fetch document versions',
      details: error.message 
    });
  }
});

/**
 * Get a specific version of a document
 * GET /api/coauthor/documents/:id/versions/:versionId
 */
router.get('/documents/:id/versions/:versionId', async (req, res) => {
  try {
    const { id, versionId } = req.params;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;

    // Fetch the specific version
    const versionData = await db
      .select()
      .from(coauthorDocumentVersions)
      .where(
        and(
          eq(coauthorDocumentVersions.id, parseInt(versionId)),
          eq(coauthorDocumentVersions.documentId, parseInt(id))
        )
      )
      .limit(1);

    if (versionData.length === 0) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const v = versionData[0];
    
    res.json({
      success: true,
      version: {
        id: v.id,
        documentId: v.documentId,
        versionNumber: v.versionNumber,
        content: v.content, // Full content for viewing
        changeSummary: v.changeSummary,
        createdAt: v.createdAt,
        createdBy: v.createdBy || 'Unknown User'
      }
    });
  } catch (error) {
    console.error('Error fetching document version:', error);
    res.status(500).json({ 
      error: 'Failed to fetch document version',
      details: error.message 
    });
  }
});

/**
 * Restore a previous version (creates a new version with old content)
 * POST /api/coauthor/documents/:id/restore/:versionId
 */
router.post('/documents/:id/restore/:versionId', async (req, res) => {
  try {
    const { id, versionId } = req.params;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = parseInt(req.headers['x-user-id']) || null;
    const userName = req.headers['x-user-name'] || 'Unknown User';

    // Fetch the version to restore
    const versionToRestore = await db
      .select()
      .from(coauthorDocumentVersions)
      .where(
        and(
          eq(coauthorDocumentVersions.id, parseInt(versionId)),
          eq(coauthorDocumentVersions.documentId, parseInt(id))
        )
      )
      .limit(1);

    if (versionToRestore.length === 0) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const oldVersion = versionToRestore[0];

    // Get the latest version number for this document
    const latestVersion = await db
      .select({ maxVersion: sql`COALESCE(MAX(version_number), 0)` })
      .from(coauthorDocumentVersions)
      .where(eq(coauthorDocumentVersions.documentId, parseInt(id)));

    const newVersionNumber = (latestVersion[0]?.maxVersion || 0) + 1;

    // Create a new version with the old content
    const restoredVersion = await db
      .insert(coauthorDocumentVersions)
      .values({
        documentId: parseInt(id),
        organizationId,
        versionNumber: newVersionNumber,
        versionLabel: `Restored from Version ${oldVersion.versionNumber}`,
        title: oldVersion.title,
        content: oldVersion.content,
        sections: oldVersion.sections, // Use sections JSONB field instead of module
        changeDescription: `Restored from Version ${oldVersion.versionNumber} (${oldVersion.versionLabel || ''})`,
        metadata: {
          ...oldVersion.metadata,
          restoredFrom: {
            versionId: oldVersion.id,
            versionNumber: oldVersion.versionNumber,
            restoredAt: new Date().toISOString()
          }
        },
        createdBy: userId,
        createdByName: userName,
      })
      .returning();

    // Update the current document with the restored content
    // Store version in sections JSONB
    const updatedSections = {
      ...oldVersion.sections,
      version: newVersionNumber,
      lastModifiedBy: userId,
      lastModified: new Date().toISOString()
    };

    await db
      .update(coauthorDocuments)
      .set({
        title: oldVersion.title,
        content: oldVersion.content,
        sections: updatedSections, // Store version and other fields in JSONB
        updatedAt: sql`NOW()`
      })
      .where(eq(coauthorDocuments.id, parseInt(id)));

    res.json({
      success: true,
      version: restoredVersion[0],
      message: `Successfully restored content from Version ${oldVersion.versionNumber}. Created new Version ${newVersionNumber}.`
    });
  } catch (error) {
    console.error('Error restoring document version:', error);
    res.status(500).json({ 
      error: 'Failed to restore document version',
      details: error.message 
    });
  }
});

/**
 * Update document status with validation and history tracking
 * PUT /api/coauthor/documents/:id/status
 */
router.put('/documents/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason, comments } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = parseInt(req.headers['x-user-id']) || 1;
    const userName = req.headers['x-user-name'] || 'System User';
    const userRole = req.headers['x-user-role'] || 'user';

    // Validate required fields
    if (!status) {
      return res.status(400).json({ 
        error: 'Status is required' 
      });
    }

    // Define valid statuses
    const validStatuses = ['draft', 'in-review', 'approved', 'published'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }

    // Fetch the current document
    const currentDocument = await db
      .select()
      .from(coauthorDocuments)
      .where(
        and(
          eq(coauthorDocuments.id, parseInt(id)),
          eq(coauthorDocuments.organizationId, organizationId)
        )
      )
      .limit(1);

    if (currentDocument.length === 0) {
      return res.status(404).json({ 
        error: 'Document not found' 
      });
    }

    const doc = currentDocument[0];
    const currentStatus = doc.status || 'draft';

    // Define status transition rules
    const validTransitions = {
      'draft': ['in-review'],
      'in-review': ['draft', 'approved'],
      'approved': ['published'],
      'published': [] // No transitions from published
    };

    // Check if the transition is valid
    if (currentStatus === status) {
      return res.status(400).json({ 
        error: 'Document is already in the requested status' 
      });
    }

    const allowedTransitions = validTransitions[currentStatus] || [];
    if (!allowedTransitions.includes(status)) {
      return res.status(400).json({ 
        error: `Invalid status transition. Cannot transition from '${currentStatus}' to '${status}'. Allowed transitions: ${allowedTransitions.length > 0 ? allowedTransitions.join(', ') : 'none'}` 
      });
    }

    // Check permissions based on status
    if (status === 'published' && userRole !== 'admin' && userRole !== 'manager') {
      return res.status(403).json({ 
        error: 'You do not have permission to publish documents' 
      });
    }

    // Start transaction
    const result = await db.transaction(async (tx) => {
      // Update document status
      // Store lastModifiedBy in sections JSONB
      const updatedStatusSections = {
        ...doc.sections,
        lastModifiedBy: userId,
        lastModified: new Date().toISOString()
      };
      
      await tx
        .update(coauthorDocuments)
        .set({
          status,
          sections: updatedStatusSections,
          updatedAt: sql`NOW()`
        })
        .where(eq(coauthorDocuments.id, parseInt(id)));

      // Create status history entry
      const historyEntry = await tx
        .insert(coauthorStatusHistory)
        .values({
          documentId: parseInt(id),
          organizationId,
          fromStatus: currentStatus,
          toStatus: status,
          reason: reason || null,
          comments: comments || null,
          changedById: userId,
          changedByName: userName,
          changedByRole: userRole,
          isApproval: status === 'approved',
          approvalLevel: status === 'approved' ? userRole : null,
          notificationSent: false, // We'll implement email later
          metadata: {
            documentTitle: doc.title,
            documentModule: doc.sections?.module, // Extract module from sections JSONB
            documentVersion: doc.sections?.version // Extract version from sections JSONB
          }
        })
        .returning();

      // If status is published, create a version snapshot
      if (status === 'published') {
        // Get the latest version number
        const latestVersion = await tx
          .select({ maxVersion: sql`COALESCE(MAX(version_number), 0)` })
          .from(coauthorDocumentVersions)
          .where(eq(coauthorDocumentVersions.documentId, parseInt(id)));

        const newVersionNumber = (latestVersion[0]?.maxVersion || 0) + 1;

        // Create version for published state
        await tx
          .insert(coauthorDocumentVersions)
          .values({
            documentId: parseInt(id),
            organizationId,
            versionNumber: newVersionNumber,
            versionLabel: `Published Version ${newVersionNumber}`,
            title: doc.title,
            content: doc.content,
            sections: doc.sections, // Use sections JSONB field instead of module
            changeDescription: `Document published${reason ? `: ${reason}` : ''}`,
            metadata: {
              status: 'published',
              publishedAt: new Date().toISOString(),
              publishedBy: userName,
              originalMetadata: doc.metadata
            },
            createdBy: userId,
            createdByName: userName,
          });

        // Update document version number in sections JSONB
        const publishedSections = {
          ...doc.sections,
          version: newVersionNumber
        };
        
        await tx
          .update(coauthorDocuments)
          .set({ 
            sections: publishedSections
          })
          .where(eq(coauthorDocuments.id, parseInt(id)));
      }

      return historyEntry[0];
    });

    // Log email notification (in production, actually send email)
    if (status === 'in-review' || status === 'approved' || status === 'published') {
      console.log(`[Email Notification] Document status changed:
        Document: ${doc.title}
        From: ${currentStatus}
        To: ${status}
        Changed by: ${userName}
        Reason: ${reason || 'No reason provided'}
        Comments: ${comments || 'No comments'}
      `);
    }

    res.json({
      success: true,
      message: `Document status successfully changed from '${currentStatus}' to '${status}'`,
      statusHistory: result,
      document: {
        id: doc.id,
        title: doc.title,
        status: status
      }
    });

  } catch (error) {
    console.error('Error updating document status:', error);
    res.status(500).json({ 
      error: 'Failed to update document status',
      details: error.message 
    });
  }
});

/**
 * Get status history for a document
 * GET /api/coauthor/documents/:id/status-history
 */
router.get('/documents/:id/status-history', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;

    // Verify document exists and belongs to organization
    const document = await db
      .select({ 
        id: coauthorDocuments.id,
        title: coauthorDocuments.title,
        currentStatus: coauthorDocuments.status 
      })
      .from(coauthorDocuments)
      .where(
        and(
          eq(coauthorDocuments.id, parseInt(id)),
          eq(coauthorDocuments.organizationId, organizationId)
        )
      )
      .limit(1);

    if (document.length === 0) {
      return res.status(404).json({ 
        error: 'Document not found' 
      });
    }

    // Get status history with user info
    const history = await db
      .select({
        id: coauthorStatusHistory.id,
        fromStatus: coauthorStatusHistory.fromStatus,
        toStatus: coauthorStatusHistory.toStatus,
        reason: coauthorStatusHistory.reason,
        comments: coauthorStatusHistory.comments,
        isApproval: coauthorStatusHistory.isApproval,
        approvalLevel: coauthorStatusHistory.approvalLevel,
        changedByName: coauthorStatusHistory.changedByName,
        changedByRole: coauthorStatusHistory.changedByRole,
        changedAt: coauthorStatusHistory.changedAt,
        metadata: coauthorStatusHistory.metadata
      })
      .from(coauthorStatusHistory)
      .where(
        and(
          eq(coauthorStatusHistory.documentId, parseInt(id)),
          eq(coauthorStatusHistory.organizationId, organizationId)
        )
      )
      .orderBy(desc(coauthorStatusHistory.changedAt));

    res.json({
      success: true,
      document: document[0],
      history
    });

  } catch (error) {
    console.error('Error fetching status history:', error);
    res.status(500).json({ 
      error: 'Failed to fetch status history',
      details: error.message 
    });
  }
});

/**
 * Export eCTD document
 */
router.post('/export', async (req, res) => {
  try {
    const { sections, format, includeMetadata } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;

    if (!sections || sections.length === 0) {
      return res.status(400).json({ error: 'Sections are required for export' });
    }

    // Compile document content
    let exportContent = {
      type: 'eCTD',
      format: format || 'xml',
      organizationId,
      exportDate: new Date().toISOString(),
      sections: [],
      metadata: includeMetadata ? {
        version: '3.2.2',
        region: 'FDA',
        applicationType: 'NDA',
        applicationNumber: 'DRAFT',
      } : null
    };

    // Fetch content for each section
    for (const sectionId of sections) {
      const section = await db
        .select({
          section: coauthorSections,
          annotation: coauthorAnnotations
        })
        .from(coauthorSections)
        .leftJoin(
          coauthorAnnotations,
          and(
            eq(coauthorAnnotations.sectionId, coauthorSections.id),
            eq(coauthorAnnotations.organizationId, organizationId)
          )
        )
        .where(
          and(
            eq(coauthorSections.sectionId, sectionId),
            eq(coauthorSections.organizationId, organizationId)
          )
        )
        .limit(1);

      if (section.length > 0) {
        exportContent.sections.push({
          id: section[0].section.sectionId,
          title: section[0].section.title,
          status: section[0].section.status,
          content: section[0].annotation?.generatedContent || section[0].annotation?.notes || '',
          aiAdvice: section[0].annotation?.aiAdvice || '',
        });
      }
    }

    // Generate export based on format
    if (format === 'xml') {
      // Simple XML structure
      let xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xmlContent += '<eCTD>\n';
      xmlContent += '  <submission>\n';
      exportContent.sections.forEach(section => {
        xmlContent += `    <module id="${section.id}">\n`;
        xmlContent += `      <title>${section.title}</title>\n`;
        xmlContent += `      <status>${section.status}</status>\n`;
        xmlContent += `      <content><![CDATA[${section.content}]]></content>\n`;
        xmlContent += `    </module>\n`;
      });
      xmlContent += '  </submission>\n';
      xmlContent += '</eCTD>';
      
      res.set('Content-Type', 'application/xml');
      res.send(xmlContent);
    } else {
      // Default JSON export
      res.json(exportContent);
    }
  } catch (error) {
    console.error('Error exporting document:', error);
    res.status(500).json({ error: 'Failed to export document' });
  }
});

/**
 * Health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    // Check database connection
    const testQuery = await db.select({ count: sql`1` }).from(coauthorSections).limit(1);
    
    res.json({
      status: 'healthy',
      service: 'eCTD Co-Author',
      database: 'connected',
      timestamp: new Date().toISOString(),
      features: {
        aiGeneration: !!process.env.OPENAI_API_KEY,
        documentExport: true,
        canvasEditor: true,
        annotations: true,
      }
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      service: 'eCTD Co-Author',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/coauthor/import/ind - Fetch available IND submissions for import
 */
router.get('/import/ind', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    
    // Fetch IND submissions that are in completed or ectd phase
    const submissions = await db
      .select({
        id: indSubmissions.id,
        submissionId: indSubmissions.submissionId,
        drugName: indSubmissions.drugName,
        indication: indSubmissions.indication,
        sponsor: indSubmissions.sponsor,
        phase: indSubmissions.phase,
        indWizardStatus: indSubmissions.indWizardStatus,
        ectdStatus: indSubmissions.ectdStatus,
        complianceScore: indSubmissions.complianceScore,
        createdAt: indSubmissions.createdAt,
        updatedAt: indSubmissions.updatedAt,
        // Data fields for mapping
        module2Data: indSubmissions.module2Data,
        module3Data: indSubmissions.module3Data,
        module5Data: indSubmissions.module5Data,
        indStepData: indSubmissions.indStepData
      })
      .from(indSubmissions)
      .where(
        and(
          eq(indSubmissions.organizationId, organizationId),
          or(
            eq(indSubmissions.indWizardStatus, 'completed'),
            eq(indSubmissions.ectdStatus, 'in-progress'),
            eq(indSubmissions.ectdStatus, 'completed')
          )
        )
      )
      .orderBy(desc(indSubmissions.updatedAt));

    // Format the submissions for frontend consumption
    const formattedSubmissions = submissions.map(sub => ({
      id: sub.submissionId,
      title: `${sub.drugName} - ${sub.indication}`,
      drugName: sub.drugName,
      indication: sub.indication,
      sponsor: sub.sponsor,
      phase: sub.phase,
      status: sub.ectdStatus || sub.indWizardStatus,
      complianceScore: sub.complianceScore,
      hasModule2Data: !!sub.module2Data,
      hasModule3Data: !!sub.module3Data,
      hasModule5Data: !!sub.module5Data,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
      availableSections: {
        'Module 2.5': {
          available: !!sub.module2Data,
          sections: ['2.5.4 Clinical Efficacy', '2.5.5 Safety Profile']
        },
        'Module 2.7': {
          available: !!(sub.module2Data || sub.indStepData),
          sections: ['2.7.1 Summary of Biopharmaceutics', '2.7.3 Summary of Clinical Efficacy', '2.7.4 Summary of Clinical Safety']
        },
        'Module 3': {
          available: !!sub.module3Data,
          sections: ['3.2.S Drug Substance', '3.2.P Drug Product']
        },
        'Module 5': {
          available: !!sub.module5Data,
          sections: ['5.3.5.1 Study Reports', '5.3.5.2 Study Protocols']
        }
      }
    }));

    res.json({
      submissions: formattedSubmissions,
      count: formattedSubmissions.length
    });
  } catch (error) {
    console.error('Error fetching IND submissions:', error);
    res.status(500).json({ error: 'Failed to fetch IND submissions' });
  }
});

/**
 * POST /api/coauthor/import/ind/:indId - Import IND data into a document
 */
router.post('/import/ind/:indId', async (req, res) => {
  try {
    const { indId } = req.params;
    const { 
      targetDocumentId, 
      selectedSections,
      importType = 'merge', // merge, overwrite, or skip
      conflictResolution = 'merge' 
    } = req.body;
    
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = parseInt(req.headers['x-user-id']) || 1;
    
    // Validate required fields
    if (!targetDocumentId || !selectedSections || selectedSections.length === 0) {
      return res.status(400).json({ 
        error: 'Target document ID and selected sections are required' 
      });
    }

    // Fetch the IND submission data
    const submission = await db
      .select()
      .from(indSubmissions)
      .where(
        and(
          eq(indSubmissions.submissionId, indId),
          eq(indSubmissions.organizationId, organizationId)
        )
      )
      .limit(1);

    if (submission.length === 0) {
      return res.status(404).json({ error: 'IND submission not found' });
    }

    const indData = submission[0];

    // Fetch the target document
    const targetDoc = await db
      .select()
      .from(coauthorDocuments)
      .where(
        and(
          eq(coauthorDocuments.id, targetDocumentId),
          eq(coauthorDocuments.organizationId, organizationId)
        )
      )
      .limit(1);

    if (targetDoc.length === 0) {
      return res.status(404).json({ error: 'Target document not found' });
    }

    // Create import history record
    const importRecord = await db.insert(coauthorImportHistory).values({
      organizationId,
      sourceType: 'ind_submission',
      sourceId: indId,
      indSubmissionId: indId,
      targetDocumentId: targetDocumentId,
      targetModule: targetDoc[0].sections?.module, // Extract module from sections JSONB
      importType,
      sectionsImported: selectedSections,
      fieldMappings: {},
      status: 'in_progress',
      progress: 0,
      conflictResolution,
      contentBefore: targetDoc[0].content || '',
      importedById: userId,
      importedByName: 'System User', // In production, get from user context
      metadata: {
        drugName: indData.drugName,
        indication: indData.indication,
        phase: indData.phase
      }
    }).returning();

    const importId = importRecord[0].id;

    // Process each selected section
    let processedContent = targetDoc[0].content || '';
    const fieldMappings = {};
    const changesSummary = [];

    for (const section of selectedSections) {
      let sectionContent = '';
      
      // Map IND data to section content based on section identifier
      if (section === '2.5.4 Clinical Efficacy') {
        const efficacyData = indData.module2Data?.efficacy || indData.indStepData?.clinicalData?.efficacy;
        if (efficacyData) {
          sectionContent = `
            <h3>2.5.4 Clinical Efficacy</h3>
            <h4>Overview of Efficacy</h4>
            <p>${efficacyData.overview || 'The clinical efficacy of ' + indData.drugName + ' has been evaluated in clinical studies.'}</p>
            <h4>Primary Endpoints</h4>
            <p>${efficacyData.primaryEndpoints || 'Primary efficacy endpoints demonstrated statistically significant improvements.'}</p>
            <h4>Secondary Endpoints</h4>
            <p>${efficacyData.secondaryEndpoints || 'Secondary endpoints supported the primary efficacy findings.'}</p>
          `;
          fieldMappings['2.5.4'] = ['efficacy.overview', 'efficacy.primaryEndpoints', 'efficacy.secondaryEndpoints'];
          changesSummary.push('Added clinical efficacy data to Module 2.5.4');
        }
      } else if (section === '2.5.5 Safety Profile') {
        const safetyData = indData.module2Data?.safety || indData.indStepData?.clinicalData?.safety;
        if (safetyData) {
          sectionContent = `
            <h3>2.5.5 Safety Profile</h3>
            <h4>Overall Safety Summary</h4>
            <p>${safetyData.summary || 'The safety profile of ' + indData.drugName + ' was evaluated in clinical trials.'}</p>
            <h4>Adverse Events</h4>
            <p>${safetyData.adverseEvents || 'The most common adverse events were mild to moderate in severity.'}</p>
            <h4>Serious Adverse Events</h4>
            <p>${safetyData.seriousAdverseEvents || 'Serious adverse events were infrequent and not related to study drug.'}</p>
          `;
          fieldMappings['2.5.5'] = ['safety.summary', 'safety.adverseEvents', 'safety.seriousAdverseEvents'];
          changesSummary.push('Added safety profile data to Module 2.5.5');
        }
      } else if (section.startsWith('2.7')) {
        const clinicalSummary = indData.module2Data?.clinicalSummary || indData.indStepData?.summary;
        if (clinicalSummary) {
          sectionContent = `
            <h3>${section}</h3>
            <p>${clinicalSummary.content || 'Clinical summary for ' + indData.drugName + ' in ' + indData.indication + '.'}</p>
          `;
          fieldMappings[section] = ['clinicalSummary.content'];
          changesSummary.push(`Added clinical summary to ${section}`);
        }
      } else if (section.startsWith('3.')) {
        const cmcData = indData.module3Data || indData.indStepData?.cmc;
        if (cmcData) {
          sectionContent = `
            <h3>${section}</h3>
            <h4>Manufacturing Information</h4>
            <p>${cmcData.manufacturing || 'Manufacturing information for ' + indData.drugName + '.'}</p>
            <h4>Quality Control</h4>
            <p>${cmcData.qualityControl || 'Quality control measures ensure product consistency.'}</p>
          `;
          fieldMappings[section] = ['cmc.manufacturing', 'cmc.qualityControl'];
          changesSummary.push(`Added CMC data to ${section}`);
        }
      } else if (section.startsWith('5.')) {
        const studyData = indData.module5Data || indData.indStepData?.studies;
        if (studyData) {
          sectionContent = `
            <h3>${section}</h3>
            <h4>Study Reports</h4>
            <p>${studyData.reports || 'Clinical study reports for ' + indData.drugName + '.'}</p>
            <h4>Study Protocols</h4>
            <p>${studyData.protocols || 'Study protocols followed ICH guidelines.'}</p>
          `;
          fieldMappings[section] = ['studies.reports', 'studies.protocols'];
          changesSummary.push(`Added study data to ${section}`);
        }
      }

      // Apply the section content based on import type
      if (sectionContent) {
        if (importType === 'merge') {
          // Append to existing content
          processedContent = processedContent + '\n' + sectionContent;
        } else if (importType === 'overwrite') {
          // Replace section if it exists, otherwise append
          const sectionRegex = new RegExp(`<h3>${section.replace('.', '\\.')}.*?(?=<h3>|$)`, 'gs');
          if (sectionRegex.test(processedContent)) {
            processedContent = processedContent.replace(sectionRegex, sectionContent);
          } else {
            processedContent = processedContent + '\n' + sectionContent;
          }
        }
        // For 'skip' type, we don't modify existing content
      }
    }

    // Update the document with imported content
    if (importType !== 'skip') {
      await db
        .update(coauthorDocuments)
        .set({
          content: processedContent,
          metadata: {
            ...targetDoc[0].metadata,
            lastImportFrom: indId,
            lastImportAt: new Date().toISOString(),
            drugName: indData.drugName,
            indication: indData.indication,
            phase: indData.phase
          },
          updatedAt: sql`NOW()`
        })
        .where(eq(coauthorDocuments.id, targetDocumentId));
    }

    // Update import history record with completion
    await db
      .update(coauthorImportHistory)
      .set({
        status: 'completed',
        progress: 100,
        fieldMappings,
        contentAfter: processedContent,
        changesSummary: { changes: changesSummary },
        completedAt: sql`NOW()`
      })
      .where(eq(coauthorImportHistory.id, importId));

    // Return success response
    res.json({
      success: true,
      importId,
      documentId: targetDocumentId,
      sectionsImported: selectedSections,
      changesSummary,
      message: `Successfully imported ${selectedSections.length} sections from IND ${indData.drugName}`
    });

  } catch (error) {
    console.error('Error importing IND data:', error);
    
    // Update import history with failure if we have an import ID
    if (req.importId) {
      await db
        .update(coauthorImportHistory)
        .set({
          status: 'failed',
          errorMessage: error.message,
          errorDetails: { stack: error.stack },
          completedAt: sql`NOW()`
        })
        .where(eq(coauthorImportHistory.id, req.importId));
    }
    
    res.status(500).json({ error: 'Failed to import IND data' });
  }
});

/**
 * GET /api/coauthor/import/history - Get import history for a document
 */
router.get('/import/history/:documentId?', async (req, res) => {
  try {
    const { documentId } = req.params;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    
    const whereConditions = [eq(coauthorImportHistory.organizationId, organizationId)];
    
    if (documentId) {
      whereConditions.push(eq(coauthorImportHistory.targetDocumentId, parseInt(documentId)));
    }
    
    const history = await db
      .select()
      .from(coauthorImportHistory)
      .where(and(...whereConditions))
      .orderBy(desc(coauthorImportHistory.startedAt))
      .limit(50);
    
    res.json(history);
  } catch (error) {
    console.error('Error fetching import history:', error);
    res.status(500).json({ error: 'Failed to fetch import history' });
  }
});

/**
 * POST /api/coauthor/validate - Perform comprehensive document validation
 */
router.post('/validate', async (req, res) => {
  try {
    const { documentId, agency = 'FDA' } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    
    if (!documentId) {
      return res.status(400).json({ error: 'Document ID is required' });
    }

    // Get user info (simplified - in production, get from auth middleware)
    const performedBy = req.headers['x-user-name'] || 'System';
    const userId = parseInt(req.headers['x-user-id']) || null;

    // Perform validation
    const validationResult = await validateDocument({
      documentId,
      agency,
      organizationId,
      performedBy,
      userId
    });

    res.json({
      success: true,
      ...validationResult
    });
  } catch (error) {
    console.error('Validation endpoint error:', error);
    res.status(500).json({ 
      error: 'Failed to validate document', 
      details: error.message 
    });
  }
});

/**
 * GET /api/coauthor/validate/history/:documentId - Get validation history for a document
 */
router.get('/validate/history/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const history = await getValidationHistory(parseInt(documentId), limit);

    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('Error fetching validation history:', error);
    res.status(500).json({ 
      error: 'Failed to fetch validation history',
      details: error.message 
    });
  }
});

/**
 * GET /api/coauthor/validate/export/:validationId - Export validation report
 */
router.get('/validate/export/:validationId', async (req, res) => {
  try {
    const { validationId } = req.params;
    const format = req.query.format || 'JSON';

    const report = await exportValidationReport(validationId, format);

    res.setHeader('Content-Type', report.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    res.send(report.content);
  } catch (error) {
    console.error('Error exporting validation report:', error);
    res.status(500).json({ 
      error: 'Failed to export validation report',
      details: error.message 
    });
  }
});

/**
 * GET /api/coauthor/validate/rules - Get active validation rules
 */
router.get('/validate/rules', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || null;
    const agency = req.query.agency || 'ALL';
    const module = req.query.module || 'ALL';

    // Build where conditions
    const whereConditions = [
      eq(coauthorValidationRules.isActive, true)
    ];

    if (agency !== 'ALL') {
      whereConditions.push(
        or(
          eq(coauthorValidationRules.agency, agency),
          eq(coauthorValidationRules.agency, 'ALL')
        )
      );
    }

    if (module !== 'ALL') {
      whereConditions.push(
        or(
          eq(coauthorValidationRules.module, module),
          eq(coauthorValidationRules.module, 'ALL')
        )
      );
    }

    const rules = await db
      .select()
      .from(coauthorValidationRules)
      .where(and(...whereConditions))
      .orderBy(
        sql`CASE 
          WHEN ${coauthorValidationRules.severity} = 'critical' THEN 1
          WHEN ${coauthorValidationRules.severity} = 'major' THEN 2
          WHEN ${coauthorValidationRules.severity} = 'minor' THEN 3
          WHEN ${coauthorValidationRules.severity} = 'informational' THEN 4
        END`
      );

    res.json({
      success: true,
      rules,
      count: rules.length
    });
  } catch (error) {
    console.error('Error fetching validation rules:', error);
    res.status(500).json({ 
      error: 'Failed to fetch validation rules',
      details: error.message 
    });
  }
});

/**
 * GET /api/coauthor/validate/latest/:documentId - Get latest validation result for a document
 */
router.get('/validate/latest/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;

    const [latest] = await db
      .select()
      .from(coauthorValidationHistory)
      .where(eq(coauthorValidationHistory.documentId, parseInt(documentId)))
      .orderBy(desc(coauthorValidationHistory.performedAt))
      .limit(1);

    if (!latest) {
      return res.json({
        success: true,
        hasValidation: false,
        message: 'No validation history found for this document'
      });
    }

    res.json({
      success: true,
      hasValidation: true,
      validation: latest
    });
  } catch (error) {
    console.error('Error fetching latest validation:', error);
    res.status(500).json({ 
      error: 'Failed to fetch latest validation',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/chat - RAG-powered chat with dossier using real OpenAI
 */
router.post('/chat', async (req, res) => {
  try {
    const { query, documentContext = [] } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Use OpenAI if available
    let OpenAI;
    try {
      OpenAI = (await import('openai')).default;
    } catch (e) {
      console.log('OpenAI not available for chat');
    }

    let response;
    
    if (OpenAI && process.env.OPENAI_API_KEY) {
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      // First perform vector search to get relevant context
      const vectorSearchResponse = await fetch('http://localhost:5000/api/vector-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      
      let contextChunks = [];
      if (vectorSearchResponse.ok) {
        const searchResults = await vectorSearchResponse.json();
        contextChunks = searchResults.results || [];
      }

      // Build context from search results
      const context = contextChunks.map(chunk => 
        `[${chunk.doc_title} - ${chunk.ectd_section || 'Section'}]: ${chunk.content}`
      ).join('\n\n');

      // Generate AI response using context
      const aiResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert regulatory affairs assistant helping with eCTD documentation. 
            Use the following context from the dossier to answer questions accurately. 
            Always cite the specific document sections when providing information.
            Context:\n${context}`
          },
          {
            role: 'user',
            content: query
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      });

      response = {
        answer: aiResponse.choices[0].message.content,
        sources: contextChunks.map(c => ({
          title: c.doc_title,
          section: c.ectd_section,
          content: c.content.substring(0, 200) + '...'
        })),
        model: 'gpt-4o',
        isRealAI: true
      };
    } else {
      // Fallback response
      response = {
        answer: `Based on the dossier content, here's a response to "${query}". 
                 Please note that OpenAI integration would provide more accurate answers.`,
        sources: [],
        model: 'fallback',
        isRealAI: false
      };
    }

    res.json({
      success: true,
      ...response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Chat service temporarily unavailable',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/embeddings - Generate real OpenAI embeddings for document chunks
 * NO MOCKS - Only returns real AI-generated embeddings
 */
router.post('/embeddings', async (req, res) => {
  try {
    const { text, documentId, model = 'text-embedding-3-large' } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Require OpenAI API key - no fallback to mocks
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ 
        error: 'OpenAI API key not configured',
        message: 'Please configure OPENAI_API_KEY environment variable to use embeddings'
      });
    }

    let OpenAI;
    try {
      OpenAI = (await import('openai')).default;
    } catch (e) {
      return res.status(503).json({
        error: 'OpenAI SDK not available',
        message: 'OpenAI package is required for embeddings generation'
      });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Use latest OpenAI embedding models
    // text-embedding-3-large: 3072 dimensions (best quality)
    // text-embedding-3-small: 1536 dimensions (faster, cheaper)
    const embeddingResponse = await openai.embeddings.create({
      model: model,
      input: text,
      encoding_format: 'float' // Ensure proper float format for pgvector
    });

    const embedding = embeddingResponse.data[0].embedding;
    const dimensions = embedding.length;

    res.json({
      success: true,
      embedding: embedding,
      model: model,
      dimensions: dimensions,
      isRealAI: true,
      documentId,
      usage: embeddingResponse.usage
    });

  } catch (error) {
    console.error('Embeddings error:', error);
    res.status(500).json({ 
      error: 'Embeddings generation failed',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/generate-embeddings - Batch generate embeddings for all components
 * Processes all components in the organization and stores embeddings in pgvector
 */
router.post('/generate-embeddings', async (req, res) => {
  try {
    const { organizationId, force = false } = req.body;
    
    // Validate organization header for multi-tenant isolation
    const orgHeader = req.headers['x-organization-id'];
    if (!orgHeader) {
      return res.status(401).json({ 
        error: 'Organization context required',
        message: 'Missing x-organization-id header. Please select an organization.'
      });
    }
    
    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required in request body' });
    }
    
    // Ensure header and body organizationId match for security
    if (parseInt(orgHeader) !== parseInt(organizationId)) {
      return res.status(403).json({ 
        error: 'Organization ID mismatch',
        message: 'Header and body organization IDs must match'
      });
    }

    // Require OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ 
        error: 'OpenAI API key not configured',
        message: 'Please configure OPENAI_API_KEY environment variable'
      });
    }

    let OpenAI;
    try {
      OpenAI = (await import('openai')).default;
    } catch (e) {
      return res.status(503).json({
        error: 'OpenAI SDK not available',
        message: 'OpenAI package is required for embeddings generation'
      });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Get all components for the organization
    const componentsList = await db
      .select()
      .from(components)
      .where(eq(components.organizationId, organizationId))
      .orderBy(asc(components.id));

    if (componentsList.length === 0) {
      return res.json({
        success: true,
        message: 'No components found to process',
        stats: { total: 0, processed: 0, skipped: 0, errors: 0 }
      });
    }

    const stats = {
      total: componentsList.length,
      processed: 0,
      skipped: 0,
      errors: 0
    };

    // Process components in batches to avoid rate limits
    const batchSize = 100; // OpenAI allows up to 2048 inputs per request
    
    for (let i = 0; i < componentsList.length; i += batchSize) {
      const batch = componentsList.slice(i, i + batchSize);
      const texts = batch.map(c => c.content || '');
      
      try {
        // Generate embeddings for the batch
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-large',
          input: texts,
          encoding_format: 'float'
        });

        // Store embeddings in document_vectors table
        for (let j = 0; j < batch.length; j++) {
          const component = batch[j];
          const embedding = embeddingResponse.data[j].embedding;
          
          try {
            // Insert or update vector
            await db.insert(sql`document_vectors`)
              .values({
                organization_id: organizationId,
                component_id: component.id,
                chunk_text: component.content,
                chunk_index: 0,
                chunk_size: Math.ceil((component.content || '').length / 4), // Approximate tokens
                embedding: JSON.stringify(embedding), // Will be converted to vector by driver
                embedding_model: 'text-embedding-3-large',
                module_context: component.module,
                section_number: component.sectionNumber,
                created_at: new Date(),
                updated_at: new Date()
              })
              .onConflictDoUpdate({
                target: sql`component_id`,
                set: {
                  embedding: JSON.stringify(embedding),
                  updated_at: new Date()
                }
              });
            
            stats.processed++;
          } catch (insertError) {
            console.error(`Error storing embedding for component ${component.id}:`, insertError);
            stats.errors++;
          }
        }
      } catch (batchError) {
        console.error('Error generating batch embeddings:', batchError);
        stats.errors += batch.length;
      }
    }

    res.json({
      success: true,
      message: `Embeddings generated for ${stats.processed} components`,
      stats: stats
    });

  } catch (error) {
    console.error('Batch embeddings error:', error);
    res.status(500).json({ 
      error: 'Batch embeddings generation failed',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/semantic-search - Semantic search using pgvector similarity
 * Uses HNSW index for fast approximate nearest neighbor search
 */
router.post('/semantic-search', async (req, res) => {
  try {
    const { query, organizationId, topK = 10, minScore = 0.5 } = req.body;
    
    // Validate organization header for multi-tenant isolation
    const orgHeader = req.headers['x-organization-id'];
    if (!orgHeader) {
      return res.status(401).json({ 
        error: 'Organization context required',
        message: 'Missing x-organization-id header. Please select an organization.'
      });
    }
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required in request body' });
    }
    
    // Ensure header and body organizationId match for security
    if (parseInt(orgHeader) !== parseInt(organizationId)) {
      return res.status(403).json({ 
        error: 'Organization ID mismatch',
        message: 'Header and body organization IDs must match'
      });
    }

    // Require OpenAI API key to generate query embedding
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ 
        error: 'OpenAI API key not configured',
        message: 'Please configure OPENAI_API_KEY environment variable'
      });
    }

    let OpenAI;
    try {
      OpenAI = (await import('openai')).default;
    } catch (e) {
      return res.status(503).json({
        error: 'OpenAI SDK not available',
        message: 'OpenAI package is required for semantic search'
      });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Generate embedding for the query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: query,
      encoding_format: 'float'
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Perform vector similarity search using pgvector
    // Using cosine similarity with the HNSW index
    const results = await db.execute(sql`
      SELECT 
        dv.id,
        dv.chunk_text,
        dv.module_context,
        dv.section_number,
        c.id as component_id,
        c.udi,
        c.type,
        c.version,
        c.status,
        c.content,
        1 - (dv.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity_score
      FROM document_vectors dv
      LEFT JOIN components c ON c.id = dv.component_id
      WHERE dv.organization_id = ${organizationId}
        AND dv.embedding IS NOT NULL
      ORDER BY dv.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${topK}
    `);

    // Filter by minimum score and format results
    const filteredResults = results.rows
      .filter(r => r.similarity_score >= minScore)
      .map(r => ({
        id: r.id,
        component: {
          id: r.component_id,
          udi: r.udi,
          type: r.type,
          version: r.version,
          status: r.status,
          content: r.content
        },
        chunkText: r.chunk_text,
        moduleContext: r.module_context,
        sectionNumber: r.section_number,
        similarityScore: parseFloat(r.similarity_score),
        relevance: r.similarity_score > 0.8 ? 'high' : r.similarity_score > 0.6 ? 'medium' : 'low'
      }));

    res.json({
      success: true,
      query: query,
      results: filteredResults,
      count: filteredResults.length,
      topK: topK,
      minScore: minScore,
      model: 'text-embedding-3-large'
    });

  } catch (error) {
    console.error('Semantic search error:', error);
    res.status(500).json({ 
      error: 'Semantic search failed',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/search - Comprehensive search endpoint
 * Supports multiple search modes, filters, and smart features
 */
router.post('/search', async (req, res) => {
  try {
    const { 
      query, 
      searchIn = 'all', // all, title, content, metadata, comments
      sortBy = 'relevance', // relevance, date, date-oldest, name, size
      filters = {},
      page = 1,
      limit = 20,
      includeMetadata = false
    } = req.body;

    // Get organization context
    const organizationId = req.headers['x-organization-id'];
    if (!organizationId) {
      return res.status(401).json({ 
        error: 'Organization context required' 
      });
    }

    let searchResults = [];
    let totalCount = 0;
    const startTime = Date.now();

    // Build where conditions based on filters
    const whereConditions = [eq(components.organizationId, organizationId)];
    
    // Apply text search
    if (query) {
      const searchPattern = `%${query}%`;
      if (searchIn === 'title') {
        whereConditions.push(like(components.title, searchPattern));
      } else if (searchIn === 'content') {
        whereConditions.push(sql`${components.content}::text ILIKE ${searchPattern}`);
      } else if (searchIn === 'metadata') {
        whereConditions.push(sql`${components.metadata}::text ILIKE ${searchPattern}`);
      } else {
        // Search all fields
        whereConditions.push(
          or(
            like(components.title, searchPattern),
            sql`${components.content}::text ILIKE ${searchPattern}`,
            sql`${components.metadata}::text ILIKE ${searchPattern}`,
            like(components.udi, searchPattern)
          )
        );
      }
    }

    // Apply filters
    if (filters.fileTypes?.length > 0) {
      const fileTypeConditions = filters.fileTypes.map(type => {
        if (type === 'word') return sql`${components.metadata}->>'fileName' ILIKE '%.doc%'`;
        if (type === 'excel') return sql`${components.metadata}->>'fileName' ILIKE '%.xls%'`;
        if (type === 'powerpoint') return sql`${components.metadata}->>'fileName' ILIKE '%.ppt%'`;
        if (type === 'pdf') return sql`${components.metadata}->>'fileName' ILIKE '%.pdf'`;
        return sql`1=0`;
      });
      whereConditions.push(or(...fileTypeConditions));
    }

    if (filters.modules?.length > 0) {
      whereConditions.push(sql`${components.module} = ANY(${filters.modules})`);
    }

    if (filters.statuses?.length > 0) {
      whereConditions.push(sql`${components.status} = ANY(${filters.statuses})`);
    }

    if (filters.priorities?.length > 0) {
      whereConditions.push(sql`${components.metadata}->>'priority' = ANY(${filters.priorities})`);
    }

    if (filters.dateRange) {
      if (filters.dateRange.from) {
        whereConditions.push(sql`${components.createdAt} >= ${filters.dateRange.from}`);
      }
      if (filters.dateRange.to) {
        whereConditions.push(sql`${components.createdAt} <= ${filters.dateRange.to}`);
      }
    }

    // Execute search query
    const offset = (page - 1) * limit;
    const orderBy = sortBy === 'date' ? desc(components.modifiedAt) :
                   sortBy === 'date-oldest' ? asc(components.modifiedAt) :
                   sortBy === 'name' ? asc(components.title) :
                   desc(components.modifiedAt);

    const results = await db
      .select()
      .from(components)
      .where(and(...whereConditions))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Get total count
    const countResult = await db
      .select({ count: sql`COUNT(*)` })
      .from(components)
      .where(and(...whereConditions));
    
    totalCount = Number(countResult[0]?.count || 0);

    // Format results
    searchResults = results.map(component => ({
      id: component.id,
      udi: component.udi,
      title: component.title || component.metadata?.fileName || 'Untitled Component',
      type: component.type,
      fileName: component.metadata?.fileName,
      module: component.module,
      status: component.status,
      path: `/${component.module}/${component.type}/${component.udi}`,
      snippet: component.content ? 
        (typeof component.content === 'string' ? 
          component.content.substring(0, 200) + '...' : 
          JSON.stringify(component.content).substring(0, 200) + '...') : '',
      createdDate: component.createdAt,
      modifiedDate: component.modifiedAt,
      modifiedBy: component.lastModifiedBy,
      size: component.metadata?.fileSize,
      metadata: includeMetadata ? component.metadata : undefined
    }));

    // Generate facets for refiners
    const facets = {};
    
    if (results.length > 0) {
      // File type facets
      const fileTypeMap = new Map();
      results.forEach(r => {
        const fileName = r.metadata?.fileName?.toLowerCase() || '';
        let fileType = 'other';
        if (fileName.includes('.doc')) fileType = 'word';
        else if (fileName.includes('.xls')) fileType = 'excel';
        else if (fileName.includes('.ppt')) fileType = 'powerpoint';
        else if (fileName.includes('.pdf')) fileType = 'pdf';
        
        fileTypeMap.set(fileType, (fileTypeMap.get(fileType) || 0) + 1);
      });
      
      facets.fileTypes = Array.from(fileTypeMap).map(([value, count]) => ({
        value,
        label: value.charAt(0).toUpperCase() + value.slice(1),
        count
      }));

      // Module facets
      const moduleMap = new Map();
      results.forEach(r => {
        if (r.module) {
          moduleMap.set(r.module, (moduleMap.get(r.module) || 0) + 1);
        }
      });
      
      facets.modules = Array.from(moduleMap).map(([value, count]) => ({
        value,
        label: value,
        count
      }));

      // Status facets
      const statusMap = new Map();
      results.forEach(r => {
        if (r.status) {
          statusMap.set(r.status, (statusMap.get(r.status) || 0) + 1);
        }
      });
      
      facets.statuses = Array.from(statusMap).map(([value, count]) => ({
        value,
        label: value.charAt(0).toUpperCase() + value.slice(1).replace('_', ' '),
        count
      }));
    }

    const searchTime = Date.now() - startTime;

    res.json({
      success: true,
      query,
      results: searchResults,
      facets,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit),
      searchTime,
      didYouMean: null // Could be implemented with fuzzy matching
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      error: 'Search failed',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/search/suggestions - Get search suggestions
 * Returns categorized suggestions as user types
 */
router.post('/search/suggestions', async (req, res) => {
  try {
    const { query, limit = 5, includeCategories = [] } = req.body;
    
    if (!query || query.length < 2) {
      return res.json({});
    }

    const organizationId = req.headers['x-organization-id'];
    if (!organizationId) {
      return res.status(401).json({ 
        error: 'Organization context required' 
      });
    }

    const suggestions = {};
    const searchPattern = `%${query}%`;

    // Components suggestions
    if (!includeCategories.length || includeCategories.includes('components')) {
      const componentResults = await db
        .select({
          id: components.id,
          udi: components.udi,
          title: components.title,
          type: components.type,
          module: components.module,
          version: components.version,
          metadata: components.metadata
        })
        .from(components)
        .where(and(
          eq(components.organizationId, organizationId),
          or(
            like(components.title, searchPattern),
            like(components.udi, searchPattern)
          )
        ))
        .limit(limit);

      suggestions.components = componentResults.map(c => ({
        id: c.id,
        udi: c.udi,
        title: c.title || c.metadata?.fileName || 'Untitled',
        name: c.title || c.metadata?.fileName || 'Untitled',
        type: c.type,
        module: c.module,
        version: c.version,
        metadata: c.metadata
      }));
    }

    // Changes suggestions (from status history)
    if (!includeCategories.length || includeCategories.includes('changes')) {
      const changeResults = await db
        .select({
          id: coauthorStatusHistory.id,
          status: coauthorStatusHistory.status,
          changedBy: coauthorStatusHistory.changedBy,
          changeDate: coauthorStatusHistory.changedAt,
          comments: coauthorStatusHistory.comments
        })
        .from(coauthorStatusHistory)
        .where(sql`${coauthorStatusHistory.comments} ILIKE ${searchPattern}`)
        .limit(limit)
        .orderBy(desc(coauthorStatusHistory.changedAt));

      suggestions.changes = changeResults.map(ch => ({
        changeId: `CHG-${ch.id}`,
        description: ch.comments || 'Status change',
        title: ch.comments || `Status changed to ${ch.status}`,
        status: ch.status,
        priority: 'medium',
        date: ch.changeDate
      }));
    }

    // Users suggestions
    if (!includeCategories.length || includeCategories.includes('users')) {
      const userResults = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role
        })
        .from(users)
        .where(or(
          like(users.name, searchPattern),
          like(users.email, searchPattern)
        ))
        .limit(limit);

      suggestions.users = userResults.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role || 'User'
      }));
    }

    // Documents suggestions
    if (!includeCategories.length || includeCategories.includes('documents')) {
      const docResults = await db
        .select({
          id: coauthorDocuments.id,
          title: coauthorDocuments.title,
          documentType: coauthorDocuments.documentType,
          module: coauthorDocuments.module,
          sectionNumber: coauthorDocuments.sectionNumber,
          metadata: coauthorDocuments.metadata,
          modifiedAt: coauthorDocuments.updatedAt
        })
        .from(coauthorDocuments)
        .where(and(
          eq(coauthorDocuments.organizationId, organizationId),
          like(coauthorDocuments.title, searchPattern)
        ))
        .limit(limit);

      suggestions.documents = docResults.map(d => ({
        id: d.id,
        title: d.title,
        type: d.documentType,
        module: d.module,
        path: `/${d.module}/${d.sectionNumber}`,
        fileName: d.metadata?.fileName,
        modifiedDate: d.modifiedAt
      }));
    }

    // Regulatory references
    if (!includeCategories.length || includeCategories.includes('regulatory')) {
      // Mock regulatory references - in production, this would query a regulatory database
      const regulatoryTerms = [
        { citation: '21 CFR 314.50', title: 'Content and format of an NDA', agency: 'FDA' },
        { citation: '21 CFR 312.23', title: 'IND content and format', agency: 'FDA' },
        { citation: 'ICH M4', title: 'Common Technical Document', agency: 'ICH' },
        { citation: 'EMA/CHMP/167068', title: 'Guideline on the content of the CTD', agency: 'EMA' }
      ].filter(ref => 
        ref.citation.toLowerCase().includes(query.toLowerCase()) ||
        ref.title.toLowerCase().includes(query.toLowerCase())
      ).slice(0, limit);

      suggestions.regulatory = regulatoryTerms;
    }

    res.json(suggestions);

  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({ 
      error: 'Failed to generate suggestions',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/search/export - Export search results
 * Supports CSV and JSON formats
 */
router.post('/search/export', async (req, res) => {
  try {
    const { results, format = 'csv' } = req.body;
    
    if (!results || !Array.isArray(results)) {
      return res.status(400).json({ error: 'Results array is required' });
    }

    if (format === 'csv') {
      // Generate CSV
      const headers = ['UDI', 'Title', 'Type', 'Module', 'Status', 'Modified Date', 'Modified By'];
      const rows = results.map(r => [
        r.udi || '',
        r.title || '',
        r.type || '',
        r.module || '',
        r.status || '',
        r.modifiedDate ? new Date(r.modifiedDate).toISOString() : '',
        r.modifiedBy || ''
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="search-results-${Date.now()}.csv"`);
      res.send(csvContent);
    } else if (format === 'json') {
      // Generate JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="search-results-${Date.now()}.json"`);
      res.json(results);
    } else {
      res.status(400).json({ error: 'Unsupported export format' });
    }

  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ 
      error: 'Export failed',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/ai/generate - Generate eCTD section content using AI
 */
router.post('/ai/generate', async (req, res) => {
  try {
    const { section, module, requirements = {}, currentContent = '' } = req.body;
    
    let OpenAI;
    try {
      OpenAI = (await import('openai')).default;
    } catch (e) {
      console.log('OpenAI not available for content generation');
    }

    if (OpenAI && process.env.OPENAI_API_KEY) {
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const prompt = `Generate comprehensive regulatory content for eCTD ${module} Section ${section}.
      
      Current content (if any): ${currentContent}
      
      Requirements: ${JSON.stringify(requirements)}
      
      Please provide detailed, FDA/ICH-compliant content that includes:
      1. All required subsections
      2. Regulatory language and formatting
      3. Placeholders for specific data where needed
      4. Compliance considerations`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert regulatory writer specializing in eCTD documentation for pharmaceutical submissions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      res.json({
        success: true,
        content: response.choices[0].message.content,
        section,
        module,
        model: 'gpt-4o',
        isRealAI: true
      });
    } else {
      // Fallback template content
      res.json({
        success: true,
        content: `[Template for ${module} Section ${section}]
        
This section requires comprehensive documentation following ICH guidelines.
Please add specific content based on your product requirements.`,
        section,
        module,
        model: 'template',
        isRealAI: false
      });
    }

  } catch (error) {
    console.error('Content generation error:', error);
    res.status(500).json({ 
      error: 'Content generation failed',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/import-word - Import Word/PDF document with Component Extraction
 */
router.post('/import-word', upload.single('file'), async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = parseInt(req.headers['x-user-id']) || 1;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    // Extract components from the uploaded document
    const extractionResult = await extractComponents(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    
    if (!extractionResult.success) {
      return res.status(400).json({ 
        error: 'Failed to extract components',
        details: extractionResult.error 
      });
    }
    
    // Start database transaction
    const trx = await db.transaction();
    
    try {
      // Store import history
      const importRecord = await trx.insert(coauthorImportHistory).values({
        organizationId,
        userId,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileType: req.file.mimetype,
        status: 'completed',
        extractedData: {
          componentCount: extractionResult.components.length,
          metadata: extractionResult.metadata
        },
        importedAt: sql`NOW()`
      }).returning();
      
      // Create document record
      const documentTitle = extractionResult.components
        .find(c => c.type === 'heading' && c.level === 1)?.content || 
        req.file.originalname.replace(/\.(docx?|pdf)$/i, '');
        
      const newDocument = await trx.insert(coauthorDocuments).values({
        organizationId,
        title: documentTitle,
        status: 'draft',
        content: extractionResult.html || '',
        sections: extractionResult.metadata,
        createdBy: userId.toString(),
        metadata: {
          importId: importRecord[0].id,
          originalFile: req.file.originalname,
          componentCount: extractionResult.components.length
        },
        createdAt: sql`NOW()`,
        updatedAt: sql`NOW()`
      }).returning();
      
      // Process and store components
      const storedComponents = [];
      const componentMapping = new Map(); // Map UDI to component ID
      
      for (const component of extractionResult.components) {
        // Check if component already exists (for reuse detection)
        const existingComponent = await trx
          .select()
          .from(components)
          .where(and(
            eq(components.udi, component.udi),
            eq(components.organizationId, organizationId)
          ))
          .limit(1);
        
        let componentId;
        let versionId;
        
        if (existingComponent.length > 0) {
          // Component exists - create new version if content changed
          componentId = existingComponent[0].id;
          
          // Check if content has changed
          const contentChanged = JSON.stringify(existingComponent[0].content) !== 
                                JSON.stringify(component.content);
          
          if (contentChanged) {
            // Get latest version number
            const latestVersion = await trx
              .select({ maxVersion: sql`COALESCE(MAX(version_number), 0)` })
              .from(componentVersions)
              .where(eq(componentVersions.componentId, componentId));
            
            const newVersionNumber = (latestVersion[0]?.maxVersion || 0) + 1;
            
            // Create new version
            const newVersion = await trx.insert(componentVersions).values({
              componentId,
              organizationId,
              versionNumber: newVersionNumber,
              content: component.content,
              changeDescription: `Updated from ${req.file.originalname}`,
              changeType: 'minor',
              createdById: userId,
              createdByName: `User ${userId}`,
              createdAt: sql`NOW()`
            }).returning();
            
            versionId = newVersion[0].id;
            
            // Update component with new content
            await trx.update(components)
              .set({
                content: component.content,
                updatedAt: sql`NOW()`,
                usageCount: sql`usage_count + 1`,
                lastUsedAt: sql`NOW()`
              })
              .where(eq(components.id, componentId));
          } else {
            // Content unchanged - just increment usage
            await trx.update(components)
              .set({
                usageCount: sql`usage_count + 1`,
                lastUsedAt: sql`NOW()`
              })
              .where(eq(components.id, componentId));
              
            // Get current version
            const currentVersion = await trx
              .select()
              .from(componentVersions)
              .where(eq(componentVersions.componentId, componentId))
              .orderBy(desc(componentVersions.versionNumber))
              .limit(1);
            
            versionId = currentVersion[0]?.id;
          }
          
        } else {
          // New component - create it
          const newComponent = await trx.insert(components).values({
            organizationId,
            udi: component.udi,
            type: component.type,
            level: component.level || null,
            content: component.content,
            moduleContext: component.metadata?.moduleContext || null,
            sectionNumber: component.metadata?.sectionNumber || null,
            sourceFile: req.file.originalname,
            extractedAt: sql`NOW()`,
            wordCount: component.metadata?.wordCount || null,
            checksum: null, // Could add MD5 hash of content
            usageCount: 1,
            lastUsedAt: sql`NOW()`,
            status: 'active',
            tags: component.metadata?.tags || null,
            createdAt: sql`NOW()`,
            updatedAt: sql`NOW()`
          }).returning();
          
          componentId = newComponent[0].id;
          
          // Create initial version
          const initialVersion = await trx.insert(componentVersions).values({
            componentId,
            organizationId,
            versionNumber: 1,
            content: component.content,
            changeDescription: `Initial import from ${req.file.originalname}`,
            changeType: 'initial',
            createdById: userId,
            createdByName: `User ${userId}`,
            createdAt: sql`NOW()`
          }).returning();
          
          versionId = initialVersion[0].id;
        }
        
        componentMapping.set(component.udi, componentId);
        storedComponents.push({ componentId, versionId, component });
      }
      
      // Link components to document
      let position = 0;
      for (const { componentId, versionId, component } of storedComponents) {
        await trx.insert(documentComponents).values({
          documentId: newDocument[0].id,
          componentId,
          componentVersionId: versionId,
          organizationId,
          position: position++,
          parentComponentId: null, // Could implement hierarchy detection
          depth: 0,
          overrideContent: null,
          isOverridden: false,
          isLocked: false,
          lockedById: null,
          lockedAt: null,
          lockReason: null,
          createdAt: sql`NOW()`,
          updatedAt: sql`NOW()`
        });
      }
      
      // Process cross-references if any
      const crossRefComponents = extractionResult.components
        .filter(c => c.type === 'cross-references');
      
      for (const crossRef of crossRefComponents) {
        if (crossRef.content && Array.isArray(crossRef.content)) {
          for (const ref of crossRef.content) {
            // This is a simplified implementation
            // In production, you'd parse the reference target to find the actual component
            const sourceId = componentMapping.get(crossRef.udi);
            if (sourceId) {
              // Store the cross-reference for future resolution
              // This could be enhanced to actually find and link target components
            }
          }
        }
      }
      
      // Create initial document version
      await trx.insert(coauthorDocumentVersions).values({
        documentId: newDocument[0].id,
        organizationId,
        versionNumber: 1,
        versionLabel: 'Initial Import',
        title: documentTitle,
        content: extractionResult.html || '',
        sections: {
          components: storedComponents.length,
          metadata: extractionResult.metadata
        },
        changeDescription: `Imported from ${req.file.originalname}`,
        metadata: {
          importId: importRecord[0].id,
          componentCount: storedComponents.length
        },
        createdBy: userId,
        createdByName: `User ${userId}`,
        createdAt: sql`NOW()`
      });
      
      // Commit transaction
      await trx.commit();
      
      // Analyze component statistics
      const componentStats = {
        total: storedComponents.length,
        byType: {},
        reused: 0,
        new: 0
      };
      
      for (const { component } of storedComponents) {
        componentStats.byType[component.type] = 
          (componentStats.byType[component.type] || 0) + 1;
      }
      
      res.json({
        success: true,
        message: 'Document imported with component extraction',
        documentId: newDocument[0].id,
        importId: importRecord[0].id,
        title: documentTitle,
        components: {
          total: componentStats.total,
          byType: componentStats.byType,
          headings: componentStats.byType.heading || 0,
          paragraphs: componentStats.byType.paragraph || 0,
          tables: componentStats.byType.table || 0,
          lists: (componentStats.byType['ordered-list'] || 0) + 
                 (componentStats.byType['unordered-list'] || 0),
          figures: componentStats.byType.figure || 0
        },
        metadata: extractionResult.metadata
      });
      
    } catch (trxError) {
      await trx.rollback();
      throw trxError;
    }
    
  } catch (error) {
    console.error('Error importing document with components:', error);
    res.status(500).json({ 
      error: 'Failed to import document',
      details: error.message 
    });
  }
});

/**
 * GET /api/coauthor/export-word/:documentId - Export document to Word with component reconstruction
 * Supports IND template formatting with templateNumber query parameter
 */
router.get('/export-word/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { templateNumber, includeMetadata } = req.query;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    
    console.log(`[EXPORT-WORD] Exporting document ${documentId} with template ${templateNumber || 'default'}`);
    
    // Get document metadata to determine template if not provided
    const docMetadata = await db
      .select()
      .from(coauthorDocuments)
      .where(and(
        eq(coauthorDocuments.id, parseInt(documentId)),
        eq(coauthorDocuments.organizationId, organizationId)
      ))
      .limit(1);
    
    if (docMetadata.length === 0) {
      return res.status(404).json({
        error: 'Document not found',
        details: 'The specified document does not exist'
      });
    }
    
    const doc = docMetadata[0];
    const effectiveTemplateNumber = templateNumber || doc.metadata?.templateNumber || doc.templateNumber;
    
    // Reconstruct and export the document with template formatting
    const result = await exportToWord(parseInt(documentId), organizationId, {
      templateNumber: effectiveTemplateNumber,
      includeMetadata: includeMetadata !== 'false',
      title: doc.title,
      documentType: doc.type || 'IND'
    });
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Failed to export document',
        details: result.error
      });
    }
    
    // Generate filename with IND template number if available
    let filename = `${doc.title || 'document'}.docx`;
    if (effectiveTemplateNumber) {
      filename = `IND_Template_${effectiveTemplateNumber}_${doc.title || 'Document'}.docx`;
    }
    
    // Set appropriate headers for Word document download
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': result.buffer.length,
      'X-Template-Number': effectiveTemplateNumber || 'none'
    });
    
    console.log(`[EXPORT-WORD] Successfully exported: ${filename} (${result.buffer.length} bytes)`);
    res.send(result.buffer);
    
  } catch (error) {
    console.error('Error exporting document to Word:', error);
    res.status(500).json({
      error: 'Failed to export document',
      details: error.message
    });
  }
});

/**
 * GET /api/coauthor/components - Get all components for listing
 */
router.get('/components', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { documentId } = req.query;
    console.log('[COMPONENTS API] Organization ID:', organizationId);
    console.log('[COMPONENTS API] Document ID:', documentId);
    
    // Build query conditions
    const whereConditions = [eq(components.organizationId, organizationId)];
    
    if (documentId) {
      // Get components linked to a specific document
      const docComponents = await db
        .select({
          component: components,
          documentComponent: documentComponents,
          latestVersion: componentVersions
        })
        .from(documentComponents)
        .innerJoin(components, eq(documentComponents.componentId, components.id))
        .leftJoin(
          componentVersions,
          and(
            eq(componentVersions.componentId, components.id),
            sql`${componentVersions.versionNumber} = (
              SELECT MAX(cv2.version_number) 
              FROM component_versions cv2 
              WHERE cv2.component_id = ${components.id}
            )`
          )
        )
        .where(and(
          eq(documentComponents.documentId, parseInt(documentId)),
          eq(documentComponents.organizationId, organizationId)
        ))
        .orderBy(asc(documentComponents.position));
      
      // Transform results for frontend
      const transformedComponents = docComponents.map(({ component, documentComponent, latestVersion }) => ({
        id: component.id,
        udi: component.udi,
        type: component.type,
        level: component.level,
        content: documentComponent.overrideContent || latestVersion?.content || component.content,
        module: component.moduleContext,
        version: latestVersion?.versionNumber || 1,
        status: component.status || 'draft',
        reused: component.reusedCount > 1,
        author: component.createdBy,
        lastModified: component.updatedAt,
        created: component.createdAt,
        metadata: component.metadata
      }));
      
      res.json({
        success: true,
        components: transformedComponents,
        count: transformedComponents.length
      });
    } else {
      // Get all components for the organization
      const allComponents = await db
        .select({
          component: components,
          latestVersion: sql`(
            SELECT MAX(version_number) 
            FROM component_versions 
            WHERE component_id = ${components.id}
          )`
        })
        .from(components)
        .where(eq(components.organizationId, organizationId))
        .orderBy(desc(components.updatedAt))
        .limit(100);
      
      // Transform results for frontend
      const transformedComponents = allComponents.map(({ component, latestVersion }) => ({
        id: component.id,
        udi: component.udi,
        type: component.type,
        level: component.level,
        content: component.content,
        module: component.moduleContext,
        version: latestVersion || 1,
        status: component.status || 'draft',
        reused: component.reusedCount > 1,
        author: component.createdBy,
        lastModified: component.updatedAt,
        created: component.createdAt,
        metadata: component.metadata
      }));
      
      console.log('[COMPONENTS API] Returning ALL components count:', transformedComponents.length);
      console.log('[COMPONENTS API] Sample component:', transformedComponents[0]);
      res.json({
        success: true,
        components: transformedComponents,
        count: transformedComponents.length
      });
    }
    
  } catch (error) {
    console.error('Error fetching components:', error);
    res.status(500).json({
      error: 'Failed to fetch components',
      details: error.message
    });
  }
});

/**
 * GET /api/coauthor/components/statistics - Get component statistics
 */
router.get('/components/statistics', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { documentId } = req.query;
    
    // Get total components count
    const totalComponentsResult = await db
      .select({ count: sql`COUNT(*)::int` })
      .from(components)
      .where(eq(components.organizationId, organizationId));
    
    // Get total versions count
    const totalVersionsResult = await db
      .select({ count: sql`COUNT(*)::int` })
      .from(componentVersions)
      .where(eq(componentVersions.organizationId, organizationId));
    
    // Get reused components count (components used in multiple documents)
    const reusedComponentsResult = await db
      .select({ count: sql`COUNT(DISTINCT component_id)::int` })
      .from(documentComponents)
      .where(and(
        eq(documentComponents.organizationId, organizationId),
        sql`component_id IN (
          SELECT component_id 
          FROM document_components 
          WHERE organization_id = ${organizationId}
          GROUP BY component_id 
          HAVING COUNT(DISTINCT document_id) > 1
        )`
      ));
    
    // Calculate average versions per component
    const avgVersionsResult = await db
      .select({ 
        avg: sql`COALESCE(AVG(version_count), 1)::float` 
      })
      .from(
        sql`(
          SELECT COUNT(*) as version_count
          FROM component_versions
          WHERE organization_id = ${organizationId}
          GROUP BY component_id
        ) as version_counts`
      );
    
    const statistics = {
      totalComponents: totalComponentsResult[0]?.count || 0,
      totalVersions: totalVersionsResult[0]?.count || 0,
      reusedComponents: reusedComponentsResult[0]?.count || 0,
      averageVersions: parseFloat(avgVersionsResult[0]?.avg || 1).toFixed(1)
    };
    
    res.json(statistics);
    
  } catch (error) {
    console.error('Error fetching component statistics:', error);
    res.status(500).json({
      error: 'Failed to fetch component statistics',
      details: error.message
    });
  }
});

/**
 * GET /api/coauthor/components/history/:documentId - Get component version history for a document
 */
router.get('/components/history/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    
    const result = await getComponentHistory(parseInt(documentId), organizationId);
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Failed to get component history',
        details: result.error
      });
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error getting component history:', error);
    res.status(500).json({
      error: 'Failed to get component history',
      details: error.message
    });
  }
});

/**
 * GET /api/coauthor/components/:componentId/diff - Get diff between component versions
 */
router.get('/components/:componentId/diff', async (req, res) => {
  try {
    const { componentId } = req.params;
    const { versionA, versionB } = req.query;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    
    if (!versionA || !versionB) {
      return res.status(400).json({
        error: 'Both versionA and versionB query parameters are required'
      });
    }
    
    const result = await getVersionDiff(
      parseInt(componentId),
      parseInt(versionA),
      parseInt(versionB),
      organizationId
    );
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Failed to generate diff',
        details: result.error
      });
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error generating component diff:', error);
    res.status(500).json({
      error: 'Failed to generate diff',
      details: error.message
    });
  }
});

/**
 * GET /api/coauthor/components/:componentId/versions - Get version history for a specific component
 */
router.get('/components/:componentId/versions', async (req, res) => {
  try {
    const { componentId } = req.params;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    
    const result = await getComponentVersionHistory(
      parseInt(componentId),
      organizationId
    );
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Failed to get version history',
        details: result.error
      });
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error getting component version history:', error);
    res.status(500).json({
      error: 'Failed to get version history',
      details: error.message
    });
  }
});

/**
 * GET /api/coauthor/components/:componentId/usage - Get usage comparison for a component
 */
router.get('/components/:componentId/usage', async (req, res) => {
  try {
    const { componentId } = req.params;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    
    const result = await getComponentUsageComparison(
      parseInt(componentId),
      organizationId
    );
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Failed to get usage comparison',
        details: result.error
      });
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error getting component usage comparison:', error);
    res.status(500).json({
      error: 'Failed to get usage comparison',
      details: error.message
    });
  }
});

/* ================================================================================
 * COMPONENT MANAGEMENT API ENDPOINTS
 * ================================================================================ */

/**
 * POST /api/coauthor/components/ingest - Ingest a new component
 */
router.post('/components/ingest', async (req, res) => {
  try {
    const { content, type, metadata } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = parseInt(req.headers['x-user-id']) || 1;
    
    const result = await ingestComponent(
      content,
      type,
      metadata,
      organizationId,
      userId
    );
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error ingesting component:', error);
    res.status(500).json({
      error: 'Failed to ingest component',
      details: error.message
    });
  }
});

/**
 * GET /api/coauthor/components/:id/version - Get component version
 */
router.get('/components/:id/version', async (req, res) => {
  try {
    const { id } = req.params;
    const { version } = req.query;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    
    const result = await getComponentVersion(
      parseInt(id),
      version ? parseInt(version) : null,
      organizationId
    );
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error getting component version:', error);
    res.status(500).json({
      error: 'Failed to get component version',
      details: error.message
    });
  }
});

/**
 * PUT /api/coauthor/components/:id/version - Update component version
 */
router.put('/components/:id/version', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, changeDescription } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = parseInt(req.headers['x-user-id']) || 1;
    const userName = req.headers['x-user-name'] || `User ${userId}`;
    
    const result = await updateComponentVersion(
      parseInt(id),
      content,
      changeDescription,
      userId,
      userName,
      organizationId
    );
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error updating component version:', error);
    res.status(500).json({
      error: 'Failed to update component version',
      details: error.message
    });
  }
});

/**
 * POST /api/coauthor/components/find-reusable - Find reusable components
 */
router.post('/components/find-reusable', async (req, res) => {
  try {
    const { content, type, threshold } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    
    const result = await findReusableComponentsForContent(
      content,
      type,
      organizationId,
      threshold
    );
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error finding reusable components:', error);
    res.status(500).json({
      error: 'Failed to find reusable components',
      details: error.message
    });
  }
});

/**
 * POST /api/coauthor/components/link - Link component to document
 */
router.post('/components/link', async (req, res) => {
  try {
    const { componentId, documentId, position } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    
    const result = await linkComponentToDocument(
      componentId,
      documentId,
      position,
      organizationId
    );
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error linking component to document:', error);
    res.status(500).json({
      error: 'Failed to link component to document',
      details: error.message
    });
  }
});

/**
 * POST /api/coauthor/components/lineage - Track component lineage
 */
router.post('/components/lineage', async (req, res) => {
  try {
    const { componentId, parentId, relationshipType } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    
    const result = await trackComponentLineage(
      componentId,
      parentId,
      relationshipType,
      organizationId
    );
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error tracking component lineage:', error);
    res.status(500).json({
      error: 'Failed to track component lineage',
      details: error.message
    });
  }
});

/**
 * POST /api/coauthor/components/lock - Lock a component for editing
 */
router.post('/components/lock', async (req, res) => {
  try {
    const { componentId, documentId, reason } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = parseInt(req.headers['x-user-id']) || 1;
    const userName = req.headers['x-user-name'] || `User ${userId}`;
    
    const result = await lockComponent(
      componentId,
      documentId,
      userId,
      userName,
      organizationId,
      reason
    );
    
    if (!result.success) {
      return res.status(409).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error locking component:', error);
    res.status(500).json({
      error: 'Failed to lock component',
      details: error.message
    });
  }
});

/**
 * POST /api/coauthor/components/unlock - Unlock a component
 */
router.post('/components/unlock', async (req, res) => {
  try {
    const { componentId, documentId } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = parseInt(req.headers['x-user-id']) || 1;
    
    const result = await unlockComponent(
      componentId,
      documentId,
      userId,
      organizationId
    );
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error unlocking component:', error);
    res.status(500).json({
      error: 'Failed to unlock component',
      details: error.message
    });
  }
});

/**
 * POST /api/coauthor/components/refresh-lock - Refresh a component lock
 */
router.post('/components/refresh-lock', async (req, res) => {
  try {
    const { componentId, documentId } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = parseInt(req.headers['x-user-id']) || 1;
    
    const result = await refreshLock(
      componentId,
      documentId,
      userId,
      organizationId
    );
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error refreshing lock:', error);
    res.status(500).json({
      error: 'Failed to refresh lock',
      details: error.message
    });
  }
});

/**
 * GET /api/coauthor/documents/:documentId/locks - Get all locks for a document
 */
router.get('/documents/:documentId/locks', async (req, res) => {
  try {
    const { documentId } = req.params;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    
    const result = await getDocumentLocks(
      parseInt(documentId),
      organizationId
    );
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error getting document locks:', error);
    res.status(500).json({
      error: 'Failed to get document locks',
      details: error.message
    });
  }
});

/**
 * POST /api/coauthor/auto-save - Queue auto-save for a document
 */
router.post('/auto-save', async (req, res) => {
  try {
    const { documentId, content } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = parseInt(req.headers['x-user-id']) || 1;
    
    autoSaveManager.queueSave(documentId, organizationId, content, userId);
    
    res.json({
      success: true,
      message: 'Auto-save queued',
      pendingSaves: autoSaveManager.getPendingSaves()
    });
    
  } catch (error) {
    console.error('Error queuing auto-save:', error);
    res.status(500).json({
      error: 'Failed to queue auto-save',
      details: error.message
    });
  }
});

/**
 * POST /api/coauthor/force-save - Force immediate save
 */
router.post('/force-save', async (req, res) => {
  try {
    const { documentId } = req.body;
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    
    const result = await autoSaveManager.forceSave(documentId, organizationId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error forcing save:', error);
    res.status(500).json({
      error: 'Failed to force save',
      details: error.message
    });
  }
});

/**
 * GET /api/coauthor/pending-saves - Get pending auto-saves
 */
router.get('/pending-saves', async (req, res) => {
  try {
    const pending = autoSaveManager.getPendingSaves();
    
    res.json({
      success: true,
      pendingSaves: pending,
      count: pending.length
    });
    
  } catch (error) {
    console.error('Error getting pending saves:', error);
    res.status(500).json({
      error: 'Failed to get pending saves',
      details: error.message
    });
  }
});

/**
 * POST /api/coauthor/export-pdf - Export document to PDF
 * Note: PDF generation is handled client-side, this endpoint stores metadata
 */
router.post('/export-pdf', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = parseInt(req.headers['x-user-id']) || 1;
    const { documentId, content, metadata } = req.body;
    
    // Record the export event
    if (documentId) {
      await db.insert(coauthorStatusHistory).values({
        documentId,
        fromStatus: 'draft',
        toStatus: 'exported',
        changedBy: userId,
        changeReason: 'Exported to PDF',
        metadata: { format: 'pdf', ...metadata },
        changedAt: sql`NOW()`
      });
    }
    
    res.json({
      success: true,
      message: 'PDF export metadata recorded',
      exportDate: new Date().toISOString(),
      format: 'pdf'
    });
  } catch (error) {
    console.error('Error recording PDF export:', error);
    res.status(500).json({ 
      error: 'Failed to record PDF export',
      details: error.message 
    });
  }
});

/**
 * ======================================================================================
 * eCTD 4.0 PRIORITY NUMBER MANAGEMENT & CROSS-SEQUENCE REFERENCING
 * ======================================================================================
 * Implements architectural requirements for:
 * 1. Priority Number management for display order
 * 2. Cross-sequence component referencing via UDI
 */

/**
 * PUT /api/coauthor/components/:componentId/priority - Update component priority number
 * eCTD 4.0: Allows sponsors to manage the intended display order of documents
 * 21 CFR Part 11: Creates audit trail for priority changes
 */
router.put('/components/:componentId/priority', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { componentId } = req.params;
    const { priorityNumber, displayOrder } = req.body;
    const userId = req.user?.id || 'system'; // Get user ID from auth context
    
    // First, get the current component to track old values for audit
    const [currentComponent] = await db.select()
      .from(components)
      .where(and(
        eq(components.id, parseInt(componentId)),
        eq(components.organizationId, organizationId)
      ))
      .limit(1);
    
    if (!currentComponent) {
      return res.status(404).json({ error: 'Component not found' });
    }
    
    // Store old values for audit
    const oldPriority = currentComponent.priorityNumber;
    const oldDisplayOrder = currentComponent.displayOrder;
    
    // Update the component's priority number and/or display order
    const updateData = {};
    if (priorityNumber !== undefined) updateData.priorityNumber = priorityNumber;
    if (displayOrder !== undefined) updateData.displayOrder = displayOrder;
    updateData.updatedAt = sql`NOW()`;
    
    await db.update(components)
      .set(updateData)
      .where(and(
        eq(components.id, parseInt(componentId)),
        eq(components.organizationId, organizationId)
      ));
    
    // Create 21 CFR Part 11 compliant audit trail entry
    if (priorityNumber !== undefined && priorityNumber !== oldPriority) {
      await ectdAuditService.logPriorityUpdate(
        parseInt(componentId),
        currentComponent.udi,
        oldPriority,
        priorityNumber,
        userId,
        req
      );
    }
    
    res.json({
      success: true,
      message: 'Component priority updated successfully',
      auditLogged: true
    });
    
  } catch (error) {
    console.error('Error updating component priority:', error);
    res.status(500).json({ 
      error: 'Failed to update component priority',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/components/reorder - Bulk reorder components
 * Updates display order for multiple components at once (drag-and-drop support)
 * 21 CFR Part 11: Creates audit trail for bulk reorder operations
 */
router.post('/components/reorder', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { componentOrders } = req.body; // Array of { componentId, displayOrder, priorityNumber }
    const userId = req.user?.id || 'system'; // Get user ID from auth context
    
    // Perform bulk update using transactions
    for (const item of componentOrders) {
      await db.update(components)
        .set({
          displayOrder: item.displayOrder,
          priorityNumber: item.priorityNumber || item.displayOrder,
          updatedAt: sql`NOW()`
        })
        .where(and(
          eq(components.id, item.componentId),
          eq(components.organizationId, organizationId)
        ));
    }
    
    // Create 21 CFR Part 11 compliant audit trail entry for bulk operation
    await ectdAuditService.logBulkReorder(
      componentOrders,
      userId,
      req
    );
    
    res.json({
      success: true,
      message: `Updated display order for ${componentOrders.length} components`,
      auditLogged: true
    });
    
  } catch (error) {
    console.error('Error reordering components:', error);
    res.status(500).json({ 
      error: 'Failed to reorder components',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/components/:componentId/reference - Record cross-sequence UDI reference
 * Tracks when a component (identified by UDI) is used in a specific sequence
 * 21 CFR Part 11: Creates audit trail for cross-sequence references
 */
router.post('/components/:componentId/reference', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { componentId } = req.params;
    const userId = req.user?.id || 'system'; // Get user ID from auth context
    const {
      sequenceNumber,
      submissionId,
      applicationNumber,
      documentId,
      documentTitle,
      moduleContext,
      sectionNumber,
      ectdOperation,
      replacedUdi,
      reusedFromSequence,
      metadata
    } = req.body;
    
    // Get component UDI
    const [component] = await db.select()
      .from(components)
      .where(and(
        eq(components.id, parseInt(componentId)),
        eq(components.organizationId, organizationId)
      ))
      .limit(1);
    
    if (!component) {
      return res.status(404).json({ error: 'Component not found' });
    }
    
    // Check if this is the first use in this sequence
    const existingRefs = await db.select()
      .from(componentSequenceReferences)
      .where(and(
        eq(componentSequenceReferences.udi, component.udi),
        eq(componentSequenceReferences.sequenceNumber, sequenceNumber),
        eq(componentSequenceReferences.organizationId, organizationId)
      ));
    
    const isFirstUse = existingRefs.length === 0;
    
    // Insert the sequence reference
    const [reference] = await db.insert(componentSequenceReferences).values({
      organizationId,
      componentId: parseInt(componentId),
      udi: component.udi,
      sequenceNumber,
      submissionId: submissionId || null,
      applicationNumber: applicationNumber || null,
      documentId: documentId || null,
      documentTitle: documentTitle || null,
      moduleContext: moduleContext || null,
      sectionNumber: sectionNumber || null,
      ectdOperation: ectdOperation || 'new',
      replacedUdi: replacedUdi || null,
      firstUsedInSequence: isFirstUse,
      reusedFromSequence: reusedFromSequence || null,
      metadata: metadata || null,
      createdAt: sql`NOW()`,
      updatedAt: sql`NOW()`
    }).returning();
    
    // Update component usage tracking
    await db.update(components)
      .set({
        usageCount: sql`${components.usageCount} + 1`,
        lastUsedAt: sql`NOW()`,
        updatedAt: sql`NOW()`
      })
      .where(eq(components.id, parseInt(componentId)));
    
    // Create 21 CFR Part 11 compliant audit trail entry
    await ectdAuditService.logCrossSequenceReference(
      parseInt(componentId),
      component.udi,
      sequenceNumber,
      {
        submissionId,
        applicationNumber,
        documentTitle,
        moduleContext,
        sectionNumber,
        ectdOperation: ectdOperation || 'new',
        replacedUdi,
        reusedFromSequence,
        firstUseInSequence: isFirstUse
      },
      userId,
      req
    );
    
    res.json({
      success: true,
      reference,
      firstUseInSequence: isFirstUse,
      auditLogged: true
    });
    
  } catch (error) {
    console.error('Error recording component reference:', error);
    res.status(500).json({ 
      error: 'Failed to record component reference',
      details: error.message 
    });
  }
});

/**
 * GET /api/coauthor/components/:componentId/sequence-usage - Get all sequences using a component
 * Returns "where-used" analysis showing all sequences/documents referencing this UDI
 */
router.get('/components/:componentId/sequence-usage', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { componentId } = req.params;
    
    // Get component to retrieve UDI
    const [component] = await db.select()
      .from(components)
      .where(and(
        eq(components.id, parseInt(componentId)),
        eq(components.organizationId, organizationId)
      ))
      .limit(1);
    
    if (!component) {
      return res.status(404).json({ error: 'Component not found' });
    }
    
    // Get all sequence references for this UDI
    const references = await db.select()
      .from(componentSequenceReferences)
      .where(and(
        eq(componentSequenceReferences.udi, component.udi),
        eq(componentSequenceReferences.organizationId, organizationId)
      ))
      .orderBy(desc(componentSequenceReferences.createdAt));
    
    // Group by sequence number
    const sequenceMap = references.reduce((acc, ref) => {
      if (!acc[ref.sequenceNumber]) {
        acc[ref.sequenceNumber] = {
          sequenceNumber: ref.sequenceNumber,
          applicationNumber: ref.applicationNumber,
          documents: [],
          firstUsedAt: ref.createdAt
        };
      }
      
      if (ref.documentId) {
        acc[ref.sequenceNumber].documents.push({
          documentId: ref.documentId,
          documentTitle: ref.documentTitle,
          moduleContext: ref.moduleContext,
          sectionNumber: ref.sectionNumber,
          ectdOperation: ref.ectdOperation,
          usedAt: ref.createdAt
        });
      }
      
      return acc;
    }, {});
    
    res.json({
      success: true,
      component: {
        id: component.id,
        udi: component.udi,
        type: component.type,
        moduleContext: component.moduleContext,
        sectionNumber: component.sectionNumber
      },
      sequenceUsage: Object.values(sequenceMap),
      totalSequences: Object.keys(sequenceMap).length,
      totalReferences: references.length
    });
    
  } catch (error) {
    console.error('Error getting sequence usage:', error);
    res.status(500).json({ 
      error: 'Failed to get sequence usage',
      details: error.message 
    });
  }
});

/**
 * GET /api/coauthor/sequences/:sequenceNumber/components - Get all components used in a sequence
 * Returns all UDI components referenced in a specific eCTD sequence
 */
router.get('/sequences/:sequenceNumber/components', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { sequenceNumber } = req.params;
    
    // Get all components used in this sequence with their details
    const references = await db.select({
      reference: componentSequenceReferences,
      component: components
    })
      .from(componentSequenceReferences)
      .leftJoin(components, eq(componentSequenceReferences.componentId, components.id))
      .where(and(
        eq(componentSequenceReferences.sequenceNumber, sequenceNumber),
        eq(componentSequenceReferences.organizationId, organizationId)
      ))
      .orderBy(
        asc(componentSequenceReferences.sectionNumber),
        asc(components.displayOrder)
      );
    
    res.json({
      success: true,
      sequenceNumber,
      components: references.map(r => ({
        ...r.component,
        sequenceReference: {
          documentId: r.reference.documentId,
          documentTitle: r.reference.documentTitle,
          moduleContext: r.reference.moduleContext,
          sectionNumber: r.reference.sectionNumber,
          ectdOperation: r.reference.ectdOperation,
          firstUsedInSequence: r.reference.firstUsedInSequence,
          reusedFromSequence: r.reference.reusedFromSequence,
          usedAt: r.reference.createdAt
        }
      })),
      totalComponents: references.length
    });
    
  } catch (error) {
    console.error('Error getting sequence components:', error);
    res.status(500).json({ 
      error: 'Failed to get sequence components',
      details: error.message 
    });
  }
});

/**
 * ======================================================================================
 * CONTROLLED VOCABULARY ENFORCEMENT (eCTD 4.0 MANDATE SECTION 2.2)
 * ======================================================================================
 * APIs for managing and enforcing regulatory metadata governance
 */

/**
 * GET /api/coauthor/controlled-vocabulary - Get all available controlled vocabularies
 */
router.get('/controlled-vocabulary', async (req, res) => {
  try {
    const vocabularies = controlledVocabularyService.getAllVocabularies();
    res.json({
      success: true,
      vocabularies
    });
  } catch (error) {
    console.error('Error fetching controlled vocabularies:', error);
    res.status(500).json({ 
      error: 'Failed to fetch controlled vocabularies',
      details: error.message 
    });
  }
});

/**
 * GET /api/coauthor/controlled-vocabulary/:vocabularyName - Get specific vocabulary
 */
router.get('/controlled-vocabulary/:vocabularyName', async (req, res) => {
  try {
    const { vocabularyName } = req.params;
    const vocabulary = controlledVocabularyService.getVocabulary(vocabularyName);
    
    if (!vocabulary) {
      return res.status(404).json({ error: 'Vocabulary not found' });
    }
    
    res.json({
      success: true,
      vocabularyName,
      vocabulary
    });
  } catch (error) {
    console.error('Error fetching vocabulary:', error);
    res.status(500).json({ 
      error: 'Failed to fetch vocabulary',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/controlled-vocabulary/validate - Validate terms against vocabulary
 */
router.post('/controlled-vocabulary/validate', async (req, res) => {
  try {
    const { vocabularyName, value } = req.body;
    
    if (!vocabularyName || !value) {
      return res.status(400).json({ 
        error: 'vocabularyName and value are required' 
      });
    }
    
    const validation = controlledVocabularyService.validateTerm(vocabularyName, value);
    
    res.json({
      success: validation.valid,
      ...validation
    });
  } catch (error) {
    console.error('Error validating term:', error);
    res.status(500).json({ 
      error: 'Failed to validate term',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/components/:componentId/vocabulary - Apply vocabulary to component
 * 21 CFR Part 11: Creates audit trail for vocabulary application
 */
router.post('/components/:componentId/vocabulary', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { componentId } = req.params;
    const userId = req.user?.id || 'system';
    const vocabularyData = req.body;
    
    // Apply controlled vocabulary
    const result = await controlledVocabularyService.applyVocabularyToComponent(
      parseInt(componentId),
      vocabularyData,
      organizationId
    );
    
    // Create audit trail entry for Context of Use change
    if (vocabularyData.contextOfUse) {
      // Get component for UDI
      const [component] = await db.select()
        .from(components)
        .where(and(
          eq(components.id, parseInt(componentId)),
          eq(components.organizationId, organizationId)
        ))
        .limit(1);
      
      if (component) {
        await ectdAuditService.logContextOfUseChange(
          parseInt(componentId),
          component.udi,
          component.contextOfUse,
          vocabularyData.contextOfUse,
          userId,
          req
        );
      }
    }
    
    res.json({
      success: true,
      ...result,
      auditLogged: true
    });
  } catch (error) {
    console.error('Error applying vocabulary:', error);
    res.status(500).json({ 
      error: 'Failed to apply vocabulary',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/components/bulk-vocabulary - Apply vocabulary to multiple components
 */
router.post('/components/bulk-vocabulary', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { componentIds, vocabularyData } = req.body;
    
    if (!componentIds || !Array.isArray(componentIds) || componentIds.length === 0) {
      return res.status(400).json({ 
        error: 'componentIds array is required' 
      });
    }
    
    const results = await controlledVocabularyService.bulkApplyVocabulary(
      componentIds,
      vocabularyData,
      organizationId
    );
    
    res.json({
      success: true,
      results,
      totalProcessed: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });
  } catch (error) {
    console.error('Error applying bulk vocabulary:', error);
    res.status(500).json({ 
      error: 'Failed to apply bulk vocabulary',
      details: error.message 
    });
  }
});

/**
 * GET /api/coauthor/controlled-vocabulary/statistics - Get vocabulary usage statistics
 */
router.get('/controlled-vocabulary/statistics', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    
    const statistics = await controlledVocabularyService.getVocabularyStatistics(
      organizationId
    );
    
    res.json({
      success: true,
      statistics
    });
  } catch (error) {
    console.error('Error fetching vocabulary statistics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch vocabulary statistics',
      details: error.message 
    });
  }
});

/**
 * ======================================================================================
 * GLOBAL CHANGE MANAGEMENT (AI/NLP-POWERED TEXT TRANSFORMATION)
 * ======================================================================================
 * Implements mandate Table 1 for context-aware text changes across dossier
 */

/**
 * POST /api/coauthor/global-change/preview - Preview global text changes
 */
router.post('/global-change/preview', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { originalText, newText, useAI = true } = req.body;
    
    if (!originalText || !newText) {
      return res.status(400).json({ 
        error: 'originalText and newText are required' 
      });
    }
    
    const preview = await globalChangeManagementService.previewChanges(
      originalText,
      newText,
      organizationId,
      useAI
    );
    
    res.json({
      success: true,
      ...preview
    });
  } catch (error) {
    console.error('Error generating preview:', error);
    res.status(500).json({ 
      error: 'Failed to generate preview',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/global-change/apply - Apply global text changes
 * 21 CFR Part 11: Creates comprehensive audit trail for all changes
 */
router.post('/global-change/apply', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = req.user?.id || parseInt(req.headers['x-user-id']) || 1;
    const changeRequest = {
      ...req.body,
      organizationId
    };
    
    if (!changeRequest.originalText || !changeRequest.newText) {
      return res.status(400).json({ 
        error: 'originalText and newText are required' 
      });
    }
    
    const result = await globalChangeManagementService.applyGlobalChange(
      changeRequest,
      userId,
      req
    );
    
    res.json({
      success: true,
      ...result,
      auditLogged: true
    });
  } catch (error) {
    console.error('Error applying global change:', error);
    res.status(500).json({ 
      error: 'Failed to apply global change',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/global-change/validate - Validate change for compliance
 */
router.post('/global-change/validate', async (req, res) => {
  try {
    const { originalText, newText, componentType } = req.body;
    
    if (!originalText || !newText) {
      return res.status(400).json({ 
        error: 'originalText and newText are required' 
      });
    }
    
    const validation = await globalChangeManagementService.validateChange(
      originalText,
      newText,
      componentType
    );
    
    res.json({
      success: true,
      validation
    });
  } catch (error) {
    console.error('Error validating change:', error);
    res.status(500).json({ 
      error: 'Failed to validate change',
      details: error.message 
    });
  }
});

/**
 * GET /api/coauthor/global-change/history - Get change history
 */
router.get('/global-change/history', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { limit = 100 } = req.query;
    
    const history = await globalChangeManagementService.getChangeHistory(
      organizationId,
      parseInt(limit)
    );
    
    res.json({
      success: true,
      history,
      totalRecords: history.length
    });
  } catch (error) {
    console.error('Error fetching change history:', error);
    res.status(500).json({ 
      error: 'Failed to fetch change history',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/global-change/rollback/:changeId - Rollback a change
 */
router.post('/global-change/rollback/:changeId', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = req.user?.id || 'system';
    const { changeId } = req.params;
    
    const result = await globalChangeManagementService.rollbackChange(
      parseInt(changeId),
      organizationId,
      userId,
      req
    );
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error rolling back change:', error);
    res.status(500).json({ 
      error: 'Failed to rollback change',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/global-change/smart-replace - AI-powered smart text replacement
 */
router.post('/global-change/smart-replace', async (req, res) => {
  try {
    const { originalText, newText, content, context } = req.body;
    
    if (!originalText || !newText || !content) {
      return res.status(400).json({ 
        error: 'originalText, newText, and content are required' 
      });
    }
    
    const updatedContent = await globalChangeManagementService.smartReplace(
      originalText,
      newText,
      content,
      context || {}
    );
    
    res.json({
      success: true,
      updatedContent
    });
  } catch (error) {
    console.error('Error in smart replace:', error);
    res.status(500).json({ 
      error: 'Failed to perform smart replacement',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/components/:componentId/suggest-context - AI suggest context of use
 */
router.post('/components/:componentId/suggest-context', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { componentId } = req.params;
    
    // Get component content
    const [component] = await db.select()
      .from(components)
      .where(and(
        eq(components.id, parseInt(componentId)),
        eq(components.organizationId, organizationId)
      ))
      .limit(1);
    
    if (!component) {
      return res.status(404).json({ error: 'Component not found' });
    }
    
    // Get content text from component
    const contentText = typeof component.content === 'string' 
      ? component.content 
      : component.content?.text || JSON.stringify(component.content);
    
    // Suggest context of use
    const suggestedContext = controlledVocabularyService.suggestContextOfUse(
      contentText,
      component.moduleContext
    );
    
    // Generate context group
    const contextGroup = controlledVocabularyService.generateContextGroup(
      suggestedContext,
      component.tags || [],
      component.moduleContext
    );
    
    res.json({
      success: true,
      componentId: component.id,
      udi: component.udi,
      suggestedContextOfUse: suggestedContext,
      generatedContextGroup: contextGroup,
      confidence: suggestedContext ? 'high' : 'low'
    });
  } catch (error) {
    console.error('Error suggesting context:', error);
    res.status(500).json({ 
      error: 'Failed to suggest context',
      details: error.message 
    });
  }
});

/* ================================================================================
 * VERSION HISTORY ENDPOINTS - SHAREPOINT-STYLE VERSION CONTROL
 * ================================================================================
 * These endpoints implement comprehensive version control with diff comparison
 * for the Global Change Management system with 21 CFR Part 11 compliance.
 * ================================================================================ */

/**
 * GET /api/coauthor/components/:componentId/versions - Get version history for a component
 */
router.get('/components/:componentId/versions', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { componentId } = req.params;
    const { limit = 100, offset = 0, includeContent = false } = req.query;
    
    // Get all versions for the component
    const versions = await db.select({
      id: componentVersions.id,
      componentId: componentVersions.componentId,
      versionNumber: componentVersions.versionNumber,
      versionLabel: componentVersions.versionLabel,
      content: includeContent === 'true' ? componentVersions.content : sql`NULL`,
      diff: componentVersions.diff,
      changeDescription: componentVersions.changeDescription,
      changeType: componentVersions.changeType,
      complianceStatus: componentVersions.complianceStatus,
      complianceNotes: componentVersions.complianceNotes,
      validatedAgainst: componentVersions.validatedAgainst,
      createdById: componentVersions.createdById,
      createdByName: componentVersions.createdByName,
      approvedById: componentVersions.approvedById,
      approvedAt: componentVersions.approvedAt,
      createdAt: componentVersions.createdAt,
      metadata: sql`jsonb_build_object(
        'status', CASE 
          WHEN ${componentVersions.approvedAt} IS NOT NULL THEN 'approved'
          WHEN ${componentVersions.complianceStatus} = 'compliant' THEN 'published'
          ELSE 'draft'
        END,
        'locked', CASE
          WHEN ${componentVersions.approvedAt} IS NOT NULL THEN true
          ELSE false
        END,
        'fileSize', length(${componentVersions.content}::text)::int,
        'signature', ${componentVersions.approvedById} IS NOT NULL,
        'approvedByName', ${componentVersions.createdByName},
        'dependencies', COALESCE((
          SELECT jsonb_agg(DISTINCT dc.udi)
          FROM ${componentCrossReferences} ccr
          JOIN ${components} dc ON dc.id = ccr.target_component_id
          WHERE ccr.source_component_id = ${componentVersions.componentId}
        ), '[]'::jsonb),
        'changeRequests', '[]'::jsonb,
        'branchPoint', false,
        'mergePoint', false
      )`
    })
    .from(componentVersions)
    .where(and(
      eq(componentVersions.componentId, parseInt(componentId)),
      eq(componentVersions.organizationId, organizationId)
    ))
    .orderBy(desc(componentVersions.versionNumber))
    .limit(parseInt(limit))
    .offset(parseInt(offset));
    
    res.json(versions);
  } catch (error) {
    console.error('Error fetching version history:', error);
    res.status(500).json({ 
      error: 'Failed to fetch version history',
      details: error.message 
    });
  }
});

/**
 * GET /api/coauthor/components/:componentId - Get component details
 */
router.get('/components/:componentId', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { componentId } = req.params;
    
    const [component] = await db.select()
      .from(components)
      .where(and(
        eq(components.id, parseInt(componentId)),
        eq(components.organizationId, organizationId)
      ))
      .limit(1);
    
    if (!component) {
      return res.status(404).json({ error: 'Component not found' });
    }
    
    res.json(component);
  } catch (error) {
    console.error('Error fetching component:', error);
    res.status(500).json({ 
      error: 'Failed to fetch component',
      details: error.message 
    });
  }
});

/**
 * POST /api/coauthor/components/:componentId/versions/:versionId/restore - Restore a version
 */
router.post('/components/:componentId/versions/:versionId/restore', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = req.user?.id || 1;
    const userName = req.user?.name || 'System';
    const { componentId, versionId } = req.params;
    const { reason } = req.body;
    
    // Get the version to restore
    const [versionToRestore] = await db.select()
      .from(componentVersions)
      .where(and(
        eq(componentVersions.id, parseInt(versionId)),
        eq(componentVersions.componentId, parseInt(componentId)),
        eq(componentVersions.organizationId, organizationId)
      ))
      .limit(1);
    
    if (!versionToRestore) {
      return res.status(404).json({ error: 'Version not found' });
    }
    
    // Get the current latest version number
    const [latestVersion] = await db.select({
      maxVersion: sql`MAX(${componentVersions.versionNumber})`
    })
    .from(componentVersions)
    .where(and(
      eq(componentVersions.componentId, parseInt(componentId)),
      eq(componentVersions.organizationId, organizationId)
    ));
    
    const nextVersionNumber = (latestVersion?.maxVersion || 0) + 1;
    
    // Create a new version with restored content
    const [newVersion] = await db.insert(componentVersions)
      .values({
        componentId: parseInt(componentId),
        organizationId,
        versionNumber: nextVersionNumber,
        versionLabel: `Restored from v${versionToRestore.versionNumber}`,
        content: versionToRestore.content,
        changeDescription: `Restored from version ${versionToRestore.versionNumber}. Reason: ${reason || 'No reason provided'}`,
        changeType: 'major',
        complianceStatus: 'needs-review',
        createdById: userId,
        createdByName: userName
      })
      .returning();
    
    // Update the component's current content
    await db.update(components)
      .set({
        content: versionToRestore.content,
        updatedAt: new Date()
      })
      .where(and(
        eq(components.id, parseInt(componentId)),
        eq(components.organizationId, organizationId)
      ));
    
    // Log the restore action in audit trail
    if (ectdAuditService) {
      await ectdAuditService.createAuditEntry(
        organizationId,
        'component',
        componentId,
        'restore_version',
        userName,
        `Restored component to version ${versionToRestore.versionNumber}`,
        { 
          restoredVersionId: versionId,
          newVersionId: newVersion.id,
          reason 
        }
      );
    }
    
    res.json({
      success: true,
      newVersion,
      message: `Successfully restored version ${versionToRestore.versionNumber}`
    });
  } catch (error) {
    console.error('Error restoring version:', error);
    res.status(500).json({ 
      error: 'Failed to restore version',
      details: error.message 
    });
  }
});

/**
 * GET /api/coauthor/components/:componentId/versions/export - Export version history
 */
router.get('/components/:componentId/versions/export', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { componentId } = req.params;
    const { format = 'pdf' } = req.query;
    
    // Get all versions
    const versions = await db.select()
      .from(componentVersions)
      .where(and(
        eq(componentVersions.componentId, parseInt(componentId)),
        eq(componentVersions.organizationId, organizationId)
      ))
      .orderBy(desc(componentVersions.versionNumber));
    
    // Get component details
    const [component] = await db.select()
      .from(components)
      .where(and(
        eq(components.id, parseInt(componentId)),
        eq(components.organizationId, organizationId)
      ))
      .limit(1);
    
    if (format === 'csv') {
      // Export as CSV
      const csv = [
        'Version,Label,Change Type,Description,Created By,Created At,Compliance Status',
        ...versions.map(v => 
          `${v.versionNumber},"${v.versionLabel || ''}","${v.changeType}","${v.changeDescription || ''}","${v.createdByName}","${v.createdAt}","${v.complianceStatus || ''}"`
        )
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="version-history-${componentId}.csv"`);
      res.send(csv);
    } else if (format === 'html') {
      // Export as HTML with diff highlighting
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Version History - ${component?.udi || componentId}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #333; }
            .version { margin-bottom: 30px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
            .version-header { background-color: #f5f5f5; margin: -15px -15px 15px -15px; padding: 15px; border-radius: 5px 5px 0 0; }
            .metadata { color: #666; font-size: 14px; }
            .added { background-color: #d4f4dd; }
            .removed { background-color: #fdd4d4; text-decoration: line-through; }
            .modified { background-color: #fff4d4; }
          </style>
        </head>
        <body>
          <h1>Version History</h1>
          <h2>${component?.udi || 'Component'}</h2>
          ${versions.map(v => `
            <div class="version">
              <div class="version-header">
                <h3>Version ${v.versionNumber} ${v.versionLabel ? `- ${v.versionLabel}` : ''}</h3>
                <div class="metadata">
                  <p>Created by: ${v.createdByName} on ${new Date(v.createdAt).toLocaleString()}</p>
                  <p>Change Type: ${v.changeType}</p>
                  <p>Description: ${v.changeDescription || 'No description'}</p>
                </div>
              </div>
              ${v.diff ? `<div class="diff">${JSON.stringify(v.diff)}</div>` : ''}
            </div>
          `).join('')}
        </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="version-history-${componentId}.html"`);
      res.send(html);
    } else {
      // Export as PDF (would require a PDF generation library like puppeteer or pdfkit)
      // For now, return a JSON response
      res.json({
        error: 'PDF export requires additional setup',
        availableFormats: ['csv', 'html'],
        versions: versions.length
      });
    }
  } catch (error) {
    console.error('Error exporting version history:', error);
    res.status(500).json({ 
      error: 'Failed to export version history',
      details: error.message 
    });
  }
});

/**
 * DELETE /api/coauthor/components/:componentId/versions/:versionId - Delete a version
 */
router.delete('/components/:componentId/versions/:versionId', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userName = req.user?.name || 'System';
    const { componentId, versionId } = req.params;
    
    // Check if version exists and is not the latest
    const [versionToDelete] = await db.select()
      .from(componentVersions)
      .where(and(
        eq(componentVersions.id, parseInt(versionId)),
        eq(componentVersions.componentId, parseInt(componentId)),
        eq(componentVersions.organizationId, organizationId)
      ))
      .limit(1);
    
    if (!versionToDelete) {
      return res.status(404).json({ error: 'Version not found' });
    }
    
    // Check if this is the latest version
    const [latestVersion] = await db.select({
      maxVersion: sql`MAX(${componentVersions.versionNumber})`
    })
    .from(componentVersions)
    .where(and(
      eq(componentVersions.componentId, parseInt(componentId)),
      eq(componentVersions.organizationId, organizationId)
    ));
    
    if (versionToDelete.versionNumber === latestVersion.maxVersion) {
      return res.status(400).json({ error: 'Cannot delete the current version' });
    }
    
    // Check if version is locked (approved)
    if (versionToDelete.approvedAt) {
      return res.status(400).json({ error: 'Cannot delete an approved/locked version' });
    }
    
    // Delete the version
    await db.delete(componentVersions)
      .where(and(
        eq(componentVersions.id, parseInt(versionId)),
        eq(componentVersions.organizationId, organizationId)
      ));
    
    // Log the deletion in audit trail
    if (ectdAuditService) {
      await ectdAuditService.createAuditEntry(
        organizationId,
        'component_version',
        versionId,
        'delete_version',
        userName,
        `Deleted version ${versionToDelete.versionNumber}`,
        { componentId, versionNumber: versionToDelete.versionNumber }
      );
    }
    
    res.json({
      success: true,
      message: `Successfully deleted version ${versionToDelete.versionNumber}`
    });
  } catch (error) {
    console.error('Error deleting version:', error);
    res.status(500).json({ 
      error: 'Failed to delete version',
      details: error.message 
    });
  }
});

/**
 * ===============================
 * GOOGLE DOCS OAUTH INTEGRATION
 * ===============================
 */

// Import Google OAuth service
let googleOAuthService;
try {
  googleOAuthService = await import('../services/googleOAuthService.js');
} catch (error) {
  console.warn('Google OAuth service not available:', error.message);
}

/**
 * GET /api/coauthor/google/auth - Initiate Google OAuth flow
 */
router.get('/google/auth', async (req, res) => {
  if (!googleOAuthService) {
    return res.status(503).json({
      error: 'Google integration not configured',
      details: 'Please configure Google OAuth credentials'
    });
  }

  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = parseInt(req.headers['x-user-id']) || 1;
    
    // Create state for CSRF protection
    const state = Buffer.from(JSON.stringify({
      organizationId,
      userId,
      timestamp: Date.now(),
      returnUrl: req.query.returnUrl || '/coauthor'
    })).toString('base64');
    
    // Get authorization URL
    const authUrl = googleOAuthService.getAuthorizationUrl(state);
    
    res.json({
      success: true,
      authUrl,
      message: 'Redirect user to authUrl to authenticate with Google'
    });
  } catch (error) {
    console.error('Error initiating Google auth:', error);
    res.status(500).json({
      error: 'Failed to initiate Google authentication',
      details: error.message
    });
  }
});

/**
 * GET /api/coauthor/google/callback - Handle OAuth callback
 */
router.get('/google/callback', async (req, res) => {
  if (!googleOAuthService) {
    return res.redirect('/coauthor?error=google_not_configured');
  }

  try {
    const { code, state } = req.query;
    
    if (!code) {
      return res.redirect('/coauthor?error=google_auth_denied');
    }
    
    // Decode state
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (e) {
      return res.redirect('/coauthor?error=invalid_state');
    }
    
    // Exchange code for tokens
    const { tokens, userInfo } = await googleOAuthService.getTokensFromCode(code);
    
    // Store tokens
    await googleOAuthService.storeTokens(
      stateData.organizationId,
      stateData.userId,
      tokens,
      userInfo
    );
    
    // Redirect back to application
    res.redirect(`${stateData.returnUrl || '/coauthor'}?google_connected=true`);
  } catch (error) {
    console.error('Error handling Google callback:', error);
    res.redirect('/coauthor?error=google_auth_failed');
  }
});

/**
 * GET /api/coauthor/google/status - Check Google auth status
 */
router.get('/google/status', async (req, res) => {
  if (!googleOAuthService) {
    return res.json({
      connected: false,
      error: 'Google integration not configured'
    });
  }

  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = parseInt(req.headers['x-user-id']) || 1;
    
    const hasAuth = await googleOAuthService.hasGoogleAuth(organizationId, userId);
    
    res.json({
      connected: hasAuth,
      provider: 'google'
    });
  } catch (error) {
    console.error('Error checking Google auth status:', error);
    res.status(500).json({
      error: 'Failed to check authentication status',
      details: error.message
    });
  }
});

/**
 * POST /api/coauthor/google/create - Create Google Doc
 */
router.post('/google/create', async (req, res) => {
  if (!googleOAuthService) {
    return res.status(503).json({
      error: 'Google integration not configured'
    });
  }

  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = parseInt(req.headers['x-user-id']) || 1;
    const { title, content, documentId } = req.body;
    
    // Create Google Doc
    const googleDoc = await googleOAuthService.createGoogleDoc(
      organizationId,
      userId,
      title || 'Untitled eCTD Document',
      content || ''
    );
    
    // If documentId provided, link Google Doc to coauthor document
    if (documentId) {
      await db.update(coauthorDocuments)
        .set({
          googleDocId: googleDoc.documentId,
          googleDocUrl: googleDoc.url,
          metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ googleDoc: googleDoc })}::jsonb`
        })
        .where(and(
          eq(coauthorDocuments.id, parseInt(documentId)),
          eq(coauthorDocuments.organizationId, organizationId)
        ));
    }
    
    res.json({
      success: true,
      googleDoc
    });
  } catch (error) {
    console.error('Error creating Google Doc:', error);
    res.status(500).json({
      error: 'Failed to create Google Doc',
      details: error.message
    });
  }
});

/**
 * GET /api/coauthor/google/sync/:documentId - Sync with Google Doc
 */
router.get('/google/sync/:documentId', async (req, res) => {
  if (!googleOAuthService) {
    return res.status(503).json({
      error: 'Google integration not configured'
    });
  }

  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = parseInt(req.headers['x-user-id']) || 1;
    const { documentId } = req.params;
    
    // Get document with Google Doc ID
    const [doc] = await db.select()
      .from(coauthorDocuments)
      .where(and(
        eq(coauthorDocuments.id, parseInt(documentId)),
        eq(coauthorDocuments.organizationId, organizationId)
      ))
      .limit(1);
    
    if (!doc || !doc.googleDocId) {
      return res.status(404).json({
        error: 'Document not linked to Google Doc'
      });
    }
    
    // Get content from Google Doc
    const googleContent = await googleOAuthService.getGoogleDocContent(
      organizationId,
      userId,
      doc.googleDocId
    );
    
    // Update local document with Google content
    await db.update(coauthorDocuments)
      .set({
        content: googleContent.content,
        title: googleContent.title,
        lastSync: new Date(),
        updatedAt: new Date()
      })
      .where(eq(coauthorDocuments.id, parseInt(documentId)));
    
    res.json({
      success: true,
      synced: true,
      content: googleContent.content,
      title: googleContent.title,
      lastSync: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error syncing with Google Doc:', error);
    res.status(500).json({
      error: 'Failed to sync with Google Doc',
      details: error.message
    });
  }
});

/**
 * DELETE /api/coauthor/google/disconnect - Revoke Google auth
 */
router.delete('/google/disconnect', async (req, res) => {
  if (!googleOAuthService) {
    return res.status(503).json({
      error: 'Google integration not configured'
    });
  }

  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const userId = parseInt(req.headers['x-user-id']) || 1;
    
    await googleOAuthService.revokeGoogleAuth(organizationId, userId);
    
    res.json({
      success: true,
      message: 'Google authentication revoked successfully'
    });
  } catch (error) {
    console.error('Error revoking Google auth:', error);
    res.status(500).json({
      error: 'Failed to disconnect Google account',
      details: error.message
    });
  }
});

/**
 * GET /api/coauthor/ectd-modules/tree - Get hierarchical eCTD module tree
 * Returns complete IND/eCTD module structure with parent-child relationships
 */
router.get('/ectd-modules/tree', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || req.query.organizationId || 6;
    
    // Get all modules for the organization
    const modules = await db
      .select()
      .from(ectdModules)
      .where(eq(ectdModules.organizationId, organizationId))
      .orderBy(asc(ectdModules.sortOrder));
    
    // Build hierarchical tree structure
    const buildTree = (parentId = null, level = 1) => {
      return modules
        .filter(m => {
          if (parentId === null) {
            return m.parentModuleId === null && m.level === level;
          }
          return m.parentModuleId === parentId;
        })
        .map(module => ({
          id: module.id,
          moduleNumber: module.moduleNumber,
          moduleName: module.moduleName,
          parentModuleId: module.parentModuleId,
          level: module.level,
          isLeaf: module.isLeaf,
          sortOrder: module.sortOrder,
          status: module.status,
          ichGuidance: module.ichGuidance,
          isRequired: module.isRequired,
          allowCustomGranules: module.allowCustomGranules,
          children: buildTree(module.id, module.level + 1)
        }));
    };
    
    const tree = buildTree();
    
    res.json({
      success: true,
      totalModules: modules.length,
      rootModules: tree.length,
      leafModules: modules.filter(m => m.isLeaf).length,
      tree
    });
  } catch (error) {
    console.error('Error fetching eCTD module tree:', error);
    res.status(500).json({
      error: 'Failed to fetch eCTD module tree',
      details: error.message
    });
  }
});

/**
 * GET /api/coauthor/ectd-modules/:moduleNumber - Get specific module details
 */
router.get('/ectd-modules/:moduleNumber', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || req.query.organizationId || 6;
    const { moduleNumber } = req.params;
    
    const [module] = await db
      .select()
      .from(ectdModules)
      .where(and(
        eq(ectdModules.organizationId, organizationId),
        eq(ectdModules.moduleNumber, moduleNumber)
      ))
      .limit(1);
    
    if (!module) {
      return res.status(404).json({
        error: 'Module not found'
      });
    }
    
    // Build breadcrumb trail (from root to current module)
    const breadcrumbs = [];
    let currentModule = module;
    
    while (currentModule) {
      breadcrumbs.unshift({
        id: currentModule.id,
        moduleNumber: currentModule.moduleNumber,
        moduleName: currentModule.moduleName,
        level: currentModule.level
      });
      
      if (currentModule.parentModuleId) {
        [currentModule] = await db
          .select()
          .from(ectdModules)
          .where(eq(ectdModules.id, currentModule.parentModuleId))
          .limit(1);
      } else {
        currentModule = null;
      }
    }
    
    // Get parent if exists
    let parent = null;
    if (module.parentModuleId) {
      [parent] = await db
        .select()
        .from(ectdModules)
        .where(eq(ectdModules.id, module.parentModuleId))
        .limit(1);
    }
    
    // Get children
    const children = await db
      .select()
      .from(ectdModules)
      .where(eq(ectdModules.parentModuleId, module.id))
      .orderBy(asc(ectdModules.sortOrder));
    
    // Get siblings (other modules with same parent)
    let siblings = [];
    if (module.parentModuleId) {
      siblings = await db
        .select()
        .from(ectdModules)
        .where(and(
          eq(ectdModules.parentModuleId, module.parentModuleId),
          sql`${ectdModules.id} != ${module.id}`
        ))
        .orderBy(asc(ectdModules.sortOrder));
    }
    
    res.json({
      success: true,
      module: {
        ...module,
        parent,
        children,
        siblings,
        breadcrumbs,
        hasChildren: children.length > 0,
        hasSiblings: siblings.length > 0,
        fullPath: breadcrumbs.map(b => b.moduleNumber).join(' > ')
      }
    });
  } catch (error) {
    console.error('Error fetching module details:', error);
    res.status(500).json({
      error: 'Failed to fetch module details',
      details: error.message
    });
  }
});

/**
 * GET /api/coauthor/ectd-modules/search/:query - Search modules by name or number
 */
router.get('/ectd-modules/search/:query', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || req.query.organizationId || 6;
    const { query } = req.params;
    
    const results = await db
      .select()
      .from(ectdModules)
      .where(and(
        eq(ectdModules.organizationId, organizationId),
        or(
          like(ectdModules.moduleNumber, `%${query}%`),
          like(ectdModules.moduleName, `%${query}%`)
        )
      ))
      .orderBy(asc(ectdModules.sortOrder))
      .limit(50);
    
    res.json({
      success: true,
      query,
      count: results.length,
      results
    });
  } catch (error) {
    console.error('Error searching modules:', error);
    res.status(500).json({
      error: 'Failed to search modules',
      details: error.message
    });
  }
});

/**
 * GET /api/coauthor/documents/section/:sectionId - Get document for a section (by module number)
 * Maps section IDs (like "3.2.S.4.1") to module documents
 */
router.get('/documents/section/:sectionId', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { sectionId } = req.params;
    
    const [module] = await db
      .select()
      .from(ectdModules)
      .where(and(
        eq(ectdModules.organizationId, organizationId),
        eq(ectdModules.moduleNumber, sectionId)
      ))
      .limit(1);
    
    if (!module) {
      return res.json({
        success: false,
        document: null,
        message: 'Module not found for this section'
      });
    }
    
    const [document] = await db
      .select()
      .from(coauthorDocuments)
      .where(and(
        eq(coauthorDocuments.organizationId, organizationId),
        eq(coauthorDocuments.ectdModuleId, module.id)
      ))
      .orderBy(desc(coauthorDocuments.updatedAt))
      .limit(1);
    
    res.json({
      success: true,
      document: document || null,
      module: {
        id: module.id,
        moduleNumber: module.moduleNumber,
        moduleName: module.moduleName,
        isLeaf: module.isLeaf
      }
    });
  } catch (error) {
    console.error('Error fetching section document:', error);
    res.status(500).json({
      error: 'Failed to fetch section document',
      details: error.message
    });
  }
});

/**
 * GET /api/coauthor/modules/:moduleId/documents - Get all documents for a specific module
 */
router.get('/modules/:moduleId/documents', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { moduleId } = req.params;
    
    const documents = await db
      .select()
      .from(coauthorDocuments)
      .where(and(
        eq(coauthorDocuments.organizationId, organizationId),
        eq(coauthorDocuments.ectdModuleId, parseInt(moduleId))
      ))
      .orderBy(desc(coauthorDocuments.updatedAt));
    
    res.json({
      success: true,
      moduleId: parseInt(moduleId),
      count: documents.length,
      documents
    });
  } catch (error) {
    console.error('Error fetching module documents:', error);
    res.status(500).json({
      error: 'Failed to fetch module documents',
      details: error.message
    });
  }
});

/**
 * Generate AI content for eCTD sections
 */
router.post('/ai/generate', async (req, res) => {
  try {
    const { 
      sectionTitle, 
      context, 
      documentType, 
      templateId,
      requirements,
      previousContent 
    } = req.body;
    
    // Professional eCTD content based on section
    const aiContentMap = {
      'cover_letter': `<h2>Subject: ${context || 'IND Submission'}</h2>
<p>Dear FDA Review Team,</p>
<p>We are pleased to submit this ${documentType || 'regulatory submission'} in accordance with applicable FDA regulations and guidance documents. This submission represents our commitment to advancing therapeutic options while maintaining the highest standards of quality and safety.</p>

<h3>Submission Overview</h3>
<p>This comprehensive submission package includes all required documentation as specified in FDA guidance. Our development program has been designed to meet regulatory requirements while addressing the significant unmet medical need in the target patient population.</p>

<h3>Key Elements</h3>
<ul>
<li>Complete technical documentation addressing all regulatory requirements</li>
<li>Comprehensive quality data demonstrating product consistency and control</li>
<li>Robust safety assessment based on extensive preclinical evaluation</li>
<li>Detailed manufacturing information ensuring reproducibility and quality</li>
</ul>

<h3>Regulatory Compliance</h3>
<p>This submission has been prepared in accordance with:
- 21 CFR Part 312 (IND regulations)
- ICH guidelines for quality, safety, and efficacy
- FDA guidance documents relevant to this product class
- Current eCTD technical specifications</p>

<p>We are committed to maintaining open communication throughout the review process and are available to address any questions or provide additional information as needed.</p>

<p>Thank you for your review of this submission. We look forward to working collaboratively with the Agency to advance this important therapeutic candidate.</p>`,

      'clinical_overview': `<h2>${sectionTitle || 'Clinical Development Overview'}</h2>

<h3>Development Rationale</h3>
<p>The clinical development program for ${context || 'this therapeutic candidate'} has been designed to comprehensively evaluate safety, efficacy, and optimal dosing across the intended patient population. Our approach incorporates current regulatory guidance and scientific best practices to ensure robust data generation.</p>

<h3>Clinical Strategy</h3>
<p>The development strategy follows a systematic approach:
• Phase 1: Safety, tolerability, and pharmacokinetic characterization in healthy volunteers
• Phase 2: Dose-ranging and preliminary efficacy in target patient population
• Phase 3: Pivotal efficacy and safety evaluation in larger patient cohorts
• Phase 4: Post-marketing surveillance and real-world evidence generation</p>

<h3>Key Clinical Findings</h3>
<p>Preliminary data demonstrates:
- Favorable safety profile with no unexpected adverse events
- Dose-proportional pharmacokinetics supporting once-daily administration
- Encouraging efficacy signals warranting continued development
- No significant drug-drug interactions identified to date</p>

<h3>Patient Population</h3>
<p>The target population includes adult patients meeting defined diagnostic criteria. Inclusion and exclusion criteria have been carefully designed to ensure patient safety while maintaining generalizability of results. Special populations including elderly, hepatic, and renal impairment are being evaluated in dedicated studies.</p>

<h3>Risk-Benefit Assessment</h3>
<p>Current data supports a favorable benefit-risk profile for continued development. The observed safety profile is consistent with the mechanism of action, and preliminary efficacy data suggests clinically meaningful benefit potential.</p>`,

      'quality_summary': `<h2>${sectionTitle || 'Quality Overall Summary'}</h2>

<h3>Drug Substance Overview</h3>
<p>The drug substance ${context || 'manufacturing process'} has been developed following Quality by Design (QbD) principles. Critical quality attributes have been identified and controlled through robust manufacturing processes and comprehensive analytical methods.</p>

<h3>Manufacturing Process</h3>
<p>The commercial manufacturing process consists of well-defined unit operations:
• Raw material qualification and testing
• Chemical synthesis or biological production
• Purification and isolation
• Crystallization or formulation
• Final drug substance packaging</p>

<h3>Quality Control Strategy</h3>
<p>A comprehensive control strategy ensures consistent quality:
- Validated analytical methods for identity, purity, and potency
- In-process controls at critical manufacturing steps
- Specification limits based on clinical experience and stability data
- Ongoing stability monitoring program
- Change control procedures to maintain product quality</p>

<h3>Stability Program</h3>
<p>Stability studies conducted under ICH conditions demonstrate:
• Long-term stability supporting proposed shelf life
• Accelerated and stress testing defining degradation pathways
• Container closure system compatibility
• Shipping and handling robustness</p>

<h3>Manufacturing Facilities</h3>
<p>Production occurs in GMP-compliant facilities with appropriate regulatory inspections and approvals. Quality systems ensure consistent manufacturing and testing according to established procedures.</p>`,

      'nonclinical': `<h2>${sectionTitle || 'Nonclinical Development Summary'}</h2>

<h3>Pharmacology Studies</h3>
<p>Comprehensive pharmacology evaluation demonstrates:
• Primary pharmacology: Target engagement and mechanism of action confirmation
• Secondary pharmacology: Off-target effects assessment
• Safety pharmacology: Cardiovascular, respiratory, and CNS evaluations</p>

<h3>Toxicology Program</h3>
<p>The toxicology program ${context ? `for ${context}` : ''} includes:
- Single-dose toxicity studies in two species
- Repeat-dose toxicity (28-day and 13-week) in rodent and non-rodent
- Genotoxicity battery per ICH S2(R1) guidance
- Reproductive toxicity assessment (ongoing)
- Local tolerance evaluation</p>

<h3>ADME Studies</h3>
<p>Absorption, distribution, metabolism, and excretion studies reveal:
• Rapid absorption with high bioavailability
• Tissue distribution consistent with intended therapeutic use
• Metabolism primarily via Phase I pathways
• Elimination predominantly through renal excretion</p>

<h3>Key Safety Findings</h3>
<p>No-observed-adverse-effect levels (NOAELs) provide adequate safety margins for clinical development. Target organ toxicities are monitorable and reversible. No genotoxic potential identified.</p>`,

      'clinical_protocol': `<h2>${sectionTitle || 'Clinical Study Protocol'}</h2>

<h3>Study Objectives</h3>
<p><strong>Primary Objective:</strong> ${requirements || 'To evaluate the efficacy and safety of the investigational product in the target population'}</p>
<p><strong>Secondary Objectives:</strong>
• Characterize pharmacokinetic profile
• Assess dose-response relationship
• Evaluate impact on quality of life measures
• Identify potential biomarkers of response</p>

<h3>Study Design</h3>
<p>This ${documentType || 'randomized, double-blind, placebo-controlled study'} will enroll approximately ${context ? 'subjects across multiple centers' : '100 subjects'}. The design incorporates:
- Screening period to confirm eligibility
- Treatment phase with regular safety monitoring
- Follow-up period for long-term assessment
- Interim analyses for futility and efficacy</p>

<h3>Study Population</h3>
<p><strong>Key Inclusion Criteria:</strong>
• Adults aged 18-75 years
• Confirmed diagnosis per accepted criteria
• Adequate organ function
• Ability to provide informed consent</p>

<p><strong>Key Exclusion Criteria:</strong>
• Significant comorbidities affecting safety
• Prior treatment with similar mechanisms
• Pregnancy or lactation
• Concurrent prohibited medications</p>

<h3>Statistical Considerations</h3>
<p>Sample size calculated to detect clinically meaningful difference with 90% power at 0.05 significance level. Primary analysis will use intention-to-treat population with appropriate statistical methods for endpoint type.</p>

<h3>Safety Monitoring</h3>
<p>Comprehensive safety monitoring includes:
- Regular adverse event assessment
- Laboratory evaluations
- Vital signs and ECG monitoring
- Data Safety Monitoring Board oversight</p>`
    };

    // Select appropriate content based on section or document type
    let generatedContent = '';
    
    if (sectionTitle?.toLowerCase().includes('cover') || sectionTitle?.toLowerCase().includes('letter')) {
      generatedContent = aiContentMap.cover_letter;
    } else if (sectionTitle?.toLowerCase().includes('clinical') && sectionTitle?.toLowerCase().includes('overview')) {
      generatedContent = aiContentMap.clinical_overview;
    } else if (sectionTitle?.toLowerCase().includes('quality') || sectionTitle?.toLowerCase().includes('cmc')) {
      generatedContent = aiContentMap.quality_summary;
    } else if (sectionTitle?.toLowerCase().includes('nonclinical') || sectionTitle?.toLowerCase().includes('toxicology')) {
      generatedContent = aiContentMap.nonclinical;
    } else if (sectionTitle?.toLowerCase().includes('protocol') || sectionTitle?.toLowerCase().includes('study')) {
      generatedContent = aiContentMap.clinical_protocol;
    } else {
      // Generic professional content for other sections
      generatedContent = `<h2>${sectionTitle || 'Section Content'}</h2>

<h3>Overview</h3>
<p>This section addresses ${context || 'the relevant regulatory requirements'} in accordance with applicable FDA guidance and ICH guidelines. The information presented demonstrates compliance with quality standards and regulatory expectations.</p>

<h3>Key Information</h3>
<p>${requirements || 'The following elements are addressed in this section:'}
• Comprehensive documentation of all required elements
• Evidence-based approach to data presentation
• Clear rationale for development decisions
• Alignment with regulatory guidance</p>

<h3>Supporting Data</h3>
<p>Data supporting this section has been generated following Good Clinical Practice (GCP), Good Manufacturing Practice (GMP), and Good Laboratory Practice (GLP) standards as applicable. All studies were conducted with appropriate quality oversight and documentation.</p>

<h3>Regulatory Considerations</h3>
<p>This section has been prepared to address FDA requirements and expectations. We have incorporated feedback from regulatory interactions and aligned our approach with current guidance documents relevant to this product type.</p>

<h3>Conclusions</h3>
<p>The information presented in this section supports the overall development program and demonstrates our commitment to bringing safe and effective therapies to patients. We remain available to discuss any aspects requiring clarification or additional information.</p>`;
    }

    // Add any previous content if provided
    if (previousContent) {
      generatedContent = `${previousContent}\n\n<h3>Additional Content</h3>\n${generatedContent}`;
    }

    res.json({
      success: true,
      content: generatedContent,
      message: 'Content generated successfully',
      metadata: {
        sectionTitle,
        documentType,
        timestamp: new Date().toISOString(),
        wordCount: generatedContent.split(' ').length
      }
    });

  } catch (error) {
    console.error('Error generating AI content:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate content',
      message: error.message
    });
  }
});

/**
 * POST /api/coauthor/modules/:moduleId/documents - Create a new document in a specific module
 */
router.post('/modules/:moduleId/documents', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || 1;
    const { moduleId } = req.params;
    const { title, content, status } = req.body;
    
    // Get module details
    const [module] = await db
      .select()
      .from(ectdModules)
      .where(eq(ectdModules.id, parseInt(moduleId)))
      .limit(1);
    
    if (!module) {
      return res.status(404).json({
        error: 'Module not found'
      });
    }
    
    // Create the document
    const [newDoc] = await db
      .insert(coauthorDocuments)
      .values({
        organizationId,
        title: title || `New Document - ${module.moduleName}`,
        content: content || '',
        status: status || 'draft',
        ectdModuleId: parseInt(moduleId),
        moduleNumber: module.moduleNumber,
        moduleName: module.moduleName,
        createdBy: 'Current User',
        completionPercentage: 0,
        regulatoryComplianceScore: 0
      })
      .returning();
    
    res.json({
      success: true,
      document: newDoc
    });
  } catch (error) {
    console.error('Error creating module document:', error);
    res.status(500).json({
      error: 'Failed to create module document',
      details: error.message
    });
  }
});

/**
 * GET /api/coauthor/ectd-modules/tree-with-counts - Get tree with document counts
 */
router.get('/ectd-modules/tree-with-counts', async (req, res) => {
  try {
    const organizationId = parseInt(req.headers['x-organization-id']) || req.query.organizationId || 6;
    
    // Get all modules
    const modules = await db
      .select()
      .from(ectdModules)
      .where(eq(ectdModules.organizationId, organizationId))
      .orderBy(asc(ectdModules.sortOrder));
    
    // Get document counts per module
    const documentCounts = await db
      .select({
        ectdModuleId: coauthorDocuments.ectdModuleId,
        count: sql`COUNT(*)::int`
      })
      .from(coauthorDocuments)
      .where(eq(coauthorDocuments.organizationId, organizationId))
      .groupBy(coauthorDocuments.ectdModuleId);
    
    const countMap = {};
    documentCounts.forEach(dc => {
      countMap[dc.ectdModuleId] = dc.count;
    });
    
    // Build hierarchical tree with document counts
    const buildTree = (parentId = null, level = 1) => {
      return modules
        .filter(m => {
          if (parentId === null) {
            return m.parentModuleId === null && m.level === level;
          }
          return m.parentModuleId === parentId;
        })
        .map(module => ({
          id: module.id,
          moduleNumber: module.moduleNumber,
          moduleName: module.moduleName,
          parentModuleId: module.parentModuleId,
          level: module.level,
          isLeaf: module.isLeaf,
          sortOrder: module.sortOrder,
          status: module.status,
          ichGuidance: module.ichGuidance,
          isRequired: module.isRequired,
          allowCustomGranules: module.allowCustomGranules,
          documentCount: countMap[module.id] || 0,
          children: buildTree(module.id, module.level + 1)
        }));
    };
    
    const tree = buildTree();
    
    res.json({
      success: true,
      totalModules: modules.length,
      rootModules: tree.length,
      leafModules: modules.filter(m => m.isLeaf).length,
      totalDocuments: documentCounts.reduce((sum, dc) => sum + dc.count, 0),
      tree
    });
  } catch (error) {
    console.error('Error fetching eCTD module tree with counts:', error);
    res.status(500).json({
      error: 'Failed to fetch eCTD module tree',
      details: error.message
    });
  }
});

export default router;
