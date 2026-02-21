import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGS_DIRECTORY = path.join(__dirname, '..', 'logs');
const EXPORT_LOG_FILE = path.join(LOGS_DIRECTORY, 'export_actions.jsonl');

// Create logs directory if it doesn't exist
if (!fs.existsSync(LOGS_DIRECTORY)) {
  fs.mkdirSync(LOGS_DIRECTORY, { recursive: true });
}

// Create export log file if it doesn't exist
if (!fs.existsSync(EXPORT_LOG_FILE)) {
  fs.writeFileSync(EXPORT_LOG_FILE, '');
}

export interface ExportAction {
  userId: string;
  actionType:
    | 'export_pdf'
    | 'export_comparison'
    | 'send_digest'
    | 'upload_protocol'
    | 'send_comparison_notification';
  objectId: string;
  objectName: string;
  objectType: 'report' | 'protocol' | 'comparison' | 'digest' | 'notification';
  timestamp?: Date;
  metadata?: Record<string, any>;
}

/**
 * Log an export action to the export_actions.jsonl file
 */
export const logExportAction = (action: ExportAction): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      // Add timestamp if not provided
      const actionWithTimestamp = {
        ...action,
        timestamp: action.timestamp || new Date(),
      };

      // Convert to JSON line
      const line = JSON.stringify(actionWithTimestamp) + '\n';

      // Append to file
      fs.appendFile(EXPORT_LOG_FILE, line, err => {
        if (err) {
          console.error('Error writing to export log:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    } catch (error) {
      console.error('Error in logExportAction:', error);
      reject(error);
    }
  });
};

interface GetExportLogsOptions {
  since?: Date;
  until?: Date;
}

/**
 * Get export logs for specific user or all users within a time range
 */
export const getExportLogs = (
  userId?: string,
  options: GetExportLogsOptions = {}
): Promise<ExportAction[]> => {
  return new Promise((resolve, reject) => {
    try {
      // Read the file
      fs.readFile(EXPORT_LOG_FILE, 'utf8', (err, data) => {
        if (err) {
          if (err.code === 'ENOENT') {
            // File doesn't exist yet, return empty array
            return resolve([]);
          }
          return reject(err);
        }

        if (!data.trim()) {
          // Empty file
          return resolve([]);
        }

        // Parse each line as JSON
        const lines = data.trim().split('\n');
        let logs: ExportAction[] = lines
          .filter(line => line.trim() !== '')
          .map(line => {
            try {
              const log = JSON.parse(line);
              // Convert timestamp string to Date object
              if (log.timestamp && typeof log.timestamp === 'string') {
                log.timestamp = new Date(log.timestamp);
              }
              return log;
            } catch (e) {
              console.error('Error parsing log line:', line, e);
              return null;
            }
          })
          .filter(log => log !== null) as ExportAction[];

        // Filter by user ID if provided
        if (userId) {
          logs = logs.filter(log => log.userId === userId);
        }

        // Filter by date range if provided
        if (options.since) {
          logs = logs.filter(log => log.timestamp && log.timestamp >= options.since!);
        }

        if (options.until) {
          logs = logs.filter(log => log.timestamp && log.timestamp <= options.until!);
        }

        // Sort by timestamp (newest first)
        logs.sort((a, b) => {
          const dateA = a.timestamp ? new Date(a.timestamp) : new Date(0);
          const dateB = b.timestamp ? new Date(b.timestamp) : new Date(0);
          return dateB.getTime() - dateA.getTime();
        });

        resolve(logs);
      });
    } catch (error) {
      console.error('Error in getExportLogs:', error);
      reject(error);
    }
  });
};

// Function to clear all logs (for testing)
export const clearExportLogs = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    fs.writeFile(EXPORT_LOG_FILE, '', err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};
