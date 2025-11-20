const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SecurityScanner {
  constructor() {
    this.securityIssues = [];
    this.criticalPatterns = [
      // Hardcoded secrets
      /(?:password|passwd|pwd)\s*=\s*["'][^"']{8,}["']/gi,
      /(?:api[_-]?key|apikey)\s*=\s*["'][^"']{16,}["']/gi,
      /(?:secret|token)\s*=\s*["'][^"']{16,}["']/gi,

      // SQL injection patterns
      /\$\{[^}]*\}/g, // Template literals in SQL
      /query\s*\+\s*["']/gi,
      /WHERE\s+.*\+.*["']/gi,

      // XSS patterns
      /innerHTML\s*=\s*.*\+/gi,
      /document\.write\s*\(/gi,
      /eval\s*\(/gi,

      // Insecure randomness
      /Math\.random\(\)/gi,

      // Debug code
      /console\.log\(/gi,
      /debugger;/gi,
    ];
  }

  async scanDirectory(dirPath) {
    const files = this.getJavaScriptFiles(dirPath);

    for (const file of files) {
      await this.scanFile(file);
    }

    return this.generateReport();
  }

  getJavaScriptFiles(dirPath) {
    const files = [];
    const extensions = ['.js', '.jsx', '.ts', '.tsx'];

    function traverse(currentPath) {
      const items = fs.readdirSync(currentPath);

      for (const item of items) {
        const fullPath = path.join(currentPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && !item.includes('node_modules') && !item.includes('.git')) {
          traverse(fullPath);
        } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    }

    traverse(dirPath);
    return files;
  }

  async scanFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        this.criticalPatterns.forEach((pattern, patternIndex) => {
          const matches = line.match(pattern);
          if (matches) {
            this.securityIssues.push({
              file: filePath,
              line: index + 1,
              issue: this.getIssueDescription(patternIndex),
              severity: this.getIssueSeverity(patternIndex),
              code: line.trim(),
            });
          }
        });
      });

      // Check for specific vulnerabilities
      this.checkForInsecureHeaders(filePath, content);
      this.checkForWeakCrypto(filePath, content);
    } catch (error) {
      console.error(`Error scanning file ${filePath}:`, error.message);
    }
  }

  getIssueDescription(patternIndex) {
    const descriptions = [
      'Hardcoded password detected',
      'Hardcoded API key detected',
      'Hardcoded secret/token detected',
      'Potential SQL injection vulnerability',
      'SQL query concatenation detected',
      'Dynamic WHERE clause detected',
      'Potential XSS via innerHTML',
      'Use of document.write (XSS risk)',
      'Use of eval() function',
      'Insecure random number generation',
      'Debug console.log statement',
      'Debugger statement in production code',
    ];
    return descriptions[patternIndex] || 'Security issue detected';
  }

  getIssueSeverity(patternIndex) {
    // Critical: 0-5, High: 6-9, Medium: 10-11
    if (patternIndex <= 5) return 'Critical';
    if (patternIndex <= 9) return 'High';
    return 'Medium';
  }

  checkForInsecureHeaders(filePath, content) {
    if (filePath.includes('server') && content.includes('express')) {
      if (!content.includes('helmet')) {
        this.securityIssues.push({
          file: filePath,
          line: 1,
          issue: 'Missing security headers (helmet middleware)',
          severity: 'High',
          code: 'Express app without helmet',
        });
      }
    }
  }

  checkForWeakCrypto(filePath, content) {
    const weakCryptoPatterns = [
      /crypto\.createHash\(['"]md5['"]\)/gi,
      /crypto\.createHash\(['"]sha1['"]\)/gi,
      /bcrypt\.hash.*rounds:\s*[1-9]\b/gi,
    ];

    weakCryptoPatterns.forEach(pattern => {
      if (pattern.test(content)) {
        this.securityIssues.push({
          file: filePath,
          line: 1,
          issue: 'Weak cryptographic algorithm detected',
          severity: 'High',
          code: 'Weak crypto usage',
        });
      }
    });
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalIssues: this.securityIssues.length,
      severityBreakdown: {
        Critical: this.securityIssues.filter(i => i.severity === 'Critical').length,
        High: this.securityIssues.filter(i => i.severity === 'High').length,
        Medium: this.securityIssues.filter(i => i.severity === 'Medium').length,
      },
      issues: this.securityIssues,
    };

    // Save report
    fs.writeFileSync('security-scan-report.json', JSON.stringify(report, null, 2));

    // Console output
    console.log('\n🔒 Security Scan Results:');
    console.log(`Total Issues: ${report.totalIssues}`);
    console.log(`Critical: ${report.severityBreakdown.Critical}`);
    console.log(`High: ${report.severityBreakdown.High}`);
    console.log(`Medium: ${report.severityBreakdown.Medium}`);

    if (report.severityBreakdown.Critical > 0) {
      console.log('\n❌ Critical security issues found!');
      process.exit(1);
    }

    return report;
  }
}

// Run scanner
const scanner = new SecurityScanner();
scanner.scanDirectory('.').catch(console.error);
