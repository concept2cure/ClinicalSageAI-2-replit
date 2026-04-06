import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { fetchSectionGuidance } from '../../api/coauthor';
import './NodeDetailPanel.css';

/**
 * Detail panel that appears when a section is selected in the Canvas Workbench
 * Provides regulatory guidance, risk assessment, and action buttons
 */
const NodeDetailPanel = ({ section, onClose }) => {
 const [activeTab, setActiveTab] = useState('guidance');
 const [guidance, setGuidance] = useState(null);
 const [loading, setLoading] = useState(false);

 // Fetch guidance when a section is selected
 useEffect(() => {
 if (!section || !section.id) return;

 setLoading(true);
 fetchSectionGuidance(section.id)
 .then(data => {
 setGuidance(data);
 setLoading(false);
 })
 .catch(error => {
 console.error('Error fetching guidance:', error);
 setLoading(false);
 });
 }, [section?.id]); // Only refetch when the section ID changes

 // If no section is selected, don't render the panel
 if (!section) {
 return null;
 }

 return (
 <div className="node-detail-panel">
 <div className="panel-header">
 <h2>{section.title || 'Section Details'}</h2>
 <button className="close-button" onClick={onClose} aria-label="Close panel">
 <X size={18} />
 </button>
 </div>

 <div className="panel-tabs">
 <button
 className={`tab ${activeTab === 'guidance' ? 'active' : ''}`}
 onClick={() => setActiveTab('guidance')}
 >
 Guidance
 </button>
 <button
 className={`tab ${activeTab === 'risk' ? 'active' : ''}`}
 onClick={() => setActiveTab('risk')}
 >
 Risk Assessment
 </button>
 <button
 className={`tab ${activeTab === 'actions' ? 'active' : ''}`}
 onClick={() => setActiveTab('actions')}
 >
 Actions
 </button>
 </div>

 <div className="panel-content">
 {loading ? (
 <div className="loading">Loading...</div>
 ) : activeTab === 'guidance' ? (
 <div className="guidance-content">
 <h3>Regulatory Guidance</h3>
 <p>{guidance?.text || 'No guidance available for this section.'}</p>

 {guidance?.examples && guidance.examples.length > 0 && (
 <div className="examples">
 <h4>Examples & References</h4>
 <ul>
 {guidance.examples.map((example, index) => (
 <li key={index}>{example}</li>
 ))}
 </ul>
 </div>
 )}
 </div>
 ) : activeTab === 'risk' ? (
 <div className="risk-content">
 <div className="risk-level">
 <span>Risk Level:</span>
 <span
 className={`risk-badge ${section.status === 'critical' ? 'high' : section.status === 'pending' ? 'medium' : 'low'}`}
 >
 {section.status === 'critical'
 ? 'High'
 : section.status === 'pending'
 ? 'Medium'
 : 'Low'}
 </span>
 </div>

 <div className="risk-impact">
 <span>Potential Delay:</span>
 <span className="delay-days">
 {section.status === 'critical'
 ? '30-60 days'
 : section.status === 'pending'
 ? '14-30 days'
 : '0-7 days'}
 </span>
 </div>

 <div className="risk-factors">
 <h4>Risk Factors</h4>
 <ul>
 <li>
 Regulatory complexity:{' '}
 {section.status === 'critical'
 ? 'High'
 : section.status === 'pending'
 ? 'Medium'
 : 'Low'}
 </li>
 <li>
 Historical rejection rate:{' '}
 {section.status === 'critical'
 ? '45%'
 : section.status === 'pending'
 ? '22%'
 : '8%'}
 </li>
 <li>Quality monitoring required: {section.status === 'critical' ? 'Yes' : 'No'}</li>
 </ul>
 </div>
 </div>
 ) : (
 <div className="actions-content">
 <button className="action-button">Generate Draft Content</button>
 <button className="action-button">Run Quality Check</button>
 <button className="action-button">Check Regulatory Compliance</button>
 <button className="action-button">View Submission History</button>
 <button className="action-button">Tag for Expert Review</button>
 </div>
 )}
 </div>
 </div>
 );
};

export default NodeDetailPanel;
