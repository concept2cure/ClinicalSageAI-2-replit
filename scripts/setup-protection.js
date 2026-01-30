
#!/usr/bin/env node

/**
 * Setup Protection Script
 * Configures all protection measures for the project
 */

const fs = require('fs');
const { execSync } = require('child_process');

logger.info('🛡️  Setting up comprehensive project protection...\n');

// 1. Initialize AI Agent Protection
logger.info('1. Initializing AI Agent Protection...');
try {
    require('./ai-agent-protection.js');
    logger.info('   ✅ AI Agent Protection initialized');
} catch (error) {
    logger.info('   ❌ Failed to initialize AI Agent Protection:', error.message);
}

// 2. Create necessary directories
logger.info('\n2. Creating protection directories...');
const dirs = ['logs', 'backups/ai-protection', 'scripts'];
dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`   ✅ Created ${dir}`);
    } else {
        logger.info(`   ✅ ${dir} already exists`);
    }
});

// 3. Set up git hooks
logger.info('\n3. Setting up git hooks...');
try {
    if (fs.existsSync('.git')) {
        const hookPath = '.git/hooks/pre-commit';
        const hookContent = `#!/bin/bash
exec < /dev/tty
bash scripts/pre-commit-protection.sh
`;
        fs.writeFileSync(hookPath, hookContent);
        execSync(`chmod +x ${hookPath}`);
        logger.info('   ✅ Pre-commit hook installed');
    } else {
        logger.info('   ⚠️  No git repository found, skipping git hooks');
    }
} catch (error) {
    logger.info('   ❌ Failed to set up git hooks:', error.message);
}

// 4. Create monitoring service
logger.info('\n4. Creating monitoring service...');
const monitoringScript = `#!/usr/bin/env node

// File Monitoring Service
const AIAgentProtection = require('./ai-agent-protection.js');
const protection = new AIAgentProtection();

logger.info('🔍 Starting file monitoring service...');
protection.startMonitoring(30000); // Check every 30 seconds

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('\\n🛑 Monitoring service stopped');
    process.exit(0);
});
`;

fs.writeFileSync('scripts/monitor-files.js', monitoringScript);
logger.info('   ✅ Monitoring service created');

// 5. Create package.json scripts
logger.info('\n5. Adding protection scripts to package.json...');
try {
    if (fs.existsSync('package.json')) {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        
        if (!packageJson.scripts) {
            packageJson.scripts = {};
        }
        
        packageJson.scripts['protect:check'] = 'node scripts/ai-agent-protection.js check';
        packageJson.scripts['protect:monitor'] = 'node scripts/monitor-files.js';
        packageJson.scripts['protect:audit'] = 'node scripts/development-best-practices-audit.js';
        packageJson.scripts['protect:restore'] = 'node scripts/ai-agent-protection.js restore';
        
        fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
        logger.info('   ✅ Protection scripts added to package.json');
    }
} catch (error) {
    logger.info('   ❌ Failed to update package.json:', error.message);
}

// 6. Run initial audit
logger.info('\n6. Running initial development audit...');
try {
    const BestPracticesAuditor = require('./development-best-practices-audit.js');
    const auditor = new BestPracticesAuditor();
    auditor.auditProject();
} catch (error) {
    logger.info('   ❌ Failed to run initial audit:', error.message);
}

logger.info('\n🎉 Protection setup complete!');
logger.info('\n📋 Available commands:');
logger.info('   npm run protect:check    - Check file integrity');
logger.info('   npm run protect:monitor  - Start continuous monitoring');
logger.info('   npm run protect:audit    - Run development audit');
logger.info('   npm run protect:restore  - Restore a file from backup');
logger.info('\n💡 The monitoring service will run automatically and alert you of any unauthorized changes.');
