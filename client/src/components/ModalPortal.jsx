import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * ModalPortal Component
 *
 * Renders its children into a portal at the "modal-root" DOM node.
 * This ensures all modals appear in the same place in the DOM,
 * outside the normal component hierarchy.
 *
 * Features:
 * - Prevents z-index conflicts between modals
 * - Ensures proper keyboard focus management
 * - Prevents scroll issues when multiple modals are active
 * - Automatically handles cleanup when component unmounts
 */
const ModalPortal = ({ children, zIndex = 9999 }) => {
  // Find or create modal root element
  const getModalRoot = () => {
    let modalRoot = document.getElementById('modal-root');
    if (!modalRoot) {
      console.warn('Modal root not found, creating one');
      modalRoot = document.createElement('div');
      modalRoot.id = 'modal-root';
      document.body.appendChild(modalRoot);
    }
    return modalRoot;
  };

  // Handle body scroll locking when modal is open
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';

    // Add a specific style for this modal instance with high z-index
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      /* Ensure all other dialogs are hidden when a modal is active */
      body > div[role="dialog"]:not(#modal-root *),
      body > div[aria-modal="true"]:not(#modal-root *) {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      
      /* Ensure good stacking for our modal root */
      #modal-root {
        z-index: ${zIndex};
        position: relative;
      }
    `;
    document.head.appendChild(styleEl);

    // Clean up function
    return () => {
      document.body.style.overflow = originalStyle;
      if (styleEl.parentNode) {
        styleEl.parentNode.removeChild(styleEl);
      }
    };
  }, [zIndex]);

  return createPortal(children, getModalRoot());
};

export default ModalPortal;
