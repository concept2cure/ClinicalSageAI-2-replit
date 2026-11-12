import React, { useContext, useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import { useLiveData, useLiveRows, EmptyState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { AnaMarkdown } from '../AnaMarkdown';
import { LiveDriveControlsContext } from '../LiveDriveSwitch';
import { availableDemoScripts } from '../../components/ana/anaLockedScreens';
import { helpClientType } from '@shared/help';
import { askSupport } from './help/supportEntry';
import '../styles/project-home-v2.css';
import '../styles/help-v2.css';

/* ════ Help & training (P-127, docs/design/HELP_AND_SUPPORT_2026-11-10.md) ════
   The Help Center, the training courses and the person's support requests, on one page, the way Claude's help is
   read: a column of text, quiet type, no cards, no coach marks. The articles and courses are the corpus in
   shared/help/, read through GET /api/docs; AnA's search_help_center reads the same module, so this page and AnA
   never disagree. The organisation's own learning paths and certifications (GET /api/enablement/*), which this
   screen showed before, stay at its foot (P-122 §2). */

interface LearningPath { id: string; title: string; lessons: number; done: number; mins: number; level: string; tone: string }
interface Certification { id: string; name: string; status: string; when: string }

interface ListedArticle { slug: string; title: string; summary: string; collection: string }
interface CollectionRead { id: string; title: string; summary: string; audience: string; articles: ListedArticle[] }
interface CourseRead {
  id: string; title: string; summary: string; audience: string;
  lessons: Array<{ article: ListedArticle; demoScript: string | null }>;
}
interface HelpIndexRead { collections: CollectionRead[]; courses: CourseRead[]; articleCount: number }
interface ArticleRead {
  article: { slug: string; title: string; summary: string; body: string; checked: string; demoScript?: string; collection: string };
  collection: { id: string; title: string } | null;
  related: ListedArticle[];
}
interface SearchRead { query: string; hits: Array<ListedArticle & { snippet: string }> }

type View = { kind: 'home' } | { kind: 'article'; slug: string } | { kind: 'course'; id: string };

/** The view a link names: ?article=<slug> or ?course=<id>; else the Help Center's front page. */
export function helpViewFromLocation(search: string): View {
  const q = new URLSearchParams(search);
  const article = q.get('article');
  if (article) return { kind: 'article', slug: article };
  const course = q.get('course');
  if (course) return { kind: 'course', id: course };
  return { kind: 'home' };
}

function writeLocation(view: View) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('article');
    url.searchParams.delete('course');
    if (view.kind === 'article') url.searchParams.set('article', view.slug);
    if (view.kind === 'course') url.searchParams.set('course', view.id);
    window.history.replaceState(window.history.state, '', url.toString());
  } catch { /* the view still changes; only the address does not */ }
}

export function Training({ onAsk, onNav, segment }: SurfaceViewProps) {
  const clientType = helpClientType(segment);
  const [view, setView] = useState<View>(() => (typeof window === 'undefined' ? { kind: 'home' } : helpViewFromLocation(window.location.search)));
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => { const t = setTimeout(() => setDebounced(query.trim()), 250); return () => clearTimeout(t); }, [query]);
  const go = (next: View) => { setView(next); setQuery(''); writeLocation(next); };

  const indexPath = `/api/docs${clientType ? `?clientType=${clientType}` : ''}`;
  const index = useLiveData<HelpIndexRead>(indexPath, [indexPath, version]);
  const searchPath = debounced ? `/api/docs/search?q=${encodeURIComponent(debounced)}${clientType ? `&clientType=${clientType}` : ''}` : null;
  const search = useLiveData<SearchRead>(searchPath, [searchPath]);
  const articlePath = view.kind === 'article' ? `/api/docs/${encodeURIComponent(view.slug)}` : null;
  const article = useLiveData<ArticleRead>(articlePath, [articlePath]);
  const paths = useLiveRows<LearningPath>('/api/enablement/paths');
  const certs = useLiveRows<Certification>('/api/enablement/certifications');

  const support = () => askSupport(onNav, onAsk);

  const anaContext = useMemo(() => ({
    summary: view.kind === 'article' && article.data
      ? `Help & training: reading the help article "${article.data.article.title}".`
      : view.kind === 'course'
        ? 'Help & training: a training course.'
        : `Help & training: the Help Center${index.data ? ` (${index.data.articleCount} articles)` : ''}, training courses and support requests.`,
    facts: {
      openArticle: view.kind === 'article' ? view.slug : null,
      openCourse: view.kind === 'course' ? view.id : null,
      search: debounced || null,
      courses: index.data?.courses.map((c) => c.title) ?? null,
    },
    availableActions: [
      'Search the Help Center',
      'Open a help article',
      'Take a training course',
      'Ask support (opens the support conversation)',
      'Read your support requests',
    ],
  }), [view, article.data, index.data, debounced]);
  usePublishSurfaceContext('training', anaContext);

  return (
    <div className="page-inner hc">
      <header className="hc-head">
        <h1 className="ph-title">Help &amp; training</h1>
        <p className="hc-sub">Answers, courses and support for Concept2Cure.</p>
        <div className="hc-search">
          <span className="hc-search-ico" aria-hidden="true">{I.search}</span>
          <label className="sr-only" htmlFor="hc-search-input">Search the Help Center</label>
          <input id="hc-search-input" className="c2c-input" type="search" placeholder="Search for an answer"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="hc-asks">
          <button type="button" className="btn primary" onClick={support}>{I.help} Ask support</button>
          <button type="button" className="btn ghost" onClick={() => onAsk('How do I get started with Concept2Cure?')}>Ask AnA</button>
        </div>
      </header>

      {debounced ? (
        <SearchResults read={search} query={debounced} onOpen={(slug) => go({ kind: 'article', slug })} onSupport={support} />
      ) : view.kind === 'article' ? (
        <ArticleView read={article} onBack={() => go({ kind: 'home' })} onOpen={(slug) => go({ kind: 'article', slug })} onSupport={support} />
      ) : view.kind === 'course' ? (
        <CourseView course={index.data?.courses.find((c) => c.id === view.id) ?? null} loading={index.loading}
          onBack={() => go({ kind: 'home' })} onOpen={(slug) => go({ kind: 'article', slug })} />
      ) : (
        <>
          {index.loading ? (
            <div role="status" className="scaf-note">Loading the Help Center…</div>
          ) : index.error || !index.data ? (
            <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load the Help Center"
              hint="The help articles could not be read. This is a failed read, not an empty Help Center."
              retry={() => setVersion((v) => v + 1)} />
          ) : (
            <>
              <section className="hc-sec" aria-labelledby="hc-courses-h">
                <h2 id="hc-courses-h" className="hc-h">Training courses</h2>
                <ul className="hc-list">
                  {index.data.courses.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="hc-row" onClick={() => go({ kind: 'course', id: c.id })}>
                        <span className="hc-row-t">{c.title}</span>
                        <span className="hc-row-s">{c.summary} {c.lessons.length} lessons.</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="hc-sec" aria-labelledby="hc-browse-h">
                <h2 id="hc-browse-h" className="hc-h">Browse help</h2>
                {index.data.collections.map((c) => (
                  <div key={c.id} className="hc-coll">
                    <h3 className="hc-coll-t">{c.title}{c.audience === 'administrators' && <span className="hc-aud"> · for administrators</span>}</h3>
                    <p className="hc-coll-s">{c.summary}</p>
                    <ul className="hc-links">
                      {c.articles.map((a) => (
                        <li key={a.slug}><button type="button" className="hc-link" onClick={() => go({ kind: 'article', slug: a.slug })}>{a.title}</button></li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            </>
          )}
          <OrganisationTraining paths={paths} certs={certs} onAsk={onAsk} />
        </>
      )}
    </div>
  );
}

function SearchResults({ read, query, onOpen, onSupport }: {
  read: ReturnType<typeof useLiveData<SearchRead>>; query: string; onOpen: (slug: string) => void; onSupport: () => void;
}) {
  if (read.loading) return <div role="status" className="scaf-note">Searching…</div>;
  if (read.error || !read.data) {
    return <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't search the Help Center"
      hint="The search could not be read. This is a failed read, not a search with no answer." />;
  }
  if (read.data.hits.length === 0) {
    return (
      <section className="hc-sec" aria-live="polite">
        <p className="hc-none">No article answers “{query}”.</p>
        <p className="hc-none-s">Try other words, or <button type="button" className="hc-link" onClick={onSupport}>ask support</button>.</p>
      </section>
    );
  }
  return (
    <section className="hc-sec" aria-live="polite" aria-label="Search results">
      <ul className="hc-list">
        {read.data.hits.map((h) => (
          <li key={h.slug}>
            <button type="button" className="hc-row" onClick={() => onOpen(h.slug)}>
              <span className="hc-row-t">{h.title}</span>
              <span className="hc-row-s">{h.snippet}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ShowMe({ demoScript }: { demoScript?: string | null }) {
  const ctl = useContext(LiveDriveControlsContext);
  if (!demoScript || !ctl || ctl.locked) return null;
  const demo = availableDemoScripts().find((d) => d.id === demoScript);
  if (!demo) return null;
  return (
    <button type="button" className="btn ghost hc-showme" onClick={() => ctl.onStartDemo(demo.id, demo.title)}>
      {I.sparkles} Show me
    </button>
  );
}

function ArticleView({ read, onBack, onOpen, onSupport }: {
  read: ReturnType<typeof useLiveData<ArticleRead>>; onBack: () => void; onOpen: (slug: string) => void; onSupport: () => void;
}) {
  return (
    <article className="hc-article">
      <button type="button" className="hc-back" onClick={onBack}>{I.left} Help &amp; training</button>
      {read.loading ? (
        <div role="status" className="scaf-note">Loading the article…</div>
      ) : read.status === 404 ? (
        <EmptyState icon={I.book} title="This article is not in the Help Center" hint="It may have moved. Search for it, or ask support." />
      ) : read.error || !read.data ? (
        <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load the article" hint="The article could not be read. This is a failed read." />
      ) : (
        <>
          {read.data.collection && <div className="hc-eyebrow">{read.data.collection.title}</div>}
          <h2 className="hc-article-t">{read.data.article.title}</h2>
          <p className="hc-article-s">{read.data.article.summary}</p>
          <ShowMe demoScript={read.data.article.demoScript} />
          <AnaMarkdown text={read.data.article.body} className="hc-body ana-md" />
          {read.data.related.length > 0 && (
            <div className="hc-related">
              <h3 className="hc-coll-t">Related</h3>
              <ul className="hc-links">
                {read.data.related.map((r) => (
                  <li key={r.slug}><button type="button" className="hc-link" onClick={() => onOpen(r.slug)}>{r.title}</button></li>
                ))}
              </ul>
            </div>
          )}
          <p className="hc-still">Still need help? <button type="button" className="hc-link" onClick={onSupport}>Ask support</button></p>
        </>
      )}
    </article>
  );
}

function CourseView({ course, loading, onBack, onOpen }: {
  course: CourseRead | null; loading: boolean; onBack: () => void; onOpen: (slug: string) => void;
}) {
  return (
    <section className="hc-article">
      <button type="button" className="hc-back" onClick={onBack}>{I.left} Help &amp; training</button>
      {loading ? (
        <div role="status" className="scaf-note">Loading the course…</div>
      ) : !course ? (
        <EmptyState icon={I.book} title="This course is not offered to you" hint="It may be written for another client type. The courses for yours are on Help & training." />
      ) : (
        <>
          <div className="hc-eyebrow">Training course</div>
          <h2 className="hc-article-t">{course.title}</h2>
          <p className="hc-article-s">{course.summary}</p>
          <ol className="hc-lessons">
            {course.lessons.map((l, i) => (
              <li key={l.article.slug}>
                <span className="hc-lesson-n" aria-hidden="true">{i + 1}</span>
                <div className="hc-lesson-b">
                  <button type="button" className="hc-link hc-lesson-t" onClick={() => onOpen(l.article.slug)}>{l.article.title}</button>
                  <span className="hc-row-s">{l.article.summary}</span>
                  <ShowMe demoScript={l.demoScript} />
                </div>
              </li>
            ))}
          </ol>
          <p className="hc-none-s">Your progress through a course is not recorded.</p>
        </>
      )}
    </section>
  );
}

/** The organisation's own learning paths and certifications: what this screen showed before Help & training. */
function OrganisationTraining({ paths, certs, onAsk }: {
  paths: ReturnType<typeof useLiveRows<LearningPath>>; certs: ReturnType<typeof useLiveRows<Certification>>; onAsk: (t: string) => void;
}) {
  return (
    <section className="hc-sec" aria-labelledby="hc-org-h">
      <h2 id="hc-org-h" className="hc-h">Your organisation's learning paths and certifications</h2>
      {paths.loading ? (
        <div role="status" className="scaf-note">Loading learning paths…</div>
      ) : paths.error ? (
        <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load learning paths"
          hint="The enablement store didn't respond. This is a failed read, not an empty list." />
      ) : paths.empty ? (
        <p className="hc-none-s">Your organisation has no learning paths of its own.</p>
      ) : (
        <ul className="hc-list">
          {paths.rows.map((p) => (
            <li key={p.id}>
              <button type="button" className="hc-row" onClick={() => onAsk(`Continue the "${p.title}" path`)}>
                <span className="hc-row-t">{p.title}</span>
                <span className="hc-row-s">{p.level} · {p.lessons} lessons · {p.mins} min · {p.done}/{p.lessons} complete</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {certs.loading ? (
        <div role="status" className="scaf-note">Loading certifications…</div>
      ) : certs.error ? (
        <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load certifications"
          hint="The enablement store didn't respond. This is a failed read, not an empty list." />
      ) : certs.empty ? (
        <p className="hc-none-s">Your organisation has no certifications configured.</p>
      ) : (
        <ul className="hc-list">
          {certs.rows.map((c) => (
            <li key={c.id} className="hc-row hc-row-static">
              <span className="hc-row-t">{c.name}</span>
              <span className="hc-row-s">{c.status}{c.when ? ` · ${c.when}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
