/**
 * Drizzle ORM Configuration for Concept2Cure
 *
 * This file sets up the Drizzle ORM to work with our PostgreSQL database.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { pool } from './db';
import * as schema from '../shared/schema';
import { createContextLogger } from './utils/logger';

const logger = createContextLogger({ module: 'drizzle' });

// Create a Drizzle instance with our schema and database pool
export const db = pool ? drizzle(pool, { schema }) : null;

// Log a message when Drizzle is initialized
logger.info('Drizzle ORM initialized');
