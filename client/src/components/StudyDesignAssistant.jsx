// client/src/components/StudyDesignAssistant.jsx
import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2, Send, Download, FileText, AlertTriangle, Calculator, MessageSquare } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import SampleSizeCalculator from '@/components/SampleSizeCalculator';

export default function StudyDesignAssistant() {
  const [activeTab, setActiveTab] = useState('chat');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "👋 Hello! I'm the TrialSage Study Design Agent. I can help you design clinical trials based on insights from successful historical CSRs. What questions do you have about your trial design?",
    },
  ]);
  const [threadId, setThreadId] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!input.trim()) return;
    setLoading(true);

    // Add user message to chat
    setMessages(prev => [...prev, { role: 'user', content: input }]);

    try {
      const res = await fetch('/api/intel/protocol-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          indication: input,
          thread_id: threadId,
          include_quotes: true,
          verbose: true,
        }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();

      // Save thread ID for conversation continuity
      if (data.thread_id) {
        setThreadId(data.thread_id);
      }

      // Format the assistant's response with all components
      let formattedContent = '';

      if (data.recommendation) {
        formattedContent += `✅ **Protocol Recommendation**:\n${data.recommendation}\n\n`;
      }

      if (data.ind_module_2_5?.content) {
        formattedContent += `🧾 **IND 2.5**:\n${data.ind_module_2_5.content}\n\n`;
      }

      if (data.risk_summary) {
        formattedContent += `⚠️ **Risks**:\n${data.risk_summary}\n\n`;
      }

      if (data.citations && data.citations.length > 0) {
        formattedContent += `📎 **Citations**: \n${data.citations.join('\n')}\n\n`;
      }

      if (data.evidence && data.evidence.length > 0) {
        formattedContent += `🔍 **Evidence from CSRs**:\n${data.evidence.map(e => `- ${e}`).join('\n')}\n\n`;
      }

      // If we didn't get any structured data, use the raw response
      if (!formattedContent && data.response) {
        formattedContent = data.response;
      }

      // Add assistant response to chat
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content:
            formattedContent ||
            "I apologize, but I couldn't generate a response. Please try a more specific question about trial design.",
          raw: data, // Store the raw data for future reference
        },
      ]);
    } catch (error) {
      console.error('Error calling protocol suggestions API:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content:
            'I encountered an error while processing your request. Please try again with a more specific question about clinical trial design.',
        },
      ]);
    } finally {
      setInput('');
      setLoading(false);
    }
  };

  const handleDownloadReport = () => {
    window.open('/static/latest_report.pdf', '_blank');
  };

  const handleSAPRequest = async () => {
    if (!threadId) return;

    setLoading(true);
    setMessages(prev => [
      ...prev,
      {
        role: 'user',
        content: 'Can you create a Statistical Analysis Plan (SAP) for this protocol?',
      },
    ]);

    try {
      const res = await fetch('/api/intel/continue-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
          section: 'sap',
        }),
      });

      const data = await res.json();

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `📊 **Statistical Analysis Plan**:\n${data.content || data.response}\n\n`,
          raw: data,
        },
      ]);
    } catch (error) {
      console.error('Error requesting SAP:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content:
            'I encountered an error while generating the Statistical Analysis Plan. Please try asking about specific statistical approaches instead.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleIND27Request = async () => {
    if (!threadId) return;

    setLoading(true);
    setMessages(prev => [
      ...prev,
      {
        role: 'user',
        content: 'Can you generate the IND 2.7 (Clinical Summary) for this protocol?',
      },
    ]);

    try {
      const res = await fetch('/api/intel/continue-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
          section: 'ind_2_7',
        }),
      });

      const data = await res.json();

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `📑 **IND Module 2.7 (Clinical Summary)**:\n${data.content || data.response}\n\n`,
          raw: data,
        },
      ]);
    } catch (error) {
      console.error('Error requesting IND 2.7:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content:
            'I encountered an error while generating the IND Module 2.7. Please try asking about specific clinical summary elements instead.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="px-4 pt-4 border-b">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="chat">
              <MessageSquare className="h-4 w-4 mr-2" />
              Study Design Assistant
            </TabsTrigger>
            <TabsTrigger value="calculator">
              <Calculator className="h-4 w-4 mr-2" />
              Sample Size Calculator
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="chat" className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, idx) => (
              <Card
                key={idx}
                className={`whitespace-pre-wrap text-sm ${msg.role === 'user' ? 'bg-muted' : 'bg-card'}`}
              >
                <CardContent className="p-4">
                  <div className="font-semibold mb-1">
                    {msg.role === 'user' ? 'You' : 'TrialSage'}
                  </div>
                  <div className="prose prose-sm max-w-none">{msg.content}</div>

                  {/* Show action buttons after assistant responses with data */}
                  {msg.role === 'assistant' && msg.raw && idx === messages.length - 1 && (
                    <div className="flex gap-2 mt-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSAPRequest}
                        disabled={loading}
                      >
                        <FileText className="h-4 w-4 mr-1" /> Generate SAP
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleIND27Request}
                        disabled={loading}
                      >
                        <AlertTriangle className="h-4 w-4 mr-1" /> Generate IND 2.7
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleDownloadReport}>
                        <Download className="h-4 w-4 mr-1" /> Download PDF
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {loading && (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
          </div>

          <div className="p-4 border-t bg-background">
            <div className="flex gap-2">
              <Textarea
                value={input}
                placeholder="Ask about study design, endpoints, sample size, etc."
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                className="flex-grow min-h-[60px] resize-none"
              />
              <Button onClick={handleAsk} disabled={loading || !input.trim()} className="shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="calculator" className="flex-1 overflow-auto pt-4 px-4">
          <SampleSizeCalculator />
        </TabsContent>
      </Tabs>
    </div>
  );
}
