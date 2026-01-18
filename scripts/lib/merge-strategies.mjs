/**
 * Merge conflict resolution strategies
 * Each strategy returns { resolved: boolean, content: string, confidence: number }
 */

/**
 * Resolve whitespace-only conflicts
 */
export function autoFixWhitespace(baseContent, headContent, conflictMarkers) {
  // Remove all whitespace and compare
  const normalizeWhitespace = (str) => str.replace(/\s+/g, ' ').trim();
  
  const baseNormalized = normalizeWhitespace(baseContent);
  const headNormalized = normalizeWhitespace(headContent);
  
  if (baseNormalized === headNormalized) {
    // Content is the same, just whitespace differences
    // Prefer head version (the PR changes)
    return {
      resolved: true,
      content: headContent,
      confidence: 100,
      reason: 'Whitespace-only difference, accepted PR version'
    };
  }
  
  return { resolved: false, confidence: 0 };
}

/**
 * Merge import statements intelligently
 */
export function mergeImports(baseContent, headContent, conflictMarkers) {
  // Check if both sections are import statements
  const isImportSection = (content) => {
    const lines = content.trim().split('\n');
    return lines.every(line => {
      const trimmed = line.trim();
      return trimmed === '' ||
             trimmed.startsWith('import ') ||
             trimmed.startsWith('export ') ||
             trimmed.startsWith('const ') ||
             trimmed.startsWith('let ') ||
             trimmed.startsWith('var ') ||
             trimmed.startsWith('//') ||
             trimmed.startsWith('/*');
    });
  };
  
  if (!isImportSection(baseContent) || !isImportSection(headContent)) {
    return { resolved: false, confidence: 0 };
  }
  
  // Merge both sets of imports and deduplicate
  const extractImports = (content) => {
    return content.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('//') && !line.startsWith('/*'));
  };
  
  const baseImports = extractImports(baseContent);
  const headImports = extractImports(headContent);
  
  // Combine and deduplicate
  const allImports = [...new Set([...baseImports, ...headImports])];
  
  // Sort imports (ES6 imports first, then require statements)
  const sortedImports = allImports.sort((a, b) => {
    const aIsImport = a.startsWith('import ');
    const bIsImport = b.startsWith('import ');
    if (aIsImport && !bIsImport) return -1;
    if (!aIsImport && bIsImport) return 1;
    return a.localeCompare(b);
  });
  
  return {
    resolved: true,
    content: sortedImports.join('\n'),
    confidence: 95,
    reason: 'Merged and deduplicated import statements'
  };
}

/**
 * Merge package.json dependencies
 */
export function mergeDependencies(baseContent, headContent, filePath) {
  if (!filePath.endsWith('package.json')) {
    return { resolved: false, confidence: 0 };
  }
  
  try {
    const baseJson = JSON.parse(baseContent);
    const headJson = JSON.parse(headContent);
    
    // Merge dependencies intelligently
    const mergedJson = { ...baseJson };
    
    // Merge dependencies sections
    const depSections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
    
    for (const section of depSections) {
      if (headJson[section]) {
        mergedJson[section] = {
          ...(baseJson[section] || {}),
          ...(headJson[section] || {})
        };

        // Sort dependencies alphabetically using more efficient approach
        mergedJson[section] = Object.fromEntries(
          Object.entries(mergedJson[section]).sort(([a], [b]) => a.localeCompare(b))
        );
      }
    }
    
    // For other fields, prefer head (PR changes) but keep base if not in head
    for (const key in headJson) {
      if (!depSections.includes(key)) {
        mergedJson[key] = headJson[key];
      }
    }
    
    return {
      resolved: true,
      content: JSON.stringify(mergedJson, null, 2) + '\n',
      confidence: 90,
      reason: 'Intelligently merged package.json dependencies'
    };
  } catch (error) {
    return { resolved: false, confidence: 0, error: error.message };
  }
}

/**
 * Accept both changes when they don't overlap
 */
export function acceptBoth(baseContent, headContent, context) {
  // This is a simple heuristic - check if we can safely append both
  // This works well for additive changes like adding new functions
  
  // Split into lines
  const baseLines = baseContent.split('\n');
  const headLines = headContent.split('\n');
  
  // Check if either is a subset of the other (one added, one kept existing)
  const baseSet = new Set(baseLines.map(l => l.trim()));
  const headSet = new Set(headLines.map(l => l.trim()));
  
  // If all base lines are in head, head is additive
  const baseInHead = [...baseSet].every(line => headSet.has(line));
  if (baseInHead) {
    return {
      resolved: true,
      content: headContent,
      confidence: 85,
      reason: 'Head contains all base changes plus additions'
    };
  }
  
  // If all head lines are in base, base is additive
  const headInBase = [...headSet].every(line => baseSet.has(line));
  if (headInBase) {
    return {
      resolved: true,
      content: baseContent,
      confidence: 85,
      reason: 'Base contains all head changes plus additions'
    };
  }
  
  return { resolved: false, confidence: 0 };
}

/**
 * Resolve simple line-ending conflicts
 */
export function normalizeLineEndings(baseContent, headContent) {
  const normalize = (str) => str.replace(/\r\n/g, '\n');
  
  const baseNorm = normalize(baseContent);
  const headNorm = normalize(headContent);
  
  if (baseNorm === headNorm) {
    return {
      resolved: true,
      content: headNorm,
      confidence: 100,
      reason: 'Line ending normalization resolved conflict'
    };
  }
  
  return { resolved: false, confidence: 0 };
}

/**
 * Get all available resolution strategies
 */
export const resolutionStrategies = [
  { type: 'whitespace', handler: autoFixWhitespace, confidence: 100, description: 'Whitespace/formatting conflicts' },
  { type: 'line-endings', handler: normalizeLineEndings, confidence: 100, description: 'Line ending differences' },
  { type: 'imports', handler: mergeImports, confidence: 95, description: 'Import statement conflicts' },
  { type: 'package-deps', handler: mergeDependencies, confidence: 90, description: 'Package.json dependencies' },
  { type: 'non-overlapping', handler: acceptBoth, confidence: 85, description: 'Non-overlapping changes' },
];

export default {
  autoFixWhitespace,
  mergeImports,
  mergeDependencies,
  acceptBoth,
  normalizeLineEndings,
  resolutionStrategies
};
