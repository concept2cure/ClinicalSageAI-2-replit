import React, { useState, useRef, useEffect } from 'react';
import { XCircle, Send, Bot, BookOpen, Lightbulb, ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useResearchCompanion } from '@/hooks/use-research-companion';
import { Loader2 } from 'lucide-react';

type Message = {
  id: string;
  content: string;
  role: 'assistant' | 'user' | 'system';
  timestamp: Date;
  loading?: boolean;
  context?: string;
  references?: Array<{
    title: string;
    url: string;
    source: string;
  }>;
};

type ResearchCompanionProps = {
  pageContext?: string;
  initialPrompt?: string;
  openaiApiKey?: string;
};

export default function ResearchCompanion({
  pageContext,
  initialPrompt,
  openaiApiKey,
}: ResearchCompanionProps) {
  const {
    isVisible,
    hideCompanion,
    currentPageContext,
    apiKey: contextApiKey,
  } = useResearchCompanion();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [initialPromptSent, setInitialPromptSent] = useState(false);

  const apiKey = openaiApiKey || contextApiKey;
  const contextInfo = pageContext || currentPageContext;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle initial system message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'system-1',
          content:
            "I'm AnA, your Research Companion. I can help with clinical study reports, protocol design, and regulatory guidance. What can I assist you with today?",
          role: 'system',
          timestamp: new Date(),
          context: contextInfo,
        },
      ]);
    }
  }, []);

  // Handle initial prompt if provided
  useEffect(() => {
    if (initialPrompt && !initialPromptSent && apiKey) {
      setInitialPromptSent(true);
      handleSendMessage(initialPrompt);
    }
  }, [initialPrompt, apiKey, initialPromptSent]);

  // Focus the textarea when the component becomes visible
  useEffect(() => {
    if (isVisible && textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isVisible]);

  const generateUniqueId = () => {
    return crypto.randomUUID();
  };

  const getMessageColor = (role: string) => {
    switch (role) {
      case 'system':
        return 'bg-muted';
      case 'user':
        return 'bg-muted';
      case 'assistant':
        return 'bg-primary/5';
      default:
        return 'bg-background';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const simulateTyping = async (content: string, messageId: string) => {
    // In a real implementation, this would be replaced with a streaming response
    // from the OpenAI API. For now, we'll simulate typing with a basic delay.
    setIsTyping(true);

    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 1500));

    setMessages(prev =>
      prev.map(msg => (msg.id === messageId ? { ...msg, content, loading: false } : msg))
    );
    setIsTyping(false);
  };

  const handleSendMessage = async (overrideMessage?: string) => {
    const messageContent = overrideMessage || input;
    if (!messageContent.trim() || !apiKey) return;

    const newMessage: Message = {
      id: generateUniqueId(),
      content: messageContent,
      role: 'user',
      timestamp: new Date(),
    };

    // Add user message
    setMessages(prev => [...prev, newMessage]);
    setInput('');

    // Add loading message from assistant
    const assistantMessageId = generateUniqueId();
    const loadingMessage: Message = {
      id: assistantMessageId,
      content: '',
      role: 'assistant',
      timestamp: new Date(),
      loading: true,
    };

    setMessages(prev => [...prev, loadingMessage]);

    // In a real implementation, this would be an actual call to the OpenAI API
    // based on the context of the current page and conversation history.
    // For this example, we're just simulating a response.

    let simulatedResponse = '';

    if (
      messageContent.toLowerCase().includes('csr') ||
      messageContent.toLowerCase().includes('clinical study')
    ) {
      simulatedResponse =
        'Clinical Study Reports (CSRs) follow the ICH E3 structure, which includes 16 main sections covering study objectives, methodology, results, and conclusions. I can help you understand specific sections or explain how they fit into regulatory submissions.';
    } else if (messageContent.toLowerCase().includes('protocol')) {
      simulatedResponse =
        "When designing a clinical trial protocol, key elements include eligibility criteria, intervention details, endpoints, and statistical analysis plans. Is there a specific aspect of protocol design you'd like to explore?";
    } else if (
      messageContent.toLowerCase().includes('regulatory') ||
      messageContent.toLowerCase().includes('fda')
    ) {
      simulatedResponse =
        'Regulatory submissions vary by region. The FDA requires an IND application before clinical trials and an NDA/BLA for marketing approval. The EMA has similar but distinct requirements through the centralized procedure. Would you like more specific guidance for a particular submission type?';
    } else {
      simulatedResponse =
        "I'm here to help with your clinical research questions. I can provide information on CSR structure, protocol design, regulatory requirements, or statistical methods. How can I assist you with your current work?";
    }

    // Always include references for substantive responses
    const includeReferences = true;
    const responseMessage: Partial<Message> = {
      references: includeReferences
        ? [
            {
              title: 'ICH E6(R2) Good Clinical Practice',
              url: 'https://www.ich.org/page/efficacy-guidelines',
              source: 'ICH Guidelines',
            },
            {
              title:
                'FDA Guidance for Industry: E3 Structure and Content of Clinical Study Reports',
              url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents',
              source: 'FDA',
            },
          ]
        : undefined,
    };

    await simulateTyping(simulatedResponse, assistantMessageId);

    // Update with references if applicable
    if (includeReferences) {
      setMessages(prev =>
        prev.map(msg => (msg.id === assistantMessageId ? { ...msg, ...responseMessage } : msg))
      );
    }
  };

  if (!isVisible) return null;

  return (
    <Card className="fixed bottom-6 right-6 w-[450px] h-[600px] shadow-xl flex flex-col z-50 overflow-hidden">
      <CardHeader className="px-4 py-3 flex flex-row items-center justify-between space-y-0 border-b">
        <div className="flex items-center space-x-2">
          <Bot className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-semibold">Research Companion</CardTitle>
          {contextInfo && (
            <Badge variant="outline" className="ml-2">
              {contextInfo}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={hideCompanion}>
          <XCircle className="h-5 w-5" />
        </Button>
      </CardHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="px-4 pt-2 justify-start border-b rounded-none bg-transparent">
          <TabsTrigger value="chat" className="data-[state=active]:bg-primary/10">
            Chat
          </TabsTrigger>
          <TabsTrigger value="context" className="data-[state=active]:bg-primary/10">
            Context
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex-1 flex flex-col mt-0 data-[state=active]:flex-1">
          <ScrollArea className="flex-1 px-4 py-2">
            {messages.map(message => (
              <div
                key={message.id}
                className={`mb-4 p-3 rounded-lg ${getMessageColor(message.role)} ${message.role === 'user' ? 'ml-8' : 'mr-8'}`}
              >
                <div className="flex items-start">
                  {message.role === 'assistant' && (
                    <Bot className="h-5 w-5 text-primary mr-2 mt-0.5" />
                  )}
                  <div className="flex-1">
                    {message.loading ? (
                      <div className="flex items-center">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-muted-foreground">Thinking...</span>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                    )}

                    {message.references && message.references.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <p className="text-xs font-medium mb-1">References:</p>
                        <ul className="space-y-1">
                          {message.references.map((ref, index) => (
                            <li key={index} className="text-xs flex items-start">
                              <ExternalLink className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                              <a
                                href={ref.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline truncate"
                              >
                                {ref.title} ({ref.source})
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </ScrollArea>

          <CardFooter className="p-4 border-t">
            <div className="flex items-center w-full gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about clinical research, CSRs, or regulatory guidance..."
                className="min-h-[60px] resize-none flex-1"
                disabled={!apiKey || isTyping}
              />
              <Button
                size="icon"
                onClick={() => handleSendMessage()}
                disabled={!input.trim() || !apiKey || isTyping}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>

            {!apiKey && (
              <p className="text-xs text-muted-foreground mt-2 w-full text-center">
                Please add your OpenAI API key in settings to enable the Research Companion.
              </p>
            )}
          </CardFooter>
        </TabsContent>

        <TabsContent value="context" className="flex-1 mt-0 data-[state=active]:flex-1">
          <ScrollArea className="h-full p-4">
            <div className="space-y-4">
              <div>
                <h3 className="font-medium flex items-center mb-1">
                  <BookOpen className="h-4 w-4 mr-1" />
                  Current Context
                </h3>
                <p className="text-sm text-muted-foreground">
                  {contextInfo || 'No specific context available'}
                </p>
              </div>

              <div>
                <h3 className="font-medium flex items-center mb-1">
                  <Lightbulb className="h-4 w-4 mr-1" />
                  Research Companion Capabilities
                </h3>
                <ul className="text-sm space-y-2">
                  <li className="flex items-start">
                    <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs mr-2 mt-0.5">
                      1
                    </span>
                    <span>Contextual assistance based on your current page</span>
                  </li>
                  <li className="flex items-start">
                    <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs mr-2 mt-0.5">
                      2
                    </span>
                    <span>CSR structure and content guidance with ICH E3 references</span>
                  </li>
                  <li className="flex items-start">
                    <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs mr-2 mt-0.5">
                      3
                    </span>
                    <span>Protocol design assistance and optimization suggestions</span>
                  </li>
                  <li className="flex items-start">
                    <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs mr-2 mt-0.5">
                      4
                    </span>
                    <span>Regulatory compliance guidance with citations</span>
                  </li>
                  <li className="flex items-start">
                    <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-xs mr-2 mt-0.5">
                      5
                    </span>
                    <span>Study design methodologies and statistical considerations</span>
                  </li>
                </ul>
              </div>

              <div className="bg-muted p-3 rounded-md">
                <h3 className="font-medium mb-1">Example Prompts</h3>
                <ul className="text-sm space-y-1">
                  <li className="text-primary hover:underline cursor-pointer">
                    "Explain the key sections of an ICH E3 compliant CSR"
                  </li>
                  <li className="text-primary hover:underline cursor-pointer">
                    "What should I include in inclusion/exclusion criteria?"
                  </li>
                  <li className="text-primary hover:underline cursor-pointer">
                    "How do I calculate sample size for a superiority trial?"
                  </li>
                  <li className="text-primary hover:underline cursor-pointer">
                    "Summarize FDA requirements for expedited approval"
                  </li>
                </ul>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
