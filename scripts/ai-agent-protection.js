
#!/usr/bin/env node

/**
 * AI Agent Protection System
 * Monitors and prevents unauthorized modifications by AI agents
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AIAgentProtection {
  constructor() {
    this.protectedFiles = [
      'client/src/pages/CoAuthor.jsx',
      'client/src/pages/CERV2Page.jsx',
      'server/index.ts',
      'server/routes.ts',
      'package.json',
      '.replit',
      'replit.nix'
    ];
    
    this.checksumFile = 'scripts/.file-integrity.json';
    this.logFile = 'logs/agent-protection.log';
    this.backupDir = 'backups/ai-protection';
    
    this.initializeProtection();
  }

  initializeProtection() {
    // Ensure directories exist
    if (!fs.existsSync('logs')) fs.mkdirSync('logs', { recursive: true });
    if (!fs.existsSync(this.backupDir)) fs.mkdirSync(this.backupDir, { recursive: true });
    
    logger.info('🛡️  AI Agent Protection System Initialized');
    this.generateInitialChecksums();
  }

  generateInitialChecksums() {
    const checksums = {};
    
    this.protectedFiles.forEach(file => {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        checksums[file] = {
          hash: crypto.createHash('sha256').update(content).digest('hex'),
          size: content.length,
          lastModified: fs.statSync(file).mtime.toISOString()
        };
        
        // Create backup
        this.createBackup(file, content);
      }
    });
    
    fs.writeFileSync(this.checksumFile, JSON.stringify(checksums, null, 2));
    this.log('Initial checksums generated for protected files');
  }

  createBackup(filePath, content) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `${path.basename(filePath)}.${timestamp}.bak`);
    fs.writeFileSync(backupPath, content);
  }

  checkIntegrity() {
    if (!fs.existsSync(this.checksumFile)) {
      this.log('⚠️  No checksum file found, generating new one');
      this.generateInitialChecksums();
      return;
    }

    const storedChecksums = JSON.parse(fs.readFileSync(this.checksumFile, 'utf8'));
    const violations = [];

    this.protectedFiles.forEach(file => {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        const currentHash = crypto.createHash('sha256').update(content).digest('hex');
        
        if (storedChecksums[file] && storedChecksums[file].hash !== currentHash) {
          violations.push({
            file,
            expected: storedChecksums[file].hash,
            actual: currentHash,
            timestamp: new Date().toISOString()
          });
        }
      }
    });

    if (violations.length > 0) {
      this.handleViolations(violations);
    } else {
      this.log('✅ All protected files verified - no unauthorized changes detected');
    }

    return violations;
  }

  handleViolations(violations) {
    this.log(`🚨 UNAUTHORIZED CHANGES DETECTED IN ${violations.length} FILES:`);
    
    violations.forEach(violation => {
      this.log(`   - ${violation.file} (Modified: ${violation.timestamp})`);
      
      // Auto-restore option
      if (this.shouldAutoRestore(violation.file)) {
        this.restoreFile(violation.file);
      }
    });

    // Generate alert
    this.generateAlert(violations);
  }

  shouldAutoRestore(filePath) {
    // Critical files that should be auto-restored
    const criticalFiles = [
      'client/src/pages/CoAuthor.jsx',
      'server/index.ts'
    ];
    
    return criticalFiles.includes(filePath);
  }

  restoreFile(filePath) {
    try {
      const backupFiles = fs.readdirSync(this.backupDir)
        .filter(f => f.startsWith(path.basename(filePath)))
        .sort()
        .reverse();

      if (backupFiles.length > 0) {
        const latestBackup = path.join(this.backupDir, backupFiles[0]);
        const backupContent = fs.readFileSync(latestBackup, 'utf8');
        fs.writeFileSync(filePath, backupContent);
        
        this.log(`🔄 Auto-restored ${filePath} from backup ${backupFiles[0]}`);
        
        // Update checksum
        this.updateChecksum(filePath, backupContent);
      }
    } catch (error) {
      this.log(`❌ Failed to restore ${filePath}: ${error.message}`);
    }
  }

  updateChecksum(filePath, content) {
    const checksums = JSON.parse(fs.readFileSync(this.checksumFile, 'utf8'));
    checksums[filePath] = {
      hash: crypto.createHash('sha256').update(content).digest('hex'),
      size: content.length,
      lastModified: new Date().toISOString()
    };
    fs.writeFileSync(this.checksumFile, JSON.stringify(checksums, null, 2));
  }

  generateAlert(violations) {
    const alertContent = `
🚨 AI AGENT PROTECTION ALERT 🚨
Time: ${new Date().toISOString()}
Violations Detected: ${violations.length}

Files Modified:
${violations.map(v => `- ${v.file}`).join('\n')}

This may indicate unauthorized AI agent activity.
Check the agent-protection.log for full details.

To restore files manually:
${violations.map(v => `cp ${this.backupDir}/${path.basename(v.file)}.*.bak ${v.file}`).join('\n')}
`;

    fs.writeFileSync('AI_AGENT_ALERT.txt', alertContent);
    logger.info('🚨 ALERT: Unauthorized changes detected! Check AI_AGENT_ALERT.txt');
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(this.logFile, logEntry);
    logger.info(message);
  }

  startMonitoring(intervalMs = 30000) {
    this.log(`🔍 Starting continuous monitoring (checking every ${intervalMs/1000}s)`);
    
    setInterval(() => {
      this.checkIntegrity();
    }, intervalMs);
  }

  // Manual commands
  forceRestore(filePath) {
    if (this.protectedFiles.includes(filePath)) {
      this.restoreFile(filePath);
    } else {
      this.log(`⚠️  ${filePath} is not in protected files list`);
    }
  }

  addProtectedFile(filePath) {
    if (!this.protectedFiles.includes(filePath)) {
      this.protectedFiles.push(filePath);
      this.log(`🛡️  Added ${filePath} to protected files`);
      this.generateInitialChecksums();
    }
  }

  listProtectedFiles() {
    logger.info('🛡️  Protected Files:');
    this.protectedFiles.forEach((file, index) => {
      const exists = fs.existsSync(file) ? '✅' : '❌';
      logger.info(`   ${index + 1}. ${file} ${exists}`);
    });
  }
}

// CLI Interface
if (require.main === module) {
  const protection = new AIAgentProtection();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'check':
      protection.checkIntegrity();
      break;
    case 'monitor':
      protection.startMonitoring();
      break;
    case 'restore':
      const filePath = process.argv[3];
      if (filePath) {
        protection.forceRestore(filePath);
      } else {
        logger.info('Usage: node ai-agent-protection.js restore <file-path>');
      }
      break;
    case 'add':
      const newFile = process.argv[3];
      if (newFile) {
        protection.addProtectedFile(newFile);
      } else {
        logger.info('Usage: node ai-agent-protection.js add <file-path>');
      }
      break;
    case 'list':
      protection.listProtectedFiles();
      break;
    default:
      logger.info(`
AI Agent Protection System

Commands:
  check     - Check file integrity once
  monitor   - Start continuous monitoring
  restore   - Restore a specific file from backup
  add       - Add a file to protection list
  list      - List all protected files

Examples:
  node scripts/ai-agent-protection.js check
  node scripts/ai-agent-protection.js monitor
  node scripts/ai-agent-protection.js restore client/src/pages/CoAuthor.jsx
  node scripts/ai-agent-protection.js add client/src/components/NewComponent.jsx
      `);
  }
}

module.exports = AIAgentProtection;
