/**
 * The help corpus holds together (P-127, package S13). An article cannot name a screen that does not exist, point at an
 * article that does not exist, offer a demonstration that does not exist, or be read under a collection that does not
 * exist; and a course is lessons that exist. Search finds an article by its own words and finds nothing for nonsense.
 */
import { describe, expect, it } from 'vitest';
import { UI_SURFACES } from '../../constants/ui-surface-registry';
import { DEMO_SCRIPTS } from '../../navigation/demo-scripts';
import {
  ALL_HELP_ARTICLES, HELP_COLLECTIONS, HELP_COURSES, articleFor, findHelpArticle, helpClientType, helpWords, searchHelp,
} from '..';

// 'home' is the shell's own screen (V2App.tsx), not a registry entry.
const surfaceIds = new Set([...UI_SURFACES.map((s) => s.id), 'home']);
const demoIds = new Set(DEMO_SCRIPTS.map((d) => d.id));
const collectionIds = new Set(HELP_COLLECTIONS.map((c) => c.id));

describe('every article', () => {
  it('has a unique, well-formed address', () => {
    const slugs = ALL_HELP_ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s, s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it.each(ALL_HELP_ARTICLES.map((a) => [a.slug, a] as const))('%s: points only at what exists', (_slug, a) => {
    expect(collectionIds.has(a.collection), `collection ${a.collection}`).toBe(true);
    for (const s of a.surfaces ?? []) expect(surfaceIds.has(s), `screen ${s}`).toBe(true);
    if (a.demoScript) expect(demoIds.has(a.demoScript), `demonstration ${a.demoScript}`).toBe(true);
    for (const r of a.related ?? []) expect(findHelpArticle(r), `related ${r}`).toBeTruthy();
    expect(a.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(a.title.trim().length).toBeGreaterThan(5);
    expect(a.summary.trim().length).toBeGreaterThan(10);
  });

  it.each(ALL_HELP_ARTICLES.map((a) => [a.slug, a] as const))('%s: reads as the Help Center reads', (_slug, a) => {
    expect(a.body, 'no exclamation marks').not.toMatch(/!(?!\[)/);
    // Internal code names are not the customer's words.
    expect(`${a.title} ${a.summary} ${a.body}`).not.toMatch(/\bMDX\b|\bP-\d+\b|\bS1[0-9]?\b|\.tsx?\b|client\/src|server\//);
    const words = a.body.split(/\s+/).length;
    expect(words, 'length').toBeGreaterThanOrEqual(40);
    expect(words, 'length').toBeLessThanOrEqual(450);
  });
});

describe('every course', () => {
  it.each(HELP_COURSES.map((c) => [c.id, c] as const))('%s: its lessons and demonstrations exist', (_id, c) => {
    expect(c.lessons.length).toBeGreaterThan(0);
    for (const l of c.lessons) {
      const a = findHelpArticle(l.article);
      expect(a, `lesson ${l.article}`).toBeTruthy();
      if (l.demoScript) expect(demoIds.has(l.demoScript), `demonstration ${l.demoScript}`).toBe(true);
      for (const ct of c.clientTypes ?? []) expect(articleFor(a!, ct), `${l.article} is written for ${ct}`).toBe(true);
    }
  });

  it('a getting-started course exists for every client type', () => {
    for (const ct of ['biotech', 'pharma', 'medtech', 'diagnostics', 'cro'] as const) {
      expect(HELP_COURSES.some((c) => c.audience === 'everyone' && (!c.clientTypes || c.clientTypes.includes(ct))), ct).toBe(true);
    }
  });
});

describe('search', () => {
  it("finds an article by its own title's words, first", () => {
    for (const a of ALL_HELP_ARTICLES) {
      const hits = searchHelp(a.title, { limit: 3 });
      expect(hits.map((h) => h.slug), a.slug).toContain(a.slug);
    }
  });

  it('answers the questions people ask', () => {
    expect(searchHelp('how do I reset my password')[0]?.slug).toBe('sign-in-and-sign-out');
    expect(searchHelp('assign a task to a colleague')[0]?.slug).toBe('assign-work');
    expect(searchHelp('talk to a person')[0]?.slug).toBe('get-help-and-contact-support');
  });

  it('finds nothing for words no article holds, and nothing for an empty question', () => {
    expect(searchHelp('zzqx flurbington')).toEqual([]);
    expect(searchHelp('   ')).toEqual([]);
    expect(searchHelp('the and of')).toEqual([]);
  });

  it('reads the client type the way the product stores it', () => {
    expect(helpClientType('MDX')).toBe('medtech');
    expect(helpClientType('medtech')).toBe('medtech');
    expect(helpClientType('biopharma')).toBe('biotech');
    expect(helpClientType('unknown')).toBeNull();
    expect(helpWords('Markets, eCTD!')).toEqual(['market', 'ectd']);
  });
});
