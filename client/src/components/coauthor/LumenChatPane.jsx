import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Send, Bot, User, Paperclip, ListChecks, RefreshCw, ChevronDown, Code, Image, Copy } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { chatWithCoauthor } from '@/api/coauthor';

const defaultMessages = [
  {
    id: 1,
    role: 'assistant',
    content:
      "Hello! I'm your Lumen AI Regulatory Assistant. I can help you with drafting, formatting, and ensuring compliance for this section. Feel free to ask me any questions about regulatory requirements, content suggestions, or best practices.",
    timestamp: new Date(Date.now() - 60000 * 5),
  },
];

export default function LumenChatPane({ contextId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  // Load section-specific chat history
  useEffect(() => {
    setMessages(defaultMessages);
  }, [contextId]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    // Add user message
    const userMessage = {
      id: messages.length + 1,
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      const payload = await chatWithCoauthor(userMessage.content, [{ sectionId: contextId }]);
      const aiMessage = {
        id: messages.length + 2,
        role: 'assistant',
        content: payload?.answer || 'I could not generate a response at this time.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      setMessages(prev => [
        ...prev,
        {
          id: messages.length + 2,
          role: 'assistant',
          content: 'The assistant is temporarily unavailable. Please try again.',
          timestamp: new Date(),
        },
      ]);
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
                className={`max-w-[80%] ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'} rounded-xl px-4 py-2.5`}
              >
                <div className="space-y-2">
                  <div className="prose prose-sm whitespace-pre-line break-words">
                    {message.content}
                  </div>
                  <div
                    className={`text-xs ${message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'} justify-between flex`}
                  >
                    <span>{formatTime(message.timestamp)}</span>
                    {message.role === 'assistant' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 text-muted-foreground hover:text-foreground"
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
        <span>Powered by GPT-4o & Regulatory Knowledge Base</span>
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
