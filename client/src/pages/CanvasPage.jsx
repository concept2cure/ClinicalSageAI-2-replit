import React from 'react';
import { Link } from 'wouter';
import { Calendar, FileText, BarChart } from 'lucide-react'
import CanvasWorkbenchV2 from '../components/canvas/CanvasWorkbenchV2';
import './CanvasPage.css';

/**
 * CanvasPage component - Visual CTD section workbench
 * Allows users to visually manage and understand CTD sections
 */
const CanvasPage = () => {
  return (
    <div className="canvas-page">
      <div className="canvas-header">
        <h1>Submission Canvas</h1>
        <div className="canvas-tabs">
          <Link href="/canvas" className="canvas-tab active">
            <FileText size={16} />
            <span>Section Canvas</span>
          </Link>
          <Link href="/timeline" className="canvas-tab">
            <Calendar size={16} />
            <span>Timeline</span>
          </Link>
          <Link href="/analysis" className="canvas-tab">
            <BarChart size={16} />
            <span>Analysis</span>
          </Link>
        </div>
        <div className="canvas-meta">
          <span className="submission-type">IND Initial</span>
          <span className="submission-id">ID: TSG-IND-2025-0042</span>
        </div>
      </div>

      <div className="canvas-main">
        <CanvasWorkbenchV2 />
      </div>
    </div>
  );
};

export default CanvasPage;
