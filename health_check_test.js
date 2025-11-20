/**
 * Direct Health Check Test
 * Test the operational health monitor directly
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const OperationalHealthMonitor = require('./operational_health_monitor');

async function runHealthCheckTest() {
  console.log('🔍 Running Direct Health Check Test...\n');

  try {
    const healthMonitor = new OperationalHealthMonitor();

    // Run comprehensive health check
    console.log('⚡ Starting comprehensive health check...');
    const healthReport = await healthMonitor.runComprehensiveHealthCheck();

    console.log('\n📊 HEALTH CHECK RESULTS:');
    console.log('========================');
    console.log(`Overall Status: ${healthReport.overallStatus.toUpperCase()}`);
    console.log(`Timestamp: ${healthReport.timestamp}`);
    console.log(`Total Alerts: ${healthReport.alerts.length}`);
    console.log(
      `Critical Alerts: ${healthReport.alerts.filter(a => a.severity === 'critical').length}`
    );
    console.log(
      `Warning Alerts: ${healthReport.alerts.filter(a => a.severity === 'warning').length}`
    );

    console.log('\n🔧 COMPONENT STATUS:');
    console.log('===================');
    console.log(`System Health: ${healthReport.details.systemHealth.status}`);
    console.log(`Document Pipeline: ${healthReport.details.documentPipeline.status}`);
    console.log(`Database Health: ${healthReport.details.databaseHealth.status}`);
    console.log(`NLP Services: ${healthReport.details.nlpServices.status}`);
    console.log(`Audit Trail: ${healthReport.details.auditTrail.status}`);

    if (healthReport.details.systemHealth.status === 'healthy') {
      console.log('\n💾 SYSTEM METRICS:');
      console.log('==================');
      const system = healthReport.details.systemHealth;
      console.log(`Process Uptime: ${(system.process.uptime / 3600).toFixed(1)} hours`);
      console.log(`Memory Usage: ${(system.process.memoryUsage.rss / 1024 / 1024).toFixed(1)} MB`);
      console.log(`Temp Files: ${system.disk.fileCount}`);
      console.log(`Response Time: ${system.responseTime}ms`);
    }

    if (healthReport.details.databaseHealth.status === 'healthy') {
      console.log('\n🗄️ DATABASE INTEGRITY:');
      console.log('======================');
      const db = healthReport.details.databaseHealth;
      console.log(`Connection: Healthy`);
      console.log(`Query Response Time: ${db.queryResponseTime}ms`);
      console.log(`Knowledge Graph Relations: ${db.integrityChecks.knowledgeGraphRelations}`);
      console.log(`NLP Extractions: ${db.integrityChecks.nlpExtractions}`);
      console.log(`NLP Summaries: ${db.integrityChecks.nlpSummaries}`);
      console.log(`NLP Q&A Results: ${db.integrityChecks.nlpQaResults}`);
      console.log(`Null Tenant Documents: ${db.integrityChecks.nullTenantDocuments}`);
      console.log(`Duplicate Latest Versions: ${db.integrityChecks.duplicateLatestVersions}`);
    }

    if (healthReport.details.documentPipeline.status === 'healthy') {
      console.log('\n📄 DOCUMENT PIPELINE:');
      console.log('=====================');
      const pipeline = healthReport.details.documentPipeline;
      console.log(`Endpoint Responsive: ${pipeline.endpointResponsive}`);
      console.log(`Recent Ingestions: ${pipeline.recentIngestions.total}`);
      console.log(`Success Rate: ${(pipeline.recentIngestions.successRate * 100).toFixed(1)}%`);
      console.log(`Avg Processing Time: ${pipeline.recentIngestions.avgProcessingTimeMs}ms`);
    }

    if (healthReport.alerts.length > 0) {
      console.log('\n⚠️ ACTIVE ALERTS:');
      console.log('=================');
      healthReport.alerts.forEach(alert => {
        console.log(`[${alert.severity.toUpperCase()}] ${alert.type}: ${alert.message}`);
      });
    }

    if (healthReport.recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:');
      console.log('==================');
      healthReport.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }

    console.log('\n✅ Health Check Test Complete');
  } catch (error) {
    console.error('❌ Health Check Test Failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

runHealthCheckTest();
