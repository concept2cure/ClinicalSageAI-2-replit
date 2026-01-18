import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { resolutionStrategies } from './merge-strategies.mjs';
import { aiResolveCode, createConflictReport } from './ai-code-analyzer.mjs';
import yaml from 'js-yaml';

/**
 * Parse conflict markers in a file
 */
export function parseConflictMarkers(content) {
  const conflicts = [];
  const lines = content.split('\n');
  
  let currentConflict = null;
  let lineNumber = 0;
  
  for (const line of lines) {
    lineNumber++;
    
    if (line.startsWith('<<<<<<<')) {
      currentConflict = {
        startLine: lineNumber,
        head: [],
        base: [],
        inHead: true
      };
    } else if (line.startsWith('=======') && currentConflict) {
      currentConflict.inHead = false;
    } else if (line.startsWith('>>>>>>>') && currentConflict) {
      currentConflict.endLine = lineNumber;
      currentConflict.headContent = currentConflict.head.join('\n');
      currentConflict.baseContent = currentConflict.base.join('\n');
      conflicts.push(currentConflict);
      currentConflict = null;
    } else if (currentConflict) {
      if (currentConflict.inHead) {
        currentConflict.head.push(line);
      } else {
        currentConflict.base.push(line);
      }
    }
  }
  
  return conflicts;
}

/**
 * Check if a file is protected from auto-resolution
 */
export function isProtectedFile(filePath, config) {
  const protectedPatterns = config?.autoResolve?.protectedFiles || [];
  
  return protectedPatterns.some(pattern => {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  });
}

/**
 * Load configuration from .github/auto-resolve-config.yml
 */
export function loadConfig() {
  try {
    const configPath = path.join(process.cwd(), '.github', 'auto-resolve-config.yml');
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf8');
      return yaml.load(configContent);
    }
  } catch (error) {
    console.warn('Failed to load config, using defaults:', error.message);
  }
  
  // Default configuration
  return {
    autoResolve: {
      enabled: true,
      minConfidence: 85,
      autoMerge: false,
      strategies: {
        whitespace: true,
        imports: true,
        dependencies: true,
        aiAssisted: true
      },
      protectedFiles: []
    }
  };
}

/**
 * Attempt to resolve a single conflict
 */
export async function resolveConflict(conflict, filePath, config) {
  const { headContent, baseContent } = conflict;
  
  // Try each strategy in order of confidence
  for (const strategy of resolutionStrategies) {
    // Check if strategy is enabled in config
    const strategyEnabled = config?.autoResolve?.strategies?.[strategy.type] !== false;
    if (!strategyEnabled) {
      continue;
    }
    
    try {
      const result = await strategy.handler(baseContent, headContent, { filePath, conflict });
      
      if (result.resolved && result.confidence >= (config?.autoResolve?.minConfidence || 85)) {
        return {
          ...result,
          strategy: strategy.type,
          strategyDescription: strategy.description
        };
      }
    } catch (error) {
      console.error(`Strategy ${strategy.type} failed:`, error.message);
    }
  }
  
  // Try AI resolution as last resort (if enabled)
  if (config?.autoResolve?.strategies?.aiAssisted && process.env.OPENAI_API_KEY) {
    try {
      const aiResult = await aiResolveCode(baseContent, headContent, { filePath, conflict });
      if (aiResult.resolved) {
        return {
          ...aiResult,
          strategy: 'ai-assisted',
          strategyDescription: 'AI-powered code analysis'
        };
      }
    } catch (error) {
      console.error('AI resolution failed:', error.message);
    }
  }
  
  // No resolution found
  return {
    resolved: false,
    confidence: 0,
    reason: 'No automated strategy could safely resolve this conflict',
    requiresManual: true
  };
}

/**
 * Resolve all conflicts in a file
 */
export async function resolveFileConflicts(filePath, config) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const conflicts = parseConflictMarkers(content);
    
    if (conflicts.length === 0) {
      return {
        success: true,
        resolved: true,
        conflictsFound: 0,
        message: 'No conflicts found'
      };
    }
    
    // Check if file is protected
    if (isProtectedFile(filePath, config)) {
      return {
        success: false,
        resolved: false,
        conflictsFound: conflicts.length,
        message: 'File is protected from auto-resolution',
        protected: true
      };
    }
    
    const resolutions = [];
    let allResolved = true;
    let totalConfidence = 0;
    
    for (const conflict of conflicts) {
      const resolution = await resolveConflict(conflict, filePath, config);
      resolutions.push(resolution);
      
      if (!resolution.resolved) {
        allResolved = false;
      } else {
        totalConfidence += resolution.confidence;
      }
    }
    
    if (!allResolved) {
      return {
        success: false,
        resolved: false,
        conflictsFound: conflicts.length,
        resolutions,
        message: 'Some conflicts could not be auto-resolved',
        requiresManual: true
      };
    }
    
    // All conflicts resolved - reconstruct file
    const avgConfidence = totalConfidence / conflicts.length;
    const lines = content.split('\n');
    let result = [];
    let conflictIndex = 0;
    let inConflict = false;
    let skipUntilEnd = false;
    
    for (const line of lines) {
      if (line.startsWith('<<<<<<<')) {
        inConflict = true;
        skipUntilEnd = true;
        // Insert resolved content
        result.push(resolutions[conflictIndex].content);
        conflictIndex++;
      } else if (line.startsWith('>>>>>>>')) {
        inConflict = false;
        skipUntilEnd = false;
      } else if (!skipUntilEnd) {
        result.push(line);
      }
    }
    
    // Write resolved content
    fs.writeFileSync(filePath, result.join('\n'));
    
    return {
      success: true,
      resolved: true,
      conflictsFound: conflicts.length,
      resolutions,
      avgConfidence,
      message: `Resolved ${conflicts.length} conflict(s) with ${avgConfidence.toFixed(1)}% confidence`
    };
  } catch (error) {
    return {
      success: false,
      resolved: false,
      error: error.message,
      message: `Failed to resolve conflicts: ${error.message}`
    };
  }
}

/**
 * Get list of files with conflicts in working directory
 */
export function getConflictedFiles() {
  try {
    const output = execSync('git diff --name-only --diff-filter=U', { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    return output.trim().split('\n').filter(f => f);
  } catch (error) {
    return [];
  }
}

/**
 * Save resolution log
 */
export function saveResolutionLog(logEntry) {
  const logPath = path.join(process.cwd(), 'logs', 'conflict-resolutions.json');
  
  let logs = [];
  if (fs.existsSync(logPath)) {
    try {
      logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    } catch (error) {
      console.warn('Failed to read existing logs:', error.message);
    }
  }
  
  logs.push({
    ...logEntry,
    timestamp: new Date().toISOString()
  });
  
  // Keep only last 1000 entries
  if (logs.length > 1000) {
    logs = logs.slice(-1000);
  }
  
  fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
}

export default {
  parseConflictMarkers,
  isProtectedFile,
  loadConfig,
  resolveConflict,
  resolveFileConflicts,
  getConflictedFiles,
  saveResolutionLog
};
