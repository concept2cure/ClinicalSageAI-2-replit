/**
 * Phase 6 API Routes - eCTD Co-Author + Document Drafting
 * 
 * Integration routes for Phase 6 services:
 * - ArtifactSkeletonGenerator
 * - ECTDScaffoldingService
 * - ReleaseHashGenerator
 * - MultiAgentCouncilService (already complete)
 * 
 * All endpoints include audit logging and error handling
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../../lib/logger';
import { 
  artifactSkeletonGenerator,
  ectdScaffoldingService,
  releaseHashGenerator,
} from '../services';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// ARTIFACT SKELETON GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/phase6/artifacts/skeleton
 * Generate artifact skeleton for regulatory document
 */
const skeletonSchema = z.object({
  documentType: z.enum([
    'CLINICAL_OVERVIEW',
    'CLINICAL_SUMMARY',
    'DEVICE_DESCRIPTION',
    'PREDICATE_COMPARISON',
    'BIOCOMPATIBILITY',
    'STERILIZATION',
    'SOFTWARE_DOCUMENTATION',
    'RISK_ANALYSIS',
    'LABELING',
    'MANUFACTURING',
    'CMC_OVERVIEW',
    'PHARMACOLOGY',
    'TOXICOLOGY',
    'CLINICAL_PROTOCOL',
    'INVESTIGATOR_BROCHURE',
    'COVER_LETTER',
  ]),
  submissionType: z.enum(['510K', 'IND', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA']),
  projectId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  customSections: z.array(z.string()).optional(),
});

router.post('/artifacts/skeleton', async (req: Request, res: Response) => {
  try {
    const body = skeletonSchema.parse(req.body);

    const skeleton = await artifactSkeletonGenerator.generateSkeleton(
      body.documentType,
      body.submissionType,
      {
        projectId: body.projectId,
        organizationId: body.organizationId,
        userId: body.userId,
        customSections: body.customSections,
      }
    );

    res.json({
      success: true,
      skeleton,
    });
  } catch (error: any) {
    logger.error('Error generating artifact skeleton:', error);
    
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/phase6/artifacts/skeleton/validate
 * Validate artifact skeleton structure
 */
router.post('/artifacts/skeleton/validate', async (req: Request, res: Response) => {
  try {
    const { skeleton } = req.body;

    if (!skeleton) {
      return res.status(400).json({
        success: false,
        error: 'Skeleton is required',
      });
    }

    const validation = artifactSkeletonGenerator.validateSkeleton(skeleton);

    res.json({
      success: true,
      validation,
    });
  } catch (error: any) {
    logger.error('Error validating skeleton:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// eCTD SCAFFOLDING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/phase6/ectd/modules
 * Get eCTD module structure
 */
router.get('/ectd/modules', async (req: Request, res: Response) => {
  try {
    const agency = (req.query.agency as string) || 'FDA';
    const useCache = req.query.noCache !== 'true';

    if (!['FDA', 'EMA', 'PMDA'].includes(agency)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid agency. Must be FDA, EMA, or PMDA',
      });
    }

    const modules = await ectdScaffoldingService.getModuleStructure(
      agency as any,
      useCache
    );

    res.json({
      success: true,
      count: modules.length,
      agency,
      modules,
    });
  } catch (error: any) {
    logger.error('Error fetching module structure:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/phase6/ectd/modules/tree
 * Get eCTD module structure as nested tree
 */
router.get('/ectd/modules/tree', async (req: Request, res: Response) => {
  try {
    const agency = (req.query.agency as string) || 'FDA';
    const useCache = req.query.noCache !== 'true';

    if (!['FDA', 'EMA', 'PMDA'].includes(agency)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid agency. Must be FDA, EMA, or PMDA',
      });
    }

    const tree = await ectdScaffoldingService.getModuleTree(agency as any, useCache);

    res.json({
      success: true,
      count: tree.length,
      agency,
      tree,
    });
  } catch (error: any) {
    logger.error('Error building module tree:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/phase6/ectd/projects/:projectId/seed
 * Seed eCTD folder hierarchy for project
 */
const seedSchema = z.object({
  projectName: z.string().min(1),
  agency: z.enum(['FDA', 'EMA', 'PMDA']).default('FDA'),
  userId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
});

router.post('/ectd/projects/:projectId/seed', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const body = seedSchema.parse(req.body);

    const result = await ectdScaffoldingService.seedProjectHierarchy(
      projectId,
      body.projectName,
      body.agency,
      body.userId,
      body.organizationId
    );

    res.json(result);
  } catch (error: any) {
    logger.error('Error seeding project hierarchy:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/phase6/ectd/projects/:projectId/folders
 * Get folders for a project
 */
router.get('/ectd/projects/:projectId/folders', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const folders = await ectdScaffoldingService.getProjectFolders(projectId);

    res.json({
      success: true,
      count: folders.length,
      folders,
    });
  } catch (error: any) {
    logger.error('Error fetching project folders:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/phase6/ectd/projects/:projectId/folders/tree
 * Get folder hierarchy tree for a project
 */
router.get('/ectd/projects/:projectId/folders/tree', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const tree = await ectdScaffoldingService.getProjectFolderTree(projectId);

    res.json({
      success: true,
      tree,
    });
  } catch (error: any) {
    logger.error('Error fetching project folder tree:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PATCH /api/phase6/ectd/folders/:folderId/status
 * Update folder status
 */
const statusSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'complete', 'locked']),
  userId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
});

router.patch('/ectd/folders/:folderId/status', async (req: Request, res: Response) => {
  try {
    const { folderId } = req.params;
    const body = statusSchema.parse(req.body);

    await ectdScaffoldingService.updateFolderStatus(
      folderId,
      body.status,
      body.userId,
      body.organizationId
    );

    res.json({
      success: true,
      message: 'Folder status updated',
    });
  } catch (error: any) {
    logger.error('Error updating folder status:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RELEASE HASH GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/phase6/release/package
 * Generate release package with hashes
 */
const releasePackageSchema = z.object({
  filePaths: z.array(z.string()),
  releaseId: z.string().optional(),
  projectId: z.string().uuid().optional(),
  submissionType: z.string().optional(),
  version: z.string().optional(),
  algorithm: z.enum(['SHA-256', 'SHA-512', 'MD5']).default('SHA-256'),
  organizationId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  metadata: z.record(z.any()).optional(),
});

router.post('/release/package', async (req: Request, res: Response) => {
  try {
    const body = releasePackageSchema.parse(req.body);

    const releasePackage = await releaseHashGenerator.generateReleasePackage(
      body.filePaths,
      {
        releaseId: body.releaseId,
        projectId: body.projectId,
        submissionType: body.submissionType,
        version: body.version,
        algorithm: body.algorithm,
        organizationId: body.organizationId,
        userId: body.userId,
        metadata: body.metadata,
      }
    );

    res.json({
      success: true,
      releasePackage,
    });
  } catch (error: any) {
    logger.error('Error generating release package:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/phase6/release/verify
 * Verify release package integrity
 */
const verifyPackageSchema = z.object({
  releasePackage: z.object({
    manifest: z.any(),
    manifestHash: z.string(),
    verificationCode: z.string(),
  }),
  filePaths: z.array(z.string()),
});

router.post('/release/verify', async (req: Request, res: Response) => {
  try {
    const body = verifyPackageSchema.parse(req.body);

    const verification = await releaseHashGenerator.verifyReleasePackage(
      body.releasePackage,
      body.filePaths
    );

    res.json({
      success: true,
      verification,
    });
  } catch (error: any) {
    logger.error('Error verifying release package:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/phase6/release/ectd-hash
 * Generate eCTD package hash
 */
const ectdHashSchema = z.object({
  ectdRootPath: z.string(),
  includeIndex: z.boolean().default(false),
  algorithm: z.enum(['SHA-256', 'SHA-512', 'MD5']).default('SHA-256'),
});

router.post('/release/ectd-hash', async (req: Request, res: Response) => {
  try {
    const body = ectdHashSchema.parse(req.body);

    const result = await releaseHashGenerator.generateECTDPackageHash(
      body.ectdRootPath,
      {
        includeIndex: body.includeIndex,
        algorithm: body.algorithm,
      }
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    logger.error('Error generating eCTD package hash:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/phase6/release/hash-chain
 * Generate hash chain for audit trail
 */
const hashChainSchema = z.object({
  entries: z.array(z.object({ data: z.any() })),
  algorithm: z.enum(['SHA-256', 'SHA-512', 'MD5']).default('SHA-256'),
});

router.post('/release/hash-chain', async (req: Request, res: Response) => {
  try {
    const body = hashChainSchema.parse(req.body);

    const chain = releaseHashGenerator.generateHashChain(
      body.entries,
      { name: body.algorithm, cryptoName: body.algorithm.toLowerCase().replace('-', '') } as any
    );

    res.json({
      success: true,
      chain,
    });
  } catch (error: any) {
    logger.error('Error generating hash chain:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/phase6/release/verify-chain
 * Verify hash chain integrity
 */
const verifyChainSchema = z.object({
  chain: z.array(
    z.object({
      data: z.any(),
      hash: z.string(),
      prevHash: z.string().nullable(),
    })
  ),
  algorithm: z.enum(['SHA-256', 'SHA-512', 'MD5']).default('SHA-256'),
});

router.post('/release/verify-chain', async (req: Request, res: Response) => {
  try {
    const body = verifyChainSchema.parse(req.body);

    const verification = releaseHashGenerator.verifyHashChain(
      body.chain,
      { name: body.algorithm, cryptoName: body.algorithm.toLowerCase().replace('-', '') } as any
    );

    res.json({
      success: true,
      verification,
    });
  } catch (error: any) {
    logger.error('Error verifying hash chain:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/phase6/health
 * Health check for Phase 6 services
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      services: {
        artifactSkeletonGenerator: 'operational',
        ectdScaffoldingService: 'operational',
        releaseHashGenerator: 'operational',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
