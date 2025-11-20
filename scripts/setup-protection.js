
#!/usr/bin/env node

/**
 * Setup Protection Script
 * Configures all protection measures for the project
 */

const fs = require('fs');
const { execSync } = require('child_process');

console.log('🛡️  Setting up comprehensive project protection...\n');

// 1. Initialize AI Agent Protection
console.log('1. Initializing AI Agent Protection...');
try {
    require('./ai-agent-protection.js');
    console.log('   ✅ AI Agent Protection initialized');
} catch (error) {
    console.log('   ❌ Failed to initialize AI Agent Protection:', error.message);
}

// 2. Create necessary directories
console.log('\n2. Creating protection directories...');
const dirs = ['logs', 'backups/ai-protection', 'scripts'];
dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`   ✅ Created ${dir}`);
    } else {
        console.log(`   ✅ ${dir} already exists`);
    }
});

// 3. Set up git hooks
console.log('\n3. Setting up git hooks...');
try {
    if (fs.existsSync('.git')) {
        const hookPath = '.git/hooks/pre-commit';
        const hookContent = `#!/bin/bash
exec < /dev/tty
bash scripts/pre-commit-protection.sh
`;
        fs.writeFileSync(hookPath, hookContent);
        execSync(`chmod +x ${hookPath}`);
        console.log('   ✅ Pre-commit hook installed');
    } else {
        console.log('   ⚠️  No git repository found, skipping git hooks');
    }
} catch (error) {
    console.log('   ❌ Failed to set up git hooks:', error.message);
}

// 4. Create monitoring service
console.log('\n4. Creating monitoring service...');
const monitoringScript = `#!/usr/bin/env node

// File Monitoring Service
const AIAgentProtection = require('./ai-agent-protection.js');
const protection = new AIAgentProtection();

console.log('🔍 Starting file monitoring service...');
protection.startMonitoring(30000); // Check every 30 seconds

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\\n🛑 Monitoring service stopped');
    process.exit(0);
});
`;

fs.writeFileSync('scripts/monitor-files.js', monitoringScript);
console.log('   ✅ Monitoring service created');

// 5. Create package.json scripts
console.log('\n5. Adding protection scripts to package.json...');
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
        console.log('   ✅ Protection scripts added to package.json');
    }
} catch (error) {
    console.log('   ❌ Failed to update package.json:', error.message);
}

// 6. Run initial audit
console.log('\n6. Running initial development audit...');
try {
    const BestPracticesAuditor = require('./development-best-practices-audit.js');
    const auditor = new BestPracticesAuditor();
    auditor.auditProject();
} catch (error) {
    console.log('   ❌ Failed to run initial audit:', error.message);
}

console.log('\n🎉 Protection setup complete!');
console.log('\n📋 Available commands:');
console.log('   npm run protect:check    - Check file integrity');
console.log('   npm run protect:monitor  - Start continuous monitoring');
console.log('   npm run protect:audit    - Run development audit');
console.log('   npm run protect:restore  - Restore a file from backup');
console.log('\n💡 The monitoring service will run automatically and alert you of any unauthorized changes.');
