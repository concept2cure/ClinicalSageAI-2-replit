import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const AgentControlPanel = () => {
  const [agentSettings, setAgentSettings] = useState({
    enabled: true,
    autoSuggestions: true,
    codeAnalysis: true,
    securityChecks: true,
    performanceMonitoring: true,
    testGeneration: false,
    documentationGen: false,
  });

  const [agentStats, setAgentStats] = useState({
    totalInteractions: 0,
    codeSuggestions: 0,
    bugsFixed: 0,
    testsGenerated: 0,
    uptime: '0h 0m',
  });

  const [systemStatus, setSystemStatus] = useState({
    agent: 'active',
    openai: 'connected',
    database: 'healthy',
    performance: 'optimal',
  });

  useEffect(() => {
    loadAgentStats();
    const interval = setInterval(loadAgentStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadAgentStats = async () => {
    try {
      const response = await fetch('/api/ai/agent-stats');
      const stats = await response.json();
      setAgentStats(stats);
    } catch (error) {
      console.error('Error loading agent stats:', error);
    }
  };

  const updateSetting = async (key, value) => {
    setAgentSettings(prev => ({ ...prev, [key]: value }));

    try {
      await fetch('/api/ai/agent-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
    } catch (error) {
      console.error('Error updating setting:', error);
    }
  };

  const restartAgent = async () => {
    try {
      await fetch('/api/ai/restart-agent', { method: 'POST' });
      setSystemStatus(prev => ({ ...prev, agent: 'restarting' }));
      setTimeout(() => {
        setSystemStatus(prev => ({ ...prev, agent: 'active' }));
      }, 3000);
    } catch (error) {
      console.error('Error restarting agent:', error);
    }
  };

  const getStatusColor = status => {
    switch (status) {
      case 'active':
      case 'connected':
      case 'healthy':
      case 'optimal':
        return 'success';
      case 'restarting':
      case 'warning':
        return 'warning';
      case 'error':
      case 'disconnected':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🤖 Embedded Coding Agent Control Panel
            <Badge variant={getStatusColor(systemStatus.agent)}>{systemStatus.agent}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="settings" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="settings">Settings</TabsTrigger>
              <TabsTrigger value="stats">Statistics</TabsTrigger>
              <TabsTrigger value="status">System Status</TabsTrigger>
              <TabsTrigger value="logs">Activity Logs</TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Agent Enabled</label>
                  <Switch
                    checked={agentSettings.enabled}
                    onCheckedChange={checked => updateSetting('enabled', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Auto Suggestions</label>
                  <Switch
                    checked={agentSettings.autoSuggestions}
                    onCheckedChange={checked => updateSetting('autoSuggestions', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Code Analysis</label>
                  <Switch
                    checked={agentSettings.codeAnalysis}
                    onCheckedChange={checked => updateSetting('codeAnalysis', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Security Checks</label>
                  <Switch
                    checked={agentSettings.securityChecks}
                    onCheckedChange={checked => updateSetting('securityChecks', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Performance Monitoring</label>
                  <Switch
                    checked={agentSettings.performanceMonitoring}
                    onCheckedChange={checked => updateSetting('performanceMonitoring', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Test Generation</label>
                  <Switch
                    checked={agentSettings.testGeneration}
                    onCheckedChange={checked => updateSetting('testGeneration', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Documentation Generation</label>
                  <Switch
                    checked={agentSettings.documentationGen}
                    onCheckedChange={checked => updateSetting('documentationGen', checked)}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={restartAgent} variant="outline">
                  Restart Agent
                </Button>
                <Button variant="outline">Export Settings</Button>
                <Button variant="outline">Reset to Defaults</Button>
              </div>
            </TabsContent>

            <TabsContent value="stats" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {agentStats.totalInteractions}
                  </div>
                  <div className="text-sm text-gray-600">Total Interactions</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {agentStats.codeSuggestions}
                  </div>
                  <div className="text-sm text-gray-600">Code Suggestions</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{agentStats.bugsFixed}</div>
                  <div className="text-sm text-gray-600">Bugs Fixed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {agentStats.testsGenerated}
                  </div>
                  <div className="text-sm text-gray-600">Tests Generated</div>
                </div>
              </div>

              <div className="text-center pt-4">
                <div className="text-lg font-medium">Agent Uptime</div>
                <div className="text-2xl font-bold text-orange-600">{agentStats.uptime}</div>
              </div>
            </TabsContent>

            <TabsContent value="status" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 border rounded">
                  <span className="font-medium">Coding Agent</span>
                  <Badge variant={getStatusColor(systemStatus.agent)}>{systemStatus.agent}</Badge>
                </div>

                <div className="flex items-center justify-between p-3 border rounded">
                  <span className="font-medium">OpenAI API</span>
                  <Badge variant={getStatusColor(systemStatus.openai)}>{systemStatus.openai}</Badge>
                </div>

                <div className="flex items-center justify-between p-3 border rounded">
                  <span className="font-medium">Database</span>
                  <Badge variant={getStatusColor(systemStatus.database)}>
                    {systemStatus.database}
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-3 border rounded">
                  <span className="font-medium">Performance</span>
                  <Badge variant={getStatusColor(systemStatus.performance)}>
                    {systemStatus.performance}
                  </Badge>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="logs" className="space-y-4">
              <div className="h-64 border rounded p-4 overflow-y-auto bg-gray-50 font-mono text-sm">
                <div className="text-green-600">
                  [2025-01-06 10:30:15] Agent initialized successfully
                </div>
                <div className="text-blue-600">[2025-01-06 10:30:20] Code analysis enabled</div>
                <div className="text-yellow-600">
                  [2025-01-06 10:31:45] Processing user request: debug function
                </div>
                <div className="text-green-600">
                  [2025-01-06 10:31:47] Generated 3 code suggestions
                </div>
                <div className="text-blue-600">
                  [2025-01-06 10:32:10] Applied code fix for async/await issue
                </div>
                <div className="text-purple-600">
                  [2025-01-06 10:33:00] Generated unit tests for component
                </div>
                <div className="text-green-600">
                  [2025-01-06 10:33:15] Performance optimization completed
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentControlPanel;
