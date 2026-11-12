/**
 * AnA's Help Center tools (P-127) read the same corpus as Help & training, are registered and offered on every turn,
 * and never invent: an unknown question is said to have no article.
 */
import { describe, expect, it } from 'vitest';
import { asksHowToUseProduct, handleReadHelpArticle, handleSearchHelpCenter, HELP_SUPPORT_TOOLS } from '../help-support-tools';
import { findHelpArticle } from '../../../../shared/help';

describe('search_help_center', () => {
  it('returns the article that answers a product question, with its link', () => {
    const r = JSON.parse(handleSearchHelpCenter({ query: 'how do I assign a task to someone' }));
    expect(r.status).toBe('ok');
    expect(r.articles[0]).toMatchObject({ slug: 'assign-work', link: '/concept2cure/training?article=assign-work' });
  });

  it('says there is no article rather than answering from nowhere', () => {
    const r = JSON.parse(handleSearchHelpCenter({ query: 'zzqx flurbington' }));
    expect(r.status).toBe('no_match');
    expect(r.instruction).toMatch(/Do not invent/);
    expect(JSON.parse(handleSearchHelpCenter({ query: '  ' })).status).toBe('error');
  });

  it('leaves out a course-only device article for a drug team only when the article says so', () => {
    const r = JSON.parse(handleSearchHelpCenter({ query: 'create a project', client_type: 'medtech' }));
    expect(r.articles.map((a: { slug: string }) => a.slug)).toContain('create-your-first-project');
  });
});

describe('read_help_article', () => {
  it('gives the article whole, the same text the page shows', () => {
    const r = JSON.parse(handleReadHelpArticle({ slug: 'project-settings' }));
    expect(r.status).toBe('ok');
    expect(r.article.body).toBe(findHelpArticle('project-settings')!.body);
    expect(r.article.collection).toBe('Projects and the plan');
  });

  it('refuses an unknown slug', () => {
    expect(JSON.parse(handleReadHelpArticle({ slug: 'no-such' })).status).toBe('not_found');
  });
});

describe('offered when the question is about using the product', () => {
  it('recognises a how-to about the product, and leaves a regulatory question alone', () => {
    for (const q of ['How do I assign a task?', 'where is the button to sign', "I can't find the Vault", 'reset my password', 'how to invite a colleague'])
      expect(asksHowToUseProduct(q), q).toBe(true);
    for (const q of ['Draft the nonclinical overview', 'What does ICH E3 require in section 12?', 'summarise the CMC risks'])
      expect(asksHowToUseProduct(q), q).toBe(false);
    expect(HELP_SUPPORT_TOOLS.map((t) => t.name)).toEqual(['search_help_center', 'read_help_article']);
  });
});
