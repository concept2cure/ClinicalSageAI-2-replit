/**
 * ActionButton — Universal deliverable-producing button
 *
 * Claude design system: stone-900 primary, blue-600 accent for generation,
 * minimal border, fade animation, no gradients.
 *
 * Every ActionButton in the platform produces a tangible deliverable:
 * document, report, export, or DB record.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { Download, FileText, Loader2, Play, Send, Save } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionIntent =
  | 'generate'   // Create a document (DOCX, PDF)
  | 'export'     // Export data (CSV, XLSX, ZIP)
  | 'run'        // Execute a process (simulation, analysis)
  | 'save'       // Save configuration or data to DB
  | 'submit';    // Submit to external system

interface ActionButtonProps {
  /** Button label */
  label: string;
  /** What this action produces — shown as tooltip */
  produces: string;
  /** Visual intent — determines icon and accent */
  intent: ActionIntent;
  /** Loading state */
  isLoading?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Click handler */
  onClick: () => void;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Full width */
  fullWidth?: boolean;
  /** Additional class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Intent config
// ---------------------------------------------------------------------------

const INTENT_CONFIG: Record<ActionIntent, {
  icon: React.ElementType;
  loadingText: string;
  bgClass: string;
  textClass: string;
  hoverClass: string;
}> = {
  generate: {
    icon: FileText,
    loadingText: 'Generating...',
    bgClass: 'bg-stone-900',
    textClass: 'text-white',
    hoverClass: 'hover:bg-stone-800',
  },
  export: {
    icon: Download,
    loadingText: 'Exporting...',
    bgClass: 'bg-white border border-stone-200',
    textClass: 'text-stone-900',
    hoverClass: 'hover:bg-stone-50',
  },
  run: {
    icon: Play,
    loadingText: 'Running...',
    bgClass: 'bg-blue-600',
    textClass: 'text-white',
    hoverClass: 'hover:bg-blue-700',
  },
  save: {
    icon: Save,
    loadingText: 'Saving...',
    bgClass: 'bg-white border border-stone-200',
    textClass: 'text-stone-900',
    hoverClass: 'hover:bg-stone-50',
  },
  submit: {
    icon: Send,
    loadingText: 'Submitting...',
    bgClass: 'bg-stone-900',
    textClass: 'text-white',
    hoverClass: 'hover:bg-stone-800',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ActionButton({
  label,
  produces,
  intent,
  isLoading = false,
  disabled = false,
  onClick,
  size = 'sm',
  fullWidth = false,
  className,
}: ActionButtonProps) {
  const config = INTENT_CONFIG[intent];
  const Icon = config.icon;

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={disabled || isLoading}
      title={`Produces: ${produces}`}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors duration-150',
        config.bgClass,
        config.textClass,
        config.hoverClass,
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        fullWidth && 'w-full',
        (disabled || isLoading) && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {isLoading ? (
        <>
          <Loader2 className={cn('animate-spin', size === 'sm' ? 'w-3 h-3' : 'w-4 h-4')} />
          <span>{config.loadingText}</span>
        </>
      ) : (
        <>
          <Icon className={cn(size === 'sm' ? 'w-3 h-3' : 'w-4 h-4')} />
          <span>{label}</span>
        </>
      )}
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Convenience variants
// ---------------------------------------------------------------------------

/** Generate a regulatory document (DOCX/PDF) */
export function GenerateButton(props: Omit<ActionButtonProps, 'intent'>) {
  return <ActionButton {...props} intent="generate" />;
}

/** Export data (CSV, XLSX, ZIP) */
export function ExportButton(props: Omit<ActionButtonProps, 'intent'>) {
  return <ActionButton {...props} intent="export" />;
}

/** Run a process (simulation, analysis, validation) */
export function RunButton(props: Omit<ActionButtonProps, 'intent'>) {
  return <ActionButton {...props} intent="run" />;
}

/** Save to database (configuration, settings) */
export function SaveButton(props: Omit<ActionButtonProps, 'intent'>) {
  return <ActionButton {...props} intent="save" />;
}

/** Submit to external system (eCTD, eSTAR, gateway) */
export function SubmitButton(props: Omit<ActionButtonProps, 'intent'>) {
  return <ActionButton {...props} intent="submit" />;
}

export default ActionButton;
