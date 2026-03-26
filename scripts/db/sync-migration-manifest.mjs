import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const migrationsDir = path.join(repoRoot, 'db', 'migrations');
const manifestPath = path.join(migrationsDir, 'migrations_manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.error('migrations_manifest.json not found');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const allSqlFiles = fs
  .readdirSync(migrationsDir)
  .filter(file => file.endsWith('.sql'))
  .sort();
const checkOnly = process.argv.includes('--check');

const skipFiles = new Set(Array.isArray(manifest.skipFiles) ? manifest.skipFiles : []);
const existingOrder = Array.isArray(manifest.executionOrder) ? manifest.executionOrder : [];

const validOrdered = existingOrder.filter(file => allSqlFiles.includes(file) && !skipFiles.has(file));
const missing = allSqlFiles.filter(file => !validOrdered.includes(file) && !skipFiles.has(file));

const nextExecutionOrder = [...validOrdered, ...missing];
const totalChanged = manifest.totalMigrations !== allSqlFiles.length;
const orderChanged =
  JSON.stringify(Array.isArray(manifest.executionOrder) ? manifest.executionOrder : []) !==
  JSON.stringify(nextExecutionOrder);

if (checkOnly) {
  if (totalChanged || orderChanged) {
    console.error(
      `Manifest drift detected. orderChanged=${orderChanged} totalChanged=${totalChanged} missing=${missing.length}`
    );
    process.exit(2);
  }
  console.log('Manifest is in sync.');
  process.exit(0);
}

manifest.executionOrder = nextExecutionOrder;
manifest.totalMigrations = allSqlFiles.length;
manifest.generatedAt = new Date().toISOString();

console.log(`Manifest synced. Ordered: ${manifest.executionOrder.length}, Missing appended: ${missing.length}, Total SQL: ${allSqlFiles.length}`);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
