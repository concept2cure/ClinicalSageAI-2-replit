import React, { useState, useEffect, useCallback, useRef } from 'react';
import useWindowSize from '../../hooks/useWindowSize';
import AnnotationPanel from './AnnotationPanel';
import { fetchCTDSections, updateSectionPosition as saveSectionPosition } from '../../api/coauthor';

/**
 * Non-Konva version: Interactive canvas for visualizing document sections
 * using standard React components until we resolve the react-konva dependency
 */
export default function CanvasWorkbench() {
  const [sections, setSections] = useState([]);
  const [selected, setSelected] = useState(null);
  const [rulerX, setRulerX] = useState(100);
  const { width, height } = useWindowSize();
  const canvasRef = useRef(null);
  const dragRef = useRef(null);

  // Load sections on mount
  useEffect(() => {
    fetchCTDSections()
      .then(data => setSections(data))
      .catch(console.error);
  }, []);

  // Compute predicted date from timeline ruler position
  const predictDate = x => {
    // Map x position to days; customize scale
    const days = Math.round((x / (width || 1200)) * 365);
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString();
  };

  // Update section position
  const updateSectionPosition = (id, newX, newY) => {
    setSections(secs =>
      secs.map(sec => (sec.sectionId === id || sec.id === id ? { ...sec, x: newX, y: newY } : sec))
    );

    saveSectionPosition(id, newX, newY).catch(console.error);
  };

  // Handle drag start
  const handleDragStart = (e, id) => {
    dragRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      section: sections.find(s => s.sectionId === id || s.id === id),
    };
  };

  // Handle drag end
  const handleDragEnd = () => {
    dragRef.current = null;
  };

  // Handle mouse move for dragging
  const handleMouseMove = e => {
    if (!dragRef.current) return;

    const deltaX = e.clientX - dragRef.current.startX;
    const deltaY = e.clientY - dragRef.current.startY;

    const newX = dragRef.current.section.x + deltaX;
    const newY = dragRef.current.section.y + deltaY;

    updateSectionPosition(dragRef.current.id, newX, newY);

    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
  };

  // Get status color
  const getStatusColor = status => {
    switch (status) {
      case 'complete':
        return '#daf5e8';
      case 'critical':
        return '#fde2e2';
      default:
        return '#fff4ce';
    }
  };

  return (
    <>
      <div
        ref={canvasRef}
        className="canvas-workbench"
        style={{
          position: 'relative',
          width: '100%',
          height: (height || 800) - 150,
          background: '#f7f8fa',
          overflow: 'hidden',
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
      >
        {/* Connections (simple div-based arrows) */}
        {sections.flatMap(sec =>
          (Array.isArray(sec.connections) ? sec.connections : []).map(toId => {
            const from = sections.find(s => s.sectionId === sec.sectionId || s.id === sec.id);
            const to = sections.find(s => s.sectionId === toId || s.id === toId);

            if (!from || !to) return null;

            // Calculate distance and angle for the line
            const dx = to.x - from.x - 100;
            const dy = to.y - from.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

            return (
              <div
                key={`${sec.sectionId || sec.id}-${toId}`}
                style={{
                  position: 'absolute',
                  top: from.y + 25,
                  left: from.x + 100,
                  width: length,
                  height: 2,
                  background: '#999',
                  transformOrigin: 'left center',
                  transform: `rotate(${angle}deg)`,
                  zIndex: 1,
                }}
              />
            );
          })
        )}

        {/* Nodes */}
        {sections.map(sec => (
          <div
            key={sec.sectionId || sec.id}
            style={{
              position: 'absolute',
              top: sec.y,
              left: sec.x,
              width: 120,
              height: 50,
              backgroundColor: getStatusColor(sec.status),
              border: '1px solid #666',
              borderRadius: 4,
              cursor: 'move',
              userSelect: 'none',
              zIndex: 2,
            }}
            onMouseDown={e => handleDragStart(e, sec.sectionId || sec.id)}
            onClick={() => setSelected(sec)}
          >
            <div style={{ padding: 10, fontSize: 12 }}>{sec.title}</div>
          </div>
        ))}

        {/* Timeline ruler */}
        <div
          style={{
            position: 'absolute',
            bottom: 50,
            left: 0,
            width: '100%',
            height: 40,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: rulerX,
              width: 2,
              height: 30,
              background: '#ff8c00',
              cursor: 'ew-resize',
            }}
            onMouseDown={e => {
              const initialX = e.clientX;
              const initialRulerX = rulerX;

              const handleMouseMove = e => {
                const delta = e.clientX - initialX;
                setRulerX(initialRulerX + delta);
              };

              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };

              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: rulerX + 10,
              top: 15,
              fontSize: 12,
              color: '#555',
            }}
          >
            Est. Filing Date: {predictDate(rulerX)}
          </div>
          <div
            style={{
              position: 'absolute',
              left: 0,
              width: '100%',
              height: 1,
              background: '#888',
              top: 15,
            }}
          />
        </div>
      </div>

      {/* Annotation Sidebar */}
      <AnnotationPanel section={selected} onClose={() => setSelected(null)} />
    </>
  );
}
