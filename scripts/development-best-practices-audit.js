
#!/usr/bin/env node

/**
 * Development Best Practices Audit
 * Identifies missing best practices in the codebase
 */

const fs = require('fs');
const path = require('path');

class BestPracticesAuditor {
  constructor() {
    this.findings = [];
    this.recommendations = [];
  }

  auditProject() {
    console.log('🔍 Auditing Development Best Practices...\n');
    
    this.checkProjectStructure();
    this.checkSecurityPractices();
    this.checkTestingPractices();
    this.checkDocumentationPractices();
    this.checkCodeQualityPractices();
    this.checkDeploymentPractices();
    this.checkMonitoringPractices();
    
    this.generateReport();
  }

  checkProjectStructure() {
    console.log('📁 Checking Project Structure...');
    
    const requiredDirs = [
      'tests',
      'docs',
      'scripts',
      'logs',
      'backups'
    ];
    
    requiredDirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        this.addFinding('MISSING_DIRECTORY', `Missing ${dir} directory`, 'MEDIUM');
        this.addRecommendation(`Create ${dir} directory: mkdir -p ${dir}`);
      }
    });

    // Check for environment files
    if (!fs.existsSync('.env.example')) {
      this.addFinding('MISSING_ENV_EXAMPLE', 'Missing .env.example file', 'HIGH');
      this.addRecommendation('Create .env.example with sanitized environment variables');
    }

    console.log('   ✅ Project structure audit complete');
  }

  checkSecurityPractices() {
    console.log('🔒 Checking Security Practices...');
    
    // Check for secrets in code
    const sensitivePatterns = [
      /password\s*[:=]\s*['"]/i,
      /api[_-]?key\s*[:=]\s*['"]/i,
      /secret\s*[:=]\s*['"]/i,
      /token\s*[:=]\s*['"]/i
    ];

    this.scanForPatterns('client/src', sensitivePatterns, 'Potential hardcoded secrets');
    this.scanForPatterns('server', sensitivePatterns, 'Potential hardcoded secrets');

    // Check for HTTPS enforcement
    if (!this.checkFileContains('server/index.ts', 'helmet')) {
      this.addFinding('MISSING_HELMET', 'No security headers middleware found', 'HIGH');
      this.addRecommendation('Install and configure helmet.js for security headers');
    }

    // Check for input validation
    if (!this.checkFileContains('server', 'joi') && !this.checkFileContains('server', 'yup')) {
      this.addFinding('MISSING_VALIDATION', 'No input validation library found', 'HIGH');
      this.addRecommendation('Implement input validation using Joi or Yup');
    }

    console.log('   ✅ Security practices audit complete');
  }

  checkTestingPractices() {
    console.log('🧪 Checking Testing Practices...');
    
    const hasJest = fs.existsSync('jest.config.js') || this.checkFileContains('package.json', 'jest');
    const hasTestFiles = this.countFiles('**/*.test.js') + this.countFiles('**/*.spec.js') > 0;
    
    if (!hasJest) {
      this.addFinding('MISSING_TEST_FRAMEWORK', 'No testing framework configured', 'HIGH');
      this.addRecommendation('Configure Jest or another testing framework');
    }
    
    if (!hasTestFiles) {
      this.addFinding('NO_TESTS', 'No test files found', 'CRITICAL');
      this.addRecommendation('Write unit tests for critical components');
    }

    // Check for test coverage
    if (!this.checkFileContains('package.json', 'coverage')) {
      this.addFinding('NO_COVERAGE', 'No test coverage reporting', 'MEDIUM');
      this.addRecommendation('Add test coverage reporting to package.json scripts');
    }

    console.log('   ✅ Testing practices audit complete');
  }

  checkDocumentationPractices() {
    console.log('📚 Checking Documentation Practices...');
    
    if (!fs.existsSync('README.md') || fs.statSync('README.md').size < 1000) {
      this.addFinding('POOR_README', 'README.md is missing or minimal', 'MEDIUM');
      this.addRecommendation('Create comprehensive README with setup, usage, and deployment instructions');
    }

    if (!fs.existsSync('CHANGELOG.md')) {
      this.addFinding('NO_CHANGELOG', 'No CHANGELOG.md found', 'LOW');
      this.addRecommendation('Maintain a CHANGELOG.md for version history');
    }

    if (!fs.existsSync('CONTRIBUTING.md')) {
      this.addFinding('NO_CONTRIBUTING', 'No CONTRIBUTING.md found', 'LOW');
      this.addRecommendation('Create CONTRIBUTING.md for development guidelines');
    }

    // Check for API documentation
    if (!this.checkFileContains('server', 'swagger') && !fs.existsSync('docs/api.md')) {
      this.addFinding('NO_API_DOCS', 'No API documentation found', 'MEDIUM');
      this.addRecommendation('Document APIs using Swagger/OpenAPI or markdown');
    }

    console.log('   ✅ Documentation practices audit complete');
  }

  checkCodeQualityPractices() {
    console.log('✨ Checking Code Quality Practices...');
    
    // Check for linting
    if (!fs.existsSync('.eslintrc.js') && !fs.existsSync('.eslintrc.json')) {
      this.addFinding('NO_LINTING', 'No ESLint configuration found', 'MEDIUM');
      this.addRecommendation('Configure ESLint for code quality');
    }

    // Check for formatting
    if (!fs.existsSync('.prettierrc')) {
      this.addFinding('NO_FORMATTING', 'No Prettier configuration found', 'LOW');
      this.addRecommendation('Configure Prettier for consistent code formatting');
    }

    // Check for TypeScript
    const hasTypeScript = fs.existsSync('tsconfig.json');
    if (!hasTypeScript) {
      this.addFinding('NO_TYPESCRIPT', 'No TypeScript configuration', 'MEDIUM');
      this.addRecommendation('Consider migrating to TypeScript for better type safety');
    }

    // Check for pre-commit hooks
    if (!fs.existsSync('.husky') && !fs.existsSync('.git/hooks/pre-commit')) {
      this.addFinding('NO_PRECOMMIT', 'No pre-commit hooks configured', 'MEDIUM');
      this.addRecommendation('Set up pre-commit hooks with Husky for quality gates');
    }

    console.log('   ✅ Code quality practices audit complete');
  }

  checkDeploymentPractices() {
    console.log('🚀 Checking Deployment Practices...');
    
    // Check for CI/CD
    if (!fs.existsSync('.github/workflows') && !fs.existsSync('.replit-ci.yml')) {
      this.addFinding('NO_CICD', 'No CI/CD configuration found', 'HIGH');
      this.addRecommendation('Set up CI/CD pipeline for automated testing and deployment');
    }

    // Check for Docker
    if (!fs.existsSync('Dockerfile')) {
      this.addFinding('NO_DOCKER', 'No Dockerfile found', 'MEDIUM');
      this.addRecommendation('Consider containerizing the application with Docker');
    }

    // Check for health checks
    if (!this.checkFileContains('server', '/health')) {
      this.addFinding('NO_HEALTH_CHECK', 'No health check endpoint found', 'MEDIUM');
      this.addRecommendation('Implement health check endpoints for monitoring');
    }

    console.log('   ✅ Deployment practices audit complete');
  }

  checkMonitoringPractices() {
    console.log('📊 Checking Monitoring Practices...');
    
    // Check for logging
    if (!this.checkFileContains('server', 'winston') && !this.checkFileContains('server', 'pino')) {
      this.addFinding('NO_STRUCTURED_LOGGING', 'No structured logging found', 'MEDIUM');
      this.addRecommendation('Implement structured logging with Winston or Pino');
    }

    // Check for error tracking
    if (!this.checkFileContains('server', 'sentry') && !fs.existsSync('logs')) {
      this.addFinding('NO_ERROR_TRACKING', 'No error tracking system found', 'MEDIUM');
      this.addRecommendation('Set up error tracking with Sentry or file-based logging');
    }

    // Check for metrics
    if (!this.checkFileContains('server', 'prometheus') && !this.checkFileContains('server', 'metrics')) {
      this.addFinding('NO_METRICS', 'No application metrics found', 'LOW');
      this.addRecommendation('Consider adding application metrics collection');
    }

    console.log('   ✅ Monitoring practices audit complete');
  }

  // Helper methods
  addFinding(code, description, severity) {
    this.findings.push({ code, description, severity, timestamp: new Date() });
  }

  addRecommendation(text) {
    this.recommendations.push(text);
  }

  checkFileContains(path, pattern) {
    try {
      if (fs.statSync(path).isDirectory()) {
        return this.scanDirectoryForPattern(path, pattern);
      } else {
        const content = fs.readFileSync(path, 'utf8');
        return content.includes(pattern);
      }
    } catch (error) {
      return false;
    }
  }

  scanDirectoryForPattern(dir, pattern) {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
          if (this.scanDirectoryForPattern(filePath, pattern)) {
            return true;
          }
        } else if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.ts'))) {
          const content = fs.readFileSync(filePath, 'utf8');
          if (content.includes(pattern)) {
            return true;
          }
        }
      }
    } catch (error) {
      // Ignore errors and continue
    }
    return false;
  }

  scanForPatterns(dir, patterns, description) {
    if (!fs.existsSync(dir)) return;
    
    const scanDir = (currentDir) => {
      try {
        const files = fs.readdirSync(currentDir);
        for (const file of files) {
          const filePath = path.join(currentDir, file);
          const stat = fs.statSync(filePath);
          
          if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
            scanDir(filePath);
          } else if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.ts'))) {
            const content = fs.readFileSync(filePath, 'utf8');
            for (const pattern of patterns) {
              if (pattern.test(content)) {
                this.addFinding('SECURITY_RISK', `${description} in ${filePath}`, 'HIGH');
                break;
              }
            }
          }
        }
      } catch (error) {
        // Ignore errors and continue
      }
    };
    
    scanDir(dir);
  }

  countFiles(pattern) {
    // Simple glob-like counting (basic implementation)
    let count = 0;
    const searchDir = (dir) => {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          
          if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
            searchDir(filePath);
          } else if (stat.isFile() && (file.includes('.test.') || file.includes('.spec.'))) {
            count++;
          }
        }
      } catch (error) {
        // Ignore errors
      }
    };
    
    searchDir('.');
    return count;
  }

  generateReport() {
    console.log('\n📋 DEVELOPMENT BEST PRACTICES AUDIT REPORT');
    console.log('='.repeat(50));
    
    const criticalCount = this.findings.filter(f => f.severity === 'CRITICAL').length;
    const highCount = this.findings.filter(f => f.severity === 'HIGH').length;
    const mediumCount = this.findings.filter(f => f.severity === 'MEDIUM').length;
    const lowCount = this.findings.filter(f => f.severity === 'LOW').length;
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`   🚨 Critical: ${criticalCount}`);
    console.log(`   ⚠️  High: ${highCount}`);
    console.log(`   📋 Medium: ${mediumCount}`);
    console.log(`   💡 Low: ${lowCount}`);
    console.log(`   📝 Total: ${this.findings.length}`);
    
    if (this.findings.length > 0) {
      console.log(`\n🔍 FINDINGS:`);
      this.findings.forEach((finding, index) => {
        const icon = finding.severity === 'CRITICAL' ? '🚨' : 
                    finding.severity === 'HIGH' ? '⚠️' : 
                    finding.severity === 'MEDIUM' ? '📋' : '💡';
        console.log(`   ${index + 1}. ${icon} [${finding.severity}] ${finding.description}`);
      });
    }
    
    if (this.recommendations.length > 0) {
      console.log(`\n💡 RECOMMENDATIONS:`);
      this.recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
      });
    }
    
    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      summary: { critical: criticalCount, high: highCount, medium: mediumCount, low: lowCount },
      findings: this.findings,
      recommendations: this.recommendations
    };
    
    fs.writeFileSync('development-audit-report.json', JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: development-audit-report.json`);
    
    console.log(`\n🎯 PRIORITY ACTIONS:`);
    if (criticalCount > 0) {
      console.log(`   1. Address ${criticalCount} critical issue(s) immediately`);
    }
    if (highCount > 0) {
      console.log(`   2. Plan to fix ${highCount} high-priority issue(s) this sprint`);
    }
    if (mediumCount > 0) {
      console.log(`   3. Schedule ${mediumCount} medium-priority improvement(s) for next sprint`);
    }
  }
}

// Run audit if called directly
if (require.main === module) {
  const auditor = new BestPracticesAuditor();
  auditor.auditProject();
}

module.exports = BestPracticesAuditor;
