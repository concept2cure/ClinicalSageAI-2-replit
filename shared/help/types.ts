/**
 * The help corpus: Concept2Cure's Help Center articles and courses (P-127, package S13;
 * docs/design/HELP_AND_SUPPORT_2026-11-10.md).
 *
 * Articles are reviewed like code and versioned with the product they describe. Each is written from the screen's code
 * and checked in the running app; a statement the product cannot back is not written. An article that names a screen
 * lists it in `surfaces`, and a test holds every listed id to the screen registry, so an article cannot describe a
 * screen that no longer exists. The same corpus is read by GET /api/docs (server/routes/docs.ts) and by AnA's
 * search_help_center / read_help_article tools: one record, two readers.
 */

/** Client types an article is written for (organizations.client_type, resolved). Absent: every client type. */
export type HelpClientType = 'biotech' | 'pharma' | 'medtech' | 'diagnostics' | 'cro';

export type HelpCollectionId =
  | 'getting-started'
  | 'projects'
  | 'evidence'
  | 'writing'
  | 'review'
  | 'submission'
  | 'respond'
  | 'vault'
  | 'quality'
  | 'work-areas'
  | 'administration'
  | 'technical'
  | 'troubleshooting';

export interface HelpCollection {
  id: HelpCollectionId;
  title: string;
  /** One sentence: what the collection is for. */
  summary: string;
  /** Who it is mainly for: everyone, or the organisation's administrators. */
  audience: 'everyone' | 'administrators';
}

export interface HelpArticle {
  /** Stable, lower-case, hyphenated; the article's address (/api/docs/<slug>). Never reused for another article. */
  slug: string;
  /** A task or a question, as a person would ask it: "Add a market to a project". */
  title: string;
  collection: HelpCollectionId;
  /** One sentence shown under the title in lists and search. */
  summary: string;
  /** Absent: the article holds for every client type. */
  clientTypes?: readonly HelpClientType[];
  /** The screens (UI_SURFACES ids) the article describes; held to the registry by a test. */
  surfaces?: readonly string[];
  /** A Live Drive script AnA can run to show it (shared/navigation/demo-scripts.ts id). */
  demoScript?: string;
  /** Words a person might search with that are not in the title or body (synonyms, old names). */
  keywords?: readonly string[];
  /** Other articles to read next, by slug; held to the corpus by a test. */
  related?: readonly string[];
  /** YYYY-MM-DD: when the article was last checked against the running product. */
  checked: string;
  /** Markdown: short paragraphs, numbered steps for a task, no screenshots. */
  body: string;
}

export interface HelpLesson {
  /** The article the lesson is. */
  article: string;
  /** A Live Drive script AnA can run to show the lesson, where one fits. */
  demoScript?: string;
}

export interface HelpCourse {
  id: string;
  title: string;
  summary: string;
  /** Absent: every client type. */
  clientTypes?: readonly HelpClientType[];
  audience: 'everyone' | 'administrators';
  lessons: readonly HelpLesson[];
}
