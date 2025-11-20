import { createPortal } from 'react-dom';
import { ReactNode } from 'react';

const modalRoot = typeof document !== 'undefined' ? document.getElementById('modal-root') : null;

interface ModalPortalProps {
  children: ReactNode;
}

export default function ModalPortal({ children }: ModalPortalProps) {
  if (!modalRoot) return null;
  return createPortal(children, modalRoot);
}
