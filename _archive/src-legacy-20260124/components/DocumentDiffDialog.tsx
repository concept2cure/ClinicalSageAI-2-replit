import React from 'react';
import ModalPortal from './ModalPortal';
import DocumentDiffViewer from './DocumentDiffViewer';

interface DocumentDiffDialogProps {
  documentId: number;
  oldVersionId?: number;
  newVersionId?: number;
  isOpen: boolean;
  onClose: () => void;
  documentTitle?: string;
}

export default function DocumentDiffDialog({
  documentId,
  oldVersionId,
  newVersionId,
  isOpen,
  onClose,
  documentTitle,
}: DocumentDiffDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <ModalPortal>
      <div
        className="modal document-diff-dialog"
        style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">
                Document Comparison{' '}
                {documentTitle && <span className="text-muted">- {documentTitle}</span>}
              </h5>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                onClick={onClose}
              ></button>
            </div>
            <div className="modal-body p-0">
              <DocumentDiffViewer
                documentId={documentId}
                oldVersionId={oldVersionId}
                newVersionId={newVersionId}
                onClose={onClose}
              />
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
