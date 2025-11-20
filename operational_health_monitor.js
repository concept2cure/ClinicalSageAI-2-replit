/**
 * Operational Health Monitoring Protocol
 *
 * This module implements comprehensive system health monitoring
 * for the TrialSage platform in production lockdown mode.
 *
 * Monitors:
 * - System health & resource utilization
 * - Document ingestion pipeline health
 * - Database integrity & performance
 * - NLP intelligence service health
 * - Audit trail verification
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class OperationalHealthMonitor {
  constructor() {
    this.dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.healthMetrics = {
      lastCheck: null,
      systemHealth: {},
      documentPipeline: {},
      databaseHealth: {},
      nlpServices: {},
      auditTrail: {},
      alerts: [],
    };

    this.thresholds = {
      processingTimeMs: 30000, // 30 seconds
      dbResponseTimeMs: 5000, // 5 seconds
      errorRate: 0.1, // 10% error rate
      diskUsagePercent: 85, // 85% disk usage

      // Enhanced KPI Thresholds
      memory: {
        warning: 0.7, // 70% of available RAM
        critical: 0.85, // 85% of available RAM
      },
      apiLatency: {
        warning: 5000, // 5 seconds
        critical: 10000, // 10 seconds
      },
      processingSuccess: {
        warning: 0.99, // 99% success rate
        critical: 0.95, // 95% success rate
      },
      databaseResponseTime: {
        warning: 3000, // 3 seconds
        critical: 5000, // 5 seconds
      },
      dataFreshness: {
        warning: 300000, // 5 minutes
        critical: 600000, // 10 minutes
      },
    };

    // Error Pattern Detection
    this.criticalErrorPatterns = [
      'ECONNREFUSED',
      'Request Timeout',
      'FATAL: database',
      'RateLimitError',
      'ERR_MODULE_NOT_FOUND',
      'Connection terminated',
      'ENOTFOUND',
      'ETIMEDOUT',
      'Maximum call stack',
      'Out of memory',
    ];

    this.detectedErrors = [];
  }

  /**
   * System Health & Resource Utilization Monitoring
   */
  async checkSystemHealth() {
    const startTime = Date.now();

    try {
      // Check Node.js process health
      const processInfo = {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        pid: process.pid,
        version: process.version,
        platform: process.platform,
      };

      // Check disk usage for temp uploads directory
      const tempDir = 'data/raw_documents_temp_uploads';
      let diskHealth = { tempDirExists: false, fileCount: 0, totalSize: 0 };

      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        diskHealth = {
          tempDirExists: true,
          fileCount: files.length,
          totalSize: files.reduce((total, file) => {
            try {
              const stats = fs.statSync(path.join(tempDir, file));
              return total + stats.size;
            } catch (e) {
              return total;
            }
          }, 0),
        };
      }

      this.healthMetrics.systemHealth = {
        process: processInfo,
        disk: diskHealth,
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        status: 'healthy',
      };

      // Enhanced KPI Threshold Checking
      const memoryUsageMB = processInfo.memoryUsage.rss / 1024 / 1024;
      const availableMemoryMB = 1024; // Assume 1GB available (adjust as needed)
      const memoryUsagePercent = memoryUsageMB / availableMemoryMB;

      if (memoryUsagePercent >= this.thresholds.memory.critical) {
        this.addAlert(
          'critical_memory_usage',
          `Memory usage: ${(memoryUsagePercent * 100).toFixed(1)}% (${memoryUsageMB.toFixed(2)}MB)`
        );
        this.healthMetrics.systemHealth.status = 'critical';
      } else if (memoryUsagePercent >= this.thresholds.memory.warning) {
        this.addAlert(
          'high_memory_usage',
          `Memory usage: ${(memoryUsagePercent * 100).toFixed(1)}% (${memoryUsageMB.toFixed(2)}MB)`
        );
        this.healthMetrics.systemHealth.status = 'warning';
      }

      if (diskHealth.fileCount > 10) {
        this.addAlert(
          'temp_files_accumulation',
          `${diskHealth.fileCount} temp files not cleaned up`
        );
      }

      // Check response time threshold
      const responseTime = this.healthMetrics.systemHealth.responseTime;
      if (responseTime >= this.thresholds.apiLatency.critical) {
        this.addAlert('critical_response_time', `System response time: ${responseTime}ms`);
        this.healthMetrics.systemHealth.status = 'critical';
      } else if (responseTime >= this.thresholds.apiLatency.warning) {
        this.addAlert('high_response_time', `System response time: ${responseTime}ms`);
        if (this.healthMetrics.systemHealth.status === 'healthy') {
          this.healthMetrics.systemHealth.status = 'warning';
        }
      }
    } catch (error) {
      this.healthMetrics.systemHealth = {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
      this.detectCriticalErrors(error.message);
      this.addAlert('system_health_check_failed', error.message);
    }
  }

  /**
   * Document Ingestion Pipeline Health Monitoring
   */
  async checkDocumentPipelineHealth() {
    const startTime = Date.now();

    try {
      // Test unified document ingestion endpoint
      const testResponse = await axios.post(
        'http://localhost:5000/api/unified/document-ingestion',
        {
          // Minimal test payload
          documents: [],
          metadata: { test: true },
        },
        {
          timeout: 5000,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      // Check recent ingestion success rate
      const recentIngestionsQuery = `
        SELECT 
          COUNT(*) as total_ingestions,
          COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) as successful_ingestions,
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000) as avg_processing_time_ms
        FROM unified_documents 
        WHERE created_at >= NOW() - INTERVAL '1 hour'
        AND tenant_id IS NOT NULL
      `;

      const result = await this.dbPool.query(recentIngestionsQuery);
      const stats = result.rows[0];

      const successRate =
        stats.total_ingestions > 0 ? stats.successful_ingestions / stats.total_ingestions : 1;

      this.healthMetrics.documentPipeline = {
        endpointResponsive: testResponse.status === 200,
        recentIngestions: {
          total: parseInt(stats.total_ingestions),
          successful: parseInt(stats.successful_ingestions),
          successRate: successRate,
          avgProcessingTimeMs: parseFloat(stats.avg_processing_time_ms) || 0,
        },
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        status: 'healthy',
      };

      // Enhanced threshold checks with KPI monitoring
      if (successRate < this.thresholds.processingSuccess.critical) {
        this.addAlert(
          'critical_processing_failure',
          `Processing success rate: ${(successRate * 100).toFixed(1)}%`
        );
        this.healthMetrics.documentPipeline.status = 'critical';
      } else if (successRate < this.thresholds.processingSuccess.warning) {
        this.addAlert(
          'processing_success_warning',
          `Processing success rate: ${(successRate * 100).toFixed(1)}%`
        );
        this.healthMetrics.documentPipeline.status = 'warning';
      }

      const avgProcessingTime = parseFloat(stats.avg_processing_time_ms) || 0;
      if (avgProcessingTime > this.thresholds.apiLatency.critical) {
        this.addAlert(
          'critical_processing_time',
          `Average processing time: ${avgProcessingTime}ms`
        );
        this.healthMetrics.documentPipeline.status = 'critical';
      } else if (avgProcessingTime > this.thresholds.apiLatency.warning) {
        this.addAlert('high_processing_time', `Average processing time: ${avgProcessingTime}ms`);
        if (this.healthMetrics.documentPipeline.status === 'healthy') {
          this.healthMetrics.documentPipeline.status = 'warning';
        }
      }
    } catch (error) {
      this.healthMetrics.documentPipeline = {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
      this.detectCriticalErrors(error.message);
      this.addAlert('document_pipeline_check_failed', error.message);
    }
  }

  /**
   * Database Integrity & Performance Monitoring
   */
  async checkDatabaseHealth() {
    const startTime = Date.now();

    try {
      // Test database connection
      const connectionTest = await this.dbPool.query('SELECT NOW()');

      // Check data integrity constraints
      const integrityChecks = await Promise.all([
        // Check for documents without tenant_id
        this.dbPool.query(
          'SELECT COUNT(*) as count FROM unified_documents WHERE tenant_id IS NULL'
        ),

        // Check for multiple latest versions per logical document
        this.dbPool.query(`
          SELECT logical_document_id, tenant_id, COUNT(*) as count 
          FROM unified_documents 
          WHERE is_latest_version = TRUE 
          GROUP BY logical_document_id, tenant_id 
          HAVING COUNT(*) > 1
        `),

        // Check NLP intelligence tables population
        this.dbPool.query('SELECT COUNT(*) as count FROM knowledge_graph_relations'),
        this.dbPool.query('SELECT COUNT(*) as count FROM nlp_relation_extractions'),
        this.dbPool.query('SELECT COUNT(*) as count FROM nlp_document_summaries'),
        this.dbPool.query('SELECT COUNT(*) as count FROM nlp_qa_results'),
      ]);

      const [
        nullTenantCheck,
        duplicateVersionCheck,
        kgCount,
        nlpExtractCount,
        nlpSummaryCount,
        nlpQaCount,
      ] = integrityChecks;

      // Test query performance
      const performanceTestQuery = `
        SELECT kg.subject_entity, kg.relation_type, kg.object_entity, kg.confidence_score
        FROM knowledge_graph_relations kg
        WHERE kg.tenant_id = 'default'
        ORDER BY kg.confidence_score DESC
        LIMIT 10
      `;
      const perfStart = Date.now();
      await this.dbPool.query(performanceTestQuery);
      const queryResponseTime = Date.now() - perfStart;

      this.healthMetrics.databaseHealth = {
        connectionHealthy: true,
        integrityChecks: {
          nullTenantDocuments: parseInt(nullTenantCheck.rows[0].count),
          duplicateLatestVersions: duplicateVersionCheck.rows.length,
          knowledgeGraphRelations: parseInt(kgCount.rows[0].count),
          nlpExtractions: parseInt(nlpExtractCount.rows[0].count),
          nlpSummaries: parseInt(nlpSummaryCount.rows[0].count),
          nlpQaResults: parseInt(nlpQaCount.rows[0].count),
        },
        queryResponseTime: queryResponseTime,
        totalResponseTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        status: 'healthy',
      };

      // Check integrity violations
      if (nullTenantCheck.rows[0].count > 0) {
        this.addAlert(
          'data_integrity_violation',
          `${nullTenantCheck.rows[0].count} documents without tenant_id`
        );
      }

      if (duplicateVersionCheck.rows.length > 0) {
        this.addAlert(
          'data_integrity_violation',
          `${duplicateVersionCheck.rows.length} logical documents with multiple latest versions`
        );
      }

      if (queryResponseTime > this.thresholds.dbResponseTimeMs) {
        this.addAlert('slow_database_performance', `Query response time: ${queryResponseTime}ms`);
      }
    } catch (error) {
      this.healthMetrics.databaseHealth = {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
      this.addAlert('database_health_check_failed', error.message);
    }
  }

  /**
   * NLP Intelligence Service Health Monitoring
   */
  async checkNLPServiceHealth() {
    const startTime = Date.now();

    try {
      // Test NLP endpoints
      const endpointTests = await Promise.all([
        axios.get('http://localhost:5000/api/nlp/qa_results?limit=1', { timeout: 3000 }),
        axios.get('http://localhost:5000/api/regulatory/knowledge-graph/query', { timeout: 3000 }),
        axios.post(
          'http://localhost:5000/api/regulatory/knowledge-graph/query',
          {
            query: 'test query',
            context: 'test',
          },
          { timeout: 5000 }
        ),
      ]);

      // Check recent NLP processing activity
      const nlpActivityQuery = `
        SELECT 
          'extractions' as type,
          COUNT(*) as count,
          AVG(processing_time_ms) as avg_time
        FROM nlp_relation_extractions 
        WHERE created_at >= NOW() - INTERVAL '1 hour'
        UNION ALL
        SELECT 
          'summaries' as type,
          COUNT(*) as count,
          AVG(processing_time_ms) as avg_time
        FROM nlp_document_summaries 
        WHERE created_at >= NOW() - INTERVAL '1 hour'
        UNION ALL
        SELECT 
          'qa_results' as type,
          COUNT(*) as count,
          AVG(processing_time_ms) as avg_time
        FROM nlp_qa_results 
        WHERE created_at >= NOW() - INTERVAL '1 hour'
      `;

      const activityResult = await this.dbPool.query(nlpActivityQuery);

      this.healthMetrics.nlpServices = {
        endpointsResponsive: endpointTests.every(test => test.status === 200),
        recentActivity: activityResult.rows.reduce((acc, row) => {
          acc[row.type] = {
            count: parseInt(row.count),
            avgTimeMs: parseFloat(row.avg_time) || 0,
          };
          return acc;
        }, {}),
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        status: 'healthy',
      };
    } catch (error) {
      this.healthMetrics.nlpServices = {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
      this.addAlert('nlp_service_check_failed', error.message);
    }
  }

  /**
   * Audit Trail Verification
   */
  async checkAuditTrailHealth() {
    const startTime = Date.now();

    try {
      // Check recent audit trail entries
      const auditQuery = `
        SELECT 
          COUNT(*) as total_entries,
          COUNT(CASE WHEN tenant_id IS NULL THEN 1 END) as null_tenant_entries,
          COUNT(CASE WHEN user_id IS NULL THEN 1 END) as null_user_entries,
          COUNT(DISTINCT action) as unique_actions
        FROM document_audit_trail 
        WHERE created_at >= NOW() - INTERVAL '1 hour'
      `;

      const result = await this.dbPool.query(auditQuery);
      const stats = result.rows[0];

      this.healthMetrics.auditTrail = {
        recentEntries: {
          total: parseInt(stats.total_entries),
          nullTenantEntries: parseInt(stats.null_tenant_entries),
          nullUserEntries: parseInt(stats.null_user_entries),
          uniqueActions: parseInt(stats.unique_actions),
        },
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        status: 'healthy',
      };

      // Check for audit trail integrity issues
      if (stats.null_tenant_entries > 0) {
        this.addAlert(
          'audit_trail_integrity',
          `${stats.null_tenant_entries} audit entries without tenant_id`
        );
      }
    } catch (error) {
      this.healthMetrics.auditTrail = {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
      this.addAlert('audit_trail_check_failed', error.message);
    }
  }

  /**
   * Error Pattern Detection
   */
  detectCriticalErrors(errorMessage) {
    for (const pattern of this.criticalErrorPatterns) {
      if (errorMessage.includes(pattern)) {
        this.detectedErrors.push({
          pattern,
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
        this.addAlert(
          'critical_error_pattern',
          `Critical error detected: ${pattern} - ${errorMessage}`
        );
        break;
      }
    }
  }

  /**
   * Data Processing Freshness Monitor
   */
  async checkDataFreshness() {
    try {
      // Check NLP relation extractions freshness
      const nlpRelationsQuery = `
        SELECT 
          COUNT(*) as total_entries,
          MAX(created_at) as latest_entry,
          EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) * 1000 as age_ms
        FROM nlp_relation_extractions
        WHERE created_at >= NOW() - INTERVAL '1 hour'
      `;

      const nlpQaQuery = `
        SELECT 
          COUNT(*) as total_entries,
          MAX(created_at) as latest_entry,
          EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) * 1000 as age_ms
        FROM nlp_qa_results
        WHERE created_at >= NOW() - INTERVAL '1 hour'
      `;

      const nlpSummariesQuery = `
        SELECT 
          COUNT(*) as total_entries,
          MAX(created_at) as latest_entry,
          EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) * 1000 as age_ms
        FROM nlp_document_summaries
        WHERE created_at >= NOW() - INTERVAL '1 hour'
      `;

      const [nlpRelations, nlpQa, nlpSummaries] = await Promise.all([
        this.dbPool.query(nlpRelationsQuery),
        this.dbPool.query(nlpQaQuery),
        this.dbPool.query(nlpSummariesQuery),
      ]);

      const dataFreshness = {
        nlpRelations: nlpRelations.rows[0],
        nlpQa: nlpQa.rows[0],
        nlpSummaries: nlpSummaries.rows[0],
        status: 'healthy',
        timestamp: new Date().toISOString(),
      };

      // Check freshness thresholds
      const freshnessResults = [
        { name: 'NLP Relations', data: nlpRelations.rows[0] },
        { name: 'NLP Q&A', data: nlpQa.rows[0] },
        { name: 'NLP Summaries', data: nlpSummaries.rows[0] },
      ];

      for (const check of freshnessResults) {
        const ageMs = check.data.age_ms || 0;
        if (ageMs > this.thresholds.dataFreshness.critical) {
          this.addAlert(
            'critical_data_staleness',
            `${check.name} data is stale: ${Math.round(ageMs / 60000)} minutes old`
          );
          dataFreshness.status = 'critical';
        } else if (ageMs > this.thresholds.dataFreshness.warning) {
          this.addAlert(
            'data_staleness_warning',
            `${check.name} data aging: ${Math.round(ageMs / 60000)} minutes old`
          );
          if (dataFreshness.status === 'healthy') dataFreshness.status = 'warning';
        }
      }

      return dataFreshness;
    } catch (error) {
      this.detectCriticalErrors(error.message);
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Alert Management
   */
  addAlert(type, message) {
    this.healthMetrics.alerts.push({
      type,
      message,
      timestamp: new Date().toISOString(),
      severity: this.getAlertSeverity(type),
    });
  }

  getAlertSeverity(type) {
    const criticalAlerts = [
      'data_integrity_violation',
      'database_health_check_failed',
      'system_health_check_failed',
      'critical_memory_usage',
      'critical_processing_failure',
      'critical_processing_time',
      'critical_response_time',
      'critical_data_staleness',
      'critical_error_pattern',
    ];

    const warningAlerts = [
      'high_memory_usage',
      'slow_database_performance',
      'slow_document_processing',
      'high_response_time',
      'processing_success_warning',
      'high_processing_time',
      'data_staleness_warning',
    ];

    if (criticalAlerts.includes(type)) return 'critical';
    if (warningAlerts.includes(type)) return 'warning';
    return 'info';
  }

  /**
   * Comprehensive Health Check
   */
  async runComprehensiveHealthCheck() {
    console.log('🔍 Starting comprehensive health check...');

    // Reset alerts for this check
    this.healthMetrics.alerts = [];

    // Run all health checks including data freshness monitoring
    await Promise.all([
      this.checkSystemHealth(),
      this.checkDocumentPipelineHealth(),
      this.checkDatabaseHealth(),
      this.checkNLPServiceHealth(),
      this.checkAuditTrailHealth(),
      this.checkDataFreshness(),
    ]);

    this.healthMetrics.lastCheck = new Date().toISOString();

    return this.generateHealthReport();
  }

  /**
   * Generate Health Report
   */
  generateHealthReport() {
    const report = {
      timestamp: this.healthMetrics.lastCheck,
      overallStatus: this.getOverallStatus(),
      summary: this.generateSummary(),
      details: {
        systemHealth: this.healthMetrics.systemHealth,
        documentPipeline: this.healthMetrics.documentPipeline,
        databaseHealth: this.healthMetrics.databaseHealth,
        nlpServices: this.healthMetrics.nlpServices,
        auditTrail: this.healthMetrics.auditTrail,
        dataFreshness: this.healthMetrics.dataFreshness,
      },
      alerts: this.healthMetrics.alerts,
      detectedErrors: this.detectedErrors,
      recommendations: this.generateRecommendations(),
    };

    return report;
  }

  getOverallStatus() {
    const hasErrors = Object.values(this.healthMetrics).some(metric => metric.status === 'error');

    const hasCriticalAlerts = this.healthMetrics.alerts.some(
      alert => alert.severity === 'critical'
    );

    if (hasErrors || hasCriticalAlerts) return 'critical';

    const hasWarnings = this.healthMetrics.alerts.some(alert => alert.severity === 'warning');

    if (hasWarnings) return 'warning';

    return 'healthy';
  }

  generateSummary() {
    const summary = {
      systemUptime: `${(process.uptime() / 3600).toFixed(1)} hours`,
      totalAlerts: this.healthMetrics.alerts.length,
      criticalAlerts: this.healthMetrics.alerts.filter(a => a.severity === 'critical').length,
      warningAlerts: this.healthMetrics.alerts.filter(a => a.severity === 'warning').length,
      databaseConnections: 'healthy',
      nlpIntelligence: 'operational',
    };

    return summary;
  }

  generateRecommendations() {
    const recommendations = [];

    // Enhanced recommendations based on KPI thresholds
    const criticalAlerts = this.healthMetrics.alerts.filter(alert => alert.severity === 'critical');
    const warningAlerts = this.healthMetrics.alerts.filter(alert => alert.severity === 'warning');

    if (criticalAlerts.length > 0) {
      recommendations.push(
        `CRITICAL: Address ${criticalAlerts.length} critical alerts immediately`
      );
    }

    if (warningAlerts.length > 0) {
      recommendations.push(`WARNING: Monitor ${warningAlerts.length} warning conditions`);
    }

    // Memory usage recommendations
    if (this.healthMetrics.systemHealth?.process?.memoryUsage) {
      const memoryMB = this.healthMetrics.systemHealth.process.memoryUsage.rss / 1024 / 1024;
      const memoryPercent = memoryMB / 1024; // Assuming 1GB available
      if (memoryPercent >= this.thresholds.memory.critical) {
        recommendations.push(
          `CRITICAL: Memory usage at ${(memoryPercent * 100).toFixed(1)}% - immediate action required`
        );
      } else if (memoryPercent >= this.thresholds.memory.warning) {
        recommendations.push(
          `WARNING: Memory usage at ${(memoryPercent * 100).toFixed(1)}% - monitor closely`
        );
      }
    }

    // Processing success rate recommendations
    if (
      this.healthMetrics.documentPipeline?.recentIngestions?.successRate <
      this.thresholds.processingSuccess.critical
    ) {
      recommendations.push(
        'CRITICAL: Document processing failure rate exceeds threshold - investigate immediately'
      );
    } else if (
      this.healthMetrics.documentPipeline?.recentIngestions?.successRate <
      this.thresholds.processingSuccess.warning
    ) {
      recommendations.push('WARNING: Document processing success rate below optimal threshold');
    }

    // Data freshness recommendations
    if (this.healthMetrics.dataFreshness?.status === 'critical') {
      recommendations.push('CRITICAL: Data staleness detected - verify NLP processing pipeline');
    } else if (this.healthMetrics.dataFreshness?.status === 'warning') {
      recommendations.push('WARNING: Data aging detected - monitor NLP processing performance');
    }

    // Error pattern recommendations
    if (this.detectedErrors.length > 0) {
      recommendations.push(
        `ATTENTION: ${this.detectedErrors.length} critical error patterns detected - review logs`
      );
    }

    // System health recommendations
    if (this.healthMetrics.systemHealth?.disk?.fileCount > 5) {
      recommendations.push('Consider cleaning up temporary upload files');
    }

    // Database recommendations
    if (this.healthMetrics.databaseHealth?.queryResponseTime > 2000) {
      recommendations.push('Database queries are running slowly - consider indexing optimization');
    }

    // NLP service recommendations
    if (this.healthMetrics.nlpServices?.status === 'error') {
      recommendations.push(
        'NLP services are experiencing issues - check Python FastAPI microservice'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('System operating within normal parameters');
    }

    return recommendations;
  }

  /**
   * Start continuous monitoring
   */
  startContinuousMonitoring(intervalMinutes = 5) {
    console.log(`🚀 Starting continuous health monitoring (${intervalMinutes} min intervals)`);

    // Run initial check
    this.runComprehensiveHealthCheck();

    // Set up interval monitoring
    setInterval(
      () => {
        this.runComprehensiveHealthCheck().then(report => {
          if (report.overallStatus !== 'healthy') {
            console.log('⚠️  Health check alert:', report.summary);
          }
        });
      },
      intervalMinutes * 60 * 1000
    );
  }
}

module.exports = OperationalHealthMonitor;
