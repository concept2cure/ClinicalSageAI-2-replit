import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, Copy, Save, Upload, Download } from 'lucide-react';

export const AgentController = () => {
  const [command, setCommand] = useState('');
  const [constraints, setConstraints] = useState('');
  const [approved, setApproved] = useState(false);
  const [selectedModule, setSelectedModule] = useState('general');
  const [priority, setPriority] = useState('medium');
  const [context, setContext] = useState('');
  const [savedCommands, setSavedCommands] = useState([]);
  const [commandHistory, setCommandHistory] = useState([]);

  // Enhanced command templates organized by category
  const commandTemplates = {
    analysis: [
      'ANALYZE ONLY - do not modify:',
      'EXPLAIN EXISTING CODE in:',
      'REVIEW ARCHITECTURE for:',
      'IDENTIFY DEPENDENCIES in:',
      'TRACE DATA FLOW in:',
    ],
    modification: [
      'AWAIT APPROVAL - propose changes to:',
      'SINGLE FILE ONLY - modify:',
      'ENHANCE EXISTING FUNCTION:',
      'ADD NEW FEATURE to:',
      'REFACTOR COMPONENT:',
    ],
    trialsage: [
      'CER MODULE ONLY - work on:',
      'SERVER ROUTE ONLY - modify:',
      'CLIENT COMPONENT ONLY - update:',
      'DATABASE SCHEMA ONLY - adjust:',
      'API ENDPOINT ONLY - enhance:',
    ],
    safety: [
      'READ-ONLY MODE - inspect:',
      'BACKUP BEFORE CHANGES:',
      'VALIDATE SYNTAX ONLY:',
      'STOP ALL ACTIONS - revert to read-only mode',
      'EMERGENCY ROLLBACK:',
    ],
  };

  // Module-specific constraints
  const moduleConstraints = {
    cer: 'Only modify CER-related components in client/src/components/cer/ or server/routes/cer/',
    coauthor: 'Only modify CoAuthor components - DO NOT TOUCH protected files',
    '510k': 'Only modify 510k components in client/src/components/510k/',
    server: 'Only modify server-side files in server/ directory',
    client: 'Only modify client-side files in client/src/',
    database: 'Only modify schema files and database migrations',
    general: 'Follow development protocol EXACTLY',
  };

  useEffect(() => {
    // Load saved commands from localStorage
    const saved = localStorage.getItem('agentCommands');
    if (saved) {
      setSavedCommands(JSON.parse(saved));
    }

    const history = localStorage.getItem('agentHistory');
    if (history) {
      setCommandHistory(JSON.parse(history));
    }
  }, []);

  const handleTemplateSelect = template => {
    setCommand(template + ' ');
  };

  const handleModuleChange = module => {
    setSelectedModule(module);
    setConstraints(moduleConstraints[module] || '');
  };

  const saveCommand = () => {
    const newCommand = {
      id: Date.now(),
      command,
      constraints,
      module: selectedModule,
      priority,
      context,
      timestamp: new Date().toISOString(),
    };

    const updated = [...savedCommands, newCommand];
    setSavedCommands(updated);
    localStorage.setItem('agentCommands', JSON.stringify(updated));
  };

  const loadCommand = savedCommand => {
    setCommand(savedCommand.command);
    setConstraints(savedCommand.constraints);
    setSelectedModule(savedCommand.module);
    setPriority(savedCommand.priority);
    setContext(savedCommand.context);
  };

  const executeCommand = () => {
    const timestamp = new Date().toISOString();
    const executedCommand = {
      command,
      constraints,
      module: selectedModule,
      priority,
      context,
      approved,
      timestamp,
      status: 'executed',
    };

    // Add to history
    const updatedHistory = [executedCommand, ...commandHistory.slice(0, 19)]; // Keep last 20
    setCommandHistory(updatedHistory);
    localStorage.setItem('agentHistory', JSON.stringify(updatedHistory));

    const controlledCommand = `
AGENT - STRICT CONTROL MODE ACTIVE

COMMAND: ${command}

MODULE: ${selectedModule.toUpperCase()}
PRIORITY: ${priority.toUpperCase()}

CONSTRAINTS:
${constraints || moduleConstraints[selectedModule]}

CONTEXT:
${context || 'Standard Concept2Cure regulatory compliance platform operation'}

APPROVAL STATUS: ${approved ? 'APPROVED TO PROCEED' : 'AWAITING APPROVAL'}
TIMESTAMP: ${timestamp}

SAFETY PROTOCOLS:
- Follow development protocol EXACTLY
- No modifications without explicit approval
- Maintain existing file structure
- Preserve data integrity
- Report any conflicts immediately

${approved ? '🚀 EXECUTE WITH APPROVAL' : '⚠️ DO NOT EXECUTE - AWAITING APPROVAL'}
    `;

    navigator.clipboard.writeText(controlledCommand);

    // Show success notification
    const notification = document.createElement('div');
    notification.className =
      'fixed top-4 right-4 bg-green-600 text-white p-4 rounded-md shadow-lg z-50';
    notification.innerHTML = `
      <div class="flex items-center space-x-2">
        <div class="w-4 h-4 rounded-full bg-white"></div>
        <span>Command copied to clipboard!</span>
      </div>
    `;
    document.body.appendChild(notification);
    setTimeout(() => document.body.removeChild(notification), 3000);
  };

  const exportCommands = () => {
    const dataStr = JSON.stringify({ savedCommands, commandHistory }, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agent-commands-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importCommands = event => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          if (data.savedCommands) setSavedCommands(data.savedCommands);
          if (data.commandHistory) setCommandHistory(data.commandHistory);
          localStorage.setItem('agentCommands', JSON.stringify(data.savedCommands || []));
          localStorage.setItem('agentHistory', JSON.stringify(data.commandHistory || []));
        } catch (error) {
          alert('Error importing commands: Invalid file format');
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <span>🔒 Enhanced Agent Control Panel</span>
          <Badge variant={approved ? 'default' : 'destructive'}>
            {approved ? 'APPROVED' : 'PENDING'}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="command" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="command">Command</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="saved">Saved</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="command" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Target Module:</label>
                <Select value={selectedModule} onValueChange={handleModuleChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="cer">CER Module</SelectItem>
                    <SelectItem value="coauthor">CoAuthor</SelectItem>
                    <SelectItem value="510k">510k Module</SelectItem>
                    <SelectItem value="server">Server</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="database">Database</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Priority:</label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Command:</label>
              <Textarea
                value={command}
                onChange={e => setCommand(e.target.value)}
                placeholder="Enter your specific command..."
                className="mt-1 min-h-[100px]"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Context:</label>
              <Textarea
                value={context}
                onChange={e => setContext(e.target.value)}
                placeholder="Provide additional context for the agent..."
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Constraints:</label>
              <Textarea
                value={constraints}
                onChange={e => setConstraints(e.target.value)}
                placeholder="Additional constraints..."
                className="mt-1"
              />
            </div>

            <div className="flex items-center space-x-2 p-3 border rounded-md">
              <input
                type="checkbox"
                id="approved"
                checked={approved}
                onChange={e => setApproved(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="approved" className="text-sm flex items-center space-x-2">
                {approved ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                )}
                <span>I approve this command for execution</span>
              </label>
            </div>

            <div className="flex space-x-2">
              <Button onClick={executeCommand} className="flex-1" disabled={!command.trim()}>
                <Copy className="w-4 h-4 mr-2" />
                Copy Controlled Command
              </Button>
              <Button onClick={saveCommand} variant="outline" disabled={!command.trim()}>
                <Save className="w-4 h-4" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="templates" className="space-y-4">
            {Object.entries(commandTemplates).map(([category, templates]) => (
              <div key={category}>
                <h4 className="font-medium capitalize mb-2">{category} Commands:</h4>
                <div className="grid grid-cols-1 gap-2">
                  {templates.map((template, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      onClick={() => handleTemplateSelect(template)}
                      className="justify-start text-left"
                    >
                      {template}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="saved" className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-medium">Saved Commands</h4>
              <div className="space-x-2">
                <Button size="sm" onClick={exportCommands}>
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <label>
                    <Upload className="w-4 h-4 mr-2" />
                    Import
                    <input
                      type="file"
                      accept=".json"
                      onChange={importCommands}
                      className="hidden"
                    />
                  </label>
                </Button>
              </div>
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {savedCommands.map(cmd => (
                <div key={cmd.id} className="p-3 border rounded-md">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-sm font-medium truncate">{cmd.command}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {cmd.module}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {cmd.priority}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {new Date(cmd.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => loadCommand(cmd)}>
                      Load
                    </Button>
                  </div>
                </div>
              ))}
              {savedCommands.length === 0 && (
                <p className="text-center text-gray-500 py-8">No saved commands</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <h4 className="font-medium">Command History</h4>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {commandHistory.map((cmd, idx) => (
                <div key={idx} className="p-3 border rounded-md">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-sm font-medium truncate">{cmd.command}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {cmd.module}
                        </Badge>
                        <Badge
                          variant={cmd.approved ? 'default' : 'destructive'}
                          className="text-xs"
                        >
                          {cmd.approved ? 'Approved' : 'Pending'}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {new Date(cmd.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => loadCommand(cmd)}>
                      Replay
                    </Button>
                  </div>
                </div>
              ))}
              {commandHistory.length === 0 && (
                <p className="text-center text-gray-500 py-8">No command history</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AgentController;
