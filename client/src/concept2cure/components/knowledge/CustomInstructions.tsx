/**
 * Concept2Cure - Custom Instructions
 *
 * Per-project AI behavior configuration.
 * Claude.ai parity: Custom instructions in project settings.
 *
 * @module concept2cure/components/knowledge/CustomInstructions
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  Save,
  RotateCcw,
  Info,
  Check,
  Loader2,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface CustomInstructionsProps {
  value: string;
  onChange: (instructions: string) => Promise<void>;
  projectType?: string;
  disabled?: boolean;
  className?: string;
  /** If true, the collapsible starts expanded on mount (and re-opens when loading finishes) */
  defaultOpen?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUCTION TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

const INSTRUCTION_TEMPLATES: Record<string, string> = {
  '510K': `You are a regulatory AI assistant for a 510(k) medical device submission.

Key Guidelines:
- Always reference the predicate device for substantial equivalence arguments
- Use IFU language consistent across ALL documents
- Flag any technological differences requiring discussion
- Apply FDA Draft Guidance documents when relevant
- Be strict about compliance (first-time submitter)

Project-Specific:
- Predicate Device: [K-NUMBER]
- Target Submission Date: [DATE]
- Product Code: [CODE]`,

  IND: `You are a regulatory AI assistant for an IND (Investigational New Drug) submission.

Key Guidelines:
- Follow ICH CTD structure for all documents
- Ensure CMC information is complete and consistent
- Reference nonclinical study data appropriately
- Apply FDA IND guidance documents
- Track all safety signals

Project-Specific:
- Phase: [PHASE 1/2/3]
- Therapeutic Area: [AREA]
- Target First-Patient-In: [DATE]`,

  NDA: `You are a regulatory AI assistant for an NDA (New Drug Application).

Key Guidelines:
- Follow eCTD Module 1-5 structure
- Ensure labeling aligns with clinical data
- Reference clinical study reports accurately
- Apply FDA NDA guidance documents
- Track PDUFA milestones

Project-Specific:
- Indication: [INDICATION]
- PDUFA Date: [DATE]`,

  BLA: `You are a regulatory AI assistant for a BLA (Biologics License Application).

Key Guidelines:
- Follow eCTD Module 1-5 structure with biologic-specific requirements
- Ensure CMC addresses biological manufacturing complexity
- Reference clinical immunogenicity data
- Apply FDA BLA guidance documents

Project-Specific:
- Product Type: [VACCINE/BLOOD PRODUCT/THERAPEUTIC PROTEIN]
- Target Filing Date: [DATE]`,
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const CustomInstructions: React.FC<CustomInstructionsProps> = ({
  value,
  onChange,
  projectType,
  disabled = false,
  className,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [localValue, setLocalValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand when defaultOpen flips to true (e.g. knowledge finishes loading)
  useEffect(() => {
    if (defaultOpen) setIsOpen(true);
  }, [defaultOpen]);

  // Sync local value with prop
  useEffect(() => {
    setLocalValue(value);
    setHasChanges(false);
  }, [value]);

  // Track changes
  useEffect(() => {
    setHasChanges(localValue !== value);
  }, [localValue, value]);

  const handleSave = useCallback(async () => {
    if (!hasChanges || disabled) return;

    setIsSaving(true);
    try {
      await onChange(localValue);
      setHasChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to save instructions:', error);
    } finally {
      setIsSaving(false);
    }
  }, [hasChanges, disabled, onChange, localValue]);

  const handleReset = useCallback(() => {
    setLocalValue(value);
    setHasChanges(false);
  }, [value]);

  const handleUseTemplate = useCallback(() => {
    if (projectType && INSTRUCTION_TEMPLATES[projectType]) {
      setLocalValue(INSTRUCTION_TEMPLATES[projectType]);
      setHasChanges(true);
    }
  }, [projectType]);

  const characterCount = localValue.length;
  const maxCharacters = 4000;
  const isNearLimit = characterCount > maxCharacters * 0.8;
  const isOverLimit = characterCount > maxCharacters;

  return (
    <div className={cn('', className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              'w-full flex items-center justify-between p-3 rounded-lg transition-colors duration-150',
              'hover:bg-stone-50 text-left',
              isOpen && 'bg-stone-50'
            )}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-stone-600" />
              <span className="text-sm font-medium text-stone-900">Custom Instructions</span>
              {value && !isOpen && (
                <span className="text-xs text-stone-500 truncate max-w-[150px]">(configured)</span>
              )}
            </div>
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-stone-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-stone-500" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-3 pt-0 space-y-3">
            {/* Info */}
            <div className="flex items-start gap-2 text-xs text-stone-500 bg-stone-50 p-2 rounded-lg">
              <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>
                Custom instructions tell AnA how to behave for this specific project.
                These apply to all conversations within this project.
              </span>
            </div>

            {/* Template Button */}
            {projectType && INSTRUCTION_TEMPLATES[projectType] && !localValue && (
              <Button variant="outline" size="sm" onClick={handleUseTemplate} className="w-full">
                <Sparkles className="h-3.5 w-3.5 mr-2" />
                Use {projectType} Template
              </Button>
            )}

            {/* Textarea */}
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={localValue}
                onChange={e => setLocalValue(e.target.value)}
                placeholder={`Tell AnA how to assist with this project...

Example:
- "Always reference predicate K123456 for SE arguments"
- "Use formal FDA language"
- "Flag any IFU inconsistencies immediately"
- "Target submission date is March 15, 2026"`}
                className={cn(
                  'min-h-[150px] text-sm resize-none',
                  isOverLimit && 'border-stone-300 focus:ring-stone-900'
                )}
                disabled={disabled}
              />

              {/* Character Count */}
              <div
                className={cn(
                  'absolute bottom-2 right-2 text-xs',
                  isOverLimit && 'text-stone-700',
                  isNearLimit && !isOverLimit && 'text-stone-600',
                  !isNearLimit && 'text-stone-400'
                )}
              >
                {characterCount.toLocaleString()} / {maxCharacters.toLocaleString()}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {hasChanges && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={handleReset} disabled={disabled}>
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Reset changes</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>

              <Button
                size="sm"
                onClick={handleSave}
                disabled={disabled || !hasChanges || isOverLimit || isSaving}
                className={cn(saveSuccess && 'bg-stone-700 hover:bg-stone-700')}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : saveSuccess ? (
                  <>
                    <Check className="h-3.5 w-3.5 mr-2" />
                    Saved
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5 mr-2" />
                    Save Instructions
                  </>
                )}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default CustomInstructions;
