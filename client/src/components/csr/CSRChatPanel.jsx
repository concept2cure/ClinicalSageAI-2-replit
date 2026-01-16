import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea';

export default function CSRChatPanel() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'How can I help you analyze CSRs today?' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    // Add user message
    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);

    // Clear input and show loading
    setInput('');
    setLoading(true);

    try {
      // In a real implementation, we would call an API
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Sample response
      const response = {
        role: 'assistant',
        content:
          'Based on the CSRs in your library, the most common primary endpoint for similar trials is HbA1c reduction at week 12. Would you like me to extract all safety data from diabetes studies?',
      };

      setMessages(prev => [...prev, response]);
    } catch (error) {
      console.error('Error sending message:', error);

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error processing your request.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>CSR Chat Assistant</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] flex flex-col">
          <div className="flex-1 overflow-y-auto mb-4 space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg ${
                  message.role === 'user' ? 'bg-blue-100 ml-12' : 'bg-gray-100 mr-12'
                }`}
              >
                {message.content}
              </div>
            ))}
            {loading && (
              <div className="bg-gray-100 p-3 rounded-lg mr-12 flex items-center space-x-2">
                <div
                  className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                  style={{ animationDelay: '0ms' }}
                ></div>
                <div
                  className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                  style={{ animationDelay: '150ms' }}
                ></div>
                <div
                  className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                  style={{ animationDelay: '300ms' }}
                ></div>
              </div>
            )}
          </div>

          <div className="flex space-x-2">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about CSR data, patterns, or generate sections..."
              className="flex-1"
              disabled={loading}
            />
            <Button onClick={handleSend} disabled={!input.trim() || loading}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
