const fs = require('fs');
const path = require('path');

function generateTestSummary() {
  let summary = '';

  // Backend test results
  if (fs.existsSync('coverage/lcov-report/index.html')) {
    const coverage = JSON.parse(fs.readFileSync('coverage/coverage-summary.json', 'utf8'));
    const total = coverage.total;

    summary += `### Backend Tests\n`;
    summary += `- **Lines Coverage**: ${total.lines.pct}%\n`;
    summary += `- **Functions Coverage**: ${total.functions.pct}%\n`;
    summary += `- **Branches Coverage**: ${total.branches.pct}%\n`;
    summary += `- **Statements Coverage**: ${total.statements.pct}%\n\n`;
  }

  // Security audit results
  if (fs.existsSync('eslint-security.json')) {
    const security = JSON.parse(fs.readFileSync('eslint-security.json', 'utf8'));
    const totalIssues = security.reduce(
      (sum, file) => sum + file.errorCount + file.warningCount,
      0
    );

    summary += `### Security Audit\n`;
    summary += `- **Total Issues**: ${totalIssues}\n`;
    if (totalIssues === 0) {
      summary += `- **Status**: ✅ No security issues found\n\n`;
    } else {
      summary += `- **Status**: ⚠️ Security issues detected\n\n`;
    }
  }

  // Performance results
  if (fs.existsSync('lighthouse-report.json')) {
    const lighthouse = JSON.parse(fs.readFileSync('lighthouse-report.json', 'utf8'));

    summary += `### Performance Metrics\n`;
    summary += `- **Performance Score**: ${Math.round(lighthouse.categories.performance.score * 100)}/100\n`;
    summary += `- **Accessibility Score**: ${Math.round(lighthouse.categories.accessibility.score * 100)}/100\n`;
    summary += `- **Best Practices Score**: ${Math.round(lighthouse.categories['best-practices'].score * 100)}/100\n`;
    summary += `- **SEO Score**: ${Math.round(lighthouse.categories.seo.score * 100)}/100\n\n`;
  }

  console.log(summary);
}

generateTestSummary();
