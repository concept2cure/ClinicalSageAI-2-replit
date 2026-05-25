// Database connection setup - compatibility wrapper over canonical db.ts
import {
  getPool,
  getDb,
  runMigrations,
  ensureAuthTables,
  transaction,
  healthCheck,
  db,
} from './db.ts';
import 'dotenv/config';
import EventEmitter from 'events';

// Database connection status tracker
export const dbStatus = {
  connected: false,
  lastConnected: null,
  lastError: null,
  connectionAttempts: 0,
  reconnecting: false,
  poolSize: 0,
  events: new EventEmitter(),
};

// Lazy pool accessor. Importing this module must NOT eagerly call getPool() —
// getPool() throws ("Database connection not available") before the pool is
// initialized, which happens during test collection (modules load before the
// test setup creates the pool). A bare `const pool = getPool()` at import time
// therefore crashed the whole module for every importer. Instead, resolve the
// real pool on first actual use and attach monitoring listeners exactly once.
let _monitoringAttached = false;
function attachPoolMonitoring(p) {
  if (_monitoringAttached) return;
  _monitoringAttached = true;

  // Error handler for the pool
  p.on('error', (err, _client) => {
    console.error('Unexpected error on idle client', err);
    dbStatus.lastError = err;
    dbStatus.connected = false;
    dbStatus.events.emit('error', err);
    if (!dbStatus.reconnecting) {
      scheduleReconnectionTest();
    }
  });

  // Connection monitoring
  p.on('connect', _client => {
    dbStatus.poolSize++;
    dbStatus.events.emit('connect', { poolSize: dbStatus.poolSize });
    console.log('[database] Database connection successful', {
      timestamp: new Date().toISOString(),
      poolSize: dbStatus.poolSize,
    });
  });

  p.on('remove', _client => {
    dbStatus.poolSize = Math.max(0, dbStatus.poolSize - 1);
    dbStatus.events.emit('remove', { poolSize: dbStatus.poolSize });
  });
}

function resolvePool() {
  const p = getPool();
  attachPoolMonitoring(p);
  return p;
}

// Proxy that defers getPool() until a property is actually accessed, so
// `import './db'` never opens a connection or throws at module load. Every real
// usage (pool.query / pool.connect / pool.on) resolves the live pool at call
// time, by which point the pool has been initialized.
const pool = new Proxy(
  {},
  {
    get(_target, prop) {
      const p = resolvePool();
      const value = Reflect.get(p, prop, p);
      return typeof value === 'function' ? value.bind(p) : value;
    },
    has(_target, prop) {
      return Reflect.has(resolvePool(), prop);
    },
  }
);

// Function to set tenant context variables on the database session
// Uses parameterized set_config() to prevent SQL injection
const setTenantContext = async (client, tenantContext) => {
  const { userId, croId, clientId } = tenantContext;

  // Set session variables for row-level security policies using parameterized queries
  if (userId) {
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [String(userId)]);
  }

  if (croId) {
    await client.query(`SELECT set_config('app.current_cro_id', $1, true)`, [String(croId)]);
  }

  if (clientId) {
    await client.query(`SELECT set_config('app.current_client_id', $1, true)`, [String(clientId)]);
  }
};

// Function to get a database client with tenant context
const getClientWithContext = async tenantContext => {
  const client = await pool.connect();
  try {
    await setTenantContext(client, tenantContext);
    return client;
  } catch (error) {
    client.release();
    throw error;
  }
};

// Helper function to retry failed operations
async function retryOperation(operation, maxRetries = 3, delay = 1000) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.warn(
        `Database operation failed (attempt ${attempt}/${maxRetries}): ${error.message}`
      );
      lastError = error;

      // Only wait if we're going to retry
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay));
        // Increase delay for next attempt (exponential backoff)
        delay = delay * 1.5;
      }
    }
  }

  // If we get here, all retries failed
  throw lastError;
}

// Schedule a reconnection test after a failure
function scheduleReconnectionTest(delay = 5000) {
  if (dbStatus.reconnecting) return;

  dbStatus.reconnecting = true;
  dbStatus.connectionAttempts++;

  console.log(
    `[database] Scheduling reconnection attempt ${dbStatus.connectionAttempts} in ${delay}ms`
  );

  setTimeout(async () => {
    try {
      const success = await testConnection();
      if (success) {
        dbStatus.reconnecting = false;
        dbStatus.connectionAttempts = 0;
        console.log('[database] Reconnection successful');
      } else {
        // Exponential backoff for reconnection attempts
        const nextDelay = Math.min(30000, delay * 1.5); // Max 30 seconds
        scheduleReconnectionTest(nextDelay);
      }
    } catch (err) {
      console.error('[database] Reconnection attempt failed:', err);
      const nextDelay = Math.min(30000, delay * 1.5); // Max 30 seconds
      scheduleReconnectionTest(nextDelay);
    }
  }, delay);
}

// Function to test database connection with status updates
async function testConnection() {
  try {
    const { rows } = await pool.query('SELECT NOW()');

    // Update status
    dbStatus.connected = true;
    dbStatus.lastConnected = new Date();
    dbStatus.lastError = null;

    console.log('[database] Database connection successful');
    dbStatus.events.emit('connected');

    return true;
  } catch (error) {
    console.error('[database] Database connection test failed', {
      error: error.message,
    });

    // Update status
    dbStatus.connected = false;
    dbStatus.lastError = error;
    dbStatus.events.emit('error', error);

    return false;
  }
}

// Test connection on startup with better error handling
// Only test if DATABASE_URL is provided
if (process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL) {
  testConnection().catch(err => {
    console.error('[database] Initial connection test failed:', err.message);

    // Don't fail the entire application if database is down
    console.log('[database] Application will continue with limited functionality');

    // Disable automatic reconnection attempts to prevent log spam
    // Connections will be attempted on-demand when queries are made
    console.log(
      '[database] Automatic reconnection disabled - connections will be attempted on-demand'
    );
    dbStatus.events.emit('connection-disabled');
  });
} else {
  console.log('[database] No DATABASE_URL provided, skipping database connection');
  dbStatus.connected = false;
}

// Disable periodic health checks to prevent log spam when database is not available
// Health checks will only run when explicitly triggered by queries
/*
setInterval(async () => {
  if (!dbStatus.connected && !dbStatus.reconnecting) {
    console.log('[database] Running scheduled connection health check');
    try {
      await testConnection();
    } catch (err) {
      // Error already logged in testConnection
    }
  }
}, 30000);
*/

// Create query function that includes retry logic and fallback handling
const query = (text, params, tenantContext, options = {}) => {
  const {
    retries = 3,
    retryDelay = 1000,
    fallbackFn = null,
    isReadOnly = false, // Set to true for SELECT queries that can use fallback data
  } = options;

  const executeQuery = async () => {
    try {
      if (tenantContext) {
        const client = await getClientWithContext(tenantContext);
        try {
          const result = await client.query(text, params);
          return result;
        } finally {
          client.release();
        }
      } else {
        return await pool.query(text, params);
      }
    } catch (error) {
      // If this is a read operation and we have a fallback function, use it
      if (isReadOnly && fallbackFn && !dbStatus.connected) {
        console.warn('[database] Using fallback data for query:', text.slice(0, 100));
        return fallbackFn();
      }
      throw error;
    }
  };

  return retryOperation(executeQuery, retries, retryDelay);
};

// Helper function to create a fallback response object that mimics pg result
export function createFallbackResult(rows = []) {
  return {
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: null,
    fields: [],
    _fallback: true, // Flag to identify this as fallback data
  };
}

// Export compatibility + canonical helpers to preserve import shapes
export {
  pool,
  getClientWithContext,
  testConnection,
  query,
  db,
  getPool,
  getDb,
  runMigrations,
  ensureAuthTables,
  transaction,
  healthCheck,
};
