const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const OpenAI = require('openai');

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Enhanced code assistant endpoint
router.post('/code-assistant', async (req, res) => {
  try {
    const { message, mode, context } = req.body;

    // Build context for the AI
    let systemPrompt = `You are a helpful coding assistant working in a Replit environment. You can:
1. Analyze code and suggest improvements
2. Write new code and functions
3. Fix bugs and errors
4. Suggest file changes with specific line numbers
5. Answer questions about the codebase

Project Context: This is a TrialSage application - a regulatory compliance platform for clinical trials.

When suggesting file changes, format them as:
{
  "type": "edit|create|delete",
  "filePath": "path/to/file",
  "preview": "code preview",
  "description": "what this change does",
  "id": "unique-id"
}

Mode: ${mode}
`;

    if (context.selectedFiles?.length > 0) {
      systemPrompt += `\n\nSelected Files Context:\n`;
      context.selectedFiles.forEach(file => {
        systemPrompt += `File: ${file.path}\n\`\`\`\n${file.content.slice(0, 2000)}...\n\`\`\`\n\n`;
      });
    }

    if (context.conversationHistory?.length > 0) {
      systemPrompt += `\n\nRecent Conversation:\n`;
      context.conversationHistory.forEach(msg => {
        systemPrompt += `${msg.sender}: ${msg.text}\n`;
      });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const reply = response.choices[0].message.content;

    // Extract file changes from response if any
    const fileChanges = extractFileChanges(reply);
    const suggestions = generateSuggestions(message, mode);

    res.json({
      reply: reply.replace(/```json[\s\S]*?```/g, ''), // Remove JSON blocks from display
      fileChanges,
      suggestions,
    });
  } catch (error) {
    console.error('Code assistant error:', error);
    res.status(500).json({
      error: 'Failed to process request',
      reply: 'Sorry, I encountered an error. Please try again.',
    });
  }
});

// Agent control endpoint
router.post('/control', async (req, res) => {
  try {
    const { command, constraints, context } = req.body;

    // Enforce strict control based on your replit.md rules
    const controlledPrompt = `
STRICT CONTROL MODE ACTIVE:
- ONLY execute: ${command}
- CONSTRAINTS: ${constraints || 'Follow replit.md EXACTLY'}
- CONTEXT: ${context || 'Existing project structure'}
- DO NOT: Modify files without explicit approval
- DO NOT: Create examples or external UIs
- AWAIT: Explicit PROCEED command
    `;

    res.json({
      success: true,
      controlledPrompt,
      awaitingConfirmation: true,
    });
  } catch (error) {
    res.status(500).json({ error: 'Control system error' });
  }
});

// Get project context
router.get('/project/context', async (req, res) => {
  try {
    const projectRoot = process.cwd();

    // Get recent files and project structure
    const context = {
      projectType: 'react-node',
      recentFiles: await getRecentFiles(projectRoot),
      packageInfo: await getPackageInfo(projectRoot),
      fileStructure: await getFileStructure(projectRoot, 2), // 2 levels deep
    };

    res.json(context);
  } catch (error) {
    console.error('Failed to get project context:', error);
    res.status(500).json({ error: 'Failed to load project context' });
  }
});

// Get file content
router.get('/files/content', async (req, res) => {
  try {
    const { path: filePath } = req.query;
    const fullPath = path.join(process.cwd(), filePath);

    // Security check - ensure file is within project
    if (!fullPath.startsWith(process.cwd())) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const content = await fs.readFile(fullPath, 'utf8');
    const ext = path.extname(filePath);

    res.json({
      content,
      type: getFileType(ext),
      size: content.length,
    });
  } catch (error) {
    console.error('Failed to read file:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

// Apply file changes
router.post('/files/apply-change', async (req, res) => {
  try {
    const { type, filePath, content, description } = req.body;
    const fullPath = path.join(process.cwd(), filePath);

    // Security check
    if (!fullPath.startsWith(process.cwd())) {
      return res.status(403).json({ error: 'Access denied' });
    }

    switch (type) {
      case 'create':
        await fs.writeFile(fullPath, content, 'utf8');
        break;
      case 'edit':
        await fs.writeFile(fullPath, content, 'utf8');
        break;
      case 'delete':
        await fs.unlink(fullPath);
        break;
      default:
        return res.status(400).json({ error: 'Invalid change type' });
    }

    res.json({ success: true, message: `File ${type}d successfully` });
  } catch (error) {
    console.error('Failed to apply change:', error);
    res.status(500).json({ error: 'Failed to apply change' });
  }
});

// Helper functions
function extractFileChanges(response) {
  const changes = [];
  const jsonBlocks = response.match(/```json[\s\S]*?```/g) || [];

  jsonBlocks.forEach(block => {
    try {
      const json = block.replace(/```json\n?/, '').replace(/\n?```/, '');
      const change = JSON.parse(json);
      if (change.type && change.filePath) {
        changes.push({
          ...change,
          id: Math.random().toString(36).substr(2, 9),
        });
      }
    } catch (e) {
      // Ignore invalid JSON
    }
  });

  return changes;
}

function generateSuggestions(message, mode) {
  const suggestions = [];

  if (mode === 'code') {
    suggestions.push(
      'Add error handling to this function',
      'Optimize this component for performance',
      'Add TypeScript types to this file'
    );
  } else if (mode === 'analyze') {
    suggestions.push(
      'Find potential security issues',
      'Check for code duplications',
      'Analyze component dependencies'
    );
  } else {
    suggestions.push(
      'Show me the project structure',
      'List all React components',
      'Find unused files'
    );
  }

  return suggestions;
}

async function getRecentFiles(projectRoot) {
  try {
    const files = [];
    const clientSrc = path.join(projectRoot, 'client/src');
    const serverDir = path.join(projectRoot, 'server');

    // Get recent React components
    const components = await getFilesRecursive(path.join(clientSrc, 'components'), '.jsx');
    const pages = await getFilesRecursive(path.join(clientSrc, 'pages'), '.jsx');
    const serverFiles = await getFilesRecursive(path.join(serverDir, 'routes'), '.js');

    return [...components.slice(0, 5), ...pages.slice(0, 5), ...serverFiles.slice(0, 5)];
  } catch (error) {
    return [];
  }
}

async function getFilesRecursive(dir, ext) {
  try {
    const files = [];
    const items = await fs.readdir(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        files.push(...(await getFilesRecursive(fullPath, ext)));
      } else if (item.name.endsWith(ext)) {
        const stats = await fs.stat(fullPath);
        files.push({
          path: path.relative(process.cwd(), fullPath),
          name: item.name,
          modified: stats.mtime,
        });
      }
    }

    return files.sort((a, b) => b.modified - a.modified);
  } catch (error) {
    return [];
  }
}

async function getPackageInfo(projectRoot) {
  try {
    const packageJson = await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8');
    const pkg = JSON.parse(packageJson);
    return {
      name: pkg.name,
      version: pkg.version,
      dependencies: Object.keys(pkg.dependencies || {}),
      devDependencies: Object.keys(pkg.devDependencies || {}),
    };
  } catch (error) {
    return null;
  }
}

async function getFileStructure(dir, depth) {
  if (depth <= 0) return null;

  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    const structure = {};

    for (const item of items.slice(0, 10)) {
      // Limit to avoid too much data
      if (item.name.startsWith('.')) continue;

      if (item.isDirectory()) {
        structure[item.name] = await getFileStructure(path.join(dir, item.name), depth - 1);
      } else {
        structure[item.name] = 'file';
      }
    }

    return structure;
  } catch (error) {
    return null;
  }
}

function getFileType(ext) {
  const types = {
    '.js': 'javascript',
    '.jsx': 'react',
    '.ts': 'typescript',
    '.tsx': 'react-typescript',
    '.py': 'python',
    '.css': 'css',
    '.html': 'html',
    '.json': 'json',
  };

  return types[ext] || 'text';
}

module.exports = router;
