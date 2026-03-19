/**
 * Evidence Management Service
 * Intelligent service for managing FDA 510(k) evidence files with requirement mapping,
 * automated data extraction, and workflow integration
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

// FDA Requirement definitions
const FDA_REQUIREMENTS_MAP = {
  device_desc: {
    name: 'Device Description',
    required: true,
    sections: ['physical_characteristics', 'materials_composition', 'design_drawings', 'specifications']
  },
  performance: {
    name: 'Performance Data',
    required: true,
    sections: ['bench_testing', 'animal_testing', 'computational_modeling', 'validation_verification']
  },
  biocompat: {
    name: 'Biocompatibility',
    required: true,
    sections: ['iso_10993', 'cytotoxicity', 'sensitization', 'irritation', 'systemic_toxicity', 'hemocompatibility']
  },
  sterilization: {
    name: 'Sterilization',
    required: true,
    sections: ['validation', 'sterility_assurance', 'residuals', 'packaging']
  },
  software: {
    name: 'Software',
    required: false,
    sections: ['sds', 'svvp', 'cybersecurity', 'hazard_analysis']
  },
  clinical: {
    name: 'Clinical',
    required: false,
    sections: ['protocol', 'results', 'statistical_analysis', 'adverse_events']
  },
  labeling: {
    name: 'Labeling',
    required: true,
    sections: ['device_label', 'ifu', 'patient_labeling', 'physician_labeling']
  },
  manufacturing: {
    name: 'Manufacturing',
    required: true,
    sections: ['process_flow', 'quality_controls', 'device_history', 'facility_info']
  }
};

export class EvidenceManagementService {
  private openai: OpenAI | null = null;

  constructor() {
    // Initialize OpenAI if API key exists
    }

  /**
   * Extract data from uploaded evidence files using AI
   */
  async extractDataFromFile(fileContent: string, fileName: string, fileType: string) {
    if (!this.openai) {
      return this.basicDataExtraction(fileContent, fileName);
    }
import { ai } from '../lib/unified-ai-client';

    try {
      const prompt = `
        Analyze this test report/evidence document and extract key information:
        File Name: ${fileName}

        Extract the following if present:
        1. Test Type/Category (bench test, biocompatibility, etc.)
        2. Test Standard/Method (ISO, ASTM, etc.)
        3. Test Date
        4. Testing Laboratory
        5. Device/Component Tested
        6. Test Results (Pass/Fail/Numerical)
        7. Key Findings or Conclusions
        8. Any deviations or issues noted

        Content:
        ${fileContent.substring(0, 4000)} // Limit content for API

        Return as JSON with these fields.
      `;

      const response = await this.ai.chat({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      });

      const extracted = JSON.parse(aiResult.content || '{}');
      
      return {
        test_type: extracted.test_type || this.inferTestType(fileName),
        test_standard: extracted.test_standard || null,
        test_date: extracted.test_date || null,
        test_lab: extracted.testing_laboratory || null,
        device_tested: extracted.device_component || null,
        results: extracted.test_results || null,
        findings: extracted.key_findings || null,
        issues: extracted.deviations || null,
        ai_extracted: true
      };
    } catch (error) {
      console.error('AI extraction failed:', error);
      return this.basicDataExtraction(fileContent, fileName);
    }
  }

  /**
   * Basic extraction without AI
   */
  private basicDataExtraction(content: string, fileName: string) {
    return {
      test_type: this.inferTestType(fileName),
      test_standard: this.extractStandard(content),
      test_date: this.extractDate(content),
      test_lab: null,
      device_tested: null,
      results: null,
      findings: null,
      issues: null,
      ai_extracted: false
    };
  }

  /**
   * Infer test type from file name
   */
  private inferTestType(fileName: string): string {
    const lower = fileName.toLowerCase();
    if (lower.includes('biocompat')) return 'biocompatibility';
    if (lower.includes('bench') || lower.includes('performance')) return 'bench_testing';
    if (lower.includes('steril')) return 'sterilization';
    if (lower.includes('clinical')) return 'clinical';
    if (lower.includes('label') || lower.includes('ifu')) return 'labeling';
    if (lower.includes('software') || lower.includes('cyber')) return 'software';
    if (lower.includes('manufact') || lower.includes('qms')) return 'manufacturing';
    return 'general';
  }

  /**
   * Extract standard references from content
   */
  private extractStandard(content: string): string | null {
    const standards = [
      /ISO\s+\d{4,5}(?:-\d+)?/gi,
      /ASTM\s+[A-Z]\d+/gi,
      /IEC\s+\d{5}/gi,
      /FDA\s+guidance/gi
    ];

    for (const regex of standards) {
      const match = content.match(regex);
      if (match) return match[0];
    }
    return null;
  }

  /**
   * Extract dates from content
   */
  private extractDate(content: string): string | null {
    const dateRegex = /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/;
    const match = content.match(dateRegex);
    return match ? match[0] : null;
  }

  /**
   * Map file to FDA requirements based on content
   */
  async mapToFDARequirements(fileId: string, extractedData: any) {
    const testType = extractedData.test_type;
    let requirement = null;
    let section = null;

    // Map test types to FDA requirements
    const mappings: { [key: string]: { req: string, section: string } } = {
      'biocompatibility': { req: 'biocompat', section: 'iso_10993' },
      'cytotoxicity': { req: 'biocompat', section: 'cytotoxicity' },
      'bench_testing': { req: 'performance', section: 'bench_testing' },
      'sterilization': { req: 'sterilization', section: 'validation' },
      'clinical': { req: 'clinical', section: 'results' },
      'labeling': { req: 'labeling', section: 'device_label' },
      'software': { req: 'software', section: 'svvp' },
      'manufacturing': { req: 'manufacturing', section: 'process_flow' }
    };

    const mapping = mappings[testType];
    if (mapping) {
      requirement = mapping.req;
      section = mapping.section;
    }

    // Update file with FDA requirement mapping
    if (requirement) {
      await db.execute(sql`
        UPDATE device_data_center 
        SET 
          fda_requirement = ${requirement},
          fda_section = ${section},
          extracted_data = ${JSON.stringify(extractedData)}::jsonb,
          updated_at = NOW()
        WHERE id = ${fileId}
      `);
    }

    return { requirement, section };
  }

  /**
   * Perform gap analysis for a project
   */
  async performGapAnalysis(projectId: string, organizationId: number) {
    // Get all files for the project
    const files = await db.execute(sql`
      SELECT 
        fda_requirement,
        fda_section,
        regulatory_status,
        COUNT(*) as file_count
      FROM device_data_center
      WHERE 
        project_id = ${projectId}
        AND organization_id = ${organizationId}
      GROUP BY fda_requirement, fda_section, regulatory_status
    `);

    // Analyze gaps
    const gaps = [];
    const fulfilled = [];
    const partial = [];

    for (const [reqId, reqData] of Object.entries(FDA_REQUIREMENTS_MAP)) {
      const reqFiles = files.filter((f: any) => f.fda_requirement === reqId);
      
      if (reqFiles.length === 0 && reqData.required) {
        gaps.push({
          requirement: reqId,
          name: reqData.name,
          status: 'missing',
          severity: 'critical',
          sections_missing: reqData.sections
        });
      } else if (reqFiles.length > 0) {
        const approved = reqFiles.filter((f: any) => f.regulatory_status === 'approved');
        if (approved.length === reqFiles.length) {
          fulfilled.push({
            requirement: reqId,
            name: reqData.name,
            status: 'complete',
            file_count: reqFiles.length
          });
        } else {
          partial.push({
            requirement: reqId,
            name: reqData.name,
            status: 'partial',
            approved: approved.length,
            total: reqFiles.length
          });
        }
      }
    }

    return {
      gaps,
      fulfilled,
      partial,
      completeness: Math.round((fulfilled.length / Object.keys(FDA_REQUIREMENTS_MAP).length) * 100),
      critical_gaps: gaps.filter(g => g.severity === 'critical').length
    };
  }

  /**
   * Generate citations for document editor
   */
  async generateCitations(fileIds: string[], format: 'apa' | 'ieee' | 'custom' = 'custom') {
    const files = await db.execute(sql`
      SELECT * FROM device_data_center
      WHERE id = ANY(${fileIds})
    `);

    const citations = files.map((file: any) => {
      const extracted = file.extracted_data || {};
      const date = extracted.test_date || file.created_at;
      const lab = extracted.test_lab || file.test_lab_name || 'Unknown Lab';
      
      if (format === 'custom') {
        return {
          id: file.id,
          citation: `${file.file_name} - ${file.test_type || 'Test Report'}, ${lab}, ${date}`,
          reference: `[${file.file_name}]`,
          details: extracted
        };
      }
      
      // Add other citation formats as needed
      return { id: file.id, citation: file.file_name };
    });

    return citations;
  }

  /**
   * Link file to workflow stage
   */
  async linkToWorkflowStage(fileId: string, workflowStage: number, stageData: any) {
    await db.execute(sql`
      UPDATE device_data_center
      SET 
        workflow_stage = ${workflowStage},
        workflow_data = ${JSON.stringify(stageData)}::jsonb,
        updated_at = NOW()
      WHERE id = ${fileId}
    `);
  }

  /**
   * Get evidence for specific workflow stage
   */
  async getStageEvidence(projectId: string, stage: number) {
    const stageRequirements: { [key: number]: string[] } = {
      0: ['device_desc', 'labeling'],
      1: ['performance', 'biocompat'],
      2: ['clinical', 'predicate_comparison'],
      3: ['performance', 'validation_verification'],
      4: ['labeling', 'ifu'],
      5: ['manufacturing', 'quality'],
      6: ['all_evidence']
    };

    const requirements = stageRequirements[stage] || [];
    
    if (requirements.includes('all_evidence')) {
      return db.execute(sql`
        SELECT * FROM device_data_center
        WHERE project_id = ${projectId}
        ORDER BY fda_requirement, created_at DESC
      `);
    }

    return db.execute(sql`
      SELECT * FROM device_data_center
      WHERE 
        project_id = ${projectId}
        AND fda_requirement = ANY(${requirements})
      ORDER BY fda_requirement, created_at DESC
    `);
  }

  /**
   * Auto-populate forms from evidence
   */
  async autoPopulateForm(formId: string, projectId: string) {
    // Get relevant evidence files
    const evidence = await db.execute(sql`
      SELECT 
        fda_requirement,
        fda_section,
        extracted_data,
        file_name,
        id
      FROM device_data_center
      WHERE 
        project_id = ${projectId}
        AND regulatory_status = 'approved'
        AND extracted_data IS NOT NULL
    `);

    // Map evidence to form fields
    const formData: any = {};
    
    for (const file of evidence) {
      const extracted = file.extracted_data;
      if (!extracted) continue;

      // Map extracted data to form fields based on requirement type
      if (file.fda_requirement === 'performance') {
        formData.performance_testing = {
          test_results: extracted.results,
          test_standards: extracted.test_standard,
          test_date: extracted.test_date,
          evidence_refs: [...(formData.performance_testing?.evidence_refs || []), file.id]
        };
      } else if (file.fda_requirement === 'biocompat') {
        formData.biocompatibility = {
          iso_10993_compliance: extracted.results === 'Pass',
          test_lab: extracted.test_lab,
          evidence_refs: [...(formData.biocompatibility?.evidence_refs || []), file.id]
        };
      }
      // Add more mappings as needed
    }

    return formData;
  }

  /**
   * Track evidence review workflow
   */
  async submitForReview(fileId: string, reviewerId: string) {
    await db.execute(sql`
      UPDATE device_data_center
      SET 
        review_status = 'pending',
        reviewer_id = ${reviewerId},
        review_requested_at = NOW(),
        regulatory_status = 'under_review'
      WHERE id = ${fileId}
    `);
  }

  /**
   * Approve evidence
   */
  async approveEvidence(fileId: string, reviewerId: string, comments?: string) {
    await db.execute(sql`
      UPDATE device_data_center
      SET 
        review_status = 'approved',
        reviewer_id = ${reviewerId},
        review_completed_at = NOW(),
        regulatory_status = 'approved',
        review_comments = COALESCE(review_comments, '[]'::jsonb) || ${JSON.stringify([{
          reviewer: reviewerId,
          action: 'approved',
          comment: comments,
          timestamp: new Date().toISOString()
        }])}::jsonb
      WHERE id = ${fileId}
    `);
  }

  /**
   * Request changes to evidence
   */
  async requestChanges(fileId: string, reviewerId: string, comments: string) {
    await db.execute(sql`
      UPDATE device_data_center
      SET 
        review_status = 'changes_requested',
        reviewer_id = ${reviewerId},
        regulatory_status = 'draft',
        review_comments = COALESCE(review_comments, '[]'::jsonb) || ${JSON.stringify([{
          reviewer: reviewerId,
          action: 'changes_requested',
          comment: comments,
          timestamp: new Date().toISOString()
        }])}::jsonb
      WHERE id = ${fileId}
    `);
  }

  /**
   * Export evidence package for submission
   */
  async exportEvidencePackage(projectId: string, organizationId: number) {
    const evidence = await db.execute(sql`
      SELECT 
        fda_requirement,
        fda_section,
        file_name,
        file_path,
        regulatory_status,
        extracted_data
      FROM device_data_center
      WHERE 
        project_id = ${projectId}
        AND organization_id = ${organizationId}
        AND regulatory_status = 'approved'
      ORDER BY fda_requirement, fda_section
    `);

    // Organize by requirement
    const organized: any = {};
    for (const file of evidence) {
      if (!organized[file.fda_requirement]) {
        organized[file.fda_requirement] = {
          requirement: FDA_REQUIREMENTS_MAP[file.fda_requirement]?.name,
          sections: {}
        };
      }
      
      if (!organized[file.fda_requirement].sections[file.fda_section]) {
        organized[file.fda_requirement].sections[file.fda_section] = [];
      }
      
      organized[file.fda_requirement].sections[file.fda_section].push({
        file_name: file.file_name,
        file_path: file.file_path,
        data: file.extracted_data
      });
    }

    return {
      project_id: projectId,
      exported_at: new Date().toISOString(),
      evidence_structure: organized,
      file_count: evidence.length
    };
  }
}

export default EvidenceManagementService;