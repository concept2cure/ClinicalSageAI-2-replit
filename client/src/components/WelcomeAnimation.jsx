import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function WelcomeAnimation({ onComplete, skipAnimation = false }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(!skipAnimation);
  const timeoutRef = useRef(null);

  // Skip animation if requested
  useEffect(() => {
    if (skipAnimation) {
      setVisible(false);
      onComplete();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [skipAnimation, onComplete]);

  // Auto-advance the welcome animation steps
  useEffect(() => {
    if (!visible) return;

    const steps = [
      { delay: 2000 }, // Step 0: Initial display
      { delay: 3000 }, // Step 1: Product name
      { delay: 3000 }, // Step 2: Tagline
      { delay: 2000 }, // Step 3: Final message before dismissing
    ];

    if (step < steps.length) {
      timeoutRef.current = setTimeout(() => {
        if (step === steps.length - 1) {
          // Last step - fade out and notify completion
          setVisible(false);
          onComplete();
        } else {
          // Advance to next step
          setStep(step + 1);
        }
      }, steps[step].delay);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [step, visible, onComplete]);

  // Skip animation when user clicks
  const handleSkip = () => {
    setVisible(false);
    onComplete();
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center z-50 bg-gray-900/95"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="w-full max-w-lg p-8 relative text-center">
            {/* Logo animation */}
            <motion.div
              className="mb-8"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <div className="w-16 h-16 mx-auto bg-blue-600 rounded-full flex items-center justify-center">
                <div className="text-white text-xl font-bold">TS</div>
              </div>
            </motion.div>

            {/* Main product name */}
            <AnimatePresence>
              {step >= 0 && (
                <motion.h1
                  className="text-4xl font-bold text-white mb-4 welcome-slide-up"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  TrialSage
                </motion.h1>
              )}
            </AnimatePresence>

            {/* Tagline */}
            <AnimatePresence>
              {step >= 1 && (
                <motion.p
                  className="text-xl text-blue-300 mb-6 welcome-slide-up"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                >
                  The Clinical Intelligence System That Thinks Like a Biotech Founder
                </motion.p>
              )}
            </AnimatePresence>

            {/* Features */}
            <AnimatePresence>
              {step >= 2 && (
                <motion.div
                  className="grid grid-cols-2 gap-3 mb-8 text-white"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                >
                  <div className="bg-blue-800/30 p-3 rounded-lg">
                    <div className="font-semibold">2× Faster INDs</div>
                  </div>
                  <div className="bg-blue-800/30 p-3 rounded-lg">
                    <div className="font-semibold">90% Less Manual Work</div>
                  </div>
                  <div className="bg-blue-800/30 p-3 rounded-lg">
                    <div className="font-semibold">One-click eCTD → ESG</div>
                  </div>
                  <div className="bg-blue-800/30 p-3 rounded-lg">
                    <div className="font-semibold">$2M+ Savings per Trial</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Call to action */}
            <AnimatePresence>
              {step >= 3 && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                >
                  <p className="text-white/80 mb-6">Would you like to take a quick tour?</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Skip button - always visible */}
            <motion.button
              className="text-gray-400 hover:text-white text-sm absolute bottom-4 right-4"
              onClick={handleSkip}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 0.3 }}
            >
              Skip Animation →
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
