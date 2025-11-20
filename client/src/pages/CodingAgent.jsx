import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  Send,
  Code,
  Terminal,
  FileText,
  Loader2,
  Bot,
  Brain,
  Zap,
  Settings,
  RefreshCw,
  ArrowLeft,
  Play,
  Package,
  GitBranch,
  Database,
  Globe,
  Folder,
  Search,
  Download,
  Upload,
  Cpu,
  Monitor,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const CodingAgent = () => {
  const [, setLocation] = useLocation();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [agentModel, setAgentModel] = useState('openai');
  const [activeTab, setActiveTab] = useState('chat');
  const messagesEndRef = useRef(null);
  const { toast } = useToast();

  // Initialize welcome message
  useEffect(() => {
    setMessages([
      {
        role: 'assistant',
        content:
          "Hello! I'm your AI Development Assistant. I can write code, edit files, run commands, and help with your Concept2Cure project development. What would you like me to help you with?",
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Execute agent request
  const executeAgentRequest = async () => {
    if (!input.trim()) return;

    setIsLoading(true);

    const userMessage = {
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');

    try {
      const response = await fetch('/api/agent/code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: currentInput,
          context: 'Concept2Cure regulatory platform development',
          model: agentModel,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      const agentMessage = {
        role: 'assistant',
        content: data.response || data.message || 'Task completed successfully',
        timestamp: new Date().toLocaleTimeString(),
        model: agentModel,
      };

      setMessages(prev => [...prev, agentMessage]);

      toast({
        title: 'Agent Executed Successfully',
        description: 'Your coding request has been processed',
      });
    } catch (error) {
      console.error('Agent request failed:', error);

      const errorMessage = {
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: new Date().toLocaleTimeString(),
        isError: true,
      };

      setMessages(prev => [...prev, errorMessage]);

      toast({
        title: 'Agent Request Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Quick action buttons
  const quickActions = [
    { label: 'Show Project Structure', prompt: 'Show me the current project structure' },
    { label: 'Code Review', prompt: 'Check for any code issues or improvements' },
    { label: 'Run Tests', prompt: 'Run the test suite and show results' },
    { label: 'Install Package', prompt: 'Help me install a new package' },
    { label: 'Git Status', prompt: 'Show me the current git status' },
    { label: 'Database Schema', prompt: 'Show me the database schema' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/client-portal')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Portal
            </Button>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-2 rounded-lg">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">AI Development Assistant</h1>
              <p className="text-sm text-gray-600">Code, Build, Deploy</p>
            </div>
          </div>

          {/* Model Selector */}
          <div className="flex items-center gap-2 mb-4">
            <Select value={agentModel} onValueChange={setAgentModel}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    OpenAI GPT-4o
                  </div>
                </SelectItem>
                <SelectItem value="gemini">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Gemini Pro
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="bg-green-100 text-green-700">
              Live
            </Badge>
          </div>
        </div>

        {/* Capabilities */}
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Capabilities
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2 bg-blue-50 rounded text-sm">
              <Code className="w-4 h-4 text-blue-600" />
              Write & Edit Code
            </div>
            <div className="flex items-center gap-2 p-2 bg-green-50 rounded text-sm">
              <Terminal className="w-4 h-4 text-green-600" />
              Run Commands
            </div>
            <div className="flex items-center gap-2 p-2 bg-purple-50 rounded text-sm">
              <FileText className="w-4 h-4 text-purple-600" />
              Manage Files
            </div>
            <div className="flex items-center gap-2 p-2 bg-orange-50 rounded text-sm">
              <Package className="w-4 h-4 text-orange-600" />
              Install Packages
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="p-4 flex-1">
          <h3 className="text-sm font-medium mb-3">Quick Actions</h3>
          <div className="space-y-2">
            {quickActions.map((action, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                className="w-full justify-start text-left"
                onClick={() => setInput(action.prompt)}
                disabled={isLoading}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold">Development Console</h2>
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600">TrialSage Platform</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMessages([])}
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Clear Chat
              </Button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="max-w-4xl mx-auto">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <Bot className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium mb-2">Ready to Assist</h3>
                <p className="text-gray-600 mb-6">
                  Ask me to write code, run commands, or help with your development tasks
                </p>
                <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
                  <div className="text-center">
                    <Code className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                    <p className="text-sm text-gray-600">Code Writing</p>
                  </div>
                  <div className="text-center">
                    <Terminal className="w-8 h-8 mx-auto mb-2 text-green-600" />
                    <p className="text-sm text-gray-600">Command Execution</p>
                  </div>
                  <div className="text-center">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-purple-600" />
                    <p className="text-sm text-gray-600">File Management</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : message.isError
                            ? 'bg-red-50 text-red-800 border border-red-200'
                            : 'bg-white border border-gray-200'
                      }`}
                    >
                      <div className="whitespace-pre-wrap font-mono text-sm">{message.content}</div>
                      <div className="text-xs opacity-70 mt-2 flex items-center gap-2">
                        {message.timestamp}
                        {message.model && (
                          <Badge variant="outline" className="text-xs">
                            {message.model}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t border-gray-200 bg-white">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-3">
              <Textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask me to write code, run commands, or help with development..."
                className="flex-1 min-h-[60px] resize-none"
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    executeAgentRequest();
                  }
                }}
              />
              <Button
                onClick={executeAgentRequest}
                disabled={isLoading || !input.trim()}
                className="bg-blue-600 hover:bg-blue-700 self-end px-8"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodingAgent;
