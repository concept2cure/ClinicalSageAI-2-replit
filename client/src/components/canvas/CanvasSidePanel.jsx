import React, { useState } from 'react';
import { PieChart, Workflow, Search, Settings } from 'lucide-react';
import './CanvasSidePanel.css';

/**
 * Side panel for the Canvas Workbench
 * Provides different tabbed views for search, overview, and settings
 */
const CanvasSidePanel = ({ sections, submissionType, targetDate, sponsor, product }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');

  // Calculate submission stats from sections
  const stats = React.useMemo(() => {
    const total = sections.length;
    const completed = sections.filter(s => s.status === 'complete').length;
    const critical = sections.filter(s => s.status === 'critical').length;
    const pending = sections.filter(s => s.status === 'pending').length;

    return {
      total,
      completed,
      critical,
      pending,
      percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [sections]);

  // Filter sections for search
  const filteredSections = React.useMemo(() => {
    if (!searchTerm.trim()) return [];

    return sections.filter(
      section =>
        section.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        section.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [sections, searchTerm]);

  return (
    <div className="canvas-side-panel">
      <div className="panel-tabs">
        <button
          className={`panel-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
          title="Overview"
        >
          <PieChart size={20} />
        </button>
        <button
          className={`panel-tab ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
          title="Search"
        >
          <Search size={20} />
        </button>
        <button
          className={`panel-tab ${activeTab === 'workflow' ? 'active' : ''}`}
          onClick={() => setActiveTab('workflow')}
          title="Workflow"
        >
          <Workflow size={20} />
        </button>
        <button
          className={`panel-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
          title="Settings"
        >
          <Settings size={20} />
        </button>
      </div>

      <div className="panel-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            <h3>Submission Progress</h3>

            <div className="progress-circle">
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="none" stroke="#e6e6e6" strokeWidth="12" />
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  fill="none"
                  stroke="#d97757"
                  strokeWidth="12"
                  strokeDasharray={`${(stats.percentComplete / 100) * 339.292} 339.292`}
                  strokeDashoffset="0"
                  transform="rotate(-90 60 60)"
                />
                <text x="60" y="65" textAnchor="middle" fontSize="24" fontWeight="bold" fill="#333">
                  {stats.percentComplete}%
                </text>
              </svg>
            </div>

            <div className="status-summary">
              <div className="status-item">
                <div className="status-label">Complete</div>
                <div className="status-value complete">{stats.completed}</div>
              </div>
              <div className="status-item">
                <div className="status-label">Pending</div>
                <div className="status-value pending">{stats.pending}</div>
              </div>
              <div className="status-item">
                <div className="status-label">Critical</div>
                <div className="status-value critical">{stats.critical}</div>
              </div>
              <div className="status-item">
                <div className="status-label">Total</div>
                <div className="status-value">{stats.total}</div>
              </div>
            </div>

            <div className="submission-info">
              <h4>Submission Details</h4>
              <div className="info-item">
                <span className="info-label">Submission Type:</span>
                <span className="info-value">{submissionType || 'Not configured'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Target Date:</span>
                <span className="info-value">{targetDate || 'Not set'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Sponsor:</span>
                <span className="info-value">{sponsor || 'Not configured'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Product:</span>
                <span className="info-value">{product || 'Not configured'}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'search' && (
          <div className="search-tab">
            <div className="search-input-container">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search sections..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {searchTerm.trim() ? (
              filteredSections.length ? (
                <div className="search-results">
                  {filteredSections.map(section => (
                    <div key={section.id} className={`search-result-item ${section.status}`}>
                      <div className="result-id">{section.id}</div>
                      <div className="result-title">{section.title}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-results">No matching sections found</div>
              )
            ) : (
              <div className="search-placeholder">Enter a search term to find sections</div>
            )}
          </div>
        )}

        {activeTab === 'workflow' && (
          <div className="workflow-tab">
            <h3>Submission Workflow</h3>
            <p className="workflow-intro">
              Track your progress through the IND submission process.
            </p>

            <div className="workflow-steps">
              <div className="workflow-step completed">
                <div className="step-number">1</div>
                <div className="step-details">
                  <div className="step-title">Preparation</div>
                  <div className="step-description">Initial setup and planning</div>
                </div>
              </div>

              <div className="workflow-step active">
                <div className="step-number">2</div>
                <div className="step-details">
                  <div className="step-title">Document Creation</div>
                  <div className="step-description">Drafting CTD sections</div>
                </div>
              </div>

              <div className="workflow-step">
                <div className="step-number">3</div>
                <div className="step-details">
                  <div className="step-title">Internal Review</div>
                  <div className="step-description">Quality check and validation</div>
                </div>
              </div>

              <div className="workflow-step">
                <div className="step-number">4</div>
                <div className="step-details">
                  <div className="step-title">Final Assembly</div>
                  <div className="step-description">Compile final submission package</div>
                </div>
              </div>

              <div className="workflow-step">
                <div className="step-number">5</div>
                <div className="step-details">
                  <div className="step-title">Submission</div>
                  <div className="step-description">Final submission to regulatory authority</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="settings-tab">
            <h3>Canvas Settings</h3>

            <div className="settings-group">
              <h4>Display Options</h4>
              <div className="setting-item">
                <label className="setting-label" htmlFor="show-connections">
                  Show Connections
                </label>
                <div className="toggle">
                  <input type="checkbox" id="show-connections" defaultChecked />
                  <span className="toggle-slider"></span>
                </div>
              </div>

              <div className="setting-item">
                <label className="setting-label" htmlFor="show-risk-indicators">
                  Show Risk Indicators
                </label>
                <div className="toggle">
                  <input type="checkbox" id="show-risk-indicators" defaultChecked />
                  <span className="toggle-slider"></span>
                </div>
              </div>

              <div className="setting-item">
                <label className="setting-label" htmlFor="auto-layout">
                  Auto-arrange Layout
                </label>
                <div className="toggle">
                  <input type="checkbox" id="auto-layout" />
                  <span className="toggle-slider"></span>
                </div>
              </div>
            </div>

            <div className="settings-group">
              <h4>Export Options</h4>
              <button className="settings-button">Export as SVG</button>
              <button className="settings-button">Export as PNG</button>
              <button className="settings-button">Save Layout</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CanvasSidePanel;
