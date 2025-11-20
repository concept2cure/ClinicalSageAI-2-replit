/**
 * @file device-data-center.js
 * @description API routes for Device Data Center - 510(k) file management with comprehensive tagging
 */

import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

const router = express.Router();

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file size
  }
});

// Middleware to get organizationId from headers
router.use((req, res, next) => {
  req.organizationId = parseInt(req.headers['x-organization-id']) || 7;
  next();
});

// GET /api/device-data-center/files - List all device files with filtering
router.get('/files', async (req, res) => {
  try {
    const { 
      category, 
      testStandard, 
      component, 
      tag, 
      search,
      deviceName,
      status,
      limit = 50,
      offset = 0 
    } = req.query;

    // Build dynamic query using drizzle sql template
    let conditions = [sql`organization_id = ${req.organizationId}`];
    
    if (category) {
      // Check both new categories[] array and old single category field for backward compatibility
      conditions.push(sql`(${category} = ANY(categories) OR category = ${category})`);
    }

    if (testStandard) {
      // Check both legacy test_standards array and new standard_ref JSONB
      conditions.push(sql`(
        ${testStandard} = ANY(test_standards) 
        OR standard_ref->>'code' ILIKE ${'%' + testStandard + '%'}
        OR standard_ref->>'family' = ${testStandard}
      )`);
    }

    if (component) {
      // Check both new components[] array and old device_components[] array
      conditions.push(sql`(${component} = ANY(components) OR ${component} = ANY(device_components))`);
    }

    if (tag) {
      conditions.push(sql`${tag} = ANY(tags)`);
    }

    if (deviceName) {
      conditions.push(sql`device_name ILIKE ${'%' + deviceName + '%'}`);
    }

    if (status) {
      conditions.push(sql`regulatory_status = ${status}`);
    }

    if (search) {
      const searchPattern = '%' + search + '%';
      conditions.push(sql`(
        file_name ILIKE ${searchPattern} 
        OR searchable_content ILIKE ${searchPattern}
        OR device_name ILIKE ${searchPattern}
        OR test_lab_name ILIKE ${searchPattern}
        OR comments ILIKE ${searchPattern}
      )`);
    }

    // Combine conditions
    const whereClause = conditions.length > 0 
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    // Execute main query
    const result = await db.execute(sql`
      SELECT * FROM device_data_center 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT ${parseInt(limit)} 
      OFFSET ${parseInt(offset)}
    `);
    
    // Get total count
    const countResult = await db.execute(sql`
      SELECT COUNT(*) as total FROM device_data_center 
      ${whereClause}
    `);

    // postgres-js returns the rows directly
    const files = Array.isArray(result) ? result : result.rows || [];
    const countRows = Array.isArray(countResult) ? countResult : countResult.rows || [];

    res.json({
      success: true,
      files: files,
      total: parseInt(countRows[0]?.total || 0),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('[Device Data Center] Error listing files:', error);
    res.status(500).json({ error: 'Failed to list device files' });
  }
});

// GET /api/device-data-center/categories - Get all categories (hierarchical)
router.get('/categories', async (req, res) => {
  try {
    console.log('[Device Data Center] Getting categories...');
    const result = await db.execute(
      sql`SELECT id, category_code, category_name, description, parent_category, parent_id, level, synonyms, required_for_510k, display_order, icon, color 
          FROM device_data_categories 
          ORDER BY display_order, category_name`
    );
    
    // postgres-js returns the rows directly
    const categories = Array.isArray(result) ? result : result.rows || [];
    
    // Build hierarchical tree structure
    const buildTree = (items, parentId = null) => {
      return items
        .filter(item => (parentId === null ? item.level === 0 : item.parent_id === parentId))
        .map(item => ({
          ...item,
          children: buildTree(items, item.id)
        }));
    };
    
    const hierarchicalCategories = buildTree(categories);
    
    console.log('[Device Data Center] Categories query result:', {
      rowCount: categories.length,
      topLevelCount: hierarchicalCategories.length,
      hasRows: categories.length > 0
    });
    
    res.json({
      success: true,
      categories: categories, // Return flat list for backward compatibility
      hierarchicalCategories: hierarchicalCategories // Return hierarchical tree
    });
  } catch (error) {
    console.error('[Device Data Center] Error getting categories:', error);
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

// GET /api/device-data-center/standards - Get all test standards (normalized)
router.get('/standards', async (req, res) => {
  try {
    const result = await db.execute(
      sql`SELECT id, standard_code, standard_name, standard_body, family, version, edition_year, clause, region, description, applicable_categories, required_tests, effective_date, superseded_by 
          FROM device_test_standards 
          ORDER BY family, edition_year DESC, standard_code`
    );
    
    // postgres-js returns the rows directly
    const standards = Array.isArray(result) ? result : result.rows || [];
    
    // Group by family for easier UI display
    const groupedByFamily = standards.reduce((acc, std) => {
      const family = std.family || 'Other';
      if (!acc[family]) acc[family] = [];
      acc[family].push(std);
      return acc;
    }, {});
    
    res.json({
      success: true,
      standards: standards, // Flat list
      groupedByFamily: groupedByFamily // Grouped for UI convenience
    });
  } catch (error) {
    console.error('[Device Data Center] Error getting standards:', error);
    res.status(500).json({ error: 'Failed to get test standards' });
  }
});

// GET /api/device-data-center/components - Get all components for organization (hierarchical)
router.get('/components', async (req, res) => {
  try {
    const result = await db.execute(
      sql`SELECT id, organization_id, component_code, component_name, component_type, parent_id, level, bom_ref, manufacturer, part_number, version, specifications, test_requirements, related_standards, status 
          FROM device_components 
          WHERE organization_id = ${req.organizationId} 
          ORDER BY level, component_name`
    );
    
    // postgres-js returns the rows directly
    const components = Array.isArray(result) ? result : result.rows || [];
    
    // Build hierarchical tree structure
    const buildTree = (items, parentId = null) => {
      return items
        .filter(item => (parentId === null ? item.level === 0 : item.parent_id === parentId))
        .map(item => ({
          ...item,
          children: buildTree(items, item.id)
        }));
    };
    
    const hierarchicalComponents = buildTree(components);
    
    res.json({
      success: true,
      components: components, // Flat list for backward compatibility
      hierarchicalComponents: hierarchicalComponents // Hierarchical tree
    });
  } catch (error) {
    console.error('[Device Data Center] Error getting components:', error);
    res.status(500).json({ error: 'Failed to get device components' });
  }
});

// POST /api/device-data-center/upload - Upload a new device file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const {
      category,
      subcategory,
      deviceName,
      deviceModel,
      deviceIdentifier,
      testStandards,
      testType,
      testDate,
      testLabName,
      testLabCertification,
      deviceComponents,
      componentVersion,
      tags,
      comments,
      predicateDevice
    } = req.body;

    // Calculate file checksum
    const checksum = crypto
      .createHash('sha256')
      .update(req.file.buffer)
      .digest('hex');

    // Store file (in production, upload to cloud storage)
    const storageUrl = `/uploads/device-data/${req.organizationId}/${Date.now()}-${req.file.originalname}`;

    // Parse arrays from form data - ensure proper PostgreSQL array format
    const parseArray = (value) => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return value.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      return [];
    };

    const testStandardsArray = parseArray(testStandards);
    const deviceComponentsArray = parseArray(deviceComponents);
    const tagsArray = parseArray(tags);

    // Insert file metadata into database
    const result = await db.execute(sql`
      INSERT INTO device_data_center (
        organization_id, file_name, file_type, file_size, storage_url, checksum,
        device_name, device_model, device_identifier, category, subcategory,
        test_standards, test_type, test_date, test_lab_name, test_lab_certification,
        device_components, component_version, tags, comments, predicate_device,
        regulatory_status, uploaded_by, searchable_content
      ) VALUES (
        ${req.organizationId},
        ${req.file.originalname},
        ${req.file.mimetype},
        ${req.file.size},
        ${storageUrl},
        ${checksum},
        ${deviceName || null},
        ${deviceModel || null},
        ${deviceIdentifier || null},
        ${category},
        ${subcategory || null},
        ARRAY[${sql.join(testStandardsArray.map(s => sql`${s}`), sql`, `)}]::text[],
        ${testType || null},
        ${testDate || null},
        ${testLabName || null},
        ${testLabCertification || null},
        ARRAY[${sql.join(deviceComponentsArray.map(c => sql`${c}`), sql`, `)}]::text[],
        ${componentVersion || null},
        ARRAY[${sql.join(tagsArray.map(t => sql`${t}`), sql`, `)}]::text[],
        ${comments || null},
        ${predicateDevice || null},
        'draft',
        'user@example.com',
        ${`${req.file.originalname} ${deviceName || ''} ${category} ${comments || ''}`}
      ) RETURNING *
    `);

    const fileRecord = Array.isArray(result) ? result[0] : result.rows[0];
    
    res.json({
      success: true,
      file: fileRecord,
      fileId: fileRecord.id, // Add fileId for AI tagging
      message: 'Device file uploaded successfully'
    });
  } catch (error) {
    console.error('[Device Data Center] Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload device file' });
  }
});

// PATCH /api/device-data-center/file/:id - Update file metadata
router.patch('/file/:id', async (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const updates = req.body;
    
    // Build dynamic update query
    const updateFields = [];
    const values = [];
    let valueIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'organization_id') {
        updateFields.push(`${key} = $${valueIndex}`);
        values.push(value);
        valueIndex++;
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid update fields provided' });
    }

    // Add updated_at
    updateFields.push(`updated_at = NOW()`);
    
    values.push(fileId);
    values.push(req.organizationId);

    const query = `
      UPDATE device_data_center 
      SET ${updateFields.join(', ')}
      WHERE id = $${valueIndex} AND organization_id = $${valueIndex + 1}
      RETURNING *
    `;

    const result = await db.execute(sql.raw(query, values));

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({
      success: true,
      file: result.rows[0],
      message: 'File metadata updated successfully'
    });
  } catch (error) {
    console.error('[Device Data Center] Error updating file:', error);
    res.status(500).json({ error: 'Failed to update file metadata' });
  }
});

// POST /api/device-data-center/tag/:id - Add tags to a file
router.post('/tag/:id', async (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const { tags } = req.body;

    if (!tags || !Array.isArray(tags)) {
      return res.status(400).json({ error: 'Tags must be an array' });
    }

    const result = await db.execute(sql`
      UPDATE device_data_center 
      SET tags = array_cat(tags, ${tags}::text[]),
          updated_at = NOW()
      WHERE id = ${fileId} AND organization_id = ${req.organizationId}
      RETURNING *
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({
      success: true,
      file: result.rows[0],
      message: 'Tags added successfully'
    });
  } catch (error) {
    console.error('[Device Data Center] Error adding tags:', error);
    res.status(500).json({ error: 'Failed to add tags' });
  }
});

// GET /api/device-data-center/search/deep - Deep search across all metadata
router.get('/search/deep', async (req, res) => {
  try {
    const { query: searchQuery } = req.query;

    if (!searchQuery) {
      return res.status(400).json({ error: 'Search query required' });
    }

    // Perform deep search across all text fields and arrays
    const result = await db.execute(sql`
      SELECT * FROM device_data_center 
      WHERE organization_id = ${req.organizationId}
      AND (
        file_name ILIKE ${'%' + searchQuery + '%'}
        OR device_name ILIKE ${'%' + searchQuery + '%'}
        OR device_model ILIKE ${'%' + searchQuery + '%'}
        OR category ILIKE ${'%' + searchQuery + '%'}
        OR subcategory ILIKE ${'%' + searchQuery + '%'}
        OR test_type ILIKE ${'%' + searchQuery + '%'}
        OR test_lab_name ILIKE ${'%' + searchQuery + '%'}
        OR comments ILIKE ${'%' + searchQuery + '%'}
        OR searchable_content ILIKE ${'%' + searchQuery + '%'}
        OR EXISTS (
          SELECT 1 FROM unnest(tags) AS tag 
          WHERE tag ILIKE ${'%' + searchQuery + '%'}
        )
        OR EXISTS (
          SELECT 1 FROM unnest(test_standards) AS std 
          WHERE std ILIKE ${'%' + searchQuery + '%'}
        )
        OR EXISTS (
          SELECT 1 FROM unnest(device_components) AS comp 
          WHERE comp ILIKE ${'%' + searchQuery + '%'}
        )
      )
      ORDER BY created_at DESC
      LIMIT 100
    `);

    // postgres-js returns the rows directly
    const searchResults = Array.isArray(result) ? result : result.rows || [];
    
    res.json({
      success: true,
      files: searchResults,
      query: searchQuery,
      count: searchResults.length
    });
  } catch (error) {
    console.error('[Device Data Center] Error in deep search:', error);
    res.status(500).json({ error: 'Failed to perform deep search' });
  }
});

// GET /api/device-data-center/stats - Get statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await db.execute(sql`
      SELECT 
        COUNT(*) as total_files,
        COUNT(DISTINCT device_name) as unique_devices,
        COUNT(DISTINCT category) as categories_used,
        COUNT(CASE WHEN regulatory_status = 'approved' THEN 1 END) as approved_files,
        COUNT(CASE WHEN regulatory_status = 'draft' THEN 1 END) as draft_files,
        COUNT(CASE WHEN regulatory_status = 'under_review' THEN 1 END) as under_review
      FROM device_data_center 
      WHERE organization_id = ${req.organizationId}
    `);

    const categoryStats = await db.execute(sql`
      SELECT category, COUNT(*) as count 
      FROM device_data_center 
      WHERE organization_id = ${req.organizationId}
      GROUP BY category
      ORDER BY count DESC
    `);

    // postgres-js returns the rows directly
    const statsRows = Array.isArray(stats) ? stats : stats.rows || [];
    const categoryRows = Array.isArray(categoryStats) ? categoryStats : categoryStats.rows || [];

    // Provide default stats if no data exists
    const defaultStats = {
      total_files: 0,
      unique_devices: 0,
      categories_used: 0,
      approved_files: 0,
      draft_files: 0,
      under_review: 0
    };

    res.json({
      success: true,
      stats: statsRows[0] || defaultStats,
      categoryBreakdown: categoryRows
    });
  } catch (error) {
    console.error('[Device Data Center] Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// DELETE /api/device-data-center/file/:id - Delete a file
router.delete('/file/:id', async (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    
    const result = await db.execute(sql`
      DELETE FROM device_data_center 
      WHERE id = ${fileId} AND organization_id = ${req.organizationId}
      RETURNING file_name
    `);

    // postgres-js returns the rows directly
    const deletedRows = Array.isArray(result) ? result : result.rows || [];

    if (deletedRows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({
      success: true,
      message: `File "${deletedRows[0].file_name}" deleted successfully`
    });
  } catch (error) {
    console.error('[Device Data Center] Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// PATCH /api/device-data-center/files/:id/tags - Update file tags
router.patch('/files/:id/tags', async (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const { tags } = req.body;
    
    // Validate tags is an array of strings
    if (!Array.isArray(tags)) {
      return res.status(400).json({ error: 'Tags must be an array' });
    }
    
    if (!tags.every(tag => typeof tag === 'string')) {
      return res.status(400).json({ error: 'All tags must be strings' });
    }
    
    const result = await db.execute(sql`
      UPDATE device_data_center 
      SET 
        tags = ARRAY[${sql.join(tags.map(t => sql`${t}`), sql`, `)}]::text[],
        updated_at = NOW()
      WHERE id = ${fileId}
        AND organization_id = ${req.organizationId}
      RETURNING *
    `);
    
    const rows = Array.isArray(result) ? result : result.rows || [];
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.json({
      success: true,
      file: rows[0]
    });
  } catch (error) {
    console.error('[Device Data Center] Error updating tags:', error);
    res.status(500).json({ error: 'Failed to update file tags' });
  }
});

// PATCH /api/device-data-center/files/:id/complete-tags - Update complete hierarchical tag structure
router.patch('/files/:id/complete-tags', async (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const { categories, components, standard_ref, metadata, tags } = req.body;
    
    console.log('[Device Data Center] Saving complete tags:', { fileId, categories, components, standard_ref, metadata });
    
    // Validate required fields
    if (!Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ error: 'At least one category is required' });
    }
    
    // Build SQL for arrays - handle empty arrays properly
    const categoriesArray = categories.length > 0 
      ? sql`ARRAY[${sql.join(categories.map(c => sql`${c}`), sql`, `)}]::text[]`
      : sql`'{}'::text[]`;
      
    const componentsArray = components && components.length > 0
      ? sql`ARRAY[${sql.join(components.map(c => sql`${c}`), sql`, `)}]::text[]`
      : sql`'{}'::text[]`;
      
    const tagsArray = tags && tags.length > 0
      ? sql`ARRAY[${sql.join(tags.map(t => sql`${t}`), sql`, `)}]::text[]`
      : sql`'{}'::text[]`;
    
    // Update with new hierarchical structure
    const result = await db.execute(sql`
      UPDATE device_data_center 
      SET 
        categories = ${categoriesArray},
        components = ${componentsArray},
        standard_ref = ${JSON.stringify(standard_ref || {})}::jsonb,
        metadata = ${JSON.stringify(metadata || {})}::jsonb,
        tags = ${tagsArray},
        updated_at = NOW()
      WHERE id = ${fileId}
        AND organization_id = ${req.organizationId}
      RETURNING *
    `);
    
    const rows = Array.isArray(result) ? result : result.rows || [];
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    console.log('[Device Data Center] Successfully saved complete tags for file:', fileId);
    
    res.json({
      success: true,
      file: rows[0]
    });
  } catch (error) {
    console.error('[Device Data Center] Error saving complete tags:', error);
    res.status(500).json({ error: 'Failed to save complete tag data', details: error.message });
  }
});

export default router;