import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Brain,
  Zap,
  RotateCcw,
  Upload,
  Microscope,
  Loader2,
  Sparkles,
  UserRound,
  Paperclip,
  File,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export const AnAAssistant = ({ isOpen, onClose, module = 'general', context = {} }) => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "Hello! I'm AnA, your RI Co-pilot for Regulatory Affairs and Medical Writing. I can help you with FDA submissions, clinical documentation, regulatory compliance, medical device protocols, and pharmaceutical submissions. How can I assist you today?",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agentModel, setAgentModel] = useState('openai');
  const [activeTab, setActiveTab] = useState('chat');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const { toast } = useToast();

  // Quick questions that users can click to ask
  const quickQuestions = ['510k Guidance', 'CER Writing', 'Compliance Check'];

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Execute regulatory request
  const executeRegulatoryRequest = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      let response = await fetch('/api/ana-ri/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          intent_lens: 'auto',
          user_role: 'general',
          project_context: {
            module,
            ...context,
          },
          context: {
            module,
            ...context,
          },
        }),
      });

      // Backward compatibility fallback for environments where /api/ana-ri may be unavailable
      if (!response.ok) {
        response = await fetch('/api/ai/regulatory-guidance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            question: userMessage.content,
            model: agentModel,
            context: 'regulatory_compliance',
            module,
            contextData: context,
          }),
        });
      }

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const data = await response.json();
      const normalizedResponse =
        data?.data?.response ||
        data?.response ||
        data?.answer ||
        'I apologize, but I was unable to generate a response at this time. Please try again.';

      const aiMessage = {
        role: 'assistant',
        content: normalizedResponse,
        timestamp: new Date().toLocaleTimeString(),
        model: agentModel,
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Regulatory consultation error:', error);

      const errorMessage = {
        role: 'assistant',
        content:
          "I apologize, but I'm currently experiencing technical difficulties. Please try again in a moment, or refer to the relevant regulatory guidelines directly.",
        timestamp: new Date().toLocaleTimeString(),
        isError: true,
      };

      setMessages(prev => [...prev, errorMessage]);

      toast({
        title: 'Consultation Temporarily Unavailable',
        description: 'Please try again or consult regulatory guidelines directly',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Clear conversation
  const clearConversation = () => {
    setMessages([
      {
        role: 'assistant',
        content:
          "Hello! I'm AnA, your RI Co-pilot for Regulatory Affairs and Medical Writing. I can help you with FDA submissions, clinical documentation, regulatory compliance, medical device protocols, and pharmaceutical submissions. How can I assist you today?",
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  };

  // Handle quick question clicks
  const handleQuickQuestion = question => {
    // Map the quick button labels to full questions
    const questionMap = {
      '510k Guidance':
        'What are the key 510k submission requirements and guidance for medical device approval?',
      'CER Writing':
        'How should I approach Clinical Evaluation Report (CER) writing for medical device submissions?',
      'Compliance Check':
        'What compliance requirements should I verify for my regulatory submission?',
    };

    const fullQuestion = questionMap[question] || question;
    setInput(fullQuestion);
    executeRegulatoryRequest();
  };

  // Handle file attachment
  const handleFileAttachment = () => {
    fileInputRef.current?.click();
  };

  // Handle file change
  const handleFileChange = e => {
    const files = Array.from(e.target.files);
    setAttachedFiles(prev => [...prev, ...files]);
  };

  // Remove attached file
  const handleRemoveFile = indexToRemove => {
    setAttachedFiles(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="w-[90vw] sm:w-[600px] md:w-[700px] lg:w-[600px] xl:w-[650px] 2xl:w-[700px] max-w-[900px] flex flex-col h-full z-[99999] bg-white border-l shadow-2xl overflow-hidden"
      >
        <SheetHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-2 rounded-lg">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <SheetTitle>AnA v1.0 — RI Co-pilot</SheetTitle>
                <SheetDescription>
                  Regulatory compliance, medical writing, and FDA submissions
                </SheetDescription>
              </div>
            </div>
            <Badge variant="secondary" className="bg-green-100 text-green-700">
              Live
            </Badge>
          </div>

          {/* Model Selector and Controls */}
          <div className="flex items-center gap-2 pt-2">
            <Select value={agentModel} onValueChange={setAgentModel}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[100000]">
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

            <Button
              variant="outline"
              size="sm"
              onClick={clearConversation}
              className="text-gray-600 hover:text-gray-800"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* Expertise Card */}
        <Card className="mb-4 border border-blue-200 bg-blue-50/50">
          <CardContent className="p-3">
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <Microscope className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-blue-900 mb-1">Regulatory Expertise</h4>
                <p className="text-sm text-blue-700">
                  FDA submissions • Medical writing • Device protocols • Clinical documentation •
                  Compliance guidelines
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-4 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'chat'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Bot className="w-4 h-4 inline mr-2" />
            Chat
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'documents'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Upload className="w-4 h-4 inline mr-2" />
            Documents
          </button>
        </div>

        {/* Chat Messages */}
        {activeTab === 'chat' && (
          <div className="flex-1 overflow-y-auto p-4 lg:p-6 xl:p-8 bg-gray-50 space-y-4 lg:space-y-6">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`flex items-start max-w-[85%] lg:max-w-[85%] xl:max-w-[80%] 2xl:max-w-[85%] rounded-lg p-3 lg:p-4 xl:p-5 ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-800'
                  }`}
                >
                  <div
                    className={`rounded-full w-6 h-6 flex items-center justify-center mr-2 flex-shrink-0 ${
                      message.role === 'user' ? 'bg-blue-500' : 'bg-blue-100'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <UserRound size={14} className="text-white" />
                    ) : (
                      <Bot size={14} className="text-blue-600" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-1">
                      {message.role === 'user' ? 'You' : 'AnA'}
                    </p>
                    <p className="text-sm xl:text-sm 2xl:text-base whitespace-pre-line leading-relaxed">
                      {message.content}
                    </p>
                    <div className="text-xs opacity-70 mt-1">{message.timestamp}</div>
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <div className="flex space-x-1 items-center">
                    <Bot size={14} className="text-blue-600 mr-2" />
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-75"></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-150"></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="flex-1 p-4">
            <div className="text-center py-8 text-gray-500">
              <Upload className="w-8 h-8 mx-auto mb-3 text-gray-400" />
              <p className="text-base font-medium">Document Upload</p>
              <p className="text-sm mt-1">Upload regulatory documents for AI analysis</p>
            </div>
          </div>
        )}

        {/* Attached Files Section */}
        {activeTab === 'chat' && attachedFiles.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-xs font-medium text-gray-700">
                Attached Documents ({attachedFiles.length})
              </h4>
            </div>
            <div className="space-y-2 max-h-24 overflow-y-auto">
              {attachedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-white p-2 rounded text-xs border border-gray-200"
                >
                  <div className="flex items-center">
                    <File size={14} className="text-blue-500 mr-2" />
                    <span className="truncate max-w-[180px]">{file.name}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveFile(idx)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input Form */}
        {activeTab === 'chat' && (
          <div className="border-t border-gray-200 p-3 lg:p-4 xl:p-5 flex items-center">
            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
            />

            {/* File attachment button */}
            <button
              type="button"
              onClick={handleFileAttachment}
              disabled={isLoading}
              className={`p-2 mr-1 rounded ${
                isLoading ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-50'
              }`}
              title="Attach documents for analysis"
            >
              <Paperclip size={18} />
            </button>

            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about your regulatory strategy..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isLoading}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  executeRegulatoryRequest();
                }
              }}
            />
            <button
              type="button"
              onClick={executeRegulatoryRequest}
              disabled={!input.trim() || isLoading}
              className={`ml-2 px-4 py-2 rounded-md ${
                !input.trim() || isLoading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <Send size={18} />
            </button>
          </div>
        )}

        {/* Quick Questions */}
        {activeTab === 'chat' && (
          <div className="border-t border-gray-200 p-3 lg:p-4 xl:p-5 bg-white flex gap-2 lg:gap-3">
            {quickQuestions.map((question, idx) => {
              const pastelColors = [
                'bg-blue-100 hover:bg-blue-150 text-blue-700 border-blue-200',
                'bg-purple-100 hover:bg-purple-150 text-purple-700 border-purple-200',
                'bg-green-100 hover:bg-green-150 text-green-700 border-green-200',
              ];
              return (
                <button
                  key={idx}
                  onClick={() => handleQuickQuestion(question)}
                  className={`px-3 py-1.5 text-xs ${pastelColors[idx]} rounded-md border`}
                >
                  {question}
                </button>
              );
            })}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
