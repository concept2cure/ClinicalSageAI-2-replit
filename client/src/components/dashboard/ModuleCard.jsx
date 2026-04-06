import React from 'react';
import { Link } from 'wouter';
import './ModuleCard.css';

/**
 * title: string
 * to: route string
 * progress: 0–100
 * risk: 'low' | 'med' | 'high'
 */
export default function ModuleCard({ title, to, progress = 0, risk = 'low' }) {
 const riskColor = {
 low: '#28a745',
 med: '#ffc107',
 high: '#dc3545',
 }[risk];

 return (
 <Link href={to} className="module-card">
 <h3 className="mc-title">{title}</h3>
 <div className="mc-progress">
 <div className="mc-bar" style={{ width: `${progress}%` }} />
 </div>
 <div className="mc-footer">
 <span className="mc-progress-text">{progress}% Complete</span>
 <span className="mc-risk" style={{ background: riskColor }}>
 {risk.toUpperCase()}
 </span>
 </div>
 </Link>
 );
}
