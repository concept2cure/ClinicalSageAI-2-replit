import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Send,
  Bot,
  User,
  Paperclip,
  ListChecks,
  RefreshCw,
  ChevronDown,
  Code,
  Image,
  Copy,
  AlertTriangle,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { CitationList, ConfidenceBadge } from '@/components/ai/AIResponseBlock';

// Default welcome message
const defaultMessages = [
  {
    id: 1,
    role: 'assistant',
    content:
      "Hello! I'm your Lumen AI Regulatory Assistant. I can help you with drafting, formatting, and ensuring compliance for this section. Feel free to ask me any questions about regulatory requirements, content suggestions, or best practices.",
    timestamp: new Date(),
    source: 'system',
  },
];

export default function LumenChatPane({ contextId }) {
  const [messages, setMessages] = useState(defaultMessages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const [aiModel, setAiModel] = useState(null);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  // Reset chat when context changes
  useEffect(() => {
    setMessages(defaultMessages);
    setThreadId(null);
    setAiModel(null);
    setError(null);
  }, [contextId]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage = {
      id: messages.length + 1,
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const userInput = input;
    setInput('');
    setIsTyping(true);
    setError(null);

    try {
      const response = await fetch('/api/chat/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userInput,
          thread_id: threadId,
          system_prompt: contextId
            ? `You are a regulatory affairs AI assistant helping with eCTD section ${contextId}. Provide specific, actionable guidance for this regulatory document section. Include ICH guideline references where applicable.`
            : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();

      if (data.thread_id) setThreadId(data.thread_id);
      if (data.model) setAiModel(data.model);

      const aiMessage = {
        id: messages.length + 2,
        role: 'assistant',
        content: data.answer || 'I was unable to generate a response. Please try again.',
        timestamp: new Date(),
        model: data.model,
        source: 'api',
        citations: data.citations || data.sources || [],
        confidence: typeof data.confidence === 'number' ? data.confidence : null,
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      console.error('LumenChatPane: Failed to get AI response:', err);
      setError('Failed to reach the AI service. Please try again.');

      const errorMessage = {
        id: messages.length + 2,
        role: 'assistant',
        content:
          'I encountered an error connecting to the AI service. Please check your connection and try again.',
        timestamp: new Date(),
        source: 'error',
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = timestamp => {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center">
          <Bot className="h-5 w-5 mr-2 text-primary" />
          Lumen AI Assistant
          {contextId && (
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              Section {contextId}
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Ask me about regulatory requirements, content suggestions, or compliance issues
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4">
        <div className="space-y-4 h-[300px] overflow-y-auto mb-4 p-2">
          {messages.map(message => (
            <div
              key={message.id}
              className={`flex items-start gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}
            >
              {message.role === 'assistant' && (
                <Avatar className="h-8 w-8">
                  <AvatarImage src="/avatar-bot.png" />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div
                className={`max-w-[80%] ${message.role === 'user' ? 'bg-primary text-primary-foreground' : message.source === 'error' ? 'bg-destructive/10 border border-destructive/20' : 'bg-muted'} rounded-xl px-4 py-2.5`}
              >
                <div className="space-y-2">
                  <div className="prose prose-sm whitespace-pre-line break-words">
                    {message.source === 'error' && (
                      <AlertTriangle className="h-4 w-4 inline mr-1 text-destructive" />
                    )}
                    {message.content}
                  </div>
                  {/* Citation / Source rendering — regulatory traceability */}
                  {message.role === 'assistant' && message.source === 'api' && (
                    <div className="mt-2">
                      {message.confidence !== null && message.confidence !== undefined && (
                        <div className="mb-1">
                          <ConfidenceBadge score={message.confidence} />
                        </div>
                      )}
                      <CitationList citations={message.citations || []} />
                    </div>
                  )}
                  <div
                    className={`text-xs ${message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'} justify-between flex`}
                  >
                    <span>{formatTime(message.timestamp)}</span>
                    {message.role === 'assistant' && message.source !== 'error' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 text-muted-foreground hover:text-foreground"
                        onClick={() => navigator.clipboard?.writeText(message.content)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {message.role === 'user' && (
                <Avatar className="h-8 w-8">
                  <AvatarImage src="/avatar-user.png" />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex items-start gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src="/avatar-bot.png" />
                <AvatarFallback className="bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="max-w-[80%] bg-muted rounded-xl px-4 py-3.5">
                <div className="flex space-x-1">
                  <span className="animate-bounce">•</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>
                    •
                  </span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>
                    •
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="text-xs text-destructive mb-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {error}
          </div>
        )}

        <div className="flex space-x-2">
          <Button variant="outline" size="icon" className="flex-shrink-0">
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            placeholder="Ask about regulatory requirements..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-10 flex-1"
            rows={1}
          />
          <Button
            variant="default"
            size="icon"
            onClick={handleSendMessage}
            disabled={!input.trim() || isTyping}
            className="flex-shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
      <CardFooter className="pt-0 px-4 pb-4 border-t flex justify-between items-center text-xs text-muted-foreground">
        <span>{aiModel ? `Powered by ${aiModel}` : 'Powered by Lumen Cortex AI'}</span>
        <div className="flex space-x-2">
          <Button variant="ghost" size="sm" className="h-7 px-2">
            <Image className="h-3 w-3 mr-1" />
            Images
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2">
            <Code className="h-3 w-3 mr-1" />
            Tables
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2">
            <ListChecks className="h-3 w-3 mr-1" />
            Actions
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
