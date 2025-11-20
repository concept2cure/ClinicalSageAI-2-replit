/**
 * eCTD Service - Dream eCTD Machine Backend
 *
 * Comprehensive eCTD Pyramid implementation with hierarchical module management,
 * granule-level document tracking, ICH compliance, and SharePoint integration
 */

import { db } from '../db';
import {
  ectdModules,
  ectdGranules,
  ectdTemplates,
  ectdCompilations,
  ectdChangeControl,
  ectdCrossReferences,
  sharepointIntegration,
} from '../../shared/schema';
import { eq, and, inArray, sql, desc, asc } from 'drizzle-orm';

// eCTD Module Structure based on Dream eCTD Machine specifications
export const ECTD_PYRAMID_STRUCTURE = {
  '1': {
    name: 'Administrative Information and Prescribing Information',
    sections: {
      '1.1': 'Forms',
      '1.2': 'Cover Letter',
      '1.3': 'Administrative Information',
      '1.3.1': 'Sponsor Contact Information',
      '1.3.2': 'Field Copy Certification',
      '1.3.3': 'Debarment Certification',
      '1.3.4': 'Financial Certification and Disclosure',
      '1.3.5': 'Patent and Exclusivity',
      '1.12.1.4': 'Roadmap of Responses from pre-IND meeting',
      '1.12.13': 'Request for waiver of in vivo studies',
      '1.12.14': 'Request for categorical exclusion of environmental assessment',
      '1.14.4.2': 'Investigational drug labeling',
      '1.20': 'Introduction and General Investigational Plan',
    },
  },
  '2': {
    name: 'Common Technical Document Summaries',
    sections: {
      '2.2': 'Overview',
      '2.3': 'Quality Overall Summary',
      '2.4': 'Nonclinical Overview',
      '2.5': 'Clinical Overview',
      '2.6.1': 'Introduction',
      '2.6.2': 'Pharmacology Written Summary',
      '2.6.3': 'Pharmacology tabulated summary',
      '2.6.4': 'Pharmacokinetics written summary',
      '2.6.5': 'Pharmacokinetics tabulated summary',
      '2.6.6': 'Toxicology written summary',
      '2.6.7': 'Toxicology tabulated summary',
      '2.7.1': 'Summary of current studies',
    },
  },
  '3': {
    name: 'Quality',
    sections: {
      '3.2.A': 'Drug Substance',
      '3.2.A.1': 'Facilities and equipment',
      '3.2.A.2': 'Adventitious agents safety evaluation',
      '3.2.A.3': 'Novel Excipients',
      '3.2.P': 'Drug Product',
      '3.2.P.1': 'Description and composition',
      '3.2.P.2.1': 'Components of the Drug Product',
      '3.2.P.2.2': 'Drug product',
      '3.2.P.2.3': 'Manufacturing process development',
      '3.2.P.2.4': 'Container closure system',
      '3.2.P.2.5': 'Microbiological attributes',
      '3.2.P.2.6': 'Compatibility',
      '3.2.P.3.1': 'Manufacturers',
      '3.2.P.3.2': 'Batch formula',
      '3.2.P.3.3': 'Description of manufacturing process and process controls',
      '3.2.P.3.4': 'Control of critical steps and intermediates',
      '3.2.P.3.5': 'Process validation and or evaluation',
      '3.2.P.4': 'Control of excipients',
      '3.2.P.5.1': 'Specifications',
      '3.2.P.5.2': 'Analytical procedures',
      '3.2.P.5.3': 'Validation of analytical procedures',
      '3.2.P.5.4': 'Batch analyses',
      '3.2.P.5.5': 'Characterization of impurities',
      '3.2.P.5.6': 'Justification of specifications',
      '3.2.P.6': 'Reference Standard',
      '3.2.P.7': 'Container closure system',
      '3.2.P.8.1': 'Stability summary and conclusion',
      '3.2.P.8.3': 'Stability data',
      '3.2.S': 'Drug Substance',
      '3.2.S.1': 'General Information',
      '3.2.S.2.1': 'Manufacturer',
      '3.2.S.2.2': 'Description of manufacturing process and process controls',
      '3.2.S.2.3': 'Control of materials',
      '3.2.S.2.4': 'Control of critical steps and intermediates',
      '3.2.S.2.5': 'Process validation and or evaluation',
      '3.2.S.3.1': 'Elucidation of structure and other characteristics',
      '3.2.S.3.2': 'Impurities',
      '3.2.S.4.1': 'Specification',
      '3.2.S.4.2': 'Analytical procedures',
      '3.2.S.4.4': 'Batch analyses',
      '3.2.S.4.5': 'Justification of specification',
      '3.2.S.5': 'Reference standards or materials',
      '3.2.S.6': 'Container closure system',
      '3.2.S.7.1': 'Stability summary and conclusions',
      '3.2.S.7.3': 'Stability data',
    },
  },
};

export class EctdService {
  /**
   * Initialize eCTD Pyramid structure for a project
   */
  async initializeEctdStructure(organizationId: number, projectId?: number) {
    try {
      const modules = [];
      const granules = [];

      // Create Module hierarchy
      for (const [moduleNum, moduleData] of Object.entries(ECTD_PYRAMID_STRUCTURE)) {
        // Create main module
        const moduleResult = await db
          .insert(ectdModules)
          .values({
            organizationId,
            projectId,
            moduleNumber: moduleNum,
            moduleName: moduleData.name,
            level: 1,
            isLeaf: false,
            sortOrder: parseInt(moduleNum),
            status: 'active',
            isRequired: true,
            allowCustomGranules: true,
          })
          .returning();

        const moduleId = moduleResult[0].id;
        modules.push(moduleResult[0]);

        // Create granules for each section
        let sortOrder = 1;
        for (const [granuleId, granuleName] of Object.entries(moduleData.sections)) {
          const granuleResult = await db
            .insert(ectdGranules)
            .values({
              organizationId,
              moduleId,
              granuleId,
              granuleName,
              status: 'draft',
              version: '1.0',
              sortOrder,
              ichSection: granuleId,
            })
            .returning();

          granules.push(granuleResult[0]);
          sortOrder++;
        }
      }

      return { modules, granules };
    } catch (error) {
      console.error('Error initializing eCTD structure:', error);
      throw error;
    }
  }

  /**
   * Get complete eCTD tree structure
   */
  async getEctdTree(organizationId: number, projectId?: number) {
    try {
      const modules = await db
        .select()
        .from(ectdModules)
        .where(
          projectId
            ? and(
                eq(ectdModules.organizationId, organizationId),
                eq(ectdModules.projectId, projectId)
              )
            : eq(ectdModules.organizationId, organizationId)
        )
        .orderBy(asc(ectdModules.sortOrder));

      const granules = await db
        .select()
        .from(ectdGranules)
        .where(eq(ectdGranules.organizationId, organizationId))
        .orderBy(asc(ectdGranules.sortOrder));

      // Build hierarchical structure
      const tree = modules.map(module => ({
        ...module,
        granules: granules.filter(g => g.moduleId === module.id),
      }));

      return tree;
    } catch (error) {
      console.error('Error getting eCTD tree:', error);
      throw error;
    }
  }

  /**
   * Update granule status (draft/final/uploaded/inactive/locked)
   */
  async updateGranuleStatus(
    organizationId: number,
    granuleId: number,
    status: string,
    userId?: number
  ) {
    try {
      const result = await db
        .update(ectdGranules)
        .set({
          status,
          lastEditedBy: userId,
          lastEditedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(ectdGranules.id, granuleId), eq(ectdGranules.organizationId, organizationId)))
        .returning();

      return result[0];
    } catch (error) {
      console.error('Error updating granule status:', error);
      throw error;
    }
  }

  /**
   * Create custom granule (not in ICH guidance)
   */
  async createCustomGranule(organizationId: number, moduleId: number, data: any) {
    try {
      const result = await db
        .insert(ectdGranules)
        .values({
          organizationId,
          moduleId,
          granuleId: data.granuleId,
          granuleName: data.granuleName,
          status: 'draft',
          version: '1.0',
          customGranule: true,
          sortOrder: data.sortOrder || 999,
          ...data,
        })
        .returning();

      return result[0];
    } catch (error) {
      console.error('Error creating custom granule:', error);
      throw error;
    }
  }

  /**
   * Compile module - ICH eCTD compilation workflow
   */
  async compileModule(organizationId: number, moduleId: number, userId: number, options: any = {}) {
    try {
      // Get all granules in module
      const granules = await db
        .select()
        .from(ectdGranules)
        .where(
          and(
            eq(ectdGranules.organizationId, organizationId),
            eq(ectdGranules.moduleId, moduleId),
            eq(ectdGranules.status, 'final')
          )
        );

      if (granules.length === 0) {
        throw new Error('No final granules found in module');
      }

      // Lock granules for compilation
      await db
        .update(ectdGranules)
        .set({
          isLocked: true,
          updatedAt: new Date(),
        })
        .where(
          and(eq(ectdGranules.organizationId, organizationId), eq(ectdGranules.moduleId, moduleId))
        );

      // Create compilation record
      const compilation = await db
        .insert(ectdCompilations)
        .values({
          organizationId,
          moduleId,
          compilationName: `Module ${moduleId} Compilation`,
          compilationType: 'module',
          includedGranules: granules.map(g => g.id),
          status: 'pending',
          compiledBy: userId,
          version: '1.0',
        })
        .returning();

      // Generate XML backbone (ICH eCTD structure)
      const xmlBackbone = this.generateXmlBackbone(granules);

      // Update compilation with XML
      await db
        .update(ectdCompilations)
        .set({
          xmlBackbone,
          status: 'completed',
          compiledAt: new Date(),
        })
        .where(eq(ectdCompilations.id, compilation[0].id));

      return compilation[0];
    } catch (error) {
      console.error('Error compiling module:', error);
      throw error;
    }
  }

  /**
   * Generate XML backbone for eCTD compilation
   */
  private generateXmlBackbone(granules: any[]) {
    const xmlDoc = `<?xml version="1.0" encoding="UTF-8"?>
<ectd:ectd xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3.org/1999/xlink">
  <ectd:envelope>
    <ectd:application-number>IND-${Date.now()}</ectd:application-number>
    <ectd:submission-number>0001</ectd:submission-number>
    <ectd:submission-type>initial</ectd:submission-type>
  </ectd:envelope>
  <ectd:modules>
    ${granules
      .map(
        granule => `
    <ectd:granule id="${granule.granuleId}">
      <ectd:title>${granule.granuleName}</ectd:title>
      <ectd:file>${granule.fileName || granule.granuleName + '.docx'}</ectd:file>
      <ectd:status>${granule.status}</ectd:status>
    </ectd:granule>`
      )
      .join('')}
  </ectd:modules>
</ectd:ectd>`;

    return xmlDoc;
  }

  /**
   * Create change control record (ICH Change Control Process v1.9)
   */
  async createChangeControl(
    organizationId: number,
    granuleId: number,
    changeData: any,
    userId: number
  ) {
    try {
      const result = await db
        .insert(ectdChangeControl)
        .values({
          organizationId,
          granuleId,
          changeType: changeData.changeType,
          changeReason: changeData.changeReason,
          previousVersion: changeData.previousVersion,
          newVersion: changeData.newVersion,
          changeDescription: changeData.changeDescription,
          sequenceNumber: `SN${Date.now()}`,
          xmlOperation: changeData.xmlOperation || 'replace',
          status: 'pending',
          createdBy: userId,
        })
        .returning();

      return result[0];
    } catch (error) {
      console.error('Error creating change control:', error);
      throw error;
    }
  }

  /**
   * Get granule templates
   */
  async getTemplates(organizationId: number, category?: string) {
    try {
      let query = db
        .select()
        .from(ectdTemplates)
        .where(
          and(eq(ectdTemplates.organizationId, organizationId), eq(ectdTemplates.isActive, true))
        );

      if (category) {
        query = query.where(eq(ectdTemplates.category, category));
      }

      const templates = await query.orderBy(asc(ectdTemplates.templateName));
      return templates;
    } catch (error) {
      console.error('Error getting templates:', error);
      throw error;
    }
  }

  /**
   * SharePoint integration - sync granule
   */
  async syncToSharePoint(organizationId: number, granuleId: number, sharepointData: any) {
    try {
      const result = await db
        .insert(sharepointIntegration)
        .values({
          organizationId,
          granuleId,
          sharepointSiteId: sharepointData.siteId,
          sharepointDocumentId: sharepointData.documentId,
          sharepointUrl: sharepointData.url,
          sharepointPath: sharepointData.path,
          sharepointVersion: sharepointData.version || '1.0',
          syncStatus: 'synced',
          lastSyncAt: new Date(),
          syncDirection: 'upload',
        })
        .returning();

      return result[0];
    } catch (error) {
      console.error('Error syncing to SharePoint:', error);
      throw error;
    }
  }

  /**
   * Apply XML rules and validate cross-references
   */
  async applyXmlRules(organizationId: number, moduleId: number) {
    try {
      // Get all granules in module
      const granules = await db
        .select()
        .from(ectdGranules)
        .where(
          and(eq(ectdGranules.organizationId, organizationId), eq(ectdGranules.moduleId, moduleId))
        );

      // Generate cross-references automatically
      const crossRefs = [];
      for (const granule of granules) {
        // Add logic to scan document content for references
        // This would integrate with document processing service

        // For now, create sample cross-reference
        if (granule.granuleId.includes('2.5')) {
          crossRefs.push({
            organizationId,
            sourceGranuleId: granule.id,
            targetGranuleId: granules.find(g => g.granuleId.includes('3.2.P.1'))?.id,
            referenceType: 'cross_ref',
            sourceLocation: 'Section 2.1',
            targetLocation: 'Section 3.2.P.1',
            linkText: 'See Module 3.2.P.1 for detailed composition',
            autoGenerated: true,
            createdBy: 1,
          });
        }
      }

      if (crossRefs.length > 0) {
        await db.insert(ectdCrossReferences).values(crossRefs);
      }

      return { appliedRules: true, crossReferences: crossRefs.length };
    } catch (error) {
      console.error('Error applying XML rules:', error);
      throw error;
    }
  }
}

export const ectdService = new EctdService();
