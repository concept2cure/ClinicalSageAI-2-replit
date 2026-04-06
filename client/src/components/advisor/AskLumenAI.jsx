// /client/src/components/advisor/AskLumenAI.jsx — AnA RI Co-pilot (legacy filename retained)

import React, { useState, useEffect, useRef } from 'react';
import { Send, UserRound, Bot } from 'lucide-react';

export default function AskLumenAI() {
 const [messages, setMessages] = useState([
 {
 role: 'assistant',
 content:
 "Hello, I'm AnA, your RI Co-pilot. How can I help you with your regulatory strategy today?",
 },
 ]);
 const [input, setInput] = useState('');
 const [isTyping, setIsTyping] = useState(false);
 const [activeMode, setActiveMode] = useState('strategic'); // strategic, timeline, financial, or compliance
 const messagesEndRef = useRef(null);

 // Scroll to bottom whenever messages change
 useEffect(() => {
 messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
 }, [messages]);

 // Mode labels and descriptions
 const modes = {
 strategic: {
 label: 'Strategic',
 description: 'Focuses on overall submission strategy and approach',
 },
 timeline: {
 label: 'Timeline',
 description: 'Prioritizes speed of filing and critical path items',
 },
 financial: {
 label: 'Financial',
 description: 'Optimizes for cost savings and delay reduction',
 },
 compliance: {
 label: 'Compliance',
 description: 'Focused on regulatory requirements and rejection risk',
 },
 };

 // Handle chat input submission
 const handleSubmit = e => {
 e.preventDefault();
 if (!input.trim()) return;

 // Add user message
 const userMessage = { role: 'user', content: input };
 setMessages(prev => [...prev, userMessage]);

 // Clear input and show typing indicator
 setInput('');
 setIsTyping(true);

 // Simulate AI response generation
 setTimeout(() => {
 // Generate AI response based on user query
 let aiResponse;

 if (input.toLowerCase().includes('delay') || input.toLowerCase().includes('timeline')) {
 aiResponse =
 'Based on current document readiness of 65%, I estimate a submission delay of approximately 45 days. If you complete the CMC Stability Study by June 15, you could reduce this delay by up to 30 days.';
 } else if (input.toLowerCase().includes('risk') || input.toLowerCase().includes('missing')) {
 aiResponse =
 'The highest risk areas in your Fast IND Playbook are the missing CMC Stability Study and Clinical Study Reports (CSR), both with critical impact. I recommend prioritizing these in the next 2-3 weeks to avoid FDA RTF responses.';
 } else if (
 input.toLowerCase().includes('financial') ||
 input.toLowerCase().includes('cost')
 ) {
 aiResponse =
 'The current estimated delay of 45 days represents approximately $2.25M in financial impact to your organization. Completing the top 3 critical documents could reduce this impact by up to 75%.';
 } else if (
 input.toLowerCase().includes('recommend') ||
 input.toLowerCase().includes('strategy')
 ) {
 aiResponse =
 'For your Fast IND Playbook strategy, I recommend the following timeline:\n\n1. Weeks 1-2: Complete CMC Stability Data\n2. Weeks 3-4: Finalize Clinical Study Reports\n3. Weeks 5-6: Complete Toxicology Reports\n\nThis sequence optimizes for the fastest possible FDA review timeline while addressing the highest risk elements first.';
 } else {
 aiResponse =
 "Based on my analysis of your regulatory submission readiness for the Fast IND Playbook, you're currently at 65% readiness with 6 critical sections missing. The most impactful documents to complete are the CMC Stability Study and Clinical Study Reports. Would you like specific recommendations for improving your timeline or reducing financial impact?";
 }

 // Add AI response
 setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
 setIsTyping(false);
 }, 1500);
 };

 // Quick questions that users can click to ask
 const quickQuestions = [
 'What are my highest priority documents?',
 'How can I improve our timeline?',
 "What's the current financial impact?",
 'Recommend a regulatory strategy',
 ];

 return (
 <div>
 <h2 className="text-xl font-bold text-gray-800 mb-4">Regulatory Strategy Assistant</h2>

 <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
 {/* Chat Mode Selector */}
 <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
 <div className="flex flex-wrap gap-2">
 {Object.entries(modes).map(([key, { label, description }]) => (
 <button
 key={key}
 onClick={() => setActiveMode(key)}
 title={description}
 className={`px-3 py-1 text-xs rounded-full ${
 activeMode === key
 ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
 : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
 }`}
 >
 {label} Mode
 </button>
 ))}
 </div>
 </div>

 {/* Chat Messages */}
 <div className="h-96 overflow-y-auto p-4 bg-gray-50 space-y-4">
 {messages.map((message, index) => (
 <div
 key={index}
 className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
 >
 <div
 className={`flex items-start max-w-[80%] rounded-lg p-3 ${
 message.role === 'user'
 ? 'bg-indigo-600 text-white'
 : 'bg-white border border-gray-200 text-gray-800'
 }`}
 >
 <div
 className={`rounded-full w-6 h-6 flex items-center justify-center mr-2 ${
 message.role === 'user' ? 'bg-indigo-500' : 'bg-indigo-100'
 }`}
 >
 {message.role === 'user' ? (
 <UserRound size={14} className="text-white" />
 ) : (
 <Bot size={14} className="text-indigo-600" />
 )}
 </div>
 <div>
 <p className="text-xs font-medium mb-1">
 {message.role === 'user' ? 'You' : `AnA (${modes[activeMode].label})`}
 </p>
 <p className="text-sm whitespace-pre-line">{message.content}</p>
 </div>
 </div>
 </div>
 ))}

 {isTyping && (
 <div className="flex justify-start">
 <div className="bg-white border border-gray-200 rounded-lg p-3">
 <div className="flex space-x-1 items-center">
 <Bot size={14} className="text-indigo-600 mr-2" />
 <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
 <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-75"></div>
 <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-150"></div>
 </div>
 </div>
 </div>
 )}

 <div ref={messagesEndRef} />
 </div>

 {/* Quick Questions */}
 <div className="border-t border-gray-200 p-3 bg-gray-50 flex flex-wrap gap-2">
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
 className="px-3 py-1 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full"
 >
 {question}
 </button>
 ))}
 </div>

 {/* Input Form */}
 <form id="chat-form" onSubmit={handleSubmit} className="border-t border-gray-200 p-3 flex">
 <input
 type="text"
 value={input}
 onChange={e => setInput(e.target.value)}
 placeholder="Ask about your regulatory strategy..."
 className="flex-1 px-4 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
 disabled={isTyping}
 />
 <button
 type="submit"
 disabled={!input.trim() || isTyping}
 className={`px-4 py-2 rounded-r-md ${
 !input.trim() || isTyping
 ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
 : 'bg-indigo-600 text-white hover:bg-indigo-700'
 }`}
 >
 <Send size={18} />
 </button>
 </form>
 </div>

 <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
 <div className="bg-indigo-50 p-3 rounded-lg">
 <h3 className="text-xs font-medium text-indigo-700 mb-1">Strategic Guidance</h3>
 <p className="text-xs text-indigo-600">
 Get personalized regulatory guidance based on your specific submission requirements
 </p>
 </div>
 <div className="bg-indigo-50 p-3 rounded-lg">
 <h3 className="text-xs font-medium text-indigo-700 mb-1">Timeline Optimization</h3>
 <p className="text-xs text-indigo-600">
 Accelerate submissions with custom document completion recommendations
 </p>
 </div>
 <div className="bg-indigo-50 p-3 rounded-lg">
 <h3 className="text-xs font-medium text-indigo-700 mb-1">Financial Impact Analysis</h3>
 <p className="text-xs text-indigo-600">
 Understand the financial implications of regulatory strategies and delays
 </p>
 </div>
 </div>
 </div>
 );
}
