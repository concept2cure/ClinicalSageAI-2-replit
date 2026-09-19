/**
 * Data Origins — select text in any document, right-click, see where it came from.
 *
 * Wrap a document surface:
 *
 *   <DataOriginsMenu
 *     documentTable="authoring_sections"
 *     documentId={sectionId}
 *     canonicalText={content}
 *     onNavigateToSource={(id) => openDataRoomSource(id)}
 *   >
 *     <SectionBody />
 *   </DataOriginsMenu>
 *
 * @module client/src/concept2cure/lineage
 */

export { DataOriginsMenu, type DataOriginsMenuProps } from './DataOriginsMenu';
export { DataOriginsPanel, type DataOriginsPanelProps } from './DataOriginsPanel';
export {
  DocumentAttributionBar,
  type DocumentAttributionBarProps,
} from './DocumentAttributionBar';
export {
  fetchDataOrigins,
  downloadDataOriginsPdf,
  type DataOriginsReport,
  type OriginRow,
  type SelectionQuery,
  fetchDocumentAttribution,
  AttributionUnsupportedError,
  type DocumentAttributionSummary,
} from './dataOriginsApi';
export {
  selectionToRange,
  offsetsAreTrustworthy,
  type SelectionRange,
} from './selectionOffsets';
