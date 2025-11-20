// /client/src/components/assistant/LumenAssistantButton.jsx

import React, { useState } from 'react';
import { MessageSquare, X, Maximize2, Minimize2, Send } from 'lucide-react';

export default function LumenAssistantButton({
  variant = 'default',
  size = 'md',
  tooltip = 'Ask Lumen',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "Hello, I'm Lumen, your regulatory AI assistant. How can I help you with your submission today?",
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const handleSend = e => {
    e.preventDefault();

    if (!input.trim()) return;

    // Add user message
    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);

    // Clear input and show typing
    setInput('');
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      let response;

      if (input.toLowerCase().includes('delay') || input.toLowerCase().includes('timeline')) {
        response =
          'Based on your current document readiness, I estimate a delay of 45 days from target. Completing your CMC Stability Study could reduce this by 30 days.';
      } else if (input.toLowerCase().includes('risk') || input.toLowerCase().includes('missing')) {
        response =
          'Your highest risk areas are CMC Stability Study and Clinical Study Reports, both with critical impact on your Fast IND Playbook. I recommend prioritizing these in the next 2 weeks.';
      } else if (
        input.toLowerCase().includes('financial') ||
        input.toLowerCase().includes('cost')
      ) {
        response =
          'The current 45-day projected delay represents approximately $2.25M in financial impact. Completing your top 3 critical documents could reduce this by up to 75%.';
      } else if (
        input.toLowerCase().includes('strategy') ||
        input.toLowerCase().includes('recommend')
      ) {
        response =
          'For your Fast IND Playbook, I recommend a focused 6-week plan: Week 1-2: CMC Stability Data, Week 3-4: Clinical Study Reports, Week 5-6: Toxicology Reports. This optimizes for fastest FDA review timeline.';
      } else {
        response =
          "I'm analyzing your regulatory submission readiness. Based on your Fast IND Playbook, you're currently at 65% readiness with 6 critical sections missing. Would you like specific recommendations for improving your timeline?";
      }

      // Add AI response message
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
      setIsTyping(false);
    }, 1500);
  };

  // Button size variants
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  // Button color variants
  const variantClasses = {
    default: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    blue: 'bg-blue-600 hover:bg-blue-700 text-white',
    purple: 'bg-purple-600 hover:bg-purple-700 text-white',
    green: 'bg-green-600 hover:bg-green-700 text-white',
  };

  // Quick questions for the user to select
  const quickQuestions = [
    'What are my highest priority documents?',
    'How can I improve my timeline?',
    "What's our current financial risk?",
    'Suggest a regulatory strategy',
  ];

  return (
    <div className="relative">
      {/* Main Button */}
      <button
        onClick={toggleChat}
        className={`${sizeClasses[size]} ${variantClasses[variant]} rounded-full flex items-center justify-center shadow-lg relative group`}
        aria-label={tooltip}
      >
        {isOpen ? <X className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}

        {/* Tooltip */}
        <span className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
          {tooltip}
        </span>
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div
          className={`fixed ${
            isExpanded ? 'inset-4 max-w-none' : 'bottom-20 right-0 w-80 sm:w-96 max-h-[500px]'
          } bg-white rounded-lg shadow-xl flex flex-col transition-all duration-200 z-40 overflow-hidden`}
          style={{ maxWidth: isExpanded ? 'calc(100% - 2rem)' : '24rem' }}
        >
          {/* Chat Header */}
          <div className="bg-indigo-600 text-white p-3 flex justify-between items-center">
            <div className="flex items-center">
              <MessageSquare className="h-5 w-5 mr-2" />
              <h3 className="font-medium">Lumen Regulatory AI</h3>
            </div>
            <div className="flex space-x-1">
              <button
                onClick={toggleExpand}
                className="p-1 rounded hover:bg-indigo-500 transition-colors"
              >
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={toggleChat}
                className="p-1 rounded hover:bg-indigo-500 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {messages.map((message, idx) => (
              <div
                key={idx}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`rounded-lg p-3 max-w-[80%] ${
                    message.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <p className="text-sm">{message.content}</p>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg p-3">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Questions */}
          <div className="p-2 border-t border-gray-200 bg-gray-50 flex flex-wrap gap-2">
            {quickQuestions.map((question, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setInput(question);
                  // Auto-submit after a brief delay
                  setTimeout(() => {
                    document
                      .getElementById('chat-form')
                      .dispatchEvent(new Event('submit', { bubbles: true }));
                  }, 100);
                }}
                className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded-full"
              >
                {question}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form id="chat-form" onSubmit={handleSend} className="border-t border-gray-200 p-3 flex">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about your regulatory strategy..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
              disabled={isTyping}
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className={`px-3 py-2 rounded-r-md ${
                !input.trim() || isTyping
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        </div>
      )}

      {/* Modal Backdrop when expanded */}
      {isOpen && isExpanded && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-30" onClick={toggleExpand} />
      )}
    </div>
  );
}
