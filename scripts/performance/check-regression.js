const fs = require('fs');
const path = require('path');

// Performance thresholds
const THRESHOLDS = {
  lighthouse: {
    performance: 0.8,
    accessibility: 0.9,
    bestPractices: 0.9,
    seo: 0.8,
  },
  loadTest: {
    averageResponseTime: 2000,
    p95ResponseTime: 5000,
    errorRate: 0.01,
  },
  bundleSize: {
    maxSizeIncrease: 0.1, // 10% increase threshold
  },
};

async function checkPerformanceRegression() {
  logger.info('🔍 Checking for performance regressions...');

  let hasRegression = false;
  const issues = [];

  // Check Lighthouse scores
  if (fs.existsSync('lighthouse-report.json')) {
    const lighthouse = JSON.parse(fs.readFileSync('lighthouse-report.json', 'utf8'));

    Object.entries(THRESHOLDS.lighthouse).forEach(([category, threshold]) => {
      const score = lighthouse.categories[category]?.score || 0;
      if (score < threshold) {
        hasRegression = true;
        issues.push(`Lighthouse ${category} score ${score} below threshold ${threshold}`);
      }
    });
  }

  // Check load test results
  if (fs.existsSync('load-test-report.json')) {
    const loadTest = JSON.parse(fs.readFileSync('load-test-report.json', 'utf8'));

    const avgResponseTime = loadTest.aggregate.latency?.mean || 0;
    const p95ResponseTime = loadTest.aggregate.latency?.p95 || 0;
    const errorRate =
      loadTest.aggregate.counters?.['http.response.error'] /
        loadTest.aggregate.counters?.['http.responses'] || 0;

    if (avgResponseTime > THRESHOLDS.loadTest.averageResponseTime) {
      hasRegression = true;
      issues.push(`Average response time ${avgResponseTime}ms exceeds threshold`);
    }

    if (p95ResponseTime > THRESHOLDS.loadTest.p95ResponseTime) {
      hasRegression = true;
      issues.push(`P95 response time ${p95ResponseTime}ms exceeds threshold`);
    }

    if (errorRate > THRESHOLDS.loadTest.errorRate) {
      hasRegression = true;
      issues.push(`Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold`);
    }
  }

  // Check bundle size
  if (fs.existsSync('bundle-analysis.json')) {
    const bundleAnalysis = JSON.parse(fs.readFileSync('bundle-analysis.json', 'utf8'));
    const baselinePath = 'baseline-bundle-size.json';

    if (fs.existsSync(baselinePath)) {
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      const currentSize = bundleAnalysis.totalSize;
      const baselineSize = baseline.totalSize;
      const increase = (currentSize - baselineSize) / baselineSize;

      if (increase > THRESHOLDS.bundleSize.maxSizeIncrease) {
        hasRegression = true;
        issues.push(
          `Bundle size increased by ${(increase * 100).toFixed(2)}% (${currentSize} vs ${baselineSize})`
        );
      }
    } else {
      // Save current as baseline
      fs.writeFileSync(
        baselinePath,
        JSON.stringify({
          totalSize: bundleAnalysis.totalSize,
          timestamp: new Date().toISOString(),
        })
      );
      logger.info('📝 Saved bundle size baseline');
    }
  }

  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    hasRegression,
    issues,
    status: hasRegression ? 'FAILED' : 'PASSED',
  };

  fs.writeFileSync('performance-regression-report.json', JSON.stringify(report, null, 2));

  if (hasRegression) {
    logger.error('❌ Performance regression detected:');
    issues.forEach(issue => logger.error(`  - ${issue}`));
    process.exit(1);
  } else {
    logger.info('✅ No performance regression detected');
  }
}

checkPerformanceRegression().catch(console.error);
