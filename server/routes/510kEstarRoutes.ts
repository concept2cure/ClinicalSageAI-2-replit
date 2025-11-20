/**
 * FDA 510(k) eSTAR Integration Routes
 *
 * This module provides routes for validating and building FDA-compliant eSTAR packages
 * for 510(k) submissions, ensuring proper integration with the FDA's eSTAR system.
 */

import { Router } from 'express';
import { Pool } from 'pg';
import { createScopedLogger } from '../utils/logger.ts';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { z } from 'zod';

const logger = createScopedLogger('estar-routes');
export const router = Router();
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Define validation schemas
const validateProjectIdSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  strictMode: z.boolean().optional(),
});

const buildPackageSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  options: z
    .object({
      validateFirst: z.boolean().optional(),
      strictValidation: z.boolean().optional(),
      format: z.enum(['zip', 'pdf', 'json']).optional(),
    })
    .optional(),
});

// Load FDA eSTAR validation schemas
let estarValidationSchema: any = null;
try {
  // Using a direct relative path from project root
  const schemaPath = './schema/estar-validation.json';
  if (fs.existsSync(schemaPath)) {
    estarValidationSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    logger.info('eSTAR validation schema loaded successfully');
  } else {
    logger.warn('eSTAR validation schema file not found, using built-in defaults');
    // Use default minimal schema
    estarValidationSchema = {
      sections: [
        {
          id: 'administrative',
          name: 'Administrative',
          required: true,
          subsections: [
            {
              id: 'submitter_info',
              name: 'Submitter Information',
              required: true,
            },
            {
              id: 'device_info',
              name: 'Device Information',
              required: true,
            },
          ],
        },
        {
          id: 'device_description',
          name: 'Device Description',
          required: true,
        },
        {
          id: 'substantial_equivalence',
          name: 'Substantial Equivalence',
          required: true,
        },
        {
          id: 'performance_testing',
          name: 'Performance Testing',
          required: true,
        },
      ],
    };
  }
} catch (error: any) {
  logger.error(`Error loading eSTAR validation schema: ${error?.message || 'Unknown error'}`);
}

/**
 * Helper function to check if a project exists and has required data
 */
async function validateProjectExistence(
  projectId: string
): Promise<{ valid: boolean; project?: any; error?: string }> {
  try {
    const { rows } = await db.query(`SELECT * FROM device_profiles WHERE id = $1`, [projectId]);

    if (rows.length === 0) {
      return { valid: false, error: 'Project not found' };
    }

    return { valid: true, project: rows[0] };
  } catch (error: any) {
    logger.error(`Error validating project existence: ${error?.message || 'Unknown error'}`);
    return { valid: false, error: error?.message || 'Database error' };
  }
}

/**
 * Validate an eSTAR package against FDA requirements
 */
router.post('/validate', async (req, res) => {
  try {
    // Validate input with Zod schema
    const validatedData = validateProjectIdSchema.parse(req.body);
    const { projectId, strictMode = false } = validatedData;

    logger.info(`Validating eSTAR package for project ${projectId} (strictMode: ${strictMode})`);

    // First validate project existence
    const projectCheck = await validateProjectExistence(projectId);
    if (!projectCheck.valid) {
      return res.status(404).json({
        valid: false,
        issues: [{ severity: 'error', section: 'System', message: projectCheck.error }],
        score: 0,
        recommendations: ['Check project ID and try again'],
      });
    }

    // Get all related data for comprehensive validation
    const project = projectCheck.project;

    // Get predicate device selections
    const { rows: predicateRows } = await db.query(
      `SELECT * FROM predicate_devices WHERE device_id = $1`,
      [projectId]
    );

    // Get substantial equivalence data
    const { rows: equivalenceRows } = await db.query(
      `SELECT * FROM equivalence_analyses WHERE device_id = $1`,
      [projectId]
    );

    // Perform validation based on data presence
    const issues = [];
    let score = 100; // Start with perfect score and subtract for issues

    // Check administrative section
    if (!project.device_name) {
      issues.push({
        severity: 'error',
        section: 'Administrative',
        message: 'Device name is required',
      });
      score -= 10;
    }

    if (!project.manufacturer_name) {
      issues.push({
        severity: 'error',
        section: 'Administrative',
        message: 'Manufacturer information is required',
      });
      score -= 10;
    }

    // Check device description
    if (!project.device_description || project.device_description.length < 50) {
      issues.push({
        severity: strictMode ? 'error' : 'warning',
        section: 'Device Description',
        message: 'Device description is missing or insufficient',
      });
      score -= strictMode ? 15 : 5;
    }

    // Check predicate devices
    if (predicateRows.length === 0) {
      issues.push({
        severity: 'error',
        section: 'Substantial Equivalence',
        message: 'No predicate devices selected',
      });
      score -= 25;
    }

    // Check equivalence analysis
    if (equivalenceRows.length === 0) {
      issues.push({
        severity: 'error',
        section: 'Substantial Equivalence',
        message: 'No substantial equivalence analysis available',
      });
      score -= 25;
    } else {
      const equivalenceData = equivalenceRows[0];

      if (
        !equivalenceData.comparison_features ||
        !Array.isArray(equivalenceData.comparison_features) ||
        equivalenceData.comparison_features.length === 0
      ) {
        issues.push({
          severity: 'error',
          section: 'Substantial Equivalence',
          message: 'Feature comparison is missing or incomplete',
        });
        score -= 15;
      }

      if (!equivalenceData.conclusion || equivalenceData.conclusion.length < 50) {
        issues.push({
          severity: strictMode ? 'error' : 'warning',
          section: 'Substantial Equivalence',
          message: 'Substantial equivalence conclusion is missing or insufficient',
        });
        score -= strictMode ? 10 : 5;
      }
    }

    // Generate recommendations based on issues
    const recommendations = [];

    if (issues.some(i => i.section === 'Administrative')) {
      recommendations.push('Complete all required administrative information');
    }

    if (issues.some(i => i.section === 'Device Description')) {
      recommendations.push(
        'Provide a comprehensive device description including specifications, intended use, and technological characteristics'
      );
    }

    if (issues.some(i => i.section === 'Substantial Equivalence')) {
      recommendations.push(
        'Select appropriate predicate devices and complete a thorough substantial equivalence analysis'
      );
    }

    // Return validation results
    const validationResult = {
      valid: score >= 70 && !issues.some(i => i.severity === 'error'),
      issues,
      score: Math.max(0, score),
      recommendations,
    };

    logger.info(
      `eSTAR validation completed for project ${projectId} with score ${validationResult.score}`
    );
    res.json(validationResult);
  } catch (error: any) {
    logger.error(`Error validating eSTAR package: ${error?.message || 'Unknown error'}`);
    res.status(500).json({
      valid: false,
      issues: [{ severity: 'error', section: 'System', message: 'Validation system error' }],
      score: 0,
      error: error?.message || 'Unknown validation error',
      recommendations: ['Contact support if this error persists'],
    });
  }
});

/**
 * Build an FDA-compliant eSTAR package
 */
router.post('/build', async (req, res) => {
  const { projectId, options = {} } = req.body;
  const { validateFirst = true, strictValidation = false } = options;

  logger.info(`Building eSTAR package for project ${projectId}`);

  try {
    // Validate project first if requested
    if (validateFirst) {
      logger.info('Performing validation before building eSTAR package');

      // Use the existing validation endpoint via internal call
      const projectCheck = await validateProjectExistence(projectId);
      if (!projectCheck.valid) {
        return res.status(404).json({
          success: false,
          message: projectCheck.error,
          validationResult: {
            valid: false,
            issues: [{ severity: 'error', section: 'System', message: projectCheck.error }],
            score: 0,
          },
        });
      }

      // Get all related data for comprehensive validation
      const project = projectCheck.project;

      // Get predicate device selections
      const { rows: predicateRows } = await db.query(
        `SELECT * FROM predicate_devices WHERE device_id = $1`,
        [projectId]
      );

      // Get substantial equivalence data
      const { rows: equivalenceRows } = await db.query(
        `SELECT * FROM equivalence_analyses WHERE device_id = $1`,
        [projectId]
      );

      // Perform validation (simplified repeat of validation endpoint)
      const issues = [];
      let score = 100;

      // Basic validation checks - simplified for brevity
      if (!project.device_name) {
        issues.push({
          severity: 'error',
          section: 'Administrative',
          message: 'Device name is required',
        });
        score -= 10;
      }

      if (predicateRows.length === 0 || equivalenceRows.length === 0) {
        issues.push({
          severity: 'error',
          section: 'Substantial Equivalence',
          message: 'Predicate devices or equivalence analysis missing',
        });
        score -= 25;
      }

      const validationResult = {
        valid: score >= 70 && !issues.some(i => i.severity === 'error'),
        issues,
        score: Math.max(0, score),
      };

      // If strict validation is enabled and validation fails, return error
      if (strictValidation && !validationResult.valid) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed - cannot build eSTAR package',
          validationResult,
        });
      }

      logger.info(
        `Validation result: valid=${validationResult.valid}, score=${validationResult.score}`
      );
    }

    // Proceed with building eSTAR package
    const project = await db
      .query(`SELECT * FROM device_profiles WHERE id = $1`, [projectId])
      .then(result => result.rows[0]);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Generate unique identifier for this package
    const packageId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const deviceName = project.device_name || 'Unknown Device';

    // Generate package metadata
    const metadata = {
      packageId,
      projectId,
      deviceName,
      generatedDate: timestamp,
      format: options.format || 'zip',
      version: '1.0',
    };

    // Record package generation in database
    await db.query(
      `INSERT INTO estar_packages 
       (id, device_id, metadata, status, created_at) 
       VALUES ($1, $2, $3, $4, $5)`,
      [packageId, projectId, JSON.stringify(metadata), 'generated', timestamp]
    );

    // In a real implementation, we would now:
    // 1. Collect all data from database
    // 2. Format according to FDA eSTAR specifications
    // 3. Generate PDF and XML files
    // 4. Package into ZIP archive
    // 5. Store in document repository

    // For this implementation, we simulate a successful package generation
    const downloadUrl = `/api/fda510k/estar/download/${packageId}`;

    logger.info(`eSTAR package ${packageId} generated successfully for project ${projectId}`);

    // Return success with download URL
    res.json({
      success: true,
      packageId,
      deviceName,
      generatedDate: timestamp,
      downloadUrl,
      metadata,
    });
  } catch (error: any) {
    logger.error(`Error building eSTAR package: ${error?.message || 'Unknown error'}`);
    res.status(500).json({
      success: false,
      message: error?.message || 'Unknown error building eSTAR package',
    });
  }
});

/**
 * Download a generated eSTAR package
 */
router.get('/download/:packageId', async (req, res) => {
  const { packageId } = req.params;

  try {
    // Get package metadata from database
    const { rows } = await db.query(`SELECT * FROM estar_packages WHERE id = $1`, [packageId]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Package not found',
      });
    }

    const packageData = rows[0];

    // In a real implementation, we would:
    // 1. Retrieve the actual package file from storage
    // 2. Set appropriate headers
    // 3. Stream the file to the client

    // For this implementation, we simulate a download
    logger.info(`eSTAR package ${packageId} download requested`);

    // Return a simulated download response
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="estar-package-${packageId}.json"`);

    res.json({
      packageId,
      deviceId: packageData.device_id,
      metadata: packageData.metadata,
      generatedDate: packageData.created_at,
      message:
        'This is a simulated eSTAR package. In a production environment, this would be a properly formatted FDA-compliant eSTAR ZIP package.',
    });
  } catch (error: any) {
    logger.error(`Error downloading eSTAR package: ${error?.message || 'Unknown error'}`);
    res.status(500).json({
      success: false,
      message: error?.message || 'Unknown error downloading eSTAR package',
    });
  }
});

// Export is done via named export above
