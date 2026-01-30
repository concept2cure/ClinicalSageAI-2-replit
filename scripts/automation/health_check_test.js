/**
 * Direct Health Check Test
 * Test the operational health monitor directly
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const OperationalHealthMonitor = require('./operational_health_monitor');

async function runHealthCheckTest() {
  logger.info('🔍 Running Direct Health Check Test...\n');

  try {
    const healthMonitor = new OperationalHealthMonitor();

    // Run comprehensive health check
    logger.info('⚡ Starting comprehensive health check...');
    const healthReport = await healthMonitor.runComprehensiveHealthCheck();

    logger.info('\n📊 HEALTH CHECK RESULTS:');
    logger.info('========================');
    logger.info(`Overall Status: ${healthReport.overallStatus.toUpperCase()}`);
    logger.info(`Timestamp: ${healthReport.timestamp}`);
    logger.info(`Total Alerts: ${healthReport.alerts.length}`);
    logger.info(
      `Critical Alerts: ${healthReport.alerts.filter(a => a.severity === 'critical').length}`
    );
    logger.info(
      `Warning Alerts: ${healthReport.alerts.filter(a => a.severity === 'warning').length}`
    );

    logger.info('\n🔧 COMPONENT STATUS:');
    logger.info('===================');
    logger.info(`System Health: ${healthReport.details.systemHealth.status}`);
    logger.info(`Document Pipeline: ${healthReport.details.documentPipeline.status}`);
    logger.info(`Database Health: ${healthReport.details.databaseHealth.status}`);
    logger.info(`NLP Services: ${healthReport.details.nlpServices.status}`);
    logger.info(`Audit Trail: ${healthReport.details.auditTrail.status}`);

    if (healthReport.details.systemHealth.status === 'healthy') {
      logger.info('\n💾 SYSTEM METRICS:');
      logger.info('==================');
      const system = healthReport.details.systemHealth;
      logger.info(`Process Uptime: ${(system.process.uptime / 3600).toFixed(1)} hours`);
      logger.info(`Memory Usage: ${(system.process.memoryUsage.rss / 1024 / 1024).toFixed(1)} MB`);
      logger.info(`Temp Files: ${system.disk.fileCount}`);
      logger.info(`Response Time: ${system.responseTime}ms`);
    }

    if (healthReport.details.databaseHealth.status === 'healthy') {
      logger.info('\n🗄️ DATABASE INTEGRITY:');
      logger.info('======================');
      const db = healthReport.details.databaseHealth;
      logger.info(`Connection: Healthy`);
      logger.info(`Query Response Time: ${db.queryResponseTime}ms`);
      logger.info(`Knowledge Graph Relations: ${db.integrityChecks.knowledgeGraphRelations}`);
      logger.info(`NLP Extractions: ${db.integrityChecks.nlpExtractions}`);
      logger.info(`NLP Summaries: ${db.integrityChecks.nlpSummaries}`);
      logger.info(`NLP Q&A Results: ${db.integrityChecks.nlpQaResults}`);
      logger.info(`Null Tenant Documents: ${db.integrityChecks.nullTenantDocuments}`);
      logger.info(`Duplicate Latest Versions: ${db.integrityChecks.duplicateLatestVersions}`);
    }

    if (healthReport.details.documentPipeline.status === 'healthy') {
      logger.info('\n📄 DOCUMENT PIPELINE:');
      logger.info('=====================');
      const pipeline = healthReport.details.documentPipeline;
      logger.info(`Endpoint Responsive: ${pipeline.endpointResponsive}`);
      logger.info(`Recent Ingestions: ${pipeline.recentIngestions.total}`);
      logger.info(`Success Rate: ${(pipeline.recentIngestions.successRate * 100).toFixed(1)}%`);
      logger.info(`Avg Processing Time: ${pipeline.recentIngestions.avgProcessingTimeMs}ms`);
    }

    if (healthReport.alerts.length > 0) {
      logger.info('\n⚠️ ACTIVE ALERTS:');
      logger.info('=================');
      healthReport.alerts.forEach(alert => {
        logger.info(`[${alert.severity.toUpperCase()}] ${alert.type}: ${alert.message}`);
      });
    }

    if (healthReport.recommendations.length > 0) {
      logger.info('\n💡 RECOMMENDATIONS:');
      logger.info('==================');
      healthReport.recommendations.forEach((rec, index) => {
        logger.info(`${index + 1}. ${rec}`);
      });
    }

    logger.info('\n✅ Health Check Test Complete');
  } catch (error) {
    logger.error('❌ Health Check Test Failed:', error.message);
    logger.error('Stack:', error.stack);
  }
}

runHealthCheckTest();
