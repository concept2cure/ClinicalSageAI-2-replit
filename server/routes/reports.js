import express from 'express';
import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';

const router = express.Router();

/**
 * Unified Reports API - Backend Controller
 *
 * This API implements a unified endpoint for all report types
 * with support for filtering, pagination, and PDF export.
 *
 * Based on the report roadmap:
 * 1. Compliance Summary Report
 * 2. Section Generation Log
 * 3. Data Source Audit Report
 * 4. Risk-Management Traceability Report
 * 5. PMCF Activity & Update Report
 * 6. GSPR/Essential Principles Matrix
 * 7. Literature Search Audit Trail
 * 8. User Activity & Approval Report
 * 9. AI Performance & Confidence Report
 * 10. Export History & Comparison Report
 */

// Get report data based on type and filters
router.get('/', async (req, res) => {
  try {
    const {
      type,
      startDate,
      endDate,
      authority,
      section,
      severity,
      source,
      status,
      modelVersion,
      riskLevel,
      user,
      page = 1,
      pageSize = 20,
    } = req.query;

    if (!type) {
      return res.status(400).json({ error: 'Report type is required' });
    }

    console.log(`Fetching ${type} report with filters:`, req.query);

    // Fetch report data based on type
    let reportData;
    switch (type) {
      case 'compliance-summary':
        reportData = await getComplianceSummaryReport(req.query);
        break;
      case 'section-generation-log':
        reportData = await getSectionGenerationLog(req.query);
        break;
      case 'data-source-audit':
        reportData = await getDataSourceAuditReport(req.query);
        break;
      case 'risk-management-traceability':
        reportData = await getRiskManagementTraceabilityReport(req.query);
        break;
      case 'pmcf-activity':
        reportData = await getPmcfActivityReport(req.query);
        break;
      case 'gspr-matrix':
        reportData = await getGsprMatrixReport(req.query);
        break;
      case 'literature-search-audit':
        reportData = await getLiteratureSearchAuditReport(req.query);
        break;
      case 'user-activity':
        reportData = await getUserActivityReport(req.query);
        break;
      case 'ai-performance':
        reportData = await getAiPerformanceReport(req.query);
        break;
      case 'export-history':
        reportData = await getExportHistoryReport(req.query);
        break;
      default:
        return res.status(400).json({ error: `Unsupported report type: ${type}` });
    }

    // Apply pagination to the results
    const offset = (page - 1) * pageSize;
    const paginatedRows = reportData.rows.slice(offset, offset + pageSize);

    // Return the report data with pagination metadata
    res.json({
      type,
      summary: reportData.summary,
      rows: paginatedRows,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: reportData.rows.length,
        totalPages: Math.ceil(reportData.rows.length / pageSize),
      },
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({
      error: 'Failed to generate report',
      details: error.message,
    });
  }
});

// Generate and export a report as PDF
router.get('/export.pdf', async (req, res) => {
  try {
    const { type } = req.query;

    if (!type) {
      return res.status(400).json({ error: 'Report type is required' });
    }

    console.log(`Exporting ${type} report as PDF with filters:`, req.query);

    // Create the output directory if it doesn't exist
    const outputDir = path.join(__dirname, '../../generated_documents');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate a unique filename for the PDF
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const outputPath = path.join(outputDir, `${type}_report_${timestamp}.pdf`);

    // Create a temporary HTML file for the report content
    const htmlPath = path.join(outputDir, `${type}_report_${timestamp}.html`);

    // Generate the report HTML based on type
    const reportHtml = await generateReportHtml(type, req.query);
    fs.writeFileSync(htmlPath, reportHtml);

    // Use a PDF generation library (wkhtmltopdf, Puppeteer, etc.) to convert HTML to PDF
    // For now, we'll use a simple placeholder approach
    try {
      // Convert HTML to PDF using Puppeteer
      // We would normally use Puppeteer here, but for this example we're creating a stub PDF
      const pdfContent = `
        This is a ${type} report PDF
        Generated at: ${new Date().toISOString()}
        Filters: ${JSON.stringify(req.query)}
      `;
      fs.writeFileSync(outputPath, pdfContent);

      // Read the PDF file and send it as a response
      const pdf = fs.readFileSync(outputPath);

      // Set the appropriate headers for a PDF file
      res.contentType('application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${type}_report.pdf"`);

      // Send the PDF file
      res.send(pdf);

      // Clean up temporary files
      fs.unlinkSync(htmlPath);
      fs.unlinkSync(outputPath);
    } catch (conversionError) {
      console.error('Error converting HTML to PDF:', conversionError);
      // Return a simple error response
      res.status(500).json({
        error: 'Failed to convert report to PDF',
        details: conversionError.message,
      });
    }
  } catch (error) {
    console.error('Error exporting report as PDF:', error);
    res.status(500).json({
      error: 'Failed to export report as PDF',
      details: error.message,
    });
  }
});

// Helper function to generate HTML for a report based on type
async function generateReportHtml(type, filters) {
  // In a real implementation, this would generate proper HTML for each report type
  // For now, we'll return a simple HTML template

  const reportTitle = type
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${reportTitle} Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #2563eb; }
        .report-header { margin-bottom: 20px; }
        .report-meta { color: #666; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th { background-color: #f3f4f6; text-align: left; padding: 8px; }
        td { border-bottom: 1px solid #ddd; padding: 8px; }
      </style>
    </head>
    <body>
      <div class="report-header">
        <h1>${reportTitle} Report</h1>
        <div class="report-meta">Generated on ${new Date().toLocaleString()}</div>
      </div>
      
      <div class="report-content">
        <p>This report has been generated using the following filters:</p>
        <pre>${JSON.stringify(filters, null, 2)}</pre>
        
        <p>Report data would be displayed here in a production environment.</p>
      </div>
    </body>
    </html>
  `;
}

// Report data generators for each report type
// In a real implementation, these would query the database using the provided filters

async function getComplianceSummaryReport(filters) {
  // Sample data for the compliance summary report
  const summary = {
    overallScore: 85,
    openFindingsCount: 3,
    criticalFindingsCount: 1,
    completedSections: 7,
    totalSections: 9,
  };

  const rows = [
    {
      finding: 'Missing clinical investigation data',
      section: 'Clinical Background',
      severity: 'critical',
      owner: 'Dr. Smith',
      dueDate: '2025-05-15',
    },
    {
      finding: 'Incomplete risk analysis',
      section: 'Risk Assessment',
      severity: 'major',
      owner: 'Jane Johnson',
      dueDate: '2025-05-20',
    },
    {
      finding: 'Literature search needs updating',
      section: 'Literature Review',
      severity: 'minor',
      owner: 'Robert Lee',
      dueDate: '2025-05-30',
    },
  ];

  // Filter the rows based on the provided filters
  const filteredRows = rows.filter(row => {
    if (
      filters.section &&
      filters.section !== 'all' &&
      !row.section.toLowerCase().includes(filters.section.toLowerCase())
    ) {
      return false;
    }
    if (filters.severity && filters.severity !== 'all' && row.severity !== filters.severity) {
      return false;
    }
    return true;
  });

  return {
    summary,
    rows: filteredRows,
  };
}

async function getSectionGenerationLog(filters) {
  // Sample data for the section generation log
  const summary = {
    totalCalls: 87,
    avgLatency: 3.2,
    errorRate: 1.8,
  };

  const rows = [
    {
      timestamp: '2025-05-07T14:32:45Z',
      user: 'john.doe@example.com',
      section: 'Literature Review',
      modelVersion: 'gpt-4o',
      status: 'success',
      latency: 2814,
    },
    {
      timestamp: '2025-05-07T15:10:22Z',
      user: 'jane.smith@example.com',
      section: 'Clinical Background',
      modelVersion: 'gpt-4o',
      status: 'success',
      latency: 3156,
    },
    {
      timestamp: '2025-05-08T09:45:12Z',
      user: 'john.doe@example.com',
      section: 'Risk Assessment',
      modelVersion: 'gpt-4o',
      status: 'failed',
      latency: 4250,
    },
    {
      timestamp: '2025-05-08T10:23:18Z',
      user: 'jane.smith@example.com',
      section: 'Benefit-Risk Analysis',
      modelVersion: 'gpt-4o',
      status: 'success',
      latency: 2980,
    },
  ];

  // Filter the rows based on the provided filters
  const filteredRows = rows.filter(row => {
    if (
      filters.section &&
      filters.section !== 'all' &&
      !row.section.toLowerCase().includes(filters.section.toLowerCase())
    ) {
      return false;
    }
    if (filters.status && filters.status !== 'all' && row.status !== filters.status) {
      return false;
    }
    if (
      filters.modelVersion &&
      filters.modelVersion !== 'all' &&
      row.modelVersion !== filters.modelVersion
    ) {
      return false;
    }
    if (filters.user && filters.user !== 'all' && !row.user.includes(filters.user)) {
      return false;
    }

    // Filter by date range if provided
    if (filters.startDate && filters.endDate) {
      const rowDate = new Date(row.timestamp);
      const startDate = new Date(filters.startDate);
      const endDate = new Date(filters.endDate);
      if (rowDate < startDate || rowDate > endDate) {
        return false;
      }
    }

    return true;
  });

  return {
    summary,
    rows: filteredRows,
  };
}

async function getDataSourceAuditReport(filters) {
  // Implementation for data source audit report
  return {
    summary: {
      totalSources: 4,
      anomalyCount: 2,
    },
    rows: [
      {
        timestamp: '2025-05-01T10:15:30Z',
        source: 'FAERS',
        apiVersion: 'v2.0',
        recordCount: 1250,
        anomalyFlag: false,
      },
      {
        timestamp: '2025-05-02T08:22:45Z',
        source: 'Literature',
        apiVersion: 'v1.5',
        recordCount: 85,
        anomalyFlag: false,
      },
      {
        timestamp: '2025-05-03T14:30:12Z',
        source: 'Clinical Trials',
        apiVersion: 'v3.0',
        recordCount: 0,
        anomalyFlag: true,
        anomalyNotes: 'API returned 0 records - likely schema change or API issue',
      },
    ],
  };
}

async function getRiskManagementTraceabilityReport(filters) {
  // Implementation for risk management traceability report
  return {
    summary: {
      totalRisks: 12,
      highRisks: 3,
      mediumRisks: 6,
      lowRisks: 3,
    },
    rows: [
      {
        riskId: 'RISK-001',
        description: 'Device failure during operation',
        severity: 'high',
        cerSections: ['Risk Assessment', 'Benefit-Risk Analysis'],
        ctqFactors: ['CTQ-005', 'CTQ-008'],
        residualRiskStatus: 'Acceptable with monitoring',
        evidence: 'Clinical data from 3 studies',
      },
      {
        riskId: 'RISK-002',
        description: 'Allergic reaction to device materials',
        severity: 'medium',
        cerSections: ['Safety Analysis'],
        ctqFactors: ['CTQ-002'],
        residualRiskStatus: 'Acceptable',
        evidence: 'Biocompatibility testing',
      },
    ],
  };
}

async function getPmcfActivityReport(filters) {
  // Implementation for PMCF activity report
  return {
    summary: {
      totalMilestones: 8,
      completedMilestones: 3,
      upcomingMilestones: 5,
      newSafetySignals: 1,
    },
    rows: [
      {
        milestone: 'PMCF Study Initiation',
        plannedDate: '2025-03-15',
        actualDate: '2025-03-22',
        status: 'completed',
        notes: 'Delayed due to site readiness issues',
      },
      {
        milestone: 'First Interim Analysis',
        plannedDate: '2025-06-30',
        actualDate: null,
        status: 'planned',
        notes: 'On track',
      },
    ],
  };
}

async function getGsprMatrixReport(filters) {
  // Implementation for GSPR matrix report
  return {
    summary: {
      totalGsprs: 23,
      coveredGsprs: 19,
      coverageRate: 82.6,
    },
    rows: [
      {
        gsprId: 'GSPR 1',
        description: 'Devices shall achieve the performance intended by their manufacturer.',
        cerSections: ['Device Description', 'Clinical Background', 'Benefit-Risk Analysis'],
        evidenceCitations: ['Clinical study XYZ-123', 'Laboratory testing report LT-456'],
        status: 'Covered',
      },
      {
        gsprId: 'GSPR 8',
        description:
          'All known and foreseeable risks and undesirable side-effects shall be minimized.',
        cerSections: ['Risk Assessment', 'Safety Analysis'],
        evidenceCitations: [
          'Risk management file RM-789',
          'Post-market surveillance report PMS-101',
        ],
        status: 'Covered',
      },
    ],
  };
}

async function getLiteratureSearchAuditReport(filters) {
  // Implementation for literature search audit report
  return {
    summary: {
      totalRecords: 428,
      afterDuplicates: 315,
      afterScreening: 87,
      finalIncluded: 24,
    },
    rows: [
      {
        database: 'PubMed',
        searchDate: '2025-02-15',
        searchQuery: 'implantable device AND (safety OR efficacy)',
        recordsFound: 215,
        included: 18,
      },
      {
        database: 'Embase',
        searchDate: '2025-02-15',
        searchQuery: 'implantable device AND (safety OR efficacy)',
        recordsFound: 198,
        included: 12,
      },
    ],
  };
}

async function getUserActivityReport(filters) {
  // Implementation for user activity report
  return {
    summary: {
      totalUsers: 5,
      totalActions: 87,
      signatureEvents: 8,
    },
    rows: [
      {
        timestamp: '2025-05-07T09:15:22Z',
        user: 'john.doe@example.com',
        role: 'Clinical Specialist',
        action: 'edit',
        section: 'Literature Review',
        details: 'Updated inclusion criteria',
      },
      {
        timestamp: '2025-05-07T14:22:45Z',
        user: 'jane.smith@example.com',
        role: 'Regulatory Affairs',
        action: 'sign',
        section: 'Device Description',
        details: 'Approved section content',
      },
    ],
  };
}

async function getAiPerformanceReport(filters) {
  // Implementation for AI performance report
  return {
    summary: {
      averageConfidence: 87.5,
      lowConfidenceSections: 2,
      totalSections: 9,
    },
    rows: [
      {
        section: 'Literature Review',
        confidence: 94.2,
        citationsCount: 18,
        wordCount: 2450,
        modelVersion: 'gpt-4o',
        lastGenerated: '2025-05-01T14:30:22Z',
      },
      {
        section: 'Clinical Background',
        confidence: 88.7,
        citationsCount: 12,
        wordCount: 1850,
        modelVersion: 'gpt-4o',
        lastGenerated: '2025-05-02T09:15:45Z',
      },
      {
        section: 'Risk Assessment',
        confidence: 65.3,
        citationsCount: 5,
        wordCount: 1200,
        modelVersion: 'gpt-4o',
        lastGenerated: '2025-05-03T11:22:18Z',
        flagged: true,
        flagReason: 'Confidence below threshold',
      },
    ],
  };
}

async function getExportHistoryReport(filters) {
  // Implementation for export history report
  return {
    summary: {
      totalExports: 12,
      latestVersion: '2.4',
      avgFileSizeMb: 3.2,
    },
    rows: [
      {
        timestamp: '2025-05-01T10:15:30Z',
        user: 'john.doe@example.com',
        version: '2.4',
        format: 'PDF',
        fileSizeMb: 3.5,
        sections: 9,
        changesFromPrevious: '+2 sections, 1500 words added',
      },
      {
        timestamp: '2025-04-15T14:22:45Z',
        user: 'jane.smith@example.com',
        version: '2.3',
        format: 'DOCX',
        fileSizeMb: 2.8,
        sections: 7,
        changesFromPrevious: 'Updated PMS data, +500 words',
      },
    ],
  };
}

// For ESM compatibility
export default router;
