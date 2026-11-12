/**
 * AnA's help tools (P-127, package S13; docs/design/HELP_AND_SUPPORT_2026-11-10.md §3.2–§3.3).
 *
 *   search_help_center       — the Help Center's articles that answer a question, best first
 *   read_help_article        — one article, whole
 *   open_support_ticket      — drafts a support request; the person reads it and sends it on Help & training
 *   list_my_support_tickets  — the person's support requests and where each stands
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

/** Where an article is read in the product: its address, and the navigate_to call that opens it (a chip under the
 *  answer; AnA's markdown keeps only web links, so an in-app address is never a link in her text). */
export const helpArticleLink = (slug: string) => `/concept2cure/training?article=${encodeURIComponent(slug)}`;
export const helpNavigation = (params: Record<string, string>) => ({ tool: 'navigate_to', input: { target: 'training', params } });

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

export const OPEN_SUPPORT_TICKET: AnaTool = {
  name: 'open_support_ticket',
  description:
    'Draft a support request to Concept2Cure support for the person, when the Help Center does not answer them, something in the product looks broken, or they ask for a person. ' +
    'It records nothing: it returns the draft and a link that opens it on Help & training, where the person reads it, changes it if they want, and sends it. ' +
    'Before drafting, search the Help Center once. Write the subject as the problem in a few words; in details say what they were doing, where (screen, project), what they expected, what happened, and the words of any message shown. ' +
    'Then show the draft and open it for them with navigate_to (the result gives the call); they send it there. Never say a request was sent or opened.',
  input_schema: {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'The problem in a few words, 4–200 characters.' },
      details: { type: 'string', description: 'What they did, where, what they expected and what happened; any message shown, word for word.' },
      category: { type: 'string', enum: ['general', 'technical', 'bug_report', 'account', 'billing', 'compliance', 'integration', 'feature_request'], description: 'Optional; default general.' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Optional; high or critical only when work is blocked. Default medium.' },
      articles: { type: 'array', items: { type: 'string' }, description: 'Optional: slugs of the help articles already read.' },
    },
    required: ['subject', 'details'],
  },
};

export const LIST_MY_SUPPORT_TICKETS: AnaTool = {
  name: 'list_my_support_tickets',
  description:
    "List the person's support requests to Concept2Cure support (an administrator sees the organisation's), open ones first: number, subject, status, replies and when it last changed. " +
    'Use when they ask about a request they sent, whether support has answered, or what they asked before. Its replies are read on Help & training: open one with navigate_to (each request gives the call).',
  input_schema: {
    type: 'object',
    properties: { limit: { type: 'number', description: 'How many, 1–20 (default 10).' } },
    required: [],
  },
};

export const HELP_SUPPORT_TOOLS: AnaTool[] = [SEARCH_HELP_CENTER, READ_HELP_ARTICLE, OPEN_SUPPORT_TICKET, LIST_MY_SUPPORT_TICKETS];

/** Where a support request is read, or a drafted one is sent, on Help & training. */
export const supportRequestLink = (ticketNumber: string) => `/concept2cure/training?request=${encodeURIComponent(ticketNumber)}`;
export function supportDraftLink(draft: { subject: string; details: string; category?: string; priority?: string; articles?: string[] }): string {
  const p = new URLSearchParams({ request: 'new', subject: draft.subject, details: draft.details });
  if (draft.category) p.set('category', draft.category);
  if (draft.priority) p.set('priority', draft.priority);
  if (draft.articles?.length) p.set('articles', draft.articles.join(','));
  return `/concept2cure/training?${p.toString()}`;
}

/** The Help Center tools' names, pinned on a turn that asks how to use the product (stream.ts). */
export const HELP_CENTER_TOOL_NAMES = ['search_help_center', 'read_help_article', 'open_support_ticket', 'list_my_support_tickets'] as const;

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
    open_article: helpNavigation({ article: article.slug }),
    instruction:
      'Answer from this article in your own words; keep its steps and its exact labels; name it ("Help: ' + article.title + '"). Add nothing it does not say. ' +
      'To let them read it whole, call navigate_to with open_article\'s input (a chip they select).',
  });
}

const CATEGORIES = new Set(['general', 'technical', 'bug_report', 'account', 'billing', 'compliance', 'integration', 'feature_request']);
const PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const DETAILS_IN_LINK = 1500;

/** The draft, and the link that opens it to be sent. Nothing is recorded. */
export function handleOpenSupportTicket(input: Record<string, unknown>): string {
  const subject = typeof input.subject === 'string' ? input.subject.trim().slice(0, 200) : '';
  const details = typeof input.details === 'string' ? input.details.trim() : '';
  if (subject.length < 4 || details.length < 10) {
    return JSON.stringify({ status: 'error', message: 'A support request needs a subject (at least 4 characters) and details (at least 10). Ask the person what happened.' });
  }
  const category = typeof input.category === 'string' && CATEGORIES.has(input.category) ? input.category : 'general';
  const priority = typeof input.priority === 'string' && PRIORITIES.has(input.priority) ? input.priority : 'medium';
  const articles = Array.isArray(input.articles)
    ? input.articles.filter((a): a is string => typeof a === 'string' && Boolean(findHelpArticle(a))).slice(0, 10)
    : [];
  const shortened = details.length > DETAILS_IN_LINK;
  return JSON.stringify({
    status: 'draft',
    sent: false,
    draft: { subject, details, category, priority, articles },
    link: supportDraftLink({ subject, details: shortened ? details.slice(0, DETAILS_IN_LINK) : details, category, priority, articles }),
    open_draft: helpNavigation({
      request: 'new', subject, details: shortened ? details.slice(0, DETAILS_IN_LINK) : details, category, priority,
      ...(articles.length ? { articles: articles.join(',') } : {}),
    }),
    instruction:
      'Nothing has been sent. Show the person this draft, then call navigate_to with open_draft\'s input: it opens the draft on Help & training (a chip they select), where they read it and send it.' +
      (shortened ? ' The details were long; the link carries the first part, and the person can add the rest before sending.' : ''),
  });
}

/** The caller's requests, the way GET /api/support/tickets lists them. */
export async function handleListMySupportTickets(input: Record<string, unknown>, ctx?: ToolContext): Promise<string> {
  const orgId = Number(ctx?.organizationId);
  const userId = Number(ctx?.userId);
  if (!Number.isFinite(orgId) || !Number.isFinite(userId) || orgId <= 0 || userId <= 0) {
    return JSON.stringify({ status: 'error', message: 'Support requests are read for a signed-in member of an organisation. Nothing was read.' });
  }
  const raw = Number(input.limit);
  const limit = Number.isFinite(raw) ? Math.max(1, Math.min(20, Math.round(raw))) : 10;
  try {
    const [{ getPool }, { listSupportTickets }] = await Promise.all([import('../../db.js'), import('../../routes/support.js')]);
    const { tickets, scope } = await listSupportTickets(getPool(), { orgId, userId }, limit);
    return JSON.stringify({
      status: tickets.length ? 'ok' : 'none',
      scope,
      count: tickets.length,
      requests: tickets.map((t) => ({
        number: t.number, subject: t.subject, status: t.status, replies: t.replies,
        openedBy: t.openedBy.you ? 'you' : t.openedBy.name, updatedAt: t.updatedAt, link: supportRequestLink(t.number),
        open: helpNavigation({ request: t.number }),
      })),
      ...(tickets.length ? {} : { instruction: 'The person has no support requests. Say so; offer to draft one if they need help.' }),
    });
  } catch {
    return JSON.stringify({ status: 'error', message: 'Support requests could not be read. Say so; this is a failed read, not an empty list.' });
  }
}

export function registerHelpSupportHandlers(register: RegisterFn): void {
  register('search_help_center', async (input) => handleSearchHelpCenter(input));
  register('read_help_article', async (input) => handleReadHelpArticle(input));
  register('open_support_ticket', async (input) => handleOpenSupportTicket(input));
  register('list_my_support_tickets', async (input, ctx) => handleListMySupportTickets(input, ctx));
}

/*
 * The help and support agent (P-127 §3.3). A turn asked from Help & training's "Ask support" or from Get help carries
 * module_context.support = true (the conversation's ask-origin hand-off, client/src/concept2cure/v2/surfaces/help/
 * supportEntry.ts). On such a turn the Help Center and support tools are pinned whatever the wording scores, and AnA
 * is told she is answering as Concept2Cure support. Read from the turn's own context, never from tool input.
 */
export function isSupportTurn(moduleContext: unknown): boolean {
  return Boolean(moduleContext && typeof moduleContext === 'object' && (moduleContext as { support?: unknown }).support === true);
}

export const SUPPORT_TURN_BRIEF = `## Support

The person opened Concept2Cure support. Answer as its support agent: about using the product, not about regulatory substance.
1. Find the answer in the Help Center first (search_help_center, then read_help_article) and give its steps with the article's name.
2. Where an article offers a demonstration, offer to show it (start_product_demo); where a screen holds the answer, offer to take them there.
3. When no article answers, something looks broken, or they ask for a person, draft a support request with open_support_ticket, show it, and open it for them with navigate_to as its result says. They send it themselves; never say it was sent.
4. When they ask about a request they sent, read it with list_my_support_tickets.
Say plainly what you do not know. Do not invent product steps, screens or timelines.`;
