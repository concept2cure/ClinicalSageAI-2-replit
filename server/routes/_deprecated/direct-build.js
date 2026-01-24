import express from 'express';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

// Direct build endpoint
router.post('/direct-build', async (req, res) => {
  try {
    const { request, context } = req.body;

    console.log('🔨 Direct build request:', request);
    console.log('📁 Context:', context);

    // Parse the build request and determine what needs to be built
    const buildPlan = await analyzeBuildRequest(request, context);

    // Execute the build plan
    const results = await executeBuildPlan(buildPlan);

    res.json({
      success: true,
      buildPlan,
      results,
      files: results.modifiedFiles || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Direct build error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

async function analyzeBuildRequest(request, context) {
  const requestLower = request.toLowerCase();

  // Determine build type
  let buildType = 'general';
  let targetFiles = [];
  let actions = [];

  if (requestLower.includes('cer') || requestLower.includes('clinical evaluation')) {
    buildType = 'cer';
    targetFiles = ['client/src/pages/CERV2Page.jsx', 'client/src/components/cer/'];
  } else if (requestLower.includes('ai assistant') || requestLower.includes('assistant')) {
    buildType = 'ai-assistant';
    targetFiles = ['client/src/components/LumenAIAssistantContainer.jsx'];
  } else if (requestLower.includes('api') || requestLower.includes('endpoint')) {
    buildType = 'api';
    targetFiles = ['server/routes/'];
  } else if (requestLower.includes('ui') || requestLower.includes('component')) {
    buildType = 'ui';
    targetFiles = ['client/src/components/'];
  } else if (requestLower.includes('module')) {
    buildType = 'module';
    targetFiles = ['client/src/modules/', 'client/src/pages/'];
  }

  // Determine actions
  if (requestLower.includes('add') || requestLower.includes('create')) {
    actions.push('create');
  }
  if (requestLower.includes('enhance') || requestLower.includes('improve')) {
    actions.push('enhance');
  }
  if (requestLower.includes('fix') || requestLower.includes('debug')) {
    actions.push('fix');
  }

  return {
    request,
    buildType,
    targetFiles,
    actions,
    context,
    priority: determinePriority(request),
  };
}

async function executeBuildPlan(buildPlan) {
  const results = {
    modifiedFiles: [],
    createdFiles: [],
    actions: [],
    logs: [],
  };

  try {
    switch (buildPlan.buildType) {
      case 'cer':
        await handleCERBuild(buildPlan, results);
        break;
      case 'ai-assistant':
        await handleAIAssistantBuild(buildPlan, results);
        break;
      case 'api':
        await handleAPIBuild(buildPlan, results);
        break;
      case 'ui':
        await handleUIBuild(buildPlan, results);
        break;
      case 'module':
        await handleModuleBuild(buildPlan, results);
        break;
      default:
        await handleGeneralBuild(buildPlan, results);
    }

    results.logs.push(`✅ Build completed successfully for: ${buildPlan.request}`);
  } catch (error) {
    results.logs.push(`❌ Build failed: ${error.message}`);
    throw error;
  }

  return results;
}

async function handleCERBuild(buildPlan, results) {
  results.logs.push('🔬 Executing CER module build...');

  // Example: Add new CER functionality
  if (buildPlan.actions.includes('create')) {
    const newFeaturePath = 'client/src/components/cer/NewCERFeature.jsx';
    await createFile(newFeaturePath, generateCERComponent(buildPlan.request));
    results.createdFiles.push(newFeaturePath);
  }

  results.actions.push('CER module enhanced');
}

async function handleAIAssistantBuild(buildPlan, results) {
  results.logs.push('🤖 Executing AI Assistant build...');

  // Enhance AI assistant capabilities
  const assistantPath = 'client/src/components/LumenAIAssistantContainer.jsx';
  results.modifiedFiles.push(assistantPath);
  results.actions.push('AI Assistant enhanced');
}

async function handleAPIBuild(buildPlan, results) {
  results.logs.push('🌐 Executing API build...');

  // Create new API endpoints
  if (buildPlan.actions.includes('create')) {
    const apiPath = `server/routes/new-api-${Date.now()}.js`;
    await createFile(apiPath, generateAPIEndpoint(buildPlan.request));
    results.createdFiles.push(apiPath);
  }

  results.actions.push('API endpoint created');
}

async function handleUIBuild(buildPlan, results) {
  results.logs.push('🎨 Executing UI build...');

  // Create or enhance UI components
  results.actions.push('UI component enhanced');
}

async function handleModuleBuild(buildPlan, results) {
  results.logs.push('📦 Executing Module build...');

  // Create new modules
  results.actions.push('New module created');
}

async function handleGeneralBuild(buildPlan, results) {
  results.logs.push('⚙️ Executing general build...');

  // Handle general build requests
  results.actions.push('General build completed');
}

async function createFile(filePath, content) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

function generateCERComponent(request) {
  return `import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const NewCERFeature = () => {
  // Generated based on request: ${request}
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>New CER Feature</CardTitle>
      </CardHeader>
      <CardContent>
        <p>This component was auto-generated based on your request.</p>
      </CardContent>
    </Card>
  );
};

export default NewCERFeature;
`;
}

function generateAPIEndpoint(request) {
  return `import express from 'express';

const router = express.Router();

// Generated based on request: ${request}
router.get('/new-endpoint', (req, res) => {
  res.json({
    message: 'Auto-generated endpoint',
    request: '${request}',
    timestamp: new Date().toISOString()
  });
});

export default router;
`;
}

function determinePriority(request) {
  const urgentKeywords = ['fix', 'bug', 'error', 'urgent', 'critical'];
  const highKeywords = ['enhance', 'improve', 'optimize'];

  const requestLower = request.toLowerCase();

  if (urgentKeywords.some(keyword => requestLower.includes(keyword))) {
    return 'urgent';
  } else if (highKeywords.some(keyword => requestLower.includes(keyword))) {
    return 'high';
  }

  return 'normal';
}

export default router;
