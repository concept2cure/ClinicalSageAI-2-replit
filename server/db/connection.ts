/**
 * Database Connection Module
 *
 * This module provides a unified database connection for the application.
 * It handles connecting to PostgreSQL using environment variables.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get the database URL from environment variables
const dbUrl = process.env.DATABASE_URL;

let client: any = null;
let db: any = null;

if (!dbUrl) {
  console.warn('⚠️  DATABASE_URL environment variable is not set. Database features will be unavailable.');
  // Create a mock database that returns empty results
  db = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([]),
        limit: () => Promise.resolve([]),
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve({ rows: [] }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve({ rows: [] }),
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve({ rows: [] }),
    }),
  };
} else {
  // Create a Postgres client
  client = postgres(dbUrl, {
    max: 10, // Maximum number of connections
    idle_timeout: 30, // Connection timeout in seconds
    max_lifetime: 60 * 30, // Maximum connection lifetime in seconds
    ssl: dbUrl.includes('postgres://') ? { rejectUnauthorized: false } : false,
  });

  // Create a Drizzle ORM instance
  db = drizzle(client);
}

// Export the database instance
export { db };

// Export a function to close the database connection
export const closeDbConnection = async () => {
  if (client) {
    await client.end();
  }
};

// Export the raw Postgres client for operations not supported by Drizzle
export const pgClient = client;
