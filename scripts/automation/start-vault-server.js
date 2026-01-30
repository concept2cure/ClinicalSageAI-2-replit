import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Get the directory of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to the vault server script
const vaultServerPath = path.join(__dirname, 'server', 'vault-server.js');

logger.info(`Starting Vault server from: ${vaultServerPath}`);

// Check if the vault server script exists
if (!fs.existsSync(vaultServerPath)) {
  logger.error(`Vault server script not found at: ${vaultServerPath}`);
  process.exit(1);
}

// Set environment variables for the vault server
const env = {
  ...process.env,
  VAULT_PORT: process.env.VAULT_PORT || '4001',
  NODE_ENV: process.env.NODE_ENV || 'development',
};

// Log the environment variables
logger.info('Vault server environment:', {
  VAULT_PORT: env.VAULT_PORT,
  NODE_ENV: env.NODE_ENV,
  SUPABASE_URL: env.SUPABASE_URL ? 'CONFIGURED' : 'MISSING',
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY ? 'CONFIGURED' : 'MISSING',
  JWT_SECRET: env.JWT_SECRET ? 'CONFIGURED' : 'MISSING',
  OPENAI_API_KEY: env.OPENAI_API_KEY ? 'CONFIGURED' : 'MISSING',
});

// Check if the vault server dependencies are installed
const nodeModulesPath = path.join(__dirname, 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  logger.error('Node modules not found. Please run "npm install" to install dependencies.');
  process.exit(1);
}

// Start the vault server as a child process
const vaultServer = spawn('node', [vaultServerPath], {
  env,
  stdio: 'inherit',
});

// Handle vault server process events
vaultServer.on('error', err => {
  logger.error('Failed to start the Vault server:', err);
  process.exit(1);
});

vaultServer.on('close', code => {
  logger.info(`Vault server process exited with code ${code}`);
  process.exit(code);
});

// Handle parent process exit
process.on('SIGINT', () => {
  logger.info('Stopping Vault server...');
  vaultServer.kill('SIGINT');
});

process.on('SIGTERM', () => {
  logger.info('Stopping Vault server...');
  vaultServer.kill('SIGTERM');
});
