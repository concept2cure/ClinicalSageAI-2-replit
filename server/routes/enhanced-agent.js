import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = express.Router();
const execAsync = promisify(exec);

// Initialize AI providers
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// Enhanced AI Development Assistant with full Replit Agent capabilities
router.post('/code', async (req, res) => {
  try {
    const { prompt, context = 'general', model = 'openai' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Enhanced system prompt for true coding agent capabilities
    const systemPrompt = `You are an AI Development Assistant with FULL Replit Agent capabilities. You can:

🔧 **CORE DEVELOPMENT POWERS:**
- Create, edit, delete, and move files with complete control
- Install packages and manage dependencies instantly
- Run commands (npm, build, test, git operations)
- Start/stop servers and manage processes
- Analyze codebases and debug issues
- Implement new features end-to-end

🎯 **RESPONSE FORMAT - ALWAYS USE JSON:**
{
  "message": "Clear explanation of what you're doing",
  "actions": [
    {
      "type": "file_create|file_edit|file_delete|command|install|analysis",
      "file": "path/to/file.js",
      "content": "complete file content here",
      "command": "npm install react-router-dom",
      "description": "Why this action is needed"
    }
  ],
  "suggestions": ["Next step 1", "Next step 2"],
  "success": true
}

🚀 **PROJECT CONTEXT:**
- Full-stack React/Node.js TrialSage platform
- Express backend with TypeScript
- PostgreSQL database with Drizzle ORM
- Multi-tenant architecture
- Current working directory: /home/runner/workspace

🔥 **CRITICAL RULES:**
1. ALWAYS provide complete file contents when creating/editing files
2. Execute actions immediately - don't just suggest
3. Test changes by running appropriate commands
4. Handle errors gracefully with solutions
5. Maintain existing code patterns and architecture
6. When user asks to enhance something, DO IT completely

Current context: ${context}
User request: "${prompt}"

Analyze the request and take immediate action to fulfill it completely.`;

    let aiResponse;

    // Choose AI model based on user preference
    if (model === 'gemini' && genAI) {
      // Use Gemini (platform default model can be overridden via GEMINI_MODEL)
      const requestedModel = process.env.GEMINI_MODEL || process.env.GEMINI_DEFAULT_MODEL || 'gemini-3-flash-preview';
      const fallbackModel = 'gemini-2.0-flash-exp';

      const runGemini = async (modelName) => {
        const geminiModel = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4000,
          },
        });
        const result = await geminiModel.generateContent([systemPrompt, `\nUser request: ${prompt}`]);
        return result.response.text();
      };

      try {
        aiResponse = await runGemini(requestedModel);
      } catch (e) {
        aiResponse = await runGemini(fallbackModel);
      }
    } else {
      // Use OpenAI GPT-4o (default)
      const response = await openai.chat.completions.create({
        model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        max_tokens: 4000,
        temperature: 0.1,
      });
      aiResponse = response.choices[0].message.content;
    }
    let parsedResponse = null;

    // Parse AI response
    try {
      parsedResponse = JSON.parse(aiResponse);
    } catch (e) {
      // If not valid JSON, wrap in standard format
      parsedResponse = {
        message: aiResponse,
        actions: [
          {
            type: 'analysis',
            description: aiResponse,
          },
        ],
        suggestions: [],
        success: true,
      };
    }

    // Execute all actions sequentially
    const executionResults = [];
    if (parsedResponse.actions && Array.isArray(parsedResponse.actions)) {
      for (const action of parsedResponse.actions) {
        try {
          const result = await executeAction(action);
          executionResults.push(result);
        } catch (error) {
          executionResults.push({
            ...action,
            error: error.message,
            success: false,
          });
        }
      }
    }

    res.json({
      success: true,
      message: parsedResponse.message,
      response: aiResponse,
      parsedResponse,
      executionResults,
      suggestions: parsedResponse.suggestions || [],
      modelUsed: model === 'gemini' && genAI ? (process.env.GEMINI_MODEL || process.env.GEMINI_DEFAULT_MODEL || 'gemini-3-flash-preview') : 'gpt-4o',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Enhanced agent error:', error);
    res.status(500).json({
      success: false,
      error: 'Agent processing failed',
      message: error.message,
    });
  }
});

// Execute individual actions with full capabilities
async function executeAction(action) {
  const { type, file, content, command, description } = action;

  try {
    switch (type) {
      case 'file_create':
      case 'file_edit':
        return await executeFileOperation(type, file, content);

      case 'file_delete':
        return await deleteFile(file);

      case 'command':
      case 'install':
        return await executeCommand(command, description);

      case 'analysis':
        return {
          ...action,
          success: true,
          message: 'Analysis completed',
          result: description,
        };

      default:
        return {
          ...action,
          success: true,
          message: 'Action acknowledged',
        };
    }
  } catch (error) {
    return {
      ...action,
      success: false,
      error: error.message,
      message: `Failed to execute ${type}: ${error.message}`,
    };
  }
}

// Enhanced file operations
async function executeFileOperation(operation, file, content) {
  if (!file || !content) {
    throw new Error('File path and content are required');
  }

  const filePath = path.join(process.cwd(), file);

  // Security check
  if (!filePath.startsWith(process.cwd())) {
    throw new Error('Access denied: Path outside project directory');
  }

  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Write file
    await fs.writeFile(filePath, content, 'utf8');

    const action = operation === 'file_create' ? 'created' : 'updated';
    return {
      type: operation,
      file,
      success: true,
      message: `✅ File ${action}: ${file}`,
      path: filePath,
    };
  } catch (error) {
    throw new Error(`File operation failed: ${error.message}`);
  }
}

// Delete file
async function deleteFile(file) {
  if (!file) {
    throw new Error('File path is required');
  }

  const filePath = path.join(process.cwd(), file);

  try {
    await fs.unlink(filePath);
    return {
      type: 'file_delete',
      file,
      success: true,
      message: `✅ File deleted: ${file}`,
    };
  } catch (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}

// Enhanced command execution
async function executeCommand(command, description) {
  if (!command) {
    throw new Error('Command is required');
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: 120000, // 2 minute timeout for long operations
    });

    return {
      type: 'command',
      command,
      description,
      success: true,
      message: `✅ Command executed: ${command}`,
      output: stdout,
      error: stderr,
    };
  } catch (error) {
    return {
      type: 'command',
      command,
      success: false,
      message: `❌ Command failed: ${command}`,
      error: error.message,
    };
  }
}

// Additional endpoints for file system operations
router.get('/files', async (req, res) => {
  try {
    const { dir = '.' } = req.query;
    const files = await getDirectoryTree(path.join(process.cwd(), dir), 3);
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list files' });
  }
});

router.get('/file-content', async (req, res) => {
  try {
    const { file } = req.query;
    const filePath = path.join(process.cwd(), file);

    if (!filePath.startsWith(process.cwd())) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const content = await fs.readFile(filePath, 'utf8');
    res.json({ content, file });
  } catch (error) {
    res.status(404).json({ error: 'File not found' });
  }
});

async function getDirectoryTree(dir, maxDepth, currentDepth = 0) {
  if (currentDepth >= maxDepth) return [];

  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    const tree = [];

    for (const item of items) {
      if (item.name.startsWith('.')) continue;

      const fullPath = path.join(dir, item.name);
      const relativePath = path.relative(process.cwd(), fullPath);

      if (item.isDirectory()) {
        const children = await getDirectoryTree(fullPath, maxDepth, currentDepth + 1);
        tree.push({
          name: item.name,
          type: 'directory',
          path: relativePath,
          children,
        });
      } else {
        tree.push({
          name: item.name,
          type: 'file',
          path: relativePath,
        });
      }
    }

    return tree;
  } catch (error) {
    return [];
  }
}

export default router;
