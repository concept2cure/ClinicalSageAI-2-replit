/**
 * Shared primitives for Landing Page sections.
 */
import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

// ── Animation variants ──────────────────────────────────────────────

export const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.2, 0, 0, 1] } },
};

export const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

// ── Section wrapper (scroll-triggered) ──────────────────────────────

export function Section({
  children,
  className = '',
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.section
      ref={ref}
      id={id}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={stagger}
      className={className}
    >
      {children}
    </motion.section>
  );
}

// ── Icons ────────────────────────────────────────────────────────────

export const CheckIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

export const ArrowRight = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
  </svg>
);

export const Logo = () => (
  <svg
    viewBox="0 0 40 40"
    className="w-10 h-10"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle
      cx="20"
      cy="20"
      r="18"
      stroke="currentColor"
      strokeWidth="2"
      className="text-stone-600"
    />
    <path
      d="M12 14C16 14 18 18 20 20C22 22 24 26 28 26"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="text-stone-600"
    />
    <path
      d="M28 14C24 14 22 18 20 20C18 22 16 26 12 26"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="text-stone-900"
    />
    <circle cx="14" cy="14" r="2" fill="currentColor" className="text-stone-600" />
    <circle cx="26" cy="14" r="2" fill="currentColor" className="text-stone-900" />
    <circle cx="14" cy="26" r="2" fill="currentColor" className="text-stone-900" />
    <circle cx="26" cy="26" r="2" fill="currentColor" className="text-stone-600" />
  </svg>
);
