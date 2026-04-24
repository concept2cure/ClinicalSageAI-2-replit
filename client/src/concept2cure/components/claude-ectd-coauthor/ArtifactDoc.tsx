/**
 * ArtifactDoc — data-driven render of an artifact section.
 *
 * Mirror of docs/design/concept2cure-design-system/project/ui_kits/
 * ectd_coauthor/ArtifactDoc.jsx. Includes Paragraph (with inline
 * provenance popover + selection capture), TableBlock, and the
 * data-driven section renderer.
 */
import { Fragment } from 'react';

import {
  ARTIFACTS,
  type ArtifactSection,
  type ParagraphBlock,
  type ProvenanceInfo,
  type TableBlockSpec,
  type TableCell,
} from './data';
import styles from './styles.module.css';

/* ─── Confidence gutter color ─── */
function confClass(c: number): 'hi' | 'med' | 'lo' {
  if (c >= 0.9) return 'hi';
  if (c >= 0.8) return 'med';
  return 'lo';
}

/* ─── Provenance popover ─── */
function Provenance({ prov, confidence }: { prov: ProvenanceInfo; confidence: number }) {
  return (
    <span className={styles.prov} role="tooltip">
      <span className={styles.provRow}>
        <span className={styles.provLbl}>Source</span>
        <span className={styles.provVal}>{prov.source}</span>
      </span>
      <span className={styles.provRow}>
        <span className={styles.provLbl}>Model</span>
        <span className={styles.provVal}>{prov.model}</span>
      </span>
      <span className={styles.provRow}>
        <span className={styles.provLbl}>Confidence</span>
        <span className={styles.provVal}>{confidence.toFixed(2)}</span>
      </span>
      <span className={styles.provRow}>
        <span className={styles.provLbl}>Audit ID</span>
        <span className={styles.provVal}>{prov.audit}</span>
      </span>
      <span className={styles.provFoot}>{prov.foot}</span>
    </span>
  );
}

export interface SelectionInfo {
  blockId: string;
  text: string;
  rect: DOMRect;
}

/* ─── Paragraph (supports streaming overlay) ─── */
function Paragraph({
  block,
  streaming,
  streamText,
  onSelect,
}: {
  block: ParagraphBlock;
  streaming: string | null;
  streamText: string;
  onSelect: (sel: SelectionInfo | null) => void;
}) {
  const isStreaming = streaming === block.id;

  const handleMouseUp = () => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (!text || text.length < 4) {
      onSelect(null);
      return;
    }
    const node = sel?.anchorNode;
    if (!node) return;
    const start = node.nodeType === 1 ? (node as Element) : node.parentElement;
    const p = start?.closest('[data-block-id]');
    if (!p || p.getAttribute('data-block-id') !== block.id) return;
    const rect = sel!.getRangeAt(0).getBoundingClientRect();
    onSelect({ blockId: block.id, text, rect });
  };

  return (
    <p
      className={styles.docP}
      data-block-id={block.id}
      data-conf={confClass(block.confidence)}
      onMouseUp={handleMouseUp}
    >
      <span className={styles.docGutter} aria-hidden="true" />
      {isStreaming ? (
        <>
          <span className={styles.docStreamingText}>{streamText}</span>
          <span className={styles.docStreaming} />
        </>
      ) : (
        block.spans.map((s, i) =>
          s.cite ? (
            <a
              key={i}
              className={styles.docCite}
              href="#"
              onClick={e => e.preventDefault()}
            >
              {s.cite}
            </a>
          ) : (
            <Fragment key={i}>{s.t}</Fragment>
          ),
        )
      )}
      <Provenance prov={block.prov} confidence={block.confidence} />
    </p>
  );
}

/* ─── Table ─── */
function TableBlock({ block }: { block: TableBlockSpec }) {
  return (
    <table className={styles.docTable}>
      <thead>
        <tr>
          {block.head.map((h, i) => <th key={i}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {block.rows.map((r, i) => (
          <tr key={i}>
            {r.map((c: TableCell, j) =>
              typeof c === 'object' && 'pill' in c ? (
                <td key={j}>
                  <span className={`${styles.pill} ${styles[c.pill]}`}>{c.text}</span>
                </td>
              ) : (
                <td key={j} className={typeof c === 'string' && /\d/.test(c) ? styles.num : ''}>
                  {c as string}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface ArtifactDocProps {
  path: string;
  streaming: string | null;
  streamText: string;
  onSelect: (sel: SelectionInfo | null) => void;
  /** Override the bundle fixture with live artifact content. */
  artifacts?: Record<string, ArtifactSection>;
}

export function ArtifactDoc({ path, streaming, streamText, onSelect, artifacts }: ArtifactDocProps) {
  const lib = artifacts ?? ARTIFACTS;
  const art = lib[path] ?? lib['2.5'];

  return (
    <div className={`${styles.docInner} ${styles.stagger}`} key={path}>
      <div className={styles.docMasthead}>
        <div className={styles.grid}>
          {art.masthead.map((m, i) => (
            <div key={i}>
              <div className={styles.lbl}>{m.lbl}</div>
              <div className={styles.val}>{m.val}</div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className={styles.lbl}>21 CFR Part 11</div>
          <div className={styles.val}>Signed · {art.lastEditedBy}</div>
        </div>
      </div>

      <div className={styles.docNum}>SECTION {art.path}</div>
      <h1 className={styles.docH1}>{art.title}</h1>

      {art.blocks.map((block, i) => {
        if (block.kind === 'h2') return <h2 key={i} className={styles.docH2}>{block.text}</h2>;
        if (block.kind === 'table') return <TableBlock key={i} block={block} />;
        return (
          <Paragraph
            key={block.id}
            block={block}
            streaming={streaming}
            streamText={streamText}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}

export { confClass };
