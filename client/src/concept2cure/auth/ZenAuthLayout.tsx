/**
 * @fileoverview Zen Auth Layout
 * @module concept2cure/auth/ZenAuthLayout
 * @version 1.0.0
 *
 * @description
 * Layout wrapper for authentication pages with animated background,
 * branding, and compliance notices.
 */

import React from 'react';
import { motion } from 'framer-motion';

interface ZenAuthLayoutProps {
  children: React.ReactNode;
}

export const ZenAuthLayout: React.FC<ZenAuthLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-[#FAFAF9] relative overflow-hidden">
      {/* Subtle animated background patterns */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Gradient orbs - very subtle */}
        <motion.div
          className="absolute top-0 right-0 w-96 h-96 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(37, 99, 235, 0.03) 0%, transparent 70%)',
          }}
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.5, 0.7, 0.5],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.03) 0%, transparent 70%)',
          }}
          animate={{
            scale: [1.1, 1, 1.1],
            opacity: [0.4, 0.6, 0.4],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        
        {/* Grid pattern overlay - very subtle */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              linear-gradient(to right, #71717a 1px, transparent 1px),
              linear-gradient(to bottom, #71717a 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Main content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

export default ZenAuthLayout;
