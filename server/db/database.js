/**
 * Legacy database.js shim
 *
 * Re-exports the canonical pool from server/db.ts.
 * This file exists for backward compatibility with older imports.
 */
import { getPool } from '../db.js';

// Re-export pool for backward compatibility
const pool = getPool();

export default pool;
