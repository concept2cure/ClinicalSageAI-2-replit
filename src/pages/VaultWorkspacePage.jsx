// --- TrialSage Vault™ Interactive Landing Page with AI Assistant (Replit Ready) ---

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import axios from 'axios';

export default function VaultLandingPageWithAI() {
  const [showAssistant, setShowAssistant] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        '👋 Hello! Welcome to TrialSage Vault™ — your intelligent clinical document solution. How can I help you today?',
    },
  ]);
  const [input, setInput] = useState('');

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    const res = await axios.post('/api/vault-assistant', { messages: [...messages, userMessage] });
    setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }]);
  };

  return (
    <div className="relative bg-gradient-to-b from-blue-50 to-white min-h-screen p-8">
      <motion.h1
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-5xl font-bold text-center text-blue-800 mb-12"
      >
        Welcome to TrialSage Vault™
      </motion.h1>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        <FeatureCard
          title="AI Auto-Tagging"
          description="Every document uploaded is instantly tagged by trial, molecule, and endpoint classification using GPT-4 Turbo."
        />
        <FeatureCard
          title="Executive Summaries"
          description="Smart summaries created instantly for all uploaded CSRs, CERs, protocols and more."
        />
        <FeatureCard
          title="Full Audit-Readiness"
          description="21 CFR Part 11, GDPR, and HIPAA compliance with built-in tenant isolation and audit trails."
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="mt-20 text-center"
      >
        <Button
          onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
        >
          Learn More
        </Button>
      </motion.div>

      <div className="fixed bottom-6 right-6">
        {!showAssistant ? (
          <Button variant="default" onClick={() => setShowAssistant(true)}>
            💬 Chat with Vault AI
          </Button>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white border shadow-lg rounded-xl w-80 p-4"
          >
            <div className="h-64 overflow-y-auto mb-2">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`text-sm my-2 ${msg.role === 'assistant' ? 'text-blue-700' : 'text-gray-800'}`}
                >
                  {msg.content}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask a question..."
              />
              <Button size="sm" onClick={sendMessage}>
                Send
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function FeatureCard({ title, description }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className="p-6 bg-white rounded-xl shadow hover:shadow-lg text-center"
    >
      <h2 className="text-xl font-bold text-blue-700 mb-2">{title}</h2>
      <p className="text-gray-600 text-sm">{description}</p>
    </motion.div>
  );
}
