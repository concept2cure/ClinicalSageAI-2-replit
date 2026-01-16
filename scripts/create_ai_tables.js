#!/usr/bin/env node

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
CREATE TABLE IF NOT EXISTS ai_dead_letter_queue (
  id SERIAL PRIMARY KEY,
  operation TEXT,
  request_data JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_token_budget (
  id INTEGER PRIMARY KEY,
  daily_limit INTEGER DEFAULT 100000,
  tokens_used INTEGER DEFAULT 0,
  reset_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('Connected to database, creating ai tables if missing...');
    await client.query(sql);
    console.log('ai tables ensured.');
    const res = await client.query(`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename IN ('ai_dead_letter_queue','ai_token_budget')`);
    console.log('Found ai tables: ', res.rows.map(r => r.tablename));
  } catch (err) {
    console.error('Error creating ai tables:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
