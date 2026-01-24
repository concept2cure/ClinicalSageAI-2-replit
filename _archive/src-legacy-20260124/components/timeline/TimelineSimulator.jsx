import React, { useState, useEffect } from 'react';
import './TimelineSimulator.css';

export default function TimelineSimulator() {
  const [info, setInfo] = useState(null);
  const [delay, setDelay] = useState(0);
  const [preset, setPreset] = useState('standard');
  const [playbooksValid, setPlaybooksValid] = useState(null);

  // store original missingDays for preset recalcs
  const [originalMissing, setOriginalMissing] = useState(0);

  const playbooks = [
    { id: 'fast-ind', label: 'Fast IND Playbook', factor: 0.8 },
    { id: 'standard', label: 'Standard', factor: 1.0 },
    { id: 'full-nda', label: 'Full NDA Playbook', factor: 1.2 },
    { id: 'ema-impd', label: 'EMA IMPD Playbook', factor: 1.1 },
  ];

  // Fetch timeline info
  useEffect(() => {
    fetch('/api/timeline/info')
      .then(res => res.json())
      .then(data => {
        setInfo(data);
        setOriginalMissing(data.missingDays);
        setDelay(0);
      })
      .catch(console.error);

    // Fetch playbook validation status
    fetch('/api/timeline/playbooks')
      .then(res => res.json())
      .then(data => {
        setPlaybooksValid(data);
      })
      .catch(console.error);
  }, []);

  if (!info) {
    return <div className="ts-loading">Loading timeline data…</div>;
  }

  // apply playbook factor
  const factor = playbooks.find(p => p.id === preset)?.factor || 1;
  const missingDays = Math.round(originalMissing * factor);
  const reviewDays = info.reviewDays;
  const today = new Date();
  const baselineSubmission = new Date(today.getTime() + missingDays * 24 * 60 * 60 * 1000);
  const predictedSubmission = new Date(baselineSubmission.getTime() + delay * 24 * 60 * 60 * 1000);
  const reviewCompletion = new Date(
    predictedSubmission.getTime() + reviewDays * 24 * 60 * 60 * 1000
  );

  const fmt = d => d.toLocaleDateString();

  // Check if the selected playbook is valid
  const isPlaybookValid = id => {
    if (!playbooksValid) return true; // Show all as valid if data not loaded
    const playbook = playbooksValid.find(p => p.id === id);
    return playbook ? playbook.isValid : true;
  };

  return (
    <div className="ts-container">
      <h2 className="ts-title">Timeline Simulator</h2>

      {/* Playbook Presets */}
      <div className="ts-playbooks">
        {playbooks.map(pb => {
          const isValid = isPlaybookValid(pb.id);

          return (
            <button
              key={pb.id}
              className={`ts-preset-btn ${preset === pb.id ? 'active' : ''} ${!isValid ? 'invalid' : ''}`}
              onClick={() => setPreset(pb.id)}
              title={!isValid ? 'Some requirements for this playbook are not met' : ''}
            >
              {pb.label}
              {!isValid && <span className="ts-invalid-icon">⚠️</span>}
            </button>
          );
        })}
      </div>

      {/* Validation warnings if applicable */}
      {playbooksValid && preset !== 'standard' && !isPlaybookValid(preset) && (
        <div className="ts-validation-warning">
          <h3>Warning: Requirements not fully met</h3>
          <ul>
            {playbooksValid
              .find(p => p.id === preset)
              ?.validations.filter(v => !v.isValid)
              .map((v, idx) => (
                <li key={idx}>{v.message}</li>
              ))}
          </ul>
        </div>
      )}

      <div className="ts-stats">
        <div>
          <span className="ts-label">Current Readiness:</span>
          <span className="ts-value">{info.readiness}%</span>
        </div>
        <div>
          <span className="ts-label">Work Remaining:</span>
          <span className="ts-value">{missingDays} days</span>
        </div>
        <div>
          <span className="ts-label">Review Duration:</span>
          <span className="ts-value">{reviewDays} days</span>
        </div>
      </div>

      <div className="ts-slider-group">
        <label htmlFor="delayRange" className="ts-slider-label">
          Delay submission by <strong>{delay}</strong> day{delay !== 1 && 's'}
        </label>
        <input
          id="delayRange"
          type="range"
          min="0"
          max="90"
          value={delay}
          onChange={e => setDelay(Number(e.target.value))}
          className="ts-slider"
        />
      </div>

      <ul className="ts-dates">
        <li>
          <span>Earliest possible submission:</span>
          <strong>{fmt(baselineSubmission)}</strong>
        </li>
        <li>
          <span>Predicted submission date:</span>
          <strong>{fmt(predictedSubmission)}</strong>
        </li>
        <li>
          <span>Estimated review completion:</span>
          <strong>{fmt(reviewCompletion)}</strong>
        </li>
      </ul>
    </div>
  );
}
