/**
 * Images for the canonical section editor.
 *
 * Until this module, any stored content containing an <img> was forced into
 * raw-source editing by the fidelity gate — the schema had no image node, so
 * a parse would have silently dropped the figure from the record on the next
 * save. CTD documents are figure-heavy (stability curves, chromatograms,
 * process flow diagrams); "the editor cannot hold a figure" was the largest
 * functional hole in the authoring surface.
 *
 * THE GOVERNED STORAGE CONTRACT this node renders against:
 *   - binaries live in the platform's canonical tenant-scoped upload store
 *     (POST /api/authoring/images → { id, url }; `file_uploads` +
 *     `uploads/org-{id}/` on disk — reused, not duplicated). The section's
 *     HTML stores only the reference (`<img src="/api/authoring/images/<id>">`),
 *     so the hash-chained revision ledger stays lean — a revision references
 *     an image, it does not embed a megabyte of base64 per save;
 *   - nothing in the platform rewrites an upload's bytes, and export resolves
 *     references through the same tenant-scoped loader, so what a revision
 *     shows is what its reference stored. A reference whose bytes are gone
 *     renders as an honest failure here and as a stated
 *     "[Figure not exported]" line in a filed document — never as silence.
 *
 * WHY A CUSTOM NODE VIEW: every API route authenticates by Authorization
 * header only (server/middleware/auth.ts — deliberately: cookie/query-token
 * fallbacks were the IDOR shape earlier PRs closed). A bare <img src> request
 * carries no header, so the browser cannot load these images natively. The
 * node view fetches the binary through the app's authenticated request path
 * and displays an object URL. States are honest: "Loading image…" while in
 * flight, and a failure keeps the reference and says it could not be shown —
 * it never renders a broken glyph or silently drops the node.
 *
 * A figure is a governed reference or an inline PNG, JPEG or GIF, and nothing
 * else (@shared/authoring/figure-refs). Any other src, such as an external
 * address or a data: URI of another type, is not fetched and not displayed:
 * the node view says the figure must be uploaded, and the schema does not
 * parse one in.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { apiRequest } from '@/lib/queryClient';
import { CAPTION_ID_ATTR } from '@shared/authoring/captions';
import {
  isFigureSrc,
  isGovernedImageRef,
  isInlineFigureImage,
} from '@shared/authoring/figure-refs';

/* ── Authenticated display cache ──────────────────────────────── */

/** One fetch per image per page lifetime; object URLs are tiny handles. */
const objectUrlCache = new Map<string, Promise<string>>();

/** Thrown for a src that is not a figure. */
export const NOT_A_FIGURE_REF = 'NOT_A_FIGURE_REF';

/** What the canvas and the read view show in place of a src that is not a
 *  figure. Nothing was fetched, and the export would not file it. */
export const FIGURE_NOT_UPLOADED_NOTE =
  'This figure is not shown: only an image uploaded to the document can be displayed or filed. Upload the image to include it.';

/** Resolve a src to something an <img> element can display: a governed
 *  reference is fetched with the viewer's credentials, an inline PNG, JPEG or
 *  GIF is handed back as it is, and anything else is refused before any
 *  request. Periodic review 2026-09-28, editor family, SEC-B-1 and SEC-B-2:
 *  the governed check was a prefix test that dot segments walked out of to any
 *  API route, and every other src was handed to the browser to fetch. */
export function resolveImageSrc(src: string): Promise<string> {
  if (isInlineFigureImage(src)) return Promise.resolve(src);
  if (!isGovernedImageRef(src)) return Promise.reject(new Error(NOT_A_FIGURE_REF));
  let hit = objectUrlCache.get(src);
  if (!hit) {
    hit = (async () => {
      const res = await apiRequest('GET', src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    })();
    // A failed fetch must not poison the cache — the next render retries.
    hit.catch(() => objectUrlCache.delete(src));
    objectUrlCache.set(src, hit);
  }
  return hit;
}

/* ── The node ─────────────────────────────────────────────────── */

export interface AuthoringImageAttrs {
  src: string;
  /** The figure's caption. It is the alt text because that is the one string
   *  both export renderers already print in the caption position; a second
   *  field would be two stores for one sentence. */
  alt?: string | null;
  /** The figure's identity, so a cross-reference can point at it. Never its
   *  number — "Figure 3" is a rendering of where the figure currently sits.
   *  See @shared/authoring/captions. */
  captionId?: string | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    authoringImage: {
      /** Insert a stored image at the caret (block-level figure). */
      insertAuthoringImage: (attrs: AuthoringImageAttrs) => ReturnType;
    };
  }
}

export const AuthoringImage = Node.create({
  // The standard TipTap node name, so generic HTML → schema parsing and any
  // future interop treat it as the image node it is.
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('alt'),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.alt ? { alt: String(attrs.alt) } : {},
      },
      /* The figure's identity as a numbered object. Present only so a
         cross-reference can point at this figure; never printed, and never the
         number. A figure without one still numbers — the ordinal is positional
         — it simply cannot be referenced. */
      captionId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute(CAPTION_ID_ATTR),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.captionId ? { [CAPTION_ID_ATTR]: String(attrs.captionId) } : {},
      },
    };
  },

  parseHTML() {
    // Only a figure parses in, so a paste, a load or an inserted draft cannot
    // bring in an image the canvas would fetch from elsewhere (periodic review
    // 2026-09-28, editor family, SEC-B-1, SEC-B-2). Stored content that holds
    // one fails the fidelity gate on its image count and opens in source mode,
    // where nothing is fetched.
    return [
      {
        tag: 'img[src]',
        getAttrs: (el: HTMLElement) => (isFigureSrc(el.getAttribute('src')) ? null : false),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // Serialized form is the plain reference — this is what the revision
    // ledger stores and what the export assembler resolves server-side.
    return ['img', mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      insertAuthoringImage:
        (attrs: AuthoringImageAttrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('figure');
      dom.className = 'rse-img';
      const img = document.createElement('img');
      img.alt = node.attrs.alt ?? '';
      img.draggable = false;
      const status = document.createElement('span');
      status.className = 'rse-img-status';
      status.textContent = 'Loading image…';
      dom.append(img, status);

      let alive = true;
      const src = String(node.attrs.src ?? '');
      if (!src) {
        status.textContent = 'Image reference is empty.';
        dom.dataset.error = '1';
      } else {
        resolveImageSrc(src)
          .then((url) => {
            if (!alive) return;
            img.src = url;
            img.onload = () => status.remove();
            img.onerror = () => {
              status.textContent =
                'The image could not be displayed. Its reference is kept in the section.';
              dom.dataset.error = '1';
            };
          })
          .catch((e: unknown) => {
            if (!alive) return;
            // A node can still arrive without a parse (JSON, live sync). One
            // that is not a figure was never requested; say what to do.
            status.textContent =
              e instanceof Error && e.message === NOT_A_FIGURE_REF
                ? FIGURE_NOT_UPLOADED_NOTE
                : 'The image could not be loaded — you may not have access, or the store is unreachable. Its reference is kept in the section.';
            dom.dataset.error = '1';
          });
      }

      return {
        dom,
        /* A src change is a different image — rebuild the view. So is an alt
           change: alt is the figure's caption AND what a screen reader
           announces, and a stale one would describe the previous words. */
        update: (updated) =>
          updated.type.name === 'image' &&
          updated.attrs.src === src &&
          (updated.attrs.alt ?? '') === (node.attrs.alt ?? ''),
        destroy: () => {
          alive = false;
        },
      };
    };
  },
});
