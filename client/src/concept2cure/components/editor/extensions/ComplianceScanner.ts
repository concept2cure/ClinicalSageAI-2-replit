/**
 * ComplianceScanner — TipTap extension for real-time regulatory compliance checking.
 *
 * Scans document content as the user types (debounced 2s) and highlights issues:
 * - Regulatory language violations ("shall" vs "should" vs "must")
 * - Inconsistent terminology (drug name variations)
 * - Missing required CTD section elements
 * - Placeholder/TODO markers left in content
 * - Passive voice in critical regulatory statements
 * - Unsupported claims (assertions without evidence markers)
 *
 * Issues are underlined with wavy colored lines:
 * - Red = error (must fix before submission)
 * - Amber = warning (should review)
 * - Blue = info (suggestion)
 *
 * Click an underline → popover with explanation + one-click fix suggestion.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ComplianceIssue {
  id: string;
  from: number;
  to: number;
  text: string;
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  suggestion?: string;
  category: ComplianceCategory;
}

type ComplianceCategory =
  | 'language'
  | 'terminology'
  | 'structure'
  | 'placeholder'
  | 'passive-voice'
  | 'unsupported-claim'
  | 'formatting';

export interface ComplianceScannerOptions {
  /** Whether scanner is enabled (default: true) */
  enabled: boolean;
  /** Debounce delay in ms (default: 2000) */
  delay: number;
  /** Document type context for rule tuning */
  context: {
    documentType?: string;
    submissionType?: string;
    ctdSection?: string;
  };
  /** Callback when issues are found */
  onIssuesFound?: (issues: ComplianceIssue[]) => void;
}

export interface ComplianceScannerStorage {
  enabled: boolean;
  issues: ComplianceIssue[];
  isScanning: boolean;
  lastScanTime: number;
}

// ── Rule Definitions ───────────────────────────────────────────────────────────

interface ComplianceRule {
  id: string;
  category: ComplianceCategory;
  severity: 'error' | 'warning' | 'info';
  pattern: RegExp;
  message: string;
  suggestion?: string;
  /** Optional: only apply in certain document types */
  applicableTo?: string[];
}

const COMPLIANCE_RULES: ComplianceRule[] = [
  // ── Language / Modal Verb Rules ────────────────────────────────────────────

  {
    id: 'modal-shall',
    category: 'language',
    severity: 'warning',
    pattern: /\bshall\b/gi,
    message:
      'FDA prefers "must" for mandatory requirements. "Shall" is ambiguous in US regulatory context.',
    suggestion: 'must',
  },
  {
    id: 'modal-could',
    category: 'language',
    severity: 'info',
    pattern: /\bcould\b(?!\s+not)/gi,
    message:
      'Vague language — "could" implies possibility, not obligation. Consider "may" (permissive) or "can" (capability).',
    suggestion: 'may',
  },
  {
    id: 'informal-lots-of',
    category: 'language',
    severity: 'warning',
    pattern: /\blots?\s+of\b/gi,
    message: 'Informal language. Use precise quantification in regulatory documents.',
    suggestion: 'numerous',
  },
  {
    id: 'informal-stuff',
    category: 'language',
    severity: 'warning',
    pattern: /\bstuff\b/gi,
    message: 'Informal language not appropriate for regulatory submissions.',
    suggestion: 'materials',
  },
  {
    id: 'informal-things',
    category: 'language',
    severity: 'info',
    pattern: /\bthings\b/gi,
    message: 'Vague term — specify what is being referenced.',
    suggestion: 'factors',
  },
  {
    id: 'informal-very',
    category: 'language',
    severity: 'info',
    pattern: /\bvery\s+(?:significant|important|large|small|high|low)\b/gi,
    message:
      'Avoid intensifiers in regulatory writing. Use quantified evidence instead.',
  },
  {
    id: 'informal-basically',
    category: 'language',
    severity: 'warning',
    pattern: /\bbasically\b/gi,
    message: 'Filler word — remove or replace with precise language.',
  },
  {
    id: 'informal-obviously',
    category: 'language',
    severity: 'warning',
    pattern: /\bobviously\b/gi,
    message:
      'Avoid presumptive language in regulatory documents. State evidence directly.',
  },

  // ── Placeholder Markers ────────────────────────────────────────────────────

  {
    id: 'placeholder-todo',
    category: 'placeholder',
    severity: 'error',
    pattern: /\bTODO\b/g,
    message: 'TODO marker — must be resolved before submission.',
  },
  {
    id: 'placeholder-tbd',
    category: 'placeholder',
    severity: 'error',
    pattern: /\bTBD\b/g,
    message: 'TBD marker — content must be determined before submission.',
  },
  {
    id: 'placeholder-fixme',
    category: 'placeholder',
    severity: 'error',
    pattern: /\bFIXME\b/g,
    message: 'FIXME marker — issue must be resolved.',
  },
  {
    id: 'placeholder-insert',
    category: 'placeholder',
    severity: 'error',
    pattern: /\[INSERT\s+[^\]]+\]/gi,
    message: 'Placeholder bracket — fill in required content.',
  },
  {
    id: 'placeholder-xxx',
    category: 'placeholder',
    severity: 'error',
    pattern: /\bXXX\b/g,
    message: 'XXX placeholder — content must be filled in.',
  },
  {
    id: 'placeholder-brackets',
    category: 'placeholder',
    severity: 'warning',
    pattern: /\[(?:COMPANY|PRODUCT|DRUG|SPONSOR|APPLICANT|DATE|VERSION)\s*(?:NAME)?\]/gi,
    message: 'Template placeholder detected — replace with actual value.',
  },

  // ── Passive Voice in Critical Statements ──────────────────────────────────

  {
    id: 'passive-was-observed',
    category: 'passive-voice',
    severity: 'info',
    pattern: /\bwas\s+(?:observed|noted|found|seen|detected|identified|reported|demonstrated)\b/gi,
    message:
      'Passive voice — consider active voice for clarity: "The study demonstrated..." instead of "It was demonstrated..."',
  },
  {
    id: 'passive-were-reported',
    category: 'passive-voice',
    severity: 'info',
    pattern: /\bwere\s+(?:observed|noted|found|seen|detected|identified|reported|demonstrated)\b/gi,
    message: 'Passive construction — active voice is preferred in regulatory summaries.',
  },
  {
    id: 'passive-it-was',
    category: 'passive-voice',
    severity: 'info',
    pattern: /\bit\s+(?:was|is)\s+(?:determined|concluded|established|shown)\b/gi,
    message: 'Impersonal passive — identify the actor (e.g., "The data demonstrated...").',
  },

  // ── Unsupported Claims ────────────────────────────────────────────────────

  {
    id: 'claim-proven',
    category: 'unsupported-claim',
    severity: 'warning',
    pattern: /\bproven\s+(?:to\s+be\s+)?(?:safe|effective|superior|better)\b/gi,
    message:
      'Strong claim — "proven" implies absolute certainty. Use "demonstrated" or "shown" with supporting evidence citation.',
    suggestion: 'demonstrated',
  },
  {
    id: 'claim-no-side-effects',
    category: 'unsupported-claim',
    severity: 'error',
    pattern: /\bno\s+(?:side\s+effects|adverse\s+(?:events|reactions))\b/gi,
    message:
      'Absolute safety claim — FDA does not accept "no side effects." Use "no clinically significant adverse events were observed" with reference.',
  },
  {
    id: 'claim-cure',
    category: 'unsupported-claim',
    severity: 'error',
    pattern: /\b(?:cures?|eliminates?\s+(?:the\s+)?disease)\b/gi,
    message:
      'Curative claim requires extraordinary evidence. Use "treats" or "is indicated for" unless cure data is definitive.',
    suggestion: 'treats',
  },
  {
    id: 'claim-completely-safe',
    category: 'unsupported-claim',
    severity: 'error',
    pattern: /\b(?:completely|totally|entirely|100%)\s+safe\b/gi,
    message: 'Absolute safety claim is not acceptable in regulatory documents.',
  },
  {
    id: 'claim-best',
    category: 'unsupported-claim',
    severity: 'warning',
    pattern: /\b(?:best|superior|better\s+than\s+all)\b/gi,
    message:
      'Comparative/superlative claim requires head-to-head trial data. Specify the comparator and evidence source.',
  },

  // ── Terminology Consistency ───────────────────────────────────────────────

  {
    id: 'term-patient-subject',
    category: 'terminology',
    severity: 'info',
    pattern: /\bpatients?\b/gi,
    message:
      'Clinical trial documents typically use "subjects" or "participants" rather than "patients" to denote enrollment context.',
  },
  {
    id: 'term-drug-product',
    category: 'terminology',
    severity: 'info',
    pattern: /\bdrugs?\b(?!\s+(?:product|substance|interaction))/gi,
    message:
      'CTD documents use "drug product" (finished form) or "drug substance" (API). Specify which is meant.',
  },

  // ── Evidence & Citation Gaps ──────────────────────────────────────────────

  {
    id: 'claim-significant-no-pvalue',
    category: 'unsupported-claim',
    severity: 'warning',
    pattern: /\b(?:statistically\s+)?significant\s+(?:improvement|reduction|increase|decrease|difference|change)\b(?!.*(?:p\s*[<=<]|p-value|CI\s|confidence interval))/gi,
    message:
      'Quantitative claim without statistical evidence. Include p-value, confidence interval, or effect size.',
  },
  {
    id: 'claim-well-tolerated-no-ref',
    category: 'unsupported-claim',
    severity: 'warning',
    pattern: /\bwell[- ]tolerated\b(?!.*(?:\[(?:Ref|Study|Source|Table)|See\s+(?:Section|Table)))/gi,
    message:
      'Safety claim "well-tolerated" requires supporting data reference. Cite the relevant safety table or study.',
  },
  {
    id: 'claim-favorable-safety',
    category: 'unsupported-claim',
    severity: 'warning',
    pattern: /\bfavorable\s+(?:safety|tolerability|benefit[- ]risk)\s+profile\b/gi,
    message:
      'Evaluative safety claim — reviewers expect quantitative support. Cite discontinuation rates, SAE incidence, or benefit-risk framework.',
  },
  {
    id: 'claim-first-in-class',
    category: 'unsupported-claim',
    severity: 'warning',
    pattern: /\b(?:first[- ]in[- ]class|novel|unique|breakthrough)\b/gi,
    message:
      'Marketing-style language in regulatory context. Use factual description of mechanism or regulatory designation if applicable.',
  },
  {
    id: 'claim-no-interaction',
    category: 'unsupported-claim',
    severity: 'error',
    pattern: /\bno\s+(?:drug[- ]drug\s+)?(?:interactions?|contraindications?)\b/gi,
    message:
      'Absolute interaction/contraindication claim. Use "no clinically meaningful interactions were observed in [Study X]" with citation.',
  },

  // ── Abbreviation & Consistency ──────────────────────────────────────────

  {
    id: 'abbrev-undefined',
    category: 'terminology',
    severity: 'warning',
    pattern: /\b(?:AE|SAE|TEAE|DLT|MTD|RP2D|PK|PD|ADME|CMC|GMP|GLP|GCP|ICH|eCTD|IB|IMPD)\b/g,
    message:
      'Abbreviation should be defined at first use. Ensure the full term appears earlier in the document.',
  },
  {
    id: 'term-inconsistent-endpoint',
    category: 'terminology',
    severity: 'info',
    pattern: /\b(?:primary\s+)?end[- ]?point\b/gi,
    message:
      'ICH E9 uses "endpoint" (one word). Ensure consistent usage throughout the document.',
    suggestion: 'endpoint',
  },
  {
    id: 'term-adverse-event-inconsistent',
    category: 'terminology',
    severity: 'info',
    pattern: /\bside\s+effects?\b/gi,
    message:
      'Regulatory documents use "adverse event" (AE) or "adverse reaction" rather than "side effect."',
    suggestion: 'adverse event',
  },

  // ── CTD Structure Rules ─────────────────────────────────────────────────

  {
    id: 'ctd-missing-objective',
    category: 'structure',
    severity: 'warning',
    pattern: /^(?:(?!(?:objective|purpose|aim|goal)\b).)*$/gis,
    message:
      'No objectives section detected. CTD clinical sections should state the study objective(s) explicitly.',
    applicableTo: ['ctd-clinical', 'csr', 'protocol'],
  },
  {
    id: 'ctd-regulatory-reference',
    category: 'structure',
    severity: 'info',
    pattern: /\b(?:per\s+(?:FDA|EMA|ICH)\s+guidance|as\s+(?:required|recommended)\s+by)\b(?!.*(?:\(.*\)|21\s+CFR|ICH\s+[A-Z]\d|EU\s+\d))/gi,
    message:
      'Regulatory reference without specific citation. Include the guidance document number (e.g., ICH E6(R2), 21 CFR 312).',
  },

  // ── Quantitative Precision ──────────────────────────────────────────────

  {
    id: 'vague-majority',
    category: 'language',
    severity: 'warning',
    pattern: /\b(?:the\s+)?majority\s+of\s+(?:patients|subjects|participants)\b/gi,
    message:
      'Vague quantification. Specify the exact percentage or proportion (e.g., "72% of subjects").',
  },
  {
    id: 'vague-approximately',
    category: 'language',
    severity: 'info',
    pattern: /\bapproximately\s+\d/gi,
    message:
      'Consider providing the exact value when available. "Approximately" is acceptable for estimates only.',
  },
  {
    id: 'vague-several-studies',
    category: 'language',
    severity: 'warning',
    pattern: /\b(?:several|multiple|various|numerous)\s+(?:studies|trials|investigations)\b/gi,
    message:
      'Specify the number of studies and provide citations. Vague references weaken evidentiary support.',
  },

  // ── Formatting Issues ─────────────────────────────────────────────────────

  {
    id: 'format-double-space',
    category: 'formatting',
    severity: 'info',
    pattern: /[^\n]\s{3,}[^\s]/g,
    message: 'Multiple consecutive spaces detected — check formatting.',
  },
];

// ── Plugin Key ─────────────────────────────────────────────────────────────────

const complianceScannerKey = new PluginKey('complianceScanner');

// ── Scan Engine ────────────────────────────────────────────────────────────────

function scanText(
  text: string,
  baseOffset: number,
  rules: ComplianceRule[],
  _context: ComplianceScannerOptions['context'],
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  let issueCounter = 0;

  for (const rule of rules) {
    // Skip rules not applicable to this document type
    if (rule.applicableTo && _context.documentType) {
      if (!rule.applicableTo.includes(_context.documentType)) continue;
    }

    // Reset regex lastIndex for global patterns
    rule.pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(text)) !== null) {
      issues.push({
        id: `${rule.id}-${issueCounter++}`,
        from: baseOffset + match.index,
        to: baseOffset + match.index + match[0].length,
        text: match[0],
        severity: rule.severity,
        rule: rule.id,
        message: rule.message,
        suggestion: rule.suggestion,
        category: rule.category,
      });

      // Prevent infinite loops on zero-length matches
      if (match[0].length === 0) {
        rule.pattern.lastIndex++;
      }
    }
  }

  return issues;
}

// ── Decoration Builder ─────────────────────────────────────────────────────────

function buildDecorations(issues: ComplianceIssue[]): DecorationSet {
  if (issues.length === 0) return DecorationSet.empty;

  const decorations = issues.map(issue => {
    const severityColor =
      issue.severity === 'error'
        ? '#ef4444'
        : issue.severity === 'warning'
          ? '#f59e0b'
          : '#3b82f6';

    return Decoration.inline(issue.from, issue.to, {
      class: `compliance-issue compliance-${issue.severity}`,
      style: `text-decoration: wavy underline ${severityColor}; text-decoration-skip-ink: none; text-underline-offset: 2px; cursor: pointer;`,
      'data-compliance-id': issue.id,
      'data-compliance-severity': issue.severity,
      'data-compliance-rule': issue.rule,
      'data-compliance-message': issue.message,
      'data-compliance-suggestion': issue.suggestion || '',
      title: `${issue.severity.toUpperCase()}: ${issue.message}${issue.suggestion ? ` → "${issue.suggestion}"` : ''}`,
    });
  });

  return DecorationSet.create(
    // We'll set the doc in the plugin
    null as unknown as Parameters<typeof DecorationSet.create>[0],
    decorations,
  );
}

// ── TipTap Extension ───────────────────────────────────────────────────────────

export const ComplianceScanner = Extension.create<ComplianceScannerOptions, ComplianceScannerStorage>({
  name: 'complianceScanner',

  addOptions() {
    return {
      enabled: true,
      delay: 2000,
      context: {},
      onIssuesFound: undefined,
    };
  },

  addStorage() {
    return {
      enabled: this.options.enabled,
      issues: [] as ComplianceIssue[],
      isScanning: false,
      lastScanTime: 0,
    };
  },

  addCommands() {
    return {
      toggleComplianceScanner:
        () =>
        ({ editor }) => {
          const storage = editor.storage.complianceScanner as ComplianceScannerStorage;
          storage.enabled = !storage.enabled;
          if (!storage.enabled) {
            storage.issues = [];
          }
          return true;
        },
      runComplianceScan:
        () =>
        ({ editor }) => {
          const storage = editor.storage.complianceScanner as ComplianceScannerStorage;
          if (!storage.enabled) return false;
          storage.isScanning = true;

          const doc = editor.state.doc;
          const allIssues: ComplianceIssue[] = [];

          doc.descendants((node, pos) => {
            if (node.isText && node.text) {
              const nodeIssues = scanText(
                node.text,
                pos,
                COMPLIANCE_RULES,
                this.options.context,
              );
              allIssues.push(...nodeIssues);
            }
          });

          storage.issues = allIssues;
          storage.isScanning = false;
          storage.lastScanTime = Date.now();

          this.options.onIssuesFound?.(allIssues);

          // Force view update to show new decorations
          editor.view.dispatch(editor.state.tr.setMeta(complianceScannerKey, { issues: allIssues }));

          return true;
        },
      fixComplianceIssue:
        (issueId: string) =>
        ({ editor }) => {
          const storage = editor.storage.complianceScanner as ComplianceScannerStorage;
          const issue = storage.issues.find(i => i.id === issueId);
          if (!issue || !issue.suggestion) return false;

          // Replace the issue text with the suggestion
          editor
            .chain()
            .focus()
            .deleteRange({ from: issue.from, to: issue.to })
            .insertContentAt(issue.from, issue.suggestion)
            .run();

          // Remove the fixed issue
          storage.issues = storage.issues.filter(i => i.id !== issueId);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin({
        key: complianceScannerKey,

        state: {
          init() {
            return DecorationSet.empty;
          },

          apply(tr, oldDecorations) {
            const meta = tr.getMeta(complianceScannerKey);
            if (meta?.issues) {
              // Rebuild decorations from updated issues
              const issues = meta.issues as ComplianceIssue[];
              if (issues.length === 0) return DecorationSet.empty;

              const decorations = issues.map(issue => {
                const severityColor =
                  issue.severity === 'error'
                    ? '#ef4444'
                    : issue.severity === 'warning'
                      ? '#f59e0b'
                      : '#3b82f6';

                return Decoration.inline(issue.from, issue.to, {
                  class: `compliance-issue compliance-${issue.severity}`,
                  style: `text-decoration: wavy underline ${severityColor}; text-decoration-skip-ink: none; text-underline-offset: 2px; cursor: pointer;`,
                  'data-compliance-id': issue.id,
                  'data-compliance-severity': issue.severity,
                  'data-compliance-message': issue.message,
                  title: `${issue.severity.toUpperCase()}: ${issue.message}`,
                });
              });

              return DecorationSet.create(tr.doc, decorations);
            }

            // Map decorations through document changes
            if (tr.docChanged) {
              return oldDecorations.map(tr.mapping, tr.doc);
            }

            return oldDecorations;
          },
        },

        props: {
          decorations(state) {
            return this.getState(state);
          },
        },

        view(editorView) {
          let scanTimer: ReturnType<typeof setTimeout> | null = null;

          return {
            update(view, prevState) {
              const storage = extension.storage as ComplianceScannerStorage;
              if (!storage.enabled) return;

              // Only re-scan when document actually changed
              if (!view.state.doc.eq(prevState.doc)) {
                if (scanTimer) clearTimeout(scanTimer);

                scanTimer = setTimeout(() => {
                  storage.isScanning = true;
                  const doc = view.state.doc;
                  const allIssues: ComplianceIssue[] = [];

                  doc.descendants((node, pos) => {
                    if (node.isText && node.text) {
                      const nodeIssues = scanText(
                        node.text,
                        pos,
                        COMPLIANCE_RULES,
                        extension.options.context,
                      );
                      allIssues.push(...nodeIssues);
                    }
                  });

                  storage.issues = allIssues;
                  storage.isScanning = false;
                  storage.lastScanTime = Date.now();

                  extension.options.onIssuesFound?.(allIssues);

                  // Dispatch to update decorations
                  view.dispatch(
                    view.state.tr.setMeta(complianceScannerKey, { issues: allIssues }),
                  );
                }, extension.options.delay);
              }
            },

            destroy() {
              if (scanTimer) {
                clearTimeout(scanTimer);
                scanTimer = null;
              }
            },
          };
        },
      }),
    ];
  },
});

export default ComplianceScanner;
