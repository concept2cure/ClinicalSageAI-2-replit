export type CommitmentPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export type CommitmentCategory =
  | 'Clinical'
  | 'Nonclinical'
  | 'CMC'
  | 'Safety'
  | 'Regulatory'
  | 'Quality'
  | 'Labeling'
  | 'Other';

export type ExtractedCommitment = {
  id: string;
  title: string;
  description: string;
  category: CommitmentCategory;
  priority: CommitmentPriority;
  dueDate: string | null;
  trigger: string | null;
  owner: string | null;
  confidence: number; // 0..1
  evidence: {
    text: string;
    startOffset: number;
    endOffset: number;
    sentenceIndex: number;
  };
};

export type CommitmentsExtractionResult = {
  meta: {
    submissionType?: string;
    documentType?: string;
    extractedAt: string;
    algorithm: 'rules-v1';
  };
  summary: {
    totalCommitments: number;
    criticalCommitments: number;
    upcomingDeadlines: number;
    categories: Array<{ category: CommitmentCategory; count: number }>;
  };
  commitments: ExtractedCommitment[];
};

const normalizeWhitespace = (s: string) => s.replace(/\s+/g, ' ').trim();

const splitSentencesWithOffsets = (text: string) => {
  // Conservative sentence splitter: keeps offsets stable and avoids aggressive NLP.
  // Splits on newline blocks and ., ?, ! when followed by whitespace + capital/number.
  const sentences: Array<{ text: string; start: number; end: number }> = [];

  const blocks = text.split(/\n{2,}/);
  let cursor = 0;

  for (const block of blocks) {
    const blockStart = text.indexOf(block, cursor);
    const blockEnd = blockStart + block.length;

    // Split within block.
    const re = /(.+?)([.!?]+)(\s+|$)/gs;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = re.exec(block)) !== null) {
      const sentenceRaw = (match[1] + match[2]).trim();
      const localStart = match.index - (match[0].length - (match[1] + match[2]).length);
      // Fallback if the above gets weird with lookahead; use lastIndex.
      const startInBlock = Math.max(0, lastIndex);
      const endInBlock = match.index + (match[1] + match[2]).length;

      const start = blockStart + startInBlock;
      const end = blockStart + endInBlock;

      const cleaned = normalizeWhitespace(sentenceRaw);
      if (cleaned.length >= 12) {
        sentences.push({ text: cleaned, start, end });
      }

      lastIndex = match.index + match[0].length;
    }

    // Remainder
    const remainder = normalizeWhitespace(block.slice(lastIndex));
    if (remainder.length >= 12) {
      const start = blockStart + lastIndex;
      const end = blockEnd;
      sentences.push({ text: remainder, start, end });
    }

    cursor = blockEnd;
  }

  return sentences;
};

const extractDueDateText = (sentence: string): string | null => {
  // ISO dates
  const iso = sentence.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  // Month name dates: "January 15, 2026" or "15 January 2026"
  const monthNames =
    '(January|February|March|April|May|June|July|August|September|October|November|December)';
  const month1 = sentence.match(new RegExp(`\\b${monthNames}\\s+\\d{1,2},\\s+20\\d{2}\\b`, 'i'));
  if (month1) return month1[0];

  const month2 = sentence.match(new RegExp(`\\b\\d{1,2}\\s+${monthNames}\\s+20\\d{2}\\b`, 'i'));
  if (month2) return month2[0];

  // Relative deadlines: within 30 days / no later than 60 days
  const rel = sentence.match(/\b(within|no later than)\s+(\d{1,3})\s+(day|days|week|weeks|month|months)\b/i);
  if (rel) return `${rel[1]} ${rel[2]} ${rel[3]}`;

  return null;
};

const categorizeCommitment = (s: string): CommitmentCategory => {
  const t = s.toLowerCase();
  if (/(protocol|csr|endpoint|randomi|trial|clinical)/.test(t)) return 'Clinical';
  if (/(toxic|nonclinical|in\s+vitro|in\s+vivo|pharmacology)/.test(t)) return 'Nonclinical';
  if (/(manufactur|process|batch|release|stability|specification|analytical|hplc|gmp|cmc|drug substance|drug product)/.test(t)) return 'CMC';
  if (/(safety|pharmacovigil|adverse|ae\b|serious|susar|pregnan)/.test(t)) return 'Safety';
  if (/(submit|supplement|amendment|agency|fda|cber|cder|ema|meeting|minuted|type\s+[abc]|response to|information request)/.test(t))
    return 'Regulatory';
  if (/(quality|deviation|capa|oop|oot|investigation|change control)/.test(t)) return 'Quality';
  if (/(label|package insert|prescribing information|pi\b|ifu)/.test(t)) return 'Labeling';
  return 'Other';
};

const scorePriorityAndConfidence = (s: string) => {
  const t = s.toLowerCase();

  let confidence = 0.35;
  let priority: CommitmentPriority = 'Low';

  const hasStrongModal = /(shall|must|required to|are required to|commit to|we will|we agree to)/i.test(s);
  const hasWeakModal = /(should|plan to|may|intend to)/i.test(s);
  const hasAgency = /(fda|agency|cber|cder|ema|health canada|mhra)/i.test(s);
  const hasDeadline = /(within|no later than|by\s+20\d{2}|by\s+(january|february|march|april|may|june|july|august|september|october|november|december))/i.test(s);
  const hasDeliverable = /(submit|provide|conduct|complete|file|update|revise|validate|implement|perform|report)/i.test(s);
  const isConditionalApproval = /(condition of approval|post[-\s]?marketing|pmr|pmc)/i.test(s);
  const isCriticalTerm = /(immediately|urgent|critical|major|overdue|prior to approval|before approval)/i.test(s);

  if (hasDeliverable) confidence += 0.2;
  if (hasStrongModal) confidence += 0.25;
  if (hasAgency) confidence += 0.05;
  if (hasDeadline) confidence += 0.1;
  if (isConditionalApproval) confidence += 0.1;
  if (hasWeakModal) confidence -= 0.15;

  // Priority rules
  if (isCriticalTerm || isConditionalApproval) priority = 'Critical';
  else if (hasDeadline && hasStrongModal) priority = 'High';
  else if (hasStrongModal || (hasDeliverable && hasDeadline)) priority = 'Medium';
  else if (hasDeliverable) priority = 'Low';

  confidence = Math.max(0.05, Math.min(0.99, confidence));

  return { priority, confidence };
};

const buildTitle = (sentence: string): string => {
  const s = sentence.replace(/^\s*(we\s+)?(will|shall|must|agree to|commit to)\s+/i, '');
  const trimmed = normalizeWhitespace(s);
  // Keep it short-ish.
  const maxLen = 90;
  return trimmed.length <= maxLen ? trimmed : `${trimmed.slice(0, maxLen - 1)}…`;
};

export const extractCommitmentsRulesV1 = (input: {
  documentText: string;
  submissionType?: string;
  documentType?: string;
}): CommitmentsExtractionResult => {
  const text = input.documentText || '';

  const sentences = splitSentencesWithOffsets(text);

  // Candidate sentences: actionable / commitment language
  const candidateRe = /(shall|must|required to|are required to|commit to|we will|we agree to|submit|provide|conduct|complete|file|update|revise|validate|implement|perform|report)\b/i;

  const commitments: ExtractedCommitment[] = [];

  sentences.forEach((s, sentenceIndex) => {
    if (!candidateRe.test(s.text)) return;

    // Avoid over-triggering on generic boilerplate.
    if (/generated by|placeholder|this section should be completed/i.test(s.text)) return;

    const dueDate = extractDueDateText(s.text);
    const { priority, confidence } = scorePriorityAndConfidence(s.text);
    const category = categorizeCommitment(s.text);

    // Only keep reasonably confident items.
    if (confidence < 0.45 && !dueDate) return;

    const id = `cmt_${sentenceIndex}_${Math.abs(hashCode(s.text)).toString(36)}`;

    commitments.push({
      id,
      title: buildTitle(s.text),
      description: s.text,
      category,
      priority,
      dueDate,
      trigger: null,
      owner: null,
      confidence: Math.round(confidence * 100) / 100,
      evidence: {
        text: s.text,
        startOffset: s.start,
        endOffset: s.end,
        sentenceIndex,
      },
    });
  });

  // De-duplicate by normalized description.
  const seen = new Set<string>();
  const deduped = commitments.filter(c => {
    const key = normalizeWhitespace(c.description).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort: Critical/High first, then by due date presence.
  const priorityRank: Record<CommitmentPriority, number> = {
    Critical: 0,
    High: 1,
    Medium: 2,
    Low: 3,
  };

  deduped.sort((a, b) => {
    const pr = priorityRank[a.priority] - priorityRank[b.priority];
    if (pr !== 0) return pr;
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return b.confidence - a.confidence;
  });

  const categoryCounts = deduped.reduce<Record<CommitmentCategory, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] || 0) + 1;
    return acc;
  }, {} as any);

  const categories = (Object.keys(categoryCounts) as CommitmentCategory[])
    .map(category => ({ category, count: categoryCounts[category] }))
    .sort((a, b) => b.count - a.count);

  const totalCommitments = deduped.length;
  const criticalCommitments = deduped.filter(c => c.priority === 'Critical').length;
  const upcomingDeadlines = deduped.filter(c => c.dueDate && /within|no later than|\b20\d{2}\b/i.test(c.dueDate)).length;

  return {
    meta: {
      submissionType: input.submissionType,
      documentType: input.documentType,
      extractedAt: new Date().toISOString(),
      algorithm: 'rules-v1',
    },
    summary: {
      totalCommitments,
      criticalCommitments,
      upcomingDeadlines,
      categories,
    },
    commitments: deduped,
  };
};

const hashCode = (str: string) => {
  // Simple stable hash (non-crypto)
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
};
