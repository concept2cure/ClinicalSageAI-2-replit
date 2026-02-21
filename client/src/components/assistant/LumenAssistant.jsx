import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2, PlusCircle, MoreVertical, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLumenAssistant } from './LumenAssistantProvider';

export function LumenAssistantButton({ variant = 'default', size = 'default', tooltip }) {
  const { isAssistantOpen, setIsAssistantOpen } = useLumenAssistant();

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => setIsAssistantOpen(true)}
      aria-label="Ask Lumen AI Assistant"
      className="relative"
    >
      <MessageSquare className={size === 'icon' ? 'h-4 w-4' : 'h-4 w-4 mr-2'} />
      {size !== 'icon' && 'Ask LUMEN'}
      {tooltip && (
        <div className="absolute bottom-full mb-2 hidden group-hover:block bg-foreground text-background text-xs px-2 py-1 rounded pointer-events-none">
          {tooltip}
        </div>
      )}
    </Button>
  );
}

const mockMessages = [
  {
    id: 1,
    role: 'system',
    content:
      "Hello! I'm ASK LUMEN, your regulatory intelligence and document preparation assistant. How can I help with your IND submission today?",
    timestamp: new Date().toISOString(),
  },
];

export default function LumenAssistant() {
  const { isAssistantOpen, setIsAssistantOpen } = useLumenAssistant();
  const [messages, setMessages] = useState(mockMessages);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isAssistantOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
    scrollToBottom();
  }, [isAssistantOpen, messages]);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    // Add user message
    const userMessage = {
      id: messages.length + 1,
      role: 'user',
      content: inputValue,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Simulate AI response
    setTimeout(() => {
      const assistantMessage = {
        id: messages.length + 2,
        role: 'assistant',
        content: generateResponse(inputValue),
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1500);
  };

  // Simple response generation
  const generateResponse = input => {
    const inputLower = input.toLowerCase();

    if (inputLower.includes('ind') && inputLower.includes('form')) {
      return 'For IND applications, you need to complete several key FDA forms including Form FDA 1571 (IND Application), Form FDA 1572 (Statement of Investigator), Form FDA 3674 (Certification of Compliance), and Form FDA 3454 (Financial Disclosure). You can access all these forms in the FDA Forms section of the eCTD Co-Author module.';
    }

    if (inputLower.includes('protocol') || inputLower.includes('study design')) {
      return 'Creating a robust clinical protocol is essential for IND approval. The Protocol Builder in our Study Architect module can help you develop a scientifically sound protocol with all ICH E6-compliant sections. Would you like me to help you structure a specific section?';
    }

    if (inputLower.includes('cmc') || inputLower.includes('manufacturing')) {
      return 'The Chemistry, Manufacturing, and Controls (CMC) section is critical for your IND. You need to document the composition, manufacture, stability, and controls of both the drug substance and drug product. Our CMC Module can guide you through this process systematically, ensuring compliance with FDA expectations.';
    }

    if (inputLower.includes('deadline') || inputLower.includes('timeline')) {
      return "Managing your IND submission timeline effectively is crucial. Typically, you should allow 4-6 months for preparation. Key milestones include: finalizing the protocol (30-60 days before submission), completing CMC documentation (45-60 days before), and preparing the Investigator's Brochure (30-45 days before). Would you like me to help you create a customized timeline?";
    }

    return `I understand your question about ${input.split(' ').slice(0, 3).join(' ')}... To give you the most accurate guidance, could you provide more context about your specific regulatory needs or the section of your IND submission you're working on?`;
  };

  // If assistant is closed, render just the button
  if (!isAssistantOpen) return null;

  return (
    <div className="fixed bottom-0 right-0 mb-4 mr-4 z-50 flex flex-col w-96 h-[600px] bg-background rounded-lg border shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-primary/10 p-3 border-b">
        <div className="flex items-center">
          <MessageSquare className="h-5 w-5 text-primary mr-2" />
          <h3 className="font-semibold">ASK LUMEN AI Assistant</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsAssistantOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 p-4 overflow-y-auto">
        {messages.map(message => (
          <div
            key={message.id}
            className={`mb-4 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`px-4 py-2 rounded-lg max-w-[80%] ${
                message.role === 'user' ? 'bg-primary text-primary-foreground ml-4' : 'bg-muted'
              }`}
            >
              {message.content}
              <div
                className={`text-xs mt-1 ${
                  message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                }`}
              >
                {new Date(message.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="mb-4 flex justify-start">
            <div className="px-4 py-2 rounded-lg bg-muted flex items-center">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Generating response...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Footer/Input */}
      <div className="p-3 border-t">
        <form onSubmit={handleSubmit} className="flex items-end">
          <Textarea
            ref={inputRef}
            placeholder="Ask a question or request guidance..."
            className="min-h-10 resize-none mr-2 flex-1"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <Button type="submit" size="icon" disabled={!inputValue.trim() || isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <div className="flex items-center">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-auto p-0">
                  <PlusCircle className="h-3 w-3 mr-1" />
                  <span>New topic</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48" align="start">
                <div className="space-y-1">
                  <Button variant="ghost" size="sm" className="w-full justify-start text-xs">
                    IND Preparation Guide
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start text-xs">
                    CMC Section Guidance
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start text-xs">
                    Protocol Design Help
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-auto p-0">
                <MoreVertical className="h-3 w-3 mr-1" />
                <span>Options</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48" align="end">
              <div className="space-y-1">
                <Button variant="ghost" size="sm" className="w-full justify-start text-xs">
                  <Download className="h-3 w-3 mr-1" />
                  Save Conversation
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start text-xs">
                  Clear History
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start text-xs">
                  Assistant Settings
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
