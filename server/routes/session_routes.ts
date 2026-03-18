import { Router } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

const router = Router();

// Ensure session_emails table exists
async function ensureSessionEmailTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS session_emails (
        session_id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('Session emails table ready');
  } catch (error) {
    console.error('Error ensuring session_emails table exists:', error);
    // Continue even if table creation fails - we'll use in-memory fallback
  }
}

// Initialize the table
ensureSessionEmailTable();

// Session email data type
interface SessionEmailMapping {
  session_id: string;
  email: string;
  created_at: Date;
  updated_at: Date;
}

// Bounded in-memory cache for session emails (max 10,000 entries with LRU eviction)
const SESSION_CACHE_MAX = 10_000;
const sessionEmailCache = new Map<string, string>();

function cacheSet(key: string, value: string) {
  if (sessionEmailCache.size >= SESSION_CACHE_MAX) {
    // Evict oldest entry (first inserted)
    const firstKey = sessionEmailCache.keys().next().value;
    if (firstKey !== undefined) sessionEmailCache.delete(firstKey);
  }
  sessionEmailCache.set(key, value);
}

function cacheGet(key: string): string | undefined {
  return sessionEmailCache.get(key);
}

// Save email for a session
router.post('/email/save', async (req, res) => {
  try {
    const { session_id, recipient_email } = req.body;

    if (!session_id || !recipient_email) {
      return res.status(400).json({ error: 'Missing session_id or recipient_email' });
    }

    // Update in-memory cache
    cacheSet(session_id, recipient_email);

    // Try to store in database if available
    try {
      await db.execute(sql`
        INSERT INTO session_emails (session_id, email, created_at, updated_at)
        VALUES (${session_id}, ${recipient_email}, NOW(), NOW())
        ON CONFLICT (session_id) 
        DO UPDATE SET email = ${recipient_email}, updated_at = NOW()
      `);
    } catch (error) {
      console.log('Database storage for session email failed, using in-memory cache only');
      // Continue with in-memory cache if DB fails
    }

    res.status(200).json({
      session_id,
      email: recipient_email,
      status: 'saved',
    });
  } catch (error) {
    console.error('Error saving session email:', error);
    res.status(500).json({ error: 'Failed to save session email' });
  }
});

// Get email for a session
router.get('/email/get/:session_id', async (req, res) => {
  try {
    const { session_id } = req.params;

    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id' });
    }

    // First check in-memory cache
    const cached = cacheGet(session_id);
    if (cached) {
      return res.status(200).json({
        session_id,
        email: cached,
      });
    }

    // Try to get from database if available
    try {
      const result = await db.execute<SessionEmailMapping>(sql`
        SELECT email FROM session_emails WHERE session_id = ${session_id}
      `);

      if (result.length > 0) {
        const email = result[0].email;

        // Update in-memory cache
        cacheSet(session_id, email);

        return res.status(200).json({
          session_id,
          email,
        });
      }
    } catch (error) {
      console.log('Database retrieval for session email failed, using in-memory cache only');
      // Continue with no email if DB fails
    }

    // No email found
    res.status(404).json({
      session_id,
      email: null,
      status: 'not_found',
    });
  } catch (error) {
    console.error('Error retrieving session email:', error);
    res.status(500).json({ error: 'Failed to retrieve session email' });
  }
});

// List all sessions with emails (for admin)
router.get('/emails', async (req, res) => {
  try {
    const sessions = Array.from(sessionEmailCache.entries()).map(([session_id, email]) => ({
      session_id,
      email,
    }));

    res.status(200).json(sessions);
  } catch (error) {
    console.error('Error listing session emails:', error);
    res.status(500).json({ error: 'Failed to list session emails' });
  }
});

// Get session summary with status of generated files
router.get('/summary/:session_id', (req, res) => {
  try {
    const { session_id } = req.params;

    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id' });
    }

    // Determine base directory for sessions
    const baseDir = fs.existsSync('/mnt/data') ? '/mnt/data/lumen_reports_backend' : 'data';

    const sessionDir = path.join(baseDir, 'sessions', session_id);

    // Default response structure
    const sessionSummary = {
      session_id,
      last_updated: new Date().toISOString(),
      generated_files: {
        dropout_forecast: false,
        success_prediction: false,
        ind_summary: false,
        sap_summary: false,
        summary_packet: false,
      },
    };

    // Check if session directory exists
    if (!fs.existsSync(sessionDir)) {
      return res.status(200).json(sessionSummary);
    }

    // Check each file existence and get last modified time
    const fileChecks = [
      { key: 'dropout_forecast', path: path.join(sessionDir, 'dropout_forecast.json') },
      { key: 'success_prediction', path: path.join(sessionDir, 'success_prediction.json') },
      { key: 'ind_summary', path: path.join(sessionDir, 'ind_summary.docx') },
      { key: 'sap_summary', path: path.join(sessionDir, 'sap_summary.docx') },
      { key: 'summary_packet', path: path.join(sessionDir, 'summary_packet.pdf') },
    ];

    let lastModified = null;

    // Check each file and record the most recent modification date
    fileChecks.forEach(check => {
      if (fs.existsSync(check.path)) {
        sessionSummary.generated_files[check.key] = true;

        const stats = fs.statSync(check.path);
        const modifiedTime = stats.mtime.getTime();

        if (!lastModified || modifiedTime > lastModified) {
          lastModified = modifiedTime;
          sessionSummary.last_updated = stats.mtime.toISOString();
        }
      }
    });

    res.status(200).json(sessionSummary);
  } catch (error) {
    console.error('Error retrieving session summary:', error);
    res.status(500).json({ error: 'Failed to retrieve session summary' });
  }
});

// Get export log for a session
router.get('/export-log/:session_id', (req, res) => {
  try {
    const { session_id } = req.params;

    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id' });
    }

    // Determine base directory for sessions
    const baseDir = fs.existsSync('/mnt/data') ? '/mnt/data/lumen_reports_backend' : 'data';

    const sessionDir = path.join(baseDir, 'sessions', session_id);
    const exportLogPath = path.join(sessionDir, 'export_log.json');

    // Default response for no export log
    const defaultResponse = {
      session_id,
      exports: [],
      last_export: null,
    };

    // Check if export log exists
    if (!fs.existsSync(exportLogPath)) {
      return res.status(200).json(defaultResponse);
    }

    // Read export log file
    const exportLogContent = fs.readFileSync(exportLogPath, 'utf8');
    let exportLog;

    try {
      exportLog = JSON.parse(exportLogContent);
    } catch (e) {
      console.error('Error parsing export log JSON:', e);
      return res.status(200).json(defaultResponse);
    }

    // Handle both single export log and array formats
    let exportHistory = [];
    let lastExport = null;

    if (Array.isArray(exportLog)) {
      // Array format
      exportHistory = exportLog;
      if (exportLog.length > 0) {
        lastExport = exportLog[exportLog.length - 1];
      }
    } else if (exportLog.last_exported) {
      // Single export log format (older)
      exportHistory = [exportLog];
      lastExport = exportLog;
    }

    res.status(200).json({
      session_id,
      exports: exportHistory,
      last_export: lastExport,
    });
  } catch (error) {
    console.error('Error retrieving export log:', error);
    res.status(500).json({ error: 'Failed to retrieve export log' });
  }
});

export default router;
