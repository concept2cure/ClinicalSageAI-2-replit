import React, { useState, useRef, useEffect } from 'react';
import { Send, Upload, Brain, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const SimpleCodingAgent = () => {
  const [messages, setMessages] = useState([
    {
      type: 'assistant',
      content:
        "Welcome. I'm AnA — your regulatory intelligence partner.\n\nI can assist you with:\n\n• **FDA submission guidance** (IND, NDA, 510(k), PMA)\n• **Medical device protocols** and clinical evaluation reports\n• **Pharmaceutical regulatory documentation**\n• **Clinical trial protocols** and study designs\n• **Regulatory compliance analysis**\n• **Medical writing best practices**\n• **Code generation and review**\n• **Project assistance and debugging**\n\nWhat are we working on?",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileUpload = async event => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (let file of files) {
      setMessages(prev => [
        ...prev,
        {
          type: 'assistant',
          content: `📄 File uploaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)\n\nI can analyze this document for regulatory compliance, extract key information, or help with any questions you have about it.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) {
      console.log('SendMessage blocked - inputValue:', inputValue.trim(), 'isLoading:', isLoading);
      return;
    }

    console.log('Sending message:', inputValue);

    const userMessage = {
      type: 'user',
      content: inputValue,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    const query = inputValue;
    setInputValue('');
    setIsLoading(true);

    try {
      const requestBody = {
        query: query,
        context: 'regulatory-coding-assistance',
        module: 'coding-agent',
      };

      const response = await fetch('/api/ask-lumen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('API Response:', data);

      const assistantMessage = {
        type: 'assistant',
        content:
          data.response ||
          "I received your message but couldn't generate a response. Please try again.",
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [
        ...prev,
        {
          type: 'assistant',
          content: 'Sorry, I encountered an error. Please check your connection and try again.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const renderMessage = (message, index) => {
    const isUser = message.type === 'user';

    return (
      <div key={index} className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
        <div
          className={`max-w-[80%] rounded-lg p-4 ${
            isUser ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-800 border border-gray-200'
          }`}
        >
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
          <div className="text-xs opacity-70 mt-2">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
        <div className="flex items-center gap-3">
          <Brain className="h-8 w-8" />
          <div>
            <h2 className="text-2xl font-bold">AI Coding Assistant</h2>
            <p className="text-blue-100">Regulatory Affairs & Development Expert</p>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-6" style={{ maxHeight: 'calc(100vh - 300px)' }}>
        {messages.map(renderMessage)}
        {isLoading && (
          <div className="flex justify-start mb-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                <span className="text-sm text-gray-600">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 p-6">
        <div className="flex flex-col gap-4">
          {/* File Upload */}
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              multiple
              accept=".pdf,.doc,.docx,.txt,.md"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              Upload Files
            </Button>
            <span className="text-xs text-gray-500">
              Upload documents for analysis (PDF, DOC, TXT, MD)
            </span>
          </div>

          {/* Message Input */}
          <div className="flex gap-2">
            <Textarea
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me about regulatory affairs, coding, or upload documents for analysis..."
              className="flex-1 min-h-[60px] resize-none"
              disabled={isLoading}
            />
            <Button
              onClick={() => {
                console.log('Send button clicked!');
                sendMessage();
              }}
              disabled={isLoading || !inputValue.trim()}
              className="px-6"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          <div className="text-xs text-gray-500">Press Enter to send, Shift+Enter for new line</div>
        </div>
      </div>
    </div>
  );
};

export default SimpleCodingAgent;
