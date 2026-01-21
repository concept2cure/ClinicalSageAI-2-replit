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
  console.error('❌ Missing NEON_DATABASE_URL or DATABASE_URL environment variable');
  console.error('Please set it in your .env file');
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
  console.log('🚀 Starting Neon database setup...\n');
  
  const client = await pool.connect();

  try {
    // Read the auth schema SQL file
    const schemaPath = path.join(__dirname, '..', 'migrations', 'auth_schema.sql');
    
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at ${schemaPath}`);
    }

    console.log('📄 Reading auth schema from:', schemaPath);
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

    // Execute the schema
    console.log('⚙️  Executing auth schema migration...');
    await client.query(schemaSql);
    console.log('✅ Auth schema created successfully\n');

    // Check if tables were created
    const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('auth_users', 'auth_refresh_tokens', 'auth_password_resets')
      ORDER BY table_name
    `);

    console.log('📋 Created tables:');
    tableCheck.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    console.log('\n✅ Neon database setup completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Make sure JWT_SECRET and REFRESH_TOKEN_SECRET are set in .env');
    console.log('   2. Start your server with: npm run dev');
    console.log('   3. Test registration endpoint: POST /api/auth/register');
    console.log('   4. Test login endpoint: POST /api/auth/login\n');

  } catch (error) {
    console.error('❌ Database setup failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
    console.log('🔌 Database connection closed');
  }
}

// Run the setup
setupAuthSchema().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
