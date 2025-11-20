import React, { useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Send, Sparkles, User, MessageSquare } from 'lucide-react';

export default function Chat() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'system',
      content: 'Welcome to Ask Lumen - Your AI regulatory assistant. How can I help you today?',
      timestamp: new Date().toISOString(),
    },
  ]);

  const handleSubmit = e => {
    e.preventDefault();
    if (!message.trim()) return;

    // Add user message
    const userMessage = {
      id: messages.length + 1,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };

    setMessages([...messages, userMessage]);
    setMessage('');

    // Simulate AI response
    setTimeout(() => {
      const assistantMessage = {
        id: messages.length + 2,
        role: 'assistant',
        content:
          "Thank you for your question. I'm your regulatory assistant focused on drug development, clinical trials, and regulatory submissions. How can I assist you today?",
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    }, 1000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-gray-200 bg-white">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center">
            <Link to="/">
              <a className="flex items-center text-[#0071e3] font-medium">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </a>
            </Link>
            <h1 className="text-xl font-semibold text-[#1d1d1f] ml-6">
              Ask Lumen AI Regulatory Assistant
            </h1>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="hidden md:flex flex-col w-80 border-r border-[#e5e5e7] bg-[#f5f5f7]">
          <div className="p-4">
            <button className="flex items-center justify-center gap-2 w-full bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-lg px-4 py-2.5 font-medium">
              <Sparkles className="w-4 h-4" />
              New Conversation
            </button>
          </div>

          <div className="overflow-y-auto flex-1 py-2">
            <div className="px-2 space-y-1">
              <button className="flex items-center gap-3 w-full p-2 rounded-lg bg-white shadow-sm">
                <MessageSquare className="w-4 h-4 text-[#0071e3]" />
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium text-[#1d1d1f] truncate">Current Chat</div>
                  <div className="text-xs text-[#86868b] truncate">Today</div>
                </div>
              </button>

              <button className="flex items-center gap-3 w-full p-2 rounded-lg text-[#424245] hover:bg-white/70">
                <MessageSquare className="w-4 h-4" />
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium truncate">CMC Requirements for EMA</div>
                  <div className="text-xs text-[#86868b] truncate">Yesterday</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col max-h-screen">
          <div className="flex-1 overflow-y-auto px-4 py-6 md:px-10">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`mb-6 ${msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}`}
              >
                <div
                  className={`max-w-3xl ${msg.role === 'user' ? 'bg-[#f0f7ff] rounded-t-2xl rounded-bl-2xl' : 'bg-white border border-[#e5e5e7] rounded-t-2xl rounded-br-2xl'} p-4 shadow-sm`}
                >
                  <div className="flex items-center mb-2">
                    <div
                      className={`p-1.5 rounded-full ${msg.role === 'user' ? 'bg-[#0071e3]' : 'bg-[#f5f5f7]'} mr-2`}
                    >
                      {msg.role === 'user' ? (
                        <User className="w-4 h-4 text-white" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-[#0071e3]" />
                      )}
                    </div>
                    <div className="text-sm font-medium">
                      {msg.role === 'user' ? 'You' : 'Lumen AI'}
                    </div>
                  </div>
                  <div className="text-[#1d1d1f]">{msg.content}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-[#e5e5e7] p-4 bg-white">
            <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
              <div className="relative">
                <input
                  type="text"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Ask about regulatory requirements or guidance..."
                  className="w-full px-4 py-3 pr-12 border border-[#e5e5e7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                />
                <button
                  type="submit"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#0071e3] hover:text-[#0077ed]"
                  disabled={!message.trim()}
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
              <div className="text-xs text-center text-[#86868b] mt-2">
                Powered by OpenAI GPT-4o technology
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
