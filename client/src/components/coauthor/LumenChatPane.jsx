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
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';

// Mock chat history
const initialMessages = {
  2.7: [
    {
      id: 1,
      role: 'user',
      content: 'What should I include in section 2.7?',
      timestamp: new Date(Date.now() - 60000 * 60),
    },
    {
      id: 2,
      role: 'assistant',
      content:
        'Section 2.7 (Clinical Summary) should include a detailed yet concise analysis of all clinical data. Make sure to cover:\n\n1. Biopharmaceutic studies\n2. Clinical pharmacology studies\n3. Clinical efficacy studies\n4. Clinical safety findings\n5. Benefit-risk conclusions\n\nI recommend organizing this section with clear tables and graphs for the key efficacy and safety endpoints. Would you like me to help with a specific subsection?',
      timestamp: new Date(Date.now() - 60000 * 59),
    },
  ],
  3.2: [
    {
      id: 1,
      role: 'user',
      content: 'How should I structure the manufacturing information?',
      timestamp: new Date(Date.now() - 60000 * 180),
    },
    {
      id: 2,
      role: 'assistant',
      content:
        'For Section 3.2, structure your manufacturing information as follows:\n\n1. Description of the manufacturing process and process controls\n2. Control of materials\n3. Control of critical steps and intermediates\n4. Process validation and/or evaluation\n5. Manufacturing process development\n\nEnsure you include flow diagrams of the manufacturing process and clearly identify critical process parameters (CPPs) and critical quality attributes (CQAs).',
      timestamp: new Date(Date.now() - 60000 * 179),
    },
  ],
};

// Default messages for sections without specific history
const defaultMessages = [
  {
    id: 1,
    role: 'assistant',
    content:
      "Hello! I'm AnA, your Audit & Narrative Assistant. I can help you with drafting, formatting, and ensuring compliance for this section. Feel free to ask me any questions about regulatory requirements, content suggestions, or best practices.",
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
    setMessages(initialMessages[contextId] || defaultMessages);
  }, [contextId]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = () => {
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

    // Simulate AI response after a delay
    setTimeout(() => {
      const aiResponses = {
        1.1: 'For this administrative section, make sure to include all required contact information for the sponsor and investigators. Also, ensure Form FDA 356h is properly completed and signed. Would you like me to help with anything specific about this form?',
        1.2: "In the cover letter, you should clearly state the purpose of the submission, reference any prior communications with the FDA, and provide a high-level overview of what's included. Consider adding a table of contents for the submission package.",
        2.1: 'The ToC should follow the exact structure defined in ICH M4. Make sure all section numbering is correct and hyperlinks are working properly if submitting electronically.',
        2.5: 'Your Clinical Overview should focus on the benefit-risk assessment, integrating all relevant data from Module 5. Make sure to address any safety concerns identified in nonclinical studies and how the clinical program addressed them.',
        2.7: "Based on your current content, I'd recommend strengthening the efficacy summary with more quantitative data. The primary endpoint results should be presented with confidence intervals and p-values. Would you like me to suggest a table format for this data?",
        3.2: 'Your quality information appears comprehensive, but you might need to add more details on batch analysis. Regulatory authorities typically expect at least 3 batches of data. Also, consider adding a risk assessment for critical process parameters.',
        4.2: 'For the pharmacology section, make sure to clearly link the mechanism of action to the proposed indication. Include a summary table of all major nonclinical findings and their clinical relevance.',
        5.3: 'Clinical study reports should follow ICH E3 guidelines. Each CSR should include a protocol and statistical analysis plan as appendices. For pivotal studies, include patient narratives for serious adverse events and discontinuations due to adverse events.',
      };

      const defaultResponse =
        "I've analyzed this section and it appears to follow regulatory guidelines. To enhance it further, consider adding more cross-references to supporting data in other modules. Is there any specific regulatory requirement you're concerned about?";

      const aiMessage = {
        id: messages.length + 2,
        role: 'assistant',
        content: aiResponses[contextId] || defaultResponse,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);
      setIsTyping(false);
    }, 1500);
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
