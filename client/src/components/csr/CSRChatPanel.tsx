import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter, } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MessageSquare, Send, ChevronDown, Bot, User, AlertTriangle } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  citations?: { text: string; source: string; page?: number }[];
};

export default function CSRChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content:
        'Hello! I can help you analyze clinical study report data. Ask me about endpoint statistics, safety data, or study design across trials.',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim() || isSubmitting) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsSubmitting(true);

    // Simulate API response delay
    setTimeout(() => {
      let responseContent = '';
      let citations: { text: string; source: string; page?: number }[] = [];

      // Sample responses based on user query
      if (
        inputValue.toLowerCase().includes('efficacy') ||
        inputValue.toLowerCase().includes('endpoint')
      ) {
        responseContent =
          'Based on my analysis of 217 oncology CSRs, the most common primary efficacy endpoints are Progression-Free Survival (used in 68% of studies) and Overall Survival (used in 42% of studies). For Phase 2 studies, Objective Response Rate is more commonly used (83% of Phase 2 studies).';
        citations = [
          {
            text: 'Primary endpoints in oncology trials showed clear phase-dependency, with ORR dominating Phase 2 and PFS/OS dominating Phase 3.',
            source: 'Chen et al. (2024) - Oncology Clinical Trial Design Trends',
            page: 42,
          },
          {
            text: 'Statistical methodologies for time-to-event endpoints have evolved substantially over the past decade.',
            source: 'Global Oncology Therapeutics CSR Database',
            page: 156,
          },
        ];
      } else if (
        inputValue.toLowerCase().includes('safety') ||
        inputValue.toLowerCase().includes('adverse')
      ) {
        responseContent =
          'Across neurology studies, the most frequently reported adverse events are headache (32% of subjects), dizziness (24%), and fatigue (18%). Discontinuation due to adverse events occurs in approximately 8% of active treatment subjects compared to 2.7% in placebo arms.';
        citations = [
          {
            text: 'Safety profiles across neurological disease indications showed consistent patterns of common AEs with headache being the most prevalent.',
            source: 'Neurology Disease Portfolio Analysis',
            page: 87,
          },
        ];
      } else if (inputValue.toLowerCase().includes('placebo')) {
        responseContent =
          'Placebo response rates vary significantly by therapeutic area. In depression studies, mean placebo response is 31.7% (n=142 studies), while in pain studies the average is 27.9% (n=85 studies). Placebo response rates have shown an increasing trend over time in psychiatry (0.5% increase per year, p<0.01).';
        citations = [
          {
            text: 'Placebo response in pain trials: a systematic review and data analysis',
            source: 'Analgesic Study Database 2023',
            page: 103,
          },
          {
            text: 'Temporal trends in placebo response show statistically significant increases across psychiatric indications.',
            source: 'Walsh et al. (2024)',
            page: 28,
          },
        ];
      } else {
        responseContent =
          "I've analyzed the available CSR data related to your query. While I don't have a specific trend to report, I can help you narrow your question to specific aspects of study design, endpoints, or safety data to get more targeted insights.";
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseContent,
        timestamp: new Date(),
        citations: citations,
      };

      setMessages(prev => [...prev, assistantMessage]);
      setIsSubmitting(false);
    }, 1500);
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center">
          <MessageSquare className="mr-2 h-5 w-5" />
          CSR Intelligence Chat
        </CardTitle>
        <CardDescription>Ask questions about clinical study data across trials</CardDescription>
      </CardHeader>

      <CardContent className="flex-grow overflow-y-auto px-4 pt-0">
        <div className="space-y-4">
          {messages.map(message => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`rounded-lg px-4 py-2 max-w-[80%] ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {message.role === 'assistant' ? (
                    <Bot className="h-4 w-4" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                  <span className="text-xs font-medium">
                    {message.role === 'user' ? 'You' : 'CSR Intelligence'}
                  </span>
                </div>

                <div className="text-sm">{message.content}</div>

                {message.citations && message.citations.length > 0 && (
                  <Accordion type="single" collapsible className="mt-2 w-full">
                    <AccordionItem value="citations" className="border-0">
                      <AccordionTrigger className="py-1 text-xs font-medium hover:no-underline">
                        <span className="text-xs underline">
                          {message.citations.length} citation
                          {message.citations.length > 1 ? 's' : ''}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="text-xs space-y-2 mt-1">
                          {message.citations.map((citation, idx) => (
                            <div key={idx} className="bg-gray-50 dark:bg-gray-700 p-2 rounded">
                              <div className="font-medium">{citation.source}</div>
                              {citation.page && (
                                <div className="text-gray-500">Page {citation.page}</div>
                              )}
                              <div className="mt-1 italic">"{citation.text}"</div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}

                <div className="text-xs text-gray-400 mt-1">
                  {message.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          ))}

          {isSubmitting && (
            <div className="flex justify-start">
              <div className="rounded-lg px-4 py-2 bg-gray-100 dark:bg-gray-800">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  <span className="text-xs font-medium">CSR Intelligence</span>
                </div>
                <div className="mt-1 flex items-center space-x-1">
                  <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div
                    className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: '0.2s' }}
                  ></div>
                  <div
                    className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: '0.4s' }}
                  ></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <MessageSquare className="h-12 w-12 text-gray-300 mb-2" />
            <h3 className="text-lg font-semibold">No messages yet</h3>
            <p className="text-sm text-gray-500">
              Start a conversation to get insights from CSR documents
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="border-t p-4">
        <form onSubmit={handleSendMessage} className="flex w-full gap-2">
          <Input
            placeholder="Ask about efficacy endpoints, safety data, or study design..."
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            disabled={isSubmitting}
            className="flex-grow"
          />
          <Button type="submit" size="icon" disabled={isSubmitting || !inputValue.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
