import { apiRequest, queryClient } from '@/lib/queryClient';

/**
 * Test utility for creating demo version history data
 * This helps demonstrate the SharePoint-style version history viewer
 */
export async function createTestVersions(componentId, count = 5) {
  const versionTemplates = [
    { 
      changeType: 'major', 
      changeDescription: 'Major regulatory update for FDA submission',
      content: 'Updated clinical endpoints and primary outcome measures according to FDA feedback...'
    },
    { 
      changeType: 'minor', 
      changeDescription: 'Minor formatting corrections',
      content: 'Corrected formatting issues in section headers and page numbers...'
    },
    { 
      changeType: 'patch', 
      changeDescription: 'Fixed typos in clinical data',
      content: 'Fixed typographical errors in patient demographics table...'
    },
    { 
      changeType: 'major', 
      changeDescription: 'Added new safety data from Phase III trial',
      content: 'Incorporated comprehensive safety data from the completed Phase III trial including adverse events...'
    },
    { 
      changeType: 'minor', 
      changeDescription: 'Updated references and citations',
      content: 'Updated all literature references to include 2024 publications...'
    }
  ];

  const results = [];
  
  for (let i = 0; i < Math.min(count, versionTemplates.length); i++) {
    const template = versionTemplates[i];
    const versionNumber = `${Math.floor(i/2) + 1}.${i % 2}.${Math.floor(Math.random() * 10)}`;
    
    try {
      const response = await apiRequest('POST', `/api/coauthor/components/${componentId}/versions`, {
        versionNumber,
        content: template.content,
        changeDescription: template.changeDescription,
        changeType: template.changeType,
        metadata: {
          size: Math.floor(Math.random() * 500000) + 100000,
          fileType: 'text/plain',
          demo: true,
          createdFor: 'Version History Demo'
        },
        complianceStatus: ['draft', 'approved', 'pending'][Math.floor(Math.random() * 3)]
      });
      
      const result = await response.json();
      results.push(result);
    } catch (error) {
      console.error(`Failed to create test version ${i + 1}:`, error);
    }
  }
  
  // Invalidate queries to refresh UI
  queryClient.invalidateQueries(['/api/coauthor/components']);
  queryClient.invalidateQueries([`/api/coauthor/components/${componentId}/versions`]);
  
  return {
    success: true,
    created: results.length,
    versions: results
  };
}

/**
 * Clear all test versions for a component
 */
export async function clearTestVersions(componentId) {
  try {
    const response = await apiRequest('GET', `/api/coauthor/components/${componentId}/versions`);
    const data = await response.json();
    
    const testVersions = data.versions?.filter(v => v.metadata?.demo === true) || [];
    let deleted = 0;
    
    for (const version of testVersions) {
      try {
        await apiRequest('DELETE', `/api/coauthor/components/${componentId}/versions/${version.id}`);
        deleted++;
      } catch (error) {
        console.error(`Failed to delete test version ${version.id}:`, error);
      }
    }
    
    // Invalidate queries to refresh UI
    queryClient.invalidateQueries(['/api/coauthor/components']);
    queryClient.invalidateQueries([`/api/coauthor/components/${componentId}/versions`]);
    
    return {
      success: true,
      deleted,
      message: `Deleted ${deleted} test versions`
    };
  } catch (error) {
    console.error('Failed to clear test versions:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.testVersionHistory = {
    createTestVersions,
    clearTestVersions
  };
  
  console.log('🧪 Version History Test Utilities Loaded!');
  console.log('Use window.testVersionHistory.createTestVersions(componentId, count) to create test versions');
  console.log('Use window.testVersionHistory.clearTestVersions(componentId) to clear test versions');
}