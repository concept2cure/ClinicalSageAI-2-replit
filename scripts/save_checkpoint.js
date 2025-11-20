const fs = require('fs');
const path = require('path');

function createCheckpoint(description) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const checkpointDir = `checkpoints/${timestamp}_${description}`;

  // Critical directories to backup
  const criticalPaths = ['client/src/components', 'client/src/pages', 'server/routes', 'shared'];

  criticalPaths.forEach(srcPath => {
    if (fs.existsSync(srcPath)) {
      const destPath = path.join(checkpointDir, srcPath);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.cpSync(srcPath, destPath, { recursive: true });
    }
  });

  console.log(`Checkpoint saved: ${checkpointDir}`);
}

// Usage: node scripts/save_checkpoint.js "description"
if (process.argv[2]) {
  createCheckpoint(process.argv[2]);
}
