/**
 * CSR Database Service - Unified DAO for csr_reports (shared schema)
 */

import { db } from '../../lib/database.js';

export class CSRDatabaseService {
  async insertCSRReport(reportData = {}) {
    const now = new Date();
    const organizationId = reportData.organizationId ?? reportData.organization_id ?? 1;
    const clientWorkspaceId = reportData.clientWorkspaceId ?? reportData.client_workspace_id ?? null;
    const reportId = reportData.reportId || reportData.report_id || `report_${Date.now()}`;
    const reportTitle = reportData.reportTitle || reportData.title || 'Untitled CSR Report';
    const reportType = reportData.reportType || reportData.report_type || null;
    const studyId = reportData.studyId || reportData.study_id || null;
    const status = reportData.status || 'draft';
    const submissionDate = reportData.submissionDate || reportData.submission_date || null;
    const dueDate = reportData.dueDate || reportData.due_date || null;
    const uploadDate = reportData.uploadDate || reportData.upload_date || now;
    const content = reportData.content || null;
    const metadata = reportData.metadata || {};
    const complianceStatus = reportData.complianceStatus || reportData.compliance_status || null;
    const regulatoryAgency = reportData.regulatoryAgency || reportData.regulatory_agency || null;

    const result = await db.query(
      `
      INSERT INTO csr_reports (
        organization_id,
        client_workspace_id,
        report_id,
        report_title,
        report_type,
        study_id,
        status,
        submission_date,
        due_date,
        upload_date,
        content,
        metadata,
        compliance_status,
        regulatory_agency,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
      RETURNING *
      `,
      [
        organizationId,
        clientWorkspaceId,
        reportId,
        reportTitle,
        reportType,
        studyId,
        status,
        submissionDate,
        dueDate,
        uploadDate,
        content,
        metadata,
        complianceStatus,
        regulatoryAgency,
        now,
        now,
      ]
    );

    return result.rows[0];
  }

  async getCSRReportById(id) {
    const result = await db.query('SELECT * FROM csr_reports WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async searchCSRReports(query, filters = {}) {
    let sql = `SELECT * FROM csr_reports WHERE 1=1`;
    const params = [];
    let i = 1;

    if (query) {
      sql += ` AND (
        report_title ILIKE $${i} OR
        report_id ILIKE $${i} OR
        study_id ILIKE $${i}
      )`;
      params.push(`%${query}%`);
      i += 1;
    }

    if (filters.reportType) {
      sql += ` AND report_type = $${i}`;
      params.push(filters.reportType);
      i += 1;
    }

    if (filters.status) {
      sql += ` AND status = $${i}`;
      params.push(filters.status);
      i += 1;
    }

    if (filters.regulatoryAgency) {
      sql += ` AND regulatory_agency = $${i}`;
      params.push(filters.regulatoryAgency);
      i += 1;
    }

    if (filters.organizationId) {
      sql += ` AND organization_id = $${i}`;
      params.push(filters.organizationId);
      i += 1;
    }

    sql += ' ORDER BY updated_at DESC LIMIT 50';

    const result = await db.query(sql, params);
    return result.rows;
  }

  async getCSRStatistics() {
    const overview = await db.query(
      `
      SELECT
        COUNT(*) as total_reports,
        COUNT(DISTINCT report_type) as unique_report_types,
        COUNT(DISTINCT regulatory_agency) as unique_agencies,
        COUNT(DISTINCT status) as unique_statuses
      FROM csr_reports
      `
    );

    const statusDistribution = await db.query(
      `
      SELECT status, COUNT(*) as count
      FROM csr_reports
      GROUP BY status
      ORDER BY count DESC
      `
    );

    const agencyDistribution = await db.query(
      `
      SELECT regulatory_agency, COUNT(*) as count
      FROM csr_reports
      WHERE regulatory_agency IS NOT NULL
      GROUP BY regulatory_agency
      ORDER BY count DESC
      `
    );

    return {
      overview: overview.rows[0] || {},
      statusDistribution: statusDistribution.rows,
      agencyDistribution: agencyDistribution.rows,
    };
  }

  async getRecentReports(limit = 10) {
    const result = await db.query(
      `SELECT * FROM csr_reports ORDER BY updated_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async performAdvancedSearch(searchParams = {}) {
    const {
      query,
      reportType,
      regulatoryAgency,
      status,
      organizationId,
      limit = 50,
    } = searchParams;

    let sql = `SELECT * FROM csr_reports WHERE 1=1`;
    const params = [];
    let i = 1;

    if (query) {
      sql += ` AND (
        report_title ILIKE $${i} OR
        report_id ILIKE $${i} OR
        study_id ILIKE $${i}
      )`;
      params.push(`%${query}%`);
      i += 1;
    }

    if (reportType) {
      sql += ` AND report_type = $${i}`;
      params.push(reportType);
      i += 1;
    }

    if (regulatoryAgency) {
      sql += ` AND regulatory_agency = $${i}`;
      params.push(regulatoryAgency);
      i += 1;
    }

    if (status) {
      sql += ` AND status = $${i}`;
      params.push(status);
      i += 1;
    }

    if (organizationId) {
      sql += ` AND organization_id = $${i}`;
      params.push(organizationId);
      i += 1;
    }

    sql += ` ORDER BY updated_at DESC LIMIT $${i}`;
    params.push(limit);

    const result = await db.query(sql, params);
    return result.rows;
  }

  async generateCSRInsights(reportId, content) {
    return {
      status: 'skipped',
      message: 'CSR insight extraction is handled by the Refinery pipeline.',
      reportId,
      bytes: String(content || '').length,
    };
  }
}

export const csrDatabaseService = new CSRDatabaseService();
