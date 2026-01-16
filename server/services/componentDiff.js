import { diffWords, diffLines, diffTrimmedLines } from 'diff';
import { db } from '../db/index.js';
import { 
  components, 
  componentVersions 
} from '../../shared/schema.ts';
import { eq, and, sql, desc } from 'drizzle-orm';

/**
 * Component Version Diff Service
 * Provides visual diff between component versions
 */

// Get diff between two versions of a component
export async function getVersionDiff(componentId, versionA, versionB, organizationId) {
  try {
    // Get both versions
    const versions = await db
      .select()
      .from(componentVersions)
      .where(and(
        eq(componentVersions.componentId, componentId),
        eq(componentVersions.organizationId, organizationId)
      ))
      .orderBy(desc(componentVersions.versionNumber));
    
    const vA = versions.find(v => v.versionNumber === versionA);
    const vB = versions.find(v => v.versionNumber === versionB);
    
    if (!vA || !vB) {
      return {
        success: false,
        error: 'One or both versions not found'
      };
    }
    
    // Prepare content for diff
    const contentA = normalizeContent(vA.content);
    const contentB = normalizeContent(vB.content);
    
    // Generate diff based on content type
    let diffResult;
    let diffType = 'text';
    
    if (typeof contentA === 'object' && typeof contentB === 'object') {
      // JSON diff for structured content
      diffResult = getJsonDiff(contentA, contentB);
      diffType = 'json';
    } else {
      // Text diff for string content
      const textA = contentToString(contentA);
      const textB = contentToString(contentB);
      
      if (textA.includes('\n') || textB.includes('\n')) {
        // Line-by-line diff for multiline content
        diffResult = diffTrimmedLines(textA, textB);
        diffType = 'lines';
      } else {
        // Word diff for single line content
        diffResult = diffWords(textA, textB);
        diffType = 'words';
      }
    }
    
    // Format diff for display
    const formattedDiff = formatDiff(diffResult, diffType);
    
    // Calculate change statistics
    const stats = calculateDiffStats(diffResult, diffType);
    
    return {
      success: true,
      diff: {
        versionA: {
          versionNumber: vA.versionNumber,
          versionLabel: vA.versionLabel,
          createdAt: vA.createdAt,
          createdBy: vA.createdByName,
          changeDescription: vA.changeDescription
        },
        versionB: {
          versionNumber: vB.versionNumber,
          versionLabel: vB.versionLabel,
          createdAt: vB.createdAt,
          createdBy: vB.createdByName,
          changeDescription: vB.changeDescription
        },
        changes: formattedDiff,
        stats,
        diffType
      }
    };
    
  } catch (error) {
    console.error('Error generating version diff:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Normalize content for comparison
function normalizeContent(content) {
  if (!content) return '';
  
  if (typeof content === 'string') {
    return content;
  }
  
  if (typeof content === 'object') {
    return content;
  }
  
  return String(content);
}

// Convert content to string for text diff
function contentToString(content) {
  if (typeof content === 'string') {
    return content;
  }
  
  if (typeof content === 'object') {
    return JSON.stringify(content, null, 2);
  }
  
  return String(content);
}

// Get diff for JSON objects
function getJsonDiff(objA, objB) {
  const changes = [];
  const allKeys = new Set([...Object.keys(objA), ...Object.keys(objB)]);
  
  for (const key of allKeys) {
    if (!(key in objA)) {
      changes.push({
        added: true,
        key,
        value: objB[key]
      });
    } else if (!(key in objB)) {
      changes.push({
        removed: true,
        key,
        value: objA[key]
      });
    } else if (JSON.stringify(objA[key]) !== JSON.stringify(objB[key])) {
      changes.push({
        modified: true,
        key,
        oldValue: objA[key],
        newValue: objB[key]
      });
    }
  }
  
  return changes;
}

// Format diff for display
function formatDiff(diffResult, diffType) {
  if (diffType === 'json') {
    return diffResult.map(change => {
      if (change.added) {
        return {
          type: 'add',
          content: `+ ${change.key}: ${JSON.stringify(change.value)}`,
          key: change.key,
          value: change.value
        };
      } else if (change.removed) {
        return {
          type: 'remove',
          content: `- ${change.key}: ${JSON.stringify(change.value)}`,
          key: change.key,
          value: change.value
        };
      } else if (change.modified) {
        return {
          type: 'modify',
          content: `~ ${change.key}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`,
          key: change.key,
          oldValue: change.oldValue,
          newValue: change.newValue
        };
      }
    });
  }
  
  // Format text/line diff
  const formatted = [];
  
  diffResult.forEach(part => {
    if (part.added) {
      formatted.push({
        type: 'add',
        content: part.value,
        lines: part.value.split('\n').length - 1
      });
    } else if (part.removed) {
      formatted.push({
        type: 'remove',
        content: part.value,
        lines: part.value.split('\n').length - 1
      });
    } else {
      formatted.push({
        type: 'unchanged',
        content: part.value,
        lines: part.value.split('\n').length - 1
      });
    }
  });
  
  return formatted;
}

// Calculate diff statistics
function calculateDiffStats(diffResult, diffType) {
  const stats = {
    additions: 0,
    deletions: 0,
    modifications: 0,
    unchanged: 0
  };
  
  if (diffType === 'json') {
    diffResult.forEach(change => {
      if (change.added) stats.additions++;
      else if (change.removed) stats.deletions++;
      else if (change.modified) stats.modifications++;
    });
  } else {
    diffResult.forEach(part => {
      if (part.added) {
        stats.additions += diffType === 'lines' ? 
          (part.value.match(/\n/g) || []).length : 
          part.value.split(/\s+/).length;
      } else if (part.removed) {
        stats.deletions += diffType === 'lines' ? 
          (part.value.match(/\n/g) || []).length : 
          part.value.split(/\s+/).length;
      } else {
        stats.unchanged += diffType === 'lines' ? 
          (part.value.match(/\n/g) || []).length : 
          part.value.split(/\s+/).length;
      }
    });
  }
  
  stats.totalChanges = stats.additions + stats.deletions + stats.modifications;
  
  return stats;
}

// Get version history for a component
export async function getComponentVersionHistory(componentId, organizationId) {
  try {
    const versions = await db
      .select({
        id: componentVersions.id,
        versionNumber: componentVersions.versionNumber,
        versionLabel: componentVersions.versionLabel,
        changeDescription: componentVersions.changeDescription,
        changeType: componentVersions.changeType,
        createdAt: componentVersions.createdAt,
        createdBy: componentVersions.createdByName,
        contentPreview: sql`CASE 
          WHEN jsonb_typeof(content) = 'string' THEN content::text
          ELSE LEFT(content::text, 100)
        END`
      })
      .from(componentVersions)
      .where(and(
        eq(componentVersions.componentId, componentId),
        eq(componentVersions.organizationId, organizationId)
      ))
      .orderBy(desc(componentVersions.versionNumber));
    
    return {
      success: true,
      versions
    };
    
  } catch (error) {
    console.error('Error getting component version history:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Compare component usage across documents
export async function getComponentUsageComparison(componentId, organizationId) {
  try {
    const usage = await db.execute(sql`
      SELECT 
        d.id as document_id,
        d.title as document_title,
        d.status as document_status,
        dc.position,
        dc.is_overridden,
        dc.override_content,
        cv.version_number as version_used
      FROM document_components dc
      INNER JOIN coauthor_documents d ON dc.document_id = d.id
      LEFT JOIN coauthor_component_versions cv ON dc.component_version_id = cv.id
      WHERE dc.component_id = ${componentId}
        AND dc.organization_id = ${organizationId}
      ORDER BY d.title, dc.position
    `);
    
    return {
      success: true,
      usage: usage.rows,
      totalDocuments: new Set(usage.rows.map(u => u.document_id)).size,
      totalInstances: usage.rows.length,
      overriddenInstances: usage.rows.filter(u => u.is_overridden).length
    };
    
  } catch (error) {
    console.error('Error getting component usage comparison:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  getVersionDiff,
  getComponentVersionHistory,
  getComponentUsageComparison
};