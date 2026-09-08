/**
 * Read-only renderer for authored section HTML — the display half of the
 * governed figure contract.
 *
 * The editor's node view (imageNode.ts) fetches `/api/authoring/images/<id>`
 * references through the app's authenticated request path because every API
 * route authenticates by Authorization header only — a bare <img src> cannot
 * load them. Read-only views (the whole-document view, batch-draft cards)
 * render stored HTML via dangerouslySetInnerHTML and had no such path, so a
 * figure the author placed and saved was SILENTLY ABSENT from the assembled
 * document — the reader saw a different document from the one on the canvas.
 *
 * This component closes that seam with the same two pieces the editor uses:
 *  - `sanitizeAuthoringHtml` (the one audited sanitiser module) keeps figure
 *    markup and rewrites API references to `data-authsrc` so injection never
 *    fires an unauthenticated request;
 *  - `resolveImageSrc` (the editor's own resolver, shared not copied) turns
 *    each reference into an object URL through the authenticated fetch.
 *
 * MECHANISM — resolve into the STRING, then render. The first version set
 * `src` on the injected DOM after the fact; React re-injects
 * dangerouslySetInnerHTML content on remount (StrictMode does this by design),
 * which silently discarded the mutated element and left a raw reference on
 * screen. Resolution therefore happens on a detached template of the
 * sanitized HTML, and the RESOLVED string is what React renders — there is no
 * post-injection mutation to lose.
 *
 * States are honest: until resolution lands, a reference renders src-less
 * (styled as a quiet placeholder via `img[data-authsrc]:not([src])`); a
 * failed resolve REPLACES the element with a stated line — never a broken
 * glyph, never silence.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AUTH_IMG_ATTR,
  sanitizeAuthoringHtml,
} from '../../components/ana/renderSafeMarkdown';
import { NOT_A_FIGURE_REF, resolveImageSrc } from './imageNode';

export function AuthoredHtml({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const clean = useMemo(() => sanitizeAuthoringHtml(html), [html]);
  const [display, setDisplay] = useState(clean);

  useEffect(() => {
    let alive = true;
    // Placeholders first — the content itself must never wait on image bytes.
    setDisplay(clean);
    if (!clean.includes(AUTH_IMG_ATTR)) return;
    void (async () => {
      // `clean` is already sanitized; the template exists only to locate and
      // rewrite the references before the string reaches React.
      const tpl = document.createElement('template');
      tpl.innerHTML = clean;
      const refs = Array.from(
        tpl.content.querySelectorAll<HTMLImageElement>(`img[${AUTH_IMG_ATTR}]`),
      );
      if (refs.length === 0) return;
      await Promise.all(
        refs.map(async (img) => {
          const refSrc = img.getAttribute(AUTH_IMG_ATTR);
          if (!refSrc) return;
          try {
            const url = await resolveImageSrc(refSrc);
            img.setAttribute('src', url);
          } catch (e) {
            // resolveImageSrc throws `HTTP <status>` on a refused fetch and
            // NOT_A_FIGURE_REF for an API path outside the governed images
            // route — say the actual cause instead of guessing.
            const status = e instanceof Error ? /^HTTP (\d+)/.exec(e.message)?.[1] : null;
            const reason =
              e instanceof Error && e.message === NOT_A_FIGURE_REF
                ? 'its reference points outside the image store'
                : status === '401' || status === '403'
                  ? 'you don’t have access to it'
                  : status
                    ? 'the image store returned an error'
                    : 'the image store is unreachable';
            const note = document.createElement('p');
            note.className = 'ed-figure-missing';
            note.textContent = `Couldn’t load this figure — ${reason}. Its reference is kept in the section.`;
            img.replaceWith(note);
          }
        }),
      );
      if (alive) setDisplay(tpl.innerHTML);
    })();
    return () => {
      alive = false;
    };
  }, [clean]);

  return (
    <div className={className} dangerouslySetInnerHTML={{ __html: display }} />
  );
}
