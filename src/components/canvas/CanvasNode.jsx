import React from 'react';

/**
 * CanvasNode component - represents a single node on the Canvas Workbench
 * Handles dragging, selection, and styling based on status
 */
const CanvasNode = ({
  id,
  title,
  status,
  x,
  y,
  isSelected,
  onSelect,
  onDragStart,
  onDrag,
  onDragEnd,
}) => {
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 });

  // Handle mouse down for dragging
  const handleMouseDown = e => {
    e.stopPropagation();

    // Calculate offset from mouse position to node position to maintain during drag
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    setDragOffset({ x: offsetX, y: offsetY });
    setIsDragging(true);

    if (onDragStart) {
      onDragStart(id, x, y);
    }

    // Select the node when clicked
    if (onSelect && !isSelected) {
      onSelect(id);
    }
  };

  // Handle mouse move during drag
  const handleMouseMove = e => {
    if (!isDragging) return;

    e.preventDefault();

    // Calculate new position considering the initial offset
    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;

    if (onDrag) {
      onDrag(id, newX, newY);
    }
  };

  // Handle mouse up to end dragging
  const handleMouseUp = () => {
    if (!isDragging) return;

    setIsDragging(false);

    if (onDragEnd) {
      onDragEnd(id, x, y);
    }
  };

  // Register global event listeners for dragging
  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, x, y]);

  return (
    <div
      className={`canvas-node ${status} ${isSelected ? 'selected' : ''}`}
      style={{
        transform: `translate(${x}px, ${y}px) scale(${isSelected ? 1.03 : 1})`,
        zIndex: isSelected ? 10 : 1,
        transition: isDragging ? 'none' : 'transform 0.2s ease',
      }}
      onMouseDown={handleMouseDown}
      aria-label={`${title} section - ${status} status`}
    >
      <div className="node-badge">{id}</div>
      <div className="node-content">{title}</div>
    </div>
  );
};

export default CanvasNode;
