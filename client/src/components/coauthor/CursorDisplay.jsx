import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const CursorDisplay = ({ cursors = [], selections = [], containerRef }) => {
  const [cursorPositions, setCursorPositions] = useState({});
  const [selectionRanges, setSelectionRanges] = useState({});

  useEffect(() => {
    // Update cursor positions
    const newPositions = {};
    cursors.forEach(cursor => {
      if (cursor.x !== undefined && cursor.y !== undefined) {
        newPositions[cursor.userId] = cursor;
      }
    });
    setCursorPositions(newPositions);
  }, [cursors]);

  useEffect(() => {
    // Update selection ranges
    const newRanges = {};
    selections.forEach(selection => {
      if (selection.start !== undefined && selection.end !== undefined) {
        newRanges[selection.userId] = selection;
      }
    });
    setSelectionRanges(newRanges);
  }, [selections]);

  // Helper to get container offset
  const getContainerOffset = () => {
    if (!containerRef?.current) return { top: 0, left: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return { top: rect.top, left: rect.left };
  };

  return (
    <>
      {/* Render Selections */}
      <AnimatePresence>
        {Object.entries(selectionRanges).map(([userId, selection]) => (
          <SelectionHighlight
            key={`selection-${userId}`}
            selection={selection}
            containerRef={containerRef}
          />
        ))}
      </AnimatePresence>

      {/* Render Cursors */}
      <AnimatePresence>
        {Object.entries(cursorPositions).map(([userId, cursor]) => (
          <motion.div
            key={`cursor-${userId}`}
            className="pointer-events-none fixed z-50"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ 
              opacity: 1, 
              scale: 1,
              x: cursor.x,
              y: cursor.y
            }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ 
              type: "spring", 
              stiffness: 500, 
              damping: 30 
            }}
          >
            {/* Cursor */}
            <div className="relative">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                className="transform -translate-x-1 -translate-y-1"
              >
                <path
                  d="M5.5 3.5L20.5 12L12 12L12 20.5L5.5 3.5Z"
                  fill={cursor.color || '#4A90E2'}
                  stroke="white"
                  strokeWidth="1"
                />
              </svg>
              
              {/* User Label */}
              <div 
                className="absolute top-4 left-4 px-2 py-1 rounded text-white text-xs font-medium whitespace-nowrap shadow-lg"
                style={{ backgroundColor: cursor.color || '#4A90E2' }}
              >
                {cursor.userName}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </>
  );
};

// Component for rendering text selections
const SelectionHighlight = ({ selection, containerRef }) => {
  const [highlights, setHighlights] = useState([]);

  useEffect(() => {
    if (!containerRef?.current || !selection) return;

    // This is a simplified version - in a real implementation,
    // you'd need to calculate the actual text ranges and positions
    // based on the document structure and the selection offsets
    
    const calculateHighlights = () => {
      // Get all text nodes in the container
      const walker = document.createTreeWalker(
        containerRef.current,
        NodeFilter.SHOW_TEXT,
        null
      );

      const textNodes = [];
      let node;
      let currentOffset = 0;

      while ((node = walker.nextNode())) {
        const length = node.textContent.length;
        textNodes.push({
          node,
          start: currentOffset,
          end: currentOffset + length
        });
        currentOffset += length;
      }

      // Find nodes that overlap with the selection
      const overlappingNodes = textNodes.filter(tn => 
        (tn.start <= selection.start && tn.end > selection.start) ||
        (tn.start < selection.end && tn.end >= selection.end) ||
        (tn.start >= selection.start && tn.end <= selection.end)
      );

      // Calculate highlight rectangles
      const rects = [];
      overlappingNodes.forEach(tn => {
        const range = document.createRange();
        const startOffset = Math.max(0, selection.start - tn.start);
        const endOffset = Math.min(tn.node.textContent.length, selection.end - tn.start);
        
        if (startOffset < endOffset) {
          try {
            range.setStart(tn.node, startOffset);
            range.setEnd(tn.node, endOffset);
            
            const clientRects = range.getClientRects();
            for (let rect of clientRects) {
              rects.push({
                top: rect.top + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width,
                height: rect.height
              });
            }
          } catch (e) {
            // Handle range errors gracefully
            console.debug('Selection range error:', e);
          }
        }
      });

      setHighlights(rects);
    };

    calculateHighlights();

    // Recalculate on scroll or resize
    const handleUpdate = () => calculateHighlights();
    window.addEventListener('scroll', handleUpdate);
    window.addEventListener('resize', handleUpdate);
    
    return () => {
      window.removeEventListener('scroll', handleUpdate);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [selection, containerRef]);

  return (
    <>
      {highlights.map((rect, index) => (
        <motion.div
          key={`highlight-${selection.userId}-${index}`}
          className="pointer-events-none fixed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          exit={{ opacity: 0 }}
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            backgroundColor: selection.color || '#4A90E2',
            mixBlendMode: 'multiply'
          }}
        />
      ))}
    </>
  );
};

// Hook to track and send cursor position
export const useCollaborativeCursor = (collaborationService, containerRef) => {
  useEffect(() => {
    if (!collaborationService || !containerRef?.current) return;

    const handleMouseMove = (e) => {
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;
      
      // Only send if within the container
      if (
        x >= rect.left && 
        x <= rect.right && 
        y >= rect.top && 
        y <= rect.bottom
      ) {
        collaborationService.sendCursorPosition({
          x: x,
          y: y,
          section: containerRef.current.dataset.section || 'main'
        });
      }
    };

    const handleMouseLeave = () => {
      // Hide cursor when leaving the container
      collaborationService.sendCursorPosition({
        x: -100,
        y: -100
      });
    };

    containerRef.current.addEventListener('mousemove', handleMouseMove);
    containerRef.current.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      if (containerRef.current) {
        containerRef.current.removeEventListener('mousemove', handleMouseMove);
        containerRef.current.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [collaborationService, containerRef]);
};

// Hook to track and send text selection
export const useCollaborativeSelection = (collaborationService, containerRef) => {
  useEffect(() => {
    if (!collaborationService || !containerRef?.current) return;

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      
      if (selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        
        // Check if selection is within our container
        if (containerRef.current.contains(range.commonAncestorContainer)) {
          // Calculate text offsets
          const startOffset = getTextOffset(containerRef.current, range.startContainer, range.startOffset);
          const endOffset = getTextOffset(containerRef.current, range.endContainer, range.endOffset);
          
          collaborationService.sendSelection({
            start: startOffset,
            end: endOffset,
            section: containerRef.current.dataset.section || 'main'
          });
        }
      } else {
        // Clear selection
        collaborationService.sendSelection({
          start: -1,
          end: -1
        });
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [collaborationService, containerRef]);
};

// Helper function to calculate text offset
function getTextOffset(container, node, offset) {
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null
  );

  let currentNode;
  let totalOffset = 0;

  while ((currentNode = walker.nextNode())) {
    if (currentNode === node) {
      return totalOffset + offset;
    }
    totalOffset += currentNode.textContent.length;
  }

  return totalOffset;
}

export default CursorDisplay;