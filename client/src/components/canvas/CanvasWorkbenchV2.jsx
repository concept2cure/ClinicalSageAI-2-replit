import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, RefreshCw, Download } from 'lucide-react';
import CanvasNode from './CanvasNode';
import NodeDetailPanel from './NodeDetailPanel';
import CanvasSidePanel from './CanvasSidePanel';
import useWindowSize from '../../hooks/useWindowSize';
import { fetchCTDSections, fetchRiskConnections, updateSectionPosition } from '../../api/coauthor';
import './CanvasWorkbenchV2.css';

/**
 * Enhanced Canvas Workbench for Concept2Cure
 * Provides a visual workspace for viewing and arranging CTD sections,
 * with interactive nodes, connection lines, and detailed section information
 */
const CanvasWorkbenchV2 = () => {
  const [sections, setSections] = useState([]);
  const [riskConnections, setRiskConnections] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [zoomLevel, setZoomLevel] = useState(1);

  const canvasRef = useRef(null);
  const { width, height } = useWindowSize();

  // Load sections and risk connections when component mounts
  useEffect(() => {
    const loadData = async () => {
      try {
        const sectionsData = await fetchCTDSections();
        setSections(sectionsData);

        const risksData = await fetchRiskConnections();
        setRiskConnections(risksData);
      } catch (error) {
        console.error('Error loading canvas data:', error);
      }
    };

    loadData();
  }, []);

  // Find a section by its ID
  const findSection = useCallback(
    id => {
      return sections.find(s => s.id === id);
    },
    [sections]
  );

  // Handle section selection
  const handleSelectSection = useCallback(
    id => {
      const section = findSection(id);
      setSelectedSection(section);
    },
    [findSection]
  );

  // Close the detail panel
  const handleCloseDetailPanel = useCallback(() => {
    setSelectedSection(null);
  }, []);

  // Handle section drag
  const handleSectionDrag = useCallback((id, x, y) => {
    setSections(prevSections =>
      prevSections.map(section => (section.id === id ? { ...section, x, y } : section))
    );
  }, []);

  // Handle section drag end - save position
  const handleSectionDragEnd = useCallback(async (id, x, y) => {
    try {
      await updateSectionPosition(id, x, y);
    } catch (error) {
      console.error('Error updating section position:', error);
    }
  }, []);

  // Handle canvas drag start
  const handleCanvasMouseDown = useCallback(e => {
    // Only start dragging if left mouse button is pressed and no section is clicked
    if (e.button !== 0 || e.target !== canvasRef.current) return;

    setIsDraggingCanvas(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  }, []);

  // Handle canvas drag
  const handleCanvasMouseMove = useCallback(
    e => {
      if (!isDraggingCanvas) return;

      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;

      setCanvasOffset(prev => ({
        x: prev.x + dx,
        y: prev.y + dy,
      }));

      setDragStart({ x: e.clientX, y: e.clientY });
    },
    [isDraggingCanvas, dragStart]
  );

  // Handle canvas drag end
  const handleCanvasMouseUp = useCallback(() => {
    setIsDraggingCanvas(false);
  }, []);

  // Register mouse events for canvas dragging
  useEffect(() => {
    if (isDraggingCanvas) {
      window.addEventListener('mousemove', handleCanvasMouseMove);
      window.addEventListener('mouseup', handleCanvasMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleCanvasMouseMove);
      window.removeEventListener('mouseup', handleCanvasMouseUp);
    };
  }, [isDraggingCanvas, handleCanvasMouseMove, handleCanvasMouseUp]);

  // Handle zooming
  const handleZoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(prev + 0.1, 2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel(prev => Math.max(prev - 0.1, 0.5));
  }, []);

  const handleResetView = useCallback(() => {
    setCanvasOffset({ x: 0, y: 0 });
    setZoomLevel(1);
  }, []);

  // Handle SVG export
  const handleExportSVG = useCallback(() => {
    // Create an SVG representation of the canvas
    const svgWidth = width;
    const svgHeight = height;

    let svgContent = `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f7f8fa" />`;

    // Add connection lines
    sections.forEach(section => {
      if (section.connections) {
        section.connections.forEach(targetId => {
          const targetSection = findSection(targetId);
          if (targetSection) {
            // Draw a line from section to targetSection
            const fromX = section.x + 60; // middle of the node
            const fromY = section.y + 25;
            const toX = targetSection.x + 60;
            const toY = targetSection.y + 25;

            // Check if this is a critical connection
            const isRiskConnection = riskConnections.some(
              rc =>
                (rc.source === section.id && rc.target === targetId) ||
                (rc.source === targetId && rc.target === section.id)
            );

            const lineColor = isRiskConnection ? '#dc3545' : '#888';
            const lineWidth = isRiskConnection ? 3 : 2;

            svgContent += `<line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}" stroke="${lineColor}" stroke-width="${lineWidth}" />`;
          }
        });
      }
    });

    // Add nodes
    sections.forEach(section => {
      const nodeColor =
        section.status === 'critical'
          ? '#fde2e2'
          : section.status === 'pending'
            ? '#fff4ce'
            : '#daf5e8';
      const borderColor =
        section.status === 'critical'
          ? '#dc3545'
          : section.status === 'pending'
            ? '#ffc107'
            : '#28a745';

      svgContent += `
      <g>
        <rect x="${section.x}" y="${section.y}" width="120" height="50" rx="4" ry="4" 
            fill="${nodeColor}" stroke="#666" stroke-width="1" />
        <rect x="${section.x}" y="${section.y}" width="4" height="50" fill="${borderColor}" />
        <text x="${section.x + 10}" y="${section.y + 25}" font-family="Arial" font-size="12" fill="#333">${section.title}</text>
        <rect x="${section.x - 5}" y="${section.y - 5}" width="20" height="15" rx="4" ry="4" fill="#d97757" />
        <text x="${section.x}" y="${section.y + 5}" font-family="Arial" font-size="10" fill="white" font-weight="bold">${section.id}</text>
      </g>`;
    });

    svgContent += '</svg>';

    // Create a blob URL and trigger download
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'trialsage-canvas.svg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [sections, riskConnections, findSection, width, height]);

  // Calculate connections between nodes
  const connections = React.useMemo(() => {
    const lines = [];

    sections.forEach(section => {
      if (section.connections) {
        section.connections.forEach(targetId => {
          const targetSection = findSection(targetId);
          if (targetSection) {
            // Calculate line endpoints
            const fromX = section.x + 60; // middle of the node
            const fromY = section.y + 25;
            const toX = targetSection.x + 60;
            const toY = targetSection.y + 25;

            // Calculate line length and angle
            const dx = toX - fromX;
            const dy = toY - fromY;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

            // Check if this is a critical connection
            const isRiskConnection = riskConnections.some(
              rc =>
                (rc.source === section.id && rc.target === targetId) ||
                (rc.source === targetId && rc.target === section.id)
            );

            // Get risk level if exists
            const riskConnection = riskConnections.find(
              rc =>
                (rc.source === section.id && rc.target === targetId) ||
                (rc.source === targetId && rc.target === section.id)
            );

            lines.push({
              id: `${section.id}-${targetId}`,
              fromX,
              fromY,
              length,
              angle,
              isCritical: isRiskConnection,
              riskLevel: riskConnection?.riskLevel,
              midX: fromX + dx / 2,
              midY: fromY + dy / 2,
            });
          }
        });
      }
    });

    return lines;
  }, [sections, riskConnections, findSection]);

  return (
    <div className="canvas-workbench">
      <CanvasSidePanel sections={sections} />

      <div
        className="canvas-container"
        onMouseDown={handleCanvasMouseDown}
        ref={canvasRef}
        style={{ cursor: isDraggingCanvas ? 'grabbing' : 'grab' }}
      >
        <div
          className="canvas-grid"
          style={{
            transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoomLevel})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Connection lines */}
          {connections.map(conn => (
            <div key={conn.id}>
              <div
                className={`connection-line ${conn.isCritical ? 'critical' : ''}`}
                style={{
                  left: `${conn.fromX}px`,
                  top: `${conn.fromY}px`,
                  width: `${conn.length}px`,
                  transform: `rotate(${conn.angle}deg)`,
                }}
              />
              {conn.riskLevel && (
                <div
                  className="connection-label"
                  style={{
                    left: `${conn.midX}px`,
                    top: `${conn.midY}px`,
                  }}
                >
                  {conn.riskLevel}
                </div>
              )}
            </div>
          ))}

          {/* Section nodes */}
          {sections.map(section => (
            <CanvasNode
              key={section.id}
              id={section.id}
              title={section.title}
              status={section.status}
              x={section.x}
              y={section.y}
              isSelected={selectedSection && selectedSection.id === section.id}
              onSelect={handleSelectSection}
              onDrag={handleSectionDrag}
              onDragEnd={handleSectionDragEnd}
            />
          ))}
        </div>

        {/* Detail panel */}
        {selectedSection && (
          <NodeDetailPanel section={selectedSection} onClose={handleCloseDetailPanel} />
        )}

        {/* Canvas actions */}
        <div className="canvas-actions">
          <button onClick={handleZoomIn} title="Zoom in">
            <ZoomIn size={16} />
          </button>
          <button onClick={handleZoomOut} title="Zoom out">
            <ZoomOut size={16} />
          </button>
          <button onClick={handleResetView} title="Reset view">
            <RefreshCw size={16} />
          </button>
          <button onClick={handleExportSVG} title="Export as SVG">
            <Download size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CanvasWorkbenchV2;
