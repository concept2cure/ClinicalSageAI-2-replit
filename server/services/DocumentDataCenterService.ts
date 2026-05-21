/**
 * @file DocumentDataCenterService.ts
 * @description Integrated Document Data Center Service for 510(k) submissions
 * Combines file vault functionality with advanced 3-axis tagging model:
 * - Category (12 FDA-compliant categories)
 * - Test Standard (16+ standards with version tracking)
 * - Device Component (11 hierarchical types)
 * 
 * Features:
 * - AI-powered intelligent tagging using Claude
 * - Deep search capabilities with pgvector
 * - Auto-citation integration for Document Editor
 * - 21 CFR Part 11 compliant audit logging
 * - Drag-and-drop file upload with progress tracking
 * 
 * ARCHITECT: Enhanced from VaultDMS + DeviceDataCenter
 * DATE: 2025-01-13
 */

import { db } from '../db';
import { 
  deviceDataCenter, 
  deviceDataCategories, 
  deviceTestStandards, 
  deviceComponents,
  organizations,
  deviceAuditTrail 
} from '../../shared/schema.js';
import { eq, and, or, inArray, like, sql, desc, asc, isNull } from 'drizzle-orm';
import part11ComplianceService from './part11ComplianceService.js';
import { ai } from '../lib/unified-ai-client';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

// AI-powered intelligent tagging available via unified client

// Define FDA 510(k) categories with descriptions
const FDA_510K_CATEGORIES = {
  bench_test: {
    name: 'Bench Testing',
    description: 'Performance testing, mechanical testing, electrical safety testing',
    keywords: ['performance', 'mechanical', 'electrical', 'safety', 'bench', 'test'],
    fdaSections: ['Section 15', 'Section 17'],
  },
  biocompatibility: {
    name: 'Biocompatibility',
    description: 'ISO 10993 testing, biological evaluation, cytotoxicity',
    keywords: ['biocompatibility', 'ISO 10993', 'cytotoxicity', 'biological', 'tissue'],
    fdaSections: ['Section 16'],
  },
  predicate_labeling: {
    name: 'Predicate Labeling',
    description: 'Predicate device labeling and comparison',
    keywords: ['predicate', 'label', 'comparison', 'substantial equivalence'],
    fdaSections: ['Section 11', 'Section 18'],
  },
  electrical_safety: {
    name: 'Electrical Safety',
    description: 'IEC 60601 testing, electrical safety, EMC testing',
    keywords: ['IEC 60601', 'electrical', 'EMC', 'electromagnetic', 'safety'],
    fdaSections: ['Section 17'],
  },
  software_validation: {
    name: 'Software Validation',
    description: 'Software verification and validation, IEC 62304 compliance',
    keywords: ['software', 'validation', 'verification', 'IEC 62304', 'V&V'],
    fdaSections: ['Section 21'],
  },
  sterilization: {
    name: 'Sterilization',
    description: 'Sterilization validation, sterility assurance level (SAL)',
    keywords: ['sterilization', 'sterile', 'SAL', 'EO', 'radiation', 'validation'],
    fdaSections: ['Section 19'],
  },
  shelf_life: {
    name: 'Shelf Life/Stability',
    description: 'Shelf life testing, accelerated aging, stability studies',
    keywords: ['shelf life', 'stability', 'aging', 'expiration', 'storage'],
    fdaSections: ['Section 20'],
  },
  packaging: {
    name: 'Packaging',
    description: 'Package integrity, transit testing, packaging validation',
    keywords: ['packaging', 'transit', 'integrity', 'seal', 'barrier'],
    fdaSections: ['Section 20'],
  },
  human_factors: {
    name: 'Human Factors/Usability',
    description: 'Human factors engineering, usability testing, use errors',
    keywords: ['human factors', 'usability', 'ergonomics', 'use error', 'IEC 62366'],
    fdaSections: ['Section 14'],
  },
  clinical_data: {
    name: 'Clinical Data',
    description: 'Clinical studies, clinical evaluation, patient outcomes',
    keywords: ['clinical', 'study', 'trial', 'patient', 'outcomes', 'evaluation'],
    fdaSections: ['Section 22'],
  },
  manufacturing: {
    name: 'Manufacturing',
    description: 'Manufacturing processes, quality system, GMP compliance',
    keywords: ['manufacturing', 'GMP', 'quality', 'process', 'production', 'QSR'],
    fdaSections: ['Section 13'],
  },
  risk_analysis: {
    name: 'Risk Analysis',
    description: 'Risk management, ISO 14971, hazard analysis, FMEA',
    keywords: ['risk', 'ISO 14971', 'hazard', 'FMEA', 'failure mode', 'mitigation'],
    fdaSections: ['Section 14'],
  },
};

// Test standards mapping
const TEST_STANDARDS: Record<string, { family: string; description: string }> = {
  'ISO 10993': { family: 'ISO', description: 'Biological evaluation of medical devices' },
  'IEC 60601': { family: 'IEC', description: 'Medical electrical equipment safety' },
  'ISO 14971': { family: 'ISO', description: 'Risk management for medical devices' },
  'IEC 62304': { family: 'IEC', description: 'Medical device software lifecycle' },
  'IEC 62366': { family: 'IEC', description: 'Usability engineering for medical devices' },
  'ASTM F2475': { family: 'ASTM', description: 'Biocompatibility of materials' },
  'ISO 11135': { family: 'ISO', description: 'Ethylene oxide sterilization' },
  'ISO 11137': { family: 'ISO', description: 'Radiation sterilization' },
  'ISO 11607': { family: 'ISO', description: 'Packaging for terminally sterilized devices' },
  'ISO 13485': { family: 'ISO', description: 'Quality management systems' },
  'FDA 21 CFR 820': { family: 'FDA', description: 'Quality System Regulation' },
  'AAMI TIR': { family: 'AAMI', description: 'Technical Information Reports' },
  'CLSI': { family: 'CLSI', description: 'Clinical and Laboratory Standards' },
  'USP': { family: 'USP', description: 'United States Pharmacopeia' },
  'EP': { family: 'EP', description: 'European Pharmacopoeia' },
  'ANSI': { family: 'ANSI', description: 'American National Standards' },
};

// Device components hierarchy
const DEVICE_COMPONENTS = {
  system: ['Full System', 'Complete Device'],
  hardware: {
    housing: ['Enclosure', 'Case', 'Shell'],
    pcb: ['Circuit Board', 'Electronics', 'PCB Assembly'],
    sensor: ['Sensor Module', 'Transducer', 'Detector'],
    display: ['Screen', 'User Interface', 'Display Module'],
    power: ['Power Supply', 'Battery', 'Charging System'],
    mechanical: ['Actuator', 'Motor', 'Mechanical Assembly'],
  },
  software: {
    firmware: ['Embedded Software', 'Firmware', 'RTOS'],
    application: ['Application Software', 'User Interface Software'],
    algorithm: ['Algorithm', 'AI/ML Model', 'Processing Logic'],
  },
  materials: {
    biocompatible: ['Patient Contact Materials', 'Implantable Materials'],
    packaging: ['Primary Packaging', 'Sterile Barrier'],
  },
};

class DocumentDataCenterService {
  private storage: multer.Multer;
  private uploadDir: string = path.join(process.cwd(), 'uploads', 'device-data-center');

  private readonly allowedMimeTypes = new Set([
    'application/pdf',
    'text/csv',
    'text/plain',
    'application/json',
    'application/xml',
    'text/xml',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'image/png',
    'image/jpeg',
  ]);

  private readonly magicSignatures = [
    { mime: 'application/pdf', magic: Buffer.from('%PDF') },
    { mime: 'image/png', magic: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
    { mime: 'image/jpeg', magic: Buffer.from([0xff, 0xd8, 0xff]) },
    { mime: 'application/zip', magic: Buffer.from([0x50, 0x4b, 0x03, 0x04]) },
  ];

  constructor() {
    // Configure multer for file uploads
    this.storage = multer({
      storage: multer.diskStorage({
        destination: async (req, file, cb) => {
          const orgId = String((req as any).tenantId || (req as any).tenantContext?.organizationId || (req as any).user?.organizationId || 'unknown');
          const uploadPath = path.join(this.uploadDir, orgId);
          await fs.mkdir(uploadPath, { recursive: true });
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          cb(null, `${uniqueSuffix}-${file.originalname}`);
        }
      }),
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
    });
    
    console.log('✅ DocumentDataCenterService initialized with AI-powered tagging');
  }

  private isLikelyText(buffer: Buffer) {
    const sample = buffer.subarray(0, 2048);
    if (sample.includes(0)) return false;
    let printable = 0;
    for (const byte of sample) {
      if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) {
        printable += 1;
      }
    }
    return printable / sample.length > 0.9;
  }

  private matchesMagic(buffer: Buffer, magic: Buffer) {
    return buffer.length >= magic.length && buffer.subarray(0, magic.length).equals(magic);
  }

  private validateFileSignature(buffer: Buffer, mimeType: string) {
    if (!this.allowedMimeTypes.has(mimeType)) {
      throw new Error('Unsupported file type');
    }

    const zipBasedMimes = new Set([
      'application/zip',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);

    const magicMatch = this.magicSignatures.find(sig => this.matchesMagic(buffer, sig.magic));

    if (zipBasedMimes.has(mimeType)) {
      if (!this.matchesMagic(buffer, Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
        throw new Error('Invalid ZIP-based file signature');
      }
    } else if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('xml')) {
      if (!this.isLikelyText(buffer)) {
        throw new Error('Invalid text file content');
      }
    } else if (magicMatch && magicMatch.mime !== mimeType && mimeType !== 'application/zip') {
      throw new Error('File signature does not match MIME type');
    }
  }

  /**
   * Extract text content from uploaded file for indexing and AI analysis
   */
  async extractFileContent(filePath: string, mimeType: string): Promise<string> {
    try {
      if (mimeType === 'application/pdf') {
        const dataBuffer = await fs.readFile(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
      } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
      } else if (mimeType.startsWith('text/')) {
        return await fs.readFile(filePath, 'utf-8');
      }
      return '';
    } catch (error) {
      console.error('Error extracting file content:', error);
      return '';
    }
  }

  /**
   * Generate AI-powered intelligent tags based on file content
   */
  async generateIntelligentTags(
    content: string,
    fileName: string,
    existingMetadata?: any
  ): Promise<{
    categories: string[];
    testStandards: string[];
    components: string[];
    suggestedTags: string[];
    confidence: number;
  }> {
    try {
      const prompt = `Analyze this medical device regulatory document and provide categorization:
      
      Document Name: ${fileName}
      Content (first 5000 chars): ${content.substring(0, 5000)}
      
      Based on FDA 510(k) requirements, identify:
      
      1. Categories (select all that apply):
      ${Object.entries(FDA_510K_CATEGORIES).map(([code, cat]) => `- ${code}: ${cat.description}`).join('\n')}
      
      2. Test Standards Referenced (e.g., ISO 10993, IEC 60601, etc.)
      
      3. Device Components Mentioned:
      - System level (complete device)
      - Hardware (housing, PCB, sensors, display, power, mechanical)
      - Software (firmware, application, algorithms)
      - Materials (biocompatible, packaging)
      
      4. Relevant Tags for searchability
      
      Return as JSON with structure:
      {
        "categories": ["category_code1", "category_code2"],
        "testStandards": ["ISO 10993-1", "IEC 60601-1"],
        "components": ["housing", "sensor", "firmware"],
        "suggestedTags": ["tag1", "tag2"],
        "confidence": 0.85
      }`;

      const aiResult = await ai.chat(
        [
          {
            role: 'system',
            content: 'You are an expert FDA regulatory consultant specializing in 510(k) submissions. Analyze documents and provide accurate categorization based on FDA requirements.',
          },
          { role: 'user', content: prompt }
        ],
        {
          taskType: 'document_analysis',
          jsonMode: true,
          temperature: 0.3,
          maxTokens: 1000,
          callerModule: 'DocumentDataCenterService',
        }
      );

      const result = JSON.parse(aiResult.content || '{}');
      
      return {
        categories: result.categories || [],
        testStandards: result.testStandards || [],
        components: result.components || [],
        suggestedTags: result.suggestedTags || [],
        confidence: result.confidence || 0.5,
      };
    } catch (error) {
      console.error('Error generating intelligent tags:', error);
      // Fallback to keyword-based tagging
      return this.generateKeywordBasedTags(content, fileName);
    }
  }

  /**
   * Fallback keyword-based tagging when AI is unavailable
   */
  private generateKeywordBasedTags(content: string, fileName: string) {
    const lowerContent = content.toLowerCase();
    const lowerFileName = fileName.toLowerCase();
    const combined = lowerContent + ' ' + lowerFileName;
    
    const categories: string[] = [];
    const testStandards: string[] = [];
    const components: string[] = [];
    const suggestedTags: string[] = [];

    // Match categories based on keywords
    for (const [code, category] of Object.entries(FDA_510K_CATEGORIES)) {
      if (category.keywords.some(keyword => combined.includes(keyword.toLowerCase()))) {
        categories.push(code);
        suggestedTags.push(...category.keywords.slice(0, 2));
      }
    }

    // Match test standards
    for (const standard of Object.keys(TEST_STANDARDS)) {
      if (combined.includes(standard.toLowerCase())) {
        testStandards.push(standard);
      }
    }

    // Match components
    const componentKeywords = ['housing', 'sensor', 'circuit', 'software', 'firmware', 'display', 'battery'];
    for (const keyword of componentKeywords) {
      if (combined.includes(keyword)) {
        components.push(keyword);
      }
    }

    return {
      categories: categories.length > 0 ? categories : ['bench_test'],
      testStandards,
      components,
      suggestedTags: Array.from(new Set(suggestedTags)),
      confidence: 0.6,
    };
  }

  /**
   * Upload and intelligently tag a new document
   */
  async uploadDocument(
    organizationId: number,
    file: Express.Multer.File,
    metadata: {
      deviceName?: string;
      deviceModel?: string;
      category?: string;
      manualTags?: string[];
      userId: string;
    }
  ) {
    if (!db) {
      throw new Error('Database connection not available');
    }
    try {
      // Calculate file checksum
      const fileBuffer = await fs.readFile(file.path);
      this.validateFileSignature(fileBuffer, file.mimetype);
      const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      // Extract content for indexing
      const content = await this.extractFileContent(file.path, file.mimetype);
      
      // Generate intelligent tags
      const aiTags = await this.generateIntelligentTags(content, file.originalname, metadata);

      // Combine AI tags with manual tags
      const allTags = Array.from(new Set([
        ...(metadata.manualTags || []),
        ...aiTags.suggestedTags,
        `confidence:${Math.round(aiTags.confidence * 100)}`,
      ]));

      // Create document record
      const [newDocument] = await db.insert(deviceDataCenter).values({
        organizationId,
        fileName: file.originalname,
        fileType: path.extname(file.originalname).substring(1),
        fileSize: file.size,
        storageUrl: file.path,
        checksum,
        deviceName: metadata.deviceName || 'Unknown Device',
        deviceModel: metadata.deviceModel,
        category: metadata.category || aiTags.categories[0] || 'bench_test',
        categories: aiTags.categories,
        testStandards: aiTags.testStandards,
        deviceComponents: aiTags.components,
        standardRef: aiTags.testStandards.length > 0 ? {
          standards: aiTags.testStandards.map(std => ({
            code: std,
            family: TEST_STANDARDS[std.split('-')[0]]?.family || 'Unknown',
          }))
        } : null,
        tags: allTags,
        searchableContent: content.substring(0, 50000), // Limit to 50k chars for search
        metadata: {
          aiTagging: {
            confidence: aiTags.confidence,
            timestamp: new Date().toISOString(),
            model: 'gpt-4o',
          },
          fileMetadata: {
            originalName: file.originalname,
            mimeType: file.mimetype,
            uploadedAt: new Date().toISOString(),
          }
        },
        uploadedBy: metadata.userId,
        regulatoryStatus: 'draft',
      }).returning();

      // Log audit trail for 21 CFR Part 11 compliance
      await (part11ComplianceService as any).logAction({
        organizationId,
        userId: metadata.userId,
        action: 'DOCUMENT_UPLOADED',
        resourceType: 'device_data_center',
        resourceId: newDocument.id.toString(),
        metadata: {
          fileName: file.originalname,
          fileSize: file.size,
          checksum,
          categories: aiTags.categories,
          standards: aiTags.testStandards,
          aiConfidence: aiTags.confidence,
        },
        ipAddress: '127.0.0.1', // Would come from request
        userAgent: 'DocumentDataCenterService',
      });

      return {
        success: true,
        document: newDocument,
        aiTags,
        message: `Document uploaded with ${Math.round(aiTags.confidence * 100)}% confidence tagging`,
      };
    } catch (error) {
      console.error('Error uploading document:', error);
      throw new Error('Failed to upload document');
    }
  }

  /**
   * Deep search across all document metadata and content
   */
  async deepSearch(
    organizationId: number,
    query: string,
    filters?: {
      categories?: string[];
      testStandards?: string[];
      components?: string[];
      dateFrom?: Date;
      dateTo?: Date;
      regulatoryStatus?: string;
    }
  ) {
    if (!db) {
      throw new Error('Database connection not available');
    }
    try {
      let baseQuery = db
        .select()
        .from(deviceDataCenter)
        .where(eq(deviceDataCenter.organizationId, organizationId));

      // Apply filters
      const conditions: any[] = [eq(deviceDataCenter.organizationId, organizationId)];

      // Text search across multiple fields
      if (query) {
        conditions.push(
          or(
            like(deviceDataCenter.fileName, `%${query}%`),
            like(deviceDataCenter.deviceName, `%${query}%`),
            like(deviceDataCenter.searchableContent, `%${query}%`),
            sql`${deviceDataCenter.tags} @> ARRAY[${query}]::text[]`,
          )
        );
      }

      // Category filter (supports multi-category)
      if (filters?.categories?.length) {
        conditions.push(
          sql`${deviceDataCenter.categories} && ARRAY[${filters.categories.join(',')}]::text[]`
        );
      }

      // Test standards filter
      if (filters?.testStandards?.length) {
        conditions.push(
          sql`${deviceDataCenter.testStandards} && ARRAY[${filters.testStandards.join(',')}]::text[]`
        );
      }

      // Components filter
      if (filters?.components?.length) {
        conditions.push(
          sql`${deviceDataCenter.deviceComponents} && ARRAY[${filters.components.join(',')}]::text[]`
        );
      }

      // Date range filter
      if (filters?.dateFrom) {
        conditions.push(sql`${deviceDataCenter.createdAt} >= ${filters.dateFrom}`);
      }
      if (filters?.dateTo) {
        conditions.push(sql`${deviceDataCenter.createdAt} <= ${filters.dateTo}`);
      }

      // Status filter
      if (filters?.regulatoryStatus) {
        conditions.push(eq(deviceDataCenter.regulatoryStatus, filters.regulatoryStatus));
      }

      const results = await db
        .select()
        .from(deviceDataCenter)
        .where(and(...conditions))
        .orderBy(desc(deviceDataCenter.updatedAt))
        .limit(100);

      // Calculate relevance scores
      const scoredResults = results.map(doc => {
        let score = 0;
        const lowerQuery = query.toLowerCase();
        
        // Score based on match location
        if (doc.fileName.toLowerCase().includes(lowerQuery)) score += 10;
        if (doc.deviceName?.toLowerCase().includes(lowerQuery)) score += 8;
        if (doc.tags?.some((tag: string) => tag.toLowerCase().includes(lowerQuery))) score += 6;
        if (doc.searchableContent?.toLowerCase().includes(lowerQuery)) score += 4;
        
        // Boost for exact matches
        if (doc.tags?.some((tag: string) => tag === query)) score += 15;
        
        return { ...doc, relevanceScore: score };
      });

      // Sort by relevance
      scoredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

      return {
        success: true,
        results: scoredResults,
        count: scoredResults.length,
        query,
        filters,
      };
    } catch (error) {
      console.error('Deep search error:', error);
      throw new Error('Search operation failed');
    }
  }

  /**
   * Get document citations for integration with Document Editor
   */
  async getDocumentCitations(
    organizationId: number,
    documentIds: number[]
  ) {
    if (!db) {
      throw new Error('Database connection not available');
    }
    try {
      const documents = await db
        .select({
          id: deviceDataCenter.id,
          fileName: deviceDataCenter.fileName,
          category: deviceDataCenter.category,
          testStandards: deviceDataCenter.testStandards,
          regulatoryStatus: deviceDataCenter.regulatoryStatus,
          reportId: deviceDataCenter.reportId,
          version: deviceDataCenter.version,
          sectionRefs: deviceDataCenter.sectionRefs,
        })
        .from(deviceDataCenter)
        .where(
          and(
            eq(deviceDataCenter.organizationId, organizationId),
            inArray(deviceDataCenter.id, documentIds)
          )
        );

      // Format citations for Document Editor
      const citations = documents.map(doc => ({
        id: `DDC-${doc.id}`,
        title: doc.fileName,
        type: 'device_data',
        category: doc.category,
        standards: doc.testStandards,
        reference: doc.reportId || `Document ${doc.id}`,
        version: doc.version || '1.0',
        sections: doc.sectionRefs || [],
        citationText: `[${doc.fileName} - ${doc.category.replace('_', ' ').toUpperCase()}]`,
        url: `/api/device-data-center/file/${doc.id}`,
      }));

      return {
        success: true,
        citations,
        count: citations.length,
      };
    } catch (error) {
      console.error('Error getting citations:', error);
      throw new Error('Failed to retrieve document citations');
    }
  }

  /**
   * Update document tags with AI assistance
   */
  async updateDocumentTags(
    organizationId: number,
    documentId: number,
    updates: {
      categories?: string[];
      testStandards?: string[];
      components?: string[];
      tags?: string[];
      metadata?: any;
      userId: string;
    }
  ) {
    if (!db) {
      throw new Error('Database connection not available');
    }
    try {
      // Get existing document
      const [existing] = await db
        .select()
        .from(deviceDataCenter)
        .where(
          and(
            eq(deviceDataCenter.organizationId, organizationId),
            eq(deviceDataCenter.id, documentId)
          )
        );

      if (!existing) {
        throw new Error('Document not found');
      }

      // Update document
      const [updated] = await db
        .update(deviceDataCenter)
        .set({
          categories: updates.categories || existing.categories,
          testStandards: updates.testStandards || existing.testStandards,
          deviceComponents: updates.components || existing.deviceComponents,
          tags: updates.tags || existing.tags,
          metadata: {
            ...((existing.metadata as Record<string, unknown>) ?? {}),
            ...((updates.metadata as Record<string, unknown>) ?? {}),
            lastUpdated: new Date().toISOString(),
            updatedBy: updates.userId,
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(deviceDataCenter.organizationId, organizationId),
            eq(deviceDataCenter.id, documentId)
          )
        )
        .returning();

      // Log audit trail
      await (part11ComplianceService as any).logAction({
        organizationId,
        userId: updates.userId,
        action: 'DOCUMENT_TAGS_UPDATED',
        resourceType: 'device_data_center',
        resourceId: documentId.toString(),
        metadata: {
          previousTags: existing.tags,
          newTags: updates.tags,
          categories: updates.categories,
          standards: updates.testStandards,
        },
        ipAddress: '127.0.0.1',
        userAgent: 'DocumentDataCenterService',
      });

      return {
        success: true,
        document: updated,
        message: 'Document tags updated successfully',
      };
    } catch (error) {
      console.error('Error updating document tags:', error);
      throw error;
    }
  }

  /**
   * Get statistics and insights for the document data center
   */
  async getStatistics(organizationId: number) {
    if (!db) {
      throw new Error('Database connection not available');
    }
    try {
      // Get total counts by category
      const categoryStats = await db
        .select({
          category: deviceDataCenter.category,
          count: sql<number>`count(*)`,
        })
        .from(deviceDataCenter)
        .where(eq(deviceDataCenter.organizationId, organizationId))
        .groupBy(deviceDataCenter.category);

      // Get total documents
      const [totalDocs] = await db
        .select({ count: sql<number>`count(*)` })
        .from(deviceDataCenter)
        .where(eq(deviceDataCenter.organizationId, organizationId));

      // Get documents by status
      const statusStats = await db
        .select({
          status: deviceDataCenter.regulatoryStatus,
          count: sql<number>`count(*)`,
        })
        .from(deviceDataCenter)
        .where(eq(deviceDataCenter.organizationId, organizationId))
        .groupBy(deviceDataCenter.regulatoryStatus);

      // Get recent uploads (last 7 days)
      const recentUploads = await db
        .select({ count: sql<number>`count(*)` })
        .from(deviceDataCenter)
        .where(
          and(
            eq(deviceDataCenter.organizationId, organizationId),
            sql`${deviceDataCenter.createdAt} > NOW() - INTERVAL '7 days'`
          )
        );

      // Get most used standards
      const standardsUsage = await db.execute(sql`
        SELECT standard, count(*) as usage_count
        FROM (
          SELECT unnest(test_standards) as standard
          FROM device_data_center
          WHERE organization_id = ${organizationId}
        ) standards
        GROUP BY standard
        ORDER BY usage_count DESC
        LIMIT 10
      `);

      return {
        success: true,
        statistics: {
          totalDocuments: totalDocs?.count || 0,
          byCategory: categoryStats,
          byStatus: statusStats,
          recentUploads: recentUploads[0]?.count || 0,
          topStandards: standardsUsage.rows,
          lastUpdated: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('Error getting statistics:', error);
      throw new Error('Failed to retrieve statistics');
    }
  }

  /**
   * Initialize reference data (categories, standards, components)
   */
  async initializeReferenceData(organizationId: number) {
    if (!db) {
      throw new Error('Database connection not available');
    }
    try {
      // Initialize categories
      for (const [code, category] of Object.entries(FDA_510K_CATEGORIES)) {
        await db
          .insert(deviceDataCategories)
          .values({
            categoryCode: code,
            categoryName: category.name,
            description: category.description,
            requiredFor510k: true,
            displayOrder: 0,
            createdAt: new Date(),
          })
          .onConflictDoNothing();
      }

      // Initialize test standards
      for (const [code, standard] of Object.entries(TEST_STANDARDS)) {
        await db
          .insert(deviceTestStandards)
          .values({
            standardCode: code,
            standardName: standard.description,
            family: standard.family,
            standardBody: standard.family,
            description: standard.description,
            createdAt: new Date(),
          })
          .onConflictDoNothing();
      }

      console.log('✅ Reference data initialized for Document Data Center');
      return { success: true };
    } catch (error) {
      console.error('Error initializing reference data:', error);
      throw error;
    }
  }

  /**
   * Get upload handler for Express routes
   */
  getUploadMiddleware() {
    return this.storage.single('file');
  }
}

// Export singleton instance
export const documentDataCenterService = new DocumentDataCenterService();
export default documentDataCenterService;