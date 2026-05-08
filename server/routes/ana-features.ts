/**
 * AnA Features Routes
 *
 * Provides API endpoints for AnA (Analytical Navigator Assistant) features:
 * 1. Regulatory Intelligence Feed
 * 2. Submission Gap Analysis
 * 3. Document Change Impact Analysis
 * 4. AnA Memory (per-project contextual memory)
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { requireOrganizationContext } from '../middleware/tenantContext';
import { createRateLimiter } from '../middleware/rateLimiter';
import { db } from '../db';
import { eq, and, desc, or, inArray } from 'drizzle-orm';
import {
  gapAnalysisResults,
  projectMemoryEntries,
  notifications,
  auditTrail,
} from '../../shared/schema';

const router = Router();
const ANA_FEATURES_MOCK_ROUTES_ENABLED =
  process.env.ENABLE_ANA_FEATURES_MOCK_ROUTES === 'true' && process.env.NODE_ENV !== 'production';

function requireMockRoutesEnabled(res: Response): boolean {
  if (ANA_FEATURES_MOCK_ROUTES_ENABLED) return true;
  res.status(503).json({
    error: 'This endpoint is disabled in this environment',
    code: 'ANA_FEATURE_DISABLED',
  });
  return false;
}

// Rate limiter for analysis endpoints (10 req/min)
const analysisRateLimiter = createRateLimiter({
  api: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: 'Too many gap analysis requests, please slow down.',
  },
});

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

interface Memory {
  id: string;
  type: 'preference' | 'fact' | 'decision' | 'context';
  content: string;
  createdAt: string;
}

interface ProjectMemoryStore {
  memories: Memory[];
  projectContext: {
    therapeuticArea: string;
    submissionType: string;
    targetAgency: string;
    drugProduct: string;
  };
}

const memoryStore: Record<string, ProjectMemoryStore> = {};

let memoryIdCounter = 1000;

// ---------------------------------------------------------------------------
// Intelligence feed item type — shared between sources
// ---------------------------------------------------------------------------

interface IntelligenceFeedItem {
  id: string;
  type: 'guidance' | 'approval' | 'alert' | 'warning_letter' | 'activity';
  title: string;
  summary: string;
  agency: string;
  date: string;
  impactLevel: 'critical' | 'high' | 'medium' | 'low';
  therapeuticArea: string;
  url: string | null;
  tags: string[];
}

const INTELLIGENCE_MEMORY_CATEGORIES = [
  'intelligence_signal_summary',
  'rim_pattern_registry',
  'recommendation_feedback',
  'regulatory',
  'risk',
  'strategy',
  'compliance',
];

function mapImportanceToImpact(importance: string | null): IntelligenceFeedItem['impactLevel'] {
  switch (importance) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'medium';
  }
}

function mapNotificationPriorityToImpact(
  priority: string | null
): IntelligenceFeedItem['impactLevel'] {
  switch (priority) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'normal':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'medium';
  }
}

function mapMemoryCategoryToType(category: string): IntelligenceFeedItem['type'] {
  switch (category) {
    case 'intelligence_signal_summary':
      return 'alert';
    case 'rim_pattern_registry':
      return 'guidance';
    case 'recommendation_feedback':
      return 'alert';
    case 'regulatory':
      return 'guidance';
    case 'risk':
      return 'warning_letter';
    case 'compliance':
      return 'alert';
    default:
      return 'activity';
  }
}

function mapNotificationTypeToFeedType(type: string): IntelligenceFeedItem['type'] {
  switch (type) {
    case 'compliance_alert':
      return 'alert';
    case 'system_alert':
      return 'warning_letter';
    case 'approval_request':
      return 'approval';
    default:
      return 'activity';
  }
}

function formatDateString(date: Date | string | null): string {
  if (!date) return new Date().toISOString().split('T')[0];
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// 1. GET /api/ana/intelligence-feed — Real data from DB
// ---------------------------------------------------------------------------

router.get(
  '/intelligence-feed',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    try {
      const organizationId =
        (req as any).tenantContext?.organizationId || (req as any).organizationId;
      const userId = req.user?.id || req.user?.userId;

      const {
        therapeuticArea,
        agencies,
        limit = '20',
        offset = '0',
      } = req.query as Record<string, string | undefined>;

      const parsedOffset = Math.max(0, parseInt(offset || '0', 10));
      const parsedLimit = Math.min(50, Math.max(1, parseInt(limit || '20', 10)));

      const feedItems: IntelligenceFeedItem[] = [];

      // Source 1: projectMemoryEntries — intelligence signals and knowledge atoms
      try {
        const memoryEntries = await db
          .select()
          .from(projectMemoryEntries)
          .where(
            and(
              eq(projectMemoryEntries.organizationId, Number(organizationId)),
              eq(projectMemoryEntries.status, 'active'),
              inArray(projectMemoryEntries.category, INTELLIGENCE_MEMORY_CATEGORIES)
            )
          )
          .orderBy(desc(projectMemoryEntries.createdAt))
          .limit(50);

        for (const entry of memoryEntries) {
          feedItems.push({
            id: `mem-${entry.id}`,
            type: mapMemoryCategoryToType(entry.category),
            title: entry.title,
            summary:
              entry.content.length > 500 ? entry.content.slice(0, 497) + '...' : entry.content,
            agency: entry.subcategory || 'Internal',
            date: formatDateString(entry.createdAt),
            impactLevel: mapImportanceToImpact(entry.importanceLevel),
            therapeuticArea: entry.sourceDocumentType || 'General',
            url: null,
            tags: [entry.category, entry.subcategory, entry.sourceDocumentType].filter(
              Boolean
            ) as string[],
          });
        }
      } catch (memErr) {
        console.warn(
          'Intelligence feed: projectMemoryEntries query failed (table may not exist):',
          memErr instanceof Error ? memErr.message : memErr
        );
      }

      // Source 2: notifications — regulatory activity for the user's organization
      try {
        const recentNotifications = await db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.organizationId, Number(organizationId)),
              or(
                eq(notifications.type, 'compliance_alert'),
                eq(notifications.type, 'system_alert'),
                eq(notifications.type, 'approval_request')
              )
            )
          )
          .orderBy(desc(notifications.createdAt))
          .limit(30);

        for (const notif of recentNotifications) {
          feedItems.push({
            id: `notif-${notif.id}`,
            type: mapNotificationTypeToFeedType(notif.type),
            title: notif.title,
            summary: notif.message,
            agency: 'Internal',
            date: formatDateString(notif.createdAt),
            impactLevel: mapNotificationPriorityToImpact(notif.priority),
            therapeuticArea: 'General',
            url: notif.actionUrl || null,
            tags: [notif.type, notif.category].filter(Boolean) as string[],
          });
        }
      } catch (notifErr) {
        console.warn(
          'Intelligence feed: notifications query failed (table may not exist):',
          notifErr instanceof Error ? notifErr.message : notifErr
        );
      }

      // Source 3: audit_trail — recent regulatory audit events
      try {
        const auditEntries = await db
          .select()
          .from(auditTrail)
          .where(inArray(auditTrail.action, ['approved', 'rejected', 'signed', 'modified']))
          .orderBy(desc(auditTrail.timestamp))
          .limit(20);

        for (const entry of auditEntries) {
          feedItems.push({
            id: `audit-${entry.id}`,
            type: 'activity',
            title: `${entry.action.charAt(0).toUpperCase() + entry.action.slice(1)}: ${
              entry.entityType
            } #${entry.entityId}`,
            summary:
              entry.reason ||
              `${entry.entityType} ${entry.action} by ${entry.userName || entry.userId}`,
            agency: 'Internal',
            date: formatDateString(entry.timestamp),
            impactLevel: entry.action === 'rejected' ? 'high' : 'medium',
            therapeuticArea: 'General',
            url: null,
            tags: [entry.entityType, entry.action].filter(Boolean),
          });
        }
      } catch (auditErr) {
        console.warn(
          'Intelligence feed: audit_trail query failed (table may not exist):',
          auditErr instanceof Error ? auditErr.message : auditErr
        );
      }

      // Sort all items by date descending
      feedItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Apply client-side filters
      let filtered = feedItems;

      if (therapeuticArea) {
        filtered = filtered.filter(
          item => item.therapeuticArea.toLowerCase() === therapeuticArea.toLowerCase()
        );
      }

      if (agencies) {
        const agencyList = agencies.split(',').map(a => a.trim().toUpperCase());
        filtered = filtered.filter(item => agencyList.includes(item.agency.toUpperCase()));
      }

      const total = filtered.length;
      const paged = filtered.slice(parsedOffset, parsedOffset + parsedLimit);

      res.json({
        items: paged,
        pagination: {
          total,
          limit: parsedLimit,
          offset: parsedOffset,
          hasMore: parsedOffset + parsedLimit < total,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve intelligence feed',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// ---------------------------------------------------------------------------
// 2. POST /api/ana/gap-analysis — Submission requirements by type
// ---------------------------------------------------------------------------

interface GapItem {
  section: string;
  module: string;
  requirement: string;
  status: 'complete' | 'partial' | 'missing';
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimatedEffortDays: number;
  description: string;
}

const ectdRequirements: Record<string, GapItem[]> = {
  IND: [
    {
      section: '1.1',
      module: 'Module 1',
      requirement: 'FDA Form 1571',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 1,
      description:
        'Investigational New Drug Application cover form with sponsor information, IND number, and serial number.',
    },
    {
      section: '1.2',
      module: 'Module 1',
      requirement: 'FDA Form 1572',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 1,
      description: 'Statement of Investigator form for each participating clinical investigator.',
    },
    {
      section: '1.3',
      module: 'Module 1',
      requirement: 'Cover Letter',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 1,
      description:
        'Cover letter describing submission contents, cross-references, and any special requests.',
    },
    {
      section: '1.4',
      module: 'Module 1',
      requirement: 'Introductory Statement and General Investigational Plan',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 5,
      description:
        'Brief introductory statement, name and structure of drug, formulation, pharmacological class, and general investigational plan for the coming year.',
    },
    {
      section: '1.5',
      module: 'Module 1',
      requirement: "Investigator's Brochure",
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 15,
      description:
        'Comprehensive document summarizing clinical and non-clinical data relevant to the study of the investigational product in human subjects.',
    },
    {
      section: '1.6',
      module: 'Module 1',
      requirement: 'Clinical Protocol',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 20,
      description:
        'Detailed protocol for each planned study, including objectives, design, methodology, statistical considerations, and organization.',
    },
    {
      section: '1.7',
      module: 'Module 1',
      requirement: 'Informed Consent Documents',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 5,
      description:
        'Template informed consent forms meeting 21 CFR 50 requirements for each study site.',
    },
    {
      section: '2.4',
      module: 'Module 2',
      requirement: 'Nonclinical Overview',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 10,
      description:
        'Integrated overview of the nonclinical evaluation strategy, pharmacology, pharmacokinetics, and toxicology data.',
    },
    {
      section: '2.5',
      module: 'Module 2',
      requirement: 'Clinical Overview',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 10,
      description:
        'Critical assessment of clinical data, biopharmaceutics, clinical pharmacology, efficacy, and safety.',
    },
    {
      section: '2.6',
      module: 'Module 2',
      requirement: 'Nonclinical Written Summaries',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 8,
      description: 'Detailed written summaries of pharmacology, PK, and toxicology study results.',
    },
    {
      section: '2.7',
      module: 'Module 2',
      requirement: 'Clinical Summary',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 8,
      description:
        'Factual summary of clinical information including biopharmaceutics, clinical pharmacology, efficacy, and safety.',
    },
    {
      section: '3.2.S',
      module: 'Module 3',
      requirement: 'Drug Substance Information',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 20,
      description:
        'CMC information for drug substance: manufacture, characterization, controls, reference standards, container closure, and stability.',
    },
    {
      section: '3.2.P',
      module: 'Module 3',
      requirement: 'Drug Product Information',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 20,
      description:
        'CMC information for drug product: formulation, manufacture, controls, excipients, container closure, and stability.',
    },
    {
      section: '3.2.A',
      module: 'Module 3',
      requirement: 'Appendices (Facilities & Equipment)',
      status: 'missing',
      priority: 'medium',
      estimatedEffortDays: 5,
      description:
        'Facilities and equipment descriptions, adventitious agents safety evaluation for biological products.',
    },
    {
      section: '4.2',
      module: 'Module 4',
      requirement: 'Pharmacology Studies',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 3,
      description:
        'Primary and secondary pharmacodynamic studies, safety pharmacology, and pharmacodynamic drug interaction studies.',
    },
    {
      section: '4.3',
      module: 'Module 4',
      requirement: 'Pharmacokinetics Studies',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 3,
      description:
        'Analytical methods, absorption, distribution, metabolism, excretion, and PK drug interaction studies.',
    },
    {
      section: '4.4',
      module: 'Module 4',
      requirement: 'Toxicology Studies',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 5,
      description:
        'Single-dose, repeat-dose, genotoxicity, carcinogenicity, reproductive toxicity, and local tolerance study reports.',
    },
    {
      section: '5.3',
      module: 'Module 5',
      requirement: 'Clinical Study Reports',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 3,
      description:
        'Reports of any previous human experience, bioavailability/bioequivalence, PK, PD, efficacy, and safety studies.',
    },
  ],
  NDA: [
    {
      section: '1.2',
      module: 'Module 1',
      requirement: 'FDA Form 356h',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 2,
      description: 'Application to Market a New Drug for Human Use cover form.',
    },
    {
      section: '1.3',
      module: 'Module 1',
      requirement: 'Cover Letter',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 1,
      description:
        'Cover letter with submission description, priority review request justification if applicable.',
    },
    {
      section: '1.4',
      module: 'Module 1',
      requirement: 'Field Copy Certification',
      status: 'missing',
      priority: 'medium',
      estimatedEffortDays: 1,
      description:
        'Certification that a field copy has been provided to the appropriate FDA district office.',
    },
    {
      section: '1.5',
      module: 'Module 1',
      requirement: 'Patent Information (FDA Form 3542a)',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 3,
      description:
        'Patent information for listed drug patents, patent certifications, and exclusivity claims.',
    },
    {
      section: '1.6',
      module: 'Module 1',
      requirement: 'Exclusivity Request',
      status: 'missing',
      priority: 'medium',
      estimatedEffortDays: 2,
      description: 'Request for marketing exclusivity period with supporting justification.',
    },
    {
      section: '1.7',
      module: 'Module 1',
      requirement: 'Debarment Certification',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 1,
      description:
        'Certification that no debarred persons were involved in the application per 21 USC 335a.',
    },
    {
      section: '1.8',
      module: 'Module 1',
      requirement: 'Financial Disclosure',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 5,
      description:
        'Financial certification/disclosure forms (FDA Form 3454/3455) for all clinical investigators.',
    },
    {
      section: '1.9',
      module: 'Module 1',
      requirement: 'Proposed Labeling',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 15,
      description:
        'Draft prescribing information, patient labeling, and carton/container labels per PLR format.',
    },
    {
      section: '1.10',
      module: 'Module 1',
      requirement: 'REMS (if required)',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 20,
      description:
        'Risk Evaluation and Mitigation Strategy proposal with medication guide, communication plan, or ETASU.',
    },
    {
      section: '1.11',
      module: 'Module 1',
      requirement: 'Pediatric Study Plans',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 10,
      description: 'Initial Pediatric Study Plan or agreed-upon PSP, or waiver/deferral request.',
    },
    {
      section: '2.2',
      module: 'Module 2',
      requirement: 'Quality Overall Summary',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 15,
      description:
        'Summary of CMC information covering drug substance, drug product, appendices, and regional information.',
    },
    {
      section: '2.3',
      module: 'Module 2',
      requirement: 'Quality Overall Summary — Introduction',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 3,
      description:
        'Introduction to the quality overall summary with drug product description and formulation rationale.',
    },
    {
      section: '2.4',
      module: 'Module 2',
      requirement: 'Nonclinical Overview',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 15,
      description:
        'Integrated overview and assessment of all nonclinical pharmacology, PK, and toxicology data.',
    },
    {
      section: '2.5',
      module: 'Module 2',
      requirement: 'Clinical Overview',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 25,
      description:
        'Critical analysis of clinical data including benefit-risk assessment, biopharmaceutics, efficacy, and safety.',
    },
    {
      section: '2.6',
      module: 'Module 2',
      requirement: 'Nonclinical Written and Tabulated Summaries',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 15,
      description:
        'Detailed summaries with tabulated data for pharmacology, PK, and toxicology studies.',
    },
    {
      section: '2.7',
      module: 'Module 2',
      requirement: 'Clinical Summary',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 20,
      description:
        'Detailed factual clinical summary covering biopharmaceutics, clinical pharmacology, efficacy, and safety.',
    },
    {
      section: '3.2.S',
      module: 'Module 3',
      requirement: 'Drug Substance — Complete CMC',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 30,
      description:
        'Full drug substance CMC: general properties, manufacture, characterization, control, reference standards, container closure, stability.',
    },
    {
      section: '3.2.P',
      module: 'Module 3',
      requirement: 'Drug Product — Complete CMC',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 30,
      description:
        'Full drug product CMC: description, composition, development, manufacture, control, reference standards, container closure, stability.',
    },
    {
      section: '3.2.R',
      module: 'Module 3',
      requirement: 'Regional Information',
      status: 'missing',
      priority: 'medium',
      estimatedEffortDays: 5,
      description: 'Region-specific CMC information required for the US market.',
    },
    {
      section: '4.2',
      module: 'Module 4',
      requirement: 'Complete Nonclinical Study Reports',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 10,
      description:
        'Full study reports for all pharmacology, PK, and toxicology studies with GLP compliance.',
    },
    {
      section: '5.2',
      module: 'Module 5',
      requirement: 'Tabular Listing of Clinical Studies',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 5,
      description:
        'Comprehensive tabular listing of all clinical studies in the development program.',
    },
    {
      section: '5.3',
      module: 'Module 5',
      requirement: 'Complete Clinical Study Reports',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 20,
      description:
        'Full ICH E3 compliant CSRs for all biopharmaceutic, PK, PD, efficacy, and safety studies.',
    },
    {
      section: '5.4',
      module: 'Module 5',
      requirement: 'Literature References',
      status: 'missing',
      priority: 'low',
      estimatedEffortDays: 5,
      description: 'Published literature references supporting clinical data and analyses.',
    },
  ],
  '510K': [
    {
      section: '1',
      module: 'Administrative',
      requirement: 'CDRH Premarket Review Submission Cover Sheet (FDA Form 3514)',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 1,
      description:
        'Cover sheet identifying device, applicant, submission type, and contact information.',
    },
    {
      section: '2',
      module: 'Administrative',
      requirement: 'Cover Letter',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 1,
      description:
        'Letter identifying submission contents, product code, device name, and 510(k) type.',
    },
    {
      section: '3',
      module: 'Administrative',
      requirement: 'Indications for Use Statement (FDA Form 3881)',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 2,
      description:
        'Precise statement of indications for use, prescription/OTC status, and patient population.',
    },
    {
      section: '4',
      module: 'Administrative',
      requirement: 'Truthful and Accuracy Statement',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 1,
      description:
        'Signed statement certifying all information is truthful and accurate per 21 CFR 807.87(k).',
    },
    {
      section: '5',
      module: 'Administrative',
      requirement: 'Class III Summary/Certification',
      status: 'missing',
      priority: 'medium',
      estimatedEffortDays: 1,
      description: '510(k) Summary per 21 CFR 807.92 or 510(k) Statement per 21 CFR 807.93.',
    },
    {
      section: '6',
      module: 'Device Description',
      requirement: 'Device Description',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 5,
      description:
        'Comprehensive description of device including materials, design, principles of operation, and specifications.',
    },
    {
      section: '7',
      module: 'Predicate Comparison',
      requirement: 'Substantial Equivalence Comparison',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 10,
      description:
        'Detailed comparison table with predicate device(s) covering intended use, technological characteristics, and performance.',
    },
    {
      section: '8',
      module: 'Standards',
      requirement: 'Voluntary Standards and Declarations of Conformity',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 5,
      description:
        'List of recognized consensus standards met, with declarations of conformity or test reports.',
    },
    {
      section: '9',
      module: 'Performance Testing',
      requirement: 'Performance Testing — Bench',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 15,
      description:
        'Bench testing data demonstrating device performance characteristics, including test protocols and results.',
    },
    {
      section: '10',
      module: 'Performance Testing',
      requirement: 'Performance Testing — Animal (if applicable)',
      status: 'missing',
      priority: 'medium',
      estimatedEffortDays: 10,
      description:
        'Preclinical animal testing data if required to demonstrate safety and effectiveness.',
    },
    {
      section: '11',
      module: 'Performance Testing',
      requirement: 'Performance Testing — Clinical (if applicable)',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 20,
      description:
        'Clinical performance data from US clinical studies, if required for substantial equivalence.',
    },
    {
      section: '12',
      module: 'Biocompatibility',
      requirement: 'Biocompatibility Evaluation',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 10,
      description:
        'Biocompatibility assessment per ISO 10993-1, including test reports or rationale for testing exemptions.',
    },
    {
      section: '13',
      module: 'Sterilization',
      requirement: 'Sterilization and Shelf Life',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 8,
      description:
        'Sterilization validation, sterility assurance level, packaging integrity, and accelerated aging/real-time shelf life data.',
    },
    {
      section: '14',
      module: 'Software',
      requirement: 'Software Documentation (if applicable)',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 15,
      description:
        'Software level of concern, description, hazard analysis, V&V, revision history, cybersecurity documentation.',
    },
    {
      section: '15',
      module: 'EMC/Electrical',
      requirement: 'Electromagnetic Compatibility & Electrical Safety',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 5,
      description:
        'EMC testing per IEC 60601-1-2, electrical safety per IEC 60601-1, if applicable to powered devices.',
    },
    {
      section: '16',
      module: 'Labeling',
      requirement: 'Proposed Labeling',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 5,
      description:
        'Complete device labeling including package label, IFU, and any patient-facing materials.',
    },
  ],
  BLA: [
    {
      section: '1.1',
      module: 'Module 1',
      requirement: 'FDA Form 356h',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 2,
      description: 'Application to Market a New Biologic for Human Use.',
    },
    {
      section: '1.2',
      module: 'Module 1',
      requirement: 'Cover Letter',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 1,
      description:
        'Cover letter with application summary, priority review request, and rolling submission information.',
    },
    {
      section: '1.3',
      module: 'Module 1',
      requirement: 'Proposed Labeling',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 15,
      description:
        'Draft USPI, patient information/medication guide, and container labels per PLR format.',
    },
    {
      section: '1.4',
      module: 'Module 1',
      requirement: 'Environmental Assessment or Categorical Exclusion',
      status: 'missing',
      priority: 'medium',
      estimatedEffortDays: 3,
      description: 'Environmental assessment per 21 CFR 25 or claim of categorical exclusion.',
    },
    {
      section: '1.5',
      module: 'Module 1',
      requirement: 'Debarment/Financial Disclosure',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 5,
      description:
        'Debarment certification and financial disclosure forms for all clinical investigators.',
    },
    {
      section: '1.6',
      module: 'Module 1',
      requirement: 'Pediatric Study Plans',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 10,
      description: 'Agreed-upon Pediatric Study Plan or request for waiver/deferral per BPCA/PREA.',
    },
    {
      section: '2.2',
      module: 'Module 2',
      requirement: 'Quality Overall Summary',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 20,
      description:
        'Comprehensive summary of drug substance and drug product quality data for biological product.',
    },
    {
      section: '2.4',
      module: 'Module 2',
      requirement: 'Nonclinical Overview',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 15,
      description:
        'Integrated assessment of pharmacology, PK, and toxicology including species selection justification.',
    },
    {
      section: '2.5',
      module: 'Module 2',
      requirement: 'Clinical Overview',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 25,
      description:
        'Critical analysis of clinical development program, benefit-risk, immunogenicity, and comparative analyses.',
    },
    {
      section: '2.7',
      module: 'Module 2',
      requirement: 'Clinical Summary',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 20,
      description:
        'Detailed clinical summary with integrated safety and efficacy analyses, immunogenicity data.',
    },
    {
      section: '3.2.S',
      module: 'Module 3',
      requirement: 'Drug Substance (Biologic)',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 40,
      description:
        'Complete characterization: cell bank system, fermentation/purification, analytical methods, specifications, stability, viral safety.',
    },
    {
      section: '3.2.P',
      module: 'Module 3',
      requirement: 'Drug Product (Biologic)',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 30,
      description:
        'Formulation, manufacturing process validation, container closure, fill-finish, stability, and comparability data.',
    },
    {
      section: '3.2.A',
      module: 'Module 3',
      requirement: 'Adventitious Agents Safety',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 15,
      description:
        'Comprehensive viral safety evaluation: cell substrate, raw materials, manufacturing process viral clearance studies.',
    },
    {
      section: '4.2',
      module: 'Module 4',
      requirement: 'Nonclinical Study Reports',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 15,
      description:
        'Complete nonclinical study reports including tissue cross-reactivity, reproductive toxicology, and immunotoxicology.',
    },
    {
      section: '5.3',
      module: 'Module 5',
      requirement: 'Clinical Study Reports',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 25,
      description:
        'Full CSRs for all clinical studies, integrated summaries of safety and efficacy, immunogenicity analyses.',
    },
  ],
  MAA: [
    {
      section: '1.0',
      module: 'Module 1 (EU)',
      requirement: 'Application Form',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 3,
      description:
        'EMA e-Application Form with product information, legal basis, and procedural information.',
    },
    {
      section: '1.1',
      module: 'Module 1 (EU)',
      requirement: 'Cover Letter',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 1,
      description:
        'Cover letter with summary of application, regulatory procedure, and legal basis (Article 8(3), 10, etc.).',
    },
    {
      section: '1.2',
      module: 'Module 1 (EU)',
      requirement: 'SmPC, Labeling, and Package Leaflet',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 20,
      description:
        'Draft Summary of Product Characteristics, labeling text, and PIL in QRD template format.',
    },
    {
      section: '1.3',
      module: 'Module 1 (EU)',
      requirement: 'Expert Statements and CVs',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 5,
      description:
        'Signed quality, nonclinical, and clinical expert statements with CVs per Directive 2001/83/EC.',
    },
    {
      section: '1.4',
      module: 'Module 1 (EU)',
      requirement: 'Environmental Risk Assessment',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 10,
      description: 'Environmental risk assessment per CHMP/SWP/4447/00 guideline — Phase I/II ERA.',
    },
    {
      section: '1.5',
      module: 'Module 1 (EU)',
      requirement: 'Risk Management Plan',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 25,
      description:
        'EU Risk Management Plan per GVP Module V: safety specification, pharmacovigilance plan, risk minimisation measures.',
    },
    {
      section: '1.6',
      module: 'Module 1 (EU)',
      requirement: 'Pharmacovigilance System Master File',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 10,
      description:
        'PSMF summary and reference with QPPV details per Directive 2001/83/EC Article 8(3)(ia).',
    },
    {
      section: '2.2',
      module: 'Module 2',
      requirement: 'Quality Overall Summary',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 15,
      description: 'ICH M4Q-compliant Quality Overall Summary.',
    },
    {
      section: '2.4',
      module: 'Module 2',
      requirement: 'Nonclinical Overview',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 15,
      description: 'Integrated nonclinical overview per ICH M4S.',
    },
    {
      section: '2.5',
      module: 'Module 2',
      requirement: 'Clinical Overview',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 25,
      description: 'Critical analysis per ICH M4E with benefit-risk conclusion.',
    },
    {
      section: '2.7',
      module: 'Module 2',
      requirement: 'Clinical Summary',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 20,
      description: 'ICH E3-based clinical summary with integrated safety/efficacy.',
    },
    {
      section: '3.2.S',
      module: 'Module 3',
      requirement: 'Drug Substance CMC',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 30,
      description: 'Complete drug substance quality documentation per ICH M4Q.',
    },
    {
      section: '3.2.P',
      module: 'Module 3',
      requirement: 'Drug Product CMC',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 30,
      description: 'Complete drug product quality documentation per ICH M4Q.',
    },
    {
      section: '4',
      module: 'Module 4',
      requirement: 'Nonclinical Study Reports',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 10,
      description: 'Full nonclinical study reports per ICH M4S organization.',
    },
    {
      section: '5',
      module: 'Module 5',
      requirement: 'Clinical Study Reports',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 20,
      description: 'Complete clinical study reports per ICH M4E/E3 organization.',
    },
  ],
  PMA: [
    {
      section: '1',
      module: 'Administrative',
      requirement: 'PMA Application Form (FDA Form 3601)',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 2,
      description:
        'Premarket Approval Application form with device identification and applicant information.',
    },
    {
      section: '2',
      module: 'Administrative',
      requirement: 'Cover Letter',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 1,
      description: 'Cover letter summarizing application contents and any special considerations.',
    },
    {
      section: '3',
      module: 'Administrative',
      requirement: 'Table of Contents',
      status: 'missing',
      priority: 'medium',
      estimatedEffortDays: 1,
      description: 'Detailed table of contents with volume and page references.',
    },
    {
      section: '4',
      module: 'Summary',
      requirement: 'Summary of Safety and Effectiveness Data (SSED)',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 20,
      description:
        'Comprehensive summary of safety and effectiveness evidence supporting device approval.',
    },
    {
      section: '5',
      module: 'Device Description',
      requirement: 'Complete Device Description',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 10,
      description:
        'Detailed device description including design, materials, components, principles of operation, and accessories.',
    },
    {
      section: '6',
      module: 'Device Description',
      requirement: 'Manufacturing Information',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 15,
      description:
        'Manufacturing process, quality system procedures, sterilization methods, and facility information.',
    },
    {
      section: '7',
      module: 'Reference Standards',
      requirement: 'Performance Standards',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 5,
      description:
        'Applicable performance standards, consensus standards, and declarations of conformity.',
    },
    {
      section: '8',
      module: 'Non-Clinical Testing',
      requirement: 'Bench Performance Testing',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 20,
      description:
        'Complete bench testing data including protocols, results, and statistical analyses.',
    },
    {
      section: '9',
      module: 'Non-Clinical Testing',
      requirement: 'Biocompatibility',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 15,
      description:
        'Comprehensive biocompatibility evaluation per ISO 10993-1 with full test reports.',
    },
    {
      section: '10',
      module: 'Non-Clinical Testing',
      requirement: 'Animal Studies',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 15,
      description: 'Preclinical animal study reports demonstrating device safety and performance.',
    },
    {
      section: '11',
      module: 'Clinical',
      requirement: 'Clinical Study Reports',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 30,
      description:
        'Complete clinical investigation reports per IDE requirements with statistical analyses.',
    },
    {
      section: '12',
      module: 'Labeling',
      requirement: 'Proposed Labeling',
      status: 'missing',
      priority: 'critical',
      estimatedEffortDays: 8,
      description:
        'Complete device labeling: package insert, IFU, patient information, and all labels.',
    },
    {
      section: '13',
      module: 'Software',
      requirement: 'Software Documentation',
      status: 'missing',
      priority: 'high',
      estimatedEffortDays: 20,
      description:
        'Software level of concern, requirements, architecture, V&V, hazard analysis, cybersecurity.',
    },
    {
      section: '14',
      module: 'Post-Market',
      requirement: 'Post-Approval Study Protocol (if required)',
      status: 'missing',
      priority: 'medium',
      estimatedEffortDays: 10,
      description:
        'Post-approval study protocol for long-term safety and effectiveness monitoring.',
    },
  ],
};

// Zod schema for gap-analysis request validation
const gapAnalysisRequestSchema = z.object({
  submissionType: z
    .string()
    .min(1, 'submissionType is required')
    .transform(val => val.toUpperCase().replace('-', ''))
    .refine(
      val => Object.keys(ectdRequirements).includes(val),
      val => ({
        message: `Unsupported submission type: ${val}. Supported types: ${Object.keys(
          ectdRequirements
        ).join(', ')}`,
      })
    ),
  uploadedDocuments: z.array(z.string()).default([]),
  projectId: z.string().optional(),
});

router.post(
  '/gap-analysis',
  authenticateToken,
  requireOrganizationContext,
  analysisRateLimiter,
  async (req: Request, res: Response) => {
    try {
      const parsed = gapAnalysisRequestSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: parsed.error.errors[0]?.message || 'Invalid request data',
          details: parsed.error.errors,
        });
      }

      const { submissionType: normalizedType, uploadedDocuments, projectId } = parsed.data;
      const organizationId =
        (req as any).tenantContext?.organizationId ?? (req as any).organizationId;
      if (!organizationId) {
        return res.status(401).json({
          success: false,
          error: 'Organization context required',
        });
      }
      const userId = req.user?.id || req.user?.userId;

      const requirements = ectdRequirements[normalizedType];

      // Clone requirements and mark status based on uploaded documents
      const gaps: GapItem[] = requirements.map(r => {
        const uploaded = uploadedDocuments.map(d => d.toLowerCase());
        const reqLower = r.requirement.toLowerCase();
        const sectionLower = r.section.toLowerCase();

        // Check if any uploaded document matches the requirement
        const exactMatch = uploaded.some(
          doc => reqLower.includes(doc) || doc.includes(reqLower) || doc.includes(sectionLower)
        );

        const partialMatch = uploaded.some(doc => {
          const keywords = reqLower.split(/\s+/).filter(w => w.length > 4);
          return keywords.some(kw => doc.includes(kw));
        });

        let status: 'complete' | 'partial' | 'missing' = 'missing';
        if (exactMatch) status = 'complete';
        else if (partialMatch) status = 'partial';

        return { ...r, status };
      });

      const completed = gaps.filter(g => g.status === 'complete').length;
      const partial = gaps.filter(g => g.status === 'partial').length;
      const totalRequired = gaps.length;

      // Readiness score: complete = 100%, partial = 50%, missing = 0%
      const overallReadiness = Math.round((completed * 100 + partial * 50) / totalRequired);

      // Generate recommendations based on gaps
      const recommendations: string[] = [];

      const criticalMissing = gaps.filter(g => g.status === 'missing' && g.priority === 'critical');
      if (criticalMissing.length > 0) {
        recommendations.push(
          `${criticalMissing.length} critical documents are missing. Prioritize: ${criticalMissing
            .slice(0, 3)
            .map(g => g.requirement)
            .join(', ')}.`
        );
      }

      const highEffort = gaps
        .filter(g => g.status !== 'complete')
        .sort((a, b) => b.estimatedEffortDays - a.estimatedEffortDays);
      if (highEffort.length > 0) {
        recommendations.push(
          `Longest lead-time items: ${highEffort
            .slice(0, 3)
            .map(g => `${g.requirement} (~${g.estimatedEffortDays} days)`)
            .join(', ')}. Begin these immediately.`
        );
      }

      if (partial > 0) {
        recommendations.push(
          `${partial} documents are partially complete. Review and finalize these for quick readiness gains.`
        );
      }

      const totalEffort = gaps
        .filter(g => g.status !== 'complete')
        .reduce(
          (sum, g) =>
            sum +
            (g.status === 'partial'
              ? Math.ceil(g.estimatedEffortDays * 0.5)
              : g.estimatedEffortDays),
          0
        );
      recommendations.push(
        `Estimated total remaining effort: ~${totalEffort} person-days. Consider parallel workstreams for Module 3 (CMC) and Module 5 (Clinical).`
      );

      if (normalizedType === 'NDA' || normalizedType === 'BLA') {
        recommendations.push(
          'Schedule a Pre-NDA/Pre-BLA meeting (Type B) with FDA at least 3 months before planned submission to align on content expectations.'
        );
      }

      if (normalizedType === 'MAA') {
        recommendations.push(
          'Engage a Rapporteur pre-submission meeting with the target CHMP Rapporteur Member State to discuss the application dossier and any scientific concerns.'
        );
      }

      const result = {
        success: true,
        overallReadiness,
        totalRequired,
        completed,
        gaps,
        recommendations,
      };

      // Persist result to database (non-blocking — don't fail the request if DB save fails)
      try {
        if (db) {
          await db.insert(gapAnalysisResults).values({
            organizationId: String(organizationId),
            userId: String(userId || 'unknown'),
            submissionType: normalizedType,
            projectId: projectId || null,
            overallReadiness,
            totalRequired,
            completedCount: completed,
            gapsSnapshot: gaps,
            recommendations,
            uploadedDocuments,
          });
        }
      } catch (dbError) {
        // Log but don't fail the response — persistence is best-effort until migration runs
        console.warn(
          'Gap analysis DB persistence failed (table may not exist yet):',
          dbError instanceof Error ? dbError.message : dbError
        );
      }

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: error.errors,
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to perform gap analysis',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// ---------------------------------------------------------------------------
// 3. POST /api/ana/change-impact — Document Change Impact Analysis
// ---------------------------------------------------------------------------

interface GuidanceChange {
  guidanceTitle: string;
  changeDate: string;
  submissionTypes: string[];
  affectedSections: Array<{
    section: string;
    module: string;
    currentStatus: string;
    impactLevel: 'critical' | 'high' | 'medium' | 'low';
    requiredAction: string;
    estimatedReworkDays: number;
  }>;
  riskLevel: string;
  recommendations: string[];
}

const guidanceChanges: Record<string, GuidanceChange> = {
  'FDA-2026-D-0142': {
    guidanceTitle: 'Diversity Action Plans for Clinical Trials of Drugs and Biological Products',
    changeDate: '2026-02-28',
    submissionTypes: ['IND', 'NDA', 'BLA'],
    affectedSections: [
      {
        section: '1.6',
        module: 'Module 1',
        currentStatus: 'Previously not required',
        impactLevel: 'critical',
        requiredAction:
          'Develop and include Race and Ethnicity Diversity Plan per new guidance. Include enrollment targets, outreach strategies, and monitoring metrics.',
        estimatedReworkDays: 15,
      },
      {
        section: '5.3',
        module: 'Module 5',
        currentStatus: 'Protocol amendments may be needed',
        impactLevel: 'high',
        requiredAction:
          'Review and amend clinical protocols to include diversity enrollment targets, site selection criteria ensuring demographic representation, and community engagement plans.',
        estimatedReworkDays: 10,
      },
      {
        section: '2.5',
        module: 'Module 2',
        currentStatus: 'Clinical overview may need updating',
        impactLevel: 'medium',
        requiredAction:
          'Update clinical overview to address population representativeness and subgroup analysis plans by race, ethnicity, age, and sex.',
        estimatedReworkDays: 5,
      },
      {
        section: '1.7',
        module: 'Module 1',
        currentStatus: 'Informed consent needs revision',
        impactLevel: 'medium',
        requiredAction:
          'Ensure informed consent documents are culturally appropriate, available in relevant languages, and at appropriate literacy levels.',
        estimatedReworkDays: 3,
      },
    ],
    riskLevel: 'high',
    recommendations: [
      'Submit Diversity Action Plan as part of the IND or as a standalone submission at least 120 days before the start of Phase III.',
      'Engage community advisory boards in the target therapeutic area to inform enrollment strategies.',
      'Implement site feasibility assessments that include demographic analysis of catchment areas.',
      'Consider decentralized trial elements (telemedicine, mobile units) to improve access for underrepresented populations.',
    ],
  },
  'FDA-2026-D-0089': {
    guidanceTitle:
      'Artificial Intelligence/Machine Learning-Based Software as a Medical Device: Predetermined Change Control Plan',
    changeDate: '2026-03-10',
    submissionTypes: ['510K', 'PMA'],
    affectedSections: [
      {
        section: '14',
        module: 'Software',
        currentStatus: 'Existing SaMD documentation',
        impactLevel: 'critical',
        requiredAction:
          'Develop Predetermined Change Control Plan (PCCP) specifying: (1) SaMD Pre-Specifications describing planned modifications, (2) Algorithm Change Protocol with validation methodology, (3) transparency and reporting commitments.',
        estimatedReworkDays: 25,
      },
      {
        section: '6',
        module: 'Device Description',
        currentStatus: 'May need expansion',
        impactLevel: 'high',
        requiredAction:
          'Expand device description to include AI/ML architecture, training data characteristics, intended population, and performance boundaries.',
        estimatedReworkDays: 8,
      },
      {
        section: '9',
        module: 'Performance Testing',
        currentStatus: 'Testing protocols need revision',
        impactLevel: 'critical',
        requiredAction:
          'Include real-world performance monitoring plan, algorithmic bias testing across demographic subgroups, and continuous learning validation protocol.',
        estimatedReworkDays: 20,
      },
      {
        section: '16',
        module: 'Labeling',
        currentStatus: 'Labeling expansion needed',
        impactLevel: 'high',
        requiredAction:
          'Update labeling to include AI/ML transparency information: training data description, known limitations, performance by subgroup, and update mechanism disclosure.',
        estimatedReworkDays: 5,
      },
      {
        section: '8',
        module: 'Standards',
        currentStatus: 'New standards applicable',
        impactLevel: 'medium',
        requiredAction:
          'Address AAMI CR34971 (AI/ML-based medical devices application of risk management) and ISO/IEC 23894 (AI risk management).',
        estimatedReworkDays: 5,
      },
    ],
    riskLevel: 'critical',
    recommendations: [
      'Engage FDA Pre-Submission program (Q-Sub) to discuss PCCP scope and validation methodology before formal submission.',
      'Establish a Clinical Governance Committee for ongoing algorithm oversight and change management.',
      'Implement Good Machine Learning Practice (GMLP) principles throughout the software development lifecycle.',
      'Develop a real-world monitoring dashboard tracking performance metrics, demographic equity, and drift detection.',
      'Plan for Total Product Lifecycle (TPLC) approach with periodic reporting to FDA on algorithm changes and performance.',
    ],
  },
  'FDA-2025-D-4521': {
    guidanceTitle: 'Decentralized Clinical Trials — Design, Conduct, and Oversight',
    changeDate: '2025-11-15',
    submissionTypes: ['IND', 'NDA', 'BLA'],
    affectedSections: [
      {
        section: '1.6',
        module: 'Module 1',
        currentStatus: 'Protocol design changes needed',
        impactLevel: 'high',
        requiredAction:
          'Update clinical protocols to incorporate DCT elements: remote consent procedures, telemedicine visit schedules, direct-to-patient drug shipment logistics, and home health professional visit protocols.',
        estimatedReworkDays: 12,
      },
      {
        section: '1.7',
        module: 'Module 1',
        currentStatus: 'Consent process revisions',
        impactLevel: 'high',
        requiredAction:
          'Develop eConsent procedures compliant with 21 CFR Part 11, including identity verification, audit trail requirements, and re-consent procedures for protocol amendments.',
        estimatedReworkDays: 8,
      },
      {
        section: '5.3',
        module: 'Module 5',
        currentStatus: 'Data collection changes',
        impactLevel: 'critical',
        requiredAction:
          'Implement validated digital endpoint collection (wearables, eCOA/ePRO), ensure data provenance and audit trail for remotely collected data, address missing data strategies for DCT-specific scenarios.',
        estimatedReworkDays: 15,
      },
      {
        section: '2.5',
        module: 'Module 2',
        currentStatus: 'Clinical overview revisions',
        impactLevel: 'medium',
        requiredAction:
          'Address DCT methodology in clinical overview, including comparability of remote vs. site-based assessments, and sensitivity analyses.',
        estimatedReworkDays: 5,
      },
    ],
    riskLevel: 'high',
    recommendations: [
      'Conduct a feasibility assessment for DCT elements, considering investigator capabilities, patient technology access, and regulatory acceptance by country.',
      'Implement qualified third-party technology vendor oversight per guidance recommendations.',
      'Develop a hybrid trial design where critical safety assessments remain site-based while routine visits transition to remote.',
      'Ensure HIPAA and GDPR compliance for all remote data collection and telemedicine platforms.',
    ],
  },
  'ICH-E6R3-2026': {
    guidanceTitle: 'ICH E6(R3) Good Clinical Practice — Principles and Annex 1/Annex 2',
    changeDate: '2026-02-15',
    submissionTypes: ['IND', 'NDA', 'BLA', 'MAA'],
    affectedSections: [
      {
        section: '1.6',
        module: 'Module 1',
        currentStatus: 'Protocol QMS integration needed',
        impactLevel: 'critical',
        requiredAction:
          'Integrate risk-based quality management system (RBQM) into all clinical protocols. Define Critical to Quality (CtQ) factors, risk indicators, and risk thresholds for each study.',
        estimatedReworkDays: 20,
      },
      {
        section: '1.5',
        module: 'Module 1',
        currentStatus: 'IB updates needed',
        impactLevel: 'high',
        requiredAction:
          'Update Investigator Brochure format and content per E6(R3) requirements, including risk communication and benefit-risk characterization.',
        estimatedReworkDays: 8,
      },
      {
        section: '1.7',
        module: 'Module 1',
        currentStatus: 'Consent modernization',
        impactLevel: 'high',
        requiredAction:
          'Modernize informed consent to support technology-enabled approaches, ongoing consent, and layered/tiered information disclosure per E6(R3) Annex 2.',
        estimatedReworkDays: 6,
      },
      {
        section: '5.3',
        module: 'Module 5',
        currentStatus: 'CSR amendments needed',
        impactLevel: 'high',
        requiredAction:
          'Ensure CSRs document RBQM implementation, including quality tolerance limits, centralized monitoring findings, and risk management decisions.',
        estimatedReworkDays: 10,
      },
      {
        section: '2.5',
        module: 'Module 2',
        currentStatus: 'Methodology narrative updates',
        impactLevel: 'medium',
        requiredAction:
          'Update clinical overview to describe RBQM approach, risk-proportionate monitoring strategy, and impact on data quality.',
        estimatedReworkDays: 4,
      },
    ],
    riskLevel: 'high',
    recommendations: [
      'Begin training all clinical operations staff on E6(R3) principles within 6 months of Step 4 adoption.',
      'Implement centralized statistical monitoring tools for key risk indicators across all active studies.',
      'Audit existing SOPs and update to align with E6(R3) risk-based approach within the 2-year implementation window.',
      'Establish CtQ factor identification as a standard step in all new protocol development.',
      'Consider engaging a qualified external auditor to perform a gap assessment of current GCP compliance vs. E6(R3) requirements.',
    ],
  },
  'EMA-2026-GLP1-REFERRAL': {
    guidanceTitle:
      'Article 31 Referral: GLP-1 Receptor Agonist Class — Medullary Thyroid Carcinoma Signal',
    changeDate: '2026-02-05',
    submissionTypes: ['NDA', 'BLA', 'MAA'],
    affectedSections: [
      {
        section: '2.5',
        module: 'Module 2',
        currentStatus: 'Safety narrative requires update',
        impactLevel: 'critical',
        requiredAction:
          'Update clinical overview with cumulative thyroid safety analysis, including MTC incidence rates, calcitonin monitoring data, and comparative risk assessment vs. background rates.',
        estimatedReworkDays: 15,
      },
      {
        section: '2.7',
        module: 'Module 2',
        currentStatus: 'Safety summary update',
        impactLevel: 'critical',
        requiredAction:
          'Revise clinical summary to include comprehensive thyroid malignancy analysis across all clinical studies, post-marketing data, and epidemiological studies.',
        estimatedReworkDays: 12,
      },
      {
        section: '1.9',
        module: 'Module 1',
        currentStatus: 'Labeling revision needed',
        impactLevel: 'high',
        requiredAction:
          'Strengthen boxed warning/contraindication for MTC risk, update calcitonin monitoring recommendations, and revise patient counseling information.',
        estimatedReworkDays: 8,
      },
      {
        section: '5.3',
        module: 'Module 5',
        currentStatus: 'Additional analyses required',
        impactLevel: 'high',
        requiredAction:
          'Prepare integrated safety analysis focused on thyroid neoplasms, with time-to-event analysis, dose-response evaluation, and mechanistic assessment.',
        estimatedReworkDays: 20,
      },
      {
        section: '1.10',
        module: 'Module 1',
        currentStatus: 'REMS modification may be needed',
        impactLevel: 'medium',
        requiredAction:
          'Evaluate whether REMS modification is required to include thyroid monitoring components or healthcare provider communication plan.',
        estimatedReworkDays: 10,
      },
    ],
    riskLevel: 'critical',
    recommendations: [
      'Submit cumulative safety analysis to EMA within 60-day deadline specified in the referral notice.',
      'Proactively engage FDA to discuss parallel US labeling updates and any required REMS modifications.',
      'Commission an independent epidemiological study to characterize background MTC rates in the target population.',
      'Implement enhanced pharmacovigilance: targeted follow-up questionnaire for all reported thyroid neoplasm cases.',
      'Prepare company core safety information (CCSI) update for global harmonization of thyroid safety messaging.',
    ],
  },
};

router.post(
  '/change-impact',
  authenticateToken,
  requireOrganizationContext,
  (req: Request, res: Response) => {
    try {
      if (!requireMockRoutesEnabled(res)) return;
      const { guidanceId, submissionType } = req.body as {
        guidanceId: string;
        submissionType: string;
      };

      if (!guidanceId) {
        return res.status(400).json({ error: 'guidanceId is required' });
      }

      const guidance = guidanceChanges[guidanceId];

      if (!guidance) {
        return res.status(404).json({
          error: `Guidance document not found: ${guidanceId}`,
          availableGuidanceIds: Object.keys(guidanceChanges),
        });
      }

      // Filter sections relevant to the requested submission type (if provided)
      let affectedSections = guidance.affectedSections;
      if (submissionType) {
        const normalizedType = submissionType.toUpperCase().replace('-', '');
        if (!guidance.submissionTypes.includes(normalizedType)) {
          return res.status(400).json({
            error: `This guidance does not apply to submission type: ${submissionType}. Applicable types: ${guidance.submissionTypes.join(
              ', '
            )}`,
          });
        }
      }

      const totalImpactDays = affectedSections.reduce((sum, s) => sum + s.estimatedReworkDays, 0);

      res.json({
        guidanceTitle: guidance.guidanceTitle,
        changeDate: guidance.changeDate,
        affectedSections,
        totalImpactDays,
        riskLevel: guidance.riskLevel,
        recommendations: guidance.recommendations,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to analyze change impact',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// ---------------------------------------------------------------------------
// 4. AnA Memory — Per-project contextual memory
// ---------------------------------------------------------------------------

function getOrCreateProjectMemory(projectId: string): ProjectMemoryStore {
  if (!memoryStore[projectId]) {
    memoryStore[projectId] = {
      memories: [],
      projectContext: {
        therapeuticArea: '',
        submissionType: '',
        targetAgency: '',
        drugProduct: '',
      },
    };
  }
  return memoryStore[projectId];
}

// GET /api/ana/memory/:projectId — Retrieve memories
router.get(
  '/memory/:projectId',
  authenticateToken,
  requireOrganizationContext,
  (req: Request, res: Response) => {
    try {
      if (!requireMockRoutesEnabled(res)) return;
      const { projectId } = req.params;
      const store = getOrCreateProjectMemory(projectId);

      res.json({
        projectId,
        memories: store.memories,
        projectContext: store.projectContext,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve memories',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// POST /api/ana/memory/:projectId — Save a new memory
router.post(
  '/memory/:projectId',
  authenticateToken,
  requireOrganizationContext,
  (req: Request, res: Response) => {
    try {
      if (!requireMockRoutesEnabled(res)) return;
      const { projectId } = req.params;
      const { type, content } = req.body as {
        type: 'preference' | 'fact' | 'decision' | 'context';
        content: string;
      };

      if (!type || !content) {
        return res.status(400).json({ error: 'type and content are required' });
      }

      const validTypes = ['preference', 'fact', 'decision', 'context'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          error: `Invalid type. Must be one of: ${validTypes.join(', ')}`,
        });
      }

      const store = getOrCreateProjectMemory(projectId);
      memoryIdCounter += 1;

      const memory: Memory = {
        id: `mem-${memoryIdCounter}`,
        type,
        content,
        createdAt: new Date().toISOString(),
      };

      store.memories.push(memory);

      // If it is a context-type memory, try to auto-populate project context
      if (type === 'context') {
        const lower = content.toLowerCase();
        if (lower.includes('therapeutic area:') || lower.includes('indication:')) {
          const match = content.match(/(?:therapeutic area|indication):\s*(.+)/i);
          if (match) store.projectContext.therapeuticArea = match[1].trim();
        }
        if (lower.includes('submission type:') || lower.includes('submission:')) {
          const match = content.match(/(?:submission type|submission):\s*(.+)/i);
          if (match) store.projectContext.submissionType = match[1].trim();
        }
        if (lower.includes('agency:') || lower.includes('target agency:')) {
          const match = content.match(/(?:target )?agency:\s*(.+)/i);
          if (match) store.projectContext.targetAgency = match[1].trim();
        }
        if (lower.includes('drug product:') || lower.includes('product:')) {
          const match = content.match(/(?:drug )?product:\s*(.+)/i);
          if (match) store.projectContext.drugProduct = match[1].trim();
        }
      }

      res.status(201).json({
        message: 'Memory saved successfully',
        memory,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to save memory',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// DELETE /api/ana/memory/:projectId/:memoryId — Delete a memory
router.delete(
  '/memory/:projectId/:memoryId',
  authenticateToken,
  requireOrganizationContext,
  (req: Request, res: Response) => {
    try {
      if (!requireMockRoutesEnabled(res)) return;
      const { projectId, memoryId } = req.params;
      const store = getOrCreateProjectMemory(projectId);

      const index = store.memories.findIndex(m => m.id === memoryId);
      if (index === -1) {
        return res.status(404).json({ error: `Memory not found: ${memoryId}` });
      }

      const deleted = store.memories.splice(index, 1)[0];

      res.json({
        message: 'Memory deleted successfully',
        deleted,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to delete memory',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// ---------------------------------------------------------------------------
// 5. Submission-Chat — post-draft, cross-dossier provenance interrogation
// ---------------------------------------------------------------------------
//
// Once AnA has generated a section, the user stays in the same thread and
// asks follow-up questions about provenance. The Truth Engine answers across
// the ENTIRE project dossier, not just the active document.
//
// POST /api/ana/submission-chat
//   body: { threadId, artifactId, question }
//   returns: { answer, citations[], retrieval, model, provider, ... }

const submissionChatRateLimiter = createRateLimiter({
  api: {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: 'Too many submission-chat requests, please slow down.',
  },
});

const submissionChatSchema = z.object({
  threadId: z.string().min(1, 'threadId is required'),
  artifactId: z.string().min(1, 'artifactId is required'),
  question: z.string().min(1, 'question is required').max(4000),
});

// Tighter rate limit on the governed mutation than on the read-only chat
// path — apply-rewrite mutates an artifact and writes audit rows.
const submissionChatApplyRateLimiter = createRateLimiter({
  api: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: 'Too many rewrite-apply requests, please slow down.',
  },
});

const applyRewriteSchema = z.object({
  artifactId: z.string().min(1, 'artifactId is required'),
  proposedContent: z
    .string()
    .min(8, 'proposedContent is too short')
    .max(200_000, 'proposedContent exceeds the size limit')
    .optional(),
  proposalId: z.string().uuid().optional(),
  reasonForChange: z
    .string()
    .min(8, 'reasonForChange must explain WHY the rewrite is being applied')
    .max(2000, 'reasonForChange exceeds the size limit'),
  sectionCode: z.string().max(64).nullable().optional(),
  targetAgency: z.string().max(32).nullable().optional(),
  rationale: z.string().max(4000).nullable().optional(),
  threadId: z.string().max(128).nullable().optional(),
  /**
   * Optional 21 CFR Part 11 e-signature. Required when the artifact's
   * metadata flags requiresSignature; otherwise recorded if supplied.
   */
  signature: z
    .object({
      meaning: z
        .string()
        .min(8, 'signature.meaning must attest to what is being signed')
        .max(2000),
      signerName: z.string().max(255).nullable().optional(),
      signerEmail: z.string().email().nullable().optional(),
      authenticationMethod: z
        .enum(['password', 'sso', 'mfa', 'session'])
        .optional(),
      secondFactorVerified: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  /**
   * Acknowledge that the proposed content has uncited paragraphs. Required
   * when the verification pass blocks; the acknowledgment is audit-logged.
   */
  acknowledgeUnsupported: z.boolean().optional(),
});

// Preview-rewrite is read-only — same rate limit as the chat path is fine.
const previewRewriteSchema = z
  .object({
    artifactId: z.string().min(1, 'artifactId is required'),
    proposedContent: z
      .string()
      .min(8, 'proposedContent is too short')
      .max(200_000, 'proposedContent exceeds the size limit')
      .optional(),
    proposalId: z.string().uuid().optional(),
  })
  .refine(d => !!d.proposedContent || !!d.proposalId, {
    message: 'proposedContent or proposalId is required',
  });

router.post(
  '/submission-chat/preview-rewrite',
  authenticateToken,
  requireOrganizationContext,
  submissionChatRateLimiter,
  async (req: Request, res: Response) => {
    const parsed = previewRewriteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        code: 'INVALID_REQUEST',
        details: parsed.error.flatten(),
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res.status(401).json({
        error: 'Authenticated tenant required',
        code: 'AUTH_REQUIRED',
      });
    }
    try {
      const { previewRewrite } = await import(
        '../services/ana/submission-chat-apply-rewrite'
      );
      const result = await previewRewrite({
        artifactId: parsed.data.artifactId,
        proposedContent: parsed.data.proposedContent,
        proposalId: parsed.data.proposalId,
        organizationId,
      });
      return res.json(result);
    } catch (error: any) {
      const code = error?.code;
      if (code === 'ARTIFACT_NOT_FOUND' || code === 'PROPOSAL_NOT_FOUND') {
        return res.status(404).json({ error: error.message, code });
      }
      if (
        code === 'ARTIFACT_ORG_MISMATCH' ||
        code === 'PROPOSAL_ARTIFACT_MISMATCH'
      ) {
        return res.status(403).json({ error: error.message, code });
      }
      if (code === 'INVALID_REQUEST') {
        return res.status(400).json({ error: error.message, code });
      }
      console.error(
        '[AnA submission-chat preview-rewrite] failed:',
        error?.message || error
      );
      return res.status(500).json({
        error: 'Failed to preview rewrite',
        code: 'PREVIEW_REWRITE_ERROR',
      });
    }
  }
);

router.post(
  '/submission-chat/apply-rewrite',
  authenticateToken,
  requireOrganizationContext,
  submissionChatApplyRateLimiter,
  async (req: Request, res: Response) => {
    const parsed = applyRewriteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        code: 'INVALID_REQUEST',
        details: parsed.error.flatten(),
      });
    }

    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    const userId = (req as any).userId || (req as any).user?.id;
    if (!organizationId || !userId) {
      return res.status(401).json({
        error: 'Authenticated tenant + user required',
        code: 'AUTH_REQUIRED',
      });
    }

    try {
      const { applyRewrite } = await import(
        '../services/ana/submission-chat-apply-rewrite'
      );
      const result = await applyRewrite({
        artifactId: parsed.data.artifactId,
        proposedContent: parsed.data.proposedContent,
        proposalId: parsed.data.proposalId,
        reasonForChange: parsed.data.reasonForChange,
        sectionCode: parsed.data.sectionCode ?? null,
        targetAgency: parsed.data.targetAgency ?? null,
        rationale: parsed.data.rationale ?? null,
        threadId: parsed.data.threadId ?? null,
        signature: parsed.data.signature ?? null,
        acknowledgeUnsupported: parsed.data.acknowledgeUnsupported ?? false,
        organizationId,
        userId,
        userName:
          (req as any).user?.name ||
          (req as any).user?.email ||
          `user-${userId}`,
        userEmail: (req as any).user?.email ?? null,
        userRole: (req as any).user?.role ?? 'regulatory',
        ipAddress:
          req.ip ||
          (req.headers['x-forwarded-for'] as string | undefined) ||
          'ip-not-captured',
        userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
      });
      return res.json({
        ok: true,
        ...result,
      });
    } catch (error: any) {
      const code = error?.code;
      if (code === 'ARTIFACT_NOT_FOUND' || code === 'PROPOSAL_NOT_FOUND') {
        return res.status(404).json({ error: error.message, code });
      }
      if (
        code === 'ARTIFACT_ORG_MISMATCH' ||
        code === 'PROPOSAL_ARTIFACT_MISMATCH'
      ) {
        return res.status(403).json({ error: error.message, code });
      }
      if (
        code === 'ARTIFACT_LOCKED' ||
        code === 'REWRITE_NOOP' ||
        code === 'REASON_REQUIRED' ||
        code === 'SIGNATURE_REQUIRED' ||
        code === 'UNSUPPORTED_REWRITE' ||
        code === 'PROPOSAL_ALREADY_APPLIED' ||
        code === 'PROPOSAL_SUPERSEDED' ||
        code === 'PROPOSAL_EXPIRED' ||
        code === 'PROPOSAL_HASH_MISMATCH'
      ) {
        return res.status(409).json({ error: error.message, code });
      }
      if (code === 'INVALID_REQUEST') {
        return res.status(400).json({ error: error.message, code });
      }
      console.error(
        '[AnA submission-chat apply-rewrite] failed:',
        error?.message || error
      );
      return res.status(500).json({
        error: 'Failed to apply rewrite',
        code: 'APPLY_REWRITE_ERROR',
      });
    }
  }
);

// ── Sentence-level citation endpoints (Feature 2.1 + 2.2) ───────────────
//
// Run / read / list / inspect-rules surface for the citation engine.
// All tenant-scoped via requireOrganizationContext.

const runCitationsSchema = z.object({
  artifactId: z.string().min(1, 'artifactId is required').max(128),
  ctdSectionOverride: z.string().max(64).nullable().optional(),
});

const runCitationsRateLimiter = createRateLimiter({
  api: {
    windowMs: 60 * 1000,
    maxRequests: 6, // engine call is heavy; throttle hard
    message: 'Too many citation-engine runs, please slow down.',
  },
});

router.post(
  '/citations/run',
  authenticateToken,
  requireOrganizationContext,
  runCitationsRateLimiter,
  async (req: Request, res: Response) => {
    const parsed = runCitationsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        code: 'INVALID_REQUEST',
        details: parsed.error.flatten(),
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    const organizationUuid =
      (req as any).tenantContext?.organizationUuid ||
      (req.headers['x-org-uuid'] as string | undefined);
    const userId = (req as any).userId || (req as any).user?.id;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { runCitationEngine } = await import(
        '../services/ana/citation-engine'
      );
      const result = await runCitationEngine(
        parsed.data.artifactId,
        organizationId,
        {
          persist: true,
          ctdSectionOverride: parsed.data.ctdSectionOverride ?? undefined,
          organizationUuid: organizationUuid ?? undefined,
          userId: userId ?? null,
        }
      );
      return res.json(result);
    } catch (err: any) {
      const code = err?.code;
      if (code === 'ARTIFACT_NOT_FOUND') {
        return res.status(404).json({ error: err.message, code });
      }
      console.error(
        '[AnA citations run] failed:',
        err?.message || err
      );
      return res.status(500).json({
        error: 'Failed to run citation engine',
        code: 'CITATIONS_RUN_ERROR',
      });
    }
  }
);

router.get(
  '/citations/gap-rules',
  authenticateToken,
  async (_req: Request, res: Response) => {
    const { listAllGapRules } = await import(
      '../services/ana/gap-classifier'
    );
    return res.json({ rules: listAllGapRules() });
  }
);

router.get(
  '/citations/gap-rules/:sectionCode',
  authenticateToken,
  async (req: Request, res: Response) => {
    const sectionCode = String(req.params.sectionCode || '');
    if (!sectionCode || sectionCode.length > 64) {
      return res.status(400).json({
        error: 'sectionCode is required',
        code: 'INVALID_REQUEST',
      });
    }
    const { getGapRulesForSection } = await import(
      '../services/ana/gap-classifier'
    );
    return res.json({
      sectionCode,
      rules: getGapRulesForSection(sectionCode),
    });
  }
);

router.get(
  '/citations/:artifactId',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const artifactId = String(req.params.artifactId || '');
    if (!artifactId || artifactId.length > 128) {
      return res
        .status(400)
        .json({ error: 'artifactId is required (max 128 chars)', code: 'INVALID_REQUEST' });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { getCitationsForArtifact } = await import(
        '../services/ana/citation-engine'
      );
      const result = await getCitationsForArtifact(artifactId, organizationId);
      if (!result) {
        return res.status(404).json({
          error: 'Artifact not found',
          code: 'ARTIFACT_NOT_FOUND',
        });
      }
      return res.json(result);
    } catch (err: any) {
      console.error('[AnA citations get] failed:', err?.message || err);
      return res.status(500).json({
        error: 'Failed to load citations',
        code: 'CITATIONS_GET_ERROR',
      });
    }
  }
);

// ─── Project-level citation operations ──────────────────────────────────
//
// Rollup, stale-list, and batch re-cite for a whole project. The single-
// artifact endpoints above stay as-is; these are for readiness dashboards
// and ops flows that operate on the full dossier.

const projectIdParam = z.coerce.number().int().positive();

router.get(
  '/citations/projects/:projectId/rollup',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const parsed = projectIdParam.safeParse(req.params.projectId);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'projectId must be a positive integer',
        code: 'INVALID_REQUEST',
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { getProjectCitationsRollup } = await import(
        '../services/ana/citation-engine'
      );
      const result = await getProjectCitationsRollup(parsed.data, organizationId);
      return res.json(result);
    } catch (err: any) {
      console.error(
        '[AnA citations project-rollup] failed:',
        err?.message || err
      );
      return res
        .status(500)
        .json({ error: 'Failed to load project rollup', code: 'PROJECT_ROLLUP_ERROR' });
    }
  }
);

router.get(
  '/citations/projects/:projectId/stale',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const parsed = projectIdParam.safeParse(req.params.projectId);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'projectId must be a positive integer',
        code: 'INVALID_REQUEST',
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { listStaleCitedArtifacts } = await import(
        '../services/ana/citation-engine'
      );
      const stale = await listStaleCitedArtifacts(parsed.data, organizationId);
      return res.json({
        projectId: parsed.data,
        organizationId,
        staleCount: stale.length,
        artifacts: stale,
      });
    } catch (err: any) {
      console.error(
        '[AnA citations project-stale] failed:',
        err?.message || err
      );
      return res
        .status(500)
        .json({ error: 'Failed to load stale list', code: 'PROJECT_STALE_ERROR' });
    }
  }
);

const batchRunSchema = z.object({
  staleOnly: z.boolean().optional(),
  ctdSectionPrefix: z.string().max(64).optional(),
  concurrency: z.number().int().min(1).max(4).optional(),
});

// Tighter rate limiter — batch is the heaviest endpoint we expose.
const batchRunRateLimiter = createRateLimiter({
  api: {
    windowMs: 5 * 60 * 1000,
    maxRequests: 2,
    message: 'Batch citation runs are limited to 2 per 5 minutes.',
  },
});

router.post(
  '/citations/projects/:projectId/batch-run',
  authenticateToken,
  requireOrganizationContext,
  batchRunRateLimiter,
  async (req: Request, res: Response) => {
    const projectIdParsed = projectIdParam.safeParse(req.params.projectId);
    if (!projectIdParsed.success) {
      return res.status(400).json({
        error: 'projectId must be a positive integer',
        code: 'INVALID_REQUEST',
      });
    }
    const bodyParsed = batchRunSchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        code: 'INVALID_REQUEST',
        details: bodyParsed.error.flatten(),
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    const organizationUuid =
      (req as any).tenantContext?.organizationUuid ||
      (req.headers['x-org-uuid'] as string | undefined);
    const userId = (req as any).userId || (req as any).user?.id;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { runCitationEngineForProject } = await import(
        '../services/ana/citation-engine'
      );
      const result = await runCitationEngineForProject(
        projectIdParsed.data,
        organizationId,
        {
          staleOnly: bodyParsed.data.staleOnly ?? true,
          ctdSectionPrefix: bodyParsed.data.ctdSectionPrefix,
          concurrency: bodyParsed.data.concurrency,
          organizationUuid: organizationUuid ?? undefined,
          userId: userId ?? null,
        }
      );
      return res.json(result);
    } catch (err: any) {
      console.error(
        '[AnA citations project-batch-run] failed:',
        err?.message || err
      );
      return res.status(500).json({
        error: 'Failed to run batch citations',
        code: 'PROJECT_BATCH_ERROR',
      });
    }
  }
);

// ── Citation run history + readiness bridge ────────────────────────────

router.get(
  '/citations/runs/:runId',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const runId = String(req.params.runId || '');
    if (!/^[0-9a-f-]{36}$/i.test(runId)) {
      return res
        .status(400)
        .json({ error: 'runId must be a uuid', code: 'INVALID_REQUEST' });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { getCitationRunById } = await import(
        '../services/ana/citation-engine'
      );
      const result = await getCitationRunById(runId, organizationId);
      if (!result) {
        return res.status(404).json({
          error: 'Run not found',
          code: 'CITATION_RUN_NOT_FOUND',
        });
      }
      return res.json(result);
    } catch (err: any) {
      console.error(
        '[AnA citations get-run] failed:',
        err?.message || err
      );
      return res
        .status(500)
        .json({ error: 'Failed to load run', code: 'GET_RUN_ERROR' });
    }
  }
);

const listRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

router.get(
  '/citations/:artifactId/runs',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const artifactId = String(req.params.artifactId || '');
    if (!artifactId || artifactId.length > 128) {
      return res
        .status(400)
        .json({ error: 'artifactId is required (max 128 chars)', code: 'INVALID_REQUEST' });
    }
    const parsed = listRunsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid query',
        code: 'INVALID_REQUEST',
        details: parsed.error.flatten(),
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { listCitationRunsForArtifact } = await import(
        '../services/ana/citation-engine'
      );
      const { rows, total } = await listCitationRunsForArtifact(
        artifactId,
        organizationId,
        { limit: parsed.data.limit, offset: parsed.data.offset }
      );
      return res.json({ artifactId, total, runs: rows });
    } catch (err: any) {
      console.error(
        '[AnA citations list-runs] failed:',
        err?.message || err
      );
      return res
        .status(500)
        .json({ error: 'Failed to list runs', code: 'LIST_RUNS_ERROR' });
    }
  }
);

// ─── Guidance Change Impact Scanner (Feature 2.6) ──────────────────────
//
// Detects when a regulatory guidance document's version changes and
// flags every artifact whose CTD section is mapped to it via the gap-
// classifier rules or IND section registry.

const guidanceAuthorityEnum = z.enum([
  'ICH',
  'FDA',
  'EMA',
  'PMDA',
  'HC',
  'MHRA',
  'ICH-MULTIREGIONAL',
]);

const guidanceUpsertSchema = z.object({
  guidanceCode: z.string().min(1).max(128),
  authority: guidanceAuthorityEnum,
  newVersion: z.string().min(1).max(64),
  sourceUrl: z.string().url().max(500).nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  /** When set, also run the scan scoped to this org. */
  scanOrganizationId: z.number().int().positive().optional(),
});

const guidanceScanRateLimiter = createRateLimiter({
  api: {
    windowMs: 60 * 1000,
    maxRequests: 6,
    message: 'Guidance scans are limited to 6 per minute.',
  },
});

router.post(
  '/guidance/upsert-version',
  authenticateToken,
  requireOrganizationContext,
  guidanceScanRateLimiter,
  async (req: Request, res: Response) => {
    const parsed = guidanceUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        code: 'INVALID_REQUEST',
        details: parsed.error.flatten(),
      });
    }
    const callerOrgId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!callerOrgId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    // Cross-org scans are intentionally blocked at the route layer:
    // the caller can only scan their own org. (Global / cross-tenant
    // scans are an admin-only path that the system scheduler runs.)
    const scanOrg =
      typeof parsed.data.scanOrganizationId === 'number'
        ? parsed.data.scanOrganizationId
        : callerOrgId;
    if (scanOrg !== callerOrgId) {
      return res.status(403).json({
        error: 'Cannot scan another organization',
        code: 'CROSS_TENANT_BLOCKED',
      });
    }
    try {
      const { ingestGuidanceUpdate } = await import(
        '../services/intelligence/guidance-impact-scanner'
      );
      const result = await ingestGuidanceUpdate({
        guidanceCode: parsed.data.guidanceCode,
        authority: parsed.data.authority,
        newVersion: parsed.data.newVersion,
        sourceUrl: parsed.data.sourceUrl ?? null,
        metadata: parsed.data.metadata ?? null,
        organizationId: scanOrg,
      });
      return res.json(result);
    } catch (err: any) {
      const code = err?.code;
      if (code === 'INVALID_REQUEST') {
        return res.status(400).json({ error: err.message, code });
      }
      console.error(
        '[AnA guidance upsert-version] failed:',
        err?.message || err
      );
      return res
        .status(500)
        .json({ error: 'Failed to upsert guidance version', code: 'GUIDANCE_UPSERT_ERROR' });
    }
  }
);

const guidanceManualScanSchema = z.object({
  guidanceCode: z.string().min(1).max(128),
  authority: guidanceAuthorityEnum,
  prevVersion: z.string().max(64).nullable().optional(),
  newVersion: z.string().min(1).max(64),
});

router.post(
  '/guidance/scan',
  authenticateToken,
  requireOrganizationContext,
  guidanceScanRateLimiter,
  async (req: Request, res: Response) => {
    const parsed = guidanceManualScanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        code: 'INVALID_REQUEST',
        details: parsed.error.flatten(),
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { scanArtifactsForGuidanceChange } = await import(
        '../services/intelligence/guidance-impact-scanner'
      );
      const result = await scanArtifactsForGuidanceChange({
        guidanceCode: parsed.data.guidanceCode,
        prevVersion: parsed.data.prevVersion ?? null,
        newVersion: parsed.data.newVersion,
        authority: parsed.data.authority,
        organizationId,
      });
      return res.json(result);
    } catch (err: any) {
      console.error('[AnA guidance scan] failed:', err?.message || err);
      return res
        .status(500)
        .json({ error: 'Failed to scan guidance change', code: 'GUIDANCE_SCAN_ERROR' });
    }
  }
);

const guidanceAlertsQuerySchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  artifactId: z.string().max(128).optional(),
  status: z
    .enum(['open', 'acknowledged', 'resolved'])
    .optional(),
  severity: z.enum(['critical', 'major', 'minor', 'info']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

router.get(
  '/guidance/alerts',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const parsed = guidanceAlertsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid query',
        code: 'INVALID_REQUEST',
        details: parsed.error.flatten(),
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { listGuidanceAlerts } = await import(
        '../services/intelligence/guidance-impact-scanner'
      );
      const { rows, total } = await listGuidanceAlerts({
        organizationId,
        projectId: parsed.data.projectId,
        artifactId: parsed.data.artifactId,
        status: parsed.data.status,
        severity: parsed.data.severity,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      });
      return res.json({
        organizationId,
        total,
        alerts: rows,
      });
    } catch (err: any) {
      console.error(
        '[AnA guidance alerts list] failed:',
        err?.message || err
      );
      return res
        .status(500)
        .json({ error: 'Failed to list guidance alerts', code: 'GUIDANCE_ALERTS_ERROR' });
    }
  }
);

router.post(
  '/guidance/alerts/:alertId/acknowledge',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const alertId = String(req.params.alertId || '');
    if (!/^[0-9a-f-]{36}$/i.test(alertId)) {
      return res.status(400).json({
        error: 'alertId must be a uuid',
        code: 'INVALID_REQUEST',
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    const userId = (req as any).userId || (req as any).user?.id || null;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { acknowledgeGuidanceAlert } = await import(
        '../services/intelligence/guidance-impact-scanner'
      );
      const result = await acknowledgeGuidanceAlert(alertId, organizationId, userId);
      if (!result.ok) {
        return res.status(404).json({
          error: 'Alert not found',
          code: 'GUIDANCE_ALERT_NOT_FOUND',
        });
      }
      return res.json({ ok: true, alert: result.row });
    } catch (err: any) {
      console.error('[AnA guidance ack] failed:', err?.message || err);
      return res.status(500).json({
        error: 'Failed to acknowledge alert',
        code: 'GUIDANCE_ALERT_ACK_ERROR',
      });
    }
  }
);

router.post(
  '/guidance/alerts/:alertId/resolve',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const alertId = String(req.params.alertId || '');
    if (!/^[0-9a-f-]{36}$/i.test(alertId)) {
      return res.status(400).json({
        error: 'alertId must be a uuid',
        code: 'INVALID_REQUEST',
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    const userId = (req as any).userId || (req as any).user?.id || null;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { resolveGuidanceAlert } = await import(
        '../services/intelligence/guidance-impact-scanner'
      );
      const result = await resolveGuidanceAlert(alertId, organizationId, userId);
      if (!result.ok) {
        return res.status(404).json({
          error: 'Alert not found',
          code: 'GUIDANCE_ALERT_NOT_FOUND',
        });
      }
      return res.json({ ok: true, alert: result.row });
    } catch (err: any) {
      console.error('[AnA guidance resolve] failed:', err?.message || err);
      return res.status(500).json({
        error: 'Failed to resolve alert',
        code: 'GUIDANCE_ALERT_RESOLVE_ERROR',
      });
    }
  }
);

router.get(
  '/guidance/alerts/summary',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { getGuidanceAlertsSummary } = await import(
        '../services/intelligence/guidance-impact-scanner'
      );
      const result = await getGuidanceAlertsSummary(organizationId);
      return res.json(result);
    } catch (err: any) {
      console.error(
        '[AnA guidance alerts summary] failed:',
        err?.message || err
      );
      return res.status(500).json({
        error: 'Failed to load guidance alerts summary',
        code: 'GUIDANCE_ALERTS_SUMMARY_ERROR',
      });
    }
  }
);

router.get(
  '/guidance/catalog',
  authenticateToken,
  async (_req: Request, res: Response) => {
    try {
      const { getMonitoredGuidanceCatalog } = await import(
        '../services/intelligence/guidance-impact-scanner'
      );
      const result = await getMonitoredGuidanceCatalog();
      return res.json(result);
    } catch (err: any) {
      console.error(
        '[AnA guidance catalog] failed:',
        err?.message || err
      );
      return res.status(500).json({
        error: 'Failed to load monitored guidance catalog',
        code: 'GUIDANCE_CATALOG_ERROR',
      });
    }
  }
);

const bulkAlertActionSchema = z.object({
  alertIds: z.array(z.string().uuid()).min(1).max(500),
});

router.post(
  '/guidance/alerts/bulk-acknowledge',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const parsed = bulkAlertActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'alertIds is required (1..500 uuids)',
        code: 'INVALID_REQUEST',
        details: parsed.error.flatten(),
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    const userId = (req as any).userId || (req as any).user?.id || null;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { bulkAcknowledgeGuidanceAlerts } = await import(
        '../services/intelligence/guidance-impact-scanner'
      );
      const result = await bulkAcknowledgeGuidanceAlerts(
        parsed.data.alertIds,
        organizationId,
        userId
      );
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error(
        '[AnA guidance bulk-acknowledge] failed:',
        err?.message || err
      );
      return res.status(500).json({
        error: 'Failed to bulk acknowledge alerts',
        code: 'GUIDANCE_BULK_ACK_ERROR',
      });
    }
  }
);

router.post(
  '/guidance/alerts/bulk-resolve',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const parsed = bulkAlertActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'alertIds is required (1..500 uuids)',
        code: 'INVALID_REQUEST',
        details: parsed.error.flatten(),
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    const userId = (req as any).userId || (req as any).user?.id || null;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { bulkResolveGuidanceAlerts } = await import(
        '../services/intelligence/guidance-impact-scanner'
      );
      const result = await bulkResolveGuidanceAlerts(
        parsed.data.alertIds,
        organizationId,
        userId
      );
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error(
        '[AnA guidance bulk-resolve] failed:',
        err?.message || err
      );
      return res.status(500).json({
        error: 'Failed to bulk resolve alerts',
        code: 'GUIDANCE_BULK_RESOLVE_ERROR',
      });
    }
  }
);

// Webhook ingest — accepts a batched feed update and runs the scanner
// for every entry. Tenant-scoped: scans only the caller's org. The
// payload is authenticated via the same authenticateToken middleware
// the rest of the surface uses; consumers wire their own HMAC at the
// edge if they need additional verification.
const webhookIngestSchema = z.object({
  updates: z
    .array(
      z.object({
        guidanceCode: z.string().min(1).max(128),
        authority: guidanceAuthorityEnum,
        newVersion: z.string().min(1).max(64),
        sourceUrl: z.string().url().max(500).nullable().optional(),
        metadata: z.record(z.unknown()).nullable().optional(),
      })
    )
    .min(1)
    .max(100),
});

router.post(
  '/guidance/webhook',
  authenticateToken,
  requireOrganizationContext,
  guidanceScanRateLimiter,
  async (req: Request, res: Response) => {
    const parsed = webhookIngestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid webhook payload',
        code: 'INVALID_REQUEST',
        details: parsed.error.flatten(),
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { ingestGuidanceUpdate } = await import(
        '../services/intelligence/guidance-impact-scanner'
      );
      const ingested: Array<{
        guidanceCode: string;
        changed: boolean;
        prevVersion: string | null;
        newVersion: string;
        alertsCreated: number | null;
        alertsSkippedDuplicate: number | null;
        artifactsAffected: number | null;
      }> = [];
      // Process sequentially — concurrent upserts on the same code
      // would hit the SELECT FOR UPDATE lock; sequential keeps it
      // predictable.
      for (const update of parsed.data.updates) {
        try {
          const { upsert, scan } = await ingestGuidanceUpdate({
            guidanceCode: update.guidanceCode,
            authority: update.authority,
            newVersion: update.newVersion,
            sourceUrl: update.sourceUrl ?? null,
            metadata: update.metadata ?? null,
            organizationId,
          });
          ingested.push({
            guidanceCode: upsert.guidanceCode,
            changed: upsert.changed,
            prevVersion: upsert.prevVersion,
            newVersion: upsert.newVersion,
            alertsCreated: scan?.alertsCreated ?? null,
            alertsSkippedDuplicate: scan?.alertsSkippedDuplicate ?? null,
            artifactsAffected: scan?.artifactsAffected ?? null,
          });
        } catch (innerErr: any) {
          console.warn(
            '[AnA guidance webhook] update failed:',
            update.guidanceCode,
            innerErr?.message || innerErr
          );
          ingested.push({
            guidanceCode: update.guidanceCode,
            changed: false,
            prevVersion: null,
            newVersion: update.newVersion,
            alertsCreated: null,
            alertsSkippedDuplicate: null,
            artifactsAffected: null,
          });
        }
      }
      return res.json({
        ok: true,
        organizationId,
        received: parsed.data.updates.length,
        ingested,
      });
    } catch (err: any) {
      console.error(
        '[AnA guidance webhook] failed:',
        err?.message || err
      );
      return res.status(500).json({
        error: 'Failed to ingest webhook',
        code: 'GUIDANCE_WEBHOOK_ERROR',
      });
    }
  }
);

// Document-Embedded Audit Ledger — export an artifact as .docx with the
// AnALedger XML embedded as a custom XML part (Open XML customXml/).
const docxExportSchema = z.object({
  includeProvenanceSummary: z.coerce.boolean().optional(),
});

const docxExportRateLimiter = createRateLimiter({
  api: {
    windowMs: 5 * 60 * 1000,
    maxRequests: 10,
    message: 'Docx-with-ledger exports are limited to 10 per 5 minutes.',
  },
});

router.post(
  '/citations/:artifactId/export.docx',
  authenticateToken,
  requireOrganizationContext,
  docxExportRateLimiter,
  async (req: Request, res: Response) => {
    const artifactId = String(req.params.artifactId || '');
    if (!artifactId || artifactId.length > 128) {
      return res.status(400).json({
        error: 'artifactId is required (max 128 chars)',
        code: 'INVALID_REQUEST',
      });
    }
    const parsed = docxExportSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        code: 'INVALID_REQUEST',
        details: parsed.error.flatten(),
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { exportArtifactWithLedger } = await import(
        '../services/export/docx-ledger-export'
      );
      const result = await exportArtifactWithLedger(artifactId, organizationId, {
        includeProvenanceSummary: parsed.data.includeProvenanceSummary,
      });
      if (!result) {
        return res
          .status(404)
          .json({ error: 'Artifact not found', code: 'ARTIFACT_NOT_FOUND' });
      }
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename}"`
      );
      res.setHeader(
        'X-AnALedger-Bytes',
        String(result.ledgerXmlByteLength)
      );
      res.setHeader(
        'X-AnALedger-Schema',
        result.ledger.schemaVersion
      );
      return res.send(result.buffer);
    } catch (err: any) {
      console.error(
        '[AnA citations export.docx] failed:',
        err?.message || err
      );
      return res
        .status(500)
        .json({ error: 'Failed to export docx', code: 'DOCX_LEDGER_EXPORT_ERROR' });
    }
  }
);

// Citation engine health (org-scoped status + aggregates)
router.get(
  '/citations/health',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { getCitationHealth } = await import(
        '../services/ana/citation-health'
      );
      const result = await getCitationHealth(organizationId);
      return res.json(result);
    } catch (err: any) {
      console.error('[AnA citations health] failed:', err?.message || err);
      return res.status(500).json({
        error: 'Failed to load citation health',
        code: 'CITATION_HEALTH_ERROR',
      });
    }
  }
);

const trendQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(365).optional(),
  bucket: z.enum(['day', 'week', 'month']).optional(),
});

router.get(
  '/citations/projects/:projectId/trends',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const projectIdParsed = projectIdParam.safeParse(req.params.projectId);
    if (!projectIdParsed.success) {
      return res.status(400).json({
        error: 'projectId must be a positive integer',
        code: 'INVALID_REQUEST',
      });
    }
    const queryParsed = trendQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return res.status(400).json({
        error: 'Invalid query',
        code: 'INVALID_REQUEST',
        details: queryParsed.error.flatten(),
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { getProjectCitationTrend } = await import(
        '../services/ana/citation-trends'
      );
      const result = await getProjectCitationTrend(
        projectIdParsed.data,
        organizationId,
        {
          windowDays: queryParsed.data.windowDays,
          bucket: queryParsed.data.bucket,
        }
      );
      return res.json(result);
    } catch (err: any) {
      console.error('[AnA citations trends] failed:', err?.message || err);
      return res.status(500).json({
        error: 'Failed to load trends',
        code: 'CITATION_TRENDS_ERROR',
      });
    }
  }
);

router.get(
  '/citations/projects/:projectId/graph',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const parsed = projectIdParam.safeParse(req.params.projectId);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'projectId must be a positive integer',
        code: 'INVALID_REQUEST',
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { getProjectCitationGraph } = await import(
        '../services/ana/citation-graph'
      );
      const result = await getProjectCitationGraph(parsed.data, organizationId);
      return res.json(result);
    } catch (err: any) {
      console.error(
        '[AnA citations graph] failed:',
        err?.message || err
      );
      return res.status(500).json({
        error: 'Failed to build citation graph',
        code: 'CITATION_GRAPH_ERROR',
      });
    }
  }
);

// Per-section expectations — "what's expected here, and how am I doing?"
router.get(
  '/citations/:artifactId/expectations',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const artifactId = String(req.params.artifactId || '');
    if (!artifactId || artifactId.length > 128) {
      return res.status(400).json({
        error: 'artifactId is required (max 128 chars)',
        code: 'INVALID_REQUEST',
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { getArtifactSectionExpectations } = await import(
        '../services/ana/citation-expectations'
      );
      const result = await getArtifactSectionExpectations(
        artifactId,
        organizationId
      );
      if (!result) {
        return res.status(404).json({
          error: 'Artifact not found',
          code: 'ARTIFACT_NOT_FOUND',
        });
      }
      return res.json(result);
    } catch (err: any) {
      console.error(
        '[AnA citations expectations] failed:',
        err?.message || err
      );
      return res
        .status(500)
        .json({ error: 'Failed to load expectations', code: 'EXPECTATIONS_ERROR' });
    }
  }
);

// Citation search (filter the persisted citations across a project)
const citationSearchSchema = z.object({
  q: z.string().max(500).optional(),
  status: z.enum(['supported', 'contradicted', 'gap']).optional(),
  rule: z.string().max(64).optional(),
  severity: z.enum(['critical', 'major', 'minor', 'info']).optional(),
  artifactId: z.string().max(128).optional(),
  ctdSectionPrefix: z.string().max(64).optional(),
  sourceArtifactId: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

router.get(
  '/citations/projects/:projectId/search',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const projectIdParsed = projectIdParam.safeParse(req.params.projectId);
    if (!projectIdParsed.success) {
      return res.status(400).json({
        error: 'projectId must be a positive integer',
        code: 'INVALID_REQUEST',
      });
    }
    const queryParsed = citationSearchSchema.safeParse(req.query);
    if (!queryParsed.success) {
      return res.status(400).json({
        error: 'Invalid search parameters',
        code: 'INVALID_REQUEST',
        details: queryParsed.error.flatten(),
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { searchProjectCitations } = await import(
        '../services/ana/citation-search'
      );
      const result = await searchProjectCitations({
        projectId: projectIdParsed.data,
        organizationId,
        filters: {
          query: queryParsed.data.q,
          status: queryParsed.data.status,
          rule: queryParsed.data.rule,
          severity: queryParsed.data.severity,
          artifactId: queryParsed.data.artifactId,
          ctdSectionPrefix: queryParsed.data.ctdSectionPrefix,
          sourceArtifactId: queryParsed.data.sourceArtifactId,
        },
        limit: queryParsed.data.limit,
        offset: queryParsed.data.offset,
      });
      return res.json(result);
    } catch (err: any) {
      console.error(
        '[AnA citations search] failed:',
        err?.message || err
      );
      return res.status(500).json({
        error: 'Failed to search citations',
        code: 'CITATION_SEARCH_ERROR',
      });
    }
  }
);

// Run-history pruning (admin-triggerable, also runs on a scheduler)
const pruneRunsSchema = z.object({
  keepLastN: z.number().int().min(1).max(100).optional(),
});

const pruneRunsRateLimiter = createRateLimiter({
  api: {
    windowMs: 5 * 60 * 1000,
    maxRequests: 2,
    message: 'Run pruning is limited to 2 per 5 minutes.',
  },
});

router.post(
  '/citations/runs/prune',
  authenticateToken,
  requireOrganizationContext,
  pruneRunsRateLimiter,
  async (req: Request, res: Response) => {
    const parsed = pruneRunsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        code: 'INVALID_REQUEST',
        details: parsed.error.flatten(),
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { pruneOldCitationRuns } = await import(
        '../services/ana/citation-run-pruner'
      );
      const result = await pruneOldCitationRuns({
        keepLastN: parsed.data.keepLastN,
        organizationId,
      });
      return res.json(result);
    } catch (err: any) {
      console.error(
        '[AnA citations prune] failed:',
        err?.message || err
      );
      return res.status(500).json({
        error: 'Failed to prune runs',
        code: 'CITATION_PRUNE_ERROR',
      });
    }
  }
);

// Per-rule gap inventory + citation export

router.get(
  '/citations/projects/:projectId/gaps-by-rule',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const parsed = projectIdParam.safeParse(req.params.projectId);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'projectId must be a positive integer',
        code: 'INVALID_REQUEST',
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { getProjectGapsByRule } = await import(
        '../services/ana/citation-export'
      );
      const result = await getProjectGapsByRule(parsed.data, organizationId);
      return res.json(result);
    } catch (err: any) {
      console.error(
        '[AnA citations gaps-by-rule] failed:',
        err?.message || err
      );
      return res
        .status(500)
        .json({ error: 'Failed to load gaps-by-rule', code: 'GAPS_BY_RULE_ERROR' });
    }
  }
);

const exportFormatSchema = z.enum(['json', 'csv']);

router.get(
  '/citations/projects/:projectId/export',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const parsed = projectIdParam.safeParse(req.params.projectId);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'projectId must be a positive integer',
        code: 'INVALID_REQUEST',
      });
    }
    const formatParsed = exportFormatSchema.safeParse(req.query.format ?? 'json');
    if (!formatParsed.success) {
      return res
        .status(400)
        .json({ error: 'format must be json or csv', code: 'INVALID_REQUEST' });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { exportProjectCitations, formatCitationsCsv, formatCitationsJsonExport } =
        await import('../services/ana/citation-export');
      const rows = await exportProjectCitations(parsed.data, organizationId);
      if (formatParsed.data === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="project-${parsed.data}-citations.csv"`
        );
        return res.send(formatCitationsCsv(rows));
      }
      return res.json({
        projectId: parsed.data,
        organizationId,
        ...formatCitationsJsonExport(rows),
      });
    } catch (err: any) {
      console.error(
        '[AnA citations project-export] failed:',
        err?.message || err
      );
      return res.status(500).json({
        error: 'Failed to export project citations',
        code: 'PROJECT_EXPORT_ERROR',
      });
    }
  }
);

router.get(
  '/citations/:artifactId/export',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const artifactId = String(req.params.artifactId || '');
    if (!artifactId || artifactId.length > 128) {
      return res.status(400).json({
        error: 'artifactId is required (max 128 chars)',
        code: 'INVALID_REQUEST',
      });
    }
    const formatParsed = exportFormatSchema.safeParse(req.query.format ?? 'json');
    if (!formatParsed.success) {
      return res
        .status(400)
        .json({ error: 'format must be json or csv', code: 'INVALID_REQUEST' });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { exportArtifactCitations, formatCitationsCsv, formatCitationsJsonExport } =
        await import('../services/ana/citation-export');
      const rows = await exportArtifactCitations(artifactId, organizationId);
      if (rows === null) {
        return res
          .status(404)
          .json({ error: 'Artifact not found', code: 'ARTIFACT_NOT_FOUND' });
      }
      if (formatParsed.data === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${artifactId}-citations.csv"`
        );
        return res.send(formatCitationsCsv(rows));
      }
      return res.json({
        artifactId,
        organizationId,
        ...formatCitationsJsonExport(rows),
      });
    } catch (err: any) {
      console.error(
        '[AnA citations artifact-export] failed:',
        err?.message || err
      );
      return res.status(500).json({
        error: 'Failed to export artifact citations',
        code: 'ARTIFACT_EXPORT_ERROR',
      });
    }
  }
);

// Project-level snapshot + diff
const isoDateString = z
  .string()
  .refine(s => !Number.isNaN(new Date(s).getTime()), {
    message: 'must be a valid ISO date string',
  });

router.get(
  '/citations/projects/:projectId/snapshot',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const projectIdParsed = projectIdParam.safeParse(req.params.projectId);
    if (!projectIdParsed.success) {
      return res.status(400).json({
        error: 'projectId must be a positive integer',
        code: 'INVALID_REQUEST',
      });
    }
    const asOfRaw = (req.query.asOf as string | undefined) ?? undefined;
    let asOfDate: Date | undefined;
    if (asOfRaw) {
      const parsed = isoDateString.safeParse(asOfRaw);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'asOf must be a valid ISO date string',
          code: 'INVALID_REQUEST',
        });
      }
      asOfDate = new Date(parsed.data);
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { getProjectCitationSnapshot } = await import(
        '../services/ana/citation-engine'
      );
      const result = await getProjectCitationSnapshot(
        projectIdParsed.data,
        organizationId,
        asOfDate
      );
      return res.json(result);
    } catch (err: any) {
      console.error(
        '[AnA citations project-snapshot] failed:',
        err?.message || err
      );
      return res.status(500).json({
        error: 'Failed to load snapshot',
        code: 'PROJECT_SNAPSHOT_ERROR',
      });
    }
  }
);

const projectDiffQuerySchema = z.object({
  from: isoDateString,
  to: isoDateString.optional(),
});

router.get(
  '/citations/projects/:projectId/diff',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const projectIdParsed = projectIdParam.safeParse(req.params.projectId);
    if (!projectIdParsed.success) {
      return res.status(400).json({
        error: 'projectId must be a positive integer',
        code: 'INVALID_REQUEST',
      });
    }
    const queryParsed = projectDiffQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return res.status(400).json({
        error: '?from is required (ISO date); ?to is optional',
        code: 'INVALID_REQUEST',
        details: queryParsed.error.flatten(),
      });
    }
    const fromDate = new Date(queryParsed.data.from);
    const toDate = queryParsed.data.to ? new Date(queryParsed.data.to) : new Date();
    if (fromDate.getTime() > toDate.getTime()) {
      return res.status(400).json({
        error: '?from must be earlier than ?to',
        code: 'INVALID_REQUEST',
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { diffProjectCitationSnapshots } = await import(
        '../services/ana/citation-engine'
      );
      const result = await diffProjectCitationSnapshots(
        projectIdParsed.data,
        organizationId,
        fromDate,
        toDate
      );
      return res.json(result);
    } catch (err: any) {
      console.error(
        '[AnA citations project-diff] failed:',
        err?.message || err
      );
      return res.status(500).json({
        error: 'Failed to diff project',
        code: 'PROJECT_DIFF_ERROR',
      });
    }
  }
);

router.get(
  '/citations/runs/:runId/diff',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const fromRunId = String(req.params.runId || '');
    const toRunId = String(req.query.against || '');
    if (!/^[0-9a-f-]{36}$/i.test(fromRunId) || !/^[0-9a-f-]{36}$/i.test(toRunId)) {
      return res.status(400).json({
        error: 'runId and ?against must both be uuids',
        code: 'INVALID_REQUEST',
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { diffCitationRuns } = await import(
        '../services/ana/citation-engine'
      );
      const result = await diffCitationRuns(fromRunId, toRunId, organizationId);
      if (!result) {
        return res.status(404).json({
          error: 'One or both runs not found, or runs are for different artifacts',
          code: 'CITATION_RUN_DIFF_NOT_FOUND',
        });
      }
      return res.json(result);
    } catch (err: any) {
      console.error(
        '[AnA citations diff] failed:',
        err?.message || err
      );
      return res
        .status(500)
        .json({ error: 'Failed to diff runs', code: 'CITATION_DIFF_ERROR' });
    }
  }
);

router.get(
  '/citations/projects/:projectId/readiness-impact',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const parsed = projectIdParam.safeParse(req.params.projectId);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'projectId must be a positive integer',
        code: 'INVALID_REQUEST',
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { getCitationReadinessImpact } = await import(
        '../services/ana/citation-readiness-bridge'
      );
      const result = await getCitationReadinessImpact(parsed.data, organizationId);
      return res.json(result);
    } catch (err: any) {
      console.error(
        '[AnA citations readiness-impact] failed:',
        err?.message || err
      );
      return res.status(500).json({
        error: 'Failed to derive readiness impact',
        code: 'READINESS_IMPACT_ERROR',
      });
    }
  }
);

router.get(
  '/citations/:artifactId/gaps',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const artifactId = String(req.params.artifactId || '');
    if (!artifactId || artifactId.length > 128) {
      return res
        .status(400)
        .json({ error: 'artifactId is required (max 128 chars)', code: 'INVALID_REQUEST' });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { getGapsForArtifact } = await import(
        '../services/ana/citation-engine'
      );
      const result = await getGapsForArtifact(artifactId, organizationId);
      if (!result) {
        return res.status(404).json({
          error: 'Artifact not found',
          code: 'ARTIFACT_NOT_FOUND',
        });
      }
      return res.json(result);
    } catch (err: any) {
      console.error('[AnA citations gaps] failed:', err?.message || err);
      return res.status(500).json({
        error: 'Failed to load gaps',
        code: 'CITATIONS_GAPS_ERROR',
      });
    }
  }
);

// ── Proposal management endpoints ──────────────────────────────────────
//
// Read-only views into ana_submission_chat_proposals + a janitor sweep.
// Tenant-scoped via requireOrganizationContext; the service layer
// double-checks organization_id on every row.

const listProposalsQuerySchema = z.object({
  threadId: z.string().max(128).optional(),
  artifactId: z.string().max(128).optional(),
  status: z
    .enum(['pending', 'applied', 'superseded', 'expired'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

router.get(
  '/submission-chat/proposals',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const parsed = listProposalsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid query',
        code: 'INVALID_REQUEST',
        details: parsed.error.flatten(),
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { listProposals } = await import(
        '../services/ana/submission-chat-proposal-store'
      );
      const { rows, total } = await listProposals(organizationId, {
        threadId: parsed.data.threadId,
        artifactId: parsed.data.artifactId,
        status: parsed.data.status,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      });
      return res.json({ total, proposals: rows });
    } catch (err: any) {
      console.error(
        '[AnA submission-chat list-proposals] failed:',
        err?.message || err
      );
      return res
        .status(500)
        .json({ error: 'Failed to list proposals', code: 'LIST_PROPOSALS_ERROR' });
    }
  }
);

router.get(
  '/submission-chat/proposals/:proposalId',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const proposalId = String(req.params.proposalId || '');
    if (!/^[0-9a-f-]{36}$/i.test(proposalId)) {
      return res.status(400).json({
        error: 'proposalId must be a uuid',
        code: 'INVALID_REQUEST',
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { getProposalWithLinkage } = await import(
        '../services/ana/submission-chat-proposal-store'
      );
      const linkage = await getProposalWithLinkage(proposalId, organizationId);
      if (!linkage) {
        return res
          .status(404)
          .json({ error: 'Proposal not found', code: 'PROPOSAL_NOT_FOUND' });
      }
      return res.json(linkage);
    } catch (err: any) {
      console.error(
        '[AnA submission-chat get-proposal] failed:',
        err?.message || err
      );
      return res.status(500).json({
        error: 'Failed to load proposal',
        code: 'GET_PROPOSAL_ERROR',
      });
    }
  }
);

// Janitor sweep — marks past-TTL pending proposals as expired. Scoped to the
// caller's org. Idempotent + safe to call repeatedly. Tighter rate limit
// because it's normally invoked by a scheduled task, not a user.
const sweepProposalsRateLimiter = createRateLimiter({
  api: {
    windowMs: 60 * 1000,
    maxRequests: 4,
    message: 'Too many sweep requests, please slow down.',
  },
});

router.post(
  '/submission-chat/proposals/sweep',
  authenticateToken,
  requireOrganizationContext,
  sweepProposalsRateLimiter,
  async (req: Request, res: Response) => {
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { sweepExpiredProposals } = await import(
        '../services/ana/submission-chat-proposal-store'
      );
      const result = await sweepExpiredProposals({ organizationId });
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error(
        '[AnA submission-chat sweep] failed:',
        err?.message || err
      );
      return res
        .status(500)
        .json({ error: 'Sweep failed', code: 'SWEEP_PROPOSALS_ERROR' });
    }
  }
);

router.get(
  '/submission-chat/threads/:threadId/timeline',
  authenticateToken,
  requireOrganizationContext,
  async (req: Request, res: Response) => {
    const threadId = String(req.params.threadId || '');
    if (!threadId || threadId.length > 128) {
      return res.status(400).json({
        error: 'threadId is required',
        code: 'INVALID_REQUEST',
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    if (!organizationId) {
      return res
        .status(401)
        .json({ error: 'Authenticated tenant required', code: 'AUTH_REQUIRED' });
    }
    try {
      const { getThreadTimeline } = await import(
        '../services/ana/submission-chat-timeline'
      );
      const result = await getThreadTimeline(threadId, organizationId);
      return res.json(result);
    } catch (err: any) {
      console.error(
        '[AnA submission-chat thread-timeline] failed:',
        err?.message || err
      );
      return res.status(500).json({
        error: 'Failed to load thread timeline',
        code: 'TIMELINE_ERROR',
      });
    }
  }
);

// Streaming variant — same retrieval/scope/verification pipeline as the
// one-shot route, but the LLM call streams tagged-output sections as SSE
// events so a chat UI can render answer + rewrite progressively.
router.post(
  '/submission-chat/stream',
  authenticateToken,
  requireOrganizationContext,
  submissionChatRateLimiter,
  async (req: Request, res: Response) => {
    const parsed = submissionChatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        code: 'INVALID_REQUEST',
        details: parsed.error.flatten(),
      });
    }
    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    const organizationUuid =
      (req as any).tenantContext?.organizationUuid ||
      (req.headers['x-org-uuid'] as string | undefined);
    const userId = (req as any).userId || (req as any).user?.id;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let clientClosed = false;
    req.on('close', () => {
      clientClosed = true;
    });

    const writeEvent = (event: any) => {
      if (clientClosed) return;
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        clientClosed = true;
      }
    };

    try {
      const { handleSubmissionChatStream } = await import(
        '../services/ana/submission-chat-stream-handler'
      );
      await handleSubmissionChatStream(
        {
          threadId: parsed.data.threadId,
          artifactId: parsed.data.artifactId,
          question: parsed.data.question,
          organizationId: organizationId ?? null,
          organizationUuid: organizationUuid ?? null,
          userId: userId ?? null,
        },
        writeEvent
      );
    } catch (err: any) {
      writeEvent({
        type: 'error',
        code: 'SUBMISSION_CHAT_STREAM_ERROR',
        message: err?.message || 'Streaming submission-chat failed',
      });
      console.error(
        '[AnA submission-chat stream] failed:',
        err?.message || err
      );
    } finally {
      if (!clientClosed) res.end();
    }
  }
);

router.post(
  '/submission-chat',
  authenticateToken,
  requireOrganizationContext,
  submissionChatRateLimiter,
  async (req: Request, res: Response) => {
    const parsed = submissionChatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        code: 'INVALID_REQUEST',
        details: parsed.error.flatten(),
      });
    }

    const organizationId =
      (req as any).tenantContext?.organizationId ||
      (req as any).tenantId ||
      (req as any).organizationId;
    const organizationUuid =
      (req as any).tenantContext?.organizationUuid ||
      (req.headers['x-org-uuid'] as string | undefined);
    const userId = (req as any).userId || (req as any).user?.id;

    try {
      const { handleSubmissionChat } = await import(
        '../services/ana/submission-chat-handler'
      );
      const result = await handleSubmissionChat({
        threadId: parsed.data.threadId,
        artifactId: parsed.data.artifactId,
        question: parsed.data.question,
        organizationId: organizationId ?? null,
        organizationUuid: organizationUuid ?? null,
        userId: userId ?? null,
      });
      return res.json(result);
    } catch (error: any) {
      const code = error?.code;
      if (code === 'ARTIFACT_NOT_FOUND') {
        return res.status(404).json({ error: error.message, code });
      }
      if (code === 'ARTIFACT_ORG_MISMATCH') {
        return res.status(403).json({ error: error.message, code });
      }
      if (code === 'INVALID_REQUEST') {
        return res.status(400).json({ error: error.message, code });
      }
      if (code === 'AI_PROVIDER_UNAVAILABLE') {
        return res.status(503).json({ error: error.message, code });
      }
      console.error('[AnA submission-chat] failed:', error?.message || error);
      return res.status(500).json({
        error: 'Failed to process submission-chat request',
        code: 'SUBMISSION_CHAT_ERROR',
      });
    }
  }
);

export default router;
