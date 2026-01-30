#!/usr/bin/env node
/**
 * Verify proof_audit_logs migration was applied successfully
 */
import postgres from 'postgres';

const dbSecret = process.env.DATABASE_NEON_NEW_SECRET || '';
const url = dbSecret.replace(/^psql '/, '').replace(/'$/, '');

if (!url) {
  logger.error('DATABASE_NEON_NEW_SECRET not set');
  process.exit(1);
}

const sql = postgres(url, { ssl: 'require' });

async function verify() {
  try {
    // Check table exists
    const tables = await sql`
      SELECT tablename FROM pg_tables 
      WHERE tablename = 'proof_audit_logs'
    `;
    
    if (tables.length === 0) {
      logger.info('❌ proof_audit_logs table NOT FOUND');
      process.exit(1);
    }
    
    logger.info('✅ proof_audit_logs table EXISTS');
    
    // Check columns
    const columns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'proof_audit_logs'
      ORDER BY ordinal_position
    `;
    
    logger.info('\nTable Columns:');
    columns.forEach(col => {
      logger.info(`  - ${col.column_name}: ${col.data_type}`);
    });
    
    // Check triggers
    const triggers = await sql`
      SELECT trigger_name FROM information_schema.triggers 
      WHERE event_object_table = 'proof_audit_logs'
    `;
    
    logger.info('\nTriggers:');
    triggers.forEach(t => {
      logger.info(`  - ${t.trigger_name}`);
    });
    
    // Check RLS
    const rls = await sql`
      SELECT polname FROM pg_policies 
      WHERE tablename = 'proof_audit_logs'
    `;
    
    logger.info('\nRLS Policies:');
    rls.forEach(p => {
      logger.info(`  - ${p.polname}`);
    });
    
    logger.info('\n✅ Migration verified successfully!');
    
  } catch (error) {
    logger.error('Error:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

verify();
