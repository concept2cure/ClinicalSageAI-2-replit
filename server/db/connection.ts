/**
 * Database Connection Module
 *
 * This module provides a unified database connection for the application.
 * It handles connecting to PostgreSQL using environment variables.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dotenv from 'dotenv';
import { getSslConfig } from './ssl';

// Load environment variables
dotenv.config();

// Get the database URL from environment variables
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('DATABASE_URL environment variable is not set!');
  process.exit(1);
}

// Create a Postgres client
const client = postgres(dbUrl, {
  max: 10, // Maximum number of connections
  idle_timeout: 30, // Connection timeout in seconds
  max_lifetime: 60 * 30, // Maximum connection lifetime in seconds
  ssl: getSslConfig(dbUrl),
});

// Create a Drizzle ORM instance
export const db = drizzle(client);

// Export a function to close the database connection
export const closeDbConnection = async () => {
  await client.end();
};

// Export the raw Postgres client for operations not supported by Drizzle
export const pgClient = client;
