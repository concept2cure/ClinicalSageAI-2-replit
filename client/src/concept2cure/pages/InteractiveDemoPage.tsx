/**
 * @fileoverview Interactive Platform Demo — AnA-Narrated Experience
 * @module concept2cure/pages/InteractiveDemoPage
 *
 * Public page at /concept2cure/demo — no auth required.
 * Split-panel layout: DemoChat (35%) + DemoPreview (65%).
 * AnA 1.0 narrates with typewriter effect; client makes choices.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { DemoChat, type ChatMessage } from '../components/demo/DemoChat';
import { DemoPreview } from '../components/demo/DemoPreview';
import {
  WELCOME_STEP,
  STEP_MAP,
  type DemoChoice,
  type DemoStep,
} from '../components/demo/demo-content';

// ─── Typewriter hook ────────────────────────────────────────────────────────

function useTypewriter(text: string, speed = 12) {
  const [displayed, setDisplayed] = useState('');
  const [isDone, setIsDone] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    setDisplayed('');
    setIsDone(false);
    indexRef.current = 0;

    if (!text) {
      setIsDone(true);
      return;
    }

    const interval = setInterval(() => {
      indexRef.current += 1;
      const next = text.slice(0, indexRef.current);
      setDisplayed(next);
      if (indexRef.current >= text.length) {
        clearInterval(interval);
        setIsDone(true);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return { displayed, isDone };
}

// ─── Page Component ─────────────────────────────────────────────────────────

const InteractiveDemoPage: React.FC = () => {
  const [, navigate] = useLocation();

  // Current step being shown
  const [currentStep, setCurrentStep] = useState<DemoStep>(WELCOME_STEP);

  // All chat messages in the conversation
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-0',
      role: 'ana',
      content: WELCOME_STEP.narration,
      choices: WELCOME_STEP.choices,
    },
  ]);

  // Typewriter for the latest AnA message
  const latestAnaContent = messages.length > 0 && messages[messages.length - 1].role === 'ana'
    ? messages[messages.length - 1].content
    : '';
  const { displayed: typedText, isDone: typingDone } = useTypewriter(latestAnaContent);

  // Message counter for unique IDs
  const msgCounterRef = useRef(1);

  // Handle "Continue" for steps with nextStep (auto-advance after typing finishes)
  useEffect(() => {
    if (!typingDone) return;
    if (currentStep.nextStep && !currentStep.choices?.length) {
      const timer = setTimeout(() => {
        const nextStep = STEP_MAP[currentStep.nextStep!];
        if (nextStep) {
          advanceToStep(nextStep);
        }
      }, 800); // brief pause before auto-advancing
      return () => clearTimeout(timer);
    }
  }, [typingDone, currentStep]);

  const advanceToStep = useCallback((step: DemoStep) => {
    setCurrentStep(step);
    const newId = `msg-${msgCounterRef.current++}`;
    setMessages((prev) => [
      ...prev,
      {
        id: newId,
        role: 'ana',
        content: step.narration,
        choices: step.choices,
      },
    ]);
  }, []);

  const handleChoiceSelect = useCallback((choice: DemoChoice) => {
    // Handle special navigation targets
    if (choice.nextStepId === '__signup__') {
      navigate('/concept2cure/signup');
      return;
    }
    if (choice.nextStepId === '__home__') {
      navigate('/concept2cure');
      return;
    }

    // Add user message
    const userMsgId = `msg-${msgCounterRef.current++}`;
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: choice.label },
    ]);

    // Find and advance to next step
    const nextStep = STEP_MAP[choice.nextStepId];
    if (nextStep) {
      // Small delay so the user message appears first
      setTimeout(() => advanceToStep(nextStep), 300);
    }
  }, [navigate, advanceToStep]);

  return (
    <div className="min-h-screen bg-[#FAFAF9] flex flex-col">
      {/* Top bar */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between px-4 py-3 border-b border-stone-200/60 bg-white/80 backdrop-blur-sm z-10"
      >
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 transition-colors duration-150"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </button>

        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-semibold text-stone-900">Interactive Demo</span>
        </div>

        <button
          onClick={() => navigate('/concept2cure/signup')}
          className="px-4 py-1.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors shadow-sm"
        >
          Sign Up Free
        </button>
      </motion.header>

      {/* Main split layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Chat panel — 35% on desktop, full on mobile */}
        <div className="w-full md:w-[35%] md:min-w-[320px] md:max-w-[440px] h-[50vh] md:h-auto">
          <DemoChat
            messages={messages}
            isTyping={!typingDone}
            typedText={typedText}
            onChoiceSelect={handleChoiceSelect}
            showChoices={typingDone}
          />
        </div>

        {/* Preview panel — 65% on desktop, full on mobile */}
        <div className="flex-1 h-[50vh] md:h-auto">
          <DemoPreview previewType={currentStep.previewType} />
        </div>
      </div>
    </div>
  );
};

export default InteractiveDemoPage;
