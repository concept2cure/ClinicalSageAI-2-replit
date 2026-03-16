import React, { useState, useRef, useEffect } from 'react';
import lumenService from '@/services/lumenService';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, User, Send, RefreshCw } from 'lucide-react';

export default function LumenChatPane({ contextId }) {
  const [history, setHistory] = useState([
    // Start with an initial greeting from Lumen
    {
      id: 0,
      from: 'lumen',
      text: "Hello! I'm AnA, your Audit & Narrative Assistant. How can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef();

  // Scroll to bottom when messages change
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    const timestamp = new Date();

    // Add user message to history
    setHistory(h => [
      ...h,
      {
        id: h.length,
        from: 'user',
        text: userMsg,
        timestamp,
      },
    ]);

    // Clear input and set loading state
    setInput('');
    setLoading(true);

    try {
      // Get response from Lumen service
      const reply = await lumenService.chat({
        sessionId: contextId,
        context: history.map(m => `${m.from}: ${m.text}`).join('\n'),
        message: userMsg,
      });

      // Add Lumen response to history
      setHistory(h => [
        ...h,
        {
          id: h.length,
          from: 'lumen',
          text: reply,
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      console.error('Error getting response from Lumen:', error);

      // Add error message to history
      setHistory(h => [
        ...h,
        {
          id: h.length,
          from: 'lumen',
          text: "I'm sorry, I encountered an error. Please try again.",
          timestamp: new Date(),
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = timestamp => {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center">
          <Bot className="h-5 w-5 mr-2 text-primary" />
          Lumen AI Assistant
        </CardTitle>
        <CardDescription>Ask me about regulatory guidance or document requirements</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-4 h-[180px] overflow-y-auto py-3 space-y-4">
          {history.map(message => (
            <div
              key={message.id}
              className={`flex items-start gap-2 ${message.from === 'user' ? 'justify-end' : ''}`}
            >
              {message.from !== 'user' && (
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}

              <div
                className={`rounded-lg px-3 py-2 max-w-[75%] text-sm ${
                  message.from === 'user'
                    ? 'bg-primary text-primary-foreground ml-auto'
                    : message.isError
                      ? 'bg-destructive/10 text-destructive border border-destructive/20'
                      : 'bg-muted'
                }`}
              >
                <div className="whitespace-pre-line">{message.text}</div>
                <div
                  className={`text-xs mt-1 ${message.from === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
                >
                  {formatTime(message.timestamp)}
                </div>
              </div>

              {message.from === 'user' && (
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-start gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="rounded-lg px-3 py-2 bg-muted flex items-center space-x-2">
                <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Thinking...</span>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </CardContent>
      <CardFooter className="p-3 pt-2 border-t">
        <div className="flex w-full space-x-2">
          <Input
            placeholder="Ask a question..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            className="flex-1"
          />
          <Button onClick={sendMessage} disabled={!input.trim() || loading} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
