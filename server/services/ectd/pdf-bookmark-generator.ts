/**
 * PDF outline (bookmark) generator for eCTD leaves — architecture spec §5.2.
 *
 * Reviewers navigate large leaves (e.g. a Module 2.5 Clinical Overview) by the
 * PDF outline pane. The eCTD PDF spec requires bookmarks for documents over a
 * handful of pages. pdf-lib has NO high-level outline API, so this module builds
 * the `/Outlines` dictionary by hand using the low-level object model
 * (`context.obj` / `context.register` / `PDFRef` / `PDFDict` / `PDFName` /
 * `PDFNumber` / `PDFArray`) and sets it on the document catalog.
 *
 * It also exposes `buildOutlineTree`, a pure helper that nests a flat list of
 * dotted section codes (e.g. '2.5', '2.5.1', '2.7') into a parent/child tree —
 * useful when the caller has a flat section index from the granule.
 *
 * @module server/services/ectd/pdf-bookmark-generator
 */

import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFArray,
  PDFRef,
  PDFDict,
  PDFString,
  PDFNull,
} from 'pdf-lib';

export interface OutlineNode {
  /** Bookmark label shown in the outline pane. */
  title: string;
  /** eCTD section code (e.g. '2.5.1'); drives nesting in buildOutlineTree. */
  sectionCode: string;
  /** Zero-based page index the bookmark jumps to. */
  pageIndex: number;
  children?: OutlineNode[];
}

export interface FlatSection {
  sectionCode: string;
  title: string;
  pageIndex: number;
}

/**
 * Nest a flat list of sections into an OutlineNode tree by dotted sectionCode.
 *
 * '2.5' is the parent of '2.5.1'; '2.7' is a sibling of '2.5'. A child whose
 * direct parent code is not present in the list is attached to the nearest
 * present ancestor; if no ancestor is present it becomes a root. Output order
 * follows the input order (callers usually pre-sort by section code).
 */
export function buildOutlineTree(flatSections: FlatSection[]): OutlineNode[] {
  const nodes = new Map<string, OutlineNode>();
  // Preserve input order while allowing ancestor lookup by code.
  const ordered: { code: string; node: OutlineNode }[] = [];

  for (const s of flatSections) {
    const node: OutlineNode = {
      title: s.title,
      sectionCode: s.sectionCode,
      pageIndex: s.pageIndex,
      children: [],
    };
    nodes.set(s.sectionCode, node);
    ordered.push({ code: s.sectionCode, node });
  }

  const roots: OutlineNode[] = [];

  /** Walk up the dotted code looking for the nearest present ancestor node. */
  const findParent = (code: string): OutlineNode | null => {
    const parts = code.split('.');
    for (let cut = parts.length - 1; cut >= 1; cut--) {
      const ancestorCode = parts.slice(0, cut).join('.');
      const ancestor = nodes.get(ancestorCode);
      if (ancestor) return ancestor;
    }
    return null;
  };

  for (const { code, node } of ordered) {
    const parent = findParent(code);
    if (parent) {
      (parent.children ??= []).push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/** Count the visible (sub)tree size for the /Count entry on an outline item. */
function countDescendants(node: OutlineNode): number {
  let n = 0;
  for (const child of node.children ?? []) {
    n += 1 + countDescendants(child);
  }
  return n;
}

/**
 * Add a real PDF outline (bookmarks) tree to the given PDF bytes.
 *
 * Builds the `/Outlines` root and one `/Outline` item per node with the proper
 * doubly-linked sibling chain (`/Next` `/Prev`), `/First` `/Last`, `/Parent`,
 * `/Count`, and a `/Dest` `[page /XYZ left top zoom]` array pointing at the
 * node's page. Sets the catalog's `/Outlines` entry. Returns new PDF bytes.
 *
 * Best-effort: nodes whose `pageIndex` is out of range are clamped to a valid
 * page so the destination is always resolvable.
 */
export async function addBookmarks(
  pdfBytes: Uint8Array,
  nodes: OutlineNode[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const context = doc.context;
  const pages = doc.getPages();

  if (pages.length === 0 || nodes.length === 0) {
    // Nothing to anchor bookmarks to; return the document unchanged.
    return await doc.save({ useObjectStreams: false });
  }

  const pageRefForIndex = (index: number): PDFRef => {
    const clamped = Math.max(0, Math.min(index | 0, pages.length - 1));
    return pages[clamped].ref;
  };

  // Reserve a ref for the /Outlines root so children can point /Parent at it.
  const outlinesRootRef = context.nextRef();

  /**
   * Register one outline item subtree and return its ref. Wires the
   * doubly-linked sibling chain among `siblings` and recurses into children.
   */
  const buildItems = (siblings: OutlineNode[], parentRef: PDFRef): {
    first: PDFRef;
    last: PDFRef;
    refs: PDFRef[];
  } => {
    const refs = siblings.map(() => context.nextRef());

    siblings.forEach((node, i) => {
      const dest = PDFArray.withContext(context);
      dest.push(pageRefForIndex(node.pageIndex));
      dest.push(PDFName.of('XYZ'));
      dest.push(PDFNull); // left = null (retain horizontal position)
      dest.push(PDFNull); // top = null (retain vertical position)
      dest.push(PDFNumber.of(0)); // zoom = inherit

      const dict = new Map<PDFName, any>();
      dict.set(PDFName.of('Title'), PDFString.of(node.title));
      dict.set(PDFName.of('Parent'), parentRef);
      dict.set(PDFName.of('Dest'), dest);

      if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1]);
      if (i < refs.length - 1) dict.set(PDFName.of('Next'), refs[i + 1]);

      const children = node.children ?? [];
      if (children.length > 0) {
        const sub = buildItems(children, refs[i]);
        dict.set(PDFName.of('First'), sub.first);
        dict.set(PDFName.of('Last'), sub.last);
        // Negative count => closed (collapsed) by default; magnitude = descendants.
        dict.set(PDFName.of('Count'), PDFNumber.of(-countDescendants(node)));
      }

      context.assign(refs[i], PDFDict.fromMapWithContext(dict, context));
    });

    return { first: refs[0], last: refs[refs.length - 1], refs };
  };

  const top = buildItems(nodes, outlinesRootRef);

  // Build the /Outlines root dictionary.
  const totalVisible = nodes.reduce((acc, n) => acc + 1 + countDescendants(n), 0);
  const rootMap = new Map<PDFName, any>();
  rootMap.set(PDFName.of('Type'), PDFName.of('Outlines'));
  rootMap.set(PDFName.of('First'), top.first);
  rootMap.set(PDFName.of('Last'), top.last);
  rootMap.set(PDFName.of('Count'), PDFNumber.of(totalVisible));
  context.assign(outlinesRootRef, PDFDict.fromMapWithContext(rootMap, context));

  // Point the catalog at the outline tree.
  doc.catalog.set(PDFName.of('Outlines'), outlinesRootRef);

  return await doc.save({ useObjectStreams: false });
}

/**
 * Add internal "table of contents" Link annotations pointing at each section's
 * page. This walks the supplied nodes and attaches a `/Link` annotation with a
 * GoTo destination on the page of every node that carries a `rect` hint.
 *
 * Best-effort: pdf-lib does not model link rectangles for arbitrary text runs,
 * so callers must supply a clickable rectangle per node (in PDF user-space
 * points on `node.pageIndex`). Nodes without a `rect` are skipped. If you only
 * have section codes and no geometry, prefer `addBookmarks` (the outline pane)
 * which needs no rectangles.
 *
 * TODO: derive link rectangles automatically from a rendered TOC layout (the
 * leaf-pdf-renderer would need to emit per-line bounding boxes). Until then this
 * is a documented, opt-in stub driven by explicit rectangles.
 */
export interface TocLinkNode extends OutlineNode {
  /** Clickable rectangle [x1,y1,x2,y2] in points on the *source* TOC page. */
  rect?: [number, number, number, number];
  /** Zero-based page index the TOC entry text sits on (the source page). */
  sourcePageIndex?: number;
}

export async function addTocLinks(
  pdfBytes: Uint8Array,
  nodes: TocLinkNode[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const context = doc.context;
  const pages = doc.getPages();
  if (pages.length === 0) {
    return await doc.save({ useObjectStreams: false });
  }

  const pageRefForIndex = (index: number): PDFRef => {
    const clamped = Math.max(0, Math.min(index | 0, pages.length - 1));
    return pages[clamped].ref;
  };

  // Group annotations by their source page so we extend each page's /Annots once.
  const bySourcePage = new Map<number, TocLinkNode[]>();
  const flatten = (list: TocLinkNode[]) => {
    for (const n of list) {
      if (n.rect) {
        const src = n.sourcePageIndex ?? 0;
        let bucket = bySourcePage.get(src);
        if (!bucket) {
          bucket = [];
          bySourcePage.set(src, bucket);
        }
        bucket.push(n);
      }
      if (n.children) flatten(n.children as TocLinkNode[]);
    }
  };
  flatten(nodes);

  for (const [srcIdx, links] of bySourcePage) {
    const clampedSrc = Math.max(0, Math.min(srcIdx | 0, pages.length - 1));
    const page = pages[clampedSrc];

    const annotRefs: PDFRef[] = links.map((node) => {
      const dest = PDFArray.withContext(context);
      dest.push(pageRefForIndex(node.pageIndex));
      dest.push(PDFName.of('XYZ'));
      dest.push(PDFNull);
      dest.push(PDFNull);
      dest.push(PDFNumber.of(0));

      const rectArr = PDFArray.withContext(context);
      for (const v of node.rect!) rectArr.push(PDFNumber.of(v));

      const border = PDFArray.withContext(context);
      border.push(PDFNumber.of(0));
      border.push(PDFNumber.of(0));
      border.push(PDFNumber.of(0)); // invisible border

      const map = new Map<PDFName, any>();
      map.set(PDFName.of('Type'), PDFName.of('Annot'));
      map.set(PDFName.of('Subtype'), PDFName.of('Link'));
      map.set(PDFName.of('Rect'), rectArr);
      map.set(PDFName.of('Border'), border);
      map.set(PDFName.of('Dest'), dest);
      return context.register(PDFDict.fromMapWithContext(map, context));
    });

    // Merge into the page's existing /Annots array (or create one).
    const existing = page.node.lookup(PDFName.of('Annots'));
    if (existing instanceof PDFArray) {
      for (const ref of annotRefs) existing.push(ref);
    } else {
      const annots = PDFArray.withContext(context);
      for (const ref of annotRefs) annots.push(ref);
      page.node.set(PDFName.of('Annots'), annots);
    }
  }

  return await doc.save({ useObjectStreams: false });
}

export default { buildOutlineTree, addBookmarks, addTocLinks };
