import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';

const router = express.Router();

// Simple test route to check if routing works
router.get('/test', (req, res) => {
  console.log('🤖 Test route hit!');
  res.json({ message: 'Agent route is working!', timestamp: new Date().toISOString() });
});
const execAsync = promisify(exec);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Gemini Pro if API key is available
let gemini = null;
// Gemini support will be added when the package is available

// POST /api/agent/code - Main agent endpoint with OpenAI Pro + Gemini Pro support
router.post('/', async (req, res) => {
  console.log('🤖 Agent route hit with:', req.body);
  try {
    const { prompt, context, model = 'openai' } = req.body;

    const systemPrompt = `You are a powerful embedded AI IDE coding agent with full project control. Always reply with valid JSON in this format:
{
  "action": "edit_file|create_file|run_command|install_package|build_project|start_server|stop_server|run_tests|git_commit|delete_file|move_file|bulk_edit",
  "file": "path/to/file.js",
  "content": "complete file content here", 
  "command": "npm install package-name",
  "files": [{"path": "file1.js", "content": "..."}, {"path": "file2.js", "content": "..."}],
  "from": "old/path.js",
  "to": "new/path.js",
  "message": "commit message",
  "summary": "Brief description of what you did"
}

You have FULL BUILD CONTROL:
- Create/edit/delete any files instantly
- Install packages and dependencies  
- Run build commands and start/stop servers
- Execute tests and git operations
- Make bulk changes across multiple files
- Move/rename files and directories

Never respond with vague suggestions — only actionable build commands that execute immediately.
Always provide complete file content, never partial updates.`;

    let aiResponse;
    let modelUsed = 'OpenAI GPT-4o';

    if (model === 'gemini' && gemini) {
      try {
        const geminiPrompt = `${systemPrompt}\n\nUser request: ${prompt}\nContext: ${context}`;
        const geminiResponse = await gemini.generateContent(geminiPrompt);
        const geminiText = geminiResponse.response.text();

        modelUsed = 'Google Gemini Pro';
        try {
          aiResponse = JSON.parse(geminiText);
        } catch (parseError) {
          aiResponse = {
            action: 'message',
            summary: geminiText,
          };
        }
      } catch (geminiError) {
        console.error('Gemini API error, falling back to OpenAI:', geminiError.message);
        // Fallback to OpenAI
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 4000,
        });

        modelUsed = 'OpenAI GPT-4o (fallback)';
        try {
          aiResponse = JSON.parse(response.choices[0].message.content);
        } catch (parseError) {
          aiResponse = {
            action: 'message',
            summary: response.choices[0].message.content,
          };
        }
      }
    } else {
      // Use OpenAI (default or when Gemini is not available)
      const response = await openai.chat.completions.create({
        model: 'gpt-4o', // Using latest OpenAI Pro model
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      });

      try {
        aiResponse = JSON.parse(response.choices[0].message.content);
      } catch (parseError) {
        aiResponse = {
          action: 'message',
          summary: response.choices[0].message.content,
        };
      }
    }

    let result = { success: true, message: aiResponse.summary || 'Action completed' };

    // Execute the action with enhanced capabilities
    switch (aiResponse.action) {
      case 'edit_file':
      case 'create_file':
        if (aiResponse.file && aiResponse.content) {
          const filePath = path.join(process.cwd(), aiResponse.file);
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, aiResponse.content, 'utf8');
          result.file = aiResponse.file;
          result.content = aiResponse.content;
          result.message = `✅ File ${aiResponse.file} ${aiResponse.action === 'create_file' ? 'created' : 'updated'} successfully`;
        }
        break;

      case 'delete_file':
        if (aiResponse.file) {
          try {
            const filePath = path.join(process.cwd(), aiResponse.file);
            await fs.unlink(filePath);
            result.message = `✅ File ${aiResponse.file} deleted successfully`;
          } catch (error) {
            result.success = false;
            result.message = `❌ Failed to delete ${aiResponse.file}: ${error.message}`;
          }
        }
        break;

      case 'move_file':
        if (aiResponse.from && aiResponse.to) {
          try {
            const fromPath = path.join(process.cwd(), aiResponse.from);
            const toPath = path.join(process.cwd(), aiResponse.to);
            await fs.mkdir(path.dirname(toPath), { recursive: true });
            await fs.rename(fromPath, toPath);
            result.message = `✅ File moved from ${aiResponse.from} to ${aiResponse.to}`;
          } catch (error) {
            result.success = false;
            result.message = `❌ Failed to move file: ${error.message}`;
          }
        }
        break;

      case 'bulk_edit':
        if (aiResponse.files && Array.isArray(aiResponse.files)) {
          try {
            for (const fileOp of aiResponse.files) {
              const filePath = path.join(process.cwd(), fileOp.path);
              await fs.mkdir(path.dirname(filePath), { recursive: true });
              await fs.writeFile(filePath, fileOp.content, 'utf8');
            }
            result.message = `✅ Bulk edit completed: ${aiResponse.files.length} files modified`;
            result.filesModified = aiResponse.files.map(f => f.path);
          } catch (error) {
            result.success = false;
            result.message = `❌ Bulk edit failed: ${error.message}`;
          }
        }
        break;

      case 'build_project':
        try {
          const { stdout, stderr } = await execAsync('npm run build', {
            cwd: process.cwd(),
            timeout: 120000,
          });
          result.commandOutput = stdout;
          result.commandError = stderr;
          result.message = `✅ Project built successfully`;
        } catch (execError) {
          result.success = false;
          result.commandError = execError.message;
          result.message = `❌ Build failed`;
        }
        break;

      case 'start_server':
        try {
          // Kill any existing dev server first
          try {
            await execAsync('pkill -f "npm run dev"', { timeout: 5000 });
          } catch (e) {} // Ignore if no process to kill

          // Start new server in background
          exec('npm run dev', { cwd: process.cwd() });
          result.message = `✅ Development server started`;
        } catch (execError) {
          result.success = false;
          result.message = `❌ Failed to start server: ${execError.message}`;
        }
        break;

      case 'stop_server':
        try {
          await execAsync('pkill -f "npm run dev"', { timeout: 10000 });
          result.message = `✅ Development server stopped`;
        } catch (execError) {
          result.message = `✅ No development server was running`;
        }
        break;

      case 'run_tests':
        try {
          const { stdout, stderr } = await execAsync('npm test', {
            cwd: process.cwd(),
            timeout: 60000,
          });
          result.commandOutput = stdout;
          result.commandError = stderr;
          result.message = `✅ Tests completed`;
        } catch (execError) {
          result.success = false;
          result.commandError = execError.message;
          result.message = `❌ Tests failed`;
        }
        break;

      case 'git_commit':
        if (aiResponse.message) {
          try {
            await execAsync('git add .', { cwd: process.cwd(), timeout: 10000 });
            const { stdout } = await execAsync(`git commit -m "${aiResponse.message}"`, {
              cwd: process.cwd(),
              timeout: 10000,
            });
            result.commandOutput = stdout;
            result.message = `✅ Git commit created: ${aiResponse.message}`;
          } catch (execError) {
            result.success = false;
            result.message = `❌ Git commit failed: ${execError.message}`;
          }
        }
        break;

      case 'run_command':
        if (aiResponse.command) {
          try {
            console.log(`🚀 Executing command: ${aiResponse.command}`);
            const { stdout, stderr } = await execAsync(aiResponse.command, {
              cwd: process.cwd(),
              timeout: 120000, // 2 minute timeout for long operations
              env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' },
            });
            result.commandOutput = stdout;
            result.commandError = stderr;
            result.command = aiResponse.command;
            result.message = `✅ Command executed successfully: ${aiResponse.command}`;

            // Log execution details for debugging
            console.log(`✅ Command completed: ${aiResponse.command}`);
            if (stdout) console.log('STDOUT:', stdout.substring(0, 500));
            if (stderr) console.log('STDERR:', stderr.substring(0, 500));
          } catch (execError) {
            result.success = false;
            result.commandError = execError.message;
            result.command = aiResponse.command;
            result.message = `❌ Command failed: ${aiResponse.command} - ${execError.message}`;
            console.error(`❌ Command failed: ${aiResponse.command}`, execError.message);
          }
        }
        break;

      case 'install_package':
        if (aiResponse.command) {
          try {
            const { stdout, stderr } = await execAsync(aiResponse.command, {
              cwd: process.cwd(),
              timeout: 120000,
            });
            result.commandOutput = stdout;
            result.commandError = stderr;
            result.message = `✅ Package installed: ${aiResponse.command}`;
          } catch (execError) {
            result.success = false;
            result.commandError = execError.message;
            result.message = `❌ Package installation failed: ${aiResponse.command}`;
          }
        }
        break;

      default:
        result.message = aiResponse.summary || 'Response received';
    }

    res.json({
      ...result,
      action: aiResponse.action,
      modelUsed,
      aiResponse,
    });
  } catch (error) {
    console.error('Agent code error:', error);
    res.status(500).json({
      success: false,
      error: 'Agent processing failed',
      message: error.message,
    });
  }
});

// GET /api/agent/files - List project files
router.get('/files', async (req, res) => {
  try {
    const { dir = '.' } = req.query;
    const targetDir = path.join(process.cwd(), dir);

    const files = await getDirectoryTree(targetDir, 3); // 3 levels deep
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// GET /api/agent/file-content - Read file content
router.get('/file-content', async (req, res) => {
  try {
    const { file } = req.query;
    const filePath = path.join(process.cwd(), file);

    // Security check
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

  const items = await fs.readdir(dir, { withFileTypes: true });
  const tree = [];

  for (const item of items) {
    if (item.name.startsWith('.')) continue; // Skip hidden files

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
}

export default router;
