/**
 * AnA's help tools (P-127, package S13; docs/design/HELP_AND_SUPPORT_2026-11-10.md §3.2–§3.3).
 *
 *   search_help_center  — the Help Center's articles that answer a question, best first
 *   read_help_article   — one article, whole
 *
 * They read the help corpus (shared/help/) through the module GET /api/docs uses, so what AnA says an article says
 * and what the person reads on Help & training are the same text. Read-only; no tenant record is touched; no model
 * takes part in finding an article. AnA narrates the article and names it; the conversation renders the name as a link
 * to Help & training (?article=<slug>).
 */
import type { AnaTool } from '../ai-gateway/types';
import type { ToolContext } from './AnaToolExecutor';
import {
  HELP_COLLECTIONS,
  findHelpArticle,
  helpClientType,
  searchHelp,
} from '../../../shared/help/index.js';

type RegisterFn = (name: string, handler: (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>) => void;

/** Where an article is read in the product, for AnA to link. */
export const helpArticleLink = (slug: string) => `/concept2cure/training?article=${encodeURIComponent(slug)}`;

export const SEARCH_HELP_CENTER: AnaTool = {
  name: 'search_help_center',
  description:
    "Search Concept2Cure's Help Center: the product's own articles on how to use it (signing in, projects and the plan, assigning work, the editor, review and signatures, the Submission Center, the Vault, Quality, the work areas, administration, security and the audit trail, troubleshooting). " +
    'Call this FIRST whenever the person asks how to do something in Concept2Cure, where something is, what a screen or button does, or why the product behaves a certain way — before answering from memory. ' +
    'Returns the matching articles (slug, title, collection, summary, and the sentence where the words were found) best first, or none. ' +
    'Then read the best one with read_help_article and answer from it, naming the article ("Help: <title>") so the person can open it. ' +
    'If nothing matches, say the Help Center has no article on it; do not invent product steps. Not for regulatory questions (use the regulatory tools for those).',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "The person's question in their words, e.g. \"how do I add a market\"." },
      client_type: {
        type: 'string',
        enum: ['biotech', 'pharma', 'medtech', 'diagnostics', 'cro'],
        description: "Optional: the organisation's client type, to leave out articles written for another.",
      },
      limit: { type: 'number', description: 'How many articles, 1–10 (default 5).' },
    },
    required: ['query'],
  },
};

export const READ_HELP_ARTICLE: AnaTool = {
  name: 'read_help_article',
  description:
    'Read one Help Center article in full, by its slug from search_help_center. Answer the person from it in your own words, keep its steps in order, use the exact button and screen names it gives, and name it ("Help: <title>"). ' +
    'If it offers a demonstration (demo_script), you may offer to show it with start_product_demo. Never add steps the article does not give.',
  input_schema: {
    type: 'object',
    properties: { slug: { type: 'string', description: 'The article slug, e.g. "assign-work".' } },
    required: ['slug'],
  },
};

export const HELP_SUPPORT_TOOLS: AnaTool[] = [SEARCH_HELP_CENTER, READ_HELP_ARTICLE];

/** The Help Center tools' names, pinned on a turn that asks how to use the product (stream.ts). */
export const HELP_CENTER_TOOL_NAMES = ['search_help_center', 'read_help_article'] as const;

/*
 * Whether a message asks how to use Concept2Cure itself. Such a question rarely shares a word with any tool's
 * description ("where is the button to…"), so relevance alone would drop the Help Center tools and AnA would answer
 * product steps from memory. Deterministic: the question's form ("how do I", "where is", "can't find") or a product
 * noun (button, screen, menu, password, invite, log in). They are pinned on such a turn, and always in support mode,
 * rather than always on: every always-on tool takes a slot from the turn's relevance cap.
 */
const HOW_TO = /\b(how (do|can|should) (i|we|you)|how to|where (is|are|do i|can i|do we)|where's|can't find|cannot find|can not find|i can't see|is there a way|what does (this|the) (button|screen|page|tab|menu)|walk me through|show me how)\b/i;
const PRODUCT_NOUN = /\b(button|screen|page|tab|menu|sidebar|top bar|settings|password|log ?in|sign ?in|log ?out|sign ?out|invite|account|help & training|help center|tutorial|training course|support|ticket)\b/i;
export function asksHowToUseProduct(message: string): boolean {
  const m = String(message ?? '');
  return HOW_TO.test(m) || PRODUCT_NOUN.test(m);
}

export function handleSearchHelpCenter(input: Record<string, unknown>): string {
  const query = typeof input.query === 'string' ? input.query.trim().slice(0, 200) : '';
  if (!query) return JSON.stringify({ status: 'error', message: 'Say what to search the Help Center for (query).' });
  const raw = Number(input.limit);
  const limit = Number.isFinite(raw) ? Math.max(1, Math.min(10, Math.round(raw))) : 5;
  const clientType = helpClientType(typeof input.client_type === 'string' ? input.client_type : null);
  const hits = searchHelp(query, { clientType, limit });
  if (hits.length === 0) {
    return JSON.stringify({
      status: 'no_match',
      query,
      instruction:
        'The Help Center has no article on this. Say so plainly. Do not invent product steps. Offer what you can do instead: look at the screen together, or contact support.',
    });
  }
  return JSON.stringify({
    status: 'ok',
    query,
    count: hits.length,
    articles: hits.map((h) => ({ ...h, link: helpArticleLink(h.slug) })),
    instruction: 'Read the best match with read_help_article before answering, and name it ("Help: <title>").',
  });
}

export function handleReadHelpArticle(input: Record<string, unknown>): string {
  const slug = typeof input.slug === 'string' ? input.slug.trim() : '';
  const article = slug ? findHelpArticle(slug) : undefined;
  if (!article) {
    return JSON.stringify({ status: 'not_found', slug, instruction: 'There is no Help Center article at that slug. Search with search_help_center.' });
  }
  const collection = HELP_COLLECTIONS.find((c) => c.id === article.collection);
  return JSON.stringify({
    status: 'ok',
    article: {
      slug: article.slug,
      title: article.title,
      collection: collection?.title ?? article.collection,
      summary: article.summary,
      body: article.body,
      checked: article.checked,
      demo_script: article.demoScript ?? null,
      related: article.related ?? [],
      link: helpArticleLink(article.slug),
    },
    instruction:
      'Answer from this article in your own words; keep its steps and its exact labels; name it ("Help: ' + article.title + '"). Add nothing it does not say.',
  });
}

export function registerHelpSupportHandlers(register: RegisterFn): void {
  register('search_help_center', async (input) => handleSearchHelpCenter(input));
  register('read_help_article', async (input) => handleReadHelpArticle(input));
}
