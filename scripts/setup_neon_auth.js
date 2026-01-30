#!/usr/bin/env node
/**
 * Neon Database Setup Script
 * 
 * This script sets up the authentication schema in the Neon database.
 * It runs the auth_schema.sql migration file.
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check for required environment variables
const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  logger.error('❌ Missing NEON_DATABASE_URL or DATABASE_URL environment variable');
  logger.error('Please set it in your .env file');
  process.exit(1);
}

const { Pool } = pg;

// Create connection pool
const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false, // Neon requires SSL
  },
});

async function setupAuthSchema() {
  logger.info('🚀 Starting Neon database setup...\n');
  
  const client = await pool.connect();

  try {
    // Read the auth schema SQL file
    const schemaPath = path.join(__dirname, '..', 'migrations', 'auth_schema.sql');
    
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at ${schemaPath}`);
    }

    logger.info('📄 Reading auth schema from:', schemaPath);
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

    // Execute the schema
    logger.info('⚙️  Executing auth schema migration...');
    await client.query(schemaSql);
    logger.info('✅ Auth schema created successfully\n');

    // Check if tables were created
    const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('auth_users', 'auth_refresh_tokens', 'auth_password_resets')
      ORDER BY table_name
    `);

    logger.info('📋 Created tables:');
    tableCheck.rows.forEach(row => {
      logger.info(`   - ${row.table_name}`);
    });

    logger.info('\n✅ Neon database setup completed successfully!');
    logger.info('\n📝 Next steps:');
    logger.info('   1. Make sure JWT_SECRET and REFRESH_TOKEN_SECRET are set in .env');
    logger.info('   2. Start your server with: npm run dev');
    logger.info('   3. Test registration endpoint: POST /api/auth/register');
    logger.info('   4. Test login endpoint: POST /api/auth/login\n');

  } catch (error) {
    logger.error('❌ Database setup failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
    logger.info('🔌 Database connection closed');
  }
}

// Run the setup
setupAuthSchema().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
