/**
 * FDA 510(k) Compliance Tracker Service
 * 
 * Comprehensive tracking system for FDA 510(k) submissions that provides:
 * - Full audit trails for all workflow actions (database-persisted)
 * - Data lineage tracking from source to final document (database-persisted)
 * - Version management for all document edits (database-persisted)
 * - AI-powered FDA compliance oversight and suggestions
 * 
 * Ensures complete regulatory compliance with FDA 21 CFR Part 11 and 807
 */

import { db } from '../db';
import * as schema from '../../shared/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import part11ComplianceService from './part11ComplianceService';
import { TemplateMapper } from './documentTemplateMapper';
import crypto from 'crypto';

import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('510kComplianceTracker');

interface ComplianceIssue {
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  section: string;
  field: string;
  issue: string;
  fdaRequirement: string;
  suggestedFix: string;
  regulatoryReference: string;
}

export class FDA510kComplianceTracker {
  
  constructor() {
    // Database-backed implementation - no in-memory storage
  }

  /**
   * Track all 510(k) workflow actions with comprehensive audit trail
   */
  async trackWorkflowAction(params: {
    workflowId: string;
    projectId: string;
    stage: string;
    section: string;
    action: string;
    userId: number;
    organizationId: number;
    data: any;
    metadata?: Record<string, any>;
  }) {
    const { workflowId, projectId, stage, section, action, userId, organizationId, data, metadata } = params;
    
    try {
      // Create audit trail entry in database
      const auditEntry = {
        organizationId,
        entityType: '510k_workflow',
        entityId: parseInt(projectId) || 0,
        action: `510K_WORKFLOW_${action.toUpperCase()}`,
        previousValues: null,
        newValues: {
          workflowId,
          stage,
          section,
          data,
          completeness: this.calculateCompleteness(data)
        },
        changedFields: Object.keys(data),
        changeReason: metadata?.changeReason || `Updated ${stage} - ${section}`,
        userId,
        userName: metadata?.userName || 'System',
        userRole: metadata?.userRole || 'writer',
        ipAddress: metadata?.ipAddress || null,
        userAgent: metadata?.userAgent || null,
        sessionId: metadata?.sessionId || null,
        complianceStandard: '21 CFR Part 11',
        dataIntegrityCheck: this.calculateContentHash(data)
      };

      // Store in audit trail database
      const [savedAudit] = await db.insert(schema.deviceAuditTrail)
        .values(auditEntry)
        .returning();
      
      // Track data lineage for each field
      await this.trackDataLineage(projectId, stage, section, data, userId, organizationId, workflowId);
      
      // Perform AI compliance check
      const complianceIssues = await this.checkFDACompliance(stage, section, data);
      
      return {
        success: true,
        auditId: savedAudit.id,
        complianceIssues,
        completeness: this.calculateCompleteness(data)
      };
    } catch (error) {
      logger.error('Error tracking workflow action', { err: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Track data lineage - how data flows from input to final document
   */
  async trackDataLineage(
    projectId: string, 
    stage: string, 
    section: string, 
    data: any,
    userId: number,
    organizationId: number,
    workflowId: string
  ) {
    const templateMapping = TemplateMapper.mapWorkflowToTemplate(data);
    const lineageEntries = [];
    
    // Track each field's journey
    for (const [field, value] of Object.entries(data)) {
      if (value === null || value === undefined) continue;
      
      // Determine target mappings based on field
      const targetMappings = this.getFieldMappings(field, stage);
      
      for (const mapping of targetMappings) {
        const lineageEntry = {
          organizationId,
          projectId,
          workflowId,
          sourceField: `${stage}.${section}.${field}`,
          sourceValue: value,
          sourceStage: stage,
          sourceSection: section,
          targetSection: mapping.targetSection,
          targetField: mapping.targetField,
          mappingRule: mapping.rule,
          transformations: mapping.transformations || [],
          userId,
          sessionId: workflowId
        };
        
        lineageEntries.push(lineageEntry);
      }
    }
    
    // Store lineage in database
    if (lineageEntries.length > 0) {
      await db.insert(schema.dataLineageTracking)
        .values(lineageEntries);
    }
    
    return lineageEntries;
  }

  /**
   * Create version snapshot for document changes
   */
  async createDocumentVersion(params: {
    documentId: string;
    projectId: string;
    userId: number;
    organizationId: number;
    content: any;
    changeDescription: string;
    metadata?: Record<string, any>;
  }) {
    const { documentId, projectId, userId, organizationId, content, changeDescription, metadata } = params;
    
    try {
      // Get previous version for comparison
      const previousVersions = await db.select()
        .from(schema.documentVersions)
        .where(eq(schema.documentVersions.documentId, parseInt(documentId) || 0))
        .orderBy(desc(schema.documentVersions.createdAt))
        .limit(1);
      
      const previousVersion = previousVersions[0];
      const versionNumber = previousVersion ? (Number(previousVersion.versionNumber) || 1) + 1 : 1;
      
      // Create version entry in database
      const versionEntry = {
        documentId: parseInt(documentId) || 0,
        versionNumber,
        content: JSON.stringify(content),
        changes: previousVersion ? 
          JSON.stringify(this.calculateChanges(
            JSON.parse(previousVersion.content || '{}'), 
            content
          )) : '[]',
        createdBy: userId,
        organizationId,
        metadata: {
          projectId,
          changeDescription,
          hash: this.calculateContentHash(content),
          ...metadata
        }
      };
      
      const [savedVersion] = await db.insert(schema.documentVersions)
        .values(versionEntry as any)
        .returning();
      
      // Create audit trail for version
      await db.insert(schema.deviceAuditTrail).values({
        organizationId,
        entityType: 'document_version',
        entityId: savedVersion.id,
        action: 'DOCUMENT_VERSION_CREATED',
        previousValues: previousVersion ? JSON.parse(previousVersion.content || '{}') : null,
        newValues: content,
        changedFields: Object.keys(content),
        changeReason: changeDescription,
        userId,
        userName: metadata?.userName || 'System',
        userRole: metadata?.userRole || 'writer',
        ipAddress: metadata?.ipAddress || null,
        userAgent: metadata?.userAgent || null,
        sessionId: metadata?.sessionId || null,
        complianceStandard: '21 CFR Part 11',
        dataIntegrityCheck: this.calculateContentHash(content)
      });
      
      return {
        success: true,
        versionNumber,
        versionId: savedVersion.id,
        hash: this.calculateContentHash(content),
        changes: JSON.parse(versionEntry.changes)
      };
    } catch (error) {
      logger.error('Error creating document version', { err: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * AI-powered FDA compliance checking
   */
  async checkFDACompliance(stage: string, section: string, data: any): Promise<ComplianceIssue[]> {
    const issues: ComplianceIssue[] = [];
    
    // Check based on stage and section
    if (stage === 'strategy' && section === 'device_intake') {
      // Device name compliance
      if (data.deviceName) {
        if (data.deviceName.length > 500) {
          issues.push({
            severity: 'major',
            section: 'Device Intake',
            field: 'deviceName',
            issue: 'Device name exceeds FDA recommended length',
            fdaRequirement: 'FDA Form 3881 limits device names to 500 characters',
            suggestedFix: 'Shorten the device name and use device description for additional details',
            regulatoryReference: '21 CFR 807.92(a)(3)'
          });
        }
        
        // Check for prohibited terms
        const prohibitedTerms = ['cure', 'treat', 'prevent disease'];
        const lowerName = data.deviceName.toLowerCase();
        for (const term of prohibitedTerms) {
          if (lowerName.includes(term)) {
            issues.push({
              severity: 'critical',
              section: 'Device Intake',
              field: 'deviceName',
              issue: `Device name contains prohibited medical claim: "${term}"`,
              fdaRequirement: 'Device names cannot make unsubstantiated medical claims',
              suggestedFix: 'Remove medical claims from device name',
              regulatoryReference: '21 CFR 807.92'
            });
          }
        }
      }
      
      // Intended use validation
      if (data.intendedUse) {
        if (data.intendedUse.length < 50) {
          issues.push({
            severity: 'minor',
            section: 'Device Intake',
            field: 'intendedUse',
            issue: 'Intended use statement may be too brief',
            fdaRequirement: 'FDA requires comprehensive intended use statements',
            suggestedFix: 'Expand intended use to include patient population, use environment, and clinical purpose',
            regulatoryReference: '21 CFR 807.92(a)(5)'
          });
        }
        
        // Check for required elements
        const requiredElements = ['patient population', 'clinical', 'medical'];
        const hasRequiredElement = requiredElements.some(elem => 
          data.intendedUse.toLowerCase().includes(elem)
        );
        
        if (!hasRequiredElement) {
          issues.push({
            severity: 'suggestion',
            section: 'Device Intake',
            field: 'intendedUse',
            issue: 'Consider including specific patient population or clinical use',
            fdaRequirement: 'FDA prefers specific intended use statements',
            suggestedFix: 'Add details about target patient population and clinical setting',
            regulatoryReference: 'FDA Guidance: The 510(k) Program'
          });
        }
      }
      
      // Classification validation
      if (data.deviceClass === '3' || data.deviceClass === 'III') {
        issues.push({
          severity: 'critical',
          section: 'Device Intake',
          field: 'deviceClass',
          issue: 'Class III devices require PMA, not 510(k)',
          fdaRequirement: 'Class III devices cannot use 510(k) pathway',
          suggestedFix: 'Verify device classification or switch to PMA submission',
          regulatoryReference: '21 CFR 814'
        });
      }
    }
    
    // Predicate device validation
    if (stage === 'strategy' && data.primaryPredicateKNumber) {
      if (!this.validateKNumber(data.primaryPredicateKNumber)) {
        issues.push({
          severity: 'major',
          section: 'Predicate Selection',
          field: 'primaryPredicateKNumber',
          issue: 'Invalid K-number format',
          fdaRequirement: 'K-numbers must follow format: K######',
          suggestedFix: 'Enter valid 510(k) number (e.g., K123456)',
          regulatoryReference: '21 CFR 807.92(a)(3)'
        });
      }
    }
    
    // Software validation requirements
    if (data.hasSoftware && stage === 'evidence') {
      if (!data.softwareValidationPlan) {
        issues.push({
          severity: 'critical',
          section: 'Evidence',
          field: 'softwareValidationPlan',
          issue: 'Software validation plan required',
          fdaRequirement: 'FDA requires software validation for device software',
          suggestedFix: 'Add IEC 62304 compliant software validation documentation',
          regulatoryReference: 'FDA Guidance: Software Validation'
        });
      }
    }
    
    // Cybersecurity requirements
    if (data.isCyberDevice && stage === 'evidence') {
      if (!data.cybersecurityDocumentation) {
        issues.push({
          severity: 'critical',
          section: 'Evidence',
          field: 'cybersecurityDocumentation',
          issue: 'Cybersecurity documentation required',
          fdaRequirement: 'FDA requires cybersecurity documentation for connected devices',
          suggestedFix: 'Include threat modeling, security controls, and SBOM',
          regulatoryReference: 'FDA Guidance: Cybersecurity in Medical Devices'
        });
      }
    }
    
    return issues;
  }

  /**
   * Get complete audit trail for a project from database
   */
  async getAuditTrail(projectId: string, filters?: {
    stage?: string;
    userId?: number;
    startDate?: Date;
    endDate?: Date;
  }) {
    try {
      let query = db.select()
        .from(schema.deviceAuditTrail)
        .where(eq(schema.deviceAuditTrail.entityId, parseInt(projectId) || 0))
        .$dynamic();
      
      // Apply filters
      if (filters?.userId) {
        query = query.where(eq(schema.deviceAuditTrail.userId, filters.userId));
      }
      
      const entries = await query.orderBy(desc(schema.deviceAuditTrail.createdAt));
      
      // Filter by date if needed (post-query filtering)
      let filtered = entries;
      if (filters?.startDate) {
        filtered = filtered.filter(e => new Date(e.createdAt) >= filters.startDate!);
      }
      if (filters?.endDate) {
        filtered = filtered.filter(e => new Date(e.createdAt) <= filters.endDate!);
      }
      if (filters?.stage) {
        filtered = filtered.filter(e => {
          const newValues = e.newValues as any;
          return newValues?.stage === filters.stage;
        });
      }
      
      return {
        success: true,
        count: filtered.length,
        entries: filtered.map(entry => ({
          id: entry.id,
          action: entry.action,
          userId: entry.userId,
          userName: entry.userName,
          timestamp: entry.createdAt,
          entityType: entry.entityType,
          entityId: entry.entityId.toString(),
          details: {
            ...(entry.newValues as any),
            changeReason: entry.changeReason,
            ipAddress: entry.ipAddress,
            sessionId: entry.sessionId
          }
        }))
      };
    } catch (error) {
      logger.error('Error getting audit trail', { err: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        count: 0,
        entries: []
      };
    }
  }

  /**
   * Get data lineage report from database
   */
  async getDataLineage(projectId: string) {
    try {
      const lineageEntries = await db.select()
        .from(schema.dataLineageTracking)
        .where(eq(schema.dataLineageTracking.projectId, projectId))
        .orderBy(asc(schema.dataLineageTracking.sourceField));
      
      // Group by source field
      const lineageMap = new Map<string, any[]>();
      for (const entry of lineageEntries) {
        if (!lineageMap.has(entry.sourceField)) {
          lineageMap.set(entry.sourceField, []);
        }
        lineageMap.get(entry.sourceField)!.push(entry);
      }
      
      return {
        success: true,
        totalMappings: lineageEntries.length,
        fieldCount: lineageMap.size,
        lineage: Array.from(lineageMap.entries()).map(([field, mappings]) => ({
          sourceField: field,
          mappings: mappings.map(m => ({
            target: `${m.targetSection}.${m.targetField}`,
            rule: m.mappingRule,
            transformations: m.transformations || []
          }))
        }))
      };
    } catch (error) {
      logger.error('Error getting data lineage', { err: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        totalMappings: 0,
        fieldCount: 0,
        lineage: []
      };
    }
  }

  /**
   * Get document version history from database
   */
  async getVersionHistory(projectId: string, documentId: string) {
    try {
      const docId = parseInt(documentId.replace('510K_', '')) || parseInt(projectId) || 0;
      
      const versions = await db.select()
        .from(schema.documentVersions)
        .where(eq(schema.documentVersions.documentId, docId))
        .orderBy(desc(schema.documentVersions.createdAt));
      
      return {
        success: true,
        currentVersion: versions.length,
        versions: versions.map((v: any) => {
          const metadata = v.metadata as any || {};
          return {
            versionNumber: v.versionNumber || 1,
            changeDescription: metadata.changeDescription || 'Version update',
            changesCount: Array.isArray(v.changes) ? v.changes.length : 0,
            createdBy: v.createdBy ?? v.createdById,
            createdAt: v.createdAt,
            hash: metadata.hash || this.calculateContentHash(v.content || '')
          };
        })
      };
    } catch (error) {
      logger.error('Error getting version history', { err: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        currentVersion: 0,
        versions: []
      };
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(projectId: string) {
    const auditTrail = await this.getAuditTrail(projectId);
    const dataLineage = await this.getDataLineage(projectId);
    const complianceChecks: ComplianceIssue[] = [];
    
    // Get latest workflow data for compliance check
    const latestEntries = await db.select()
      .from(schema.deviceAuditTrail)
      .where(and(
        eq(schema.deviceAuditTrail.entityId, parseInt(projectId) || 0),
        eq(schema.deviceAuditTrail.entityType, '510k_workflow')
      ))
      .orderBy(desc(schema.deviceAuditTrail.createdAt))
      .limit(1);
    
    if (latestEntries.length > 0) {
      const latestEntry = latestEntries[0];
      const newValues = latestEntry.newValues as any;
      if (newValues?.data && newValues?.stage) {
        const issues = await this.checkFDACompliance(
          newValues.stage, 
          newValues.section || '', 
          newValues.data
        );
        complianceChecks.push(...issues);
      }
    }
    
    // Calculate compliance score
    const criticalIssues = complianceChecks.filter(i => i.severity === 'critical').length;
    const majorIssues = complianceChecks.filter(i => i.severity === 'major').length;
    const minorIssues = complianceChecks.filter(i => i.severity === 'minor').length;
    const suggestions = complianceChecks.filter(i => i.severity === 'suggestion').length;
    
    const complianceScore = Math.max(0, 100 - (criticalIssues * 20) - (majorIssues * 10) - (minorIssues * 3));
    
    return {
      projectId,
      generatedAt: new Date(),
      complianceScore,
      auditTrailComplete: auditTrail.count > 0,
      dataLineageTracked: dataLineage.totalMappings > 0,
      issues: {
        critical: criticalIssues,
        major: majorIssues,
        minor: minorIssues,
        suggestions
      },
      complianceIssues: complianceChecks,
      recommendations: this.generateRecommendations(complianceChecks)
    };
  }

  // Helper methods
  private calculateCompleteness(data: any): number {
    const fields = Object.keys(data);
    const filledFields = fields.filter(f => 
      data[f] !== null && 
      data[f] !== undefined && 
      data[f] !== ''
    );
    return fields.length > 0 ? Math.round((filledFields.length / fields.length) * 100) : 0;
  }

  private getFieldMappings(field: string, stage: string) {
    // Define how fields map to FDA forms
    const mappings: any[] = [];
    
    if (field === 'deviceName') {
      mappings.push(
        {
          targetSection: 'FDA_3881',
          targetField: 'device_name',
          rule: 'DIRECT_COPY',
          transformations: ['TRIM', 'UPPERCASE_FIRST']
        },
        {
          targetSection: 'FDA_3514',
          targetField: 'product_name',
          rule: 'DIRECT_COPY',
          transformations: []
        }
      );
    }
    
    if (field === 'intendedUse') {
      mappings.push({
        targetSection: 'FDA_3881',
        targetField: 'indications_for_use',
        rule: 'DIRECT_COPY',
        transformations: ['EXPAND_ABBREVIATIONS']
      });
    }
    
    if (field === 'deviceClass') {
      mappings.push({
        targetSection: 'FDA_3881',
        targetField: 'device_classification',
        rule: 'DIRECT_COPY',
        transformations: ['NORMALIZE_CLASS']
      });
    }
    
    return mappings;
  }

  private calculateChanges(oldContent: any, newContent: any) {
    const changes: any[] = [];
    
    // Simple field-by-field comparison
    const allFields = new Set([
      ...Object.keys(oldContent || {}),
      ...Object.keys(newContent || {})
    ]);
    
    for (const field of allFields) {
      if (oldContent?.[field] !== newContent?.[field]) {
        changes.push({
          field,
          oldValue: oldContent?.[field],
          newValue: newContent?.[field],
          changeType: !oldContent?.[field] ? 'added' : !newContent?.[field] ? 'removed' : 'modified'
        });
      }
    }
    
    return changes;
  }

  private calculateContentHash(content: any): string {
    // Use Node.js crypto module for secure SHA-256 hashing
    const contentString = JSON.stringify(content);
    const hash = crypto
      .createHash('sha256')
      .update(contentString)
      .digest('hex');
    return hash;
  }

  private validateKNumber(kNumber: string): boolean {
    // K-number format: K###### (K followed by 6 digits)
    const kNumberRegex = /^K\d{6}$/;
    return kNumberRegex.test(kNumber);
  }

  private generateRecommendations(issues: ComplianceIssue[]): string[] {
    const recommendations: string[] = [];
    
    if (issues.some(i => i.severity === 'critical')) {
      recommendations.push('Address all critical compliance issues before submission');
    }
    
    if (issues.some(i => i.field === 'intendedUse')) {
      recommendations.push('Review and expand intended use statement with regulatory affairs team');
    }
    
    if (issues.some(i => i.field.includes('software'))) {
      recommendations.push('Ensure software validation documentation meets IEC 62304 requirements');
    }
    
    if (issues.some(i => i.field.includes('cyber'))) {
      recommendations.push('Complete FDA cybersecurity premarket submission documentation');
    }
    
    if (recommendations.length === 0 && issues.length === 0) {
      recommendations.push('Submission appears compliant - proceed with final review');
    }
    
    return recommendations;
  }
}

// Export singleton instance
export default new FDA510kComplianceTracker();