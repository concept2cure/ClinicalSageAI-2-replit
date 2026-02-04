/**
 * Re-export database utilities from server/db.ts
 * This module provides backward compatibility for imports from shared/db
 */
export { getPool as pool, db, getDb } from '../server/db';
